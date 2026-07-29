/**
 * SOGLIE E TERMINI NORMATIVI, CON VIGENZA TEMPORALE
 *
 * Ogni soglia ha una storia. Il limite al contante e' passato da 3.000 a 2.000
 * e poi a 5.000 euro; un controllo su un pagamento del 2021 non puo' essere
 * fatto con la soglia di oggi. Per questo le soglie non sono costanti ma serie
 * temporali interrogabili per data.
 *
 * Fonte: DLgs. 21.11.2007 n. 231, testo consolidato Eutekne al 24.7.2026.
 * Ogni voce riporta l'articolo. Nessun valore e' ricordato a memoria.
 */

export interface SogliaTemporale {
  /** Data di decorrenza inclusa, ISO YYYY-MM-DD. */
  da: string;
  /** Data di cessazione inclusa; null se ancora vigente. */
  a: string | null;
  valore: number;
  fonte: string;
}

export interface DefinizioneSoglia {
  codice: string;
  etichetta: string;
  norma: string;
  /** Come va letta la soglia: 'DIVIETO_DA' significa vietato per importi >= soglia. */
  criterio: 'DIVIETO_DA' | 'OBBLIGO_DA' | 'LIBERO_SOTTO';
  serie: SogliaTemporale[];
  note?: string;
}

export const SOGLIE: DefinizioneSoglia[] = [
  {
    codice: 'CONTANTE',
    etichetta: 'Trasferimento di denaro contante e titoli al portatore tra soggetti diversi',
    norma: 'art. 49 co. 1 e co. 3-bis DLgs. 231/2007',
    criterio: 'DIVIETO_DA',
    serie: [
      { da: '2016-01-01', a: '2020-06-30', valore: 3000, fonte: 'art. 49 co. 1, testo base' },
      { da: '2020-07-01', a: '2022-12-31', valore: 2000, fonte: 'art. 49 co. 3-bis, primo periodo' },
      { da: '2023-01-01', a: null, valore: 5000, fonte: 'art. 49 co. 3-bis, secondo periodo (L. 197/2022)' },
    ],
    note:
      'Il divieto opera per importi complessivamente pari o superiori alla soglia: il massimo consentito è la soglia meno un centesimo. ' +
      'Il divieto vale anche per più pagamenti sotto soglia che appaiano artificiosamente frazionati. ' +
      'Non si applica ai trasferimenti in cui siano parte banche, Poste, IMEL e istituti di pagamento (art. 49 co. 13).',
  },
  {
    codice: 'RIMESSA_DENARO',
    etichetta: 'Servizio di rimessa di denaro (money transfer)',
    norma: 'art. 49 co. 2 DLgs. 231/2007',
    criterio: 'DIVIETO_DA',
    serie: [{ da: '2018-01-01', a: null, valore: 1000, fonte: 'art. 49 co. 2' }],
  },
  {
    codice: 'NEGOZIAZIONE_VALUTA',
    etichetta: 'Negoziazione a pronti di mezzi di pagamento in valuta',
    norma: 'art. 49 co. 3 DLgs. 231/2007',
    criterio: 'DIVIETO_DA',
    serie: [
      { da: '2018-01-01', a: '2020-06-30', valore: 3000, fonte: 'art. 49 co. 3' },
      { da: '2020-07-01', a: '2022-12-31', valore: 2000, fonte: 'art. 49 co. 3-bis, primo periodo' },
      { da: '2023-01-01', a: null, valore: 3000, fonte: 'art. 49 co. 3' },
    ],
    note:
      'Dal 1.1.2023 il co. 3-bis riferisce alla cifra di 5.000 euro il solo divieto del co. 1: la soglia del co. 3 torna quindi a 3.000 euro. ' +
      'È una asimmetria voluta dal legislatore e va tenuta distinta dal limite generale al contante.',
  },
  {
    codice: 'ASSEGNI_NON_TRASFERIBILI',
    etichetta: 'Assegni bancari e postali: obbligo di beneficiario e clausola di non trasferibilità',
    norma: 'art. 49 co. 5 DLgs. 231/2007',
    criterio: 'OBBLIGO_DA',
    serie: [{ da: '2018-01-01', a: null, valore: 1000, fonte: 'art. 49 co. 5' }],
    note:
      'Gli assegni emessi per importi pari o superiori a 1.000 euro devono recare nome o ragione sociale del beneficiario e ' +
      'clausola di non trasferibilità. Assegni circolari, vaglia postali e cambiari sotto 1.000 euro possono essere richiesti in forma libera (co. 8).',
  },
  {
    codice: 'OPERAZIONE_OCCASIONALE',
    etichetta: 'Operazione occasionale che fa scattare l’adeguata verifica',
    norma: 'art. 17 co. 1 lett. b) DLgs. 231/2007',
    criterio: 'OBBLIGO_DA',
    serie: [{ da: '2017-07-04', a: null, valore: 15000, fonte: 'art. 17 co. 1 lett. b)' }],
    note:
      'Vale anche per più operazioni che appaiano collegate per realizzare un’operazione frazionata. ' +
      'Per i trasferimenti di fondi o di cripto-attività ex reg. (UE) 2023/1113 la soglia è di 1.000 euro.',
  },
  {
    codice: 'TRASFERIMENTO_FONDI',
    etichetta: 'Trasferimento di fondi o cripto-attività',
    norma: 'art. 17 co. 1 lett. b), secondo periodo, DLgs. 231/2007',
    criterio: 'OBBLIGO_DA',
    serie: [{ da: '2024-12-30', a: null, valore: 1000, fonte: 'art. 17 co. 1 lett. b), rinvio al reg. (UE) 2023/1113' }],
  },
];

