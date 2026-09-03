// ── Screening liste sanzioni UE / ONU / OFAC (AR-M7) ───────────
//
// Le tre liste sono DATI PUBBLICI e gratuiti:
//   UE   — Consolidated Financial Sanctions List (CSV, Commissione europea)
//   ONU  — Consolidated United Nations Security Council Sanctions List (XML)
//   OFAC — Specially Designated Nationals list (CSV, Tesoro USA)
//
// Il cron notturno le scarica (se più vecchie di un giorno), le
// normalizza in un unico elenco custodito su R2 (liste/sanzioni-v1.json.gz)
// e poi confronta OGNI cliente e OGNI titolare effettivo corrente di ogni
// studio con l'elenco. È il "controllo costante" che diventa un controllo
// vero: gira ogni notte, non quando qualcuno se ne ricorda.
//
// Scelte:
//  - le liste stanno su R2, non in D1: ~40-50 mila voci riscritte ogni
//    notte sarebbero un uso insensato del database. In D1 finiscono SOLO
//    le corrispondenze (poche), con lo stato di lavorazione.
//  - ogni fonte è isolata: se una non risponde o cambia formato, si
//    tiene l'ultima versione buona di quella fonte e si prosegue con le
//    altre. Una soglia di sanità (poche voci = parsing rotto) evita di
//    sostituire una lista buona con una vuota.
//  - il matching è per token normalizzati con indice inverso: prefiltro
//    per token condiviso, poi punteggio. Conservativo sulle corrispondenze
//    a token singolo (troppi falsi positivi).
//  - la corrispondenza è un FATTO DA ESAMINARE, mai un'accusa: la decide
//    il professionista (esclusa / confermata), con nota, e la decisione
//    finisce nel registro.

import type { Env } from './tipi';
import { scriviAudit } from './audit';
import { decifra } from './crypto';
import { gunzipToText, gzipText } from './backup';

export type FonteLista = 'UE' | 'ONU' | 'OFAC';

export type VoceLista = {
  fonte: FonteLista;
  /** Identificativo nella lista di origine (per il dedup degli esiti). */
  id: string;
  nome: string;
  /** P = persona fisica, E = entità, null = non dichiarato. */
  tipo: 'P' | 'E' | null;
  /** Anno o data di nascita, quando la lista lo dà. */
  nascita: string | null;
  /** Token normalizzati, precalcolati all'aggiornamento. */
  t: string[];
};

export type ListeSanzioni = {
  versione: 1;
  aggiornatoIl: string;
  fonti: Partial<Record<FonteLista, { scaricatoIl: string; voci: number }>>;
  voci: VoceLista[];
};

export const CHIAVE_LISTE = 'liste/sanzioni-v1.json.gz';

// ── Normalizzazione e matching ─────────────────────────────────

/** Forme societarie e parole vuote: non contano come evidenza di identità. */
const TOKEN_VUOTI = new Set([
  'SRL', 'SRLS', 'SPA', 'SAS', 'SNC', 'SS', 'SCARL', 'SCRL', 'STP', 'SC',
  'LLC', 'LTD', 'INC', 'GMBH', 'AG', 'SA', 'BV', 'NV', 'OOO', 'JSC', 'PLC',
  'CO', 'COMPANY', 'LIMITED', 'CORP', 'CORPORATION', 'HOLDING', 'HOLDINGS',
  'GROUP', 'GRUPPO', 'TRADING', 'INTERNATIONAL',
  'DI', 'DEL', 'DELLA', 'DEI', 'DEGLI', 'DELLE', 'E', 'THE', 'OF', 'AND',
  'AL', 'EL', 'LA', 'LE', 'DA', 'DE', 'DO', 'DOS', 'VAN', 'VON', 'BIN', 'ABU',
]);

/** MAIUSCOLO, senza accenti né punteggiatura, spazi compressi → token. */
export function tokenizzaNome(nome: string): string[] {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t.length > 0);
}

/** Token utili al matching: senza forme societarie e particelle. */
export function tokenUtili(tokens: string[]): string[] {
  const utili = tokens.filter((t) => !TOKEN_VUOTI.has(t) && t.length >= 2);
  // Se erano TUTTI vuoti (es. "La Società S.r.l.") si tengono gli originali:
  // meglio un confronto debole che nessun confronto.
  return utili.length > 0 ? utili : tokens;
}

