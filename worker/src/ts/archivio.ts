/**
 * Contify Timesheet — accesso all'archivio (TS-M1, M1.1).
 *
 * Qui stanno le letture e scritture sulle tabelle ts_*: clienti (unione con
 * quelli di AR, scelta B2), servizi (con i predefiniti), registrazioni (con
 * cifratura di nota e testo originale, tariffa fotografata, regole «da
 * verificare»), ore previste per persona, contatori d'uso dell'AI,
 * impostazioni e consenso in tenants.parametri.ts.
 *
 * Regola della piattaforma: tenant_id in OGNI interrogazione, e ogni
 * identificativo ricevuto dal browser si verifica che appartenga allo studio.
 */

import type { Env } from '../lib/tipi';
import { cifra, decifra, nuovoId } from '../lib/crypto';

// ── Date ────────────────────────────────────────────────────────

/** Oggi nel fuso di Roma, AAAA-MM-GG: «oggi» e il giorno dei contatori non si calcolano in UTC. */
export function oggiRoma(adesso: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(adesso);
}

export const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

export function dataValida(d: unknown): d is string {
  if (typeof d !== 'string' || !DATA_RE.test(d)) return false;
  const [a, m, g] = d.split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1, g));
  return x.getUTCFullYear() === a && x.getUTCMonth() === m - 1 && x.getUTCDate() === g;
}

// ── Cifratura dei testi liberi ─────────────────────────────────

export async function cifraTesto(env: Env, tenantId: string, v: string | null | undefined): Promise<string | null> {
  return v ? JSON.stringify(await cifra(env.MASTER_KEY, tenantId, v)) : null;
}
export async function decifraTesto(env: Env, tenantId: string, v: string | null | undefined): Promise<string | null> {
  if (!v) return null;
  try { return await decifra(env.MASTER_KEY, tenantId, JSON.parse(v)); } catch { return null; }
}
export async function cifraJson(env: Env, tenantId: string, v: unknown): Promise<string | null> {
  return v == null ? null : cifraTesto(env, tenantId, JSON.stringify(v));
}
export async function decifraJson<T>(env: Env, tenantId: string, v: string | null | undefined): Promise<T | null> {
  const t = await decifraTesto(env, tenantId, v);
  if (!t) return null;
  try { return JSON.parse(t) as T; } catch { return null; }
}

// ── Servizi ─────────────────────────────────────────────────────

export interface Servizio {
  id: string;
  nome: string;
  tariffaOrariaCent: number;
  paroleChiave: string[];
  generico: boolean;
  attivo: boolean;
  ordine: number;
}

/** Gli otto servizi di partenza (parole chiave dal prototipo, tariffa a zero: i prezzi dello studio li mette lo studio). */
export const SERVIZI_PREDEFINITI: Array<{ nome: string; parole: string[]; generico?: boolean }> = [
  { nome: 'Contabilità', parole: ['contabil', 'registrazion', 'prima nota', 'fattur', 'riconcilia', 'banca', 'corrispettiv', 'scritture', 'estratto conto'] },
  { nome: 'Liquidazione IVA', parole: ['liquidazione iva', 'liquidazioni iva', 'iva', 'lipe', 'esterometro'] },
  { nome: 'Dichiarazioni', parole: ['dichiaraz', 'redditi', '730', 'unico', '770', 'integrativa', 'irap', 'isa'] },
  { nome: 'Bilancio', parole: ['bilancio', 'chiusura', 'nota integrativa', 'assestamento'] },
  { nome: 'Paghe e contributi', parole: ['paghe', 'cedolin', 'busta paga', 'buste paga', 'contribut', 'uniemens', 'assunzion', 'licenziament', 'tfr', 'inps', 'libro unico', 'malattia', 'maternita', 'infortunio'] },
  { nome: 'Consulenza', parole: ['consulenza', 'parere', 'riunione', 'incontro', 'call', 'telefon', 'quesito', 'videochiamata', 'appuntamento'] },
  { nome: 'Pratiche e adempimenti', parole: ['pratica', 'pratiche', 'camerale', 'camera di commercio', 'visura', 'f24', 'pec', 'comunica', 'inps', 'durc', 'cassetto fiscale'] },
  { nome: 'Altro', parole: [], generico: true },
];

