/**
 * Autenticazione, sessioni e controllo dei ruoli.
 *
 * Scelte:
 *  - sessione server-side su D1, non JWT. Il token è opaco e nel database sta
 *    solo il suo SHA-256: chi legge il DB non può impersonare nessuno. Un JWT
 *    non sarebbe revocabile immediatamente, e qui la revoca serve (revoca di
 *    un collaboratore che lascia lo studio, con accesso a dati di clienti).
 *  - cookie HttpOnly + Secure + SameSite=Strict. Nessun token in localStorage.
 *  - il tenant non arriva mai dal client: si ricava dalla sessione. È la
 *    difesa strutturale contro l'accesso incrociato tra studi.
 */

import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { sha256Hex, nuovoToken } from './crypto';
import type { Env, Sessione, Utente, Variabili } from './tipi';

const COOKIE = 'antiriciclaggio_sess';

// ── Scadenze delle sessioni (AR-M12, come Assist) ──────────────
// La sessione scade per INATTIVITÀ (rinnovo scorrevole a ogni richiesta,
// con un tetto assoluto): 8 ore / 24 ore, oppure 7 giorni / 30 giorni se
// nel login è spuntato «Resta collegato su questo computer».
const DURATE = {
  breve: { inattivitaOre: 8, assolutaOre: 24 },
  lunga: { inattivitaOre: 24 * 7, assolutaOre: 24 * 30 },
} as const;
/** Il rinnovo scrive su D1: al massimo una volta ogni 5 minuti. */
const RINNOVO_MINUTI = 5;

export function calcolaScadenze(ricordami: boolean, adesso = new Date()): { inattivita: Date; assoluta: Date } {
  const d = ricordami ? DURATE.lunga : DURATE.breve;
  return {
    inattivita: new Date(adesso.getTime() + d.inattivitaOre * 3600_000),
    assoluta: new Date(adesso.getTime() + d.assolutaOre * 3600_000),
  };
}

/** La prossima scadenza per inattività, senza superare il tetto assoluto. */
function prossimaScadenzaInattivita(ricordami: boolean, assoluta: string | null, adesso = new Date()): string {
  const d = ricordami ? DURATE.lunga : DURATE.breve;
  const nuova = new Date(adesso.getTime() + d.inattivitaOre * 3600_000);
  if (assoluta && nuova.toISOString() > assoluta) return assoluta;
  return nuova.toISOString();
}

/** Riferimento pubblico di una sessione (per revocarla senza esporre l'id). */
export async function rifSessione(id: string): Promise<string> {
  return (await sha256Hex(id)).slice(0, 16);
}

/** «Chrome su Mac», dal solo user agent: niente di più preciso, per scelta. */
export function descriviDispositivo(ua: string | null | undefined): string {
  if (!ua) return 'Dispositivo sconosciuto';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const sistema = /iPhone|iPad|iPod/.test(ua) ? 'iPhone o iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : null;
  if (browser && sistema) return `${browser} su ${sistema}`;
  return browser ?? sistema ?? 'Dispositivo sconosciuto';
}

export async function creaSessione(
  db: D1Database,
  utente: Utente,
  ip: string | null,
  userAgent: string | null,
  ricordami = false,
): Promise<string> {
  const token = nuovoToken();
  const id = await sha256Hex(token);
  const { inattivita, assoluta } = calcolaScadenze(ricordami);
  await db
    .prepare(`INSERT INTO sessioni (id, utente_id, tenant_id, scade_il, scade_assoluta, ricordami, ultimo_utilizzo, ip, user_agent)
              VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)`)
    .bind(id, utente.id, utente.tenant_id, inattivita.toISOString(), assoluta.toISOString(), ricordami ? 1 : 0, ip, userAgent)
    .run();
  return token;
}

export function impostaCookieSessione(c: Context, token: string, ricordami = false, scadeIl?: string): void {
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    // Senza «Resta collegato» il cookie è di sessione (sparisce alla
    // chiusura del browser); il taglio vero lo fa comunque il server.
    ...(ricordami ? { expires: scadeIl ? new Date(scadeIl) : calcolaScadenze(true).inattivita } : {}),
  });
}

export function rimuoviCookieSessione(c: Context): void {
  deleteCookie(c, COOKIE, { path: '/' });
}

export async function chiudiSessione(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM sessioni WHERE id = ?').bind(await sha256Hex(token)).run();
}

