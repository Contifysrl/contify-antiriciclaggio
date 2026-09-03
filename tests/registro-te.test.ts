import { describe, expect, it } from 'vitest';
import { calcolaAlertRegistroTe } from '../worker/src/domain/alert-titolarita';
import { mancanzeCliente, REGOLE_COMPLETEZZA, type ClienteCompletezza, type FascicoloCompletezza } from '../worker/src/domain/completezza';
import { calcolaScadenzeFascicolo, statoScadenze } from '../worker/src/domain/scadenze';

const OGGI = '2026-09-03';

describe('A13 — difformità col registro dei titolari effettivi (AR-M20-03)', () => {
  it('scatta per DIFFORME e NON_ISCRITTO non segnalati, alta, non bloccante, con l’azione di segnalazione', () => {
    const a = calcolaAlertRegistroTe([
      { id: 'k1', data: '2026-08-01', esito: 'DIFFORME', segnalata: false },
      { id: 'k2', data: '2026-08-02', esito: 'NON_ISCRITTO', segnalata: false },
    ]);
    expect(a.map((x) => x.codice)).toEqual(['A13', 'A13']);
    expect(a[0].gravita).toBe('alta');
    expect(a[0].bloccante).toBe(false);
    expect(a[0].azione).toMatchObject({ tipo: 'SEGNALA_DIFFORMITA', consultazioneId: 'k1' });
    expect(a[0].norma).toContain('art. 21-ter co. 7');
    expect(a[1].titolo).toContain('non iscritto');
  });
  it('tace se segnalata, se corrisponde o se non consultabile', () => {
    expect(calcolaAlertRegistroTe([
      { id: 'k1', data: '2026-08-01', esito: 'DIFFORME', segnalata: true },
      { id: 'k2', data: '2026-08-01', esito: 'CORRISPONDE', segnalata: false },
      { id: 'k3', data: '2026-08-01', esito: 'NON_CONSULTABILE', segnalata: false },
    ])).toEqual([]);
  });
});

function fascicolo(): FascicoloCompletezza {
  const valutazione = { firmata: true, classe: 'POCO_SIGNIFICATIVO' as const, dataValutazione: '2026-05-10', controlloCostanteMesi: 36 };
  const scadenze = statoScadenze(calcolaScadenzeFascicolo({
    dataConferimentoIncarico: '2026-05-10', dataCessazione: null, classeRischio: 'POCO_SIGNIFICATIVO', controlloCostanteMesi: 36, ultimoControllo: null,
    esenteAdeguataVerifica: false, verificaCompletataIl: '2026-05-10',
  }), OGGI);
  return { id: 'f1', codice: '2026/0001', stato: 'COMPLETO', dataConferimento: '2026-05-10', dataCessazione: null, prestazioneCodice: 'CONSULENZA_TRIBUTARIA', esenteVerifica: false, valutazione, scadenze, ultimoControllo: null };
}

function cliente(registroTe: ClienteCompletezza['registroTe'], extra: Partial<ClienteCompletezza> = {}): ClienteCompletezza {
  return {
    id: 'c1', denominazione: 'ESEMPIO SRL', tipo: 'SOCIETA_CAPITALI', professionista: 'Mario', professionistaId: 'u1', pep: false,
    fascicoli: [fascicolo()], titolariVigenti: 1, pepChiesto: true, proposteAperte: [], screeningDaEsaminare: 0,
    documenti: [
      { tipo: 'VISURA', dataRiferimento: '2026-05-01', fascicoloId: null },
      { tipo: 'DOCUMENTO_IDENTITA', dataRiferimento: null, fascicoloId: null }, { tipo: 'DOCUMENTO_IDENTITA', dataRiferimento: null, fascicoloId: null },
      { tipo: 'DICHIARAZIONE_ART22', dataRiferimento: null, fascicoloId: 'f1' },
    ],
    registroTe, ...extra,
  };
}
const codici = (c: ClienteCompletezza) => mancanzeCliente(c, OGGI).map((m) => m.codice);

describe('regole di completezza sul registro TE (art. 21-ter)', () => {
  it('le tre regole nuove citano il D.Lgs. 122/2026', () => {
    for (const k of ['REGISTRO_TE_NON_CONSULTATO', 'REGISTRO_TE_PROVA_ASSENTE', 'DIFFORMITA_NON_SEGNALATA']) {
      expect(REGOLE_COMPLETEZZA.find((r) => r.codice === k)?.norma).toContain('122');
    }
  });
  it('titolari registrati, nessuna consultazione → REGISTRO_TE_NON_CONSULTATO (media)', () => {
    const m = mancanzeCliente(cliente({ titolariRegistratiIl: '2026-05-12', ultima: null, daSegnalare: 0 }), OGGI);
    expect(m.map((x) => x.codice)).toEqual(['REGISTRO_TE_NON_CONSULTATO']);
    expect(m[0].gravita).toBe('media');
  });
  it('consultazione precedente alla fotografia dei titolari: va rifatta', () => {
    expect(codici(cliente({ titolariRegistratiIl: '2026-06-01', ultima: { data: '2026-05-20', esito: 'CORRISPONDE', prova: true }, daSegnalare: 0 }))).toEqual(['REGISTRO_TE_NON_CONSULTATO']);
  });
  it('consultazione corrisponde ma senza estratto → prova assente (bassa); con estratto → a posto', () => {
    expect(codici(cliente({ titolariRegistratiIl: '2026-05-12', ultima: { data: '2026-06-01', esito: 'CORRISPONDE', prova: false }, daSegnalare: 0 }))).toEqual(['REGISTRO_TE_PROVA_ASSENTE']);
    expect(codici(cliente({ titolariRegistratiIl: '2026-05-12', ultima: { data: '2026-06-01', esito: 'CORRISPONDE', prova: true }, daSegnalare: 0 }))).toEqual([]);
  });
  it('difformità non segnalata → alta, prima di tutto', () => {
    const m = mancanzeCliente(cliente({ titolariRegistratiIl: '2026-05-12', ultima: { data: '2026-06-01', esito: 'DIFFORME', prova: false }, daSegnalare: 1 }), OGGI);
    expect(m[0].codice).toBe('DIFFORMITA_NON_SEGNALATA');
    expect(m[0].gravita).toBe('alta');
    expect(m.map((x) => x.codice)).not.toContain('REGISTRO_TE_PROVA_ASSENTE');
  });
  it('non consultabile (motivato) non è una mancanza', () => {
    expect(codici(cliente({ titolariRegistratiIl: '2026-05-12', ultima: { data: '2026-06-01', esito: 'NON_CONSULTABILE', prova: false }, daSegnalare: 0 }))).toEqual([]);
  });
  it('senza titolari registrati la regola non parla del registro (chiede prima i titolari)', () => {
    const m = codici(cliente({ titolariRegistratiIl: null, ultima: null, daSegnalare: 0 }, { titolariVigenti: 0, documenti: [{ tipo: 'VISURA', dataRiferimento: '2026-05-01', fascicoloId: null }, { tipo: 'DOCUMENTO_IDENTITA', dataRiferimento: null, fascicoloId: null }, { tipo: 'DICHIARAZIONE_ART22', dataRiferimento: null, fascicoloId: 'f1' }] }));
    expect(m).toContain('TE_ASSENTI');
    expect(m).not.toContain('REGISTRO_TE_NON_CONSULTATO');
  });
});