function rigaServizio(r: any): Servizio {
  let parole: string[] = [];
  try { parole = Array.isArray(JSON.parse(r.parole_chiave ?? '[]')) ? JSON.parse(r.parole_chiave ?? '[]') : []; } catch { parole = []; }
  return {
    id: r.id, nome: r.nome, tariffaOrariaCent: Number(r.tariffa_oraria_cent ?? 0), paroleChiave: parole.map(String),
    generico: r.generico === 1, attivo: r.attivo === 1, ordine: Number(r.ordine ?? 0),
  };
}

export async function elencoServizi(db: D1Database, tenantId: string, soloAttivi = true): Promise<Servizio[]> {
  const { results } = await db.prepare(
    `SELECT * FROM ts_servizi WHERE tenant_id = ?${soloAttivi ? ' AND attivo = 1' : ''} ORDER BY ordine, nome`,
  ).bind(tenantId).all<any>();
  return (results ?? []).map(rigaServizio);
}

/** Crea i servizi predefiniti se lo studio non ne ha nessuno. Restituisce quanti ne ha creati. */
export async function assicuraServiziPredefiniti(db: D1Database, tenantId: string): Promise<number> {
  const n = await db.prepare('SELECT COUNT(*) AS n FROM ts_servizi WHERE tenant_id = ?').bind(tenantId).first<{ n: number }>();
  if ((n?.n ?? 0) > 0) return 0;
  await db.batch(SERVIZI_PREDEFINITI.map((s, i) => db.prepare(
    'INSERT INTO ts_servizi (id, tenant_id, nome, tariffa_oraria_cent, parole_chiave, generico, attivo, ordine) VALUES (?, ?, ?, 0, ?, ?, 1, ?)',
  ).bind(nuovoId('tss'), tenantId, s.nome, JSON.stringify(s.parole), s.generico ? 1 : 0, i)));
  return SERVIZI_PREDEFINITI.length;
}

// ── Clienti ─────────────────────────────────────────────────────

export interface DatiCliente {
  sede?: string | null;
  pec?: string | null;
  codiceDestinatario?: string | null;
  email?: string | null;
  telefono?: string | null;
}

export interface ClienteTs {
  /** id in ts_clienti, oppure `ar:<id>` per un cliente di AR non ancora usato in Timesheet. */
  id: string;
  nome: string;
  personaFisica: boolean;
  codiceFiscale: string | null;
  partitaIva: string | null;
  origine: string;
  clienteArId: string | null;
  /** Collegato a un cliente di AR (anagrafica in sola lettura, si modifica in AR). */
  collegatoAr: boolean;
  /** Il cliente AR non esiste più: vale la copia del nome. */
  arMancante: boolean;
  alias: string[];
  attivo: boolean;
  daVerificare: boolean;
  dati: DatiCliente | null;
  creatoIl: string | null;
}

function aliasDa(v: unknown): string[] {
  try { const a = JSON.parse(String(v ?? '[]')); return Array.isArray(a) ? a.map(String).filter(Boolean).slice(0, 30) : []; } catch { return []; }
}

const SQL_CLIENTI_TS = `
  SELECT t.id, COALESCE(c.denominazione, t.denominazione) AS nome, t.persona_fisica,
         COALESCE(c.codice_fiscale, t.codice_fiscale) AS codice_fiscale, COALESCE(c.partita_iva, t.partita_iva) AS partita_iva,
         t.origine, t.cliente_ar_id, (t.cliente_ar_id IS NOT NULL AND c.id IS NULL) AS ar_mancante,
         t.alias, t.attivo, t.da_verificare, t.dati, t.creato_il
  FROM ts_clienti t
  LEFT JOIN clienti c ON c.id = t.cliente_ar_id AND c.tenant_id = t.tenant_id
  WHERE t.tenant_id = ?`;

const SQL_CLIENTI_AR_NON_USATI = `
  SELECT c.id, c.denominazione AS nome, c.tipo, c.codice_fiscale, c.partita_iva
  FROM clienti c
  WHERE c.tenant_id = ? AND c.attivo = 1
    AND NOT EXISTS (SELECT 1 FROM ts_clienti t WHERE t.tenant_id = c.tenant_id AND t.cliente_ar_id = c.id)`;

