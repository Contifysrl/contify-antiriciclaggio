/**
 * Contify Timesheet — riconoscimento locale del giorno del lavoro (TS-M1, passo 1).
 *
 * Regole della specifica: oggi se non detto; «ieri», «l'altro ieri»; il nome
 * di un giorno è la sua ricorrenza passata più recente, oggi escluso; «il 28»
 * è il 28 più recente non futuro; mai nel futuro. In più: date complete
 * («28 settembre», «02/10»), «due giorni fa», «una settimana fa»; le
 * espressioni vaghe («la settimana scorsa», «qualche giorno fa») e quelle nel
 * futuro («domani») restituiscono una data nulla: il programma chiede il giorno.
 *
 * Il mese da solo («cedolini di settembre») NON è una data: è il periodo a cui
 * si riferisce il lavoro, non il giorno in cui è stato fatto.
 *
 * Funzione pura; le date sono testi AAAA-MM-GG e i calcoli sono in UTC sul
 * solo calendario, senza fuso: «oggi» lo decide chi chiama (nel fuso di Roma).
 */

import { minuscolaAllineata, valoreNumero } from './durata';

export interface Quando {
  /** AAAA-MM-GG, oppure null se l'espressione è vaga o nel futuro (si chiede). */
  data: string | null;
  inizio: number;
  fine: number;
  /** Espressione temporale riconosciuta ma non traducibile in un giorno preciso. */
  vaga?: boolean;
  /** Espressione nel futuro: non si registra. */
  futura?: boolean;
}

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GIORNI = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];

function daIso(iso: string): Date {
  const [a, m, g] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, g));
}
function aIso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
export function giorniPrima(oggi: string, n: number): string {
  const d = daIso(oggi);
  d.setUTCDate(d.getUTCDate() - n);
  return aIso(d);
}
function valida(a: number, m: number, g: number): boolean {
  if (m < 1 || m > 12 || g < 1 || g > 31) return false;
  const d = new Date(Date.UTC(a, m - 1, g));
  return d.getUTCMonth() === m - 1 && d.getUTCDate() === g;
}

/** Il giorno della settimana (0 = domenica … 6 = sabato) di una data AAAA-MM-GG. */
export function giornoSettimana(iso: string): number {
  return daIso(iso).getUTCDay();
}

/** La ricorrenza passata più recente di un giorno della settimana, oggi escluso. */
export function ultimoGiorno(oggi: string, giorno: number): string {
  const w = giornoSettimana(oggi);
  let diff = (w - giorno + 7) % 7;
  if (diff === 0) diff = 7;
  return giorniPrima(oggi, diff);
}

