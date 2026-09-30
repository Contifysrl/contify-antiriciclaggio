/**
 * DICHIARAZIONE DEL CLIENTE — mod. AV.4 (art. 22 co. 1 DLgs. 231/2007)
 *
 * L'art. 22 co. 1-2 mette in capo AL CLIENTE l'obbligo di fornire per iscritto,
 * sotto la propria responsabilità, le informazioni sul titolare effettivo (e
 * sullo scopo e natura del rapporto). Il programma genera la dichiarazione
 * GIÀ COMPILATA con i dati in archivio; il cliente conferma o corregge. Due
 * canali, stesso contenuto: .docx per la firma in presenza, oppure la verifica
 * a distanza (AR-M8), che parte dalla proposta invece che dal vuoto.
 *
 * Confine da non superare: la dichiarazione del cliente NON scrive i titolari
 * effettivi né lo scopo del fascicolo. Torna al professionista come documento
 * del fascicolo e come risposte da valutare (artt. 19-22).
 *
 * Storia: AR-M18 (prima versione, dalla compagine); AR-M22 (sezione «scopo e
 * natura», art. 18 co. 1 lett. c); AR-M23 (richiesta di Barbara, 25.9.2026):
 * il documento segue il MODELLO AV.4 della modulistica CNDCEC e mostra la
 * sola opzione pertinente fra le quattro, scelta dai dati già raccolti:
 *   1. persona fisica che agisce in proprio;
 *   2. persona fisica che agisce per conto di altre persone fisiche (esecutore);
 *   3. società/ente con titolari effettivi per proprietà o controllo;
 *   4. società/ente con titolare effettivo residuale (art. 20 co. 5: poteri di
 *      rappresentanza, amministrazione o direzione).
 * Dati del dichiarante, della società e dei titolari effettivi (con PEP e
 * relazione col cliente) arrivano dall'anagrafica, dal fascicolo (esecutore)
 * e dalla fotografia dei titolari registrata — o, in mancanza, dalla proposta
 * del programma. Quello che manca resta in bianco da compilare a mano.
 */

import type { Env } from './tipi';
import { dettagliCliente, propostaFascicolo } from './proposta-fascicolo';
import { etichettaCarica } from '../domain/titolare-effettivo';
import type { CriterioTitolarita } from '../domain/titolare-effettivo';
import { paeseAltoRischio } from '../domain/norme';
import { settoreEsposto } from '../domain/settori-esposti';
import { bloccoFirma, elenco, interruzionePagina, occhiello, par, rigaIntestazione, run, tabella, tabellaDati, testo, titolo1, titolo2, titolo3, COLORI, type Cella } from './docx';

export const DOMANDE_CONTROLLO_BASE = [
  'Esistono patti parasociali, accordi di voto o sindacati di blocco fra i soci?',
  'Lo statuto attribuisce a singoli soci diritti particolari sull’amministrazione o sulla distribuzione degli utili (art. 2468 co. 3 c.c.) o prevede voto plurimo?',
  'Esistono vincoli contrattuali, finanziamenti o garanzie che consentono a un soggetto di esercitare un’influenza dominante sulla società (art. 2359 c.c.)?',
  'Le quote o azioni sono gravate da usufrutto, pegno, sequestro o pignoramento e, in tal caso, a chi spetta il diritto di voto (art. 2352 c.c.)?',
  'Qualcuno dei soci detiene la partecipazione per conto di terzi (interposizione, mandato fiduciario)?',
];

const ETICHETTA_CRITERIO: Record<string, string> = {
  CLIENTE_PERSONA_FISICA: 'cliente persona fisica che agisce in proprio (art. 1 co. 2 lett. pp)',
  PROPRIETA_DIRETTA: 'proprietà diretta (art. 20 co. 2 lett. a)',
  PROPRIETA_INDIRETTA: 'proprietà indiretta (art. 20 co. 2 lett. b)',
  CONTROLLO: 'controllo (art. 20 co. 3)',
  PERSONA_GIURIDICA_PRIVATA: 'art. 20 co. 4',
  RESIDUALE_POTERI: 'criterio residuale — poteri di rappresentanza o amministrazione (art. 20 co. 5)',
  TRUST: 'art. 22 co. 5',
  PROCEDURA_CONCORSUALE: 'organo della procedura',
};

/** Paesi UE (per l'ambito territoriale del modello). */
const PAESI_UE = new Set(['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK']);

export type OpzioneAv4 = 1 | 2 | 3 | 4;

/** Prestazione del fascicolo per la sezione «scopo e natura» (art. 18 co. 1 lett. c). */
export interface PrestazioneArt22 {
  codice: string;
  descrizione: string;
  tipoRapporto: 'CONTINUATIVO' | 'OCCASIONALE';
  dataConferimento: string | null;
  /** Scopo e natura come già scritti dal professionista nel fascicolo (art. 19 co. 1 lett. c), se ci sono. */
  scopoNatura: string | null;
}

/** Persona fisica come compare nel modello (dichiarante o titolare effettivo). */
export interface PersonaAv4 {
  nominativo: string;
  codiceFiscale: string | null;
  natoA: string | null;
  natoIl: string | null;
  nazionalita: string | null;
  residenza: string | null;
  domicilio: string | null;
}

export interface TitolareAv4 extends PersonaAv4 {
  criterio: CriterioTitolarita | string;
  etichettaCriterio: string;
  quota: number | null;
  /** «Relazioni intercorrenti tra il Cliente e il titolare effettivo» (art. 18 co. 1 lett. c). */
  relazione: string;
  /** Status PEP noto allo studio (fotografia registrata); null = non noto. */
  pep: boolean | null;
  fonte: 'REGISTRATO' | 'PROPOSTO' | 'CLIENTE';
}

export interface PrecompilataArt22 {
  versione: 1 | 2;
  generataIl: string;
  /** Assente nelle dichiarazioni generate prima di AR-M22 o senza fascicolo: la sezione «scopo» allora non si chiede. */
  prestazione?: PrestazioneArt22 | null;
  cliente: { id: string; denominazione: string; codiceFiscale: string | null; partitaIva: string | null; tipo: string; sede: string | null };
  fonte: { visuraDel: string | null; dataElencoSoci: string | null; capitaleSottoscritto: number | null };
  ripartizione: Array<{ nome: string; tipo: string; quotaPercento: number; diritto: string; quoteProprie: boolean; paese: string | null }>;
  cariche: Array<{ nome: string; carica: string; rappresentanzaLegale: boolean }>;
  titolariProposti: Array<{ nominativo: string; criterio: CriterioTitolarita; etichettaCriterio: string; norma: string; quota: number | null; motivazione: string }>;
  criterioApplicato: string;
  richiedeMotivazioneResiduale: boolean;
  esecutore: { nominativo: string; carica: string; codiceFiscale: string | null } | null;
  /** Domande di controllo (art. 20 co. 3): quelle dell'alert A2 se scattato, altrimenti la serie base. Vuote per la persona fisica. */
  domande: string[];
  alert: string[];
  /** Vero se non c'è compagine in archivio: la dichiarazione si limita a chiedere. */
  senzaCompagine: boolean;
  // ── AR-M23: modello AV.4 per opzione ───────────────────────────────
  /** Opzione del modello scelta dai dati (vedi intestazione del file). */
  opzione?: OpzioneAv4;
  /** Chi firma: il cliente (opzione 1) o l'esecutore (2, 3, 4); `qualita` = in che veste. */
  dichiarante?: (PersonaAv4 & { qualita: string | null }) | null;
  /** Società/ente per le opzioni 3 e 4. */
  societa?: { denominazione: string; sedeLegale: string | null; registroImpreseDi: string | null; rea: string | null; codiceFiscale: string | null } | null;
  /** Titolari effettivi da riportare nel modello (registrati, altrimenti proposti; il cliente stesso per le opzioni 1-2). */
  titolari?: TitolareAv4[];
  /** Attività e settore merceologico principale (prefill). */
  attivita?: { descrizione: string | null; ateco: string | null; settore: string | null } | null;
  /** Ambito territoriale (prefill): provincia italiana e/o Paese estero, con la classe del modello. */
  ambito?: { provincia: string | null; paese: string | null; classe: 'ITALIA' | 'UE' | 'EXTRA_UE' | 'RISCHIO' | null } | null;
}

