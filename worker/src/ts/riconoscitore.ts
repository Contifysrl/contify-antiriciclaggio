/**
 * Contify Timesheet — riconoscimento locale di clienti e servizi (TS-M1, passo 1).
 *
 * Clienti: confronto sul nome normalizzato (minuscole, senza accenti, senza
 * forma giuridica), prima sugli alias, poi parola per parola con tolleranza
 * per piccoli errori e per parole unite o spezzate («edil nova»). Ogni
 * parola del nome pesa in base a quanto è distintiva: una parola che compare
 * in un solo cliente vale 1, una parola condivisa da N clienti vale 1/√N, e
 * le parole comuni dell'italiano («Farmacia», «Centrale», «Formazione») o i
 * nomi di battesimo non superano mai 0,65 da sole. Il punteggio di un cliente
 * è la combinazione «almeno una basta» dei suoi pezzi riconosciuti:
 * 1 − ∏(1 − peso·somiglianza). Così «Valbrenta» da solo è certo, «Farmacia»
 * da solo no, «Farmacia Centrale» sì.
 *
 * Un identificativo è CERTO solo se il punteggio supera la soglia e stacca il
 * secondo (soglie fissate nel passo 0: vedi interpretazione.ts). Due clienti
 * che differiscono solo per la forma giuridica hanno lo stesso punteggio e
 * non sono mai certi.
 *
 * Servizi: parole chiave del servizio (anche radici: «contabil», «fattur»);
 * certo solo se ne emerge uno solo. Il servizio generico non si assegna mai.
 *
 * Funzioni pure, senza archivio: si provano con l'insieme di frasi del passo 0.
 */

import {
  FORME_GIURIDICHE, NOMI_DI_BATTESIMO, PAROLE_COMUNI, PAROLE_VUOTE, distanza, normalizza, paroleIdentificative, somiglianzaUtile,
  type Parola,
} from './testo';
import { valoreNumero } from './durata';

export interface ClienteRic {
  id: string;
  nome: string;
  alias?: string[];
  pf?: boolean;
}

export interface ServizioRic {
  id: string;
  nome: string;
  parole: string[];
  generico?: boolean;
}

/** Peso massimo di una parola comune o di un nome di battesimo: da sola non basta mai a essere certi. */
export const PESO_PAROLA_COMUNE = 0.65;
/** Fattore applicato alle parole «deboli» (vedi interpretazione.ts: nomi di terzi). */
export const FATTORE_DEBOLE = 0.6;

interface ParolaCliente {
  t: string;
  peso: number;
  /** Posizione nel nome (0 = prima parola). */
  pos: number;
}

interface ClienteIndicizzato {
  cliente: ClienteRic;
  parole: ParolaCliente[];
  alias: string[][];
}

export interface IndiceClienti {
  voci: ClienteIndicizzato[];
}

/** Prepara i nomi: parole identificative con il loro peso. Da fare una volta per chiamata. */
export function indiceClienti(clienti: ClienteRic[]): IndiceClienti {
  const perCliente = clienti.map((c) => [...new Set(paroleIdentificative(c.nome))]);
  const df = new Map<string, number>();
  for (const ps of perCliente) for (const p of ps) df.set(p, (df.get(p) ?? 0) + 1);
  const voci: ClienteIndicizzato[] = clienti.map((c, i) => ({
    cliente: c,
    parole: perCliente[i].map((t, pos) => {
      let peso = Math.pow(1 / (df.get(t) ?? 1), 0.5);
      if (PAROLE_COMUNI.has(t) || NOMI_DI_BATTESIMO.has(t) || t.length <= 3 || /^\d+$/.test(t)) peso = Math.min(peso, PESO_PAROLA_COMUNE);
      return { t, peso, pos };
    }),
    alias: (c.alias ?? []).map((a) => normalizza(a).replace(/[.,;:()!?]/g, ' ').split(/\s+/).filter(Boolean)).filter((a) => a.length),
  }));
  return { voci };
}

export interface MatchCliente {
  id: string;
  /** 0..1 dopo le penalità. */
  punteggio: number;
  /** Indici (in `parole`) delle parole del testo riconosciute come parte del nome. */
  parole: number[];
  /** Quante parole identificative del nome sono state riconosciute, in proporzione. */
  copertura: number;
  /** Riconosciuto tramite un alias. */
  alias?: boolean;
  /** Indebolito perché somiglia al nome di un terzo (vedi interpretazione.ts). */
  debole?: boolean;
}

