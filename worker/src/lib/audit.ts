/**
 * REGISTRO DEGLI ACCESSI E DELLE OPERAZIONI
 *
 * L'art. 32 co. 2 del DLgs. 231/2007 chiede che il sistema di conservazione
 * indichi esplicitamente i soggetti legittimati ad alimentarlo e ad accedervi,
 * e assicuri integrità e non alterabilità dei dati.
 *
 * Qui l'integrità è dimostrabile, non solo dichiarata: ogni riga contiene
 * l'hash della riga precedente dello stesso tenant. Rimuovere o modificare una
 * riga rompe la catena e la verifica lo rileva. È lo stesso principio di una
 * blockchain, senza nulla della sua complessità: serve solo l'append-only, che
 * i trigger SQL già garantiscono a livello di database.
 */

import { sha256Hex } from './crypto';

export interface VoceAudit {
  tenantId: string;
  utenteId?: string | null;
  azione: string;
  entita?: string | null;
  entitaId?: string | null;
  dettaglio?: unknown;
  ip?: string | null;
}

export async function scriviAudit(db: D1Database, v: VoceAudit): Promise<void> {
  const precedente = await db
    .prepare('SELECT hash_riga FROM audit_log WHERE tenant_id = ? ORDER BY id DESC LIMIT 1')
    .bind(v.tenantId)
    .first<{ hash_riga: string }>();

  const hashPrecedente = precedente?.hash_riga ?? 'GENESI';
  const creatoIl = new Date().toISOString();
  const dettaglio = v.dettaglio === undefined ? null : JSON.stringify(v.dettaglio);

  const payload = [
    hashPrecedente,
    v.tenantId,
    v.utenteId ?? '',
    v.azione,
    v.entita ?? '',
    v.entitaId ?? '',
    dettaglio ?? '',
    creatoIl,
  ].join('|');

  const hashRiga = await sha256Hex(payload);

  await db
    .prepare(
      `INSERT INTO audit_log (tenant_id, utente_id, azione, entita, entita_id, dettaglio, ip, hash_precedente, hash_riga, creato_il)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      v.tenantId,
      v.utenteId ?? null,
      v.azione,
      v.entita ?? null,
      v.entitaId ?? null,
      dettaglio,
      v.ip ?? null,
      hashPrecedente,
      hashRiga,
      creatoIl,
    )
    .run();
}

export interface EsitoVerificaCatena {
  integra: boolean;
  righeVerificate: number;
  primaRigaCorrotta?: number;
  messaggio: string;
}

/**
 * Ricalcola la catena e la confronta con quanto memorizzato.
 * Da esporre al professionista: in sede ispettiva è la prova che il registro
 * non è stato ritoccato.
 */
export async function verificaCatenaAudit(db: D1Database, tenantId: string): Promise<EsitoVerificaCatena> {
  const { results } = await db
    .prepare(
      `SELECT id, utente_id, azione, entita, entita_id, dettaglio, hash_precedente, hash_riga, creato_il
       FROM audit_log WHERE tenant_id = ? ORDER BY id ASC`,
    )
    .bind(tenantId)
    .all<{
      id: number;
      utente_id: string | null;
      azione: string;
      entita: string | null;
      entita_id: string | null;
      dettaglio: string | null;
      hash_precedente: string;
      hash_riga: string;
      creato_il: string;
    }>();

  let atteso = 'GENESI';
  for (const r of results ?? []) {
    if (r.hash_precedente !== atteso) {
      return {
        integra: false,
        righeVerificate: results!.indexOf(r),
        primaRigaCorrotta: r.id,
        messaggio: `Catena interrotta alla riga ${r.id}: hash precedente atteso ${atteso}, trovato ${r.hash_precedente}. Una voce è stata rimossa o alterata.`,
      };
    }
    const payload = [
      r.hash_precedente,
      tenantId,
      r.utente_id ?? '',
      r.azione,
      r.entita ?? '',
      r.entita_id ?? '',
      r.dettaglio ?? '',
      r.creato_il,
    ].join('|');
    const ricalcolato = await sha256Hex(payload);
    if (ricalcolato !== r.hash_riga) {
      return {
        integra: false,
        righeVerificate: results!.indexOf(r),
        primaRigaCorrotta: r.id,
        messaggio: `Contenuto della riga ${r.id} alterato: l'hash ricalcolato non corrisponde a quello memorizzato.`,
      };
    }
    atteso = r.hash_riga;
  }

  return {
    integra: true,
    righeVerificate: results?.length ?? 0,
    messaggio: `Catena integra su ${results?.length ?? 0} voci. Nessuna alterazione rilevata.`,
  };
}
