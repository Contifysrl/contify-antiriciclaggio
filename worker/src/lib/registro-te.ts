/**
 * REGISTRO DEI TITOLARI EFFETTIVI (AR-M20-03)
 * D.Lgs. 10.6.2026 n. 122 → art. 21-ter DLgs. 231/2007 (in vigore dal 23.7.2026).
 *
 * Il portale delle Camere di commercio non espone API: il professionista
 * accreditato consulta il registro e qui REGISTRA la consultazione, con:
 *  - esito: CORRISPONDE (i titolari registrati coincidono), DIFFORME
 *    (incongruenza da segnalare, co. 7), NON_ISCRITTO (il cliente non ha
 *    comunicato il titolare effettivo: è un'incongruenza a sua volta),
 *    NON_CONSULTABILE (accesso escluso per dichiarazione del titolare,
 *    art. 21-sexies, o portale non operativo);
 *  - la prova dell'iscrizione o l'estratto (co. 12) come documento del
 *    cliente, tipo ESTRATTO_REGISTRO_TE;
 *  - la segnalazione alla Camera di commercio (data, riferimento, note).
 *
 * La consultazione non esonera dall'adeguata verifica (co. 11): non tocca i
 * titolari registrati, li confronta. I campi registro_* di
 * titolari_effettivi (AR-M8) restano aggiornati dall'ultima consultazione,
 * così le pagine e i verbali che li leggono continuano a funzionare.
 */

import type { Env } from './tipi';
import { cifra, decifra, nuovoId } from './crypto';
import { scriviAudit } from './audit';

export type EsitoConsultazione = 'CORRISPONDE' | 'DIFFORME' | 'NON_ISCRITTO' | 'NON_CONSULTABILE';
export const ESITI_CONSULTAZIONE: EsitoConsultazione[] = ['CORRISPONDE', 'DIFFORME', 'NON_ISCRITTO', 'NON_CONSULTABILE'];
/** Esiti che costituiscono un'incongruenza da segnalare (co. 7). */
export const ESITI_DA_SEGNALARE: ReadonlySet<EsitoConsultazione> = new Set(['DIFFORME', 'NON_ISCRITTO']);

export const TIPO_DOCUMENTO_PROVA = 'ESTRATTO_REGISTRO_TE';

