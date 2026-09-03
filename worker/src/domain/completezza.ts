/**
 * COMPLETEZZA DEL FASCICOLO CLIENTE (AR-M19)
 *
 * Per ogni cliente attivo il programma calcola che cosa manca perché il
 * cliente sia «a posto» rispetto agli adempimenti dell'adeguata verifica, e
 * lo presenta come una lista finita, ordinata per rischio e per scadenza.
 * È la traduzione operativa dell'approccio «al contrario» per chi parte da
 * zero: non «cosa devo fare per l'antiriciclaggio», ma «oggi ti mancano 14
 * cose, queste 3 sono urgenti, inizia da qui».
 *
 * Le regole NON sono inventate: ciascuna cita l'articolo del DLgs. 231/2007
 * che la impone e la sezione della modulistica CNDCEC (Modello AV.1 e
 * indicazioni operative, Informativa n. 57/2026) in cui l'adempimento va
 * documentato. La tabella `REGOLE_COMPLETEZZA` è pensata per essere letta e
 * rivista dal professionista (è la verifica prevista dal piano per M19-04):
 * per questo ogni regola ha un «perché» in italiano e non solo un codice.
 *
 * Tono: sono «cose da completare», non violazioni. Un cruscotto rosso il
 * primo giorno fa chiudere il programma; qui si contano i passi che
 * mancano e si indica da dove cominciare.
 *
 * Il modulo è puro: riceve righe già lette da D1 e restituisce l'esito. Le
 * regole dipendenti dall'esistenza di un rapporto (titolari effettivi,
 * documenti, PEP, valutazione) si accendono solo quando c'è almeno un
 * fascicolo vivo soggetto a verifica: per un cliente appena importato dal
 * gestionale la sola cosa da fare è aprire il fascicolo, e il resto verrà
 * chiesto dopo — una cosa alla volta.
 */

import type { ClasseRischio } from './types';
import { anzianitaVisura, type ScadenzaConStato } from './scadenze';

// ------------------------------------------------------------------ ingresso

export interface FascicoloCompletezza {
  id: string;
  codice: string;
  stato: 'APERTO' | 'IN_VERIFICA' | 'COMPLETO' | 'ASTENSIONE' | 'CESSATO' | string;
  dataConferimento: string;
  dataCessazione: string | null;
  prestazioneCodice: string;
  /** Esenzione ex art. 17 co. 7 (dalla valutazione, o dalla prestazione se non valutato). */
  esenteVerifica: boolean;
  valutazione: {
    firmata: boolean;
    classe: ClasseRischio;
    dataValutazione: string;
    controlloCostanteMesi: number;
  } | null;
  /** Scadenze del fascicolo già classificate rispetto a oggi (stesso calcolo dello scadenzario). */
  scadenze: ScadenzaConStato[];
  ultimoControllo: string | null;
}

export interface ClienteCompletezza {
  id: string;
  denominazione: string;
  tipo: string;
  professionista: string | null;
  professionistaId: string | null;
  pep: boolean;
  fascicoli: FascicoloCompletezza[];
  /** Titolari effettivi vigenti (valido_al NULL). */
  titolariVigenti: number;
  /** Documenti conservati, del cliente e dei suoi fascicoli. */
  documenti: Array<{ tipo: string; dataRiferimento: string | null; fascicoloId: string | null }>;
  /** Proposte del programma ancora da rivedere (stato PROPOSTA). */
  proposteAperte: Array<{ id: string; ambito: string; alert: Array<{ codice: string; gravita: string }> }>;
  /** Corrispondenze nelle liste sanzioni ancora da decidere (cliente, TE, soci, cariche). */
  screeningDaEsaminare: number;
  /** Lo status PEP è stato chiesto al cliente (dichiarazione art. 22, verifica a distanza, o registrato). */
  pepChiesto: boolean;
  /** AR-M20-03: consultazioni del registro dei titolari effettivi (art. 21-ter). Assente = nessuna. */
  registroTe?: {
    /** Data (ISO) dell'ultima registrazione dei titolari effettivi vigenti. */
    titolariRegistratiIl: string | null;
    ultima: { data: string; esito: 'CORRISPONDE' | 'DIFFORME' | 'NON_ISCRITTO' | 'NON_CONSULTABILE'; prova: boolean } | null;
    /** Incongruenze (DIFFORME/NON_ISCRITTO) senza segnalazione registrata. */
    daSegnalare: number;
  } | null;
}