interface Pezzo {
  pos: number;             // posizione della parola nel nome del cliente
  parole: number[];        // indici delle parole del testo
  sim: number;
  peso: number;
}

/**
 * Somiglianza fra una parola del nome e una parola del testo. Le parole di
 * cinque lettere tollerano un errore («teta» per «theta») ma solo come
 * candidato (0,8 resta sotto la soglia di certezza); i nomi di battesimo no:
 * «Marco» non è «Mario».
 */
export function simParola(parolaNome: string, parolaTesto: string): number {
  if (parolaNome === parolaTesto) return 1;
  if (NOMI_DI_BATTESIMO.has(parolaNome) || NOMI_DI_BATTESIMO.has(parolaTesto)) return 0;
  if (parolaNome.length === 5 && parolaTesto.length >= 4 && parolaTesto.length <= 6) {
    const s = 1 - distanza(parolaNome, parolaTesto) / 5;
    return s >= 0.8 ? 0.8 : 0;
  }
  return somiglianzaUtile(parolaNome, parolaTesto);
}

function combina(pezzi: Pezzo[]): number {
  let resto = 1;
  for (const p of pezzi) resto *= 1 - p.peso * p.sim;
  return Math.min(1, 1 - resto);
}

/**
 * Tutti i clienti che somigliano a qualcosa nel testo, con punteggio e parole
 * coinvolte. Un cliente può comparire più volte se il suo nome ricorre in due
 * punti diversi della frase. Le parole in `escluse` (durate, date) non contano.
 */
export function riconosciClienti(parole: Parola[], escluse: Set<number>, indice: IndiceClienti): MatchCliente[] {
  const idonee = parole.filter((p) => !escluse.has(p.i) && p.t.length >= 2 && !/^\d+$/.test(p.t));
  const out: MatchCliente[] = [];

  for (const voce of indice.voci) {
    // Alias: sequenze esatte di parole.
    for (const alias of voce.alias) {
      for (let k = 0; k + alias.length <= idonee.length; k++) {
        let ok = true;
        for (let j = 0; j < alias.length; j++) if (idonee[k + j].t !== alias[j] || idonee[k + j].i !== idonee[k].i + j) { ok = false; break; }
        if (ok) out.push({ id: voce.cliente.id, punteggio: 1, parole: alias.map((_, j) => idonee[k + j].i), copertura: 1, alias: true });
      }
    }

    // Parole del nome, una per una, contro le parole del testo (anche unite o spezzate).
    const pezzi: Pezzo[] = [];
    for (const pc of voce.parole) {
      for (let k = 0; k < idonee.length; k++) {
        const w = idonee[k];
        const s = simParola(pc.t, w.t);
        if (s > 0) pezzi.push({ pos: pc.pos, parole: [w.i], sim: s, peso: pc.peso });
        // Due parole del testo che unite fanno una parola del nome: «edil nova» → «edilnova».
        if (k + 1 < idonee.length && idonee[k + 1].i === w.i + 1 && pc.t.length >= 6) {
          const unite = w.t + idonee[k + 1].t;
          const su = unite === pc.t ? 1 : somiglianzaUtile(pc.t, unite);
          if (su >= 0.9) pezzi.push({ pos: pc.pos, parole: [w.i, w.i + 1], sim: su, peso: pc.peso });
        }
      }
    }
    // Una parola del testo che unisce due parole del nome: «edilnovacostruzioni».
    for (let j = 0; j + 1 < voce.parole.length; j++) {
      const unite = voce.parole[j].t + voce.parole[j + 1].t;
      for (const w of idonee) {
        if (w.t.length < 6) continue;
        const su = w.t === unite ? 1 : somiglianzaUtile(unite, w.t);
        if (su >= 0.9) {
          pezzi.push({ pos: voce.parole[j].pos, parole: [w.i], sim: su, peso: voce.parole[j].peso });
          pezzi.push({ pos: voce.parole[j + 1].pos, parole: [w.i], sim: su, peso: voce.parole[j + 1].peso });
        }
      }
    }
    if (!pezzi.length) continue;

    // Raggruppa i pezzi in menzioni: parole del testo vicine (al massimo due parole di distanza).
    pezzi.sort((a, b) => Math.min(...a.parole) - Math.min(...b.parole));
    const gruppi: Pezzo[][] = [];
    for (const p of pezzi) {
      const g = gruppi[gruppi.length - 1];
      if (g && Math.min(...p.parole) - Math.max(...g.flatMap((x) => x.parole)) <= 3) g.push(p);
      else gruppi.push([p]);
    }
    for (const g of gruppi) {
      // Per ogni parola del nome tiene il pezzo migliore (una parola del nome non si conta due volte).
      const perPos = new Map<number, Pezzo>();
      for (const p of g) {
        const prec = perPos.get(p.pos);
        if (!prec || p.sim * p.peso > prec.sim * prec.peso) perPos.set(p.pos, p);
      }
      const scelti = [...perPos.values()];
      const idx = [...new Set(scelti.flatMap((p) => p.parole))].sort((a, b) => a - b);
      out.push({
        id: voce.cliente.id,
        punteggio: combina(scelti),
        parole: idx,
        copertura: scelti.length / voce.parole.length,
      });
    }
  }
  return out.sort((a, b) => b.punteggio - a.punteggio);
}

