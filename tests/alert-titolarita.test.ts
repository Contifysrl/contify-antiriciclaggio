import { describe, expect, it } from 'vitest';
import { analizzaTitolaritaEffettiva, type Carica, type NodoPartecipazione } from '../worker/src/domain/titolare-effettivo';
import { bozzaMotivazioneCo6, calcolaAlertTitolarita, type InputAlert, type SocioCompagine } from '../worker/src/domain/alert-titolarita';
import { paeseAltoRischio as paeseAltoRischioNorme } from '../worker/src/domain/norme';

const paeseAltoRischio = (p: string) => paeseAltoRischioNorme(p, '2026-09-03').altoRischio;

// Le fixture costruiscono i nodi per il motore e la compagine per gli alert
// dallo stesso elenco di soci: come farà il worker dai dati della visura.

type SocioFx = Partial<SocioCompagine> & { id: string; nome: string; quota: number };

function fixture(soci: SocioFx[], cariche: Carica[] = [], extra: Partial<InputAlert> = {}) {
  const compagine: SocioCompagine[] = soci.map((s) => ({ tipo: 'PERSONA_FISICA', diritto: 'PROPRIETA', ...s }));
  const nodi: NodoPartecipazione[] = [
    {
      id: 'CLI', denominazione: 'Alfa Srl', tipo: 'PERSONA_GIURIDICA',
      partecipazioni: compagine.map((s) => ({ id: s.quoteProprie ? 'CLI' : s.id, quota: s.quota, diritto: s.diritto })),
    },
    ...compagine.filter((s) => !s.quoteProprie).map<NodoPartecipazione>((s) => ({
      id: s.id, denominazione: s.nome,
      tipo: s.tipo === 'PERSONA_FISICA' ? 'PERSONA_FISICA' : 'PERSONA_GIURIDICA',
      fiduciaria: s.tipo === 'FIDUCIARIA', trust: s.tipo === 'TRUST', paese: s.paese,
    })),
  ];
  const analisi = analizzaTitolaritaEffettiva('CLI', nodi, { cariche, data: '2026-09-03' });
  const input: InputAlert = {
    denominazione: 'Alfa Srl', tipoCliente: 'SOCIETA_CAPITALI', analisi, soci: compagine, cariche,
    paeseAltoRischio, dataVisura: '2026-08-12', dataElencoSoci: '2026-03-01', capitale: { sottoscritto: 100000, versato: 100000 },
    ...extra,
  };
  return { alert: calcolaAlertTitolarita(input), analisi, input };
}

const codici = (a: ReturnType<typeof calcolaAlertTitolarita>) => a.map((x) => x.codice);

describe('Caso che NON deve far scattare nulla', () => {
  it('SRL con due soci persone fisiche 70/30, nessun vincolo, nessun match', () => {
    const { alert, analisi } = fixture([
      { id: 'PF1', nome: 'Mario Rossi', quota: 0.7 },
      { id: 'PF2', nome: 'Luca Bianchi', quota: 0.3 },
    ], [{ id: 'PF1', nome: 'Mario Rossi', carica: 'AMMINISTRATORE_UNICO', rappresentanzaLegale: true }]);
    expect(analisi.criterioApplicato).toBe('PROPRIETA_DIRETTA');
    expect(alert).toEqual([]);
  });

  it('cliente persona fisica: il tema non si pone', () => {
    const { alert } = fixture([{ id: 'PF1', nome: 'Mario Rossi', quota: 1 }], [], { tipoCliente: 'PERSONA_FISICA' });
    expect(alert).toEqual([]);
  });
});

