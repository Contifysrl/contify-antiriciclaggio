import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { costruisciDocx } from '../worker/src/lib/docx';
import { CNDCEC_2025 } from '../worker/src/domain/rulesets/cndcec-2025';
import {
  corpoFascicoloIspezione,
  corpoSchedaVerifica,
  corpoVerbaleAstensione,
  corpoVerbaleAutovalutazione,
} from '../worker/src/verbali';

const TENANT = {
  denominazione: 'Studio Demo Commercialisti',
  codice_fiscale: 'DMOSTD80A01G224X',
  partita_iva: '04567890281',
  ordine_iscrizione: 'ODCEC Padova n. 1234',
};

const AUTOVALUTAZIONE = {
  id: 'av_1',
  versione: 2,
  ruleset_id: 'cndcec-2025',
  data_valutazione: '2026-05-20',
  punteggi: JSON.stringify({
    inerente: { tipologia_clientela: 2, area_geografica: 1, canali_distributivi: 1, servizi_offerti: 2 },
    vulnerabilita: { formazione: 2, organizzazione_adeguata_verifica: 1, organizzazione_conservazione: 1, organizzazione_sos: 2 },
  }),
  rischio_inerente: 1.5,
  vulnerabilita: 1.5,
  rischio_residuo: 1.5,
  classe: 'NON_SIGNIFICATIVO',
  formula: '1,5 x 0,40 + 1,5 x 0,60 = 1,5',
  note: 'Aggiornamento annuale ex RT1.',
  presidi: JSON.stringify(['Formazione semestrale del personale', 'Procedura scritta di adeguata verifica']),
  firmata_il: '2026-05-21T10:00:00Z',
  firmata_da: 'u_tit',
  creato_da: 'u_col',
};

const FASCICOLO = {
  id: 'fas_1',
  codice: '2026/0042',
  cliente_id: 'cli_1',
  prestazione_codice: 'FINANZA_STRAORDINARIA',
  prestazione_descrizione: 'Operazioni di finanza straordinaria',
  tipo_rapporto: 'CONTINUATIVO',
  importo_operazione: 250000,
  data_conferimento: '2026-03-01',
  scopo_natura: 'Cessione di ramo d’azienda',
  modalita_identificazione: 'Identificazione in presenza con documento',
  stato: 'IN_VERIFICA',
  creato_da: 'u_tit',
};

const CLIENTE = {
  id: 'cli_1',
  denominazione: 'Alfa Srl',
  codice_fiscale: '01234567890',
  partita_iva: '01234567890',
  tipo: 'SOCIETA_CAPITALI',
  attivita_prevalente: 'Commercio all’ingrosso',
  ateco: '46.90',
  paese_residenza: 'IT',
  pep: 0,
  pep_organo_pubblico: 0,
};

const VALUTAZIONE = {
  id: 'val_1',
  versione: 1,
  ruleset_id: 'cndcec-2025',
  data_valutazione: '2026-03-02',
  tabella_a: JSON.stringify({ natura_giuridica: 2, prevalente_attivita: 2, comportamento: 1, area_geografica_cliente: 1 }),
  tabella_b: JSON.stringify({ tipologia: 3, modalita_svolgimento: 2, ammontare: 2, frequenza_durata: 2, ragionevolezza: 2, area_geografica_destinazione: 1 }),
  esente_verifica: 0,
  rischio_inerente: 4,
  rischio_specifico: 1.8,
  rischio_effettivo: 2.46,
  classe: 'POCO_SIGNIFICATIVO',
  livello_calcolato: 'SEMPLIFICATA',
  livello_applicabile: 'RAFFORZATA',
  livello_innalzato: 1,
  vincoli: JSON.stringify([
    { codice: 'PEP', norma: 'art. 24 co. 5 lett. c)', descrizione: 'Titolare effettivo persona politicamente esposta', effetto: 'IMPONE_RAFFORZATA' },
  ]),
  astensione_dovuta: 0,
  valutare_sos: 0,
  controllo_costante_mesi: 12,
  formula: '(8 + 12) / 10 = 2; 4 x 0,30 + 2 x 0,70 = 2,6',
  motivazione: 'Punteggio tipologia elevato per operazione straordinaria.',
  firmata_da: 'u_tit',
  firmata_il: '2026-03-03T09:00:00Z',
};

