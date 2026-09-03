/**
 * ANAGRAFICHE DA VISURA (AR-M17) — la logica fuori dalle rotte (AR-M19).
 *
 * Le stesse operazioni servono a due ingressi: il flusso «una visura alla
 * volta» del modal (M17) e la coda di revisione con caricamento in blocco
 * (M19). Qui vivono come funzioni pure di applicazione: ricevono ambiente,
 * tenant, utente e corpo già rivisto, restituiscono l'esito o un errore con
 * lo stato HTTP. Le rotte restano sottili.
 */

import type { Env, Utente } from './tipi';
import { cifra, decifra, nuovoId } from './crypto';
import { scriviAudit } from './audit';
import { normalizzaPiva } from './lookup/piva';
import { proponiRivalutazioni, propostaTitolarita, registraProposta, salvaCompagine, screeningCompagine, type CaricaIn, type SocioIn } from './compagine';

export const TIPI_CLIENTE = ['PERSONA_FISICA', 'SOCIETA_CAPITALI', 'SOCIETA_PERSONE', 'ENTE_NON_PROFIT', 'TRUST', 'ALTRO'];

const oggi = () => new Date().toISOString().slice(0, 10);

export interface Errore { errore: string; stato: 400 | 404 | 409; codice?: string; clienteId?: string; denominazione?: string; attivo?: boolean }

export async function risolviProfessionista(
  db: D1Database, tenantId: string, indicato: unknown, utente: any,
): Promise<{ id: string } | { errore: string }> {
  const id = indicato === undefined || indicato === null || indicato === '' ? null : String(indicato);
  if (!id) {
    if (utente.ruolo === 'TITOLARE') return { id: utente.id };
    return { errore: 'Indicare il professionista incaricato: chi inserisce non firma.' };
  }
  const r = await db.prepare(
    "SELECT id FROM utenti WHERE id = ? AND tenant_id = ? AND ruolo = 'TITOLARE' AND attivo = 1",
  ).bind(id, tenantId).first<any>();
  if (!r) return { errore: 'Il professionista indicato non esiste, non è attivo o non appartiene allo studio.' };
  return { id: String(r.id) };
}

/** Campi dell'anagrafica accettati dal flusso «da visura» (stessi di POST/PATCH /clienti). */
export function anagraficaDaCorpo(b: any) {
  const t = (v: unknown): string | null => (typeof v === 'string' ? v.trim() : v == null ? null : String(v));
  return {
    denominazione: t(b.denominazione) || '', tipo: String(b.tipo ?? ''), codiceFiscale: t(b.codiceFiscale)?.toUpperCase() || null, partitaIva: t(b.partitaIva) || null,
    paeseResidenza: String(b.paeseResidenza ?? 'IT').trim().toUpperCase() || 'IT', attivitaPrevalente: t(b.attivitaPrevalente) || null,
    ateco: t(b.ateco) || null, pep: Boolean(b.pep), pepOrganoPubblico: Boolean(b.pepOrganoPubblico), note: t(b.note) || null,
    datiIdentificativi: b.datiIdentificativi && typeof b.datiIdentificativi === 'object' ? b.datiIdentificativi : null,
  };
}

export type Anagrafica = ReturnType<typeof anagraficaDaCorpo>;

/** Soci e cariche dal corpo (già rivisti nel browser), con validazione minima. */
export function compagineDaCorpo(b: any): { soci: SocioIn[]; cariche: CaricaIn[] } {
  const DIRITTI = ['PROPRIETA', 'NUDA_PROPRIETA', 'USUFRUTTO', 'PEGNO', 'SEQUESTRO', 'PIGNORAMENTO', 'COMPROPRIETA', 'ALTRO'];
  const TIPI = ['PERSONA_FISICA', 'PERSONA_GIURIDICA', 'FIDUCIARIA', 'TRUST', 'ALTRO'];
  const soci: SocioIn[] = (Array.isArray(b.soci) ? b.soci : [])
    .filter((s: any) => s && typeof s.nome === 'string' && s.nome.trim() && Number.isFinite(Number(s.quotaPercento)))
    .map((s: any) => ({
      nome: String(s.nome).trim(), codiceFiscale: s.codiceFiscale ? String(s.codiceFiscale).trim().toUpperCase() : null,
      tipo: TIPI.includes(s.tipo) ? s.tipo : 'ALTRO', quotaNominale: s.quotaNominale != null ? Number(s.quotaNominale) : null,
      quotaPercento: Math.max(0, Math.min(100, Number(s.quotaPercento))), diritto: DIRITTI.includes(s.diritto) ? s.diritto : 'PROPRIETA',
      quoteProprie: Boolean(s.quoteProprie), comproprieta: Boolean(s.comproprieta), paese: s.paese ? String(s.paese).toUpperCase().slice(0, 2) : null,
      domicilio: s.domicilio ?? null, pec: s.pec ?? null, versato: s.versato != null ? Number(s.versato) : null,
    }));
  const cariche: CaricaIn[] = (Array.isArray(b.cariche) ? b.cariche : [])
    .filter((c: any) => c && typeof c.nome === 'string' && c.nome.trim())
    .map((c: any) => ({
      nome: String(c.nome).trim(), codiceFiscale: c.codiceFiscale ? String(c.codiceFiscale).trim().toUpperCase() : null,
      carica: typeof c.carica === 'string' ? c.carica : 'ALTRO', caricaTesto: c.caricaTesto ?? null, rappresentanzaLegale: Boolean(c.rappresentanzaLegale),
      dataNomina: c.dataNomina ?? null, durata: c.durata ?? null, natoA: c.natoA ?? null, dataNascita: c.dataNascita ?? null,
      domicilio: c.domicilio ?? null, pec: c.pec ?? null, poteri: c.poteri ?? null, paese: c.paese ?? null,
    }));
  return { soci, cariche };
}

