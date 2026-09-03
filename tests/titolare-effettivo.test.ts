import { describe, expect, it } from 'vitest';
import { analizzaTitolaritaEffettiva, type NodoPartecipazione } from '../worker/src/domain/titolare-effettivo';

const pf = (id: string, denominazione: string, extra: Partial<NodoPartecipazione> = {}): NodoPartecipazione => ({
  id,
  denominazione,
  tipo: 'PERSONA_FISICA',
  ...extra,
});
const pg = (id: string, denominazione: string, partecipazioni: Array<{ id: string; quota: number }>): NodoPartecipazione => ({
  id,
  denominazione,
  tipo: 'PERSONA_GIURIDICA',
  partecipazioni,
});

describe('Art. 20 co. 2 — criterio dominicale', () => {
  it('individua la proprietà diretta oltre il 25%', () => {
    const r = analizzaTitolaritaEffettiva('ALFA', [
      pg('ALFA', 'Alfa Srl', [
        { id: 'ROSSI', quota: 0.6 },
        { id: 'BIANCHI', quota: 0.4 },
      ]),
      pf('ROSSI', 'Mario Rossi'),
      pf('BIANCHI', 'Luca Bianchi'),
    ]);
    expect(r.titolari).toHaveLength(2);
    expect(r.titolari[0].denominazione).toBe('Mario Rossi');
    expect(r.titolari[0].quotaEffettiva).toBe(0.6);
    expect(r.criterioApplicato).toBe('PROPRIETA_DIRETTA');
    expect(r.richiedeMotivazioneResiduale).toBe(false);
  });

  it('esclude chi sta esattamente al 25%: la norma richiede una quota superiore', () => {
    const r = analizzaTitolaritaEffettiva('ALFA', [
      pg('ALFA', 'Alfa Srl', [
        { id: 'A', quota: 0.25 },
        { id: 'B', quota: 0.25 },
        { id: 'C', quota: 0.25 },
        { id: 'D', quota: 0.25 },
      ]),
      pf('A', 'Socio A'),
      pf('B', 'Socio B'),
      pf('C', 'Socio C'),
      pf('D', 'Socio D', { poteriAmministrazione: true }),
    ]);
    // Nessuno supera il 25%: si scende al criterio residuale del co. 5.
    expect(r.criterioApplicato).toBe('RESIDUALE_POTERI');
    expect(r.titolari[0].denominazione).toBe('Socio D');
    expect(r.richiedeMotivazioneResiduale).toBe(true);
    expect(r.avvertenze.join(' ')).toContain('co. 6');
  });

  it('moltiplica le quote lungo la catena partecipativa (proprietà indiretta)', () => {
    // Rossi detiene l'80% di Holding, che detiene il 50% di Alfa: 40% effettivo.
    const r = analizzaTitolaritaEffettiva('ALFA', [
      pg('ALFA', 'Alfa Srl', [
        { id: 'HOLD', quota: 0.5 },
        { id: 'VERDI', quota: 0.5 },
      ]),
      pg('HOLD', 'Holding Spa', [
        { id: 'ROSSI', quota: 0.8 },
        { id: 'NERI', quota: 0.2 },
      ]),
      pf('ROSSI', 'Mario Rossi'),
      pf('NERI', 'Anna Neri'),
      pf('VERDI', 'Ugo Verdi'),
    ]);
    const rossi = r.titolari.find((t) => t.id === 'ROSSI');
    expect(rossi?.quotaEffettiva).toBe(0.4);
    expect(rossi?.criterio).toBe('PROPRIETA_INDIRETTA');
    // Neri arriva al 10%: sotto soglia, non è titolare effettivo.
    expect(r.titolari.find((t) => t.id === 'NERI')).toBeUndefined();
  });

  it('somma i percorsi multipli verso la stessa persona fisica', () => {
    // Rossi ha il 15% diretto e il 20% tramite Holding (40% di 50%): 35% totale.
    const r = analizzaTitolaritaEffettiva('ALFA', [
      pg('ALFA', 'Alfa Srl', [
        { id: 'ROSSI', quota: 0.15 },
        { id: 'HOLD', quota: 0.5 },
        { id: 'VERDI', quota: 0.35 },
      ]),
      pg('HOLD', 'Holding Spa', [{ id: 'ROSSI', quota: 0.4 }, { id: 'NERI', quota: 0.6 }]),
      pf('ROSSI', 'Mario Rossi'),
      pf('NERI', 'Anna Neri'),
      pf('VERDI', 'Ugo Verdi'),
    ]);
    const rossi = r.titolari.find((t) => t.id === 'ROSSI');
    expect(rossi?.quotaEffettiva).toBe(0.35);
    expect(rossi?.percorsi).toHaveLength(2);
    // Chi guarda solo il libro soci di Alfa vedrebbe Rossi al 15% e lo
    // escluderebbe: è l'errore che questa funzione esiste per evitare.
  });

  it('interrompe le partecipazioni incrociate senza andare in ricorsione infinita', () => {
    const r = analizzaTitolaritaEffettiva('ALFA', [
      pg('ALFA', 'Alfa Srl', [{ id: 'BETA', quota: 1 }]),
      pg('BETA', 'Beta Srl', [{ id: 'ALFA', quota: 0.9 }, { id: 'ROSSI', quota: 0.1 }]),
      pf('ROSSI', 'Mario Rossi'),
    ]);
    expect(r.avvertenze.join(' ')).toContain('incrociata');
  });
});

