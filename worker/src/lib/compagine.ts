/**
 * COMPAGINE, CARICHE E PROPOSTE (AR-M17)
 *
 * Qui vive tutto ciò che serve alle rotte «da visura»: persistere soci e
 * cariche cifrati con serie temporale (diff al rinnovo), rileggerli in
 * chiaro per lo studio, costruire il grafo per il motore art. 20 — chiudendo
 * da sola la catena quando il socio persona giuridica è già cliente dello
 * studio — calcolare gli alert A1-A8 e registrare la proposta in `proposte`.
 *
 * Cosa è cifrato (AES-GCM per tenant, come dati_identificativi): nome e CF
 * delle persone fisiche, CF anche delle persone giuridiche, dettagli
 * (domicilio, PEC, versato), poteri delle cariche, contenuto ed esito delle
 * proposte. In chiaro restano: il nome delle persone giuridiche (è
 * pubblico e serve agli elenchi), tipo, quota, diritto, date, codici alert.
 * `cf_hash` (HMAC per tenant) permette gli incroci senza decifrare.
 */

import type { Env } from './tipi';
import { cifra, decifra, hmacTenant, nuovoId } from './crypto';
import { scriviAudit } from './audit';
import { caricaListe, screeningSoggetti, type SoggettoScreening } from './sanzioni';
import { paeseAltoRischio } from '../domain/norme';
import {
  analizzaTitolaritaEffettiva,
  type Carica,
  type CodiceCarica,
  type DirittoPartecipazione,
  type NodoPartecipazione,
  type RisultatoAnalisiTitolarita,
} from '../domain/titolare-effettivo';
import { diffCompagine, riepilogoDiff, type DiffCompagine } from '../domain/diff-compagine';
import { statoRegistroCliente } from './registro-te';
import { bozzaMotivazioneCo6, calcolaAlertAnzianitaVisura, calcolaAlertRegistroTe, calcolaAlertRicorrenze, calcolaAlertTitolarita, type Alert, type RicorrenzaSoggetto, type SocioCompagine, type TipoSocio } from '../domain/alert-titolarita';

export interface SocioIn {
  nome: string;
  codiceFiscale?: string | null;
  tipo: TipoSocio;
  quotaNominale?: number | null;
  /** Percentuale 0..100. */
  quotaPercento: number;
  diritto?: DirittoPartecipazione;
  quoteProprie?: boolean;
  comproprieta?: boolean;
  paese?: string | null;
  domicilio?: string | null;
  pec?: string | null;
  versato?: number | null;
}

export interface CaricaIn {
  nome: string;
  codiceFiscale?: string | null;
  carica: CodiceCarica;
  caricaTesto?: string | null;
  rappresentanzaLegale?: boolean;
  dataNomina?: string | null;
  durata?: string | null;
  natoA?: string | null;
  dataNascita?: string | null;
  domicilio?: string | null;
  pec?: string | null;
  poteri?: string | null;
  paese?: string | null;
}

export interface SocioLetto extends SocioIn {
  id: string;
  socioClienteId: string | null;
  fonte: string;
  fonteData: string;
  validoDal: string;
  cfHash: string | null;
}

export interface CaricaLetta extends CaricaIn {
  id: string;
  fonte: string;
  fonteData: string;
  validoDal: string;
  cfHash: string | null;
}

const oggi = () => new Date().toISOString().slice(0, 10);
const normCf = (cf?: string | null) => (cf ? cf.replace(/\s+/g, '').toUpperCase() : null);
const isPf = (cf: string | null) => Boolean(cf && /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(cf));

async function cifraJson(env: Env, tenantId: string, v: unknown): Promise<string> {
  return JSON.stringify(await cifra(env.MASTER_KEY, tenantId, JSON.stringify(v)));
}

async function decifraJson<T>(env: Env, tenantId: string, v: string | null): Promise<T | null> {
  if (!v) return null;
  try {
    const j = JSON.parse(v);
    if (j && typeof j === 'object' && 'contenuto' in j) return JSON.parse(await decifra(env.MASTER_KEY, tenantId, j)) as T;
    return j as T;
  } catch {
    return null;
  }
}

/** Nome: cifrato se persona fisica, in chiaro se persona giuridica (pubblico, serve agli elenchi). */
async function scriviNome(env: Env, tenantId: string, nome: string, personaFisica: boolean): Promise<string> {
  return personaFisica ? await cifraJson(env, tenantId, nome) : JSON.stringify(nome);
}

async function leggiNome(env: Env, tenantId: string, v: string): Promise<string> {
  const j = await decifraJson<string>(env, tenantId, v);
  return typeof j === 'string' ? j : '(non decifrabile)';
}