const oggi = () => new Date().toISOString().slice(0, 10);
const dataValida = (d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

async function cifraTesto(env: Env, tenantId: string, v: string | null): Promise<string | null> {
  return v ? JSON.stringify(await cifra(env.MASTER_KEY, tenantId, v)) : null;
}
async function decifraTesto(env: Env, tenantId: string, v: string | null): Promise<string | null> {
  if (!v) return null;
  try { return await decifra(env.MASTER_KEY, tenantId, JSON.parse(v)); } catch { return null; }
}

export interface ConsultazioneLetta {
  id: string;
  fascicoloId: string | null;
  dataConsultazione: string;
  esito: EsitoConsultazione;
  titolariConfrontati: number;
  difformita: string | null;
  documentoId: string | null;
  documentoNome: string | null;
  segnalazione: { data: string; riferimento: string | null; note: string | null; da: string | null } | null;
  eseguitoDa: string | null;
  creatoIl: string;
  /** Vero se l'esito è un'incongruenza non ancora segnalata. */
  daSegnalare: boolean;
}

export async function leggiConsultazioni(env: Env, tenantId: string, clienteId: string): Promise<ConsultazioneLetta[]> {
  const { results } = await env.DB.prepare(
    `SELECT k.*, u.nome AS eseguito_da_nome, s.nome AS segnalazione_da_nome, d.nome_file AS documento_nome
     FROM consultazioni_registro_te k
     LEFT JOIN utenti u ON u.id = k.eseguito_da
     LEFT JOIN utenti s ON s.id = k.segnalazione_da
     LEFT JOIN documenti d ON d.id = k.documento_id
     WHERE k.tenant_id = ? AND k.cliente_id = ?
     ORDER BY k.data_consultazione DESC, k.creato_il DESC LIMIT 100`,
  ).bind(tenantId, clienteId).all<any>();
  const out: ConsultazioneLetta[] = [];
  for (const r of results ?? []) {
    out.push({
      id: r.id, fascicoloId: r.fascicolo_id ?? null, dataConsultazione: r.data_consultazione, esito: r.esito,
      titolariConfrontati: Number(r.titolari_confrontati ?? 0),
      difformita: await decifraTesto(env, tenantId, r.difformita),
      documentoId: r.documento_id ?? null, documentoNome: r.documento_nome ?? null,
      segnalazione: r.segnalazione_data
        ? { data: r.segnalazione_data, riferimento: r.segnalazione_riferimento ?? null, note: await decifraTesto(env, tenantId, r.segnalazione_note), da: r.segnalazione_da_nome ?? null }
        : null,
      eseguitoDa: r.eseguito_da_nome ?? null, creatoIl: r.creato_il,
      daSegnalare: ESITI_DA_SEGNALARE.has(r.esito) && !r.segnalazione_data,
    });
  }
  return out;
}

export interface Errore { errore: string; stato: 400 | 404 }

export async function registraConsultazione(
  env: Env, tenantId: string, utenteId: string, ip: string | null | undefined, clienteId: string,
  b: { data?: unknown; esito?: unknown; difformita?: unknown; documentoId?: unknown; fascicoloId?: unknown; note?: unknown },
): Promise<ConsultazioneLetta | Errore> {
  const cliente = await env.DB.prepare('SELECT id, tipo FROM clienti WHERE id = ? AND tenant_id = ?').bind(clienteId, tenantId).first<any>();
  if (!cliente) return { errore: 'Cliente non trovato', stato: 404 };
  const data = String(b.data ?? oggi()).slice(0, 10);
  if (!dataValida(data)) return { errore: 'La data della consultazione va indicata come AAAA-MM-GG', stato: 400 };
  if (data > oggi()) return { errore: 'La data della consultazione non può essere futura.', stato: 400 };
  const esito = String(b.esito ?? '') as EsitoConsultazione;
  if (!ESITI_CONSULTAZIONE.includes(esito)) {
    return { errore: 'Esito non valido: CORRISPONDE, DIFFORME, NON_ISCRITTO o NON_CONSULTABILE.', stato: 400 };
  }
  const difformita = String(b.difformita ?? b.note ?? '').trim().slice(0, 4000) || null;
  if (ESITI_DA_SEGNALARE.has(esito) && !difformita) {
    return { errore: esito === 'DIFFORME'
      ? 'Descrivi la difformità fra il registro e i titolari accertati: è il contenuto della segnalazione alla Camera di commercio (art. 21-ter co. 7).'
      : 'Indica cosa risulta dal registro (nessuna comunicazione del titolare effettivo, iscrizione scaduta…): è il contenuto della segnalazione.', stato: 400 };
  }
  if (esito === 'NON_CONSULTABILE' && !difformita) {
    return { errore: 'Indica perché il registro non era consultabile (esclusione ex art. 21-sexies, portale non operativo, accreditamento mancante).', stato: 400 };
  }
  let documentoId: string | null = null;
  if (b.documentoId) {
    const d = await env.DB.prepare('SELECT id FROM documenti WHERE id = ? AND tenant_id = ? AND cliente_id = ?').bind(String(b.documentoId), tenantId, clienteId).first<any>();
    if (!d) return { errore: 'Il documento indicato come prova non è fra i documenti del cliente.', stato: 400 };
    documentoId = d.id;
  }
  let fascicoloId: string | null = null;
  if (b.fascicoloId) {
    const f = await env.DB.prepare('SELECT id FROM fascicoli WHERE id = ? AND tenant_id = ? AND cliente_id = ?').bind(String(b.fascicoloId), tenantId, clienteId).first<any>();
    fascicoloId = f?.id ?? null;
  }
  const titolari = await env.DB.prepare('SELECT COUNT(*) AS n FROM titolari_effettivi WHERE tenant_id = ? AND cliente_id = ? AND valido_al IS NULL').bind(tenantId, clienteId).first<any>();

  const id = nuovoId('rte');
  const incongruenza = ESITI_DA_SEGNALARE.has(esito);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO consultazioni_registro_te (id, tenant_id, cliente_id, fascicolo_id, data_consultazione, esito, titolari_confrontati, difformita, documento_id, eseguito_da)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).bind(id, tenantId, clienteId, fascicoloId, data, esito, Number(titolari?.n ?? 0), await cifraTesto(env, tenantId, difformita), documentoId, utenteId),
    // Compatibilità AR-M8: la fotografia corrente porta l'ultimo riscontro (senza note in chiaro).
    env.DB.prepare(
      `UPDATE titolari_effettivi SET registro_consultato = ?, registro_data = ?, registro_incongruenza = ?, registro_note = NULL
       WHERE cliente_id = ? AND tenant_id = ? AND valido_al IS NULL`,
    ).bind(esito === 'NON_CONSULTABILE' ? 0 : 1, data, incongruenza ? 1 : 0, clienteId, tenantId),
  ]);
  await scriviAudit(env.DB, {
    tenantId, utenteId, azione: 'CONSULTAZIONE_REGISTRO_TE', entita: 'clienti', entitaId: clienteId,
    dettaglio: { consultazioneId: id, data, esito, titolari: Number(titolari?.n ?? 0), prova: Boolean(documentoId) }, ip,
  });
  const lette = await leggiConsultazioni(env, tenantId, clienteId);
  return lette.find((x) => x.id === id)!;
}

