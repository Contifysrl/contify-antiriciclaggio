import { describe, expect, it } from 'vitest';
import { calcolaCompletezza, mancanzeCliente, REGOLE_COMPLETEZZA, type ClienteCompletezza, type FascicoloCompletezza } from '../worker/src/domain/completezza';
import { calcolaScadenzeFascicolo, statoScadenze } from '../worker/src/domain/scadenze';

const OGGI = '2026-09-03';

function fascicolo(p: Partial<FascicoloCompletezza> & { conferimento: string; firmata?: boolean | null; classe?: any; mesi?: number; esente?: boolean; ultimoControllo?: string | null }): FascicoloCompletezza {
  const valutazione = p.firmata == null ? null : { firmata: p.firmata, classe: p.classe ?? 'POCO_SIGNIFICATIVO', dataValutazione: p.conferimento, controlloCostanteMesi: p.mesi ?? 36 };
  const scadenze = statoScadenze(calcolaScadenzeFascicolo({
    dataConferimentoIncarico: p.conferimento, dataCessazione: p.dataCessazione ?? null, classeRischio: valutazione?.classe ?? 'POCO_SIGNIFICATIVO',
    controlloCostanteMesi: valutazione?.controlloCostanteMesi ?? 0, ultimoControllo: p.ultimoControllo ?? null, esenteAdeguataVerifica: Boolean(p.esente),
    verificaCompletataIl: valutazione?.firmata ? p.conferimento : p.stato === 'ASTENSIONE' ? p.conferimento : null,
  }), OGGI);
  return {
    id: p.id ?? 'f1', codice: p.codice ?? '2026/0001', stato: p.stato ?? 'APERTO', dataConferimento: p.conferimento, dataCessazione: p.dataCessazione ?? null,
    prestazioneCodice: 'CONSULENZA_TRIBUTARIA', esenteVerifica: Boolean(p.esente), valutazione, scadenze, ultimoControllo: p.ultimoControllo ?? null,
  };
}

function cliente(p: Partial<ClienteCompletezza> = {}): ClienteCompletezza {
  return {
    id: 'c1', denominazione: 'ESEMPIO SRL', tipo: 'SOCIETA_CAPITALI', professionista: 'Mario', professionistaId: 'u1', pep: false,
    fascicoli: [], titolariVigenti: 0, documenti: [], proposteAperte: [], screeningDaEsaminare: 0, pepChiesto: false, ...p,
  };
}

const codici = (c: ClienteCompletezza) => mancanzeCliente(c).map((m) => m.codice);