describe('Art. 20 co. 3 — criterio del controllo', () => {
  it('individua chi ha influenza dominante quando nessuno supera il 25%', () => {
    const r = analizzaTitolaritaEffettiva('ALFA', [
      pg('ALFA', 'Alfa Srl', [
        { id: 'A', quota: 0.2 },
        { id: 'B', quota: 0.2 },
        { id: 'C', quota: 0.2 },
        { id: 'D', quota: 0.2 },
        { id: 'E', quota: 0.2 },
      ]),
      pf('A', 'Socio A', { controlloNonDominicale: true }),
      pf('B', 'Socio B'),
      pf('C', 'Socio C'),
      pf('D', 'Socio D'),
      pf('E', 'Socio E'),
    ]);
    expect(r.criterioApplicato).toBe('CONTROLLO');
    expect(r.titolari[0].id).toBe('A');
    expect(r.richiedeMotivazioneResiduale).toBe(false);
  });
});

describe('Art. 20 co. 4 — persone giuridiche private', () => {
  it('individua cumulativamente fondatori, beneficiari e amministratori', () => {
    const r = analizzaTitolaritaEffettiva(
      'FOND',
      [
        { id: 'FOND', denominazione: 'Fondazione X', tipo: 'PERSONA_GIURIDICA' },
        pf('F1', 'Fondatore'),
        pf('B1', 'Beneficiario'),
        pf('P1', 'Presidente', { poteriAmministrazione: true }),
      ],
      { personaGiuridicaPrivata: true, fondatori: ['F1'], beneficiari: ['B1'] },
    );
    expect(r.titolari.map((t) => t.id).sort()).toEqual(['B1', 'F1', 'P1']);
    expect(r.criterioApplicato).toBe('PERSONA_GIURIDICA_PRIVATA');
  });
});

describe('Casi limite', () => {
  it('tratta il cliente persona fisica come titolare effettivo di sé, con riserva', () => {
    const r = analizzaTitolaritaEffettiva('PF1', [pf('PF1', 'Giulia Conti')]);
    expect(r.titolari[0].id).toBe('PF1');
    expect(r.avvertenze.join(' ')).toContain('per conto di un terzo');
  });

  it('quando non individua nessuno richiama astensione e segnalazione', () => {
    const r = analizzaTitolaritaEffettiva('ALFA', [pg('ALFA', 'Alfa Srl', [])]);
    expect(r.titolari).toHaveLength(0);
    expect(r.criterioApplicato).toBe('NESSUNO');
    expect(r.avvertenze.join(' ')).toContain('art. 42');
  });

  it('segnala i nodi mancanti invece di ignorarli', () => {
    const r = analizzaTitolaritaEffettiva('ALFA', [pg('ALFA', 'Alfa Srl', [{ id: 'IGNOTO', quota: 1 }])]);
    expect(r.avvertenze.join(' ')).toContain('IGNOTO');
  });
});

// ── AR-M17: soglia dal ruleset, diritti sulle quote, quote proprie, cariche ──