// -------------------------------------------------------------------- regole

export type Gravita = 'alta' | 'media' | 'bassa';

export type CodiceRegola =
  | 'FASCICOLO_ASSENTE'
  | 'VERIFICA_SCADUTA'
  | 'VALUTAZIONE_ASSENTE'
  | 'VALUTAZIONE_NON_FIRMATA'
  | 'TE_ASSENTI'
  | 'PROPOSTA_DA_RIVEDERE'
  | 'CONTROLLO_COSTANTE_SCADUTO'
  | 'PEP_NON_CHIESTO'
  | 'ID_ASSENTE'
  | 'ID_TE_ASSENTE'
  | 'VISURA_ASSENTE'
  | 'VISURA_DA_RINNOVARE'
  | 'ART22_ASSENTE'
  | 'SCREENING_DA_DECIDERE'
  | 'REGISTRO_TE_NON_CONSULTATO'
  | 'REGISTRO_TE_PROVA_ASSENTE'
  | 'DIFFORMITA_NON_SEGNALATA';

export interface RegolaCompletezza {
  codice: CodiceRegola;
  etichetta: string;
  gravita: Gravita;
  /** Norma che impone l'adempimento. */
  norma: string;
  /** Dove l'adempimento va documentato secondo la modulistica CNDCEC. */
  fonte: string;
  /** A chi si applica e quando scatta, in italiano (per la revisione del professionista). */
  quando: string;
  /** Pagina dell'applicazione in cui si risolve. */
  pagina: 'fascicoli' | 'fascicolo' | 'cliente' | 'controlli' | 'coda' | 'registro';
  azione: string;
}

const AV1 = 'Modello AV.1 (Informativa CNDCEC n. 57/2026)';

