// ── Backup su R2: dump di piattaforma + archivio per studio ────
//
// Due livelli, perché AR è multi-tenant su un solo database D1:
//
// 1. DUMP DI PIATTAFORMA (per Contify): fotografia SQL COMPLETA del
//    database, ripristinabile con
//      wrangler d1 execute contify-antiriciclaggio --remote --file=backup.sql
//    Chiavi:  daily/contify-antiriciclaggio-AAAA-MM-GG.sql.gz
//             monthly/contify-antiriciclaggio-AAAA-MM.sql.gz
//    Retention 30 giornalieri + 12 mensili; il mensile lo scrive il
//    PRIMO backup riuscito del mese (se il cron del giorno 1 fallisse,
//    il mese avrebbe comunque il suo backup). È il disaster recovery
//    di Contify e NON è esposto agli studi: contiene i dati di tutti.
//
// 2. ARCHIVIO DELLO STUDIO (self-service): fotografia JSON dei soli
//    dati di dominio di UN tenant. È l'unità che il titolare può
//    elencare, scaricare e ripristinare da solo: ripristinare un dump
//    SQL di piattaforma riporterebbe indietro anche gli altri studi.
//    Chiavi:  tenant/<id>/daily/archivio-AAAA-MM-GG.json.gz
//             tenant/<id>/monthly/archivio-AAAA-MM.json.gz
//             tenant/<id>/pre-ripristino/… e tenant/<id>/pre-eliminazione/…
//    Fuori dall'archivio: utenti, sessioni, audit_log (append-only per
//    l'art. 32: un ripristino non deve poter riscrivere il registro),
//    password_reset_token e la riga tenants (denominazione e piano sono
//    un fatto del contratto, non dell'archivio).
//
// La perdita dei dati qui non è solo un disservizio: l'art. 32 co. 2
// impone modalità di conservazione che prevengano qualsiasi perdita.
// Il bucket ha jurisdiction EU (dati AML, possibili dati art. 10 GDPR).

import type { Env } from './tipi';
import { scriviAudit } from './audit';

export const DAILY_PREFIX = 'daily/';
export const MONTHLY_PREFIX = 'monthly/';
export const KEEP_DAILY = 30;
export const KEEP_MONTHLY = 12;
export const KEEP_PRE = 10; // pre-ripristino e pre-eliminazione, per prefisso
const BASENAME = 'contify-antiriciclaggio';
// Statement multi-riga contenuti: il restore con wrangler deve stare
// largo dentro i limiti D1 sulla singola query.
const ROWS_PER_INSERT = 25;
const ROWS_PER_SELECT = 200;

// ── Prefissi per-tenant ────────────────────────────────────────

export type TipoBackupTenant = 'daily' | 'monthly' | 'pre-ripristino' | 'pre-eliminazione';

export function prefissoTenant(tenantId: string, tipo: TipoBackupTenant): string {
  return `tenant/${tenantId}/${tipo}/`;
}

/** Una chiave è dello studio (e di un tipo noto) o non si tocca. */
export function chiaveDelTenant(tenantId: string, key: string): boolean {
  if (key.includes('..') || !key.endsWith('.json.gz')) return false;
  return (['daily', 'monthly', 'pre-ripristino', 'pre-eliminazione'] as const)
    .some((t) => key.startsWith(prefissoTenant(tenantId, t)));
}

// ── Tabelle dell'archivio di uno studio ────────────────────────
// Ordine PADRI → FIGLI (per l'inserimento in ripristino); l'eliminazione
// usa l'ordine inverso. Le dipendenze che contano:
//   fascicoli → clienti;  titolari_effettivi → clienti;
//   valutazioni_rischio/documenti/operazioni/segnalazioni_sospette/
//   astensioni → fascicoli;  astensioni.sos_id → segnalazioni_sospette;
//   formazione.attestato_documento_id → documenti.
// ⚠ Ogni nuova tabella di dominio va aggiunta QUI, nell'ordine giusto.
export const TABELLE_ARCHIVIO = [
  'autovalutazioni',
  'clienti',
  'titolari_effettivi',
  'fascicoli',
  // AR-M8: le richieste di verifica a distanza referenziano fascicoli e clienti.
  'richieste_verifica',
  'documenti',
  // AR-M17: compagine e cariche referenziano clienti e documenti (fonte);
  // le proposte referenziano clienti e utenti.
  'partecipazioni',
  'cariche',
  'proposte',
  'valutazioni_rischio',
  // AR-M19: i controlli costanti eseguiti referenziano fascicoli e utenti.
  'controlli_costanti',
  'operazioni',
  'segnalazioni_sospette',
  'astensioni',
  'formazione',
  // AR-M7: gli esiti dello screening referenziano clienti e titolari
  // effettivi → dopo di loro; le corse sono un diario indipendente.
  'screening_esiti',
  'screening_corse',
] as const;

