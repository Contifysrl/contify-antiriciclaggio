import { describe, expect, it } from 'vitest';
import { CNDCEC_2025 } from '../worker/src/domain/rulesets/cndcec-2025';
import { calcolaAutovalutazione, calcolaProfiloCliente, classificaRischio, ErroreDominio } from '../worker/src/domain/risk';
import { prestazioneObbligatoria } from '../worker/src/domain/prestazioni';
import type { Punteggio } from '../worker/src/domain/types';

const RS = CNDCEC_2025;

function inerente(v: Punteggio) {
  return {
    tipologia_clientela: v,
    area_geografica: v,
    canali_distributivi: v,
    servizi_offerti: v,
  };
}
function vulnerabilita(v: Punteggio) {
  return {
    formazione: v,
    organizzazione_adeguata_verifica: v,
    organizzazione_conservazione: v,
    organizzazione_sos: v,
  };
}
function tabA(v: Punteggio) {
  return {
    natura_giuridica: v,
    prevalente_attivita: v,
    comportamento: v,
    area_geografica_cliente: v,
  };
}
function tabB(v: Punteggio) {
  return {
    tipologia: v,
    modalita_svolgimento: v,
    ammontare: v,
    frequenza_durata: v,
    ragionevolezza: v,
    area_geografica_destinazione: v,
  };
}

// ===========================================================================
describe('Regola tecnica n. 1 — autovalutazione dello studio', () => {
  it('applica la ponderazione 40/60 tra rischio inerente e vulnerabilità', () => {
    const e = calcolaAutovalutazione({ inerente: inerente(2), vulnerabilita: vulnerabilita(3) }, RS);
    expect(e.rischioInerente).toBe(2);
    expect(e.vulnerabilita).toBe(3);
    // 2 x 0,40 + 3 x 0,60 = 2,60
    expect(e.rischioResiduo).toBe(2.6);
  });

  it('colloca il punteggio 2,6 nella classe "abbastanza significativo" nonostante l’errore dei float', () => {
    // Senza normalizzazione, 2*0,4 + 3*0,6 in IEEE 754 vale 2,5999999999999996
    // e finirebbe nella classe inferiore. È il classico errore che in sede
    // ispettiva produce un livello di verifica più basso del dovuto.
    const grezzo = 2 * 0.4 + 3 * 0.6;
    expect(grezzo).toBeLessThan(2.6); // conferma che il problema esiste davvero
    const e = calcolaAutovalutazione({ inerente: inerente(2), vulnerabilita: vulnerabilita(3) }, RS);
    expect(e.classe).toBe('ABBASTANZA_SIGNIFICATIVO');
  });

  it('rispetta gli estremi delle classi: 1,6 apre "poco significativo"', () => {
    // inerente 1, vulnerabilità 2 => 0,4 + 1,2 = 1,6
    const e = calcolaAutovalutazione({ inerente: inerente(1), vulnerabilita: vulnerabilita(2) }, RS);
    expect(e.rischioResiduo).toBe(1.6);
    expect(e.classe).toBe('POCO_SIGNIFICATIVO');
  });

  it('resta in "non significativo" appena sotto la soglia', () => {
    // inerente 2, vulnerabilità 1 => 0,8 + 0,6 = 1,4
    const e = calcolaAutovalutazione({ inerente: inerente(2), vulnerabilita: vulnerabilita(1) }, RS);
    expect(e.rischioResiduo).toBe(1.4);
    expect(e.classe).toBe('NON_SIGNIFICATIVO');
  });

  it('include l’estremo superiore 4,0 nella classe "molto significativo"', () => {
    const e = calcolaAutovalutazione({ inerente: inerente(4), vulnerabilita: vulnerabilita(4) }, RS);
    expect(e.rischioResiduo).toBe(4);
    expect(e.classe).toBe('MOLTO_SIGNIFICATIVO');
  });

  it('include l’estremo inferiore 1,0 nella classe "non significativo"', () => {
    const e = calcolaAutovalutazione({ inerente: inerente(1), vulnerabilita: vulnerabilita(1) }, RS);
    expect(e.rischioResiduo).toBe(1);
    expect(e.classe).toBe('NON_SIGNIFICATIVO');
  });

  it('usa la media aritmetica semplice, senza pesi per singolo fattore', () => {
    const e = calcolaAutovalutazione(
      {
        inerente: { tipologia_clientela: 4, area_geografica: 1, canali_distributivi: 1, servizi_offerti: 2 },
        vulnerabilita: vulnerabilita(2),
      },
      RS,
    );
    expect(e.rischioInerente).toBe(2); // (4+1+1+2)/4
  });

  it('rifiuta un fattore mancante indicando quale', () => {
    const parziale: Record<string, Punteggio> = { ...inerente(2) };
    delete parziale.servizi_offerti;
    expect(() => calcolaAutovalutazione({ inerente: parziale, vulnerabilita: vulnerabilita(2) }, RS)).toThrow(
      /Servizi offerti/,
    );
  });

  it('rifiuta punteggi fuori scala', () => {
    expect(() =>
      calcolaAutovalutazione({ inerente: { ...inerente(2), area_geografica: 5 as Punteggio }, vulnerabilita: vulnerabilita(2) }, RS),
    ).toThrow(ErroreDominio);
  });

  it('produce una formula leggibile da riportare nel verbale', () => {
    const e = calcolaAutovalutazione({ inerente: inerente(2), vulnerabilita: vulnerabilita(2) }, RS);
    expect(e.formula).toContain('rischio residuo');
    expect(e.formula).toContain('0.4');
    expect(e.formula).toContain('0.6');
  });
});