describe('A1 → A2 → A3: la sequenza, non il salto al rappresentante legale', () => {
  const quattro = () => fixture(
    [
      { id: 'A', nome: 'Anna Alfa', quota: 0.25 },
      { id: 'B', nome: 'Bruno Beta', quota: 0.25 },
      { id: 'C', nome: 'Carla Gamma', quota: 0.25 },
      { id: 'D', nome: 'Dario Delta', quota: 0.25 },
    ],
    [
      { id: 'A', nome: 'Anna Alfa', carica: 'PRESIDENTE_CDA', rappresentanzaLegale: true },
      { id: 'B', nome: 'Bruno Beta', carica: 'CONSIGLIERE_DELEGATO' },
      { id: 'C', nome: 'Carla Gamma', carica: 'CONSIGLIERE' },
    ],
  );

  it('quattro soci al 25% esatto: scattano A1, A2 e A3 nell’ordine', () => {
    const { alert } = quattro();
    expect(codici(alert)).toEqual(['A1', 'A2', 'A3']);
    expect(alert[0].messaggio).toContain('Non si salta al rappresentante legale');
    expect(alert[0].azione.tipo).toBe('SEQUENZA_GUIDATA');
  });

  it('A2 propone le domande di controllo da inserire nella dichiarazione art. 22', () => {
    const { alert } = quattro();
    const a2 = alert.find((a) => a.codice === 'A2')!;
    expect(a2.azione.tipo).toBe('DOMANDE_ART22');
    if (a2.azione.tipo === 'DOMANDE_ART22') {
      expect(a2.azione.domande.length).toBeGreaterThanOrEqual(4);
      expect(a2.azione.domande.join(' ')).toContain('2468');
    }
    expect(a2.bloccante).toBe(false);
  });

  it('A3 è bloccante, propone solo le cariche con poteri e allega la bozza ex co. 6 scritta dai fatti', () => {
    const { alert } = quattro();
    const a3 = alert.find((a) => a.codice === 'A3')!;
    expect(a3.bloccante).toBe(true);
    expect(a3.azione.tipo).toBe('CONFERMA_RESIDUALE');
    if (a3.azione.tipo === 'CONFERMA_RESIDUALE') {
      expect(a3.azione.candidati.map((c) => c.id)).toEqual(['A', 'B']); // Carla è consigliere senza deleghe
      const b = a3.azione.bozzaMotivazione;
      expect(b).toContain('12/08/2026');
      expect(b).toContain('Anna Alfa 25%');
      expect(b).toContain('superiore al 25%');
      expect(b).toContain('art. 22');
      expect(b).toContain('art. 20 co. 5');
      expect(b).toContain('presidente del consiglio di amministrazione, rappresentante legale');
      // Nessun dato inventato: niente PEC, niente indirizzi, niente CF.
      expect(b).not.toMatch(/[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]/);
    }
  });

  it('con cinque soci al 20% e nessuna carica in visura, A3 chiede di individuare a mano', () => {
    const { alert } = fixture(
      ['A', 'B', 'C', 'D', 'E'].map((id) => ({ id, nome: `Socio ${id}`, quota: 0.2 })),
      [],
    );
    const a3 = alert.find((a) => a.codice === 'A3')!;
    expect(a3.messaggio).toContain('individua a mano');
  });

  it('la bozza si può rigenerare da sola con i candidati scelti', () => {
    const { input } = quattro();
    const testo = bozzaMotivazioneCo6(input, [{ id: 'A', nome: 'Anna Alfa', carica: 'presidente' }]);
    expect(testo).toContain('Anna Alfa (presidente)');
  });
});

describe('A2 senza A1', () => {
  it('assetto 50/50: entrambi titolari per proprietà, ma il controllo va chiesto', () => {
    const { alert, analisi } = fixture([
      { id: 'A', nome: 'Anna Alfa', quota: 0.5 },
      { id: 'B', nome: 'Bruno Beta', quota: 0.5 },
    ]);
    expect(analisi.titolari).toHaveLength(2);
    expect(codici(alert)).toEqual(['A2']);
    expect(alert[0].messaggio).toContain('50/50');
  });

  it('usufrutto su una quota di maggioranza: il nudo proprietario è TE, il voto può spettare all’usufruttuario', () => {
    const { alert } = fixture([
      { id: 'NP', nome: 'Nudo Proprietario', quota: 0.6, diritto: 'NUDA_PROPRIETA' },
      { id: 'US', nome: 'Usufruttuario', quota: 0.6, diritto: 'USUFRUTTO' },
      { id: 'B', nome: 'Bruno Beta', quota: 0.4 },
    ]);
    expect(codici(alert)).toEqual(['A2']);
    expect(alert[0].messaggio).toContain('usufrutto 60% a favore di Usufruttuario');
    expect(alert[0].norma).toContain('2352');
  });

  it('socio unico persona giuridica: A2 e A4 (catena da risalire)', () => {
    const { alert } = fixture([{ id: 'H', nome: 'Holding Srl', tipo: 'PERSONA_GIURIDICA', quota: 1 }]);
    // Niente A1/A3: senza la compagine della holding il criterio della proprietà
    // non è fallito, è incompleto. Prima si carica la visura della holding (A4).
    expect(codici(alert).sort()).toEqual(['A2', 'A4']);
    expect(alert.find((a) => a.codice === 'A2')!.messaggio).toContain('socio unico persona giuridica');
  });
});

