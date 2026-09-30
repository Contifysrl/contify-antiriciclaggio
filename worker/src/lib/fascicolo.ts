/**
 * FASCICOLO: CODICE, MODIFICA DEI DATI DELL'INCARICO, CANCELLAZIONE (AR-M23)
 *
 * Tre richieste di Barbara dal collaudo di settembre 2026:
 *  1. un fascicolo aperto per errore non si poteva eliminare: si poteva solo
 *     lasciarlo lì o «cessarlo», che però è la conservazione decennale;
 *  2. la data di identificazione / conferimento dell'incarico non si poteva
 *     più correggere dopo l'apertura;
 *  3. (collegata) il codice progressivo nasceva da COUNT(*)+1: con una
 *     cancellazione in mezzo avrebbe prodotto un doppione — ora è MAX+1.
 *
 * Confine (art. 31): si cancella solo ciò che NON documenta un'adeguata
 * verifica. Un fascicolo con valutazione firmata, documenti conservati,
 * verifiche a distanza completate, operazioni, astensioni, segnalazioni o
 * controlli costanti registrati non si elimina: si cessa. L'audit precede
 * sempre la cancellazione, con i dati che dopo non sarebbero più risolvibili.
 */

import type { Env, Utente } from './tipi';
import { scriviAudit } from './audit';
import { leggiProposte } from './compagine';

const oggi = () => new Date().toISOString().slice(0, 10);
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export const MODALITA_IDENTIFICAZIONE = ['PRESENZA', 'ATTO_PUBBLICO', 'IDENTITA_DIGITALE', 'FIRMA_DIGITALE', 'GIA_IDENTIFICATO'] as const;

// ------------------------------------------------------------------ codice

/**
 * Prossimo codice `AAAA/NNNN` dell'anno: MAX del progressivo + 1. Con
 * COUNT(*)+1 (com'era) un fascicolo eliminato in mezzo alla serie avrebbe
 * fatto nascere un doppione. Se l'eliminato era l'ultimo, il suo numero
 * torna disponibile: è come stornare l'ultima riga di un registro.
 */
export async function prossimoCodiceFascicolo(db: D1Database, tenantId: string, anno: string): Promise<string> {
  const r = await db.prepare(
    "SELECT MAX(CAST(substr(codice, 6) AS INTEGER)) AS n FROM fascicoli WHERE tenant_id = ? AND codice LIKE ?",
  ).bind(tenantId, `${anno}/%`).first<{ n: number | null }>();
  return `${anno}/${String((r?.n ?? 0) + 1).padStart(4, '0')}`;
}

// ------------------------------------------------------------- collegamenti

export interface CollegamentiFascicolo {
  valutazioniFirmate: number;
  valutazioniNonFirmate: number;
  documenti: number;
  verificheCompletate: number;
  verificheAperte: number;
  operazioni: number;
  astensioni: number;
  segnalazioni: number;
  controlliCostanti: number;
  cessato: boolean;
  eliminabile: boolean;
  /** Perché non si può eliminare, in italiano, una voce per motivo. */
  motivi: string[];
}

