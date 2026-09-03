import { describe, expect, it } from 'vitest';
import { analizzaTitolaritaEffettiva, type NodoPartecipazione, type Partecipazione } from '../worker/src/domain/titolare-effettivo';
import { calcolaAlertTitolarita } from '../worker/src/domain/alert-titolarita';

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

describe('AR-M20-04 — Reg. (UE) 2024/1624 dal 10.7.2027: controllo in parallelo e art. 54', () => {
  const D = { data: '2027-07-10' };
  const oggi = { data: '2026-09-03' };
  const pf2 = (id: string, nome: string, extra: Partial<NodoPartecipazione> = {}): NodoPartecipazione => ({ id, denominazione: nome, tipo: 'PERSONA_FISICA', ...extra });
  const pg2 = (id: string, nome: string, partecipazioni: Partecipazione[]): NodoPartecipazione => ({ id, denominazione: nome, tipo: 'PERSONA_GIURIDICA', partecipazioni });

  // Holding al 30% del cliente, controllata al 51% da Tizio: prodotto 15,3%.
  const struttura54a = () => [
    pg2('CLI', 'Cliente Srl', [{ id: 'HOLD', quota: 0.3 }, { id: 'A', quota: 0.35 }, { id: 'B', quota: 0.35 }]),
    pg2('HOLD', 'Holding Srl', [{ id: 'TIZIO', quota: 0.51 }, { id: 'CAIO', quota: 0.49 }]),
    pf2('A', 'Socio A'), pf2('B', 'Socio B'), pf2('TIZIO', 'Tizio'), pf2('CAIO', 'Caio'),
  ];

  it('oggi (art. 20): Tizio al 15,3% non è titolare effettivo', () => {
    const r = analizzaTitolaritaEffettiva('CLI', struttura54a(), oggi);
    expect(r.titolari.map((t) => t.id).sort()).toEqual(['A', 'B']);
  });

  it('dal 2027 (art. 54 lett. a): Tizio controlla la holding che ha il 30% diretto → titolare effettivo per controllo', () => {
    const r = analizzaTitolaritaEffettiva('CLI', struttura54a(), D);
    expect(r.parametri.regime).toBe('PARALLELO_AMLR');
    expect(r.titolari.map((t) => t.id).sort()).toEqual(['A', 'B', 'TIZIO']);
    const tizio = r.titolari.find((t) => t.id === 'TIZIO')!;
    expect(tizio.criterio).toBe('CONTROLLO');
    expect(tizio.norma).toContain('art. 54 lett. a)');
    expect(tizio.motivazione).toContain('30.00%');
    expect(r.criterioApplicato).toBe('PROPRIETA_DIRETTA');
    expect(r.richiedeMotivazioneResiduale).toBe(false);
  });

  it('art. 54 lett. a) non scatta se la quota diretta dell’intermedia è sotto soglia (20%)', () => {
    const nodi = struttura54a();
    nodi[0] = pg2('CLI', 'Cliente Srl', [{ id: 'HOLD', quota: 0.2 }, { id: 'A', quota: 0.4 }, { id: 'B', quota: 0.4 }]);
    const r = analizzaTitolaritaEffettiva('CLI', nodi, D);
    expect(r.titolari.map((t) => t.id).sort()).toEqual(['A', 'B']);
  });

  // Holding al 60% del cliente (controllo); Sempronio ha il 30% della holding: prodotto 18%.
  const struttura54b = () => [
    pg2('CLI', 'Cliente Srl', [{ id: 'HOLD', quota: 0.6 }, { id: 'A', quota: 0.4 }]),
    pg2('HOLD', 'Holding Srl', [{ id: 'SEMP', quota: 0.3 }, { id: 'MEVIO', quota: 0.7 }]),
    pf2('A', 'Socio A'), pf2('SEMP', 'Sempronio'), pf2('MEVIO', 'Mevio'),
  ];

  it('oggi: Sempronio (18% indiretto) non è titolare; Mevio (42%) sì', () => {
    const r = analizzaTitolaritaEffettiva('CLI', struttura54b(), oggi);
    expect(r.titolari.map((t) => t.id).sort()).toEqual(['A', 'MEVIO']);
  });

  it('dal 2027 (art. 54 lett. b): Sempronio ha il 30% della holding che controlla il cliente → titolare effettivo', () => {
    const r = analizzaTitolaritaEffettiva('CLI', struttura54b(), D);
    expect(r.titolari.map((t) => t.id).sort()).toEqual(['A', 'MEVIO', 'SEMP']);
    const s = r.titolari.find((t) => t.id === 'SEMP')!;
    expect(s.norma).toContain('art. 54 lett. b)');
    // Mevio resta per proprietà (42%), con la nota del controllo.
    const m = r.titolari.find((t) => t.id === 'MEVIO')!;
    expect(m.criterio).toBe('PROPRIETA_INDIRETTA');
    expect(m.motivazione).toContain('art. 54 lett. b)');
  });

  it('art. 54 lett. b) a catena: chi controlla la controllante della controllante', () => {
    const nodi = [
      pg2('CLI', 'Cliente Srl', [{ id: 'H1', quota: 0.55 }, { id: 'A', quota: 0.45 }]),
      pg2('H1', 'Holding Uno', [{ id: 'H2', quota: 0.6 }, { id: 'X', quota: 0.4 }]),
      pg2('H2', 'Holding Due', [{ id: 'Y', quota: 0.3 }, { id: 'Z', quota: 0.7 }]),
      pf2('A', 'A'), pf2('X', 'X'), pf2('Y', 'Y'), pf2('Z', 'Z'),
    ];
    const r = analizzaTitolaritaEffettiva('CLI', nodi, D);
    // Per proprietà: A 45%, Z 0.55*0.6*0.7 = 23,1% (no), X 22% (no), Y 9,9% (no).
    // Art. 54 b): H1 controlla CLI, H2 controlla H1 → chi ha ≥25% in H1 (X 40%, Z 42%, Y 18% no) e in H2 (Y 30%, Z 70%).
    expect(r.titolari.map((t) => t.id).sort()).toEqual(['A', 'X', 'Y', 'Z']);
  });

  it('art. 51: il controllo con altri mezzi si aggiunge anche se la proprietà individua già qualcuno', () => {
    const r = analizzaTitolaritaEffettiva('CLI', [
      pg2('CLI', 'Cliente Srl', [{ id: 'A', quota: 0.6 }, { id: 'B', quota: 0.4 }]),
      pf2('A', 'A'), pf2('B', 'B'), pf2('PATTO', 'Chi ha il patto', { controlloNonDominicale: true }),
    ], D);
    expect(r.titolari.map((t) => t.id).sort()).toEqual(['A', 'B', 'PATTO']);
    expect(r.titolari.find((t) => t.id === 'PATTO')!.norma).toContain('art. 53 par. 3-4');
    // Oggi invece il co. 3 si applica solo se il co. 2 non individua nessuno.
    const r25 = analizzaTitolaritaEffettiva('CLI', [
      pg2('CLI', 'Cliente Srl', [{ id: 'A', quota: 0.6 }, { id: 'B', quota: 0.4 }]),
      pf2('A', 'A'), pf2('B', 'B'), pf2('PATTO', 'Chi ha il patto', { controlloNonDominicale: true }),
    ], oggi);
    expect(r25.titolari.map((t) => t.id).sort()).toEqual(['A', 'B']);
  });

  it('dal 2027 il residuale cita l’art. 63 par. 4 e la catena incompleta ferma comunque il motore', () => {
    const r = analizzaTitolaritaEffettiva('CLI', [
      pg2('CLI', 'Cliente Srl', [{ id: 'A', quota: 0.2 }, { id: 'B', quota: 0.2 }, { id: 'C', quota: 0.2 }, { id: 'D', quota: 0.2 }, { id: 'E', quota: 0.2 }]),
      pf2('A', 'A'), pf2('B', 'B'), pf2('C', 'C'), pf2('D', 'D'), pf2('E', 'E'),
    ], { ...D, cariche: [{ id: 'A', nome: 'A', carica: 'AMMINISTRATORE_UNICO', rappresentanzaLegale: true }] });
    expect(r.criterioApplicato).toBe('RESIDUALE_POTERI');
    expect(r.titolari[0].norma).toContain('art. 63 par. 4');
    expect(r.richiedeMotivazioneResiduale).toBe(true);
    const inc = analizzaTitolaritaEffettiva('CLI', [
      pg2('CLI', 'Cliente Srl', [{ id: 'IGN', quota: 0.8 }, { id: 'A', quota: 0.2 }]),
      { id: 'IGN', denominazione: 'Ignota Srl', tipo: 'PERSONA_GIURIDICA' }, pf2('A', 'A'),
    ], D);
    expect(inc.criterioApplicato).toBe('NESSUNO');
    expect(inc.nodiIrrisolti).toHaveLength(1);
    expect(inc.richiedeMotivazioneResiduale).toBe(false);
  });

  it('gli alert non gridano A1 quando il 2027 ha già individuato titolari per controllo', () => {
    const analisi = analizzaTitolaritaEffettiva('CLI', [
      pg2('CLI', 'Cliente Srl', [{ id: 'HOLD', quota: 0.6 }, { id: 'A', quota: 0.2 }, { id: 'B', quota: 0.2 }]),
      pg2('HOLD', 'Holding Srl', [{ id: 'S1', quota: 0.4 }, { id: 'S2', quota: 0.3 }, { id: 'S3', quota: 0.3 }]),
      pf2('A', 'A'), pf2('B', 'B'), pf2('S1', 'S1'), pf2('S2', 'S2'), pf2('S3', 'S3'),
    ], D);
    // Proprietà: S1 24% (no, sotto 25), S2/S3 18%, A/B 20%: nessuno. Art. 54 b): S1, S2, S3 hanno ≥25% della controllante.
    expect(analisi.titolari.map((t) => t.id).sort()).toEqual(['S1', 'S2', 'S3']);
    const alert = calcolaAlertTitolarita({
      denominazione: 'Cliente Srl', tipoCliente: 'SOCIETA_CAPITALI', analisi,
      soci: [
        { id: 'HOLD', nome: 'Holding Srl', tipo: 'PERSONA_GIURIDICA', quota: 0.6, diritto: 'PROPRIETA', clienteStudio: { id: 'c-hold', denominazione: 'Holding Srl' } },
        { id: 'A', nome: 'A', tipo: 'PERSONA_FISICA', quota: 0.2, diritto: 'PROPRIETA' },
        { id: 'B', nome: 'B', tipo: 'PERSONA_FISICA', quota: 0.2, diritto: 'PROPRIETA' },
      ],
      cariche: [], paeseAltoRischio: () => false,
    });
    expect(alert.map((a) => a.codice)).not.toContain('A1');
    expect(alert.map((a) => a.codice)).not.toContain('A3');
  });
});