export async function registraSegnalazione(
  env: Env, tenantId: string, utenteId: string, ip: string | null | undefined, consultazioneId: string,
  b: { data?: unknown; riferimento?: unknown; note?: unknown },
): Promise<ConsultazioneLetta | Errore> {
  const k = await env.DB.prepare('SELECT id, cliente_id, esito, segnalazione_data, data_consultazione FROM consultazioni_registro_te WHERE id = ? AND tenant_id = ?')
    .bind(consultazioneId, tenantId).first<any>();
  if (!k) return { errore: 'Consultazione non trovata', stato: 404 };
  if (!ESITI_DA_SEGNALARE.has(k.esito)) return { errore: 'Questa consultazione non ha rilevato incongruenze: non c’è nulla da segnalare.', stato: 400 };
  if (k.segnalazione_data) return { errore: 'La segnalazione è già registrata.', stato: 400 };
  const data = String(b.data ?? oggi()).slice(0, 10);
  if (!dataValida(data)) return { errore: 'La data della segnalazione va indicata come AAAA-MM-GG', stato: 400 };
  if (data > oggi()) return { errore: 'La data della segnalazione non può essere futura.', stato: 400 };
  if (data < String(k.data_consultazione).slice(0, 10)) return { errore: 'La segnalazione non può precedere la consultazione.', stato: 400 };
  const riferimento = String(b.riferimento ?? '').trim().slice(0, 200) || null;
  const note = String(b.note ?? '').trim().slice(0, 2000) || null;
  await env.DB.prepare(
    'UPDATE consultazioni_registro_te SET segnalazione_data = ?, segnalazione_riferimento = ?, segnalazione_note = ?, segnalazione_da = ? WHERE id = ? AND tenant_id = ?',
  ).bind(data, riferimento, await cifraTesto(env, tenantId, note), utenteId, consultazioneId, tenantId).run();
  await scriviAudit(env.DB, {
    tenantId, utenteId, azione: 'SEGNALAZIONE_DIFFORMITA_TE', entita: 'clienti', entitaId: k.cliente_id,
    dettaglio: { consultazioneId, data, riferimento: Boolean(riferimento) }, ip,
  });
  const lette = await leggiConsultazioni(env, tenantId, k.cliente_id);
  return lette.find((x) => x.id === consultazioneId)!;
}

