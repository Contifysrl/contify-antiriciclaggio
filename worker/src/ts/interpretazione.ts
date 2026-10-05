/**
 * Contify Timesheet — interpretazione di una frase (TS-M1, M1.3, passo 1: locale).
 *
 * Riceve il testo e il contesto dello studio (clienti, servizi, oggi) e
 * restituisce PROPOSTE di registrazione: cliente, servizio, minuti, data,
 * nota. Nessun effetto sull'archivio: si prova senza server.
 *
 * Un identificativo è valorizzato SOLO se certo. Una proposta è completa
 * quando ha cliente, servizio e minuti; per le incomplete il browser fa una
 * domanda per volta con i candidati come pulsanti.
 *
 * Regole della specifica (M1.3) realizzate qui:
 * - durate: espressioni contigue unite da «e» sono una durata; più durate
 *   separate, ognuna con il suo cliente o servizio, sono più proposte; due
 *   clienti e una sola durata → una proposta per cliente con minuti mancanti
 *   (salvo «ciascuno»);
 * - data: oggi se non detta; mai nel futuro (si chiede);
 * - cliente certo solo se il punteggio supera SOGLIA_CERTO e stacca il
 *   secondo di almeno STACCO_MINIMO; due clienti che differiscono solo per la
 *   forma giuridica non sono mai certi;
 * - servizio certo solo se ne emerge uno solo; il generico non si assegna mai.
 *
 * In più, per i nomi di terzi nel testo libero («cedolino di Mario Bianchi per
 * Omega»): le menzioni deboli (nomi di battesimo accostati, elenchi di persone,
 * nomi preceduti da un titolo) non diventano mai clienti certi quando c'è una
 * menzione forte, e non generano registrazioni in più.
 */

import { duraPerCiascuno, estraiDurate, type Durata } from './durata';
import { estraiDate, type Quando } from './quando';
import {
  FATTORE_DEBOLE, indiceClienti, parolaVuota, riconosciClienti, riconosciServizi,
  type ClienteRic, type MatchCliente, type ServizioRic,
} from './riconoscitore';
import { NOMI_DI_BATTESIMO, parole, type Parola } from './testo';

/** Soglie del riconoscimento del cliente (valori di partenza della specifica, confermati nel passo 0). */
export const SOGLIA_CERTO = 0.86;
export const STACCO_MINIMO = 0.10;
/** Sotto questo punteggio un cliente non compare nemmeno fra i candidati. */
export const SOGLIA_CANDIDATO = 0.4;
export const MAX_CANDIDATI = 4;

export interface Contesto {
  clienti: ClienteRic[];
  servizi: ServizioRic[];
  /** Data di oggi nel fuso di Roma, AAAA-MM-GG. */
  oggi: string;
}

export interface Candidato { id: string; nome: string }

export interface Proposta {
  cliente: { id: string | null; candidati: Candidato[] };
  servizio: { id: string | null; candidati: Candidato[] };
  minuti: number | null;
  /** AAAA-MM-GG; null quando il giorno va chiesto (espressione vaga o futura). */
  data: string | null;
  nota: string | null;
  motore: 'LOCALE' | 'AI';
}

/** Una menzione di cliente nel testo: un gruppo di parole con i clienti che vi somigliano. */
interface Menzione {
  parole: number[];
  da: number;
  a: number;
  /** Ordinati per punteggio decrescente. */
  clienti: MatchCliente[];
  certo: string | null;
  /** Terzo: preceduto da un titolo o ruolo di persona, con un'altra menzione certa nella frase. */
  terzo?: boolean;
}

