# Contify AR — Informativa sull'assistente AI (versione 2)

> Testo mostrato in **Impostazioni → Assistente AI** e accettato da chi
> amministra lo studio. La versione 1 (luglio 2026) descriveva un divieto
> testuale di nominativi; la versione 2 (settembre 2026, AR-M21) descrive la
> pseudonimizzazione automatica e le due funzioni nuove. Chi ha accettato la
> v1 tiene le funzioni di prima; le funzioni nuove si sbloccano solo dopo la
> conferma della v2. Questo file è la copia da inviare allo Studio AVVOCARE
> per l'appendice AI alle Condizioni generali e al DPA (P21-04).

## 1. Che cosa fa l'assistente

L'assistente AI di Contify AR produce **suggerimenti, mai decisioni**: ogni
valutazione, bozza o classificazione resta del professionista, che la legge,
la corregge e la assume come propria. Le funzioni sono:

1. **Suggeritore di indicatori UIF** — dalla descrizione di un'operatività
   propone i sub-indici pertinenti fra i 400 testi letterali del provvedimento
   UIF 12.5.2023, con il motivo; ogni codice è riscontrato sul catalogo, il
   modello non può inventare indicatori. Riservato al titolare (art. 38).
2. **Bozze dei campi discorsivi** — scopo e natura della prestazione (art. 19
   co. 1 lett. c) e motivazione dell'astensione (art. 42), dagli appunti del
   professionista e dai dati non identificativi del fascicolo.
3. **Chat di assistenza** — risponde su come si usa il programma e dà
   orientamento normativo; la conversazione vive nel browser e non viene
   conservata.
4. **Motivazione ex art. 20 co. 6 leggibile** *(nuova)* — riscrive in
   italiano piano la motivazione del criterio residuale che il programma
   costruisce dai fatti della compagine; il testo riscritto è verificato sui
   numeri (quote, capitale, date): se un numero manca o compare, si torna alla
   bozza deterministica.
5. **Classificazione dell'oggetto sociale** *(nuova)* — quando né il codice
   ATECO né le parole chiave riconoscono un settore esposto, su richiesta del
   professionista propone la voce del catalogo (o nessuna) con un motivo;
   l'esito è una proposta da confermare, mai un punteggio scritto.

## 2. Che cosa viene inviato al fornitore e come

I testi vengono elaborati dal modello Claude tramite l'API di Anthropic
(nessuna conservazione oltre l'elaborazione e nessun addestramento sui
dati, secondo i termini commerciali dell'API e il DPA di Anthropic). Prima dell'invio, ogni testo passa da uno **strato di
pseudonimizzazione automatico** nel server di Contify AR:

- sono sostituiti da segnaposto (ad esempio `[PF_1]`, `[PG_2]`, `[CF_1]`)
  **i nomi delle persone e degli enti presenti nell'archivio dello studio**
  (denominazioni dei clienti, soci e titolari di cariche, titolari effettivi,
  esecutori, professionisti dello studio), riconosciuti anche senza accenti,
  senza maiuscole e con nome e cognome invertiti, e **i dati con formato
  riconoscibile** ovunque compaiano: codici fiscali, partite IVA, IBAN,
  indirizzi email e PEC, numeri di telefono, indirizzi con numero civico;
- **passano invariati i fatti**: tipo di prestazione, attività, quote e
  percentuali, importi, date, forme giuridiche, testi normativi e le parole
  digitate dal professionista che non rientrano nei casi sopra;
- i segnaposto valgono solo per la singola richiesta (per la chat, per la
  singola conversazione): non esiste una tabella stabile nel tempo che possa
  ricollegare un segnaposto a una persona;
- la corrispondenza segnaposto → valore resta nel server di Contify AR e serve
  a rimettere i nomi al loro posto nella risposta; il fornitore non la vede.

**Blocco tecnico.** Prima dell'invio il testo già pseudonimizzato viene
ricontrollato: se vi resta un nome dell'archivio o un dato con formato
riconoscibile, la richiesta **non parte** e il programma chiede di
riformulare. Il controllo copre ciò che l'archivio conosce e ciò che ha un
formato riconoscibile: un nome scritto negli appunti che non è nell'archivio
dello studio (per esempio un terzo mai registrato) non viene riconosciuto.
Per questo resta la regola di descrivere i fatti e non le persone.

## 3. Che cosa resta nel registro

Nel registro delle attività (art. 32) resta traccia **dell'uso** di ogni
funzione — chi, quando, quale funzione, quanti valori sono stati sostituiti —
e delle richieste bloccate dal controllo; **mai il contenuto** elaborato né la
corrispondenza dei segnaposto. L'accettazione di questa informativa è
registrata con versione, data e autore.

## 4. Responsabilità

L'assistente è un aiuto all'uso del programma e alla stesura: non è un parere
legale e non sostituisce la valutazione del professionista, alla quale
restano affidate le scelte sul livello di adeguata verifica, sull'astensione
e sulla segnalazione. Lo studio può disattivare l'assistente in qualsiasi
momento dalle Impostazioni; le funzioni AI non intervengono mai da sole (in
particolare, la coda di revisione e le proposte del programma non usano l'AI).
