/**
 * PARSER DELLA VISURA CAMERALE — `leggiVisura()` (AR-M17)
 *
 * Funzione PURA sul testo a righe/celle prodotto da `visura-testo.ts`
 * (celle separate da tabulazione; cella iniziale vuota = continuazione del
 * valore della riga precedente). Niente AI, niente rete: il PDF non esce
 * dallo studio e il risultato è riproducibile e testabile su fixture.
 *
 * Regole di prudenza (spec §2.2):
 *  - MAI inventare: un campo non riconosciuto resta vuoto e finisce in
 *    `campiNonTrovati`, così l'utente sa cosa completare a mano;
 *  - la natura giuridica si propone da una mappa esplicita sulla forma
 *    giuridica letterale; ciò che non è in mappa resta un'ipotesi
 *    (`tipoProposto` con `tipoIncerto = true`);
 *  - il testo grezzo non si conserva: vive nello stato del modal.
 *
 * Layout di riferimento: visura ordinaria/storica InfoCamere (Registro
 * Imprese, «Archivio ufficiale della CCIAA»), sezioni numerate «1 Sede»,
 * «2 Informazioni da statuto/atto costitutivo», «3 Capitale e strumenti
 * finanziari», «4 Soci e titolari di diritti su azioni e quote»,
 * «5 Amministratori», «6 Attività, albi ruoli e licenze». Le visure dei
 * rivenditori che rimaneggiano il layout danno campi vuoti, non errori.
 */

import type { CodiceCarica, DirittoPartecipazione } from '../../../worker/src/domain/titolare-effettivo';

export type TipoSoggetto = 'PERSONA_FISICA' | 'PERSONA_GIURIDICA' | 'FIDUCIARIA' | 'TRUST' | 'ALTRO';

export interface SocioVisura {
  /** Chiave stabile: CF se presente, altrimenti il nome normalizzato. */
  id: string;
  nome: string;
  codiceFiscale: string | null;
  tipo: TipoSoggetto;
  quotaNominale: number | null;
  /** Percentuale 0..100 sul capitale sottoscritto (quote proprie escluse). */
  quotaPercento: number | null;
  /** Percentuale come stampata nella sintesi, se presente (arrotondata dalla Camera). */
  quotaPercentoSintesi: number | null;
  versato: number | null;
  diritto: DirittoPartecipazione;
  dirittoTesto: string | null;
  /** La riga è la società stessa. */
  quoteProprie: boolean;
  /** Più titolari sulla stessa quota di proprietà. */
  comproprieta: boolean;
  domicilio: string | null;
  pec: string | null;
  paese: string | null;
  /** Vero se il socio compare solo nella sintesi (senza blocco di dettaglio) o viceversa. */
  soloSintesi?: boolean;
}

export interface CaricaVisura {
  id: string;
  nome: string;
  codiceFiscale: string | null;
  carica: CodiceCarica;
  caricaTesto: string;
  rappresentanzaLegale: boolean;
  natoA: string | null;
  dataNascita: string | null;
  dataNomina: string | null;
  durata: string | null;
  domicilio: string | null;
  pec: string | null;
  poteri: string | null;
  paese: string | null;
}

export interface VisuraLetta {
  tipoVisura: 'ORDINARIA' | 'STORICA' | null;
  formaVisura: string | null;
  denominazione: string | null;
  codiceFiscale: string | null;
  partitaIva: string | null;
  formaGiuridica: string | null;
  /** Natura giuridica proposta per `clienti.tipo`. */
  tipoProposto: string;
  tipoIncerto: boolean;
  rea: string | null;
  pec: string | null;
  sede: { indirizzo: string | null; cap: string | null; comune: string | null; provincia: string | null; testo: string | null };
  ateco: string | null;
  atecoVersione: string | null;
  attivitaPrevalente: string | null;
  oggettoSociale: string | null;
  statoAttivita: string | null;
  inLiquidazione: boolean;
  proceduraConcorsuale: string | null;
  capitale: { deliberato: number | null; sottoscritto: number | null; versato: number | null };
  dataCostituzione: string | null;
  dataIscrizione: string | null;
  dataInizioAttivita: string | null;
  dataEstrazione: string | null;
  dataElencoSoci: string | null;
  numeroDocumento: string | null;
  soci: SocioVisura[];
  cariche: CaricaVisura[];
  /** Etichette cercate e non trovate: alimentano la telemetria anonima. */
  campiNonTrovati: string[];
  avvisi: string[];
}

// ───────────────────────────────────────────────────────── utilità di base

type Riga = { celle: string[]; continua: boolean; testo: string };

function righe(testo: string): Riga[] {
  return testo
    .split(/\r?\n/)
    .filter((r) => r.trim() !== '' && r.trim() !== '\f')
    .map((r) => {
      const celle = r.replace(/\f/g, '').split('\t');
      const continua = celle[0] === '';
      return { celle: continua ? celle.slice(1) : celle, continua, testo: celle.filter(Boolean).join(' ').trim() };
    });
}

const RE_CF_PF = /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/;
const RE_CF_PG = /^\d{11}$/;
const RE_DATA = /(\d{2})\/(\d{2})\/(\d{4})/;