export type EsitoConfronto = { corrisponde: boolean; punteggio: number };

/**
 * Confronto fra due nomi tokenizzati. Regole:
 *  - un solo token utile nel soggetto → serve l'uguaglianza quasi totale
 *    (il cognome da solo non è un'evidenza);
 *  - tutti i token del soggetto presenti nella voce (o viceversa) → 0.95;
 *  - altrimenti indice di Jaccard, corrispondenza da 0.8 in su con
 *    almeno due token in comune.
 */
export function confrontaNomi(soggetto: string[], voce: string[]): EsitoConfronto {
  const a = new Set(soggetto);
  const b = new Set(voce);
  let comuni = 0;
  for (const t of a) if (b.has(t)) comuni++;
  if (comuni === 0) return { corrisponde: false, punteggio: 0 };

  const jaccard = comuni / (a.size + b.size - comuni);

  if (a.size === 1 || b.size === 1) {
    return { corrisponde: jaccard >= 0.99, punteggio: jaccard };
  }
  const contenuto = comuni === a.size || comuni === b.size;
  if (contenuto && comuni >= 2) return { corrisponde: true, punteggio: Math.max(jaccard, 0.95) };
  return { corrisponde: jaccard >= 0.8 && comuni >= 2, punteggio: jaccard };
}

// ── Lettura CSV tollerante (gestisce virgolette e separatori nei campi) ──

export function leggiCsv(testo: string, separatore: string): string[][] {
  const righe: string[][] = [];
  let campo = '';
  let riga: string[] = [];
  let inQuote = false;
  for (let i = 0; i < testo.length; i++) {
    const ch = testo[i];
    if (inQuote) {
      if (ch === '"') {
        if (testo[i + 1] === '"') { campo += '"'; i++; } else inQuote = false;
      } else campo += ch;
      continue;
    }
    if (ch === '"') { inQuote = true; continue; }
    if (ch === separatore) { riga.push(campo); campo = ''; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && testo[i + 1] === '\n') i++;
      riga.push(campo); campo = '';
      if (riga.length > 1 || riga[0] !== '') righe.push(riga);
      riga = [];
      continue;
    }
    campo += ch;
  }
  riga.push(campo);
  if (riga.length > 1 || riga[0] !== '') righe.push(riga);
  return righe;
}

// ── Parser delle tre fonti ─────────────────────────────────────
// Tolleranti per costruzione: cercano le colonne per nome, ignorano ciò
// che non riconoscono, scartano le righe senza nome. Se il formato
// cambiasse davvero, il conteggio crolla sotto la soglia di sanità e la
// lista precedente resta in uso (con errore nei log).

export function parseListaUe(csv: string): VoceLista[] {
  const righe = leggiCsv(csv, ';');
  if (righe.length < 2) return [];
  const testata = righe[0].map((h) => h.trim());
  const col = (nome: string) => testata.findIndex((h) => h.toLowerCase() === nome.toLowerCase());
  const iNome = col('NameAlias_WholeName');
  const iId = col('Entity_LogicalId');
  const iTipo = col('Entity_SubjectType');
  const iNascita = col('BirthDate_BirthDate');
  if (iNome < 0) return [];

  const voci: VoceLista[] = [];
  for (let r = 1; r < righe.length; r++) {
    const riga = righe[r];
    const nome = (riga[iNome] ?? '').trim();
    if (!nome) continue;
    const tipoGrezzo = (iTipo >= 0 ? riga[iTipo] ?? '' : '').toLowerCase();
    voci.push({
      fonte: 'UE',
      id: `${(iId >= 0 ? riga[iId] : '') || r}`,
      nome,
      tipo: tipoGrezzo.includes('person') ? 'P' : tipoGrezzo.includes('enterprise') ? 'E' : null,
      nascita: (iNascita >= 0 ? riga[iNascita] ?? '' : '').trim() || null,
      t: tokenUtili(tokenizzaNome(nome)),
    });
  }
  return voci;
}