/** Telemetria ANONIMA del parser (M17-14): etichette non trovate, mai valori. */
export async function audioVisuraLetta(env: Env, tenantId: string, utenteId: string, ip: string | null | undefined, clienteId: string | null, b: any) {
  const t = b?.telemetria ?? {};
  await scriviAudit(env.DB, {
    tenantId, utenteId, azione: 'VISURA_LETTA', entita: 'clienti', entitaId: clienteId ?? undefined,
    dettaglio: {
      tipoVisura: t.tipoVisura ?? null, formaVisura: t.formaVisura ?? null, pagine: Number(t.pagine) || null,
      campiNonTrovati: Array.isArray(t.campiNonTrovati) ? t.campiNonTrovati.slice(0, 30).map(String) : [],
      avvisi: Number(t.avvisi) || 0, soci: Number(t.soci) || 0, cariche: Number(t.cariche) || 0,
      tipoIncerto: Boolean(t.tipoIncerto), dataEstrazione: t.dataEstrazione ?? null,
    },
    ip,
  });
}

/** Doppioni: stesso CF o stessa P.IVA già in anagrafica (anche archiviati). */
export async function clienteDoppione(db: D1Database, tenantId: string, cf: string | null, piva: string | null, escludi?: string) {
  if (!cf && !piva) return null;
  const r = await db.prepare(
    `SELECT id, denominazione, attivo FROM clienti WHERE tenant_id = ? ${escludi ? 'AND id != ?' : ''}
     AND ((? IS NOT NULL AND codice_fiscale = ?) OR (? IS NOT NULL AND partita_iva = ?)) ORDER BY attivo DESC LIMIT 1`,
  ).bind(...(escludi ? [tenantId, escludi] : [tenantId]), cf, cf, piva, piva).first<any>();
  return r ? { id: String(r.id), denominazione: String(r.denominazione), attivo: r.attivo === 1 } : null;
}

const dataIso = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/**
 * Nuovo cliente da visura. Il corpo porta l'anagrafica rivista, soci e
 * cariche letti dal PDF, i dettagli per `dati_identificativi` e la data della
 * visura. Crea il cliente, persiste la compagine, calcola e registra la
 * proposta di titolarità con gli alert, lancia lo screening dei nomi. Il PDF
 * si carica subito dopo con POST /clienti/:id/documenti.
 */
