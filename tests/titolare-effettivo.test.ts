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