const TITOLARI = [
  {
    nominativo: 'Mario Rossi',
    codice_fiscale: 'RSSMRA70A01G224K',
    criterio: 'PROPRIETA_DIRETTA',
    norma: 'art. 20 co. 2',
    quota: 60,
    pep: 1,
    registro_consultato: 1,
    registro_data: '2026-03-01',
    registro_incongruenza: 0,
  },
];

const DOCUMENTI = [
  {
    tipo: 'DOCUMENTO_IDENTITA',
    nome_file: 'ci-rossi.pdf',
    sha256: 'a'.repeat(64),
    data_acquisizione: '2026-03-01',
    conserva_fino_al: '2036-03-01',
  },
];

const ASTENSIONE = {
  id: 'ast_1',
  data_decisione: '2026-07-01',
  fondamento: 'ART_42_CO_1',
  motivazione: 'Impossibilità di acquisire i dati sul titolare effettivo entro trenta giorni.',
  sos_valutata: 1,
  decisa_da: 'u_tit',
};

function estrai(docx: Uint8Array): Record<string, string> {
  const files = unzipSync(docx);
  return Object.fromEntries(
    Object.entries(files).map(([k, v]) => [k, k.endsWith('.png') ? `<png ${v.length} bytes>` : strFromU8(v)]),
  );
}