/** Risposte del cliente (dal modulo a distanza o trascritte dal professionista). */
export interface RispostaArt22 {
  /** Scopo e natura della prestazione: conferma di quanto risulta allo studio, oppure precisazione del cliente. */
  scopo?: { conferma: 'CONFERMA' | 'PRECISA'; testo: string | null } | null;
  conferma: 'CONFERMA' | 'CORREGGE';
  correzioni?: string | null;
  titolari?: Array<{ nominativo: string; codiceFiscale?: string | null; quota?: string | number | null }>;
  risposte: Array<{ domanda: string; risposta: 'SI' | 'NO'; dettagli?: string | null }>;
  pep: Array<{ nominativo: string; ruolo: 'TITOLARE_EFFETTIVO' | 'ESECUTORE' | 'CLIENTE'; pep: boolean; dettagli?: string | null }>;
  dichiarante?: (Partial<PersonaAv4> & { nome?: string | null; qualita?: string | null }) | null;
  /** AR-M23: status PEP di chi firma (obbligatorio quando il dichiarante è il cliente stesso, opzione 1). */
  pepDichiarante?: { pep: boolean; dettagli: string | null } | null;
  /** AR-M23: sezioni del modello facoltative (in funzione del rischio), lasciate al cliente. */
  provenienzaFondi?: string | null;
  mezziPagamento?: string | null;
  attivita?: string | null;
  ambito?: { italiaProvincia?: string | null; paeseUe?: string | null; paeseExtraUe?: string | null; paeseRischio?: string | null; altro?: string | null } | null;
  resaIl?: string | null;
  canale?: 'DISTANZA' | 'PRESENZA';
}

const pct = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;
const dataIt = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '—');
const euro = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const VUOTO = '____________________';
const RIGA = '________________________________________________';
const vuoto = (v?: string | null, riga = VUOTO) => (v && String(v).trim() ? String(v).trim() : riga);
const stessaPersona = (a: { nominativo?: string | null; codiceFiscale?: string | null }, b: { nominativo?: string | null; codiceFiscale?: string | null }) =>
  Boolean((a.codiceFiscale && b.codiceFiscale && a.codiceFiscale.toUpperCase() === b.codiceFiscale.toUpperCase())
    || (a.nominativo && b.nominativo && a.nominativo.trim().toUpperCase() === b.nominativo.trim().toUpperCase()));

/** Provincia fra parentesi in fondo a una sede «Via X 3, 35100 Padova (PD)». */
function provinciaDaSede(sede?: string | null): string | null {
  const m = /\(([A-Z]{2})\)\s*$/.exec(String(sede ?? '').trim());
  return m ? m[1] : null;
}

/** Opzione del modello quando la precompilata è precedente ad AR-M23. */
function opzioneDaDati(p: PrecompilataArt22): OpzioneAv4 {
  if (p.opzione) return p.opzione;
  if (p.cliente.tipo === 'PERSONA_FISICA') return p.esecutore && p.esecutore.carica !== etichettaCarica('IN_PROPRIO') ? 2 : 1;
  const titolari = p.titolari ?? [];
  const criteri = titolari.length ? titolari.map((t) => t.criterio) : p.titolariProposti.map((t) => t.criterio);
  return criteri.length && criteri.every((c) => c === 'RESIDUALE_POTERI') ? 4 : 3;
}

/** Completa una precompilata di versione 1 con i campi di AR-M23 ricavabili dai dati che ha. */
export function completaPrecompilata(p: PrecompilataArt22): PrecompilataArt22 & { opzione: OpzioneAv4; titolari: TitolareAv4[] } {
  const opzione = opzioneDaDati(p);
  const persona = (nominativo: string, codiceFiscale: string | null = null): PersonaAv4 => ({ nominativo, codiceFiscale, natoA: null, natoIl: null, nazionalita: null, residenza: null, domicilio: null });
  const titolari: TitolareAv4[] = p.titolari ?? (
    opzione <= 2
      ? [{ ...persona(p.cliente.denominazione, p.cliente.codiceFiscale), criterio: 'CLIENTE_PERSONA_FISICA', etichettaCriterio: ETICHETTA_CRITERIO.CLIENTE_PERSONA_FISICA, quota: null, relazione: opzione === 1 ? 'il cliente stesso' : 'persona fisica per conto della quale agisce il dichiarante', pep: null, fonte: 'CLIENTE' }]
      : p.titolariProposti.map((t) => ({ ...persona(t.nominativo), criterio: t.criterio, etichettaCriterio: t.etichettaCriterio, quota: t.quota, relazione: relazioneDaCriterio(t.criterio, t.quota, null), pep: null, fonte: 'PROPOSTO' as const }))
  );
  const dichiarante = p.dichiarante ?? (
    opzione === 1
      ? { ...persona(p.cliente.denominazione, p.cliente.codiceFiscale), qualita: null }
      : p.esecutore ? { ...persona(p.esecutore.nominativo, p.esecutore.codiceFiscale), qualita: p.esecutore.carica } : null
  );
  const societa = p.societa ?? (opzione >= 3 ? { denominazione: p.cliente.denominazione, sedeLegale: p.cliente.sede, registroImpreseDi: provinciaDaSede(p.cliente.sede), rea: null, codiceFiscale: p.cliente.codiceFiscale ?? p.cliente.partitaIva } : null);
  return { ...p, opzione, titolari, dichiarante, societa, attivita: p.attivita ?? null, ambito: p.ambito ?? null, domande: opzione <= 2 && !p.titolari ? [] : p.domande };
}

function relazioneDaCriterio(criterio: string, quota: number | null, carica: string | null): string {
  switch (criterio) {
    case 'CLIENTE_PERSONA_FISICA': return 'il cliente stesso';
    case 'PROPRIETA_DIRETTA': return quota != null ? `socio con partecipazione diretta del ${pct(quota)} del capitale` : 'socio con partecipazione diretta superiore alla soglia di legge';
    case 'PROPRIETA_INDIRETTA': return quota != null ? `titolare indiretto, tramite società controllate o interposta persona, del ${pct(quota)} del capitale` : 'titolare indiretto di una partecipazione superiore alla soglia di legge';
    case 'CONTROLLO': return 'esercita il controllo della società (art. 20 co. 3)';
    case 'PERSONA_GIURIDICA_PRIVATA': return 'fondatore, beneficiario o titolare di funzioni di rappresentanza, direzione e amministrazione (art. 20 co. 4)';
    case 'RESIDUALE_POTERI': return carica ? `${carica} — titolare di poteri di rappresentanza legale, amministrazione o direzione (art. 20 co. 5)` : 'titolare di poteri di rappresentanza legale, amministrazione o direzione (art. 20 co. 5)';
    case 'TRUST': return 'costituente, trustee, guardiano o beneficiario del trust (art. 22 co. 5)';
    default: return ETICHETTA_CRITERIO[criterio] ?? criterio.replace(/_/g, ' ').toLowerCase();
  }
}

