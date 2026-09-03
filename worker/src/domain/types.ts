/** Tipi del dominio antiriciclaggio. Nessuna dipendenza da runtime o DB. */

export type ClasseRischio =
  | 'NON_SIGNIFICATIVO'
  | 'POCO_SIGNIFICATIVO'
  | 'ABBASTANZA_SIGNIFICATIVO'
  | 'MOLTO_SIGNIFICATIVO';

export type LivelloVerifica = 'SEMPLIFICATA' | 'ORDINARIA' | 'RAFFORZATA';

/** Punteggio di rilevanza previsto dalle regole tecniche: intero 1..4. */
export type Punteggio = 1 | 2 | 3 | 4;

export interface VoceScala {
  valore: Punteggio;
  etichetta: string;
}

export interface SogliaClasse {
  codice: ClasseRischio;
  etichetta: string;
  /** Estremo inferiore incluso. */
  min: number;
  /** Estremo superiore escluso, salvo l'ultima classe dove e' incluso. */
  max: number;
}

export interface Fattore {
  codice: string;
  etichetta: string;
  aiuto?: string;
  /** Riferimento all'articolo del DLgs. 231/2007 da cui il fattore discende. */
  norma?: string;
  /**
   * Criteri di valutazione elencati nella modulistica CNDCEC (Modelli AV.0 e
   * AV.1, Informativa n. 57 del 26.3.2026). Trascrizione letterale: guidano il
   * giudizio del professionista, non lo sostituiscono.
   */
  criteri?: string[];
  /**
   * Ancoraggi dei punteggi 1..4 proposti dalla modulistica CNDCEC, ove
   * presenti (indice 0 = punteggio 1). La modulistica è esemplificativa:
   * il professionista può discostarsene motivando.
   */
  descrittoriPunteggio?: [string, string, string, string];
}

export interface Ruleset {
  id: string;
  etichetta: string;
  fonte: string;
  vigenzaDa: string;
  vigenzaA: string | null;
  scala: VoceScala[];
  classi: SogliaClasse[];
  autovalutazione: {
    fattoriInerente: Fattore[];
    fattoriVulnerabilita: Fattore[];
    pesi: { inerente: number; vulnerabilita: number };
  };
  adeguataVerifica: {
    tabellaA: Fattore[];
    tabellaB: Fattore[];
    pesi: { inerente: number; specifico: number };
    livelli: Record<ClasseRischio, LivelloVerifica>;
  };
  periodicitaControlloMesi: Record<ClasseRischio, number>;
  periodicitaControlloNormativa: boolean;
  /**
   * Parametri della titolarità effettiva per criterio dominicale (AR-M17).
   * Oggi art. 20 co. 2 DLgs. 231/2007: «più del 25%» (soglia esclusiva).
   * Dal 10.7.2027 il Regolamento (UE) 2024/1624, art. 52, dice «25% o più»:
   * cambia il verso della disuguaglianza, e quattro soci al 25% esatto
   * diventano tutti titolari effettivi. Vive nel ruleset, non nel motore.
   */
  titolaritaEffettiva: ParametriTitolarita;
}

export interface ParametriTitolarita {
  /** Soglia in frazione (0.25 = 25%). */
  sogliaPartecipazione: number;
  /** true = «uguale o superiore» (2027); false = «superiore» (DLgs. 231/2007). */
  sogliaInclusiva: boolean;
  /** Riferimento normativo da riportare nelle motivazioni. */
  norma: string;
  /** Dicitura leggibile della soglia, per messaggi e verbali. */
  etichettaSoglia: string;
  /**
   * AR-M20-04. Regime dei criteri:
   *  - CASCATA_ART20 (DLgs. 231/2007): proprietà → controllo → residuale, in ordine;
   *  - PARALLELO_AMLR (Reg. UE 2024/1624, artt. 51-54): proprietà e controllo si
   *    individuano indipendentemente e in parallelo; nelle strutture a più
   *    livelli l'art. 54 attribuisce la titolarità a chi controlla (>50%)
   *    un'intermedia con quota diretta rilevante e a chi ha una quota
   *    rilevante nell'entità che controlla il cliente.
   */
  regime?: 'CASCATA_ART20' | 'PARALLELO_AMLR';
  /** Soglia del controllo tramite partecipazione (frazione, esclusiva: «50% più uno»). Solo PARALLELO_AMLR. */
  sogliaControllo?: number;
  normaControllo?: string;
  normaResiduale?: string;
}

// ---------------------------------------------------------------------------
// Catalogo delle prestazioni professionali (Tabella 1 della Regola tecnica n. 2)
// ---------------------------------------------------------------------------

export interface Prestazione {
  codice: string;
  descrizione: string;
  /** Grado di rischio inerente 1..4 attribuito dalla Regola tecnica. */
  gradoInerente: Punteggio;
  /**
   * Prestazioni per le quali la Tabella B non va compilata: il rischio
   * specifico si ottiene sommando la sola Tabella A e dividendo per 4.
   */
  esoneroTabellaB?: boolean;
  /**
   * Prestazioni escluse dall'obbligo di adeguata verifica ex art. 17 co. 7:
   * mera redazione e trasmissione (o sola trasmissione) delle dichiarazioni
   * derivanti da obblighi fiscali e adempimenti in materia di amministrazione
   * del personale ex art. 2 co. 1 della L. 11.1.1979 n. 12.
   */
  esenteAdeguataVerifica?: boolean;
  note?: string;
}

