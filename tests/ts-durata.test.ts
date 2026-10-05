import { describe, expect, it } from 'vitest';
import { duraPerCiascuno, estraiDurate, valoreNumero } from '../worker/src/ts/durata';

// ── TS-M1 passo 1: durate in cifre e in lettere, con la posizione nel testo ──

const minuti = (testo: string) => estraiDurate(testo).map((d) => d.minuti);

describe('valoreNumero', () => {
  it('cifre e decimali', () => {
    expect(valoreNumero('2')).toBe(2);
    expect(valoreNumero('1,5')).toBe(1.5);
    expect(valoreNumero('1.5')).toBe(1.5);
    expect(valoreNumero('45')).toBe(45);
  });
  it('lettere', () => {
    expect(valoreNumero('un')).toBe(1);
    expect(valoreNumero('due')).toBe(2);
    expect(valoreNumero('quindici')).toBe(15);
    expect(valoreNumero('venti')).toBe(20);
    expect(valoreNumero('venticinque')).toBe(25);
    expect(valoreNumero('ventuno')).toBe(21);
    expect(valoreNumero('ventotto')).toBe(28);
    expect(valoreNumero('quarantacinque')).toBe(45);
    expect(valoreNumero('novanta')).toBe(90);
    expect(valoreNumero('cento')).toBe(100);
    expect(valoreNumero('centoventi')).toBe(120);
    expect(valoreNumero('omega')).toBeNull();
  });
});

describe('estraiDurate', () => {
  it('ore intere, in cifre e in lettere', () => {
    expect(minuti('2 ore per Omega')).toEqual([120]);
    expect(minuti('due ore per Omega')).toEqual([120]);
    expect(minuti('Sei ore di contabilità')).toEqual([360]);
    expect(minuti('2h')).toEqual([120]);
    expect(minuti('2 h')).toEqual([120]);
    expect(minuti("un'ora")).toEqual([60]);
    expect(minuti('un ora')).toEqual([60]);
    expect(minuti("un'oretta")).toEqual([60]);
  });

  it('frazioni e minuti uniti da «e» sono una sola durata', () => {
    expect(minuti("un'ora e mezza")).toEqual([90]);
    expect(minuti('2 ore e mezzo')).toEqual([150]);
    expect(minuti('due ore e un quarto')).toEqual([135]);
    expect(minuti("un'ora e tre quarti")).toEqual([105]);
    expect(minuti('2 ore e 20 minuti')).toEqual([140]);
    expect(minuti('1 ora e 15')).toEqual([75]);
    expect(minuti("un'ora e quaranta")).toEqual([100]);
    expect(minuti("un'ora e trenta")).toEqual([90]);
  });

  it('decimali e notazione compatta', () => {
    expect(minuti('1,5 ore')).toEqual([90]);
    expect(minuti('1.5 ore')).toEqual([90]);
    expect(minuti('0,5 ore')).toEqual([30]);
    expect(minuti('1h30')).toEqual([90]);
    expect(minuti('1 h 30')).toEqual([90]);
    expect(minuti('2h15 di bilancio')).toEqual([135]);
    expect(minuti('1:30 di bilancio')).toEqual([90]);
  });

  it('minuti', () => {
    expect(minuti('45 minuti')).toEqual([45]);
    expect(minuti('quarantacinque minuti')).toEqual([45]);
    expect(minuti('20 min')).toEqual([20]);
    expect(minuti("40'")).toEqual([40]);
    expect(minuti('novanta minuti')).toEqual([90]);
  });

  it('espressioni fisse', () => {
    expect(minuti("mezz'ora al telefono")).toEqual([30]);
    expect(minuti('mezzora')).toEqual([30]);
    expect(minuti("una mezz'oretta")).toEqual([30]);
    expect(minuti("un quarto d'ora")).toEqual([15]);
    expect(minuti("tre quarti d'ora")).toEqual([45]);
    expect(minuti("un paio d'ore")).toEqual([120]);
    expect(minuti('un paio di ore')).toEqual([120]);
  });

  it('intervalli orari', () => {
    expect(minuti('dalle 9 alle 11')).toEqual([120]);
    expect(minuti('dalle 9.30 alle 11')).toEqual([90]);
    expect(minuti('dalle 14 alle 16:30')).toEqual([150]);
    expect(minuti('dalle nove alle undici')).toEqual([120]);
    expect(minuti('dalle due alle quattro e mezza')).toEqual([150]);
    expect(minuti('dalle 11 alle 1')).toEqual([120]);
  });

  it('durate separate restano separate, con le posizioni', () => {
    const d = estraiDurate('2 ore per Omega e 1 ora per Beta');
    expect(d.map((x) => x.minuti)).toEqual([120, 60]);
    expect('2 ore per Omega e 1 ora per Beta'.slice(d[0].inizio, d[0].fine)).toBe('2 ore');
    expect('2 ore per Omega e 1 ora per Beta'.slice(d[1].inizio, d[1].fine)).toBe('1 ora');
    expect(minuti('Rossi Marco 1 ora e Rossi 1 ora')).toEqual([60, 60]);
    expect(minuti('Dalle 9 alle 11 contabilità Omega, dalle 11 alle 12 bilancio Beta')).toEqual([120, 60]);
    expect(minuti("Un'ora e mezza per Zamperetti, poi mezz'ora con Gamma")).toEqual([90, 30]);
  });

  it('non prende per durate orari, date e numeri senza unità', () => {
    expect(minuti('alle 9 contabilità')).toEqual([]);
    expect(minuti('il 30 ho fatto la liquidazione')).toEqual([]);
    expect(minuti('modello 730')).toEqual([]);
    expect(minuti('F24 per Theta')).toEqual([]);
    expect(minuti('un paio di telefonate')).toEqual([]);
    expect(minuti('tutta la mattina')).toEqual([]);
    expect(minuti('mezza giornata')).toEqual([]);
    expect(minuti('02/10: Omega, bilancio')).toEqual([]);
  });

  it('scarta durate impossibili', () => {
    expect(minuti('25 ore')).toEqual([]);
    expect(minuti('0 ore')).toEqual([]);
  });

  it('riconosce «ciascuno»', () => {
    expect(duraPerCiascuno('2 ore ciascuno')).toBe(true);
    expect(duraPerCiascuno("un'ora ciascuna")).toBe(true);
    expect(duraPerCiascuno('2 ore a testa')).toBe(true);
    expect(duraPerCiascuno('2 ore in totale')).toBe(false);
  });
});
