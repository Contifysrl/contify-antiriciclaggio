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
const DURATA_ORE = 12;

export async function creaSessione(
  db: D1Database,
  utente: Utente,
  ip: string | null,
  userAgent: string | null,
): Promise<string> {
  const token = nuovoToken();
  const id = await sha256Hex(token);
  const scadeIl = new Date(Date.now() + DURATA_ORE * 3600_000).toISOString();
  await db
    .prepare('INSERT INTO sessioni (id, utente_id, tenant_id, scade_il, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, utente.id, utente.tenant_id, scadeIl, ip, userAgent)
    .run();
  return token;
}

export function impostaCookieSessione(c: Context, token: string): void {
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: DURATA_ORE * 3600,
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
    `SELECT s.id AS sid, s.scade_il, u.*, t.stato AS tenant_stato
     FROM sessioni s
     JOIN utenti u ON u.id = s.utente_id
     JOIN tenants t ON t.id = u.tenant_id
     WHERE s.id = ? AND u.attivo = 1`,
  )
    .bind(id)
    .first<Sessione & Utente & { sid: string; scade_il: string; tenant_stato: string | null }>();

  if (!riga) return c.json({ errore: 'Sessione non valida' }, 401);
  if (riga.scade_il <= new Date().toISOString()) {
    await c.env.DB.prepare('DELETE FROM sessioni WHERE id = ?').bind(id).run();
    return c.json({ errore: 'Sessione scaduta' }, 401);
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
  } as Utente);
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