const SEPARATORI = /,|;|\+|&|\be poi\b|\bpoi\b|\bed\b|\be\b|\binoltre\b|\bmentre\b|\binvece\b|\bdopo\b|\bpiu\b|\boltre a\b|\binsieme a\b/g;
const PAROLE_SEPARATRICI = new Set(['e', 'ed', 'poi', 'inoltre', 'mentre', 'invece', 'dopo', 'piu', 'oltre', 'insieme', 'a', 'anche', 'pure']);
const TITOLI_PERSONA = new Set([
  'dott', 'dottssa', 'dottore', 'dottoressa', 'dr', 'sig', 'sigra', 'signor', 'signora', 'signore', 'avv', 'avvocato', 'avvocata',
  'ing', 'ingegnere', 'ingegnera', 'rag', 'ragioniere', 'ragioniera', 'geom', 'geometra', 'arch', 'architetto', 'architetta',
  'prof', 'professore', 'professoressa', 'dipendente', 'collaboratore', 'collaboratrice', 'collega', 'socio', 'socia',
  'amministratore', 'amministratrice', 'titolare', 'legale', 'rappresentante', 'commercialista', 'consulente', 'notaio',
  'fornitore', 'controparte', 'contabile', 'segretaria', 'segretario', 'operaio', 'operaia', 'impiegato', 'impiegata',
]);

function nomeCliente(ctx: Contesto, id: string): string {
  return ctx.clienti.find((c) => c.id === id)?.nome ?? id;
}

/** Indici delle parole che cadono dentro intervalli di caratteri (durate, date). */
function paroleIn(ps: Parola[], spans: Array<{ inizio: number; fine: number }>): Set<number> {
  const s = new Set<number>();
  for (const p of ps) for (const sp of spans) if (p.inizio >= sp.inizio && p.fine <= sp.fine) { s.add(p.i); break; }
  return s;
}

/** Raggruppa i riconoscimenti per menzione (parole del testo in comune o adiacenti). */
function menzioni(matches: MatchCliente[], ps: Parola[]): Menzione[] {
  const gruppi: Menzione[] = [];
  for (const m of matches) {
    const mi = new Set(m.parole);
    let g = gruppi.find((x) => x.parole.some((i) => mi.has(i)));
    if (!g) {
      g = { parole: [...m.parole], da: 0, a: 0, clienti: [], certo: null };
      gruppi.push(g);
    } else {
      g.parole = [...new Set([...g.parole, ...m.parole])].sort((a, b) => a - b);
    }
    g.clienti.push(m);
  }
  for (const g of gruppi) {
    g.clienti.sort((a, b) => b.punteggio - a.punteggio);
    // Un cliente conta una volta sola per menzione (il suo pezzo migliore).
    const visti = new Set<string>();
    g.clienti = g.clienti.filter((c) => (visti.has(c.id) ? false : (visti.add(c.id), true)));
    g.da = ps[g.parole[0]].inizio;
    g.a = ps[g.parole[g.parole.length - 1]].fine;
  }
  return gruppi.sort((a, b) => a.da - b.da);
}

function decidiCerto(g: Menzione): void {
  const [primo, secondo] = g.clienti;
  g.certo = primo && primo.punteggio >= SOGLIA_CERTO && (!secondo || primo.punteggio - secondo.punteggio >= STACCO_MINIMO) ? primo.id : null;
}

/** Parola precedente non vuota (salta articoli, «e», virgole). */
function parolaPrima(ps: Parola[], i: number, salta: (t: string) => boolean): Parola | null {
  for (let k = i - 1; k >= 0 && k >= i - 3; k--) {
    if (salta(ps[k].t)) continue;
    return ps[k];
  }
  return null;
}

/**
 * Indebolisce le menzioni che somigliano a nomi di terzi:
 *  (a) due parole adiacenti che corrispondono a clienti diversi, in modo
 *      parziale, e almeno una è un nome di battesimo («Mario Bianchi»);
 *  (b) una parola che sta in un elenco («Rossi, Bianchi e Verdi») dove un
 *      altro elemento non corrisponde a nessun cliente;
 *  (c) una menzione preceduta da un titolo o ruolo di persona, quando nella
 *      frase c'è un'altra menzione certa.
 */
