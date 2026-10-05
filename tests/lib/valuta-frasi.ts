/**
 * Valutazione di un motore di interpretazione sull'insieme di frasi del passo 0
 * (tests/fixtures/ts-frasi.json). Usata dalle prove vitest e da
 * scripts/prova-motori-ts.ts.
 *
 * Misure della specifica (M1.0):
 *  - esatta: cliente, servizio, minuti e data tutti giusti, nessuna domanda;
 *  - domanda giusta: il programma chiede proprio ciò che manca o è ambiguo
 *    (e il candidato atteso compare fra le opzioni), il resto è giusto;
 *  - errore silenzioso: salverebbe un dato sbagliato senza chiedere
 *    (compresa una registrazione in più o in meno);
 *  - superflua: chiede qualcosa che era chiaro (non è un errore, ma non è esatta);
 *  - candidato mancante: chiede, ma il cliente o servizio giusto non è fra i pulsanti.
 */

import type { Proposta } from '../../worker/src/ts/interpretazione';

export interface AttesaFrase {
  c: string | null;
  s: string | null;
  m: number | null;
  d: string | null;
  cand?: string[];
  scand?: string[];
}

export interface Frase {
  id: string;
  tipo: 'scritta' | 'dettata' | 'audio';
  testo: string;
  file?: string;
  attese: AttesaFrase[];
  note?: string;
}

export interface InsiemeFrasi {
  oggi: string;
  clienti: Array<{ id: string; nome: string; pf?: boolean; alias?: string[] }>;
  servizi: Array<{ id: string; nome: string; parole: string[]; generico?: boolean }>;
  frasi: Frase[];
}

export type Esito = 'esatta' | 'domanda' | 'superflua' | 'candidato_mancante' | 'silenziosa';

export interface Valutazione {
  id: string;
  esito: Esito;
  /** Errori silenziosi sul cliente (il più grave). */
  erroriCliente: number;
  /** Errori silenziosi in tutto (campi sbagliati + registrazioni in più o in meno). */
  erroriSilenziosi: number;
  dettagli: string[];
}

export function valutaFrase(frase: Frase, proposte: Proposta[], oggi: string): Valutazione {
  const dettagli: string[] = [];
  let erroriCliente = 0;
  let erroriSilenziosi = 0;
  let domande = 0;
  let superflue = 0;
  let candidatiMancanti = 0;

  const attese = frase.attese.map((a) => ({ ...a, d: a.d === 'oggi' ? oggi : a.d }));
  if (proposte.length !== attese.length) {
    erroriSilenziosi++;
    dettagli.push(`registrazioni: attese ${attese.length}, proposte ${proposte.length}`);
  }
  const n = Math.min(proposte.length, attese.length);
  for (let i = 0; i < n; i++) {
    const p = proposte[i], a = attese[i];
    // Cliente.
    if (a.c === null) {
      if (p.cliente.id) { erroriCliente++; erroriSilenziosi++; dettagli.push(`#${i + 1} cliente: atteso una domanda, proposto ${p.cliente.id}`); }
      else {
        domande++;
        const ids = p.cliente.candidati.map((c) => c.id);
        const mancanti = (a.cand ?? []).filter((c) => !ids.includes(c));
        if (mancanti.length) { candidatiMancanti++; dettagli.push(`#${i + 1} cliente: candidati attesi ${a.cand!.join(',')} fra [${ids.join(',')}]`); }
      }
    } else if (p.cliente.id === null) { superflue++; dettagli.push(`#${i + 1} cliente: atteso ${a.c}, chiesto (candidati ${p.cliente.candidati.map((c) => c.id).join(',') || 'nessuno'})`); }
    else if (p.cliente.id !== a.c) { erroriCliente++; erroriSilenziosi++; dettagli.push(`#${i + 1} cliente: atteso ${a.c}, proposto ${p.cliente.id}`); }
    // Servizio.
    if (a.s === null) {
      if (p.servizio.id) { erroriSilenziosi++; dettagli.push(`#${i + 1} servizio: atteso una domanda, proposto ${p.servizio.id}`); }
      else {
        domande++;
        const ids = p.servizio.candidati.map((c) => c.id);
        const mancanti = (a.scand ?? []).filter((c) => !ids.includes(c));
        if (mancanti.length && ids.length) { candidatiMancanti++; dettagli.push(`#${i + 1} servizio: candidati attesi ${a.scand!.join(',')} fra [${ids.join(',')}]`); }
      }
    } else if (p.servizio.id === null) { superflue++; dettagli.push(`#${i + 1} servizio: atteso ${a.s}, chiesto`); }
    else if (p.servizio.id !== a.s) { erroriSilenziosi++; dettagli.push(`#${i + 1} servizio: atteso ${a.s}, proposto ${p.servizio.id}`); }
    // Minuti.
    if (a.m === null) {
      if (p.minuti != null) { erroriSilenziosi++; dettagli.push(`#${i + 1} minuti: atteso una domanda, proposto ${p.minuti}`); }
      else domande++;
    } else if (p.minuti == null) { superflue++; dettagli.push(`#${i + 1} minuti: atteso ${a.m}, chiesto`); }
    else if (p.minuti !== a.m) { erroriSilenziosi++; dettagli.push(`#${i + 1} minuti: atteso ${a.m}, proposto ${p.minuti}`); }
    // Data.
    if (a.d === null) {
      if (p.data) { erroriSilenziosi++; dettagli.push(`#${i + 1} data: atteso una domanda, proposto ${p.data}`); }
      else domande++;
    } else if (!p.data) { superflue++; dettagli.push(`#${i + 1} data: atteso ${a.d}, chiesto`); }
    else if (p.data !== a.d) { erroriSilenziosi++; dettagli.push(`#${i + 1} data: atteso ${a.d}, proposto ${p.data}`); }
  }

  let esito: Esito;
  if (erroriSilenziosi) esito = 'silenziosa';
  else if (candidatiMancanti) esito = 'candidato_mancante';
  else if (superflue) esito = 'superflua';
  else if (domande) esito = 'domanda';
  else esito = 'esatta';
  return { id: frase.id, esito, erroriCliente, erroriSilenziosi, dettagli };
}

export interface Riepilogo {
  totale: number;
  esatte: number;
  domande: number;
  superflue: number;
  candidatiMancanti: number;
  silenziose: number;
  erroriCliente: number;
  /** (esatte + domande giuste) / totale. */
  quotaBuone: number;
  quotaSilenziose: number;
}

export function riepiloga(v: Valutazione[]): Riepilogo {
  const conta = (e: Esito) => v.filter((x) => x.esito === e).length;
  const totale = v.length || 1;
  const esatte = conta('esatta'), domande = conta('domanda'), silenziose = conta('silenziosa');
  return {
    totale: v.length,
    esatte,
    domande,
    superflue: conta('superflua'),
    candidatiMancanti: conta('candidato_mancante'),
    silenziose,
    erroriCliente: v.reduce((s, x) => s + x.erroriCliente, 0),
    quotaBuone: (esatte + domande) / totale,
    quotaSilenziose: silenziose / totale,
  };
}
