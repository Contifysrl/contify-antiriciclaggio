/**
 * Moduli della piattaforma (TS-M0).
 *
 * Contify AR e Contify Timesheet sono due moduli dello stesso programma,
 * stesso archivio, stesso accesso. Uno studio può averne uno o entrambi
 * (`moduli_tenant`, migrazione 0015); ogni utente accede ad AR con
 * `utenti.accesso_ar` e a Timesheet con `utenti.ts_ruolo`. Qui vivono le
 * regole, come funzioni pure testabili senza Worker:
 *
 *  - stato EFFETTIVO di un modulo = il peggiore fra lo stato dello studio
 *    (`tenants.stato`, che blocca tutto) e lo stato della riga del modulo;
 *  - riga assente = modulo non acquistato; nessuna riga = «AR attivo»
 *    (rete di sicurezza per gli studi creati dal codice precedente);
 *  - ogni rotta autenticata è di AR, di Timesheet o COMUNE, per elenchi
 *    espliciti: il test `tests/moduli.test.ts` fallisce se una rotta
 *    registrata non sta in esattamente uno dei tre. A tempo di esecuzione una
 *    rotta non elencata vale AR, il caso più restrittivo per chi ha solo
 *    Timesheet;
 *  - chi amministra lo studio accede sempre a tutti i moduli dello studio:
 *    può scaricare l'intero backup, negargli un modulo sarebbe una finzione.
 */

import { type BloccoLicenza, type StatoTenant, bloccoPerStato, statoValido } from './licenza';
import type { ModuliStudio } from './tipi';

export type { ModuliStudio };
export const MODULI = ['AR', 'TS'] as const;
export type Modulo = (typeof MODULI)[number];
export type ClasseRotta = Modulo | 'COMUNE';

export function moduloValido(m: string | null | undefined): m is Modulo {
  return (MODULI as readonly string[]).includes(m ?? '');
}

const ORDINE: Record<StatoTenant, number> = { attivo: 0, sospeso: 1, cessato: 2 };

/** Il peggiore fra i due stati: attivo < sospeso < cessato. */
export function statoEffettivo(statoStudio: StatoTenant, statoModulo: StatoTenant): StatoTenant {
  return ORDINE[statoModulo] > ORDINE[statoStudio] ? statoModulo : statoStudio;
}

/** Righe di `moduli_tenant` di uno studio → moduli con la rete di sicurezza. */
export function moduliDaRighe(righe: Array<{ modulo: string; stato: string | null }>): ModuliStudio {
  if (righe.length === 0) return { AR: 'attivo', TS: null };
  const m: ModuliStudio = { AR: null, TS: null };
  for (const r of righe) {
    if (moduloValido(r.modulo)) m[r.modulo] = statoValido(r.stato);
  }
  return m;
}

export async function moduliStudio(db: D1Database, tenantId: string): Promise<ModuliStudio> {
  const { results } = await db.prepare('SELECT modulo, stato FROM moduli_tenant WHERE tenant_id = ?')
    .bind(tenantId).all<{ modulo: string; stato: string }>();
  return moduliDaRighe(results ?? []);
}

/**
 * Rete di sicurezza resa permanente: uno studio senza alcuna riga riceve la
 * riga AR (è ciò che la migrazione 0015 ha fatto per gli studi esistenti).
 * Va chiamata PRIMA di scrivere una riga di modulo da console, altrimenti
 * l'aggiunta di Timesheet farebbe sparire AR; il lavoro notturno la ripete
 * per tutti gli studi.
 */
export const SQL_RETE_DI_SICUREZZA_AR = `INSERT INTO moduli_tenant (tenant_id, modulo, stato, data_attivazione)
  SELECT t.id, 'AR', 'attivo', t.data_attivazione FROM tenants t
  WHERE NOT EXISTS (SELECT 1 FROM moduli_tenant m WHERE m.tenant_id = t.id)`;