/** Termini in giorni o anni, con la norma che li impone. */
export const TERMINI = {
  COMPLETAMENTO_VERIFICA_GIORNI: {
    valore: 30,
    norma: 'art. 18 co. 3 DLgs. 231/2007',
    descrizione:
      'Le procedure di verifica dell’identità vanno completate al più presto e comunque entro trenta giorni dall’instaurazione del ' +
      'rapporto o dal conferimento dell’incarico. Decorso il termine senza esito, scatta l’astensione ex art. 42 e la valutazione della SOS.',
  },
  ACQUISIZIONE_CONSERVAZIONE_GIORNI: {
    valore: 30,
    norma: 'art. 32 co. 2 lett. b) DLgs. 231/2007',
    descrizione:
      'È considerata tempestiva l’acquisizione conclusa entro trenta giorni dall’instaurazione del rapporto, dal conferimento ' +
      'dell’incarico, dall’esecuzione della prestazione, dalla variazione e dalla chiusura.',
  },
  CONSERVAZIONE_ANNI: {
    valore: 10,
    norma: 'art. 31 DLgs. 231/2007',
    descrizione:
      'I documenti, i dati e le informazioni sono conservati per dieci anni dalla cessazione del rapporto continuativo o ' +
      'dall’esecuzione dell’operazione occasionale.',
  },
  COMUNICAZIONE_MEF_GIORNI: {
    valore: 30,
    norma: 'art. 51 DLgs. 231/2007',
    descrizione:
      'Le infrazioni alle disposizioni del Titolo III (limitazioni all’uso del contante) vanno comunicate al MEF — Ragionerie ' +
      'territoriali dello Stato, di regola tramite il sistema telematico SIAR.',
    verificaWeb: true,
  },
} as const;

function inFinestra(s: SogliaTemporale, data: string): boolean {
  return data >= s.da && (s.a === null || data <= s.a);
}

export function sogliaVigente(codice: string, data: string): { valore: number; fonte: string; def: DefinizioneSoglia } {
  const def = SOGLIE.find((s) => s.codice === codice);
  if (!def) throw new Error(`Soglia sconosciuta: ${codice}`);
  const v = def.serie.find((s) => inFinestra(s, data));
  if (!v) throw new Error(`Nessuna soglia "${codice}" vigente alla data ${data}`);
  return { valore: v.valore, fonte: v.fonte, def };
}

