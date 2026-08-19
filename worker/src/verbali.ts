/**
 * VERBALI STAMPABILI (.docx)
 *
 * Quattro documenti che lo studio esibisce materialmente in sede di verifica
 * (GdF / MEF / OAM) o conserva nel fascicolo cartaceo:
 *   1. verbale di autovalutazione del rischio (artt. 15-16, RT1);
 *   2. scheda di adeguata verifica del cliente (artt. 17-24, RT2);
 *   3. verbale di astensione (art. 42);
 *   4. fascicolo completo per l'ispezione.
 *
 * Principio: il verbale riporta i dati REGISTRATI, mai ricalcolati al volo.
 * Se un valore è nel database con la sua formula, il verbale trascrive quello:
 * un documento esibito all'ispettore deve coincidere con ciò che il registro
 * dice essere stato deciso all'epoca, con il ruleset dell'epoca.
 *
 * Le segnalazioni ex art. 35 NON compaiono mai in questi documenti: gli artt.
 * 38-39 ne riservano il contenuto e vietano la divulgazione. Il fascicolo per
 * l'ispezione rimanda alla conservazione separata.
 */

import type { Ruleset, ClasseRischio } from './domain/types';
import {
  bloccoFirma,
  elenco,
  occhiello,
  rigaIntestazione,
  tabella,
  tabellaDati,
  testo,
  titolo1,
  titolo2,
  titolo3,
  par,
  run,
  COLORI,
  type Cella,
} from './lib/docx';

// ---------------------------------------------------------------- etichette
const ETICHETTA_CLASSE: Record<string, string> = {
  NON_SIGNIFICATIVO: 'Non significativo',
  POCO_SIGNIFICATIVO: 'Poco significativo',
  ABBASTANZA_SIGNIFICATIVO: 'Abbastanza significativo',
  MOLTO_SIGNIFICATIVO: 'Molto significativo',
};

const ETICHETTA_LIVELLO: Record<string, string> = {
  SEMPLIFICATA: 'Adeguata verifica semplificata',
  ORDINARIA: 'Adeguata verifica ordinaria',
  RAFFORZATA: 'Adeguata verifica rafforzata',
};

const ETICHETTA_FONDAMENTO: Record<string, string> = {
  ART_42_CO_1:
    'Art. 42 co. 1 — impossibilità oggettiva di completare l’adeguata verifica della clientela',
  ART_42_CO_2:
    'Art. 42 co. 2 — prosecuzione di prestazione con società fiduciarie, trust, società anonime o ' +
    'controllate attraverso azioni al portatore aventi sede in Paesi terzi ad alto rischio',
  ART_18_CO_3:
    'Art. 18 co. 3 — impossibilità di adempiere agli obblighi di aggiornamento nel controllo costante',
};

const ETICHETTA_EFFETTO: Record<string, string> = {
  IMPONE_RAFFORZATA: 'Impone la verifica rafforzata',
  VIETA_SEMPLIFICATA: 'Vieta la verifica semplificata',
  IMPONE_ASTENSIONE: 'Impone l’astensione',
  ESCLUDE_OBBLIGO: 'Esclude l’obbligo di adeguata verifica',
  SEGNALA: 'Da considerare nella valutazione',
};

const ETICHETTA_TIPO_CLIENTE: Record<string, string> = {
  PERSONA_FISICA: 'Persona fisica',
  SOCIETA_CAPITALI: 'Società di capitali',
  SOCIETA_PERSONE: 'Società di persone',
  ENTE_NON_PROFIT: 'Ente non profit',
  TRUST: 'Trust o istituto giuridico affine',
  ALTRO: 'Altro',
};

const ETICHETTA_CRITERIO_TE: Record<string, string> = {
  PROPRIETA_DIRETTA: 'Proprietà diretta',
  PROPRIETA_INDIRETTA: 'Proprietà indiretta',
  CONTROLLO: 'Controllo della società',
  RESIDUALE_POTERI: 'Criterio residuale — poteri di rappresentanza o amministrazione',
};

const ETICHETTA_STATO_FASCICOLO: Record<string, string> = {
  APERTO: 'Aperto',
  IN_VERIFICA: 'In verifica',
  COMPLETO: 'Completo',
  ASTENSIONE: 'Astensione',
  CESSATO: 'Cessato',
};