describe('regole di completezza (AR-M19)', () => {
  it('ogni regola cita norma, fonte e quando scatta', () => {
    for (const r of REGOLE_COMPLETEZZA) {
      expect(r.norma.length, r.codice).toBeGreaterThan(5);
      expect(r.fonte.length, r.codice).toBeGreaterThan(10);
      expect(r.quando.length, r.codice).toBeGreaterThan(20);
    }
    expect(new Set(REGOLE_COMPLETEZZA.map((r) => r.codice)).size).toBe(REGOLE_COMPLETEZZA.length);
  });

  it('cliente appena importato: manca solo il fascicolo, il resto viene dopo', () => {
    expect(codici(cliente())).toEqual(['FASCICOLO_ASSENTE']);
  });

  it('fascicolo appena aperto (entro i 30 giorni): valutazione, TE, PEP, documenti, visura, dichiarazione', () => {
    const c = cliente({ fascicoli: [fascicolo({ conferimento: '2026-08-25' })] });
    expect(codici(c)).toEqual(['VALUTAZIONE_ASSENTE', 'TE_ASSENTI', 'VALUTAZIONE_NON_FIRMATA', 'PEP_NON_CHIESTO', 'ID_ASSENTE', 'ART22_ASSENTE', 'VISURA_ASSENTE'].filter((k) => k !== 'VALUTAZIONE_NON_FIRMATA'));
    expect(codici(c)[0]).toBe('VALUTAZIONE_ASSENTE');
  });

  it('trenta giorni superati senza firma: VERIFICA_SCADUTA assorbe la valutazione mancante', () => {
    const c = cliente({ fascicoli: [fascicolo({ conferimento: '2026-06-01' })] });
    const m = mancanzeCliente(c);
    expect(m.map((x) => x.codice)).toContain('VERIFICA_SCADUTA');
    expect(m.map((x) => x.codice)).not.toContain('VALUTAZIONE_ASSENTE');
    expect(m.find((x) => x.codice === 'VERIFICA_SCADUTA')!.giorniResidui).toBeLessThan(0);
  });

  it('valutazione presente ma non firmata entro i 30 giorni', () => {
    const c = cliente({ fascicoli: [fascicolo({ conferimento: '2026-08-28', firmata: false })] });
    expect(codici(c)).toContain('VALUTAZIONE_NON_FIRMATA');
  });

  it('cliente completo: nessuna mancanza', () => {
    const c = cliente({
      fascicoli: [fascicolo({ conferimento: '2026-06-01', firmata: true })], titolariVigenti: 1, pepChiesto: true,
      documenti: [{ tipo: 'DOCUMENTO_IDENTITA', dataRiferimento: null, fascicoloId: null }, { tipo: 'DOCUMENTO_IDENTITA', dataRiferimento: null, fascicoloId: null }, { tipo: 'VISURA', dataRiferimento: null, fascicoloId: null }, { tipo: 'DICHIARAZIONE_ART22', dataRiferimento: null, fascicoloId: 'f1' }],
    });
    expect(codici(c)).toEqual([]);
  });

  it('documento d’identità del titolare effettivo: conteggio esecutore + titolari', () => {
    const base = { fascicoli: [fascicolo({ conferimento: '2026-06-01', firmata: true })], titolariVigenti: 2, pepChiesto: true,
      documenti: [{ tipo: 'VISURA', dataRiferimento: null, fascicoloId: null }, { tipo: 'DICHIARAZIONE_ART22', dataRiferimento: null, fascicoloId: null }] };
    const id = { tipo: 'DOCUMENTO_IDENTITA', dataRiferimento: null, fascicoloId: null };
    expect(codici(cliente({ ...base, documenti: [...base.documenti, id, id] }))).toEqual(['ID_TE_ASSENTE']);
    expect(codici(cliente({ ...base, documenti: [...base.documenti, id, id, id] }))).toEqual([]);
  });

  it('persona fisica: niente titolari, visura o dichiarazione; serve il suo documento e il PEP', () => {
    const c = cliente({ tipo: 'PERSONA_FISICA', fascicoli: [fascicolo({ conferimento: '2026-06-01', firmata: true })] });
    expect(codici(c)).toEqual(['PEP_NON_CHIESTO', 'ID_ASSENTE']);
    expect(codici(cliente({ tipo: 'PERSONA_FISICA', pep: true, fascicoli: [fascicolo({ conferimento: '2026-06-01', firmata: true })], documenti: [{ tipo: 'DOCUMENTO_IDENTITA', dataRiferimento: null, fascicoloId: null }] }))).toEqual([]);
  });

  it('controllo costante scaduto (12 mesi, rischio molto significativo) e chiuso dall’ultimo controllo registrato', () => {
    const completo = { titolariVigenti: 1, pepChiesto: true, documenti: [
      { tipo: 'DOCUMENTO_IDENTITA', dataRiferimento: null, fascicoloId: null }, { tipo: 'DOCUMENTO_IDENTITA', dataRiferimento: null, fascicoloId: null },
      { tipo: 'VISURA', dataRiferimento: null, fascicoloId: null }, { tipo: 'DICHIARAZIONE_ART22', dataRiferimento: null, fascicoloId: null }] };
    const scaduto = cliente({ ...completo, fascicoli: [fascicolo({ conferimento: '2025-01-10', firmata: true, classe: 'MOLTO_SIGNIFICATIVO', mesi: 12 })] });
    expect(codici(scaduto)).toEqual(['CONTROLLO_COSTANTE_SCADUTO']);
    const registrato = cliente({ ...completo, fascicoli: [fascicolo({ conferimento: '2025-01-10', firmata: true, classe: 'MOLTO_SIGNIFICATIVO', mesi: 12, ultimoControllo: '2026-08-01' })] });
    expect(codici(registrato)).toEqual([]);
  });

  it('fascicolo esente ex art. 17 co. 7 o in astensione: niente adempimenti di verifica', () => {
    expect(codici(cliente({ fascicoli: [fascicolo({ conferimento: '2026-01-01', esente: true })] }))).toEqual([]);
    expect(codici(cliente({ fascicoli: [fascicolo({ conferimento: '2026-01-01', stato: 'ASTENSIONE' })] }))).toEqual([]);
  });

  it('fascicolo cessato conta come assente', () => {
    expect(codici(cliente({ fascicoli: [fascicolo({ conferimento: '2024-01-01', stato: 'CESSATO', dataCessazione: '2025-01-01', firmata: true })] }))).toEqual(['FASCICOLO_ASSENTE']);
  });

  it('proposte in attesa e corrispondenze da decidere valgono anche senza fascicolo', () => {
    const c = cliente({ proposteAperte: [{ id: 'p', ambito: 'TITOLARITA', alert: [] }, { id: 'q', ambito: 'RISCHIO_A', alert: [] }], screeningDaEsaminare: 2 });
    const m = mancanzeCliente(c);
    expect(m.map((x) => x.codice)).toEqual(['SCREENING_DA_DECIDERE', 'FASCICOLO_ASSENTE', 'PROPOSTA_DA_RIVEDERE']);
    expect(m.find((x) => x.codice === 'PROPOSTA_DA_RIVEDERE')!.dettaglio).toMatch(/titolarità effettiva/);
  });

  it('cruscotto: ordine per urgenza, classe e scadenza; avanzamento; da dove cominciare', () => {
    const completo = cliente({ id: 'ok', denominazione: 'A POSTO SRL', fascicoli: [fascicolo({ conferimento: '2026-06-01', firmata: true })], titolariVigenti: 1, pepChiesto: true,
      documenti: [{ tipo: 'DOCUMENTO_IDENTITA', dataRiferimento: null, fascicoloId: null }, { tipo: 'DOCUMENTO_IDENTITA', dataRiferimento: null, fascicoloId: null }, { tipo: 'VISURA', dataRiferimento: null, fascicoloId: null }, { tipo: 'DICHIARAZIONE_ART22', dataRiferimento: null, fascicoloId: null }] });
    const nuovo = cliente({ id: 'n', denominazione: 'NUOVO SRL' });
    const scadutoAlto = cliente({ id: 's', denominazione: 'SCADUTO SRL', fascicoli: [fascicolo({ conferimento: '2026-05-01', firmata: false, classe: 'MOLTO_SIGNIFICATIVO' })] });
    const soloFirma = cliente({ id: 'f', denominazione: 'FIRMA SRL', fascicoli: [fascicolo({ conferimento: '2026-08-30', firmata: false })], titolariVigenti: 1, pepChiesto: true,
      documenti: [{ tipo: 'DOCUMENTO_IDENTITA', dataRiferimento: null, fascicoloId: null }, { tipo: 'DOCUMENTO_IDENTITA', dataRiferimento: null, fascicoloId: null }, { tipo: 'VISURA', dataRiferimento: null, fascicoloId: null }, { tipo: 'DICHIARAZIONE_ART22', dataRiferimento: null, fascicoloId: null }] });
    const e = calcolaCompletezza([completo, soloFirma, nuovo, scadutoAlto], OGGI);
    expect(e.clientiAttivi).toBe(4);
    expect(e.clientiCompleti).toBe(1);
    expect(e.avanzamento).toBe(25);
    expect(e.clienti.map((c) => c.id)).toEqual(['s', 'n', 'f']);
    expect(e.clienti[0].urgente).toBe(true);
    expect(e.clienti[2].urgente).toBe(false);
    expect(e.perGravita.alta).toBeGreaterThan(0);
    expect(e.iniziaDa.length).toBe(3);
    expect(e.iniziaDa[0].mancanza.gravita).toBe('alta');
    expect(e.perRegola.find((r) => r.codice === 'VALUTAZIONE_NON_FIRMATA')?.n).toBe(1);
    expect(e.totaleMancanze).toBe(e.perGravita.alta + e.perGravita.media + e.perGravita.bassa);
  });
});
