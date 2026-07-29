/**
 * INDICATORI DI ANOMALIA UIF
 *
 * Provvedimento UIF del 12 maggio 2023 (G.U. 25.5.2023 n. 121), applicabile
 * dal 1° gennaio 2024. Ha unificato e sostituito i previgenti set settoriali,
 * compreso il DM Giustizia 16.4.2010 specifico per i professionisti.
 *
 * Struttura: 34 indicatori in tre sezioni, ciascuno articolato in sub-indici
 * (400 in totale, in `sub-indici-uif.ts`).
 *   Sezione A (1-8)   — comportamento o caratteristiche del soggetto
 *   Sezione B (9-32)  — caratteristiche e configurazione dell'operatività
 *   Sezione C (33-34) — finanziamento del terrorismo e proliferazione
 *
 * Gli indicatori della sezione A e quelli da 9 a 14 della sezione B vanno presi
 * in considerazione da TUTTI i soggetti obbligati.
 *
 * PROVENIENZA DEL DATO
 * --------------------
 * `titoloUfficiale` è il titolo letterale trascritto dall'allegato al
 * provvedimento (PDF ufficiale, uif.bancaditalia.it, riscontrato il 29.7.2026);
 * `titolo` è un'etichetta sintetica di comodo per l'interfaccia e NON è testo
 * normativo: in una segnalazione si cita il titolo ufficiale o il sub-indice.
 *
 * `rilevanzaCommercialista` riflette il documento CNDCEC "Gli indicatori di
 * anomalia per la segnalazione di operazioni sospette" (ottobre 2024). Resta
 * comunque una guida: la selezione è responsabilità del professionista e il
 * software registra la motivazione.
 */

export type SezioneUif = 'A' | 'B' | 'C';
export type RilevanzaCommercialista = 'RILEVANTE' | 'CONDIZIONATO' | 'NON_RILEVANTE';

export interface IndicatoreUif {
  numero: number;
  sezione: SezioneUif;
  /** Etichetta sintetica per l'interfaccia. Non è testo normativo. */
  titolo: string;
  /** Titolo letterale dell'indicatore nell'allegato al provvedimento UIF 12.5.2023. */
  titoloUfficiale: string;
  /** true quando il titolo ufficiale è riscontrato sul testo del provvedimento. */
  verificato: boolean;
  /** Gli indicatori A1-A8 e B9-B14 valgono per tutti i soggetti obbligati. */
  generale: boolean;
  rilevanzaCommercialista: RilevanzaCommercialista;
  notaCndcec?: string;
}

