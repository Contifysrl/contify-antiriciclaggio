/**
 * CODA DI REVISIONE (AR-M19)
 *
 * La spec M17 dice «una visura alla volta, con revisione; mai un import cieco
 * di massa». Il bisogno degli studi in ritardo è però di volume. La tensione
 * si scioglie distinguendo INGESTIONE da CONFERMA: si possono caricare
 * cinquanta visure in un colpo; ognuna produce una riga in `proposte`
 * (ambito ANAGRAFICA, origine VISURA), abbinata al cliente esistente per
 * CF/P.IVA o marcata «nuovo cliente»; NESSUNA produce effetti finché non è
 * rivista. La revisione è una alla volta ma progettata per la velocità, e
 * «Applica tutto» è ammesso solo per le proposte senza alert di gravità alta.
 *
 * Il contenuto della proposta (anagrafica, soci, cariche, titolari proposti)
 * è cifrato con la chiave del tenant; in chiaro restano i codici alert. Il
 * PDF della visura sta in area di transito su R2 e diventa documento del
 * cliente solo quando la proposta viene applicata.
 */

import type { Env, Utente } from './tipi';
import { cifra, decifra, nuovoId, sha256Hex } from './crypto';
import { scriviAudit } from './audit';
import { compagineInMemoria, propostaTitolarita, registraProposta } from './compagine';
import { aggiornaClienteDaVisura, anagraficaDaCorpo, clienteDoppione, compagineDaCorpo, creaClienteDaVisura, type Errore } from './da-visura';
import { registraTitolari, titolariDaProposta } from './titolarita';
import type { Alert } from '../domain/alert-titolarita';

const oggi = () => new Date().toISOString().slice(0, 10);
const dataIso = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

async function cifraJson(env: Env, tenantId: string, v: unknown): Promise<string> {
  return JSON.stringify(await cifra(env.MASTER_KEY, tenantId, JSON.stringify(v)));
}
async function decifraJson<T>(env: Env, tenantId: string, v: string | null): Promise<T | null> {
  if (!v) return null;
  try {
    const j = JSON.parse(v);
    if (j && typeof j === 'object' && 'contenuto' in j) return JSON.parse(await decifra(env.MASTER_KEY, tenantId, j)) as T;
    return j as T;
  } catch { return null; }
}

/** Etichette dei campi confrontati (le stesse del modal «Aggiorna da visura»). */
const ETICHETTE: Record<string, string> = {
  tipo: 'Natura giuridica', denominazione: 'Denominazione', codiceFiscale: 'Codice fiscale', partitaIva: 'Partita IVA',
  attivitaPrevalente: 'Attività prevalente', ateco: 'Codice ATECO', 'di.sede': 'Sede', 'di.provincia': 'Provincia', 'di.pec': 'PEC',
  'di.rea': 'REA', 'di.formaGiuridica': 'Forma giuridica', 'di.capitaleSociale': 'Capitale sociale', 'di.capitaleVersato': 'Capitale versato',
  'di.dataCostituzione': 'Data di costituzione', 'di.statoAttivita': 'Stato attività', 'di.oggettoSociale': 'Oggetto sociale',
  'di.inLiquidazione': 'In liquidazione', 'di.proceduraConcorsuale': 'Procedura concorsuale', 'di.visuraDel': 'Visura del', 'di.visuraNumero': 'Numero visura',
};

export interface Differenza { chiave: string; etichetta: string; attuale: unknown; nuovo: unknown }

export interface ContenutoCoda {
  tipo: 'CODA_VISURA';
  nomeFile: string | null;
  anagrafica: ReturnType<typeof anagraficaDaCorpo>;
  soci: any[];
  cariche: any[];
  capitale: any;
  dataVisura: string | null;
  dataElencoSoci: string | null;
  telemetria: any;
  abbinamento: 'NUOVO' | 'ESISTENTE';
  clienteId: string | null;
  denominazioneAttuale: string | null;
  clienteAttivo: boolean | null;
  differenze: Differenza[] | null;
  titolarita: { titolari: any[]; criterio: string; bozzaMotivazione: string | null; avvertenze: string[]; quotePersoneFisiche: any[] } | null;
  alertDettaglio: Alert[];
  catena: Array<{ clienteId: string; denominazione: string; visuraDel: string | null }>;
  pdf: { r2Key: string; nome: string; mime: string; dimensione: number; sha256: string } | null;
}