export interface MatchServizio {
  id: string;
  /** Indici delle parole del testo che hanno acceso il servizio. */
  parole: number[];
}

/**
 * Servizi le cui parole chiave compaiono nel testo. Le parole chiave di più
 * parole («prima nota», «libro unico») vincono su quelle singole e consumano
 * le loro parole. Il servizio generico non ha parole chiave e non emerge mai.
 */
export function riconosciServizi(parole: Parola[], escluse: Set<number>, servizi: ServizioRic[]): MatchServizio[] {
  const idonee = parole.filter((p) => !escluse.has(p.i));
  const consumate = new Set<number>();
  const trovati = new Map<string, Set<number>>();
  const accendi = (id: string, idx: number[]) => {
    const s = trovati.get(id) ?? new Set<number>();
    for (const i of idx) { s.add(i); consumate.add(i); }
    trovati.set(id, s);
  };
  const chiavi = servizi
    .filter((s) => !s.generico)
    .flatMap((s) => s.parole.map((k) => ({ id: s.id, k: normalizza(k).replace(/[.,;:()!?]/g, ' ').trim().split(/\s+/).filter(Boolean) })))
    .filter((x) => x.k.length);

  // Prima le chiavi di più parole.
  for (const { id, k } of chiavi.filter((x) => x.k.length > 1)) {
    for (let i = 0; i + k.length <= idonee.length; i++) {
      let ok = true;
      for (let j = 0; j < k.length; j++) {
        const w = idonee[i + j];
        if (!w || consumate.has(w.i) || w.i !== idonee[i].i + j || !corrisponde(w.t, k[j])) { ok = false; break; }
      }
      if (ok) accendi(id, k.map((_, j) => idonee[i + j].i));
    }
  }
  for (const { id, k } of chiavi.filter((x) => x.k.length === 1)) {
    for (const w of idonee) if (!consumate.has(w.i) && corrisponde(w.t, k[0])) {
      const s = trovati.get(id) ?? new Set<number>();
      s.add(w.i);
      trovati.set(id, s);
    }
  }
  return [...trovati.entries()].map(([id, s]) => ({ id, parole: [...s].sort((a, b) => a - b) }));
}

/** Una parola del testo corrisponde a una parola chiave (o radice) del servizio. */
export function corrisponde(parola: string, chiave: string): boolean {
  if (parola === chiave) return true;
  // «settecentotrenta» dettato per il modello 730.
  if (/^\d+$/.test(chiave) && /^[a-z]+$/.test(parola)) return valoreNumero(parola) === Number(chiave);
  if (chiave.length >= 5 && parola.startsWith(chiave)) return true;
  if (chiave.length >= 7 && parola.length >= 7) return somiglianzaUtile(chiave, parola) >= 0.86;
  return false;
}

/** Parola del testo che non identifica nulla: vuota, forma giuridica, numero. */
export function parolaVuota(t: string): boolean {
  return PAROLE_VUOTE.has(t) || FORME_GIURIDICHE.has(t) || /^\d+$/.test(t) || t.length < 2;
}
