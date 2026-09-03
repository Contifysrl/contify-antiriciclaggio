import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { leggiVisura, numeroIt, dataIso, tipoSoggetto } from '../web/src/lib/visura';
import { ricomponiRighe } from '../web/src/lib/visura-testo';

// Le fixture in tests/fixtures/visure/ sono testo a righe/celle prodotto da
// `node scripts/visura-testo.mjs <pdf>` e ANONIMIZZATO a mano (nomi, CF,
// indirizzi, PEC) lasciando intatto il layout:
//  - srl-due-soci-pf.txt          → visura VERA (InfoCamere, 3.12.2025, SRL a 2 soci PF)
//  - le altre                      → SINTETICHE sullo stesso layout, in attesa
//                                     delle visure campione (PRE-01/02): da
//                                     riconfermare appena arrivano quelle vere.

const fx = (nome: string) => fs.readFileSync(path.join(__dirname, 'fixtures', 'visure', nome), 'utf8');

describe('ricomponiRighe — dai frammenti pdfjs alle righe/celle', () => {
  it('separa etichetta e valore con una tabulazione e marca le continuazioni', () => {
    const righe = ricomponiRighe([
      { str: 'Numero REA', x: 24, y: 700, larghezza: 50 },
      { str: ' ', x: 74, y: 700, larghezza: 70 }, // spaziatore InfoCamere
      { str: 'PD - 488588', x: 148, y: 700, larghezza: 60 },
      { str: 'seconda riga del valore', x: 148, y: 688, larghezza: 100 },
      { str: 'Parola', x: 24, y: 676, larghezza: 30 },
      { str: 'attaccata', x: 55, y: 676.5, larghezza: 30 },
    ]);
    expect(righe).toEqual(['Numero REA\tPD - 488588', '\tseconda riga del valore', 'Parola attaccata']);
  });

  it('ordina dall’alto in basso anche se i frammenti arrivano in disordine', () => {
    const righe = ricomponiRighe([
      { str: 'basso', x: 24, y: 100, larghezza: 10 },
      { str: 'alto', x: 24, y: 700, larghezza: 10 },
    ]);
    expect(righe).toEqual(['alto', 'basso']);
  });
});

describe('utilità', () => {
  it('numeri e date italiane', () => {
    expect(numeroIt('10.000,00')).toBe(10000);
    expect(numeroIt('49.999,50 Euro')).toBe(49999.5);
    expect(numeroIt('70 %')).toBe(70);
    expect(numeroIt(null)).toBeNull();
    expect(dataIso('Data: 03/12/2025')).toBe('2025-12-03');
    expect(dataIso('niente')).toBeNull();
  });

  it('tipo del soggetto da CF e denominazione', () => {
    expect(tipoSoggetto('ESPOSITO MARIA', 'SPSMRA75S62B563Q')).toBe('PERSONA_FISICA');
    expect(tipoSoggetto('ALFA HOLDING SRL', '03456789012')).toBe('PERSONA_GIURIDICA');
    expect(tipoSoggetto('FIDUCIARIA LIGURE SPA', '08901234567')).toBe('FIDUCIARIA');
    expect(tipoSoggetto('THE FAMILY TRUST', null)).toBe('TRUST');
    expect(tipoSoggetto('KAPPA TRADING LTD', null)).toBe('PERSONA_GIURIDICA');
  });
});

