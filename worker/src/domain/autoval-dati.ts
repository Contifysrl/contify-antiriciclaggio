/**
 * INDICATORI DI PORTAFOGLIO PER L'AUTOVALUTAZIONE DELLO STUDIO (AR-M15)
 *
 * Perché questo modulo esiste. Il collaudo ha chiesto che l'autovalutazione
 * si alimenti dai clienti man mano che vengono caricati, «come fanno gli altri
 * programmi, con una media ponderata dei rischi dei clienti». La media
 * ponderata NON è il metodo del CNDCEC e non viene implementata: il Modello
 * AV.0 (Informativa CNDCEC n. 57/2026) fa qualcosa di più preciso e àncora
 * tre dei quattro fattori del RISCHIO INERENTE a percentuali determinate sul
 * portafoglio reale. Quelle percentuali sono calcolabili esattamente con i
 * dati che il programma già registra: è quello che si calcola qui.
 *
 * Due limiti da tenere presenti, perché sono strutturali e non aggirabili:
 *
 *  - il rischio inerente pesa 0,40 e la VULNERABILITÀ pesa 0,60. La
 *    vulnerabilità riguarda i presìdi organizzativi dello studio e non è
 *    derivabile dai clienti: qui si producono soltanto indicatori oggettivi
 *    su ciò che il sistema sa di sé (formazione registrata, tempestività
 *    della conservazione, controlli scaduti), che PROPONGONO un punteggio.
 *    Il giudizio resta del professionista;
 *
 *  - sotto una decina di fascicoli il denominatore non è significativo. La
 *    percentuale si mostra lo stesso — è un dato di fatto — ma il punteggio
 *    non viene proposto: uno studio ai primi tre clienti non deve ritrovarsi
 *    un rischio inerente «molto significativo» per via di un caso su tre.
 *
 * Il modulo è puro: riceve righe già lette da D1 e restituisce numeri. Le
 * route orchestrano, non decidono (regola trasversale del worker).
 */

import { paeseAltoRischio } from './norme';
import { trovaPrestazione } from './prestazioni';

/** Sotto questa soglia le percentuali non fondano una proposta di punteggio. */
export const MINIMO_SIGNIFICATIVO = 10;

// ===========================================================================
// Ingresso: la fotografia del portafoglio
// ===========================================================================

export interface RigaFascicolo {
  id: string;
  codice: string;
  clienteId: string;
  cliente: string;
  prestazioneCodice: string;
  dataConferimento: string;
  dataCessazione: string | null;
  /** Livello dell'ultima valutazione registrata: SEMPLIFICATA | ORDINARIA | RAFFORZATA. */
  livelloApplicabile: string | null;
  esenteVerifica: boolean;
  /** Circostanze registrate nell'ultima valutazione (JSON già interpretato). */
  circostanze: Record<string, unknown>;
  modalitaIdentificazione: string | null;
  /**
   * Paese di residenza del cliente. Il registro dei titolari effettivi non
   * conserva la residenza dei titolari, quindi il fattore geografico poggia
   * sulla residenza del cliente e sulle circostanze registrate nella
   * valutazione: è la ragione per cui la circostanza va compilata.
   */
  paeseCliente: string | null;
}

export interface RigheVulnerabilita {
  utentiAttivi: number;
  /** Eventi di formazione registrati negli ultimi dodici mesi. */
  formazioneUltimoAnno: number;
  /** Partecipanti distinti agli eventi di formazione dell'ultimo anno. */
  formazionePartecipanti: number;
  fascicoliAttivi: number;
  fascicoliConValutazione: number;
  fascicoliConValutazioneFirmata: number;
  controlliScaduti: number;
  clientiSocietariSenzaTitolare: number;
  documentiTotali: number;
  documentiEntro30Giorni: number;
  fascicoliSenzaDocumenti: number;
  sosTotali: number;
  sosNonConcluse: number;
  astensioniTotali: number;
}

// ===========================================================================
// Soglie del Modello AV.0
// I descrittori a parole stanno nel ruleset (cndcec-2025.ts); qui la loro
// traduzione in numeri, tenuta accanto al calcolo che la usa.
// ===========================================================================