// ===========================================================================
describe('Regola tecnica n. 2 — profilo di rischio del cliente', () => {
  it('divide per 10 quando entrambe le tabelle sono compilate', () => {
    const e = calcolaProfiloCliente(
      { prestazione: prestazioneObbligatoria('FINANZA_STRAORDINARIA'), tabellaA: tabA(2), tabellaB: tabB(2) },
      RS,
    );
    expect(e.tabellaBCompilata).toBe(true);
    expect(e.rischioSpecifico).toBe(2); // (8 + 12) / 10
    expect(e.rischioInerente).toBe(4);
    expect(e.rischioEffettivo).toBe(2.6); // 4 x 0,30 + 2 x 0,70
    expect(e.classe).toBe('ABBASTANZA_SIGNIFICATIVO');
    expect(e.livelloApplicabile).toBe('ORDINARIA');
  });

  it('divide per 4 quando la prestazione è esonerata dalla Tabella B', () => {
    const e = calcolaProfiloCliente(
      { prestazione: prestazioneObbligatoria('TENUTA_CONTABILITA'), tabellaA: tabA(2) },
      RS,
    );
    expect(e.tabellaBCompilata).toBe(false);
    expect(e.rischioSpecifico).toBe(2); // 8 / 4
    expect(e.rischioEffettivo).toBe(2.3); // 3 x 0,30 + 2 x 0,70
    expect(e.classe).toBe('POCO_SIGNIFICATIVO');
    // Corrispondenza CNDCEC (Modello AV.1, Informativa n. 57/2026): al rischio
    // poco significativo corrispondono misure di adeguata verifica SEMPLIFICATE.
    expect(e.livelloCalcolato).toBe('SEMPLIFICATA');
    expect(e.formula).toContain('Tabella B non compilata');
  });

  it('associa i livelli di verifica alle classi come da Modello AV.1 (Informativa 57/2026)', () => {
    expect(RS.adeguataVerifica.livelli).toEqual({
      NON_SIGNIFICATIVO: 'SEMPLIFICATA',
      POCO_SIGNIFICATIVO: 'SEMPLIFICATA',
      ABBASTANZA_SIGNIFICATIVO: 'ORDINARIA',
      MOLTO_SIGNIFICATIVO: 'RAFFORZATA',
    });
  });

  it('espone i criteri di valutazione della modulistica CNDCEC per ogni voce delle tabelle', () => {
    for (const voce of [...RS.adeguataVerifica.tabellaA, ...RS.adeguataVerifica.tabellaB]) {
      expect(voce.criteri?.length, voce.codice).toBeGreaterThan(0);
    }
    const naturaGiuridica = RS.adeguataVerifica.tabellaA[0];
    expect(naturaGiuridica.criteri?.join(' ')).toContain('più difficoltosa l’identificazione del titolare effettivo');
    const modalita = RS.adeguataVerifica.tabellaB[1];
    expect(modalita.criteri).toContain('L’utilizzo di valute virtuali');
  });

  it('espone gli ancoraggi dei punteggi del Modello AV.0 per l’autovalutazione', () => {
    const tipologia = RS.autovalutazione.fattoriInerente[0];
    expect(tipologia.descrittoriPunteggio?.[0]).toContain('fino al 10%');
    expect(tipologia.descrittoriPunteggio?.[3]).toContain('superiore al 40%');
    for (const f of RS.autovalutazione.fattoriVulnerabilita) {
      expect(f.descrittoriPunteggio?.[0], f.codice).toContain('presidi completi e strutturati');
      expect(f.descrittoriPunteggio?.[3], f.codice).toContain('presidi insufficienti');
    }
  });

  it('esonera dalla Tabella B revisione legale, contabilità e assistenza continuativa', () => {
    for (const codice of ['REVISIONE_LEGALE', 'TENUTA_CONTABILITA', 'ASSISTENZA_CONTINUATIVA']) {
      expect(prestazioneObbligatoria(codice).esoneroTabellaB).toBe(true);
    }
  });

  it('non chiede la Tabella B alle prestazioni esonerate, anche se fornita', () => {
    const conB = calcolaProfiloCliente(
      { prestazione: prestazioneObbligatoria('REVISIONE_LEGALE'), tabellaA: tabA(3), tabellaB: tabB(1) },
      RS,
    );
    const senzaB = calcolaProfiloCliente(
      { prestazione: prestazioneObbligatoria('REVISIONE_LEGALE'), tabellaA: tabA(3) },
      RS,
    );
    expect(conB.rischioEffettivo).toBe(senzaB.rischioEffettivo);
  });

  it('assegna la verifica semplificata solo alla classe non significativa', () => {
    const e = calcolaProfiloCliente(
      { prestazione: prestazioneObbligatoria('VISTO_CONFORMITA'), tabellaA: tabA(1), tabellaB: tabB(1) },
      RS,
    );
    expect(e.rischioEffettivo).toBe(1);
    expect(e.livelloApplicabile).toBe('SEMPLIFICATA');
  });

  it('assegna la verifica rafforzata alla classe molto significativa', () => {
    const e = calcolaProfiloCliente(
      { prestazione: prestazioneObbligatoria('FINANZA_STRAORDINARIA'), tabellaA: tabA(4), tabellaB: tabB(4) },
      RS,
    );
    expect(e.rischioEffettivo).toBe(4);
    expect(e.livelloApplicabile).toBe('RAFFORZATA');
    expect(e.livelloInnalzatoDaNorma).toBe(false);
  });
});