/** Il socio è già cliente dello studio? Si cerca per CF o P.IVA in chiaro sull'anagrafica. */
export async function trovaClientePerCf(env: Env, tenantId: string, cf: string | null, escludi: string): Promise<{ id: string; denominazione: string } | null> {
  if (!cf) return null;
  const r = await env.DB.prepare(
    'SELECT id, denominazione FROM clienti WHERE tenant_id = ? AND id != ? AND (codice_fiscale = ? OR partita_iva = ?) ORDER BY attivo DESC LIMIT 1',
  ).bind(tenantId, escludi, cf, cf).first<any>();
  return r ? { id: String(r.id), denominazione: String(r.denominazione) } : null;
}

export interface EsitoDiff {
  aperte: number;
  chiuse: number;
  invariate: number;
}

/**
 * Salva soci e cariche come SERIE TEMPORALE: le righe uguali restano, quelle
 * scomparse si chiudono (valido_al = oggi), quelle nuove si aprono. Al
 * rinnovo della visura il diff per il controllo costante viene gratis.
 */
export async function salvaCompagine(
  env: Env,
  tenantId: string,
  clienteId: string,
  utenteId: string,
  dati: { soci: SocioIn[]; cariche: CaricaIn[]; fonte: 'VISURA' | 'DICHIARAZIONE' | 'REGISTRO_TE' | 'MANUALE'; fonteData: string | null; fonteDocumentoId?: string | null },
): Promise<{ partecipazioni: EsitoDiff; cariche: EsitoDiff; dettaglio: DiffCompagine }> {
  const data = oggi();
  const fonteData = dati.fonteData ?? data;
  const attuali = await leggiCompagine(env, tenantId, clienteId);

  const chiaveSocio = (s: { cfHash?: string | null; nome: string; diritto?: DirittoPartecipazione | null; quotaPercento: number; quoteProprie?: boolean }) =>
    `${s.cfHash ?? s.nome.toUpperCase()}|${s.diritto ?? 'PROPRIETA'}|${Math.round(s.quotaPercento * 100)}|${s.quoteProprie ? 1 : 0}`;
  const chiaveCarica = (c: { cfHash?: string | null; nome: string; carica: CodiceCarica; rappresentanzaLegale?: boolean }) =>
    `${c.cfHash ?? c.nome.toUpperCase()}|${c.carica}|${c.rappresentanzaLegale ? 1 : 0}`;

  const stmts: D1PreparedStatement[] = [];
  const esitoP: EsitoDiff = { aperte: 0, chiuse: 0, invariate: 0 };
  const esitoC: EsitoDiff = { aperte: 0, chiuse: 0, invariate: 0 };

  // Partecipazioni.
  const nuoviSoci = await Promise.all(dati.soci.map(async (s) => {
    const cf = normCf(s.codiceFiscale);
    return { ...s, cf, cfHash: cf ? await hmacTenant(env.MASTER_KEY, tenantId, cf) : null };
  }));
  const chiaviNuove = new Set(nuoviSoci.map(chiaveSocio));
  const chiaviAttuali = new Map(attuali.soci.map((s) => [chiaveSocio(s), s]));
  for (const [k, s] of chiaviAttuali) {
    if (!chiaviNuove.has(k)) {
      stmts.push(env.DB.prepare('UPDATE partecipazioni SET valido_al = ? WHERE id = ? AND tenant_id = ?').bind(data, s.id, tenantId));
      esitoP.chiuse++;
    } else esitoP.invariate++;
  }
  for (const s of nuoviSoci) {
    if (chiaviAttuali.has(chiaveSocio(s))) continue;
    const pf = s.tipo === 'PERSONA_FISICA' || isPf(s.cf);
    const socioCliente = s.tipo !== 'PERSONA_FISICA' && !s.quoteProprie ? await trovaClientePerCf(env, tenantId, s.cf, clienteId) : null;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO partecipazioni (id, tenant_id, cliente_id, socio_tipo, socio_nome, socio_cf, socio_cf_hash, socio_cliente_id,
           quota_nominale, quota_percento, diritto, quote_proprie, paese, dettagli, fonte, fonte_documento_id, fonte_data, valido_dal, creato_da)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        nuovoId('par'), tenantId, clienteId, s.tipo, await scriviNome(env, tenantId, s.nome, pf),
        s.cf ? await cifraJson(env, tenantId, s.cf) : null, s.cfHash, socioCliente?.id ?? null,
        s.quotaNominale ?? null, Math.round(s.quotaPercento * 100) / 100, s.diritto ?? 'PROPRIETA', s.quoteProprie ? 1 : 0,
        s.paese ?? (s.cf ? 'IT' : null),
        await cifraJson(env, tenantId, { domicilio: s.domicilio ?? null, pec: s.pec ?? null, versato: s.versato ?? null, comproprieta: Boolean(s.comproprieta) }),
        dati.fonte, dati.fonteDocumentoId ?? null, fonteData, data, utenteId,
      ),
    );
    esitoP.aperte++;
  }

  // Cariche.
  const nuoveCariche = await Promise.all(dati.cariche.map(async (c) => {
    const cf = normCf(c.codiceFiscale);
    return { ...c, cf, cfHash: cf ? await hmacTenant(env.MASTER_KEY, tenantId, cf) : null };
  }));
  const chiaviCNuove = new Set(nuoveCariche.map(chiaveCarica));
  const chiaviCAttuali = new Map(attuali.cariche.map((c) => [chiaveCarica(c), c]));
  for (const [k, c] of chiaviCAttuali) {
    if (!chiaviCNuove.has(k)) {
      stmts.push(env.DB.prepare('UPDATE cariche SET valido_al = ? WHERE id = ? AND tenant_id = ?').bind(data, c.id, tenantId));
      esitoC.chiuse++;
    } else esitoC.invariate++;
  }
  for (const c of nuoveCariche) {
    if (chiaviCAttuali.has(chiaveCarica(c))) continue;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO cariche (id, tenant_id, cliente_id, nome, cf, cf_hash, carica, carica_testo, rappresentanza_legale, poteri,
           fonte, fonte_documento_id, fonte_data, valido_dal, creato_da)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        nuovoId('car'), tenantId, clienteId, await cifraJson(env, tenantId, c.nome), c.cf ? await cifraJson(env, tenantId, c.cf) : null, c.cfHash,
        c.carica, c.caricaTesto ?? null, c.rappresentanzaLegale ? 1 : 0,
        await cifraJson(env, tenantId, {
          poteri: c.poteri ?? null, dataNomina: c.dataNomina ?? null, durata: c.durata ?? null, natoA: c.natoA ?? null,
          dataNascita: c.dataNascita ?? null, domicilio: c.domicilio ?? null, pec: c.pec ?? null, paese: c.paese ?? null,
        }),
        dati.fonte, dati.fonteDocumentoId ?? null, fonteData, data, utenteId,
      ),
    );
    esitoC.aperte++;
  }

  if (stmts.length) {
    const LOTTO = 40;
    for (let i = 0; i < stmts.length; i += LOTTO) await env.DB.batch(stmts.slice(i, i + LOTTO));
  }
  // AR-M20-02: il diff letto in termini di struttura (chi entra, chi esce,
  // quote e cariche variate), per il controllo costante.
  const dettaglio = diffCompagine(
    {
      soci: attuali.soci.map((x) => ({ nome: x.nome, chiave: x.cfHash ?? x.codiceFiscale ?? null, tipo: x.tipo, quotaPercento: x.quotaPercento, diritto: x.diritto ?? null, quoteProprie: x.quoteProprie })),
      cariche: attuali.cariche.map((x) => ({ nome: x.nome, chiave: x.cfHash ?? x.codiceFiscale ?? null, carica: x.carica, rappresentanzaLegale: x.rappresentanzaLegale })),
    },
    {
      soci: nuoviSoci.map((x) => ({ nome: x.nome, chiave: x.cfHash ?? x.cf ?? null, tipo: x.tipo, quotaPercento: x.quotaPercento, diritto: x.diritto ?? null, quoteProprie: x.quoteProprie })),
      cariche: nuoveCariche.map((x) => ({ nome: x.nome, chiave: x.cfHash ?? x.cf ?? null, carica: x.carica, rappresentanzaLegale: x.rappresentanzaLegale })),
    },
  );
  return { partecipazioni: esitoP, cariche: esitoC, dettaglio };
}

