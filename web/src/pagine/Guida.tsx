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

type Sezione = { id: string; titolo: string; icona: NomeIcona; soloTitolare?: boolean; corpo: ReactNode };

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
          <>Il titolare <K>firma</K>: da quel momento la versione è congelata <Norma>art. 32 co. 2</Norma> e correggere significa emettere una nuova versione.</>,
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
          <>Completa la valutazione e falla <K>firmare</K> al titolare: la versione si congela, correggere significa emettere una nuova versione.</>,
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
        <P>
          <K>Registro dei titolari effettivi</K> (D.M. 122/2026, operativo dal 23.7.2026): in{' '}
          <K>Controlli automatici</K> registri l'accreditamento biennale dello studio presso la
          Camera di Commercio (con promemoria al rinnovo); nel fascicolo, dopo la consultazione,
          registri il <K>riscontro</K> — data, esito, eventuale difformità da comunicare al
          gestore <Norma>art. 21 co. 4</Norma>. L'esito compare anche nella scheda di adeguata
          verifica.
        </P>
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
          Il <K>controllo costante</K> <Norma>art. 19 co. 1 lett. c)</Norma> impone di tenere
          aggiornata l'adeguata verifica per tutta la durata del rapporto. Lo scadenzario
          calcola la prossima scadenza per ogni fascicolo in base alla classe di rischio
          dell'ultima valutazione firmata: 36 mesi per il rischio non significativo e poco
          significativo, 24 per l'abbastanza significativo, 12 per il molto significativo.
        </P>
        <P>
          I fascicoli compaiono ordinati per urgenza: <K>scaduti</K>, <K>in scadenza</K> e poi
          gli altri. Rinnovare il controllo significa aprire il fascicolo e registrare una
          nuova valutazione (o confermare l'esistente con una nuova versione firmata).
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
          Questa sezione è visibile <K>solo al titolare</K>: l'art. 38 impone di limitare la
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
    id: 'ai',
    titolo: 'Assistente AI',
    icona: 'chat',
    corpo: (
      <>
        <P>
          L'assistente AI produce <K>suggerimenti, mai decisioni</K>. Due funzioni: il{' '}
          <K>suggeritore di indicatori UIF</K> — descrivi l'operatività sospetta e propone i
          sub-indici pertinenti fra i 400 testi letterali del provvedimento 12.5.2023, con il
          motivo — e le <K>bozze</K> dei campi discorsivi (scopo e natura della prestazione,
          motivazione dell'astensione), sempre da rivedere prima di firmare.
        </P>
        <P>
          C'è anche la <K>chat di assistenza</K> (il pulsante in basso a destra, quando l'AI è
          abilitata): risponde su come si usa Contify AR e dà orientamento normativo, citando le
          norme solo quando ne è certa. La conversazione vive nel tuo browser e{' '}
          <K>non viene conservata</K>.
        </P>
        <Punti punti={[
          <>Si attiva in <K>Impostazioni</K> dal titolare, accettando l'informativa: finché è spento, i pulsanti AI non compaiono.</>,
          <>Regola d'oro: nei testi per l'AI <K>niente nominativi</K>, codici fiscali o dati identificativi — si descrivono i fatti, non le persone.</>,
          <>Ogni suggerimento cita il sub-indice per codice e testo letterale: il modello non può inventare indicatori, il sistema riscontra ogni codice sul catalogo ufficiale.</>,
          <>Nel registro resta traccia dell'uso della funzione, mai del contenuto elaborato.</>,
        ]} />
        <Attenzione>
          La responsabilità professionale non si delega: la bozza va letta, corretta e assunta come
          propria; il sub-indice suggerito va verificato sul caso concreto prima di citarlo nella
          segnalazione.
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
          Il titolare, in più, gestisce gli <K>utenti dello studio</K>: creazione con password
          temporanea (mostrata una sola volta e inviata via email, se l'invio è configurato),
          cambio ruolo, disattivazione, reset amministrativo. Al primo accesso la password
          temporanea va sostituita.
        </P>
        <Punti punti={[
          <>Lo studio deve avere sempre <K>almeno un titolare attivo</K>: l'applicazione impedisce di rimuovere l'ultimo.</>,
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
          In fondo alla pagina, solo per il titolare, c'è la <K>Zona di sicurezza</K> con
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
    soloTitolare: true,
    corpo: (
      <>
        <P>
          Ogni notte l'archivio dello studio viene <K>fotografato automaticamente</K> su server
          nell'Unione Europea: restano gli ultimi 30 backup giornalieri e 12 mensili{' '}
          <Norma>art. 32 co. 2: prevenire qualsiasi perdita dei dati</Norma>. Nella pagina{' '}
          <K>Backup</K> il titolare può scaricarli, farne uno al momento, o{' '}
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
    () => SEZIONI.filter((s) => !s.soloTitolare || sessione.utente.ruolo === 'TITOLARE'),
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
