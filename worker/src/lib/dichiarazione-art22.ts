/**
 * DICHIARAZIONE DEL CLIENTE SUL TITOLARE EFFETTIVO — art. 22 (AR-M18-06)
 *
 * L'art. 22 co. 1-2 mette in capo AL CLIENTE l'obbligo di fornire per iscritto,
 * sotto la propria responsabilità, le informazioni sul titolare effettivo (e
 * sullo scopo e natura del rapporto). Oggi gli studi lo fanno compilare su un
 * modulo generico che il cliente compila male perché non sa cosa scrivere.
 *
 * Con la compagine letta dalla visura il programma genera la dichiarazione
 * GIÀ COMPILATA: «risulta dal Registro Imprese che il capitale è così
 * ripartito…; in base a ciò il titolare effettivo è individuato in…». Il
 * cliente conferma o corregge, risponde alle domande che la visura non può
 * sapere (patti, vincoli, interposizioni: art. 20 co. 3) e dichiara lo status
 * di PEP. Due canali, stesso contenuto: .docx per la firma in presenza, oppure
 * la verifica a distanza (AR-M8) che parte dalla proposta invece che dal vuoto.
 *
 * Confine da non superare: la dichiarazione del cliente NON scrive i titolari
 * effettivi. Torna al professionista come documento del fascicolo e come
 * risposte da valutare (artt. 20-22).
 */

import type { Env } from './tipi';
import { dettagliCliente, propostaFascicolo } from './proposta-fascicolo';
import { etichettaCarica } from '../domain/titolare-effettivo';
import type { CriterioTitolarita } from '../domain/titolare-effettivo';
import { bloccoFirma, elenco, occhiello, par, rigaIntestazione, run, tabella, tabellaDati, testo, titolo1, titolo2, titolo3, COLORI, type Cella } from './docx';

export const DOMANDE_CONTROLLO_BASE = [
  'Esistono patti parasociali, accordi di voto o sindacati di blocco fra i soci?',
  'Lo statuto attribuisce a singoli soci diritti particolari sull’amministrazione o sulla distribuzione degli utili (art. 2468 co. 3 c.c.) o prevede voto plurimo?',
  'Esistono vincoli contrattuali, finanziamenti o garanzie che consentono a un soggetto di esercitare un’influenza dominante sulla società (art. 2359 c.c.)?',
  'Le quote o azioni sono gravate da usufrutto, pegno, sequestro o pignoramento e, in tal caso, a chi spetta il diritto di voto (art. 2352 c.c.)?',
  'Qualcuno dei soci detiene la partecipazione per conto di terzi (interposizione, mandato fiduciario)?',
];

const ETICHETTA_CRITERIO: Record<string, string> = {
  PROPRIETA_DIRETTA: 'proprietà diretta (art. 20 co. 2 lett. a)',
  PROPRIETA_INDIRETTA: 'proprietà indiretta (art. 20 co. 2 lett. b)',
  CONTROLLO: 'controllo (art. 20 co. 3)',
  PERSONA_GIURIDICA_PRIVATA: 'art. 20 co. 4',
  RESIDUALE_POTERI: 'criterio residuale — poteri di rappresentanza o amministrazione (art. 20 co. 5)',
  TRUST: 'art. 22 co. 5',
  PROCEDURA_CONCORSUALE: 'organo della procedura',
};

export interface PrecompilataArt22 {
  versione: 1;
  generataIl: string;
  cliente: { id: string; denominazione: string; codiceFiscale: string | null; partitaIva: string | null; tipo: string; sede: string | null };
  fonte: { visuraDel: string | null; dataElencoSoci: string | null; capitaleSottoscritto: number | null };
  ripartizione: Array<{ nome: string; tipo: string; quotaPercento: number; diritto: string; quoteProprie: boolean; paese: string | null }>;
  cariche: Array<{ nome: string; carica: string; rappresentanzaLegale: boolean }>;
  titolariProposti: Array<{ nominativo: string; criterio: CriterioTitolarita; etichettaCriterio: string; norma: string; quota: number | null; motivazione: string }>;
  criterioApplicato: string;
  richiedeMotivazioneResiduale: boolean;
  esecutore: { nominativo: string; carica: string; codiceFiscale: string | null } | null;
  /** Domande di controllo (art. 20 co. 3): quelle dell'alert A2 se scattato, altrimenti la serie base. */
  domande: string[];
  alert: string[];
  /** Vero se non c'è compagine in archivio: la dichiarazione si limita a chiedere. */
  senzaCompagine: boolean;
}