// ---------------------------------------------------------------------------
// Input e output del motore di rischio
// ---------------------------------------------------------------------------

export interface InputAutovalutazione {
  /** Chiave = codice del fattore, valore = punteggio 1..4. */
  inerente: Record<string, Punteggio>;
  vulnerabilita: Record<string, Punteggio>;
}

export interface EsitoAutovalutazione {
  rulesetId: string;
  rischioInerente: number;
  vulnerabilita: number;
  rischioResiduo: number;
  classe: ClasseRischio;
  etichettaClasse: string;
  dettaglio: {
    inerente: Array<{ codice: string; etichetta: string; punteggio: Punteggio }>;
    vulnerabilita: Array<{ codice: string; etichetta: string; punteggio: Punteggio }>;
  };
  /** Traccia leggibile del calcolo, da riportare nel verbale. */
  formula: string;
}

/**
 * Circostanze giuridiche che vincolano il livello di adeguata verifica a
 * prescindere dall'esito aritmetico. Sono il cuore del valore aggiunto:
 * l'aritmetica delle regole tecniche non puo' mai derogare alla legge.
 */
export interface CircostanzeNormative {
  /** Art. 24 co. 5 lett. c): cliente o titolare effettivo persona politicamente esposta. */
  pep?: boolean;
  /** La PEP agisce in veste di organo di pubblica amministrazione: deroga alla deroga. */
  pepOrganoPubblico?: boolean;
  /** Art. 24 co. 6: PEP che ha cessato la carica da piu' di un anno, in presenza di rischio elevato. */
  exPepRischioElevato?: boolean;
  /** Art. 24 co. 5 lett. a): coinvolgimento di Paesi terzi ad alto rischio. */
  paeseTerzoAltoRischio?: boolean;
  /** Art. 23 co. 4 e art. 17 co. 2 lett. a): sospetto di riciclaggio o finanziamento del terrorismo. */
  sospettoRiciclaggio?: boolean;
  /** Art. 17 co. 2 lett. b): dubbi su veridicita' o adeguatezza dei dati identificativi. */
  dubbiIdentificazione?: boolean;
  /** Art. 42 co. 1: impossibilita' oggettiva di completare l'adeguata verifica. */
  impossibilitaVerifica?: boolean;
  /**
   * Art. 42 co. 2: societa' fiduciarie, trust, societa' anonime o controllate
   * attraverso azioni al portatore aventi sede in Paesi terzi ad alto rischio.
   */
  entitaPaeseAltoRischio?: boolean;
  /** Art. 24 co. 2 lett. a) n. 6: assetto proprietario anomalo o eccessivamente complesso. */
  assettoProprietarioComplesso?: boolean;
  /** Art. 24 co. 2 lett. a) n. 5: attivita' economica ad elevato utilizzo di contante. */
  elevatoUsoContante?: boolean;
  /**
   * Artt. 18 co. 4, 35 co. 5 e 42 co. 3: esame della posizione giuridica o
   * difesa/rappresentanza in un procedimento giudiziario.
   */
  esameposizioneGiuridica?: boolean;
}

export interface InputProfiloCliente {
  prestazione: Prestazione;
  tabellaA: Record<string, Punteggio>;
  /** Assente o vuota quando la prestazione e' esonerata dalla Tabella B. */
  tabellaB?: Record<string, Punteggio>;
  circostanze?: CircostanzeNormative;
}

export interface VincoloNormativo {
  codice: string;
  norma: string;
  descrizione: string;
  effetto: 'IMPONE_RAFFORZATA' | 'VIETA_SEMPLIFICATA' | 'IMPONE_ASTENSIONE' | 'ESCLUDE_OBBLIGO' | 'SEGNALA';
}

export interface EsitoProfiloCliente {
  rulesetId: string;
  /** Vero quando la prestazione e' fuori dall'obbligo ex art. 17 co. 7. */
  esenteAdeguataVerifica: boolean;
  rischioInerente: number;
  rischioSpecifico: number;
  rischioEffettivo: number;
  classe: ClasseRischio;
  etichettaClasse: string;
  /** Livello che deriva dalla sola aritmetica delle regole tecniche. */
  livelloCalcolato: LivelloVerifica;
  /** Livello finale, dopo l'applicazione dei vincoli di legge. */
  livelloApplicabile: LivelloVerifica;
  /** Vero se la legge ha innalzato il livello rispetto al calcolo. */
  livelloInnalzatoDaNorma: boolean;
  vincoli: VincoloNormativo[];
  /** Art. 42: l'astensione e' dovuta. */
  astensioneDovuta: boolean;
  /** Art. 35: va valutata la segnalazione di operazione sospetta. */
  valutareSos: boolean;
  tabellaBCompilata: boolean;
  formula: string;
  /** Mesi entro cui ripetere il controllo costante, dal ruleset. */
  controlloCostanteMesi: number;
}
