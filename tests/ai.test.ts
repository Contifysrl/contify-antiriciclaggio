import { describe, expect, it } from 'vitest';
import { aiAbilitata, estraiJsonArray, prefiltraSubIndici } from '../worker/src/lib/ai';
import { SUB_INDICI_UIF_2023 } from '../worker/src/domain/sub-indici-uif';

describe('Assistente AI (AR-M9) — parti pure', () => {
  it("l'opt-in vale solo con abilitata === true", () => {
    expect(aiAbilitata(JSON.stringify({ ai: { abilitata: true } }))).toBe(true);
    expect(aiAbilitata(JSON.stringify({ ai: { abilitata: false } }))).toBe(false);
    expect(aiAbilitata('{}')).toBe(false);
    expect(aiAbilitata(null)).toBe(false);
    expect(aiAbilitata('non-json')).toBe(false);
  });

  it('il prefiltro trova sub-indici pertinenti su un caso da manuale (contante frazionato)', () => {
    const descrizione =
      'Il cliente effettua versamenti ripetuti di contante in banca per importi appena sotto soglia, ' +
      'apparentemente frazionati in modo artificioso su più giorni consecutivi.';
    const candidati = prefiltraSubIndici(descrizione, 30);
    expect(candidati.length).toBeGreaterThan(5);
    // Fra i primi candidati deve comparire l'area del contante/frazionamenti.
    const testi = candidati.slice(0, 15).map((c) => c.testo.toLowerCase()).join(' ');
    expect(testi).toMatch(/contant|frazionat/);
    // I codici sono sempre riscontrabili sul catalogo.
    for (const c of candidati) {
      const [n, i] = c.codice.split('.').map(Number);
      expect(SUB_INDICI_UIF_2023[n][i - 1]).toBe(c.testo);
    }
  });

  it('il prefiltro non restituisce nulla per testi vuoti o insignificanti', () => {
    expect(prefiltraSubIndici('')).toHaveLength(0);
    expect(prefiltraSubIndici('il la di da in con su per')).toHaveLength(0);
  });

  it('estraiJsonArray tollera testo attorno e JSON annidato', () => {
    expect(estraiJsonArray('Ecco:\n[{"codice":"1.2","motivo":"x"}]\nGrazie.')).toEqual([{ codice: '1.2', motivo: 'x' }]);
    expect(estraiJsonArray('[[1,2],[3]]')).toEqual([[1, 2], [3]]);
    expect(estraiJsonArray('nessun json')).toEqual([]);
    expect(estraiJsonArray('[rotto')).toEqual([]);
  });
});