describe('Visura vera — SRL con due soci persone fisiche (layout InfoCamere 2025)', () => {
  const v = leggiVisura(fx('srl-due-soci-pf.txt'));

  it('anagrafica', () => {
    expect(v.tipoVisura).toBe('ORDINARIA');
    expect(v.denominazione).toBe('ESEMPIO SRL');
    expect(v.codiceFiscale).toBe('01234567890');
    expect(v.partitaIva).toBe('01234567890');
    expect(v.formaGiuridica).toBe("societa' a responsabilita' limitata");
    expect(v.tipoProposto).toBe('SOCIETA_CAPITALI');
    expect(v.tipoIncerto).toBe(false);
    expect(v.rea).toBe('PD - 123456');
    expect(v.pec).toBe('esempio@pec.it');
    expect(v.sede).toMatchObject({ comune: 'PADOVA', provincia: 'PD', indirizzo: 'VIA GARIBALDI 10', cap: '35139' });
    expect(v.dataCostituzione).toBe('2025-10-13');
    expect(v.dataIscrizione).toBe('2025-10-16');
    expect(v.dataEstrazione).toBe('2025-12-03');
    expect(v.statoAttivita).toBe('attiva');
    expect(v.inLiquidazione).toBe(false);
    expect(v.capitale).toEqual({ deliberato: 10000, sottoscritto: 10000, versato: 10000 });
    expect(v.attivitaPrevalente).toMatch(/^AGENZIA DI COMMERCIO PER LA VENDITA .* SERVIZI DIGITALI\.$/);
    expect(v.oggettoSociale).toContain('AGENZIA E RAPPRESENTANZA DI COMMERCIO');
  });

  it('questa visura non riporta il codice ATECO: campo vuoto e segnalato, mai inventato', () => {
    expect(v.ateco).toBeNull();
    expect(v.campiNonTrovati).toEqual(['Codice ATECO']);
    expect(v.avvisi).toEqual([]);
  });

  it('soci: nome, CF, nominale, percentuale sul sottoscritto, diritto, domicilio', () => {
    expect(v.dataElencoSoci).toBe('2025-10-15');
    expect(v.soci).toHaveLength(2);
    expect(v.soci[0]).toMatchObject({
      nome: 'ESPOSITO MARIA', codiceFiscale: 'SPSMRA75S62B563Q', tipo: 'PERSONA_FISICA', quotaNominale: 7000, quotaPercento: 70,
      versato: 7000, diritto: 'PROPRIETA', quoteProprie: false, comproprieta: false, paese: 'IT', pec: 'maria.esposito@pec.it',
    });
    expect(v.soci[0].domicilio).toBe('VIGONZA (PD) VIA ROMA 1 CAP 35010');
    expect(v.soci[1]).toMatchObject({ nome: 'BIANCHI LUCA', quotaPercento: 30, codiceFiscale: 'BNCLCU71L20L736W' });
  });

  it('cariche: amministratore unico con rappresentanza, nascita, nomina, seconda carica accodata', () => {
    expect(v.cariche).toHaveLength(1);
    expect(v.cariche[0]).toMatchObject({
      nome: 'ESPOSITO MARIA', codiceFiscale: 'SPSMRA75S62B563Q', carica: 'AMMINISTRATORE_UNICO', rappresentanzaLegale: true,
      natoA: 'PADOVA (PD)', dataNascita: '1975-11-22', dataNomina: '2025-10-13',
    });
    expect(v.cariche[0].durata).toContain('31/12/2032');
    expect(v.cariche[0].poteri).toContain('preposto agenti');
  });
});