export async function collegamentiFascicolo(db: D1Database, tenantId: string, fascicoloId: string, fascicolo?: { stato: string; data_cessazione: string | null } | null): Promise<CollegamentiFascicolo> {
  const conta = async (sql: string) =>
    (await db.prepare(sql).bind(fascicoloId, tenantId).first<{ n: number }>())?.n ?? 0;
  const f = fascicolo ?? (await db.prepare('SELECT stato, data_cessazione FROM fascicoli WHERE id = ? AND tenant_id = ?').bind(fascicoloId, tenantId).first<any>());
  const [valutazioniFirmate, valutazioniNonFirmate, documenti, verificheCompletate, verificheAperte, operazioni, astensioni, segnalazioni, controlliCostanti] = await Promise.all([
    conta('SELECT COUNT(*) AS n FROM valutazioni_rischio WHERE fascicolo_id = ? AND tenant_id = ? AND firmata_il IS NOT NULL'),
    conta('SELECT COUNT(*) AS n FROM valutazioni_rischio WHERE fascicolo_id = ? AND tenant_id = ? AND firmata_il IS NULL'),
    conta('SELECT COUNT(*) AS n FROM documenti WHERE fascicolo_id = ? AND tenant_id = ?'),
    conta("SELECT COUNT(*) AS n FROM richieste_verifica WHERE fascicolo_id = ? AND tenant_id = ? AND stato IN ('COMPLETATA','ACQUISITA')"),
    conta("SELECT COUNT(*) AS n FROM richieste_verifica WHERE fascicolo_id = ? AND tenant_id = ? AND stato NOT IN ('COMPLETATA','ACQUISITA')"),
    conta('SELECT COUNT(*) AS n FROM operazioni WHERE fascicolo_id = ? AND tenant_id = ?'),
    conta('SELECT COUNT(*) AS n FROM astensioni WHERE fascicolo_id = ? AND tenant_id = ?'),
    conta('SELECT COUNT(*) AS n FROM segnalazioni_sospette WHERE fascicolo_id = ? AND tenant_id = ?'),
    conta('SELECT COUNT(*) AS n FROM controlli_costanti WHERE fascicolo_id = ? AND tenant_id = ?'),
  ]);
  const cessato = Boolean(f && (f.stato === 'CESSATO' || f.data_cessazione));
  const motivi: string[] = [];
  const s = (n: number, uno: string, piu: string) => (n === 1 ? uno : piu.replace('{n}', String(n)));
  if (valutazioniFirmate) motivi.push(s(valutazioniFirmate, 'una valutazione del rischio firmata', '{n} valutazioni del rischio firmate'));
  if (documenti) motivi.push(s(documenti, 'un documento conservato', '{n} documenti conservati'));
  if (verificheCompletate) motivi.push(s(verificheCompletate, 'una verifica a distanza completata dal cliente', '{n} verifiche a distanza completate dal cliente'));
  if (operazioni) motivi.push(s(operazioni, 'un’operazione registrata', '{n} operazioni registrate'));
  if (astensioni) motivi.push(s(astensioni, 'un verbale di astensione', '{n} verbali di astensione'));
  if (segnalazioni) motivi.push(s(segnalazioni, 'una segnalazione di operazione sospetta', '{n} segnalazioni di operazione sospetta'));
  if (controlliCostanti) motivi.push(s(controlliCostanti, 'un controllo costante registrato', '{n} controlli costanti registrati'));
  if (cessato) motivi.push('il rapporto è cessato: i dieci anni di conservazione decorrono da qui');
  return {
    valutazioniFirmate, valutazioniNonFirmate, documenti, verificheCompletate, verificheAperte, operazioni, astensioni, segnalazioni, controlliCostanti,
    cessato, eliminabile: motivi.length === 0, motivi,
  };
}

// ------------------------------------------------------------- eliminazione

export type EsitoEliminazione =
  | { ok: true; codice: string }
  | { errore: string; stato: 400 | 404 | 409; codice?: string; collegamenti?: CollegamentiFascicolo };

/**
 * Elimina un fascicolo aperto per errore. Porta via con sé le sole cose che
 * non documentano nulla: valutazioni non firmate, richieste di verifica a
 * distanza non completate, proposte del programma riferite al fascicolo.
 */
