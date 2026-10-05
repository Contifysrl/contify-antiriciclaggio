import { useState } from 'react';
import type { SessioneApp } from '../pagine/Accessi';

// ── Moduli della piattaforma, lato client (TS-M0) ───────────────
// Lo studio ha AR, Timesheet o entrambi (`studio.moduli`, null = non
// acquistato); l'utente accede ad AR (`accessoAr`) e/o a Timesheet
// (`tsRuolo`); chi amministra accede a tutto. Il server ripete gli stessi
// controlli su ogni rotta: qui si decide solo cosa mostrare.

export type Modulo = 'AR' | 'TS';
export type StatoModulo = 'attivo' | 'sospeso' | 'cessato';

export const NOME_MODULO: Record<Modulo, string> = { AR: 'Antiriciclaggio', TS: 'Timesheet' };
export const NOME_PRODOTTO: Record<Modulo, string> = { AR: 'Contify AR', TS: 'Contify Timesheet' };

const ORDINE: Record<StatoModulo, number> = { attivo: 0, sospeso: 1, cessato: 2 };

function statoValido(s: string | null | undefined): StatoModulo {
  return s === 'sospeso' || s === 'cessato' ? s : 'attivo';
}

/** Il peggiore fra stato dello studio e stato del modulo (come lib/moduli.ts del server). */
export function statoEffettivo(statoStudio: string | null | undefined, statoModulo: string | null | undefined): StatoModulo {
  const a = statoValido(statoStudio);
  const b = statoValido(statoModulo);
  return ORDINE[b] > ORDINE[a] ? b : a;
}

export function accedeAdAr(s: SessioneApp): boolean {
  return s.utente.amministratore === true || s.utente.accessoAr !== false;
}

export function accedeATs(s: SessioneApp): boolean {
  return s.utente.amministratore === true || !!s.utente.tsRuolo;
}

/** Moduli che lo studio ha E a cui l'utente accede, nell'ordine AR, TS. Senza `moduli` in sessione (server precedente) vale AR. */
export function moduliDisponibili(s: SessioneApp): Modulo[] {
  const m = s.studio.moduli ?? { AR: 'attivo', TS: null };
  const out: Modulo[] = [];
  if (m.AR && accedeAdAr(s)) out.push('AR');
  if (m.TS && accedeATs(s)) out.push('TS');
  return out;
}

/** Stato effettivo di un modulo per lo studio della sessione (null = non acquistato). */
export function statoModulo(s: SessioneApp, modulo: Modulo): StatoModulo | null {
  const m = s.studio.moduli ?? { AR: 'attivo', TS: null };
  const sm = m[modulo];
  if (!sm) return null;
  return statoEffettivo(s.studio.stato, sm);
}

const CHIAVE = 'ar-modulo';

// Il modulo mostrato in questo momento, pubblicato da App.tsx a ogni resa:
// serve ai componenti comuni (piede legale) senza passare il dato per props.
let corrente: Modulo | null = 'AR';
export function pubblicaModuloCorrente(m: Modulo | null): void { corrente = m; }
export function moduloCorrente(): Modulo | null { return corrente; }

/**
 * Il modulo scelto nella barra laterale, ricordato nel browser (come
 * useVista). Se la scelta ricordata non è fra i moduli disponibili si
 * ripiega sul primo; con un solo modulo non c'è scelta.
 */
export function useModulo(disponibili: Modulo[]): [Modulo | null, (m: Modulo) => void] {
  const [scelto, setScelto] = useState<Modulo | null>(() => {
    try {
      const v = localStorage.getItem(CHIAVE);
      return v === 'AR' || v === 'TS' ? v : null;
    } catch { return null; }
  });
  const cambia = (m: Modulo) => {
    setScelto(m);
    try { localStorage.setItem(CHIAVE, m); } catch { /* modalità privata */ }
  };
  const corrente = scelto && disponibili.includes(scelto) ? scelto : (disponibili[0] ?? null);
  return [corrente, cambia];
}
