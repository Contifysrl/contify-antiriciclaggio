import { describe, expect, it } from 'vitest';
import {
  calcolaScadenzeFascicolo,
  scadenzaAggiornamentoAutovalutazione,
  scadenzaComunicazioneMef,
  statoScadenze,
} from '../worker/src/domain/scadenze';

describe('Scadenze del fascicolo', () => {
  const base = {
    dataConferimentoIncarico: '2026-01-15',
    classeRischio: 'ABBASTANZA_SIGNIFICATIVO' as const,
    controlloCostanteMesi: 12,
  };

  it('genera il termine di 30 giorni per il completamento della verifica', () => {
    const s = calcolaScadenzeFascicolo(base);
    const v = s.find((x) => x.tipo === 'COMPLETAMENTO_VERIFICA');
    expect(v?.data).toBe('2026-02-14');
    expect(v?.normativa).toBe(true);
  });

  it('genera il termine di 30 giorni per l’acquisizione in conservazione', () => {
    const v = calcolaScadenzeFascicolo(base).find((x) => x.tipo === 'ACQUISIZIONE_CONSERVAZIONE');
    expect(v?.data).toBe('2026-02-14');
    expect(v?.norma).toContain('art. 32');
  });

  it('marca il controllo costante come scelta organizzativa, non come termine di legge', () => {
    const v = calcolaScadenzeFascicolo(base).find((x) => x.tipo === 'CONTROLLO_COSTANTE');
    expect(v?.data).toBe('2027-01-15');
    expect(v?.normativa).toBe(false);
    expect(v?.descrizione).toContain('scelta organizzativa');
  });

  it('fa decorrere il controllo costante dall’ultimo controllo effettuato', () => {
    const v = calcolaScadenzeFascicolo({ ...base, ultimoControllo: '2026-06-30' }).find(
      (x) => x.tipo === 'CONTROLLO_COSTANTE',
    );
    expect(v?.data).toBe('2027-06-30');
  });

  it('non pianifica il controllo costante su un rapporto cessato', () => {
    const s = calcolaScadenzeFascicolo({ ...base, dataCessazione: '2026-05-01' });
    expect(s.find((x) => x.tipo === 'CONTROLLO_COSTANTE')).toBeUndefined();
  });

  it('fa decorrere la conservazione decennale dalla cessazione, non dal conferimento', () => {
    const v = calcolaScadenzeFascicolo({ ...base, dataCessazione: '2026-05-01' }).find(
      (x) => x.tipo === 'FINE_CONSERVAZIONE',
    );
    expect(v?.data).toBe('2036-05-01');
  });

  it('non genera scadenze di verifica per le prestazioni esenti ex art. 17 co. 7', () => {
    expect(calcolaScadenzeFascicolo({ ...base, esenteAdeguataVerifica: true })).toHaveLength(0);
  });
});

describe('Stato delle scadenze', () => {
  const scadenze = calcolaScadenzeFascicolo({
    dataConferimentoIncarico: '2026-01-15',
    classeRischio: 'MOLTO_SIGNIFICATIVO',
    controlloCostanteMesi: 6,
  });

  it('classifica come scadute quelle passate', () => {
    const s = statoScadenze(scadenze, '2026-07-29');
    expect(s.filter((x) => x.stato === 'SCADUTA').length).toBeGreaterThan(0);
    expect(s[0].giorniResidui).toBeLessThan(0);
  });

  it('ordina dalla più urgente alla più lontana', () => {
    const s = statoScadenze(scadenze, '2026-01-20');
    for (let i = 1; i < s.length; i++) {
      expect(s[i].giorniResidui).toBeGreaterThanOrEqual(s[i - 1].giorniResidui);
    }
  });

  it('segnala in scadenza ciò che cade nella finestra di preavviso', () => {
    const s = statoScadenze(scadenze, '2026-01-20', 30);
    expect(s.find((x) => x.tipo === 'COMPLETAMENTO_VERIFICA')?.stato).toBe('IN_SCADENZA');
  });
});

describe('Scadenze di studio', () => {
  it('fissa l’aggiornamento dell’autovalutazione a un anno dalla pubblicazione dell’ANR', () => {
    // Analisi nazionale dei rischi pubblicata il 27.5.2025.
    const s = scadenzaAggiornamentoAutovalutazione('2025-05-27');
    expect(s.data).toBe('2026-05-27');
    expect(s.normativa).toBe(true);
  });

  it('fissa a 30 giorni la comunicazione al MEF', () => {
    expect(scadenzaComunicazioneMef('2026-07-01').data).toBe('2026-07-31');
  });
});