export interface EsitoAccodamento {
  indice: number;
  id: string | null;
  abbinamento: 'NUOVO' | 'ESISTENTE' | 'GIA_IN_CODA' | 'SCARTATA';
  clienteId: string | null;
  denominazione: string;
  alert: Array<{ codice: string; gravita: string }>;
  errore?: string;
}

const chiaveVoce = (cf: string | null, piva: string | null, denominazione: string) =>
  cf ? `CF:${cf}` : piva ? `PI:${piva}` : `DN:${denominazione.toUpperCase().replace(/\s+/g, ' ').trim()}`;

/** Chiavi (CF/P.IVA) delle visure già in coda, per non accodare due volte la stessa società. */
async function chiaviInCoda(env: Env, tenantId: string): Promise<Set<string>> {
  const { results } = await env.DB.prepare("SELECT contenuto FROM proposte WHERE tenant_id = ? AND ambito = 'ANAGRAFICA' AND stato = 'PROPOSTA'").bind(tenantId).all<any>();
  const out = new Set<string>();
  for (const r of results ?? []) {
    const c = await decifraJson<ContenutoCoda>(env, tenantId, r.contenuto);
    if (c?.tipo === 'CODA_VISURA') out.add(chiaveVoce(c.anagrafica.codiceFiscale, c.anagrafica.partitaIva, c.anagrafica.denominazione));
  }
  return out;
}

async function differenzeCon(env: Env, tenantId: string, cliente: any, a: ReturnType<typeof anagraficaDaCorpo>): Promise<Differenza[]> {
  const out: Differenza[] = [];
  const confronta = (chiave: string, attuale: unknown, nuovo: unknown) => {
    const n = nuovo == null || nuovo === '' ? null : nuovo;
    const at = attuale == null || attuale === '' ? null : attuale;
    if (n == null) return; // la visura non lo sa: non si propone di cancellare nulla
    if (String(at ?? '').trim().toUpperCase() === String(n).trim().toUpperCase()) return;
    out.push({ chiave, etichetta: ETICHETTE[chiave] ?? chiave, attuale: at, nuovo: n });
  };
  confronta('tipo', cliente.tipo, a.tipo);
  confronta('denominazione', cliente.denominazione, a.denominazione);
  confronta('codiceFiscale', cliente.codice_fiscale, a.codiceFiscale);
  confronta('partitaIva', cliente.partita_iva, a.partitaIva);
  confronta('attivitaPrevalente', cliente.attivita_prevalente, a.attivitaPrevalente);
  confronta('ateco', cliente.ateco, a.ateco);
  let attuali: Record<string, unknown> = {};
  if (cliente.dati_identificativi) {
    try { attuali = JSON.parse(await decifra(env.MASTER_KEY, tenantId, JSON.parse(cliente.dati_identificativi))); } catch { attuali = {}; }
  }
  for (const [k, v] of Object.entries(a.datiIdentificativi ?? {})) confronta(`di.${k}`, attuali[k], v);
  return out;
}

/**
 * Caricamento in blocco (M19-01): per ogni visura una riga in `proposte`.
 * Non scrive né clienti né compagine: solo la proposta, cifrata.
 */
