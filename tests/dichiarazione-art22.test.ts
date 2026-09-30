import { describe, expect, it } from 'vitest';
import { completaPrecompilata, corpoDichiarazioneArt22, normalizzaRispostaArt22, segnaliDaValutare, DOMANDE_CONTROLLO_BASE, type PrecompilataArt22, type TitolareAv4 } from '../worker/src/lib/dichiarazione-art22';

// AR-M22: la dichiarazione mod. AV.4 apre con scopo e natura della prestazione
// (art. 18 co. 1 lett. c). AR-M23 (Barbara): il documento segue il modello
// AV.4 e stampa la SOLA opzione pertinente (1-4), scelta dai dati.
// Test puri: nessun DB, nessun docx binario (il corpo è OOXML in stringa).

const tenant = { denominazione: 'Studio Prova' };
const doc = (pre: PrecompilataArt22, risposta: any = null) => corpoDichiarazioneArt22({ tenant, precompilata: pre, risposta, fascicoloCodice: '2026/0007' });
const testoPiano = (xml: string) => xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const persona = (nominativo: string, extra: Partial<TitolareAv4> = {}): TitolareAv4 => ({
  nominativo, codiceFiscale: null, natoA: null, natoIl: null, nazionalita: null, residenza: null, domicilio: null,
  criterio: 'PROPRIETA_DIRETTA', etichettaCriterio: 'proprietà diretta (art. 20 co. 2 lett. a)', quota: 60, relazione: 'socio con partecipazione diretta del 60% del capitale', pep: null, fonte: 'PROPOSTO', ...extra,
});

