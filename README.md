# Contify Antiriciclaggio

SaaS antiriciclaggio per studi di dottori commercialisti ed esperti contabili.
Attua il **DLgs. 21.11.2007 n. 231** e le **regole tecniche CNDCEC** adottate ai sensi
dell'art. 11 co. 2, nella versione aggiornata a gennaio 2025.

Stack: Cloudflare Worker (Hono) + D1 + R2, frontend React 18 + Vite + TypeScript.
Stesso impianto di Contify Assist, così che la toolchain di rilascio sia una sola.

---

## Cosa fa

| Modulo | Norma | Sintesi |
|---|---|---|
| Autovalutazione dello studio | artt. 15-16 | Otto fattori (4 rischio inerente, 4 vulnerabilità) su scala 1-4, ponderazione 40/60, verbale versionato e firmabile |
| Fascicolo cliente | artt. 17-25 | Profilatura con Tabella A e Tabella B, rischio inerente della prestazione dal catalogo, ponderazione 30/70, livello di verifica semplificata / ordinaria / rafforzata |
| Titolarità effettiva | art. 20 | Catena partecipativa con calcolo moltiplicativo, soglia del 25%, cascata dei criteri, motivazione obbligatoria sul criterio residuale |
| Conservazione | artt. 31-32 | Documenti su R2 con impronta SHA-256, termine decennale, tempestività a 30 giorni, immutabilità degli atti firmati |
| Scadenzario | artt. 18, 19, 31, 32, 51 | Termini di legge e adempimenti organizzativi tenuti distinti |
| Limiti al contante | art. 49 | Verifica con la soglia vigente **alla data dell'operazione**, con la storia delle modifiche 2020-2023 |
| Astensione | art. 42 | Verbale con fondamento normativo obbligatorio e rinvio alla valutazione della SOS |
| Segnalazioni sospette | artt. 35-39 | Contenuto cifrato, accesso riservato al titolare, indicatori di anomalia UIF 12.5.2023 |
| Registro accessi | art. 32 co. 2 | Append-only concatenato via hash, con verifica di integrità dimostrabile |

## L'idea portante

Il motore tiene separati due livelli che nella pratica si confondono spesso.

**L'aritmetica delle regole tecniche** produce un punteggio e quindi una classe di rischio.
**La legge** impone in certi casi un livello minimo di verifica a prescindere dal punteggio.
L'aritmetica non può mai derogare alla norma: può solo innalzare.

Un cliente con punteggi tutti 1 su una consulenza tributaria darebbe verifica *semplificata*.
Se è una persona politicamente esposta, l'art. 24 co. 5 lett. c) impone la *rafforzata*. Il
software mostra entrambe le cose e stampa la norma che ha determinato lo scostamento: è
esattamente quello che va scritto nel fascicolo.

Le circostanze giuridiche gestite sono dieci: PEP e PEP-organo della PA, ex PEP, Paesi terzi ad
alto rischio, sospetto di riciclaggio, dubbi identificativi, impossibilità di verifica, entità
in Paesi ad alto rischio, assetto proprietario complesso, elevato uso di contante, esame della
posizione giuridica.

## Come sono organizzati i numeri

Nessun peso, nessuna soglia e nessun grado di rischio sono scritti nel motore. Vivono in un
**ruleset versionato** (`worker/src/domain/rulesets/cndcec-2025.ts`) con una finestra di
vigenza. Ogni fascicolo conserva il `ruleset_id` con cui è stato valutato.

Serve per tre ragioni concrete: le regole tecniche 2025 hanno modificato pesi e classificazioni
rispetto al 2019 e i fascicoli vecchi vanno riletti con le regole di allora; dal 10 luglio 2027
il Regolamento (UE) 2024/1624 sostituirà il DLgs. 231/2007 e le regole andranno riemanate;
un ispettore può chiedere con quale versione è stata fatta una valutazione di tre anni fa.

Stessa logica per le soglie dell'art. 49, che sono serie temporali: un pagamento in contante di
3.000 euro del settembre 2021 violava il limite di 2.000 euro allora vigente, oggi no. Il
software giudica con la soglia della data dell'operazione, non con quella odierna.