/** Etichetta leggibile da un codice COSTANTE_CON_UNDERSCORE non mappato. */
function etichettaGrezza(codice: unknown): string {
  return String(codice ?? '—').replace(/_/g, ' ').toLowerCase();
}

function dataIt(iso?: string | null): string {
  if (!iso) return '—';
  const [a, m, g] = iso.slice(0, 10).split('-');
  return `${g}.${m}.${a}`;
}

function num(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return String(Math.round(v * 10000) / 10000).replace('.', ',');
}

function siNo(v: unknown): string {
  return v ? 'Sì' : 'No';
}

// Blocco intestazione comune: studio + titolo del documento.
function intestazione(tenant: any, titolo: string, sottotitolo: string): string {
  return (
    titolo1(titolo) +
    occhiello(sottotitolo) +
    tabellaDati([
      ['Soggetto obbligato', tenant.denominazione],
      ['Codice fiscale / P. IVA', [tenant.codice_fiscale, tenant.partita_iva].filter(Boolean).join(' / ') || '—'],
      ['Ordine di appartenenza', tenant.ordine_iscrizione ?? '—'],
    ])
  );
}

function tabellaPunteggi(
  titolo: string,
  voci: Array<{ etichetta: string; punteggio: number; norma?: string }>,
): string {
  const righe: Cella[][] = [rigaIntestazione(['Fattore', 'Punteggio', 'Rilevanza'], [5540, 1500, 2600])];
  for (const v of voci) {
    righe.push([
      {
        contenuto:
          par(run(v.etichetta), { spazioDopo: 0 }) +
          (v.norma ? par(run(v.norma, { colore: COLORI.grigio, punti: 8 }), { spazioDopo: 0 }) : ''),
        larghezza: 5540,
      },
      { contenuto: par(run(String(v.punteggio), { bold: true }), { allinea: 'center', spazioDopo: 0 }), larghezza: 1500 },
      { contenuto: par(run(ETICHETTA_CLASSE[claseDaPunteggio(v.punteggio)] ?? ''), { spazioDopo: 0 }), larghezza: 2600 },
    ]);
  }
  return titolo3(titolo) + tabella(righe, { larghezze: [5540, 1500, 2600] });
}

function claseDaPunteggio(p: number): string {
  return ['', 'NON_SIGNIFICATIVO', 'POCO_SIGNIFICATIVO', 'ABBASTANZA_SIGNIFICATIVO', 'MOLTO_SIGNIFICATIVO'][p] ?? '';
}

function vociDaPunteggi(
  fattori: Array<{ codice: string; etichetta: string; norma?: string }>,
  punteggi: Record<string, number>,
): Array<{ etichetta: string; punteggio: number; norma?: string }> {
  return fattori
    .filter((f) => punteggi[f.codice] !== undefined)
    .map((f) => ({ etichetta: f.etichetta, punteggio: punteggi[f.codice], norma: f.norma }));
}

/**
 * Come si nomina un professionista nel verbale (AR-M15). In uno studio
 * associato «il titolare» non basta: davanti a un'ispezione l'atto deve
 * dire chi, con quale qualifica e quale iscrizione all'albo.
 */
export interface Professionista {
  nome: string;
  qualifica?: string | null;
  ordine?: string | null;
  numeroIscrizione?: string | null;
  codiceFiscale?: string | null;
}

function descriviProfessionista(p?: Professionista | null): string {
  if (!p?.nome) return '—';
  const albo = [p.ordine ? `ODCEC di ${p.ordine}` : null, p.numeroIscrizione ? `iscr. n. ${p.numeroIscrizione}` : null]
    .filter(Boolean)
    .join(', ');
  return [p.qualifica, p.nome].filter(Boolean).join(' ') + (albo ? ` (${albo})` : '');
}

const AVVERTENZA_MODULISTICA =
  'La modulistica CNDCEC (Informativa n. 57 del 26.3.2026) ha natura esemplificativa e non obbligatoria: le ' +
  'valutazioni riportate nel presente documento restano riferite al giudizio professionale del soggetto obbligato, ' +
  'che ne ha tracciato l’iter logico valutativo.';