async function rigaCliente(env: Env, tenantId: string, r: any, conDati: boolean): Promise<ClienteTs> {
  return {
    id: r.id, nome: r.nome, personaFisica: r.persona_fisica === 1, codiceFiscale: r.codice_fiscale ?? null, partitaIva: r.partita_iva ?? null,
    origine: r.origine, clienteArId: r.cliente_ar_id ?? null, collegatoAr: !!r.cliente_ar_id, arMancante: r.ar_mancante === 1,
    alias: aliasDa(r.alias), attivo: r.attivo === 1, daVerificare: r.da_verificare === 1,
    dati: conDati ? await decifraJson<DatiCliente>(env, tenantId, r.dati) : null, creatoIl: r.creato_il ?? null,
  };
}

/**
 * L'elenco dei clienti che Timesheet mostra: le righe di ts_clienti più, se lo
 * studio ha AR attivo, i clienti attivi di AR senza riga (id `ar:<id>`).
 * Nessuna scrittura: la riga nasce al primo salvataggio (assicuraClienteTs).
 */
export async function elencoClientiTs(env: Env, tenantId: string, opz: { conAr: boolean; soloAttivi?: boolean; conDati?: boolean }): Promise<ClienteTs[]> {
  const { results } = await env.DB.prepare(SQL_CLIENTI_TS + (opz.soloAttivi ? ' AND t.attivo = 1' : '') + ' ORDER BY nome').bind(tenantId).all<any>();
  const out: ClienteTs[] = [];
  for (const r of results ?? []) out.push(await rigaCliente(env, tenantId, r, !!opz.conDati));
  if (opz.conAr) {
    const { results: ar } = await env.DB.prepare(SQL_CLIENTI_AR_NON_USATI + ' ORDER BY c.denominazione').bind(tenantId).all<any>();
    for (const r of ar ?? []) {
      out.push({
        id: `ar:${r.id}`, nome: r.nome, personaFisica: r.tipo === 'PERSONA_FISICA', codiceFiscale: r.codice_fiscale ?? null, partitaIva: r.partita_iva ?? null,
        origine: 'AR', clienteArId: r.id, collegatoAr: true, arMancante: false, alias: [], attivo: true, daVerificare: false, dati: null, creatoIl: null,
      });
    }
  }
  return out.sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
}

/** Un cliente di ts_clienti dello studio (null se non esiste o è di un altro studio). */
export async function clienteTs(env: Env, tenantId: string, id: string, conDati = false): Promise<ClienteTs | null> {
  const r = await env.DB.prepare(SQL_CLIENTI_TS + ' AND t.id = ?').bind(tenantId, id).first<any>();
  return r ? rigaCliente(env, tenantId, r, conDati) : null;
}

/**
 * Risolve l'id ricevuto dal browser in una riga di ts_clienti dello studio,
 * creandola se è un cliente di AR (`ar:<id>`) non ancora usato. Restituisce
 * null se il cliente non esiste, non è dello studio o non è attivo.
 */
export async function assicuraClienteTs(env: Env, tenantId: string, id: string, creatoDa: string): Promise<ClienteTs | null> {
  if (id.startsWith('ar:')) {
    const arId = id.slice(3);
    const ar = await env.DB.prepare('SELECT id, denominazione, tipo, codice_fiscale, partita_iva, attivo FROM clienti WHERE id = ? AND tenant_id = ?').bind(arId, tenantId).first<any>();
    if (!ar || ar.attivo !== 1) return null;
    await env.DB.prepare(
      `INSERT OR IGNORE INTO ts_clienti (id, tenant_id, denominazione, persona_fisica, codice_fiscale, partita_iva, origine, cliente_ar_id, creato_da)
       VALUES (?, ?, ?, ?, ?, ?, 'AR', ?, ?)`,
    ).bind(nuovoId('tsc'), tenantId, ar.denominazione, ar.tipo === 'PERSONA_FISICA' ? 1 : 0, ar.codice_fiscale ?? null, ar.partita_iva ?? null, arId, creatoDa).run();
    const r = await env.DB.prepare(SQL_CLIENTI_TS + ' AND t.cliente_ar_id = ?').bind(tenantId, arId).first<any>();
    return r ? rigaCliente(env, tenantId, r, false) : null;
  }
  const c = await clienteTs(env, tenantId, id);
  return c && c.attivo ? c : null;
}

