import { describe, expect, it } from 'vitest';
import { estraiDate, ultimoGiorno, ultimoGiornoDelMese } from '../worker/src/ts/quando';

// ── TS-M1 passo 1: il giorno del lavoro. Oggi è lunedì 5 ottobre 2026 ──

const OGGI = '2026-10-05';
const date = (testo: string) => estraiDate(testo, OGGI).map((q) => (q.futura ? 'futura' : q.vaga ? 'vaga' : q.data));

describe('estraiDate', () => {
  it('oggi, ieri, l’altro ieri', () => {
    expect(date('Oggi 2 ore')).toEqual([OGGI]);
    expect(date('Stamattina un’ora')).toEqual([OGGI]);
    expect(date('Ieri sera ho finito')).toEqual(['2026-10-04']);
    expect(date("L'altro ieri un'ora")).toEqual(['2026-10-03']);
    expect(date("l'altroieri")).toEqual(['2026-10-03']);
  });

  it('nome del giorno = ricorrenza passata più recente, oggi escluso', () => {
    expect(date('Venerdì ho fatto')).toEqual(['2026-10-02']);
    expect(date('venerdì scorso')).toEqual(['2026-10-02']);
    expect(date('Lunedì 2 ore')).toEqual(['2026-09-28']);
    expect(date('Sabato mattina')).toEqual(['2026-10-03']);
    expect(date('Domenica')).toEqual(['2026-10-04']);
    expect(date('Giovedì pomeriggio 3 ore')).toEqual(['2026-10-01']);
    expect(date('Martedì 29, contabilità')).toEqual(['2026-09-29']);
    expect(ultimoGiorno(OGGI, 1)).toBe('2026-09-28');
  });

  it('giorno del mese più recente non futuro, oggi compreso', () => {
    expect(date('Il 30 ho fatto')).toEqual(['2026-09-30']);
    expect(date('Il 5 ho fatto 2 ore')).toEqual([OGGI]);
    expect(date('Il 6, 2 ore')).toEqual(['2026-09-06']);
    expect(ultimoGiornoDelMese(OGGI, 31)).toBe('2026-08-31');
  });

  it('date complete', () => {
    expect(date('Il 28 settembre 4 ore')).toEqual(['2026-09-28']);
    expect(date('Il 2 ottobre 2 ore')).toEqual(['2026-10-02']);
    expect(date('02/10: Omega')).toEqual(['2026-10-02']);
    expect(date('2/10/2026 bilancio')).toEqual(['2026-10-02']);
    expect(date('Il primo ottobre 3 ore')).toEqual(['2026-10-01']);
    expect(date('1° ottobre')).toEqual(['2026-10-01']);
    expect(date('il 28 dicembre')).toEqual(['2025-12-28']);
  });

  it('relative con numero', () => {
    expect(date('Due giorni fa 45 minuti')).toEqual(['2026-10-03']);
    expect(date('tre giorni fa')).toEqual(['2026-10-02']);
    expect(date('Una settimana fa 2 ore')).toEqual(['2026-09-28']);
  });

  it('vaghe e future restano senza data', () => {
    expect(date('La settimana scorsa 3 ore')).toEqual(['vaga']);
    expect(date('Qualche giorno fa')).toEqual(['vaga']);
    expect(date("l'altro giorno")).toEqual(['vaga']);
    expect(date('domani 2 ore')).toEqual(['futura']);
    expect(date('lunedì prossimo')).toEqual(['futura']);
    expect(date('il 7 ottobre 2026')).toEqual(['futura']);
  });

  it('il mese da solo e i numeri senza «il» non sono date', () => {
    expect(date('Cedolini di settembre, 1 ora')).toEqual([]);
    expect(date('registrazioni di settembre')).toEqual([]);
    expect(date('2 ore per Omega')).toEqual([]);
    expect(date('modello 730')).toEqual([]);
    expect(date('il 730 di Brandolisio')).toEqual([]);
    expect(date('dalle 9 alle 11')).toEqual([]);
  });

  it('più date nella stessa frase, in ordine e con posizione', () => {
    const q = estraiDate('Venerdì scorso e oggi, 2 ore ciascuno', OGGI);
    expect(q.map((x) => x.data)).toEqual(['2026-10-02', OGGI]);
    expect('Venerdì scorso e oggi, 2 ore ciascuno'.slice(q[0].inizio, q[0].fine)).toBe('Venerdì scorso');
  });
});