export async function eliminaFascicolo(env: Env, tenantId: string, u: Utente, ip: string | null | undefined, fascicoloId: string, motivazione: unknown): Promise<EsitoEliminazione> {
  const f = await env.DB.prepare(
    `SELECT f.*, cl.denominazione AS cliente FROM fascicoli f JOIN clienti cl ON cl.id = f.cliente_id WHERE f.id = ? AND f.tenant_id = ?`,
  ).bind(fascicoloId, tenantId).first<any>();
  if (!f) return { errore: 'Fascicolo non trovato', stato: 404 };

  const collegamenti = await collegamentiFascicolo(env.DB, tenantId, fascicoloId, f);
  if (!collegamenti.eliminabile) {
    return {
      errore: `Il fascicolo ${f.codice} non si può eliminare: ha ${collegamenti.motivi.join(', ')}. `
        + 'L’art. 31 impone di conservare per dieci anni ciò che documenta l’adeguata verifica: se il rapporto è finito, registra la cessazione.',
      stato: 409, codice: 'fascicolo_collegato', collegamenti,
    };
  }
  const motivo = String(motivazione ?? '').trim();
  if (motivo.length < 5) {
    return { errore: 'Scrivi perché elimini il fascicolo (es. «aperto per errore sul cliente sbagliato»): resta nel registro delle attività.', stato: 400 };
  }

  // Proposte del programma nate con il fascicolo (Tabella A, esecutore): il
  // riferimento è nel contenuto cifrato, si leggono e si scelgono qui.
  const proposte = await leggiProposte(env, tenantId, f.cliente_id);
  const idProposte = proposte.filter((p) => p.contenuto?.fascicoloId === fascicoloId && (p.ambito === 'RISCHIO_A' || p.ambito === 'ESECUTORE')).map((p) => p.id);

  // L'audit PRIMA della cancellazione: dopo, l'id sarebbe muto.
  await scriviAudit(env.DB, {
    tenantId, utenteId: u.id, azione: 'ELIMINA_FASCICOLO', entita: 'fascicoli', entitaId: fascicoloId,
    dettaglio: {
      codice: f.codice, cliente: f.cliente, clienteId: f.cliente_id, prestazione: f.prestazione_codice, prestazioneDescrizione: f.prestazione_descrizione,
      dataConferimento: f.data_conferimento, creatoIl: f.creato_il, motivazione: motivo,
      valutazioniNonFirmate: collegamenti.valutazioniNonFirmate, verificheAperte: collegamenti.verificheAperte, proposte: idProposte.length,
    },
    ip,
  });

  const stmts: D1PreparedStatement[] = [
    env.DB.prepare('DELETE FROM valutazioni_rischio WHERE fascicolo_id = ? AND tenant_id = ? AND firmata_il IS NULL').bind(fascicoloId, tenantId),
    env.DB.prepare("DELETE FROM richieste_verifica WHERE fascicolo_id = ? AND tenant_id = ? AND stato NOT IN ('COMPLETATA','ACQUISITA')").bind(fascicoloId, tenantId),
    // Rivalutazioni «da rivalutare» riferite al fascicolo: il riferimento è in chiaro nell'alert.
    env.DB.prepare("DELETE FROM proposte WHERE tenant_id = ? AND cliente_id = ? AND ambito = 'RIVALUTAZIONE' AND alert LIKE ?").bind(tenantId, f.cliente_id, `%"fascicoloId":"${fascicoloId}"%`),
  ];
  for (const id of idProposte) stmts.push(env.DB.prepare('DELETE FROM proposte WHERE id = ? AND tenant_id = ?').bind(id, tenantId));
  stmts.push(env.DB.prepare('DELETE FROM fascicoli WHERE id = ? AND tenant_id = ?').bind(fascicoloId, tenantId));
  await env.DB.batch(stmts);
  return { ok: true, codice: f.codice };
}

// ------------------------------------------------------------------ modifica

export type EsitoModifica =
  | { ok: true; modifiche: Record<string, { da: unknown; a: unknown }> }
  | { errore: string; stato: 400 | 404 };

/**
 * Corregge i dati dell'incarico: date di conferimento e di identificazione,
 * modalità di identificazione, tipo di rapporto, importo, scopo e natura.
 * Ogni campo cambiato finisce nell'audit con prima/dopo. Se il fascicolo ha
 * già una valutazione firmata la motivazione è obbligatoria: le date reggono
 * i termini dei trenta giorni e compaiono nella scheda di adeguata verifica.
 */