## Struttura

```
worker/src/domain/     motore puro, senza dipendenze da runtime o database
  rulesets/            pesi, soglie, fattori — versionati
  risk.ts              calcolo del rischio e vincoli normativi
  prestazioni.ts       catalogo Tabella 1 della Regola tecnica n. 2
  norme.ts             soglie art. 49 con vigenza temporale, termini, date
  titolare-effettivo.ts cascata dei criteri dell'art. 20 (soglia dal ruleset, diritti sulle quote, cariche)
  alert-titolarita.ts  alert A1-A8 sulla titolarità effettiva, bozza motivazione ex art. 20 co. 6 (AR-M17); A11 ricorrenza nel portafoglio (AR-M19)
  fascicolo-proposto.ts Tabella A proposta con motivazione e fonte, esecutore, checklist documenti, alert A9-A10 (AR-M18)
  completezza.ts       regole di completezza del fascicolo cliente (norma + modulistica per regola), cruscotto «Da completare» (AR-M19)
  settori-esposti.ts   settori esposti al riciclaggio → punteggio A.2, fonte per voce (ANR 2024, UIF)
  province.ts          anagrafica province + tabella di studio delle province a rischio contante (A.4)
  scadenze.ts          scadenzario, con distinzione legge / organizzazione
  indicatori-uif.ts    tassonomia del provvedimento UIF 12.5.2023
worker/src/lib/        crittografia, sessioni, registro concatenato; coda.ts = coda di revisione con caricamento in blocco delle visure (AR-M19)
worker/src/index.ts    API Hono
web/                   SPA React
  src/lib/visura.ts    parser locale della visura camerale (nessuna AI: il PDF non esce dal browser, AR-M17)
migrations/            schema D1
tests/                 73 test unitari sul dominio
scripts/smoke-api.mjs  40 verifiche end-to-end contro wrangler dev
docs/                  matrice di conformità norma → funzione
```

## Sviluppo

```bash
npm install
npm run db:migrate:local
npm run db:seed:local
npm run build              # SPA in dist/
npx wrangler dev --local   # porta 8787

npm test                   # test di dominio (parser visura incluso: tests/visura.test.ts)
node scripts/smoke-api.mjs # verifiche end-to-end; poi le suite per milestone smoke-api-m11…m19.mjs
node scripts/ui-m17.mjs    # giri Playwright: ui-m17 (visura), ui-m18 (fascicolo proposto), ui-m19 (coda e «Da completare»)
node scripts/smoke-api-console-studi.mjs && node scripts/ui-console-studi.mjs   # console: «Nuovo studio»
npm run typecheck
```

Le migrazioni D1 sono additive e vanno applicate in ordine (`migrations/0001…0012`), in
produzione PRIMA del push del codice che le usa. Le fixture del parser delle visure
(`tests/fixtures/visure/*.txt`) si generano da un PDF con `node scripts/visura-testo.mjs`
e si anonimizzano a mano; i PDF sintetici per Playwright con `scripts/visura-pdf-fixture.py`.

Credenziali di collaudo (solo locali): `titolare@studiodemo.it` / `Antiriciclaggio!2026` e
`collaboratore@studiodemo.it` / `Collab!2026`.

Prima di `wrangler dev` serve un file `.dev.vars` con la chiave di cifratura:

```bash
echo "MASTER_KEY=$(node -e "console.log(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64'))")" > .dev.vars
```

## Rilascio

Stato al 29.7.2026 — già fatto:

- [x] D1 `contify-antiriciclaggio` creato in regione WEUR (`7b64cd42-23fd-4378-8b1f-f544463b43ab`,
      id già in `wrangler.toml`) con `migrations/0001_init.sql` applicata (15 tabelle, 5 trigger).