export async function accodaVisure(env: Env, tenantId: string, u: Utente, ip: string | null | undefined, voci: any[]): Promise<EsitoAccodamento[]> {
  const out: EsitoAccodamento[] = [];
  const giaInCoda = await chiaviInCoda(env, tenantId);
  for (const [indice, v] of voci.entries()) {
    const a = anagraficaDaCorpo(v?.anagrafica ?? {});
    const denominazione = a.denominazione || String(v?.nomeFile ?? `visura ${indice + 1}`);
    if (!a.denominazione || !a.tipo) {
      out.push({ indice, id: null, abbinamento: 'SCARTATA', clienteId: null, denominazione, alert: [], errore: 'Denominazione o natura giuridica non lette dalla visura: usa «Nuovo da visura» e completa a mano.' });
      continue;
    }
    const chiave = chiaveVoce(a.codiceFiscale, a.partitaIva, a.denominazione);
    if (giaInCoda.has(chiave)) {
      out.push({ indice, id: null, abbinamento: 'GIA_IN_CODA', clienteId: null, denominazione, alert: [], errore: 'Una visura di questa società è già in coda.' });
      continue;
    }
    giaInCoda.add(chiave);

    const esistente = await clienteDoppione(env.DB, tenantId, a.codiceFiscale, a.partitaIva);
    const cliente = esistente
      ? await env.DB.prepare('SELECT * FROM clienti WHERE id = ? AND tenant_id = ?').bind(esistente.id, tenantId).first<any>()
      : null;
    const { soci, cariche } = compagineDaCorpo(v);
    const dataVisura = dataIso(v?.dataVisura);
    const dataElencoSoci = dataIso(v?.dataElencoSoci);
    const compagine = await compagineInMemoria(env, tenantId, cliente?.id ?? null, { soci, cariche, fonteData: dataElencoSoci ?? dataVisura });
    const proposta = await propostaTitolarita(env, tenantId,
      { id: cliente?.id ?? `nuovo-${indice}`, denominazione: cliente?.denominazione ?? a.denominazione, tipo: cliente?.tipo ?? a.tipo, codice_fiscale: a.codiceFiscale },
      { capitale: v?.capitale ?? null, dataVisura, dataElencoSoci, compagine });

    const contenuto: ContenutoCoda = {
      tipo: 'CODA_VISURA', nomeFile: v?.nomeFile ? String(v.nomeFile).slice(0, 160) : null, anagrafica: a, soci, cariche, capitale: v?.capitale ?? null,
      dataVisura, dataElencoSoci, telemetria: v?.telemetria ?? null,
      abbinamento: cliente ? 'ESISTENTE' : 'NUOVO', clienteId: cliente?.id ?? null, denominazioneAttuale: cliente?.denominazione ?? null,
      clienteAttivo: cliente ? cliente.attivo === 1 : null,
      differenze: cliente ? await differenzeCon(env, tenantId, cliente, a) : null,
      titolarita: soci.length || cariche.length
        ? { titolari: proposta.analisi.titolari, criterio: proposta.analisi.criterioApplicato, bozzaMotivazione: proposta.bozzaMotivazione, avvertenze: proposta.analisi.avvertenze, quotePersoneFisiche: proposta.analisi.quotePersoneFisiche }
        : null,
      alertDettaglio: proposta.alert, catena: proposta.catena, pdf: null,
    };
    const id = await registraProposta(env, tenantId, cliente?.id ?? null, u.id, 'ANAGRAFICA', 'VISURA', contenuto, proposta.alert);
    out.push({ indice, id, abbinamento: contenuto.abbinamento, clienteId: cliente?.id ?? null, denominazione: a.denominazione, alert: proposta.alert.map((x) => ({ codice: x.codice, gravita: x.gravita })) });
  }
  await scriviAudit(env.DB, {
    tenantId, utenteId: u.id, azione: 'VISURE_ACCODATE', entita: 'proposte', dettaglio: {
      totale: voci.length, nuove: out.filter((x) => x.abbinamento === 'NUOVO').length, esistenti: out.filter((x) => x.abbinamento === 'ESISTENTE').length,
      scartate: out.filter((x) => x.abbinamento === 'SCARTATA' || x.abbinamento === 'GIA_IN_CODA').length,
    }, ip,
  });
  return out;
}