describe('A4 — socio persona giuridica italiana', () => {
  const base = () => [
    { id: 'H', nome: 'Holding Srl', tipo: 'PERSONA_GIURIDICA' as const, quota: 0.6 },
    { id: 'PF', nome: 'Mario Rossi', quota: 0.4 },
  ];

  it('chiede di caricare la visura della controllante', () => {
    const { alert } = fixture(base());
    const a4 = alert.find((a) => a.codice === 'A4')!;
    expect(a4.gravita).toBe('media');
    expect(a4.azione.tipo).toBe('CARICA_VISURA');
    expect(a4.messaggio).toContain('Holding Srl detiene il 60%');
  });

  it('se la controllante è già cliente dello studio la catena è risolta', () => {
    const soci = base();
    soci[0] = { ...soci[0], clienteStudio: { id: 'cli_h', denominazione: 'Holding Srl', visuraDel: '2026-05-01' } };
    const { alert } = fixture(soci);
    const a4 = alert.find((a) => a.codice === 'A4')!;
    expect(a4.azione.tipo).toBe('CATENA_RISOLTA');
    expect(a4.messaggio).toContain('visura del 01/05/2026');
  });
});

describe('A5 — socio estero', () => {
  it('Paese non ad alto rischio: documentazione equivalente, senza rafforzata obbligatoria', () => {
    const { alert } = fixture([
      { id: 'GMBH', nome: 'Beta GmbH', tipo: 'PERSONA_GIURIDICA', quota: 0.6, paese: 'DE' },
      { id: 'PF', nome: 'Mario Rossi', quota: 0.4 },
    ]);
    const a5 = alert.find((a) => a.codice === 'A5')!;
    expect(a5.gravita).toBe('alta');
    expect(a5.messaggio).not.toContain('rafforzata');
    expect(codici(alert)).not.toContain('A4');
  });

  it('Paese terzo ad alto rischio: verifica rafforzata obbligatoria (art. 24 co. 5)', () => {
    const { alert } = fixture([
      { id: 'X', nome: 'Gamma Ltd', tipo: 'PERSONA_GIURIDICA', quota: 0.6, paese: 'IR' },
      { id: 'PF', nome: 'Mario Rossi', quota: 0.4 },
    ]);
    const a5 = alert.find((a) => a.codice === 'A5')!;
    expect(a5.messaggio).toContain('rafforzata');
    expect(a5.azione.tipo === 'DOCUMENTAZIONE_ESTERA' && a5.azione.altoRischio).toBe(true);
  });
});

describe('A6 — fiduciaria e trust', () => {
  it('fiduciaria: il titolare è il fiduciante, non si risale', () => {
    const { alert } = fixture([
      { id: 'F', nome: 'Fiduciaria Italiana Spa', tipo: 'FIDUCIARIA', quota: 0.7 },
      { id: 'PF', nome: 'Mario Rossi', quota: 0.3 },
    ]);
    const a6 = alert.find((a) => a.codice === 'A6')!;
    expect(a6.messaggio).toContain('fiduciante');
    expect(codici(alert)).not.toContain('A4');
  });

  it('trust: art. 22 co. 5', () => {
    const { alert } = fixture([
      { id: 'T', nome: 'The Family Trust', tipo: 'TRUST', quota: 0.51 },
      { id: 'PF', nome: 'Mario Rossi', quota: 0.49 },
    ]);
    const a6 = alert.find((a) => a.codice === 'A6')!;
    expect(a6.norma).toContain('art. 22 co. 5');
  });
});

describe('A7 — quote proprie, comproprietà, capitale non versato', () => {
  it('quote proprie: percentuali ricalcolate e avviso', () => {
    const { alert, analisi } = fixture([
      { id: 'SELF', nome: 'Alfa Srl', quota: 0.2, quoteProprie: true },
      { id: 'A', nome: 'Anna Alfa', quota: 0.24 },
      { id: 'B', nome: 'Bruno Beta', quota: 0.56 },
    ]);
    expect(analisi.titolari.map((t) => t.id).sort()).toEqual(['A', 'B']);
    const a7 = alert.find((a) => a.codice === 'A7')!;
    expect(a7.messaggio).toContain('quote proprie');
    expect(a7.gravita).toBe('media');
  });

  it('comproprietà e capitale versato parzialmente', () => {
    const { alert } = fixture([
      { id: 'A', nome: 'Anna Alfa', quota: 0.6, comproprieta: true },
      { id: 'B', nome: 'Bruno Beta', quota: 0.6, comproprieta: true },
      { id: 'C', nome: 'Carla Gamma', quota: 0.4 },
    ], [], { capitale: { sottoscritto: 100000, versato: 25000 } });
    const a7 = alert.find((a) => a.codice === 'A7')!;
    expect(a7.messaggio).toContain('comproprietà');
    expect(a7.messaggio).toContain('versato');
  });
});

