/**
 * Contify Timesheet — riconoscimento locale delle durate (TS-M1, passo 1).
 *
 * Capisce «2 ore», «2h», «1,5 ore», «un'ora e mezza», «mezz'ora», «tre quarti
 * d'ora», «90 minuti», «due ore e un quarto», «1h30», «dalle 9 alle 11», con i
 * numeri in cifre o in lettere. Espressioni contigue unite da «e» sono UNA
 * durata («2 ore e 20 minuti»); durate separate restano separate («2 ore … 1
 * ora»). Restituisce i minuti e la posizione nel testo originale, così il
 * resto del riconoscimento può ignorare quel tratto.
 *
 * Funzione pura, senza archivio.
 */

export interface Durata {
  minuti: number;
  /** Posizione nel testo originale (inizio incluso, fine esclusa). */
  inizio: number;
  fine: number;
}

/** Copia del testo con la stessa lunghezza, in minuscolo e senza accenti: le posizioni restano quelle dell'originale. */
export function minuscolaAllineata(testo: string): string {
  let out = '';
  for (const ch of testo) {
    const base = ch.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    out += base.length === 1 ? base : ch.toLowerCase().length === 1 ? ch.toLowerCase() : ch;
  }
  return out;
}

const UNITA: Record<string, number> = {
  un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10,
  undici: 11, dodici: 12, tredici: 13, quattordici: 14, quindici: 15, sedici: 16, diciassette: 17, diciotto: 18, diciannove: 19,
};
const DECINE: Record<string, number> = {
  venti: 20, trenta: 30, quaranta: 40, cinquanta: 50, sessanta: 60, settanta: 70, ottanta: 80, novanta: 90,
};

/** Valore di un numero scritto in cifre («2», «1,5», «45») o in lettere («due», «quarantacinque», «centoventi»); null se non è un numero. */
export function valoreNumero(parola: string): number | null {
  const p = parola.toLowerCase().replace(/\s+/g, '');
  if (/^\d{1,4}([.,]\d{1,2})?$/.test(p)) return Number(p.replace(',', '.'));
  if (p in UNITA) return UNITA[p];
  let resto = p;
  let totale = 0;
  const centinaia = /^(due|tre|quattro|cinque|sei|sette|otto|nove)?cento/.exec(resto);
  if (centinaia) {
    totale += (centinaia[1] ? UNITA[centinaia[1]] : 1) * 100;
    resto = resto.slice(centinaia[0].length);
    if (!resto) return totale;
  }
  if (resto in UNITA) return totale + UNITA[resto];
  for (const [d, v] of Object.entries(DECINE)) {
    if (resto === d) return totale + v;
    if (resto.startsWith(d)) {
      const coda = resto.slice(d.length);
      if (coda in UNITA && UNITA[coda] < 10) return totale + v + UNITA[coda];
      return null;
    }
    // Elisione della vocale finale: ventuno, ventotto, trentuno, quarantotto…
    const tronca = d.slice(0, -1);
    if (resto.startsWith(tronca)) {
      const coda = resto.slice(tronca.length);
      if (coda === 'uno' || coda === 'un') return totale + v + 1;
      if (coda === 'otto') return totale + v + 8;
    }
  }
  return null;
}

const NUM_PAROLE = [
  ...Object.keys(UNITA),
  ...Object.keys(DECINE).flatMap((d) => [d, ...Object.keys(UNITA).filter((u) => UNITA[u] < 10).map((u) => (u === 'uno' || u === 'otto' ? d.slice(0, -1) + u : d + u))]),
].sort((a, b) => b.length - a.length);
const NUM = `(?:\\d{1,3}(?:[.,]\\d{1,2})?|cento(?:${NUM_PAROLE.join('|')})?|${NUM_PAROLE.join('|')})`;
const ORE_U = `(?:ore|ora|orette|oretta|h)`;
const MIN_U = `(?:minuti|minuto|min|m)`;
const AP = `['’´\`]?`;
const B = `(?<![\\p{L}\\p{N}])`;
const E = `(?![\\p{L}\\p{N}])`;
const FRAZIONE = `(?:(mezza|mezzo)|(tre quarti)|(un quarto|quarto)|(${NUM})(?: ?${MIN_U}${E})?)`;

type Trovata = { inizio: number; fine: number; minuti: number };

function minutiDa(m: number, h: number | null, fraz: { mezza?: string; treQuarti?: string; quarto?: string; num?: string }): number | null {
  let tot = 0;
  if (h != null) tot += h * 60;
  if (fraz.mezza) tot += 30;
  else if (fraz.treQuarti) tot += 45;
  else if (fraz.quarto) tot += 15;
  else if (fraz.num) {
    const v = valoreNumero(fraz.num);
    if (v == null || v >= 60 || !Number.isInteger(v)) return null;
    tot += v;
  }
  tot += m;
  return tot;
}

const ORA_PAROLE = ['mezzogiorno', 'mezzanotte', 'una', ...Object.keys(UNITA).filter((u) => UNITA[u] >= 2 && UNITA[u] <= 19), 'venti', 'ventuno', 'ventidue', 'ventitre', 'ventiquattro'].sort((a, b) => b.length - a.length);
const ORA = `(\\d{1,2}|${ORA_PAROLE.join('|')})(?:[.:,](\\d{2}))?(?: e (mezza|mezzo|un quarto|tre quarti|\\d{1,2}))?`;

