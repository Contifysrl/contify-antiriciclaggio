import { describe, expect, it } from 'vitest';
import {
  SOGLIE_AVVISO_CANONE,
  bloccoPerStato,
  giorniAllaScadenza,
  statoValido,
} from '../worker/src/lib/licenza';

describe('Stato commerciale del tenant (AR-M6)', () => {
  it('un tenant attivo non è mai bloccato', () => {
    expect(bloccoPerStato('attivo', 'GET', '/api/fascicoli')).toBeNull();
    expect(bloccoPerStato('attivo', 'POST', '/api/clienti')).toBeNull();
  });

  it('sospeso: la lettura passa, la scrittura no', () => {
    expect(bloccoPerStato('sospeso', 'GET', '/api/fascicoli')).toBeNull();
    expect(bloccoPerStato('sospeso', 'GET', '/api/audit/export')).toBeNull();
    const b = bloccoPerStato('sospeso', 'POST', '/api/clienti');
    expect(b?.codice).toBe('tenant_sospeso');
    expect(b?.status).toBe(403);
  });

  it('sospeso: assistenza e backup manuale restano possibili', () => {
    expect(bloccoPerStato('sospeso', 'POST', '/api/assistenza')).toBeNull();
    expect(bloccoPerStato('sospeso', 'POST', '/api/backup')).toBeNull();
  });

  it('sospeso: ripristino ed eliminazione archivio restano bloccati (sono scritture)', () => {
    expect(bloccoPerStato('sospeso', 'POST', '/api/backup/ripristina')?.codice).toBe('tenant_sospeso');
    expect(bloccoPerStato('sospeso', 'POST', '/api/backup/elimina-archivio')?.codice).toBe('tenant_sospeso');
  });

  it('cessato: tutto chiuso tranne le rotte di autenticazione', () => {
    expect(bloccoPerStato('cessato', 'GET', '/api/fascicoli')?.codice).toBe('tenant_cessato');
    expect(bloccoPerStato('cessato', 'POST', '/api/assistenza')?.codice).toBe('tenant_cessato');
    expect(bloccoPerStato('cessato', 'POST', '/api/auth/logout')).toBeNull();
    expect(bloccoPerStato('cessato', 'POST', '/api/auth/cambia-password')).toBeNull();
  });

  it('uno stato imprevisto degrada ad attivo, mai a un blocco accidentale', () => {
    expect(statoValido('boh')).toBe('attivo');
    expect(statoValido(null)).toBe('attivo');
    expect(statoValido('sospeso')).toBe('sospeso');
  });
});

describe('Giorni alla scadenza del canone', () => {
  const oggi = new Date('2026-08-02T21:30:00+02:00'); // sera italiana: il caso che sbaglierebbe

  it('conta per giorni di calendario, non per istanti', () => {
    expect(giorniAllaScadenza('2026-08-02', oggi)).toBe(0);
    expect(giorniAllaScadenza('2026-08-03', oggi)).toBe(1);
    expect(giorniAllaScadenza('2026-09-01', oggi)).toBe(30);
    expect(giorniAllaScadenza('2026-07-26', oggi)).toBe(-7);
  });

  it('senza scadenza (o con data invalida) non scatta nulla', () => {
    expect(giorniAllaScadenza(null, oggi)).toBeNull();
    expect(giorniAllaScadenza('non-una-data', oggi)).toBeNull();
  });

  it('le soglie coprono prima e dopo la scadenza', () => {
    expect(SOGLIE_AVVISO_CANONE).toContain(30);
    expect(SOGLIE_AVVISO_CANONE).toContain(0);
    expect(SOGLIE_AVVISO_CANONE).toContain(-30);
  });
});