/** «fino al 10%» → 1 · «oltre 10 fino a 25» → 2 · «oltre 25 fino a 40» → 3 · «oltre 40» → 4. */
function punteggioCrescente(percentuale: number): number {
  if (percentuale <= 10) return 1;
  if (percentuale <= 25) return 2;
  if (percentuale <= 40) return 3;
  return 4;
}

/**
 * Semantica invertita: qui la percentuale misura le prestazioni a BASSO
 * rischio, quindi più è alta, più il punteggio è basso.
 * «oltre 80%» → 1 · «oltre 60 fino a 80» → 2 · «oltre 45 fino a 60» → 3 · «fino a 45» → 4.
 */
function punteggioDecrescente(percentuale: number): number {
  if (percentuale > 80) return 1;
  if (percentuale > 60) return 2;
  if (percentuale > 45) return 3;
  return 4;
}

// ===========================================================================
// Uscita
// ===========================================================================

export interface Indicatore {
  /** Codice del fattore nel ruleset, o dell'indicatore di vulnerabilità. */
  codice: string;
  etichetta: string;
  /** Percentuale 0-100 arrotondata a un decimale, o null se non calcolabile. */
  percentuale: number | null;
  numeratore: number;
  denominatore: number;
  /** Punteggio 1-4 proposto, o null se il dato non è significativo. */
  punteggio: number | null;
  /** Come si legge il numero, in una riga. Finisce nel verbale. */
  spiegazione: string;
  /** Id dei fascicoli che compongono il numeratore: rendono il numero verificabile. */
  fascicoli?: string[];
  /** true quando il punteggio è solo indicativo e il fattore resta manuale. */
  indicativo?: boolean;
}

export interface IndicatoriPortafoglio {
  calcolatoIl: string;
  significativo: boolean;
  minimoSignificativo: number;
  clientiAttivi: number;
  fascicoliAttivi: number;
  inerente: Indicatore[];
  vulnerabilita: Indicatore[];
  /** Punteggi proposti per fattore, pronti da precompilare in una nuova versione. */
  proposta: { inerente: Record<string, number>; vulnerabilita: Record<string, number> };
}

// ===========================================================================
// Rischio inerente
// ===========================================================================

const pct = (n: number, d: number): number | null => (d === 0 ? null : Math.round((n / d) * 1000) / 10);

/** Un fascicolo è «vivo» se non è cessato: l'autovalutazione guarda all'operatività in corso. */
const attivo = (f: RigaFascicolo) => !f.dataCessazione;

function fattoreClientela(fascicoli: RigaFascicolo[]): Indicatore {
  // Denominatore: i clienti per i quali l'adeguata verifica è dovuta. I
  // fascicoli esenti ex art. 17 co. 7 non entrano né sopra né sotto: non
  // sono clienti «non rafforzati», sono clienti fuori dall'obbligo.
  const soggetti = fascicoli.filter((f) => attivo(f) && !f.esenteVerifica);
  const clienti = new Set(soggetti.map((f) => f.clienteId));
  const rafforzati = new Set(soggetti.filter((f) => f.livelloApplicabile === 'RAFFORZATA').map((f) => f.clienteId));
  const percentuale = pct(rafforzati.size, clienti.size);
  return {
    codice: 'tipologia_clientela',
    etichetta: 'Tipologia di clientela',
    percentuale,
    numeratore: rafforzati.size,
    denominatore: clienti.size,
    punteggio: percentuale === null || clienti.size < MINIMO_SIGNIFICATIVO ? null : punteggioCrescente(percentuale),
    spiegazione:
      clienti.size === 0
        ? 'Nessun cliente soggetto ad adeguata verifica: il fattore non è ancora calcolabile.'
        : `${rafforzati.size} clienti su ${clienti.size} sono assoggettati ad adeguata verifica rafforzata` +
          (percentuale !== null ? ` (${percentuale}%).` : '.'),
    fascicoli: soggetti.filter((f) => f.livelloApplicabile === 'RAFFORZATA').map((f) => f.id),
  };
}