/**
 * Frammenti SQL per il lavoro notturno di AR: `alias` è l'alias di `tenants`.
 * «Ha AR» = riga AR presente (in qualunque stato) oppure nessuna riga (rete di
 * sicurezza); «AR attivo» pretende la riga attiva o nessuna riga.
 */
export function sqlConModuloAr(alias = 't'): string {
  return `(EXISTS (SELECT 1 FROM moduli_tenant m WHERE m.tenant_id = ${alias}.id AND m.modulo = 'AR')
    OR NOT EXISTS (SELECT 1 FROM moduli_tenant m WHERE m.tenant_id = ${alias}.id))`;
}
export function sqlConModuloArAttivo(alias = 't'): string {
  return `(EXISTS (SELECT 1 FROM moduli_tenant m WHERE m.tenant_id = ${alias}.id AND m.modulo = 'AR' AND m.stato = 'attivo')
    OR NOT EXISTS (SELECT 1 FROM moduli_tenant m WHERE m.tenant_id = ${alias}.id))`;
}

export async function assicuraRigheModuli(db: D1Database, tenantId?: string): Promise<void> {
  if (tenantId) {
    await db.prepare(`${SQL_RETE_DI_SICUREZZA_AR} AND t.id = ?`).bind(tenantId).run();
  } else {
    await db.prepare(SQL_RETE_DI_SICUREZZA_AR).run();
  }
}

// ── Classificazione delle rotte autenticate ────────────────────
// Modelli di rotta COSÌ COME SONO REGISTRATI (con il prefisso /api). Una voce
// che finisce con `*` è un prefisso; le altre sono esatte, con `:parametro`
// come segmento variabile. Le rotte fuori dalla catena di autenticazione
// (/api/pubblico/*, /api/console/*, login/logout/reset) non si classificano.

export const ROTTE_TS: readonly string[] = ['/api/ts', '/api/ts/*'];

export const ROTTE_COMUNI: readonly string[] = [
  '/api/auth/*',
  '/api/utenti*',
  '/api/backup*',
  '/api/audit*',
  '/api/assistenza*',
  '/api/novita',
  '/api/studio/logo',
];

export const ROTTE_AR: readonly string[] = [
  '/api/clienti*',
  '/api/fascicoli*',
  '/api/coda*',
  '/api/catalogo/*',
  '/api/ai/*',
  '/api/verifiche-remote/*',
  '/api/sos*',
  '/api/screening*',
  '/api/strumenti/*',
  '/api/registro-te/*',
  '/api/scadenzario',
  '/api/proposte/*',
  '/api/lookup/*',
  '/api/documenti/*',
  '/api/cruscotto',
  '/api/completezza',
  '/api/primi-passi',
  // /api/studio/*, tranne il logo (comune): sono tutte di antiriciclaggio.
  '/api/studio/autovalutazioni*',
  '/api/studio/indicatori',
  '/api/studio/formazione*',
  '/api/studio/persone',
  '/api/studio/province-contante',
  '/api/studio/registro-accreditamento',
  '/api/studio/professionisti',
];

/** `voce` corrisponde a `path` (un modello registrato o un percorso reale)? */
function corrisponde(voce: string, path: string): boolean {
  if (voce.endsWith('*')) return path.startsWith(voce.slice(0, -1));
  if (!voce.includes(':')) return voce === path;
  const re = new RegExp(`^${voce.split('/').map((s) => (s.startsWith(':') ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/')}$`);
  return re.test(path);
}

export function rottaInElenco(elenco: readonly string[], path: string): boolean {
  return elenco.some((v) => corrisponde(v, path));
}

export function classeDellaRotta(path: string): ClasseRotta {
  if (rottaInElenco(ROTTE_TS, path)) return 'TS';
  if (rottaInElenco(ROTTE_COMUNI, path)) return 'COMUNE';
  return 'AR';
}

// ── Il verdetto ────────────────────────────────────────────────

export interface UtenteModuli {
  amministratore?: number | null;
  /** 1 (o assente: riga del codice precedente) = accede ad AR. */
  accesso_ar?: number | null;
  ts_ruolo?: 'TITOLARE' | 'COLLABORATORE' | null;
}

