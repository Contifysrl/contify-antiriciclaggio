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
    id: '2026-09-10-ai-con-pseudonimizzazione',
    data: '2026-09-10',
    titolo: 'Assistente AI: nomi e dati identificativi sostituiti da segnaposto prima dell’invio, motivazione co. 6 leggibile, classificazione dell’oggetto sociale',
    punti: [
      'Pseudonimizzazione automatica: prima di ogni richiesta all’AI il programma sostituisce con segnaposto i nomi di persone ed enti presenti nell’archivio dello studio (clienti, soci e cariche, titolari effettivi, esecutori, professionisti) e i dati con formato riconoscibile ovunque compaiano (codici fiscali, partite IVA, IBAN, email e PEC, telefoni, indirizzi con civico). Se dopo la sostituzione resta un identificativo, la richiesta non parte. I nomi tornano al loro posto nella risposta, nel server di Contify AR. Vale per tutte le funzioni, anche la chat e il suggeritore di indicatori.',
      '«Rendi leggibile (AI)» nella sequenza guidata della titolarità effettiva: la motivazione ex art. 20 co. 6, che il programma scrive dai fatti della compagine, può essere riscritta in italiano piano. Il testo riscritto è verificato sui numeri (quote, capitale, date): se un numero manca o ne compare uno nuovo, resta la bozza del programma. Il professionista la corregge e la firma; la proposta registra la provenienza «AI + professionista».',
      '«Chiedi all’AI (oggetto sociale)» sul fattore A.2 del fascicolo proposto, solo quando né il codice ATECO né le parole chiave riconoscono un settore esposto: l’AI legge oggetto sociale e attività (pseudonimizzati) e propone una voce del catalogo dei settori esposti, o nessuna, con il motivo. Il punteggio è una proposta «da confermare» con provenienza AI, riportata nella motivazione della valutazione e nel verbale; uno scostamento va motivato come per ogni altra proposta. Nulla parte da solo: si chiede dal fascicolo.',
      'Informativa aggiornata (versione 2) in Impostazioni → Assistente AI: descrive cosa viene sostituito, cosa passa comunque, il blocco tecnico e cosa resta nel registro. Chi aveva accettato la versione precedente tiene le funzioni di prima; le due funzioni nuove si sbloccano dopo la conferma della versione aggiornata. L’accettazione è registrata con versione, data e autore.',
    ],
  },
  {
    id: '2026-09-07-controllo-costante-dai-dati',
    data: '2026-09-07',
    titolo: 'Controllo costante alimentato dai dati: visura da rinnovare, differenze al rinnovo, registro dei titolari effettivi',
    punti: [
      'Alert A12 «Visura da rinnovare»: quando l’ultima visura conservata è più vecchia della cadenza del controllo costante del fascicolo più esigente (36/36/24/12 mesi), lo vedi nella scheda del cliente, nello scadenzario («Rinnovo della visura», scadenza organizzativa) e in «Da completare». Nessuna soglia inventata: è lo stesso numero del controllo costante.',
      '«Aggiorna da visura» ora elenca le differenze rispetto alla compagine registrata — soci entrati e usciti, quote e diritti variati, cariche cessate, nuove o cambiate — e, se la struttura è cambiata (soci, quote, cariche con poteri), propone il controllo costante «da rivalutare» sui fascicoli vivi valutati. Lo registri con le variazioni già scritte nelle note, oppure motivi perché la valutazione resta valida: in entrambi i casi la proposta chiude con il tuo esito. Un sindaco che cambia non è struttura.',
      'Registro dei titolari effettivi (art. 21-ter DLgs. 231/2007, come riscritto dal D.Lgs. 10 giugno 2026 n. 122, in vigore dal 23 luglio 2026): in Controlli automatici l’accreditamento biennale ha ora riferimento, Camera di commercio e delegati; nel fascicolo e nella scheda del cliente registri ogni consultazione con l’esito (corrisponde, difforme, non iscritto, non consultabile con il motivo), agganci l’estratto conservato (co. 12) e registri la segnalazione delle incongruenze alla Camera di commercio (co. 7). Alert A13 e la voce urgente «Difformità da segnalare» restano accesi finché la segnalazione non è registrata; «Da completare» chiede la consultazione dopo ogni nuova fotografia dei titolari e l’estratto quando manca. Le descrizioni delle difformità sono cifrate.',
      'Pronti per il 10 luglio 2027: il Regolamento (UE) 2024/1624 cambia il modo di individuare i titolari effettivi — soglia «25% o più», proprietà e controllo valutati in parallelo, e nelle strutture a più livelli chi controlla una società con quota diretta rilevante o ha una quota rilevante nella società che controlla il cliente (art. 54). Il motore applica queste regole solo dalla data di applicazione: fino ad allora nulla cambia, ma il codice è già pronto e collaudato con date future.',
    ],
  },
  {
    id: '2026-09-06-coda-e-completezza',
    data: '2026-09-06',
    titolo: 'Coda di revisione e «Da completare»: si parte dai documenti, non dalla pagina bianca',
    punti: [
      '«Da completare» (nuova voce di menu, riepilogo anche nel Cruscotto): per ogni cliente attivo il programma calcola cosa manca perché il fascicolo antiriciclaggio sia a posto — fascicolo, valutazione firmata, titolari effettivi, PEP chiesto, documento d’identità, visura, dichiarazione art. 22, controllo costante — e lo presenta come una lista finita ordinata per urgenza, rischio e scadenza, con la norma e la sezione della modulistica CNDCEC per ogni voce e un pulsante che porta dove si risolve. Sono cose da completare, non violazioni.',
      'Coda di revisione: carica fino a sessanta visure in un colpo. Ognuna viene letta nel browser e diventa una proposta cifrata, abbinata al cliente esistente per codice fiscale o partita IVA o marcata «nuovo cliente»; nessuna produce effetti finché non la rivedi. Revisione una alla volta ma veloce (Invio applica, M modifica, frecce scorrono), «Applica tutto» solo per le proposte senza alert di gravità alta; i titolari effettivi individuati per proprietà si registrano in blocco, gli altri restano per la sequenza guidata.',
      'Alert A11 «ricorrenza nel portafoglio»: la stessa persona socia o amministratrice in cinque o più clienti, o in due società costituite negli ultimi ventiquattro mesi, viene segnalata (gravità media) con l’elenco dei clienti collegati. Il confronto usa le impronte dei codici fiscali, senza decifrarli.',
      'Nel fascicolo ora si registra il controllo costante eseguito (cosa hai controllato, con quale esito): la scadenza successiva decorre dal controllo e non resta più «scaduta» per sempre. Si può dichiarare cessato il rapporto: da quella data decorre la conservazione decennale dei documenti, senza cancellare nulla.',
      'Registro della formazione (art. 16 co. 3) in Autovalutazione studio: gli eventi seguiti dal personale alimentano il fattore «formazione» del Modello AV.0; il cruscotto di completezza alimenta il fattore «organizzazione dell’adeguata verifica».',
    ],
  },
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