/**
 * AR-M20-02: al rinnovo della visura con struttura cambiata, il programma
 * PROPONE il controllo costante «da rivalutare» su ogni fascicolo vivo
 * valutato del cliente. Una proposta per fascicolo; se ce n'è già una
 * aperta, non se ne accoda un'altra. Restituisce le proposte create.
 */
export async function proponiRivalutazioni(
  env: Env,
  tenantId: string,
  clienteId: string,
  utenteId: string,
  diff: DiffCompagine,
  dataVisura: string | null,
): Promise<Array<{ propostaId: string; fascicoloId: string; codice: string }>> {
  if (!diff.strutturaCambiata) return [];
  const { results } = await env.DB.prepare(
    `SELECT f.id, f.codice, v.classe
     FROM fascicoli f
     JOIN valutazioni_rischio v ON v.id = (SELECT id FROM valutazioni_rischio WHERE fascicolo_id = f.id ORDER BY versione DESC LIMIT 1)
     WHERE f.tenant_id = ? AND f.cliente_id = ? AND f.stato != 'CESSATO' AND f.data_cessazione IS NULL AND v.esente_verifica = 0
       AND NOT EXISTS (SELECT 1 FROM proposte p WHERE p.tenant_id = f.tenant_id AND p.cliente_id = f.cliente_id AND p.ambito = 'RIVALUTAZIONE' AND p.stato = 'PROPOSTA'
                       AND p.alert LIKE '%' || f.id || '%')`,
  ).bind(tenantId, clienteId).all<any>();
  const out: Array<{ propostaId: string; fascicoloId: string; codice: string }> = [];
  for (const f of results ?? []) {
    const contenuto = {
      tipo: 'RIVALUTAZIONE', fascicoloId: f.id, codice: f.codice, classe: f.classe, dataVisura,
      righe: diff.righe, riepilogo: riepilogoDiff(diff, dataVisura),
      esitoProposto: 'DA_RIVALUTARE', verificheProposte: ['COMPAGINE', 'TITOLARI', 'ANAGRAFICA'],
      norma: 'art. 19 co. 1 lett. d) DLgs. 231/2007; Regole tecniche CNDCEC 2025 (aggiornamento della valutazione al mutare degli elementi)',
    };
    const id = await registraProposta(env, tenantId, clienteId, utenteId, 'RIVALUTAZIONE', 'VISURA', contenuto, [], 'PROPOSTA', { fascicoloId: f.id });
    out.push({ propostaId: id, fascicoloId: f.id, codice: f.codice });
  }
  return out;
}

