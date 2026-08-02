// ── Assistente AI (AR-M9) — Claude via API Anthropic ───────────
//
// Due funzioni, entrambe SUGGERIMENTI da rivedere, mai decisioni:
//  1. suggeritore di indicatori UIF: dalla descrizione dell'operazione
//     (SENZA nominativi) propone i sub-indici pertinenti fra i 400
//     testi letterali del provvedimento 12.5.2023 che custodiamo;
//  2. bozze dei campi discorsivi (scopo/natura della prestazione,
//     motivazione dell'astensione) da dati non identificativi.
//
// Riservatezza (decisa con Simone il 2.8.2026):
//  - la funzione è DISATTIVATA finché il titolare non la abilita in
//    Impostazioni accettando l'informativa (parametri.ai sul tenant);
//  - all'API esterna arrivano solo i testi digitati e i candidati
//    normativi: MAI nominativi, codici fiscali o dati dell'archivio
//    identificativi del cliente. L'interfaccia lo impone e lo ricorda;
//  - nel registro resta solo L'USO della funzione (mai il contenuto);
//  - niente conservazione lato fornitore oltre l'elaborazione (API
//    Anthropic senza training sui dati; DPA disponibile).
//
// Architettura del suggeritore: mandare 400 sub-indici al modello a
// ogni richiesta sarebbe uno spreco; un PREFILTRO lessicale locale
// sceglie i ~60 candidati più affini e il modello seleziona fra quelli,
// citando il codice. Il codice restituito viene sempre riscontrato
// contro il catalogo: il modello non può inventare sub-indici.

import type { Env } from './tipi';
import { INDICATORI_UIF_2023 } from '../domain/indicatori-uif';
import { SUB_INDICI_UIF_2023 } from '../domain/sub-indici-uif';

export const MODELLO_DEFAULT = 'claude-sonnet-4-5';

// ── Opt-in dello studio ────────────────────────────────────────

export function aiAbilitata(parametriGrezzi: string | null | undefined): boolean {
  try {
    return JSON.parse(parametriGrezzi ?? '{}')?.ai?.abilitata === true;
  } catch {
    return false;
  }
}

// ── Chiamata al modello ────────────────────────────────────────

async function chiamaClaude(env: Env, sistema: string, utente: string, maxTokens: number): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new ErroreAi("La chiave API non è configurata: chiedi a Contify di completare l'attivazione.", 503);
  }
  let r: Response;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: env.AI_MODEL ?? MODELLO_DEFAULT,
        max_tokens: maxTokens,
        system: sistema,
        messages: [{ role: 'user', content: utente }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new ErroreAi('Il servizio AI non risponde: riprova tra poco.', 503);
  }
  if (!r.ok) {
    const dettaglio = await r.text().catch(() => '');
    console.error('Claude API errore', r.status, dettaglio.slice(0, 300));
    throw new ErroreAi(r.status === 429 ? 'Servizio AI momentaneamente saturo: riprova tra poco.' : 'Errore del servizio AI.', 503);
  }
  const corpo = await r.json<any>();
  const testo = (corpo?.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  if (!testo) throw new ErroreAi('Risposta vuota dal servizio AI.', 502);
  return testo;
}

export class ErroreAi extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// ── Prefiltro lessicale sui 400 sub-indici ─────────────────────

const STOPWORD_IT = new Set([
  'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
  'del', 'dello', 'della', 'dei', 'degli', 'delle', 'al', 'allo', 'alla', 'ai', 'agli', 'alle', 'dal', 'dallo',
  'dalla', 'dai', 'dagli', 'dalle', 'nel', 'nello', 'nella', 'nei', 'negli', 'nelle', 'sul', 'sullo', 'sulla',
  'sui', 'sugli', 'sulle', 'che', 'chi', 'cui', 'non', 'più', 'anche', 'come', 'dove', 'quando', 'ovvero',
  'essere', 'stato', 'stata', 'sono', 'è', 'ha', 'hanno', 'aveva', 'viene', 'vengono', 'risulta', 'risultano',
  'specie', 'caso', 'casi', 'parte', 'base', 'ad', 'ed', 'od', 'se', 'si', 'e', 'o',
]);

function tokens(testo: string): string[] {
  return testo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length >= 4 && !STOPWORD_IT.has(t));
}

export type CandidatoSubIndice = { codice: string; indicatore: number; testo: string; punteggio: number };