export const REGOLE_COMPLETEZZA: RegolaCompletezza[] = [
  {
    codice: 'FASCICOLO_ASSENTE', etichetta: 'Nessun fascicolo aperto', gravita: 'alta',
    norma: 'artt. 17 co. 1 e 18 co. 1 DLgs. 231/2007',
    fonte: `${AV1}, sez. «Dati dell’incarico» (prestazione, scopo e natura, data di conferimento)`,
    quando: 'Cliente attivo senza alcun fascicolo non cessato. Finché il fascicolo non esiste, gli altri adempimenti non vengono richiesti: si parte da qui.',
    pagina: 'fascicoli', azione: 'Apri il fascicolo della prestazione',
  },
  {
    codice: 'VERIFICA_SCADUTA', etichetta: 'Termine dei trenta giorni superato', gravita: 'alta',
    norma: 'art. 18 co. 3 DLgs. 231/2007',
    fonte: `${AV1}, sez. «Dati dell’incarico»: la verifica va completata entro trenta giorni dal conferimento (o al primo contatto utile)`,
    quando: 'Fascicolo vivo, non esente e senza valutazione firmata né astensione, con il termine di completamento della verifica già scaduto nello scadenzario.',
    pagina: 'fascicolo', azione: 'Completa e firma la valutazione',
  },
  {
    codice: 'VALUTAZIONE_ASSENTE', etichetta: 'Valutazione del rischio non registrata', gravita: 'alta',
    norma: 'art. 17 co. 3 DLgs. 231/2007; Regole tecniche CNDCEC regola 2',
    fonte: `${AV1}, Tabella II sez. A (Tabella A) e sez. B (Tabella B)`,
    quando: 'Fascicolo vivo, non esente ex art. 17 co. 7 e non in astensione, senza alcuna valutazione del rischio.',
    pagina: 'fascicolo', azione: 'Registra la valutazione del rischio',
  },
  {
    codice: 'VALUTAZIONE_NON_FIRMATA', etichetta: 'Valutazione del rischio non firmata', gravita: 'media',
    norma: 'art. 32 co. 2 lett. c) DLgs. 231/2007 (documentazione idonea a far prova)',
    fonte: `${AV1}, sottoscrizione del professionista in calce alla valutazione`,
    quando: 'L’ultima valutazione del fascicolo non è firmata: non è congelata e non fa prova.',
    pagina: 'fascicolo', azione: 'Firma la valutazione',
  },
  {
    codice: 'TE_ASSENTI', etichetta: 'Titolari effettivi non individuati', gravita: 'alta',
    norma: 'artt. 20, 21 e 22 DLgs. 231/2007',
    fonte: `${AV1}, sez. «Titolare effettivo» (criterio applicato, dati, motivazione ex art. 20 co. 6)`,
    quando: 'Cliente società, ente o trust con un fascicolo vivo soggetto a verifica e nessun titolare effettivo registrato vigente.',
    pagina: 'cliente', azione: 'Individua e registra i titolari effettivi',
  },
  {
    codice: 'PROPOSTA_DA_RIVEDERE', etichetta: 'Proposta del programma in attesa', gravita: 'bassa',
    norma: '— (non è un adempimento: è una proposta da valutare)',
    fonte: 'Coda di revisione di Contify AR: la proposta rivista documenta il giudizio del professionista',
    quando: 'Esiste una proposta di anagrafica, di titolarità effettiva o di controllo costante «da rivalutare» (compagine cambiata al rinnovo della visura) non ancora applicata, modificata o scartata.',
    pagina: 'coda', azione: 'Rivedi la proposta (coda di revisione o scheda del cliente)',
  },
  {
    codice: 'CONTROLLO_COSTANTE_SCADUTO', etichetta: 'Controllo costante scaduto', gravita: 'media',
    norma: 'art. 19 co. 1 lett. d) DLgs. 231/2007',
    fonte: 'Regole tecniche CNDCEC (cadenza graduata sul rischio: 36/36/24/12 mesi); registrazione del controllo eseguito nel fascicolo',
    quando: 'Fascicolo vivo con valutazione e cadenza del controllo costante, e data del controllo superata (dall’ultimo controllo registrato o dal conferimento).',
    pagina: 'fascicolo', azione: 'Registra il controllo costante eseguito',
  },
  {
    codice: 'PEP_NON_CHIESTO', etichetta: 'Status PEP mai chiesto al cliente', gravita: 'media',
    norma: 'art. 1 co. 2 lett. dd) e art. 24 co. 5 lett. c) DLgs. 231/2007',
    fonte: `${AV1}, sez. «Persona politicamente esposta»; dichiarazione del cliente ex art. 22`,
    quando: 'Cliente con fascicolo vivo soggetto a verifica, non registrato come PEP, senza dichiarazione art. 22 né verifica a distanza acquisita che abbia chiesto lo status PEP.',
    pagina: 'fascicolo', azione: 'Chiedi lo status PEP (dichiarazione o verifica a distanza)',
  },
  {
    codice: 'ID_ASSENTE', etichetta: 'Documento d’identità non conservato', gravita: 'media',
    norma: 'art. 18 co. 1 lett. a) e art. 19 co. 1 lett. a) DLgs. 231/2007; art. 31',
    fonte: `${AV1}, sez. «Dati identificativi» (cliente ed esecutore) e conservazione`,
    quando: 'Cliente con fascicolo vivo soggetto a verifica e nessun documento d’identità fra i documenti conservati (del cliente o dell’esecutore).',
    pagina: 'cliente', azione: 'Conserva il documento d’identità',
  },
  {
    codice: 'ID_TE_ASSENTE', etichetta: 'Documento d’identità del titolare effettivo mancante', gravita: 'media',
    norma: 'art. 19 co. 1 lett. b) DLgs. 231/2007',
    fonte: `${AV1}, sez. «Titolare effettivo» (verifica dell’identità con misure proporzionate al rischio)`,
    quando: 'Cliente società con titolari effettivi registrati e meno documenti d’identità conservati di quanti servono (esecutore più un documento per titolare). È un conteggio: se il documento c’è ma è conservato con un altro tipo, correggi il tipo.',
    pagina: 'cliente', azione: 'Conserva il documento del titolare effettivo',
  },
  {
    codice: 'VISURA_ASSENTE', etichetta: 'Visura camerale non conservata', gravita: 'bassa',
    norma: 'art. 18 co. 1 lett. a) e art. 19 co. 1 lett. a) DLgs. 231/2007 (fonte affidabile e indipendente)',
    fonte: `${AV1}, sez. «Dati identificativi» del cliente persona giuridica`,
    quando: 'Cliente società o ente con fascicolo vivo soggetto a verifica e nessuna visura fra i documenti conservati.',
    pagina: 'cliente', azione: 'Carica la visura («Aggiorna da visura»)',
  },
  {
    codice: 'VISURA_DA_RINNOVARE', etichetta: 'Visura camerale da rinnovare', gravita: 'bassa',
    norma: 'art. 19 co. 1 lett. d) DLgs. 231/2007 (controllo costante: verifica e aggiornamento dei dati acquisiti)',
    fonte: 'Regole tecniche CNDCEC 2025, cadenza del controllo costante graduata sul rischio (36/36/24/12 mesi); alert A12',
    quando: 'Cliente società o ente con fascicolo vivo valutato: l’ultima visura conservata è più vecchia della cadenza del controllo costante del fascicolo più esigente.',
    pagina: 'cliente', azione: 'Rinnova la visura e confronta le differenze («Aggiorna da visura»)',
  },
  {
    codice: 'ART22_ASSENTE', etichetta: 'Dichiarazione del cliente sul titolare effettivo mancante', gravita: 'media',
    norma: 'art. 22 co. 1 e 2 DLgs. 231/2007',
    fonte: `${AV1}, sez. «Titolare effettivo»: dichiarazione scritta del cliente sotto la propria responsabilità`,
    quando: 'Cliente società, ente o trust con fascicolo vivo soggetto a verifica e nessuna dichiarazione art. 22 (o autocertificazione) fra i documenti conservati.',
    pagina: 'fascicolo', azione: 'Acquisisci la dichiarazione art. 22 (in presenza o a distanza)',
  },
  {
    codice: 'SCREENING_DA_DECIDERE', etichetta: 'Corrispondenze nelle liste sanzioni da decidere', gravita: 'alta',
    norma: 'art. 24 co. 5 DLgs. 231/2007; regolamenti UE sulle misure restrittive',
    fonte: 'Controlli automatici di Contify AR: ogni corrispondenza si chiude con una decisione motivata',
    quando: 'Il cliente, un suo titolare effettivo, socio o amministratore ha corrispondenze nelle liste sanzioni non ancora esaminate.',
    pagina: 'controlli', azione: 'Decidi sulle corrispondenze',
  },
  {
    codice: 'DIFFORMITA_NON_SEGNALATA', etichetta: 'Difformità col registro dei titolari effettivi da segnalare', gravita: 'alta',
    norma: 'art. 21-ter co. 7 DLgs. 231/2007 (D.Lgs. 10.6.2026 n. 122)',
    fonte: 'Consultazione del registro registrata in Contify AR con esito «difforme» o «non iscritto»; alert A13',
    quando: 'Una consultazione del registro ha rilevato un’incongruenza (titolari diversi, o cliente che non ha comunicato il titolare effettivo) e la segnalazione alla Camera di commercio non è ancora registrata.',
    pagina: 'fascicolo', azione: 'Registra la segnalazione alla Camera di commercio (data e riferimento)',
  },
  {
    codice: 'REGISTRO_TE_NON_CONSULTATO', etichetta: 'Registro dei titolari effettivi non consultato', gravita: 'media',
    norma: 'art. 21-ter co. 1, 11 e 12 DLgs. 231/2007 (D.Lgs. 10.6.2026 n. 122, in vigore dal 23.7.2026)',
    fonte: `${AV1}, sez. «Titolare effettivo»: riscontro delle informazioni con il registro; la consultazione non esonera dall’adeguata verifica`,
    quando: 'Cliente società, ente o trust con fascicolo vivo soggetto a verifica e titolari effettivi registrati, senza alcuna consultazione del registro registrata dopo l’ultima fotografia dei titolari. Se il registro non è consultabile, registra la consultazione con esito «non consultabile» e il motivo.',
    pagina: 'fascicolo', azione: 'Consulta il registro (accesso accreditato) e registra l’esito',
  },
  {
    codice: 'REGISTRO_TE_PROVA_ASSENTE', etichetta: 'Prova dell’iscrizione nel registro non conservata', gravita: 'bassa',
    norma: 'art. 21-ter co. 12 DLgs. 231/2007 (D.Lgs. 10.6.2026 n. 122)',
    fonte: `${AV1}, sez. «Documenti acquisiti»: prova dell’iscrizione del titolare effettivo o estratto idoneo a documentarla`,
    quando: 'L’ultima consultazione del registro ha esito «corrisponde» ma non le è agganciato alcun documento (estratto o prova dell’iscrizione).',
    pagina: 'fascicolo', azione: 'Carica l’estratto del registro e agganciarlo alla consultazione',
  },
];