function oraInMinuti(h: string, mm: string | undefined, fraz: string | undefined): number | null {
  let ore: number | null;
  if (/^\d+$/.test(h)) ore = Number(h);
  else if (h === 'mezzogiorno') ore = 12;
  else if (h === 'mezzanotte') ore = 0;
  else ore = valoreNumero(h);
  if (ore == null || ore > 24) return null;
  let tot = ore * 60;
  if (mm) {
    const v = Number(mm);
    if (v >= 60) return null;
    tot += v;
  } else if (fraz) {
    if (fraz === 'mezza' || fraz === 'mezzo') tot += 30;
    else if (fraz === 'un quarto') tot += 15;
    else if (fraz === 'tre quarti') tot += 45;
    else {
      const v = Number(fraz);
      if (v >= 60) return null;
      tot += v;
    }
  }
  return tot;
}

/** Tutte le durate del testo, in ordine, senza sovrapposizioni. */
export function estraiDurate(testo: string): Durata[] {
  const t = minuscolaAllineata(testo);
  const trovate: Trovata[] = [];
  const aggiungi = (inizio: number, fine: number, minuti: number | null) => {
    if (minuti == null || !Number.isFinite(minuti)) return;
    const m = Math.round(minuti);
    if (m <= 0 || m > 1440) return;
    trovate.push({ inizio, fine, minuti: m });
  };

  // 1. Intervallo orario: «dalle 9 alle 11», «dalle 9.30 alle 11:15», «dalle due alle quattro e mezza».
  for (const m of t.matchAll(new RegExp(`${B}dall[ea] ${ORA} (?:alle|a|fino alle|fino a) ${ORA}${E}`, 'gu'))) {
    const da = oraInMinuti(m[1], m[2], m[3]);
    let a = oraInMinuti(m[4], m[5], m[6]);
    if (da == null || a == null) continue;
    while (a <= da) a += 12 * 60;
    aggiungi(m.index!, m.index! + m[0].length, a - da);
  }

  // 2. Ore con eventuale coda: «2 ore», «un'ora e mezza», «due ore e un quarto», «2 ore e 20 minuti», «1,5 ore», «un paio d'ore».
  const paio = `(?:un )?paio (?:d${AP} ?|di )or(?:e|ette)`;
  for (const m of t.matchAll(new RegExp(`${B}(?:(${paio})|(${NUM})${AP} ?${ORE_U}${E}(?: e ${FRAZIONE}(?! ?${ORE_U}${E}))?)`, 'gu'))) {
    if (m[1]) { aggiungi(m.index!, m.index! + m[0].length, 120); continue; }
    const h = valoreNumero(m[2]!);
    if (h == null) continue;
    const minuti = minutiDa(0, h, { mezza: m[3], treQuarti: m[4], quarto: m[5], num: m[6] });
    aggiungi(m.index!, m.index! + m[0].length, minuti);
  }

  // 3. Notazione compatta: «1h30», «1 h 30», «2h15», «1:30» (non preceduta da «alle»: gli intervalli sono già presi).
  for (const m of t.matchAll(new RegExp(`${B}(\\d{1,2}) ?h ?(\\d{1,2})${E}`, 'gu'))) {
    const mm = Number(m[2]);
    if (mm >= 60) continue;
    aggiungi(m.index!, m.index! + m[0].length, Number(m[1]) * 60 + mm);
  }
  for (const m of t.matchAll(new RegExp(`(?<!(?:alle|dalle|ore|verso) )${B}(\\d{1,2}):(\\d{2})${E}`, 'gu'))) {
    const mm = Number(m[2]);
    if (mm >= 60) continue;
    aggiungi(m.index!, m.index! + m[0].length, Number(m[1]) * 60 + mm);
  }

  // 4. Minuti: «45 minuti», «quaranta minuti», «20 min», «45'».
  for (const m of t.matchAll(new RegExp(`${B}(${NUM}) ?${MIN_U}${E}`, 'gu'))) {
    const v = valoreNumero(m[1]);
    if (v == null || !Number.isInteger(v)) continue;
    aggiungi(m.index!, m.index! + m[0].length, v);
  }
  for (const m of t.matchAll(new RegExp(`${B}(\\d{1,3})['’](?![\\p{L}])`, 'gu'))) {
    aggiungi(m.index!, m.index! + m[0].length, Number(m[1]));
  }

  // 5. Frazioni d'ora da sole: «mezz'ora», «una mezz'oretta», «un quarto d'ora», «tre quarti d'ora», «un'oretta».
  for (const m of t.matchAll(new RegExp(`${B}(?:una |un )?(?:(mezz${AP} ?or(?:a|etta)|mezzora|mezzoretta|mezza ora)|(tre quarti d${AP} ?ora)|(quarto d${AP} ?ora))${E}`, 'gu'))) {
    aggiungi(m.index!, m.index! + m[0].length, m[1] ? 30 : m[2] ? 45 : 15);
  }

  // Senza sovrapposizioni: a parità di inizio vince la più lunga.
  trovate.sort((a, b) => a.inizio - b.inizio || b.fine - a.fine);
  const out: Durata[] = [];
  for (const d of trovate) {
    const ultima = out[out.length - 1];
    if (ultima && d.inizio < ultima.fine) continue;
    out.push({ minuti: d.minuti, inizio: d.inizio, fine: d.fine });
  }
  return out;
}

/** Parole che dicono «la stessa durata per ognuno»: con una durata e più clienti vale per tutti. */
export function duraPerCiascuno(testo: string): boolean {
  return /\b(ciascun[oa]|ognun[oa]|a testa|per uno|l[’']un[oa]|entramb[ie]|tutt[ie] e (?:due|tre|quattro))\b/u.test(minuscolaAllineata(testo));
}