/** Costruisce la dichiarazione precompilata dai dati in archivio. */
export async function precompilaDichiarazione(env: Env, tenantId: string, cliente: any, fascicoloId: string | null): Promise<PrecompilataArt22> {
  const fasc = fascicoloId
    ? await env.DB.prepare('SELECT prestazione_codice, prestazione_descrizione, tipo_rapporto, data_conferimento, scopo_natura, esecutore FROM fascicoli WHERE id = ? AND tenant_id = ?').bind(fascicoloId, tenantId).first<any>()
    : null;
  const [dettagli, pf, registrati] = await Promise.all([
    dettagliCliente(env, tenantId, cliente),
    propostaFascicolo(env, tenantId, cliente, fascicoloId ? { id: fascicoloId, esecutore: fasc?.esecutore ?? null } : null),
    env.DB.prepare('SELECT nominativo, codice_fiscale, criterio, norma, quota, pep FROM titolari_effettivi WHERE cliente_id = ? AND tenant_id = ? AND valido_al IS NULL ORDER BY nominativo').bind(cliente.id, tenantId).all<any>(),
  ]);
  const prestazione: PrestazioneArt22 | null = fasc
    ? {
        codice: String(fasc.prestazione_codice), descrizione: String(fasc.prestazione_descrizione),
        tipoRapporto: fasc.tipo_rapporto === 'OCCASIONALE' ? 'OCCASIONALE' : 'CONTINUATIVO',
        dataConferimento: fasc.data_conferimento ?? null, scopoNatura: String(fasc.scopo_natura ?? '').trim() || null,
      }
    : null;
  const pt = pf.titolarita;
  const a2 = pt.alert.find((a) => a.codice === 'A2');
  const personaFisica = cliente.tipo === 'PERSONA_FISICA';
  const domande = personaFisica ? [] : a2 && a2.azione.tipo === 'DOMANDE_ART22' ? a2.azione.domande : DOMANDE_CONTROLLO_BASE;
  const soci = pt.soci.filter((s) => !s.quoteProprie);
  const oggi = new Date().toISOString().slice(0, 10);

  // Esecutore: quello registrato sul fascicolo vince sulla proposta.
  let esecutoreReg: any = null;
  if (fasc?.esecutore) { try { esecutoreReg = JSON.parse(fasc.esecutore); } catch { esecutoreReg = null; } }
  // In proprio = nessun esecutore registrato, oppure l'esecutore È il cliente (anche se la qualità è rimasta «in proprio»).
  const inProprio = personaFisica && (!esecutoreReg || !String(esecutoreReg.nominativo ?? '').trim() || stessaPersona({ nominativo: esecutoreReg.nominativo, codiceFiscale: esecutoreReg.codiceFiscale }, { nominativo: cliente.denominazione, codiceFiscale: cliente.codice_fiscale }));
  const esecutore = esecutoreReg && !inProprio
    ? { nominativo: String(esecutoreReg.nominativo), carica: String(esecutoreReg.caricaTesto || (esecutoreReg.carica ? etichettaCarica(esecutoreReg.carica) : 'esecutore')), codiceFiscale: esecutoreReg.codiceFiscale ?? null }
    : !personaFisica && pf.esecutore
      ? { nominativo: pf.esecutore.nominativo, carica: pf.esecutore.caricaTesto, codiceFiscale: pf.esecutore.codiceFiscale }
      : null;

  // Dettagli anagrafici delle persone fisiche note (cariche dalla visura, soci, cliente).
  const personaDaCarica = (nominativo: string, cf: string | null): Partial<PersonaAv4> => {
    const c = pt.cariche.find((x) => stessaPersona({ nominativo: x.nome, codiceFiscale: x.codiceFiscale }, { nominativo, codiceFiscale: cf }));
    const s = pt.soci.find((x) => stessaPersona({ nominativo: x.nome, codiceFiscale: x.codiceFiscale }, { nominativo, codiceFiscale: cf }));
    return {
      codiceFiscale: cf ?? c?.codiceFiscale ?? s?.codiceFiscale ?? null,
      natoA: c?.natoA ?? null, natoIl: c?.dataNascita ?? null, residenza: c?.domicilio ?? s?.domicilio ?? null,
      nazionalita: (c?.paese ?? s?.paese) && (c?.paese ?? s?.paese) !== 'IT' ? String(c?.paese ?? s?.paese) : null,
    };
  };
  const persona = (nominativo: string, cf: string | null): PersonaAv4 => ({
    nominativo, codiceFiscale: cf, natoA: null, natoIl: null, nazionalita: null, residenza: null, domicilio: null, ...personaDaCarica(nominativo, cf),
  });
  const clientePf: PersonaAv4 = {
    nominativo: cliente.denominazione, codiceFiscale: cliente.codice_fiscale ?? null,
    natoA: dettagli?.luogoNascita ?? null, natoIl: dettagli?.dataNascita ?? null,
    nazionalita: dettagli?.nazionalita ?? dettagli?.cittadinanza ?? (cliente.paese_residenza && cliente.paese_residenza !== 'IT' ? String(cliente.paese_residenza) : null),
    residenza: dettagli?.residenza ?? dettagli?.sede ?? null, domicilio: dettagli?.domicilio ?? null,
  };

  // Titolari effettivi: registrati, altrimenti proposti dal motore.
  const registratiVivi = (registrati.results ?? []).filter((t: any) => t.criterio !== 'CLIENTE_PERSONA_FISICA');
  const caricaDi = (nominativo: string, cf: string | null) => {
    const c = pt.cariche.find((x) => stessaPersona({ nominativo: x.nome, codiceFiscale: x.codiceFiscale }, { nominativo, codiceFiscale: cf }));
    return c ? (c.caricaTesto ?? etichettaCarica(c.carica)) : null;
  };
  let titolari: TitolareAv4[];
  if (personaFisica) {
    titolari = [{ ...clientePf, criterio: 'CLIENTE_PERSONA_FISICA', etichettaCriterio: ETICHETTA_CRITERIO.CLIENTE_PERSONA_FISICA, quota: null, relazione: inProprio ? 'il cliente stesso' : 'persona fisica per conto della quale agisce il dichiarante', pep: cliente.pep === 1 || cliente.pep === true ? true : null, fonte: 'CLIENTE' }];
  } else if (registratiVivi.length) {
    titolari = registratiVivi.map((t: any) => ({
      ...persona(String(t.nominativo), t.codice_fiscale ?? null), criterio: t.criterio, etichettaCriterio: ETICHETTA_CRITERIO[t.criterio] ?? t.criterio,
      quota: t.quota != null ? Number(t.quota) : null, relazione: relazioneDaCriterio(t.criterio, t.quota != null ? Number(t.quota) : null, caricaDi(String(t.nominativo), t.codice_fiscale ?? null)),
      pep: t.pep === 1, fonte: 'REGISTRATO' as const,
    }));
  } else {
    titolari = (soci.length ? pt.analisi.titolari : []).map((t) => {
      const quota = t.quotaEffettiva != null ? Math.round(t.quotaEffettiva * 10000) / 100 : null;
      return {
        ...persona(t.denominazione, /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(t.id) ? t.id : null), criterio: t.criterio, etichettaCriterio: ETICHETTA_CRITERIO[t.criterio] ?? t.criterio,
        quota, relazione: relazioneDaCriterio(t.criterio, quota, caricaDi(t.denominazione, null)), pep: null, fonte: 'PROPOSTO' as const,
      };
    });
  }
  const opzione: OpzioneAv4 = personaFisica ? (inProprio ? 1 : 2) : titolari.length && titolari.every((t) => t.criterio === 'RESIDUALE_POTERI') ? 4 : 3;

  const dichiarante = opzione === 1
    ? { ...clientePf, qualita: null }
    : esecutore
      ? { ...persona(esecutore.nominativo, esecutore.codiceFiscale), qualita: esecutore.carica }
      : null;
  const rea = dettagli?.rea ? String(dettagli.rea) : null;
  const provincia = dettagli?.provincia ?? provinciaDaSede(dettagli?.sede) ?? provinciaDaSede(dettagli?.residenza) ?? null;
  const paese = String(cliente.paese_residenza ?? 'IT').toUpperCase();
  const settore = settoreEsposto({ ateco: cliente.ateco, attivita: cliente.attivita_prevalente, oggettoSociale: dettagli?.oggettoSociale }, oggi);

  return {
    versione: 2,
    generataIl: new Date().toISOString(),
    prestazione,
    cliente: {
      id: cliente.id, denominazione: cliente.denominazione, codiceFiscale: cliente.codice_fiscale ?? null, partitaIva: cliente.partita_iva ?? null,
      tipo: cliente.tipo, sede: dettagli?.sede ?? null,
    },
    fonte: { visuraDel: dettagli?.visuraDel ?? null, dataElencoSoci: pt.soci[0]?.fonteData ?? null, capitaleSottoscritto: dettagli?.capitaleSociale != null ? Number(dettagli.capitaleSociale) : null },
    ripartizione: soci.map((s) => ({ nome: s.nome, tipo: s.tipo, quotaPercento: s.quotaPercento, diritto: s.diritto ?? 'PROPRIETA', quoteProprie: false, paese: s.paese ?? null })),
    cariche: pt.cariche.map((c) => ({ nome: c.nome, carica: c.caricaTesto ?? etichettaCarica(c.carica), rappresentanzaLegale: Boolean(c.rappresentanzaLegale) })),
    titolariProposti: !personaFisica && soci.length
      ? pt.analisi.titolari.map((t) => ({
          nominativo: t.denominazione, criterio: t.criterio, etichettaCriterio: ETICHETTA_CRITERIO[t.criterio] ?? t.criterio, norma: t.norma,
          quota: t.quotaEffettiva != null ? Math.round(t.quotaEffettiva * 10000) / 100 : null, motivazione: t.motivazione,
        }))
      : opzione === 2 ? [{ nominativo: cliente.denominazione, criterio: 'CLIENTE_PERSONA_FISICA', etichettaCriterio: ETICHETTA_CRITERIO.CLIENTE_PERSONA_FISICA, norma: 'art. 1 co. 2 lett. pp)', quota: null, motivazione: '' }] : [],
    criterioApplicato: personaFisica ? 'CLIENTE_PERSONA_FISICA' : soci.length ? pt.analisi.criterioApplicato : 'NESSUNO',
    richiedeMotivazioneResiduale: !personaFisica && soci.length ? pt.analisi.richiedeMotivazioneResiduale : false,
    esecutore,
    domande,
    alert: pt.alert.map((a) => a.codice),
    senzaCompagine: !personaFisica && soci.length === 0,
    opzione,
    dichiarante,
    societa: opzione >= 3
      ? { denominazione: cliente.denominazione, sedeLegale: dettagli?.sede ?? null, registroImpreseDi: rea ? rea.split(/\s*-\s*/)[0] : provincia, rea, codiceFiscale: cliente.codice_fiscale ?? cliente.partita_iva ?? null }
      : null,
    titolari,
    attivita: { descrizione: cliente.attivita_prevalente ?? (dettagli?.oggettoSociale ? String(dettagli.oggettoSociale).slice(0, 300) : null), ateco: cliente.ateco ?? null, settore: settore.voce?.etichetta ?? null },
    ambito: {
      provincia: paese === 'IT' ? provincia : null, paese: paese !== 'IT' ? paese : null,
      classe: paese === 'IT' ? 'ITALIA' : paeseAltoRischio(paese, oggi).altoRischio ? 'RISCHIO' : PAESI_UE.has(paese) ? 'UE' : 'EXTRA_UE',
    },
  };
}