function coinvolgePaeseAltoRischio(f: RigaFascicolo): boolean {
  const data = f.dataConferimento;
  if (paeseAltoRischio(f.paeseCliente, data).altoRischio) return true;
  // La circostanza registrata nella valutazione vale anche quando la
  // residenza è italiana: è l'operatività a coinvolgere il paese terzo.
  const c = f.circostanze ?? {};
  if (c.paeseAltoRischio === true || c.paese_alto_rischio === true) return true;
  const paeseCircostanza = (c.paese ?? c.paeseOperazione) as string | undefined;
  return paeseAltoRischio(paeseCircostanza, data).altoRischio;
}

function fattoreGeografico(fascicoli: RigaFascicolo[]): Indicatore {
  const vivi = fascicoli.filter(attivo);
  const coinvolti = vivi.filter(coinvolgePaeseAltoRischio);
  const percentuale = pct(coinvolti.length, vivi.length);
  return {
    codice: 'area_geografica',
    etichetta: 'Area geografica di operatività',
    percentuale,
    numeratore: coinvolti.length,
    denominatore: vivi.length,
    punteggio: percentuale === null || vivi.length < MINIMO_SIGNIFICATIVO ? null : punteggioCrescente(percentuale),
    spiegazione:
      vivi.length === 0
        ? 'Nessuna prestazione in corso: il fattore non è ancora calcolabile.'
        : `${coinvolti.length} prestazioni su ${vivi.length} coinvolgono Paesi terzi ad alto rischio` +
          (percentuale !== null ? ` (${percentuale}%)` : '') +
          ', secondo l’elenco UE vigente alla data di conferimento di ciascun incarico.',
    fascicoli: coinvolti.map((f) => f.id),
  };
}

function fattoreServizi(fascicoli: RigaFascicolo[]): Indicatore {
  const vivi = fascicoli.filter(attivo);
  // Grado inerente 1 o 2 = «non significativo» o «poco significativo».
  const basso = vivi.filter((f) => (trovaPrestazione(f.prestazioneCodice)?.gradoInerente ?? 4) <= 2);
  const percentuale = pct(basso.length, vivi.length);
  return {
    codice: 'servizi_offerti',
    etichetta: 'Servizi offerti',
    percentuale,
    numeratore: basso.length,
    denominatore: vivi.length,
    punteggio: percentuale === null || vivi.length < MINIMO_SIGNIFICATIVO ? null : punteggioDecrescente(percentuale),
    spiegazione:
      vivi.length === 0
        ? 'Nessuna prestazione in corso: il fattore non è ancora calcolabile.'
        : `${basso.length} prestazioni su ${vivi.length} sono a rischio inerente non o poco significativo` +
          (percentuale !== null ? ` (${percentuale}%)` : '') +
          '. Più alta è la percentuale, più basso è il punteggio.',
    fascicoli: basso.map((f) => f.id),
  };
}

/** Identificazione non in presenza e non assistita da identificazione elettronica sicura. */
const A_DISTANZA_DEBOLE = ['A_DISTANZA', 'CORRISPONDENZA', 'TERZI', 'INTERMEDIARIO'];

function fattoreCanali(fascicoli: RigaFascicolo[]): Indicatore {
  const vivi = fascicoli.filter(attivo);
  const distanza = vivi.filter((f) => A_DISTANZA_DEBOLE.includes(String(f.modalitaIdentificazione ?? '').toUpperCase()));
  const percentuale = pct(distanza.length, vivi.length);
  return {
    codice: 'canali_distributivi',
    etichetta: 'Canali distributivi',
    percentuale,
    numeratore: distanza.length,
    denominatore: vivi.length,
    // Nessun punteggio proposto: il Modello AV.0 dichiara il fattore
    // residuale per l'attività professionale e non gli assegna una soglia.
    punteggio: null,
    indicativo: true,
    spiegazione:
      vivi.length === 0
        ? 'Nessuna prestazione in corso.'
        : `${distanza.length} prestazioni su ${vivi.length} sono state instaurate a distanza o tramite terzi` +
          (percentuale !== null ? ` (${percentuale}%)` : '') +
          '. Dato indicativo: il Modello AV.0 considera il fattore residuale per l’attività professionale, ' +
          'quindi il punteggio resta una scelta del professionista.',
    fascicoli: distanza.map((f) => f.id),
  };
}

