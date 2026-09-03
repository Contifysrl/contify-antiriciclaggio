/**
 * MOTORE DI ALERT SULLA TITOLARITÀ EFFETTIVA (AR-M17, visione §5)
 *
 * Ogni alert ha codice, gravità, norma, messaggio in italiano chiaro e una
 * AZIONE proposta (un pulsante, non un consiglio). Gli alert non bloccano,
 * tranne A3 (che pretende la motivazione ex art. 20 co. 6) e A8 (che pretende
 * la decisione sullo screening): bloccare un professionista su un indizio lo
 * spinge a scartare la funzione.
 *
 * Il motore è puro: riceve la compagine (come letta dalla visura o come
 * persistita), le cariche, l'esito del motore art. 20 e gli esiti dello
 * screening, e restituisce alert testabili su fixture. Un alert che scatta a
 * sproposito viene ignorato dopo tre volte, e con lui tutti gli altri: meglio
 * otto alert precisi che tredici approssimativi (A9-A13 in M18-M20).
 *
 * Correzione di dominio incorporata (visione §1.1): «nessuno supera il 25% →
 * il titolare effettivo è il rappresentante legale» salta il co. 3. La
 * sequenza giusta è A1 (co. 2 vuoto) → A2 (controllo: domanda al cliente
 * nella dichiarazione art. 22) → A3 (co. 5 sugli amministratori con poteri,
 * motivazione ex co. 6 in bozza).
 */

import type { Carica, DirittoPartecipazione, RisultatoAnalisiTitolarita } from './titolare-effettivo';
import { CARICHE_CON_POTERI, etichettaCarica } from './titolare-effettivo';

export type TipoSocio = 'PERSONA_FISICA' | 'PERSONA_GIURIDICA' | 'FIDUCIARIA' | 'TRUST' | 'ALTRO';

export interface SocioCompagine {
  id: string;
  nome: string;
  tipo: TipoSocio;
  /** Frazione 0..1 del capitale sottoscritto. */
  quota: number;
  diritto: DirittoPartecipazione;
  /** ISO 3166-1 alpha-2; assente = non desumibile (si assume IT per i CF italiani). */
  paese?: string;
  /** La riga è la società stessa (quote proprie). */
  quoteProprie?: boolean;
  /** Quota in comproprietà con altri (rappresentante comune, art. 2468 co. 5 c.c.). */
  comproprieta?: boolean;
  /** Il socio persona giuridica è già cliente dello studio: la catena si chiude da sola. */
  clienteStudio?: { id: string; denominazione: string; visuraDel?: string | null } | null;
}

export interface EsitoScreeningSoggetto {
  nominativo: string;
  fonte: string;
  punteggio: number;
  stato: 'DA_ESAMINARE' | 'ESCLUSO' | 'CONFERMATO';
}

export interface InputAlert {
  denominazione: string;
  /** Natura giuridica del cliente (clienti.tipo). */
  tipoCliente: string;
  analisi: RisultatoAnalisiTitolarita;
  soci: SocioCompagine[];
  cariche: Carica[];
  capitale?: { sottoscritto?: number | null; versato?: number | null; deliberato?: number | null } | null;
  screening?: EsitoScreeningSoggetto[];
  /** Iniettato da norme.ts: paesi terzi ad alto rischio (Reg. delegato UE 2025/1184). */
  paeseAltoRischio: (paese: string) => boolean;
  /** Data della visura (ISO), per la bozza di motivazione. */
  dataVisura?: string | null;
  /** Data dell'elenco soci (ISO), se diversa. */
  dataElencoSoci?: string | null;
}

export type CodiceAlert = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8' | 'A11';
export type Gravita = 'alta' | 'media' | 'bassa';