// ===========================================================================
// 1. VERBALE DI AUTOVALUTAZIONE
// ===========================================================================
export function corpoVerbaleAutovalutazione(dati: {
  tenant: any;
  av: any; // riga di `autovalutazioni`
  ruleset: Ruleset;
  nomeCreatore: string;
  nomeFirmatario?: string | null;
  firmatario?: Professionista | null;
}): string {
  const { tenant, av, ruleset: rs } = dati;
  const punteggi = JSON.parse(av.punteggi ?? '{}');
  const presidi: string[] = JSON.parse(av.presidi ?? '[]');
  const indicatori = (() => { try { return av.indicatori ? JSON.parse(av.indicatori) : null; } catch { return null; } })();

  let corpo = intestazione(
    tenant,
    'Verbale di autovalutazione del rischio',
    'Artt. 15 e 16 del DLgs. 21.11.2007 n. 231 — Regola tecnica CNDCEC n. 1',
  );

  corpo += titolo2('Estremi della valutazione');
  corpo += tabellaDati([
    ['Versione', `n. ${av.versione}`],
    ['Data della valutazione', dataIt(av.data_valutazione)],
    ['Regole tecniche applicate', rs.fonte],
    ['Redatta da', dati.nomeCreatore],
  ]);

  corpo += titolo2('Rischio inerente');
  corpo += tabellaPunteggi(
    'Fattori ex art. 15 co. 2',
    vociDaPunteggi(rs.autovalutazione.fattoriInerente, punteggi.inerente ?? {}),
  );

  corpo += titolo2('Vulnerabilità dei presidi');
  corpo += testo('Scala invertita: 1 corrisponde a presidi completi e strutturati, 4 a presidi insufficienti.', {}, { colore: COLORI.grigio, punti: 8.5 });
  corpo += tabellaPunteggi(
    'Fattori di vulnerabilità',
    vociDaPunteggi(rs.autovalutazione.fattoriVulnerabilita, punteggi.vulnerabilita ?? {}),
  );

  corpo += titolo2('Esito');
  corpo += tabellaDati([
    ['Rischio inerente medio', num(av.rischio_inerente)],
    ['Vulnerabilità media', num(av.vulnerabilita)],
    ['Rischio residuo', num(av.rischio_residuo)],
    ['Classe di rischio', ETICHETTA_CLASSE[av.classe] ?? av.classe],
  ]);
  corpo += testo(`Formula applicata: ${av.formula}`, {}, { colore: COLORI.grigio, punti: 8.5 });

  // AR-M15. I numeri da cui discendono i punteggi proposti, con i loro
  // denominatori: senza questi il punteggio è un'affermazione, con questi
  // è una misurazione che l'ispettore può rifare.
  if (indicatori?.fattori && Object.keys(indicatori.fattori).length > 0) {
    corpo += titolo2('Dati dello studio alla base della valutazione');
    corpo += testo(
      `Rilevazione del ${dataIt(indicatori.calcolatoIl)} su ${indicatori.fascicoliAttivi ?? 0} prestazioni in corso ` +
        `e ${indicatori.clientiAttivi ?? 0} clienti attivi` +
        (indicatori.significativo === false
          ? `. Numerosità inferiore alla soglia di significatività (${indicatori.minimoSignificativo ?? 10} prestazioni): ` +
            'le percentuali sono riportate come dato di fatto, i punteggi restano valutazione del professionista.'
          : '.'),
      {},
      { colore: COLORI.grigio, punti: 8.5 },
    );
    const righe: Cella[][] = [rigaIntestazione(['Fattore', 'Dato rilevato', 'Proposto', 'Adottato'], [3400, 5140, 1100, 1100])];
    for (const f of Object.values<any>(indicatori.fattori)) {
      righe.push([
        { contenuto: par(run(f.etichetta ?? '—'), { spazioDopo: 0 }), larghezza: 3400 },
        {
          contenuto:
            par(run(f.spiegazione ?? '—'), { spazioDopo: 0 }) +
            (f.origine === 'MODIFICATO' && f.motivazione
              ? par(run(`Motivazione dello scostamento: ${f.motivazione}`, { colore: COLORI.grigio, punti: 8 }), { spazioDopo: 0 })
              : ''),
          larghezza: 5140,
        },
        { contenuto: par(run(f.proposto != null ? String(f.proposto) : '—'), { allinea: 'center', spazioDopo: 0 }), larghezza: 1100 },
        {
          contenuto: par(run(String(f.scelto ?? '—'), { bold: f.origine === 'MODIFICATO' }), { allinea: 'center', spazioDopo: 0 }),
          larghezza: 1100,
        },
      ]);
    }
    corpo += tabella(righe, { larghezze: [3400, 5140, 1100, 1100] });
  }

  if (presidi.length > 0) {
    corpo += titolo2('Presidi e azioni di mitigazione (art. 16)');
    corpo += elenco(presidi);
  }
  if (av.note) {
    corpo += titolo2('Note');
    corpo += testo(av.note);
  }

  corpo += titolo2('Avvertenze');
  corpo += testo(AVVERTENZA_MODULISTICA, {}, { punti: 8.5 });

  if (av.firmata_il) {
    corpo += testo(
      `Autovalutazione sottoscritta da ${descriviProfessionista(dati.firmatario) !== '—' ? descriviProfessionista(dati.firmatario) : (dati.nomeFirmatario ?? 'il professionista')} in data ${dataIt(av.firmata_il)}.` +
        (av.firma_motivazione ? ` Nota di firma: ${av.firma_motivazione}` : ''),
      { spazioPrima: 6 },
      { bold: true },
    );
  }
  corpo += bloccoFirma('Il professionista / legale rappresentante', dati.nomeFirmatario ?? dati.nomeCreatore);
  return corpo;
}