/** Middleware: popola c.var.utente e c.var.tenantId, o risponde 401. */
export async function richiediAutenticazione(
  c: Context<{ Bindings: Env; Variables: Variabili }>,
  next: Next,
): Promise<Response | void> {
  const token = getCookie(c, COOKIE);
  if (!token) return c.json({ errore: 'Sessione assente' }, 401);

  const id = await sha256Hex(token);
  // Il JOIN su tenants porta lo stato commerciale dentro la stessa query:
  // nessuna query aggiuntiva per richiesta (blocco sospeso/cessato, AR-M6).
  const riga = await c.env.DB.prepare(
    `SELECT s.id AS sid, s.scade_il, s.scade_assoluta, s.ricordami, s.ultimo_utilizzo,
            u.*, t.stato AS tenant_stato
     FROM sessioni s
     JOIN utenti u ON u.id = s.utente_id
     JOIN tenants t ON t.id = u.tenant_id
     WHERE s.id = ? AND u.attivo = 1`,
  )
    .bind(id)
    .first<Sessione & Utente & { sid: string; scade_il: string; scade_assoluta: string | null; ricordami: number | null; ultimo_utilizzo: string | null; tenant_stato: string | null }>();

  if (!riga) return c.json({ errore: 'Sessione non valida' }, 401);
  const adesso = new Date().toISOString();
  if (riga.scade_il <= adesso || (riga.scade_assoluta && riga.scade_assoluta <= adesso)) {
    await c.env.DB.prepare('DELETE FROM sessioni WHERE id = ?').bind(id).run();
    return c.json({ errore: 'Sessione scaduta' }, 401);
  }

  // Rinnovo scorrevole della scadenza per inattività (throttle 5 minuti).
  const ricordami = riga.ricordami === 1;
  const ultimo = riga.ultimo_utilizzo ? new Date(riga.ultimo_utilizzo.includes('T') ? riga.ultimo_utilizzo : riga.ultimo_utilizzo.replace(' ', 'T') + 'Z') : null;
  if (!ultimo || Date.now() - ultimo.getTime() >= RINNOVO_MINUTI * 60_000) {
    const nuova = prossimaScadenzaInattivita(ricordami, riga.scade_assoluta);
    await c.env.DB.prepare("UPDATE sessioni SET scade_il = ?, ultimo_utilizzo = datetime('now') WHERE id = ?")
      .bind(nuova, id)
      .run();
    if (ricordami) impostaCookieSessione(c, token, true, nuova);
  }

  c.set('utente', {
    id: riga.id,
    tenant_id: riga.tenant_id,
    email: riga.email,
    nome: riga.nome,
    ruolo: riga.ruolo,
    attivo: riga.attivo,
    avatar: riga.avatar ?? null,
    cambio_password_richiesto: riga.cambio_password_richiesto ?? 0,
    tema: riga.tema ?? null,
    modo_colore: riga.modo_colore ?? null,
  } as Utente);
  c.set('sessioneId', riga.sid);
  c.set('tenantId', riga.tenant_id);
  c.set('tenantStato', riga.tenant_stato ?? 'attivo');
  c.set('ip', c.req.header('CF-Connecting-IP') ?? null);
  await next();
}

type Ruolo = Utente['ruolo'];

/**
 * Gerarchia dei permessi. Il LETTORE non vede le SOS: l'art. 38 impone di
 * limitare la conoscibilità dell'identità del segnalante e del contenuto della
 * segnalazione ai soggetti che devono averne notizia.
 */
export function richiediRuolo(...ruoli: Ruolo[]) {
  return async (c: Context<{ Bindings: Env; Variables: Variabili }>, next: Next): Promise<Response | void> => {
    const u = c.get('utente');
    if (!u) return c.json({ errore: 'Non autenticato' }, 401);
    if (!ruoli.includes(u.ruolo)) {
      return c.json(
        { errore: `Operazione riservata ai ruoli: ${ruoli.join(', ')}. Ruolo attuale: ${u.ruolo}.` },
        403,
      );
    }
    await next();
  };
}

/** Solo chi può firmare atti che impegnano la responsabilità del professionista. */
export const soloTitolare = richiediRuolo('TITOLARE');
/** Chi può scrivere nel fascicolo. */
export const puoScrivere = richiediRuolo('TITOLARE', 'COLLABORATORE');
/** Chi può accedere alle segnalazioni di operazione sospetta. */
export const puoVedereSos = richiediRuolo('TITOLARE');