export function accedeAdAr(u: UtenteModuli): boolean {
  return u.amministratore === 1 || u.accesso_ar !== 0;
}

export function accedeATs(u: UtenteModuli): boolean {
  return u.amministratore === 1 || !!u.ts_ruolo;
}

export type BloccoModulo = BloccoLicenza;

/**
 * null = la richiesta prosegue. Le voci comuni seguono il solo stato dello
 * studio (come prima di TS-M0); le rotte di un modulo pretendono che lo studio
 * lo abbia e che l'utente vi acceda, poi vale lo stato effettivo del modulo.
 */
export function verdettoModulo(v: {
  path: string;
  metodo: string;
  statoStudio: StatoTenant;
  moduli: ModuliStudio;
  utente: UtenteModuli;
}): BloccoModulo | null {
  const classe = classeDellaRotta(v.path);
  if (classe === 'COMUNE') return bloccoPerStato(v.statoStudio, v.metodo, v.path);

  const statoModulo = v.moduli[classe];
  if (!statoModulo) {
    return {
      status: 403,
      codice: 'modulo_non_attivo',
      errore: classe === 'TS'
        ? 'Contify Timesheet non è attivo per questo studio. Contatta Contify per attivarlo.'
        : 'Contify AR non è attivo per questo studio. Contatta Contify per attivarlo.',
    };
  }
  const accede = classe === 'TS' ? accedeATs(v.utente) : accedeAdAr(v.utente);
  if (!accede) {
    return {
      status: 403,
      codice: 'modulo_non_consentito',
      errore: classe === 'TS'
        ? 'Il tuo utente non accede a Contify Timesheet. Chiedi a chi amministra lo studio di assegnarti un ruolo Timesheet.'
        : 'Il tuo utente non accede a Contify AR. Chiedi a chi amministra lo studio di abilitarti.',
    };
  }
  return bloccoPerStato(statoEffettivo(v.statoStudio, statoModulo), v.metodo, v.path);
}

// ── Console: righe complete e attivazione di un modulo ─────────

export interface RigaModulo {
  stato: StatoTenant;
  dataAttivazione: string | null;
  dataScadenzaCanone: string | null;
  postiInclusi: number | null;
  noteContratto: string | null;
  creatoIl: string;
  aggiornatoIl: string;
}
export type ModuliDettaglio = { AR: RigaModulo | null; TS: RigaModulo | null };

function rigaModulo(r: any): RigaModulo {
  return {
    stato: statoValido(r.stato),
    dataAttivazione: r.data_attivazione ?? null,
    dataScadenzaCanone: r.data_scadenza_canone ?? null,
    postiInclusi: r.posti_inclusi ?? null,
    noteContratto: r.note_contratto ?? null,
    creatoIl: r.creato_il,
    aggiornatoIl: r.aggiornato_il,
  };
}

/**
 * Le righe complete di `moduli_tenant` per la console. ATTENZIONE: qui la
 * rete di sicurezza NON si applica (la console deve vedere la verità in
 * archivio); chi legge sa che «nessuna riga» vale AR attivo per il programma.
 */
export async function moduliDettaglio(db: D1Database, tenantId: string): Promise<ModuliDettaglio> {
  const { results } = await db.prepare('SELECT * FROM moduli_tenant WHERE tenant_id = ?').bind(tenantId).all<any>();
  const d: ModuliDettaglio = { AR: null, TS: null };
  for (const r of results ?? []) { const m = String(r.modulo); if (moduloValido(m)) d[m] = rigaModulo(r); }
  return d;
}

/** Righe complete di tutti gli studi, raggruppate per studio (elenco della console). */
export async function moduliDiTuttiGliStudi(db: D1Database): Promise<Record<string, ModuliDettaglio>> {
  const { results } = await db.prepare('SELECT * FROM moduli_tenant').all<any>();
  const per: Record<string, ModuliDettaglio> = {};
  for (const r of results ?? []) {
    const m = String(r.modulo);
    if (!moduloValido(m)) continue;
    (per[String(r.tenant_id)] ??= { AR: null, TS: null })[m] = rigaModulo(r);
  }
  return per;
}