export function prefiltraSubIndici(descrizione: string, massimo = 60): CandidatoSubIndice[] {
  const query = new Set(tokens(descrizione));
  if (query.size === 0) return [];
  const candidati: CandidatoSubIndice[] = [];
  for (const [numero, testi] of Object.entries(SUB_INDICI_UIF_2023)) {
    testi.forEach((testo, i) => {
      const suoi = tokens(testo);
      let comuni = 0;
      const visti = new Set<string>();
      for (const t of suoi) {
        if (query.has(t) && !visti.has(t)) { comuni++; visti.add(t); }
      }
      if (comuni > 0) {
        candidati.push({ codice: `${numero}.${i + 1}`, indicatore: Number(numero), testo, punteggio: comuni / Math.sqrt(suoi.length || 1) });
      }
    });
  }
  candidati.sort((a, b) => b.punteggio - a.punteggio);
  return candidati.slice(0, massimo);
}

// ── Suggeritore di indicatori ──────────────────────────────────

export type SuggerimentoIndicatore = {
  codice: string;
  indicatore: number;
  titoloIndicatore: string;
  testo: string;
  motivo: string;
};

function titoloIndicatore(numero: number): string {
  return INDICATORI_UIF_2023.find((i) => i.numero === numero)?.titolo ?? `Indicatore ${numero}`;
}