/** Aggiorna la copia del nome dei clienti collegati ad AR (serve quando il cliente AR sparisce). */
export async function aggiornaCopiaNome(db: D1Database, tenantId: string, tsId: string): Promise<void> {
  await db.prepare(
    `UPDATE ts_clienti SET denominazione = (SELECT c.denominazione FROM clienti c WHERE c.id = ts_clienti.cliente_ar_id AND c.tenant_id = ts_clienti.tenant_id)
     WHERE tenant_id = ? AND id = ? AND cliente_ar_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM clienti c WHERE c.id = ts_clienti.cliente_ar_id AND c.tenant_id = ts_clienti.tenant_id)`,
  ).bind(tenantId, tsId).run();
}

export interface Doppione { id: string; nome: string; motivo: string }

/**
 * Doppioni (regola comune dei quattro modi di caricamento): stesso codice
 * fiscale o stessa partita IVA nello studio; senza l'uno e l'altra, la
 * denominazione identica. Il confronto comprende i clienti di AR non ancora
 * usati in Timesheet.
 */
export function trovaDoppione(elenco: ClienteTs[], dati: { denominazione: string; codiceFiscale?: string | null; partitaIva?: string | null }, escludiId?: string): Doppione | null {
  const cf = (dati.codiceFiscale ?? '').trim().toUpperCase();
  const piva = (dati.partitaIva ?? '').replace(/\D/g, '');
  const nome = dati.denominazione.trim().toLowerCase();
  for (const c of elenco) {
    if (escludiId && (c.id === escludiId || c.clienteArId === escludiId)) continue;
    if (cf && (c.codiceFiscale ?? '').toUpperCase() === cf) return { id: c.id, nome: c.nome, motivo: `codice fiscale già presente (${c.nome})` };
    if (piva && (c.partitaIva ?? '').replace(/\D/g, '') === piva) return { id: c.id, nome: c.nome, motivo: `partita IVA già presente (${c.nome})` };
  }
  if (!cf && !piva) {
    const uguale = elenco.find((c) => c.nome.trim().toLowerCase() === nome && !(escludiId && (c.id === escludiId || c.clienteArId === escludiId)));
    if (uguale) return { id: uguale.id, nome: uguale.nome, motivo: `denominazione già presente (${uguale.nome})` };
  }
  return null;
}

// ── Registrazioni ───────────────────────────────────────────────

export interface Registrazione {
  id: string;
  utenteId: string;
  utenteNome: string;
  creatoDa: string;
  clienteId: string;
  clienteNome: string;
  servizioId: string;
  servizioNome: string;
  data: string;
  minuti: number;
  tariffaCent: number | null;
  nota: string | null;
  testoOriginale: string | null;
  origine: 'CHAT' | 'VOCE' | 'MANUALE';
  motore: 'LOCALE' | 'AI' | 'MANUALE';
  automatica: boolean;
  daVerificare: boolean;
  proformaId: string | null;
  creatoIl: string;
  modificatoIl: string | null;
}

const SQL_REGISTRAZIONI = `
  SELECT r.*, u.nome AS utente_nome, COALESCE(c.denominazione, t.denominazione) AS cliente_nome, s.nome AS servizio_nome
  FROM ts_registrazioni r
  JOIN utenti u ON u.id = r.utente_id
  JOIN ts_clienti t ON t.id = r.cliente_id
  LEFT JOIN clienti c ON c.id = t.cliente_ar_id AND c.tenant_id = t.tenant_id
  JOIN ts_servizi s ON s.id = r.servizio_id
  WHERE r.tenant_id = ?`;

