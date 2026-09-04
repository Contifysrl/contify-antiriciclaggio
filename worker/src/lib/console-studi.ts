/**
 * CONSOLE — le due lacune di AR-M21 (CON-01, CON-02)
 *
 *  1. Cancellazione di uno studio creato per errore: SOLO se vuoto (zero
 *     clienti, zero fascicoli, zero documenti — su D1 e su R2, salvo il
 *     transito della coda). I dati dell'adeguata verifica appartengono al
 *     professionista e vanno conservati dieci anni (art. 31): uno studio vero
 *     si «cessa» e si esporta, non si cancella da una console. La
 *     cancellazione libera l'email degli utenti (unica su tutta la
 *     piattaforma) e pulisce R2; la traccia sopravvive in `eventi_console`
 *     (migrazione 0014), scritta PRIMA della cancellazione.
 *     L'`audit_log` del tenant NON si tocca: il trigger lo rende
 *     incancellabile (art. 32) e le sue righe, senza archivio, non contengono
 *     dati di clienti. Restano come storia dell'attivazione.
 *  2. Reset della password e disattiva/riattiva di un utente dello studio
 *     dalla console: è il caso reale del lock-out (l'unico amministratore
 *     disattivato o con la password persa). Stesso giro del reset lato
 *     studio, più la riga in `eventi_console` e l'operatore nell'audit.
 */

import type { Env } from './tipi';
import { TABELLE_ARCHIVIO_ELIMINAZIONE } from './backup';
import { nuovoId } from './crypto';

const qIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

export type AzioneConsole = 'STUDIO_ELIMINATO' | 'RESET_PASSWORD_UTENTE' | 'STATO_UTENTE';

/** Traccia di console che sopravvive al tenant (nessun dato di clienti). */
export async function scriviEventoConsole(db: D1Database, v: { operatore: string; azione: AzioneConsole; tenantId: string | null; dettaglio?: unknown }): Promise<string> {
  const id = nuovoId('evc');
  await db.prepare('INSERT INTO eventi_console (id, operatore, azione, tenant_id, dettaglio) VALUES (?,?,?,?,?)')
    .bind(id, v.operatore, v.azione, v.tenantId, v.dettaglio === undefined ? null : JSON.stringify(v.dettaglio)).run();
  return id;
}

export async function leggiEventiConsole(db: D1Database, tenantId: string | null, limite = 50) {
  const st = tenantId
    ? db.prepare('SELECT * FROM eventi_console WHERE tenant_id = ? ORDER BY creato_il DESC LIMIT ?').bind(tenantId, limite)
    : db.prepare('SELECT * FROM eventi_console ORDER BY creato_il DESC LIMIT ?').bind(limite);
  const { results } = await st.all<any>();
  return (results ?? []).map((r) => ({ id: r.id, operatore: r.operatore, azione: r.azione, tenantId: r.tenant_id, creatoIl: r.creato_il, dettaglio: (() => { try { return r.dettaglio ? JSON.parse(r.dettaglio) : null; } catch { return null; } })() }));
}

export interface ConteggiArchivio { clienti: number; fascicoli: number; documenti: number; oggettiR2: number }

/** Cosa c'è nell'archivio dello studio: se qualcosa è > 0 lo studio non è vuoto. */
export async function conteggiArchivioStudio(env: Env, tenantId: string): Promise<ConteggiArchivio> {
  const n = async (sql: string) => Number((await env.DB.prepare(sql).bind(tenantId).first<{ n: number }>())?.n ?? 0);
  const clienti = await n('SELECT COUNT(*) AS n FROM clienti WHERE tenant_id = ?');
  const fascicoli = await n('SELECT COUNT(*) AS n FROM fascicoli WHERE tenant_id = ?');
  const documenti = await n('SELECT COUNT(*) AS n FROM documenti WHERE tenant_id = ?');
  // Oggetti su R2 fuori dal transito della coda di revisione (`${tenant}/coda/…`).
  let oggettiR2 = 0;
  let cursor: string | undefined;
  do {
    const page = await env.DOCS.list({ prefix: `${tenantId}/`, cursor });
    oggettiR2 += page.objects.filter((o) => !o.key.startsWith(`${tenantId}/coda/`)).length;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return { clienti, fascicoli, documenti, oggettiR2 };
}

async function svuotaPrefissoR2(bucket: R2Bucket, prefix: string): Promise<number> {
  let tolti = 0;
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    const chiavi = page.objects.map((o) => o.key);
    if (chiavi.length) { await bucket.delete(chiavi); tolti += chiavi.length; }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return tolti;
}

export interface EsitoEliminazioneStudio {
  eventoId: string;
  utentiEliminati: number;
  emailLiberate: string[];
  oggettiR2Eliminati: number;
}

/**
 * Cancella uno studio VUOTO: righe delle tabelle dell'archivio (per
 * sicurezza, anche se vuote), ticket con messaggi e letture, flag di
 * manutenzione, sessioni, utenti (le email tornano disponibili), tenant;
 * poi i prefissi R2 di documenti e backup. L'evento di console è scritto
 * PRIMA. Il chiamante ha già verificato che l'archivio sia vuoto.
 */
export async function eliminaStudioVuoto(env: Env, tenant: { id: string; denominazione: string; partita_iva?: string | null; codice_fiscale?: string | null }, operatore: string, conteggi: ConteggiArchivio): Promise<EsitoEliminazioneStudio> {
  const { results: utenti } = await env.DB.prepare('SELECT id, email, nome, ruolo FROM utenti WHERE tenant_id = ?').bind(tenant.id).all<any>();
  const emailLiberate = (utenti ?? []).map((u) => String(u.email));
  const eventoId = await scriviEventoConsole(env.DB, {
    operatore, azione: 'STUDIO_ELIMINATO', tenantId: tenant.id,
    dettaglio: {
      denominazione: tenant.denominazione, partitaIva: tenant.partita_iva ?? null, codiceFiscale: tenant.codice_fiscale ?? null,
      utenti: (utenti ?? []).map((u) => ({ email: u.email, nome: u.nome, ruolo: u.ruolo })), conteggi, operatore,
    },
  });

  const db = env.DB;
  const per = (sql: string) => db.prepare(sql).bind(tenant.id);
  await db.batch([
    ...TABELLE_ARCHIVIO_ELIMINAZIONE.map((t) => per(`DELETE FROM ${qIdent(t)} WHERE tenant_id = ?1`)),
    per('DELETE FROM ticket_letture WHERE tenant_id = ?1'),
    per('DELETE FROM ticket_messaggi WHERE tenant_id = ?1'),
    per('DELETE FROM ticket WHERE tenant_id = ?1'),
    per('DELETE FROM manutenzione_flag WHERE tenant_id = ?1'),
    per('DELETE FROM sessioni WHERE tenant_id = ?1'),
    per('DELETE FROM password_reset_token WHERE utente_id IN (SELECT id FROM utenti WHERE tenant_id = ?1)'),
    per('DELETE FROM utenti WHERE tenant_id = ?1'),
    per('DELETE FROM tenants WHERE id = ?1'),
  ]);

  const oggettiR2Eliminati =
    (await svuotaPrefissoR2(env.DOCS, `${tenant.id}/`)) +
    (await svuotaPrefissoR2(env.BACKUPS, `tenant/${tenant.id}/`));

  return { eventoId, utentiEliminati: utenti?.length ?? 0, emailLiberate, oggettiR2Eliminati };
}
