import { describe, expect, it } from 'vitest';
import { analizzaTitolaritaEffettiva, type Carica, type NodoPartecipazione } from '../worker/src/domain/titolare-effettivo';
import { calcolaAlertTitolarita, type InputAlert, type SocioCompagine } from '../worker/src/domain/alert-titolarita';
import { paeseAltoRischio } from '../worker/src/domain/norme';
import { proponiFascicolo, proponiEsecutore, type InputFascicoloProposto, type CaricaProposta } from '../worker/src/domain/fascicolo-proposto';
import { settoreEsposto, settoriRichiamati, voceSettorePerCodice, SETTORI_ESPOSTI } from '../worker/src/domain/settori-esposti';
import { PROVINCE, normalizzaTabellaProvince, siglaProvinciaDaTesto, type TabellaProvinceContante } from '../worker/src/domain/province';

const OGGI = '2026-09-03';
const alto = (p: string | null | undefined) => paeseAltoRischio(p, OGGI);

type SocioFx = Partial<SocioCompagine> & { id: string; nome: string; quota: number };

/** Come nel worker: stessi soci → grafo per il motore art. 20 + compagine per gli alert. */
function titolarita(soci: SocioFx[], cariche: Carica[] = []) {
  const compagine: SocioCompagine[] = soci.map((s) => ({ tipo: 'PERSONA_FISICA', diritto: 'PROPRIETA', ...s }));
  const nodi: NodoPartecipazione[] = [
    { id: 'CLI', denominazione: 'Alfa Srl', tipo: 'PERSONA_GIURIDICA', partecipazioni: compagine.map((s) => ({ id: s.quoteProprie ? 'CLI' : s.id, quota: s.quota, diritto: s.diritto })) },
    ...compagine.filter((s) => !s.quoteProprie).map<NodoPartecipazione>((s) => ({
      id: s.id, denominazione: s.nome, tipo: s.tipo === 'PERSONA_FISICA' ? 'PERSONA_FISICA' : 'PERSONA_GIURIDICA',
      fiduciaria: s.tipo === 'FIDUCIARIA', trust: s.tipo === 'TRUST', paese: s.paese,
    })),
  ];
  const analisi = analizzaTitolaritaEffettiva('CLI', nodi, { cariche, data: OGGI });
  const input: InputAlert = { denominazione: 'Alfa Srl', tipoCliente: 'SOCIETA_CAPITALI', analisi, soci: compagine, cariche, paeseAltoRischio: (p) => alto(p).altoRischio, dataVisura: '2026-08-12' };
  return { analisi, alert: calcolaAlertTitolarita(input), soci: compagine };
}

const AU: CaricaProposta = { id: 'C1', nome: 'Mario Rossi', codiceFiscale: 'RSSMRA70A01H501U', carica: 'AMMINISTRATORE_UNICO', caricaTesto: 'Amministratore Unico', rappresentanzaLegale: true, dataNomina: '2020-05-04' };

const TABELLA: TabellaProvinceContante = {
  fonte: 'ANR 2024, Fig. 3', dataFonte: '2024-11-01', aggiornatoIl: '2026-09-01T10:00:00Z', aggiornatoDa: 'u1',
  province: [{ sigla: 'MI', livello: 'ALTO' }, { sigla: 'PO', livello: 'MEDIO_ALTO' }],
};

function base(over: Partial<InputFascicoloProposto> = {}): InputFascicoloProposto {
  const t = titolarita([{ id: 'PF1', nome: 'Mario Rossi', quota: 0.7 }, { id: 'PF2', nome: 'Anna Bianchi', quota: 0.3 }], [{ id: 'C1', nome: 'Mario Rossi', carica: 'AMMINISTRATORE_UNICO', rappresentanzaLegale: true }]);
  return {
    data: OGGI,
    cliente: { id: 'CLI', denominazione: 'Alfa Srl', tipo: 'SOCIETA_CAPITALI', ateco: '62.01', attivitaPrevalente: 'Produzione di software', paeseResidenza: 'IT', pep: false,
      dettagli: { sede: 'VIA ROMA 1 - 10121 TORINO (TO)', capitaleSociale: 50000, dataCostituzione: '2015-03-10', visuraDel: '2026-08-12' } },
    soci: t.soci, cariche: [AU], analisi: t.analisi, alertTitolarita: t.alert, catena: [], titolariRegistrati: [], documenti: [],
    provinceContante: TABELLA, paeseAltoRischio: alto,
    ...over,
  };
}

