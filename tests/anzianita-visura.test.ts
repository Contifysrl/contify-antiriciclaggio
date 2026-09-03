import { describe, expect, it } from 'vitest';
import { anzianitaVisura, scadenzaRinnovoVisura } from '../worker/src/domain/scadenze';
import { calcolaAlertAnzianitaVisura } from '../worker/src/domain/alert-titolarita';

describe('anzianità della visura vs cadenza del controllo costante (AR-M20-01)', () => {
  it('visura di 13 mesi con cadenza 12: da rinnovare, scadenza = visura + 12 mesi', () => {
    const e = anzianitaVisura('2025-07-15', 12, '2026-09-03')!;
    expect(e.daRinnovare).toBe(true);
    expect(e.scadeIl).toBe('2026-07-15');
    expect(e.mesiTrascorsi).toBe(13);
  });
  it('visura di 13 mesi con cadenza 24: non ancora', () => {
    const e = anzianitaVisura('2025-07-15', 24, '2026-09-03')!;
    expect(e.daRinnovare).toBe(false);
    expect(e.scadeIl).toBe('2027-07-15');
  });
  it('il giorno della scadenza non è ancora scaduta; il giorno dopo sì', () => {
    expect(anzianitaVisura('2025-09-03', 12, '2026-09-03')!.daRinnovare).toBe(false);
    expect(anzianitaVisura('2025-09-03', 12, '2026-09-04')!.daRinnovare).toBe(true);
  });
  it('senza visura, senza cadenza o con date illeggibili: null', () => {
    expect(anzianitaVisura(null, 12, '2026-09-03')).toBeNull();
    expect(anzianitaVisura('2025-01-01', 0, '2026-09-03')).toBeNull();
    expect(anzianitaVisura('boh', 12, '2026-09-03')).toBeNull();
  });
  it('accetta la data con l’ora (D1 datetime) e conta i mesi interi', () => {
    const e = anzianitaVisura('2024-09-04 10:00:00', 36, '2026-09-03')!;
    expect(e.dataVisura).toBe('2024-09-04');
    expect(e.mesiTrascorsi).toBe(23);
  });
  it('la scadenza dello scadenzario è organizzativa e cita l’art. 19 co. 1 lett. d)', () => {
    const s = scadenzaRinnovoVisura(anzianitaVisura('2025-07-15', 12, '2026-09-03')!, 'MOLTO_SIGNIFICATIVO');
    expect(s.tipo).toBe('RINNOVO_VISURA');
    expect(s.normativa).toBe(false);
    expect(s.data).toBe('2026-07-15');
    expect(s.norma).toContain('art. 19 co. 1 lett. d)');
    expect(s.etichetta).toContain('15/07/2025');
  });
});

describe('alert A12', () => {
  it('scatta con gravità bassa, non bloccante, con azione «Aggiorna da visura»', () => {
    const { alert } = calcolaAlertAnzianitaVisura('2023-01-10', 36, '2026-09-03');
    expect(alert?.codice).toBe('A12');
    expect(alert?.gravita).toBe('bassa');
    expect(alert?.bloccante).toBe(false);
    expect(alert?.azione.tipo).toBe('RINNOVA_VISURA');
    expect(alert?.messaggio).toContain('10/01/2023');
    expect(alert?.messaggio).toContain('36 mesi');
  });
  it('non scatta se la visura è nella cadenza o manca la cadenza', () => {
    expect(calcolaAlertAnzianitaVisura('2026-01-10', 36, '2026-09-03').alert).toBeNull();
    expect(calcolaAlertAnzianitaVisura('2020-01-10', null, '2026-09-03').alert).toBeNull();
  });
});