// ===========================================================================
// 2. SCHEDA DI ADEGUATA VERIFICA
// ===========================================================================
export function corpoSchedaVerifica(dati: {
  tenant: any;
  fascicolo: any; // con denominazione cliente joinata
  cliente: any;
  valutazione: any | null; // ultima riga di valutazioni_rischio
  titolari: any[];
  documenti: any[];
  ruleset: Ruleset;
  nomeFirmatario?: string | null;
  /** AR-M15: chi segue la prestazione e chi ha identificato il cliente. */
  professionista?: Professionista | null;
  identificatore?: Professionista | null;
}): string {
  const { tenant, fascicolo: f, cliente: cl, valutazione: v, ruleset: rs } = dati;

  let corpo = intestazione(
    tenant,
    'Scheda di adeguata verifica della clientela',
    'Artt. 17-24 del DLgs. 21.11.2007 n. 231 — Regola tecnica CNDCEC n. 2',
  );

  corpo += titolo2('Cliente');
  corpo += tabellaDati([
    ['Denominazione / nominativo', cl.denominazione],
    ['Codice fiscale', cl.codice_fiscale ?? '—'],
    ['Partita IVA', cl.partita_iva ?? '—'],
    ['Natura giuridica', ETICHETTA_TIPO_CLIENTE[cl.tipo] ?? etichettaGrezza(cl.tipo)],
    ['Attività prevalente', [cl.attivita_prevalente, cl.ateco].filter(Boolean).join(' — ') || '—'],
    ['Paese di residenza o sede', cl.paese_residenza ?? 'IT'],
    ['Persona politicamente esposta', siNo(cl.pep) + (cl.pep_organo_pubblico ? ' (in veste di organo di pubblica amministrazione)' : '')],
  ]);

  corpo += titolo2('Incarico professionale');
  corpo += tabellaDati([
    ['Fascicolo', f.codice],
    ['Prestazione', f.prestazione_descrizione],
    ['Tipo di rapporto', f.tipo_rapporto === 'OCCASIONALE' ? 'Prestazione occasionale' : 'Rapporto continuativo'],
    ['Data di conferimento', dataIt(f.data_conferimento)],
    ['Importo dell’operazione', f.importo_operazione != null ? `€ ${num(f.importo_operazione)}` : '—'],
    ['Scopo e natura (art. 19 co. 1 lett. c)', f.scopo_natura ?? '—'],
    ['Modalità di identificazione (art. 19 co. 1 lett. a)', f.modalita_identificazione ?? '—'],
    ['Professionista incaricato', descriviProfessionista(dati.professionista)],
    [
      'Identificazione eseguita da (art. 19 co. 1 lett. a)',
      descriviProfessionista(dati.identificatore) +
        (f.data_identificazione ? ` — in data ${dataIt(f.data_identificazione)}` : ''),
    ],
    ['Stato del fascicolo', ETICHETTA_STATO_FASCICOLO[f.stato] ?? etichettaGrezza(f.stato)],
  ]);

  if (dati.titolari.length > 0) {
    corpo += titolo2('Titolarità effettiva (artt. 20-22)');
    const righe: Cella[][] = [rigaIntestazione(['Nominativo', 'Criterio', 'Quota', 'PEP'], [3600, 3740, 1300, 1000])];
    for (const t of dati.titolari) {
      righe.push([
        { contenuto: par(run(t.nominativo + (t.codice_fiscale ? ` (${t.codice_fiscale})` : '')), { spazioDopo: 0 }), larghezza: 3600 },
        { contenuto: par(run(`${ETICHETTA_CRITERIO_TE[t.criterio] ?? etichettaGrezza(t.criterio)} — ${t.norma ?? ''}`), { spazioDopo: 0 }), larghezza: 3740 },
        { contenuto: par(run(t.quota != null ? `${num(t.quota)}%` : '—'), { allinea: 'center', spazioDopo: 0 }), larghezza: 1300 },
        { contenuto: par(run(siNo(t.pep)), { allinea: 'center', spazioDopo: 0 }), larghezza: 1000 },
      ]);
    }
    corpo += tabella(righe, { larghezze: [3600, 3740, 1300, 1000] });
    const t0 = dati.titolari[0];
    if (t0?.registro_consultato) {
      corpo += testo(
        `Registro dei titolari effettivi consultato il ${dataIt(t0.registro_data)}` +
          (t0.registro_incongruenza ? ' — RILEVATA INCONGRUENZA, annotata nel fascicolo.' : ' — nessuna incongruenza rilevata.'),
        {},
        { punti: 8.5 },
      );
    }
  }

  if (v) {
    const tabA = JSON.parse(v.tabella_a ?? '{}');
    const tabB = v.tabella_b ? JSON.parse(v.tabella_b) : null;
    const vincoli = JSON.parse(v.vincoli ?? '[]');

    corpo += titolo2('Valutazione del rischio (Regola tecnica n. 2)');
    corpo += tabellaDati([
      ['Versione della valutazione', `n. ${v.versione} del ${dataIt(v.data_valutazione)}`],
      ['Regole tecniche applicate', rs.id === v.ruleset_id ? rs.fonte : v.ruleset_id],
      ['Rischio inerente della prestazione', num(v.rischio_inerente)],
    ]);

    if (v.esente_verifica) {
      corpo += testo(
        'La prestazione rientra tra quelle escluse dall’obbligo di adeguata verifica ai sensi dell’art. 17 co. 7.',
        {},
        { bold: true },
      );
    } else {
      corpo += tabellaPunteggi('Tabella A — Aspetti connessi al cliente', vociDaPunteggi(rs.adeguataVerifica.tabellaA, tabA));
      if (tabB) {
        corpo += tabellaPunteggi('Tabella B — Aspetti connessi alla prestazione', vociDaPunteggi(rs.adeguataVerifica.tabellaB, tabB));
      } else {
        corpo += testo(
          'Tabella B non compilata: la prestazione rientra tra quelle per cui la modulistica CNDCEC non ne richiede ' +
            'la compilazione (revisione legale, tenuta della contabilità, assistenza e consulenza continuativa). ' +
            'Il rischio specifico è calcolato sulla sola Tabella A divisa per quattro.',
          {},
          { punti: 8.5 },
        );
      }

      corpo += titolo3('Esito');
      corpo += tabellaDati([
        ['Rischio specifico', num(v.rischio_specifico)],
        ['Rischio effettivo', num(v.rischio_effettivo)],
        ['Classe di rischio', ETICHETTA_CLASSE[v.classe] ?? v.classe],
        ['Livello risultante dalle regole tecniche', ETICHETTA_LIVELLO[v.livello_calcolato] ?? v.livello_calcolato],
        ['Livello applicabile', ETICHETTA_LIVELLO[v.livello_applicabile] ?? v.livello_applicabile],
      ]);
      corpo += testo(`Formula applicata: ${v.formula}`, {}, { colore: COLORI.grigio, punti: 8.5 });

      if (v.livello_innalzato) {
        corpo += testo(
          'Il livello applicabile è stato innalzato rispetto all’esito aritmetico per effetto dei vincoli di legge ' +
            'indicati di seguito: l’aritmetica delle regole tecniche non deroga mai alla norma.',
          {},
          { bold: true },
        );
      }
      if (vincoli.length > 0) {
        corpo += titolo3('Vincoli normativi rilevati');
        const righe: Cella[][] = [rigaIntestazione(['Norma', 'Circostanza', 'Effetto'], [2200, 4740, 2700])];
        for (const vin of vincoli) {
          righe.push([
            { contenuto: par(run(vin.norma, { bold: true }), { spazioDopo: 0 }), larghezza: 2200 },
            { contenuto: par(run(vin.descrizione), { spazioDopo: 0 }), larghezza: 4740 },
            { contenuto: par(run(ETICHETTA_EFFETTO[vin.effetto] ?? vin.effetto), { spazioDopo: 0 }), larghezza: 2700 },
          ]);
        }
        corpo += tabella(righe, { larghezze: [2200, 4740, 2700] });
      }
      if (v.motivazione) {
        corpo += titolo3('Motivazione del professionista');
        corpo += testo(v.motivazione);
      }
      corpo += tabellaDati([
        ['Controllo costante', v.controllo_costante_mesi ? `Ogni ${v.controllo_costante_mesi} mesi (parametro organizzativo dello studio)` : '—'],
        ['Astensione dovuta (art. 42)', siNo(v.astensione_dovuta)],
        ['Valutazione SOS richiesta (art. 35)', siNo(v.valutare_sos)],
      ]);
    }
    if (v.firmata_il) {
      corpo += testo(
        `Valutazione sottoscritta da ${dati.nomeFirmatario ?? 'il professionista'} in data ${dataIt(v.firmata_il)}.` +
          (v.firma_motivazione ? ` Firma in luogo del professionista incaricato: ${v.firma_motivazione}` : ''),
        { spazioPrima: 4 },
        { bold: true },
      );
    }
  } else {
    corpo += titolo2('Valutazione del rischio');
    corpo += testo('Nessuna valutazione del rischio è stata ancora registrata per questo fascicolo.', {}, { bold: true });
  }

  if (dati.documenti.length > 0) {
    corpo += titolo2('Documenti conservati (artt. 31-32)');
    const righe: Cella[][] = [rigaIntestazione(['Tipo', 'Documento', 'Acquisito il', 'Conservare fino al'], [1900, 4040, 1850, 1850])];
    for (const d of dati.documenti) {
      righe.push([
        { contenuto: par(run(etichettaGrezza(d.tipo).replace('identita', 'identità')), { spazioDopo: 0 }), larghezza: 1900 },
        {
          contenuto:
            par(run(d.nome_file), { spazioDopo: 0 }) +
            par(run(`SHA-256 ${String(d.sha256 ?? '').slice(0, 16)}…`, { colore: COLORI.grigio, punti: 7.5, mono: true }), { spazioDopo: 0 }),
          larghezza: 4040,
        },
        { contenuto: par(run(dataIt(d.data_acquisizione)), { allinea: 'center', spazioDopo: 0 }), larghezza: 1850 },
        { contenuto: par(run(dataIt(d.conserva_fino_al)), { allinea: 'center', spazioDopo: 0 }), larghezza: 1850 },
      ]);
    }
    corpo += tabella(righe, { larghezze: [1900, 4040, 1850, 1850] });
  }

  corpo += titolo2('Avvertenze');
  corpo += testo(AVVERTENZA_MODULISTICA, {}, { punti: 8.5 });
  corpo += bloccoFirma('Il professionista incaricato', dati.nomeFirmatario ?? '');
  return corpo;
}