export async function creaClienteDaVisura(env: Env, tenantId: string, u: Utente, ip: string | null | undefined, b: any) {
  const a = anagraficaDaCorpo(b.anagrafica ?? {});
  if (!a.denominazione || !a.tipo) return { errore: 'Denominazione e natura giuridica sono obbligatorie.', stato: 400 } as Errore;
  if (!TIPI_CLIENTE.includes(a.tipo)) return { errore: 'Natura giuridica non ammessa.', stato: 400 } as Errore;
  if (a.partitaIva && !normalizzaPiva(a.partitaIva)) return { errore: 'La partita IVA non è formalmente valida.', stato: 400 } as Errore;

  const doppione = await clienteDoppione(env.DB, tenantId, a.codiceFiscale, a.partitaIva);
  if (doppione) {
    return {
      codice: 'doppione', clienteId: doppione.id, denominazione: doppione.denominazione, attivo: doppione.attivo, stato: 409,
      errore: `${doppione.denominazione} è già in anagrafica con lo stesso codice fiscale o partita IVA${doppione.attivo ? '' : ' (archiviato)'}: apri la scheda e usa «Aggiorna da visura».`,
    } as Errore;
  }
  const prof = await risolviProfessionista(env.DB, tenantId, b.anagrafica?.professionistaId, u);
  if ('errore' in prof) return { errore: prof.errore, stato: 400 } as Errore;

  const id = nuovoId('cli');
  const dati = a.datiIdentificativi ? await cifra(env.MASTER_KEY, tenantId, JSON.stringify(a.datiIdentificativi)) : null;
  await env.DB.prepare(
    `INSERT INTO clienti (id, tenant_id, tipo, denominazione, codice_fiscale, partita_iva, dati_identificativi,
      paese_residenza, attivita_prevalente, ateco, pep, pep_organo_pubblico, note, creato_da, professionista_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    id, tenantId, a.tipo, a.denominazione, a.codiceFiscale, a.partitaIva, dati ? JSON.stringify(dati) : null, a.paeseResidenza,
    a.attivitaPrevalente, a.ateco, a.pep ? 1 : 0, a.pepOrganoPubblico ? 1 : 0, a.note, u.id, prof.id,
  ).run();

  const { soci, cariche } = compagineDaCorpo(b);
  const dataVisura = dataIso(b.dataVisura);
  const diff = await salvaCompagine(env, tenantId, id, u.id, { soci, cariche, fonte: 'VISURA', fonteData: b.dataElencoSoci ?? dataVisura });
  await registraProposta(env, tenantId, id, u.id, 'ANAGRAFICA', 'VISURA', { anagrafica: a, dataVisura, applicataAllaCreazione: true }, [], 'APPLICATA');

  const screening = await screeningCompagine(env, tenantId, id).catch(() => ({ eseguito: false, nuove: 0 }));
  const proposta = await propostaTitolarita(env, tenantId, { id, denominazione: a.denominazione, tipo: a.tipo, codice_fiscale: a.codiceFiscale },
    { capitale: b.capitale ?? null, dataVisura, dataElencoSoci: b.dataElencoSoci ?? null });
  let propostaId: string | null = null;
  if (soci.length || cariche.length) {
    propostaId = await registraProposta(env, tenantId, id, u.id, 'TITOLARITA', 'VISURA',
      { titolari: proposta.analisi.titolari, criterio: proposta.analisi.criterioApplicato, bozzaMotivazione: proposta.bozzaMotivazione, dataVisura }, proposta.alert);
  }

  await audioVisuraLetta(env, tenantId, u.id, ip, id, b);
  await scriviAudit(env.DB, {
    tenantId, utenteId: u.id, azione: 'CREA_CLIENTE', entita: 'clienti', entitaId: id,
    dettaglio: { origine: 'VISURA', dataVisura, soci: soci.length, cariche: cariche.length, alert: proposta.alert.map((x) => x.codice) }, ip,
  });
  return { id, diff, proposta: { ...proposta, id: propostaId }, screening };
}

/**
 * Aggiorna un cliente esistente da una visura più recente: PATCH selettivo
 * dei campi scelti, diff della compagine e delle cariche, nuova proposta di
 * titolarità. I dati identificativi si FONDONO con quelli esistenti: la
 * visura non sa nulla del documento d'identità raccolto in verifica.
 */
export async function aggiornaClienteDaVisura(env: Env, tenantId: string, u: Utente, ip: string | null | undefined, id: string, b: any) {
  const cliente = await env.DB.prepare('SELECT id, denominazione, tipo, codice_fiscale, partita_iva, dati_identificativi FROM clienti WHERE id = ? AND tenant_id = ?')
    .bind(id, tenantId).first<any>();
  if (!cliente) return { errore: 'Cliente non trovato', stato: 404 } as Errore;

  // 1. Campi dell'anagrafica scelti dall'utente.
  const campi = b.campi && typeof b.campi === 'object' ? b.campi : {};
  const set: string[] = [];
  const valori: unknown[] = [];
  const applicati: string[] = [];
  const testo = (chiave: string, colonna: string) => {
    if (campi[chiave] === undefined) return;
    const v = typeof campi[chiave] === 'string' ? campi[chiave].trim() : campi[chiave];
    set.push(`${colonna} = ?`); valori.push(v === '' ? null : v); applicati.push(chiave);
  };
  if (campi.tipo !== undefined && !TIPI_CLIENTE.includes(campi.tipo)) return { errore: 'Natura giuridica non ammessa.', stato: 400 } as Errore;
  if (campi.codiceFiscale || campi.partitaIva) {
    const dopp = await clienteDoppione(env.DB, tenantId, campi.codiceFiscale ?? null, campi.partitaIva ?? null, id);
    if (dopp) return { codice: 'doppione', clienteId: dopp.id, errore: `Codice fiscale o partita IVA già presenti su ${dopp.denominazione}.`, stato: 409 } as Errore;
  }
  testo('tipo', 'tipo'); testo('denominazione', 'denominazione'); testo('codiceFiscale', 'codice_fiscale'); testo('partitaIva', 'partita_iva');
  testo('attivitaPrevalente', 'attivita_prevalente'); testo('ateco', 'ateco'); testo('note', 'note');
  if (campi.paeseResidenza !== undefined) { set.push('paese_residenza = ?'); valori.push(String(campi.paeseResidenza).trim().toUpperCase() || 'IT'); applicati.push('paeseResidenza'); }
  if (b.datiIdentificativi && typeof b.datiIdentificativi === 'object' && Object.keys(b.datiIdentificativi).length) {
    let attuali: Record<string, unknown> = {};
    if (cliente.dati_identificativi) {
      try { attuali = JSON.parse(await decifra(env.MASTER_KEY, tenantId, JSON.parse(cliente.dati_identificativi))); } catch { attuali = {}; }
    }
    const nuovi = { ...attuali, ...b.datiIdentificativi };
    set.push('dati_identificativi = ?'); valori.push(JSON.stringify(await cifra(env.MASTER_KEY, tenantId, JSON.stringify(nuovi))));
    applicati.push(...Object.keys(b.datiIdentificativi).map((k) => `datiIdentificativi.${k}`));
  }
  if (set.length) {
    set.push("aggiornato_il = datetime('now')");
    await env.DB.prepare(`UPDATE clienti SET ${set.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...valori, id, tenantId).run();
  }

  // 2. Compagine e cariche: diff temporale.
  const { soci, cariche } = compagineDaCorpo(b);
  const dataVisura = dataIso(b.dataVisura);
  const diff = (soci.length || cariche.length || b.svuotaCompagine)
    ? await salvaCompagine(env, tenantId, id, u.id, { soci, cariche, fonte: 'VISURA', fonteData: b.dataElencoSoci ?? dataVisura })
    : { partecipazioni: { aperte: 0, chiuse: 0, invariate: 0 }, cariche: { aperte: 0, chiuse: 0, invariate: 0 }, dettaglio: null };

  const screening = await screeningCompagine(env, tenantId, id).catch(() => ({ eseguito: false, nuove: 0 }));
  const denominazione = campi.denominazione ?? cliente.denominazione;
  const tipo = campi.tipo ?? cliente.tipo;
  const proposta = await propostaTitolarita(env, tenantId, { id, denominazione, tipo, codice_fiscale: campi.codiceFiscale ?? cliente.codice_fiscale },
    { capitale: b.capitale ?? null, dataVisura, dataElencoSoci: b.dataElencoSoci ?? null });
  let propostaId: string | null = null;
  const compagineCambiata = diff.partecipazioni.aperte + diff.partecipazioni.chiuse + diff.cariche.aperte + diff.cariche.chiuse > 0;
  if (compagineCambiata || b.forzaProposta) {
    propostaId = await registraProposta(env, tenantId, id, u.id, 'TITOLARITA', 'VISURA',
      { titolari: proposta.analisi.titolari, criterio: proposta.analisi.criterioApplicato, bozzaMotivazione: proposta.bozzaMotivazione, dataVisura,
        diff: { partecipazioni: diff.partecipazioni, cariche: diff.cariche }, variazioni: diff.dettaglio?.righe ?? [] }, proposta.alert);
  }
  // AR-M20-02: struttura cambiata → controllo costante «da rivalutare» proposto sui fascicoli vivi valutati.
  const rivalutazioni = diff.dettaglio ? await proponiRivalutazioni(env, tenantId, id, u.id, diff.dettaglio, dataVisura) : [];

  await audioVisuraLetta(env, tenantId, u.id, ip, id, b);
  await scriviAudit(env.DB, {
    tenantId, utenteId: u.id, azione: 'AGGIORNA_CLIENTE', entita: 'clienti', entitaId: id,
    dettaglio: {
      origine: 'VISURA', dataVisura, campi: applicati, diff: { partecipazioni: diff.partecipazioni, cariche: diff.cariche },
      strutturaCambiata: Boolean(diff.dettaglio?.strutturaCambiata), rivalutazioniProposte: rivalutazioni.length, alert: proposta.alert.map((x) => x.codice),
    }, ip,
  });
  return {
    ok: true, applicati, diff: { partecipazioni: diff.partecipazioni, cariche: diff.cariche }, compagineCambiata,
    variazioni: diff.dettaglio ? { righe: diff.dettaglio.righe, strutturaCambiata: diff.dettaglio.strutturaCambiata } : null,
    rivalutazioni, proposta: { ...proposta, id: propostaId }, screening,
  };
}