export interface DatiModulo {
  stato?: StatoTenant;
  dataAttivazione?: string | null;
  dataScadenzaCanone?: string | null;
  postiInclusi?: number | null;
  noteContratto?: string | null;
}

/**
 * Scrive (crea o aggiorna) la riga di un modulo. Prima materializza la rete
 * di sicurezza per lo studio: senza questo passo, aggiungere Timesheet a uno
 * studio senza righe farebbe sparire AR. I campi non indicati restano come
 * sono; alla creazione lo stato predefinito è «attivo».
 */
export async function scriviModulo(db: D1Database, tenantId: string, modulo: Modulo, dati: DatiModulo): Promise<{ creato: boolean; prima: RigaModulo | null; dopo: RigaModulo }> {
  await assicuraRigheModuli(db, tenantId);
  const esistente = await db.prepare('SELECT * FROM moduli_tenant WHERE tenant_id = ? AND modulo = ?').bind(tenantId, modulo).first<any>();
  const prima = esistente ? rigaModulo(esistente) : null;
  const v = (nuovo: unknown, attuale: unknown) => (nuovo === undefined ? (attuale ?? null) : nuovo);
  const stato = dati.stato ?? prima?.stato ?? 'attivo';
  const riga = {
    stato,
    data_attivazione: v(dati.dataAttivazione, prima?.dataAttivazione),
    data_scadenza_canone: v(dati.dataScadenzaCanone, prima?.dataScadenzaCanone),
    posti_inclusi: v(dati.postiInclusi, prima?.postiInclusi),
    note_contratto: v(dati.noteContratto, prima?.noteContratto),
  };
  if (esistente) {
    await db.prepare(
      `UPDATE moduli_tenant SET stato = ?, data_attivazione = ?, data_scadenza_canone = ?, posti_inclusi = ?, note_contratto = ?,
         aggiornato_il = datetime('now') WHERE tenant_id = ? AND modulo = ?`,
    ).bind(riga.stato, riga.data_attivazione, riga.data_scadenza_canone, riga.posti_inclusi, riga.note_contratto, tenantId, modulo).run();
  } else {
    await db.prepare(
      `INSERT INTO moduli_tenant (tenant_id, modulo, stato, data_attivazione, data_scadenza_canone, posti_inclusi, note_contratto)
       VALUES (?,?,?,?,?,?,?)`,
    ).bind(tenantId, modulo, riga.stato, riga.data_attivazione, riga.data_scadenza_canone, riga.posti_inclusi, riga.note_contratto).run();
  }
  const dopo = rigaModulo(await db.prepare('SELECT * FROM moduli_tenant WHERE tenant_id = ? AND modulo = ?').bind(tenantId, modulo).first<any>());
  return { creato: !esistente, prima, dopo };
}

/**
 * Quando Timesheet diventa attivo per uno studio, gli utenti senza ruolo
 * Timesheet lo ricevono dal ruolo AR: TITOLARE → TITOLARE, COLLABORATORE →
 * COLLABORATORE, LETTORE e REVISORE → nessuno; chi amministra → TITOLARE.
 * Chi ha già un ruolo Timesheet non viene toccato.
 */
export async function copiaRuoliTimesheet(db: D1Database, tenantId: string): Promise<number> {
  const r = await db.prepare(
    `UPDATE utenti SET ts_ruolo = CASE
        WHEN amministratore = 1 THEN 'TITOLARE'
        WHEN ruolo = 'TITOLARE' THEN 'TITOLARE'
        WHEN ruolo = 'COLLABORATORE' THEN 'COLLABORATORE'
        ELSE NULL END
     WHERE tenant_id = ? AND ts_ruolo IS NULL AND (amministratore = 1 OR ruolo IN ('TITOLARE','COLLABORATORE'))`,
  ).bind(tenantId).run();
  return r.meta?.changes ?? 0;
}