/** Il PDF di una visura in coda va in area di transito: diventa documento del cliente all'applicazione. */
export async function caricaPdfCoda(env: Env, tenantId: string, propostaId: string, file: File): Promise<{ ok: true } | Errore> {
  const r = await env.DB.prepare("SELECT id, contenuto FROM proposte WHERE id = ? AND tenant_id = ? AND ambito = 'ANAGRAFICA' AND stato = 'PROPOSTA'").bind(propostaId, tenantId).first<any>();
  const c = r ? await decifraJson<ContenutoCoda>(env, tenantId, r.contenuto) : null;
  if (!r || c?.tipo !== 'CODA_VISURA') return { errore: 'Proposta non trovata o già rivista', stato: 404 };
  if (file.size > 20 * 1024 * 1024) return { errore: 'File troppo grande (massimo 20 MB).', stato: 400 };
  const buf = await file.arrayBuffer();
  const nome = file.name.replace(/[^\w.\- àèéìòù()]/gi, '_').slice(0, 120) || 'visura.pdf';
  const r2Key = `${tenantId}/coda/${propostaId}-${nome}`;
  await env.DOCS.put(r2Key, buf, { httpMetadata: { contentType: file.type || 'application/pdf' } });
  c.pdf = { r2Key, nome, mime: file.type || 'application/pdf', dimensione: buf.byteLength, sha256: await sha256Hex(buf) };
  await env.DB.prepare('UPDATE proposte SET contenuto = ? WHERE id = ? AND tenant_id = ?').bind(await cifraJson(env, tenantId, c), propostaId, tenantId).run();
  return { ok: true };
}

export interface VoceCoda {
  id: string;
  ambito: 'ANAGRAFICA' | 'TITOLARITA';
  creatoIl: string;
  alert: Array<{ codice: string; gravita: string }>;
  clienteId: string | null;
  cliente: { id: string; denominazione: string; tipo: string; attivo: boolean } | null;
  /** Solo ANAGRAFICA (visura in coda). */
  visura: Omit<ContenutoCoda, 'tipo' | 'pdf'> & { pdf: { nome: string; dimensione: number } | null } | null;
  /** Solo TITOLARITA (proposta registrata dal flusso M17): titolari e criterio proposti. */
  titolarita: { titolari: any[]; criterio: string; bozzaMotivazione: string | null; dataVisura: string | null } | null;
  /** Vero se «Applica tutto» può chiuderla da sola: nessun alert alto e, per la titolarità, criterio della proprietà con titolari trovati. */
  applicabileInBlocco: boolean;
}

const senzaAlertAlti = (alert: Array<{ gravita: string }>) => !alert.some((a) => a.gravita === 'alta');
const titolaritaApplicabile = (t: { titolari: any[]; criterio: string } | null) =>
  Boolean(t && t.titolari.length > 0 && ['PROPRIETA_DIRETTA', 'PROPRIETA_INDIRETTA'].includes(t.criterio));