/** Risposte del cliente (dal modulo a distanza o trascritte dal professionista). */
export interface RispostaArt22 {
  conferma: 'CONFERMA' | 'CORREGGE';
  correzioni?: string | null;
  titolari?: Array<{ nominativo: string; codiceFiscale?: string | null; quota?: string | number | null }>;
  risposte: Array<{ domanda: string; risposta: 'SI' | 'NO'; dettagli?: string | null }>;
  pep: Array<{ nominativo: string; ruolo: 'TITOLARE_EFFETTIVO' | 'ESECUTORE' | 'CLIENTE'; pep: boolean; dettagli?: string | null }>;
  dichiarante?: { nome?: string | null; qualita?: string | null } | null;
  resaIl?: string | null;
  canale?: 'DISTANZA' | 'PRESENZA';
}

const pct = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;
const dataIt = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '—');
const euro = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Costruisce la dichiarazione precompilata dai dati in archivio. */
export async function precompilaDichiarazione(env: Env, tenantId: string, cliente: any, fascicoloId: string | null): Promise<PrecompilataArt22> {
  const [dettagli, pf] = await Promise.all([
    dettagliCliente(env, tenantId, cliente),
    propostaFascicolo(env, tenantId, cliente, fascicoloId ? { id: fascicoloId } : null),
  ]);
  const pt = pf.titolarita;
  const a2 = pt.alert.find((a) => a.codice === 'A2');
  const domande = a2 && a2.azione.tipo === 'DOMANDE_ART22' ? a2.azione.domande : DOMANDE_CONTROLLO_BASE;
  const soci = pt.soci.filter((s) => !s.quoteProprie);
  return {
    versione: 1,
    generataIl: new Date().toISOString(),
    cliente: {
      id: cliente.id, denominazione: cliente.denominazione, codiceFiscale: cliente.codice_fiscale ?? null, partitaIva: cliente.partita_iva ?? null,
      tipo: cliente.tipo, sede: dettagli?.sede ?? null,
    },
    fonte: { visuraDel: dettagli?.visuraDel ?? null, dataElencoSoci: pt.soci[0]?.fonteData ?? null, capitaleSottoscritto: dettagli?.capitaleSociale != null ? Number(dettagli.capitaleSociale) : null },
    ripartizione: soci.map((s) => ({ nome: s.nome, tipo: s.tipo, quotaPercento: s.quotaPercento, diritto: s.diritto ?? 'PROPRIETA', quoteProprie: false, paese: s.paese ?? null })),
    cariche: pt.cariche.map((c) => ({ nome: c.nome, carica: c.caricaTesto ?? etichettaCarica(c.carica), rappresentanzaLegale: Boolean(c.rappresentanzaLegale) })),
    titolariProposti: soci.length
      ? pt.analisi.titolari.map((t) => ({
          nominativo: t.denominazione, criterio: t.criterio, etichettaCriterio: ETICHETTA_CRITERIO[t.criterio] ?? t.criterio, norma: t.norma,
          quota: t.quotaEffettiva != null ? Math.round(t.quotaEffettiva * 10000) / 100 : null, motivazione: t.motivazione,
        }))
      : [],
    criterioApplicato: soci.length ? pt.analisi.criterioApplicato : 'NESSUNO',
    richiedeMotivazioneResiduale: soci.length ? pt.analisi.richiedeMotivazioneResiduale : false,
    esecutore: pf.esecutore ? { nominativo: pf.esecutore.nominativo, carica: pf.esecutore.caricaTesto, codiceFiscale: pf.esecutore.codiceFiscale } : null,
    domande,
    alert: pt.alert.map((a) => a.codice),
    senzaCompagine: soci.length === 0,
  };
}