Passi rimanenti (dalla macchina con `wrangler login` sull'account Contify):

1. Bucket R2 in giurisdizione EU (l'API standard li creerebbe fuori giurisdizione, serve `-J eu`):

   ```bash
   wrangler r2 bucket create contify-antiriciclaggio-docs -J eu
   wrangler r2 bucket create contify-antiriciclaggio-backups -J eu
   ```

2. `wrangler secret put MASTER_KEY` — 32 byte base64 (generarla con il comando della sezione
   sviluppo). **Custodirla fuori da Cloudflare**: senza quella chiave i dati identificativi e le
   segnalazioni non sono più leggibili. Non riusare la chiave di sviluppo.
3. Creare il repo `contifysrl/contify-antiriciclaggio` (privato), push di `main`, poi in dashboard
   Cloudflare → Workers → Create → collegare il repo con Workers Builds
   (build command `npm ci && npm run build`, deploy command `npx wrangler deploy`), come per
   Assist.
4. Primo collaudo in produzione: creare il tenant reale e l'utente titolare (nessun seed demo
   va caricato in produzione), poi giro di smoke con `BASE=https://<worker> node
   scripts/smoke-api.mjs` limitato alla sola parte di lettura o su tenant di prova.
5. Dominio: route o custom domain `antiriciclaggio.contify.it` sul Worker.

## Sicurezza e protezione dei dati

I dati trattati sono dati personali di clienti dello studio e, quando emergono in sede di
adeguata verifica, dati relativi a condanne penali e reati ai sensi dell'art. 10 GDPR. Le SOS
hanno un regime rinforzato: l'art. 38 co. 3-bis punisce con la reclusione da due a sei anni la
rivelazione indebita dell'identità del segnalante.

Presidi implementati:

- **Isolamento per studio.** Il tenant si legge dalla sessione, mai dal client. Ogni query di
  dominio filtra per `tenant_id`.
- **Cifratura applicativa** AES-GCM con chiave derivata via HKDF per singolo tenant, su
  contenuto delle SOS e dati identificativi dei clienti. Un dump del database non basta a
  leggerli, e la compromissione di uno studio non espone gli altri.
- **Sessioni server-side** con token opaco; nel database sta solo il suo SHA-256. Revoca
  immediata, che un JWT non darebbe.
- **Ruoli.** Titolare (firma, accede alle SOS), collaboratore (istruisce, non firma, non vede le
  SOS), lettore, revisore indipendente ex art. 16 co. 2 lett. b).
- **Immutabilità.** Trigger SQL impediscono la modifica di valutazioni e autovalutazioni firmate
  e la cancellazione di documenti ancora in conservazione obbligatoria.
- **Registro concatenato.** Ogni voce contiene l'impronta della precedente. La verifica è
  esposta in `GET /api/audit/verifica` ed è stata provata contro una manomissione reale: dopo un
  `UPDATE` diretto sul database, la verifica ha individuato la riga alterata.

## Stato della verifica

| Prova | Esito |
|---|---|
| Test unitari sul dominio | 73 verdi |
| Smoke end-to-end sulle API | 40 verdi |
| Typecheck worker e web | pulito |
| Build SPA | 189 kB, 58 kB gzip |
| Rilevamento manomissione del registro | riga alterata individuata |
| Collaudo con browser reale | nessun errore di console |

Il collaudo con browser ha intercettato due difetti che i test sulle API non vedevano: gli asset
statici andavano in 500 perché il middleware degli header di sicurezza tentava di scrivere su
una Response immutabile, e una prestazione esente ex art. 17 co. 7 mostrava scadenze di verifica
non dovute finché non era stata valutata. Entrambi corretti.

## Limiti dichiarati

Sono elencati per esteso in `docs/matrice-conformita.md`. In sintesi: i titoli letterali degli
indicatori UIF 21-32 e i relativi sub-indici vanno completati dall'allegato ufficiale del
provvedimento 12.5.2023; i sub-descrittori dei punteggi delle Tabelle A e B stanno nella
modulistica dell'Informativa CNDCEC n. 57/2026; la periodicità del controllo costante è un
parametro di studio e non un termine di legge; l'accesso al registro dei titolari effettivi non
è ancora operativo per i soggetti obbligati e attende i provvedimenti attuativi del DLgs.
122/2026.

Il software non calcola sanzioni e non invia nulla alla UIF o al MEF: prepara, documenta e
traccia. Le decisioni sull'adeguata verifica, sull'astensione e sulla segnalazione restano
imputate al professionista incaricato.

---

Contify Srl — Tech & AI Agency, Padova.