// ===========================================================================
// Vulnerabilità: indicatori oggettivi, non giudizi
// La scala è quella dei presìdi (1 completi … 4 insufficienti). Le regole
// sono esplicite di proposito: un punteggio proposto senza la sua regola
// non è verificabile, e in ispezione varrebbe zero.
// ===========================================================================

function scala(percentuale: number | null, ottimo: number, buono: number, sufficiente: number): number | null {
  if (percentuale === null) return null;
  if (percentuale >= ottimo) return 1;
  if (percentuale >= buono) return 2;
  if (percentuale >= sufficiente) return 3;
  return 4;
}

function vulnerabilitaFormazione(v: RigheVulnerabilita): Indicatore {
  const copertura = pct(v.formazionePartecipanti, v.utentiAttivi);
  let punteggio: number | null;
  if (v.formazioneUltimoAnno === 0) punteggio = 4;
  else punteggio = scala(copertura, 100, 60, 30);
  return {
    codice: 'formazione',
    etichetta: 'Formazione',
    percentuale: copertura,
    numeratore: v.formazionePartecipanti,
    denominatore: v.utentiAttivi,
    punteggio,
    spiegazione:
      v.formazioneUltimoAnno === 0
        ? 'Nessun evento di formazione registrato negli ultimi dodici mesi (art. 16 co. 3).'
        : `${v.formazioneUltimoAnno} eventi negli ultimi dodici mesi, con ${v.formazionePartecipanti} partecipanti su ${v.utentiAttivi} persone attive.`,
  };
}

function vulnerabilitaVerifica(v: RigheVulnerabilita): Indicatore {
  const firmate = pct(v.fascicoliConValutazioneFirmata, v.fascicoliAttivi);
  let punteggio = scala(firmate, 95, 80, 50);
  // I controlli costanti scaduti sono un difetto di organizzazione, non un
  // dettaglio: peggiorano il punteggio di un gradino.
  if (punteggio !== null && v.controlliScaduti > 0) punteggio = Math.min(4, punteggio + 1);
  const pezzi = [`${v.fascicoliConValutazioneFirmata} fascicoli su ${v.fascicoliAttivi} hanno una valutazione firmata`];
  if (v.controlliScaduti > 0) pezzi.push(`${v.controlliScaduti} controlli costanti scaduti`);
  if (v.clientiSocietariSenzaTitolare > 0) pezzi.push(`${v.clientiSocietariSenzaTitolare} clienti societari senza titolarità effettiva registrata`);
  return {
    codice: 'organizzazione_adeguata_verifica',
    etichetta: 'Organizzazione dell’adeguata verifica',
    percentuale: firmate,
    numeratore: v.fascicoliConValutazioneFirmata,
    denominatore: v.fascicoliAttivi,
    punteggio,
    spiegazione: pezzi.join('; ') + '.',
  };
}

function vulnerabilitaConservazione(v: RigheVulnerabilita): Indicatore {
  const tempestivi = pct(v.documentiEntro30Giorni, v.documentiTotali);
  let punteggio = scala(tempestivi, 95, 80, 50);
  if (punteggio !== null && v.fascicoliSenzaDocumenti > 0 && v.fascicoliAttivi > 0) {
    const scoperti = (v.fascicoliSenzaDocumenti / v.fascicoliAttivi) * 100;
    if (scoperti > 25) punteggio = Math.min(4, punteggio + 1);
  }
  return {
    codice: 'organizzazione_conservazione',
    etichetta: 'Organizzazione della conservazione',
    percentuale: tempestivi,
    numeratore: v.documentiEntro30Giorni,
    denominatore: v.documentiTotali,
    punteggio,
    spiegazione:
      v.documentiTotali === 0
        ? 'Nessun documento conservato: il presidio dell’art. 31 non è ancora documentato.'
        : `${v.documentiEntro30Giorni} documenti su ${v.documentiTotali} acquisiti entro i trenta giorni dell’art. 31` +
          (v.fascicoliSenzaDocumenti > 0 ? `; ${v.fascicoliSenzaDocumenti} fascicoli senza alcun documento` : '') + '.',
  };
}

