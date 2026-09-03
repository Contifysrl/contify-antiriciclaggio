// ── Novità di prodotto (AR-M11) ────────────────────────────────
//
// Il changelog che l'utente legge nella pagina «Novità», scritto per chi
// usa lo studio, non per chi sviluppa. Gli id sono ordinabili come stringhe
// (data + slug): il "non visto" è ogni voce con id maggiore di
// utenti.novita_vista. Si AGGIUNGE una voce in testa, mai si riscrive
// la storia.

export interface VoceNovita {
  id: string;
  data: string; // ISO, giorno di rilascio
  titolo: string;
  punti: string[];
}

export const NOVITA: VoceNovita[] = [
  {
    id: '2026-09-05-visure-vere-catena',
    data: '2026-09-05',
    titolo: 'Visure: cariche al femminile e catene su più livelli',
    punti: [
      'Il lettore delle visure riconosce le cariche scritte al femminile («amministratrice unica», «consigliera», «liquidatrice»), le intestazioni spezzate su due righe («Presidente Consiglio» / «Amministrazione»), la nascita indicata sulla riga del nome e chi cumula più cariche: la principale (presidente del CdA prima di consigliere) diventa la carica, le altre restano nei poteri. Calibrato su tre visure vere di un gruppo a tre livelli.',
      'Catena partecipativa: se la holding è già cliente ma la sua socia no, il programma non salta più al criterio residuale dell’art. 20 co. 5 — «nessuno supera il 25%» non si può dire senza aver risalito tutta la catena. Si ferma, lo scrive fra le avvertenze e apre un alert A4 «Catena da risalire oltre la controllante» con l’invito a caricare la visura mancante.',
    ],
  },
  {
    id: '2026-09-05-scadenzario-termini-chiusi',
    data: '2026-09-05',
    titolo: 'Scadenzario: i termini dei trenta giorni si chiudono con la firma',
    punti: [
      'I termini di trenta giorni per il completamento della verifica (art. 18 co. 3) e per l’acquisizione dei dati in conservazione (art. 32 co. 2 lett. b) non restano più «scaduti» per sempre: spariscono dallo scadenzario quando la valutazione del fascicolo è firmata o quando ti sei astenuto. Una valutazione solo salvata continua a tenerli aperti, perché non fa prova. Il controllo costante resta.',
    ],
  },
  {
    id: '2026-09-04-fascicolo-proposto',
    data: '2026-09-04',
    titolo: 'Il fascicolo proposto: Tabella A, esecutore, documenti e dichiarazione art. 22 dai dati camerali',
    punti: [
      'Quando apri un fascicolo per un cliente con la compagine in archivio, il programma propone la Tabella A: natura giuridica dalla struttura (soci, catene, esteri, fiduciarie), attività prevalente dalla tabella dei settori esposti — ogni voce cita l’Analisi nazionale dei rischi 2024 o gli indicatori UIF — e area geografica dai Paesi terzi ad alto rischio e dalle province a rischio contante. Il comportamento al conferimento resta sempre da valutare a te. Ogni punteggio ha motivazione e fonte; se ti scosti, scrivi il perché e resta nel verbale.',
      'L’esecutore viene proposto dalle cariche già nel form del nuovo fascicolo (amministratore unico, presidente del CdA, liquidatore se la società è in liquidazione): confermalo o indica chi si è presentato.',
      'La checklist dei documenti da raccogliere è dedotta dalla struttura del cliente: visura, identità dell’esecutore e di ogni titolare effettivo, dichiarazione art. 22, documentazione estera, mandato fiduciario, visura della controllante. Nella scheda del cliente scegli il tipo di documento quando lo alleghi: la checklist si aggiorna da sola.',
      'La dichiarazione del cliente sul titolare effettivo (art. 22) nasce già compilata: ripartizione del capitale, titolari individuati, domande sul controllo che la visura non può dare, PEP per ciascuna persona. La scarichi in Word per la firma in presenza, oppure la invii con la verifica a distanza: il cliente conferma o corregge da casa e la dichiarazione torna nel fascicolo come documento. I titolari effettivi non si scrivono mai da soli.',
      'Due nuovi alert: A9 per le società in liquidazione o in procedura e A10 per la costituzione recente, la sede in provincia a rischio contante e l’oggetto sociale molto ampio rispetto al capitale.',
      'In Impostazioni chi amministra lo studio compila la tabella delle province con flussi anomali di contante leggendo la mappa dell’Analisi nazionale dei rischi (il collegamento è lì): l’Analisi non pubblica un elenco e il programma non lo inventa.',
    ],
  },
  {
    id: '2026-09-03-anagrafiche-da-visura',
    data: '2026-09-03',
    titolo: 'Partire dalla visura camerale: anagrafica, compagine e titolari effettivi proposti',
    punti: [
      'In Clienti trovi «Nuovo da visura»: trascini il PDF della visura camerale e il programma lo legge nel tuo browser — niente intelligenza artificiale, niente servizi esterni, il file non lascia lo studio. Anagrafica, sede, PEC, REA, capitale, ATECO, soci con quote e diritti, cariche con poteri: tutto precompilato, tutto da rivedere. Ciò che la visura non dice resta vuoto e viene elencato, mai inventato.',
      'Soci e cariche restano registrati, cifrati, con la data della visura: al prossimo rinnovo vedrai cosa è cambiato. Se un socio è una società già cliente dello studio, la catena partecipativa si ricostruisce da sola con i dati in archivio.',
      'I titolari effettivi vengono proposti applicando l’art. 20 ai dati camerali, con la soglia letta dalle regole vigenti (oggi «più del 25%»; dal 10 luglio 2027 «25% o più», come vuole il Regolamento UE 2024/1624). Otto alert, ciascuno con norma e azione, segnalano ciò che la visura non può dire: nessun socio sopra soglia, controllo da chiedere al cliente, usufrutto o pegno sulle quote, socio società o estero, fiduciarie e trust, quote proprie, corrispondenze nelle liste sanzioni.',
      'Quando la proprietà non individua nessuno, la sequenza guidata segue i tre gradini della norma — proprietà, controllo, residuale — e scrive in bozza la motivazione dell’art. 20 co. 6 partendo dai fatti: la correggi e la firmi tu. Niente salti al rappresentante legale.',
      'Dalla scheda del cliente, «Aggiorna da visura» confronta la visura nuova con i dati registrati e applica solo le differenze che scegli; la visura si conserva fra i documenti del cliente con la sua impronta. Ogni proposta del programma resta nello storico con il tuo esito: applicata, modificata o scartata, e perché.',
      'Lo screening sulle liste sanzioni ora controlla anche soci e amministratori letti dalle visure, subito e a ogni corsa notturna.',
    ],
  },
  {
    id: '2026-08-19b-posti-professionista',
    data: '2026-08-19',
    titolo: 'Posti professionista a contratto',
    punti: [
      'Il contratto dello studio può ora prevedere un numero di posti professionista. In Impostazioni → Utenti dello studio vedi quanti ne stai usando; se sono tutti occupati e vuoi aggiungere un associato, basta una richiesta dalla pagina Assistenza e adeguiamo il contratto.',
      'Collaboratori, lettori e revisori non contano: il posto riguarda solo chi identifica e firma.',
    ],
  },
  {
    id: '2026-08-19-studio-associato',
    data: '2026-08-19',
    titolo: 'Studio associato e autovalutazione che si nutre dei clienti',
    punti: [
      'Più professionisti nello stesso studio: ciascuno identifica i propri clienti, firma le proprie valutazioni e compare col proprio nome — qualifica, ODCEC e numero di iscrizione — sulla scheda di adeguata verifica. Il ruolo «Titolare» si chiama ora «Professionista».',
      'Amministrare lo studio è diventato un permesso a parte: utenti, licenza, backup ed Elimina Archivio restano a chi amministra, non arrivano in dote a ogni associato.',
      'Su cliente e fascicolo si indica il professionista incaricato e chi ha materialmente identificato il cliente, con la data (art. 19 co. 1 lett. a). Elenchi e filtri permettono di vedere «i miei».',
      'Se firmi la valutazione di un cliente intestato a un collega il programma non lo vieta, ma chiede il perché — sostituzione, assenza, subentro — e lo scrive nel verbale.',
      'L’autovalutazione dello studio non si compila più al buio: il programma calcola sui clienti caricati le percentuali che il Modello AV.0 chiede (clienti in verifica rafforzata, prestazioni con Paesi ad alto rischio, prestazioni a basso rischio inerente) e propone i punteggi del rischio inerente, con numeratore e denominatore in chiaro.',
      'La vulnerabilità dei presidi viene proposta a partire da quello che il programma sa di sé: formazione registrata, documenti acquisiti entro i trenta giorni, controlli costanti scaduti, titolarità effettive mancanti. Resta un giudizio tuo, e i punteggi si cambiano — motivando lo scostamento, come chiede la Regola tecnica.',
      'Quando i dati si muovono al punto da cambiare un punteggio, il cruscotto lo segnala e propone una nuova versione. La versione firmata non si tocca: l’art. 32 vuole che si emetta la successiva.',
    ],
  },
  {
    id: '2026-08-19-scheda-cliente',
    data: '2026-08-19',
    titolo: 'La scheda del cliente: si apre, si modifica, si cancella',
    punti: [
      'Cliccando un cliente nell’elenco si apre la sua scheda, con anagrafica, titolari effettivi e fascicoli. Prima il click portava alla pagina Fascicoli.',
      'L’anagrafica si modifica: utile soprattutto dopo un import dal gestionale, quando la natura giuridica dedotta dalla denominazione va corretta.',
      'Un cliente che non segui più si archivia: sparisce dagli elenchi e dalle scelte per i nuovi fascicoli, senza perdere nulla di quanto registrato. La spunta «Mostra anche i clienti archiviati» lo fa riapparire.',
      'Un cliente inserito per errore, a cui non è ancora collegato nulla, il titolare può cancellarlo definitivamente. Dove invece c’è già un fascicolo, un documento o una segnalazione, resta solo l’archiviazione: l’art. 31 impone di conservare per dieci anni.',
    ],
  },
  {
    id: '2026-08-04-normativa',
    data: '2026-08-04',
    titolo: 'La Normativa a portata di clic',
    punti: [
      'Nuova voce «Normativa» nel menu: i testi ufficiali delle regole antiriciclaggio — DLgs. 231/2007, regole tecniche CNDCEC, indicatori e istruzioni UIF, paesi ad alto rischio, liste sanzioni, registro dei titolari effettivi — con i collegamenti alle fonti, sempre nella versione corrente.',
      'C’è anche il quadro che arriva: il pacchetto antiriciclaggio europeo (regolamento unico, sesta direttiva, autorità AMLA) con le date da segnare in agenda.',
    ],
  },
  {
    id: '2026-08-04-impostazioni',
    data: '2026-08-04',
    titolo: 'Colori, modalità notturna e controllo degli accessi',
    punti: [
      'In Impostazioni puoi scegliere il colore dell’interfaccia fra dodici tinte e la modalità Chiaro, Notturna o «Come il computer»: la scelta è personale e ti segue su ogni dispositivo.',
      'Nel login c’è la casella «Resta collegato su questo computer»: senza, l’accesso si chiude da solo dopo 8 ore di inattività; con la spunta dura fino a 7 giorni.',
      'Sempre in Impostazioni vedi i dispositivi da cui risulti collegato e puoi scollegarli, uno alla volta o tutti insieme.',
      'L’eliminazione dell’archivio si è spostata nella «Zona di sicurezza» in fondo a Impostazioni; la pagina Backup resta per backup e ripristini.',
    ],
  },
  {
    id: '2026-08-04-menu-assistenza',
    data: '2026-08-04',
    titolo: 'Nuovo menu, pagina Novità e assistenza con risposte in app',
    punti: [
      'Il menu di sinistra ora distingue Impostazioni, Backup, Attività, Novità, Guida e Assistenza: le stesse voci degli altri prodotti Contify.',
      'L’assistenza diventa una conversazione: apri una richiesta, Contify risponde direttamente nell’app e un pallino sul menu ti avvisa quando c’è una risposta da leggere.',
      'Questa pagina raccoglie le novità di ogni aggiornamento: quando c’è qualcosa di nuovo, lo vedi dal pallino su «Novità».',
    ],
  },
  {
    id: '2026-08-03-percorso-e-chat',
    data: '2026-08-03',
    titolo: 'Percorso «Per iniziare» e chat di assistenza',
    punti: [
      'Nel Cruscotto trovi il percorso «Per iniziare»: la sequenza consigliata dei primi passi, che si spunta da sola man mano che lo studio carica i propri dati.',
      'Con l’AI abilitata compare il pulsante di chat in basso a destra: risponde su come si usa Contify AR e dà orientamento normativo.',
    ],
  },
  {
    id: '2026-08-02-controlli-automatici',
    data: '2026-08-02',
    titolo: 'Controlli automatici e verifica a distanza',
    punti: [
      'Ogni notte clienti e titolari effettivi vengono confrontati con le liste sanzioni UE, ONU e OFAC e con l’elenco europeo dei paesi terzi ad alto rischio.',
      'Dal fascicolo puoi far compilare l’adeguata verifica direttamente al cliente, con un collegamento sicuro e monouso.',
      'Anagrafiche più veloci: compilazione dalla partita IVA e import CSV dal gestionale.',
    ],
  },
];

export function idNovitaValido(id: string): boolean {
  return NOVITA.some((n) => n.id === id);
}