describe('Visure vere di Barbara (3.9.2026, anonimizzate) — catena reale su tre livelli', () => {
  // AURIGA (50% PF + 50% holding) → VEGA CAPITAL HOLDING (100% società semplice) ; SEI SIGMA (100% VEGA).
  it('SRL con socia persona fisica e holding al 50%: intestazione del CdA spezzata su due righe, cariche cumulate, consigliera, nascita all’estero sulla riga del nome', () => {
    const v = leggiVisura(fx('srl-socio-pf-e-holding-cda.txt'));
    expect(v.denominazione).toBe('AURIGA FORMAZIONE S.R.L.');
    expect(v.ateco).toBe('85.59.20');
    expect(v.soci.map((s) => [s.nome, s.tipo, s.quotaPercento])).toEqual([
      ['ROVIGATTI ORNELLA', 'PERSONA_FISICA', 50],
      ['VEGA CAPITAL HOLDING S.R.L.', 'PERSONA_GIURIDICA', 50],
    ]);
    const [presidente, consigliera] = v.cariche;
    // «Presidente Consiglio» / «Amministrazione» su due righe, poi due blocchi «carica»: consigliere e presidente.
    expect(presidente.nome).toBe('ROVIGATTI ETTORE');
    expect(presidente.carica).toBe('PRESIDENTE_CDA');
    expect(presidente.caricaTesto).toBe('presidente consiglio amministrazione');
    expect(presidente.rappresentanzaLegale).toBe(true);
    expect(presidente.poteri).toBe('altra carica: consigliere');
    expect(consigliera.carica).toBe('CONSIGLIERE');
    expect(consigliera.caricaTesto).toBe('consigliera');
    expect(consigliera.rappresentanzaLegale).toBe(false);
    expect(consigliera.natoA).toBe('ZURIGO SVIZZERA');
    expect(consigliera.dataNascita).toBe('1971-02-26');
    expect(v.campiNonTrovati).toEqual([]);
    expect(v.avvisi).toEqual([]);
  });

  it('SRL unipersonale con socia holding al 100%', () => {
    const v = leggiVisura(fx('srl-unipersonale-socio-holding.txt'));
    expect(v.denominazione).toBe('SEI SIGMA ITALIA S.R.L.');
    expect(v.soci).toHaveLength(1);
    expect(v.soci[0]).toMatchObject({ nome: 'VEGA CAPITAL HOLDING S.R.L.', tipo: 'PERSONA_GIURIDICA', quotaPercento: 100, codiceFiscale: '51000029994' });
    expect(v.cariche[0]).toMatchObject({ carica: 'AMMINISTRATORE_UNICO', rappresentanzaLegale: true, dataNomina: '2016-11-24' });
    expect(v.dataElencoSoci).toBe('2022-02-17');
  });

  it('holding con socia unica società semplice e amministratrice unica (forma femminile)', () => {
    const v = leggiVisura(fx('holding-socia-societa-semplice.txt'));
    expect(v.denominazione).toBe('VEGA CAPITAL HOLDING S.R.L.');
    expect(v.ateco).toBe('64.21.00');
    expect(v.soci[0]).toMatchObject({ nome: 'ROVIGATTI & DAL MASO HOLDING S.S.', tipo: 'PERSONA_GIURIDICA', quotaPercento: 100 });
    expect(v.cariche[0]).toMatchObject({ nome: 'DAL MASO CLOTILDE', carica: 'AMMINISTRATORE_UNICO', caricaTesto: 'amministratrice unica', rappresentanzaLegale: true, natoA: 'PRATO (FI)', dataNascita: '1976-10-29' });
  });
});

describe('SRL con holding, nuda proprietà/usufrutto, capitale non versato, CdA, ATECO 2025 (sintetica)', () => {
  const v = leggiVisura(fx('srl-holding-usufrutto-cda.txt'));

  it('ATECO 2025 e capitale sottoscritto/versato', () => {
    expect(v.ateco).toBe('62.10.00');
    expect(v.atecoVersione).toBe('2025');
    expect(v.capitale).toEqual({ deliberato: 100000, sottoscritto: 100000, versato: 25000 });
    expect(v.sede.comune).toBe('MILANO');
  });

  it('socio persona giuridica, nuda proprietà e usufrutto sulla stessa quota', () => {
    const nomi = v.soci.map((s) => [s.nome, s.tipo, s.diritto, s.quotaPercento]);
    expect(nomi).toEqual([
      ['ALFA HOLDING SRL', 'PERSONA_GIURIDICA', 'PROPRIETA', 60],
      ['NERI ANNA', 'PERSONA_FISICA', 'NUDA_PROPRIETA', 25],
      ['NERI PAOLO', 'PERSONA_FISICA', 'USUFRUTTO', 25],
      ['GIALLI MARCO', 'PERSONA_FISICA', 'PROPRIETA', 15],
    ]);
    expect(v.soci[0].codiceFiscale).toBe('03456789012');
    expect(v.soci[1].versato).toBe(6250);
  });

  it('consiglio di amministrazione: presidente e delegato con rappresentanza, consigliere senza; poteri letti', () => {
    expect(v.cariche.map((c) => [c.nome, c.carica, c.rappresentanzaLegale])).toEqual([
      ['VERDI GIULIA', 'PRESIDENTE_CDA', true],
      ['ESPOSITO MARIA', 'CONSIGLIERE_DELEGATO', true],
      ['GIALLI MARCO', 'CONSIGLIERE', false],
    ]);
    expect(v.cariche[0].poteri).toContain('FIRMA E RAPPRESENTANZA LEGALE');
    expect(v.cariche[0].poteri).toContain('FIRMA SINGOLA');
    expect(v.cariche[1].dataNomina).toBe('2025-04-15');
  });
});