describe('Tabella dei settori esposti', () => {
  it('ogni voce cita almeno una fonte e ha un punteggio 1..4', () => {
    for (const s of SETTORI_ESPOSTI) for (const v of s.voci) {
      expect(v.fonti.length, v.codice).toBeGreaterThan(0);
      expect(v.punteggio).toBeGreaterThanOrEqual(1);
      expect(v.punteggio).toBeLessThanOrEqual(4);
      expect(v.motivo.length).toBeGreaterThan(20);
    }
  });
  it('ATECO 47.77 (gioielleria) vince su 47 (commercio al dettaglio): prefisso più lungo', () => {
    expect(settoreEsposto({ ateco: '47.77.00' }, OGGI).voce?.codice).toBe('COMPRO_ORO');
    expect(settoreEsposto({ ateco: '47.11.10' }, OGGI).voce?.codice).toBe('COMMERCIO_MINUTO');
    expect(settoreEsposto({ ateco: '92.00.09' }, OGGI).voce?.punteggio).toBe(4);
  });
  it('senza ATECO decide la descrizione; fra più voci vince il punteggio più alto', () => {
    const e = settoreEsposto({ attivita: 'Bar tabacchi con sala scommesse' }, OGGI);
    expect(e.via).toBe('PAROLE');
    expect(e.voce?.codice).toBe('GIOCO');
    expect(settoreEsposto({ ateco: '62.01' }, OGGI).voce).toBeNull();
    expect(settoreEsposto({ attivita: 'Consulenza informatica' }, OGGI).voce).toBeNull();
  });
  it('«lavoro» non è «oro»: confini di parola', () => {
    expect(settoreEsposto({ attivita: 'Agenzia per il lavoro' }, OGGI).voce).toBeNull();
    expect(settoreEsposto({ attivita: 'Compro oro e argento' }, OGGI).voce?.codice).toBe('COMPRO_ORO');
  });
  it('settoriRichiamati conta i settori distinti in un oggetto sociale', () => {
    const r = settoriRichiamati('Commercio di oro e preziosi, gestione di sale scommesse, compravendita di immobili, consulenza', OGGI);
    expect(r.map((v) => v.codice).sort()).toEqual(['COMPRO_ORO', 'GIOCO', 'IMMOBILIARE']);
  });
  it('fuori dalla finestra di vigenza non propone nulla', () => {
    expect(settoreEsposto({ ateco: '92.00' }, '2020-01-01').voce).toBeNull();
  });
});

describe('Province', () => {
  it('sono 107 sigle uniche', () => {
    expect(PROVINCE.length).toBe(107);
    expect(new Set(PROVINCE.map((p) => p.sigla)).size).toBe(107);
  });
  it('legge la sigla dal testo della sede', () => {
    expect(siglaProvinciaDaTesto('VIA ROMA 1 - 10121 TORINO (TO)')).toBe('TO');
    expect(siglaProvinciaDaTesto('PIAZZA DUOMO 3 20121 MILANO MI')).toBe('MI');
    expect(siglaProvinciaDaTesto('Via senza provincia 5')).toBeNull();
  });
  it('normalizza la tabella dello studio e rifiuta sigle o livelli sconosciuti', () => {
    expect(normalizzaTabellaProvince([{ sigla: 'mi', livello: 'alto' }, { sigla: 'MI', livello: 'ALTO' }]).tabella).toEqual([{ sigla: 'MI', livello: 'ALTO' }]);
    expect(normalizzaTabellaProvince([{ sigla: 'XX', livello: 'ALTO' }]).errore).toMatch(/XX/);
    expect(normalizzaTabellaProvince([{ sigla: 'MI', livello: 'MEDIO' }]).errore).toMatch(/Livello/);
  });
});

