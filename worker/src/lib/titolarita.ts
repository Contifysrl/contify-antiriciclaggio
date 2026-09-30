/**
 * REGISTRAZIONE DEI TITOLARI EFFETTIVI — fuori dalla rotta (AR-M19).
 *
 * Serve al modulo della titolarità (M5), alla conferma della proposta da
 * visura (M17) e all'«Applica tutto» della coda di revisione (M19). La
 * fotografia è storicizzata: la precedente si chiude, non si sovrascrive
 * (art. 32 co. 2 lett. d). Se nasce da una proposta del programma, la
 * proposta si chiude con l'esito: è ciò che in ispezione dimostra la
 * valutazione del professionista.
 */

import type { Env, Utente } from './tipi';
import { cifra, nuovoId } from './crypto';
import { scriviAudit } from './audit';
import { titolarePersonaFisica } from '../domain/titolare-effettivo';

const oggi = () => new Date().toISOString().slice(0, 10);

export async function registraTitolari(
  env: Env, tenantId: string, u: Utente, ip: string | null | undefined, clienteId: string, b: any,
): Promise<{ ok: true; propostaEsito: string | null } | { errore: string }> {
  if (!Array.isArray(b.titolari) || b.titolari.length === 0) {
    return { errore: 'Indicare almeno un titolare effettivo, oppure documentare l’impossibilità e valutare l’astensione ex art. 42.' };
  }
  const adesso = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [
    env.DB.prepare('UPDATE titolari_effettivi SET valido_al = ? WHERE cliente_id = ? AND tenant_id = ? AND valido_al IS NULL').bind(oggi(), clienteId, tenantId),
  ];
  for (const t of b.titolari) {
    if (t.criterio === 'RESIDUALE_POTERI' && !t.motivazione) {
      return { errore: 'Il criterio residuale dell’art. 20 co. 5 richiede la motivazione scritta prevista dall’art. 20 co. 6.' };
    }
    stmts.push(
      env.DB.prepare(
        `INSERT INTO titolari_effettivi (id, tenant_id, cliente_id, nominativo, codice_fiscale, criterio, norma, quota,
          percorsi, motivazione, pep, registro_consultato, registro_data, registro_incongruenza, registro_note, valido_dal, creato_da)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        nuovoId('te'), tenantId, clienteId, t.nominativo, t.codiceFiscale ?? null, t.criterio, t.norma,
        t.quota ?? null, JSON.stringify(t.percorsi ?? []), t.motivazione ?? '', t.pep ? 1 : 0,
        b.registroConsultato ? 1 : 0, b.registroData ?? null, b.registroIncongruenza ? 1 : 0, b.registroNote ?? null,
        oggi(), u.id,
      ),
    );
  }
  await env.DB.batch(stmts);

  let propostaEsito: string | null = null;
  if (typeof b.propostaId === 'string' && b.propostaId) {
    propostaEsito = b.propostaModificata ? 'MODIFICATA' : 'APPLICATA';
    const esito = JSON.stringify(await cifra(env.MASTER_KEY, tenantId, JSON.stringify({
      motivazione: b.propostaMotivazione ?? null, titolariRegistrati: b.titolari.map((t: any) => ({ nominativo: t.nominativo, criterio: t.criterio, quota: t.quota ?? null })),
      // AR-M21 (AI-02): la motivazione co. 6 riscritta dall'AI e firmata dal professionista.
      provenienzaMotivazione: b.provenienzaMotivazione === 'AI_PROFESSIONISTA' ? 'AI_PROFESSIONISTA' : 'PROFESSIONISTA',
    })));
    await env.DB.prepare(
      "UPDATE proposte SET stato = ?, esito = ?, rivista_da = ?, rivista_il = datetime('now') WHERE id = ? AND tenant_id = ? AND cliente_id = ? AND stato = 'PROPOSTA'",
    ).bind(propostaEsito, esito, u.id, b.propostaId, tenantId, clienteId).run();
  }
  await scriviAudit(env.DB, {
    tenantId, utenteId: u.id, azione: 'AGGIORNA_TITOLARITA', entita: 'clienti', entitaId: clienteId,
    dettaglio: { numeroTitolari: b.titolari.length, adesso, propostaId: b.propostaId ?? null, propostaEsito }, ip,
  });
  return { ok: true, propostaEsito };
}

const CF_PF = /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/;

/** Dai titolari proposti dal motore (analisi art. 20) al corpo accettato da `registraTitolari`. */
export function titolariDaProposta(titolari: any[]): any[] {
  return (titolari ?? []).map((t) => ({
    nominativo: t.denominazione, codiceFiscale: CF_PF.test(String(t.id ?? '')) ? t.id : null,
    criterio: t.criterio, norma: t.norma, quota: t.quotaEffettiva != null ? Math.round(t.quotaEffettiva * 10000) / 100 : null,
    pep: false, motivazione: t.motivazione ?? '', percorsi: t.percorsi ?? [],
  }));
}

/**
 * AR-M23 (richiesta di Barbara): il cliente persona fisica che agisce in
 * proprio non ha un titolare effettivo diverso da sé (art. 1 co. 2 lett. pp).
 * Alla creazione del cliente e all'apertura del fascicolo il programma
 * registra da solo la fotografia «coincide con il cliente», così la sezione
 * non resta vuota e la dichiarazione mod. AV.4 esce con l'opzione 1.
 *
 * Non tocca nulla se: il cliente non è persona fisica; esiste già una
 * fotografia vigente (il professionista può aver registrato un terzo per cui
 * il cliente agisce). Restituisce true se ha registrato.
 */
export async function assicuraTitolaritaPersonaFisica(
  env: Env, tenantId: string, u: Utente, ip: string | null | undefined,
  cliente: { id: string; tipo: string; denominazione: string; codice_fiscale?: string | null },
): Promise<boolean> {
  if (cliente.tipo !== 'PERSONA_FISICA') return false;
  const vigenti = await env.DB.prepare('SELECT COUNT(*) AS n FROM titolari_effettivi WHERE cliente_id = ? AND tenant_id = ? AND valido_al IS NULL')
    .bind(cliente.id, tenantId).first<{ n: number }>();
  if ((vigenti?.n ?? 0) > 0) return false;
  const t = titolarePersonaFisica(cliente);
  await env.DB.prepare(
    `INSERT INTO titolari_effettivi (id, tenant_id, cliente_id, nominativo, codice_fiscale, criterio, norma, quota,
      percorsi, motivazione, pep, valido_dal, creato_da)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    nuovoId('te'), tenantId, cliente.id, t.denominazione, cliente.codice_fiscale ?? null, t.criterio, t.norma, null,
    '[]', t.motivazione, 0, oggi(), u.id,
  ).run();
  await scriviAudit(env.DB, {
    tenantId, utenteId: u.id, azione: 'AGGIORNA_TITOLARITA', entita: 'clienti', entitaId: cliente.id,
    dettaglio: { numeroTitolari: 1, automatica: true, criterio: t.criterio }, ip,
  });
  return true;
}

/**
 * Se il cliente smette di essere una persona fisica (correzione della natura
 * giuridica), la fotografia automatica «coincide con il cliente» si chiude:
 * per una società i titolari effettivi vanno individuati ex art. 20.
 */
export async function chiudiTitolaritaPersonaFisica(env: Env, tenantId: string, clienteId: string): Promise<number> {
  const r = await env.DB.prepare(
    "UPDATE titolari_effettivi SET valido_al = ? WHERE cliente_id = ? AND tenant_id = ? AND valido_al IS NULL AND criterio = 'CLIENTE_PERSONA_FISICA'",
  ).bind(oggi(), clienteId, tenantId).run();
  return r.meta.changes ?? 0;
}