function estraiTag(blocco: string, tag: string): string {
  const m = blocco.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

export function parseListaOnu(xml: string): VoceLista[] {
  const voci: VoceLista[] = [];

  // Il tag esatto (con ">") non cattura i derivati: <INDIVIDUAL> non
  // combacia con <INDIVIDUAL_ALIAS>, <ENTITY> non combacia con
  // <ENTITY_ALIAS>. I blocchi compaiono solo nelle rispettive sezioni.
  const blocchi = (tag: string): string[] =>
    xml.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'gi')) ?? [];

  for (const blocco of blocchi('INDIVIDUAL')) {
    const nome = ['FIRST_NAME', 'SECOND_NAME', 'THIRD_NAME', 'FOURTH_NAME']
      .map((t) => estraiTag(blocco, t))
      .filter(Boolean)
      .join(' ');
    if (!nome) continue;
    const dataId = estraiTag(blocco, 'DATAID') || String(voci.length);
    const anno = blocco.match(/<YEAR>(\d{4})<\/YEAR>/i)?.[1] ?? null;
    voci.push({ fonte: 'ONU', id: dataId, nome, tipo: 'P', nascita: anno, t: tokenUtili(tokenizzaNome(nome)) });
    // Alias di qualità "buona": voci separate con lo stesso id + suffisso.
    const alias = blocco.match(/<ALIAS_NAME>([\s\S]*?)<\/ALIAS_NAME>/gi) ?? [];
    alias.forEach((a, i) => {
      const nomeAlias = a.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (nomeAlias && nomeAlias.toLowerCase() !== nome.toLowerCase()) {
        voci.push({ fonte: 'ONU', id: `${dataId}-a${i}`, nome: nomeAlias, tipo: 'P', nascita: anno, t: tokenUtili(tokenizzaNome(nomeAlias)) });
      }
    });
  }

  for (const blocco of blocchi('ENTITY')) {
    const nome = estraiTag(blocco, 'FIRST_NAME');
    if (!nome) continue;
    const dataId = estraiTag(blocco, 'DATAID') || `E${voci.length}`;
    voci.push({ fonte: 'ONU', id: dataId, nome, tipo: 'E', nascita: null, t: tokenUtili(tokenizzaNome(nome)) });
  }

  return voci;
}

export function parseListaOfac(csv: string): VoceLista[] {
  const righe = leggiCsv(csv, ',');
  const voci: VoceLista[] = [];
  for (const riga of righe) {
    // Formato sdn.csv: ent_num, SDN_Name, SDN_Type, Program, ...
    if (riga.length < 3) continue;
    const id = (riga[0] ?? '').trim();
    const nome = (riga[1] ?? '').trim();
    const tipo = (riga[2] ?? '').trim().toLowerCase();
    if (!/^\d+$/.test(id) || !nome || nome === '-0-') continue;
    voci.push({
      fonte: 'OFAC',
      id,
      nome,
      tipo: tipo === 'individual' ? 'P' : tipo && tipo !== '-0-' ? 'E' : null,
      nascita: null,
      t: tokenUtili(tokenizzaNome(nome)),
    });
  }
  return voci;
}

// ── Fixtures per sviluppo e smoke (SANZIONI_FIXTURES=1) ────────

const VOCI_FINTE: VoceLista[] = [
  { fonte: 'ONU', id: 'FX1', nome: 'MARIO ROSSI COLLAUDO SANZIONI', tipo: 'P', nascita: '1960', t: tokenUtili(tokenizzaNome('MARIO ROSSI COLLAUDO SANZIONI')) },
  { fonte: 'UE', id: 'FX2', nome: 'ACME EXPORT TRADING FZE', tipo: 'E', nascita: null, t: tokenUtili(tokenizzaNome('ACME EXPORT TRADING FZE')) },
  { fonte: 'OFAC', id: 'FX3', nome: 'IVANOV PETROV KONSTANTIN', tipo: 'P', nascita: '1975', t: tokenUtili(tokenizzaNome('IVANOV PETROV KONSTANTIN')) },
];

// ── Aggiornamento delle liste su R2 ────────────────────────────

/** Sotto questa soglia il parsing è considerato rotto e la fonte NON viene sostituita. */
const SOGLIA_SANITA: Record<FonteLista, number> = { UE: 500, ONU: 300, OFAC: 1000 };
const TIMEOUT_FETCH_MS = 45_000;