describe('SRL quattro soci al 25% esatto (sintetica)', () => {
  const v = leggiVisura(fx('srl-quattro-soci-25.txt'));
  it('quattro persone fisiche al 25%, amministratore unico', () => {
    expect(v.soci.map((s) => s.quotaPercento)).toEqual([25, 25, 25, 25]);
    expect(v.soci.every((s) => s.tipo === 'PERSONA_FISICA')).toBe(true);
    expect(v.cariche).toHaveLength(1);
    expect(v.cariche[0].carica).toBe('AMMINISTRATORE_UNICO');
    expect(v.ateco).toBe('47.71.10');
    expect(v.atecoVersione).toBe('2007');
  });
});

describe('SPA senza sezione soci (sintetica)', () => {
  const v = leggiVisura(fx('spa-senza-soci.txt'));
  it('nessun socio proposto, cariche lette, nessun avviso spurio', () => {
    expect(v.tipoProposto).toBe('SOCIETA_CAPITALI');
    expect(v.formaGiuridica).toBe("societa' per azioni");
    expect(v.soci).toEqual([]);
    expect(v.dataElencoSoci).toBeNull();
    expect(v.cariche.map((c) => c.carica)).toEqual(['PRESIDENTE_CDA', 'CONSIGLIERE']);
    expect(v.capitale.sottoscritto).toBe(1000000);
    expect(v.avvisi).toEqual([]);
  });
});

describe('Impresa individuale (sintetica)', () => {
  const v = leggiVisura(fx('impresa-individuale.txt'));
  it('persona fisica: titolare al 100%, niente capitale fra i campi mancanti', () => {
    expect(v.tipoProposto).toBe('PERSONA_FISICA');
    expect(v.codiceFiscale).toBe('SPSMRA75S62B563Q');
    expect(v.partitaIva).toBe('06789012345');
    expect(v.soci).toHaveLength(1);
    expect(v.soci[0]).toMatchObject({ nome: 'ESPOSITO MARIA', quotaPercento: 100, tipo: 'PERSONA_FISICA' });
    expect(v.cariche[0]).toMatchObject({ carica: 'TITOLARE', rappresentanzaLegale: true });
    expect(v.campiNonTrovati).toEqual([]);
  });
});

describe('SRL in liquidazione con fiduciaria, socio estero e quote proprie (sintetica)', () => {
  const v = leggiVisura(fx('srl-liquidazione-fiduciaria-estero-quote-proprie.txt'));

  it('stato di liquidazione e liquidatore', () => {
    expect(v.inLiquidazione).toBe(true);
    expect(v.statoAttivita).toBe('in liquidazione');
    expect(v.cariche[0]).toMatchObject({ carica: 'LIQUIDATORE', nome: 'NERI PAOLO', rappresentanzaLegale: true });
  });

  it('fiduciaria e trust riconosciuti, socio estero senza CF, quote proprie fuori dal denominatore', () => {
    const fid = v.soci.find((s) => s.nome.startsWith('FIDUCIARIA'))!;
    expect(fid.tipo).toBe('FIDUCIARIA');
    const kappa = v.soci.find((s) => s.nome === 'KAPPA TRADING LTD')!;
    expect(kappa).toMatchObject({ tipo: 'PERSONA_GIURIDICA', codiceFiscale: null, paese: 'EE' });
    expect(kappa.domicilio).toContain('LONDON');
    const proprie = v.soci.find((s) => s.quoteProprie)!;
    expect(proprie.nome).toBe('THETA SRL IN LIQUIDAZIONE');
    // 45.000 di capitale votante: 20.000 → 44,44%, 15.000 → 33,33%, 10.000 → 22,22%.
    expect(fid.quotaPercento).toBe(44.44);
    expect(kappa.quotaPercento).toBe(33.33);
    expect(v.soci.find((s) => s.nome === 'NERI PAOLO')!.quotaPercento).toBe(22.22);
  });
});

describe('Documenti che non sono visure', () => {
  it('testo qualsiasi: campi vuoti, elenco dei mancanti, avviso — nessuna eccezione', () => {
    const v = leggiVisura('Fattura n. 12 del 3/9/2026\nTotale 1.000,00');
    expect(v.tipoVisura).toBeNull();
    expect(v.denominazione).toBeNull();
    expect(v.soci).toEqual([]);
    expect(v.campiNonTrovati).toContain('Denominazione');
    expect(v.campiNonTrovati).toContain('Codice fiscale');
    expect(v.avvisi[0]).toContain('non essere una visura');
  });

  it('testo vuoto', () => {
    expect(() => leggiVisura('')).not.toThrow();
  });
});