/** Società di capitali con socia al 60% (versione 1: com'era prima di AR-M23, per la compatibilità). */
const base = (extra: Partial<PrecompilataArt22> = {}): PrecompilataArt22 => ({
  versione: 1,
  generataIl: '2026-09-11T08:00:00.000Z',
  cliente: { id: 'cli_1', denominazione: 'ESEMPIO SRL', codiceFiscale: '01234567890', partitaIva: '01234567890', tipo: 'SOCIETA_CAPITALI', sede: 'Via Roma 1, 35100 Padova (PD)' },
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

/** Persona fisica che agisce in proprio (versione 2, opzione 1). */
const personaFisica = (extra: Partial<PrecompilataArt22> = {}): PrecompilataArt22 => ({
  ...base(),
  versione: 2,
  cliente: { id: 'cli_pf', denominazione: 'BIANCHI LUCA', codiceFiscale: 'BNCLCU80A01G224X', partitaIva: null, tipo: 'PERSONA_FISICA', sede: null },
  ripartizione: [], cariche: [], titolariProposti: [], criterioApplicato: 'CLIENTE_PERSONA_FISICA', esecutore: null, domande: [], senzaCompagine: false,
  opzione: 1,
  dichiarante: { nominativo: 'BIANCHI LUCA', codiceFiscale: 'BNCLCU80A01G224X', natoA: 'Padova', natoIl: '1980-01-01', nazionalita: null, residenza: 'Via Verdi 3, Padova', domicilio: null, qualita: null },
  societa: null,
  titolari: [persona('BIANCHI LUCA', { criterio: 'CLIENTE_PERSONA_FISICA', etichettaCriterio: 'cliente persona fisica', quota: null, relazione: 'il cliente stesso', fonte: 'CLIENTE' })],
  attivita: { descrizione: 'Consulenza informatica', ateco: '62.02.00', settore: null },
  ambito: { provincia: 'PD', paese: null, classe: 'ITALIA' },
  ...extra,
});

const prestazione = { codice: 'TENUTA_CONTABILITA', descrizione: 'Tenuta della contabilità', tipoRapporto: 'CONTINUATIVO' as const, dataConferimento: '2026-09-02', scopoNatura: 'Contabilità ordinaria e adempimenti fiscali dell’attività di commercio al dettaglio' };

const rispostaOk = (scopo: any) => ({
  scopo,
  conferma: 'CONFERMA',
  risposte: DOMANDE_CONTROLLO_BASE.map((d) => ({ domanda: d, risposta: 'NO' })),
  pep: [{ nominativo: 'ESPOSITO MARIA', ruolo: 'TITOLARE_EFFETTIVO', pep: false }],
});

describe('AV.4 — scopo e natura della prestazione (AR-M22)', () => {
  it('senza prestazione (dichiarazioni pre-M22, o senza fascicolo) la sezione resta da compilare a mano e non si esige a distanza', () => {
    const pre = base();
    const esito = normalizzaRispostaArt22(rispostaOk(undefined), pre);
    expect(esito.errore).toBeUndefined();
    expect(esito.risposta?.scopo).toBeNull();
    const corpo = doc(pre);
    expect(corpo).toContain('lo scopo e la natura della prestazione professionale richiesta sono:');
    expect(corpo).not.toContain('Tenuta della contabilità');
    expect(corpo).toContain('AV.4 — Dichiarazione del cliente');
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

  it('il .docx apre con la sezione 1 «scopo»; la trascrizione riporta la precisazione', () => {
    const pre = base({ prestazione });
    const vuoto = doc(pre);
    expect(vuoto).toContain('1. Scopo e natura della prestazione professionale richiesta (art. 18, co. 1, lett. c)');
    expect(vuoto).toContain('Tenuta della contabilità');
    expect(vuoto).toContain('conferita il 02.09.2026');
    expect(vuoto).toContain('☐ CONFERMO che lo scopo');
    const r = normalizzaRispostaArt22(rispostaOk({ conferma: 'PRECISA', testo: 'anche la cessione del ramo' }), pre).risposta!;
    const pieno = doc(pre, r);
    expect(pieno).toContain('☒ PRECISO');
    expect(pieno).toContain('anche la cessione del ramo');
    expect(pieno).toContain('☐ CONFERMO che lo scopo');
  });
});

describe('AV.4 — una sola opzione, scelta dai dati (AR-M23)', () => {
  it('società con titolare per proprietà → opzione 3 con i dati della società e del titolare; le altre opzioni non compaiono', () => {
    const pre = base({ versione: 2, opzione: 3, societa: { denominazione: 'ESEMPIO SRL', sedeLegale: 'Via Roma 1, 35100 Padova (PD)', registroImpreseDi: 'PD', rea: 'PD - 123456', codiceFiscale: '01234567890' },
      dichiarante: { nominativo: 'ESPOSITO MARIA', codiceFiscale: 'SPSMRA70A41G224Q', natoA: 'Padova', natoIl: '1970-01-01', nazionalita: null, residenza: 'Via Verdi 3, Padova', domicilio: null, qualita: 'amministratore unico' },
      titolari: [persona('ESPOSITO MARIA', { codiceFiscale: 'SPSMRA70A41G224Q', natoA: 'Padova', natoIl: '1970-01-01', residenza: 'Via Verdi 3, Padova', fonte: 'REGISTRATO', pep: false })] });
    const t = testoPiano(doc(pre));
    expect(t).toContain('(opzione 3) di AGIRE PER CONTO DELLA SOCIETÀ/ENTE ESEMPIO SRL, con sede legale in Via Roma 1, 35100 Padova (PD), iscritta al Registro delle Imprese di PD (REA PD - 123456), numero di iscrizione e codice fiscale 01234567890, in qualità di amministratore unico');
    expect(t).not.toContain('(opzione 1)');
    expect(t).not.toContain('(opzione 2)');
    expect(t).not.toContain('(opzione 4)');
    expect(t).toContain('Titolare effettivo 1 — ESPOSITO MARIA');
    expect(t).toContain('socio con partecipazione diretta del 60% del capitale');
    expect(t).toContain('SPSMRA70A41G224Q');
    // PEP del titolare registrato: precompilato ☒ NON PEP nel modulo da firmare.
    expect(t).toContain('☒ il titolare effettivo NON costituisce persona politicamente esposta');
    // Domande di controllo e Allegato B ci sono (società con compagine).
    expect(t).toContain('Informazioni che risultano solo al cliente (art. 20, co. 3)');
    expect(t).toContain('Allegato B — dati camerali utilizzati per la precompilazione');
    // L'Allegato con le note del modello chiude il documento.
    expect(t).toContain('Allegato alla Dichiarazione del Cliente');
    expect(t).toContain('(Nota 4)');
    expect(t).toContain('Per ricevuta e presa visione');
  });

  it('titolari tutti residuali (art. 20 co. 5) → opzione 4 con l’attestazione sui poteri', () => {
    const pre = base({ versione: 2, opzione: 4, titolari: [persona('ROSSI PAOLO', { criterio: 'RESIDUALE_POTERI', etichettaCriterio: 'criterio residuale', quota: null, relazione: 'amministratore unico — titolare di poteri di rappresentanza legale, amministrazione o direzione (art. 20 co. 5)' })] });
    const t = testoPiano(doc(pre));
    expect(t).toContain('(opzione 4)');
    expect(t).toContain('ATTESTA che il titolare effettivo coincide con la persona fisica o le persone fisiche titolare/i');
    expect(t).toContain('Caso residuale in assenza di partecipazioni rilevanti');
    expect(t).not.toContain('(opzione 3)');
    expect(t).toContain('ROSSI PAOLO');
  });

  it('persona fisica che agisce in proprio → opzione 1: niente società, niente domande di controllo, PEP del dichiarante obbligatorio a distanza', () => {
    const pre = personaFisica({ prestazione });
    const t = testoPiano(doc(pre));
    expect(t).toContain('(opzione 1) di AGIRE IN PROPRIO e richiedere la prestazione per sé, attestando l’inesistenza di un diverso titolare effettivo');
    expect(t).toContain('BIANCHI LUCA');
    expect(t).toContain('BNCLCU80A01G224X');
    expect(t).toContain('Via Verdi 3, Padova');
    expect(t).not.toContain('(opzione 3)');
    expect(t).not.toContain('Informazioni che risultano solo al cliente');
    expect(t).not.toContain('Allegato B');
    expect(t).toContain('Consulenza informatica — ATECO 62.02.00');
    expect(t).toContain('☒ Italia — Provincia: PD');
    expect(t).toContain('☐ Paese UE');

    // A distanza: senza pepDichiarante non passa; con conferma «agisco in proprio» passa senza domande.
    const senzaPep = normalizzaRispostaArt22({ scopo: { conferma: 'CONFERMA' }, conferma: 'CONFERMA', risposte: [], pep: [] }, pre);
    expect(senzaPep.errore).toMatch(/politicamente esposta/);
    const ok = normalizzaRispostaArt22({ scopo: { conferma: 'CONFERMA' }, conferma: 'CONFERMA', risposte: [], pep: [], pepDichiarante: { pep: false }, dichiarante: { nome: 'Luca Bianchi', natoIl: '1980-01-01' } }, pre);
    expect(ok.errore).toBeUndefined();
    expect(ok.risposta?.pepDichiarante).toEqual({ pep: false, dettagli: null });
    expect(ok.risposta?.dichiarante?.natoIl).toBe('1980-01-01');
    const pieno = testoPiano(doc(pre, ok.risposta));
    expect(pieno).toContain('☒ (opzione 1) di AGIRE IN PROPRIO');
    expect(pieno).toContain('☒ di NON costituire persona politicamente esposta');
    expect(pieno).toContain('Dichiarazione resa a distanza');

    // «Non agisco in proprio» = segnale forte per il professionista (opzione 2 del modello).
    const terzo = normalizzaRispostaArt22({ scopo: { conferma: 'CONFERMA' }, conferma: 'CORREGGE', correzioni: 'agisco per conto di mio padre', risposte: [], pep: [], pepDichiarante: { pep: true, dettagli: 'assessore regionale' } }, pre);
    expect(terzo.errore).toBeUndefined();
    const segnali = segnaliDaValutare(terzo.risposta!, 1);
    expect(segnali.some((s) => /NON agire in proprio/.test(s) && /opzione 2/.test(s))).toBe(true);
    expect(segnali.some((s) => /politicamente esposta \(assessore regionale\)/.test(s))).toBe(true);
    expect(testoPiano(doc(pre, terzo.risposta))).toContain('☒ di agire per conto di altre persone fisiche (opzione 2 del modello), che sono: agisco per conto di mio padre');
  });

  it('PEP dichiarato senza indicare la carica non passa', () => {
    const pre = personaFisica();
    expect(normalizzaRispostaArt22({ conferma: 'CONFERMA', risposte: [], pep: [], pepDichiarante: { pep: true, dettagli: '' } }, pre).errore).toMatch(/carica/);
  });

  it('persona fisica che agisce tramite un rappresentante → opzione 2: il dichiarante è l’esecutore, il cliente è la persona per conto della quale agisce', () => {
    const pre = personaFisica({
      opzione: 2,
      esecutore: { nominativo: 'BIANCHI ANNA', carica: 'procuratore', codiceFiscale: 'BNCNNA75A41G224Z' },
      dichiarante: { nominativo: 'BIANCHI ANNA', codiceFiscale: 'BNCNNA75A41G224Z', natoA: null, natoIl: null, nazionalita: null, residenza: null, domicilio: null, qualita: 'procuratore' },
      titolariProposti: [{ nominativo: 'BIANCHI LUCA', criterio: 'CLIENTE_PERSONA_FISICA' as any, etichettaCriterio: 'cliente persona fisica', norma: 'art. 1 co. 2 lett. pp)', quota: null, motivazione: '' }],
    });
    const t = testoPiano(doc(pre));
    expect(t).toContain('(opzione 2) di AGIRE IN QUALITÀ DI ESECUTORE PER CONTO delle seguenti persone fisiche');
    expect(t).toContain('BIANCHI ANNA');
    expect(t).toContain('In qualità di procuratore');
    expect(t).toContain('Relazioni intercorrenti tra il Cliente e l’esecutore');
    expect(t).not.toContain('(opzione 1)');
    // A distanza: PEP per il cliente (titolare) e per l'esecutore; il PEP del dichiarante è quello dell'esecutore.
    const r = normalizzaRispostaArt22({ conferma: 'CONFERMA', risposte: [], pep: [{ nominativo: 'BIANCHI LUCA', ruolo: 'TITOLARE_EFFETTIVO', pep: false }, { nominativo: 'BIANCHI ANNA', ruolo: 'ESECUTORE', pep: false }] }, pre);
    expect(r.errore).toBeUndefined();
    expect(r.risposta?.pepDichiarante).toEqual({ pep: false, dettagli: null });
  });

  it('una precompilata di versione 1 (richiesta a distanza creata prima di AR-M23) si completa da sola: opzione 3, titolari dai proposti', () => {
    const c = completaPrecompilata(base({ prestazione }));
    expect(c.opzione).toBe(3);
    expect(c.titolari.map((t) => [t.nominativo, t.fonte])).toEqual([['ESPOSITO MARIA', 'PROPOSTO']]);
    expect(c.societa?.registroImpreseDi).toBe('PD');
    expect(c.dichiarante?.qualita).toBe('amministratore unico');
    const t = testoPiano(doc(base({ prestazione })));
    expect(t).toContain('(opzione 3)');
    expect(t).toContain('Individuato dal programma in base ai dati camerali');
    // e una versione 1 di una persona fisica → opzione 1 senza domande.
    const pf1 = completaPrecompilata(base({ cliente: { id: 'x', denominazione: 'VERDI GINO', codiceFiscale: null, partitaIva: null, tipo: 'PERSONA_FISICA', sede: null }, esecutore: null, titolariProposti: [], ripartizione: [], cariche: [], senzaCompagine: true }));
    expect(pf1.opzione).toBe(1);
    expect(pf1.domande).toEqual([]);
  });

  it('società senza compagine né titolari: opzione 3 con due schede vuote da compilare', () => {
    const pre = base({ versione: 2, opzione: 3, ripartizione: [], cariche: [], titolariProposti: [], criterioApplicato: 'NESSUNO', esecutore: null, senzaCompagine: true, titolari: [], dichiarante: null,
      societa: { denominazione: 'ESEMPIO SRL', sedeLegale: null, registroImpreseDi: null, rea: null, codiceFiscale: '01234567890' } });
    const t = testoPiano(doc(pre));
    expect(t).toContain('Titolare effettivo 1');
    expect(t).toContain('Titolare effettivo 2');
    expect(t).toContain('con sede legale in ____');
    expect(t).not.toContain('Allegato B');
  });
});