const PESO_GRAVITA: Record<Gravita, number> = { alta: 3, media: 2, bassa: 1 };
const ORDINE_CLASSE: Record<string, number> = { MOLTO_SIGNIFICATIVO: 4, ABBASTANZA_SIGNIFICATIVO: 3, POCO_SIGNIFICATIVO: 2, NON_SIGNIFICATIVO: 1 };
const TIPI_CON_TITOLARE = new Set(['SOCIETA_CAPITALI', 'SOCIETA_PERSONE', 'ENTE_NON_PROFIT', 'TRUST']);
const TIPI_CON_VISURA = new Set(['SOCIETA_CAPITALI', 'SOCIETA_PERSONE', 'ENTE_NON_PROFIT']);
const TIPI_DICHIARAZIONE = new Set(['AUTOCERTIFICAZIONE_TE', 'DICHIARAZIONE_ART22']);

// -------------------------------------------------------------------- uscita

export interface Mancanza {
  codice: CodiceRegola;
  etichetta: string;
  gravita: Gravita;
  norma: string;
  /** Dettaglio in una riga, con i fatti del caso (codice fascicolo, giorni, conteggi). */
  dettaglio: string;
  pagina: RegolaCompletezza['pagina'];
  azione: string;
  fascicoloId?: string;
  /** Giorni residui della scadenza collegata (negativi = scaduta), se c'è. */
  giorniResidui?: number;
}