export async function modificaFascicolo(env: Env, tenantId: string, u: Utente, ip: string | null | undefined, fascicoloId: string, b: any): Promise<EsitoModifica> {
  const f = await env.DB.prepare('SELECT * FROM fascicoli WHERE id = ? AND tenant_id = ?').bind(fascicoloId, tenantId).first<any>();
  if (!f) return { errore: 'Fascicolo non trovato', stato: 404 };
  if (!b || typeof b !== 'object') return { errore: 'Corpo della richiesta mancante', stato: 400 };

  const set: string[] = [];
  const valori: unknown[] = [];
  const modifiche: Record<string, { da: unknown; a: unknown }> = {};
  const cambia = (colonna: string, chiave: string, nuovo: unknown) => {
    const vecchio = f[colonna] ?? null;
    const n = nuovo ?? null;
    if (vecchio === n || (typeof vecchio === 'number' && typeof n === 'number' && vecchio === n)) return;
    set.push(`${colonna} = ?`);
    valori.push(n);
    modifiche[chiave] = { da: vecchio, a: n };
  };
  const data = (v: unknown, nome: string): string | { errore: string } => {
    const s = String(v ?? '').slice(0, 10);
    if (!DATA_ISO.test(s)) return { errore: `${nome}: indica la data come AAAA-MM-GG.` };
    if (s > oggi()) return { errore: `${nome}: non può essere una data futura.` };
    return s;
  };

  if (b.dataConferimento !== undefined) {
    const d = data(b.dataConferimento, 'Data di conferimento dell’incarico');
    if (typeof d !== 'string') return { errore: d.errore, stato: 400 };
    cambia('data_conferimento', 'dataConferimento', d);
  }
  if (b.dataIdentificazione !== undefined) {
    const d = data(b.dataIdentificazione, 'Data dell’identificazione');
    if (typeof d !== 'string') return { errore: d.errore, stato: 400 };
    cambia('data_identificazione', 'dataIdentificazione', d);
  }
  if (b.modalitaIdentificazione !== undefined) {
    const m = b.modalitaIdentificazione ? String(b.modalitaIdentificazione) : null;
    if (m && !(MODALITA_IDENTIFICAZIONE as readonly string[]).includes(m)) return { errore: 'Modalità di identificazione non riconosciuta.', stato: 400 };
    cambia('modalita_identificazione', 'modalitaIdentificazione', m);
  }
  if (b.tipoRapporto !== undefined) {
    const t = String(b.tipoRapporto);
    if (t !== 'CONTINUATIVO' && t !== 'OCCASIONALE') return { errore: 'Tipo di rapporto: CONTINUATIVO oppure OCCASIONALE.', stato: 400 };
    cambia('tipo_rapporto', 'tipoRapporto', t);
  }
  if (b.importoOperazione !== undefined) {
    const n = b.importoOperazione === null || b.importoOperazione === '' ? null : Number(b.importoOperazione);
    if (n !== null && !(Number.isFinite(n) && n >= 0)) return { errore: 'Importo dell’operazione non valido.', stato: 400 };
    cambia('importo_operazione', 'importoOperazione', n);
  }
  if (b.scopoNatura !== undefined) {
    cambia('scopo_natura', 'scopoNatura', String(b.scopoNatura ?? '').trim().slice(0, 2000) || null);
  }
  if (!set.length) return { errore: 'Nessuna modifica: i dati indicati coincidono con quelli registrati.', stato: 400 };

  const firmata = await env.DB.prepare('SELECT COUNT(*) AS n FROM valutazioni_rischio WHERE fascicolo_id = ? AND tenant_id = ? AND firmata_il IS NOT NULL')
    .bind(fascicoloId, tenantId).first<{ n: number }>();
  const motivazione = String(b.motivazione ?? '').trim().slice(0, 1000) || null;
  if ((firmata?.n ?? 0) > 0 && !motivazione) {
    return { errore: 'Il fascicolo ha una valutazione firmata: indica la motivazione della correzione dei dati dell’incarico (resta nel registro delle attività e nella scheda di verifica).', stato: 400 };
  }

  set.push("aggiornato_il = datetime('now')");
  await env.DB.prepare(`UPDATE fascicoli SET ${set.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...valori, fascicoloId, tenantId).run();
  await scriviAudit(env.DB, {
    tenantId, utenteId: u.id, azione: 'MODIFICA_FASCICOLO', entita: 'fascicoli', entitaId: fascicoloId,
    dettaglio: { codice: f.codice, modifiche, motivazione, valutazioneFirmata: (firmata?.n ?? 0) > 0 }, ip,
  });
  return { ok: true, modifiche };
}