export const INDICATORI_UIF_2023: IndicatoreUif[] = [
  { numero: 1, sezione: 'A', generale: true, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Rifiuto o riluttanza nel fornire informazioni o dati ordinariamente richiesti",
    titoloUfficiale:
      "Il soggetto cui è riferita l’operatività si rifiuta di o si mostra ripetutamente riluttante a fornire le informazioni o i dati ordinariamente richiesti e intende svolgere operatività che, per caratteristiche o importi, risulta inusuale, illogica o incoerente." },

  { numero: 2, sezione: 'A', generale: true, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Informazioni o documenti non veritieri o carenti",
    titoloUfficiale:
      "Il soggetto cui è riferita l’operatività fornisce informazioni o documenti che appaiono non veritieri o che, anche a seguito di solleciti, risultano del tutto carenti, ovvero incoerenti tra loro o con l’operatività richiesta o eseguita e intende svolgere operatività che, per caratteristiche o importi, risulta inusuale, illogica o incoerente." },

  { numero: 3, sezione: 'A', generale: true, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Comportamento difforme da casi analoghi",
    titoloUfficiale:
      "Il soggetto cui è riferita l’operatività adotta un comportamento del tutto difforme da quello comunemente tenuto in casi analoghi e intende svolgere operatività che, per caratteristiche o importi, risulta inusuale, illogica o incoerente." },

  { numero: 4, sezione: 'A', generale: true, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Assetti proprietari, manageriali e di controllo artificiosamente complessi (soggetti diversi da persona fisica)",
    titoloUfficiale:
      "Il soggetto diverso da persona fisica cui è riferita l’operatività è caratterizzato da assetti proprietari, manageriali e di controllo artificiosamente complessi ovvero opachi e intende svolgere operatività che, per caratteristiche o importi, risulta inusuale, illogica o incoerente." },

  { numero: 5, sezione: 'A', generale: true, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Coinvolgimento in procedimenti penali o di prevenzione, ovvero eventi pregiudizievoli",
    titoloUfficiale:
      "Il soggetto cui è riferita l’operatività è noto per il coinvolgimento in procedimenti penali o di prevenzione (in corso o che si sono conclusi nei suoi confronti con provvedimenti sfavorevoli) o per essere destinatario di connesse misure personali o patrimoniali ovvero gravato da eventi pregiudizievoli (quali ipoteche, protesti o procedure concorsuali), ovvero è notoriamente contiguo (per vincoli di parentela, affinità, convivenza, relazioni d’affari o altre connessioni note) a soggetti sottoposti a misure della specie ovvero opera ricorrentemente con controparti note per le medesime circostanze, laddove i procedimenti, le misure o gli eventi pregiudizievoli siano comunque di epoca relativamente recente rispetto alla valutazione compiuta dal destinatario, ovvero presenta un dubbio profilo reputazionale in relazione ad altre notizie pregiudizievoli e aggiornate (ad es. assenza di prescritte autorizzazioni) desumibili da fonti informative indipendenti e affidabili, e intende svolgere operatività che, per caratteristiche o importi, risulta inusuale, incoerente o illogica." },

  { numero: 6, sezione: 'A', generale: true, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Residenza o sede in Paesi ad alto rischio o a fiscalità privilegiata",
    titoloUfficiale:
      "Il soggetto cui è riferita l’operatività ha residenza, cittadinanza o sede in paesi o aree geografiche a rischio elevato o non cooperativi o a fiscalità privilegiata ovvero disponibilità finanziarie nei medesimi paesi o aree, ovvero opera con controparti ivi situate e intende svolgere operatività che, per caratteristiche o importi, risulta inusuale, incoerente o illogica." },

  { numero: 7, sezione: 'A', generale: true, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Persona politicamente esposta (PEP)",
    titoloUfficiale:
      "Il soggetto cui è riferita l’operatività è una persona politicamente esposta o è noto per ricoprire un grado apicale in un ente di natura pubblica o con finalità pubbliche o in società da questo controllate ovvero è noto per essere collegato (ad es. per vincoli di parentela, affinità, convivenza, relazioni d’affari o altre connessioni) a colui che ricopre il predetto grado apicale e intende svolgere operatività ovvero è beneficiario di operazioni che, per caratteristiche o importi, risultano inusuali, incoerenti o illogiche." },

  { numero: 8, sezione: 'A', generale: true, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Ente di natura pubblica o collegato a persona politicamente esposta",
    titoloUfficiale:
      "Il soggetto cui è riferita l’operatività è un ente di natura pubblica o con finalità pubbliche ovvero un ente riconducibile a una persona politicamente esposta o a un soggetto noto per rivestire un grado apicale nel medesimo ente o in società da questo controllate ovvero è noto per essere collegato (ad es. per vincoli di parentela, affinità, convivenza, relazioni d’affari o altre connessioni note) a colui che riveste il predetto grado apicale ovvero è riconducibile a partiti o movimenti politici e intende svolgere operatività che, per caratteristiche o importi, risulta inusuale, incoerente, illogica o non consentita dalla normativa vigente." },

  { numero: 9, sezione: 'B', generale: true, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Operatività non coerente con il profilo economico e patrimoniale",
    titoloUfficiale:
      "Operatività che, per caratteristiche o importi, risulta non coerente con l’attività svolta ovvero con il profilo economico, patrimoniale o finanziario del soggetto, tenuto anche conto, in caso di soggetto diverso da persona fisica, del relativo gruppo di appartenenza." },

  { numero: 10, sezione: 'B', generale: true, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Operatività inusuale rispetto a casi analoghi",
    titoloUfficiale:
      "Operatività che, per caratteristiche o importi, risulta inusuale rispetto a quella comunemente svolta in casi analoghi ovvero è effettuata con modalità o strumenti diversi da quelli normalmente utilizzati per lo svolgimento della professione o dell’attività, soprattutto se contraddistinta da elevata complessità." },

  { numero: 11, sezione: 'B', generale: true, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Operatività illogica o finanziariamente svantaggiosa",
    titoloUfficiale:
      "Operatività che, per caratteristiche o importi, risulta avere configurazione illogica, soprattutto se economicamente o finanziariamente svantaggiosa per il soggetto." },

  { numero: 12, sezione: 'B', generale: true, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Operatività in nome o a favore di terzi senza rapporti che la giustifichino",
    titoloUfficiale:
      "Operatività frequente o per importi complessivi rilevanti svolta da un soggetto in nome o a favore di terzi ovvero da terzi in nome o a favore di un soggetto qualora non risultano rapporti personali, professionali, commerciali o finanziari tra le parti." },

  { numero: 13, sezione: 'B', generale: true, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Operazioni frazionate o artificiose, anche con strumenti inusuali",
    titoloUfficiale:
      "Operazioni ripetute, artificiosamente frazionate o di importo complessivo rilevante, effettuate con strumenti (ad es. contante, valuta estera, oro, gioielli, crypto-assets o altri beni di rilevante valore) che appaiono inusuali, non coerenti con l’attività svolta o con il profilo economico, patrimoniale o finanziario del soggetto, tenuto anche conto, in caso di soggetto diverso da persona fisica, del relativo gruppo di appartenenza." },

  { numero: 14, sezione: 'B', generale: true, verificato: true, rilevanzaCommercialista: 'CONDIZIONATO',
    titolo: "Operatività in titoli non dematerializzati",
    titoloUfficiale:
      "Operatività in titoli e strumenti non dematerializzati, al portatore o all’ordine che, per modalità, frequenza e importi, risulta incoerente rispetto al profilo economico, patrimoniale o finanziario del soggetto, tenuto anche conto, in caso di soggetto diverso da persona fisica, del relativo gruppo di appartenenza, in particolare se caratterizzata dal ricorso a titoli che presentino anomalie formali ovvero artificiosamente frazionata." },

  { numero: 15, sezione: 'B', generale: false, verificato: true, rilevanzaCommercialista: 'CONDIZIONATO',
    titolo: "Movimentazione di strumenti di pagamento o conti online incoerente con la finalità dello strumento",
    titoloUfficiale:
      "Movimentazione di strumenti di pagamento o conti online che, per l’entità dei volumi complessivi, la pluralità degli strumenti utilizzati ovvero la ripetitività e altre caratteristiche delle operazioni (ad es. sequenza cronologica, ricorso al contante, ricorrenza della cifra tonda, assenza di spending), non risulta coerente con la finalità dello strumento o del conto, con il profilo economico, patrimoniale o finanziario ovvero con l’operatività del soggetto o della rete di soggetti individuati.",
    notaCndcec:
      "Tipico di prestatori di servizi di pagamento e intermediari: rilevante solo se il professionista è coinvolto nell’operatività." },

  { numero: 16, sezione: 'B', generale: false, verificato: true, rilevanzaCommercialista: 'NON_RILEVANTE',
    titolo: "Servizi di money transfer incoerenti",
    titoloUfficiale:
      "Utilizzo dei servizi di trasferimento di denaro nella forma dell’incasso o dell’invio di rimesse (c.d. money transfer) che, per caratteristiche o importi, risulta incoerente con il profilo economico, patrimoniale o finanziario o con l’operatività del soggetto.",
    notaCndcec:
      "Il CNDCEC non lo ritiene rilevante per i commercialisti, salvo conoscenza diretta dell’operatività anomala." },

  { numero: 17, sezione: 'B', generale: false, verificato: true, rilevanzaCommercialista: 'CONDIZIONATO',
    titolo: "Operatività in strumenti finanziari incoerente con il profilo economico",
    titoloUfficiale:
      "Operatività in strumenti finanziari che per il prezzo, la quantità o il controvalore dei titoli negoziati, nonché in relazione alla modalità di negoziazione, alla tipologia di controparte o all’entità delle commissioni, risulta incoerente con il profilo economico, patrimoniale o finanziario del soggetto ovvero, nel caso di soggetto diverso da persona fisica, del gruppo di appartenenza, oppure inusuale o illogica ovvero si caratterizza per l’intestazione a favore o per l’intervento di terzi." },

  { numero: 18, sezione: 'B', generale: false, verificato: true, rilevanzaCommercialista: 'CONDIZIONATO',
    titolo: "Operatività su mercati over the counter",
    titoloUfficiale:
      "Operatività posta in essere nei mercati over the counter che presenta profili di anomalia in relazione al prezzo, alla quantità, al controvalore dei titoli negoziati, nonché in relazione alla modalità di negoziazione, alla tipologia di controparte o all’entità delle commissioni, ove non sia riconducibile a specifiche attività di trading speculativo (ad es. arbitraggio)." },

  { numero: 19, sezione: 'B', generale: false, verificato: true, rilevanzaCommercialista: 'CONDIZIONATO',
    titolo: "Operatività su polizze assicurative nei rami vita",
    titoloUfficiale:
      "Operatività attinente a polizze assicurative nei rami vita che per caratteristiche, frequenza, importi, scopo dichiarato ovvero per il coinvolgimento o l’intervento di terzi, risulta incoerente con il profilo economico, patrimoniale o finanziario del soggetto, ovvero, nel caso di soggetto diverso da persona fisica, del gruppo di appartenenza, oppure risulta inusuale o illogica." },

  { numero: 20, sezione: 'B', generale: false, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Operatività con profili fiscali o societari non coerente con l’attività svolta",
    titoloUfficiale:
      "Operatività con profili fiscali o societari che, per le caratteristiche e gli importi, ovvero per le modalità di esecuzione o per l’origine o la destinazione dei flussi economici risulta non coerente con l’attività svolta ovvero con il profilo economico, patrimoniale o finanziario del soggetto, tenuto anche conto, in caso di soggetto diverso da persona fisica, del relativo gruppo di appartenenza, oppure risulta inusuale o illogica ovvero che si caratterizza per l’intestazione a favore o per l’intervento di terzi.",
    notaCndcec:
      "Indicatore cardine per i commercialisti. Sub-indici segnalati dal CNDCEC: fatture non allineate all’attività effettiva, pagamenti tramite canali poco chiari, merci mancanti in magazzino, estinzione improvvisa di debiti, trasferimento della sede all’estero da parte di società in difficoltà." },

  { numero: 21, sezione: 'B', generale: false, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Operatività oggetto di revisione non coerente, inusuale o illogica",
    titoloUfficiale:
      "Operatività oggetto di revisione che, per le caratteristiche e gli importi, ovvero per le modalità di esecuzione o per l’origine o la destinazione dei flussi economici risulta non coerente con l’attività svolta ovvero con il profilo economico, patrimoniale o finanziario del soggetto, tenuto anche conto, in caso di soggetto diverso da persona fisica, del relativo gruppo di appartenenza, oppure risulta inusuale o illogica ovvero che si caratterizza per l’intestazione a favore o per l’intervento di terzi.",
    notaCndcec:
      "Il CNDCEC lo indica tra i più rilevanti per chi svolge attività di revisione: scritture contabili alterate, fatture per servizi non supportati, cambi inusuali di criteri contabili, fatture multiple di identico importo con descrizioni generiche." },

  { numero: 22, sezione: 'B', generale: false, verificato: true, rilevanzaCommercialista: 'NON_RILEVANTE',
    titolo: "Movimentazione incoerente o illogica dei conti di gioco",
    titoloUfficiale:
      "Movimentazione dei conti di gioco che, per l’intensità o le modalità di esecuzione delle operazioni ovvero per l’origine o la destinazione dei flussi economici risulta incoerente con il profilo economico, patrimoniale o finanziario del soggetto ovvero presenta una configurazione inusuale o illogica, specie in assenza di un volume di gioco compatibile con la movimentazione.",
    notaCndcec:
      "Specifico dei prestatori di servizi di gioco: non rilevante per i commercialisti salvo conoscenza diretta." },

  { numero: 23, sezione: 'B', generale: false, verificato: true, rilevanzaCommercialista: 'NON_RILEVANTE',
    titolo: "Operatività di gioco fisico incoerente o illogica",
    titoloUfficiale:
      "Operatività di gioco fisico che, per l’intensità o le modalità di esecuzione delle operazioni ovvero per l’origine o la destinazione dei flussi economici risulta incoerente con il profilo economico, patrimoniale o finanziario del soggetto ovvero presenta una configurazione inusuale o illogica, specie in assenza di un volume di gioco compatibile con la movimentazione.",
    notaCndcec:
      "Specifico dei prestatori di servizi di gioco: non rilevante per i commercialisti salvo conoscenza diretta." },

  { numero: 24, sezione: 'B', generale: false, verificato: true, rilevanzaCommercialista: 'NON_RILEVANTE',
    titolo: "Richieste di trasporto di contante, titoli o valori con modalità inusuali o incoerenti",
    titoloUfficiale:
      "Richieste di trasporto di contante, titoli o altri valori per importi complessivamente rilevanti (noti o desumibili alla luce di circostanze quali il numero o la tipologia di plichi trasportati o le dichiarazioni rese dal cliente) relative a soggetti attivi in settori particolarmente esposti a rischi di riciclaggio (ad es. compro oro, cambio valuta, gioco o scommesse, casinò, money transfer, gestori di dispositivi che consentono l’acquisto/vendita di valute virtuali), con modalità inusuali ovvero incoerenti con il profilo economico, patrimoniale o finanziario del soggetto cui è riferita l’operatività.",
    notaCndcec:
      "Specifico di chi custodisce e trasporta denaro contante e valori: non rilevante per i commercialisti salvo conoscenza diretta." },

  { numero: 25, sezione: 'B', generale: false, verificato: true, rilevanzaCommercialista: 'NON_RILEVANTE',
    titolo: "Richieste di ritiro o sovvenzione di valori incompatibili con la consueta operatività",
    titoloUfficiale:
      "Richieste di operazioni di ritiro o sovvenzione da o verso specifici punti serviti ovvero soggetti privati che, in termini di frequenza, importi, taglio e valuta, non sono compatibili con la consueta operatività ovvero sono incoerenti con il profilo economico, patrimoniale o finanziario del soggetto cui è riferita l’operatività o con l’attività del singolo punto operativo.",
    notaCndcec:
      "Specifico di chi custodisce e trasporta denaro contante e valori: non rilevante per i commercialisti salvo conoscenza diretta." },

  { numero: 26, sezione: 'B', generale: false, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Operatività in crypto-assets incoerente, inusuale o illogica",
    titoloUfficiale:
      "Operatività in crypto-assets che per ammontare, intensità o modalità di esecuzione delle operazioni ovvero per l’origine o la destinazione dei flussi risulta incoerente con il profilo economico, patrimoniale o finanziario del soggetto, tenuto anche conto, in caso di soggetto diverso da persona fisica, del relativo gruppo di appartenenza, ovvero presenta una configurazione inusuale o illogica, specie quando nella movimentazione effettuata manchi la convenienza economica.",
    notaCndcec:
      "Applicabile anche da professionisti che intercettino operazioni sospette basate su crypto-assets (criterio dell’allegato UIF)." },

  { numero: 27, sezione: 'B', generale: false, verificato: true, rilevanzaCommercialista: 'NON_RILEVANTE',
    titolo: "Operatività in crypto-assets verso address non riconducibili al titolare o a rischio",
    titoloUfficiale:
      "Operatività in crypto-assets, specie se di importo rilevante, in contropartita di address per i quali, sulla base delle informazioni disponibili, non è possibile risalire con ragionevole certezza all’effettivo titolare o che risultano collegati, anche indirettamente, a contesti a rischio ovvero a paesi o aree geografiche a rischio elevato o non cooperativi o a fiscalità privilegiata ovvero con normativa antiriciclaggio carente o inadeguata in particolare con riguardo alle valute virtuali.",
    notaCndcec:
      "Specifico dei prestatori di servizi in valuta virtuale e portafoglio digitale: non rilevante salvo conoscenza diretta." },

  { numero: 28, sezione: 'B', generale: false, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Operatività incoerente su mandati fiduciari aventi a oggetto partecipazioni societarie",
    titoloUfficiale:
      "Operatività ripetuta o per importi rilevanti connessa con mandati fiduciari aventi a oggetto partecipazioni societarie che risulta incoerente con il profilo economico, patrimoniale o finanziario del soggetto, tenuto anche conto, in caso di soggetto diverso da persona fisica, del relativo gruppo di appartenenza, ovvero presenta una configurazione inusuale o illogica.",
    notaCndcec:
      "L’allegato UIF indica che gli indicatori 28-30 possono essere presi in considerazione anche dai professionisti." },

  { numero: 29, sezione: 'B', generale: false, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Operatività incoerente su mandati fiduciari aventi a oggetto conti, strumenti finanziari o altri beni",
    titoloUfficiale:
      "Operatività ripetuta o per importi rilevanti connessa con mandati fiduciari aventi a oggetto conti correnti, strumenti finanziari, polizze assicurative, crediti, beni immateriali o altri beni di elevato valore, che risulta incoerente con il profilo economico, patrimoniale o finanziario del soggetto, tenuto anche conto, in caso di soggetto diverso da persona fisica, del relativo gruppo di appartenenza, ovvero presenta una configurazione inusuale o illogica.",
    notaCndcec:
      "L’allegato UIF indica che gli indicatori 28-30 possono essere presi in considerazione anche dai professionisti." },

  { numero: 30, sezione: 'B', generale: false, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Operatività su trust o altri strumenti di protezione patrimoniale incoerente o distorta",
    titoloUfficiale:
      "Operatività inerente a trust o altro strumento di protezione patrimoniale che, in relazione all’oggetto, alle caratteristiche e alle finalità, ovvero per i soggetti intervenuti o i collegamenti fra questi ultimi risulta incoerente con il profilo economico, patrimoniale o finanziario del soggetto, tenuto anche conto, in caso di soggetto diverso da persona fisica, del relativo gruppo di appartenenza, ovvero illogica o comunque tale da configurare un utilizzo distorto dello strumento.",
    notaCndcec:
      "L’allegato UIF indica che gli indicatori 28-30 possono essere presi in considerazione anche dai professionisti." },

  { numero: 31, sezione: 'B', generale: false, verificato: true, rilevanzaCommercialista: 'CONDIZIONATO',
    titolo: "Cessione o acquisto di crediti e di asset in procedure concorsuali incoerente o inusuale",
    titoloUfficiale:
      "Operatività connessa con la cessione o l’acquisto di crediti o con la cessione di asset nell’ambito di procedure concorsuali o a garanzia di crediti, anche in relazione a rapporti di factoring o di cartolarizzazione, che, per la natura, il valore o le caratteristiche dei crediti o dei beni stessi, per le finalità dell’operazione complessiva, per i soggetti intervenuti o i collegamenti fra questi ultimi, risulta incoerente con il profilo economico, patrimoniale o finanziario del soggetto, tenuto anche conto, in caso di soggetto diverso da persona fisica, del relativo gruppo di appartenenza, ovvero presenta una configurazione inusuale o illogica." },

  { numero: 32, sezione: 'B', generale: false, verificato: true, rilevanzaCommercialista: 'CONDIZIONATO',
    titolo: "Operatività ripetuta o rilevante su conti di corrispondenza incoerente con il profilo",
    titoloUfficiale:
      "Operatività su conto corrente di corrispondenza e rapporti a essi assimilabili (infra conto o rapporto) ripetuta o di importo complessivo rilevante che, in relazione ai flussi finanziari complessivamente transitati, alle informazioni fornite dall’ente rispondente, all’ubicazione geografica dei soggetti o degli intermediari intervenuti nei pagamenti, risulta incoerente con il profilo economico, patrimoniale o finanziario del soggetto, tenuto anche conto, in caso di soggetto diverso da persona fisica, del relativo gruppo di appartenenza, ovvero presenta una configurazione, inusuale o illogica." },

  { numero: 33, sezione: 'C', generale: true, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Operatività potenzialmente connessa con il finanziamento del terrorismo",
    titoloUfficiale:
      "Operatività che, per il profilo dei soggetti coinvolti o le sue caratteristiche ovvero per il coinvolgimento di associazioni, fondazioni o organizzazioni non lucrative, appare riconducibile a fenomeni di finanziamento del terrorismo, anche sulla base di collegamenti geografici con aree considerate a rischio di terrorismo per la diffusa presenza di organizzazioni terroristiche o per situazioni di conflitto o instabilità politica." },

  { numero: 34, sezione: 'C', generale: true, verificato: true, rilevanzaCommercialista: 'RILEVANTE',
    titolo: "Operatività connessa a programmi di proliferazione di armi di distruzione di massa",
    titoloUfficiale:
      "Operatività che, per il profilo dei soggetti o le sue caratteristiche, appare riconducibile a fenomeni di finanziamento di programmi di proliferazione di armi di distruzione di massa, anche sulla base di collegamenti geografici con paesi considerati a rischio in quanto coinvolti in programmi di proliferazione non autorizzati." },
];

export const AVVISO_INDICATORI =
  'L’elencazione degli indicatori e dei relativi sub-indici non è esaustiva né vincolante: la loro presenza non è di per sé ' +
  'sufficiente a fondare una segnalazione e vanno valutati anche comportamenti non descritti che generino in concreto profili ' +
  'di sospetto (allegato al provvedimento UIF 12.5.2023). La selezione degli indicatori applicabili è responsabilità del professionista.';

export function indicatoriPerCommercialista(includiNonRilevanti = false): IndicatoreUif[] {
  return INDICATORI_UIF_2023.filter((i) =>
    includiNonRilevanti ? true : i.rilevanzaCommercialista !== 'NON_RILEVANTE',
  );
}

export function indicatoriDaVerificare(): IndicatoreUif[] {
  return INDICATORI_UIF_2023.filter((i) => !i.verificato);
}