const URL_DEFAULT: Record<FonteLista, string> = {
  UE: 'https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw',
  ONU: 'https://scsanctions.un.org/resources/xml/en/consolidated.xml',
  OFAC: 'https://www.treasury.gov/ofac/downloads/sdn.csv',
};

export async function caricaListe(env: Env): Promise<ListeSanzioni | null> {
  const obj = await env.BACKUPS.get(CHIAVE_LISTE);
  if (!obj) return null;
  try {
    return JSON.parse(await gunzipToText(await obj.arrayBuffer())) as ListeSanzioni;
  } catch {
    return null;
  }
}

async function salvaListe(env: Env, liste: ListeSanzioni): Promise<void> {
  await env.BACKUPS.put(CHIAVE_LISTE, await gzipText(JSON.stringify(liste)), {
    httpMetadata: { contentType: 'application/gzip' },
    customMetadata: { aggiornatoIl: liste.aggiornatoIl, voci: String(liste.voci.length) },
  });
}

export type EsitoAggiornamento = {
  fonti: Record<FonteLista, { esito: 'aggiornata' | 'mantenuta' | 'assente'; voci: number; errore?: string }>;
  totale: number;
};

/**
 * Scarica e rimpiazza ogni fonte in modo indipendente; in caso di errore
 * o parsing sotto soglia si tengono le voci precedenti di quella fonte.
 */
