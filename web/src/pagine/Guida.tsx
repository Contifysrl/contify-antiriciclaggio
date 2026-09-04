import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Icona, type NomeIcona } from '../components/icone';
import { PiedeLegale } from '../componenti';
import type { SessioneApp } from './Accessi';

// ── Guida in-app (AR-M5) ───────────────────────────────────────
// Contenuti statici con indice laterale, ricerca e ancore
// (#guida?sezione=...) usate anche dall'help contestuale (HelpLink).
// Il modulo di assistenza, che viveva qui, da AR-M11 è la pagina
// «Assistenza» (con ticket); qui resta la sua sezione di guida.

function P({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-600 leading-relaxed mb-3">{children}</p>;
}
function Passi({ passi }: { passi: ReactNode[] }) {
  return (
    <ol className="text-sm text-ink-600 leading-relaxed mb-3 list-decimal list-outside ml-5 space-y-1.5">
      {passi.map((p, i) => <li key={i}>{p}</li>)}
    </ol>
  );
}
function Punti({ punti }: { punti: ReactNode[] }) {
  return (
    <ul className="text-sm text-ink-600 leading-relaxed mb-3 list-disc list-outside ml-5 space-y-1.5">
      {punti.map((p, i) => <li key={i}>{p}</li>)}
    </ul>
  );
}
function Nota({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-teal-50 border border-teal-200 text-teal-900 text-sm px-4 py-2.5 mb-3">{children}</div>;
}
function Attenzione({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-2.5 mb-3 flex gap-2">
      <span className="shrink-0 mt-0.5"><Icona nome="avviso" size={16} /></span>
      <span>{children}</span>
    </div>
  );
}
function K({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-ink-800">{children}</span>;
}
function Btn({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block px-1.5 py-0.5 rounded border border-ink-200 bg-ink-50 text-ink-700 text-xs font-semibold whitespace-nowrap">
      {children}
    </span>
  );
}
function Norma({ children }: { children: ReactNode }) {
  return <span className="text-ink-400">({children})</span>;
}
/** Sottotitolo dentro una sezione (AR-M17). */
function H({ children }: { children: ReactNode }) {
  return <h4 className="font-bold text-ink-800 mt-5 mb-1">{children}</h4>;
}

type Sezione = { id: string; titolo: string; icona: NomeIcona; soloTitolare?: boolean; soloAmministratore?: boolean; corpo: ReactNode };

const SEZIONI: Sezione[] = [
  {
    id: 'introduzione',
    titolo: 'Introduzione',
    icona: 'utente',
    corpo: (
      <>
        <P>
          <K>Contify AR</K> accompagna lo studio professionale negli adempimenti antiriciclaggio
          del DLgs. 231/2007, secondo le Regole tecniche e la modulistica del CNDCEC. Funziona
          interamente nel browser, senza nulla da installare; i dati stanno su server
          nell'Unione Europea e le informazioni più sensibili sono cifrate.
        </P>
        <P>Il percorso tipico segue quattro passi:</P>
        <Passi passi={[
          <>Compila l'<K>Autovalutazione dello studio</K>: è la base documentale che l'ispettore chiede per prima.</>,
          <>Censisci i <K>Clienti</K>, con eventuale qualifica PEP e i titolari effettivi.</>,
          <>Apri un <K>Fascicolo</K> per ogni prestazione e registra la <K>valutazione del rischio</K> (adeguata verifica).</>,
          <>Lascia lavorare lo <K>Scadenzario</K>: ti dice quando rifare il controllo costante, cliente per cliente.</>,
        ]} />
        <P>I ruoli rispecchiano le responsabilità dello studio:</P>
        <Punti punti={[
          <><K>Titolare</K>: firma valutazioni e autovalutazioni, accede alle segnalazioni <Norma>art. 38</Norma>, gestisce utenti e backup.</>,
          <><K>Collaboratore</K>: inserisce e istruisce clienti e fascicoli; non firma e non vede le segnalazioni.</>,
          <><K>Lettore</K>: sola lettura, senza segnalazioni.</>,
          <><K>Revisore</K>: funzione di revisione indipendente <Norma>art. 16 co. 2</Norma>.</>,
        ]} />
        <Nota>
          Nel <K>Cruscotto</K> trovi il percorso <K>«Per iniziare»</K>: la stessa sequenza, come
          checklist che si spunta da sola sui dati reali dello studio. E ogni pagina ha un
          pulsante <Btn>?</Btn> accanto al titolo che apre la sezione pertinente di questa guida.
        </Nota>
      </>
    ),
  },
  {
    id: 'cruscotto',
    titolo: 'Cruscotto',
    icona: 'dashboard',
    corpo: (
      <>
        <P>
          Il <K>Cruscotto</K> è il colpo d'occhio sullo stato dello studio: l'esito dell'ultima
          autovalutazione, i fascicoli aperti, i controlli in scadenza o scaduti e le eventuali
          violazioni sul contante. Ogni riquadro porta alla pagina corrispondente.
        </P>
        <P>
          Se un riquadro segnala qualcosa in rosso, conviene partire da lì: sono gli elementi
          che in sede ispettiva pesano di più (autovalutazione mancante, controlli costanti
          scaduti, operazioni in contante sopra soglia).
        </P>
      </>
    ),
  },
  {
    id: 'completezza',
    titolo: 'Da completare',
    icona: 'spunta',
    corpo: (
      <>
        <P>
          <K>Da completare</K> è il cruscotto di completezza: per ogni cliente attivo il programma
          calcola che cosa manca perché il fascicolo antiriciclaggio sia a posto, e lo presenta come
          una lista finita — «oggi ti mancano 14 cose, 3 urgenti, inizia da qui» — ordinata per
          urgenza, classe di rischio e scadenza. Sono cose da completare, non violazioni.
        </P>
        <P>Le regole non sono inventate: ognuna cita l'articolo del DLgs. 231/2007 e la sezione della modulistica CNDCEC (Modello AV.1, Informativa n. 57/2026) in cui l'adempimento va documentato. Le trovi con <Btn>Da dove vengono queste regole?</Btn>. In sintesi:</P>
        <Punti punti={[
          <><K>Urgenti</K>: nessun fascicolo aperto <Norma>artt. 17-18</Norma>, termine dei trenta giorni superato <Norma>art. 18 co. 3</Norma>, valutazione del rischio non registrata <Norma>art. 17 co. 3</Norma>, titolari effettivi non individuati <Norma>artt. 20-22</Norma>, corrispondenze nelle liste sanzioni da decidere.</>,
          <><K>Da fare</K>: valutazione non firmata (non fa prova), controllo costante scaduto <Norma>art. 19 co. 1 lett. d</Norma>, status PEP mai chiesto, documento d'identità del cliente o del titolare effettivo non conservato <Norma>art. 19 co. 1 lett. a-b</Norma>, dichiarazione art. 22 mancante.</>,
          <><K>Quando puoi</K>: visura camerale non conservata o da rinnovare (più vecchia della cadenza del controllo costante, alert A12), estratto del registro dei titolari effettivi non conservato <Norma>art. 21-ter co. 12</Norma>, proposta del programma in attesa.</>,
          <><K>Registro dei titolari effettivi</K> <Norma>art. 21-ter</Norma>: consultazione non registrata dopo la fotografia dei titolari (da fare), difformità non ancora segnalata alla Camera di commercio (urgente).</>,
        ]} />
        <Nota>
          Per un cliente appena importato dal gestionale l'unica cosa da fare è aprire il fascicolo:
          titolari, valutazione e documenti vengono chiesti dopo, una cosa alla volta. Ogni voce ha un
          pulsante che porta esattamente dove si risolve.
        </Nota>
        <H>Controllo costante e cessazione del rapporto</H>
        <P>
          Nel fascicolo, il riquadro <K>Controllo costante e rapporto</K> permette di registrare il
          controllo costante eseguito <Norma>art. 19 co. 1 lett. d</Norma> — cosa hai controllato
          (anagrafica, compagine, titolari, operatività, liste, PEP, documenti) e con quale esito — e
          di dichiarare cessato il rapporto, da cui decorre la conservazione decennale
          <Norma>art. 31</Norma>. Nulla si cancella: il fascicolo resta consultabile. Quando il
          rinnovo della visura cambia soci, quote o cariche con poteri, la proposta di controllo
          costante «da rivalutare» compare nella scheda del cliente: registrarla chiude la proposta
          con il tuo esito (nuova valutazione, oppure «resta valida» con la motivazione).
        </P>
        <H>Formazione</H>
        <P>
          In <K>Autovalutazione studio</K> il registro della formazione <Norma>art. 16 co. 3</Norma>
          raccoglie corsi e aggiornamenti seguiti dal personale: alimenta il fattore «formazione» del
          Modello AV.0, che altrimenti resterebbe al massimo della vulnerabilità.
        </P>
      </>
    ),
  },
  {
    id: 'coda',
    titolo: 'Coda di revisione',
    icona: 'carica',
    corpo: (
      <>
        <P>
          La <K>Coda di revisione</K> separa l'ingestione dalla conferma. Con <Btn>Scegli i PDF…</Btn>
          carichi fino a sessanta visure camerali in un colpo: vengono lette nel tuo browser (mai
          con l'AI), ognuna diventa una proposta cifrata abbinata al cliente esistente per codice
          fiscale o partita IVA, oppure marcata «nuovo cliente». Nessuna produce effetti finché non la
          rivedi: nessun cliente viene creato o modificato dall'import.
        </P>
        <P>La revisione è una alla volta, ma progettata per la velocità: proposta a sinistra, alert a destra.</P>
        <Punti punti={[
          <><Btn>Invio</Btn> applica la proposta tale e quale; <Btn>M</Btn> apre l'anagrafica per correggerla prima di applicare (l'esito diventa «modificata»); <Btn>←</Btn> <Btn>→</Btn> scorrono la coda.</>,
          <>Per un cliente esistente vedi il confronto campo per campo e spunti cosa applicare; compagine e cariche si aggiornano come serie temporale.</>,
          <>Applicata la visura, la proposta dei <K>titolari effettivi</K> entra a sua volta in coda con gli alert e la sequenza guidata dell'art. 20; il PDF viene conservato fra i documenti del cliente.</>,
          <><Btn>Applica le N senza alert alti</Btn> chiude in blocco solo le proposte senza alert di gravità alta e registra i titolari effettivi individuati per proprietà; le altre restano da rivedere.</>,
          <>Scartare una proposta richiede una motivazione: è la prova, in ispezione, del giudizio esercitato.</>,
        ]} />
        <H>Alert A11 — ricorrenza nel portafoglio</H>
        <P>
          Se la stessa persona compare come socio o amministratore in cinque o più clienti dello
          studio, o in due o più società costituite negli ultimi ventiquattro mesi, la proposta porta
          l'alert <K>A11</K> (gravità media, mai bloccante) con l'elenco dei clienti collegati. Il
          confronto avviene sulle impronte dei codici fiscali, senza decifrarli. La ricorrenza in sé
          non è un'anomalia; l'assenza di una spiegazione sì <Norma>indicatori di anomalia UIF</Norma>.
        </P>
        <Attenzione>
          Le visure caricate in blocco vengono lette dal PDF originale del Registro Imprese; le
          scansioni non si leggono. Le visure senza denominazione o natura giuridica vengono scartate
          in ingestione: per quelle usa «Nuovo da visura» e completa a mano.
        </Attenzione>
      </>
    ),
  },
  {
    id: 'autovalutazione',
    titolo: 'Autovalutazione studio',
    icona: 'grafico',
    corpo: (
      <>
        <P>
          L'<K>autovalutazione del rischio dello studio</K> <Norma>artt. 15-16</Norma> segue la
          metodologia CNDCEC: quattro fattori di <K>rischio inerente</K> e quattro di{' '}
          <K>vulnerabilità</K>, ciascuno con punteggio da 1 a 4 ancorato ai descrittori della
          modulistica ufficiale. Il rischio residuo pesa l'inerente al 40% e la vulnerabilità
          al 60%; la classe finale (da <K>non significativo</K> a <K>molto significativo</K>)
          determina l'intensità dei presìdi da adottare.
        </P>
        <Passi passi={[
          <>Assegna i punteggi: accanto a ogni fattore trovi i criteri e gli ancoraggi ufficiali dei punteggi.</>,
          <>Annota nelle <K>note</K> le ragioni delle scelte e nei <K>presìdi</K> le misure di mitigazione adottate.</>,
          <>Salva: il calcolo (con la formula per esteso) resta documentato.</>,
          <>Un <K>professionista firma</K>: da quel momento la versione è congelata <Norma>art. 32 co. 2</Norma> e correggere significa emettere una nuova versione.</>,
        ]} />
        <Nota>
          Dal pulsante del verbale scarichi il <K>verbale di autovalutazione</K> in Word, già
          intestato allo studio: è il documento da esibire in caso di ispezione.
        </Nota>
        <Attenzione>
          L'autovalutazione va aggiornata quando cambia qualcosa di rilevante (nuovi servizi,
          nuova clientela, nuova organizzazione) e comunque secondo la periodicità indicata
          dalle regole tecniche: la data dell'ultima versione firmata è la prima cosa che si guarda.
        </Attenzione>
      </>
    ),
  },
  {
    id: 'clienti',
    titolo: 'Clienti',
    icona: 'edificio',
    corpo: (
      <>
        <P>
          L'anagrafica raccoglie i dati identificativi del cliente <Norma>art. 18</Norma>. Con{' '}
          <Btn>Nuovo cliente</Btn> scegli il tipo (persona fisica, società di capitali o di
          persone, ente non profit, trust), indichi la qualifica <K>PEP</K> se ricorre{' '}
          <Norma>art. 1 co. 2 lett. dd)</Norma> e completi i dati. I dati identificativi di
          dettaglio (documento, nascita, residenza) sono <K>cifrati</K> nel database.
        </P>
        <P>
          Nella scheda del cliente registri i <K>titolari effettivi</K> <Norma>artt. 20-22</Norma>:
          l'applicazione ti guida tra i criteri (proprietà diretta o indiretta, controllo,
          criterio residuale dei poteri di rappresentanza) e conserva la data di validità di
          ogni rilevazione. L'<K>analisi della titolarità</K> suggerisce il criterio applicabile
          a partire dall'assetto proprietario che descrivi.
        </P>
        <Attenzione>
          La qualifica PEP non è una valutazione: è un fatto da accertare (autodichiarazione,
          fonti aperte). Se il cliente è PEP, la legge impone l'adeguata verifica{' '}
          <K>rafforzata</K> <Norma>art. 24 co. 5</Norma>: nell'esito della valutazione il
          livello si alza da solo, qualunque sia il punteggio.
        </Attenzione>
        <H>Partire dalla visura camerale</H>
        <P>
          Con <Btn>Nuovo da visura</Btn> carichi il <K>PDF della visura camerale</K> (ordinaria o
          storica) scaricato dal Registro Imprese: il programma la legge <K>nel tuo browser</K>,
          senza intelligenza artificiale e senza mandare il documento a nessun servizio, e
          precompila anagrafica, sede, PEC, REA, capitale, ATECO, <K>soci</K> con quote e diritti
          (proprietà, nuda proprietà, usufrutto, pegno…) e <K>cariche</K> con poteri. Tu rivedi
          ogni campo; ciò che la visura non dice resta vuoto e viene elencato, mai inventato.
        </P>
        <Passi passi={[
          <>Trascina il PDF. Funzionano le visure <K>originali del Registro Imprese</K> (InfoCamere, Telemaco e i rivenditori che ne conservano il layout); una scansione o una foto vengono rifiutate, una visura rimaneggiata dà campi vuoti.</>,
          <>Rivedi l'anagrafica precompilata e scegli se <K>conservare la visura</K> fra i documenti del cliente (impronta SHA-256, conservazione decennale <Norma>art. 31</Norma>).</>,
          <>Controlla soci e cariche: puoi correggere tipo, quota e Paese, o togliere una riga. Vengono conservati <K>cifrati</K> con la data della visura e restano leggibili anche quando cambieranno.</>,
          <>Valuta la <K>proposta dei titolari effettivi</K> <Norma>art. 20</Norma>: il programma applica il criterio della proprietà ai soci, risale le società già clienti dello studio e segnala con gli <K>alert</K> ciò che la visura non può dire.</>,
        ]} />
        <P>
          Gli alert hanno un codice, la norma e un'azione: <K>A1</K> nessun socio sopra soglia
          (anche quattro soci al 25% esatto), <K>A2</K> controllo da chiedere al cliente (assetti
          50/50, usufrutto o pegno sulle quote, socio unico società), <K>A3</K> criterio residuale
          con la <K>motivazione ex art. 20 co. 6</K> scritta in bozza dai fatti — da correggere e
          firmare —, <K>A4</K> socio società italiana (carica anche la sua visura, o la catena si
          chiude da sola se è già cliente), <K>A5</K> socio estero, <K>A6</K> fiduciaria o trust,{' '}
          <K>A7</K> quote proprie, comproprietà, capitale non versato, <K>A8</K> corrispondenze nelle
          liste sanzioni sui nomi estratti (lo screening parte da solo).
        </P>
        <Attenzione>
          «Nessuno supera il 25%, quindi il titolare effettivo è il rappresentante legale» è un
          errore frequente: salta il <K>controllo</K> <Norma>art. 20 co. 3</Norma>. La sequenza
          guidata segue i tre gradini della norma e ti fa firmare la motivazione del residuale.
          E la visura <K>non è il registro dei titolari effettivi</K> <Norma>art. 21-ter</Norma>:
          quella consultazione resta un atto distinto, da registrare dal fascicolo.
        </Attenzione>
        <Nota>
          Nella scheda del cliente, <Btn>Aggiorna da visura</Btn> confronta campo per campo la
          visura nuova con i dati registrati: applichi solo le differenze che scegli, e la
          compagine mostra cosa è cambiato. È il modo più rapido per il <K>controllo costante</K>{' '}
          <Norma>art. 19 co. 1 lett. c)</Norma>. Ogni visura la scarica e la paga lo studio dal
          proprio fornitore: il programma non compra nulla.
        </Nota>
      </>
    ),
  },
  {
    id: 'fascicoli',
    titolo: 'Fascicoli e adeguata verifica',
    icona: 'elenco',
    corpo: (
      <>
        <P>
          Il <K>fascicolo</K> è l'unità di lavoro: un cliente, una prestazione, la sua
          valutazione del rischio e i documenti raccolti. Con <Btn>Nuovo fascicolo</Btn> scegli
          la prestazione dal catalogo CNDCEC (ognuna ha il suo grado di rischio inerente
          predefinito), indichi tipo di rapporto, importo, scopo e modalità di identificazione{' '}
          <Norma>art. 19</Norma>.
        </P>
        <P>
          Dentro il fascicolo, <Btn>Nuova valutazione</Btn> apre la <K>valutazione del rischio</K>{' '}
          secondo la modulistica CNDCEC: <K>Tabella A</K> (aspetti connessi al cliente) e{' '}
          <K>Tabella B</K> (aspetti connessi alla prestazione), pesate 30% e 70%. Per le
          prestazioni a basso rischio esonerate dalla Tabella B, il calcolo usa la sola
          Tabella A. L'anteprima mostra l'esito prima di salvare.
        </P>
        <P>Dall'esito discende il livello di adeguata verifica:</P>
        <Punti punti={[
          <>rischio <K>non significativo</K> o <K>poco significativo</K> → verifica <K>semplificata</K> <Norma>art. 23</Norma>;</>,
          <>rischio <K>abbastanza significativo</K> → verifica <K>ordinaria</K>;</>,
          <>rischio <K>molto significativo</K> → verifica <K>rafforzata</K> <Norma>art. 24</Norma>.</>,
        ]} />
        <P>
          Le <K>circostanze rilevanti per legge</K> (cliente PEP, paesi terzi ad alto rischio,
          ecc.) possono solo <K>innalzare</K> il livello, mai abbassarlo: se ne ricorre una,
          l'esito lo dice espressamente con la norma di riferimento.
        </P>
        <Passi passi={[
          <>Completa la valutazione e falla <K>firmare</K> al professionista incaricato: la versione si congela, correggere significa emettere una nuova versione.</>,
          <>Carica nella sezione <K>Documenti</K> ciò che hai acquisito (documento d'identità, visura, autocertificazione del titolare effettivo, incarico): per ogni file l'applicazione calcola l'impronta di integrità e la scadenza di conservazione decennale <Norma>art. 31</Norma>.</>,
          <>Registra le <K>operazioni</K> rilevanti, comprese quelle in contante (vedi la sezione dedicata).</>,
          <>Se decidi di non eseguire la prestazione, registra l'<K>astensione</K> <Norma>art. 42</Norma> con il suo fondamento: il verbale documenta la decisione.</>,
        ]} />
        <Nota>
          Dal fascicolo scarichi la <K>Scheda di adeguata verifica</K> e il{' '}
          <K>Fascicolo per l'ispezione</K> in Word: quest'ultimo raccoglie tutto ciò che la
          Guardia di Finanza si aspetta di trovare, comprese le astensioni e l'attestazione di
          integrità del registro. Le segnalazioni di operazione sospetta non vi compaiono mai{' '}
          <Norma>artt. 38-39</Norma>.
        </Nota>
        <P>
          <K>Adeguata verifica a distanza</K>: dal fascicolo generi un collegamento sicuro e
          monouso per il cliente, che da casa compila i dati identificativi, carica il documento
          e dichiara titolarità effettiva e status PEP (con dichiarazione di veridicità ex{' '}
          <Norma>art. 22</Norma>). I dati arrivano cifrati e <K>nel fascicolo entra solo ciò che
          esamini e acquisisci tu</K>: la titolarità dichiarata, in particolare, ti viene
          proposta nel modulo dei titolari effettivi dove scegli criterio e motivazione.
        </P>
        <H>Il fascicolo proposto dai dati camerali</H>
        <P>
          Se il cliente ha una compagine in archivio (da una visura), il fascicolo nasce già{' '}
          <K>proposto</K>: il riquadro in testa mostra la <K>Tabella A</K> con un punteggio proposto
          per A.1 (natura giuridica: struttura piana, catena, soci esteri, fiduciarie, PEP), A.2
          (attività prevalente, dalla tabella dei <K>settori esposti</K> che cita per ogni voce l'Analisi
          nazionale dei rischi 2024 e gli indicatori UIF) e A.4 (area geografica: Paesi terzi ad alto
          rischio e province con flussi anomali di contante). A.3, il comportamento al conferimento,
          resta sempre <K>chiesto</K> a te: nessun documento può proporlo. Ogni punteggio porta con sé
          motivazione e fonte.
        </P>
        <Punti punti={[
          <><Btn>Usa i punteggi proposti nella Tabella A</Btn> li copia nella valutazione; se poi cambi un punteggio proposto, il programma chiede il <K>perché</K> prima di consolidare. Provenienza, motivazioni e scostamenti restano nella valutazione e nella scheda di verifica: in ispezione si vede che hai valutato la proposta, non che l'hai subita.</>,
          <>L'<K>esecutore</K> <Norma>art. 1 co. 2 lett. p</Norma> viene proposto dalle cariche (amministratore unico, presidente, liquidatore se in liquidazione…) già nel form del nuovo fascicolo: confermalo o indica chi si è presentato davvero.</>,
          <>La <K>checklist dei documenti</K> è dedotta dalla struttura: visura, identità dell'esecutore e di ciascun titolare effettivo, dichiarazione art. 22, documentazione estera per i soci esteri, mandato fiduciario, visura della controllante. Lo stato si aggiorna con i documenti conservati (carica i file con il tipo giusto).</>,
          <>Alert <K>A9</K> (società in liquidazione o in procedura) e <K>A10</K> (costituzione da meno di dodici mesi, sede in provincia a rischio contante, oggetto sociale molto ampio rispetto al capitale) sono indicatori da considerare nella Tabella A: non bloccano nulla.</>,
        ]} />
        <H>La dichiarazione del cliente sul titolare effettivo (art. 22)</H>
        <P>
          È l'atto che la legge mette in capo al cliente: fornire per iscritto, sotto la propria
          responsabilità, le informazioni sul titolare effettivo. Il programma la genera{' '}
          <K>già compilata</K> dai dati camerali — ripartizione del capitale, titolari individuati con il
          criterio applicato, domande sul controllo che la visura non può dare (patti, diritti
          particolari, vincoli sulle quote, interposizioni), status PEP per ciascun titolare effettivo e
          per l'esecutore — in due modi: <Btn>Dichiarazione art. 22 precompilata (.docx)</Btn> per la
          firma in presenza, oppure <Btn>Nuova richiesta al cliente…</Btn> con la casella{' '}
          <K>precompilata</K>: il cliente conferma o corregge da casa e la dichiarazione torna nel
          fascicolo come documento con la trascrizione integrale. Le risposte «Sì», le correzioni e i PEP
          dichiarati ti vengono segnalati: la dichiarazione <K>non scrive mai da sola</K> i titolari
          effettivi, che restano una tua valutazione <Norma>artt. 20-22</Norma>.
        </P>
        <H>Il registro dei titolari effettivi (art. 21-ter, D.Lgs. 122/2026)</H>
        <P>
          Dal 23 luglio 2026 i soggetti obbligati accedono alla sezione del Registro delle imprese
          sui titolari effettivi previo <K>accreditamento</K> telematico alla Camera di commercio,
          valido due anni, e possono delegare persone incardinate nello studio{' '}
          <Norma>art. 21-ter co. 3-5</Norma>: lo registri in <K>Controlli automatici</K> (data,
          riferimento, delegati; promemoria al rinnovo). Il portale non offre collegamenti
          automatici: consulti tu, e poi registri la <K>consultazione</K> nel fascicolo o nella scheda
          del cliente con l'esito — <K>corrisponde</K>, <K>difforme</K>, <K>non iscritto</K>,{' '}
          <K>non consultabile</K> (con il motivo: esclusione ex art. 21-sexies, portale non ancora
          operativo, accreditamento mancante).
        </P>
        <Punti punti={[
          <>Se corrisponde, conserva l'<K>estratto</K> o la prova dell'iscrizione: lo carichi fra i documenti del cliente come «Estratto del registro TE» e lo agganci alla consultazione <Norma>art. 21-ter co. 12</Norma>.</>,
          <>Se è difforme o il cliente non ha comunicato il titolare effettivo, l'incongruenza va <K>segnalata tempestivamente</K> alla Camera di commercio competente (dichiarazione sostitutiva; il segnalante resta anonimo verso il titolare) <Norma>art. 21-ter co. 7-8</Norma>: l'alert <K>A13</K> e la voce «Difformità da segnalare» in Da completare restano accesi finché non registri data e riferimento della segnalazione.</>,
          <>La consultazione <K>non esonera</K> dall'adeguata verifica <Norma>art. 21-ter co. 11</Norma>: confronta i titolari che hai accertato, non li sostituisce. Ogni consultazione è una riga dello storico.</>,
        ]} />
      </>
    ),
  },
  {
    id: 'scadenzario',
    titolo: 'Scadenzario',
    icona: 'orologio',
    corpo: (
      <>
        <P>
          Il <K>controllo costante</K> <Norma>art. 19 co. 1 lett. d)</Norma> impone di tenere
          aggiornata l'adeguata verifica per tutta la durata del rapporto. Lo scadenzario
          calcola la prossima scadenza per ogni fascicolo in base alla classe di rischio
          dell'ultima valutazione firmata: 36 mesi per il rischio non significativo e poco
          significativo, 24 per l'abbastanza significativo, 12 per il molto significativo.
        </P>
        <P>
          Con la stessa cadenza invecchia la <K>visura camerale</K>, che è la fonte dei dati su
          compagine, cariche, sede e stato: quando l'ultima visura conservata è più vecchia della
          cadenza del controllo costante del fascicolo più esigente, lo scadenzario espone{' '}
          <K>Rinnovo della visura</K> (scadenza organizzativa, non di legge), l'alert <K>A12</K>{' '}
          compare nella scheda del cliente e «Visura camerale da rinnovare» in Da completare. Con{' '}
          <Btn>Aggiorna da visura</Btn> carichi la visura nuova: il programma elenca le differenze
          (chi è entrato, chi è uscito, quote e cariche variate) e, se la <K>struttura</K> è cambiata,
          propone di registrare il controllo costante «da rivalutare» sui fascicoli vivi valutati — lo
          confermi, o spieghi perché la valutazione resta valida.
        </P>
        <P>
          I fascicoli compaiono ordinati per urgenza: <K>scaduti</K>, <K>in scadenza</K> e poi
          gli altri. Rinnovare il controllo significa aprire il fascicolo e registrare una
          nuova valutazione (o confermare l'esistente con una nuova versione firmata).
        </P>
        <P>
          Per ogni nuovo incarico lo scadenzario espone anche i due termini di <K>trenta giorni</K>{' '}
          <Norma>art. 18 co. 3</Norma> e <Norma>art. 32 co. 2 lett. b)</Norma>: completamento della
          verifica e acquisizione dei dati in conservazione. Spariscono quando la valutazione
          del fascicolo è firmata (la verifica è completa) o quando ti sei astenuto: una
          valutazione solo salvata non basta, perché non fa prova.
        </P>
        <P>
          Lo scadenzario segue anche il termine della <K>comunicazione al MEF</K> delle
          violazioni sul contante, quando ne hai registrata una.
        </P>
      </>
    ),
  },
  {
    id: 'contante',
    titolo: 'Limiti al contante',
    icona: 'mano',
    corpo: (
      <>
        <P>
          L'art. 49 vieta i trasferimenti di contante per importi <K>pari o superiori a
          5.000 €</K> (soglia vigente dal 1.1.2023; l'applicazione conosce le soglie storiche e
          applica quella vigente <K>alla data dell'operazione</K>). Il divieto copre anche i
          pagamenti artificiosamente <K>frazionati</K> per stare sotto soglia.
        </P>
        <P>
          Quando registri un'operazione in contante in un fascicolo, il controllo scatta da
          solo: se c'è violazione, l'operazione viene marcata e parte il termine per la{' '}
          <K>comunicazione al MEF</K> <Norma>art. 51</Norma>, che il professionista è obbligato
          a fare. La pagina <K>Limiti al contante</K> riepiloga soglie vigenti, violazioni
          rilevate e stato delle comunicazioni.
        </P>
        <Attenzione>
          L'omessa comunicazione al MEF è sanzionata autonomamente <Norma>art. 51 co. 1</Norma>:
          registrare l'esito della comunicazione (data e protocollo) è ciò che documenta
          l'adempimento.
        </Attenzione>
      </>
    ),
  },
  {
    id: 'controlli',
    titolo: 'Controlli automatici',
    icona: 'cerca',
    corpo: (
      <>
        <P>
          Ogni notte Contify AR confronta <K>tutti i clienti e i titolari effettivi</K> dello
          studio con le liste sanzioni pubbliche — <K>UE</K> (sanzioni finanziarie), <K>ONU</K>{' '}
          (Consiglio di Sicurezza) e <K>OFAC</K> (Tesoro USA) — e i paesi delle anagrafiche con
          l'elenco europeo dei <K>paesi terzi ad alto rischio</K>. È il controllo costante che
          diventa un controllo vero: gira da solo, non quando ci si ricorda.
        </P>
        <Punti punti={[
          <>Una <K>corrispondenza</K> è un fatto da esaminare, quasi sempre un'omonimia: la esamini con i dati del fascicolo e registri la decisione (<K>esclusa</K> o <K>confermata</K>) con la motivazione. Decisione e motivazione finiscono nel registro.</>,
          <>Una corrispondenza <K>confermata</K> impone astensione e congelamento e va valutata la segnalazione alla UIF.</>,
          <>Se un paese entra nell'elenco UE dopo la tua ultima valutazione firmata, il cliente compare tra quelli <K>da rivalutare</K> <Norma>art. 24 co. 5 lett. a)</Norma>.</>,
          <>Il diario delle corse (quando, su quante anagrafiche, con quali liste) documenta il presidio in caso di ispezione.</>,
        ]} />
        <Nota>
          Nella pagina <K>Clienti</K> trovi anche due acceleratori: <Btn>Compila dai registri</Btn>{' '}
          (denominazione e natura giuridica dalla partita IVA, archivio IVA europeo) e{' '}
          <Btn>Importa da CSV</Btn> per portare dentro l'elenco clienti dal gestionale in un colpo solo.
        </Nota>
        <P>
          Ogni lunedì, se c'è qualcosa da fare, i titolari ricevono via email il{' '}
          <K>punto della settimana</K>: adempimenti scaduti e in scadenza, corrispondenze da
          esaminare, clienti da rivalutare.
        </P>
      </>
    ),
  },
  {
    id: 'sos',
    titolo: 'Segnalazioni (SOS)',
    icona: 'avviso',
    soloTitolare: true,
    corpo: (
      <>
        <P>
          La <K>segnalazione di operazione sospetta</K> <Norma>art. 35</Norma> va inviata alla
          UIF <K>prima</K> di compiere l'operazione, quando sai, sospetti o hai motivi
          ragionevoli per sospettare operazioni di riciclaggio o finanziamento del terrorismo.
          Questa sezione è visibile <K>solo ai professionisti</K>: l'art. 38 impone di limitare la
          conoscibilità del segnalante e del contenuto.
        </P>
        <Passi passi={[
          <>Con <Btn>Nuova segnalazione</Btn> descrivi operazione e motivi del sospetto: il contenuto è <K>cifrato</K> nel database.</>,
          <>Aggancia gli <K>indicatori di anomalia UIF</K> ricorrenti (provvedimento 12.5.2023: 34 indicatori e i loro sub-indici, riportati alla lettera): il sub-indice è il livello citabile nella segnalazione.</>,
          <>Registra lo stato: bozza, in valutazione, trasmessa (con canale e data), esito ricevuto. Anche la decisione di <K>non</K> trasmettere va documentata.</>,
        ]} />
        <Attenzione>
          Il contenuto delle SOS non compare mai nei verbali, nel fascicolo per l'ispezione,
          nel registro delle attività né nelle email: la riservatezza degli artt. 38-39 è
          applicata dal software, ma resta tua la cura di non riportarlo altrove.
        </Attenzione>
      </>
    ),
  },
  {
    id: 'normativa',
    titolo: 'Normativa',
    icona: 'libro',
    corpo: (
      <>
        <P>
          La pagina <K>Normativa</K> raccoglie le fonti ufficiali dell'antiriciclaggio — il
          DLgs. 231/2007, le regole tecniche e la modulistica CNDCEC, gli indicatori e le
          istruzioni UIF, l'elenco dei paesi terzi ad alto rischio, le liste sanzioni, il
          registro dei titolari effettivi — e il <K>pacchetto europeo</K> che si applicherà
          dal 10 luglio 2027.
        </P>
        <Punti punti={[
          <>Ogni scheda spiega <K>perché la fonte conta</K> per lo studio e dove l'applicazione la usa già.</>,
          <>I collegamenti aprono i <K>testi ufficiali</K> presso chi li pubblica (Normattiva, EUR-Lex, UIF, CNDCEC): sono sempre nella versione corrente, senza copie da tenere aggiornate.</>,
        ]} />
      </>
    ),
  },
  {
    id: 'ai',
    titolo: 'Assistente AI',
    icona: 'chat',
    corpo: (
      <>
        <P>
          L'assistente AI produce <K>suggerimenti, mai decisioni</K>. Cinque funzioni: il{' '}
          <K>suggeritore di indicatori UIF</K> (descrivi l'operatività sospetta e propone i sub-indici
          pertinenti fra i 400 testi letterali del provvedimento 12.5.2023, con il motivo), le{' '}
          <K>bozze</K> dei campi discorsivi (scopo e natura della prestazione, motivazione
          dell'astensione), la <K>chat di assistenza</K> (il pulsante in basso a destra: risponde su
          come si usa Contify AR e dà orientamento normativo; la conversazione vive nel tuo browser e
          non viene conservata), la <K>motivazione ex art. 20 co. 6 resa leggibile</K> («Rendi leggibile
          (AI)» nella sequenza guidata della titolarità: riscrive in italiano piano la bozza che il
          programma costruisce dai fatti, e il testo viene verificato sui numeri — quote, capitale,
          date — prima di tornarti; se un numero manca o compare, resta la bozza del programma) e la{' '}
          <K>classificazione dell'oggetto sociale</K> («Chiedi all'AI» sul fattore A.2 del fascicolo
          proposto, solo quando né il codice ATECO né le parole chiave riconoscono un settore esposto:
          propone una voce del catalogo, o nessuna, con il motivo; il punteggio resta una proposta «da
          confermare» e uno scostamento va motivato come per ogni altra proposta).
        </P>
        <P>
          <K>Riservatezza: la pseudonimizzazione è automatica.</K> Prima di ogni invio il programma
          sostituisce con segnaposto (<code>[PF_1]</code>, <code>[PG_2]</code>, <code>[CF_1]</code>…) i nomi
          delle persone e degli enti presenti nell'archivio dello studio — clienti, soci e cariche,
          titolari effettivi, esecutori, professionisti — anche senza accenti, senza maiuscole o con nome
          e cognome invertiti, e i dati con formato riconoscibile ovunque compaiano: codici fiscali,
          partite IVA, IBAN, email e PEC, telefoni, indirizzi con civico. Passano invariati i fatti
          (prestazione, attività, quote, importi, date). Se dopo la sostituzione resta un identificativo,
          la richiesta <K>non parte</K> e il programma chiede di riformulare. I nomi tornano al loro posto
          nella risposta, nel server di Contify AR: il fornitore del modello non vede mai la
          corrispondenza. Un nome che non è nell'archivio (un terzo mai registrato) non viene
          riconosciuto: resta la regola di descrivere i fatti, non le persone.
        </P>
        <Punti punti={[
          <>Si attiva in <K>Impostazioni</K> da chi amministra lo studio, accettando l'informativa: finché è spento, i pulsanti AI non compaiono. L'informativa è versionata: quando cambia, le funzioni già accettate restano attive e quelle nuove si sbloccano dopo la conferma della versione aggiornata.</>,
          <>Ogni suggerimento cita il sub-indice o la voce del catalogo per codice: il modello non può inventare indicatori né settori, il sistema riscontra ogni codice sul catalogo ufficiale.</>,
          <>Nel registro resta traccia dell'uso della funzione (chi, quando, quale, quanti valori sostituiti) e delle richieste bloccate — mai del contenuto elaborato.</>,
          <>Cosa l'AI NON fa: non crea clienti né fascicoli, non scrive punteggi, non registra titolari, non lavora nella coda di revisione né nelle proposte del programma. Interviene solo quando la chiami.</>,
        ]} />
        <Attenzione>
          La responsabilità professionale non si delega: la bozza va letta, corretta e assunta come
          propria; il sub-indice o il settore suggerito va verificato sul caso concreto prima di
          usarlo nella segnalazione o nella valutazione.
        </Attenzione>
      </>
    ),
  },
  {
    id: 'verbali',
    titolo: 'Verbali stampabili',
    icona: 'scarica',
    corpo: (
      <>
        <P>Quattro documenti Word, intestati allo studio, pronti per la stampa o la PEC:</P>
        <Punti punti={[
          <><K>Verbale di autovalutazione</K> — dalla pagina Autovalutazione, per ogni versione.</>,
          <><K>Scheda di adeguata verifica</K> — dal fascicolo: trascrive la valutazione registrata, con punteggi, formula ed esito.</>,
          <><K>Verbale di astensione</K> — dal fascicolo, per ogni astensione registrata.</>,
          <><K>Fascicolo per l'ispezione</K> — dal fascicolo: il quadro completo da esibire alla GdF.</>,
        ]} />
        <P>
          I verbali <K>trascrivono i dati registrati</K> — con il ruleset vigente al momento
          della valutazione — e non ricalcolano mai nulla: ciò che esibisci coincide con ciò
          che hai firmato. Ogni generazione è tracciata nel registro delle attività.
        </P>
      </>
    ),
  },
  {
    id: 'registro',
    titolo: 'Attività',
    icona: 'attivita',
    corpo: (
      <>
        <P>
          La pagina <K>Attività</K> è il <K>registro degli accessi e delle operazioni</K> e
          risponde all'art. 32 co. 2:
          indica chi ha alimentato il sistema e chi vi ha avuto accesso, e ne garantisce
          integrità e non alterabilità. Ogni voce contiene l'impronta crittografica della
          precedente: alterare o rimuovere una riga rompe la catena, e la <K>verifica di
          integrità</K> in cima alla pagina lo rileverebbe.
        </P>
        <P>
          Con <Btn>Esporta CSV</Btn> scarichi l'intero registro (con le impronte) in un file
          apribile con Excel: utile da consegnare in sede ispettiva o da conservare
          periodicamente. Anche l'esportazione viene tracciata.
        </P>
        <Nota>
          Il registro è <K>append-only</K> a livello di database: nemmeno un ripristino da
          backup lo riscrive — vi aggiunge la voce che racconta il ripristino.
        </Nota>
      </>
    ),
  },
  {
    id: 'impostazioni',
    titolo: 'Impostazioni e utenti',
    icona: 'ingranaggio',
    corpo: (
      <>
        <P>
          In <K>Impostazioni</K> ognuno gestisce la propria foto profilo e la propria password.
          Chi <K>amministra lo studio</K>, in più, gestisce gli <K>utenti</K>: creazione con password
          temporanea (mostrata una sola volta e inviata via email, se l'invio è configurato),
          cambio ruolo, disattivazione, reset amministrativo. Al primo accesso la password
          temporanea va sostituita.
        </P>
        <P>
          Il ruolo <K>Professionista</K> dice chi identifica i clienti e firma; l'<K>amministrazione</K>{' '}
          dello studio è un permesso separato. In uno studio associato i professionisti sono più d'uno e
          ciascuno segue i propri clienti, ma non serve che tutti abbiano in mano licenza, backup e
          archivio. Per ciascun professionista si registrano i <K>dati d'albo</K> — qualifica, ODCEC,
          numero di iscrizione — che compaiono nell'intestazione dei verbali.
        </P>
        <H>Province con flussi anomali di contante</H>
        <P>
          Il criterio A.4 della Tabella A rinvia all'Analisi nazionale dei rischi, che pubblica
          l'indicatore UIF sull'uso anomalo del contante <K>solo come mappa a colori</K>, senza un elenco
          di province. Il programma non trascrive quella mappa: chi amministra lo studio la legge (il
          collegamento è nel riquadro) e registra qui le province classificate <K>alto</K> e{' '}
          <K>medio-alto</K>, con fonte e data. Le proposte di punteggio A.4 useranno la tabella citandola;
          finché è vuota, il programma segnala la provincia «da verificare» e lascia il punteggio a te.
          È una scelta documentata dello studio, non un elenco ufficiale.
        </P>
        <Punti punti={[
          <>Lo studio deve avere sempre <K>almeno un professionista attivo</K> e <K>almeno un amministratore attivo</K>: l'applicazione impedisce di rimuovere l'ultimo.</>,
          <>La password si recupera in autonomia da <K>Password dimenticata?</K> nella pagina di accesso: arriva un link via email valido 60 minuti.</>,
          <>Disattivazione e reset chiudono subito le sessioni aperte dell'utente.</>,
        ]} />
        <P>
          Nella sezione <K>Accessi</K> vedi i dispositivi da cui risulti collegato e puoi
          scollegarli, uno alla volta o tutti insieme. Un accesso si chiude da solo dopo{' '}
          <K>8 ore di inattività</K> — oppure dopo <K>7 giorni</K> se nel login hai spuntato{' '}
          <K>«Resta collegato su questo computer»</K>. Se non riconosci un dispositivo,
          chiudilo e cambia la password.
        </P>
        <P>
          In <K>Aspetto dell'interfaccia</K> scegli il colore fra dodici tinte e la modalità{' '}
          <K>Chiaro</K>, <K>Notturna</K> o <K>Come il computer</K>: la scelta è personale e ti
          segue su ogni dispositivo con cui entri.
        </P>
        <P>
          In fondo alla pagina, solo per chi amministra lo studio, c'è la <K>Zona di sicurezza</K> con
          l'eliminazione dell'archivio (tre passaggi e parola di conferma; prima viene creato
          un backup obbligatorio).
        </P>
      </>
    ),
  },
  {
    id: 'backup',
    titolo: 'Backup e ripristino',
    icona: 'database',
    soloAmministratore: true,
    corpo: (
      <>
        <P>
          Ogni notte l'archivio dello studio viene <K>fotografato automaticamente</K> su server
          nell'Unione Europea: restano gli ultimi 30 backup giornalieri e 12 mensili{' '}
          <Norma>art. 32 co. 2: prevenire qualsiasi perdita dei dati</Norma>. Nella pagina{' '}
          <K>Backup</K> chi amministra lo studio può scaricarli, farne uno al momento, o{' '}
          <K>ripristinare</K> l'archivio a una data precedente.
        </P>
        <Punti punti={[
          <>Prima di ogni ripristino viene creata da sola una fotografia <K>pre-ripristino</K>: anche un ripristino sbagliato è reversibile.</>,
          <>Utenti, password e registro degli accessi <K>non vengono mai toccati</K> dal ripristino.</>,
          <>L'<K>eliminazione dell'archivio</K> vive nella <K>Zona di sicurezza</K> in fondo a Impostazioni: tre passaggi, parola di conferma e un backup di sicurezza obbligatorio — se il backup non riesce, non viene toccato nulla.</>,
        ]} />
      </>
    ),
  },
  {
    id: 'novita',
    titolo: 'Novità',
    icona: 'campana',
    corpo: (
      <>
        <P>
          Il software viene aggiornato di continuo, senza nulla da installare. La pagina{' '}
          <K>Novità</K> racconta cosa è cambiato a ogni aggiornamento, dalla novità più
          recente alla più vecchia; quando c'è qualcosa che non hai ancora letto, sulla voce
          di menu compare un <K>pallino</K> con il numero delle novità da vedere.
        </P>
      </>
    ),
  },
  {
    id: 'assistenza',
    titolo: 'Assistenza',
    icona: 'salvagente',
    corpo: (
      <>
        <P>
          Dalla pagina <K>Assistenza</K> apri una <K>richiesta</K> verso Contify: la
          conversazione vive nell'applicazione, e quando arriva una risposta ricevi un avviso
          via email e un pallino sulla voce di menu. Il titolare vede tutte le richieste dello
          studio; gli altri utenti le proprie.
        </P>
        <Punti punti={[
          <>Quando il problema è risolto, la richiesta si può <K>chiudere</K> (da entrambe le parti): resta consultabile, ma per un nuovo problema se ne apre una nuova.</>,
          <>Ogni richiesta ha un numero (es. <K>TCK-2026-0001</K>): citalo se ci scrivi per altre vie.</>,
        ]} />
        <Attenzione>
          Non inserire mai nei messaggi dati di clienti dello studio né contenuti di
          segnalazioni: per l'assistenza tecnica non servono.
        </Attenzione>
      </>
    ),
  },
];