export interface ClienteDaCompletare {
  id: string;
  denominazione: string;
  tipo: string;
  professionista: string | null;
  professionistaId: string | null;
  /** Classe di rischio più alta fra i fascicoli vivi valutati, se c'è. */
  classe: ClasseRischio | null;
  mancanze: Mancanza[];
  /** Peggior scadenza collegata alle mancanze (giorni, negativi = scaduta). */
  giorniPeggiore: number | null;
  /** Vero se tra le mancanze ce n'è almeno una di gravità alta. */
  urgente: boolean;
}

export interface EsitoCompletezza {
  calcolatoIl: string;
  clientiAttivi: number;
  /** Clienti senza alcuna cosa da completare. */
  clientiCompleti: number;
  /** Percentuale 0-100 di clienti completi (arrotondata). */
  avanzamento: number;
  totaleMancanze: number;
  perGravita: Record<Gravita, number>;
  perRegola: Array<{ codice: CodiceRegola; etichetta: string; gravita: Gravita; n: number }>;
  /** Solo i clienti con qualcosa da completare, già ordinati. */
  clienti: ClienteDaCompletare[];
  /** Da dove cominciare: le prime tre mancanze in ordine di urgenza. */
  iniziaDa: Array<{ clienteId: string; denominazione: string; mancanza: Mancanza }>;
}

// -------------------------------------------------------------------- motore

const regola = (codice: CodiceRegola) => REGOLE_COMPLETEZZA.find((r) => r.codice === codice)!;

function mancanzaDa(codice: CodiceRegola, dettaglio: string, extra: { fascicoloId?: string; giorniResidui?: number } = {}): Mancanza {
  const r = regola(codice);
  return { codice, etichetta: r.etichetta, gravita: r.gravita, norma: r.norma, dettaglio, pagina: r.pagina, azione: r.azione, ...extra };
}

/** Un fascicolo è «vivo» se non è cessato; è «soggetto a verifica» se in più non è esente né in astensione. */
const vivo = (f: FascicoloCompletezza) => f.stato !== 'CESSATO' && !f.dataCessazione;
const soggettoAVerifica = (f: FascicoloCompletezza) => vivo(f) && !f.esenteVerifica && f.stato !== 'ASTENSIONE';

const ordina = (m: Mancanza[]) => m.sort((a, b) => PESO_GRAVITA[b.gravita] - PESO_GRAVITA[a.gravita] || (a.giorniResidui ?? 0) - (b.giorniResidui ?? 0));

export function mancanzeCliente(c: ClienteCompletezza, oggi: string = new Date().toISOString().slice(0, 10)): Mancanza[] {
  return ordina(mancanzeGrezze(c, oggi));
}