/** Validazione minima delle risposte arrivate dal modulo pubblico (dati del cliente: mai fidarsi). */
export function normalizzaRispostaArt22(input: any, precompilata: PrecompilataArt22): { errore?: string; risposta?: RispostaArt22 } {
  if (!input || typeof input !== 'object') return { errore: 'Dichiarazione sul titolare effettivo mancante' };
  const conferma = input.conferma === 'CORREGGE' ? 'CORREGGE' : input.conferma === 'CONFERMA' ? 'CONFERMA' : null;
  if (!conferma) return { errore: 'Indica se confermi o correggi la ricostruzione del titolare effettivo' };
  const risposte: RispostaArt22['risposte'] = [];
  for (const d of precompilata.domande) {
    const r = Array.isArray(input.risposte) ? input.risposte.find((x: any) => x?.domanda === d) : null;
    if (!r || (r.risposta !== 'SI' && r.risposta !== 'NO')) return { errore: 'Rispondi a tutte le domande sul controllo della società' };
    risposte.push({ domanda: d, risposta: r.risposta, dettagli: r.risposta === 'SI' ? String(r.dettagli ?? '').slice(0, 1000) : null });
  }
  const pep: RispostaArt22['pep'] = [];
  for (const p of Array.isArray(input.pep) ? input.pep : []) {
    if (!p || typeof p.nominativo !== 'string') continue;
    pep.push({ nominativo: p.nominativo.slice(0, 200), ruolo: ['ESECUTORE', 'CLIENTE'].includes(p.ruolo) ? p.ruolo : 'TITOLARE_EFFETTIVO', pep: p.pep === true, dettagli: p.pep === true ? String(p.dettagli ?? '').slice(0, 500) : null });
  }
  const attesi = new Set([...precompilata.titolariProposti.map((t) => t.nominativo), ...(precompilata.esecutore ? [precompilata.esecutore.nominativo] : [])]);
  for (const n of attesi) if (!pep.some((p) => p.nominativo === n)) return { errore: `Indica se ${n} è persona politicamente esposta` };
  const titolari = conferma === 'CORREGGE' && Array.isArray(input.titolari)
    ? input.titolari.filter((t: any) => t && typeof t.nominativo === 'string' && t.nominativo.trim()).slice(0, 20)
        .map((t: any) => ({ nominativo: String(t.nominativo).trim().slice(0, 200), codiceFiscale: String(t.codiceFiscale ?? '').trim().toUpperCase().slice(0, 16) || null, quota: String(t.quota ?? '').slice(0, 10) || null }))
    : undefined;
  const correzioni = conferma === 'CORREGGE' ? String(input.correzioni ?? '').slice(0, 2000) : null;
  if (conferma === 'CORREGGE' && !correzioni && !(titolari && titolari.length)) return { errore: 'Se correggi la ricostruzione, descrivi cosa non corrisponde o indica i titolari effettivi' };
  return { risposta: { conferma, correzioni, titolari, risposte, pep, canale: 'DISTANZA' } };
}

/** Indizi che il professionista deve valutare: risposte «Sì» al controllo, correzioni, PEP dichiarati. */
export function segnaliDaValutare(r: RispostaArt22): string[] {
  const out: string[] = [];
  if (r.conferma === 'CORREGGE') out.push('il cliente ha corretto la ricostruzione dei titolari effettivi');
  for (const x of r.risposte) if (x.risposta === 'SI') out.push(`risposta affermativa: «${x.domanda}»${x.dettagli ? ` — ${x.dettagli}` : ''}`);
  for (const p of r.pep) if (p.pep) out.push(`${p.nominativo} dichiarato persona politicamente esposta${p.dettagli ? ` (${p.dettagli})` : ''}`);
  return out;
}

// ---------------------------------------------------------------- il .docx

/**
 * Corpo della dichiarazione. Senza `risposta` è il modulo da firmare in
 * presenza (caselle vuote); con `risposta` è la trascrizione di quanto il
 * cliente ha dichiarato a distanza, che si conserva nel fascicolo.
 */
