// ── Ripristino ed eliminazione dell'archivio di uno studio ─────
//
// Design (stesso impianto di Assist M19/M14, adattato al multi-tenant):
//   • Si ripristina SOLO da un backup già custodito su R2, scelto per
//     chiave e appartenente allo studio: niente upload di file → niente
//     dump manipolati, e nessuno può indicare la chiave di un altro studio.
//   • Prima di toccare qualsiasi riga viene scritto un BACKUP
//     PRE-RIPRISTINO (o PRE-ELIMINAZIONE) su R2: se fallisce, non si
//     tocca nulla; anche un'operazione sbagliata resta reversibile.
//   • Il registro degli accessi NON si tocca mai: è append-only per
//     l'art. 32 co. 2 (trigger a livello di database) e il ripristino
//     vi AGGIUNGE una voce, non lo riscrive. Stessa cosa per utenti,
//     sessioni e la riga tenants: la fotografia riguarda l'archivio,
//     non chi può accedervi né il contratto con Contify.
//   • trg_documenti_no_delete protegge la conservazione decennale
//     (art. 31): durante ripristino ed eliminazione viene alzato il
//     flag di manutenzione (migrazione 0003) che il trigger rispetta,
//     e la fotografia pre-operazione su R2 mantiene comunque i
//     documenti recuperabili. I file su R2 (bucket DOCS) non vengono
//     MAI cancellati: le righe ripristinate li ritrovano per r2_key.
//   • Le colonne si intersecano con lo schema CORRENTE: un backup
//     precedente a una migrazione si ripristina lo stesso (le colonne
//     nuove restano al loro default; quelle sparite si ignorano).

import type { Env } from './tipi';
import { scriviAudit } from './audit';
import {
  TABELLE_ARCHIVIO,
  TABELLE_ARCHIVIO_ELIMINAZIONE,
  chiaveDelTenant,
  gunzipToText,
  runBackupTenant,
  type SnapshotTenant,
} from './backup';

export class RipristinoError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const qIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

// ── Flag di manutenzione (migrazione 0003) ─────────────────────
// Alzato solo per la durata dell'operazione; il finally lo abbassa
// anche in caso di errore. In più, all'inizio si abbassa un eventuale
// flag rimasto alzato da un'operazione interrotta.

async function conFlagManutenzione<T>(db: D1Database, tenantId: string, fn: () => Promise<T>): Promise<T> {
  await db
    .prepare(
      `INSERT INTO manutenzione_flag (tenant_id, attiva, impostata_il) VALUES (?1, 1, datetime('now'))
       ON CONFLICT(tenant_id) DO UPDATE SET attiva = 1, impostata_il = datetime('now')`,
    )
    .bind(tenantId)
    .run();
  try {
    return await fn();
  } finally {
    try {
      await db.prepare('UPDATE manutenzione_flag SET attiva = 0 WHERE tenant_id = ?1').bind(tenantId).run();
    } catch (e) {
      console.error('flag manutenzione non abbassato:', e);
    }
  }
}

// ── Operazioni comuni ──────────────────────────────────────────

async function colonneTabella(db: D1Database, tabella: string): Promise<string[]> {
  return (await db.prepare(`PRAGMA table_info(${qIdent(tabella)})`).all<{ name: string }>()).results.map((c) => c.name);
}

async function contaRighe(db: D1Database, tenantId: string, tabelle: readonly string[]): Promise<Record<string, number>> {
  const conteggi: Record<string, number> = {};
  for (const t of tabelle) {
    const r = await db.prepare(`SELECT COUNT(*) AS n FROM ${qIdent(t)} WHERE tenant_id = ?1`).bind(tenantId).first<{ n: number }>();
    conteggi[t] = r?.n ?? 0;
  }
  return conteggi;
}

/** Svuota le tabelle dell'archivio del tenant, figli prima dei padri, in un unico batch (transazione D1). */
async function svuotaArchivio(db: D1Database, tenantId: string): Promise<void> {
  await db.batch(
    TABELLE_ARCHIVIO_ELIMINAZIONE.map((t) => db.prepare(`DELETE FROM ${qIdent(t)} WHERE tenant_id = ?1`).bind(tenantId)),
  );
}

// ── Ripristino ─────────────────────────────────────────────────

export type RipristinoResult = {
  key: string;
  generatoIl: string;
  righeRipristinate: number;
  backupPreRipristino: string;
  colonneIgnorate: string[];
};