function mancanzeGrezze(c: ClienteCompletezza, oggi: string): Mancanza[] {
  const out: Mancanza[] = [];
  const vivi = c.fascicoli.filter(vivo);
  const daVerificare = c.fascicoli.filter(soggettoAVerifica);

  // Le proposte in attesa e le corrispondenze da decidere valgono sempre:
  // non dipendono dal rapporto, sono decisioni lasciate a metà.
  const proposteDaRivedere = c.proposteAperte.filter((p) => p.ambito === 'ANAGRAFICA' || p.ambito === 'TITOLARITA' || p.ambito === 'RIVALUTAZIONE');
  if (proposteDaRivedere.length) {
    const nome = { TITOLARITA: 'titolarità effettiva', ANAGRAFICA: 'anagrafica da visura', RIVALUTAZIONE: 'controllo costante «da rivalutare» (la compagine è cambiata)' } as Record<string, string>;
    out.push(mancanzaDa('PROPOSTA_DA_RIVEDERE', proposteDaRivedere.length === 1
      ? `Una proposta di ${nome[proposteDaRivedere[0].ambito] ?? proposteDaRivedere[0].ambito.toLowerCase()} attende la tua revisione.`
      : `${proposteDaRivedere.length} proposte attendono la tua revisione.`));
  }
  if (c.screeningDaEsaminare > 0) {
    out.push(mancanzaDa('SCREENING_DA_DECIDERE', `${c.screeningDaEsaminare} corrispondenz${c.screeningDaEsaminare === 1 ? 'a' : 'e'} nelle liste sanzioni da esaminare.`));
  }

  if (!vivi.length) {
    out.push(mancanzaDa('FASCICOLO_ASSENTE', 'Nessun fascicolo aperto: apri quello della prestazione in corso. Titolari effettivi, valutazione e documenti verranno chiesti dopo.'));
    return out;
  }

  // Regole per fascicolo.
  for (const f of daVerificare) {
    const verificaScaduta = f.scadenze.find((s) => s.tipo === 'COMPLETAMENTO_VERIFICA' && s.stato === 'SCADUTA');
    if (verificaScaduta) {
      out.push(mancanzaDa('VERIFICA_SCADUTA', `Fascicolo ${f.codice}: il termine dei trenta giorni è scaduto da ${-verificaScaduta.giorniResidui} giorni e la valutazione non è firmata.`,
        { fascicoloId: f.id, giorniResidui: verificaScaduta.giorniResidui }));
    }
    if (!f.valutazione) {
      if (!verificaScaduta) out.push(mancanzaDa('VALUTAZIONE_ASSENTE', `Fascicolo ${f.codice}: nessuna valutazione del rischio registrata.`, { fascicoloId: f.id }));
    } else if (!f.valutazione.firmata && !verificaScaduta) {
      out.push(mancanzaDa('VALUTAZIONE_NON_FIRMATA', `Fascicolo ${f.codice}: valutazione del ${f.valutazione.dataValutazione.split('-').reverse().join('/')} non firmata.`, { fascicoloId: f.id }));
    }
    const controllo = f.scadenze.find((s) => s.tipo === 'CONTROLLO_COSTANTE' && s.stato === 'SCADUTA');
    if (controllo && f.valutazione) {
      out.push(mancanzaDa('CONTROLLO_COSTANTE_SCADUTO', `Fascicolo ${f.codice}: controllo costante (cadenza ${f.valutazione.controlloCostanteMesi} mesi) scaduto da ${-controllo.giorniResidui} giorni.`,
        { fascicoloId: f.id, giorniResidui: controllo.giorniResidui }));
    }
  }

  // Regole per cliente, solo se c'è un rapporto soggetto a verifica.
  if (daVerificare.length) {
    const primo = daVerificare[0];
    const conTitolare = TIPI_CON_TITOLARE.has(c.tipo);
    const docs = (pred: (t: string) => boolean) => c.documenti.filter((d) => pred(d.tipo)).length;
    const nIdentita = docs((t) => t === 'DOCUMENTO_IDENTITA');

    if (conTitolare && c.titolariVigenti === 0) {
      out.push(mancanzaDa('TE_ASSENTI', 'Nessun titolare effettivo registrato: applica i criteri dell’art. 20 (dalla visura il programma li propone).'));
    }
    if (!c.pep && !c.pepChiesto) {
      out.push(mancanzaDa('PEP_NON_CHIESTO', 'Non risulta chiesto al cliente se è una persona politicamente esposta.', { fascicoloId: primo.id }));
    }
    if (nIdentita === 0) {
      out.push(mancanzaDa('ID_ASSENTE', conTitolare || c.tipo === 'ALTRO'
        ? 'Nessun documento d’identità conservato per chi conferisce l’incarico (esecutore).'
        : 'Nessun documento d’identità del cliente conservato.'));
    } else if (conTitolare && c.titolariVigenti > 0 && nIdentita < c.titolariVigenti + 1) {
      out.push(mancanzaDa('ID_TE_ASSENTE', `${nIdentita} document${nIdentita === 1 ? 'o' : 'i'} d’identità conservat${nIdentita === 1 ? 'o' : 'i'} per esecutore e ${c.titolariVigenti} titolar${c.titolariVigenti === 1 ? 'e' : 'i'} effettiv${c.titolariVigenti === 1 ? 'o' : 'i'}.`));
    }
    if (TIPI_CON_VISURA.has(c.tipo) && docs((t) => t === 'VISURA') === 0) {
      out.push(mancanzaDa('VISURA_ASSENTE', 'Nessuna visura camerale conservata.'));
    } else if (TIPI_CON_VISURA.has(c.tipo)) {
      // AR-M20-01 (A12): la visura invecchia con la cadenza del controllo
      // costante del fascicolo vivo più esigente.
      const anz = anzianitaVisura(ultimaVisura(c), cadenzaControlloCliente(c), oggi);
      if (anz?.daRinnovare) {
        out.push(mancanzaDa('VISURA_DA_RINNOVARE',
          `Ultima visura del ${anz.dataVisura.split('-').reverse().join('/')} (${anz.mesiTrascorsi} mesi fa): supera la cadenza del controllo costante di ${anz.cadenzaMesi} mesi.`,
          { giorniResidui: Math.round((Date.parse(`${anz.scadeIl}T00:00:00Z`) - Date.parse(`${oggi}T00:00:00Z`)) / 86400000) }));
      }
    }
    if (conTitolare && docs((t) => TIPI_DICHIARAZIONE.has(t)) === 0) {
      out.push(mancanzaDa('ART22_ASSENTE', 'Nessuna dichiarazione del cliente sul titolare effettivo conservata.', { fascicoloId: primo.id }));
    }
    // AR-M20-03: registro dei titolari effettivi (art. 21-ter).
    // `registroTe` undefined = dato non fornito (chiamante che non lo legge): le regole tacciono.
    if (conTitolare && c.titolariVigenti > 0 && c.registroTe !== undefined) {
      const r = c.registroTe ?? null;
      if (r && r.daSegnalare > 0) {
        out.push(mancanzaDa('DIFFORMITA_NON_SEGNALATA', r.daSegnalare === 1
          ? 'Una consultazione del registro ha rilevato un’incongruenza non ancora segnalata alla Camera di commercio.'
          : `${r.daSegnalare} consultazioni del registro hanno rilevato incongruenze non ancora segnalate.`, { fascicoloId: primo.id }));
      }
      const ultima = r?.ultima ?? null;
      const dopoTitolari = ultima && (!r?.titolariRegistratiIl || ultima.data >= r.titolariRegistratiIl.slice(0, 10));
      if (!ultima || !dopoTitolari) {
        out.push(mancanzaDa('REGISTRO_TE_NON_CONSULTATO', ultima
          ? `L’ultima consultazione del registro (${ultima.data.split('-').reverse().join('/')}) precede la fotografia dei titolari effettivi: va rifatta.`
          : 'Nessuna consultazione del registro dei titolari effettivi registrata per i titolari accertati.', { fascicoloId: primo.id }));
      } else if (ultima.esito === 'CORRISPONDE' && !ultima.prova) {
        out.push(mancanzaDa('REGISTRO_TE_PROVA_ASSENTE', `Consultazione del ${ultima.data.split('-').reverse().join('/')} senza estratto o prova dell’iscrizione conservata.`, { fascicoloId: primo.id }));
      }
    }
  }

  return out;
}