/** Ordine di eliminazione: figli prima dei padri. */
export const TABELLE_ARCHIVIO_ELIMINAZIONE = [...TABELLE_ARCHIVIO].reverse();

// ── Quoting SQL (dump di piattaforma) ──────────────────────────

function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
    const bytes = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    let hex = '';
    for (const b of bytes) hex += b.toString(16).padStart(2, '0');
    return `X'${hex}'`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

const qIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

// ── Dump SQL di piattaforma ────────────────────────────────────

export type DumpResult = { sql: string; tabelle: number; righe: number };

/**
 * Fuori dal dump: le sessioni e i token di reset sono transitori (dopo
 * un ripristino si rifà login, che è anche la cosa giusta), e la loro
 * assenza evita di custodire nel backup materiale di autenticazione.
 */
const TABELLE_NON_DUMP = ['sessioni', 'password_reset_token', 'lookup_piva_cache', 'sessioni_console'];
const NON_DUMP_SQL = TABELLE_NON_DUMP.map((t) => `'${t}'`).join(', ');

export async function buildDump(db: D1Database): Promise<DumpResult> {
  const tables = (
    await db
      .prepare(
        `SELECT name, sql FROM sqlite_master
         WHERE type = 'table' AND sql IS NOT NULL
           AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
           AND name NOT IN (${NON_DUMP_SQL})
         ORDER BY rowid`,
      )
      .all<{ name: string; sql: string }>()
  ).results;

  const out: string[] = [];
  let righe = 0;

  out.push(`-- Contify AR · AntiRiciclaggio — backup D1 '${BASENAME}' del ${new Date().toISOString()}`);
  out.push(`-- Ripristino: wrangler d1 execute ${BASENAME} --remote --file=<questo file scompattato>`);
  out.push('PRAGMA defer_foreign_keys = TRUE;');
  out.push('');

  // DROP in ordine inverso di creazione (prima i figli, poi i padri).
  for (const t of [...tables].reverse()) out.push(`DROP TABLE IF EXISTS ${qIdent(t.name)};`);
  out.push('');

  for (const t of tables) {
    out.push(`${t.sql.trim().replace(/;?$/, '')};`);

    const cols = (await db.prepare(`PRAGMA table_info(${qIdent(t.name)})`).all<{ name: string }>()).results.map(
      (c) => c.name,
    );
    const colList = cols.map(qIdent).join(', ');

    let offset = 0;
    for (;;) {
      const chunk = (
        await db.prepare(`SELECT * FROM ${qIdent(t.name)} LIMIT ${ROWS_PER_SELECT} OFFSET ${offset}`).all<
          Record<string, unknown>
        >()
      ).results;
      for (let i = 0; i < chunk.length; i += ROWS_PER_INSERT) {
        const values = chunk
          .slice(i, i + ROWS_PER_INSERT)
          .map((row) => `(${cols.map((c) => sqlValue(row[c])).join(', ')})`)
          .join(',\n  ');
        out.push(`INSERT INTO ${qIdent(t.name)} (${colList}) VALUES\n  ${values};`);
      }
      righe += chunk.length;
      if (chunk.length < ROWS_PER_SELECT) break;
      offset += ROWS_PER_SELECT;
    }
    out.push('');
  }

  // Indici, trigger e view dopo i dati (restore più rapido, stesso esito).
  const extra = (
    await db
      .prepare(
        `SELECT sql FROM sqlite_master
         WHERE type IN ('index', 'trigger', 'view') AND sql IS NOT NULL
           AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
           AND tbl_name NOT IN (${NON_DUMP_SQL})
         ORDER BY rowid`,
      )
      .all<{ sql: string }>()
  ).results;
  for (const e of extra) out.push(`${e.sql.trim().replace(/;?$/, '')};`);

  return { sql: out.join('\n'), tabelle: tables.length, righe };
}