/** «Il 28» più recente non futuro (oggi compreso). */
export function ultimoGiornoDelMese(oggi: string, g: number): string | null {
  if (g < 1 || g > 31) return null;
  const d = daIso(oggi);
  for (let k = 0; k < 12; k++) {
    const a = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    if (valida(a, m, g)) {
      const cand = `${a}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
      if (cand <= oggi) return cand;
    }
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return null;
}

/** Giorno e mese (e anno facoltativo) → la data non futura più recente. */
export function dataCompleta(oggi: string, g: number, m: number, anno?: number): string | null | 'futura' {
  const a0 = anno ?? Number(oggi.slice(0, 4));
  if (!valida(a0, m, g)) return null;
  let cand = `${a0}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
  if (cand > oggi) {
    if (anno) return 'futura';
    if (!valida(a0 - 1, m, g)) return null;
    cand = `${a0 - 1}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
  }
  return cand;
}

type Trovata = Quando;
const B = `(?<![\\p{L}\\p{N}])`;
const E = `(?![\\p{L}\\p{N}])`;
const AP = `['’´\`]?`;
const PARTE = `(?: (?:mattina|mattino|pomeriggio|sera|notte))?`;

/** Tutte le espressioni di data del testo, in ordine, senza sovrapposizioni. */
export function estraiDate(testo: string, oggi: string): Quando[] {
  const t = minuscolaAllineata(testo);
  const trovate: Trovata[] = [];
  const push = (m: RegExpMatchArray, q: Omit<Quando, 'inizio' | 'fine'>) => trovate.push({ ...q, inizio: m.index!, fine: m.index! + m[0].length });

  // Vaghe e future (prima, così «ieri» dentro «l'altro ieri» non vince).
  for (const m of t.matchAll(new RegExp(`${B}(?:l${AP} ?altro ?ieri|avantieri|ieri l${AP} ?altro)${PARTE}${E}`, 'gu'))) push(m, { data: giorniPrima(oggi, 2) });
  for (const m of t.matchAll(new RegExp(`${B}(?:dopodomani|domani|(?:lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica) prossim[oa]|prossim[oa] (?:lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica|settimana))${PARTE}${E}`, 'gu'))) push(m, { data: null, futura: true });
  for (const m of t.matchAll(new RegExp(`${B}(?:la |nella |nell${AP} ?|in )?(?:settimana (?:scorsa|passata)|scorsa settimana|l${AP} ?altro giorno|qualche giorno fa|(?:un po${AP}|un paio) di giorni fa|giorni fa|tempo fa|(?:nei|negli) giorni scorsi|(?:nelle|nel corso delle) (?:ultime|scorse) settimane|negli ultimi giorni|(?:in )?quest[ei] (?:giorni|settimane)|questa settimana|ultimamente|(?:lo|la) scors[oa] (?:mese|settimana)|il mese scorso|un po${AP} di tempo fa|(?:nel|lo scorso|questo) (?:fine settimana|weekend|week end))${E}`, 'gu'))) {
    // «due giorni fa» e «una settimana fa» hanno un numero: li prende il blocco sotto.
    push(m, { data: null, vaga: true });
  }
  for (const m of t.matchAll(new RegExp(`${B}(\\d{1,2}|un[oa]?|due|tre|quattro|cinque|sei|sette|otto|nove|dieci) (giorn[oi]|settiman[ae]) fa${E}`, 'gu'))) {
    const n = valoreNumero(m[1] === 'una' || m[1] === 'uno' ? 'un' : m[1]);
    if (n == null) continue;
    push(m, { data: giorniPrima(oggi, m[2].startsWith('settiman') ? n * 7 : n) });
  }

  // Ieri, oggi.
  for (const m of t.matchAll(new RegExp(`${B}ieri${PARTE}${E}`, 'gu'))) push(m, { data: giorniPrima(oggi, 1) });
  for (const m of t.matchAll(new RegExp(`${B}(?:oggi${PARTE}|stamattina|stamane|stasera|stanotte|questa mattina|questo pomeriggio|questa sera|in giornata)${E}`, 'gu'))) push(m, { data: oggi });

  // Nome del giorno, con eventuale «scorso» e numero («martedì 29»).
  for (const m of t.matchAll(new RegExp(`${B}(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)(?: scors[oa]| passat[oa])?(?: (\\d{1,2})${E}(?! ?(?:ore|ora|h|minuti|min)${E}))?${PARTE}${E}`, 'gu'))) {
    const g = GIORNI.indexOf(m[1]);
    if (m[2]) {
      const n = Number(m[2]);
      const d = ultimoGiornoDelMese(oggi, n);
      push(m, { data: d });
    } else {
      push(m, { data: ultimoGiorno(oggi, g) });
    }
  }

  // Date complete: «28 settembre», «il 2 ottobre 2026», «primo ottobre», «1° ottobre», «02/10», «2/10/2026».
  const MESE = MESI.join('|');
  for (const m of t.matchAll(new RegExp(`${B}(?:il |lo scorso |in data |del |dal )?(?:(\\d{1,2})(?:°|º)?|primo|1°) (?:di )?(${MESE})(?: (\\d{4}))?${E}`, 'gu'))) {
    const g = m[1] ? Number(m[1]) : 1;
    const mese = MESI.indexOf(m[2]) + 1;
    const anno = m[3] ? Number(m[3]) : undefined;
    const d = dataCompleta(oggi, g, mese, anno);
    if (d === null) continue;
    push(m, d === 'futura' ? { data: null, futura: true } : { data: d });
  }
  for (const m of t.matchAll(new RegExp(`${B}(?:il |in data |del )?(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{4}|\\d{2}))?${E}(?! ?(?:ore|ora|h)${E})`, 'gu'))) {
    const g = Number(m[1]), mese = Number(m[2]);
    const anno = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : undefined;
    if (mese < 1 || mese > 12) continue;
    const d = dataCompleta(oggi, g, mese, anno);
    if (d === null) continue;
    push(m, d === 'futura' ? { data: null, futura: true } : { data: d });
  }

  // Solo il giorno del mese: «il 28», «il giorno 28», «il 5», «il trenta» (dettato).
  for (const m of t.matchAll(new RegExp(`${B}(?:il|giorno|il giorno|lo scorso) (\\d{1,2})${E}(?! ?(?:ore|ora|h|minuti|min|euro)${E})(?! ?[%€/])(?!\\.\\d)`, 'gu'))) {
    const d = ultimoGiornoDelMese(oggi, Number(m[1]));
    if (!d) continue;
    push(m, { data: d });
  }
  const GIORNO_LETTERE = 'primo|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|undici|dodici|tredici|quattordici|quindici|sedici|diciassette|diciotto|diciannove|venti|ventuno|ventidue|ventitre|ventiquattro|venticinque|ventisei|ventisette|ventotto|ventinove|trenta|trentuno';
  for (const m of t.matchAll(new RegExp(`${B}(?:il|giorno|il giorno|lo scorso) (${GIORNO_LETTERE})${E}(?! (?:ore|ora|minuti|giorni|settimane|volte|clienti|cedolini|fatture|pratiche)${E})(?: (?:di )?(${MESE}))?`, 'gu'))) {
    const g = m[1] === 'primo' ? 1 : valoreNumero(m[1]);
    if (g == null) continue;
    const d = m[2] ? dataCompleta(oggi, g, MESI.indexOf(m[2]) + 1) : ultimoGiornoDelMese(oggi, g);
    if (!d || d === 'futura') continue;
    push(m, { data: d });
  }

  trovate.sort((a, b) => a.inizio - b.inizio || b.fine - a.fine);
  const out: Quando[] = [];
  for (const q of trovate) {
    const ultima = out[out.length - 1];
    if (ultima && q.inizio < ultima.fine) continue;
    out.push(q);
  }
  return out;
}
