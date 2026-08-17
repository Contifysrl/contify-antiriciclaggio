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