describe('A8 — screening e residenza', () => {
  it('corrispondenza nelle liste: bloccante finché non si decide', () => {
    const { alert } = fixture(
      [{ id: 'A', nome: 'Mario Rossi', quota: 1 }],
      [],
      { screening: [{ nominativo: 'MARIO ROSSI', fonte: 'ONU', punteggio: 0.9, stato: 'DA_ESAMINARE' }] },
    );
    const a8 = alert.find((a) => a.codice === 'A8')!;
    expect(a8.bloccante).toBe(true);
    expect(a8.azione.tipo).toBe('DECIDI_SCREENING');
  });

  it('corrispondenza già esclusa con motivazione: non scatta', () => {
    const { alert } = fixture(
      [{ id: 'A', nome: 'Mario Rossi', quota: 1 }],
      [],
      { screening: [{ nominativo: 'MARIO ROSSI', fonte: 'ONU', punteggio: 0.9, stato: 'ESCLUSO' }] },
    );
    expect(codici(alert)).not.toContain('A8');
  });

  it('socio persona fisica residente in Paese ad alto rischio: non bloccante, rafforzata', () => {
    const { alert } = fixture([
      { id: 'A', nome: 'Ali Reza', quota: 0.6, paese: 'IR' },
      { id: 'B', nome: 'Bruno Beta', quota: 0.4 },
    ]);
    const a8 = alert.find((a) => a.codice === 'A8')!;
    expect(a8.bloccante).toBe(false);
    expect(a8.messaggio).toContain('IR');
  });
});

describe('A4 in profondità — la holding è cliente ma la sua socia no (catena vera di tre livelli, 3.9.2026)', () => {
  it('A1/A3 aspettano: la catena è incompleta al secondo livello, e si chiede la visura della socia della holding', () => {
    const cariche: Carica[] = [{ id: 'AU', nome: 'Dal Maso Clotilde', carica: 'AMMINISTRATORE_UNICO', rappresentanzaLegale: true }];
    const nodi: NodoPartecipazione[] = [
      { id: 'CLI', denominazione: 'Sei Sigma Srl', tipo: 'PERSONA_GIURIDICA', partecipazioni: [{ id: 'HOLD', quota: 1, diritto: 'PROPRIETA' }] },
      { id: 'HOLD', denominazione: 'Vega Holding Srl', tipo: 'PERSONA_GIURIDICA', partecipazioni: [{ id: 'SS', quota: 1, diritto: 'PROPRIETA' }] },
      { id: 'SS', denominazione: 'Rovigatti & Dal Maso Holding S.S.', tipo: 'PERSONA_GIURIDICA' },
    ];
    const analisi = analizzaTitolaritaEffettiva('CLI', nodi, { cariche, data: '2026-09-03' });
    expect(analisi.titolari).toEqual([]);
    expect(analisi.nodiIrrisolti).toEqual([{ id: 'SS', denominazione: 'Rovigatti & Dal Maso Holding S.S.', quotaEffettiva: 1, tramite: 'Vega Holding Srl' }]);
    expect(analisi.avvertenze.join(' ')).toContain('catena incompleta');
    const soci: SocioCompagine[] = [{ id: 'HOLD', nome: 'Vega Holding Srl', tipo: 'PERSONA_GIURIDICA', diritto: 'PROPRIETA', quota: 1, paese: 'IT', clienteStudio: { id: 'cli_v', denominazione: 'Vega Holding Srl', visuraDel: '2026-03-24' } }];
    const alert = calcolaAlertTitolarita({
      denominazione: 'Sei Sigma Srl', tipoCliente: 'SOCIETA_CAPITALI', analisi, soci, cariche, paeseAltoRischio,
      dataVisura: '2026-08-29', dataElencoSoci: '2022-02-17', capitale: { sottoscritto: 10000, versato: 10000 },
    });
    expect(codici(alert)).not.toContain('A1');
    expect(codici(alert)).not.toContain('A3');
    const a4 = alert.filter((a) => a.codice === 'A4');
    expect(a4.map((a) => a.azione.tipo)).toEqual(['CATENA_RISOLTA', 'CARICA_VISURA']);
    expect(a4[1].messaggio).toContain('Rovigatti & Dal Maso Holding S.S. detiene il 100% tramite Vega Holding Srl');
  });
});
