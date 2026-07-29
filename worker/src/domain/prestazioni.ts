/**
 * CATALOGO DELLE PRESTAZIONI PROFESSIONALI
 *
 * Tabella 1 della Regola tecnica CNDCEC n. 2 (versione gennaio 2025): a ogni
 * prestazione tipica del dottore commercialista e' associato un grado di
 * rischio inerente da 1 a 4.
 *
 * Due attributi cambiano il calcolo e vanno letti con attenzione:
 *
 *  - `esoneroTabellaB`: per revisione legale, tenuta della contabilita' e
 *    assistenza continuativa la Regola tecnica 2025 esonera dalla compilazione
 *    della Tabella B, "attesa la tipologia dei dati richiesti nella stessa".
 *    Il rischio specifico diventa quindi ΣA / 4.
 *
 *  - `esenteAdeguataVerifica`: art. 17 co. 7 del DLgs. 231/2007. Non e' una
 *    graduazione del rischio, e' un'esclusione dell'obbligo. Riguarda la mera
 *    redazione e trasmissione (o la sola trasmissione) delle dichiarazioni
 *    derivanti da obblighi fiscali e gli adempimenti in materia di
 *    amministrazione del personale ex art. 2 co. 1 della L. 11.1.1979 n. 12.
 *    L'esclusione e' per singola prestazione: se allo stesso cliente lo studio
 *    rende anche altro, per quell'altro la verifica e' dovuta.
 *
 * Le declassificazioni introdotte nel 2025 sono annotate in `note`, perche' un
 * fascicolo aperto prima del 2025 va letto con il ruleset di allora.
 */

import type { Prestazione } from './types';