/** Soci e cariche vigenti, in chiaro per lo studio. */
export async function leggiCompagine(env: Env, tenantId: string, clienteId: string): Promise<{ soci: SocioLetto[]; cariche: CaricaLetta[] }> {
  const soci = (
    await env.DB.prepare('SELECT * FROM partecipazioni WHERE tenant_id = ? AND cliente_id = ? AND valido_al IS NULL ORDER BY quota_percento DESC, creato_il')
      .bind(tenantId, clienteId).all<any>()
  ).results ?? [];
  const cariche = (
    await env.DB.prepare('SELECT * FROM cariche WHERE tenant_id = ? AND cliente_id = ? AND valido_al IS NULL ORDER BY rappresentanza_legale DESC, creato_il')
      .bind(tenantId, clienteId).all<any>()
  ).results ?? [];
  const sociLetti: SocioLetto[] = [];
  for (const r of soci) {
    const dettagli = (await decifraJson<any>(env, tenantId, r.dettagli)) ?? {};
    sociLetti.push({
      id: r.id, nome: await leggiNome(env, tenantId, r.socio_nome), codiceFiscale: await decifraJson<string>(env, tenantId, r.socio_cf),
      tipo: r.socio_tipo, quotaNominale: r.quota_nominale, quotaPercento: r.quota_percento, diritto: r.diritto,
      quoteProprie: r.quote_proprie === 1, comproprieta: Boolean(dettagli.comproprieta), paese: r.paese,
      domicilio: dettagli.domicilio ?? null, pec: dettagli.pec ?? null, versato: dettagli.versato ?? null,
      socioClienteId: r.socio_cliente_id, fonte: r.fonte, fonteData: r.fonte_data, validoDal: r.valido_dal, cfHash: r.socio_cf_hash,
    });
  }
  const caricheLette: CaricaLetta[] = [];
  for (const r of cariche) {
    const d = (await decifraJson<any>(env, tenantId, r.poteri)) ?? {};
    caricheLette.push({
      id: r.id, nome: await leggiNome(env, tenantId, r.nome), codiceFiscale: await decifraJson<string>(env, tenantId, r.cf),
      carica: r.carica, caricaTesto: r.carica_testo, rappresentanzaLegale: r.rappresentanza_legale === 1,
      poteri: d.poteri ?? null, dataNomina: d.dataNomina ?? null, durata: d.durata ?? null, natoA: d.natoA ?? null,
      dataNascita: d.dataNascita ?? null, domicilio: d.domicilio ?? null, pec: d.pec ?? null, paese: d.paese ?? null,
      fonte: r.fonte, fonteData: r.fonte_data, validoDal: r.valido_dal, cfHash: r.cf_hash,
    });
  }
  return { soci: sociLetti, cariche: caricheLette };
}

/**
 * Cadenza del controllo costante (mesi) del fascicolo vivo più esigente del
 * cliente, dall'ultima valutazione non esente. Null se nessun fascicolo vivo
 * è valutato: senza cadenza l'anzianità della visura non ha metro (A12).
 */
export async function cadenzaControlloCostante(env: Env, tenantId: string, clienteId: string): Promise<number | null> {
  const r = await env.DB.prepare(
    `SELECT MIN(v.controllo_costante_mesi) AS mesi
     FROM fascicoli f
     JOIN valutazioni_rischio v ON v.id = (SELECT id FROM valutazioni_rischio WHERE fascicolo_id = f.id ORDER BY versione DESC LIMIT 1)
     WHERE f.tenant_id = ? AND f.cliente_id = ? AND f.stato != 'CESSATO' AND f.data_cessazione IS NULL
       AND v.esente_verifica = 0 AND v.controllo_costante_mesi > 0`,
  ).bind(tenantId, clienteId).first<any>();
  return r?.mesi ? Number(r.mesi) : null;
}