describe('AR-M17 — soglia dal ruleset vigente', () => {
  const quattroSoci = () => [
    pg('ALFA', 'Alfa Srl', [
      { id: 'A', quota: 0.25 },
      { id: 'B', quota: 0.25 },
      { id: 'C', quota: 0.25 },
      { id: 'D', quota: 0.25 },
    ]),
    pf('A', 'Socio A'),
    pf('B', 'Socio B'),
    pf('C', 'Socio C'),
    pf('D', 'Socio D'),
  ];

  it('con il DLgs. 231/2007 il 25% esatto non basta e lo dice nelle avvertenze', () => {
    const r = analizzaTitolaritaEffettiva('ALFA', quattroSoci(), { data: '2026-09-03' });
    expect(r.parametri.rulesetId).toBe('cndcec-2025');
    expect(r.criterioApplicato).toBe('NESSUNO');
    expect(r.quotePersoneFisiche).toHaveLength(4);
    expect(r.avvertenze.join(' ')).toContain('superiore al 25%');
  });

  it('dal 10.7.2027 (Reg. UE 2024/1624 art. 52) «25% o più»: tutti e quattro sono titolari effettivi', () => {
    const r = analizzaTitolaritaEffettiva('ALFA', quattroSoci(), { data: '2027-07-10' });
    expect(r.parametri.rulesetId).toBe('amlr-2027');
    expect(r.parametri.sogliaInclusiva).toBe(true);
    expect(r.titolari.map((t) => t.id).sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(r.titolari[0].norma).toContain('2024/1624');
  });

  it('25.000 su 100.000 non diventa 0,2499 per colpa dei decimali', () => {
    const r = analizzaTitolaritaEffettiva('ALFA', [
      pg('ALFA', 'Alfa Srl', [{ id: 'A', quota: 25000 / 100000 }, { id: 'B', quota: 75000 / 100000 }]),
      pf('A', 'Socio A'), pf('B', 'Socio B'),
    ], { data: '2027-08-01' });
    expect(r.titolari.map((t) => t.id).sort()).toEqual(['A', 'B']);
  });
});

describe('AR-M17 — diritti sulle quote', () => {
  it('l’usufruttuario non conta per il co. 2 ma viene segnalato come vincolo (materia del co. 3)', () => {
    const r = analizzaTitolaritaEffettiva('ALFA', [
      pg('ALFA', 'Alfa Srl', [
        { id: 'NUDO', quota: 0.6, diritto: 'NUDA_PROPRIETA' },
        { id: 'USUF', quota: 0.6, diritto: 'USUFRUTTO' },
        { id: 'ALTRO', quota: 0.4 },
      ]),
      pf('NUDO', 'Nudo Proprietario'), pf('USUF', 'Usufruttuario'), pf('ALTRO', 'Altro Socio'),
    ]);
    expect(r.titolari.map((t) => t.id).sort()).toEqual(['ALTRO', 'NUDO']);
    expect(r.vincoliSulleQuote).toEqual([
      expect.objectContaining({ soggettoId: 'USUF', diritto: 'USUFRUTTO', quota: 0.6, partecipataId: 'ALFA' }),
    ]);
  });

  it('esclude le quote proprie dal denominatore (art. 2357-ter c.c.)', () => {
    // Alfa detiene il 20% di sé stessa; Rossi ha il 24% nominale → 30% sul capitale votante.
    const r = analizzaTitolaritaEffettiva('ALFA', [
      pg('ALFA', 'Alfa Srl', [
        { id: 'ALFA', quota: 0.2 },
        { id: 'ROSSI', quota: 0.24 },
        { id: 'BIANCHI', quota: 0.56 },
      ]),
      pf('ROSSI', 'Mario Rossi'), pf('BIANCHI', 'Luca Bianchi'),
    ]);
    expect(r.quoteProprie).toEqual([{ partecipataId: 'ALFA', quota: 0.2 }]);
    const rossi = r.titolari.find((t) => t.id === 'ROSSI');
    expect(rossi?.quotaEffettiva).toBe(0.3);
    expect(r.avvertenze.join(' ')).toContain('2357-ter');
  });

  it('non risale le fiduciarie: interposizione, il titolare è il fiduciante', () => {
    const r = analizzaTitolaritaEffettiva('ALFA', [
      pg('ALFA', 'Alfa Srl', [{ id: 'FID', quota: 0.7 }, { id: 'ROSSI', quota: 0.3 }]),
      { id: 'FID', denominazione: 'Fiduciaria Spa', tipo: 'PERSONA_GIURIDICA', fiduciaria: true, partecipazioni: [{ id: 'X', quota: 1 }] },
      pf('X', 'Socio della fiduciaria'), pf('ROSSI', 'Mario Rossi'),
    ]);
    expect(r.titolari.map((t) => t.id)).toEqual(['ROSSI']);
    expect(r.avvertenze.join(' ')).toContain('fiduciante');
  });
});

describe('AR-M17 — cariche in ingresso per il criterio residuale', () => {
  it('propone gli amministratori con poteri dalla visura, non i consiglieri senza deleghe', () => {
    const r = analizzaTitolaritaEffettiva('ALFA', [
      pg('ALFA', 'Alfa Srl', [{ id: 'A', quota: 0.2 }, { id: 'B', quota: 0.2 }, { id: 'C', quota: 0.2 }, { id: 'D', quota: 0.2 }, { id: 'E', quota: 0.2 }]),
      pf('A', 'Socio A'), pf('B', 'Socio B'), pf('C', 'Socio C'), pf('D', 'Socio D'), pf('E', 'Socio E'),
    ], {
      cariche: [
        { id: 'A', nome: 'Socio A', carica: 'PRESIDENTE_CDA', rappresentanzaLegale: true },
        { id: 'B', nome: 'Socio B', carica: 'CONSIGLIERE_DELEGATO' },
        { id: 'C', nome: 'Socio C', carica: 'CONSIGLIERE' },
        { id: 'S1', nome: 'Sindaco Uno', carica: 'SINDACO' },
      ],
    });
    expect(r.criterioApplicato).toBe('RESIDUALE_POTERI');
    expect(r.titolari.map((t) => t.id).sort()).toEqual(['A', 'B']);
    expect(r.titolari.find((t) => t.id === 'A')?.motivazione).toContain('presidente del consiglio');
    expect(r.richiedeMotivazioneResiduale).toBe(true);
  });
});