export async function aggiornaListeSanzioni(env: Env): Promise<EsitoAggiornamento> {
  const adesso = new Date().toISOString();

  if (env.SANZIONI_FIXTURES === '1') {
    const liste: ListeSanzioni = {
      versione: 1,
      aggiornatoIl: adesso,
      fonti: { UE: { scaricatoIl: adesso, voci: 1 }, ONU: { scaricatoIl: adesso, voci: 1 }, OFAC: { scaricatoIl: adesso, voci: 1 } },
      voci: VOCI_FINTE,
    };
    await salvaListe(env, liste);
    return {
      fonti: {
        UE: { esito: 'aggiornata', voci: 1 }, ONU: { esito: 'aggiornata', voci: 1 }, OFAC: { esito: 'aggiornata', voci: 1 },
      },
      totale: VOCI_FINTE.length,
    };
  }

  const precedenti = await caricaListe(env);
  const parser: Record<FonteLista, (testo: string) => VoceLista[]> = {
    UE: parseListaUe, ONU: parseListaOnu, OFAC: parseListaOfac,
  };
  const url: Record<FonteLista, string> = {
    UE: env.URL_LISTA_UE ?? URL_DEFAULT.UE,
    ONU: env.URL_LISTA_ONU ?? URL_DEFAULT.ONU,
    OFAC: env.URL_LISTA_OFAC ?? URL_DEFAULT.OFAC,
  };

  const esito: EsitoAggiornamento = {
    fonti: {
      UE: { esito: 'assente', voci: 0 }, ONU: { esito: 'assente', voci: 0 }, OFAC: { esito: 'assente', voci: 0 },
    },
    totale: 0,
  };
  const fonti: Partial<ListeSanzioni['fonti']> = {};
  const voci: VoceLista[] = [];

  for (const fonte of ['UE', 'ONU', 'OFAC'] as const) {
    let nuove: VoceLista[] | null = null;
    try {
      const r = await fetch(url[fonte], { signal: AbortSignal.timeout(TIMEOUT_FETCH_MS) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      nuove = parser[fonte](await r.text());
      if (nuove.length < SOGLIA_SANITA[fonte]) {
        throw new Error(`solo ${nuove.length} voci: probabile cambio di formato`);
      }
    } catch (e) {
      esito.fonti[fonte].errore = e instanceof Error ? e.message : 'errore sconosciuto';
      nuove = null;
    }

    if (nuove) {
      voci.push(...nuove);
      fonti[fonte] = { scaricatoIl: adesso, voci: nuove.length };
      esito.fonti[fonte] = { ...esito.fonti[fonte], esito: 'aggiornata', voci: nuove.length };
    } else {
      const vecchie = (precedenti?.voci ?? []).filter((v) => v.fonte === fonte);
      if (vecchie.length) {
        voci.push(...vecchie);
        fonti[fonte] = precedenti!.fonti[fonte] ?? { scaricatoIl: precedenti!.aggiornatoIl, voci: vecchie.length };
        esito.fonti[fonte] = { ...esito.fonti[fonte], esito: 'mantenuta', voci: vecchie.length };
      }
    }
  }

  esito.totale = voci.length;
  if (voci.length > 0) {
    await salvaListe(env, { versione: 1, aggiornatoIl: adesso, fonti, voci });
  }
  return esito;
}

/** Le liste vanno riaggiornate? (più vecchie di ~22 ore o assenti) */
export async function listeDaAggiornare(env: Env): Promise<boolean> {
  const liste = await caricaListe(env);
  if (!liste) return true;
  return Date.now() - Date.parse(liste.aggiornatoIl) > 22 * 3600_000;
}

// ── Screening di uno studio ────────────────────────────────────

export type EsitoScreening = {
  soggetti: number;
  nuoveCorrispondenze: number;
  daEsaminare: number;
};

export type SoggettoScreening = { tipo: 'CLIENTE' | 'TITOLARE_EFFETTIVO' | 'SOCIO' | 'CARICA'; id: string; nominativo: string };

function indiceInverso(voci: VoceLista[]): Map<string, number[]> {
  const indice = new Map<string, number[]>();
  voci.forEach((v, i) => {
    for (const t of v.t) {
      const posting = indice.get(t);
      if (posting) posting.push(i);
      else indice.set(t, [i]);
    }
  });
  return indice;
}

/**
 * Confronta un elenco di soggetti con le liste e registra le corrispondenze
 * nuove. Riusato dalla corsa periodica e dallo screening immediato dei nomi
 * estratti dalla visura (AR-M17, soci e titolari di cariche).
 */
export async function screeningSoggetti(
  env: Env,
  tenantId: string,
  soggetti: SoggettoScreening[],
  liste: ListeSanzioni,
  indice?: Map<string, number[]>,
): Promise<{ nuove: number; corrispondenze: Array<{ soggettoId: string; nominativo: string; fonte: FonteLista; punteggio: number }> }> {
  const idx = indice ?? indiceInverso(liste.voci);
  let nuove = 0;
  const corrispondenze: Array<{ soggettoId: string; nominativo: string; fonte: FonteLista; punteggio: number }> = [];
  for (const s of soggetti) {
    const tokens = tokenUtili(tokenizzaNome(s.nominativo));
    if (!tokens.length) continue;

    // Prefiltro con l'indice inverso: si valutano solo le voci che
    // condividono almeno un token utile con il soggetto.
    const candidate = new Set<number>();
    for (const t of tokens) for (const i of idx.get(t) ?? []) candidate.add(i);

    for (const i of candidate) {
      const voce = liste.voci[i];
      const { corrisponde, punteggio } = confrontaNomi(tokens, voce.t);
      if (!corrisponde) continue;
      corrispondenze.push({ soggettoId: s.id, nominativo: s.nominativo, fonte: voce.fonte, punteggio: Math.round(punteggio * 100) / 100 });
      const r = await env.DB.prepare(
        `INSERT INTO screening_esiti (id, tenant_id, soggetto_tipo, soggetto_id, nominativo, fonte, voce_lista, voce_id, punteggio)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (tenant_id, soggetto_tipo, soggetto_id, fonte, voce_id) DO NOTHING`,
      ).bind(
        crypto.randomUUID().replace(/-/g, '').slice(0, 20),
        tenantId, s.tipo, s.id, s.nominativo, voce.fonte, voce.nome, voce.id, Math.round(punteggio * 100) / 100,
      ).run();
      if (r.meta.changes) nuove++;
    }
  }
  return { nuove, corrispondenze };
}

/**
 * Soci persone fisiche e titolari di cariche vigenti (AR-M17): i nomi sono
 * cifrati per tenant, si decifrano solo per il confronto. Chi non è
 * decifrabile viene saltato senza fermare la corsa.
 */
export async function soggettiCompagine(env: Env, tenantId: string): Promise<SoggettoScreening[]> {
  const out: SoggettoScreening[] = [];
  const soci = (
    await env.DB.prepare("SELECT id, socio_nome, socio_tipo FROM partecipazioni WHERE tenant_id = ? AND valido_al IS NULL AND quote_proprie = 0").bind(tenantId).all<any>()
  ).results ?? [];
  const cariche = (
    await env.DB.prepare('SELECT id, nome FROM cariche WHERE tenant_id = ? AND valido_al IS NULL').bind(tenantId).all<any>()
  ).results ?? [];
  const leggi = async (v: string | null): Promise<string | null> => {
    if (!v) return null;
    try {
      const j = JSON.parse(v);
      if (j && typeof j === 'object' && 'contenuto' in j) return await decifra(env.MASTER_KEY, tenantId, j);
      return typeof j === 'string' ? j : null;
    } catch {
      return v; // in chiaro (persone giuridiche)
    }
  };
  for (const s of soci) {
    const nome = await leggi(s.socio_nome);
    if (nome) out.push({ tipo: 'SOCIO', id: s.id, nominativo: nome });
  }
  for (const c of cariche) {
    const nome = await leggi(c.nome);
    if (nome) out.push({ tipo: 'CARICA', id: c.id, nominativo: nome });
  }
  return out;
}

export async function eseguiScreeningTenant(
  env: Env,
  tenantId: string,
  liste: ListeSanzioni,
  indice?: Map<string, number[]>,
): Promise<EsitoScreening> {
  const idx = indice ?? indiceInverso(liste.voci);

  const clienti = (
    await env.DB.prepare('SELECT id, denominazione FROM clienti WHERE tenant_id = ? AND attivo = 1').bind(tenantId).all<any>()
  ).results ?? [];
  const titolari = (
    await env.DB.prepare('SELECT id, nominativo FROM titolari_effettivi WHERE tenant_id = ? AND valido_al IS NULL').bind(tenantId).all<any>()
  ).results ?? [];

  const soggetti: SoggettoScreening[] = [
    ...clienti.map((c: any) => ({ tipo: 'CLIENTE' as const, id: c.id, nominativo: c.denominazione })),
    ...titolari.map((t: any) => ({ tipo: 'TITOLARE_EFFETTIVO' as const, id: t.id, nominativo: t.nominativo })),
    ...(await soggettiCompagine(env, tenantId)),
  ];

  const { nuove } = await screeningSoggetti(env, tenantId, soggetti, liste, idx);

  await env.DB.prepare(
    'INSERT INTO screening_corse (tenant_id, liste_aggiornate_il, soggetti, corrispondenze_nuove) VALUES (?, ?, ?, ?)',
  ).bind(tenantId, liste.aggiornatoIl, soggetti.length, nuove).run();

  const daEsaminare = (
    await env.DB.prepare("SELECT COUNT(*) AS n FROM screening_esiti WHERE tenant_id = ? AND stato = 'DA_ESAMINARE'").bind(tenantId).first<{ n: number }>()
  )?.n ?? 0;

  // Nel registro entra SOLO la novità che richiede attenzione: le corse di
  // routine stanno in screening_corse, non fra gli accessi.
  if (nuove > 0) {
    try {
      await scriviAudit(env.DB, {
        tenantId, utenteId: null, azione: 'SCREENING_CORRISPONDENZE',
        entita: 'sistema', dettaglio: { nuoveCorrispondenze: nuove, soggetti: soggetti.length },
      });
    } catch (e) {
      console.error('audit screening:', e);
    }
  }
  return { soggetti: soggetti.length, nuoveCorrispondenze: nuove, daEsaminare };
}

export async function screeningSchedulato(env: Env): Promise<void> {
  if (await listeDaAggiornare(env)) {
    const esito = await aggiornaListeSanzioni(env);
    console.log('liste sanzioni:', JSON.stringify(esito.fonti), `totale ${esito.totale}`);
  }
  const liste = await caricaListe(env);
  if (!liste || !liste.voci.length) {
    console.error('SCREENING SALTATO: nessuna lista disponibile');
    return;
  }
  const idx = indiceInverso(liste.voci);
  const tenants = (await env.DB.prepare('SELECT id FROM tenants').all<{ id: string }>()).results ?? [];
  for (const t of tenants) {
    try {
      const r = await eseguiScreeningTenant(env, t.id, liste, idx);
      console.log(`screening ${t.id}: ${r.soggetti} soggetti, ${r.nuoveCorrispondenze} nuove, ${r.daEsaminare} da esaminare`);
    } catch (e) {
      console.error(`SCREENING ${t.id} FALLITO:`, e);
    }
  }
}