/** Validazione minima delle risposte arrivate dal modulo pubblico (dati del cliente: mai fidarsi). */
export function normalizzaRispostaArt22(input: any, precompilataGrezza: PrecompilataArt22): { errore?: string; risposta?: RispostaArt22 } {
  if (!input || typeof input !== 'object') return { errore: 'Dichiarazione sul titolare effettivo mancante' };
  const precompilata = completaPrecompilata(precompilataGrezza);
  const t = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : v == null ? '' : String(v).trim().slice(0, max));
  let scopo: RispostaArt22['scopo'] = null;
  if (precompilata.prestazione) {
    const sc = input.scopo && typeof input.scopo === 'object' ? input.scopo : null;
    const testo = t(sc?.testo, 1000);
    if (sc?.conferma === 'CONFERMA' && precompilata.prestazione.scopoNatura) scopo = { conferma: 'CONFERMA', testo: null };
    else if ((sc?.conferma === 'PRECISA' || sc?.conferma === 'CONFERMA') && testo) scopo = { conferma: 'PRECISA', testo };
    else if (precompilata.prestazione.scopoNatura) return { errore: 'Indica se lo scopo della prestazione è quello descritto oppure precisalo' };
    else return { errore: 'Indica lo scopo per cui richiedi la prestazione allo studio' };
  }
  const conferma = input.conferma === 'CORREGGE' ? 'CORREGGE' : input.conferma === 'CONFERMA' ? 'CONFERMA' : null;
  if (!conferma) {
    return { errore: precompilata.opzione === 1 ? 'Indica se agisci in proprio oppure per conto di altri' : 'Indica se confermi o correggi la ricostruzione del titolare effettivo' };
  }
  const risposte: RispostaArt22['risposte'] = [];
  for (const d of precompilata.domande) {
    const r = Array.isArray(input.risposte) ? input.risposte.find((x: any) => x?.domanda === d) : null;
    if (!r || (r.risposta !== 'SI' && r.risposta !== 'NO')) return { errore: 'Rispondi a tutte le domande sul controllo della società' };
    risposte.push({ domanda: d, risposta: r.risposta, dettagli: r.risposta === 'SI' ? t(r.dettagli, 1000) : null });
  }
  const pep: RispostaArt22['pep'] = [];
  for (const p of Array.isArray(input.pep) ? input.pep : []) {
    if (!p || typeof p.nominativo !== 'string') continue;
    pep.push({ nominativo: p.nominativo.slice(0, 200), ruolo: ['ESECUTORE', 'CLIENTE'].includes(p.ruolo) ? p.ruolo : 'TITOLARE_EFFETTIVO', pep: p.pep === true, dettagli: p.pep === true ? t(p.dettagli, 500) : null });
  }
  const attesi = new Set([...precompilata.titolariProposti.map((x) => x.nominativo), ...(precompilata.esecutore ? [precompilata.esecutore.nominativo] : [])]);
  for (const n of attesi) if (!pep.some((p) => p.nominativo === n)) return { errore: `Indica se ${n} è persona politicamente esposta` };
  // AR-M23: chi firma dichiara il proprio status PEP (nel modello è la prima dichiarazione).
  // Quando il dichiarante è già fra le persone della lista (esecutore) basta quella voce.
  let pepDichiarante: RispostaArt22['pepDichiarante'] = null;
  const pd = input.pepDichiarante && typeof input.pepDichiarante === 'object' ? input.pepDichiarante : null;
  if (pd && typeof pd.pep === 'boolean') pepDichiarante = { pep: pd.pep, dettagli: pd.pep ? t(pd.dettagli, 500) || null : null };
  else if (precompilata.esecutore && pep.some((p) => p.nominativo === precompilata.esecutore!.nominativo)) {
    const e = pep.find((p) => p.nominativo === precompilata.esecutore!.nominativo)!;
    pepDichiarante = { pep: e.pep, dettagli: e.dettagli ?? null };
  } else if (precompilata.opzione === 1) return { errore: 'Indica se sei una persona politicamente esposta' };
  if (pepDichiarante?.pep && !pepDichiarante.dettagli) return { errore: 'Indica la carica pubblica ricoperta (o il legame con chi la ricopre)' };

  const titolari = conferma === 'CORREGGE' && Array.isArray(input.titolari)
    ? input.titolari.filter((x: any) => x && typeof x.nominativo === 'string' && x.nominativo.trim()).slice(0, 20)
        .map((x: any) => ({ nominativo: t(x.nominativo, 200), codiceFiscale: t(x.codiceFiscale, 16).toUpperCase() || null, quota: t(x.quota, 10) || null }))
    : undefined;
  const correzioni = conferma === 'CORREGGE' ? t(input.correzioni, 2000) : null;
  if (conferma === 'CORREGGE' && !correzioni && !(titolari && titolari.length)) {
    return { errore: precompilata.opzione === 1 ? 'Indica per conto di chi agisci (nome, cognome e codice fiscale) o descrivi la situazione' : 'Se correggi la ricostruzione, descrivi cosa non corrisponde o indica i titolari effettivi' };
  }
  const dichiaranteIn = input.dichiarante && typeof input.dichiarante === 'object' ? input.dichiarante : {};
  const dichiarante = {
    nome: t(dichiaranteIn.nome, 200) || null, qualita: t(dichiaranteIn.qualita, 200) || null,
    codiceFiscale: t(dichiaranteIn.codiceFiscale, 16).toUpperCase() || null, natoA: t(dichiaranteIn.natoA, 120) || null,
    natoIl: /^\d{4}-\d{2}-\d{2}$/.test(t(dichiaranteIn.natoIl, 10)) ? t(dichiaranteIn.natoIl, 10) : null,
    nazionalita: t(dichiaranteIn.nazionalita, 60) || null, residenza: t(dichiaranteIn.residenza, 250) || null, domicilio: t(dichiaranteIn.domicilio, 250) || null,
  };
  const ambitoIn = input.ambito && typeof input.ambito === 'object' ? input.ambito : null;
  const ambito = ambitoIn
    ? { italiaProvincia: t(ambitoIn.italiaProvincia, 60) || null, paeseUe: t(ambitoIn.paeseUe, 60) || null, paeseExtraUe: t(ambitoIn.paeseExtraUe, 60) || null, paeseRischio: t(ambitoIn.paeseRischio, 60) || null, altro: t(ambitoIn.altro, 300) || null }
    : null;
  return {
    risposta: {
      scopo, conferma, correzioni, titolari, risposte, pep, dichiarante, pepDichiarante,
      provenienzaFondi: t(input.provenienzaFondi, 1000) || null, mezziPagamento: t(input.mezziPagamento, 500) || null,
      attivita: t(input.attivita, 300) || null, ambito, canale: 'DISTANZA',
    },
  };
}

/** Indizi che il professionista deve valutare: risposte «Sì» al controllo, correzioni, PEP dichiarati. */
export function segnaliDaValutare(r: RispostaArt22, opzione?: OpzioneAv4): string[] {
  const out: string[] = [];
  if (r.scopo?.conferma === 'PRECISA' && r.scopo.testo) out.push(`il cliente ha indicato lo scopo della prestazione: «${r.scopo.testo}» — da riscontrare con scopo e natura del fascicolo (art. 19 co. 1 lett. c)`);
  if (r.conferma === 'CORREGGE') {
    out.push(opzione === 1
      ? `il cliente dichiara di NON agire in proprio${r.correzioni ? `: «${r.correzioni}»` : ''} — il titolare effettivo è il terzo per conto del quale agisce (mod. AV.4, opzione 2)`
      : 'il cliente ha corretto la ricostruzione dei titolari effettivi');
  }
  for (const x of r.risposte) if (x.risposta === 'SI') out.push(`risposta affermativa: «${x.domanda}»${x.dettagli ? ` — ${x.dettagli}` : ''}`);
  // Il PEP del dichiarante è un segnale a sé solo nell'opzione 1: nelle altre il dichiarante è l'esecutore, già nella lista.
  if (opzione === 1 && r.pepDichiarante?.pep) {
    out.push(`il dichiarante${r.dichiarante?.nome ? ` ${r.dichiarante.nome}` : ''} si è dichiarato persona politicamente esposta${r.pepDichiarante.dettagli ? ` (${r.pepDichiarante.dettagli})` : ''}`);
  }
  for (const p of r.pep) if (p.pep) out.push(`${p.nominativo} dichiarato persona politicamente esposta${p.dettagli ? ` (${p.dettagli})` : ''}`);
  if (r.provenienzaFondi) out.push(`provenienza dei fondi dichiarata: «${r.provenienzaFondi}»`);
  if (r.ambito?.paeseRischio) out.push(`attività svolta in un Paese a rischio: ${r.ambito.paeseRischio}`);
  return out;
}