// ===========================================================================
// 3. VERBALE DI ASTENSIONE
// ===========================================================================
export function corpoVerbaleAstensione(dati: {
  tenant: any;
  fascicolo: any;
  cliente: any;
  astensione: any;
  nomeDecisore: string;
}): string {
  const { tenant, fascicolo: f, cliente: cl, astensione: a } = dati;

  let corpo = intestazione(
    tenant,
    'Verbale di astensione',
    'Art. 42 del DLgs. 21.11.2007 n. 231',
  );

  corpo += titolo2('Incarico interessato');
  corpo += tabellaDati([
    ['Cliente', cl.denominazione],
    ['Codice fiscale', cl.codice_fiscale ?? '—'],
    ['Fascicolo', f.codice],
    ['Prestazione', f.prestazione_descrizione],
    ['Data di conferimento', dataIt(f.data_conferimento)],
  ]);

  corpo += titolo2('Decisione');
  corpo += tabellaDati([
    ['Data della decisione', dataIt(a.data_decisione)],
    ['Fondamento normativo', ETICHETTA_FONDAMENTO[a.fondamento] ?? a.fondamento],
    ['Decisa da', dati.nomeDecisore],
  ]);

  corpo += titolo3('Motivazione');
  corpo += testo(a.motivazione);

  corpo += titolo2('Valutazione della segnalazione ex art. 35');
  corpo += testo(
    a.sos_valutata
      ? 'La posizione è stata valutata ai fini dell’eventuale segnalazione di operazione sospetta ai sensi ' +
          'dell’art. 35. L’esito della valutazione è documentato e conservato separatamente, nel rispetto degli ' +
          'artt. 38 e 39 (riservatezza del segnalante e divieto di comunicazione).'
      : 'L’art. 42 co. 1 impone, oltre all’astensione, di valutare se effettuare una segnalazione di operazione ' +
          'sospetta alla UIF ai sensi dell’art. 35. La valutazione va documentata anche quando si conclude in senso ' +
          'negativo: risulta ancora da completare.',
  );

  corpo += titolo2('Effetti');
  corpo += elenco([
    'Il professionista si astiene dall’instaurare, eseguire o proseguire la prestazione professionale interessata.',
    'Restano ferme le prestazioni per le quali l’astensione non è dovuta ai sensi dell’art. 42 co. 3 e co. 4 ' +
      '(esame della posizione giuridica, difesa in giudizio, adempimenti dichiarativi e comunicazioni obbligatorie).',
    'La documentazione acquisita resta conservata ai sensi degli artt. 31-32.',
  ]);

  corpo += bloccoFirma('Il professionista', dati.nomeDecisore);
  return corpo;
}