/** Data dell'ultima visura conservata fra i documenti del cliente. */
async function dataUltimaVisura(env: Env, tenantId: string, clienteId: string): Promise<string | null> {
  const r = await env.DB.prepare(
    "SELECT data_riferimento FROM documenti WHERE tenant_id = ? AND cliente_id = ? AND tipo = 'VISURA' ORDER BY data_riferimento DESC LIMIT 1",
  ).bind(tenantId, clienteId).first<any>();
  return r?.data_riferimento ?? null;
}

export interface PropostaTitolarita {
  analisi: RisultatoAnalisiTitolarita;
  alert: Alert[];
  bozzaMotivazione: string | null;
  soci: SocioLetto[];
  cariche: CaricaLetta[];
  /** Clienti dello studio la cui compagine è stata innestata nel grafo. */
  catena: Array<{ clienteId: string; denominazione: string; visuraDel: string | null }>;
}

/**
 * Costruisce il grafo dal cliente e dai soci; se un socio persona giuridica
 * è cliente dello studio, la sua compagine (già in archivio) si innesta nel
 * grafo — fino a 4 livelli — e la catena si chiude da sola.
 */
export async function propostaTitolarita(
  env: Env,
  tenantId: string,
  cliente: { id: string; denominazione: string; tipo: string; codice_fiscale?: string | null },
  opzioni: {
    capitale?: { sottoscritto?: number | null; versato?: number | null } | null; dataVisura?: string | null; dataElencoSoci?: string | null;
    /** AR-M19: compagine non ancora persistita (coda di revisione): si usa al posto dell'archivio. */
    compagine?: { soci: SocioLetto[]; cariche: CaricaLetta[] } | null;
  } = {},
): Promise<PropostaTitolarita> {
  const data = oggi();
  const nodi = new Map<string, NodoPartecipazione>();
  const catena: PropostaTitolarita['catena'] = [];
  const radice = opzioni.compagine ?? (await leggiCompagine(env, tenantId, cliente.id));

  const idSocio = (s: SocioLetto) => s.cfHash ?? `${s.nome.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;

  const innesta = async (clienteId: string, nodoId: string, denominazione: string, compagine: { soci: SocioLetto[] }, livello: number): Promise<void> => {
    const nodo: NodoPartecipazione = nodi.get(nodoId) ?? { id: nodoId, denominazione, tipo: 'PERSONA_GIURIDICA', partecipazioni: [] };
    nodo.partecipazioni = [];
    nodi.set(nodoId, nodo);
    for (const s of compagine.soci) {
      const sid = s.quoteProprie ? nodoId : idSocio(s);
      nodo.partecipazioni.push({ id: sid, quota: s.quotaPercento / 100, diritto: s.diritto ?? 'PROPRIETA' });
      if (s.quoteProprie) continue;
      if (!nodi.has(sid)) {
        nodi.set(sid, {
          id: sid, denominazione: s.nome, tipo: s.tipo === 'PERSONA_FISICA' ? 'PERSONA_FISICA' : 'PERSONA_GIURIDICA',
          fiduciaria: s.tipo === 'FIDUCIARIA', trust: s.tipo === 'TRUST', paese: s.paese ?? undefined,
        });
      }
      if (s.tipo === 'PERSONA_GIURIDICA' && s.socioClienteId && livello < 4 && !catena.some((c) => c.clienteId === s.socioClienteId)) {
        const sub = await leggiCompagine(env, tenantId, s.socioClienteId);
        catena.push({ clienteId: s.socioClienteId, denominazione: s.nome, visuraDel: await dataUltimaVisura(env, tenantId, s.socioClienteId) });
        if (sub.soci.length) await innesta(s.socioClienteId, sid, s.nome, sub, livello + 1);
      }
    }
  };
  await innesta(cliente.id, cliente.id, cliente.denominazione, radice, 0);
  if (cliente.tipo === 'PERSONA_FISICA') nodi.get(cliente.id)!.tipo = 'PERSONA_FISICA';

  const cariche: Carica[] = radice.cariche.map((c) => ({
    id: c.cfHash ?? c.nome.toUpperCase().replace(/[^A-Z0-9]+/g, '_'), nome: c.nome, carica: c.carica, rappresentanzaLegale: c.rappresentanzaLegale,
  }));
  const analisi = analizzaTitolaritaEffettiva(cliente.id, [...nodi.values()], { cariche, data });

  // Screening: esiti aperti sui soci e sulle cariche di questo cliente.
  const idsSoggetti = [...radice.soci.map((s) => s.id), ...radice.cariche.map((c) => c.id)];
  const screening: Array<{ nominativo: string; fonte: string; punteggio: number; stato: 'DA_ESAMINARE' | 'ESCLUSO' | 'CONFERMATO' }> = [];
  if (idsSoggetti.length) {
    const segnaposto = idsSoggetti.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT nominativo, fonte, punteggio, stato FROM screening_esiti WHERE tenant_id = ? AND soggetto_tipo IN ('SOCIO','CARICA') AND soggetto_id IN (${segnaposto})`,
    ).bind(tenantId, ...idsSoggetti).all<any>();
    for (const r of results ?? []) screening.push({ nominativo: r.nominativo, fonte: r.fonte, punteggio: r.punteggio, stato: r.stato });
  }

  const sociAlert: SocioCompagine[] = await Promise.all(radice.soci.map(async (s) => ({
    id: idSocio(s), nome: s.nome, tipo: s.tipo, quota: s.quotaPercento / 100, diritto: s.diritto ?? 'PROPRIETA', paese: s.paese ?? undefined,
    quoteProprie: s.quoteProprie, comproprieta: s.comproprieta,
    clienteStudio: s.socioClienteId ? { id: s.socioClienteId, denominazione: s.nome, visuraDel: catena.find((c) => c.clienteId === s.socioClienteId)?.visuraDel ?? null } : null,
  })));
  const dataVisura = opzioni.dataVisura ?? (await dataUltimaVisura(env, tenantId, cliente.id));
  const input = {
    denominazione: cliente.denominazione, tipoCliente: cliente.tipo, analisi, soci: sociAlert, cariche,
    capitale: opzioni.capitale ?? null, screening, paeseAltoRischio: (p: string) => paeseAltoRischio(p, data).altoRischio,
    dataVisura, dataElencoSoci: opzioni.dataElencoSoci ?? null,
  };
  const alert = calcolaAlertTitolarita(input);
  // AR-M20-01, A12: la visura conservata è più vecchia della cadenza del
  // controllo costante del fascicolo vivo più esigente. Si valuta sulla
  // visura in archivio (non su quella che si sta caricando ora, che per
  // definizione è nuova): se `opzioni.dataVisura` è di oggi, l'alert tace.
  if (cliente.tipo !== 'PERSONA_FISICA') {
    try {
      const a12 = calcolaAlertAnzianitaVisura(dataVisura, await cadenzaControlloCostante(env, tenantId, cliente.id), data);
      if (a12.alert) alert.push(a12.alert);
    } catch (e) {
      console.error('anzianità della visura non calcolata:', e);
    }
  }
  // AR-M20-03, A13: incongruenze col registro dei titolari effettivi non ancora segnalate.
  if (!opzioni.compagine) {
    try {
      const reg = await statoRegistroCliente(env, tenantId, cliente.id);
      alert.push(...calcolaAlertRegistroTe(reg.daSegnalare.map((k) => ({ id: k.id, data: k.data, esito: k.esito, segnalata: false }))));
    } catch (e) {
      console.error('stato del registro TE non letto:', e);
    }
  }
  // AR-M19, A11: la stessa persona in molti clienti dello studio (via cf_hash, senza decifrare).
  try {
    const soggetti = [
      ...radice.soci.filter((s) => !s.quoteProprie && s.cfHash && s.tipo === 'PERSONA_FISICA').map((s) => ({ cfHash: s.cfHash!, nome: s.nome })),
      ...radice.cariche.filter((c) => c.cfHash).map((c) => ({ cfHash: c.cfHash!, nome: c.nome })),
    ];
    alert.push(...calcolaAlertRicorrenze(await ricorrenzePortafoglio(env, tenantId, cliente.id, soggetti), data));
    const ordine = { alta: 0, media: 1, bassa: 2 } as const;
    alert.sort((a, b) => ordine[a.gravita] - ordine[b.gravita] || a.codice.localeCompare(b.codice, undefined, { numeric: true }));
  } catch (e) {
    console.error('ricorrenze di portafoglio non calcolate:', e);
  }
  const a3 = alert.find((a) => a.codice === 'A3');
  const bozza = a3 && a3.azione.tipo === 'CONFERMA_RESIDUALE' ? a3.azione.bozzaMotivazione : analisi.richiedeMotivazioneResiduale && radice.soci.length ? bozzaMotivazioneCo6(input, []) : null;
  return { analisi, alert, bozzaMotivazione: bozza, soci: radice.soci, cariche: radice.cariche, catena };
}

