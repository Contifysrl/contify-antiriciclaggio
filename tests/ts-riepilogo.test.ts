import { describe, expect, it } from 'vitest';
import { calcolaRiepilogo, festivo, lavorativo, lunediDi, pasqua, previstoDelGiorno } from '../worker/src/ts/riepilogo';

// ── TS-M1 M1.3 bis: riepilogo personale e ore previste (A14, A15) ──

describe('calendario', () => {
  it('pasqua e lunedì dell’Angelo', () => {
    expect(pasqua(2026)).toBe('2026-04-05');
    expect(pasqua(2027)).toBe('2027-03-28');
    expect(festivo('2026-04-06')).toBe(true);
    expect(festivo('2026-04-07')).toBe(false);
  });
  it('festività fisse', () => {
    expect(festivo('2026-12-25')).toBe(true);
    expect(festivo('2026-06-02')).toBe(true);
    expect(festivo('2026-10-05')).toBe(false);
  });
  it('giorni di lavoro della persona', () => {
    expect(lavorativo('2026-10-05', '12345')).toBe(true);   // lunedì
    expect(lavorativo('2026-10-03', '12345')).toBe(false);  // sabato
    expect(lavorativo('2026-10-03', '123456')).toBe(true);
    expect(lavorativo('2026-12-25', '12345')).toBe(false);  // Natale, venerdì
  });
  it('lunedì della settimana', () => {
    expect(lunediDi('2026-10-05')).toBe('2026-10-05');
    expect(lunediDi('2026-10-04')).toBe('2026-09-28');
    expect(lunediDi('2026-10-07')).toBe('2026-10-05');
  });
  it('previsto del giorno', () => {
    expect(previstoDelGiorno({ minutiSettimanali: 2400, giorniLavorativi: '12345' })).toBe(480);
    expect(previstoDelGiorno({ minutiSettimanali: 1200, giorniLavorativi: '135' })).toBe(400);
    expect(previstoDelGiorno({ minutiSettimanali: null, giorniLavorativi: '12345' })).toBeNull();
  });
});

describe('calcolaRiepilogo', () => {
  const regs = [
    { data: '2026-10-05', minuti: 120 }, { data: '2026-10-05', minuti: 90 },
    { data: '2026-10-02', minuti: 480 }, { data: '2026-09-30', minuti: 60 },
    { data: '2026-10-03', minuti: 30 },  // sabato con lavoro
  ];

  it('oggi, settimana e mese per una persona a tempo pieno (mercoledì 7 ottobre)', () => {
    const r = calcolaRiepilogo('2026-10-07', regs, { minutiSettimanali: 2400, giorniLavorativi: '12345' });
    expect(r.oggi).toEqual({ data: '2026-10-07', minuti: 0, registrazioni: 0, previsti: 480 });
    const giorni = r.settimana.map((g) => [g.data, g.minuti, g.previsti, g.vuoto]);
    // Da lunedì 5 a venerdì 9: il fine settimana non compare (non lavorativo e senza ore).
    expect(giorni).toEqual([
      ['2026-10-05', 210, 480, false],
      ['2026-10-06', 0, 480, true],      // passato e senza registrazioni: vuoto
      ['2026-10-07', 0, 480, false],     // oggi non è mai vuoto
      ['2026-10-08', 0, 480, false],
      ['2026-10-09', 0, 480, false],
    ]);
    expect(r.mese.minuti).toBe(210 + 480 + 30);
    // Previsto del mese fino a oggi: 1, 2, 5, 6, 7 ottobre = 5 giorni lavorativi.
    expect(r.mese.previsti).toBe(5 * 480);
  });

  it('settimana a cavallo del mese: il mese conta solo i suoi giorni', () => {
    const r = calcolaRiepilogo('2026-10-02', regs, { minutiSettimanali: 2400, giorniLavorativi: '12345' });
    expect(r.settimana[0].data).toBe('2026-09-28');
    expect(r.mese.minuti).toBe(480 + 30 + 210); // ottobre: 2, 3 e 5 (il 5 è nel futuro rispetto al 2 ma è pur sempre ottobre)
  });

  it('il sabato compare se ha registrazioni o se è giorno di lavoro', () => {
    const r = calcolaRiepilogo('2026-10-05', regs, { minutiSettimanali: null, giorniLavorativi: '12345' });
    expect(r.settimana.map((g) => g.data)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
    const r2 = calcolaRiepilogo('2026-10-03', regs, { minutiSettimanali: null, giorniLavorativi: '12345' });
    expect(r2.settimana.some((g) => g.data === '2026-10-03' && g.minuti === 30 && !g.lavorativo)).toBe(true);
  });

  it('persona senza ore previste: solo totali', () => {
    const r = calcolaRiepilogo('2026-10-05', regs, { minutiSettimanali: null, giorniLavorativi: '12345' });
    expect(r.oggi.previsti).toBeNull();
    expect(r.settimana.every((g) => g.previsti === null)).toBe(true);
    expect(r.mese.previsti).toBeNull();
  });

  it('part-time lunedì-mercoledì-venerdì: martedì non è lavorativo né vuoto', () => {
    const r = calcolaRiepilogo('2026-10-08', regs, { minutiSettimanali: 1200, giorniLavorativi: '135' });
    const mar = r.settimana.find((g) => g.data === '2026-10-06')!;
    expect(mar.lavorativo).toBe(false);
    expect(mar.vuoto).toBe(false);
    expect(mar.previsti).toBeNull();
    expect(r.settimana.find((g) => g.data === '2026-10-07')!.vuoto).toBe(true);
  });

  it('una festività non è lavorativa', () => {
    const r = calcolaRiepilogo('2026-12-28', [], { minutiSettimanali: 2400, giorniLavorativi: '12345' });
    // settimana 28/12–3/1 (il 1° gennaio è festivo)
    expect(r.settimana.find((g) => g.data === '2027-01-01')!.festivo).toBe(true);
    expect(r.settimana.find((g) => g.data === '2027-01-01')!.lavorativo).toBe(false);
  });
});