/** Aggancia (o sostituisce) la prova dell'iscrizione a una consultazione. */
export async function agganciaProva(
  env: Env, tenantId: string, utenteId: string, ip: string | null | undefined, consultazioneId: string, documentoId: string,
): Promise<ConsultazioneLetta | Errore> {
  const k = await env.DB.prepare('SELECT id, cliente_id FROM consultazioni_registro_te WHERE id = ? AND tenant_id = ?').bind(consultazioneId, tenantId).first<any>();
  if (!k) return { errore: 'Consultazione non trovata', stato: 404 };
  const d = await env.DB.prepare('SELECT id FROM documenti WHERE id = ? AND tenant_id = ? AND cliente_id = ?').bind(documentoId, tenantId, k.cliente_id).first<any>();
  if (!d) return { errore: 'Il documento non è fra i documenti del cliente.', stato: 400 };
  await env.DB.prepare('UPDATE consultazioni_registro_te SET documento_id = ? WHERE id = ? AND tenant_id = ?').bind(documentoId, consultazioneId, tenantId).run();
  await scriviAudit(env.DB, { tenantId, utenteId, azione: 'PROVA_REGISTRO_TE', entita: 'clienti', entitaId: k.cliente_id, dettaglio: { consultazioneId, documentoId }, ip });
  const lette = await leggiConsultazioni(env, tenantId, k.cliente_id);
  return lette.find((x) => x.id === consultazioneId)!;
}

/** Riepilogo per cliente: ultima consultazione e incongruenze aperte (per alert A13 e completezza). */
export interface StatoRegistroCliente {
  ultima: { id: string; data: string; esito: EsitoConsultazione; prova: boolean } | null;
  daSegnalare: Array<{ id: string; data: string; esito: EsitoConsultazione }>;
}

export async function statoRegistroClienti(env: Env, tenantId: string): Promise<Map<string, StatoRegistroCliente>> {
  const { results } = await env.DB.prepare(
    `SELECT id, cliente_id, data_consultazione, esito, documento_id, segnalazione_data
     FROM consultazioni_registro_te WHERE tenant_id = ? ORDER BY data_consultazione DESC, creato_il DESC`,
  ).bind(tenantId).all<any>();
  const m = new Map<string, StatoRegistroCliente>();
  for (const r of results ?? []) {
    const s = m.get(r.cliente_id) ?? { ultima: null, daSegnalare: [] };
    if (!s.ultima) s.ultima = { id: r.id, data: r.data_consultazione, esito: r.esito, prova: Boolean(r.documento_id) };
    if (ESITI_DA_SEGNALARE.has(r.esito) && !r.segnalazione_data) s.daSegnalare.push({ id: r.id, data: r.data_consultazione, esito: r.esito });
    m.set(r.cliente_id, s);
  }
  return m;
}

export async function statoRegistroCliente(env: Env, tenantId: string, clienteId: string): Promise<StatoRegistroCliente> {
  const { results } = await env.DB.prepare(
    `SELECT id, data_consultazione, esito, documento_id, segnalazione_data
     FROM consultazioni_registro_te WHERE tenant_id = ? AND cliente_id = ? ORDER BY data_consultazione DESC, creato_il DESC`,
  ).bind(tenantId, clienteId).all<any>();
  const s: StatoRegistroCliente = { ultima: null, daSegnalare: [] };
  for (const r of results ?? []) {
    if (!s.ultima) s.ultima = { id: r.id, data: r.data_consultazione, esito: r.esito, prova: Boolean(r.documento_id) };
    if (ESITI_DA_SEGNALARE.has(r.esito) && !r.segnalazione_data) s.daSegnalare.push({ id: r.id, data: r.data_consultazione, esito: r.esito });
  }
  return s;
}