// ===========================================================================
describe('Vincoli di legge sul livello di adeguata verifica', () => {
  const base = { prestazione: prestazioneObbligatoria('CONSULENZA_TRIBUTARIA'), tabellaA: tabA(1), tabellaB: tabB(1) };

  it('il calcolo da solo darebbe verifica semplificata', () => {
    const e = calcolaProfiloCliente(base, RS);
    expect(e.livelloCalcolato).toBe('SEMPLIFICATA');
  });

  it('la PEP impone la verifica rafforzata a prescindere dal punteggio (art. 24 co. 5 lett. c)', () => {
    const e = calcolaProfiloCliente({ ...base, circostanze: { pep: true } }, RS);
    expect(e.livelloCalcolato).toBe('SEMPLIFICATA');
    expect(e.livelloApplicabile).toBe('RAFFORZATA');
    expect(e.livelloInnalzatoDaNorma).toBe(true);
    expect(e.vincoli.map((v) => v.codice)).toContain('PEP');
  });

  it('la PEP che agisce come organo della PA non fa scattare l’automatismo', () => {
    const e = calcolaProfiloCliente({ ...base, circostanze: { pep: true, pepOrganoPubblico: true } }, RS);
    expect(e.livelloApplicabile).toBe('SEMPLIFICATA');
    expect(e.vincoli.map((v) => v.codice)).toContain('PEP_ORGANO_PA');
    expect(e.vincoli.find((v) => v.codice === 'PEP_ORGANO_PA')?.effetto).toBe('SEGNALA');
  });

  it('il Paese terzo ad alto rischio impone la rafforzata (art. 24 co. 5 lett. a)', () => {
    const e = calcolaProfiloCliente({ ...base, circostanze: { paeseTerzoAltoRischio: true } }, RS);
    expect(e.livelloApplicabile).toBe('RAFFORZATA');
  });

  it('il sospetto di riciclaggio esclude la semplificata e attiva la valutazione della SOS', () => {
    const e = calcolaProfiloCliente({ ...base, circostanze: { sospettoRiciclaggio: true } }, RS);
    expect(e.livelloApplicabile).toBe('ORDINARIA');
    expect(e.valutareSos).toBe(true);
  });

  it('l’impossibilità di completare la verifica impone l’astensione (art. 42 co. 1)', () => {
    const e = calcolaProfiloCliente({ ...base, circostanze: { impossibilitaVerifica: true } }, RS);
    expect(e.astensioneDovuta).toBe(true);
    expect(e.valutareSos).toBe(true);
  });

  it('l’entità con sede in Paese ad alto rischio impone l’astensione (art. 42 co. 2)', () => {
    const e = calcolaProfiloCliente({ ...base, circostanze: { entitaPaeseAltoRischio: true } }, RS);
    expect(e.astensioneDovuta).toBe(true);
  });

  it('non abbassa mai un livello già alto', () => {
    const alto = { prestazione: prestazioneObbligatoria('FINANZA_STRAORDINARIA'), tabellaA: tabA(4), tabellaB: tabB(4) };
    const e = calcolaProfiloCliente({ ...alto, circostanze: { sospettoRiciclaggio: true } }, RS);
    expect(e.livelloApplicabile).toBe('RAFFORZATA'); // VIETA_SEMPLIFICATA non declassa a ORDINARIA
  });
});