describe('Fascicolo proposto — Tabella A', () => {
  it('SRL piana 70/30, software, Torino non in tabella: A.1=1, A.2=1, A.4=1, A.3 chiesto', () => {
    const p = proponiFascicolo(base());
    expect(p.tabellaA.natura_giuridica.punteggio).toBe(1);
    expect(p.tabellaA.prevalente_attivita.punteggio).toBe(1);
    expect(p.tabellaA.prevalente_attivita.motivazione).toMatch(/non rientra nei settori esposti/);
    expect(p.tabellaA.comportamento.stato).toBe('CHIESTO');
    expect(p.tabellaA.area_geografica_cliente.punteggio).toBe(1);
    expect(p.tabellaA.area_geografica_cliente.motivazione).toMatch(/Torino/);
    expect(p.alert).toEqual([]);
    expect(p.circostanze).toEqual([]);
    expect(p.provenienza).toMatch(/12\/08\/2026/);
    expect(p.motivazioneValutazione).toMatch(/A\.1 Natura giuridica: 1/);
  });

  it('A.2 dal settore esposto: compro oro → 4 con fonte e circostanza «elevato uso di contante»', () => {
    const p = proponiFascicolo(base({ cliente: { ...base().cliente, ateco: '47.77.00', attivitaPrevalente: 'Compro oro' } }));
    expect(p.tabellaA.prevalente_attivita.punteggio).toBe(4);
    expect(p.tabellaA.prevalente_attivita.fonte).toMatch(/ANR-5\.3\.2/);
    expect(p.circostanze.map((c) => c.chiave)).toContain('elevatoUsoContante');
  });

  it('A.4: provincia in tabella ALTO → 3 con alert A10 bassa; MEDIO_ALTO → 2', () => {
    const mi = proponiFascicolo(base({ cliente: { ...base().cliente, dettagli: { ...base().cliente.dettagli, sede: 'VIA MANZONI 1 - 20121 MILANO (MI)' } } }));
    expect(mi.tabellaA.area_geografica_cliente.punteggio).toBe(3);
    expect(mi.alert.some((a) => a.codice === 'A10' && a.fattore === 'area_geografica_cliente')).toBe(true);
    const po = proponiFascicolo(base({ cliente: { ...base().cliente, dettagli: { ...base().cliente.dettagli, provincia: 'PO' } } }));
    expect(po.tabellaA.area_geografica_cliente.punteggio).toBe(2);
  });

  it('A.4: tabella dello studio vuota → CHIESTO con invito a leggere la mappa ANR; mai un punteggio inventato', () => {
    const p = proponiFascicolo(base({ provinceContante: null }));
    expect(p.tabellaA.area_geografica_cliente.punteggio).toBeNull();
    expect(p.tabellaA.area_geografica_cliente.stato).toBe('CHIESTO');
    expect(p.tabellaA.area_geografica_cliente.daVerificare).toBe(true);
    expect(p.tabellaA.area_geografica_cliente.motivazione).toMatch(/mappa/);
  });

  it('A.4: sede in Paese terzo ad alto rischio → 4 e circostanza di legge; estero non in elenco → 3', () => {
    const ir = proponiFascicolo(base({ cliente: { ...base().cliente, paeseResidenza: 'IR' } }));
    expect(ir.tabellaA.area_geografica_cliente.punteggio).toBe(4);
    expect(ir.circostanze.map((c) => c.chiave)).toContain('paeseTerzoAltoRischio');
    const de = proponiFascicolo(base({ cliente: { ...base().cliente, paeseResidenza: 'DE' } }));
    expect(de.tabellaA.area_geografica_cliente.punteggio).toBe(3);
  });

  it('A.1: fiduciaria fra i soci → 4 e assetto proprietario complesso', () => {
    const t = titolarita([{ id: 'FID', nome: 'Fiduciaria Beta Spa', quota: 0.6, tipo: 'FIDUCIARIA' }, { id: 'PF2', nome: 'Anna Bianchi', quota: 0.4 }]);
    const p = proponiFascicolo(base({ soci: t.soci, analisi: t.analisi, alertTitolarita: t.alert }));
    expect(p.tabellaA.natura_giuridica.punteggio).toBe(4);
    expect(p.circostanze.map((c) => c.chiave)).toContain('assettoProprietarioComplesso');
    expect(p.checklist.some((v) => v.tipoDocumento === 'MANDATO_FIDUCIARIO')).toBe(true);
  });

  it('A.1: quattro soci al 25% (residuale) → 3; socio PG italiana non risolto → 3 e visura della controllante in checklist', () => {
    const q = titolarita([1, 2, 3, 4].map((i) => ({ id: `PF${i}`, nome: `Socio ${i}`, quota: 0.25 })), [{ id: 'C1', nome: 'Mario Rossi', carica: 'AMMINISTRATORE_UNICO', rappresentanzaLegale: true }]);
    expect(proponiFascicolo(base({ soci: q.soci, analisi: q.analisi, alertTitolarita: q.alert })).tabellaA.natura_giuridica.punteggio).toBe(3);
    const h = titolarita([{ id: 'HOLD', nome: 'Holding Gamma Srl', quota: 0.8, tipo: 'PERSONA_GIURIDICA' }, { id: 'PF2', nome: 'Anna Bianchi', quota: 0.2 }]);
    const p = proponiFascicolo(base({ soci: h.soci, analisi: h.analisi, alertTitolarita: h.alert }));
    expect(p.tabellaA.natura_giuridica.punteggio).toBe(3);
    expect(p.checklist.find((v) => v.codice === 'VISURA_HOLD')?.presente).toBe(false);
  });

  it('A.1: socio PG estero in Paese ad alto rischio → 4; persona fisica → 1', () => {
    const e = titolarita([{ id: 'EST', nome: 'Delta Ltd', quota: 1, tipo: 'PERSONA_GIURIDICA', paese: 'IR' }]);
    const p = proponiFascicolo(base({ soci: e.soci, analisi: e.analisi, alertTitolarita: e.alert }));
    expect(p.tabellaA.natura_giuridica.punteggio).toBe(4);
    expect(p.checklist.some((v) => v.tipoDocumento === 'DOCUMENTAZIONE_ESTERA')).toBe(true);
    const pf = proponiFascicolo(base({ cliente: { id: 'PF', denominazione: 'Mario Rossi', tipo: 'PERSONA_FISICA', paeseResidenza: 'IT', dettagli: { sede: 'ROMA (RM)' } }, soci: [], cariche: [], analisi: null, alertTitolarita: [] }));
    expect(pf.tabellaA.natura_giuridica.punteggio).toBe(1);
    expect(pf.esecutore).toBeNull();
    expect(pf.checklist.map((v) => v.codice)).toEqual(['ID_CLIENTE', 'INCARICO']);
  });

  it('senza compagine né cariche A.1 è CHIESTO (carica la visura)', () => {
    const p = proponiFascicolo(base({ soci: [], cariche: [], analisi: null, alertTitolarita: [] }));
    expect(p.tabellaA.natura_giuridica.stato).toBe('CHIESTO');
    expect(p.tabellaA.natura_giuridica.punteggio).toBeNull();
  });

  it('PEP (cliente o TE registrato) porta A.1 a 4 e suggerisce la circostanza', () => {
    const p = proponiFascicolo(base({ titolariRegistrati: [{ nominativo: 'Mario Rossi', pep: true }] }));
    expect(p.tabellaA.natura_giuridica.punteggio).toBe(4);
    expect(p.circostanze.map((c) => c.chiave)).toContain('pep');
  });
});

