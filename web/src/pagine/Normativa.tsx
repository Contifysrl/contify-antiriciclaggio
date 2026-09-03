import { ReactNode } from 'react';
import { Badge, HelpLink } from '../components/ui';
import { Icona } from '../components/icone';
import { PiedeLegale } from '../componenti';

// ── Normativa (AR-M13) ─────────────────────────────────────────
// La biblioteca delle fonti ufficiali antiriciclaggio: una scheda per
// fonte con il perché conta e il rinvio al testo UFFICIALE (Normattiva,
// EUR-Lex, UIF, CNDCEC…). Per scelta (Simone, 4.8.2026) qui NON si
// ospitano testi: i collegamenti aprono sempre la versione corrente
// presso chi la pubblica — zero manutenzione, zero rischio di mostrare
// una versione superata. Si aggiunge una scheda solo quando nasce una
// fonte nuova.

interface Collegamento {
  testo: string;
  url: string;
}

interface Fonte {
  titolo: string;
  ente: string;
  stato?: { testo: string; tone: 'teal' | 'amber' | 'gray' };
  descrizione: ReactNode;
  collegamenti: Collegamento[];
}

const VIGENTI: Fonte[] = [
  {
    titolo: 'DLgs. 21 novembre 2007, n. 231',
    ente: 'Repubblica Italiana',
    descrizione: (
      <>
        La norma cardine dell'antiriciclaggio italiano: obblighi di adeguata verifica,
        conservazione, segnalazione di operazioni sospette, titolarità effettiva, limiti
        all'uso del contante (art. 49) e apparato sanzionatorio. Il collegamento apre il{' '}
        <strong>testo vigente consolidato</strong>, aggiornato da Normattiva a ogni modifica.
      </>
    ),
    collegamenti: [
      { testo: 'Testo vigente su Normattiva', url: 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2007-11-21;231!vig=' },
    ],
  },
  {
    titolo: 'Regole tecniche, linee guida e modulistica CNDCEC',
    ente: 'CNDCEC',
    descrizione: (
      <>
        Le regole tecniche ex art. 11 co. 2 per commercialisti ed esperti contabili, con le
        linee guida e la modulistica operativa: è la <strong>metodologia che Contify AR
        applica</strong> — autovalutazione dello studio (pesi 40/60), Tabelle A e B
        dell'adeguata verifica (pesi 30/70), periodicità del controllo costante. Nella pagina
        del Consiglio Nazionale trovi sempre le versioni in vigore e i loro aggiornamenti.
      </>
    ),
    collegamenti: [
      { testo: 'Sezione antiriciclaggio del CNDCEC', url: 'https://commercialisti.it/norme-per-la-professione/norme-tecniche/antiriciclaggio/' },
    ],
  },
  {
    titolo: 'Indicatori di anomalia (provv. UIF 12 maggio 2023)',
    ente: 'UIF — Banca d’Italia',
    descrizione: (
      <>
        I 34 indicatori di anomalia con i loro sub-indici, da valutare per decidere se inviare
        una segnalazione di operazione sospetta. Sono <strong>già integrati alla lettera</strong>{' '}
        nella pagina Segnalazioni (e nel suggeritore AI): qui trovi la fonte ufficiale.
      </>
    ),
    collegamenti: [
      { testo: 'Indicatori di anomalia sul sito UIF', url: 'https://uif.bancaditalia.it/normativa/norm-indicatori-anomalia/' },
    ],
  },
  {
    titolo: 'Istruzioni UIF sulle segnalazioni di operazioni sospette',
    ente: 'UIF — Banca d’Italia',
    descrizione: (
      <>
        Le istruzioni operative per rilevare e trasmettere le SOS (contenuti, canale
        Infostat-UIF, tempistiche) e la normativa UIF collegata, sempre nella sezione
        ufficiale dell'Unità di Informazione Finanziaria.
      </>
    ),
    collegamenti: [
      { testo: 'Normativa antiriciclaggio UIF', url: 'https://uif.bancaditalia.it/normativa/norm-antiricic/' },
      { testo: 'Portale Infostat-UIF', url: 'https://infostat-uif.bancaditalia.it/' },
    ],
  },
  {
    titolo: 'Paesi terzi ad alto rischio',
    ente: 'Commissione europea',
    descrizione: (
      <>
        L'elenco europeo dei paesi terzi con carenze strategiche nei presidi antiriciclaggio
        (reg. delegato (UE) 2025/1184 e successivi aggiornamenti): un cliente o titolare
        effettivo collegato a questi paesi impone l'adeguata verifica <strong>rafforzata</strong>.
        I <strong>Controlli automatici</strong> di Contify AR applicano già l'elenco, con le
        decorrenze storiche.
      </>
    ),
    collegamenti: [
      { testo: 'Regolamento su EUR-Lex', url: 'https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32025R1184' },
    ],
  },
  {
    titolo: 'Liste delle sanzioni internazionali',
    ente: 'UE · ONU · OFAC',
    descrizione: (
      <>
        Le liste dei soggetti designati che lo <strong>screening notturno</strong> di Contify AR
        confronta ogni notte con clienti e titolari effettivi dello studio. Qui consulti le
        fonti ufficiali, per approfondire una corrispondenza o cercare un nominativo a mano.
      </>
    ),
    collegamenti: [
      { testo: 'Mappa delle sanzioni UE', url: 'https://www.sanctionsmap.eu/' },
      { testo: 'Elenco consolidato ONU', url: 'https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list' },
      { testo: 'Ricerca liste OFAC (USA)', url: 'https://sanctionssearch.ofac.treas.gov/' },
    ],
  },
  {
    titolo: 'Registro dei titolari effettivi',
    ente: 'Camere di commercio — MIMIT',
    descrizione: (
      <>
        La sezione autonoma del Registro delle imprese a cui i soggetti obbligati accreditati
        accedono per l'adeguata verifica (art. 21-ter DLgs. 231/2007, come riscritto dal D.Lgs.
        10 giugno 2026 n. 122, in vigore dal 23.7.2026): accreditamento biennale, delegati,
        segnalazione delle incongruenze alla Camera di commercio, prova dell'iscrizione da
        conservare. Accreditamento e consultazioni si registrano in Contify AR (Controlli
        automatici, fascicoli e schede cliente); qui trovi il portale ufficiale.
      </>
    ),
    collegamenti: [
      { testo: 'Portale titolare effettivo', url: 'https://titolareeffettivo.registroimprese.it/' },
    ],
  },
];

