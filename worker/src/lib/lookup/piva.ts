/**
 * Pulizia e validazione della partita IVA italiana.
 *
 * Il controllo di validita formale si fa SEMPRE prima di uscire in rete:
 * una partita IVA scritta male non deve consumare una chiamata al VIES.
 */

export type EsitoPiva =
  | { valida: true; piva: string }
  | { valida: false; motivo: 'vuota' | 'lunghezza' | 'checksum' };

/** Toglie spazi, punti, trattini e l'eventuale prefisso IT. */
export function pulisciPiva(input: string): string {
  const grezzo = (input ?? '').trim().toUpperCase();
  return grezzo.replace(/^IT[\s.\-]*/, '').replace(/[^0-9]/g, '');
}

/**
 * Cifra di controllo secondo il DM 23/12/1976 (schema di Luhn):
 * le cifre in posizione dispari si sommano tal quali, quelle in posizione
 * pari si raddoppiano sottraendo 9 se superano il 9. Il totale, cifra di
 * controllo compresa, deve essere multiplo di 10.
 */
export function checksumValido(piva: string): boolean {
  if (!/^\d{11}$/.test(piva)) return false;
  let somma = 0;
  for (let i = 0; i < 11; i++) {
    const cifra = piva.charCodeAt(i) - 48;
    if (i % 2 === 0) {
      somma += cifra;
    } else {
      const doppio = cifra * 2;
      somma += doppio > 9 ? doppio - 9 : doppio;
    }
  }
  return somma % 10 === 0;
}

/**
 * Normalizza l'input dell'utente in una partita IVA di 11 cifre.
 * Caso reale gestito: siti e documenti che stampano il numero senza lo
 * zero iniziale (visto su un poliambulatorio di Camposampiero).
 */
export function normalizzaPiva(input: string): EsitoPiva {
  let cifre = pulisciPiva(input);
  if (!cifre) return { valida: false, motivo: 'vuota' };

  if (cifre.length === 10 && checksumValido('0' + cifre)) {
    cifre = '0' + cifre;
  }
  if (cifre.length !== 11) return { valida: false, motivo: 'lunghezza' };
  if (!checksumValido(cifre)) return { valida: false, motivo: 'checksum' };
  return { valida: true, piva: cifre };
}