async function rigaRegistrazione(env: Env, tenantId: string, r: any, conTesti: boolean): Promise<Registrazione> {
  return {
    id: r.id, utenteId: r.utente_id, utenteNome: r.utente_nome, creatoDa: r.creato_da, clienteId: r.cliente_id, clienteNome: r.cliente_nome,
    servizioId: r.servizio_id, servizioNome: r.servizio_nome, data: r.data, minuti: Number(r.minuti), tariffaCent: r.tariffa_cent ?? null,
    nota: conTesti ? await decifraTesto(env, tenantId, r.nota) : null,
    testoOriginale: conTesti ? await decifraTesto(env, tenantId, r.testo_originale) : null,
    origine: r.origine, motore: r.motore, automatica: r.automatica === 1, daVerificare: r.da_verificare === 1,
    proformaId: r.proforma_id ?? null, creatoIl: r.creato_il, modificatoIl: r.modificato_il ?? null,
  };
}

export interface FiltriRegistrazioni {
  utenteId?: string | null;
  clienteId?: string | null;
  servizioId?: string | null;
  da?: string | null;
  a?: string | null;
  daVerificare?: boolean;
  limite?: number;
}

export async function elencoRegistrazioni(env: Env, tenantId: string, f: FiltriRegistrazioni, conTesti: boolean): Promise<Registrazione[]> {
  const cond: string[] = [];
  const par: unknown[] = [tenantId];
  if (f.utenteId) { cond.push('r.utente_id = ?'); par.push(f.utenteId); }
  if (f.clienteId) { cond.push('r.cliente_id = ?'); par.push(f.clienteId); }
  if (f.servizioId) { cond.push('r.servizio_id = ?'); par.push(f.servizioId); }
  if (f.da) { cond.push('r.data >= ?'); par.push(f.da); }
  if (f.a) { cond.push('r.data <= ?'); par.push(f.a); }
  if (f.daVerificare) cond.push('r.da_verificare = 1');
  const limite = Math.min(Math.max(1, f.limite ?? 2000), 5000);
  const { results } = await env.DB.prepare(
    `${SQL_REGISTRAZIONI}${cond.length ? ' AND ' + cond.join(' AND ') : ''} ORDER BY r.data DESC, r.creato_il DESC LIMIT ${limite}`,
  ).bind(...par).all<any>();
  const out: Registrazione[] = [];
  for (const r of results ?? []) out.push(await rigaRegistrazione(env, tenantId, r, conTesti));
  return out;
}

export async function registrazione(env: Env, tenantId: string, id: string, conTesti = true): Promise<Registrazione | null> {
  const r = await env.DB.prepare(`${SQL_REGISTRAZIONI} AND r.id = ?`).bind(tenantId, id).first<any>();
  return r ? rigaRegistrazione(env, tenantId, r, conTesti) : null;
}

/** Minuti già registrati in un giorno da una persona (per la regola delle 16 ore). */
export async function minutiDelGiorno(db: D1Database, tenantId: string, utenteId: string, data: string, escludiId?: string): Promise<number> {
  const r = await db.prepare(
    `SELECT COALESCE(SUM(minuti), 0) AS n FROM ts_registrazioni WHERE tenant_id = ? AND utente_id = ? AND data = ?${escludiId ? ' AND id != ?' : ''}`,
  ).bind(...(escludiId ? [tenantId, utenteId, data, escludiId] : [tenantId, utenteId, data])).first<{ n: number }>();
  return Number(r?.n ?? 0);
}

export const MINUTI_GIORNO_SOSPETTI = 16 * 60;

export interface NuovaRegistrazione {
  utenteId: string;
  creatoDa: string;
  cliente: ClienteTs;
  servizio: Servizio;
  data: string;
  minuti: number;
  nota: string | null;
  testoOriginale: string | null;
  origine: 'CHAT' | 'VOCE' | 'MANUALE';
  motore: 'LOCALE' | 'AI' | 'MANUALE';
  automatica: boolean;
}

/**
 * Salva una registrazione. «Da verificare» si accende quando la somma del
 * giorno per quella persona supera 16 ore, il cliente è stato creato al volo
 * da un collaboratore (da_verificare sul cliente) o il servizio è il generico.
 */