export async function leggiCoda(env: Env, tenantId: string): Promise<VoceCoda[]> {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.ambito, p.cliente_id, p.contenuto, p.alert, p.creato_il, c.denominazione, c.tipo, c.attivo
     FROM proposte p LEFT JOIN clienti c ON c.id = p.cliente_id
     WHERE p.tenant_id = ? AND p.stato = 'PROPOSTA' AND p.ambito IN ('ANAGRAFICA','TITOLARITA') ORDER BY p.creato_il, p.id`,
  ).bind(tenantId).all<any>();
  const out: VoceCoda[] = [];
  for (const r of results ?? []) {
    let alert: Array<{ codice: string; gravita: string }> = [];
    try { alert = JSON.parse(r.alert ?? '[]'); } catch { alert = []; }
    const cliente = r.cliente_id && r.denominazione ? { id: r.cliente_id, denominazione: r.denominazione, tipo: r.tipo, attivo: r.attivo === 1 } : null;
    const c = await decifraJson<any>(env, tenantId, r.contenuto);
    if (r.ambito === 'ANAGRAFICA') {
      if (c?.tipo !== 'CODA_VISURA') continue; // le anagrafiche applicate alla creazione (M17) non sono in coda
      const { tipo: _t, pdf, ...resto } = c as ContenutoCoda;
      out.push({
        id: r.id, ambito: 'ANAGRAFICA', creatoIl: r.creato_il, alert, clienteId: r.cliente_id ?? null, cliente,
        visura: { ...resto, pdf: pdf ? { nome: pdf.nome, dimensione: pdf.dimensione } : null }, titolarita: null,
        applicabileInBlocco: senzaAlertAlti(alert) && (cliente ? cliente.attivo : true),
      });
    } else {
      const t = c ? { titolari: c.titolari ?? [], criterio: c.criterio ?? 'NESSUNO', bozzaMotivazione: c.bozzaMotivazione ?? null, dataVisura: c.dataVisura ?? null } : null;
      out.push({
        id: r.id, ambito: 'TITOLARITA', creatoIl: r.creato_il, alert, clienteId: r.cliente_id ?? null, cliente, visura: null, titolarita: t,
        applicabileInBlocco: senzaAlertAlti(alert) && titolaritaApplicabile(t) && Boolean(cliente?.attivo),
      });
    }
  }
  return out;
}

async function leggiVoceVisura(env: Env, tenantId: string, id: string): Promise<{ riga: any; contenuto: ContenutoCoda } | null> {
  const r = await env.DB.prepare("SELECT * FROM proposte WHERE id = ? AND tenant_id = ? AND ambito = 'ANAGRAFICA' AND stato = 'PROPOSTA'").bind(id, tenantId).first<any>();
  const c = r ? await decifraJson<ContenutoCoda>(env, tenantId, r.contenuto) : null;
  return r && c?.tipo === 'CODA_VISURA' ? { riga: r, contenuto: c } : null;
}

/** Il PDF di transito diventa documento VISURA del cliente (stessa impronta = non si duplica). */
async function consolidaPdf(env: Env, tenantId: string, utenteId: string, clienteId: string, c: ContenutoCoda): Promise<string | null> {
  if (!c.pdf) return null;
  const esistente = await env.DB.prepare('SELECT id FROM documenti WHERE tenant_id = ? AND cliente_id = ? AND sha256 = ?').bind(tenantId, clienteId, c.pdf.sha256).first<any>();
  if (esistente) {
    await env.DOCS.delete(c.pdf.r2Key).catch(() => undefined);
    return esistente.id;
  }
  const oggetto = await env.DOCS.get(c.pdf.r2Key);
  if (!oggetto) return null;
  const id = nuovoId('doc');
  const r2Key = `${tenantId}/cliente/${clienteId}/${id}-${c.pdf.nome}`;
  await env.DOCS.put(r2Key, await oggetto.arrayBuffer(), { httpMetadata: { contentType: c.pdf.mime } });
  await env.DB.prepare(
    `INSERT INTO documenti (id, tenant_id, cliente_id, tipo, nome_file, mime, dimensione, r2_key, sha256, data_riferimento, data_acquisizione, conserva_fino_al, creato_da)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(id, tenantId, clienteId, 'VISURA', c.pdf.nome, c.pdf.mime, c.pdf.dimensione, r2Key, c.pdf.sha256, c.dataVisura ?? oggi(), oggi(), null, utenteId).run();
  await env.DOCS.delete(c.pdf.r2Key).catch(() => undefined);
  await scriviAudit(env.DB, { tenantId, utenteId, azione: 'ACQUISISCI_DOCUMENTO', entita: 'documenti', entitaId: id, dettaglio: { sha256: c.pdf.sha256, clienteId, tipo: 'VISURA', origine: 'CODA' } });
  return id;
}

export interface OpzioniApplica {
  /** Correzioni ai campi dell'anagrafica (solo NUOVO). */
  anagrafica?: Record<string, unknown>;
  professionistaId?: string | null;
  /** Chiavi delle differenze da applicare (solo ESISTENTE); assenti = tutte. */
  chiavi?: string[];
  motivazione?: string | null;
}