/** Data dell'ultima visura conservata (documenti del cliente o dei suoi fascicoli). */
export function ultimaVisura(c: Pick<ClienteCompletezza, 'documenti'>): string | null {
  let max: string | null = null;
  for (const d of c.documenti) {
    if (d.tipo !== 'VISURA' || !d.dataRiferimento) continue;
    const x = d.dataRiferimento.slice(0, 10);
    if (!max || x > max) max = x;
  }
  return max;
}

/** Cadenza del controllo costante del fascicolo vivo valutato più esigente (mesi), o null. */
export function cadenzaControlloCliente(c: Pick<ClienteCompletezza, 'fascicoli'>): number | null {
  let min: number | null = null;
  for (const f of c.fascicoli.filter(vivo)) {
    const m = f.valutazione?.controlloCostanteMesi;
    if (!m || m <= 0 || f.esenteVerifica) continue;
    if (min === null || m < min) min = m;
  }
  return min;
}

function classeCliente(c: ClienteCompletezza): ClasseRischio | null {
  let migliore: ClasseRischio | null = null;
  for (const f of c.fascicoli.filter(vivo)) {
    const k = f.valutazione?.classe;
    if (k && (!migliore || ORDINE_CLASSE[k] > ORDINE_CLASSE[migliore])) migliore = k;
  }
  return migliore;
}