// ===========================================================================
// 4. FASCICOLO PER L'ISPEZIONE
// ===========================================================================
export function corpoFascicoloIspezione(dati: {
  tenant: any;
  fascicolo: any;
  cliente: any;
  valutazioni: any[];
  titolari: any[];
  documenti: any[];
  operazioni: any[];
  astensioni: any[];
  autovalutazione: any | null;
  auditIntegro: boolean | null;
  ruleset: Ruleset;
  nomiUtenti: Record<string, string>;
  nomeFirmatario?: string | null;
  /** AR-M15: chi segue la prestazione e chi ha identificato il cliente. */
  professionista?: Professionista | null;
  identificatore?: Professionista | null;
}): string {
  const { tenant, fascicolo: f, cliente: cl } = dati;

  // Copertina sintetica.
  let corpo = intestazione(
    tenant,
    'Fascicolo del cliente per l’ispezione',
    'DLgs. 21.11.2007 n. 231 — documentazione degli adempimenti di adeguata verifica, conservazione e presidio',
  );
  corpo += tabellaDati([
    ['Cliente', cl.denominazione],
    ['Fascicolo', f.codice],
    ['Documento generato il', dataIt(new Date().toISOString())],
  ]);
  corpo += testo(
    'Il presente fascicolo raccoglie le risultanze registrate nel sistema di conservazione dello studio. Le ' +
      'eventuali segnalazioni di operazioni sospette ex art. 35 non sono incluse: gli artt. 38 e 39 ne riservano ' +
      'il contenuto, che è conservato separatamente con accesso ristretto al professionista.',
    {},
    { punti: 8.5 },
  );

  if (dati.autovalutazione) {
    const av = dati.autovalutazione;
    corpo += titolo2('Autovalutazione del rischio dello studio in vigore');
    corpo += tabellaDati([
      ['Versione', `n. ${av.versione} del ${dataIt(av.data_valutazione)}`],
      ['Rischio residuo', `${num(av.rischio_residuo)} — ${ETICHETTA_CLASSE[av.classe] ?? av.classe}`],
      ['Sottoscritta', av.firmata_il ? `Sì, il ${dataIt(av.firmata_il)}` : 'No'],
    ]);
  }

  // Scheda di adeguata verifica completa (riusa il generatore dedicato, senza
  // ripetere l'intestazione dello studio).
  const scheda = corpoSchedaVerifica({
    tenant,
    fascicolo: f,
    cliente: cl,
    valutazione: dati.valutazioni[0] ?? null,
    titolari: dati.titolari,
    documenti: dati.documenti,
    ruleset: dati.ruleset,
    nomeFirmatario: dati.nomeFirmatario,
    professionista: dati.professionista,
    identificatore: dati.identificatore,
  });
  // Rimuove titolo e blocco studio della scheda (già in copertina): tiene dal primo titolo2.
  const daTitolo2 = scheda.indexOf('<w:p><w:pPr><w:pStyle w:val="Titolo2"/>');
  corpo += titolo1('Scheda di adeguata verifica');
  corpo += daTitolo2 >= 0 ? scheda.slice(daTitolo2) : scheda;

  if (dati.valutazioni.length > 1) {
    corpo += titolo2('Storico delle valutazioni del rischio');
    const righe: Cella[][] = [
      rigaIntestazione(['Versione', 'Data', 'Rischio effettivo', 'Classe', 'Livello applicato'], [1100, 1500, 1900, 2620, 2520]),
    ];
    for (const v of dati.valutazioni) {
      righe.push([
        { contenuto: par(run(`n. ${v.versione}`), { allinea: 'center', spazioDopo: 0 }), larghezza: 1100 },
        { contenuto: par(run(dataIt(v.data_valutazione)), { allinea: 'center', spazioDopo: 0 }), larghezza: 1500 },
        { contenuto: par(run(num(v.rischio_effettivo)), { allinea: 'center', spazioDopo: 0 }), larghezza: 1900 },
        { contenuto: par(run(ETICHETTA_CLASSE[v.classe] ?? v.classe), { spazioDopo: 0 }), larghezza: 2620 },
        { contenuto: par(run(ETICHETTA_LIVELLO[v.livello_applicabile] ?? v.livello_applicabile), { spazioDopo: 0 }), larghezza: 2520 },
      ]);
    }
    corpo += tabella(righe, { larghezze: [1100, 1500, 1900, 2620, 2520] });
  }

  if (dati.operazioni.length > 0) {
    corpo += titolo2('Operazioni registrate (controllo art. 49 sull’uso del contante)');
    const righe: Cella[][] = [
      rigaIntestazione(['Data', 'Descrizione', 'Importo', 'Mezzo', 'Art. 49'], [1400, 4040, 1500, 1500, 1200]),
    ];
    for (const o of dati.operazioni) {
      righe.push([
        { contenuto: par(run(dataIt(o.data_operazione)), { allinea: 'center', spazioDopo: 0 }), larghezza: 1400 },
        { contenuto: par(run(o.descrizione ?? '—'), { spazioDopo: 0 }), larghezza: 4040 },
        { contenuto: par(run(o.importo != null ? `€ ${num(o.importo)}` : '—'), { allinea: 'right', spazioDopo: 0 }), larghezza: 1500 },
        { contenuto: par(run(String(o.mezzo_pagamento ?? '—').toLowerCase()), { allinea: 'center', spazioDopo: 0 }), larghezza: 1500 },
        {
          contenuto: par(run(o.violazione_art49 ? 'VIOLAZIONE' : 'regolare', o.violazione_art49 ? { bold: true } : {}), { allinea: 'center', spazioDopo: 0 }),
          larghezza: 1200,
        },
      ]);
    }
    corpo += tabella(righe, { larghezze: [1400, 4040, 1500, 1500, 1200] });
  }

  for (const a of dati.astensioni) {
    corpo += titolo1('Verbale di astensione');
    const verbale = corpoVerbaleAstensione({
      tenant,
      fascicolo: f,
      cliente: cl,
      astensione: a,
      nomeDecisore: dati.nomiUtenti[a.decisa_da] ?? 'Professionista',
    });
    const da = verbale.indexOf('<w:p><w:pPr><w:pStyle w:val="Titolo2"/>');
    corpo += da >= 0 ? verbale.slice(da) : verbale;
  }

  corpo += titolo2('Integrità del sistema di conservazione (art. 32)');
  corpo +=
    dati.auditIntegro === null
      ? testo('Verifica della catena del registro non eseguita.')
      : dati.auditIntegro
        ? testo(
            'La catena crittografica del registro delle operazioni risulta integra alla data di generazione del ' +
              'presente documento: le registrazioni non presentano alterazioni.',
          )
        : testo(
            'ATTENZIONE: la verifica della catena crittografica del registro ha rilevato incongruenze. ' +
              'Approfondire prima di esibire il fascicolo.',
            {},
            { bold: true },
          );

  corpo += titolo2('Avvertenze');
  corpo += testo(AVVERTENZA_MODULISTICA, {}, { punti: 8.5 });
  corpo += bloccoFirma('Il professionista incaricato', dati.nomeFirmatario ?? '');
  return corpo;
}