// ── Fotografia JSON dell'archivio di uno studio ────────────────

export type SnapshotTenant = {
  app: 'contify-antiriciclaggio';
  versione: 1;
  tenantId: string;
  generatoIl: string;
  tabelle: Record<string, { colonne: string[]; righe: Record<string, unknown>[] }>;
};

export async function fotografaArchivio(db: D1Database, tenantId: string): Promise<SnapshotTenant> {
  const tabelle: SnapshotTenant['tabelle'] = {};
  for (const t of TABELLE_ARCHIVIO) {
    const colonne = (await db.prepare(`PRAGMA table_info(${qIdent(t)})`).all<{ name: string }>()).results.map(
      (c) => c.name,
    );
    const righe: Record<string, unknown>[] = [];
    let offset = 0;
    for (;;) {
      const chunk = (
        await db
          .prepare(`SELECT * FROM ${qIdent(t)} WHERE tenant_id = ? LIMIT ${ROWS_PER_SELECT} OFFSET ${offset}`)
          .bind(tenantId)
          .all<Record<string, unknown>>()
      ).results;
      righe.push(...chunk);
      if (chunk.length < ROWS_PER_SELECT) break;
      offset += ROWS_PER_SELECT;
    }
    tabelle[t] = { colonne, righe };
  }
  return { app: 'contify-antiriciclaggio', versione: 1, tenantId, generatoIl: new Date().toISOString(), tabelle };
}

export function conteggioRighe(snap: SnapshotTenant): number {
  return Object.values(snap.tabelle).reduce((n, t) => n + t.righe.length, 0);
}

// ── Compressione (native dei Workers) ──────────────────────────

