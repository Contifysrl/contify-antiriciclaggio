import { describe, expect, it } from 'vitest';
import { corpoDichiarazioneArt22, normalizzaRispostaArt22, segnaliDaValutare, DOMANDE_CONTROLLO_BASE, type PrecompilataArt22 } from '../worker/src/lib/dichiarazione-art22';

// AR-M22: la dichiarazione mod. AV.4 apre con scopo e natura della prestazione
// (art. 18 co. 1 lett. c). Test puri: nessun DB, nessun docx binario.

const base = (extra: Partial<PrecompilataArt22> = {}): PrecompilataArt22 => ({
  versione: 1,
  generataIl: '2026-09-11T08:00:00.000Z',
  cliente: { id: 'cli_1', denominazione: 'ESEMPIO SRL', codiceFiscale: '01234567890', partitaIva: '01234567890', tipo: 'SOCIETA_CAPITALI', sede: 'Padova' },
  fonte: { visuraDel: '2026-09-01', dataElencoSoci: '2026-08-30', capitaleSottoscritto: 10000 },
  ripartizione: [{ nome: 'ESPOSITO MARIA', tipo: 'PERSONA_FISICA', quotaPercento: 60, diritto: 'PROPRIETA', quoteProprie: false, paese: 'IT' }],
  cariche: [{ nome: 'ESPOSITO MARIA', carica: 'amministratore unico', rappresentanzaLegale: true }],
  titolariProposti: [{ nominativo: 'ESPOSITO MARIA', criterio: 'PROPRIETA_DIRETTA' as any, etichettaCriterio: 'proprietà diretta (art. 20 co. 2 lett. a)', norma: 'art. 20 co. 2', quota: 60, motivazione: '' }],
  criterioApplicato: 'PROPRIETA_DIRETTA',
  richiedeMotivazioneResiduale: false,
  esecutore: { nominativo: 'ESPOSITO MARIA', carica: 'amministratore unico', codiceFiscale: null },
  domande: DOMANDE_CONTROLLO_BASE,
  alert: [],
  senzaCompagine: false,
  ...extra,
});

const prestazione = { codice: 'TENUTA_CONTABILITA', descrizione: 'Tenuta della contabilità', tipoRapporto: 'CONTINUATIVO' as const, dataConferimento: '2026-09-02', scopoNatura: 'Contabilità ordinaria e adempimenti fiscali dell’attività di commercio al dettaglio' };

const rispostaOk = (scopo: any) => ({
  scopo,
  conferma: 'CONFERMA',
  risposte: DOMANDE_CONTROLLO_BASE.map((d) => ({ domanda: d, risposta: 'NO' })),
  pep: [{ nominativo: 'ESPOSITO MARIA', ruolo: 'TITOLARE_EFFETTIVO', pep: false }],
});

describe('AV.4 — scopo e natura della prestazione', () => {
  it('senza prestazione (dichiarazioni pre-M22, o senza fascicolo) la sezione non si chiede né si stampa', () => {
    const pre = base();
    const esito = normalizzaRispostaArt22(rispostaOk(undefined), pre);
    expect(esito.errore).toBeUndefined();
    expect(esito.risposta?.scopo).toBeNull();
    const corpo = corpoDichiarazioneArt22({ tenant: { denominazione: 'Studio Prova' }, precompilata: pre, risposta: null });
    expect(corpo).not.toContain('Scopo e natura della prestazione richiesta');
    expect(corpo).toContain('1. Assetto proprietario');
    expect(corpo).toContain('mod. AV.4');
  });

  it('con scopo già scritto dallo studio: il cliente deve confermare o precisare', () => {
    const pre = base({ prestazione });
    expect(normalizzaRispostaArt22(rispostaOk(undefined), pre).errore).toMatch(/scopo/);
    expect(normalizzaRispostaArt22(rispostaOk({ conferma: 'PRECISA', testo: '' }), pre).errore).toMatch(/scopo/);
    const conf = normalizzaRispostaArt22(rispostaOk({ conferma: 'CONFERMA' }), pre);
    expect(conf.risposta?.scopo).toEqual({ conferma: 'CONFERMA', testo: null });
    const prec = normalizzaRispostaArt22(rispostaOk({ conferma: 'PRECISA', testo: '  anche la cessione del ramo d’azienda  ' }), pre);
    expect(prec.risposta?.scopo).toEqual({ conferma: 'PRECISA', testo: 'anche la cessione del ramo d’azienda' });
    expect(segnaliDaValutare(prec.risposta!)[0]).toMatch(/scopo della prestazione.*art\. 19 co\. 1 lett\. c/);
    expect(segnaliDaValutare(conf.risposta!)).toHaveLength(0);
  });

  it('senza scopo nel fascicolo: il cliente lo indica lui, e «CONFERMA» senza testo non basta', () => {
    const pre = base({ prestazione: { ...prestazione, scopoNatura: null } });
    expect(normalizzaRispostaArt22(rispostaOk({ conferma: 'CONFERMA' }), pre).errore).toMatch(/scopo/);
    const ok = normalizzaRispostaArt22(rispostaOk({ conferma: 'CONFERMA', testo: 'consulenza per la trasformazione in srl' }), pre);
    expect(ok.risposta?.scopo).toEqual({ conferma: 'PRECISA', testo: 'consulenza per la trasformazione in srl' });
  });

  it('il .docx apre con la sezione 1 «scopo» e rinumera le altre; la trascrizione riporta la precisazione', () => {
    const pre = base({ prestazione });
    const vuoto = corpoDichiarazioneArt22({ tenant: { denominazione: 'Studio Prova' }, precompilata: pre, risposta: null });
    expect(vuoto).toContain('1. Scopo e natura della prestazione richiesta (art. 18 co. 1 lett. c)');
    expect(vuoto).toContain('Tenuta della contabilità');
    expect(vuoto).toContain('conferita il 02.09.2026');
    expect(vuoto).toContain('2. Assetto proprietario');
    expect(vuoto).toContain('6. Dichiarazione di veridicità');
    expect(vuoto).toContain('☐ CONFERMO che lo scopo');
    const r = normalizzaRispostaArt22(rispostaOk({ conferma: 'PRECISA', testo: 'anche la cessione del ramo' }), pre).risposta!;
    const pieno = corpoDichiarazioneArt22({ tenant: { denominazione: 'Studio Prova' }, precompilata: pre, risposta: r });
    expect(pieno).toContain('☒ PRECISO');
    expect(pieno).toContain('anche la cessione del ramo');
    expect(pieno).toContain('☐ CONFERMO che lo scopo');
  });
});