describe('Fascicolo proposto — esecutore, checklist, A9/A10', () => {
  it('esecutore = amministratore unico con rappresentanza; il liquidatore passa avanti in liquidazione', () => {
    const cariche: CaricaProposta[] = [AU, { id: 'C2', nome: 'Luca Verdi', carica: 'LIQUIDATORE', rappresentanzaLegale: true }];
    expect(proponiEsecutore({ tipo: 'SOCIETA_CAPITALI', denominazione: 'Alfa Srl' }, cariche, false, '2026-08-12')?.nominativo).toBe('Mario Rossi');
    const liq = proponiEsecutore({ tipo: 'SOCIETA_CAPITALI', denominazione: 'Alfa Srl' }, cariche, true, '2026-08-12');
    expect(liq?.nominativo).toBe('Luca Verdi');
    expect(liq?.alternative[0].nominativo).toBe('Mario Rossi');
    expect(liq?.motivazione).toMatch(/12\/08\/2026/);
  });

  it('CdA: presidente prima del consigliere delegato; il sindaco non è mai esecutore', () => {
    const cariche: CaricaProposta[] = [
      { id: 'S', nome: 'Sindaco Uno', carica: 'SINDACO' },
      { id: 'AD', nome: 'Delegato Due', carica: 'CONSIGLIERE_DELEGATO', rappresentanzaLegale: true },
      { id: 'P', nome: 'Presidente Tre', carica: 'PRESIDENTE_CDA', rappresentanzaLegale: true },
    ];
    const e = proponiEsecutore({ tipo: 'SOCIETA_CAPITALI', denominazione: 'Alfa Srl' }, cariche, false, null);
    expect(e?.nominativo).toBe('Presidente Tre');
    expect(e?.alternative.map((a) => a.nominativo)).toEqual(['Delegato Due']);
  });

  it('checklist: visura, identità esecutore e TE, dichiarazione art. 22; lo stato riflette i documenti conservati', () => {
    const vuoto = proponiFascicolo(base());
    const codici = vuoto.checklist.map((v) => v.codice);
    expect(codici).toEqual(['VISURA', 'ID_ESECUTORE', 'ID_TE_1', 'ID_TE_2', 'DICHIARAZIONE_ART22', 'INCARICO']);
    expect(vuoto.checklist.every((v) => v.presente === false)).toBe(true);
    const pieno = proponiFascicolo(base({ documenti: [{ tipo: 'VISURA' }, { tipo: 'DOCUMENTO_IDENTITA' }, { tipo: 'DOCUMENTO_IDENTITA' }, { tipo: 'DICHIARAZIONE_ART22' }] }));
    expect(pieno.checklist.find((v) => v.codice === 'VISURA')?.presente).toBe(true);
    expect(pieno.checklist.find((v) => v.codice === 'ID_TE_1')?.presente).toBe(true);
    expect(pieno.checklist.find((v) => v.codice === 'ID_TE_2')?.presente).toBeNull(); // due documenti per tre persone: non determinabile
    expect(pieno.checklist.find((v) => v.codice === 'DICHIARAZIONE_ART22')?.presente).toBe(true);
    expect(pieno.checklist.find((v) => v.codice === 'INCARICO')?.obbligatoria).toBe(false);
  });

  it('A9: società in liquidazione → alert media, esecutore liquidatore, A.1 almeno 2', () => {
    const p = proponiFascicolo(base({
      cliente: { ...base().cliente, dettagli: { ...base().cliente.dettagli, statoAttivita: 'IN LIQUIDAZIONE' } },
      cariche: [AU, { id: 'C2', nome: 'Luca Verdi', carica: 'LIQUIDATORE', rappresentanzaLegale: true }],
    }));
    const a9 = p.alert.find((a) => a.codice === 'A9');
    expect(a9?.gravita).toBe('media');
    expect(a9?.messaggio).toMatch(/Luca Verdi/);
    expect(p.esecutore?.carica).toBe('LIQUIDATORE');
    expect(p.tabellaA.natura_giuridica.punteggio).toBeGreaterThanOrEqual(2);
  });

  it('A10: costituzione da meno di 12 mesi; oggetto sociale con ≥3 settori esposti e capitale ≤ 10.000', () => {
    const neo = proponiFascicolo(base({ cliente: { ...base().cliente, dettagli: { ...base().cliente.dettagli, dataCostituzione: '2026-01-15' } } }));
    expect(neo.alert.find((a) => a.codice === 'A10' && /recente costituzione/.test(a.titolo))?.gravita).toBe('media');
    const vecchia = proponiFascicolo(base({ cliente: { ...base().cliente, dettagli: { ...base().cliente.dettagli, dataCostituzione: '2025-08-01' } } }));
    expect(vecchia.alert.some((a) => /recente costituzione/.test(a.titolo))).toBe(false);
    const ampia = proponiFascicolo(base({ cliente: { ...base().cliente, dettagli: { ...base().cliente.dettagli, capitaleSociale: 10000, oggettoSociale: 'commercio di oro e preziosi; gestione di sale scommesse; raccolta e smaltimento di rifiuti; consulenza' } } }));
    expect(ampia.alert.find((a) => /Oggetto sociale molto ampio/.test(a.titolo))?.gravita).toBe('media');
    expect(ampia.tabellaA.prevalente_attivita.punteggio).toBe(4); // vince il settore col punteggio più alto
  });
});