// ---------------------------------------------------------------- il .docx

const casella = (v: boolean | null) => (v === null ? '☐' : v ? '☒' : '☐');
const spazioDopo0 = { spazioDopo: 0 } as const;

/** Blocco dei dati di una persona fisica come nel modello (righe etichetta/valore, vuoto = da compilare). */
function tabellaPersona(p: PersonaAv4 | null | undefined, extra: Array<[string, string]> = []): string {
  return tabellaDati([
    ['Cognome e nome', vuoto(p?.nominativo)],
    ['Codice fiscale', vuoto(p?.codiceFiscale)],
    ['Nato/a a — il', `${vuoto(p?.natoA)}  il  ${p?.natoIl ? dataIt(p.natoIl) : '__________'}`],
    ['Nazionalità', vuoto(p?.nazionalita, '☐ italiana    ☐ altra: __________')],
    ['Residenza (comune, via, n.)', vuoto(p?.residenza, RIGA)],
    ['Domicilio (se diverso dalla residenza)', vuoto(p?.domicilio, RIGA)],
    ...extra,
  ]);
}

/**
 * Corpo della dichiarazione. Senza `risposta` è il modulo da firmare in
 * presenza (caselle vuote, dati noti allo studio già scritti); con `risposta`
 * è la trascrizione di quanto il cliente ha dichiarato a distanza, che si
 * conserva nel fascicolo.
 */
