/**
 * RULESET CNDCEC 2025
 *
 * Regole tecniche ex art. 11 co. 2 del DLgs. 21.11.2007 n. 231, adottate dal
 * Consiglio nazionale dei dottori commercialisti e degli esperti contabili.
 * Versione di gennaio 2025 (Informativa CNDCEC n. 6/2025), che ha sostituito
 * le regole tecniche del 23.1.2019.
 *
 * ATTENZIONE ARCHITETTURALE
 * -------------------------
 * Pesi, soglie e catalogo delle prestazioni NON sono mai hardcoded nel motore.
 * Vivono qui, in un ruleset identificato da `id` e con una finestra di vigenza.
 * Motivo: (a) i fascicoli storici vanno ricalcolabili con il ruleset in vigore
 * alla data della valutazione; (b) dal 10.7.2027 il Regolamento (UE) 2024/1624
 * sostituira' il DLgs. 231/2007 e le regole tecniche andranno riemanate.
 * Aggiungere un ruleset = aggiungere un file, non toccare il motore.
 */

import type { Ruleset } from '../types';

export const CNDCEC_2025: Ruleset = {
  id: 'cndcec-2025',
  etichetta: 'Regole tecniche CNDCEC — aggiornamento gennaio 2025',
  fonte:
    'CNDCEC, Regole tecniche ex art. 11 co. 2 DLgs. 231/2007, gennaio 2025 (Informativa n. 6/2025); ' +
    'modulistica e indicazioni operative approvate il 18.3.2026 (Informativa n. 57/2026)',
  vigenzaDa: '2025-01-01',
  vigenzaA: null,

  // ---------------------------------------------------------------------
  // Scala comune di rilevanza (identica per rischio inerente, vulnerabilita,
  // rischio specifico). Valori interi 1..4.
  // ---------------------------------------------------------------------
  scala: [
    { valore: 1, etichetta: 'Non significativo' },
    { valore: 2, etichetta: 'Poco significativo' },
    { valore: 3, etichetta: 'Abbastanza significativo' },
    { valore: 4, etichetta: 'Molto significativo' },
  ],

  /**
   * Soglie delle classi di rischio, comuni all'autovalutazione dello studio
   * (Regola tecnica n. 1) e alla profilatura del cliente (Regola tecnica n. 2,
   * Tabella D). Intervalli chiusi a sinistra e aperti a destra, tranne l'ultimo.
   *
   * Nota: la versione 2025 ha ridefinito gli estremi proprio per eliminare le
   * sovrapposizioni presenti nel testo 2019. Non riusare le soglie 2019.
   */
  classi: [
    { codice: 'NON_SIGNIFICATIVO', etichetta: 'Non significativo', min: 1.0, max: 1.6 },
    { codice: 'POCO_SIGNIFICATIVO', etichetta: 'Poco significativo', min: 1.6, max: 2.6 },
    { codice: 'ABBASTANZA_SIGNIFICATIVO', etichetta: 'Abbastanza significativo', min: 2.6, max: 3.6 },
    { codice: 'MOLTO_SIGNIFICATIVO', etichetta: 'Molto significativo', min: 3.6, max: 4.0 },
  ],

  // =====================================================================
  // REGOLA TECNICA N. 1 — Autovalutazione del rischio dello studio
  // Attuazione degli artt. 15 e 16 del DLgs. 231/2007.
  // =====================================================================
  autovalutazione: {
    // Rischio inerente: media aritmetica semplice dei 4 fattori.
    // I 4 fattori sono quelli dell'art. 15 co. 2: tipologia di clientela,
    // area geografica di operativita', canali distributivi, prodotti e servizi.
    fattoriInerente: [
      {
        codice: 'tipologia_clientela',
        etichetta: 'Tipologia di clientela',
        aiuto:
          'Composizione del portafoglio: presenza di soggetti non residenti, strutture non trasparenti, PEP, ' +
          'settori ad alto uso di contante, enti con assetti proprietari complessi.',
        // Modello AV.0 (Informativa CNDCEC n. 57/2026): percentuale dei clienti
        // assoggettati ad adeguata verifica rafforzata.
        criteri: [
          'La valutazione è effettuata tenendo complessivamente conto della percentuale dei clienti assoggettati ' +
            'ad adeguata verifica rafforzata (Modello AV.0). Resta possibile un’altra valutazione motivata.',
        ],
        descrittoriPunteggio: [
          'Non significativa: fino al 10%',
          'Poco significativa: superiore al 10% e fino al 25%',
          'Abbastanza significativa: superiore al 25% e fino al 40%',
          'Molto significativa: superiore al 40%',
        ],
      },
      {
        codice: 'area_geografica',
        etichetta: 'Area geografica di operatività',
        aiuto:
          'Territorio in cui lo studio opera e provenienza della clientela: indici di criminalità economica, ' +
          'operatività con Paesi terzi ad alto rischio o a fiscalità privilegiata.',
        // Modello AV.0: percentuale delle prestazioni che coinvolgono Paesi terzi ad alto rischio.
        criteri: [
          'La valutazione è effettuata tenendo conto complessivamente della percentuale delle prestazioni ' +
            'professionali che coinvolgono Paesi terzi ad alto rischio di riciclaggio/finanziamento del terrorismo ' +
            'individuati dal Regolamento UE di riferimento (Modello AV.0). Resta possibile un’altra valutazione motivata.',
        ],
        descrittoriPunteggio: [
          'Non significativa: fino al 10%',
          'Poco significativa: superiore al 10% e fino al 25%',
          'Abbastanza significativa: superiore al 25% e fino al 40%',
          'Molto significativa: superiore al 40%',
        ],
      },
      {
        codice: 'canali_distributivi',
        etichetta: 'Canali distributivi',
        aiuto:
          'Modalità di acquisizione e gestione della clientela: rapporti a distanza non assistiti da ' +
          'identificazione elettronica sicura, intermediazione di terzi, procacciatori.',
        criteri: [
          'Fattore riferito alla modalità di esplicazione della prestazione professionale, anche tramite ' +
            'collaborazioni esterne, corrispondenze, canali di pagamento.',
          'Il Modello AV.0 osserva che il fattore è difficilmente associabile all’attività professionale: ' +
            'la valutazione del rischio a esso correlata assume carattere residuale.',
        ],
      },
      {
        codice: 'servizi_offerti',
        etichetta: 'Servizi offerti',
        aiuto:
          'Composizione dell’attività dello studio: peso delle prestazioni ad alto rischio inerente ' +
          '(finanza straordinaria, trust, costituzione di enti) rispetto a quelle ordinarie.',
        // Modello AV.0: incidenza delle prestazioni a rischio non/poco significativo sul totale.
        // Attenzione alla semantica invertita: più è alta l'incidenza, più basso il punteggio.
        criteri: [
          'La valutazione è effettuata tenendo conto complessivamente della incidenza percentuale sul totale ' +
            'delle prestazioni rese di quelle qualificabili come a rischio inerente “non significativo” o ' +
            '“poco significativo” (Modello AV.0). Resta possibile un’altra valutazione motivata.',
        ],
        descrittoriPunteggio: [
          'Prestazioni a basso rischio superiori all’80% del totale',
          'Prestazioni a basso rischio superiori al 60% e fino all’80%',
          'Prestazioni a basso rischio superiori al 45% e fino al 60%',
          'Prestazioni a basso rischio fino al 45% del totale',
        ],
      },
    ],

    // Vulnerabilita': media aritmetica semplice dei 4 fattori.
    // Semantica invertita: 1 = presidi completi, 4 = presidi insufficienti.
    fattoriVulnerabilita: [
      {
        codice: 'formazione',
        etichetta: 'Formazione',
        aiuto:
          'Programmi permanenti di formazione del personale ex art. 16 co. 3: esistenza, periodicità, ' +
          'tracciabilità delle presenze, aggiornamento sui nuovi indicatori di anomalia.',
        // Modello AV.0: ancoraggi comuni ai fattori di vulnerabilità.
        descrittoriPunteggio: [
          'Non significativa: presidi completi e strutturati',
          'Poco significativa: presidi ordinari',
          'Abbastanza significativa: presidi lacunosi',
          'Molto significativa: presidi insufficienti',
        ],
      },
      {
        codice: 'organizzazione_adeguata_verifica',
        etichetta: 'Organizzazione dell’adeguata verifica',
        aiuto:
          'Procedure scritte, modulistica, assegnazione delle responsabilità, controllo costante, ' +
          'presidi sulla titolarità effettiva.',
        // Modello AV.0: ancoraggi comuni ai fattori di vulnerabilità.
        descrittoriPunteggio: [
          'Non significativa: presidi completi e strutturati',
          'Poco significativa: presidi ordinari',
          'Abbastanza significativa: presidi lacunosi',
          'Molto significativa: presidi insufficienti',
        ],
      },
      {
        codice: 'organizzazione_conservazione',
        etichetta: 'Organizzazione della conservazione',
        aiuto:
          'Sistema di conservazione ex artt. 31-32: integrità, non alterabilità, storicità, ' +
          'tracciabilità degli accessi, tempestività entro 30 giorni.',
        // Modello AV.0: ancoraggi comuni ai fattori di vulnerabilità.
        descrittoriPunteggio: [
          'Non significativa: presidi completi e strutturati',
          'Poco significativa: presidi ordinari',
          'Abbastanza significativa: presidi lacunosi',
          'Molto significativa: presidi insufficienti',
        ],
      },
      {
        codice: 'organizzazione_sos',
        etichetta: 'Organizzazione della segnalazione di operazioni sospette',
        aiuto:
          'Procedura interna di rilevazione e valutazione, uso degli indicatori di anomalia UIF, ' +
          'riservatezza del segnalante, canale interno ex art. 48.',
        // Modello AV.0: ancoraggi comuni ai fattori di vulnerabilità.
        descrittoriPunteggio: [
          'Non significativa: presidi completi e strutturati',
          'Poco significativa: presidi ordinari',
          'Abbastanza significativa: presidi lacunosi',
          'Molto significativa: presidi insufficienti',
        ],
      },
    ],

    /**
     * Ponderazione finale (Regola tecnica n. 1):
     *   rischio residuo = rischio inerente x 0,40 + vulnerabilita x 0,60
     * La vulnerabilita' pesa piu' del rischio inerente perche' e' la sola
     * variabile su cui lo studio puo' effettivamente intervenire.
     */
    pesi: { inerente: 0.4, vulnerabilita: 0.6 },
  },

  // =====================================================================
  // REGOLA TECNICA N. 2 — Adeguata verifica della clientela
  // Attuazione degli artt. 17-24 del DLgs. 231/2007.
  // =====================================================================
  adeguataVerifica: {
    /**
     * Rischio specifico. Nel caso standard i punteggi delle due tabelle si
     * sommano e si dividono per 10 (4 voci della Tabella A + 6 della Tabella B).
     * Non implementare come pesi espliciti 40/60: la divisione per il numero di
     * voci effettivamente compilate e' cio' che fa funzionare l'esonero.
     *
     * Se la prestazione e' esonerata dalla Tabella B, il rischio specifico e'
     * la somma della sola Tabella A divisa per 4.
     */
    tabellaA: [
      {
        codice: 'natura_giuridica',
        etichetta: 'Natura giuridica',
        norma: 'art. 17 co. 3 lett. a) n. 1',
        // Modello AV.1, Tabella II sez. A (Informativa CNDCEC n. 57/2026).
        criteri: [
          'La congruità della natura giuridica prescelta in relazione all’attività svolta e alle sue dimensioni',
          'L’articolazione giuridica, la complessità della struttura tale da rendere più difficoltosa l’identificazione del titolare effettivo',
          'La partecipazione di persone politicamente esposte (cliente, esecutore, titolare effettivo) con necessità di eseguire l’adeguata verifica in modalità rafforzata',
          'L’esistenza di processi penali o indagini in corso con possibili connessioni al terrorismo, al riciclaggio o autoriciclaggio, al finanziamento della proliferazione delle armi di distruzione di massa',
          'La presenza di trust, intestazioni fiduciarie, associazioni, fondazioni, organizzazioni non lucrative, ONG',
        ],
      },
      {
        codice: 'prevalente_attivita',
        etichetta: 'Prevalente attività svolta',
        norma: 'art. 17 co. 3 lett. a) n. 2',
        criteri: [
          'Le attività esposte al rischio di infiltrazioni criminali e terroristiche',
          'La coerenza dell’attività svolta in concreto con la struttura organizzativa e dimensionale ovvero con le attività dichiarate',
        ],
      },
      {
        codice: 'comportamento',
        etichetta: 'Comportamento tenuto al momento del conferimento dell’incarico',
        norma: 'art. 17 co. 3 lett. a) n. 3',
        criteri: [
          'Il comportamento del cliente ai fini dello svolgimento dell’adeguata verifica',
          'La presenza ingerente di soggetti terzi con ruolo non definito',
        ],
      },
      {
        codice: 'area_geografica_cliente',
        etichetta: 'Area geografica di residenza del cliente e della controparte',
        norma: 'art. 17 co. 3 lett. a) n. 4',
        criteri: [
          'Residenza/localizzazione in Provincia italiana con flussi anomali di contante (cfr. Analisi nazionale del rischio di riciclaggio e di finanziamento del terrorismo)',
          'Residenza/localizzazione in Paesi terzi ad alto rischio individuati dal Regolamento UE di riferimento',
        ],
      },
    ],
    tabellaB: [
      {
        codice: 'tipologia',
        etichetta: 'Tipologia',
        norma: 'art. 17 co. 3 lett. b) n. 1',
        // Modello AV.1, Tabella II sez. B (Informativa CNDCEC n. 57/2026).
        criteri: [
          'Operazione ordinaria/straordinaria rispetto al profilo soggettivo del cliente',
          'Utilizzo di schemi negoziali che possono agevolare l’opacità delle relazioni economiche e finanziarie intercorrenti tra il cliente e la controparte',
          'Prestazioni professionali/operazioni connesse a settori di attività/merceologici a rischio di riciclaggio/finanziamento del terrorismo/finanziamento della proliferazione delle armi di distruzione di massa',
        ],
      },
      {
        codice: 'modalita_svolgimento',
        etichetta: 'Modalità di svolgimento',
        norma: 'art. 17 co. 3 lett. b) n. 2',
        criteri: [
          'L’utilizzo di mezzi di pagamento non tracciati',
          'L’utilizzo di valute virtuali',
          'L’utilizzo di conti non propri per trasferire/ricevere fondi',
          'Il ricorso reiterato a procure',
          'Il ricorso a domiciliazioni di comodo',
        ],
      },
      {
        codice: 'ammontare',
        etichetta: 'Ammontare dell’operazione',
        norma: 'art. 17 co. 3 lett. b) n. 3',
        criteri: [
          'La coerenza dell’ammontare dell’operazione rispetto al profilo economico e finanziario del cliente, ovvero della natura dell’operazione medesima',
          'La presenza di frazionamenti artificiosi',
        ],
      },
      {
        codice: 'frequenza_durata',
        etichetta: 'Frequenza e volume delle operazioni/durata della prestazione professionale',
        norma: 'art. 17 co. 3 lett. b) n. 4',
        criteri: [
          'La congruità della frequenza dell’operazione rispetto all’ordinaria attività esercitata dal cliente',
          'L’operatività improvvisa e poco giustificabile rispetto all’attività normalmente svolta',
          'L’ammontare dell’operazione non giustificato rispetto all’operazione stessa',
          'Le operazioni di ammontare rilevante concentrate in un ristretto arco temporale',
          'Il rapporto professionale continuativo oppure occasionale',
        ],
      },
      {
        codice: 'ragionevolezza',
        etichetta: 'Ragionevolezza',
        norma: 'art. 17 co. 3 lett. b) n. 5',
        criteri: [
          'La ragionevolezza dell’operazione rispetto all’attività svolta ordinariamente dal cliente',
          'La ragionevolezza dell’operazione rispetto all’entità delle risorse economiche nella disponibilità del cliente',
          'La congruità dell’operazione rispetto alle finalità dichiarate',
        ],
      },
      {
        codice: 'area_geografica_destinazione',
        etichetta: 'Area geografica di destinazione del prodotto e oggetto dell’operazione, del rapporto continuativo o della prestazione professionale',
        norma: 'art. 17 co. 3 lett. b) n. 6',
        criteri: [
          'La destinazione in Provincia italiana con flussi anomali di contante',
          'La destinazione in Paesi terzi ad alto rischio di riciclaggio/finanziamento del terrorismo individuati dal Regolamento UE di riferimento',
          'La destinazione in Paesi con deficienze strategiche nei sistemi AML/CFT sottoposti ad intenso monitoraggio (c.d. grey list)',
          'La ragionevolezza dell’operazione rispetto all’area geografica di destinazione',
        ],
      },
    ],

    /**
     * Rischio effettivo = rischio inerente x 0,30 + rischio specifico x 0,70.
     * Il rischio inerente e' il grado 1-4 associato alla prestazione dal
     * catalogo (Tabella 1 della Regola tecnica n. 2).
     */
    pesi: { inerente: 0.3, specifico: 0.7 },

    /**
     * Livello di adeguata verifica associato a ciascuna classe di rischio
     * effettivo. Corrispondenza CNDCEC (Modello AV.1 e Indicazioni operative,
     * Informativa n. 57/2026): non significativo e poco significativo ->
     * misure SEMPLIFICATE; abbastanza significativo -> ORDINARIE; molto
     * significativo -> RAFFORZATE. Per il rischio non significativo, nei casi
     * della Tabella 1 della RT2 vale la regola di condotta (gestita a parte
     * dal catalogo prestazioni).
     *
     * NOTA DI VERSIONE — fino al 29.7.2026 questo ruleset associava per
     * prudenza POCO_SIGNIFICATIVO -> ORDINARIA; allineato alla modulistica
     * ufficiale. I vincoli di legge (PEP, Paesi terzi ad alto rischio, art. 24)
     * continuano comunque a prevalere e possono solo innalzare il livello.
     */
    livelli: {
      NON_SIGNIFICATIVO: 'SEMPLIFICATA',
      POCO_SIGNIFICATIVO: 'SEMPLIFICATA',
      ABBASTANZA_SIGNIFICATIVO: 'ORDINARIA',
      MOLTO_SIGNIFICATIVO: 'RAFFORZATA',
    },
  },

  /**
   * Periodicita' del controllo costante ex art. 19 co. 1 lett. d).
   *
   * ATTENZIONE — PARAMETRO DI STUDIO, NON NORMATIVO.
   * Il DLgs. 231/2007 impone il controllo costante ma non ne fissa la cadenza;
   * le regole tecniche prevedono solo che per la verifica semplificata la
   * frequenza possa essere dilazionata. I valori sotto sono una prassi diffusa
   * (ripresa dalla modulistica esemplificativa CNDCEC) e restano modificabili
   * dallo studio nelle impostazioni. Il software li presenta sempre come
   * scelta organizzativa documentata, mai come obbligo di legge.
   */
  periodicitaControlloMesi: {
    // Riferimento CNDCEC (Indicazioni operative, Informativa n. 57/2026):
    // verifica semplificata -> 36 mesi, ordinaria -> 24, rafforzata -> 12-6.
    // Qui la cadenza e' espressa per classe di rischio coerentemente con il
    // livello di verifica associato; per il rischio molto significativo si
    // adotta 12 mesi, riducibile a 6 come scelta prudenziale dello studio.
    NON_SIGNIFICATIVO: 36,
    POCO_SIGNIFICATIVO: 36,
    ABBASTANZA_SIGNIFICATIVO: 24,
    MOLTO_SIGNIFICATIVO: 12,
  },
  periodicitaControlloNormativa: false,
};