// ===========================================================================
describe('Esenzione dell’art. 17 co. 7', () => {
  it('esclude l’obbligo per la mera trasmissione delle dichiarazioni fiscali', () => {
    const e = calcolaProfiloCliente(
      { prestazione: prestazioneObbligatoria('DICHIARAZIONI_FISCALI'), tabellaA: {} },
      RS,
    );
    expect(e.esenteAdeguataVerifica).toBe(true);
    expect(e.vincoli[0].codice).toBe('ESENZIONE_ART_17_7');
    expect(e.controlloCostanteMesi).toBe(0);
  });

  it('esclude l’obbligo per gli adempimenti di amministrazione del personale', () => {
    const e = calcolaProfiloCliente(
      { prestazione: prestazioneObbligatoria('AMMINISTRAZIONE_PERSONALE'), tabellaA: {} },
      RS,
    );
    expect(e.esenteAdeguataVerifica).toBe(true);
  });

  it('l’esenzione cade in presenza di sospetto (art. 17 co. 2 lett. a)', () => {
    const e = calcolaProfiloCliente(
      {
        prestazione: prestazioneObbligatoria('DICHIARAZIONI_FISCALI'),
        tabellaA: tabA(2),
        tabellaB: tabB(2),
        circostanze: { sospettoRiciclaggio: true },
      },
      RS,
    );
    expect(e.esenteAdeguataVerifica).toBe(false);
    expect(e.livelloApplicabile).toBe('ORDINARIA');
  });

  it('l’esenzione cade in presenza di dubbi sull’identificazione (art. 17 co. 2 lett. b)', () => {
    const e = calcolaProfiloCliente(
      {
        prestazione: prestazioneObbligatoria('DICHIARAZIONI_FISCALI'),
        tabellaA: tabA(1),
        tabellaB: tabB(1),
        circostanze: { dubbiIdentificazione: true },
      },
      RS,
    );
    expect(e.esenteAdeguataVerifica).toBe(false);
  });
});

// ===========================================================================
describe('Classificazione', () => {
  it('rifiuta valori fuori scala', () => {
    expect(() => classificaRischio(0.5, RS)).toThrow(ErroreDominio);
    expect(() => classificaRischio(4.5, RS)).toThrow(ErroreDominio);
  });

  it('copre l’intera scala senza buchi né sovrapposizioni', () => {
    for (let v = 1; v <= 4.0001; v += 0.01) {
      const x = Math.min(4, Math.round(v * 100) / 100);
      expect(() => classificaRischio(x, RS)).not.toThrow();
    }
  });
});

// ===========================================================================
describe('Periodicità del controllo costante', () => {
  it('non diventa mai più rada al crescere del rischio e segue il riferimento CNDCEC 36/24/12', () => {
    const p = RS.periodicitaControlloMesi;
    // Le Indicazioni operative (Informativa n. 57/2026) associano la cadenza al
    // livello di verifica: semplificata 36, ordinaria 24, rafforzata 12-6. Le
    // classi non/poco significativo condividono la verifica semplificata,
    // quindi condividono la cadenza.
    expect(p.NON_SIGNIFICATIVO).toBeGreaterThanOrEqual(p.POCO_SIGNIFICATIVO);
    expect(p.POCO_SIGNIFICATIVO).toBeGreaterThan(p.ABBASTANZA_SIGNIFICATIVO);
    expect(p.ABBASTANZA_SIGNIFICATIVO).toBeGreaterThan(p.MOLTO_SIGNIFICATIVO);
    expect(p.POCO_SIGNIFICATIVO).toBe(36);
    expect(p.ABBASTANZA_SIGNIFICATIVO).toBe(24);
    expect(p.MOLTO_SIGNIFICATIVO).toBe(12);
  });

  it('è dichiarata come parametro organizzativo e non come termine di legge', () => {
    expect(RS.periodicitaControlloNormativa).toBe(false);
  });
});