describe('AR-M21 AI-03 — classificazione dell’oggetto sociale con provenienza AI', () => {
  const oggetto = 'acquisto da privati e rivendita di monili e gioie usate, lingotti e monete';
  const cli = (settoreAi: any) => ({ ...base().cliente, ateco: '46.90.00', attivitaPrevalente: 'Commercio all’ingrosso non specializzato', dettagli: { ...base().cliente.dettagli, oggettoSociale: oggetto, settoreAi } });

  it('senza classificazione: A.2 = 1 e si può chiedere all’AI (c’è un oggetto sociale)', () => {
    const p = proponiFascicolo(base({ cliente: cli(null) }));
    const a2 = p.tabellaA.prevalente_attivita;
    expect(settoreEsposto({ ateco: '46.90.00', attivita: 'Commercio all’ingrosso non specializzato', oggettoSociale: oggetto }, OGGI).voce).toBeNull();
    expect(a2.punteggio).toBe(1);
    expect(a2.richiedibileAi).toBe(true);
    expect(a2.provenienzaAi).toBeUndefined();
  });

  it('con la classificazione AI riscontrata sul catalogo: punteggio della voce, provenienza AI «da confermare», nel testo della valutazione', () => {
    const p = proponiFascicolo(base({ cliente: cli({ codice: 'COMPRO_ORO', motivo: 'descrive il commercio di preziosi usati', data: OGGI }) }));
    const a2 = p.tabellaA.prevalente_attivita;
    expect(a2.punteggio).toBe(4);
    expect(a2.stato).toBe('PROPOSTO');
    expect(a2.provenienzaAi?.settore).toBe('COMPRO_ORO');
    expect(a2.motivazione).toMatch(/riconosciuto dall’AI nell’oggetto sociale — da confermare/);
    expect(a2.fonte).toMatch(/classificazione AI del/);
    expect(p.provenienza).toMatch(/proposto dall’AI sull’oggetto sociale/);
    expect(p.motivazioneValutazione).toMatch(/AI/);
  });

  it('NESSUNO: A.2 resta 1, lo dice nella motivazione e non si richiede più', () => {
    const p = proponiFascicolo(base({ cliente: cli({ codice: 'NESSUNO', motivo: 'nessun settore', data: OGGI }) }));
    const a2 = p.tabellaA.prevalente_attivita;
    expect(a2.punteggio).toBe(1);
    expect(a2.motivazione).toMatch(/anche l’AI/);
    expect(a2.richiedibileAi).toBe(false);
  });

  it('un codice inventato dall’AI non è riscontrabile sul catalogo e non cambia la proposta', () => {
    expect(voceSettorePerCodice('NARCOTRAFFICO', OGGI)).toBeNull();
    expect(voceSettorePerCodice('compro_oro', OGGI)?.voce.codice).toBe('COMPRO_ORO');
    const p = proponiFascicolo(base({ cliente: cli({ codice: 'NARCOTRAFFICO', motivo: 'x', data: OGGI }) }));
    expect(p.tabellaA.prevalente_attivita.punteggio).toBe(1);
    expect(p.tabellaA.prevalente_attivita.provenienzaAi).toBeUndefined();
  });

  it('se ATECO o parole chiave riconoscono il settore, la classificazione AI non conta', () => {
    const p = proponiFascicolo(base({ cliente: { ...cli({ codice: 'GIOCO', motivo: 'x', data: OGGI }), ateco: '47.77.00' } }));
    expect(p.tabellaA.prevalente_attivita.punteggio).toBe(4);
    expect(p.tabellaA.prevalente_attivita.provenienzaAi).toBeUndefined();
    expect(p.tabellaA.prevalente_attivita.motivazione).toMatch(/ATECO 47\.77\.00/);
  });
});