export function dataIso(it: string | null | undefined): string | null {
  const m = it ? RE_DATA.exec(it) : null;
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function numeroIt(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?/.exec(s);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function normalizzaSpazi(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Prima riga il cui primo cella comincia con una delle etichette (case-insensitive). */
function trovaRiga(rs: Riga[], etichette: string[], da = 0, a = rs.length): number {
  for (let i = da; i < a; i++) {
    const c0 = rs[i].celle[0]?.toLowerCase() ?? '';
    if (etichette.some((e) => c0.startsWith(e.toLowerCase()))) return i;
  }
  return -1;
}

/** Valore di una riga etichetta→valore, con le continuazioni. */
function valoreDa(rs: Riga[], i: number, maxContinuazioni = 6): string {
  if (i < 0) return '';
  const parti = [rs[i].celle.slice(1).join(' ')];
  for (let j = i + 1; j < rs.length && j <= i + maxContinuazioni; j++) {
    if (!rs[j].continua) break;
    parti.push(rs[j].celle.join(' '));
  }
  return normalizzaSpazi(parti.join(' '));
}

function valoreDopo(testo: string, re: RegExp): string | null {
  const m = re.exec(testo);
  return m ? normalizzaSpazi(m[1]) : null;
}

/** Indice della riga «N Titolo» di sezione. */
function sezione(rs: Riga[], titolo: RegExp): number {
  for (let i = 0; i < rs.length; i++) {
    if (!rs[i].continua && rs[i].celle.length === 1 && /^\d{1,2} /.test(rs[i].celle[0]) && titolo.test(rs[i].celle[0])) return i;
  }
  return -1;
}

/** Fine della sezione che inizia in `da`: la prossima riga «N Titolo». */
function fineSezione(rs: Riga[], da: number): number {
  for (let i = da + 1; i < rs.length; i++) {
    if (!rs[i].continua && rs[i].celle.length === 1 && /^\d{1,2} [A-ZÀ-Ü]/.test(rs[i].celle[0]) && !/\.{3}/.test(rs[i].celle[0])) return i;
  }
  return rs.length;
}

// ───────────────────────────────────────────── mappe esplicite di dominio

const MAPPA_FORMA_GIURIDICA: Array<[RegExp, string]> = [
  [/responsabilita' limitata|responsabilità limitata|per azioni|accomandita per azioni|cooperativ|consortile a responsabilita|societa' europea/i, 'SOCIETA_CAPITALI'],
  [/nome collettivo|accomandita semplice|societa' semplice|società semplice/i, 'SOCIETA_PERSONE'],
  [/impresa individuale|ditta individuale|imprenditore individuale|piccolo imprenditore/i, 'PERSONA_FISICA'],
  [/associazione|fondazione|ente|comitato|onlus|impresa sociale/i, 'ENTE_NON_PROFIT'],
  [/\btrust\b/i, 'TRUST'],
];

// Le visure scrivono le cariche anche al femminile («amministratrice unica»,
// «consigliera», «liquidatrice»): le forme vanno riconosciute entrambe.
const MAPPA_CARICHE: Array<[RegExp, CodiceCarica]> = [
  [/amministrat(?:ore|rice) unic[oa]/i, 'AMMINISTRATORE_UNICO'],
  [/presidente (?:del )?consiglio(?: di)?(?: amministrazione)?|presidente cda|presidente del c\.d\.a/i, 'PRESIDENTE_CDA'],
  [/vice ?president/i, 'VICE_PRESIDENTE_CDA'],
  [/amministrat(?:ore|rice) delegat[oa]|consiglier[ea] delegat[oa]/i, 'CONSIGLIERE_DELEGATO'],
  [/consiglier[ea]|componente (?:del )?consiglio/i, 'CONSIGLIERE'],
  [/soci[oa] amministrat(?:ore|rice)|soci[oa] accomandatari[oa]|amministrat(?:ore|rice)(?! )$/i, 'SOCIO_AMMINISTRATORE'],
  [/^titolare|titolare firmatari[oa]|titolare dell'impresa/i, 'TITOLARE'],
  [/liquidat(?:ore|rice)/i, 'LIQUIDATORE'],
  [/procurat(?:ore|rice)/i, 'PROCURATORE'],
  [/institore/i, 'INSTITORE'],
  [/sindac[oa]/i, 'SINDACO'],
  [/revisor[ea]/i, 'REVISORE'],
  [/curat(?:ore|rice)|commissari[oa]/i, 'CURATORE'],
];

/**
 * Quando una persona cumula più cariche (consigliere e presidente del CdA), la
 * carica «principale» è quella con più peso ai fini dell'esecutore e del
 * criterio residuale: l'ordine qui sotto lo decide.
 */
const PESO_CARICA: Record<string, number> = {
  AMMINISTRATORE_UNICO: 10, LIQUIDATORE: 9, CURATORE: 9, PRESIDENTE_CDA: 8, CONSIGLIERE_DELEGATO: 7, VICE_PRESIDENTE_CDA: 6,
  SOCIO_AMMINISTRATORE: 6, TITOLARE: 6, CONSIGLIERE: 5, INSTITORE: 4, PROCURATORE: 3, SINDACO: 2, REVISORE: 2, ALTRO: 0,
};

const MAPPA_DIRITTI: Array<[RegExp, DirittoPartecipazione]> = [
  [/nuda propriet/i, 'NUDA_PROPRIETA'],
  [/compropriet/i, 'COMPROPRIETA'],
  [/propriet/i, 'PROPRIETA'],
  [/usufrutt/i, 'USUFRUTTO'],
  [/pegno/i, 'PEGNO'],
  [/sequestro/i, 'SEQUESTRO'],
  [/pignoramento/i, 'PIGNORAMENTO'],
];

function mappaCarica(testo: string): CodiceCarica {
  for (const [re, c] of MAPPA_CARICHE) if (re.test(testo)) return c;
  return 'ALTRO';
}

function mappaDiritto(testo: string | null): DirittoPartecipazione {
  if (!testo) return 'PROPRIETA';
  for (const [re, d] of MAPPA_DIRITTI) if (re.test(testo)) return d;
  return 'ALTRO';
}

export function tipoSoggetto(nome: string, cf: string | null): TipoSoggetto {
  if (/\btrust\b/i.test(nome)) return 'TRUST';
  if (/fiduciari/i.test(nome)) return 'FIDUCIARIA';
  if (cf && RE_CF_PF.test(cf)) return 'PERSONA_FISICA';
  if (cf && RE_CF_PG.test(cf)) return 'PERSONA_GIURIDICA';
  if (/\b(s\.?r\.?l\.?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|s\.?s\.?|srl|spa|snc|sas|societa'|società|gmbh|ltd|limited|inc|llc|sa|nv|bv|ag|sarl|holding)\b/i.test(nome)) return 'PERSONA_GIURIDICA';
  if (cf === null && /^[A-ZÀ-Ü' ]+$/.test(nome) && nome.split(' ').length <= 4) return 'PERSONA_FISICA';
  return 'ALTRO';
}

/** Paese dal CF (estero = provincia di nascita «Z…») o dal domicilio, se estero. */
function paeseDa(cf: string | null, domicilio: string | null): string | null {
  if (cf && RE_CF_PF.test(cf)) return cf[11] === 'Z' ? null : 'IT'; // nato all'estero: residenza non deducibile dal CF
  if (cf && RE_CF_PG.test(cf)) return 'IT';
  // InfoCamere indica «(EE)» per gli indirizzi esteri senza dire il Paese:
  // si restituisce 'EE' (estero non specificato), che il motore degli alert
  // tratta come estero e l'interfaccia chiede di precisare.
  const m = domicilio ? /\(([A-Z]{2})\)/.exec(domicilio) : null;
  if (m && /^(EE|XX)$/.test(m[1])) return 'EE';
  return domicilio ? 'IT' : null;
}

// ───────────────────────────────────────────────────── lettura dei campi

export function leggiVisura(testo: string): VisuraLetta {
  const rs = righe(testo);
  const tutto = rs.map((r) => r.celle.join('\t')).join('\n');
  const nonTrovati: string[] = [];
  const avvisi: string[] = [];
  const cerca = (etichetta: string, valore: string | null): string | null => {
    if (!valore) nonTrovati.push(etichetta);
    return valore || null;
  };

  // Intestazione: tipo e forma della visura.
  const intest = /VISURA (ORDINARIA|STORICA)\s+(.+)$/im.exec(tutto);
  const tipoVisura = intest ? (intest[1].toUpperCase() as 'ORDINARIA' | 'STORICA') : null;
  const formaVisura = intest ? normalizzaSpazi(intest[2]) : null;
  if (!intest) avvisi.push('Intestazione «VISURA ORDINARIA/STORICA» non trovata: il documento potrebbe non essere una visura del Registro Imprese.');

  // Documento e data di estrazione (piè di pagina, ripetuto).
  const numeroDocumento = valoreDopo(tutto, /Documento n\s*\.?\s*([A-Z0-9 ]{8,40}?)(?:\s+estratto|\n)/i);
  const dataEstrazione = dataIso(valoreDopo(tutto, /estratto dal Registro Imprese in data\s+(\d{2}\/\d{2}\/\d{4})/i));
  if (!dataEstrazione) nonTrovati.push('Data di estrazione');

  // Sezioni.
  const iSede = sezione(rs, /^\d+ Sede/i);
  const iStatuto = sezione(rs, /^\d+ Informazioni da statuto/i);
  const iCapitale = sezione(rs, /^\d+ Capitale/i);
  const iSoci = sezione(rs, /^\d+ Soci e titolari/i);
  const iAmm = sezione(rs, /^\d+ (Amministratori|Titolare|Soci amministratori|Titolare e |Amministratori e )/i);
  const iAttivita = sezione(rs, /^\d+ Attivit/i);
  const iProcedure = sezione(rs, /^\d+ (Scioglimento|Procedure concorsuali|Liquidazione)/i);

  // Denominazione: «Denominazione: X» in sezione 2, altrimenti la riga a piè di pagina «Registro Imprese\tX».
  let denominazione = valoreDopo(tutto, /Denominazione:\s*([^\n\t]+)/i);
  if (!denominazione) {
    const m = /^Registro Imprese\t([^\n]+)$/m.exec(tutto);
    denominazione = m ? normalizzaSpazi(m[1]) : null;
  }
  denominazione = cerca('Denominazione', denominazione);

  // Codice fiscale: «Codice fiscale e numero di iscrizione: X» / «Codice fiscale e n.iscr. al\tX» / piè «Codice Fiscale X».
  const codiceFiscale = cerca(
    'Codice fiscale',
    valoreDopo(tutto, /Codice fiscale e numero d[i']\s*iscrizione:\s*([A-Z0-9]{11,16})/i)
      ?? valoreDopo(tutto, /Codice fiscale e n\.\s*iscr\.\s*al\t([A-Z0-9]{11,16})/i)
      ?? valoreDopo(tutto, /^\tCodice Fiscale\s+([A-Z0-9]{11,16})$/im),
  );
  const partitaIva = cerca('Partita IVA', valoreDopo(tutto, /Partita IVA\t(\d{11})/i));
  const rea = cerca('Numero REA', valoreDopo(tutto, /Numero REA\t([A-Z]{2}\s*-\s*\d+)/i) ?? valoreDopo(tutto, /Numero repertorio economico\t([A-Z]{2}\s*-\s*\d+)/i));
  const pec = cerca('PEC', valoreDopo(tutto, /Domicilio digitale\/PEC\t([^\s\t]+@[^\s\t]+)/i));
  const formaGiuridica = cerca('Forma giuridica', valoreDopo(tutto, /Forma giuridica\t([^\n]+)/i));

  // Sede: dalla sezione 1 (valore + continuazioni), altrimenti dal riquadro di pagina 1.
  let sedeTesto: string | null = null;
  if (iSede >= 0) {
    const i = trovaRiga(rs, ['Indirizzo Sede'], iSede, fineSezione(rs, iSede));
    if (i >= 0) sedeTesto = valoreDa(rs, i, 3);
  }
  if (!sedeTesto) {
    const i = trovaRiga(rs, ['Indirizzo Sede']);
    if (i >= 0) sedeTesto = valoreDa(rs, i, 2);
  }
  sedeTesto = cerca('Sede', sedeTesto);
  const sede = scomponiSede(sedeTesto);

  // Date.
  const dataCostituzione = cerca('Data atto di costituzione', dataIso(valoreDopo(tutto, /Data atto di costituzione:?\s*\t?(\d{2}\/\d{2}\/\d{4})/i)));
  const dataIscrizione = dataIso(valoreDopo(tutto, /Data (?:di )?iscrizione:?\s*\t?(\d{2}\/\d{2}\/\d{4})/i));
  const dataInizioAttivita = dataIso(valoreDopo(tutto, /Data (?:d')?inizio (?:dell')?attivit[àa](?: dell'impresa)?:?\s*\t?(\d{2}\/\d{2}\/\d{4})/i));

  // Stato attività e procedure.
  const statoAttivita = cerca('Stato attività', valoreDopo(tutto, /Stato attivit[àa]\t([^\t\n]+)/i));
  const testoProcedure = iProcedure >= 0 ? rs.slice(iProcedure, fineSezione(rs, iProcedure)).map((r) => r.testo).join(' ') : '';
  const inLiquidazione = /liquidazione|scioglimento/i.test(statoAttivita ?? '') || /in liquidazione|scioglimento|liquidazione volontaria/i.test(testoProcedure);
  const procedura = /fallimento|liquidazione giudiziale|concordato|amministrazione straordinaria|liquidazione coatta|composizione negoziata/i.exec(testoProcedure + ' ' + (statoAttivita ?? ''));
  const proceduraConcorsuale = procedura ? procedura[0].toLowerCase() : null;

  // Capitale (sezione 3: Deliberato / Sottoscritto / Versato), con fallback al riquadro di pagina 1.
  const capitale = {
    deliberato: numeroIt(valoreDopo(tutto, /Deliberato:\s*\t?([\d.,]+)/i)),
    sottoscritto: numeroIt(valoreDopo(tutto, /Sottoscritto:\s*\t?([\d.,]+)/i)),
    versato: numeroIt(valoreDopo(tutto, /Versato:\s*\t?([\d.,]+)/i)),
  };
  if (capitale.sottoscritto == null) {
    const m = /Capitale sociale\t([\d.,]+)\n\tsottoscritto/i.exec(tutto);
    if (m) capitale.sottoscritto = numeroIt(m[1]);
  }
  if (capitale.sottoscritto == null) {
    const m = /Capitale sociale dichiarato[^\n]*\n\t([\d.,]+) Euro/i.exec(tutto);
    if (m) capitale.sottoscritto = numeroIt(m[1]);
  }
  if (capitale.sottoscritto == null) nonTrovati.push('Capitale sociale');

  // Attività e ATECO.
  let attivitaPrevalente: string | null = null;
  if (iAttivita >= 0) {
    const fine = fineSezione(rs, iAttivita);
    const i = trovaRiga(rs, ['attività prevalente esercitata', 'attivita\' prevalente esercitata', 'Attività prevalente', 'attività esercitata nella sede', 'attivita\' esercitata'], iAttivita, fine);
    if (i >= 0) {
      // Le continuazioni possono portare la seconda riga dell'etichetta («dall'impresa\tvalore»).
      const parti = [rs[i].celle.slice(1).join(' ')];
      for (let j = i + 1; j < fine && j <= i + 8; j++) {
        const r = rs[j];
        if (r.continua) parti.push(r.celle.join(' '));
        else if (/^dall'impresa$/i.test(r.celle[0]) && r.celle.length > 1) parti.push(r.celle.slice(1).join(' '));
        else break;
      }
      attivitaPrevalente = normalizzaSpazi(parti.join(' ')).replace(/\s*\(DAL \d{2}\/\d{2}\/\d{4}\)\s*$/i, '');
    }
  }
  if (!attivitaPrevalente) {
    const m = /Attivit[àa] prevalente\t([^\n]+)/i.exec(tutto);
    if (m) attivitaPrevalente = normalizzaSpazi(m[1]);
  }
  attivitaPrevalente = cerca('Attività prevalente', attivitaPrevalente);
  const ateco = valoreDopo(tutto, /Codice:\s*\t?(\d{2}(?:\.\d{1,2}){1,2})/i) ?? valoreDopo(tutto, /ATECO(?:RI)?\s*(?:2007|2022|2025)?[^\n]*?\t?(\d{2}\.\d{1,2}(?:\.\d{1,2})?)/i);
  const atecoVersione = ateco ? (valoreDopo(tutto, /Classificazione ATECO(?:RI)?\s*(2007|2022|2025)/i) ?? null) : null;
  if (!ateco) nonTrovati.push('Codice ATECO');

  // Oggetto sociale (sezione 2, troncato con giudizio).
  // Compare due volte (riquadro di sintesi troncato con «...» e testo pieno): si tiene il più lungo.
  let oggettoSociale: string | null = null;
  if (iStatuto >= 0) {
    for (let i = trovaRiga(rs, ['Oggetto sociale'], iStatuto); i >= 0; i = trovaRiga(rs, ['Oggetto sociale'], i + 1)) {
      const v = valoreDa(rs, i, 80).replace(/\s*\.\.\.\s*$/, '');
      if (!oggettoSociale || v.length > oggettoSociale.length) oggettoSociale = v;
    }
  }
  if (oggettoSociale && oggettoSociale.length > 1500) oggettoSociale = oggettoSociale.slice(0, 1500) + '…';

  // Natura giuridica proposta.
  let tipoProposto = 'ALTRO';
  let tipoIncerto = true;
  const base = `${formaGiuridica ?? ''} ${formaVisura ?? ''}`;
  for (const [re, t] of MAPPA_FORMA_GIURIDICA) {
    if (re.test(base)) { tipoProposto = t; tipoIncerto = false; break; }
  }
  if (tipoIncerto) {
    if (/SOCIETA' DI CAPITALE/i.test(formaVisura ?? '')) { tipoProposto = 'SOCIETA_CAPITALI'; tipoIncerto = false; }
    else if (/SOCIETA' DI PERSONE/i.test(formaVisura ?? '')) { tipoProposto = 'SOCIETA_PERSONE'; tipoIncerto = false; }
    else if (/IMPRESA INDIVIDUALE/i.test(formaVisura ?? '')) { tipoProposto = 'PERSONA_FISICA'; tipoIncerto = false; }
    else if (codiceFiscale && RE_CF_PF.test(codiceFiscale)) tipoProposto = 'PERSONA_FISICA';
    else if (denominazione && /\b(srl|s\.r\.l|spa|s\.p\.a|sapa)\b/i.test(denominazione)) tipoProposto = 'SOCIETA_CAPITALI';
    else if (denominazione && /\b(snc|s\.n\.c|sas|s\.a\.s|s\.s\.)\b/i.test(denominazione)) tipoProposto = 'SOCIETA_PERSONE';
  }

  // Soci.
  const { soci, dataElencoSoci } = leggiSoci(rs, iSoci, codiceFiscale, capitale.sottoscritto, avvisi);
  // Cariche.
  const cariche = leggiCariche(rs, iAmm, tutto);
  if (iAmm < 0 && iSoci < 0 && tipoVisura) avvisi.push('Sezioni «Soci» e «Amministratori» non trovate: per le società di persone e le imprese individuali il layout può differire; controlla la compagine a mano.');

  // Impresa individuale: il titolare è la persona fisica stessa.
  if (tipoProposto === 'PERSONA_FISICA' && soci.length === 0 && codiceFiscale && RE_CF_PF.test(codiceFiscale) && denominazione) {
    soci.push({
      id: codiceFiscale, nome: denominazione, codiceFiscale, tipo: 'PERSONA_FISICA', quotaNominale: null, quotaPercento: 100,
      quotaPercentoSintesi: null, versato: null, diritto: 'PROPRIETA', dirittoTesto: 'titolare dell’impresa', quoteProprie: false,
      comproprieta: false, domicilio: null, pec: null, paese: 'IT',
    });
  }

  return {
    tipoVisura, formaVisura, denominazione, codiceFiscale, partitaIva, formaGiuridica, tipoProposto, tipoIncerto,
    rea, pec, sede, ateco, atecoVersione, attivitaPrevalente, oggettoSociale, statoAttivita, inLiquidazione, proceduraConcorsuale,
    capitale, dataCostituzione, dataIscrizione, dataInizioAttivita, dataEstrazione, dataElencoSoci, numeroDocumento,
    soci, cariche,
    // L'impresa individuale non ha capitale né atto costitutivo: non sono campi mancanti.
    campiNonTrovati: [...new Set(nonTrovati)].filter((c) => tipoProposto !== 'PERSONA_FISICA' || !/Capitale|costituzione/i.test(c)),
    avvisi,
  };
}

function scomponiSede(testo: string | null): VisuraLetta['sede'] {
  const vuota = { indirizzo: null, cap: null, comune: null, provincia: null, testo };
  if (!testo) return vuota;
  // «PADOVA (PD) CORSO MILANO 106 CAP 35139»
  const m = /^(.+?)\s*\(([A-Z]{2})\)\s*(.*?)(?:\s*CAP\s*(\d{5}))?$/i.exec(testo);
  if (!m) return { ...vuota, indirizzo: testo };
  return { comune: normalizzaSpazi(m[1]), provincia: m[2].toUpperCase(), indirizzo: normalizzaSpazi(m[3]) || null, cap: m[4] ?? null, testo };
}

// ───────────────────────────────────────────────────────────── soci

function leggiSoci(
  rs: Riga[],
  iSoci: number,
  cfSocieta: string | null,
  capitaleSottoscritto: number | null,
  avvisi: string[],
): { soci: SocioVisura[]; dataElencoSoci: string | null } {
  const soci: SocioVisura[] = [];
  if (iSoci < 0) return { soci, dataElencoSoci: null };
  const fine = fineSezione(rs, iSoci);
  const blocco = rs.slice(iSoci, fine);
  const testo = blocco.map((r) => r.celle.join('\t')).join('\n');
  const dataElencoSoci = dataIso(valoreDopo(testo, /quote sociali al\s+(\d{2}\/\d{2}\/\d{4})/i) ?? valoreDopo(testo, /elenco (?:dei )?soci al\s+(\d{2}\/\d{2}\/\d{4})/i));

  // 1) Sintesi: «Socio\tValore\t%\tTipo diritto» → righe «NOME\t7.000,00\t70 %\tproprieta'» + riga CF.
  const sintesi = new Map<string, { nome: string; cf: string | null; valore: number | null; pct: number | null; diritto: string }>();
  const iTab = blocco.findIndex((r) => /^Socio$/i.test(r.celle[0] ?? '') && r.celle.some((c) => /Tipo diritto/i.test(c)));
  if (iTab >= 0) {
    let ultimo: { nome: string; cf: string | null; valore: number | null; pct: number | null; diritto: string } | null = null;
    for (let j = iTab + 1; j < blocco.length; j++) {
      const r = blocco[j];
      if (/^Elenco dei soci/i.test(r.celle[0] ?? '')) break;
      const c = r.celle;
      if (!r.continua && c.length >= 4 && /%/.test(c[2]) ) {
        ultimo = { nome: normalizzaSpazi(c[0]), cf: null, valore: numeroIt(c[1]), pct: numeroIt(c[2]), diritto: normalizzaSpazi(c.slice(3).join(' ')) };
        sintesi.set(chiaveSocio(ultimo.nome, null, ultimo.diritto), ultimo);
      } else if (ultimo && c.length === 1 && (RE_CF_PF.test(c[0]) || RE_CF_PG.test(c[0]))) {
        ultimo.cf = c[0];
      } else if (ultimo && c.length === 1 && !RE_CF_PF.test(c[0]) && !/^\d/.test(c[0]) && /^[A-ZÀ-Ü0-9'&.\- ]+$/.test(c[0])) {
        // denominazione su due righe
        ultimo.nome = normalizzaSpazi(`${ultimo.nome} ${c[0]}`);
      }
    }
  }

  // 2) Elenco analitico: blocchi «Quota di nominali: X Euro» … «NOME\tCodice fiscale: CF» «Tipo di diritto: …».
  const iElenco = blocco.findIndex((r) => /^Elenco dei soci/i.test(r.celle[0] ?? ''));
  const dettagli: Array<{ nome: string; cf: string | null; nominale: number | null; versato: number | null; diritto: string | null; domicilio: string | null; pec: string | null; titolariNellaQuota: number }> = [];
  if (iElenco >= 0) {
    let quota: { nominale: number | null; versato: number | null; titolari: number } | null = null;
    let corrente: (typeof dettagli)[number] | null = null;
    for (let j = iElenco; j < blocco.length; j++) {
      const r = blocco[j];
      const t = r.celle.join('\t');
      const mQuota = /Quota di nominali:\s*([\d.,]+)/i.exec(t);
      if (mQuota) {
        quota = { nominale: numeroIt(mQuota[1]), versato: null, titolari: 0 };
        corrente = null;
        continue;
      }
      const mVers = /Di cui versati:\s*([\d.,]+)/i.exec(t);
      if (mVers && quota) { quota.versato = numeroIt(mVers[1]); continue; }
      const mTit = /^([^\t]+)\tCodice fiscale:\s*([A-Z0-9]{11,16})/i.exec(t);
      const mTitSenzaCf = !mTit && !r.continua && r.celle.length >= 2 && /^Tipo di diritto:/i.test(r.celle[1]) ? r.celle[0] : null;
      if (mTit || mTitSenzaCf) {
        corrente = {
          nome: normalizzaSpazi(mTit ? mTit[1] : mTitSenzaCf!), cf: mTit ? mTit[2].toUpperCase() : null, nominale: quota?.nominale ?? null,
          versato: quota?.versato ?? null, diritto: mTitSenzaCf ? valoreDopo(t, /Tipo di diritto:\s*([^\t\n]+)/i) : null, domicilio: null, pec: null, titolariNellaQuota: 0,
        };
        if (quota) quota.titolari++;
        dettagli.push(corrente);
        continue;
      }
      if (!corrente) continue;
      const mDir = /Tipo di diritto:\s*([^\t\n]+)/i.exec(t);
      if (mDir) { corrente.diritto = normalizzaSpazi(mDir[1]); continue; }
      const mPec = /posta (?:elettronica )?certificata:\s*([^\s\t]+@[^\s\t]+)/i.exec(t);
      if (mPec) { corrente.pec = mPec[1]; continue; }
      if (r.continua && /^[A-ZÀ-Ü' .-]+ \(([A-Z]{2})\)/.test(t) && !/^(Domicilio|comune|Tipo|Indirizzo)/i.test(t)) { corrente.domicilio = normalizzaSpazi(r.celle.join(' ')); continue; }
    }
    // comproprietà: più titolari con diritto di proprietà sulla stessa quota
    let k = 0;
    while (k < dettagli.length) {
      const stessa = [dettagli[k]];
      let m = k + 1;
      while (m < dettagli.length && dettagli[m].nominale === dettagli[k].nominale && dettagli[m].nominale != null && /propriet/i.test(dettagli[m].diritto ?? '') && !/nuda/i.test(dettagli[m].diritto ?? '') && /^propriet/i.test(dettagli[k].diritto ?? '')) {
        stessa.push(dettagli[m]);
        m++;
      }
      // Due titolari con la stessa quota e stesso diritto «proprietà» in blocchi distinti
      // sono soci diversi con quote uguali: la comproprietà si riconosce solo quando i
      // titolari stanno nello STESSO blocco «Quota di nominali».
      k = m;
    }
  }

  // Ricomposizione: la sintesi dà la percentuale e l'ordine; l'elenco dà CF, diritto, versato, domicilio.
  const usatiDettagli = new Set<number>();
  const risultato: SocioVisura[] = [];
  const aggiungi = (nome: string, cf: string | null, valore: number | null, pct: number | null, dirittoTesto: string | null, det?: (typeof dettagli)[number]) => {
    const tipo = tipoSoggetto(nome, cf);
    const quoteProprie = Boolean(cfSocieta && cf && cf === cfSocieta);
    const diritto = mappaDiritto(dirittoTesto);
    risultato.push({
      id: cf ?? nome.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
      nome, codiceFiscale: cf, tipo, quotaNominale: valore ?? det?.nominale ?? null, quotaPercento: null, quotaPercentoSintesi: pct,
      versato: det?.versato ?? null, diritto, dirittoTesto, quoteProprie, comproprieta: false,
      domicilio: det?.domicilio ?? null, pec: det?.pec ?? null, paese: paeseDa(cf, det?.domicilio ?? null),
    });
  };
  for (const s of sintesi.values()) {
    const iDet = dettagli.findIndex((d, i) => !usatiDettagli.has(i) && ((s.cf && d.cf === s.cf) || d.nome.toUpperCase() === s.nome.toUpperCase()) && (!d.diritto || mappaDiritto(d.diritto) === mappaDiritto(s.diritto)));
    const det = iDet >= 0 ? dettagli[iDet] : undefined;
    if (iDet >= 0) usatiDettagli.add(iDet);
    aggiungi(s.nome, s.cf ?? det?.cf ?? null, s.valore, s.pct, det?.diritto ?? s.diritto, det);
  }
  // Titolari di diritti presenti solo nell'elenco analitico (usufruttuari, creditori pignoratizi…).
  dettagli.forEach((d, i) => {
    if (usatiDettagli.has(i)) return;
    aggiungi(d.nome, d.cf, d.nominale, null, d.diritto, d);
    risultato[risultato.length - 1].soloSintesi = false;
  });

  // Comproprietà: stessa quota nominale, stesso diritto proprietario, nomi diversi, quota che NON quadra col capitale.
  const proprietari = risultato.filter((s) => !s.quoteProprie && (s.diritto === 'PROPRIETA' || s.diritto === 'COMPROPRIETA'));
  const sommaNominali = proprietari.reduce((a, s) => a + (s.quotaNominale ?? 0), 0);
  if (capitaleSottoscritto && sommaNominali > capitaleSottoscritto * 1.001) {
    const perNominale = new Map<number, SocioVisura[]>();
    for (const s of proprietari) if (s.quotaNominale != null) perNominale.set(s.quotaNominale, [...(perNominale.get(s.quotaNominale) ?? []), s]);
    for (const gruppo of perNominale.values()) if (gruppo.length > 1) for (const s of gruppo) s.comproprieta = true;
    if (![...perNominale.values()].some((g) => g.length > 1)) {
      avvisi.push('La somma delle quote nominali supera il capitale sottoscritto: controlla l’elenco soci (possibile comproprietà o capitale non aggiornato).');
    }
  }
  const nuda = risultato.filter((s) => s.diritto === 'NUDA_PROPRIETA').reduce((a, s) => a + (s.quotaNominale ?? 0), 0);
  const proprie = risultato.filter((s) => s.quoteProprie).reduce((a, s) => a + (s.quotaNominale ?? 0), 0);

  // Percentuali sul capitale sottoscritto al netto delle quote proprie (art. 2357-ter c.c.).
  const denominatore = capitaleSottoscritto ? capitaleSottoscritto - proprie : null;
  for (const s of risultato) {
    if (s.quoteProprie) { s.quotaPercento = capitaleSottoscritto && s.quotaNominale != null ? arr(s.quotaNominale / capitaleSottoscritto * 100) : s.quotaPercentoSintesi; continue; }
    if (denominatore && s.quotaNominale != null) s.quotaPercento = arr((s.quotaNominale / denominatore) * 100);
    else s.quotaPercento = s.quotaPercentoSintesi;
  }
  void nuda;
  if (risultato.length === 0 && iSoci >= 0) avvisi.push('Sezione soci presente ma nessun socio riconosciuto: controlla il layout della visura.');
  return { soci: risultato, dataElencoSoci };
}

const arr = (n: number) => Math.round(n * 100) / 100;

function chiaveSocio(nome: string, cf: string | null, diritto: string): string {
  return `${cf ?? nome.toUpperCase()}|${mappaDiritto(diritto)}`;
}

// ───────────────────────────────────────────────────────────── cariche

function leggiCariche(rs: Riga[], iAmm: number, tutto: string): CaricaVisura[] {
  const out: CaricaVisura[] = [];
  if (iAmm < 0) return out;
  const fine = fineSezione(rs, iAmm);
  const iElenco = trovaRiga(rs, ['Elenco amministratori', 'Elenco titolari', 'Elenco soci amministratori', 'Elenco'], iAmm, fine);
  if (iElenco < 0) return out;

  // Blocchi: riga intestazione carica (una cella, non continuazione, senza ':') → riga «NOME\tRappresentante dell'impresa» → dettagli.
  let corrente: CaricaVisura | null = null;
  let intestazione: string | null = null;
  let intestazioneUsata = true;
  const chiudi = () => { if (corrente) out.push(corrente); corrente = null; };
  for (let j = iElenco + 1; j < fine; j++) {
    const r = rs[j];
    const t = r.celle.join('\t');
    if (/^(Visura (ordinaria|storica)|Registro Imprese|Archivio ufficiale|Documento n|estratto dal Registro)/i.test(r.celle[0] ?? '')) continue;
    if (r.continua && /^Codice Fiscale\s+[A-Z0-9]{11,16}$/i.test(t)) continue;
    // Intestazione di carica: una cella sola, non continuazione, senza ':' e non un CF.
    if (!r.continua && r.celle.length === 1 && !/:/.test(t) && !RE_CF_PF.test(t) && !/^(domicilio|carica|poteri|nato|residenza)/i.test(t) && /^[A-ZÀ-Ü]/.test(t)) {
      const mNome = /^[A-ZÀ-Ü' ]+$/.test(t) && !/^(Amministratore|Presidente|Consigliere|Vice|Liquidatore|Procuratore|Sindaco|Revisore|Socio|Titolare|Institore|Curatore|Amministratori|Elenco|Organi)/i.test(t);
      if (mNome && intestazione) {
        // Nome senza «Rappresentante dell'impresa» sulla stessa riga.
        chiudi();
        corrente = nuovaCarica(t, intestazione);
        intestazioneUsata = true;
        continue;
      }
      // Intestazione spezzata su due righe («Presidente Consiglio» / «Amministrazione»):
      // se quella precedente non è ancora stata usata e la riga da sola non è una
      // carica, è la coda della stessa intestazione.
      if (intestazione && !intestazioneUsata && mappaCarica(t) === 'ALTRO' && /^[A-ZÀ-Ü][a-zà-ü' ]+$/.test(t)) {
        intestazione = normalizzaSpazi(`${intestazione} ${t}`);
        continue;
      }
      intestazione = normalizzaSpazi(t);
      intestazioneUsata = false;
      chiudi();
      continue;
    }
    // Riga nome: «NOME\tRappresentante dell'impresa» oppure «NOME\tqualcosa».
    if (!r.continua && r.celle.length >= 2 && intestazione && /^[A-ZÀ-Ü' .]+$/.test(r.celle[0]) && !/^(domicilio|carica|poteri|residenza|nato)/i.test(r.celle[0])) {
      chiudi();
      corrente = nuovaCarica(r.celle[0], intestazione);
      intestazioneUsata = true;
      if (/Rappresentante dell'impresa/i.test(t)) corrente.rappresentanzaLegale = true;
      // «NOME\tNata a … il …»: la nascita può stare sulla riga del nome.
      const mNatoQui = /Nat[oa] a\s+(.+?)\s+il\s+(\d{2}\/\d{2}\/\d{4})/i.exec(t);
      if (mNatoQui) { corrente.natoA = normalizzaSpazi(mNatoQui[1]); corrente.dataNascita = dataIso(mNatoQui[2]); }
      continue;
    }
    if (!corrente) continue;
    if (/Rappresentante dell'impresa/i.test(t)) corrente.rappresentanzaLegale = true;
    const mNato = /Nat[oa] a\s+(.+?)\s+il\s+(\d{2}\/\d{2}\/\d{4})/i.exec(t);
    if (mNato) { corrente.natoA = normalizzaSpazi(mNato[1]); corrente.dataNascita = dataIso(mNato[2]); continue; }
    const mCf = /Codice fiscale:\s*([A-Z0-9]{11,16})/i.exec(t);
    if (mCf) { corrente.codiceFiscale = mCf[1].toUpperCase(); corrente.id = corrente.codiceFiscale; corrente.paese = paeseDa(corrente.codiceFiscale, corrente.domicilio); continue; }
    if (/^domicilio/i.test(r.celle[0]) && !r.continua) { corrente.domicilio = normalizzaSpazi(r.celle.slice(1).join(' ')); continue; }
    if (r.continua && corrente.domicilio && /CAP \d{5}/i.test(t) && !/posta/i.test(t)) { corrente.domicilio = normalizzaSpazi(`${corrente.domicilio} ${r.celle.join(' ')}`); continue; }
    const mPec = /posta (?:elettronica )?certificata:\s*([^\s\t]+@[^\s\t]+)/i.exec(t);
    if (mPec) { corrente.pec = mPec[1]; continue; }
    if (/^carica$/i.test(r.celle[0]) && !r.continua && r.celle[1]) {
      // Una persona può cumulare più cariche (consigliere + presidente del CdA):
      // la principale è quella di maggior peso, le altre restano nei poteri.
      const testoCarica = normalizzaSpazi(r.celle.slice(1).join(' '));
      const codice = mappaCarica(testoCarica);
      if (codice === corrente.carica) { corrente.caricaTesto = testoCarica; continue; }
      if ((PESO_CARICA[codice] ?? 0) > (PESO_CARICA[corrente.carica] ?? 0)) {
        corrente.poteri = [corrente.poteri, `altra carica: ${corrente.caricaTesto}`].filter(Boolean).join('; ');
        corrente.carica = codice;
        corrente.caricaTesto = testoCarica;
      } else {
        corrente.poteri = [corrente.poteri, `altra carica: ${testoCarica}`].filter(Boolean).join('; ');
      }
      continue;
    }
    const mNomina = /Data (?:atto di )?nomina:\s*(\d{2}\/\d{2}\/\d{4})/i.exec(t);
    if (mNomina && !corrente.dataNomina) { corrente.dataNomina = dataIso(mNomina[1]); continue; }
    const mDurata = /Durata in carica:\s*([^\t\n]+)/i.exec(t);
    if (mDurata && !corrente.durata) { corrente.durata = normalizzaSpazi(mDurata[1]); continue; }
    if (/^poteri/i.test(r.celle[0]) && !r.continua) { corrente.poteri = [corrente.poteri, valoreDa(rs, j, 30)].filter(Boolean).join('; '); continue; }
  }
  chiudi();
  void tutto;
  return out;
}

function nuovaCarica(nome: string, intestazione: string): CaricaVisura {
  const n = normalizzaSpazi(nome);
  return {
    id: n.toUpperCase().replace(/[^A-Z0-9]+/g, '_'), nome: n, codiceFiscale: null, carica: mappaCarica(intestazione), caricaTesto: intestazione,
    rappresentanzaLegale: false, natoA: null, dataNascita: null, dataNomina: null, durata: null, domicilio: null, pec: null, poteri: null, paese: null,
  };
}