export async function gzipText(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function gunzipToText(buf: ArrayBuffer): Promise<string> {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

// ── Retention ──────────────────────────────────────────────────

async function listAllKeys(bucket: R2Bucket, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page: R2Objects = await bucket.list({ prefix, cursor });
    for (const o of page.objects) keys.push(o.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

/** Le date sono nelle chiavi (AAAA-MM-GG / AAAA-MM): l'ordine lessicale è cronologico. */
export function chiaviOltreRetention(keys: string[], keep: number): string[] {
  return [...keys].sort().slice(0, Math.max(0, keys.length - keep));
}

async function applicaRetention(bucket: R2Bucket, coppie: ReadonlyArray<readonly [string, number]>): Promise<string[]> {
  const eliminate: string[] = [];
  for (const [prefix, keep] of coppie) {
    const daEliminare = chiaviOltreRetention(await listAllKeys(bucket, prefix), keep);
    if (daEliminare.length) {
      await bucket.delete(daEliminare);
      eliminate.push(...daEliminare);
    }
  }
  return eliminate;
}

// ── Backup di piattaforma (dump SQL) ───────────────────────────

export type BackupPiattaformaResult = {
  key: string;
  bytes: number;
  tabelle: number;
  righe: number;
  mensileScritto: string | null;
  eliminatiPerRetention: string[];
};

export async function runBackupPiattaforma(env: Env): Promise<BackupPiattaformaResult> {
  const ymd = new Date().toISOString().slice(0, 10);
  const dump = await buildDump(env.DB);
  const gz = await gzipText(dump.sql);

  const meta = {
    httpMetadata: { contentType: 'application/gzip' },
    customMetadata: { tabelle: String(dump.tabelle), righe: String(dump.righe) },
  };

  const dailyKey = `${DAILY_PREFIX}${BASENAME}-${ymd}.sql.gz`;
  await env.BACKUPS.put(dailyKey, gz, meta);

  // Mensile: primo backup riuscito del mese.
  const monthlyKey = `${MONTHLY_PREFIX}${BASENAME}-${ymd.slice(0, 7)}.sql.gz`;
  let mensileScritto: string | null = null;
  if (!(await env.BACKUPS.head(monthlyKey))) {
    await env.BACKUPS.put(monthlyKey, gz, meta);
    mensileScritto = monthlyKey;
  }

  // La retention su daily/ smaltisce anche i vecchi dump JSON pre-M4
  // (stesso prefisso): spariranno man mano che entrano i nuovi.
  const eliminatiPerRetention = await applicaRetention(env.BACKUPS, [
    [DAILY_PREFIX, KEEP_DAILY],
    [MONTHLY_PREFIX, KEEP_MONTHLY],
  ]);

  return { key: dailyKey, bytes: gz.byteLength, tabelle: dump.tabelle, righe: dump.righe, mensileScritto, eliminatiPerRetention };
}

// ── Backup dell'archivio di uno studio ─────────────────────────

export type BackupTenantResult = {
  key: string;
  bytes: number;
  righe: number;
  mensileScritto: string | null;
  eliminatiPerRetention: string[];
};

export async function runBackupTenant(
  env: Env,
  tenantId: string,
  trigger: 'cron' | 'manuale' | 'pre-ripristino' | 'pre-eliminazione',
  utenteId?: string | null,
): Promise<BackupTenantResult> {
  const snap = await fotografaArchivio(env.DB, tenantId);
  const gz = await gzipText(JSON.stringify(snap));
  const righe = conteggioRighe(snap);

  const meta = {
    httpMetadata: { contentType: 'application/gzip' },
    customMetadata: { righe: String(righe), trigger },
  };

  const ymd = snap.generatoIl.slice(0, 10);
  let key: string;
  let mensileScritto: string | null = null;
  let eliminatiPerRetention: string[] = [];

  if (trigger === 'pre-ripristino' || trigger === 'pre-eliminazione') {
    // Chiave con data e ora: più operazioni nello stesso giorno restano
    // tutte recuperabili. Retention propria, separata dai giornalieri.
    const stamp = snap.generatoIl.slice(0, 19).replace(/[:T]/g, '-');
    key = `${prefissoTenant(tenantId, trigger)}archivio-${stamp}.json.gz`;
    await env.BACKUPS.put(key, gz, meta);
    eliminatiPerRetention = await applicaRetention(env.BACKUPS, [[prefissoTenant(tenantId, trigger), KEEP_PRE]]);
  } else {
    key = `${prefissoTenant(tenantId, 'daily')}archivio-${ymd}.json.gz`;
    await env.BACKUPS.put(key, gz, meta);

    const monthlyKey = `${prefissoTenant(tenantId, 'monthly')}archivio-${ymd.slice(0, 7)}.json.gz`;
    if (!(await env.BACKUPS.head(monthlyKey))) {
      await env.BACKUPS.put(monthlyKey, gz, meta);
      mensileScritto = monthlyKey;
    }
    eliminatiPerRetention = await applicaRetention(env.BACKUPS, [
      [prefissoTenant(tenantId, 'daily'), KEEP_DAILY],
      [prefissoTenant(tenantId, 'monthly'), KEEP_MONTHLY],
    ]);
  }

  // Audit best effort: un backup riuscito non deve fallire per l'audit.
  try {
    await scriviAudit(env.DB, {
      tenantId,
      utenteId: utenteId ?? null,
      azione: 'BACKUP_ARCHIVIO',
      entita: 'sistema',
      entitaId: key,
      dettaglio: { trigger, bytes: gz.byteLength, righe, mensileScritto },
    });
  } catch (e) {
    console.error('audit backup non registrato:', e);
  }

  return { key, bytes: gz.byteLength, righe, mensileScritto, eliminatiPerRetention };
}

// ── Entry point del cron notturno ──────────────────────────────

export async function backupSchedulato(env: Env): Promise<void> {
  // 1. Dump di piattaforma: se fallisce, il cron risulta failed in
  //    dashboard (visibile) e non si prosegue.
  const p = await runBackupPiattaforma(env);
  console.log(`backup piattaforma ok: ${p.key} (${p.bytes} byte, ${p.righe} righe, ${p.tabelle} tabelle)`);

  // 2. Archivio di ogni studio: il fallimento di uno NON blocca gli
  //    altri, ma viene loggato e fa fallire il cron alla fine.
  const tenants = (await env.DB.prepare('SELECT id FROM tenants').all<{ id: string }>()).results ?? [];
  const falliti: string[] = [];
  for (const t of tenants) {
    try {
      const r = await runBackupTenant(env, t.id, 'cron');
      console.log(`backup archivio ${t.id} ok: ${r.key} (${r.bytes} byte, ${r.righe} righe)`);
    } catch (e) {
      console.error(`BACKUP ARCHIVIO ${t.id} FALLITO:`, e);
      falliti.push(t.id);
    }
  }
  if (falliti.length) throw new Error(`Backup archivio fallito per: ${falliti.join(', ')}`);
}