/** Testo semplice di una sezione per la ricerca (estratto dal JSX). */
function testoSezione(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(testoSezione).join(' ');
  if (typeof node === 'object' && 'props' in node) {
    const props = (node as { props: { children?: ReactNode; passi?: ReactNode[]; punti?: ReactNode[] } }).props;
    return [testoSezione(props.children), testoSezione(props.passi ?? null), testoSezione(props.punti ?? null)].join(' ');
  }
  return '';
}

export function Guida({ sessione, sezione }: { sessione: SessioneApp; sezione: string | null }) {
  const [ricerca, setRicerca] = useState('');

  const sezioni = useMemo(
    () => SEZIONI.filter((s) =>
      (!s.soloTitolare || sessione.utente.ruolo === 'TITOLARE') &&
      (!s.soloAmministratore || sessione.utente.amministratore === true)),
    [sessione.utente.ruolo],
  );

  const visibili = useMemo(() => {
    const q = ricerca.trim().toLowerCase();
    if (!q) return sezioni;
    return sezioni.filter(
      (s) => s.titolo.toLowerCase().includes(q) || testoSezione(s.corpo).toLowerCase().includes(q),
    );
  }, [ricerca, sezioni]);

  // Scroll all'ancora richiesta (HelpLink o indice) al cambio di sezione.
  useEffect(() => {
    if (!sezione) return;
    setRicerca('');
    const t = setTimeout(() => {
      document.getElementById(`guida-${sezione}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    return () => clearTimeout(t);
  }, [sezione]);

  return (
    <>
      <h1>Guida</h1>
      <p className="occhiello">
        Come usare Contify AR, sezione per sezione, con i riferimenti normativi. Per parlare
        con Contify c'è la pagina <a href="#assistenza">Assistenza</a>.
      </p>

      <div className="flex gap-6 items-start">
        {/* Indice laterale */}
        <nav className="hidden md:block w-52 shrink-0 sticky top-6">
          <input
            className="input mb-3"
            placeholder="Cerca nella guida…"
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
          />
          <div className="space-y-0.5">
            {visibili.map((s) => (
              <a
                key={s.id}
                href={`#guida?sezione=${s.id}`}
                className="block px-3 py-1.5 rounded-lg text-sm font-medium text-ink-500 hover:bg-ink-100 hover:text-ink-800 no-underline"
              >
                <span className="inline-flex items-center gap-2"><Icona nome={s.icona} size={15} /><span>{s.titolo}</span></span>
              </a>
            ))}
            {visibili.length === 0 && <div className="text-xs text-ink-400 px-3 py-2">Nessuna sezione trovata.</div>}
          </div>
        </nav>

        {/* Contenuti */}
        <div className="flex-1 min-w-0 space-y-5">
          {visibili.map((s) => (
            <section key={s.id} id={`guida-${s.id}`} className="scheda !my-0 scroll-mt-6">
              <h3 className="!mt-0 flex items-center gap-2"><Icona nome={s.icona} size={18} /><span>{s.titolo}</span></h3>
              {s.corpo}
            </section>
          ))}
          {visibili.length === 0 && (
            <div className="scheda !my-0 text-center text-sm text-ink-400 py-8">
              Nessun risultato per «{ricerca}». Prova con un'altra parola.
            </div>
          )}
        </div>
      </div>
      <PiedeLegale />
    </>
  );
}
