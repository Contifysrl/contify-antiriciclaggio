/**
 * Lettura dell'indirizzo restituito dal VIES.
 *
 * Il formato osservato su tutte le risposte valide del campione e:
 *     <TOPONIMO E CIVICO><spazio>\n<CAP> <COMUNE> <PROVINCIA>\n
 *
 * La seconda riga e affidabile. La prima no: non esiste separatore fra
 * via e civico e i civici reali sono di ogni tipo (32L, 66/6, 13/A,
 * "N 3"). Regola: se il civico non e riconoscibile con ragionevole
 * certezza, l'intera riga finisce in "indirizzo" e il civico resta
 * vuoto. Meglio un campo da completare che un indirizzo spezzato male.
 */

import { normalizzaTesto } from './testo';

export type IndirizzoLetto = {
  indirizzo: string | null;
  civico: string | null;
  cap: string | null;
  comune: string | null;
  provincia: string | null;
  /** false quando non siamo riusciti a separare CAP, comune e provincia */
  completo: boolean;
};

const RIGA_LOCALITA = /^(\d{5})\s+(.+?)\s+([A-Z]{2})$/;

/**
 * Civico in coda: numero, eventuale lettera attaccata, eventuale
 * "/qualcosa". Esempi accettati: 14, 32L, 66/6, 13/A, 190.
 */
const CIVICO_IN_CODA = /^(.*?)[\s,]+(\d+[A-Za-z]?(?:\s*\/\s*[0-9A-Za-z]+)?)$/;

const VUOTO: IndirizzoLetto = {
  indirizzo: null, civico: null, cap: null,
  comune: null, provincia: null, completo: false,
};

export function leggiIndirizzoVies(grezzo: string | null | undefined): IndirizzoLetto {
  if (!grezzo || !grezzo.trim() || grezzo.trim() === '---') return { ...VUOTO };

  const righe = grezzo
    .split('\n')
    .map((r) => r.replace(/\s+/g, ' ').trim())
    .filter((r) => r.length > 0);

  if (righe.length === 0) return { ...VUOTO };

  const ultima = righe[righe.length - 1];
  const localita = ultima.match(RIGA_LOCALITA);

  // Nessuna riga di localita riconoscibile: si salva il salvabile.
  if (!localita) {
    return {
      ...VUOTO,
      indirizzo: normalizzaTesto(righe.join(' ')),
      completo: false,
    };
  }

  const [, cap, comuneGrezzo, provincia] = localita;
  const rigaVia = righe.slice(0, -1).join(' ');

  if (!rigaVia) {
    return {
      indirizzo: null, civico: null, cap,
      comune: normalizzaTesto(comuneGrezzo), provincia,
      completo: true,
    };
  }

  let via = rigaVia;
  let civico: string | null = null;

  const conCivico = rigaVia.match(CIVICO_IN_CODA);
  if (conCivico && conCivico[1].trim()) {
    // "VIA DELL'INDUSTRIA N 3" -> il token "N" non fa parte del toponimo.
    via = conCivico[1].replace(/[\s,]+N\.?$/i, '').trim();
    civico = conCivico[2].replace(/\s*\/\s*/, '/').toUpperCase();
    if (!via) { via = rigaVia; civico = null; }
  }

  return {
    indirizzo: normalizzaTesto(via),
    civico,
    cap,
    comune: normalizzaTesto(comuneGrezzo),
    provincia,
    completo: true,
  };
}