/** Estrae il primo array JSON dalla risposta del modello, tollerando testo attorno. */
export function estraiJsonArray(testo: string): any[] {
  const inizio = testo.indexOf('[');
  if (inizio < 0) return [];
  let profondita = 0;
  for (let i = inizio; i < testo.length; i++) {
    if (testo[i] === '[') profondita++;
    if (testo[i] === ']') {
      profondita--;
      if (profondita === 0) {
        try {
          const v = JSON.parse(testo.slice(inizio, i + 1));
          return Array.isArray(v) ? v : [];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

export async function suggerisciIndicatori(env: Env, descrizione: string): Promise<SuggerimentoIndicatore[]> {
  const candidati = prefiltraSubIndici(descrizione, 60);
  if (!candidati.length) return [];

  if (env.AI_FIXTURES === '1') {
    // Locale e smoke: deterministico, i primi due candidati del prefiltro.
    return candidati.slice(0, 2).map((c) => ({
      codice: c.codice, indicatore: c.indicatore, titoloIndicatore: titoloIndicatore(c.indicatore),
      testo: c.testo, motivo: 'Suggerimento di prova (fixtures locali).',
    }));
  }

  const sistema =
    'Sei un assistente per professionisti italiani soggetti alla normativa antiriciclaggio (DLgs. 231/2007). ' +
    'Ti viene descritta un\'operatività sospetta e un elenco NUMERATO di sub-indici di anomalia UIF (provvedimento 12.5.2023). ' +
    'Seleziona SOLO i sub-indici davvero pertinenti alla descrizione (da 0 a 8), scegliendo esclusivamente fra quelli elencati. ' +
    'Rispondi con UN SOLO array JSON, senza altro testo, nel formato: ' +
    '[{"codice":"20.9","motivo":"perché è pertinente, in una frase"}]. ' +
    'Se nessuno è pertinente rispondi []. Non inventare codici.';

  const utente =
    `DESCRIZIONE DELL'OPERATIVITÀ (senza nominativi):\n${descrizione.slice(0, 4000)}\n\n` +
    `SUB-INDICI CANDIDATI:\n${candidati.map((c) => `${c.codice}: ${c.testo}`).join('\n')}`;

  const risposta = await chiamaClaude(env, sistema, utente, 1500);
  const grezzi = estraiJsonArray(risposta);

  const validi: SuggerimentoIndicatore[] = [];
  for (const g of grezzi.slice(0, 8)) {
    const codice = String(g?.codice ?? '');
    const m = codice.match(/^(\d+)\.(\d+)$/);
    if (!m) continue;
    const numero = Number(m[1]);
    const idx = Number(m[2]) - 1;
    const testo = SUB_INDICI_UIF_2023[numero]?.[idx];
    if (!testo) continue;   // codice inventato: scartato
    validi.push({
      codice, indicatore: numero, titoloIndicatore: titoloIndicatore(numero), testo,
      motivo: String(g?.motivo ?? '').slice(0, 300),
    });
  }
  return validi;
}

// ── Bozze dei campi discorsivi ─────────────────────────────────

export type TipoBozza = 'SCOPO_NATURA' | 'MOTIVAZIONE_ASTENSIONE';

export type ContestoBozza = {
  prestazione?: string;
  tipoRapporto?: string;
  importo?: number | null;
  attivitaCliente?: string;
  naturaCliente?: string;
  fondamento?: string;
  appunti?: string;
};

const FONDAMENTI: Record<string, string> = {
  ART_42_CO_1: "art. 42 co. 1 — impossibilità oggettiva di completare l'adeguata verifica",
  ART_42_CO_2: 'art. 42 co. 2 — dubbio sulla possibilità di perseguire finalità illecite',
  ART_18_CO_3: 'art. 18 co. 3 — dubbi sulla veridicità dei dati o sull\'identità',
};

export async function generaBozza(env: Env, tipo: TipoBozza, contesto: ContestoBozza): Promise<string> {
  if (env.AI_FIXTURES === '1') {
    return tipo === 'SCOPO_NATURA'
      ? `Bozza di prova (fixtures): la prestazione di ${contesto.prestazione ?? 'consulenza'} risponde a esigenze ordinarie di adempimento del cliente.`
      : `Bozza di prova (fixtures): motivazione dell'astensione fondata su ${contesto.fondamento ?? 'art. 42'}.`;
  }

  let sistema: string;
  let utente: string;

  if (tipo === 'SCOPO_NATURA') {
    sistema =
      'Scrivi in italiano professionale, per un fascicolo antiriciclaggio (art. 19 co. 1 lett. c DLgs. 231/2007), ' +
      'una breve annotazione (3-6 frasi) su scopo e natura prevista della prestazione professionale. ' +
      'Tono sobrio e fattuale, prima persona plurale evitata, NIENTE nomi propri. ' +
      'Rispondi con il solo testo della bozza, senza premesse né commenti.';
    utente = [
      contesto.prestazione && `Prestazione: ${contesto.prestazione}`,
      contesto.tipoRapporto && `Tipo di rapporto: ${contesto.tipoRapporto === 'OCCASIONALE' ? 'prestazione occasionale' : 'rapporto continuativo'}`,
      contesto.importo != null && `Valore indicativo: ${contesto.importo} euro`,
      contesto.naturaCliente && `Natura del cliente: ${contesto.naturaCliente}`,
      contesto.attivitaCliente && `Attività prevalente del cliente: ${contesto.attivitaCliente}`,
      contesto.appunti && `Appunti del professionista: ${contesto.appunti}`,
    ].filter(Boolean).join('\n').slice(0, 3000);
  } else {
    sistema =
      'Scrivi in italiano professionale la motivazione di un verbale di astensione ex art. 42 DLgs. 231/2007 ' +
      '(4-8 frasi). Struttura: circostanze rilevate, impossibilità o dubbio che ne deriva, decisione di astenersi, ' +
      'riserva di valutare la segnalazione ex art. 35. NIENTE nomi propri. ' +
      'Rispondi con il solo testo della bozza, senza premesse né commenti.';
    utente = [
      contesto.fondamento && `Fondamento normativo: ${FONDAMENTI[contesto.fondamento] ?? contesto.fondamento}`,
      contesto.prestazione && `Prestazione richiesta: ${contesto.prestazione}`,
      contesto.appunti && `Circostanze annotate dal professionista: ${contesto.appunti}`,
    ].filter(Boolean).join('\n').slice(0, 3000);
  }

  if (!utente.trim()) throw new ErroreAi('Aggiungi qualche appunto: la bozza si scrive a partire dai fatti.', 400);
  const bozza = await chiamaClaude(env, sistema, utente, 800);
  return bozza.trim().slice(0, 4000);
}

// ── Chat di assistenza in-app (AR-M10) ─────────────────────────
// Risponde su come si usa Contify AR e sulla normativa di riferimento.
// Le conversazioni NON vengono conservate: viaggiano dal browser al
// modello e tornano indietro; nel registro resta solo l'uso.

export type MessaggioChat = { ruolo: 'utente' | 'assistente'; testo: string };

const SISTEMA_CHAT = `Sei l'assistente in-app di Contify AR (AntiRiciclaggio), il software di Contify Srl per gli adempimenti del DLgs. 21.11.2007 n. 231 degli studi commercialisti italiani, costruito sulle Regole tecniche e la modulistica CNDCEC (Informativa n. 57/2026).

COME È FATTO IL SOFTWARE (pagine del menu):
- Cruscotto: stato dei presidi, percorso «Per iniziare», avvisi dei controlli automatici.
- Autovalutazione studio: artt. 15-16, pesi 40/60 (inerente/vulnerabilità), descrittori ufficiali dei punteggi, firma che congela la versione, verbale Word.
- Clienti: anagrafica (dati di dettaglio cifrati), qualifica PEP, «Compila dai registri» dalla partita IVA (VIES), «Importa da CSV».
- Fascicoli: uno per prestazione; dentro: valutazione del rischio (Tabelle A e B CNDCEC, pesi 30/70, esoneri; le circostanze di legge — PEP, paesi terzi ad alto rischio, sospetto — alzano il livello da sole), titolarità effettiva (artt. 20-22, criteri guidati, riscontro col registro TE ex D.M. 122/2026), adeguata verifica a distanza (link monouso al cliente), documenti con impronta e conservazione decennale, astensioni ex art. 42, verbali Word (scheda di verifica e fascicolo per l'ispezione).
- Scadenzario: controllo costante per classe di rischio (36/36/24/12 mesi), comunicazioni MEF.
- Limiti al contante: art. 49, soglie storicizzate per data operazione (5.000 € dal 1.1.2023), comunicazione MEF ex art. 51.
- Controlli automatici: screening notturno su liste sanzioni UE/ONU/OFAC di clienti e titolari effettivi (le corrispondenze si esaminano e si decidono con motivazione), paesi terzi ad alto rischio (Reg. UE 2025/1184), accreditamento biennale al registro TE.
- Segnalazioni (solo titolare, art. 38): SOS cifrate, 34 indicatori e 400 sub-indici UIF letterali (provv. 12.5.2023), suggeritore AI degli indicatori.
- Registro accessi: catena crittografica ex art. 32, verifica di integrità, export CSV.
- Impostazioni: profilo, password, utenti e ruoli (titolare/collaboratore/lettore/revisore), logo studio, assistente AI, backup dell'archivio (notturni UE, ripristino self-service, eliminazione a 3 passi).
- Guida e assistenza: guida per sezioni con «?» contestuale, modulo di contatto verso Contify.

REGOLE:
1. Rispondi in italiano, conciso e concreto: prima il "dove si fa" nel software, poi il riferimento normativo se utile. Cita articoli solo se ne sei certo; non inventare mai numeri di articoli, soglie o scadenze.
2. Sei un aiuto all'uso e all'orientamento normativo, NON un parere legale: sulle scelte di merito (livello di verifica, astensione, segnalazione) ricorda che la valutazione spetta al professionista.
3. Non chiedere né accettare nominativi o dati di clienti: se l'utente li scrive, invitalo a riformulare senza dati identificativi.
4. Problemi di account, fatturazione o malfunzionamenti: indirizza al modulo di assistenza nella pagina «Guida e assistenza».
5. Se non sai una cosa, dillo e suggerisci dove verificarla (guida in-app, fonte normativa, assistenza).`;

export async function rispostaChat(env: Env, messaggi: MessaggioChat[]): Promise<string> {
  if (env.AI_FIXTURES === '1') {
    const ultima = messaggi[messaggi.length - 1]?.testo ?? '';
    return `Risposta di prova (fixtures) alla domanda: «${ultima.slice(0, 80)}». Trovi il dettaglio nella Guida in-app.`;
  }
  if (!env.ANTHROPIC_API_KEY) {
    throw new ErroreAi("La chiave API non è configurata: chiedi a Contify di completare l'attivazione.", 503);
  }
  let r: Response;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: env.AI_MODEL ?? MODELLO_DEFAULT,
        max_tokens: 900,
        system: SISTEMA_CHAT,
        messages: messaggi.slice(-16).map((m) => ({
          role: m.ruolo === 'utente' ? 'user' : 'assistant',
          content: m.testo.slice(0, 2000),
        })),
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new ErroreAi('Il servizio AI non risponde: riprova tra poco.', 503);
  }
  if (!r.ok) {
    console.error('Claude chat errore', r.status, (await r.text().catch(() => '')).slice(0, 300));
    throw new ErroreAi(r.status === 429 ? 'Servizio AI momentaneamente saturo: riprova tra poco.' : 'Errore del servizio AI.', 503);
  }
  const corpo = await r.json<any>();
  const testo = (corpo?.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
  if (!testo) throw new ErroreAi('Risposta vuota dal servizio AI.', 502);
  return testo.slice(0, 6000);
}