function vulnerabilitaSos(v: RigheVulnerabilita): Indicatore {
  // Qui non esiste una percentuale sensata: l'assenza di SOS non è di per sé
  // un difetto. Si guarda alla presenza di una procedura viva — segnalazioni
  // o astensioni istruite — e alle segnalazioni lasciate a metà.
  let punteggio: number;
  if (v.sosNonConcluse > 0) punteggio = 3;
  else if (v.sosTotali > 0 || v.astensioniTotali > 0) punteggio = 2;
  else punteggio = 3;
  return {
    codice: 'organizzazione_sos',
    etichetta: 'Organizzazione della segnalazione di operazioni sospette',
    percentuale: null,
    numeratore: v.sosTotali,
    denominatore: v.sosTotali + v.astensioniTotali,
    punteggio,
    spiegazione:
      v.sosTotali === 0 && v.astensioniTotali === 0
        ? 'Nessuna segnalazione né astensione istruita: la procedura interna non risulta ancora esercitata. ' +
          'Se lo studio ha una procedura scritta e non ha avuto casi da segnalare, il punteggio va corretto a mano.'
        : `${v.sosTotali} segnalazioni e ${v.astensioniTotali} astensioni istruite` +
          (v.sosNonConcluse > 0 ? `, di cui ${v.sosNonConcluse} segnalazioni ancora aperte` : '') + '.',
  };
}

// ===========================================================================
// Composizione
// ===========================================================================

export function calcolaIndicatori(
  fascicoli: RigaFascicolo[],
  vuln: RigheVulnerabilita,
  calcolatoIl: string,
): IndicatoriPortafoglio {
  const vivi = fascicoli.filter(attivo);
  const inerente = [fattoreClientela(fascicoli), fattoreGeografico(fascicoli), fattoreCanali(fascicoli), fattoreServizi(fascicoli)];
  const vulnerabilita = [
    vulnerabilitaFormazione(vuln),
    vulnerabilitaVerifica(vuln),
    vulnerabilitaConservazione(vuln),
    vulnerabilitaSos(vuln),
  ];

  const raccogli = (elenco: Indicatore[]) => {
    const out: Record<string, number> = {};
    for (const i of elenco) if (i.punteggio !== null) out[i.codice] = i.punteggio;
    return out;
  };

  return {
    calcolatoIl,
    significativo: vivi.length >= MINIMO_SIGNIFICATIVO,
    minimoSignificativo: MINIMO_SIGNIFICATIVO,
    clientiAttivi: new Set(vivi.map((f) => f.clienteId)).size,
    fascicoliAttivi: vivi.length,
    inerente,
    vulnerabilita,
    proposta: { inerente: raccogli(inerente), vulnerabilita: raccogli(vulnerabilita) },
  };
}

// ===========================================================================
// Scostamento dalla versione firmata
// L'autovalutazione firmata è immutabile (art. 32 co. 2 lett. c): non si
// riscrive, si emette una versione nuova. Qui si dice soltanto SE i dati di
// oggi cambierebbero almeno un punteggio, e quali.
// ===========================================================================

export interface Scostamento {
  fattore: string;
  etichetta: string;
  punteggioFirmato: number;
  punteggioAttuale: number;
  spiegazione: string;
}

export function calcolaScostamenti(
  indicatori: IndicatoriPortafoglio,
  punteggiFirmati: { inerente?: Record<string, number>; vulnerabilita?: Record<string, number> } | null,
): Scostamento[] {
  if (!punteggiFirmati) return [];
  const fuori: Scostamento[] = [];
  const confronta = (elenco: Indicatore[], firmati: Record<string, number> | undefined) => {
    for (const i of elenco) {
      if (i.punteggio === null || i.indicativo) continue;
      const firmato = firmati?.[i.codice];
      if (typeof firmato !== 'number' || firmato === i.punteggio) continue;
      fuori.push({
        fattore: i.codice,
        etichetta: i.etichetta,
        punteggioFirmato: firmato,
        punteggioAttuale: i.punteggio,
        spiegazione: i.spiegazione,
      });
    }
  };
  confronta(indicatori.inerente, punteggiFirmati.inerente);
  confronta(indicatori.vulnerabilita, punteggiFirmati.vulnerabilita);
  return fuori;
}