export function corpoDichiarazioneArt22(dati: { tenant: any; precompilata: PrecompilataArt22; risposta?: RispostaArt22 | null; fascicoloCodice?: string | null }): string {
  const { tenant, precompilata: p, risposta: r } = dati;
  const casella = (v: boolean | null) => (v === null ? '☐' : v ? '☒' : '☐');
  let corpo =
    titolo1('Dichiarazione del cliente sul titolare effettivo') +
    occhiello('Art. 22 co. 1-2 del DLgs. 21.11.2007 n. 231 — informazioni fornite dal cliente sotto la propria responsabilità') +
    tabellaDati([
      ['Resa a', tenant.denominazione],
      ['Cliente', p.cliente.denominazione],
      ['Codice fiscale / P. IVA', [p.cliente.codiceFiscale, p.cliente.partitaIva].filter(Boolean).join(' / ') || '—'],
      ['Sede', p.cliente.sede ?? '—'],
      ...(dati.fascicoloCodice ? [['Fascicolo', dati.fascicoloCodice] as [string, string]] : []),
    ]);

  const dichiarante = r?.dichiarante?.nome ?? p.esecutore?.nominativo ?? '____________________';
  const qualita = r?.dichiarante?.qualita ?? p.esecutore?.carica ?? '____________________';
  corpo += testo(
    `Il/La sottoscritto/a ${dichiarante}, in qualità di ${qualita} di ${p.cliente.denominazione}, consapevole delle responsabilità previste ` +
      'dall’art. 55 co. 3 del DLgs. 231/2007 per chi fornisce dati falsi o informazioni non veritiere, ai sensi dell’art. 22 dello stesso decreto dichiara quanto segue.',
  );

  // 1. Assetto proprietario dalla visura.
  corpo += titolo2('1. Assetto proprietario risultante dal Registro Imprese');
  if (p.senzaCompagine) {
    corpo += testo('Non risultano in archivio dati camerali sulla compagine: il dichiarante indica di seguito i soci e le rispettive quote.');
    corpo += tabella([rigaIntestazione(['Socio', 'Quota %', 'Diritto'], [5240, 1800, 2600]), ...[1, 2, 3, 4].map(() => [
      { contenuto: par(run(' ')), larghezza: 5240 }, { contenuto: par(run(' ')), larghezza: 1800 }, { contenuto: par(run(' ')), larghezza: 2600 },
    ])], { larghezze: [5240, 1800, 2600] });
  } else {
    corpo += testo(
      `Dalla visura camerale${p.fonte.visuraDel ? ` estratta il ${dataIt(p.fonte.visuraDel)}` : ''}${p.fonte.dataElencoSoci ? ` (elenco soci al ${dataIt(p.fonte.dataElencoSoci)})` : ''} risulta che il capitale sociale` +
        `${p.fonte.capitaleSottoscritto != null ? ` di euro ${euro(p.fonte.capitaleSottoscritto)}` : ''} è così ripartito:`,
    );
    const righe: Cella[][] = [rigaIntestazione(['Socio', 'Natura', 'Quota', 'Diritto'], [4440, 2000, 1400, 1800])];
    for (const s of p.ripartizione) {
      righe.push([
        { contenuto: par(run(s.nome + (s.paese && s.paese !== 'IT' ? ` (${s.paese})` : '')), { spazioDopo: 0 }), larghezza: 4440 },
        { contenuto: par(run(s.tipo.replace(/_/g, ' ').toLowerCase()), { spazioDopo: 0 }), larghezza: 2000 },
        { contenuto: par(run(pct(s.quotaPercento)), { allinea: 'center', spazioDopo: 0 }), larghezza: 1400 },
        { contenuto: par(run(s.diritto.replace(/_/g, ' ').toLowerCase()), { spazioDopo: 0 }), larghezza: 1800 },
      ]);
    }
    corpo += tabella(righe, { larghezze: [4440, 2000, 1400, 1800] });
    if (p.cariche.length) {
      corpo += testo(`Cariche risultanti: ${p.cariche.map((c) => `${c.nome} (${c.carica}${c.rappresentanzaLegale ? ', rappresentante dell’impresa' : ''})`).join('; ')}.`, {}, { punti: 9, colore: COLORI.grigio });
    }
  }

  // 2. Titolari effettivi individuati.
  corpo += titolo2('2. Titolare effettivo individuato in base ai dati camerali');
  if (p.titolariProposti.length) {
    corpo += testo('In base a tale ripartizione, applicando l’art. 20 del DLgs. 231/2007, il titolare effettivo è individuato in:');
    const righe: Cella[][] = [rigaIntestazione(['Persona fisica', 'Criterio', 'Quota'], [3800, 4440, 1400])];
    for (const t of p.titolariProposti) {
      righe.push([
        { contenuto: par(run(t.nominativo, { bold: true }), { spazioDopo: 0 }), larghezza: 3800 },
        { contenuto: par(run(t.etichettaCriterio), { spazioDopo: 0 }), larghezza: 4440 },
        { contenuto: par(run(t.quota != null ? pct(t.quota) : '—'), { allinea: 'center', spazioDopo: 0 }), larghezza: 1400 },
      ]);
    }
    corpo += tabella(righe, { larghezze: [3800, 4440, 1400] });
  } else if (!p.senzaCompagine) {
    corpo += testo(
      'In base a tale ripartizione nessuna persona fisica detiene, direttamente o indirettamente, una partecipazione superiore alla soglia di legge: ' +
        'il criterio della proprietà non individua titolari effettivi. Si applicano, nell’ordine, il criterio del controllo (art. 20 co. 3), sulla base delle risposte al punto 3, e il criterio residuale (art. 20 co. 5).',
    );
  } else {
    corpo += testo('Il dichiarante indica le persone fisiche che possiedono o controllano in ultima istanza il cliente (art. 20):');
    corpo += tabella([rigaIntestazione(['Persona fisica', 'Codice fiscale', 'Quota / titolo'], [3800, 3000, 2840]), ...[1, 2, 3].map(() => [
      { contenuto: par(run(' ')), larghezza: 3800 }, { contenuto: par(run(' ')), larghezza: 3000 }, { contenuto: par(run(' ')), larghezza: 2840 },
    ])], { larghezze: [3800, 3000, 2840] });
  }
  corpo += par([
    run(`${casella(r ? r.conferma === 'CONFERMA' : null)} CONFERMO che la ricostruzione corrisponde alla situazione effettiva.`, { bold: true }),
  ]);
  corpo += par([
    run(`${casella(r ? r.conferma === 'CORREGGE' : null)} CORREGGO: la situazione effettiva è la seguente: `, { bold: true }),
    run(r?.conferma === 'CORREGGE' ? (r.correzioni || '') : '________________________________________________'),
  ]);
  if (r?.conferma === 'CORREGGE' && r.titolari?.length) {
    corpo += testo(`Titolari effettivi indicati dal cliente: ${r.titolari.map((t) => `${t.nominativo}${t.codiceFiscale ? ` (${t.codiceFiscale})` : ''}${t.quota ? ` — ${t.quota}%` : ''}`).join('; ')}.`);
  }

  // 3. Domande di controllo.
  corpo += titolo2('3. Informazioni che risultano solo al cliente (art. 20 co. 3)');
  corpo += testo('La visura camerale non riporta patti, accordi o vincoli che possono attribuire il controllo a soggetti diversi da quelli indicati. Il dichiarante risponde:');
  const righeD: Cella[][] = [rigaIntestazione(['Domanda', 'Sì', 'No', 'Se sì, precisare'], [5240, 600, 600, 3200])];
  for (const d of p.domande) {
    const rr = r?.risposte.find((x) => x.domanda === d) ?? null;
    righeD.push([
      { contenuto: par(run(d), { spazioDopo: 0 }), larghezza: 5240 },
      { contenuto: par(run(casella(rr ? rr.risposta === 'SI' : null)), { allinea: 'center', spazioDopo: 0 }), larghezza: 600 },
      { contenuto: par(run(casella(rr ? rr.risposta === 'NO' : null)), { allinea: 'center', spazioDopo: 0 }), larghezza: 600 },
      { contenuto: par(run(rr?.risposta === 'SI' ? rr.dettagli ?? '' : ' '), { spazioDopo: 0 }), larghezza: 3200 },
    ]);
  }
  corpo += tabella(righeD, { larghezze: [5240, 600, 600, 3200] });

  // 4. PEP.
  corpo += titolo2('4. Persone politicamente esposte (art. 1 co. 2 lett. dd)');
  corpo += testo(
    'È «politicamente esposta» la persona fisica che occupa o ha cessato da meno di un anno importanti cariche pubbliche, nonché i suoi familiari e coloro che con essa intrattengono notoriamente stretti legami. Il dichiarante indica, per ciascuna persona:',
  );
  const soggettiPep = [
    ...p.titolariProposti.map((t) => ({ nominativo: t.nominativo, ruolo: 'titolare effettivo' })),
    ...(p.esecutore ? [{ nominativo: p.esecutore.nominativo, ruolo: `esecutore (${p.esecutore.carica})` }] : []),
  ];
  if (r) for (const x of r.pep) if (!soggettiPep.some((s) => s.nominativo === x.nominativo)) soggettiPep.push({ nominativo: x.nominativo, ruolo: x.ruolo.replace(/_/g, ' ').toLowerCase() });
  const righeP: Cella[][] = [rigaIntestazione(['Persona', 'Ruolo', 'PEP', 'Non PEP', 'Carica e periodo'], [3200, 2400, 700, 900, 2440])];
  if (!soggettiPep.length) soggettiPep.push({ nominativo: '____________________', ruolo: '' });
  for (const s of soggettiPep) {
    const x = r?.pep.find((y) => y.nominativo === s.nominativo) ?? null;
    righeP.push([
      { contenuto: par(run(s.nominativo), { spazioDopo: 0 }), larghezza: 3200 },
      { contenuto: par(run(s.ruolo), { spazioDopo: 0 }), larghezza: 2400 },
      { contenuto: par(run(casella(x ? x.pep : null)), { allinea: 'center', spazioDopo: 0 }), larghezza: 700 },
      { contenuto: par(run(casella(x ? !x.pep : null)), { allinea: 'center', spazioDopo: 0 }), larghezza: 900 },
      { contenuto: par(run(x?.pep ? x.dettagli ?? '' : ' '), { spazioDopo: 0 }), larghezza: 2440 },
    ]);
  }
  corpo += tabella(righeP, { larghezze: [3200, 2400, 700, 900, 2440] });

  // 5. Impegni e firma.
  corpo += titolo2('5. Dichiarazione di veridicità e impegno all’aggiornamento');
  corpo += elenco([
    'Le informazioni fornite sono esatte e veritiere (art. 22 co. 1 DLgs. 231/2007).',
    'Il dichiarante si impegna a comunicare tempestivamente ogni variazione dei dati forniti, anche ai fini del controllo costante (art. 19 co. 1 lett. c) e art. 22 co. 1).',
    'Il dichiarante è consapevole che la falsità delle dichiarazioni è punita ai sensi dell’art. 55 co. 3 del DLgs. 231/2007.',
  ]);
  if (r?.canale === 'DISTANZA') {
    corpo += testo(
      `Dichiarazione resa a distanza tramite il modulo sicuro dello studio${r.resaIl ? ` il ${new Date(r.resaIl).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}` : ''}` +
        `${r.dichiarante?.nome ? ` da ${r.dichiarante.nome}` : ''}, con accettazione esplicita della dichiarazione di veridicità. Il documento è la trascrizione integrale di quanto dichiarato e si conserva nel fascicolo (art. 31).`,
      {}, { punti: 9, colore: COLORI.grigio },
    );
  } else {
    corpo += bloccoFirma('Il dichiarante', dichiarante);
  }
  corpo += titolo3('Nota per il professionista');
  corpo += testo(
    'La dichiarazione del cliente non sostituisce la valutazione del professionista: i titolari effettivi si registrano nel programma dopo aver riscontrato le informazioni (artt. 19 co. 1 lett. b) e 20-22). ' +
      `Proposta generata${p.fonte.visuraDel ? ` dalla visura del ${dataIt(p.fonte.visuraDel)}` : ' dai dati in archivio'}${p.alert.length ? `; alert della titolarità: ${p.alert.join(', ')}` : ''}.`,
    {}, { punti: 8, colore: COLORI.grigio },
  );
  return corpo;
}