export async function salvaRegistrazione(env: Env, tenantId: string, n: NuovaRegistrazione): Promise<{ id: string; daVerificare: boolean; motivi: string[] }> {
  const motivi: string[] = [];
  const gia = await minutiDelGiorno(env.DB, tenantId, n.utenteId, n.data);
  if (gia + n.minuti > MINUTI_GIORNO_SOSPETTI) motivi.push('oltre_16_ore');
  if (n.cliente.daVerificare) motivi.push('cliente_da_verificare');
  if (n.servizio.generico) motivi.push('servizio_generico');
  const id = nuovoId('tsr');
  await env.DB.prepare(
    `INSERT INTO ts_registrazioni (id, tenant_id, utente_id, creato_da, cliente_id, servizio_id, data, minuti, tariffa_cent, nota, testo_originale, origine, motore, automatica, da_verificare)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, tenantId, n.utenteId, n.creatoDa, n.cliente.id, n.servizio.id, n.data, n.minuti, n.servizio.tariffaOrariaCent,
    await cifraTesto(env, tenantId, n.nota), await cifraTesto(env, tenantId, n.testoOriginale), n.origine, n.motore, n.automatica ? 1 : 0, motivi.length ? 1 : 0,
  ).run();
  return { id, daVerificare: motivi.length > 0, motivi };
}

// ── Persone (ore previste) ──────────────────────────────────────

export interface PersonaTs {
  utenteId: string;
  nome: string;
  tsRuolo: 'TITOLARE' | 'COLLABORATORE' | null;
  amministratore: boolean;
  attivo: boolean;
  minutiSettimanali: number | null;
  giorniLavorativi: string;
}

export async function elencoPersone(db: D1Database, tenantId: string): Promise<PersonaTs[]> {
  const { results } = await db.prepare(
    `SELECT u.id, u.nome, u.ts_ruolo, u.amministratore, u.attivo, p.minuti_settimanali, p.giorni_lavorativi
     FROM utenti u LEFT JOIN ts_persone p ON p.utente_id = u.id AND p.tenant_id = u.tenant_id
     WHERE u.tenant_id = ? AND (u.ts_ruolo IS NOT NULL OR u.amministratore = 1) ORDER BY u.nome`,
  ).bind(tenantId).all<any>();
  return (results ?? []).map((r) => ({
    utenteId: r.id, nome: r.nome, tsRuolo: r.ts_ruolo ?? null, amministratore: r.amministratore === 1, attivo: r.attivo === 1,
    minutiSettimanali: r.minuti_settimanali ?? null, giorniLavorativi: r.giorni_lavorativi ?? '12345',
  }));
}

export async function persona(db: D1Database, tenantId: string, utenteId: string): Promise<{ minutiSettimanali: number | null; giorniLavorativi: string }> {
  const r = await db.prepare('SELECT minuti_settimanali, giorni_lavorativi FROM ts_persone WHERE tenant_id = ? AND utente_id = ?').bind(tenantId, utenteId).first<any>();
  return { minutiSettimanali: r?.minuti_settimanali ?? null, giorniLavorativi: r?.giorni_lavorativi ?? '12345' };
}

export async function scriviPersona(db: D1Database, tenantId: string, utenteId: string, v: { minutiSettimanali: number | null; giorniLavorativi: string }): Promise<void> {
  await db.prepare(
    `INSERT INTO ts_persone (utente_id, tenant_id, minuti_settimanali, giorni_lavorativi, aggiornato_il) VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(utente_id) DO UPDATE SET minuti_settimanali = excluded.minuti_settimanali, giorni_lavorativi = excluded.giorni_lavorativi, aggiornato_il = datetime('now')`,
  ).bind(utenteId, tenantId, v.minutiSettimanali, v.giorniLavorativi).run();
}

// ── Impostazioni e consenso (tenants.parametri.ts) ──────────────

export const VERSIONE_INFORMATIVA_TS = 1;
/** Limiti d'uso per utente e per giorno (costanti modificabili). */
export const LIMITE_INTERPRETAZIONI_GIORNO = 300;
export const LIMITE_SECONDI_AUDIO_GIORNO = 30 * 60;

export interface ImpostazioniTs {
  /** C8: anche il collaboratore può creare un cliente dalla chat (resta «da verificare»). */
  collaboratoriCreanoClienti: boolean;
  /** Finestra del collaboratore: giorni indietro entro cui può creare, modificare ed eliminare. */
  giorniIndietro: number;
}

export interface ConsensoAiTs {
  abilitata: boolean;
  voce: boolean;
  versioneInformativa: number | null;
  accettataDa: string | null;
  accettataIl: string | null;
}

export interface ParametriTs { impostazioni: ImpostazioniTs; ai: ConsensoAiTs }

export const IMPOSTAZIONI_PREDEFINITE: ImpostazioniTs = { collaboratoriCreanoClienti: true, giorniIndietro: 7 };
export const CONSENSO_VUOTO: ConsensoAiTs = { abilitata: false, voce: false, versioneInformativa: null, accettataDa: null, accettataIl: null };

export function parametriTsDa(parametriGrezzi: string | null | undefined): ParametriTs {
  let p: any = {};
  try { p = JSON.parse(parametriGrezzi ?? '{}') ?? {}; } catch { p = {}; }
  const ts = p.ts ?? {};
  const imp = ts.impostazioni ?? {};
  const ai = ts.ai ?? {};
  return {
    impostazioni: {
      collaboratoriCreanoClienti: typeof imp.collaboratoriCreanoClienti === 'boolean' ? imp.collaboratoriCreanoClienti : IMPOSTAZIONI_PREDEFINITE.collaboratoriCreanoClienti,
      giorniIndietro: Number.isInteger(imp.giorniIndietro) && imp.giorniIndietro >= 0 && imp.giorniIndietro <= 365 ? imp.giorniIndietro : IMPOSTAZIONI_PREDEFINITE.giorniIndietro,
    },
    ai: {
      abilitata: ai.abilitata === true, voce: ai.voce === true,
      versioneInformativa: Number.isInteger(ai.versioneInformativa) ? ai.versioneInformativa : null,
      accettataDa: typeof ai.accettataDa === 'string' ? ai.accettataDa : null,
      accettataIl: typeof ai.accettataIl === 'string' ? ai.accettataIl : null,
    },
  };
}

export async function parametriTs(db: D1Database, tenantId: string): Promise<ParametriTs> {
  const t = await db.prepare('SELECT parametri FROM tenants WHERE id = ?').bind(tenantId).first<any>();
  return parametriTsDa(t?.parametri ?? null);
}

/** Scrive il solo percorso $.ts dei parametri (json_set): il resto dei parametri non si tocca. */
export async function scriviParametriTs(db: D1Database, tenantId: string, p: ParametriTs): Promise<void> {
  await db.prepare(`UPDATE tenants SET parametri = json_set(COALESCE(parametri, '{}'), '$.ts', json(?)) WHERE id = ?`)
    .bind(JSON.stringify(p), tenantId).run();
}

/** L'AI di Timesheet è utilizzabile: consenso dato all'informativa corrente. */
export function aiTsAttiva(p: ParametriTs): boolean {
  return p.ai.abilitata && p.ai.versioneInformativa === VERSIONE_INFORMATIVA_TS;
}

// ── Uso dell'AI (contatori per giorno) ──────────────────────────

export interface UsoAi { interpretazioni: number; secondiAudio: number }

export async function usoAiOggi(db: D1Database, tenantId: string, utenteId: string, giorno: string): Promise<UsoAi> {
  const r = await db.prepare('SELECT interpretazioni, secondi_audio FROM ts_uso_ai WHERE tenant_id = ? AND utente_id = ? AND giorno = ?').bind(tenantId, utenteId, giorno).first<any>();
  return { interpretazioni: Number(r?.interpretazioni ?? 0), secondiAudio: Number(r?.secondi_audio ?? 0) };
}

export async function contaUsoAi(db: D1Database, tenantId: string, utenteId: string, giorno: string, d: { interpretazioni?: number; secondiAudio?: number }): Promise<void> {
  await db.prepare(
    `INSERT INTO ts_uso_ai (tenant_id, utente_id, giorno, interpretazioni, secondi_audio) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, utente_id, giorno) DO UPDATE SET interpretazioni = interpretazioni + excluded.interpretazioni, secondi_audio = secondi_audio + excluded.secondi_audio`,
  ).bind(tenantId, utenteId, giorno, d.interpretazioni ?? 0, d.secondiAudio ?? 0).run();
}