export function corpoDichiarazioneArt22(dati: { tenant: any; precompilata: PrecompilataArt22; risposta?: RispostaArt22 | null; fascicoloCodice?: string | null }): string {
  const { tenant, risposta: r } = dati;
  const p = completaPrecompilata(dati.precompilata);
  const opz = p.opzione;
  const pf = opz <= 2;

  // Dichiarante: dati dello studio integrati da quanto scritto dal cliente a distanza.
  const dichiarante: PersonaAv4 & { qualita: string | null } = {
    nominativo: r?.dichiarante?.nome || p.dichiarante?.nominativo || '',
    codiceFiscale: r?.dichiarante?.codiceFiscale || p.dichiarante?.codiceFiscale || null,
    natoA: r?.dichiarante?.natoA || p.dichiarante?.natoA || null,
    natoIl: r?.dichiarante?.natoIl || p.dichiarante?.natoIl || null,
    nazionalita: r?.dichiarante?.nazionalita || p.dichiarante?.nazionalita || null,
    residenza: r?.dichiarante?.residenza || p.dichiarante?.residenza || null,
    domicilio: r?.dichiarante?.domicilio || p.dichiarante?.domicilio || null,
    qualita: r?.dichiarante?.qualita || p.dichiarante?.qualita || null,
  };

  let corpo =
    titolo1('AV.4 — Dichiarazione del cliente ex art. 22, co. 1, D.Lgs. 231/2007') +
    occhiello(
      `Modulistica CNDCEC (Regole tecniche antiriciclaggio e Informativa n. 57/2026), allegato AV.4 — resa a ${tenant.denominazione}` +
        `${dati.fascicoloCodice ? ` · fascicolo ${dati.fascicoloCodice}` : ''} · opzione ${opz} del modello: ${
          opz === 1 ? 'persona fisica che agisce in proprio' : opz === 2 ? 'persona fisica che agisce per conto di altre persone fisiche' : opz === 3 ? 'società/ente — titolare effettivo per proprietà o controllo' : 'società/ente — titolare effettivo residuale (art. 20 co. 5)'
        }`,
    ) +
    testo(
      'In ottemperanza alle disposizioni dell’art. 22 del d.lgs. 231/2007 (obblighi del cliente in materia di prevenzione e contrasto al riciclaggio, ' +
        'al finanziamento del terrorismo e al finanziamento della proliferazione delle armi di distruzione di massa), come da Nota 1 dell’Allegato alla presente ' +
        'Dichiarazione, consapevole delle sanzioni penali previste dall’art. 55, co. 3, del sopraindicato decreto (come da Nota 2 dell’Allegato), si forniscono le ' +
        'sottostanti informazioni, assumendo tutte le responsabilità di natura civile, amministrativa e penale per dichiarazioni non veritiere.',
    );

  // ── Il sottoscritto ────────────────────────────────────────────────
  corpo += titolo2('Il/La sottoscritto/a');
  corpo += tabellaPersona(dichiarante, opz === 1 ? [] : [['In qualità di', vuoto(dichiarante.qualita, opz === 2 ? 'rappresentante / procuratore di ' + p.cliente.denominazione : 'legale rappresentante di ' + p.cliente.denominazione)]]);

  corpo += titolo2('DICHIARA');

  // 1. Scopo e natura della prestazione (art. 18 co. 1 lett. c) — AR-M22.
  corpo += titolo3('1. Scopo e natura della prestazione professionale richiesta (art. 18, co. 1, lett. c)');
  if (p.prestazione) {
    const pr = p.prestazione;
    corpo += testo(
      `Il dichiarante richiede allo studio la prestazione professionale «${pr.descrizione}»` +
        ` (${pr.tipoRapporto === 'OCCASIONALE' ? 'prestazione occasionale' : 'rapporto continuativo'}${pr.dataConferimento ? `, conferita il ${dataIt(pr.dataConferimento)}` : ''}).`,
    );
    if (pr.scopoNatura) {
      corpo += testo(`Scopo e natura della prestazione, come risultano allo studio: ${pr.scopoNatura}`);
      corpo += par([run(`${casella(r?.scopo ? r.scopo.conferma === 'CONFERMA' : null)} CONFERMO che lo scopo e la natura della prestazione sono quelli descritti.`, { bold: true })]);
      corpo += par([
        run(`${casella(r?.scopo ? r.scopo.conferma === 'PRECISA' : null)} PRECISO: `, { bold: true }),
        run(r?.scopo?.conferma === 'PRECISA' ? (r.scopo.testo || '') : RIGA),
      ]);
    } else {
      corpo += par([run('Lo scopo e la natura della prestazione professionale richiesta sono: ', { bold: true }), run(r?.scopo?.testo || RIGA)]);
    }
  } else {
    corpo += par([run('che, ai sensi dell’art. 18, co. 1, lett. c), lo scopo e la natura della prestazione professionale richiesta sono: ', { bold: true }), run(r?.scopo?.testo || RIGA)]);
  }

  // 2. PEP del dichiarante.
  corpo += titolo3('2. Persona politicamente esposta (art. 1, co. 2, lett. dd) — vedi Nota 3 dell’Allegato');
  const pepD = r ? (r.pepDichiarante ?? null) : null;
  const pepDNoto = pepD ? pepD.pep : opz === 1 && p.titolari[0]?.pep === true ? true : null;
  corpo += par([run(`${casella(pepDNoto === null ? null : !pepDNoto)} di NON costituire persona politicamente esposta (PPE);`, { bold: true })]);
  corpo += par([
    run(`${casella(pepDNoto === null ? null : pepDNoto)} di costituire persona politicamente esposta (PPE): carica/incarico e, ove ricorrente, legame con il titolare della carica e sue generalità: `, { bold: true }),
    run(pepD?.pep ? (pepD.dettagli || '') : RIGA),
  ]);

  // 3. Relazioni cliente–esecutore (ove applicabile: opzioni 2, 3, 4).
  let n = 3;
  if (opz >= 2) {
    corpo += titolo3(`${n}. Relazioni intercorrenti tra il Cliente e l’esecutore (art. 18, co. 1, lett. c)`);
    corpo += testo(
      `Il dichiarante agisce per il Cliente ${p.cliente.denominazione} in qualità di ${vuoto(dichiarante.qualita, opz === 2 ? 'rappresentante / procuratore' : 'legale rappresentante')}` +
        `${opz >= 3 ? ', munito dei necessari poteri' : ', in forza del titolo indicato nella documentazione allegata'}.`,
    );
    n++;
  }

  // 4. Titolare effettivo — la sola opzione pertinente.
  corpo += titolo3(`${n}. Titolare effettivo (art. 1, co. 2, lett. pp; art. 20) — vedi Nota 4 dell’Allegato`);
  corpo += testo(
    'Ai fini dell’identificazione del titolare effettivo e dei criteri per la determinazione della titolarità effettiva di clienti diversi dalle persone fisiche, ' +
      'consapevole delle sanzioni penali previste dall’art. 55 del d.lgs. 231/2007 nel caso di falsa indicazione delle generalità del soggetto per conto del quale eventualmente viene eseguita l’operazione, dichiara:',
    {}, { punti: 9, colore: COLORI.grigio },
  );
  const soc = p.societa;
  const testoSocieta = soc
    ? `${soc.denominazione}, con sede legale in ${vuoto(soc.sedeLegale, RIGA)}, iscritta al Registro delle Imprese di ${vuoto(soc.registroImpreseDi, '__________')}` +
      `${soc.rea ? ` (REA ${soc.rea})` : ''}, numero di iscrizione e codice fiscale ${vuoto(soc.codiceFiscale, '________________')}`
    : `${p.cliente.denominazione}`;
  if (opz === 1) {
    corpo += par([run(`${casella(r ? r.conferma === 'CONFERMA' : null)} (opzione 1) di AGIRE IN PROPRIO e richiedere la prestazione per sé, attestando l’inesistenza di un diverso titolare effettivo così come previsto e definito dal d.lgs. 231/2007.`, { bold: true })]);
    corpo += par([
      run(`${casella(r ? r.conferma === 'CORREGGE' : null)} di agire per conto di altre persone fisiche (opzione 2 del modello), che sono: `, { bold: true }),
      run(r?.conferma === 'CORREGGE' ? [r.correzioni, ...(r.titolari ?? []).map((t) => `${t.nominativo}${t.codiceFiscale ? ` (${t.codiceFiscale})` : ''}`)].filter(Boolean).join('; ') : RIGA),
    ]);
    corpo += testo('(in tal caso: indicare le informazioni necessarie a identificare le persone fisiche titolari effettive e fornire la documentazione che comprova il potere di agire per loro conto)', {}, { punti: 8, colore: COLORI.grigio, italic: true });
  } else if (opz === 2) {
    corpo += par([run('(opzione 2) di AGIRE IN QUALITÀ DI ESECUTORE PER CONTO delle seguenti persone fisiche:', { bold: true })]);
    for (const t of p.titolari) corpo += tabellaPersona(t);
    corpo += testo('(fornire indicazioni/documentazione che comprovino l’esistenza del potere di agire per loro conto)', {}, { punti: 8, colore: COLORI.grigio, italic: true });
  } else if (opz === 3) {
    corpo += par([run(`(opzione 3) di AGIRE PER CONTO DELLA SOCIETÀ/ENTE ${testoSocieta}, in qualità di ${vuoto(dichiarante.qualita, 'legale rappresentante')}, munito dei necessari poteri, e che il/i titolare/i effettivo/i è/sono:`, { bold: true })]);
  } else {
    corpo += par([run(`(opzione 4) di agire per conto della società/ente ${testoSocieta}, in qualità di ${vuoto(dichiarante.qualita, 'legale rappresentante')}, munito dei necessari poteri, e ATTESTA che il titolare effettivo coincide con la persona fisica o le persone fisiche titolare/i — conformemente agli assetti organizzativi e/o statutari di riferimento — di poteri di RAPPRESENTANZA LEGALE, AMMINISTRAZIONE O DIREZIONE della società (o del cliente comunque diverso dalla persona fisica), che è/sono:`, { bold: true })]);
    corpo += testo('Caso residuale in assenza di partecipazioni rilevanti o altri tipi di controllo ai sensi dei commi da 1 a 3 dell’art. 20 d.lgs. 231/2007.', {}, { punti: 8, colore: COLORI.grigio, italic: true });
  }

  // Dati dei titolari effettivi (opzioni 3 e 4; per la 2 sono già sopra).
  if (opz >= 3) {
    const elencoTe: Array<TitolareAv4 | null> = p.titolari.length ? p.titolari : [null, null];
    elencoTe.forEach((t, i) => {
      corpo += titolo3(`Titolare effettivo ${i + 1}${t ? ` — ${t.nominativo}` : ''}`);
      corpo += tabellaPersona(t, [['Relazioni intercorrenti tra il Cliente e il titolare effettivo (art. 18, co. 1, lett. c)', vuoto(t?.relazione, RIGA)]]);
      const x = t ? r?.pep.find((y) => y.nominativo === t.nominativo) ?? null : null;
      const notoPep = x ? x.pep : r ? null : t?.pep ?? null;
      corpo += par([run(`${casella(notoPep === null ? null : !notoPep)} il titolare effettivo NON costituisce persona politicamente esposta (art. 1, co. 2, lett. dd)`)], spazioDopo0);
      corpo += par([
        run(`${casella(notoPep === null ? null : notoPep)} il titolare effettivo costituisce persona politicamente esposta in quanto (carica/incarico, legame e generalità — Nota 3): `),
        run(x?.pep ? (x.dettagli || '') : RIGA),
      ]);
      if (t?.fonte === 'PROPOSTO') corpo += testo(`Individuato dal programma in base ai dati camerali: ${t.etichettaCriterio}. Da riscontrare.`, spazioDopo0, { punti: 8, colore: COLORI.grigio, italic: true });
    });
    if (r?.conferma === 'CONFERMA' || r?.conferma === 'CORREGGE' || !r) {
      corpo += par([run(`${casella(r ? r.conferma === 'CONFERMA' : null)} CONFERMO che i titolari effettivi indicati corrispondono alla situazione effettiva.`, { bold: true })]);
      corpo += par([
        run(`${casella(r ? r.conferma === 'CORREGGE' : null)} CORREGGO: la situazione effettiva è la seguente: `, { bold: true }),
        run(r?.conferma === 'CORREGGE' ? (r.correzioni || '') : RIGA),
      ]);
      if (r?.conferma === 'CORREGGE' && r.titolari?.length) {
        corpo += testo(`Titolari effettivi indicati dal cliente: ${r.titolari.map((t) => `${t.nominativo}${t.codiceFiscale ? ` (${t.codiceFiscale})` : ''}${t.quota ? ` — ${t.quota}%` : ''}`).join('; ')}.`);
      }
    }
  }
  n++;

  // 5. Domande di controllo (art. 20 co. 3) — solo società/enti.
  if (p.domande.length) {
    corpo += titolo3(`${n}. Informazioni che risultano solo al cliente (art. 20, co. 3)`);
    corpo += testo('La visura camerale non riporta patti, accordi o vincoli che possono attribuire il controllo a soggetti diversi da quelli indicati. Il dichiarante risponde:');
    const righeD: Cella[][] = [rigaIntestazione(['Domanda', 'Sì', 'No', 'Se sì, precisare'], [5240, 600, 600, 3200])];
    for (const d of p.domande) {
      const rr = r?.risposte.find((x) => x.domanda === d) ?? null;
      righeD.push([
        { contenuto: par(run(d), spazioDopo0), larghezza: 5240 },
        { contenuto: par(run(casella(rr ? rr.risposta === 'SI' : null)), { allinea: 'center', spazioDopo: 0 }), larghezza: 600 },
        { contenuto: par(run(casella(rr ? rr.risposta === 'NO' : null)), { allinea: 'center', spazioDopo: 0 }), larghezza: 600 },
        { contenuto: par(run(rr?.risposta === 'SI' ? rr.dettagli ?? '' : ' '), spazioDopo0), larghezza: 3200 },
      ]);
    }
    corpo += tabella(righeD, { larghezze: [5240, 600, 600, 3200] });
    n++;
  }

  // 6-7. Situazione economico-patrimoniale / provenienza dei fondi; mezzi di pagamento.
  corpo += titolo3(`${n}. Situazione economico-patrimoniale e/o provenienza dei fondi utilizzati nell’operazione`);
  corpo += par([run('che la situazione economico-patrimoniale e/o la provenienza dei fondi utilizzati nell’operazione sono le seguenti: '), run(vuoto(r?.provenienzaFondi, RIGA))]);
  n++;
  corpo += titolo3(`${n}. Mezzi di pagamento`);
  corpo += par([
    run('che i mezzi di pagamento forniti dal Cliente al Professionista per compiere, per conto e/o in nome del medesimo Cliente, operazione/i di natura finanziaria, sono i seguenti: '),
    run(vuoto(r?.mezziPagamento, RIGA)),
  ]);
  corpo += testo('(ove la prestazione professionale abbia ad oggetto una operazione, come definita dall’art. 1, co. 2, lett. t), d.lgs. 231/2007)', {}, { punti: 8, colore: COLORI.grigio, italic: true });
  n++;

  // 8. Dichiarazioni fisse del modello.
  corpo += titolo3(`${n}. Fondi e misure di congelamento`);
  corpo += elenco([
    'che i fondi e le risorse economiche eventualmente utilizzati non provengono né sono destinati a un’attività criminosa o al finanziamento del terrorismo di cui all’art. 2, co. 6, del d.lgs. 231/2007 (vedi Nota 1 dell’Allegato) o al finanziamento della proliferazione delle armi di distruzione di massa;',
    'di non essere destinatario di misure di congelamento di fondi e risorse economiche di cui al d.lgs. 109/2007.',
  ]);
  n++;

  // 9. Attività e settore.
  corpo += titolo3(`${n}. Attività e settore merceologico principale`);
  const attivita = r?.attivita || [p.attivita?.descrizione, p.attivita?.ateco ? `ATECO ${p.attivita.ateco}` : null, p.attivita?.settore ? `settore: ${p.attivita.settore}` : null].filter(Boolean).join(' — ');
  corpo += par([run('che l’attività (produzione, commercio, servizi, ecc.) e il settore merceologico principale dell’attività svolta sono: '), run(vuoto(attivita, RIGA))]);
  n++;

  // 10. Ambito territoriale.
  corpo += titolo3(`${n}. Ambito territoriale in cui viene svolta prevalentemente l’attività (ammesse più opzioni)`);
  const amb = r?.ambito ?? null;
  const pre = p.ambito ?? null;
  const italia = amb ? Boolean(amb.italiaProvincia) : pre?.classe === 'ITALIA';
  const ue = amb ? Boolean(amb.paeseUe) : pre?.classe === 'UE';
  const extra = amb ? Boolean(amb.paeseExtraUe) : pre?.classe === 'EXTRA_UE';
  const rischio = amb ? Boolean(amb.paeseRischio) : pre?.classe === 'RISCHIO';
  const noto = Boolean(amb || pre?.classe);
  corpo += par([run(`${casella(noto ? italia : null)} Italia — Provincia: `), run(vuoto(amb?.italiaProvincia ?? (italia ? pre?.provincia : null), '__________'))], spazioDopo0);
  corpo += par([run(`${casella(noto ? ue : null)} Paese UE: `), run(vuoto(amb?.paeseUe ?? (ue ? pre?.paese : null), '__________'))], spazioDopo0);
  corpo += par([run(`${casella(noto ? extra : null)} Paese extra UE: `), run(vuoto(amb?.paeseExtraUe ?? (extra ? pre?.paese : null), '__________'))], spazioDopo0);
  corpo += par([run(`${casella(noto ? rischio : null)} Paese a rischio riciclaggio/finanziamento del terrorismo: `), run(vuoto(amb?.paeseRischio ?? (rischio ? pre?.paese : null), '__________'))], spazioDopo0);
  corpo += par([run('(altro eventualmente da specificare sull’ambito territoriale) '), run(vuoto(amb?.altro, RIGA))]);

  // Dichiara espressamente / si impegna / privacy.
  corpo += titolo2('Dichiara espressamente');
  corpo += elenco([
    'di aver esaminato e compreso le definizioni di «riciclaggio», «finanziamento al terrorismo», «persone politicamente esposte» e di «titolare effettivo» contenute nell’Allegato alla presente dichiarazione;',
    'di essere consapevole delle sanzioni penali previste dall’art. 55, co. 3, d.lgs. 231/2007, per chi fornisce dati falsi o informazioni non veritiere;',
    'di essere stato informato della circostanza che il mancato rilascio in tutto o in parte delle informazioni di cui sopra pregiudica la possibilità per il Professionista di dare esecuzione alla prestazione professionale richiesta.',
  ]);
  corpo += titolo2('Si impegna');
  corpo += testo('a comunicare senza ritardo ogni eventuale integrazione o variazione dei dati sopra indicati.');
  corpo += testo(
    'Il sottoscritto prende atto, infine, che i propri dati personali saranno trattati esclusivamente per le finalità previste dal d.lgs. 231/2007 in adempimento degli obblighi previsti da Leggi e Regolamenti per la protezione dei dati.',
  );
  if (r?.canale === 'DISTANZA') {
    corpo += testo(
      `Dichiarazione resa a distanza tramite il modulo sicuro dello studio${r.resaIl ? ` il ${new Date(r.resaIl).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}` : ''}` +
        `${dichiarante.nominativo ? ` da ${dichiarante.nominativo}` : ''}, con accettazione esplicita della dichiarazione di veridicità (art. 22 co. 1; art. 55 co. 3). Il documento è la trascrizione integrale di quanto dichiarato e si conserva nel fascicolo (art. 31).`,
      {}, { punti: 9, colore: COLORI.grigio },
    );
  } else {
    corpo += bloccoFirma('Firma del Cliente o dell’Esecutore', dichiarante.nominativo || VUOTO);
  }

  // ── Allegato: note del modello ────────────────────────────────────
  corpo += interruzionePagina();
  corpo += titolo1('Allegato alla Dichiarazione del Cliente');
  corpo += allegatoNote();
  corpo += bloccoFirma('Per ricevuta e presa visione — Firma del Cliente o dell’Esecutore', dichiarante.nominativo || VUOTO);

  // ── Allegato B (a uso dello studio): dati usati per la precompilazione ──
  if (!pf && !p.senzaCompagine) {
    corpo += interruzionePagina();
    corpo += titolo2('Allegato B — dati camerali utilizzati per la precompilazione (a uso dello studio)');
    corpo += testo(
      `Dalla visura camerale${p.fonte.visuraDel ? ` estratta il ${dataIt(p.fonte.visuraDel)}` : ''}${p.fonte.dataElencoSoci ? ` (elenco soci al ${dataIt(p.fonte.dataElencoSoci)})` : ''} risulta che il capitale sociale` +
        `${p.fonte.capitaleSottoscritto != null ? ` di euro ${euro(p.fonte.capitaleSottoscritto)}` : ''} è così ripartito:`,
    );
    const righe: Cella[][] = [rigaIntestazione(['Socio', 'Natura', 'Quota', 'Diritto'], [4440, 2000, 1400, 1800])];
    for (const s of p.ripartizione) {
      righe.push([
        { contenuto: par(run(s.nome + (s.paese && s.paese !== 'IT' ? ` (${s.paese})` : '')), spazioDopo0), larghezza: 4440 },
        { contenuto: par(run(s.tipo.replace(/_/g, ' ').toLowerCase()), spazioDopo0), larghezza: 2000 },
        { contenuto: par(run(pct(s.quotaPercento)), { allinea: 'center', spazioDopo: 0 }), larghezza: 1400 },
        { contenuto: par(run(s.diritto.replace(/_/g, ' ').toLowerCase()), spazioDopo0), larghezza: 1800 },
      ]);
    }
    corpo += tabella(righe, { larghezze: [4440, 2000, 1400, 1800] });
    if (p.cariche.length) corpo += testo(`Cariche risultanti: ${p.cariche.map((c) => `${c.nome} (${c.carica}${c.rappresentanzaLegale ? ', rappresentante dell’impresa' : ''})`).join('; ')}.`, {}, { punti: 9, colore: COLORI.grigio });
    if (p.titolariProposti.length) {
      corpo += testo(`Titolari effettivi individuati applicando l’art. 20: ${p.titolariProposti.map((t) => `${t.nominativo} — ${t.etichettaCriterio}${t.quota != null ? ` (${pct(t.quota)})` : ''}`).join('; ')}.`, {}, { punti: 9, colore: COLORI.grigio });
    } else {
      corpo += testo('In base alla ripartizione nessuna persona fisica supera la soglia di legge: si applicano, nell’ordine, il criterio del controllo (art. 20 co. 3) e quello residuale (art. 20 co. 5).', {}, { punti: 9, colore: COLORI.grigio });
    }
  }
  corpo += titolo3('Nota per il professionista');
  corpo += testo(
    'La dichiarazione del cliente non sostituisce la valutazione del professionista: i titolari effettivi si registrano nel programma dopo aver riscontrato le informazioni (artt. 19 co. 1 lett. b) e 20-22); lo scopo dichiarato si riscontra con quello del fascicolo (art. 19 co. 1 lett. c). ' +
      `Modello precompilato dal programma (opzione ${opz})${p.fonte.visuraDel ? ` dalla visura del ${dataIt(p.fonte.visuraDel)}` : ' dai dati in archivio'}` +
      `${p.titolari.some((t) => t.fonte === 'REGISTRATO') ? '; titolari effettivi dalla fotografia registrata' : p.titolari.some((t) => t.fonte === 'PROPOSTO') ? '; titolari effettivi PROPOSTI dal programma, non ancora registrati' : ''}` +
      `${p.alert.length ? `; alert della titolarità: ${p.alert.join(', ')}` : ''}. Le sezioni «provenienza dei fondi» e «mezzi di pagamento» si compilano in funzione del rischio (art. 25: obbligatorie con verifica rafforzata).`,
    {}, { punti: 8, colore: COLORI.grigio },
  );
  return corpo;
}