function indebolisci(gruppi: Menzione[], ps: Parola[], escluse: Set<number>, servizioParole: Set<number>, personeFisiche: Set<string>): void {
  const singole = gruppi.filter((g) => g.parole.length === 1 && g.clienti[0] && g.clienti[0].copertura < 1 && !g.clienti[0].alias);
  const paroleMenzionate = new Set(gruppi.flatMap((g) => g.parole));
  const vicina = (a: Menzione, b: Menzione) => {
    const [x, y] = a.parole[0] < b.parole[0] ? [a.parole[0], b.parole[0]] : [b.parole[0], a.parole[0]];
    for (let k = x + 1; k < y; k++) if (!PAROLE_SEPARATRICI.has(ps[k].t) || ps[k].t === 'a') return false;
    return y - x <= 2;
  };
  const deboli = new Set<Menzione>();
  for (const g of singole) {
    const t = ps[g.parole[0]].t;
    for (const h of singole) {
      if (h === g || !vicina(g, h)) continue;
      if (g.clienti[0].id === h.clienti[0].id) continue;
      if (NOMI_DI_BATTESIMO.has(t) || NOMI_DI_BATTESIMO.has(ps[h.parole[0]].t)) { deboli.add(g); deboli.add(h); }
    }
    // (b) elenco con un elemento sconosciuto.
    const i = g.parole[0];
    for (const dir of [-1, 1]) {
      let k = i + dir;
      if (k < 0 || k >= ps.length) continue;
      if (!PAROLE_SEPARATRICI.has(ps[k].t)) continue;
      k += dir;
      if (k < 0 || k >= ps.length) continue;
      const w = ps[k];
      if (!escluse.has(w.i) && !servizioParole.has(w.i) && !paroleMenzionate.has(w.i) && !parolaVuota(w.t) && w.t.length >= 4) deboli.add(g);
    }
  }
  for (const g of deboli) {
    g.clienti = g.clienti.map((c) => ({ ...c, punteggio: c.punteggio * FATTORE_DEBOLE, debole: true })).sort((a, b) => b.punteggio - a.punteggio);
  }
  for (const g of gruppi) decidiCerto(g);
  // (c) titolo o ruolo di persona davanti, oppure una parola che introduce una persona del cliente
  //     («cedolino di», «assunzione del nuovo magazziniere»), con un'altra menzione certa nella frase.
  const certe = gruppi.filter((g) => g.certo);
  if (certe.length >= 2) {
    for (const g of certe) {
      const prima = parolaPrima(ps, g.parole[0], (t) => t === 'il' || t === 'la' || t === 'lo' || t === 'l' || t === 'del' || t === 'della' || t === 'dei' || t === 'di');
      if (prima && TITOLI_PERSONA.has(prima.t)) { g.terzo = true; g.certo = null; continue; }
      // Solo per le persone fisiche: una società non è mai il dipendente di qualcuno.
      if (!g.certo || !personeFisiche.has(g.certo)) continue;
      const i0 = g.parole[0];
      for (let k = i0 - 1; k >= 0 && k >= i0 - 5; k--) {
        const t = ps[k].t;
        if (parolaVuota(t) || NOMI_DI_BATTESIMO.has(t) || ['nuovo', 'nuova', 'ex', 'futuro', 'futura'].includes(t)) continue;
        if (INTRODUCONO_PERSONA.test(t)) { g.terzo = true; g.certo = null; }
        break;
      }
    }
    if (!gruppi.some((g) => g.certo)) for (const g of certe) { g.terzo = false; decidiCerto(g); }
  }
}

interface Segmento {
  da: number;
  a: number;
  durata: Durata | null;
  menzione: Menzione | null;
}

