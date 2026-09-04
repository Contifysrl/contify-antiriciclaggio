import { describe, expect, it } from 'vitest';
import { ErroreAi, aiAbilitata, classificaSettore, controllaPayload, estraiJsonArray, estraiJsonOggetto, numeriDelTesto, prefiltraSubIndici, validaRiscritturaFatti } from '../worker/src/lib/ai';
import { compilaDizionario } from '../worker/src/lib/pseudonimi';
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

  it('cintura di sicurezza (AR-M21, AI-01): un nome del dizionario o un CF sopravvissuti → la chiamata non parte (422)', () => {
    const dizionario = compilaDizionario([{ tipo: 'PF', nome: 'Rossi Mario' }]);
    expect(() => controllaPayload({ sistema: 's', utente: 'Il socio [PF_1] ha il 40%.', maxTokens: 1, dizionario })).not.toThrow();
    let errore: unknown;
    try { controllaPayload({ sistema: 's', utente: 'Il socio Mario Rossi ha il 40%.', maxTokens: 1, dizionario }); } catch (e) { errore = e; }
    expect(errore).toBeInstanceOf(ErroreAi);
    expect((errore as ErroreAi).status).toBe(422);
    expect((errore as ErroreAi).codice).toBe('dati_identificativi');
    expect((errore as ErroreAi).residui).toEqual(['PF']);
    // Vale anche sulla conversazione: basta un turno sporco.
    expect(() => controllaPayload({ sistema: 's', messaggi: [{ role: 'user', content: 'ok' }, { role: 'assistant', content: 'CF RSSMRA80A01H501U' }], maxTokens: 1, dizionario })).toThrow(ErroreAi);
  });

  describe('AR-M21 AI-02 — validazione dei fatti sui numeri', () => {
    const fatti =
      'Risulta dalla visura camerale estratta il 10/07/2026 che il capitale sociale di euro 30.000,00 di [PG_1] è così ripartito: ' +
      '[PF_1] 25%; [PF_2] 25%; [PF_3] 25%; [PF_4] 25%. Nessuna persona fisica detiene una partecipazione superiore al 25% del capitale ' +
      '(art. 20 co. 2 DLgs. 231/2007). La visura non evidenzia diritti particolari ex art. 2468 co. 3 c.c. Si applica il criterio residuale dell’art. 20 co. 5.';

    it('estrae i numeri normalizzati (migliaia, decimali, zeri iniziali) e ignora i segnaposto', () => {
      expect([...numeriDelTesto('euro 30.000,00 il 07/09/2026, quota 25,50% e 33,33%, [PF_12], art. 2468')].sort()).toEqual(
        ['2026', '2468', '25.5', '30000', '33.33', '7', '9'].sort(),
      );
    });

    it('testo coerente → ok (numeri riordinati, frasi spezzate, formato 30000 vs 30.000,00)', () => {
      const riscritto =
        'Dalla visura camerale del 10/07/2026 risulta che il capitale di [PG_1], pari a 30000 euro, è diviso in quattro quote del 25% ' +
        '([PF_1], [PF_2], [PF_3], [PF_4]). Nessuno supera il 25% (art. 20 co. 2 DLgs. 231/2007); non ci sono diritti particolari ' +
        'ex art. 2468 co. 3 c.c. Si applica quindi il criterio residuale dell’art. 20 co. 5.';
      expect(validaRiscritturaFatti(fatti, riscritto)).toEqual({ ok: true, mancanti: [], nuovi: [] });
    });

    it('numero mancante → scarto', () => {
      const senzaCapitale = fatti.replace(' di euro 30.000,00', '');
      const v = validaRiscritturaFatti(fatti, senzaCapitale);
      expect(v.ok).toBe(false);
      expect(v.mancanti).toEqual(['30000']);
      expect(v.nuovi).toEqual([]);
    });

    it('numero nuovo (una percentuale o una data inventata) → scarto', () => {
      const v = validaRiscritturaFatti(fatti, fatti + ' La quota di controllo è del 50% dal 2019.');
      expect(v.ok).toBe(false);
      expect(v.nuovi.sort()).toEqual(['2019', '50']);
    });

    it('un numero cambiato è insieme mancante e nuovo', () => {
      const v = validaRiscritturaFatti(fatti, fatti.replace('30.000,00', '300.000,00'));
      expect(v).toEqual({ ok: false, mancanti: ['30000'], nuovi: ['300000'] });
    });
  });

  describe('AR-M21 AI-03 — classificazione del settore', () => {
    const voci = [{ codice: 'COMPRO_ORO', etichetta: 'Compro oro', motivo: 'm' }, { codice: 'GIOCO', etichetta: 'Gioco', motivo: 'm' }];
    const env: any = { AI_FIXTURES: '1' };

    it('estraiJsonOggetto tollera testo attorno', () => {
      expect(estraiJsonOggetto('Ecco: {"codice":"GIOCO","motivo":"x"} fine')).toEqual({ codice: 'GIOCO', motivo: 'x' });
      expect(estraiJsonOggetto('niente')).toBeNull();
    });

    it('fixture: oggetto sociale con «monili … lingotti» → COMPRO_ORO; testo neutro → NESSUNO (codice null)', async () => {
      const a = await classificaSettore(env, 'Oggetto sociale: acquisto e rivendita di monili usati e lingotti', voci);
      expect(a.esito.codice).toBe('COMPRO_ORO');
      const b = await classificaSettore(env, 'Oggetto sociale: consulenza informatica', voci);
      expect(b.esito.codice).toBeNull();
      expect(b.esito.motivo).toMatch(/nessun settore/i);
    });

    it('il testo passa dalla pseudonimizzazione (la denominazione nell’oggetto sociale diventa un segnaposto)', async () => {
      const dizionario = compilaDizionario([{ tipo: 'PG', nome: 'Gioielleria Zancanaro Srl' }]);
      const r = await classificaSettore(env, 'Oggetto sociale: la Gioielleria Zancanaro Srl compra monili usati', voci, dizionario);
      expect(r.pseudonimi).toBe(1);
      expect(r.esito.codice).toBe('COMPRO_ORO');
    });
  });
});