const FUTURE: Fonte[] = [
  {
    titolo: 'Regolamento (UE) 2024/1624 — «AMLR»',
    ente: 'Unione europea',
    stato: { testo: 'Si applica dal 10 luglio 2027', tone: 'amber' },
    descrizione: (
      <>
        Il regolamento unico antiriciclaggio, <strong>direttamente applicabile</strong> in tutta
        l'UE: sostituirà gran parte del DLgs. 231/2007 con obblighi armonizzati su adeguata
        verifica, titolarità effettiva e segnalazioni, e con il limite europeo ai pagamenti in
        contante. Il testo su EUR-Lex è sempre nella versione consolidata corrente.
      </>
    ),
    collegamenti: [
      { testo: 'Testo su EUR-Lex', url: 'https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32024R1624' },
    ],
  },
  {
    titolo: 'Direttiva (UE) 2024/1640 — «AMLD6»',
    ente: 'Unione europea',
    stato: { testo: 'Recepimento entro il 10 luglio 2027', tone: 'amber' },
    descrizione: (
      <>
        La direttiva che accompagna il regolamento unico: registri dei titolari effettivi,
        poteri delle FIU e assetto della vigilanza nazionale. Andrà recepita dall'Italia; da
        lì discenderanno le modifiche al quadro interno.
      </>
    ),
    collegamenti: [
      { testo: 'Testo su EUR-Lex', url: 'https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32024L1640' },
    ],
  },
  {
    titolo: 'Regolamento (UE) 2024/1620 — Autorità AMLA',
    ente: 'Unione europea',
    stato: { testo: 'Autorità già istituita; vigilanza diretta dal 2028', tone: 'gray' },
    descrizione: (
      <>
        Istituisce l'<strong>AMLA</strong>, la nuova autorità europea antiriciclaggio con sede a
        Francoforte: coordinerà le autorità nazionali, emanerà norme tecniche di dettaglio e
        vigilerà direttamente sui soggetti finanziari selezionati.
      </>
    ),
    collegamenti: [
      { testo: 'Testo su EUR-Lex', url: 'https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32024R1620' },
    ],
  },
];

function SchedaFonte({ fonte }: { fonte: Fonte }) {
  return (
    <div className="scheda !my-0">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h3 className="!m-0">{fonte.titolo}</h3>
        <div className="flex items-center gap-2 shrink-0">
          <Badge tone="gray">{fonte.ente}</Badge>
          {fonte.stato && <Badge tone={fonte.stato.tone}>{fonte.stato.testo}</Badge>}
        </div>
      </div>
      <p className="text-sm text-ink-600 leading-relaxed mb-3">{fonte.descrizione}</p>
      <div className="flex flex-wrap gap-2">
        {fonte.collegamenti.map((c) => (
          <a
            key={c.url}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm no-underline inline-flex items-center gap-1.5"
          >
            <Icona nome="libro" size={14} />
            <span>{c.testo}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export function Normativa() {
  return (
    <>
      <h1>Normativa <HelpLink sezione="normativa" /></h1>
      <p className="occhiello">
        I testi ufficiali delle regole antiriciclaggio, di oggi e di domani. I collegamenti
        aprono le fonti presso chi le pubblica (Normattiva, EUR-Lex, UIF, CNDCEC…): sono{' '}
        <strong>sempre nella versione corrente</strong>, senza copie da tenere aggiornate.
      </p>

      <h2>In vigore oggi</h2>
      <div className="space-y-4">
        {VIGENTI.map((f) => <SchedaFonte key={f.titolo} fonte={f} />)}
      </div>

      <h2>Il quadro che arriva: il pacchetto antiriciclaggio europeo</h2>
      <p className="text-sm text-ink-500 mb-3 max-w-3xl">
        Il «pacchetto AML» europeo è già stato pubblicato e diventerà operativo per i
        professionisti <strong>dal 10 luglio 2027</strong>. Contify AR usa regole versionate con
        la loro decorrenza: quando il nuovo quadro si applicherà, arriverà con un aggiornamento
        del software, e le valutazioni firmate resteranno ancorate alle regole del loro tempo.
      </p>
      <div className="space-y-4">
        {FUTURE.map((f) => <SchedaFonte key={f.titolo} fonte={f} />)}
      </div>

      <p className="text-xs text-ink-400 mt-6 max-w-3xl">
        I collegamenti aprono siti esterni delle autorità e degli enti indicati. Contify AR non
        conserva copie dei testi: fa fede esclusivamente la fonte ufficiale.
      </p>
      <PiedeLegale />
    </>
  );
}