export async function eseguiRipristino(env: Env, tenantId: string, utenteId: string, key: string): Promise<RipristinoResult> {
  if (!chiaveDelTenant(tenantId, key)) throw new RipristinoError('Chiave di backup non valida', 400);

  // 1. Leggi e valida il backup scelto PRIMA di qualsiasi scrittura.
  const obj = await env.BACKUPS.get(key);
  if (!obj) throw new RipristinoError('Backup non trovato', 404);
  let snap: SnapshotTenant;
  try {
    snap = JSON.parse(await gunzipToText(await obj.arrayBuffer())) as SnapshotTenant;
  } catch {
    throw new RipristinoError('Il file non è un backup leggibile', 400);
  }
  if (snap.app !== 'contify-antiriciclaggio' || snap.versione !== 1 || !snap.tabelle) {
    throw new RipristinoError('Il file non sembra un backup valido di Contify AR', 400);
  }
  if (snap.tenantId !== tenantId) {
    // Non dovrebbe accadere (la chiave è già del tenant), ma un backup
    // di un altro studio non deve MAI entrare in questo archivio.
    throw new RipristinoError('Il backup non appartiene a questo studio', 403);
  }

  // 2. Backup pre-ripristino, obbligatorio: se fallisce non si tocca nulla.
  const pre = await runBackupTenant(env, tenantId, 'pre-ripristino', utenteId);

  // 3. Svuota e ricarica, con il flag di manutenzione alzato (i documenti
  //    in conservazione decennale sono protetti da trigger).
  let righeRipristinate = 0;
  const colonneIgnorate: string[] = [];

  await conFlagManutenzione(env.DB, tenantId, async () => {
    await svuotaArchivio(env.DB, tenantId);

    // Inserimento padri → figli. Colonne: intersezione tra la fotografia
    // e lo schema corrente; tutto ciò che il backup ha in più si ignora
    // (e si riporta), ciò che ha in meno resta al default della colonna.
    for (const t of TABELLE_ARCHIVIO) {
      const dati = snap.tabelle[t];
      if (!dati || !dati.righe.length) continue;
      const correnti = await colonneTabella(env.DB, t);
      const colonne = (dati.colonne ?? Object.keys(dati.righe[0] ?? {})).filter((c) => correnti.includes(c));
      for (const c of dati.colonne ?? []) {
        if (!correnti.includes(c)) colonneIgnorate.push(`${t}.${c}`);
      }
      if (!colonne.includes('tenant_id')) throw new RipristinoError(`Backup malformato: ${t} senza tenant_id`, 400);

      const segnaposto = colonne.map(() => '?').join(', ');
      const stmt = env.DB.prepare(`INSERT INTO ${qIdent(t)} (${colonne.map(qIdent).join(', ')}) VALUES (${segnaposto})`);

      // Difesa in profondità: nell'archivio entrano solo righe del tenant.
      const righe = dati.righe.filter((r) => r.tenant_id === tenantId);
      const LOTTO = 40;
      for (let i = 0; i < righe.length; i += LOTTO) {
        await env.DB.batch(righe.slice(i, i + LOTTO).map((r) => stmt.bind(...colonne.map((c) => r[c] ?? null))));
      }
      righeRipristinate += righe.length;
    }
  });

  // 4. Il registro racconta il ripristino (non lo subisce): la catena
  //    prosegue, con la voce che dice cosa è successo.
  await scriviAudit(env.DB, {
    tenantId,
    utenteId,
    azione: 'RIPRISTINO_ARCHIVIO',
    entita: 'sistema',
    entitaId: key,
    dettaglio: { backupDel: snap.generatoIl, righeRipristinate, backupPreRipristino: pre.key, colonneIgnorate },
  });

  return { key, generatoIl: snap.generatoIl, righeRipristinate, backupPreRipristino: pre.key, colonneIgnorate };
}

// ── Eliminazione dell'archivio ─────────────────────────────────

export type EliminazioneResult = {
  eliminati: Record<string, number>;
  totale: number;
  backupPreEliminazione: string;
};

export async function eseguiEliminaArchivio(env: Env, tenantId: string, utenteId: string): Promise<EliminazioneResult> {
  // 1. Backup di sicurezza — obbligatorio, non best-effort: se fallisce
  //    l'archivio resta intatto. È anche ciò che tiene in piedi la
  //    conservazione ex art. 31: la fotografia resta su R2 (bucket EU)
  //    e i file dei documenti nel bucket DOCS non vengono toccati.
  const pre = await runBackupTenant(env, tenantId, 'pre-eliminazione', utenteId);

  // 2. Conteggi per il report, poi svuotamento con flag di manutenzione.
  const eliminati = await contaRighe(env.DB, tenantId, TABELLE_ARCHIVIO_ELIMINAZIONE);
  await conFlagManutenzione(env.DB, tenantId, () => svuotaArchivio(env.DB, tenantId));

  const totale = Object.values(eliminati).reduce((a, b) => a + b, 0);
  await scriviAudit(env.DB, {
    tenantId,
    utenteId,
    azione: 'ELIMINA_ARCHIVIO',
    entita: 'sistema',
    entitaId: pre.key,
    dettaglio: { eliminati, totale, backupPreEliminazione: pre.key },
  });

  return { eliminati, totale, backupPreEliminazione: pre.key };
}
