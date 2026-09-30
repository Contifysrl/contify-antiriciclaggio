/**
 * ARCHIVIO DOCUMENTI DEL CLIENTE (AR-M23)
 *
 * Richiesta di Barbara: «una volta caricato un documento non c'è più la
 * possibilità di aprirlo; tutti i documenti (documento d'identità, visura,
 * incarico…) dovrebbero essere archiviati insieme».
 *
 * Fino a M22 i documenti vivevano in due liste separate: quelli «del cliente»
 * (visure, caricati dalla scheda) e quelli «del fascicolo» (acquisiti dalla
 * verifica a distanza, dichiarazioni AV.4). Chi cercava la carta d'identità
 * nel fascicolo non la trovava se era stata caricata dalla scheda cliente, e
 * viceversa. Qui c'è UNA lettura: tutti i documenti riferibili al cliente,
 * con l'indicazione del fascicolo da cui provengono.
 *
 * L'acquisizione è unica per entrambe le rotte (scheda cliente e fascicolo):
 * nome del file ripulito, impronta SHA-256, nessun doppione a parità di
 * contenuto, `cliente_id` sempre valorizzato anche quando il documento nasce
 * nel fascicolo — così l'archivio del cliente è completo per costruzione.
 */

import type { Env, Utente } from './tipi';
import { nuovoId, sha256Hex } from './crypto';
import { scriviAudit } from './audit';
import { TERMINI, aggiungiAnni } from '../domain/norme';

const oggi = () => new Date().toISOString().slice(0, 10);

/** Etichette in italiano dei tipi di documento (per liste e verbali). */
export const ETICHETTE_DOCUMENTO: Record<string, string> = {
  DOCUMENTO_IDENTITA: 'Documento d’identità',
  VISURA: 'Visura camerale',
  DICHIARAZIONE_ART22: 'Dichiarazione del cliente (mod. AV.4)',
  AUTOCERTIFICAZIONE_TE: 'Autocertificazione del titolare effettivo',
  ESTRATTO_REGISTRO_TE: 'Estratto del registro dei titolari effettivi',
  DOCUMENTAZIONE_ESTERA: 'Documentazione estera equivalente',
  MANDATO_FIDUCIARIO: 'Mandato fiduciario',
  ATTO_TRUST: 'Atto istitutivo del trust',
  PROCURA: 'Procura',
  INCARICO: 'Lettera d’incarico',
  ALTRO: 'Altro documento',
};

export function etichettaDocumento(tipo: string): string {
  return ETICHETTE_DOCUMENTO[tipo] ?? tipo.replace(/_/g, ' ').toLowerCase();
}

export interface DocumentoElenco {
  id: string;
  tipo: string;
  etichetta: string;
  nome_file: string;
  mime: string;
  dimensione: number;
  sha256: string;
  data_riferimento: string;
  data_acquisizione: string;
  conserva_fino_al: string | null;
  fascicolo_id: string | null;
  fascicolo_codice: string | null;
  cliente_id: string | null;
  acquisito_da: string | null;
}

/**
 * Tutti i documenti riferibili al cliente: agganciati direttamente
 * (`cliente_id`) oppure a uno dei suoi fascicoli. Ordine: più recenti prima.
 */
export async function documentiDelCliente(db: D1Database, tenantId: string, clienteId: string): Promise<DocumentoElenco[]> {
  const { results } = await db.prepare(
    `SELECT d.id, d.tipo, d.nome_file, d.mime, d.dimensione, d.sha256, d.data_riferimento, d.data_acquisizione, d.conserva_fino_al,
            d.fascicolo_id, d.cliente_id, f.codice AS fascicolo_codice, u.nome AS acquisito_da
     FROM documenti d
     LEFT JOIN fascicoli f ON f.id = d.fascicolo_id
     LEFT JOIN utenti u ON u.id = d.creato_da
     WHERE d.tenant_id = ? AND (d.cliente_id = ?2 OR f.cliente_id = ?2)
     ORDER BY d.data_acquisizione DESC, d.creato_il DESC`,
  ).bind(tenantId, clienteId).all<any>();
  return (results ?? []).map((r) => ({ ...r, etichetta: etichettaDocumento(String(r.tipo)) }));
}

/** Nome file sicuro per header e chiavi R2 (accenti latini ammessi, apici e simboli no). */
export function nomeFileSicuro(nome: string, predefinito = 'documento'): string {
  const pulito = String(nome ?? '').replace(/[^\w.\- àèéìòùÀÈÉÌÒÙ()]/g, '_').replace(/_{2,}/g, '_').trim().slice(0, 120);
  return pulito || predefinito;
}

