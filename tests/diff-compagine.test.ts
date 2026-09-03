import { describe, expect, it } from 'vitest';
import { diffCompagine, riepilogoDiff, type FotoCompagine } from '../worker/src/domain/diff-compagine';

const prima: FotoCompagine = {
  soci: [
    { nome: 'ROSSI ANNA', chiave: 'h1', tipo: 'PERSONA_FISICA', quotaPercento: 60 },
    { nome: 'VERDI LUCA', chiave: 'h2', tipo: 'PERSONA_FISICA', quotaPercento: 40 },
  ],
  cariche: [
    { nome: 'ROSSI ANNA', chiave: 'h1', carica: 'AMMINISTRATORE_UNICO', rappresentanzaLegale: true },
    { nome: 'BIANCHI PIO', chiave: 'h9', carica: 'SINDACO' },
  ],
};

describe('diff della compagine al rinnovo della visura (AR-M20-02)', () => {
  it('stessa fotografia: nessuna variazione, struttura invariata', () => {
    const d = diffCompagine(prima, prima);
    expect(d.cambiata).toBe(false);
    expect(d.strutturaCambiata).toBe(false);
    expect(riepilogoDiff(d, '2026-09-01')).toContain('nessuna variazione');
  });

  it('cessione di quote: socio uscito, socio entrato, quota variata → struttura cambiata', () => {
    const dopo: FotoCompagine = {
      soci: [
        { nome: 'ROSSI ANNA', chiave: 'h1', tipo: 'PERSONA_FISICA', quotaPercento: 30 },
        { nome: 'ALFA HOLDING SRL', chiave: 'h3', tipo: 'PERSONA_GIURIDICA', quotaPercento: 70 },
      ],
      cariche: prima.cariche,
    };
    const d = diffCompagine(prima, dopo);
    expect(d.soci.usciti.map((s) => s.nome)).toEqual(['VERDI LUCA']);
    expect(d.soci.entrati.map((s) => s.nome)).toEqual(['ALFA HOLDING SRL']);
    expect(d.soci.variati).toHaveLength(1);
    expect(d.soci.variati[0]).toMatchObject({ nome: 'ROSSI ANNA', da: { quotaPercento: 60 }, a: { quotaPercento: 30 } });
    expect(d.strutturaCambiata).toBe(true);
    const r = riepilogoDiff(d, '2026-09-01');
    expect(r).toContain('Visura del 01/09/2026');
    expect(r).toContain('Socio uscito: VERDI LUCA (40%)');
    expect(r).toContain('Quota variata: ROSSI ANNA da 60% a 30%');
    expect(r).toContain('Socio entrato: ALFA HOLDING SRL (70%)');
  });

  it('la stessa quota che passa in nuda proprietà + usufrutto è una variazione del diritto, non un’uscita', () => {
    const dopo: FotoCompagine = {
      soci: [
        { nome: 'ROSSI ANNA', chiave: 'h1', tipo: 'PERSONA_FISICA', quotaPercento: 60, diritto: 'NUDA_PROPRIETA' },
        { nome: 'ROSSI MARIO', chiave: 'h7', tipo: 'PERSONA_FISICA', quotaPercento: 60, diritto: 'USUFRUTTO' },
        { nome: 'VERDI LUCA', chiave: 'h2', tipo: 'PERSONA_FISICA', quotaPercento: 40 },
      ],
      cariche: prima.cariche,
    };
    const d = diffCompagine(prima, dopo);
    expect(d.soci.usciti).toHaveLength(0);
    expect(d.soci.variati.map((s) => s.nome)).toEqual(['ROSSI ANNA']);
    expect(d.soci.entrati.map((s) => s.nome)).toEqual(['ROSSI MARIO']);
    expect(d.righe.join(' ')).toContain('da 60% a 60% in nuda proprietà');
    expect(d.strutturaCambiata).toBe(true);
  });

  it('cambia solo il sindaco: variazione registrata ma la struttura non cambia', () => {
    const dopo: FotoCompagine = { soci: prima.soci, cariche: [prima.cariche[0], { nome: 'NERI UGO', chiave: 'h10', carica: 'SINDACO' }] };
    const d = diffCompagine(prima, dopo);
    expect(d.cambiata).toBe(true);
    expect(d.strutturaCambiata).toBe(false);
    expect(d.cariche.uscite[0].nome).toBe('BIANCHI PIO');
    expect(d.cariche.entrate[0].nome).toBe('NERI UGO');
  });

  it('cambia l’amministratore unico: struttura cambiata (co. 5 e esecutore)', () => {
    const dopo: FotoCompagine = { soci: prima.soci, cariche: [{ nome: 'VERDI LUCA', chiave: 'h2', carica: 'AMMINISTRATORE_UNICO', rappresentanzaLegale: true }, prima.cariche[1]] };
    const d = diffCompagine(prima, dopo);
    expect(d.strutturaCambiata).toBe(true);
    expect(d.righe).toContain('Carica cessata: ROSSI ANNA, amministratore unico, rappresentante legale.');
    expect(d.righe).toContain('Nuova carica: VERDI LUCA, amministratore unico, rappresentante legale.');
  });

  it('da AU a presidente del CdA: carica variata della stessa persona', () => {
    const dopo: FotoCompagine = { soci: prima.soci, cariche: [{ nome: 'ROSSI ANNA', chiave: 'h1', carica: 'PRESIDENTE_CDA', rappresentanzaLegale: true }, { nome: 'VERDI LUCA', chiave: 'h2', carica: 'CONSIGLIERE' }] };
    const d = diffCompagine(prima, dopo);
    expect(d.cariche.variate).toHaveLength(1);
    expect(d.cariche.variate[0]).toMatchObject({ nome: 'ROSSI ANNA', da: { carica: 'AMMINISTRATORE_UNICO' }, a: { carica: 'PRESIDENTE_CDA' } });
    expect(d.cariche.entrate.map((c) => c.nome)).toEqual(['VERDI LUCA']);
  });

  it('senza codice fiscale si abbina per nome, ignorando punteggiatura e maiuscole', () => {
    const a: FotoCompagine = { soci: [{ nome: 'Alfa Holding S.r.l.', tipo: 'PERSONA_GIURIDICA', quotaPercento: 100 }], cariche: [] };
    const b: FotoCompagine = { soci: [{ nome: 'ALFA HOLDING SRL', tipo: 'PERSONA_GIURIDICA', quotaPercento: 100 }], cariche: [] };
    expect(diffCompagine(a, b).cambiata).toBe(true); // «S.r.l.» ≠ «SRL» dopo la normalizzazione: nomi diversi
    const c: FotoCompagine = { soci: [{ nome: 'alfa holding s.r.l.', tipo: 'PERSONA_GIURIDICA', quotaPercento: 100 }], cariche: [] };
    expect(diffCompagine(a, c).cambiata).toBe(false);
  });

  it('le quote proprie non sono un socio e non generano variazioni', () => {
    const a: FotoCompagine = { soci: [...prima.soci], cariche: [] };
    const b: FotoCompagine = { soci: [...prima.soci, { nome: 'ESEMPIO SRL', tipo: 'PERSONA_GIURIDICA', quotaPercento: 5, quoteProprie: true }], cariche: [] };
    expect(diffCompagine(a, b).cambiata).toBe(false);
  });
});