/** Posizione in cui tagliare fra due durate (vedi commento in testa al file). */
function tagliaFra(testo: string, d1: Durata, d2: Durata, menz: Menzione[], schemaCD: boolean): number {
  const tra = testo.slice(d1.fine, d2.inizio);
  const seps: Array<{ pos: number; fine: number }> = [];
  for (const m of tra.matchAll(SEPARATORI)) seps.push({ pos: d1.fine + m.index!, fine: d1.fine + m.index! + m[0].length });
  const dentro = menz.filter((g) => g.da >= d1.fine && g.a <= d2.inizio);
  if (!dentro.length) return seps.length ? seps[0].pos : d2.inizio;
  const g = dentro[0];
  const primaDellaMenzione = testo.slice(d1.fine, g.da);
  const separatoreSubitoPrima = /(?:,|;|\+|&|\be\b|\bed\b|\bpoi\b)\s*$/u.test(primaDellaMenzione.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const aDestra = separatoreSubitoPrima || schemaCD;
  if (aDestra) {
    const prima = seps.filter((s) => s.fine <= g.da);
    return prima.length ? prima[prima.length - 1].pos : g.da;
  }
  const dopo = seps.filter((s) => s.pos >= g.a);
  return dopo.length ? dopo[0].pos : d2.inizio;
}

const ARTICOLI = new Set(['il', 'lo', 'la', 'i', 'gli', 'le', 'l', 'un', 'una', 'uno']);
/** Parole che possono stare fra due nomi di un elenco senza spezzarlo: articoli e forme giuridiche (non le preposizioni). */
const AMMESSE_IN_ELENCO = new Set([...ARTICOLI, 'srl', 'srls', 'spa', 'snc', 'sas', 'ss', 'sapa', 'scarl', 'scrl', 'coop', 'societa', 'semplice', 'unipersonale', 'liquidazione', 'in', 'c', 'co']);
/** Un nome che segue una di queste parole (entro tre) è una persona del cliente, non il cliente: «cedolino di Mario Bianchi», «assunzione del nuovo magazziniere Marco Rossi». */
const INTRODUCONO_PERSONA = /^(cedolin|busta|buste|paga|paghe|assunzion|licenziament|dimission|malattia|maternita|infortunio|tfr|contratto|pratica|dipendent|collaborator|socio|soci|stagist|apprendist|operai|impiegat|magazzinier|autist|commess|cuoc|camerier|badante|colf|lavorator|erede|eredi|figli|moglie|marito|coniuge|fratell|sorell|padre|madre|avvocat|notai|consulent|commercialist|controparte|fornitor|debitor|creditor)/;

/**
 * Vero se due menzioni formano un elenco («Omega e Beta», «Omega, Beta»): fra
 * loro solo un separatore (virgola, «e», «poi») ed eventuali articoli. «Omega
 * per Beta» o «Ferrari per Gamma» non sono elenchi.
 */
function coordinate(testo: string, ps: Parola[], escluse: Set<number>, servizioParole: Set<number>, g1: Menzione, g2: Menzione): boolean {
  const da = g1.parole[g1.parole.length - 1], a = g2.parole[0];
  let separatore = /[,;+&]/.test(testo.slice(ps[da].fine, ps[a].inizio));
  for (let k = da + 1; k < a; k++) {
    const t = ps[k].t;
    if (escluse.has(k) || servizioParole.has(k)) return false;
    if (PAROLE_SEPARATRICI.has(t) && t !== 'a') { separatore = true; continue; }
    if (AMMESSE_IN_ELENCO.has(t) || t.length < 2) continue;
    return false;
  }
  return separatore;
}

const SEQUENZA = /;|\be poi\b|\bpoi\b|\bdopo\b|\binoltre\b|\be anche\b|\bmentre\b|\binvece\b/g;
const CORREZIONE = /^[\s,.;:]*(?:no[\s,]+anzi|anzi|no[\s,]+no|no[\s,]+scusa|scusa|scusate|cioe|volevo dire|correggo|pardon|ops|ehm|no)[\s,.;:]*$/u;

/**
 * Nel parlato ci si corregge: «un'ora no anzi un'ora e mezza». Se fra due
 * durate c'è solo un segno di correzione, vale la seconda.
 */
function senzaCorrezioni(testo: string, durate: Durata[]): Durata[] {
  const out: Durata[] = [];
  for (let i = 0; i < durate.length; i++) {
    const prossima = durate[i + 1];
    if (prossima) {
      const tra = testo.slice(durate[i].fine, prossima.inizio).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (CORREZIONE.test(tra)) continue;
    }
    out.push(durate[i]);
  }
  return out;
}

/**
 * Punti di taglio fra servizi diversi separati da un segno di sequenza («e poi»,
 * «dopo», «;»). Vuoto se i servizi sono solo elencati («bilancio e fatture»):
 * in quel caso è un lavoro solo con il servizio da chiedere.
 */
function tagliSequenza(testo: string, ps: Parola[], servizi: Array<{ id: string; parole: number[] }>): number[] {
  if (servizi.length < 2) return [];
  const ordinati = [...servizi].sort((a, b) => a.parole[0] - b.parole[0]);
  const tagli: number[] = [];
  for (let i = 1; i < ordinati.length; i++) {
    const fine = ps[ordinati[i - 1].parole[ordinati[i - 1].parole.length - 1]].fine;
    const inizio = ps[ordinati[i].parole[0]].inizio;
    const tra = testo.slice(fine, inizio).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const m = new RegExp(SEQUENZA.source, 'u').exec(tra);
    if (!m) return [];
    tagli.push(fine + m.index);
  }
  return tagli;
}

function candidatiDi(ctx: Contesto, g: Menzione | null): Candidato[] {
  if (!g) return [];
  return g.clienti.filter((c) => c.punteggio >= SOGLIA_CANDIDATO).slice(0, MAX_CANDIDATI).map((c) => ({ id: c.id, nome: nomeCliente(ctx, c.id) }));
}

/** Il testo non consumato di un tratto, pulito: diventa la nota. */
function notaDa(testo: string, ps: Parola[], da: number, a: number, consumate: Set<number>): string | null {
  const frammenti: string[] = [];
  let corrente: Parola[] = [];
  const chiudi = () => {
    const utili = corrente.filter((p) => !parolaVuota(p.t));
    if (utili.length) frammenti.push(testo.slice(corrente[0].inizio, corrente[corrente.length - 1].fine));
    corrente = [];
  };
  for (const p of ps) {
    if (p.inizio < da || p.fine > a) continue;
    if (consumate.has(p.i)) { chiudi(); continue; }
    if (corrente.length && /[,;:()!?]/.test(testo.slice(corrente[corrente.length - 1].fine, p.inizio))) chiudi();
    corrente.push(p);
  }
  chiudi();
  const puliti = frammenti
    .map((f) => f.replace(/^(?:ho|hai|ha|abbiamo|e|ed|poi|per|di|del|della|dei|con|a|al|alla|su|sul|sulla|il|la|lo|le|i|gli|un|una|uno|che|da|dal|dalla|in|nel|nella)\s+/i, '').replace(/\s+(?:per|di|del|della|dei|con|a|al|alla|su|sul|sulla|e|ed|il|la|lo|le|i|gli|un|una|uno|da|in)$/i, '').trim())
    .filter((f) => f && parole(f).some((p) => !parolaVuota(p.t)));
  if (!puliti.length) return null;
  const nota = puliti.join(', ');
  return nota.length > 500 ? nota.slice(0, 500) : nota;
}

/**
 * Passo 1: interpretazione locale. Restituisce una o più proposte; il
 * chiamante (il server) applica eventualmente il passo 2 (AI) alle incomplete.
 */
export function interpretaLocale(testo: string, ctx: Contesto): Proposta[] {
  const t = testo.trim();
  const ps = parole(t);
  const durate = senzaCorrezioni(t, estraiDurate(t));
  const date = estraiDate(t, ctx.oggi);
  const escluse = paroleIn(ps, [...durate, ...date]);
  const ciascuno = duraPerCiascuno(t);
  const indice = indiceClienti(ctx.clienti);

  const servizi = riconosciServizi(ps, escluse, ctx.servizi);
  const servizioParole = new Set(servizi.flatMap((s) => s.parole));
  // Le parole che hanno acceso un servizio non possono essere anche il nome di un cliente
  // («liquidazione» in «Theta Srl in liquidazione» non c'è: le forme sono tolte dai nomi).
  const matches = riconosciClienti(ps, new Set([...escluse, ...servizioParole]), indice).filter((m) => m.punteggio >= SOGLIA_CANDIDATO * 0.5);
  const gruppi = menzioni(matches, ps);
  indebolisci(gruppi, ps, escluse, servizioParole, new Set(ctx.clienti.filter((c) => c.pf).map((c) => c.id)));

  const certe = gruppi.filter((g) => g.certo);
  const ambigue = gruppi.filter((g) => !g.certo && !g.terzo && g.clienti[0] && g.clienti[0].punteggio >= SOGLIA_CANDIDATO);

  // ── Segmentazione ──
  const segmenti: Segmento[] = [];
  let durataInCoda = false;
  const primaDurata = durate[0];
  const primaMenzione = certe[0] ?? ambigue[0];
  const schemaCD = !!primaDurata && !!primaMenzione && primaMenzione.da < primaDurata.inizio;

  const dateCoordinate = date.length >= 2 && durate.length <= 1 && certe.length <= 1 && date.every((d, i) => i === 0 || /^[\s,]*(?:e|ed|poi)?[\s,]*$/u.test(t.slice(date[i - 1].fine, d.inizio).toLowerCase()));

  if (durate.length >= 2) {
    let da = 0;
    for (let k = 0; k < durate.length; k++) {
      const a = k + 1 < durate.length ? tagliaFra(t, durate[k], durate[k + 1], gruppi, schemaCD) : t.length;
      segmenti.push({ da, a, durata: durate[k], menzione: null });
      da = a;
    }
  } else if (certe.length >= 2 && !dateCoordinate) {
    // Più clienti: o un elenco («Omega e Beta», stessa registrazione ripetuta) o lavori distinti separati da «e»/virgola.
    const coord = certe.every((g, i) => i === 0 || coordinate(t, ps, escluse, servizioParole, certe[i - 1], g));
    if (coord) {
      for (const g of certe) segmenti.push({ da: 0, a: t.length, durata: null, menzione: g });
    } else {
      let da = 0;
      let separate = true;
      const tagli: number[] = [];
      for (let i = 1; i < certe.length; i++) {
        const tra = t.slice(certe[i - 1].a, certe[i].da);
        const seps = [...tra.matchAll(SEPARATORI)];
        if (!seps.length) { separate = false; break; }
        tagli.push(certe[i - 1].a + seps[seps.length - 1].index!);
      }
      if (separate) {
        for (const taglio of tagli) { segmenti.push({ da, a: taglio, durata: null, menzione: null }); da = taglio; }
        segmenti.push({ da, a: t.length, durata: null, menzione: null });
        // Una sola durata in coda a più lavori («contabilità Omega e bilancio Beta, 2 ore») è un totale: si chiede a ciascuno.
        if (durate.length === 1 && durate[0].inizio >= segmenti[segmenti.length - 1].da && segmenti.length > 1) durataInCoda = true;
      } else {
        // Nessun separatore fra due menzioni certe: è un lavoro solo e una delle due è un terzo.
        // Vince quella preceduta da «per»/«a»/«su»/«con»/«cliente»; altrimenti si chiede.
        const conCue = certe.filter((g) => {
          const prima = parolaPrima(ps, g.parole[0], (x) => x === 'il' || x === 'la' || x === 'lo' || x === 'l' || x === 'i' || x === 'gli' || x === 'le');
          return prima && ['per', 'x', 'su', 'con', 'cliente', 'a', 'al', 'alla', 'allo'].includes(prima.t);
        });
        if (conCue.length === 1) {
          for (const g of certe) if (g !== conCue[0]) { g.certo = null; g.terzo = true; }
        } else {
          for (const g of certe) g.certo = null;
          // Diventano una sola menzione ambigua con tutti i candidati.
          const unica: Menzione = { parole: certe.flatMap((g) => g.parole).sort((a, b) => a - b), da: certe[0].da, a: certe[certe.length - 1].a, clienti: certe.flatMap((g) => g.clienti).sort((a, b) => b.punteggio - a.punteggio), certo: null };
          ambigue.length = 0;
          ambigue.push(unica);
          for (const g of certe) g.terzo = true;
        }
        segmenti.push({ da: 0, a: t.length, durata: durate[0] ?? null, menzione: null });
      }
    }
  } else if (durate.length <= 1 && !dateCoordinate && tagliSequenza(t, ps, servizi).length) {
    // Un cliente, più lavori in sequenza («riunione con X e poi 2 ore di 730 per lei»).
    let da = 0;
    for (const taglio of tagliSequenza(t, ps, servizi)) { segmenti.push({ da, a: taglio, durata: null, menzione: null }); da = taglio; }
    segmenti.push({ da, a: t.length, durata: null, menzione: null });
  } else if (dateCoordinate) {
    for (const d of date) segmenti.push({ da: d.inizio, a: d.fine, durata: null, menzione: null });
  } else {
    segmenti.push({ da: 0, a: t.length, durata: durate[0] ?? null, menzione: null });
  }

  const certeValide = gruppi.filter((g) => g.certo);
  const unicaCerta = certeValide.length === 1 ? certeValide[0] : null;
  const unicoServizio = servizi.length === 1 ? servizi[0] : null;
  const unicaData = date.length === 1 ? date[0] : null;
  const consumateBase = new Set<number>([...escluse, ...servizioParole, ...gruppi.filter((g) => g.certo || g.terzo || ambigue.includes(g)).flatMap((g) => g.parole)]);

  const proposte: Proposta[] = [];
  const dentro = (x: { da: number; a: number } | { inizio: number; fine: number }, s: Segmento) => {
    const da = 'da' in x ? x.da : x.inizio, a = 'a' in x ? x.a : x.fine;
    return da >= s.da && a <= s.a;
  };
  const dataDi = (q: Quando | undefined): string | null => (q ? q.data : ctx.oggi);

  for (const s of segmenti) {
    // Cliente.
    let menz = s.menzione ?? certeValide.find((g) => dentro(g, s)) ?? null;
    let clienteId: string | null = menz?.certo ?? null;
    let candidati: Candidato[] = [];
    if (!clienteId) {
      const amb = ambigue.find((g) => dentro(g, s));
      if (amb && !certeValide.some((g) => dentro(g, s))) {
        menz = amb;
        candidati = candidatiDi(ctx, amb);
      } else if (unicaCerta && segmenti.length > 1) {
        clienteId = unicaCerta.certo;
        menz = unicaCerta;
      } else if (!certeValide.length && ambigue.length && segmenti.length === 1) {
        menz = ambigue[0];
        candidati = candidatiDi(ctx, ambigue[0]);
      }
    }
    // Servizio.
    const nelSegmento = servizi.filter((sv) => sv.parole.some((i) => dentro(ps[i], s)));
    let servizioId: string | null = null;
    let servCandidati: Candidato[] = [];
    const scelta = nelSegmento.length ? nelSegmento : segmenti.length > 1 && unicoServizio ? [unicoServizio] : [];
    if (scelta.length === 1) servizioId = scelta[0].id;
    else if (scelta.length > 1) servCandidati = scelta.map((sv) => ({ id: sv.id, nome: ctx.servizi.find((x) => x.id === sv.id)?.nome ?? sv.id }));
    // Minuti.
    let minuti: number | null = null;
    if (durataInCoda) minuti = ciascuno ? durate[0].minuti : null;
    else if (s.durata && dentro(s.durata, s)) minuti = s.durata.minuti;
    else if (s.menzione) minuti = ciascuno && durate.length === 1 ? durate[0].minuti : null;
    else if (dateCoordinate) minuti = ciascuno && durate.length === 1 ? durate[0].minuti : null;
    else {
      const d = durate.find((x) => dentro(x, s));
      if (d) minuti = d.minuti;
    }
    // Data: quella del tratto; altrimenti, se la frase ne ha una sola ed è all'inizio («Ieri 2 ore per X e 1 ora per Y»),
    // vale per tutti i tratti. Una data detta in un tratto successivo non torna indietro.
    const ereditabile = unicaData && segmenti.length > 1 && dentro(unicaData, segmenti[0]) ? unicaData : undefined;
    const q = dateCoordinate ? date.find((x) => x.inizio === s.da) : date.find((x) => dentro(x, s)) ?? ereditabile;
    const data = dataDi(q);
    // Nota.
    const consumate = new Set(consumateBase);
    const nota = s.menzione || dateCoordinate ? null : notaDa(t, ps, s.da, s.a, consumate);

    proposte.push({
      cliente: { id: clienteId, candidati: clienteId ? [] : candidati },
      servizio: { id: servizioId, candidati: servizioId ? [] : servCandidati },
      minuti,
      data,
      nota,
      motore: 'LOCALE',
    });
  }
  return proposte;
}

/** Vero se la proposta ha tutto ciò che serve per essere salvata. */
export function completa(p: Proposta): boolean {
  return !!p.cliente.id && !!p.servizio.id && p.minuti != null && !!p.data;
}

/**
 * Risposta scritta a una domanda: il browser rimanda le proposte incomplete e
 * il nuovo testo. Si interpreta il testo da solo e si usa ciò che ne esce per
 * riempire i campi mancanti della prima proposta incompleta; se la risposta
 * contiene un lavoro nuovo e completo, si aggiunge in coda.
 */
export function completaInSospeso(inSospeso: Proposta[], testo: string, ctx: Contesto): Proposta[] {
  const nuove = interpretaLocale(testo, ctx);
  const out = inSospeso.map((p) => ({ ...p, cliente: { ...p.cliente }, servizio: { ...p.servizio } }));
  const prima = out.find((p) => !completa(p));
  if (!prima || !nuove.length) return nuove.length ? [...out, ...nuove] : out;
  const n = nuove[0];
  let usata = false;
  if (!prima.cliente.id && (n.cliente.id || n.cliente.candidati.length)) {
    prima.cliente = n.cliente.id ? { id: n.cliente.id, candidati: [] } : { id: null, candidati: n.cliente.candidati };
    usata = true;
  }
  if (!prima.servizio.id && (n.servizio.id || n.servizio.candidati.length)) {
    prima.servizio = n.servizio.id ? { id: n.servizio.id, candidati: [] } : { id: null, candidati: n.servizio.candidati };
    usata = true;
  }
  if (prima.minuti == null && n.minuti != null) { prima.minuti = n.minuti; usata = true; }
  if (!prima.data && n.data && testo.trim() !== '') {
    // Una data vale come risposta solo se il testo la contiene davvero (non il «oggi» predefinito).
    const esplicita = estraiDate(testo, ctx.oggi).length > 0;
    if (esplicita) { prima.data = n.data; usata = true; }
  }
  if (!usata) return [...out, ...nuove];
  // Il resto della risposta (altri lavori) si aggiunge in coda.
  return [...out, ...nuove.slice(1)];
}