/** Registra la proposta (cifrata) e restituisce l'id. I codici alert restano in chiaro: nessun dato personale. */
export async function registraProposta(
  env: Env,
  tenantId: string,
  clienteId: string | null,
  utenteId: string,
  ambito: 'ANAGRAFICA' | 'TITOLARITA' | 'ESECUTORE' | 'RISCHIO_A' | 'DOCUMENTI' | 'SCREENING' | 'RIVALUTAZIONE',
  origine: 'VISURA' | 'REGISTRI' | 'DICHIARAZIONE' | 'PORTAFOGLIO',
  contenuto: unknown,
  alert: Alert[],
  stato: 'PROPOSTA' | 'APPLICATA' = 'PROPOSTA',
  /** Riferimenti in chiaro (nessun dato personale) da tenere accanto ai codici alert: es. il fascicolo di una RIVALUTAZIONE. */
  riferimenti: Record<string, string> = {},
): Promise<string> {
  const id = nuovoId('prp');
  // Una proposta di titolarità ancora aperta viene sostituita: la nuova visura è più recente.
  if (ambito === 'TITOLARITA' && clienteId) {
    await env.DB.prepare("UPDATE proposte SET stato = 'SCARTATA', rivista_il = datetime('now') WHERE tenant_id = ? AND cliente_id = ? AND ambito = 'TITOLARITA' AND stato = 'PROPOSTA'")
      .bind(tenantId, clienteId).run();
  }
  await env.DB.prepare(
    `INSERT INTO proposte (id, tenant_id, cliente_id, ambito, origine, contenuto, alert, stato, creato_da, rivista_da, rivista_il)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    id, tenantId, clienteId, ambito, origine, await cifraJson(env, tenantId, contenuto),
    JSON.stringify([...alert.map((a) => ({ codice: a.codice, gravita: a.gravita })), ...(Object.keys(riferimenti).length ? [{ codice: 'RIF', ...riferimenti }] : [])]), stato, utenteId,
    stato === 'APPLICATA' ? utenteId : null, stato === 'APPLICATA' ? new Date().toISOString() : null,
  ).run();
  return id;
}

export async function leggiProposte(env: Env, tenantId: string, clienteId: string) {
  const { results } = await env.DB.prepare(
    `SELECT p.*, u.nome AS rivista_da_nome FROM proposte p LEFT JOIN utenti u ON u.id = p.rivista_da
     WHERE p.tenant_id = ? AND p.cliente_id = ? ORDER BY p.creato_il DESC LIMIT 50`,
  ).bind(tenantId, clienteId).all<any>();
  const out = [];
  for (const r of results ?? []) {
    out.push({
      id: r.id, ambito: r.ambito, origine: r.origine, stato: r.stato, alert: JSON.parse(r.alert ?? '[]'),
      contenuto: await decifraJson<any>(env, tenantId, r.contenuto), esito: await decifraJson<any>(env, tenantId, r.esito),
      rivistaDa: r.rivista_da_nome ?? null, rivistaIl: r.rivista_il, creatoIl: r.creato_il,
    });
  }
  return out;
}

/**
 * Screening immediato dei nomi appena estratti (soci persone fisiche e
 * titolari di cariche). Se le liste non sono disponibili si rinvia alla
 * corsa notturna, senza bloccare il flusso.
 */
export async function screeningCompagine(env: Env, tenantId: string, clienteId: string): Promise<{ eseguito: boolean; nuove: number }> {
  const liste = await caricaListe(env);
  if (!liste || !liste.voci.length) return { eseguito: false, nuove: 0 };
  const { soci, cariche } = await leggiCompagine(env, tenantId, clienteId);
  const soggetti: SoggettoScreening[] = [
    ...soci.filter((s) => !s.quoteProprie).map((s) => ({ tipo: 'SOCIO' as const, id: s.id, nominativo: s.nome })),
    ...cariche.map((c) => ({ tipo: 'CARICA' as const, id: c.id, nominativo: c.nome })),
  ];
  if (!soggetti.length) return { eseguito: true, nuove: 0 };
  const { nuove } = await screeningSoggetti(env, tenantId, soggetti, liste);
  if (nuove > 0) {
    await scriviAudit(env.DB, {
      tenantId, utenteId: null, azione: 'SCREENING_CORRISPONDENZE', entita: 'clienti', entitaId: clienteId,
      dettaglio: { nuoveCorrispondenze: nuove, origine: 'VISURA' },
    });
  }
  return { eseguito: true, nuove };
}

/**
 * AR-M19, A11 — Per ciascun soggetto (cf_hash) gli ALTRI clienti dello studio
 * in cui compare come socio o titolare di carica, con la data di costituzione
 * (nei dettagli cifrati del cliente) per riconoscere le neo-costituite.
 * Si confrontano solo gli HMAC: nessun CF viene decifrato.
 */
export async function ricorrenzePortafoglio(
  env: Env,
  tenantId: string,
  clienteId: string,
  soggetti: Array<{ cfHash: string; nome: string }>,
): Promise<RicorrenzaSoggetto[]> {
  const unici = new Map<string, string>();
  for (const s of soggetti) if (s.cfHash && !unici.has(s.cfHash)) unici.set(s.cfHash, s.nome);
  if (!unici.size) return [];
  const hashes = [...unici.keys()];
  const segnaposto = hashes.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT x.cf_hash, x.cliente_id, x.ruolo, c.denominazione, c.dati_identificativi FROM (
       SELECT socio_cf_hash AS cf_hash, cliente_id, 'socio' AS ruolo FROM partecipazioni
        WHERE tenant_id = ? AND valido_al IS NULL AND quote_proprie = 0 AND socio_cf_hash IN (${segnaposto})
       UNION ALL
       SELECT cf_hash, cliente_id, 'amministratore' AS ruolo FROM cariche
        WHERE tenant_id = ? AND valido_al IS NULL AND cf_hash IN (${segnaposto})
     ) x JOIN clienti c ON c.id = x.cliente_id
     WHERE c.tenant_id = ? AND c.attivo = 1 AND x.cliente_id != ?`,
  ).bind(tenantId, ...hashes, tenantId, ...hashes, tenantId, clienteId).all<any>();

  const costituzioni = new Map<string, string | null>();
  const dataCostituzione = async (r: any): Promise<string | null> => {
    if (costituzioni.has(r.cliente_id)) return costituzioni.get(r.cliente_id)!;
    let d: string | null = null;
    try {
      const raw = r.dati_identificativi ? JSON.parse(r.dati_identificativi) : null;
      const det = raw && typeof raw === 'object' && 'contenuto' in raw ? JSON.parse(await decifra(env.MASTER_KEY, tenantId, raw)) : raw;
      d = typeof det?.dataCostituzione === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(det.dataCostituzione) ? det.dataCostituzione : null;
    } catch { d = null; }
    costituzioni.set(r.cliente_id, d);
    return d;
  };

  const perSoggetto = new Map<string, Map<string, { id: string; denominazione: string; ruoli: Set<string>; dataCostituzione: string | null }>>();
  for (const r of results ?? []) {
    const m = perSoggetto.get(r.cf_hash) ?? new Map();
    perSoggetto.set(r.cf_hash, m);
    const voce = m.get(r.cliente_id) ?? { id: r.cliente_id, denominazione: r.denominazione, ruoli: new Set<string>(), dataCostituzione: await dataCostituzione(r) };
    voce.ruoli.add(r.ruolo);
    m.set(r.cliente_id, voce);
  }
  const out: RicorrenzaSoggetto[] = [];
  for (const [cfHash, clienti] of perSoggetto) {
    out.push({
      id: cfHash, nome: unici.get(cfHash) ?? '(soggetto)',
      clienti: [...clienti.values()].map((c) => ({
        id: c.id, denominazione: c.denominazione, dataCostituzione: c.dataCostituzione,
        ruolo: c.ruoli.size > 1 ? 'socio e amministratore' : c.ruoli.has('socio') ? 'socio' : 'amministratore',
      })),
    });
  }
  return out;
}