/**
 * Applica una visura in coda: crea o aggiorna il cliente con le stesse
 * funzioni del flusso M17, consolida il PDF, chiude la proposta con l'esito
 * (APPLICATA tale e quale, MODIFICATA se il professionista ha corretto).
 * La proposta di titolarità che ne nasce entra a sua volta in coda.
 */
export async function applicaVoceCoda(env: Env, tenantId: string, u: Utente, ip: string | null | undefined, id: string, opz: OpzioniApplica = {}) {
  const voce = await leggiVoceVisura(env, tenantId, id);
  if (!voce) return { errore: 'Proposta non trovata o già rivista', stato: 404 } as Errore;
  const c = voce.contenuto;
  const corpoComune = { soci: c.soci, cariche: c.cariche, capitale: c.capitale, dataVisura: c.dataVisura, dataElencoSoci: c.dataElencoSoci, telemetria: c.telemetria };
  let clienteId: string;
  let esito: any;
  let modificata = false;
  let applicati: string[] = [];

  if (c.abbinamento === 'NUOVO') {
    const correzioni = opz.anagrafica && typeof opz.anagrafica === 'object' ? opz.anagrafica : {};
    const { datiIdentificativi: diCorr, ...campiCorr } = correzioni as any;
    const anagrafica = { ...c.anagrafica, ...campiCorr, datiIdentificativi: { ...(c.anagrafica.datiIdentificativi ?? {}), ...(diCorr ?? {}) }, professionistaId: opz.professionistaId ?? undefined };
    modificata = Object.keys(campiCorr).some((k) => String((c.anagrafica as any)[k] ?? '') !== String(campiCorr[k] ?? ''));
    const r = await creaClienteDaVisura(env, tenantId, u, ip, { anagrafica, ...corpoComune });
    if ('errore' in r) return r;
    clienteId = r.id;
    esito = r;
    applicati = ['creazione'];
  } else {
    if (!c.clienteId) return { errore: 'Cliente di riferimento mancante', stato: 400 } as Errore;
    const differenze = c.differenze ?? [];
    const scelte = Array.isArray(opz.chiavi) ? new Set(opz.chiavi.map(String)) : null;
    modificata = scelte !== null && differenze.some((d) => !scelte.has(d.chiave));
    const campi: Record<string, unknown> = {};
    const datiIdentificativi: Record<string, unknown> = {};
    for (const d of differenze) {
      if (scelte && !scelte.has(d.chiave)) continue;
      if (d.chiave.startsWith('di.')) datiIdentificativi[d.chiave.slice(3)] = d.nuovo;
      else campi[d.chiave] = d.nuovo;
    }
    const r = await aggiornaClienteDaVisura(env, tenantId, u, ip, c.clienteId, { campi, datiIdentificativi, ...corpoComune, forzaProposta: true });
    if ('errore' in r) return r;
    clienteId = c.clienteId;
    esito = r;
    applicati = r.applicati;
  }

  const documentoId = await consolidaPdf(env, tenantId, u.id, clienteId, c).catch(() => null);
  const stato = modificata ? 'MODIFICATA' : 'APPLICATA';
  await env.DB.prepare(
    "UPDATE proposte SET stato = ?, esito = ?, cliente_id = ?, rivista_da = ?, rivista_il = datetime('now') WHERE id = ? AND tenant_id = ? AND stato = 'PROPOSTA'",
  ).bind(stato, await cifraJson(env, tenantId, { clienteId, applicati, documentoId, motivazione: opz.motivazione ?? null, chiavi: opz.chiavi ?? null }), clienteId, u.id, id, tenantId).run();
  await scriviAudit(env.DB, { tenantId, utenteId: u.id, azione: 'RIVEDI_PROPOSTA', entita: 'proposte', entitaId: id, dettaglio: { stato, origine: 'CODA', clienteId }, ip });
  return {
    ok: true as const, stato, clienteId, documentoId, applicati,
    propostaTitolaritaId: esito?.proposta?.id ?? null,
    alert: (esito?.proposta?.alert ?? []).map((a: Alert) => ({ codice: a.codice, gravita: a.gravita })),
    screening: esito?.screening ?? null,
  };
}