export type AzioneAlert =
  | { tipo: 'SEQUENZA_GUIDATA'; etichetta: string }
  | { tipo: 'DOMANDE_ART22'; etichetta: string; domande: string[] }
  | { tipo: 'CONFERMA_RESIDUALE'; etichetta: string; candidati: Array<{ id: string; nome: string; carica: string }>; bozzaMotivazione: string }
  | { tipo: 'CARICA_VISURA'; etichetta: string; socioId: string; socioNome: string }
  | { tipo: 'CATENA_RISOLTA'; etichetta: string; socioId: string; clienteId: string }
  | { tipo: 'DOCUMENTAZIONE_ESTERA'; etichetta: string; socioId: string; paese: string; altoRischio: boolean }
  | { tipo: 'ACQUISISCI_FIDUCIANTE'; etichetta: string; socioId: string; trust: boolean }
  | { tipo: 'PRENDI_ATTO'; etichetta: string }
  | { tipo: 'DECIDI_SCREENING'; etichetta: string; nominativi: string[] }
  | { tipo: 'VALUTA_RICORRENZA'; etichetta: string; soggetto: string; clienti: Array<{ id: string; denominazione: string; ruolo: string; neoCostituita: boolean }> };

export interface Alert {
  codice: CodiceAlert;
  gravita: Gravita;
  titolo: string;
  messaggio: string;
  norma: string;
  azione: AzioneAlert;
  /** Vero per A3 e A8: la revisione non si chiude senza una decisione. */
  bloccante: boolean;
}