export interface EsitoControlloContante {
  conforme: boolean;
  soglia: number;
  norma: string;
  fonte: string;
  messaggio: string;
  /** Vero quando il superamento fa scattare l'obbligo di comunicazione al MEF. */
  comunicazioneMef: boolean;
  scadenzaComunicazioneMef?: string;
}

/**
 * Verifica un trasferimento in contante alla luce dell'art. 49.
 * `data` e' la data dell'operazione, non quella odierna: e' la sola che conti
 * per individuare la soglia applicabile.
 */
export function verificaContante(
  importo: number,
  data: string,
  opzioni: { tipo?: 'CONTANTE' | 'RIMESSA_DENARO' | 'NEGOZIAZIONE_VALUTA'; intermediarioParte?: boolean } = {},
): EsitoControlloContante {
  const tipo = opzioni.tipo ?? 'CONTANTE';
  const { valore: soglia, fonte, def } = sogliaVigente(tipo, data);

  // Art. 49 co. 13: le limitazioni non si applicano ai trasferimenti in cui
  // siano parte banche, Poste, istituti di moneta elettronica e di pagamento.
  if (opzioni.intermediarioParte) {
    return {
      conforme: true,
      soglia,
      norma: def.norma,
      fonte,
      messaggio:
        'Trasferimento in cui è parte un intermediario bancario o finanziario: le limitazioni dell’art. 49 non si applicano (art. 49 co. 13).',
      comunicazioneMef: false,
    };
  }

  const violazione = importo >= soglia;
  return {
    conforme: !violazione,
    soglia,
    norma: def.norma,
    fonte,
    messaggio: violazione
      ? `Importo di ${formattaEuro(importo)} pari o superiore alla soglia di ${formattaEuro(soglia)} vigente al ${formattaData(data)}: ` +
        `trasferimento vietato ai sensi dell’${def.norma}. Sanzione amministrativa ex art. 63 e obbligo di comunicazione al MEF ex art. 51.`
      : `Importo di ${formattaEuro(importo)} inferiore alla soglia di ${formattaEuro(soglia)} vigente al ${formattaData(data)}: operazione consentita. ` +
        `Resta fermo che il ricorso frequente o ingiustificato al contante, anche sotto soglia, è elemento di sospetto ex art. 35 co. 1.`,
    comunicazioneMef: violazione,
    scadenzaComunicazioneMef: violazione ? aggiungiGiorni(data, TERMINI.COMUNICAZIONE_MEF_GIORNI.valore) : undefined,
  };
}

// --------------------------------------------------------------- date helper

/** Somma giorni a una data ISO restando in UTC, per evitare slittamenti da fuso. */
export function aggiungiGiorni(dataIso: string, giorni: number): string {
  const d = new Date(`${dataIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Data non valida: ${dataIso}`);
  d.setUTCDate(d.getUTCDate() + giorni);
  return d.toISOString().slice(0, 10);
}

export function aggiungiMesi(dataIso: string, mesi: number): string {
  const d = new Date(`${dataIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Data non valida: ${dataIso}`);
  const giornoOriginale = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + mesi);
  // Se il mese di destinazione è più corto (31 gennaio + 1 mese), JS trabocca
  // al mese successivo: riporto all'ultimo giorno del mese atteso.
  if (d.getUTCDate() !== giornoOriginale) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

export function aggiungiAnni(dataIso: string, anni: number): string {
  const d = new Date(`${dataIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Data non valida: ${dataIso}`);
  d.setUTCFullYear(d.getUTCFullYear() + anni);
  return d.toISOString().slice(0, 10);
}

export function formattaEuro(n: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
}

export function formattaData(iso: string): string {
  const [a, m, g] = iso.split('-');
  return `${g}.${m}.${a}`;
}