describe('generazione dei verbali .docx', () => {
  it('produce un pacchetto OOXML valido con logo Contify e header/footer', () => {
    const docx = costruisciDocx(corpoVerbaleAutovalutazione({
      tenant: TENANT, av: AUTOVALUTAZIONE, ruleset: CNDCEC_2025, nomeCreatore: 'Collaboratore', nomeFirmatario: 'Titolare',
    }));
    expect(docx[0]).toBe(0x50); // 'P' — firma ZIP
    expect(docx[1]).toBe(0x4b); // 'K'
    const files = estrai(docx);
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', 'word/header1.xml', 'word/footer1.xml', 'word/media/logo-contify.png']),
    );
    expect(files['word/header1.xml']).toContain('rIdLogo');
    expect(files['word/footer1.xml']).toContain('Contify Srl');
    expect(files['word/styles.xml']).toContain('048587'); // Pantone 7474 C
  });

  it('verbale di autovalutazione: riporta fattori, formula, presidi e firma', () => {
    const files = estrai(costruisciDocx(corpoVerbaleAutovalutazione({
      tenant: TENANT, av: AUTOVALUTAZIONE, ruleset: CNDCEC_2025, nomeCreatore: 'Collaboratore', nomeFirmatario: 'Dott. Bianchi',
    })));
    const doc = files['word/document.xml'];
    for (const atteso of [
      'Verbale di autovalutazione del rischio',
      'Studio Demo Commercialisti',
      'Tipologia di clientela',
      'Formazione',
      '1,5 x 0,40 + 1,5 x 0,60 = 1,5',
      'Formazione semestrale del personale',
      'Dott. Bianchi',
      'Informativa n. 57 del 26.3.2026',
    ]) {
      expect(doc).toContain(atteso);
    }
  });

  it('scheda di adeguata verifica: dati registrati, vincoli e innalzamento di legge', () => {
    const files = estrai(costruisciDocx(corpoSchedaVerifica({
      tenant: TENANT, fascicolo: FASCICOLO, cliente: CLIENTE, valutazione: VALUTAZIONE,
      titolari: TITOLARI, documenti: DOCUMENTI, ruleset: CNDCEC_2025, nomeFirmatario: 'Dott. Bianchi',
    })));
    const doc = files['word/document.xml'];
    for (const atteso of [
      'Scheda di adeguata verifica della clientela',
      'Alfa Srl',
      '2026/0042',
      'Mario Rossi',
      'Tabella A — Aspetti connessi al cliente',
      'Tabella B — Aspetti connessi alla prestazione',
      'art. 24 co. 5 lett. c)',
      'Impone la verifica rafforzata',
      'innalzato rispetto all’esito aritmetico',
      'Adeguata verifica rafforzata',
      'ci-rossi.pdf',
    ]) {
      expect(doc).toContain(atteso);
    }
    // Il verbale trascrive il registrato: 2,46 → "2,46", mai ricalcolato.
    expect(doc).toContain('2,46');
  });

  it('scheda: con esonero Tabella B spiega il divisore ridotto', () => {
    const files = estrai(costruisciDocx(corpoSchedaVerifica({
      tenant: TENANT, fascicolo: FASCICOLO, cliente: CLIENTE,
      valutazione: { ...VALUTAZIONE, tabella_b: null },
      titolari: [], documenti: [], ruleset: CNDCEC_2025,
    })));
    expect(files['word/document.xml']).toContain('sola Tabella A divisa per quattro');
  });

  it('verbale di astensione: fondamento, motivazione e riservatezza della SOS', () => {
    const files = estrai(costruisciDocx(corpoVerbaleAstensione({
      tenant: TENANT, fascicolo: FASCICOLO, cliente: CLIENTE, astensione: ASTENSIONE, nomeDecisore: 'Dott. Bianchi',
    })));
    const doc = files['word/document.xml'];
    expect(doc).toContain('Verbale di astensione');
    expect(doc).toContain('Art. 42 co. 1');
    expect(doc).toContain('trenta giorni');
    expect(doc).toContain('conservato separatamente');
    expect(doc).toContain('artt. 38 e 39');
  });

  it('fascicolo per l’ispezione: include tutto tranne le SOS, dichiara l’integrità del registro', () => {
    const files = estrai(costruisciDocx(corpoFascicoloIspezione({
      tenant: TENANT, fascicolo: FASCICOLO, cliente: CLIENTE,
      valutazioni: [VALUTAZIONE, { ...VALUTAZIONE, versione: 0, rischio_effettivo: 2.1, classe: 'POCO_SIGNIFICATIVO' }],
      titolari: TITOLARI, documenti: DOCUMENTI,
      operazioni: [{ data_operazione: '2026-06-01', descrizione: 'Acconto', importo: 4000, mezzo_pagamento: 'CONTANTE', violazione_art49: 0 }],
      astensioni: [ASTENSIONE], autovalutazione: AUTOVALUTAZIONE, auditIntegro: true,
      ruleset: CNDCEC_2025, nomiUtenti: { u_tit: 'Dott. Bianchi' }, nomeFirmatario: 'Dott. Bianchi',
    })));
    const doc = files['word/document.xml'];
    for (const atteso of [
      'Fascicolo del cliente per l’ispezione',
      'non sono incluse',
      'Autovalutazione del rischio dello studio in vigore',
      'Storico delle valutazioni del rischio',
      'Verbale di astensione',
      'catena crittografica del registro delle operazioni risulta integra',
    ]) {
      expect(doc).toContain(atteso);
    }
    // Nessun contenuto di segnalazione deve mai finire nel fascicolo.
    expect(doc).not.toContain('SOS-2026');
  });

  it('esegue l’escape XML dei dati inseriti dall’utente', () => {
    const files = estrai(costruisciDocx(corpoVerbaleAstensione({
      tenant: TENANT, fascicolo: FASCICOLO, cliente: { ...CLIENTE, denominazione: 'Beta & Gamma <Srl>' },
      astensione: { ...ASTENSIONE, motivazione: 'Cliente "opaco" & <riluttante>' }, nomeDecisore: 'X',
    })));
    const doc = files['word/document.xml'];
    expect(doc).toContain('Beta &amp; Gamma &lt;Srl&gt;');
    expect(doc).toContain('Cliente &quot;opaco&quot; &amp; &lt;riluttante&gt;');
    expect(doc).not.toContain('<Srl>');
  });
});