const pct = (q: number) => `${(Math.round(q * 10000) / 100).toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;
const dataIt = (iso?: string | null) => (iso ? iso.split('-').reverse().join('/') : null);

const DOMANDE_CONTROLLO_ART22 = [
  'Esistono patti parasociali, accordi di voto o sindacati di blocco fra i soci?',
  'Lo statuto attribuisce a singoli soci diritti particolari sull’amministrazione o sulla distribuzione degli utili (art. 2468 co. 3 c.c.) o prevede voto plurimo?',
  'Esistono vincoli contrattuali, finanziamenti o garanzie che consentono a un soggetto di esercitare un’influenza dominante sulla società (art. 2359 c.c.)?',
  'Le quote sono gravate da usufrutto, pegno, sequestro o pignoramento, e in tal caso a chi spetta il diritto di voto (art. 2352 c.c.)?',
  'Qualcuno dei soci detiene la partecipazione per conto di terzi (interposizione, mandato fiduciario)?',
];

/**
 * Bozza della motivazione ex art. 20 co. 6, scritta dai fatti: compagine,
 * date, fonte, criteri tentati e ragioni del passaggio al residuale. Il
 * professionista la firma o la corregge. È l'adempimento che in ispezione
 * manca più spesso.
 */
export function bozzaMotivazioneCo6(input: InputAlert, candidati: Array<{ id: string; nome: string; carica: string }>): string {
  const { analisi, soci, denominazione } = input;
  const p = analisi.parametri;
  const fonte = input.dataVisura
    ? `dalla visura camerale estratta il ${dataIt(input.dataVisura)}${input.dataElencoSoci ? ` (elenco soci al ${dataIt(input.dataElencoSoci)})` : ''}`
    : 'dai dati camerali acquisiti';
  const capitale = input.capitale?.sottoscritto
    ? ` di euro ${input.capitale.sottoscritto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`
    : '';
  const ripartizione = soci
    .filter((s) => !s.quoteProprie)
    .map((s) => `${s.nome} ${pct(s.quota)}${s.diritto !== 'PROPRIETA' ? ` (${s.diritto.toLowerCase().replace('_', ' ')})` : ''}`)
    .join('; ');
  const massima = analisi.quotePersoneFisiche[0];
  const vincoli = analisi.vincoliSulleQuote.length
    ? ` La visura evidenzia vincoli sulle quote (${analisi.vincoliSulleQuote.map((v) => `${v.diritto.toLowerCase()} a favore di ${v.denominazione}`).join(', ')}), valutati ai fini del controllo.`
    : ' La visura non evidenzia patti parasociali, diritti particolari ex art. 2468 co. 3 c.c. o vincoli contrattuali idonei a configurare un controllo.';
  const residuale = candidati.length
    ? `Si applica pertanto il criterio residuale dell’art. 20 co. 5: il titolare effettivo è individuato in ${candidati
        .map((c) => `${c.nome} (${c.carica})`)
        .join(' e ')}, in quanto titolare dei poteri di rappresentanza legale e amministrazione della società.`
    : 'Si applica pertanto il criterio residuale dell’art. 20 co. 5, da riferire alla persona fisica titolare di poteri di rappresentanza legale, amministrazione o direzione, da individuare con i dati delle cariche.';
  return (
    `Risulta ${fonte} che il capitale sociale${capitale} di ${denominazione} è così ripartito: ${ripartizione}. ` +
    `Nessuna persona fisica detiene, direttamente o indirettamente, una partecipazione ${p.etichettaSoglia} del capitale (${p.norma})` +
    (massima ? `: la quota più elevata è del ${pct(massima.quota)} (${massima.denominazione}). ` : '. ') +
    `Il criterio della proprietà non individua quindi titolari effettivi.${vincoli} ` +
    `Ai fini dell’art. 20 co. 3 il cliente è chiamato a dichiarare per iscritto, ai sensi dell’art. 22, l’assenza di accordi o vincoli che attribuiscano il controllo a uno o più soci. ` +
    residuale
  );
}

export function calcolaAlertTitolarita(input: InputAlert): Alert[] {
  const out: Alert[] = [];
  const { analisi, soci, cariche } = input;
  const personaFisica = input.tipoCliente === 'PERSONA_FISICA';
  if (personaFisica) return out;

  const sociReali = soci.filter((s) => !s.quoteProprie);
  const haSoci = sociReali.length > 0;
  // Finché c'è una persona giuridica non risolta (né cliente dello studio né
  // fiduciaria/trust), il criterio della proprietà non è FALLITO: è
  // INCOMPLETO. Dire «nessuno supera il 25%» prima di aver risalito la
  // holding sarebbe l'errore che A1 esiste per evitare: qui si chiede la
  // visura della controllante (A4/A5), e A1/A3 aspettano.
  // Vale anche in profondità: la holding è cliente, ma la sua socia no
  // (`nodiIrrisolti` dall'analisi della catena).
  const irrisoltiProfondi = (analisi.nodiIrrisolti ?? []).filter((n) => !sociReali.some((s) => s.id === n.id));
  const catenaIncompleta = sociReali.some(
    (s) => (s.tipo === 'PERSONA_GIURIDICA' || s.tipo === 'ALTRO') && !s.clienteStudio,
  ) || irrisoltiProfondi.length > 0;
  const proprietaVuota = haSoci && !catenaIncompleta && !['PROPRIETA_DIRETTA', 'PROPRIETA_INDIRETTA'].includes(analisi.criterioApplicato);
  const candidati = cariche
    .filter((c) => c.poteri ?? (CARICHE_CON_POTERI.has(c.carica) || Boolean(c.rappresentanzaLegale)))
    .map((c) => ({ id: c.id, nome: c.nome, carica: etichettaCarica(c.carica) + (c.rappresentanzaLegale ? ', rappresentante legale' : '') }));

  // A1 — nessuna persona fisica sopra soglia (incluso 4×25% esatto).
  if (proprietaVuota) {
    const massima = analisi.quotePersoneFisiche[0];
    out.push({
      codice: 'A1',
      gravita: 'alta',
      titolo: 'Il criterio della proprietà non individua titolari effettivi',
      messaggio:
        `Nessuna persona fisica detiene una partecipazione ${analisi.parametri.etichettaSoglia} del capitale` +
        (massima ? ` (la più alta è ${massima.denominazione} con il ${pct(massima.quota)})` : '') +
        `. Non si salta al rappresentante legale: prima si verifica il controllo (A2), poi si applica il criterio residuale (A3) con motivazione scritta.`,
      norma: `${analisi.parametri.norma}; art. 20 co. 3, 5 e 6 DLgs. 231/2007`,
      azione: { tipo: 'SEQUENZA_GUIDATA', etichetta: 'Apri la sequenza guidata' },
      bloccante: false,
    });
  }

  // A2 — controllo da verificare: A1, 50/50, vincoli sulle quote, socio unico PG.
  const pf = analisi.quotePersoneFisiche;
  const cinquantaCinquanta = pf.length === 2 && pf.every((q) => Math.abs(q.quota - 0.5) < 0.0001);
  const socioUnicoPg = sociReali.length === 1 && sociReali[0].tipo !== 'PERSONA_FISICA' && sociReali[0].quota >= 0.9999;
  const vincoli = analisi.vincoliSulleQuote;
  if (proprietaVuota || cinquantaCinquanta || vincoli.length > 0 || socioUnicoPg) {
    const motivi: string[] = [];
    if (proprietaVuota) motivi.push('nessun socio sopra soglia');
    if (cinquantaCinquanta) motivi.push('assetto paritario 50/50: nessuno dei due controlla da solo l’assemblea');
    if (vincoli.length) motivi.push(`vincoli sulle quote (${vincoli.map((v) => `${v.diritto.toLowerCase()} ${pct(v.quota)} a favore di ${v.denominazione}`).join(', ')}): il voto può spettare al titolare del vincolo, art. 2352 c.c.`);
    if (socioUnicoPg) motivi.push(`socio unico persona giuridica (${sociReali[0].nome}): il controllo va accertato risalendo la catena`);
    out.push({
      codice: 'A2',
      gravita: 'alta',
      titolo: 'Verifica il controllo (art. 20 co. 3)',
      messaggio:
        `${motivi.join('; ')}. La visura non mostra patti parasociali, diritti particolari, accordi di voto o vincoli contrattuali: ` +
        'sono informazioni che solo il cliente può dare, per iscritto, nella dichiarazione ex art. 22.',
      norma: 'art. 20 co. 3 DLgs. 231/2007; artt. 2352, 2359, 2468 c.c.',
      azione: { tipo: 'DOMANDE_ART22', etichetta: 'Inserisci le domande nella dichiarazione art. 22', domande: DOMANDE_CONTROLLO_ART22 },
      bloccante: false,
    });
  }

  // A3 — residuale: A1 senza controllo accertato.
  if (proprietaVuota && analisi.criterioApplicato !== 'CONTROLLO') {
    const bozza = bozzaMotivazioneCo6(input, candidati);
    out.push({
      codice: 'A3',
      gravita: 'alta',
      titolo: 'Criterio residuale (art. 20 co. 5): motivazione obbligatoria',
      messaggio: candidati.length
        ? `Se dal cliente non emerge un controllo, i titolari effettivi proposti sono ${candidati.map((c) => `${c.nome} (${c.carica})`).join(', ')}. La motivazione ex art. 20 co. 6 è in bozza: confermala o correggila prima di registrare.`
        : 'La visura non riporta cariche con poteri di rappresentanza o amministrazione: individua a mano la persona fisica cui applicare il criterio residuale e motiva per iscritto (art. 20 co. 6).',
      norma: 'art. 20 co. 5 e 6 DLgs. 231/2007',
      azione: { tipo: 'CONFERMA_RESIDUALE', etichetta: 'Conferma e firma la motivazione', candidati, bozzaMotivazione: bozza },
      bloccante: true,
    });
  }

  for (const s of sociReali) {
    const paese = (s.paese ?? 'IT').toUpperCase();
    // A6 — fiduciaria o trust: interposizione, non si risale.
    if (s.tipo === 'FIDUCIARIA' || s.tipo === 'TRUST') {
      const trust = s.tipo === 'TRUST';
      out.push({
        codice: 'A6',
        gravita: 'alta',
        titolo: trust ? 'Socio trust: si applica l’art. 22 co. 5' : 'Interposizione fiduciaria',
        messaggio: trust
          ? `${s.nome} detiene il ${pct(s.quota)} come trust: titolari effettivi sono costituente, trustee, guardiano e beneficiari (art. 22 co. 5), da acquisire dal trustee.`
          : `${s.nome} detiene il ${pct(s.quota)} in veste di società fiduciaria: il titolare effettivo è il fiduciante, da acquisire per iscritto (mandato fiduciario). La fiduciaria non si «risale».`,
        norma: trust ? 'art. 22 co. 5 DLgs. 231/2007' : 'art. 20 co. 2 lett. b) DLgs. 231/2007; L. 1966/1939',
        azione: { tipo: 'ACQUISISCI_FIDUCIANTE', etichetta: trust ? 'Registra i soggetti del trust' : 'Acquisisci il fiduciante', socioId: s.id, trust },
        bloccante: false,
      });
      continue;
    }
    if (s.tipo === 'PERSONA_GIURIDICA' || s.tipo === 'ALTRO') {
      if (paese === 'IT') {
        // A4 — persona giuridica italiana: si risale, da sola se è già cliente.
        if (s.clienteStudio) {
          out.push({
            codice: 'A4',
            gravita: 'media',
            titolo: 'Catena risolta con i dati dello studio',
            messaggio: `${s.nome} detiene il ${pct(s.quota)} ed è già cliente dello studio: la catena è stata ricostruita con la sua compagine${s.clienteStudio.visuraDel ? ` (visura del ${dataIt(s.clienteStudio.visuraDel)})` : ''}. Verifica che sia aggiornata.`,
            norma: 'art. 20 co. 2 lett. b) DLgs. 231/2007',
            azione: { tipo: 'CATENA_RISOLTA', etichetta: `Apri la scheda di ${s.clienteStudio.denominazione}`, socioId: s.id, clienteId: s.clienteStudio.id },
            bloccante: false,
          });
        } else {
          out.push({
            codice: 'A4',
            gravita: 'media',
            titolo: 'Socio persona giuridica: risalire la catena',
            messaggio: `${s.nome} detiene il ${pct(s.quota)}: per individuare il titolare effettivo serve risalire alla sua compagine. Carica anche la sua visura, oppure inserisci i suoi soci a mano.`,
            norma: 'art. 20 co. 2 lett. b) DLgs. 231/2007',
            azione: { tipo: 'CARICA_VISURA', etichetta: `Carica la visura di ${s.nome}`, socioId: s.id, socioNome: s.nome },
            bloccante: false,
          });
        }
      } else {
        // A5 — persona giuridica estera.
        const altoRischio = input.paeseAltoRischio(paese);
        out.push({
          codice: 'A5',
          gravita: 'alta',
          titolo: altoRischio ? 'Socio estero in Paese ad alto rischio: verifica rafforzata' : 'Socio estero: documentazione equivalente',
          messaggio:
            `${s.nome} (${paese}) detiene il ${pct(s.quota)}: nessuna visura italiana, serve documentazione equivalente (certificato camerale estero, certificate of incumbency, elenco soci).` +
            (altoRischio ? ' Il Paese è fra quelli terzi ad alto rischio: la verifica rafforzata è obbligatoria per legge (art. 24 co. 5) e il livello di rischio non può che salire.' : ''),
          norma: altoRischio ? 'art. 20 co. 2 lett. b); art. 24 co. 5 DLgs. 231/2007; Reg. delegato (UE) 2025/1184' : 'art. 20 co. 2 lett. b) DLgs. 231/2007',
          azione: { tipo: 'DOCUMENTAZIONE_ESTERA', etichetta: 'Segna i documenti da raccogliere', socioId: s.id, paese, altoRischio },
          bloccante: false,
        });
      }
    }
  }

  // A4 in profondità — la catena si ferma su una società che non è cliente
  // dello studio, oltre il primo livello: serve la sua visura.
  for (const n of irrisoltiProfondi) {
    out.push({
      codice: 'A4',
      gravita: 'media',
      titolo: 'Catena da risalire oltre la controllante',
      messaggio: `${n.denominazione} detiene il ${pct(n.quotaEffettiva)} tramite ${n.tramite}: per individuare il titolare effettivo serve anche la sua compagine. Carica la sua visura, oppure inserisci i suoi soci a mano.`,
      norma: 'art. 20 co. 2 lett. b) DLgs. 231/2007',
      azione: { tipo: 'CARICA_VISURA', etichetta: `Carica la visura di ${n.denominazione}`, socioId: n.id, socioNome: n.denominazione },
      bloccante: false,
    });
  }

  // A7 — quote proprie, comproprietà, capitale non interamente versato.
  const noteA7: string[] = [];
  if (analisi.quoteProprie.length) noteA7.push(`percentuali ricalcolate escludendo le quote proprie (${analisi.quoteProprie.map((q) => pct(q.quota)).join(', ')}; art. 2357-ter c.c.)`);
  const compropr = sociReali.filter((s) => s.comproprieta);
  if (compropr.length) noteA7.push(`quote in comproprietà (${compropr.map((s) => s.nome).join(', ')}): i diritti si esercitano tramite il rappresentante comune e la quota non si somma a un unico socio (art. 2468 co. 5 c.c.)`);
  const cap = input.capitale;
  if (cap?.sottoscritto && cap.versato != null && cap.versato < cap.sottoscritto - 0.005) {
    noteA7.push(`capitale sottoscritto ${cap.sottoscritto.toLocaleString('it-IT', { minimumFractionDigits: 2 })} ma versato ${cap.versato.toLocaleString('it-IT', { minimumFractionDigits: 2 })}: le percentuali si calcolano sul sottoscritto`);
  }
  if (noteA7.length) {
    out.push({
      codice: 'A7',
      gravita: 'media',
      titolo: 'Particolarità del capitale da tenere presenti',
      messaggio: noteA7.join('; ') + '.',
      norma: 'artt. 2357-ter, 2468 co. 5 c.c.',
      azione: { tipo: 'PRENDI_ATTO', etichetta: 'Ho preso atto' },
      bloccante: false,
    });
  }

  // A8 — screening sanzioni e residenza in Paese ad alto rischio.
  const corrispondenze = (input.screening ?? []).filter((e) => e.stato !== 'ESCLUSO');
  const residentiAltoRischio = sociReali.filter((s) => s.tipo === 'PERSONA_FISICA' && s.paese && s.paese.toUpperCase() !== 'IT' && input.paeseAltoRischio(s.paese));
  if (corrispondenze.length || residentiAltoRischio.length) {
    const parti: string[] = [];
    if (corrispondenze.length) parti.push(`corrispondenze nelle liste sanzioni per ${[...new Set(corrispondenze.map((e) => e.nominativo))].join(', ')} (${[...new Set(corrispondenze.map((e) => e.fonte))].join('/')}): da esaminare e decidere con motivazione`);
    if (residentiAltoRischio.length) parti.push(`soci residenti in Paesi terzi ad alto rischio: ${residentiAltoRischio.map((s) => `${s.nome} (${s.paese})`).join(', ')} — verifica rafforzata (art. 24 co. 5)`);
    out.push({
      codice: 'A8',
      gravita: 'alta',
      titolo: corrispondenze.length ? 'Corrispondenze nelle liste sanzioni' : 'Residenza in Paese ad alto rischio',
      messaggio: parti.join('; ') + '.',
      norma: 'art. 24 co. 5 DLgs. 231/2007; regolamenti UE sulle misure restrittive',
      azione: { tipo: 'DECIDI_SCREENING', etichetta: 'Esamina in Controlli automatici', nominativi: [...new Set(corrispondenze.map((e) => e.nominativo))] },
      bloccante: corrispondenze.length > 0,
    });
  }

  const ordine: Record<Gravita, number> = { alta: 0, media: 1, bassa: 2 };
  return out.sort((a, b) => ordine[a.gravita] - ordine[b.gravita] || a.codice.localeCompare(b.codice, undefined, { numeric: true }));
}

// ===========================================================================
// A11 — Ricorrenza nel portafoglio (AR-M19)
//
// La stessa persona (stesso CF, confrontato via HMAC per tenant senza
// decifrare) compare come socio o amministratore in molti clienti dello
// studio, o in più società costituite di recente. Da solo non prova nulla —
// un commercialista che amministra cinque srl di famiglia è normale — ma è
// l'indicatore classico del prestanome negli indicatori di anomalia UIF, e
// va valutato con cognizione. Media gravità, mai bloccante: chiede uno
// sguardo, non una decisione.
// ===========================================================================

/** Sotto questo numero di clienti la ricorrenza non si segnala. */
export const SOGLIA_RICORRENZA_CLIENTI = 5;
/** Società costituite negli ultimi N mesi. */
export const RICORRENZA_NEO_COSTITUITE_MESI = 24;
/** Da quante società neo-costituite scatta la segnalazione. */
export const SOGLIA_RICORRENZA_NEO = 2;

export interface RicorrenzaSoggetto {
  /** Identificativo del soggetto (cf_hash o nome normalizzato). */
  id: string;
  nome: string;
  /** Altri clienti dello studio in cui compare (il cliente in esame escluso). */
  clienti: Array<{ id: string; denominazione: string; ruolo: 'socio' | 'amministratore' | 'socio e amministratore'; dataCostituzione: string | null }>;
}

function mesiFra(daIso: string, aIso: string): number {
  const a = new Date(`${daIso}T00:00:00Z`);
  const b = new Date(`${aIso}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return Number.POSITIVE_INFINITY;
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
}