export function calcolaCompletezza(clienti: ClienteCompletezza[], calcolatoIl: string): EsitoCompletezza {
  const perGravita: Record<Gravita, number> = { alta: 0, media: 0, bassa: 0 };
  const perRegola = new Map<CodiceRegola, number>();
  const daCompletare: ClienteDaCompletare[] = [];

  for (const c of clienti) {
    const mancanze = mancanzeCliente(c, calcolatoIl);
    if (!mancanze.length) continue;
    for (const m of mancanze) {
      perGravita[m.gravita]++;
      perRegola.set(m.codice, (perRegola.get(m.codice) ?? 0) + 1);
    }
    const giorni = mancanze.map((m) => m.giorniResidui).filter((g): g is number => typeof g === 'number');
    daCompletare.push({
      id: c.id, denominazione: c.denominazione, tipo: c.tipo, professionista: c.professionista, professionistaId: c.professionistaId,
      classe: classeCliente(c), mancanze, giorniPeggiore: giorni.length ? Math.min(...giorni) : null,
      urgente: mancanze.some((m) => m.gravita === 'alta'),
    });
  }

  // Ordine: prima chi ha qualcosa di urgente, poi per classe di rischio, poi
  // per la scadenza più arretrata, poi per numero di cose da fare.
  daCompletare.sort((a, b) =>
    Number(b.urgente) - Number(a.urgente)
    || (ORDINE_CLASSE[b.classe ?? ''] ?? 0) - (ORDINE_CLASSE[a.classe ?? ''] ?? 0)
    || (a.giorniPeggiore ?? 1) - (b.giorniPeggiore ?? 1)
    || b.mancanze.length - a.mancanze.length
    || a.denominazione.localeCompare(b.denominazione, 'it'));

  const totale = perGravita.alta + perGravita.media + perGravita.bassa;
  const iniziaDa = daCompletare
    .flatMap((c) => c.mancanze.map((m) => ({ clienteId: c.id, denominazione: c.denominazione, mancanza: m, ordine: daCompletare.indexOf(c) })))
    .sort((a, b) => PESO_GRAVITA[b.mancanza.gravita] - PESO_GRAVITA[a.mancanza.gravita] || a.ordine - b.ordine)
    // Un cliente per riga: tre cose da fare su tre clienti diversi, non tre fascicoli dello stesso.
    .filter((x, i, l) => l.findIndex((y) => y.clienteId === x.clienteId) === i)
    .slice(0, 3)
    .map(({ ordine: _o, ...resto }) => resto);

  return {
    calcolatoIl,
    clientiAttivi: clienti.length,
    clientiCompleti: clienti.length - daCompletare.length,
    avanzamento: clienti.length ? Math.round(((clienti.length - daCompletare.length) / clienti.length) * 100) : 100,
    totaleMancanze: totale,
    perGravita,
    perRegola: REGOLE_COMPLETEZZA.filter((r) => perRegola.has(r.codice)).map((r) => ({ codice: r.codice, etichetta: r.etichetta, gravita: r.gravita, n: perRegola.get(r.codice)! })),
    clienti: daCompletare,
    iniziaDa,
  };
}