/** Note 1-4 dell'Allegato al modello AV.4 (definizioni di legge). */
function allegatoNote(): string {
  let a = '';
  a += titolo3('(Nota 1)');
  a += testo('Per «riciclaggio» (art. 2, co. 4 e 5, d.lgs. 231/2007) si intende:');
  a += elenco([
    'la conversione o il trasferimento di beni, effettuati essendo a conoscenza che essi provengono da un’attività criminosa o da una partecipazione a tale attività, allo scopo di occultare o dissimulare l’origine illecita dei beni medesimi o di aiutare chiunque sia coinvolto in tale attività a sottrarsi alle conseguenze giuridiche delle proprie azioni;',
    'l’occultamento o la dissimulazione della reale natura, provenienza, ubicazione, disposizione, movimento, proprietà dei beni o dei diritti sugli stessi, effettuati essendo a conoscenza che tali beni provengono da un’attività criminosa o da una partecipazione a tale attività;',
    'l’acquisto, la detenzione o l’utilizzazione di beni essendo a conoscenza, al momento della loro ricezione, che tali beni provengono da un’attività criminosa o da una partecipazione a tale attività;',
    'la partecipazione ad uno degli atti di cui alle lettere a), b) e c), l’associazione per commettere tale atto, il tentativo di perpetrarlo, il fatto di aiutare, istigare o consigliare qualcuno a commetterlo o il fatto di agevolarne l’esecuzione.',
  ]);
  a += testo('Il riciclaggio è considerato tale anche se le attività che hanno generato i beni da riciclare si sono svolte fuori dai confini nazionali. La conoscenza, l’intenzione o la finalità, che debbono costituire un elemento delle azioni di cui al comma 4, possono essere dedotte da circostanze di fatto obiettive.');
  a += testo('Per «finanziamento al terrorismo» si intende qualsiasi attività diretta, con ogni mezzo, alla fornitura, alla raccolta, alla provvista, all’intermediazione, al deposito, alla custodia o all’erogazione, in qualunque modo realizzate, di fondi e risorse economiche, direttamente o indirettamente, in tutto o in parte, utilizzabili per il compimento di una o più condotte, con finalità di terrorismo secondo quanto previsto dalle leggi penali, ciò indipendentemente dall’effettivo utilizzo dei fondi e delle risorse economiche per la commissione delle condotte anzidette (art. 2, co. 6, d.lgs. 231/2007).');
  a += testo('Per «finanziamento dei programmi di proliferazione delle armi di distruzione di massa» si intende la fornitura o la raccolta di fondi e risorse economiche, in qualunque modo realizzata e strumentale, direttamente o indirettamente, a sostenere o favorire tutte quelle attività legate all’ideazione o alla realizzazione di programmi volti a sviluppare strumenti bellici di natura nucleare o chimica o batteriologica (art. 1, lett. e), d.lgs. 109/2007).');
  a += titolo3('(Nota 2)');
  a += testo('Ai sensi dell’art. 55, co. 3, del d.lgs. 231/2007 il soggetto (obbligato, ai sensi della normativa antiriciclaggio, a fornire i dati e le informazioni necessarie ai fini dell’adeguata verifica della clientela) che fornisce dati falsi o informazioni non veritiere è punito con la reclusione da sei mesi a tre anni e con la multa da 10.000 euro a 30.000 euro, salvo che il fatto costituisca più grave reato.');
  a += titolo3('(Nota 3)');
  a += testo('Per «persone politicamente esposte» (art. 1, co. 2, lett. dd), d.lgs. 231/2007) si intendono le persone fisiche che occupano o hanno cessato di occupare da meno di un anno importanti cariche pubbliche, nonché i loro familiari e coloro che con i predetti soggetti intrattengono notoriamente stretti legami, come di seguito elencate:');
  a += testo('1) sono persone fisiche che occupano o hanno occupato importanti cariche pubbliche coloro che ricoprono o hanno ricoperto la carica di:');
  a += elenco([
    '1.1 Presidente della Repubblica, Presidente del Consiglio, Ministro, Vice-Ministro e Sottosegretario, Presidente di Regione, assessore regionale, Sindaco di capoluogo di provincia o città metropolitana, Sindaco di comune con popolazione non inferiore a 15.000 abitanti nonché cariche analoghe in Stati esteri;',
    '1.2 deputato, senatore, parlamentare europeo, consigliere regionale nonché cariche analoghe in Stati esteri;',
    '1.3 membro degli organi direttivi centrali di partiti politici;',
    '1.4 giudice della Corte Costituzionale, magistrato della Corte di Cassazione o della Corte dei conti, consigliere di Stato e altri componenti del Consiglio di Giustizia Amministrativa per la Regione siciliana nonché cariche analoghe in Stati esteri;',
    '1.5 membro degli organi direttivi delle banche centrali e delle autorità indipendenti;',
    '1.6 ambasciatore, incaricato d’affari ovvero cariche equivalenti in Stati esteri, ufficiale di grado apicale delle forze armate ovvero cariche analoghe in Stati esteri;',
    '1.7 componente degli organi di amministrazione, direzione o controllo delle imprese controllate, anche indirettamente, dallo Stato italiano o da uno Stato estero ovvero partecipate, in misura prevalente o totalitaria, dalle Regioni, da comuni capoluoghi di provincia e città metropolitane e da comuni con popolazione complessivamente non inferiore a 15.000 abitanti;',
    '1.8 direttore generale di ASL e di azienda ospedaliera, di azienda ospedaliera universitaria e degli altri enti del servizio sanitario nazionale;',
    '1.9 direttore, vicedirettore e membro dell’organo di gestione o soggetto svolgente funzioni equivalenti in organizzazioni internazionali;',
  ]);
  a += testo('2) sono familiari di persone politicamente esposte: i genitori, il coniuge o la persona legata in unione civile o convivenza di fatto o istituti assimilabili alla persona politicamente esposta, i figli e i loro coniugi nonché le persone legate ai figli in unione civile o convivenza di fatto o istituti assimilabili;');
  a += testo('3) sono soggetti con i quali le persone politicamente esposte intrattengono notoriamente stretti legami: 3.1 le persone fisiche che, ai sensi del presente decreto, detengono, congiuntamente alla persona politicamente esposta, la titolarità effettiva di enti giuridici, trust e istituti giuridici affini ovvero che intrattengono con la persona politicamente esposta stretti rapporti d’affari; 3.2 le persone fisiche che detengono solo formalmente il controllo totalitario di un’entità notoriamente costituita, di fatto, nell’interesse e a beneficio di una persona politicamente esposta.');
  a += titolo3('(Nota 4)');
  a += testo('Per «titolare effettivo» si intende la persona fisica o le persone fisiche, diverse dal cliente, nell’interesse della quale o delle quali, in ultima istanza, il rapporto continuativo è instaurato, la prestazione professionale è resa o l’operazione è eseguita (art. 1, co. 2, lett. pp), d.lgs. 231/2007). Si indicano di seguito i criteri individuati dalla norma ai fini della individuazione del titolare effettivo — art. 20 del d.lgs. 231/2007 (Criteri per la determinazione della titolarità effettiva di clienti diversi dalle persone fisiche):');
  a += elenco([
    '1. Il titolare effettivo di clienti diversi dalle persone fisiche coincide con la persona fisica o le persone fisiche cui, in ultima istanza, è attribuibile la proprietà diretta o indiretta dell’ente ovvero il relativo controllo.',
    '2. Nel caso in cui il cliente sia una società di capitali: a) costituisce indicazione di proprietà diretta la titolarità di una partecipazione superiore al 25 per cento del capitale del cliente, detenuta da una persona fisica; b) costituisce indicazione di proprietà indiretta la titolarità di una percentuale di partecipazioni superiore al 25 per cento del capitale del cliente, posseduto per il tramite di società controllate, società fiduciarie o per interposta persona.',
    '3. Nelle ipotesi in cui l’esame dell’assetto proprietario non consenta di individuare in maniera univoca la persona fisica o le persone fisiche cui è attribuibile la proprietà diretta o indiretta dell’ente, il titolare effettivo coincide con la persona fisica o le persone fisiche cui, in ultima istanza, è attribuibile il controllo del medesimo in forza: a) del controllo della maggioranza dei voti esercitabili in assemblea ordinaria; b) del controllo di voti sufficienti per esercitare un’influenza dominante in assemblea ordinaria; c) dell’esistenza di particolari vincoli contrattuali che consentano di esercitare un’influenza dominante.',
    '4. Nel caso in cui il cliente sia una persona giuridica privata, di cui al decreto del Presidente della Repubblica 10 febbraio 2000, n. 361, sono cumulativamente individuati, come titolari effettivi: a) i fondatori, ove in vita; b) i beneficiari, quando individuati o facilmente individuabili; c) i titolari di funzioni di rappresentanza legale, direzione e amministrazione.',
    '5. Qualora l’applicazione dei criteri di cui ai precedenti commi non consenta di individuare univocamente uno o più titolari effettivi, il titolare effettivo coincide con la persona fisica o le persone fisiche titolari, conformemente ai rispettivi assetti organizzativi o statutari, di poteri di rappresentanza legale, amministrazione o direzione della società o del cliente comunque diverso dalla persona fisica.',
    '6. I soggetti obbligati conservano traccia delle verifiche effettuate ai fini dell’individuazione del titolare effettivo nonché, con specifico riferimento al titolare effettivo individuato ai sensi del comma 5, delle ragioni che non hanno consentito di individuare il titolare effettivo ai sensi dei commi 1, 2, 3 e 4 del presente articolo.',
  ]);
  return a;
}