/**
 * Header Content-Disposition robusto: il nome ASCII per i client vecchi e la
 * forma RFC 5987 per quello vero. Un nome con caratteri fuori Latin-1 nel
 * vecchio header faceva fallire la risposta (TypeError sull'header) e il
 * documento «non si apriva».
 */
export function contentDisposition(tipo: 'inline' | 'attachment', nome: string): string {
  // Fallback ASCII leggibile (à → a) per i client che ignorano filename*.
  const ascii = String(nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(String(nome))}`;
}

export const MAX_DOCUMENTO_BYTES = 20 * 1024 * 1024;

export interface AcquisizioneDocumento {
  clienteId: string;
  /** Presente quando il documento nasce nel fascicolo. */
  fascicoloId?: string | null;
  file: File;
  tipo: string;
  dataRiferimento?: string | null;
}

export type EsitoAcquisizione =
  | { id: string; sha256: string; conservaFinoAl: string | null; giaPresente: boolean }
  | { errore: string; stato: 400 | 404 | 413 };

/**
 * Acquisizione unica per scheda cliente e fascicolo. La conservazione
 * decennale decorre dalla cessazione del rapporto: agganciato a un fascicolo
 * cessato il termine è già noto, altrimenti resta NULL finché il rapporto è
 * in essere.
 */
export async function acquisisciDocumento(env: Env, tenantId: string, u: Utente, ip: string | null | undefined, a: AcquisizioneDocumento): Promise<EsitoAcquisizione> {
  if (a.file.size > MAX_DOCUMENTO_BYTES) return { errore: 'File troppo grande (massimo 20 MB).', stato: 413 };
  const cliente = await env.DB.prepare('SELECT id FROM clienti WHERE id = ? AND tenant_id = ?').bind(a.clienteId, tenantId).first<any>();
  if (!cliente) return { errore: 'Cliente non trovato', stato: 404 };
  let conservaFinoAl: string | null = null;
  if (a.fascicoloId) {
    const f = await env.DB.prepare('SELECT id, cliente_id, data_cessazione FROM fascicoli WHERE id = ? AND tenant_id = ?').bind(a.fascicoloId, tenantId).first<any>();
    if (!f) return { errore: 'Fascicolo non trovato', stato: 404 };
    if (f.cliente_id !== a.clienteId) return { errore: 'Il fascicolo non appartiene a questo cliente', stato: 400 };
    conservaFinoAl = f.data_cessazione ? aggiungiAnni(f.data_cessazione, TERMINI.CONSERVAZIONE_ANNI.valore) : null;
  }

  const buf = await a.file.arrayBuffer();
  const sha = await sha256Hex(buf);
  const tipo = String(a.tipo || 'ALTRO').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 40) || 'ALTRO';
  // Lo stesso file caricato due volte per lo stesso cliente non si duplica.
  const esistente = await env.DB.prepare(
    `SELECT d.id, d.conserva_fino_al FROM documenti d LEFT JOIN fascicoli f ON f.id = d.fascicolo_id
     WHERE d.tenant_id = ? AND (d.cliente_id = ?2 OR f.cliente_id = ?2) AND d.sha256 = ?3`,
  ).bind(tenantId, a.clienteId, sha).first<any>();
  if (esistente) return { id: esistente.id, sha256: sha, conservaFinoAl: esistente.conserva_fino_al ?? null, giaPresente: true };

  const id = nuovoId('doc');
  const nome = nomeFileSicuro(a.file.name, tipo === 'VISURA' ? 'visura.pdf' : 'documento.pdf');
  const mime = a.file.type || 'application/octet-stream';
  const r2Key = a.fascicoloId ? `${tenantId}/${a.fascicoloId}/${id}-${nome}` : `${tenantId}/cliente/${a.clienteId}/${id}-${nome}`;
  await env.DOCS.put(r2Key, buf, { httpMetadata: { contentType: mime } });
  const dataRif = String(a.dataRiferimento ?? '');
  await env.DB.prepare(
    `INSERT INTO documenti (id, tenant_id, fascicolo_id, cliente_id, tipo, nome_file, mime, dimensione, r2_key, sha256,
      data_riferimento, data_acquisizione, conserva_fino_al, creato_da)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    id, tenantId, a.fascicoloId ?? null, a.clienteId, tipo, nome, mime, buf.byteLength, r2Key, sha,
    /^\d{4}-\d{2}-\d{2}$/.test(dataRif) ? dataRif : oggi(), oggi(), conservaFinoAl, u.id,
  ).run();
  await scriviAudit(env.DB, {
    tenantId, utenteId: u.id, azione: 'ACQUISISCI_DOCUMENTO', entita: 'documenti', entitaId: id,
    dettaglio: { sha256: sha, clienteId: a.clienteId, fascicoloId: a.fascicoloId ?? null, tipo }, ip,
  });
  return { id, sha256: sha, conservaFinoAl, giaPresente: false };
}