export const CATALOGO_PRESTAZIONI_2025: Prestazione[] = [
  // ---------------------------------------------------------------- grado 1
  {
    codice: 'COLLEGIO_SINDACALE',
    descrizione: 'Partecipazione al collegio sindacale senza incarico di revisione legale',
    gradoInerente: 1,
  },
  {
    codice: 'VISTO_CONFORMITA',
    descrizione: 'Rilascio del visto di conformità',
    gradoInerente: 1,
  },
  {
    codice: 'INTERPELLI',
    descrizione: 'Predisposizione di istanze di interpello',
    gradoInerente: 1,
  },
  {
    codice: 'QUESITI',
    descrizione: 'Risposta a quesiti in materia tributaria, societaria e contabile',
    gradoInerente: 1,
  },
  {
    codice: 'INCARICHI_GIURISDIZIONALI',
    descrizione: 'Incarichi da nomina giurisdizionale (curatore, liquidatore giudiziale, amministratore giudiziario, CTU)',
    gradoInerente: 1,
    note:
      'Nelle procedure concorsuali il titolare effettivo è il soggetto sottoposto a procedura e il curatore assume ' +
      'il ruolo di esecutore.',
  },
  {
    codice: 'DOCENZA_EDITORIA',
    descrizione: 'Attività di docenza, formazione ed editoria',
    gradoInerente: 1,
  },
  {
    codice: 'ODV_231',
    descrizione: 'Partecipazione all’organismo di vigilanza ex DLgs. 231/2001',
    gradoInerente: 1,
  },
  {
    codice: 'SIAE_BREVETTI',
    descrizione: 'Pratiche SIAE, brevetti e marchi',
    gradoInerente: 1,
  },
  {
    codice: 'ASSISTENZA_TRIBUTARIA',
    descrizione: 'Assistenza e rappresentanza in materia tributaria (contenzioso e precontenzioso)',
    gradoInerente: 1,
    note: 'Declassata a grado 1 dall’aggiornamento 2025 delle regole tecniche.',
  },

  // ---------------------------------------------------------------- grado 2
  {
    codice: 'AMMINISTRAZIONE_SOCIETA',
    descrizione: 'Amministrazione di società',
    gradoInerente: 2,
    note: 'Declassata da grado 3 a grado 2 dall’aggiornamento 2025.',
  },
  {
    codice: 'LIQUIDAZIONE_NON_GIUDIZIALE',
    descrizione: 'Liquidazione di società, enti e patrimoni in sede non giudiziale',
    gradoInerente: 2,
  },
  {
    codice: 'CONSULENZA_TRIBUTARIA',
    descrizione: 'Consulenza tributaria',
    gradoInerente: 2,
  },
  {
    codice: 'CONSULENZA_CONTRATTUALE',
    descrizione: 'Consulenza contrattuale',
    gradoInerente: 2,
  },
  {
    codice: 'CUSTODIA_BENI',
    descrizione: 'Custodia di beni e aziende',
    gradoInerente: 2,
  },
  {
    codice: 'VALUTAZIONE_QUOTE',
    descrizione: 'Valutazione di quote, aziende e patrimoni',
    gradoInerente: 2,
  },

  // ---------------------------------------------------------------- grado 3
  {
    codice: 'AMMINISTRAZIONE_TRUST',
    descrizione: 'Amministrazione di trust',
    gradoInerente: 3,
  },
  {
    codice: 'ASSISTENZA_CONTINUATIVA',
    descrizione: 'Assistenza aziendale e societaria continuativa',
    gradoInerente: 3,
    esoneroTabellaB: true,
  },
  {
    codice: 'BUSINESS_PLAN',
    descrizione: 'Valutazione di iniziative d’impresa e asseverazione di business plan',
    gradoInerente: 3,
  },
  {
    codice: 'CONSULENZA_ECONOMICO_FINANZIARIA',
    descrizione: 'Consulenza economico-finanziaria e patrimoniale',
    gradoInerente: 3,
  },
  {
    codice: 'COSTITUZIONE_ENTI_TRUST',
    descrizione: 'Costituzione di enti e trust',
    gradoInerente: 3,
  },
  {
    codice: 'TENUTA_CONTABILITA',
    descrizione: 'Tenuta della contabilità',
    gradoInerente: 3,
    esoneroTabellaB: true,
  },
  {
    codice: 'CONSULENZA_BILANCIO',
    descrizione: 'Consulenza per la redazione del bilancio',
    gradoInerente: 3,
  },
  {
    codice: 'REVISIONE_LEGALE',
    descrizione: 'Revisione legale dei conti',
    gradoInerente: 3,
    esoneroTabellaB: true,
  },

  // ---------------------------------------------------------------- grado 4
  {
    codice: 'FINANZA_STRAORDINARIA',
    descrizione: 'Consulenza in operazioni di finanza straordinaria (M&A, conferimenti, scissioni, fusioni, cessioni)',
    gradoInerente: 4,
  },

  // ------------------------------------------- fuori obbligo (art. 17 co. 7)
  {
    codice: 'DICHIARAZIONI_FISCALI',
    descrizione: 'Mera redazione e trasmissione, o sola trasmissione, delle dichiarazioni derivanti da obblighi fiscali',
    gradoInerente: 1,
    esenteAdeguataVerifica: true,
    note: 'Art. 17 co. 7 DLgs. 231/2007. Esenzione riferita alla singola prestazione, non al cliente.',
  },
  {
    codice: 'AMMINISTRAZIONE_PERSONALE',
    descrizione: 'Adempimenti in materia di amministrazione del personale ex art. 2 co. 1 L. 11.1.1979 n. 12',
    gradoInerente: 1,
    esenteAdeguataVerifica: true,
    note: 'Art. 17 co. 7 DLgs. 231/2007.',
  },
];

export function trovaPrestazione(codice: string): Prestazione | undefined {
  return CATALOGO_PRESTAZIONI_2025.find((p) => p.codice === codice);
}

export function prestazioneObbligatoria(codice: string): Prestazione {
  const p = trovaPrestazione(codice);
  if (!p) throw new Error(`Prestazione sconosciuta: ${codice}`);
  return p;
}