export async function scartaVoceCoda(env: Env, tenantId: string, u: Utente, ip: string | null | undefined, id: string, motivazione: string) {
  if (!motivazione.trim()) return { errore: 'Se scarti la proposta, scrivi il perché: è ciò che documenta il tuo giudizio.', stato: 400 } as Errore;
  const voce = await leggiVoceVisura(env, tenantId, id);
  if (!voce) return { errore: 'Proposta non trovata o già rivista', stato: 404 } as Errore;
  if (voce.contenuto.pdf) await env.DOCS.delete(voce.contenuto.pdf.r2Key).catch(() => undefined);
  await env.DB.prepare("UPDATE proposte SET stato = 'SCARTATA', esito = ?, rivista_da = ?, rivista_il = datetime('now') WHERE id = ? AND tenant_id = ? AND stato = 'PROPOSTA'")
    .bind(await cifraJson(env, tenantId, { motivazione: motivazione.trim() }), u.id, id, tenantId).run();
  await scriviAudit(env.DB, { tenantId, utenteId: u.id, azione: 'RIVEDI_PROPOSTA', entita: 'proposte', entitaId: id, dettaglio: { stato: 'SCARTATA', origine: 'CODA' }, ip });
  return { ok: true as const };
}

/** Registra i titolari effettivi proposti (criterio della proprietà) chiudendo la proposta come APPLICATA. */
async function applicaTitolarita(env: Env, tenantId: string, u: Utente, ip: string | null | undefined, propostaId: string, clienteId: string) {
  const r = await env.DB.prepare("SELECT contenuto, alert FROM proposte WHERE id = ? AND tenant_id = ? AND ambito = 'TITOLARITA' AND stato = 'PROPOSTA'").bind(propostaId, tenantId).first<any>();
  if (!r) return false;
  let alert: Array<{ gravita: string }> = [];
  try { alert = JSON.parse(r.alert ?? '[]'); } catch { alert = []; }
  const c = await decifraJson<any>(env, tenantId, r.contenuto);
  const t = c ? { titolari: c.titolari ?? [], criterio: c.criterio ?? 'NESSUNO' } : null;
  if (!senzaAlertAlti(alert) || !titolaritaApplicabile(t)) return false;
  const esito = await registraTitolari(env, tenantId, u, ip, clienteId, { titolari: titolariDaProposta(t!.titolari), propostaId, propostaModificata: false });
  return !('errore' in esito);
}

/**
 * «Applica tutto»: solo le proposte senza alert di gravità alta. Una visura
 * applicata genera la proposta di titolarità; se anche quella è «pulita»
 * (proprietà, titolari trovati, nessun alert alto) si registra subito.
 * Il resto resta in coda per la revisione una alla volta.
 */
export async function applicaTuttoCoda(env: Env, tenantId: string, u: Utente, ip: string | null | undefined) {
  const voci = await leggiCoda(env, tenantId);
  const esito = { visure: 0, titolarita: 0, saltate: 0, errori: [] as Array<{ id: string; errore: string }> };
  for (const v of voci) {
    if (!v.applicabileInBlocco) { esito.saltate++; continue; }
    if (v.ambito === 'ANAGRAFICA') {
      const r = await applicaVoceCoda(env, tenantId, u, ip, v.id);
      if ('errore' in r) { esito.errori.push({ id: v.id, errore: r.errore }); continue; }
      esito.visure++;
      if (r.propostaTitolaritaId && (await applicaTitolarita(env, tenantId, u, ip, r.propostaTitolaritaId, r.clienteId))) esito.titolarita++;
    } else if (v.clienteId) {
      if (await applicaTitolarita(env, tenantId, u, ip, v.id, v.clienteId)) esito.titolarita++;
      else esito.saltate++;
    }
  }
  await scriviAudit(env.DB, { tenantId, utenteId: u.id, azione: 'CODA_APPLICA_TUTTO', entita: 'proposte', dettaglio: esito, ip });
  return esito;
}