export function calcolaAlertRicorrenze(ricorrenze: RicorrenzaSoggetto[], oggi: string): Alert[] {
  const out: Alert[] = [];
  for (const r of ricorrenze) {
    const clienti = r.clienti.map((c) => ({
      id: c.id, denominazione: c.denominazione, ruolo: c.ruolo,
      neoCostituita: Boolean(c.dataCostituzione) && mesiFra(c.dataCostituzione!, oggi) < RICORRENZA_NEO_COSTITUITE_MESI,
    }));
    const neo = clienti.filter((c) => c.neoCostituita);
    const molti = clienti.length >= SOGLIA_RICORRENZA_CLIENTI;
    const recenti = neo.length >= SOGLIA_RICORRENZA_NEO;
    if (!molti && !recenti) continue;
    const elenco = (l: typeof clienti) => l.slice(0, 6).map((c) => c.denominazione).join(', ') + (l.length > 6 ? ` e altre ${l.length - 6}` : '');
    const messaggio = molti
      ? `${r.nome} compare come socio o amministratore in altri ${clienti.length} clienti dello studio (${elenco(clienti)})` +
        (recenti ? `, di cui ${neo.length} costituiti negli ultimi ${RICORRENZA_NEO_COSTITUITE_MESI} mesi. ` : '. ') +
        'Valuta la coerenza del ruolo con il profilo della persona e con l’operatività delle società: la ricorrenza in sé non è un’anomalia, la sua assenza di spiegazione sì.'
      : `${r.nome} compare in ${neo.length} società clienti costituite negli ultimi ${RICORRENZA_NEO_COSTITUITE_MESI} mesi (${elenco(neo)}). ` +
        'Verifica che il ruolo sia coerente con il profilo della persona e che non ricorrano cariche formali in società di recente costituzione (indicatore dei prestanome).';
    out.push({
      codice: 'A11',
      gravita: 'media',
      titolo: 'Ricorrenza nel portafoglio dello studio',
      messaggio,
      norma: 'Indicatori di anomalia UIF (provv. 12.5.2023), sez. A — soggetti con cariche formali ricorrenti; art. 35 DLgs. 231/2007',
      azione: { tipo: 'VALUTA_RICORRENZA', etichetta: 'Vedi i clienti collegati', soggetto: r.nome, clienti },
      bloccante: false,
    });
  }
  return out;
}