/**
 * AR-M19 — Compagine «in memoria» per la coda di revisione: soci e cariche
 * appena letti da una visura, non ancora persistiti, nella stessa forma di
 * `leggiCompagine` (cf_hash calcolato, socio già cliente risolto) così che
 * `propostaTitolarita` possa ragionarci sopra senza scrivere nulla.
 */
export async function compagineInMemoria(
  env: Env,
  tenantId: string,
  clienteId: string | null,
  dati: { soci: SocioIn[]; cariche: CaricaIn[]; fonteData: string | null },
): Promise<{ soci: SocioLetto[]; cariche: CaricaLetta[] }> {
  const data = oggi();
  const fonteData = dati.fonteData ?? data;
  const soci: SocioLetto[] = [];
  for (const [i, s] of dati.soci.entries()) {
    const cf = normCf(s.codiceFiscale);
    const cfHash = cf ? await hmacTenant(env.MASTER_KEY, tenantId, cf) : null;
    const socioCliente = s.tipo !== 'PERSONA_FISICA' && !s.quoteProprie ? await trovaClientePerCf(env, tenantId, cf, clienteId ?? '') : null;
    soci.push({ ...s, id: `mem-soc-${i}`, codiceFiscale: cf, paese: s.paese ?? (cf ? 'IT' : null), socioClienteId: socioCliente?.id ?? null, fonte: 'VISURA', fonteData, validoDal: data, cfHash });
  }
  const cariche: CaricaLetta[] = [];
  for (const [i, c] of dati.cariche.entries()) {
    const cf = normCf(c.codiceFiscale);
    cariche.push({ ...c, id: `mem-car-${i}`, codiceFiscale: cf, fonte: 'VISURA', fonteData, validoDal: data, cfHash: cf ? await hmacTenant(env.MASTER_KEY, tenantId, cf) : null });
  }
  return { soci, cariche };
}
