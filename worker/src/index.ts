/**
 * Contify Antiriciclaggio — API Worker
 *
 * Regole trasversali applicate ovunque:
 *  - il tenant si legge SEMPRE dalla sessione, mai dal body o dalla query;
 *  - ogni scrittura rilevante finisce nel registro degli accessi concatenato;
 *  - il calcolo del rischio non vive mai nelle route: sta nel dominio, che è
 *    puro e testato. Le route orchestrano, non decidono.
 */

import { Hono, type Context } from 'hono';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import type { Env, Variabili } from './lib/tipi';
import {
  chiudiSessione,
  creaSessione,
  impostaCookieSessione,
  puoScrivere,
  puoVedereSos,
  richiediAutenticazione,
  rimuoviCookieSessione,
  soloTitolare,
} from './lib/auth';
import { cifra, decifra, generaPasswordTemporanea, hashPassword, nuovoId, nuovoToken, sha256Hex, verificaPassword } from './lib/crypto';
import {
  inviaEmailAssistenza,
  inviaEmailAvvisoCanone,
  inviaEmailBenvenuto,
  inviaEmailResetPassword,
  inviaEmailScadenzario,
  inviaEmailVerificaCompletata,
  inviaEmailVerificaRemota,
  urlApp,
} from './lib/mail';
import { scriviAudit, verificaCatenaAudit } from './lib/audit';
import { backupSchedulato, chiaveDelTenant, prefissoTenant, runBackupTenant, type TipoBackupTenant } from './lib/backup';
import { eseguiEliminaArchivio, eseguiRipristino, RipristinoError } from './lib/ripristino';
import { SOGLIE_AVVISO_CANONE, bloccoPerStato, giorniAllaScadenza, statoValido } from './lib/licenza';
import { cercaAnagrafica, limiteSuperato } from './lib/lookup';
import { aggiornaListeSanzioni, caricaListe, eseguiScreeningTenant, listeDaAggiornare, screeningSchedulato } from './lib/sanzioni';
import { normalizzaPiva } from './lib/lookup/piva';
import { getCookie } from 'hono/cookie';

import { CNDCEC_2025 } from './domain/rulesets/cndcec-2025';
import { CATALOGO_PRESTAZIONI_2025, prestazioneObbligatoria, trovaPrestazione } from './domain/prestazioni';
import { calcolaAutovalutazione, calcolaProfiloCliente, ErroreDominio } from './domain/risk';
import { analizzaTitolaritaEffettiva } from './domain/titolare-effettivo';
import { calcolaScadenzeFascicolo, scadenzaComunicazioneMef, statoScadenze } from './domain/scadenze';
import { SOGLIE, TERMINI, aggiungiAnni, paeseAltoRischio, verificaContante } from './domain/norme';
import { AVVISO_INDICATORI, INDICATORI_UIF_2023 } from './domain/indicatori-uif';
import { SUB_INDICI_UIF_2023 } from './domain/sub-indici-uif';
import { costruisciDocx, rispostaDocx } from './lib/docx';
import {
  corpoFascicoloIspezione,
  corpoSchedaVerifica,
  corpoVerbaleAstensione,
  corpoVerbaleAutovalutazione,
} from './verbali';
import type { Ruleset } from './domain/types';

const RULESETS: Record<string, Ruleset> = { 'cndcec-2025': CNDCEC_2025 };

function ruleset(id?: string | null): Ruleset {
  const r = RULESETS[id ?? 'cndcec-2025'];
  if (!r) throw new ErroreDominio(`Ruleset sconosciuto: ${id}`);
  return r;
}

function oggi(): string {
  return new Date().toISOString().slice(0, 10);
}

const app = new Hono<{ Bindings: Env; Variables: Variabili }>();

app.use('*', logger());
app.use(
  '*',
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
    referrerPolicy: 'no-referrer',
  }),
);

app.onError((err, c) => {
  if (err instanceof ErroreDominio) return c.json({ errore: err.message, tipo: 'dominio' }, 400);
  console.error('Errore non gestito:', err);
  return c.json({ errore: 'Errore interno' }, 500);
});

const api = new Hono<{ Bindings: Env; Variables: Variabili }>();

// ===========================================================================
// AUTENTICAZIONE
// ===========================================================================

api.post('/auth/login', async (c) => {
  const { email, password } = await c.req.json<{ email?: string; password?: string }>();
  if (!email || !password) return c.json({ errore: 'Credenziali mancanti' }, 400);

  const u = await c.env.DB.prepare('SELECT * FROM utenti WHERE email = ? AND attivo = 1')
    .bind(email.toLowerCase().trim())
    .first<any>();

  // Risposta e tempi uniformi: non si deve poter dedurre se l'email esista.
  const ok = u ? await verificaPassword(password, u.password_hash) : await verificaPassword(password, await hashPassword('x'));
  if (!u || !ok) return c.json({ errore: 'Credenziali non valide' }, 401);

  const token = await creaSessione(c.env.DB, u, c.req.header('CF-Connecting-IP') ?? null, c.req.header('User-Agent') ?? null);
  impostaCookieSessione(c, token);
  await c.env.DB.prepare('UPDATE utenti SET ultimo_accesso = ? WHERE id = ?').bind(new Date().toISOString(), u.id).run();
  await scriviAudit(c.env.DB, {
    tenantId: u.tenant_id,
    utenteId: u.id,
    azione: 'LOGIN',
    ip: c.req.header('CF-Connecting-IP') ?? null,
  });

  const tenant = await c.env.DB.prepare('SELECT id, denominazione, piano, ruleset_default, stato, logo_url FROM tenants WHERE id = ?')
    .bind(u.tenant_id)
    .first<any>();

  return c.json({ utente: utentePubblico(u), studio: vistaStudio(tenant) });
});

api.post('/auth/logout', async (c) => {
  const token = getCookie(c, 'antiriciclaggio_sess');
  if (token) await chiudiSessione(c.env.DB, token);
  rimuoviCookieSessione(c);
  return c.json({ ok: true });
});

// ===========================================================================
// RESET PASSWORD SELF-SERVICE — rotte PUBBLICHE (esentate dall'auth sotto)
//
// - password-dimenticata: genera un token monouso (60 minuti) e invia il
//   link via email. Risposta SEMPRE identica, esista o no l'account
//   (niente enumerazione utenti). Throttle per email: un nuovo token solo
//   se il precedente ha più di due minuti.
// - reset-password: consuma il token e imposta la nuova password.
// Nel database sta solo l'HASH SHA-256 del token; il token in chiaro
// viaggia esclusivamente nel link della mail.
// ===========================================================================

const RESET_TTL_MIN = 60;

api.post('/auth/password-dimenticata', async (c) => {
  const b = await c.req.json<any>().catch(() => ({}));
  const email = String(b.email ?? '').toLowerCase().trim();
  if (!email || !email.includes('@')) return c.json({ errore: 'Email non valida' }, 400);

  const u = await c.env.DB.prepare('SELECT id, tenant_id, email FROM utenti WHERE email = ? AND attivo = 1')
    .bind(email)
    .first<any>();

  if (u) {
    // Throttle: se esiste già un token creato da meno di due minuti, non se
    // ne genera un altro (e non si rimanda la mail).
    const recente = await c.env.DB.prepare(
      "SELECT 1 FROM password_reset_token WHERE utente_id = ? AND creato_il > datetime('now', '-2 minutes')",
    ).bind(u.id).first();
    if (!recente) {
      await c.env.DB.prepare("DELETE FROM password_reset_token WHERE scade_il < datetime('now')").run();
      await c.env.DB.prepare('DELETE FROM password_reset_token WHERE utente_id = ?').bind(u.id).run();
      const token = nuovoToken();
      const scadenza = new Date(Date.now() + RESET_TTL_MIN * 60_000).toISOString();
      await c.env.DB.prepare('INSERT INTO password_reset_token (token_hash, utente_id, scade_il) VALUES (?,?,?)')
        .bind(await sha256Hex(token), u.id, scadenza)
        .run();
      // URL costruito dalla configurazione, mai dall'header Host.
      const urlReset = `${urlApp(c.env)}/#reset?token=${token}`;
      await inviaEmailResetPassword(c.env, u.email, urlReset);
      await scriviAudit(c.env.DB, { tenantId: u.tenant_id, utenteId: u.id, azione: 'RESET_RICHIESTO', ip: c.get('ip') ?? c.req.header('CF-Connecting-IP') ?? null });
    }
  }
  // Risposta identica in ogni caso.
  return c.json({ ok: true });
});

api.post('/auth/reset-password', async (c) => {
  const b = await c.req.json<any>().catch(() => ({}));
  const token = String(b.token ?? '');
  const nuova = String(b.nuova ?? '');
  if (nuova.length < 8) return c.json({ errore: 'La nuova password deve avere almeno 8 caratteri' }, 400);
  if (!token) return c.json({ errore: 'Link non valido o scaduto. Richiedi un nuovo reset della password.' }, 400);

  const riga = await c.env.DB.prepare(
    `SELECT t.token_hash, u.id AS utente_id, u.tenant_id
     FROM password_reset_token t JOIN utenti u ON u.id = t.utente_id
     WHERE t.token_hash = ? AND t.usato_il IS NULL AND t.scade_il > datetime('now') AND u.attivo = 1`,
  ).bind(await sha256Hex(token)).first<any>();
  if (!riga) return c.json({ errore: 'Link non valido o scaduto. Richiedi un nuovo reset della password.' }, 400);

  await c.env.DB.prepare('UPDATE utenti SET password_hash = ?, cambio_password_richiesto = 0 WHERE id = ?')
    .bind(await hashPassword(nuova), riga.utente_id)
    .run();
  // Token consumato + tutte le sessioni aperte revocate.
  await c.env.DB.prepare("UPDATE password_reset_token SET usato_il = datetime('now') WHERE token_hash = ?").bind(riga.token_hash).run();
  await c.env.DB.prepare('DELETE FROM sessioni WHERE utente_id = ?').bind(riga.utente_id).run();
  await scriviAudit(c.env.DB, { tenantId: riga.tenant_id, utenteId: riga.utente_id, azione: 'RESET_COMPLETATO', ip: c.req.header('CF-Connecting-IP') ?? null });

  return c.json({ ok: true });
});

api.use('/*', async (c, next) => {
  // Rotte pubbliche: login, logout e il reset password via email.
  // Tutto il resto richiede sessione.
  const pubbliche = ['/api/auth/login', '/api/auth/logout', '/api/auth/password-dimenticata', '/api/auth/reset-password', '/api/pubblico/'];
  if (pubbliche.some((p) => c.req.path.startsWith(p))) return next();
  return richiediAutenticazione(c, next);
});

// Blocco per stato commerciale (AR-M6): sospeso = sola lettura (con
// assistenza e backup manuale ancora possibili), cessato = accesso chiuso.
// Applicato DOPO l'autenticazione: lo stato viaggia nella query di sessione.
api.use('/*', async (c, next) => {
  const stato = c.get('tenantStato');
  if (!stato) return next(); // rotta pubblica: nessuna sessione
  const blocco = bloccoPerStato(statoValido(stato), c.req.method, c.req.path);
  if (blocco) return c.json({ errore: blocco.errore, codice: blocco.codice }, blocco.status);
  return next();
});

/** Logo dello studio custodito in tenants.logo_url come JSON {dataUrl, larghezza, altezza}. */
function logoStudio(logoUrl: string | null | undefined): { dataUrl: string; larghezza: number; altezza: number } | null {
  if (!logoUrl) return null;
  try {
    const l = JSON.parse(logoUrl);
    if (typeof l?.dataUrl === 'string' && l.dataUrl.startsWith('data:image/png;base64,')) {
      return { dataUrl: l.dataUrl, larghezza: Number(l.larghezza) || 0, altezza: Number(l.altezza) || 0 };
    }
  } catch { /* valore storico non JSON: nessun logo */ }
  return null;
}

/** Vista dello studio restituita al client: stato commerciale e logo inclusi. */
function vistaStudio(t: any) {
  if (!t) return t;
  return {
    id: t.id,
    denominazione: t.denominazione,
    piano: t.piano,
    ruleset_default: t.ruleset_default,
    ...(t.parametri !== undefined ? { parametri: t.parametri } : {}),
    stato: statoValido(t.stato),
    logo: logoStudio(t.logo_url)?.dataUrl ?? null,
  };
}

/** Vista dell'utente restituita al client: mai hash o campi interni. */
function utentePubblico(u: any) {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    ruolo: u.ruolo,
    avatar: u.avatar ?? null,
    cambioPasswordRichiesto: Boolean(u.cambio_password_richiesto),
  };
}

api.get('/auth/io', async (c) => {
  const u = c.get('utente');
  const tenant = await c.env.DB.prepare('SELECT id, denominazione, piano, ruleset_default, parametri, stato, logo_url FROM tenants WHERE id = ?')
    .bind(u.tenant_id)
    .first<any>();
  return c.json({ utente: utentePubblico(u), studio: vistaStudio(tenant) });
});

// ---------------------------------------------------------------------------
// Cambio password (self-service) e foto profilo
// ---------------------------------------------------------------------------

api.post('/auth/cambia-password', async (c) => {
  const u = c.get('utente');
  const b = await c.req.json<any>().catch(() => ({}));
  const attuale = String(b.attuale ?? '');
  const nuova = String(b.nuova ?? '');
  if (nuova.length < 8) return c.json({ errore: 'La nuova password deve avere almeno 8 caratteri' }, 400);

  const riga = await c.env.DB.prepare('SELECT password_hash FROM utenti WHERE id = ?').bind(u.id).first<any>();
  if (!riga || !(await verificaPassword(attuale, riga.password_hash))) {
    return c.json({ errore: 'La password attuale non è corretta' }, 401);
  }
  await c.env.DB.prepare('UPDATE utenti SET password_hash = ?, cambio_password_richiesto = 0 WHERE id = ?')
    .bind(await hashPassword(nuova), u.id)
    .run();

  // Chi cambia password spesso teme che qualcuno la conosca: le sessioni
  // aperte ALTROVE vanno chiuse; quella corrente resta valida.
  const token = getCookie(c, 'antiriciclaggio_sess');
  const idCorrente = token ? await sha256Hex(token) : '';
  const revocate = await c.env.DB.prepare('DELETE FROM sessioni WHERE utente_id = ? AND id <> ?')
    .bind(u.id, idCorrente)
    .run();
  await scriviAudit(c.env.DB, {
    tenantId: u.tenant_id, utenteId: u.id, azione: 'CAMBIA_PASSWORD',
    dettaglio: { altreSessioniChiuse: revocate.meta.changes ?? 0 }, ip: c.get('ip'),
  });
  return c.json({ ok: true, altreSessioniChiuse: revocate.meta.changes ?? 0 });
});

api.post('/auth/avatar', async (c) => {
  const u = c.get('utente');
  const b = await c.req.json<any>().catch(() => ({}));
  const avatar = b.avatar === null ? null : String(b.avatar ?? '');
  if (avatar !== null) {
    if (!avatar.startsWith('data:image/jpeg;base64,') || avatar.length > 80_000) {
      return c.json({ errore: 'Immagine non valida' }, 400);
    }
  }
  await c.env.DB.prepare('UPDATE utenti SET avatar = ? WHERE id = ?').bind(avatar, u.id).run();
  await scriviAudit(c.env.DB, { tenantId: u.tenant_id, utenteId: u.id, azione: avatar ? 'AGGIORNA_AVATAR' : 'RIMUOVI_AVATAR', ip: c.get('ip') });
  return c.json({ ok: true });
});

// ===========================================================================
// GESTIONE UTENTI DELLO STUDIO — solo TITOLARE
//
// Regole di sicurezza (stesse di Assist):
// - la password iniziale è generata dal server, mostrata al titolare UNA
//   SOLA volta e mai salvata in chiaro né scritta nell'audit;
// - gli utenti creati (e quelli resettati) devono cambiare password al
//   primo accesso;
// - il titolare non può disattivare o degradare se stesso se è l'ultimo
//   titolare attivo dello studio (l'art. 38 vuole sempre qualcuno che
//   possa accedere alle SOS);
// - disattivazione e reset amministrativo revocano le sessioni aperte.
// ===========================================================================

const RUOLI_VALIDI = ['TITOLARE', 'COLLABORATORE', 'LETTORE', 'REVISORE'];

async function altriTitolariAttivi(db: D1Database, tenantId: string, escludiId: string): Promise<number> {
  const r = await db.prepare(
    "SELECT COUNT(*) AS n FROM utenti WHERE tenant_id = ? AND ruolo = 'TITOLARE' AND attivo = 1 AND id <> ?",
  ).bind(tenantId, escludiId).first<{ n: number }>();
  return r?.n ?? 0;
}

api.get('/utenti', soloTitolare, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, email, nome, ruolo, attivo, cambio_password_richiesto, ultimo_accesso, creato_il
     FROM utenti WHERE tenant_id = ?
     ORDER BY attivo DESC, ruolo = 'TITOLARE' DESC, nome COLLATE NOCASE`,
  ).bind(c.get('tenantId')).all<any>();
  return c.json((results ?? []).map((u) => ({
    id: u.id, email: u.email, nome: u.nome, ruolo: u.ruolo,
    attivo: Boolean(u.attivo), cambioPasswordRichiesto: Boolean(u.cambio_password_richiesto),
    ultimoAccesso: u.ultimo_accesso, creatoIl: u.creato_il,
  })));
});

api.post('/utenti', soloTitolare, async (c) => {
  const tenantId = c.get('tenantId');
  const autore = c.get('utente');
  const b = await c.req.json<any>().catch(() => ({}));
  const email = String(b.email ?? '').toLowerCase().trim();
  const nome = String(b.nome ?? '').trim();
  const ruolo = String(b.ruolo ?? '');
  if (!email.includes('@')) return c.json({ errore: 'Email non valida' }, 400);
  if (!nome) return c.json({ errore: 'Il nome è obbligatorio' }, 400);
  if (!RUOLI_VALIDI.includes(ruolo)) return c.json({ errore: 'Ruolo non valido' }, 400);

  const esiste = await c.env.DB.prepare('SELECT id FROM utenti WHERE email = ?').bind(email).first();
  if (esiste) return c.json({ errore: 'Esiste già un utente con questa email' }, 409);

  const passwordTemporanea = generaPasswordTemporanea();
  const id = nuovoId('usr');
  await c.env.DB.prepare(
    `INSERT INTO utenti (id, tenant_id, email, nome, password_hash, ruolo, cambio_password_richiesto)
     VALUES (?,?,?,?,?,?,1)`,
  ).bind(id, tenantId, email, nome, await hashPassword(passwordTemporanea), ruolo).run();

  await scriviAudit(c.env.DB, { tenantId, utenteId: autore.id, azione: 'CREA_UTENTE', entita: 'utenti', entitaId: id, dettaglio: { email, nome, ruolo }, ip: c.get('ip') });

  const studio = await c.env.DB.prepare('SELECT denominazione FROM tenants WHERE id = ?').bind(tenantId).first<any>();
  // Attesa inline: la risposta dice al titolare se la mail è partita davvero;
  // se non parte, l'utente esiste comunque e la password va comunicata a voce.
  const emailInviata = await inviaEmailBenvenuto(c.env, {
    destinatario: email, nome, passwordTemporanea, studio: studio?.denominazione ?? 'il tuo studio',
  });

  // passwordTemporanea compare nella risposta UNA SOLA VOLTA: non è salvata
  // in chiaro da nessuna parte e non è recuperabile in seguito.
  return c.json({ id, passwordTemporanea, emailInviata }, 201);
});

api.post('/utenti/:id', soloTitolare, async (c) => {
  const tenantId = c.get('tenantId');
  const autore = c.get('utente');
  const id = c.req.param('id');
  const b = await c.req.json<any>().catch(() => ({}));

  const target = await c.env.DB.prepare('SELECT * FROM utenti WHERE id = ? AND tenant_id = ?').bind(id, tenantId).first<any>();
  if (!target) return c.json({ errore: 'Utente non trovato' }, 404);

  const nuovoNome = b.nome !== undefined ? String(b.nome).trim() : target.nome;
  const nuovoRuolo = b.ruolo !== undefined ? String(b.ruolo) : target.ruolo;
  const nuovoAttivo = b.attivo !== undefined ? Boolean(b.attivo) : Boolean(target.attivo);
  if (!nuovoNome) return c.json({ errore: 'Il nome è obbligatorio' }, 400);
  if (!RUOLI_VALIDI.includes(nuovoRuolo)) return c.json({ errore: 'Ruolo non valido' }, 400);

  // Lo studio non può restare senza un titolare attivo: le SOS (art. 38)
  // sarebbero inaccessibili a chiunque.
  const perdeTitolare = target.ruolo === 'TITOLARE' && (nuovoRuolo !== 'TITOLARE' || !nuovoAttivo);
  if (perdeTitolare && (await altriTitolariAttivi(c.env.DB, tenantId, target.id)) === 0) {
    return c.json({ errore: 'Lo studio deve avere sempre almeno un titolare attivo' }, 409);
  }

  await c.env.DB.prepare('UPDATE utenti SET nome = ?, ruolo = ?, attivo = ? WHERE id = ?')
    .bind(nuovoNome, nuovoRuolo, nuovoAttivo ? 1 : 0, id)
    .run();
  if (!nuovoAttivo) {
    await c.env.DB.prepare('DELETE FROM sessioni WHERE utente_id = ?').bind(id).run();
  }
  await scriviAudit(c.env.DB, {
    tenantId, utenteId: autore.id, azione: 'MODIFICA_UTENTE', entita: 'utenti', entitaId: id,
    dettaglio: { ruolo: nuovoRuolo, attivo: nuovoAttivo }, ip: c.get('ip'),
  });
  return c.json({ ok: true });
});

api.post('/utenti/:id/reset-password', soloTitolare, async (c) => {
  const tenantId = c.get('tenantId');
  const autore = c.get('utente');
  const id = c.req.param('id');
  const target = await c.env.DB.prepare('SELECT * FROM utenti WHERE id = ? AND tenant_id = ? AND attivo = 1').bind(id, tenantId).first<any>();
  if (!target) return c.json({ errore: 'Utente non trovato' }, 404);

  const passwordTemporanea = generaPasswordTemporanea();
  await c.env.DB.prepare('UPDATE utenti SET password_hash = ?, cambio_password_richiesto = 1 WHERE id = ?')
    .bind(await hashPassword(passwordTemporanea), id)
    .run();
  await c.env.DB.prepare('DELETE FROM sessioni WHERE utente_id = ?').bind(id).run();
  await scriviAudit(c.env.DB, { tenantId, utenteId: autore.id, azione: 'RESET_PASSWORD_UTENTE', entita: 'utenti', entitaId: id, ip: c.get('ip') });

  const studio = await c.env.DB.prepare('SELECT denominazione FROM tenants WHERE id = ?').bind(tenantId).first<any>();
  const emailInviata = await inviaEmailBenvenuto(c.env, {
    destinatario: target.email, nome: target.nome, passwordTemporanea, studio: studio?.denominazione ?? 'il tuo studio',
  });
  return c.json({ passwordTemporanea, emailInviata });
});

// ===========================================================================
// LOGO DELLO STUDIO (AR-M6) — solo TITOLARE
// Un PNG piccolo, ridimensionato dal client, custodito in tenants.logo_url
// come JSON {dataUrl, larghezza, altezza}: compare nella barra laterale e
// nell'intestazione dei verbali, accanto al logo Contify.
// ===========================================================================

api.post('/studio/logo', soloTitolare, async (c) => {
  const u = c.get('utente');
  const b = await c.req.json<any>().catch(() => ({}));

  if (b.logo === null) {
    await c.env.DB.prepare('UPDATE tenants SET logo_url = NULL WHERE id = ?').bind(u.tenant_id).run();
    await scriviAudit(c.env.DB, { tenantId: u.tenant_id, utenteId: u.id, azione: 'RIMUOVI_LOGO_STUDIO', ip: c.get('ip') });
    return c.json({ ok: true, logo: null });
  }

  const dataUrl = String(b.logo ?? '');
  const larghezza = Math.round(Number(b.larghezza) || 0);
  const altezza = Math.round(Number(b.altezza) || 0);
  if (!dataUrl.startsWith('data:image/png;base64,') || dataUrl.length > 160_000) {
    return c.json({ errore: 'Immagine non valida: serve un PNG (max ~120 KB dopo il ridimensionamento)' }, 400);
  }
  if (larghezza < 1 || altezza < 1 || larghezza > 900 || altezza > 300) {
    return c.json({ errore: 'Dimensioni del logo non valide' }, 400);
  }

  await c.env.DB.prepare('UPDATE tenants SET logo_url = ? WHERE id = ?')
    .bind(JSON.stringify({ dataUrl, larghezza, altezza }), u.tenant_id)
    .run();
  await scriviAudit(c.env.DB, { tenantId: u.tenant_id, utenteId: u.id, azione: 'AGGIORNA_LOGO_STUDIO', dettaglio: { larghezza, altezza }, ip: c.get('ip') });
  return c.json({ ok: true, logo: dataUrl });
});

// ===========================================================================
// BACKUP, RIPRISTINO ED ELIMINAZIONE DELL'ARCHIVIO — solo TITOLARE
//
// Ogni notte il cron fotografa l'archivio dello studio su R2 (bucket EU,
// retention 30 giornalieri + 12 mensili). Qui il titolare può:
// - vedere e scaricare le fotografie del SUO studio (mai di altri);
// - farne una adesso;
// - ripristinarne una (con backup pre-ripristino obbligatorio);
// - eliminare l'archivio (con backup pre-eliminazione obbligatorio).
// Le parole di conferma RIPRISTINA / ELIMINA sono verificate anche QUI:
// i tre passaggi della UI non proteggono da una chiamata API diretta.
// ===========================================================================

api.post('/backup', soloTitolare, async (c) => {
  const r = await runBackupTenant(c.env, c.get('tenantId'), 'manuale', c.get('utente').id);
  return c.json(r, 201);
});

api.get('/backup', soloTitolare, async (c) => {
  const tenantId = c.get('tenantId');
  const backups: Array<{ key: string; tipo: TipoBackupTenant; bytes: number; caricatoIl: string; righe: number | null; trigger: string | null }> = [];
  for (const tipo of ['daily', 'monthly', 'pre-ripristino', 'pre-eliminazione'] as const) {
    let cursor: string | undefined;
    do {
      // `include` esiste ma manca dai tipi di questa versione di workers-types.
      const page: R2Objects = await c.env.BACKUPS.list({ prefix: prefissoTenant(tenantId, tipo), cursor, include: ['customMetadata'] } as R2ListOptions);
      for (const o of page.objects) {
        backups.push({
          key: o.key,
          tipo,
          bytes: o.size,
          caricatoIl: o.uploaded.toISOString(),
          righe: o.customMetadata?.righe ? Number(o.customMetadata.righe) : null,
          trigger: o.customMetadata?.trigger ?? null,
        });
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
  backups.sort((a, b) => b.caricatoIl.localeCompare(a.caricatoIl));
  return c.json({ backups });
});

api.get('/backup/scarica', soloTitolare, async (c) => {
  const tenantId = c.get('tenantId');
  const key = c.req.query('key') ?? '';
  if (!chiaveDelTenant(tenantId, key)) return c.json({ errore: 'Chiave di backup non valida' }, 400);
  const obj = await c.env.BACKUPS.get(key);
  if (!obj) return c.json({ errore: 'Backup non trovato' }, 404);
  await scriviAudit(c.env.DB, { tenantId, utenteId: c.get('utente').id, azione: 'SCARICA_BACKUP', entita: 'sistema', entitaId: key, ip: c.get('ip') });
  return new Response(obj.body, {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Length': String(obj.size),
      'Content-Disposition': `attachment; filename="${key.split('/').pop()}"`,
    },
  });
});

api.post('/backup/ripristina', soloTitolare, async (c) => {
  const b = await c.req.json<any>().catch(() => ({}));
  if (String(b.conferma ?? '') !== 'RIPRISTINA') {
    return c.json({ errore: 'Conferma non valida: per procedere scrivi RIPRISTINA' }, 400);
  }
  try {
    const r = await eseguiRipristino(c.env, c.get('tenantId'), c.get('utente').id, String(b.key ?? ''));
    return c.json(r);
  } catch (e) {
    if (e instanceof RipristinoError) return c.json({ errore: e.message }, e.status as 400);
    console.error('RIPRISTINO FALLITO:', e);
    return c.json({
      errore: 'Ripristino non riuscito. La fotografia pre-ripristino (se creata) è nella lista con tipo «pre-ripristino»; contatta l\'assistenza.',
    }, 500);
  }
});

api.post('/backup/elimina-archivio', soloTitolare, async (c) => {
  const b = await c.req.json<any>().catch(() => ({}));
  if (String(b.conferma ?? '') !== 'ELIMINA') {
    return c.json({ errore: 'Conferma non valida: per procedere scrivi ELIMINA' }, 400);
  }
  try {
    const r = await eseguiEliminaArchivio(c.env, c.get('tenantId'), c.get('utente').id);
    return c.json(r);
  } catch (e) {
    console.error('ELIMINAZIONE ARCHIVIO FALLITA:', e);
    return c.json({ errore: 'Eliminazione non riuscita: l\'archivio non è stato toccato. Riprova o contatta l\'assistenza.' }, 500);
  }
});

// ===========================================================================
// COMPILAZIONE ANAGRAFICA DA PARTITA IVA (AR-M7, dal VIES)
// GET, ma riservata a chi può scrivere: a un profilo di sola lettura la
// ricerca non serve e consumerebbe soltanto il tetto orario.
// ===========================================================================

api.get('/lookup/piva/:piva', puoScrivere, async (c) => {
  const u = c.get('utente');
  if (await limiteSuperato(c.env.DB, u.tenant_id)) {
    return c.json({ esito: 'limite_raggiunto', fonte: null, affidabilita: null, dati: {}, avvisi: [] });
  }
  const risposta = await cercaAnagrafica(c.env, c.req.param('piva') ?? '');
  // Tracciata sempre: alimenta il registro ed è il contatore del tetto orario.
  await scriviAudit(c.env.DB, {
    tenantId: u.tenant_id, utenteId: u.id, azione: 'LOOKUP_ANAGRAFICA', entita: 'clienti',
    dettaglio: { esito: risposta.esito, fonte: risposta.fonte }, ip: c.get('ip'),
  });
  return c.json(risposta);
});

// ===========================================================================
// CONTROLLI AUTOMATICI (AR-M7): screening sanzioni + paesi ad alto rischio
// ===========================================================================

/** Clienti in paesi oggi ad alto rischio senza una valutazione firmata dopo l'entrata in lista. */
async function clientiPaesiDaRivalutare(db: D1Database, tenantId: string) {
  const { results } = await db.prepare(
    `SELECT c.id, c.denominazione, c.paese_residenza, MAX(v.firmata_il) AS ultima_firma
     FROM clienti c
     LEFT JOIN fascicoli f ON f.cliente_id = c.id AND f.stato != 'CESSATO'
     LEFT JOIN valutazioni_rischio v ON v.fascicolo_id = f.id AND v.firmata_il IS NOT NULL
     WHERE c.tenant_id = ? AND c.attivo = 1
     GROUP BY c.id`,
  ).bind(tenantId).all<any>();

  const adesso = oggi();
  return (results ?? []).flatMap((c) => {
    const esito = paeseAltoRischio(c.paese_residenza, adesso);
    if (!esito.altoRischio) return [];
    const daRivalutare = !c.ultima_firma || c.ultima_firma.slice(0, 10) < esito.vigenteDal!;
    return daRivalutare
      ? [{ clienteId: c.id, denominazione: c.denominazione, paese: esito.nomePaese, fonte: esito.fonte, vigenteDal: esito.vigenteDal, ultimaValutazione: c.ultima_firma }]
      : [];
  });
}

/** Stato dell'accreditamento biennale al registro dei titolari effettivi (AR-M8). */
async function statoRegistroTe(db: D1Database, tenantId: string) {
  const t = await db.prepare('SELECT parametri FROM tenants WHERE id = ?').bind(tenantId).first<any>();
  let parametri: any = {};
  try { parametri = JSON.parse(t?.parametri ?? '{}'); } catch { /* parametri illeggibili */ }
  const reg = parametri.registroTe;
  if (!reg?.scadeIl) return { accreditato: false, accreditatoIl: null, scadeIl: null, giorniResidui: null };
  return { accreditato: true, accreditatoIl: reg.accreditatoIl, scadeIl: reg.scadeIl, giorniResidui: giorniAllaScadenza(reg.scadeIl) };
}

api.get('/screening', async (c) => {
  const tenantId = c.get('tenantId');
  const [esiti, corsa, liste] = await Promise.all([
    c.env.DB.prepare(
      `SELECT e.*, u.nome AS deciso_da_nome FROM screening_esiti e
       LEFT JOIN utenti u ON u.id = e.deciso_da
       WHERE e.tenant_id = ? ORDER BY e.stato = 'DA_ESAMINARE' DESC, e.creato_il DESC LIMIT 200`,
    ).bind(tenantId).all<any>(),
    c.env.DB.prepare('SELECT * FROM screening_corse WHERE tenant_id = ? ORDER BY id DESC LIMIT 1').bind(tenantId).first<any>(),
    caricaListe(c.env),
  ]);
  return c.json({
    esiti: esiti.results ?? [],
    ultimaCorsa: corsa ?? null,
    liste: liste ? { aggiornatoIl: liste.aggiornatoIl, fonti: liste.fonti, voci: liste.voci.length } : null,
    paesiDaRivalutare: await clientiPaesiDaRivalutare(c.env.DB, tenantId),
    registroTe: await statoRegistroTe(c.env.DB, tenantId),
  });
});

api.post('/screening/esegui', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  if (await listeDaAggiornare(c.env)) await aggiornaListeSanzioni(c.env);
  const liste = await caricaListe(c.env);
  if (!liste || !liste.voci.length) {
    return c.json({ errore: 'Liste sanzioni non ancora disponibili: riprova tra qualche minuto.' }, 503);
  }
  const r = await eseguiScreeningTenant(c.env, tenantId, liste);
  await scriviAudit(c.env.DB, {
    tenantId, utenteId: c.get('utente').id, azione: 'SCREENING_MANUALE',
    dettaglio: { soggetti: r.soggetti, nuoveCorrispondenze: r.nuoveCorrispondenze }, ip: c.get('ip'),
  });
  return c.json(r);
});

api.post('/screening/:id', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const b = await c.req.json<any>().catch(() => ({}));
  const stato = String(b.stato ?? '');
  const nota = String(b.nota ?? '').trim();
  if (!['ESCLUSO', 'CONFERMATO', 'DA_ESAMINARE'].includes(stato)) {
    return c.json({ errore: 'Stato non valido' }, 400);
  }
  // La decisione va motivata: "escluso" senza il perché non si difende in ispezione.
  if (stato !== 'DA_ESAMINARE' && !nota) {
    return c.json({ errore: 'Motiva la decisione: la nota è ciò che si esibisce in caso di controllo' }, 400);
  }
  const r = await c.env.DB.prepare(
    `UPDATE screening_esiti SET stato = ?, nota = ?, deciso_da = ?, deciso_il = datetime('now')
     WHERE id = ? AND tenant_id = ?`,
  ).bind(stato, nota || null, u.id, c.req.param('id'), tenantId).run();
  if (!r.meta.changes) return c.json({ errore: 'Corrispondenza non trovata' }, 404);
  await scriviAudit(c.env.DB, {
    tenantId, utenteId: u.id, azione: 'VALUTA_SCREENING', entita: 'screening_esiti',
    entitaId: c.req.param('id'), dettaglio: { stato, nota }, ip: c.get('ip'),
  });
  return c.json({ ok: true });
});

// ===========================================================================
// IMPORT CLIENTI DA CSV (AR-M7)
// Il parsing e la mappatura colonne stanno nel browser: qui arrivano
// righe già strutturate, si valida, si scartano i duplicati e si
// registra tutto. Tetto per chiamata: 500 righe.
// ===========================================================================

api.post('/clienti/import', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const b = await c.req.json<any>().catch(() => ({}));
  const righe: any[] = Array.isArray(b.righe) ? b.righe : [];
  if (!righe.length) return c.json({ errore: 'Nessuna riga da importare' }, 400);
  if (righe.length > 500) return c.json({ errore: 'Massimo 500 righe per volta' }, 400);

  const TIPI = ['PERSONA_FISICA', 'SOCIETA_CAPITALI', 'SOCIETA_PERSONE', 'ENTE_NON_PROFIT', 'TRUST', 'ALTRO'];
  const esistenti = (
    await c.env.DB.prepare('SELECT denominazione, codice_fiscale, partita_iva FROM clienti WHERE tenant_id = ?').bind(tenantId).all<any>()
  ).results ?? [];
  const giaCf = new Set(esistenti.map((e) => (e.codice_fiscale ?? '').toUpperCase()).filter(Boolean));
  const giaPiva = new Set(esistenti.map((e) => (e.partita_iva ?? '')).filter(Boolean));
  const giaNome = new Set(esistenti.map((e) => e.denominazione.trim().toLowerCase()));

  let creati = 0;
  const scartate: Array<{ riga: number; motivo: string }> = [];

  for (let i = 0; i < righe.length; i++) {
    const r = righe[i];
    const denominazione = String(r.denominazione ?? '').trim();
    const tipo = String(r.tipo ?? 'ALTRO').trim().toUpperCase();
    const cf = String(r.codiceFiscale ?? '').trim().toUpperCase() || null;
    let piva = String(r.partitaIva ?? '').trim() || null;
    if (piva) {
      const n = normalizzaPiva(piva);
      if (n.valida) piva = n.piva;   // scritta male: la si tiene com'è, si corregge poi
    }

    if (!denominazione) { scartate.push({ riga: i + 1, motivo: 'denominazione mancante' }); continue; }
    if (!TIPI.includes(tipo)) { scartate.push({ riga: i + 1, motivo: `tipo non riconosciuto: ${r.tipo}` }); continue; }
    if (cf && giaCf.has(cf)) { scartate.push({ riga: i + 1, motivo: `codice fiscale già presente (${cf})` }); continue; }
    if (piva && giaPiva.has(piva)) { scartate.push({ riga: i + 1, motivo: `partita IVA già presente (${piva})` }); continue; }
    if (!cf && !piva && giaNome.has(denominazione.toLowerCase())) {
      scartate.push({ riga: i + 1, motivo: 'denominazione già presente (senza CF/P.IVA per distinguere)' });
      continue;
    }

    await c.env.DB.prepare(
      `INSERT INTO clienti (id, tenant_id, tipo, denominazione, codice_fiscale, partita_iva,
        paese_residenza, attivita_prevalente, ateco, pep, note, creato_da)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      nuovoId('cli'), tenantId, tipo, denominazione, cf, piva,
      String(r.paeseResidenza ?? 'IT').trim().toUpperCase() || 'IT',
      String(r.attivitaPrevalente ?? '').trim() || null,
      String(r.ateco ?? '').trim() || null,
      r.pep === true || /^(s[iì]|x|1|true|y|yes)$/i.test(String(r.pep ?? '')) ? 1 : 0,
      String(r.note ?? '').trim() || null,
      u.id,
    ).run();
    if (cf) giaCf.add(cf);
    if (piva) giaPiva.add(piva);
    giaNome.add(denominazione.toLowerCase());
    creati++;
  }

  await scriviAudit(c.env.DB, {
    tenantId, utenteId: u.id, azione: 'IMPORT_CLIENTI',
    dettaglio: { righe: righe.length, creati, scartate: scartate.length }, ip: c.get('ip'),
  });
  return c.json({ creati, scartate });
});

// ===========================================================================
// ADEGUATA VERIFICA A DISTANZA (AR-M8)
//
// Lo studio genera un link monouso; il cliente fornisce dati, documento e
// dichiarazioni dalla pagina pubblica. Tutto atterra in area di transito
// (cifrato) e nel fascicolo entra SOLO ciò che il professionista esamina
// e acquisisce: l'adeguata verifica resta un giudizio suo, non un upload.
// ===========================================================================

const VERIFICA_TTL_GIORNI = 30;
const MIME_AMMESSI = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_FILE = 8 * 1024 * 1024;

api.post('/fascicoli/:id/verifica-remota', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const fascicoloId = c.req.param('id');
  const b = await c.req.json<any>().catch(() => ({}));

  const f = await c.env.DB.prepare(
    'SELECT f.id, f.codice, f.cliente_id, cl.denominazione AS cliente FROM fascicoli f JOIN clienti cl ON cl.id = f.cliente_id WHERE f.id = ? AND f.tenant_id = ?',
  ).bind(fascicoloId, tenantId).first<any>();
  if (!f) return c.json({ errore: 'Fascicolo non trovato' }, 404);

  const richieste = {
    datiIdentificativi: b.richieste?.datiIdentificativi !== false,
    documento: b.richieste?.documento !== false,
    titolari: Boolean(b.richieste?.titolari),
    pep: b.richieste?.pep !== false,
  };

  const token = nuovoToken();
  const id = nuovoId('vrf');
  const scadeIl = new Date(Date.now() + VERIFICA_TTL_GIORNI * 86_400_000).toISOString();
  const emailCliente = String(b.emailCliente ?? '').trim().toLowerCase() || null;

  await c.env.DB.prepare(
    `INSERT INTO richieste_verifica (id, tenant_id, fascicolo_id, cliente_id, token_hash, richieste, email_cliente, scade_il, creata_da)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).bind(id, tenantId, fascicoloId, f.cliente_id, await sha256Hex(token), JSON.stringify(richieste), emailCliente, scadeIl, u.id).run();

  const url = `${urlApp(c.env)}/#verifica?token=${token}`;
  let emailInviata = false;
  if (emailCliente) {
    const studio = await c.env.DB.prepare('SELECT denominazione FROM tenants WHERE id = ?').bind(tenantId).first<any>();
    emailInviata = await inviaEmailVerificaRemota(c.env, {
      destinatario: emailCliente, studio: studio?.denominazione ?? 'il tuo studio', cliente: f.cliente, url, scadeIl,
    });
  }

  await scriviAudit(c.env.DB, {
    tenantId, utenteId: u.id, azione: 'CREA_VERIFICA_REMOTA', entita: 'richieste_verifica', entitaId: id,
    dettaglio: { fascicoloId, richieste, emailInviata }, ip: c.get('ip'),
  });
  // Il token compare SOLO qui: in database ne esiste l'hash.
  return c.json({ id, url, scadeIl, emailInviata }, 201);
});

api.get('/fascicoli/:id/verifiche-remote', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, stato, richieste, email_cliente, scade_il, completata_il, acquisita_il, creato_il
     FROM richieste_verifica WHERE fascicolo_id = ? AND tenant_id = ? ORDER BY creato_il DESC`,
  ).bind(c.req.param('id'), c.get('tenantId')).all<any>();
  return c.json(results ?? []);
});

api.get('/verifiche-remote/:id', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const r = await c.env.DB.prepare('SELECT * FROM richieste_verifica WHERE id = ? AND tenant_id = ?')
    .bind(c.req.param('id'), tenantId).first<any>();
  if (!r) return c.json({ errore: 'Richiesta non trovata' }, 404);

  let dati: any = null;
  if (r.dati_cifrati && r.iv) {
    try {
      dati = JSON.parse(await decifra(c.env.MASTER_KEY, tenantId, { contenuto: r.dati_cifrati, iv: r.iv }));
    } catch {
      dati = null;
    }
  }
  // La lettura dei dati forniti dal cliente è un accesso che va tracciato.
  await scriviAudit(c.env.DB, {
    tenantId, utenteId: c.get('utente').id, azione: 'LEGGI_VERIFICA_REMOTA', entita: 'richieste_verifica',
    entitaId: r.id, ip: c.get('ip'),
  });
  return c.json({
    id: r.id, stato: r.stato, richieste: JSON.parse(r.richieste), dati,
    allegati: JSON.parse(r.allegati ?? '[]').map((a: any, i: number) => ({ indice: i, nome: a.nome, mime: a.mime, dimensione: a.dimensione, sha256: a.sha256 })),
    completataIl: r.completata_il, scadeIl: r.scade_il,
  });
});

/** Anteprima di un allegato in transito (non ancora documento del fascicolo). */
api.get('/verifiche-remote/:id/allegati/:indice', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const r = await c.env.DB.prepare('SELECT * FROM richieste_verifica WHERE id = ? AND tenant_id = ?')
    .bind(c.req.param('id'), tenantId).first<any>();
  if (!r) return c.json({ errore: 'Richiesta non trovata' }, 404);
  const allegati = JSON.parse(r.allegati ?? '[]');
  const a = allegati[Number(c.req.param('indice'))];
  if (!a) return c.json({ errore: 'Allegato non trovato' }, 404);
  const obj = await c.env.DOCS.get(a.r2Key);
  if (!obj) return c.json({ errore: 'Contenuto non reperibile' }, 404);
  return new Response(obj.body, { headers: { 'Content-Type': a.mime, 'Content-Disposition': `inline; filename="${a.nome}"` } });
});

api.post('/verifiche-remote/:id/annulla', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const r = await c.env.DB.prepare(
    `UPDATE richieste_verifica SET stato = 'ANNULLATA' WHERE id = ? AND tenant_id = ? AND stato IN ('INVIATA','COMPLETATA')`,
  ).bind(c.req.param('id'), tenantId).run();
  if (!r.meta.changes) return c.json({ errore: 'Richiesta non annullabile' }, 404);
  await scriviAudit(c.env.DB, { tenantId, utenteId: c.get('utente').id, azione: 'ANNULLA_VERIFICA_REMOTA', entita: 'richieste_verifica', entitaId: c.req.param('id'), ip: c.get('ip') });
  return c.json({ ok: true });
});

api.post('/verifiche-remote/:id/acquisisci', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const b = await c.req.json<any>().catch(() => ({}));

  const r = await c.env.DB.prepare("SELECT * FROM richieste_verifica WHERE id = ? AND tenant_id = ? AND stato = 'COMPLETATA'")
    .bind(c.req.param('id'), tenantId).first<any>();
  if (!r) return c.json({ errore: 'Richiesta non trovata o non ancora completata' }, 404);

  let dati: any = {};
  try {
    dati = JSON.parse(await decifra(c.env.MASTER_KEY, tenantId, { contenuto: r.dati_cifrati, iv: r.iv }));
  } catch {
    return c.json({ errore: 'Dati della richiesta non leggibili' }, 500);
  }

  const applicato: string[] = [];

  if (b.applicaDatiIdentificativi && dati.datiIdentificativi) {
    const nuovo = await cifra(c.env.MASTER_KEY, tenantId, JSON.stringify(dati.datiIdentificativi));
    await c.env.DB.prepare('UPDATE clienti SET dati_identificativi = ? WHERE id = ? AND tenant_id = ?')
      .bind(JSON.stringify(nuovo), r.cliente_id, tenantId).run();
    const cf = String(dati.datiIdentificativi.codiceFiscale ?? '').trim().toUpperCase();
    if (cf) {
      await c.env.DB.prepare('UPDATE clienti SET codice_fiscale = ? WHERE id = ? AND tenant_id = ? AND (codice_fiscale IS NULL OR codice_fiscale = "")')
        .bind(cf, r.cliente_id, tenantId).run();
    }
    applicato.push('dati_identificativi');
  }

  if (b.applicaPep && dati.pep) {
    await c.env.DB.prepare('UPDATE clienti SET pep = ? WHERE id = ? AND tenant_id = ?')
      .bind(dati.pep.dichiarato ? 1 : 0, r.cliente_id, tenantId).run();
    applicato.push(`pep:${dati.pep.dichiarato ? 'si' : 'no'}`);
  }

  if (b.acquisisciDocumenti) {
    const allegati = JSON.parse(r.allegati ?? '[]');
    const f = await c.env.DB.prepare('SELECT data_cessazione FROM fascicoli WHERE id = ? AND tenant_id = ?').bind(r.fascicolo_id, tenantId).first<any>();
    const conservaFinoAl = f?.data_cessazione ? aggiungiAnni(f.data_cessazione, TERMINI.CONSERVAZIONE_ANNI.valore) : null;
    for (const a of allegati) {
      await c.env.DB.prepare(
        `INSERT INTO documenti (id, tenant_id, fascicolo_id, cliente_id, tipo, nome_file, mime, dimensione, r2_key, sha256,
          data_riferimento, data_acquisizione, conserva_fino_al, creato_da)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        nuovoId('doc'), tenantId, r.fascicolo_id, r.cliente_id, 'DOCUMENTO_IDENTITA', a.nome, a.mime, a.dimensione,
        a.r2Key, a.sha256, oggi(), oggi(), conservaFinoAl, u.id,
      ).run();
    }
    applicato.push(`documenti:${allegati.length}`);
  }

  await c.env.DB.prepare(
    `UPDATE richieste_verifica SET stato = 'ACQUISITA', acquisita_da = ?, acquisita_il = datetime('now') WHERE id = ?`,
  ).bind(u.id, r.id).run();

  await scriviAudit(c.env.DB, {
    tenantId, utenteId: u.id, azione: 'ACQUISISCI_VERIFICA_REMOTA', entita: 'richieste_verifica', entitaId: r.id,
    dettaglio: { applicato }, ip: c.get('ip'),
  });
  // I titolari effettivi dichiarati NON si scrivono da soli: tornano al
  // professionista, che li valuta nel modulo della titolarità (artt. 20-22).
  return c.json({ ok: true, applicato, titolariDichiarati: dati.titolari ?? [] });
});

// ── Rotte PUBBLICHE del cliente (nessuna sessione) ─────────────

async function richiestaDaToken(env: Env, token: string) {
  if (!token || token.length < 20) return null;
  return env.DB.prepare(
    `SELECT r.*, t.denominazione AS studio, t.logo_url, t.stato AS tenant_stato, cl.denominazione AS cliente
     FROM richieste_verifica r
     JOIN tenants t ON t.id = r.tenant_id
     JOIN clienti cl ON cl.id = r.cliente_id
     WHERE r.token_hash = ?`,
  ).bind(await sha256Hex(token)).first<any>();
}

api.get('/pubblico/verifica/:token', async (c) => {
  const r = await richiestaDaToken(c.env, c.req.param('token') ?? '');
  if (!r || statoValido(r.tenant_stato) === 'cessato') return c.json({ errore: 'Collegamento non valido' }, 404);
  if (r.stato === 'ANNULLATA') return c.json({ errore: 'La richiesta è stata annullata dallo studio' }, 410);
  if (r.stato !== 'INVIATA') return c.json({ errore: 'Questa richiesta è già stata completata' }, 410);
  if (r.scade_il <= new Date().toISOString()) return c.json({ errore: 'Il collegamento è scaduto: chiedi allo studio un nuovo invito' }, 410);
  return c.json({
    studio: r.studio,
    logo: logoStudio(r.logo_url)?.dataUrl ?? null,
    cliente: r.cliente,
    richieste: JSON.parse(r.richieste),
    scadeIl: r.scade_il,
  });
});

api.post('/pubblico/verifica/:token', async (c) => {
  const r = await richiestaDaToken(c.env, c.req.param('token') ?? '');
  if (!r || statoValido(r.tenant_stato) === 'cessato') return c.json({ errore: 'Collegamento non valido' }, 404);
  if (r.stato !== 'INVIATA') return c.json({ errore: 'Questa richiesta non è più aperta' }, 410);
  if (r.scade_il <= new Date().toISOString()) return c.json({ errore: 'Il collegamento è scaduto' }, 410);

  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ errore: 'Invio non leggibile' }, 400);

  let dati: any;
  try {
    dati = JSON.parse(String(form.get('dati') ?? '{}'));
  } catch {
    return c.json({ errore: 'Dati non leggibili' }, 400);
  }
  if (dati?.dichiarazione?.accettata !== true) {
    return c.json({ errore: 'La dichiarazione di veridicità è necessaria per procedere (art. 22 DLgs. 231/2007)' }, 400);
  }
  // Tetto complessivo sui testi: nessun campo del cliente deve poter
  // gonfiare il database.
  if (JSON.stringify(dati).length > 20_000) return c.json({ errore: 'Dati troppo lunghi' }, 400);
  dati.dichiarazione.dataOra = new Date().toISOString();

  const allegati: Array<{ r2Key: string; nome: string; mime: string; dimensione: number; sha256: string }> = [];
  for (const [chiave, valore] of form.entries()) {
    if (!chiave.startsWith('documento') || typeof valore === 'string') continue;
    const file = valore as File;
    if (allegati.length >= 3) return c.json({ errore: 'Massimo 3 allegati' }, 400);
    if (!MIME_AMMESSI.has(file.type)) return c.json({ errore: 'Formato non ammesso: usa PDF, JPG o PNG' }, 400);
    if (file.size > MAX_FILE) return c.json({ errore: 'Allegato troppo grande (max 8 MB)' }, 400);
    const buf = await file.arrayBuffer();
    const nome = file.name.replace(/[^\w.\- ]/g, '_').slice(0, 120) || 'documento';
    const r2Key = `verifica/${r.tenant_id}/${r.id}/${allegati.length}-${nome}`;
    await c.env.DOCS.put(r2Key, buf, { httpMetadata: { contentType: file.type } });
    allegati.push({ r2Key, nome, mime: file.type, dimensione: buf.byteLength, sha256: await sha256Hex(buf) });
  }
  if (JSON.parse(r.richieste).documento && allegati.length === 0) {
    return c.json({ errore: 'Allega il documento d’identità richiesto' }, 400);
  }

  const cifrato = await cifra(c.env.MASTER_KEY, r.tenant_id, JSON.stringify(dati));
  await c.env.DB.prepare(
    `UPDATE richieste_verifica SET stato = 'COMPLETATA', completata_il = datetime('now'),
       dati_cifrati = ?, iv = ?, allegati = ? WHERE id = ? AND stato = 'INVIATA'`,
  ).bind(cifrato.contenuto, cifrato.iv, JSON.stringify(allegati), r.id).run();

  await scriviAudit(c.env.DB, {
    tenantId: r.tenant_id, utenteId: null, azione: 'VERIFICA_REMOTA_COMPLETATA', entita: 'richieste_verifica',
    entitaId: r.id, dettaglio: { allegati: allegati.length }, ip: c.req.header('CF-Connecting-IP') ?? null,
  });

  // Avviso a chi ha creato la richiesta (best effort).
  try {
    const [autore, fascicolo] = await Promise.all([
      c.env.DB.prepare('SELECT nome, email FROM utenti WHERE id = ?').bind(r.creata_da).first<any>(),
      c.env.DB.prepare('SELECT codice FROM fascicoli WHERE id = ?').bind(r.fascicolo_id).first<any>(),
    ]);
    if (autore) {
      await inviaEmailVerificaCompletata(c.env, {
        destinatario: autore.email, nome: autore.nome, cliente: r.cliente, fascicolo: fascicolo?.codice ?? '',
      });
    }
  } catch (e) {
    console.error('avviso verifica completata non inviato:', e);
  }

  return c.json({ ok: true });
});

// ===========================================================================
// REGISTRO DEI TITOLARI EFFETTIVI (AR-M8) — D.M. 122/2026
// ===========================================================================

/** Accreditamento biennale dello studio presso la Camera di Commercio. */
api.post('/studio/registro-accreditamento', soloTitolare, async (c) => {
  const u = c.get('utente');
  const b = await c.req.json<any>().catch(() => ({}));
  const data = String(b.data ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return c.json({ errore: 'Data non valida (AAAA-MM-GG)' }, 400);

  const t = await c.env.DB.prepare('SELECT parametri FROM tenants WHERE id = ?').bind(u.tenant_id).first<any>();
  const parametri = (() => { try { return JSON.parse(t?.parametri ?? '{}'); } catch { return {}; } })();
  parametri.registroTe = { accreditatoIl: data, scadeIl: aggiungiAnni(data, 2) };
  await c.env.DB.prepare('UPDATE tenants SET parametri = ? WHERE id = ?').bind(JSON.stringify(parametri), u.tenant_id).run();

  await scriviAudit(c.env.DB, {
    tenantId: u.tenant_id, utenteId: u.id, azione: 'ACCREDITAMENTO_REGISTRO_TE',
    dettaglio: parametri.registroTe, ip: c.get('ip'),
  });
  return c.json({ ok: true, registroTe: parametri.registroTe });
});

/**
 * Riscontro della titolarità effettiva col registro (art. 21-ter):
 * si applica a TUTTI i titolari correnti del cliente — la consultazione
 * è una, il suo esito vale per la fotografia intera.
 */
api.post('/clienti/:id/titolarita/registro', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const clienteId = c.req.param('id');
  const b = await c.req.json<any>().catch(() => ({}));
  const data = String(b.data ?? oggi()).slice(0, 10);
  const incongruenza = Boolean(b.incongruenza);
  const note = String(b.note ?? '').trim() || null;
  if (incongruenza && !note) {
    return c.json({ errore: 'Descrivi la difformità rilevata: va comunicata al gestore del registro (art. 21 co. 4)' }, 400);
  }

  const r = await c.env.DB.prepare(
    `UPDATE titolari_effettivi SET registro_consultato = 1, registro_data = ?, registro_incongruenza = ?, registro_note = ?
     WHERE cliente_id = ? AND tenant_id = ? AND valido_al IS NULL`,
  ).bind(data, incongruenza ? 1 : 0, note, clienteId, tenantId).run();
  if (!r.meta.changes) return c.json({ errore: 'Nessun titolare effettivo corrente da riscontrare' }, 404);

  await scriviAudit(c.env.DB, {
    tenantId, utenteId: u.id, azione: 'RISCONTRO_REGISTRO_TE', entita: 'clienti', entitaId: clienteId,
    dettaglio: { data, incongruenza, titolari: r.meta.changes }, ip: c.get('ip'),
  });
  return c.json({ ok: true, titolariAggiornati: r.meta.changes });
});

// ===========================================================================
// CATALOGHI NORMATIVI (sola lettura)
// ===========================================================================

api.get('/catalogo/ruleset', (c) => c.json(ruleset(c.req.query('id'))));
api.get('/catalogo/prestazioni', (c) => c.json(CATALOGO_PRESTAZIONI_2025));
api.get('/catalogo/soglie', (c) => c.json({ soglie: SOGLIE, termini: TERMINI }));
api.get('/catalogo/indicatori', (c) =>
  c.json({ indicatori: INDICATORI_UIF_2023, subIndici: SUB_INDICI_UIF_2023, avviso: AVVISO_INDICATORI }),
);

// ===========================================================================
// AUTOVALUTAZIONE DELLO STUDIO — artt. 15-16
// ===========================================================================

api.get('/studio/autovalutazioni', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM autovalutazioni WHERE tenant_id = ? ORDER BY versione DESC',
  )
    .bind(c.get('tenantId'))
    .all();
  return c.json(results ?? []);
});

api.post('/studio/autovalutazioni', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const body = await c.req.json<any>();
  const rs = ruleset(body.rulesetId);

  // Il calcolo è del dominio: la route non conosce pesi né soglie.
  const esito = calcolaAutovalutazione({ inerente: body.inerente, vulnerabilita: body.vulnerabilita }, rs);

  const ultima = await c.env.DB.prepare('SELECT MAX(versione) AS v FROM autovalutazioni WHERE tenant_id = ?')
    .bind(tenantId)
    .first<{ v: number | null }>();
  const versione = (ultima?.v ?? 0) + 1;
  const id = nuovoId('av');

  await c.env.DB.prepare(
    `INSERT INTO autovalutazioni
     (id, tenant_id, versione, ruleset_id, data_valutazione, punteggi, rischio_inerente, vulnerabilita,
      rischio_residuo, classe, formula, note, presidi, creato_da)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      id,
      tenantId,
      versione,
      rs.id,
      body.dataValutazione ?? oggi(),
      JSON.stringify({ inerente: body.inerente, vulnerabilita: body.vulnerabilita }),
      esito.rischioInerente,
      esito.vulnerabilita,
      esito.rischioResiduo,
      esito.classe,
      esito.formula,
      body.note ?? null,
      JSON.stringify(body.presidi ?? []),
      u.id,
    )
    .run();

  await scriviAudit(c.env.DB, {
    tenantId,
    utenteId: u.id,
    azione: 'CREA_AUTOVALUTAZIONE',
    entita: 'autovalutazioni',
    entitaId: id,
    dettaglio: { versione, classe: esito.classe, rischioResiduo: esito.rischioResiduo },
    ip: c.get('ip'),
  });

  return c.json({ id, versione, esito }, 201);
});

api.post('/studio/autovalutazioni/:id/firma', soloTitolare, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const id = c.req.param('id');
  const r = await c.env.DB.prepare('UPDATE autovalutazioni SET firmata_da = ?, firmata_il = ? WHERE id = ? AND tenant_id = ? AND firmata_il IS NULL')
    .bind(u.id, new Date().toISOString(), id, tenantId)
    .run();
  if (!r.meta.changes) return c.json({ errore: 'Autovalutazione inesistente o già firmata' }, 409);
  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'FIRMA_AUTOVALUTAZIONE', entita: 'autovalutazioni', entitaId: id, ip: c.get('ip') });
  return c.json({ ok: true });
});

// ===========================================================================
// CLIENTI E TITOLARITÀ EFFETTIVA
// ===========================================================================

api.get('/clienti', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.tipo, c.denominazione, c.codice_fiscale, c.partita_iva, c.paese_residenza, c.pep, c.attivo,
            (SELECT COUNT(*) FROM fascicoli f WHERE f.cliente_id = c.id) AS fascicoli
     FROM clienti c WHERE c.tenant_id = ? AND c.attivo = 1 ORDER BY c.denominazione`,
  )
    .bind(c.get('tenantId'))
    .all();
  return c.json(results ?? []);
});

api.post('/clienti', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const b = await c.req.json<any>();
  if (!b.denominazione || !b.tipo) return c.json({ errore: 'Denominazione e tipo sono obbligatori' }, 400);

  const id = nuovoId('cli');
  // I dati identificativi di dettaglio sono cifrati: sono la parte più sensibile
  // dell'anagrafica (documento, luogo e data di nascita, residenza).
  const dati = b.datiIdentificativi ? await cifra(c.env.MASTER_KEY, tenantId, JSON.stringify(b.datiIdentificativi)) : null;

  await c.env.DB.prepare(
    `INSERT INTO clienti (id, tenant_id, tipo, denominazione, codice_fiscale, partita_iva, dati_identificativi,
      paese_residenza, attivita_prevalente, ateco, pep, pep_organo_pubblico, note, creato_da)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      id, tenantId, b.tipo, b.denominazione, b.codiceFiscale ?? null, b.partitaIva ?? null,
      dati ? JSON.stringify(dati) : null, b.paeseResidenza ?? 'IT', b.attivitaPrevalente ?? null,
      b.ateco ?? null, b.pep ? 1 : 0, b.pepOrganoPubblico ? 1 : 0, b.note ?? null, u.id,
    )
    .run();

  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'CREA_CLIENTE', entita: 'clienti', entitaId: id, ip: c.get('ip') });
  return c.json({ id }, 201);
});

api.get('/clienti/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const cliente = await c.env.DB.prepare('SELECT * FROM clienti WHERE id = ? AND tenant_id = ?').bind(id, tenantId).first<any>();
  if (!cliente) return c.json({ errore: 'Cliente non trovato' }, 404);

  if (cliente.dati_identificativi) {
    try {
      cliente.dati_identificativi = JSON.parse(await decifra(c.env.MASTER_KEY, tenantId, JSON.parse(cliente.dati_identificativi)));
    } catch {
      cliente.dati_identificativi = { errore: 'Dati non decifrabili con la chiave corrente' };
    }
  }

  const { results: titolari } = await c.env.DB.prepare(
    'SELECT * FROM titolari_effettivi WHERE cliente_id = ? AND tenant_id = ? AND valido_al IS NULL',
  ).bind(id, tenantId).all();
  const { results: fascicoli } = await c.env.DB.prepare(
    'SELECT id, codice, prestazione_descrizione, data_conferimento, stato FROM fascicoli WHERE cliente_id = ? AND tenant_id = ?',
  ).bind(id, tenantId).all();

  await scriviAudit(c.env.DB, { tenantId, utenteId: c.get('utente').id, azione: 'LEGGI_CLIENTE', entita: 'clienti', entitaId: id, ip: c.get('ip') });
  return c.json({ cliente, titolariEffettivi: titolari ?? [], fascicoli: fascicoli ?? [] });
});

/**
 * Analisi della titolarità effettiva a partire dalla catena partecipativa.
 * Non salva: propone. La decisione resta del professionista, che conferma con
 * la chiamata successiva registrando la motivazione (art. 20 co. 6).
 */
api.post('/clienti/:id/titolarita/analizza', puoScrivere, async (c) => {
  const b = await c.req.json<any>();
  const esito = analizzaTitolaritaEffettiva(b.idCliente ?? c.req.param('id'), b.nodi ?? [], b.opzioni ?? {});
  return c.json(esito);
});

api.post('/clienti/:id/titolarita', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const clienteId = c.req.param('id');
  const b = await c.req.json<any>();
  if (!Array.isArray(b.titolari) || b.titolari.length === 0) {
    return c.json({ errore: 'Indicare almeno un titolare effettivo, oppure documentare l’impossibilità e valutare l’astensione ex art. 42.' }, 400);
  }

  const adesso = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [
    // La titolarità effettiva è storicizzata: la precedente si chiude, non si
    // sovrascrive (art. 32 co. 2 lett. d, mantenimento della storicità).
    c.env.DB.prepare('UPDATE titolari_effettivi SET valido_al = ? WHERE cliente_id = ? AND tenant_id = ? AND valido_al IS NULL')
      .bind(oggi(), clienteId, tenantId),
  ];

  for (const t of b.titolari) {
    if (t.criterio === 'RESIDUALE_POTERI' && !t.motivazione) {
      return c.json({ errore: 'Il criterio residuale dell’art. 20 co. 5 richiede la motivazione scritta prevista dall’art. 20 co. 6.' }, 400);
    }
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO titolari_effettivi (id, tenant_id, cliente_id, nominativo, codice_fiscale, criterio, norma, quota,
          percorsi, motivazione, pep, registro_consultato, registro_data, registro_incongruenza, registro_note, valido_dal, creato_da)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        nuovoId('te'), tenantId, clienteId, t.nominativo, t.codiceFiscale ?? null, t.criterio, t.norma,
        t.quota ?? null, JSON.stringify(t.percorsi ?? []), t.motivazione ?? '', t.pep ? 1 : 0,
        b.registroConsultato ? 1 : 0, b.registroData ?? null, b.registroIncongruenza ? 1 : 0, b.registroNote ?? null,
        oggi(), u.id,
      ),
    );
  }

  await c.env.DB.batch(stmts);
  await scriviAudit(c.env.DB, {
    tenantId, utenteId: u.id, azione: 'AGGIORNA_TITOLARITA', entita: 'clienti', entitaId: clienteId,
    dettaglio: { numeroTitolari: b.titolari.length, adesso }, ip: c.get('ip'),
  });
  return c.json({ ok: true });
});

// ===========================================================================
// FASCICOLI E VALUTAZIONE DEL RISCHIO — artt. 17-25
// ===========================================================================

api.get('/fascicoli', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT f.*, cl.denominazione AS cliente,
            v.classe, v.livello_applicabile, v.rischio_effettivo, v.firmata_il AS valutazione_firmata,
            v.controllo_costante_mesi, v.astensione_dovuta
     FROM fascicoli f
     JOIN clienti cl ON cl.id = f.cliente_id
     LEFT JOIN valutazioni_rischio v ON v.id = (
       SELECT id FROM valutazioni_rischio WHERE fascicolo_id = f.id ORDER BY versione DESC LIMIT 1)
     WHERE f.tenant_id = ? ORDER BY f.data_conferimento DESC`,
  )
    .bind(c.get('tenantId'))
    .all();
  return c.json(results ?? []);
});

api.post('/fascicoli', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const b = await c.req.json<any>();
  const prestazione = prestazioneObbligatoria(b.prestazioneCodice);

  const anno = (b.dataConferimento ?? oggi()).slice(0, 4);
  const conteggio = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM fascicoli WHERE tenant_id = ? AND codice LIKE ?",
  ).bind(tenantId, `${anno}/%`).first<{ n: number }>();
  const codice = `${anno}/${String((conteggio?.n ?? 0) + 1).padStart(4, '0')}`;

  const id = nuovoId('fas');
  await c.env.DB.prepare(
    `INSERT INTO fascicoli (id, tenant_id, cliente_id, codice, prestazione_codice, prestazione_descrizione,
      tipo_rapporto, importo_operazione, data_conferimento, scopo_natura, esecutore, modalita_identificazione, creato_da)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      id, tenantId, b.clienteId, codice, prestazione.codice, prestazione.descrizione,
      b.tipoRapporto ?? 'CONTINUATIVO', b.importoOperazione ?? null, b.dataConferimento ?? oggi(),
      b.scopoNatura ?? null, b.esecutore ? JSON.stringify(b.esecutore) : null, b.modalitaIdentificazione ?? null, u.id,
    )
    .run();

  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'CREA_FASCICOLO', entita: 'fascicoli', entitaId: id, dettaglio: { codice }, ip: c.get('ip') });

  // Art. 17 co. 1 lett. b): l'operazione occasionale sopra soglia fa scattare
  // l'obbligo di verifica anche in assenza di rapporto continuativo.
  const avvisi: string[] = [];
  if (b.tipoRapporto === 'OCCASIONALE' && typeof b.importoOperazione === 'number') {
    const s = SOGLIE.find((x) => x.codice === 'OPERAZIONE_OCCASIONALE')!;
    const soglia = s.serie[s.serie.length - 1].valore;
    if (b.importoOperazione >= soglia) {
      avvisi.push(`Operazione occasionale di importo pari o superiore a ${soglia} euro: adeguata verifica obbligatoria ai sensi dell’art. 17 co. 1 lett. b).`);
    }
  }
  if (prestazione.esenteAdeguataVerifica) {
    avvisi.push('Prestazione esente da adeguata verifica ex art. 17 co. 7. L’esenzione riguarda questa sola prestazione: per altre prestazioni allo stesso cliente la verifica è dovuta.');
  }

  return c.json({ id, codice, prestazione, avvisi }, 201);
});

api.get('/fascicoli/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const f = await c.env.DB.prepare(
    'SELECT f.*, cl.denominazione AS cliente, cl.pep, cl.paese_residenza FROM fascicoli f JOIN clienti cl ON cl.id = f.cliente_id WHERE f.id = ? AND f.tenant_id = ?',
  ).bind(id, tenantId).first<any>();
  if (!f) return c.json({ errore: 'Fascicolo non trovato' }, 404);

  const { results: valutazioni } = await c.env.DB.prepare(
    'SELECT * FROM valutazioni_rischio WHERE fascicolo_id = ? ORDER BY versione DESC',
  ).bind(id).all<any>();
  const { results: documenti } = await c.env.DB.prepare(
    'SELECT id, tipo, nome_file, dimensione, sha256, data_riferimento, data_acquisizione, conserva_fino_al FROM documenti WHERE fascicolo_id = ? AND tenant_id = ?',
  ).bind(id, tenantId).all();
  const { results: operazioni } = await c.env.DB.prepare(
    'SELECT * FROM operazioni WHERE fascicolo_id = ? AND tenant_id = ? ORDER BY data_operazione DESC',
  ).bind(id, tenantId).all();

  const ultima = valutazioni?.[0];
  // L'esenzione dell'art. 17 co. 7 discende dalla prestazione, non dalla
  // valutazione: va riconosciuta anche su un fascicolo non ancora valutato,
  // altrimenti lo scadenzario espone termini di verifica che non sono dovuti.
  const esente = ultima ? Boolean(ultima.esente_verifica) : Boolean(trovaPrestazione(f.prestazione_codice)?.esenteAdeguataVerifica);
  const scadenze = calcolaScadenzeFascicolo({
    dataConferimentoIncarico: f.data_conferimento,
    dataCessazione: f.data_cessazione,
    classeRischio: ultima?.classe ?? 'POCO_SIGNIFICATIVO',
    controlloCostanteMesi: ultima?.controllo_costante_mesi ?? 0,
    ultimoControllo: f.ultimo_controllo,
    esenteAdeguataVerifica: esente,
  });

  return c.json({
    fascicolo: f,
    valutazioni: valutazioni ?? [],
    documenti: documenti ?? [],
    operazioni: operazioni ?? [],
    scadenze: statoScadenze(scadenze, oggi()),
  });
});

/** Calcolo senza persistenza: serve alla UI per mostrare l'esito in tempo reale. */
api.post('/strumenti/simula-rischio', async (c) => {
  const b = await c.req.json<any>();
  const prestazione = prestazioneObbligatoria(b.prestazioneCodice);
  const esito = calcolaProfiloCliente(
    { prestazione, tabellaA: b.tabellaA, tabellaB: b.tabellaB, circostanze: b.circostanze },
    ruleset(b.rulesetId),
  );
  return c.json(esito);
});

api.post('/fascicoli/:id/valutazioni', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const fascicoloId = c.req.param('id');
  const b = await c.req.json<any>();

  const f = await c.env.DB.prepare('SELECT * FROM fascicoli WHERE id = ? AND tenant_id = ?').bind(fascicoloId, tenantId).first<any>();
  if (!f) return c.json({ errore: 'Fascicolo non trovato' }, 404);

  const prestazione = prestazioneObbligatoria(f.prestazione_codice);
  const rs = ruleset(b.rulesetId ?? null);
  const esito = calcolaProfiloCliente(
    { prestazione, tabellaA: b.tabellaA, tabellaB: b.tabellaB, circostanze: b.circostanze ?? {} },
    rs,
  );

  const ultima = await c.env.DB.prepare('SELECT MAX(versione) AS v FROM valutazioni_rischio WHERE fascicolo_id = ?')
    .bind(fascicoloId).first<{ v: number | null }>();
  const versione = (ultima?.v ?? 0) + 1;
  const id = nuovoId('val');

  await c.env.DB.prepare(
    `INSERT INTO valutazioni_rischio (id, tenant_id, fascicolo_id, versione, ruleset_id, data_valutazione,
      tabella_a, tabella_b, circostanze, esente_verifica, rischio_inerente, rischio_specifico, rischio_effettivo,
      classe, livello_calcolato, livello_applicabile, livello_innalzato, vincoli, astensione_dovuta, valutare_sos,
      controllo_costante_mesi, formula, motivazione, creato_da)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      id, tenantId, fascicoloId, versione, rs.id, b.dataValutazione ?? oggi(),
      JSON.stringify(b.tabellaA ?? {}), b.tabellaB ? JSON.stringify(b.tabellaB) : null,
      JSON.stringify(b.circostanze ?? {}), esito.esenteAdeguataVerifica ? 1 : 0,
      esito.rischioInerente, esito.rischioSpecifico, esito.rischioEffettivo, esito.classe,
      esito.livelloCalcolato, esito.livelloApplicabile, esito.livelloInnalzatoDaNorma ? 1 : 0,
      JSON.stringify(esito.vincoli), esito.astensioneDovuta ? 1 : 0, esito.valutareSos ? 1 : 0,
      esito.controlloCostanteMesi, esito.formula, b.motivazione ?? null, u.id,
    )
    .run();

  const nuovoStato = esito.astensioneDovuta ? 'ASTENSIONE' : 'IN_VERIFICA';
  await c.env.DB.prepare('UPDATE fascicoli SET stato = ?, aggiornato_il = ? WHERE id = ?')
    .bind(nuovoStato, new Date().toISOString(), fascicoloId).run();

  await scriviAudit(c.env.DB, {
    tenantId, utenteId: u.id, azione: 'CREA_VALUTAZIONE', entita: 'valutazioni_rischio', entitaId: id,
    dettaglio: { fascicoloId, versione, classe: esito.classe, livello: esito.livelloApplicabile }, ip: c.get('ip'),
  });

  return c.json({ id, versione, esito }, 201);
});

api.post('/fascicoli/:idF/valutazioni/:id/firma', soloTitolare, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const id = c.req.param('id');
  const r = await c.env.DB.prepare(
    'UPDATE valutazioni_rischio SET firmata_da = ?, firmata_il = ? WHERE id = ? AND tenant_id = ? AND firmata_il IS NULL',
  ).bind(u.id, new Date().toISOString(), id, tenantId).run();
  if (!r.meta.changes) return c.json({ errore: 'Valutazione inesistente o già firmata' }, 409);
  await c.env.DB.prepare("UPDATE fascicoli SET stato = 'COMPLETO' WHERE id = ? AND stato = 'IN_VERIFICA'")
    .bind(c.req.param('idF')).run();
  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'FIRMA_VALUTAZIONE', entita: 'valutazioni_rischio', entitaId: id, ip: c.get('ip') });
  return c.json({ ok: true });
});

// ===========================================================================
// OPERAZIONI E CONTROLLO SUI LIMITI ALL'USO DEL CONTANTE — art. 49
// ===========================================================================

/** Verifica isolata, utilizzabile anche fuori da un fascicolo. */
api.post('/strumenti/contante', async (c) => {
  const b = await c.req.json<any>();
  if (typeof b.importo !== 'number' || !b.data) return c.json({ errore: 'Indicare importo e data dell’operazione' }, 400);
  return c.json(verificaContante(b.importo, b.data, { tipo: b.tipo, intermediarioParte: b.intermediarioParte }));
});

api.post('/fascicoli/:id/operazioni', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const fascicoloId = c.req.param('id');
  const b = await c.req.json<any>();

  const esito =
    b.mezzoPagamento === 'CONTANTE'
      ? verificaContante(b.importo, b.dataOperazione, { tipo: 'CONTANTE', intermediarioParte: b.intermediarioParte })
      : null;

  const id = nuovoId('ope');
  await c.env.DB.prepare(
    `INSERT INTO operazioni (id, tenant_id, fascicolo_id, data_operazione, descrizione, importo, mezzo_pagamento,
      controparte, esito_contante, violazione_art49, creato_da)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      id, tenantId, fascicoloId, b.dataOperazione, b.descrizione, b.importo, b.mezzoPagamento,
      b.controparte ?? null, esito ? JSON.stringify(esito) : null, esito && !esito.conforme ? 1 : 0, u.id,
    )
    .run();

  await scriviAudit(c.env.DB, {
    tenantId, utenteId: u.id, azione: 'REGISTRA_OPERAZIONE', entita: 'operazioni', entitaId: id,
    dettaglio: { violazione: Boolean(esito && !esito.conforme) }, ip: c.get('ip'),
  });

  return c.json(
    {
      id,
      esitoContante: esito,
      scadenzaComunicazioneMef: esito && !esito.conforme ? scadenzaComunicazioneMef(b.dataOperazione) : null,
    },
    201,
  );
});

// ===========================================================================
// ASTENSIONE — art. 42
// ===========================================================================

api.post('/fascicoli/:id/astensione', soloTitolare, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const fascicoloId = c.req.param('id');
  const b = await c.req.json<any>();
  if (!b.motivazione || !b.fondamento) return c.json({ errore: 'Fondamento normativo e motivazione sono obbligatori' }, 400);

  const id = nuovoId('ast');
  await c.env.DB.prepare(
    'INSERT INTO astensioni (id, tenant_id, fascicolo_id, data_decisione, fondamento, motivazione, sos_valutata, sos_id, decisa_da) VALUES (?,?,?,?,?,?,?,?,?)',
  ).bind(id, tenantId, fascicoloId, b.dataDecisione ?? oggi(), b.fondamento, b.motivazione, b.sosValutata ? 1 : 0, b.sosId ?? null, u.id).run();

  await c.env.DB.prepare("UPDATE fascicoli SET stato = 'ASTENSIONE', aggiornato_il = ? WHERE id = ? AND tenant_id = ?")
    .bind(new Date().toISOString(), fascicoloId, tenantId).run();

  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'ASTENSIONE', entita: 'fascicoli', entitaId: fascicoloId, dettaglio: { fondamento: b.fondamento }, ip: c.get('ip') });

  return c.json({
    id,
    promemoria:
      'L’art. 42 co. 1 impone, oltre all’astensione, di valutare se effettuare una segnalazione di operazione sospetta alla UIF ai sensi dell’art. 35. ' +
      'La valutazione va documentata anche quando si conclude in senso negativo.',
  }, 201);
});

// ===========================================================================
// SEGNALAZIONI DI OPERAZIONE SOSPETTA — artt. 35-39
// Accesso ristretto: solo TITOLARE. Contenuto cifrato. L'identità del
// segnalante non compare mai negli elenchi.
// ===========================================================================

api.get('/sos', puoVedereSos, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, protocollo, stato, data_rilevazione, data_trasmissione, canale, indicatori, fascicolo_id
     FROM segnalazioni_sospette WHERE tenant_id = ? ORDER BY data_rilevazione DESC`,
  ).bind(c.get('tenantId')).all();
  await scriviAudit(c.env.DB, { tenantId: c.get('tenantId'), utenteId: c.get('utente').id, azione: 'ELENCO_SOS', ip: c.get('ip') });
  return c.json(results ?? []);
});

api.post('/sos', puoVedereSos, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const b = await c.req.json<any>();
  if (!b.descrizioneOperazione || !b.motiviSospetto) {
    return c.json({ errore: 'L’art. 35 co. 3 richiede la descrizione dell’operazione e i motivi del sospetto.' }, 400);
  }

  const contenuto = await cifra(
    c.env.MASTER_KEY,
    tenantId,
    JSON.stringify({
      descrizioneOperazione: b.descrizioneOperazione,
      motiviSospetto: b.motiviSospetto,
      soggetti: b.soggetti ?? [],
      elementiRaccolti: b.elementiRaccolti ?? null,
    }),
  );

  const anno = oggi().slice(0, 4);
  const n = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM segnalazioni_sospette WHERE tenant_id = ? AND protocollo LIKE ?")
    .bind(tenantId, `SOS-${anno}-%`).first<{ n: number }>();
  const protocollo = `SOS-${anno}-${String((n?.n ?? 0) + 1).padStart(3, '0')}`;

  const id = nuovoId('sos');
  await c.env.DB.prepare(
    `INSERT INTO segnalazioni_sospette (id, tenant_id, protocollo, fascicolo_id, cliente_id, stato, data_rilevazione,
      canale, operazione_eseguita, motivo_esecuzione, indicatori, contenuto_cifrato, iv, segnalante_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      id, tenantId, protocollo, b.fascicoloId ?? null, b.clienteId ?? null, 'BOZZA', b.dataRilevazione ?? oggi(),
      b.canale ?? 'UIF_DIRETTA', b.operazioneEseguita ? 1 : 0, b.motivoEsecuzione ?? null,
      JSON.stringify(b.indicatori ?? []), contenuto.contenuto, contenuto.iv, u.id,
    )
    .run();

  // L'audit registra che una SOS è stata creata, non il suo contenuto: il
  // registro è consultabile da più soggetti, la segnalazione no.
  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'CREA_SOS', entita: 'segnalazioni_sospette', entitaId: id, dettaglio: { protocollo }, ip: c.get('ip') });

  return c.json({
    id,
    protocollo,
    promemoria: [
      'Art. 35 co. 2: l’operazione non va compiuta fino all’invio della segnalazione, salvo obbligo di legge di ricevere l’atto, impossibilità di rinvio o rischio di ostacolare le indagini. In tali casi la UIF va informata immediatamente dopo.',
      'Art. 39: è vietato dare comunicazione al cliente o a terzi dell’avvenuta segnalazione.',
      'Art. 37 co. 1: i professionisti trasmettono la segnalazione direttamente alla UIF ovvero al proprio organismo di autoregolamentazione, che la inoltra priva del nominativo del segnalante.',
    ],
  }, 201);
});

api.get('/sos/:id', puoVedereSos, async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id');
  const s = await c.env.DB.prepare('SELECT * FROM segnalazioni_sospette WHERE id = ? AND tenant_id = ?').bind(id, tenantId).first<any>();
  if (!s) return c.json({ errore: 'Segnalazione non trovata' }, 404);

  const contenuto = JSON.parse(await decifra(c.env.MASTER_KEY, tenantId, { contenuto: s.contenuto_cifrato, iv: s.iv }));
  delete s.contenuto_cifrato;
  delete s.iv;
  // L'identità del segnalante non viene restituita: l'art. 38 la riserva al
  // titolare della funzione, e comunque non serve alla UI.
  delete s.segnalante_id;

  await scriviAudit(c.env.DB, { tenantId, utenteId: c.get('utente').id, azione: 'LEGGI_SOS', entita: 'segnalazioni_sospette', entitaId: id, ip: c.get('ip') });
  return c.json({ segnalazione: s, contenuto });
});

api.post('/sos/:id/stato', puoVedereSos, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const id = c.req.param('id');
  const b = await c.req.json<{ stato: string; dataTrasmissione?: string; esito?: string }>();
  const ammessi = ['BOZZA', 'IN_VALUTAZIONE', 'ARCHIVIATA', 'TRASMESSA', 'ESITO_RICEVUTO'];
  if (!ammessi.includes(b.stato)) return c.json({ errore: 'Stato non ammesso' }, 400);

  await c.env.DB.prepare(
    'UPDATE segnalazioni_sospette SET stato = ?, data_trasmissione = COALESCE(?, data_trasmissione), esito = COALESCE(?, esito), aggiornato_il = ? WHERE id = ? AND tenant_id = ?',
  ).bind(b.stato, b.dataTrasmissione ?? null, b.esito ?? null, new Date().toISOString(), id, tenantId).run();

  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'AGGIORNA_STATO_SOS', entita: 'segnalazioni_sospette', entitaId: id, dettaglio: { stato: b.stato }, ip: c.get('ip') });
  return c.json({ ok: true });
});

// ===========================================================================
// CONSERVAZIONE — artt. 31-32
// ===========================================================================

api.post('/fascicoli/:id/documenti', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const fascicoloId = c.req.param('id');

  const form = await c.req.formData();
  const campo = form.get('file');
  // form.get restituisce File | string: la stringa va scartata prima di
  // trattare il valore come file, altrimenti si scrive su R2 un nome di campo.
  if (typeof campo === 'string' || campo === null) return c.json({ errore: 'File mancante' }, 400);
  const file = campo as File;

  const buf = await file.arrayBuffer();
  const sha = await sha256Hex(buf);
  const id = nuovoId('doc');
  const r2Key = `${tenantId}/${fascicoloId}/${id}-${file.name}`;
  await c.env.DOCS.put(r2Key, buf, { httpMetadata: { contentType: file.type || 'application/octet-stream' } });

  const f = await c.env.DB.prepare('SELECT data_cessazione FROM fascicoli WHERE id = ? AND tenant_id = ?').bind(fascicoloId, tenantId).first<any>();
  // La conservazione decennale decorre dalla cessazione del rapporto: finché il
  // rapporto è in essere il termine non è ancora determinabile.
  const conservaFinoAl = f?.data_cessazione ? aggiungiAnni(f.data_cessazione, TERMINI.CONSERVAZIONE_ANNI.valore) : null;

  await c.env.DB.prepare(
    `INSERT INTO documenti (id, tenant_id, fascicolo_id, tipo, nome_file, mime, dimensione, r2_key, sha256,
      data_riferimento, data_acquisizione, conserva_fino_al, creato_da)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      id, tenantId, fascicoloId, String(form.get('tipo') ?? 'ALTRO'), file.name, file.type || 'application/octet-stream',
      buf.byteLength, r2Key, sha, String(form.get('dataRiferimento') ?? oggi()), oggi(), conservaFinoAl, u.id,
    )
    .run();

  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'ACQUISISCI_DOCUMENTO', entita: 'documenti', entitaId: id, dettaglio: { sha256: sha, fascicoloId }, ip: c.get('ip') });
  return c.json({ id, sha256: sha, conservaFinoAl }, 201);
});

api.get('/documenti/:id', async (c) => {
  const tenantId = c.get('tenantId');
  const d = await c.env.DB.prepare('SELECT * FROM documenti WHERE id = ? AND tenant_id = ?').bind(c.req.param('id'), tenantId).first<any>();
  if (!d) return c.json({ errore: 'Documento non trovato' }, 404);
  const obj = await c.env.DOCS.get(d.r2_key);
  if (!obj) return c.json({ errore: 'Contenuto non reperibile nello storage' }, 404);

  await scriviAudit(c.env.DB, { tenantId, utenteId: c.get('utente').id, azione: 'LEGGI_DOCUMENTO', entita: 'documenti', entitaId: d.id, ip: c.get('ip') });
  return new Response(obj.body, {
    headers: { 'Content-Type': d.mime, 'Content-Disposition': `inline; filename="${d.nome_file}"` },
  });
});

// ===========================================================================
// SCADENZARIO E CRUSCOTTO
// ===========================================================================

/** Scadenzario del tenant: usato dall'endpoint e dall'email settimanale (AR-M7). */
async function calcolaScadenzario(db: D1Database, tenantId: string) {
  const { results } = await db.prepare(
    `SELECT f.id, f.codice, f.prestazione_codice, f.data_conferimento, f.data_cessazione, f.ultimo_controllo, cl.denominazione AS cliente,
            v.classe, v.controllo_costante_mesi, v.esente_verifica
     FROM fascicoli f JOIN clienti cl ON cl.id = f.cliente_id
     LEFT JOIN valutazioni_rischio v ON v.id = (SELECT id FROM valutazioni_rischio WHERE fascicolo_id = f.id ORDER BY versione DESC LIMIT 1)
     WHERE f.tenant_id = ? AND f.stato != 'CESSATO'`,
  ).bind(tenantId).all<any>();

  const voci = (results ?? []).flatMap((f) =>
    statoScadenze(
      calcolaScadenzeFascicolo({
        dataConferimentoIncarico: f.data_conferimento,
        dataCessazione: f.data_cessazione,
        classeRischio: f.classe ?? 'POCO_SIGNIFICATIVO',
        controlloCostanteMesi: f.controllo_costante_mesi ?? 0,
        ultimoControllo: f.ultimo_controllo,
        esenteAdeguataVerifica:
          f.classe != null
            ? Boolean(f.esente_verifica)
            : Boolean(trovaPrestazione(f.prestazione_codice)?.esenteAdeguataVerifica),
      }),
      oggi(),
    ).map((s) => ({ ...s, fascicoloId: f.id, codice: f.codice, cliente: f.cliente })),
  );

  voci.sort((a, b) => a.giorniResidui - b.giorniResidui);
  return {
    scadute: voci.filter((v) => v.stato === 'SCADUTA'),
    inScadenza: voci.filter((v) => v.stato === 'IN_SCADENZA'),
    future: voci.filter((v) => v.stato === 'FUTURA'),
  };
}

api.get('/scadenzario', async (c) => {
  return c.json(await calcolaScadenzario(c.env.DB, c.get('tenantId')));
});

api.get('/cruscotto', async (c) => {
  const tenantId = c.get('tenantId');
  const [clienti, fascicoli, perClasse, sos, violazioni, autoval] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM clienti WHERE tenant_id = ? AND attivo = 1').bind(tenantId).first<{ n: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM fascicoli WHERE tenant_id = ? AND stato != 'CESSATO'").bind(tenantId).first<{ n: number }>(),
    c.env.DB.prepare(
      `SELECT v.classe, COUNT(*) AS n FROM fascicoli f
       JOIN valutazioni_rischio v ON v.id = (SELECT id FROM valutazioni_rischio WHERE fascicolo_id = f.id ORDER BY versione DESC LIMIT 1)
       WHERE f.tenant_id = ? GROUP BY v.classe`,
    ).bind(tenantId).all<{ classe: string; n: number }>(),
    c.env.DB.prepare("SELECT stato, COUNT(*) AS n FROM segnalazioni_sospette WHERE tenant_id = ? GROUP BY stato").bind(tenantId).all(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM operazioni WHERE tenant_id = ? AND violazione_art49 = 1').bind(tenantId).first<{ n: number }>(),
    c.env.DB.prepare('SELECT * FROM autovalutazioni WHERE tenant_id = ? ORDER BY versione DESC LIMIT 1').bind(tenantId).first<any>(),
  ]);

  const nonFirmate = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM valutazioni_rischio v WHERE v.tenant_id = ? AND v.firmata_il IS NULL
     AND v.id = (SELECT id FROM valutazioni_rischio WHERE fascicolo_id = v.fascicolo_id ORDER BY versione DESC LIMIT 1)`,
  ).bind(tenantId).first<{ n: number }>();

  // Controlli automatici (AR-M7): esiti da esaminare e ultima corsa.
  const [screeningDaEsaminare, ultimaCorsa] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM screening_esiti WHERE tenant_id = ? AND stato = 'DA_ESAMINARE'").bind(tenantId).first<{ n: number }>(),
    c.env.DB.prepare('SELECT eseguito_il, soggetti FROM screening_corse WHERE tenant_id = ? ORDER BY id DESC LIMIT 1').bind(tenantId).first<any>(),
  ]);
  const paesiDaRivalutare = await clientiPaesiDaRivalutare(c.env.DB, tenantId);

  return c.json({
    screening: {
      daEsaminare: screeningDaEsaminare?.n ?? 0,
      ultimaCorsa: ultimaCorsa ?? null,
      paesiDaRivalutare: paesiDaRivalutare.length,
    },
    clienti: clienti?.n ?? 0,
    fascicoli: fascicoli?.n ?? 0,
    perClasse: perClasse.results ?? [],
    sos: sos.results ?? [],
    violazioniArt49: violazioni?.n ?? 0,
    valutazioniDaFirmare: nonFirmate?.n ?? 0,
    autovalutazione: autoval
      ? { versione: autoval.versione, data: autoval.data_valutazione, classe: autoval.classe, firmata: Boolean(autoval.firmata_il) }
      : null,
  });
});

// ===========================================================================
// INTEGRITÀ DEL REGISTRO
// ===========================================================================

api.get('/audit', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT a.id, a.azione, a.entita, a.entita_id, a.dettaglio, a.creato_il, u.nome AS utente FROM audit_log a LEFT JOIN utenti u ON u.id = a.utente_id WHERE a.tenant_id = ? ORDER BY a.id DESC LIMIT 300',
  ).bind(c.get('tenantId')).all();
  return c.json(results ?? []);
});

api.get('/audit/verifica', async (c) => c.json(await verificaCatenaAudit(c.env.DB, c.get('tenantId'))));

/**
 * Export CSV del registro (AR-M5): l'intero registro del tenant, con le
 * impronte della catena — è il documento da consegnare in sede ispettiva.
 * Separatore ';' e BOM UTF-8: si apre con doppio clic in Excel italiano.
 * Anche l'esportazione lascia traccia nel registro stesso.
 */
api.get('/audit/export', async (c) => {
  const tenantId = c.get('tenantId');
  const { results } = await c.env.DB.prepare(
    `SELECT a.id, a.creato_il, u.nome AS utente, u.email, a.azione, a.entita, a.entita_id,
            a.dettaglio, a.ip, a.hash_precedente, a.hash_riga
     FROM audit_log a LEFT JOIN utenti u ON u.id = a.utente_id
     WHERE a.tenant_id = ? ORDER BY a.id ASC`,
  ).bind(tenantId).all<any>();

  const cella = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const intestazione = ['id', 'data e ora (UTC)', 'utente', 'email', 'azione', 'entità', 'id entità', 'dettaglio', 'ip', 'hash precedente', 'hash riga'];
  const righe = (results ?? []).map((r) =>
    [r.id, r.creato_il, r.utente, r.email, r.azione, r.entita, r.entita_id, r.dettaglio, r.ip, r.hash_precedente, r.hash_riga].map(cella).join(';'),
  );
  const csv = '\uFEFF' + [intestazione.join(';'), ...righe].join('\r\n');

  await scriviAudit(c.env.DB, {
    tenantId, utenteId: c.get('utente').id, azione: 'ESPORTA_REGISTRO',
    dettaglio: { voci: results?.length ?? 0 }, ip: c.get('ip'),
  });
  const oggi = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="registro-attivita-${oggi}.csv"`,
    },
  });
});

// ===========================================================================
// ASSISTENZA (AR-M5) — la richiesta parte come email verso Contify con i
// riferimenti dello studio; reply-to sull'utente. Nel registro resta solo
// l'oggetto: il corpo del messaggio non viene salvato nel database.
// ===========================================================================

api.post('/assistenza', async (c) => {
  const u = c.get('utente');
  const b = await c.req.json<any>().catch(() => ({}));
  const oggetto = String(b.oggetto ?? '').trim().slice(0, 150);
  const messaggio = String(b.messaggio ?? '').trim().slice(0, 4000);
  if (!oggetto || !messaggio) return c.json({ errore: 'Oggetto e messaggio sono obbligatori' }, 400);

  const studio = await c.env.DB.prepare('SELECT denominazione FROM tenants WHERE id = ?').bind(u.tenant_id).first<any>();
  const emailInviata = await inviaEmailAssistenza(c.env, {
    studio: studio?.denominazione ?? u.tenant_id,
    nome: u.nome,
    email: u.email,
    ruolo: u.ruolo,
    oggetto,
    messaggio,
  });
  await scriviAudit(c.env.DB, {
    tenantId: u.tenant_id, utenteId: u.id, azione: 'RICHIESTA_ASSISTENZA',
    dettaglio: { oggetto, emailInviata }, ip: c.get('ip'),
  });
  return c.json({ ok: true, emailInviata });
});

// ===========================================================================
// VERBALI STAMPABILI (.docx) — ciò che lo studio esibisce all'ispezione.
// I verbali trascrivono i dati registrati, con il ruleset registrato: mai
// ricalcoli al volo. Ogni generazione è tracciata nel registro.
// ===========================================================================

type Ctx = Context<{ Bindings: Env; Variables: Variabili }>;

async function tenantCorrente(c: Ctx): Promise<any> {
  return c.env.DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(c.get('tenantId')).first();
}

/** Logo dello studio pronto per il .docx (AR-M6), se presente e valido. */
function logoStudioDocx(tenant: any): { base64: string; larghezzaPx: number; altezzaPx: number } | undefined {
  const l = logoStudio(tenant?.logo_url);
  if (!l || !l.larghezza || !l.altezza) return undefined;
  return { base64: l.dataUrl.slice('data:image/png;base64,'.length), larghezzaPx: l.larghezza, altezzaPx: l.altezza };
}

async function nomiUtenti(c: Ctx): Promise<Record<string, string>> {
  const { results } = await c.env.DB.prepare('SELECT id, nome FROM utenti WHERE tenant_id = ?')
    .bind(c.get('tenantId')).all<{ id: string; nome: string }>();
  return Object.fromEntries((results ?? []).map((u) => [u.id, u.nome]));
}

api.get('/studio/autovalutazioni/:id/verbale', async (c) => {
  const tenantId = c.get('tenantId');
  const av = await c.env.DB.prepare('SELECT * FROM autovalutazioni WHERE id = ? AND tenant_id = ?')
    .bind(c.req.param('id'), tenantId).first<any>();
  if (!av) return c.json({ errore: 'Autovalutazione non trovata' }, 404);

  const nomi = await nomiUtenti(c);
  const tenant = await tenantCorrente(c);
  const corpo = corpoVerbaleAutovalutazione({
    tenant,
    av,
    ruleset: ruleset(av.ruleset_id),
    nomeCreatore: nomi[av.creato_da] ?? '—',
    nomeFirmatario: av.firmata_da ? nomi[av.firmata_da] : null,
  });
  await scriviAudit(c.env.DB, { tenantId, utenteId: c.get('utente').id, azione: 'VERBALE_AUTOVALUTAZIONE', entita: 'autovalutazioni', entitaId: av.id, ip: c.get('ip') });
  return rispostaDocx(costruisciDocx(corpo, { logoStudio: logoStudioDocx(tenant) }), `verbale-autovalutazione-v${av.versione}.docx`);
});

/** Carica fascicolo + cliente + dati collegati per scheda e fascicolo completo. */
async function datiFascicolo(c: Ctx, id: string) {
  const tenantId = c.get('tenantId');
  const f = await c.env.DB.prepare('SELECT * FROM fascicoli WHERE id = ? AND tenant_id = ?').bind(id, tenantId).first<any>();
  if (!f) return null;
  const cliente = await c.env.DB.prepare('SELECT * FROM clienti WHERE id = ? AND tenant_id = ?').bind(f.cliente_id, tenantId).first<any>();
  const { results: valutazioni } = await c.env.DB.prepare('SELECT * FROM valutazioni_rischio WHERE fascicolo_id = ? ORDER BY versione DESC').bind(id).all<any>();
  const { results: titolari } = await c.env.DB.prepare('SELECT * FROM titolari_effettivi WHERE cliente_id = ? AND tenant_id = ? AND valido_al IS NULL').bind(f.cliente_id, tenantId).all<any>();
  const { results: documenti } = await c.env.DB.prepare('SELECT id, tipo, nome_file, dimensione, sha256, data_riferimento, data_acquisizione, conserva_fino_al FROM documenti WHERE fascicolo_id = ? AND tenant_id = ?').bind(id, tenantId).all<any>();
  return { fascicolo: f, cliente, valutazioni: valutazioni ?? [], titolari: titolari ?? [], documenti: documenti ?? [] };
}

api.get('/fascicoli/:id/scheda-verifica', async (c) => {
  const tenantId = c.get('tenantId');
  const d = await datiFascicolo(c, c.req.param('id'));
  if (!d) return c.json({ errore: 'Fascicolo non trovato' }, 404);

  const nomi = await nomiUtenti(c);
  const ultima = d.valutazioni[0] ?? null;
  const tenant = await tenantCorrente(c);
  const corpo = corpoSchedaVerifica({
    tenant,
    fascicolo: d.fascicolo,
    cliente: d.cliente,
    valutazione: ultima,
    titolari: d.titolari,
    documenti: d.documenti,
    ruleset: ruleset(ultima?.ruleset_id),
    nomeFirmatario: ultima?.firmata_da ? nomi[ultima.firmata_da] : nomi[d.fascicolo.creato_da],
  });
  await scriviAudit(c.env.DB, { tenantId, utenteId: c.get('utente').id, azione: 'VERBALE_SCHEDA_VERIFICA', entita: 'fascicoli', entitaId: d.fascicolo.id, ip: c.get('ip') });
  return rispostaDocx(costruisciDocx(corpo, { logoStudio: logoStudioDocx(tenant) }), `scheda-verifica-${d.fascicolo.codice.replace('/', '-')}.docx`);
});

api.get('/fascicoli/:id/astensioni/:idAst/verbale', soloTitolare, async (c) => {
  const tenantId = c.get('tenantId');
  const d = await datiFascicolo(c, c.req.param('id') ?? '');
  if (!d) return c.json({ errore: 'Fascicolo non trovato' }, 404);
  const a = await c.env.DB.prepare('SELECT * FROM astensioni WHERE id = ? AND tenant_id = ? AND fascicolo_id = ?')
    .bind(c.req.param('idAst'), tenantId, d.fascicolo.id).first<any>();
  if (!a) return c.json({ errore: 'Astensione non trovata' }, 404);

  const nomi = await nomiUtenti(c);
  const tenant = await tenantCorrente(c);
  const corpo = corpoVerbaleAstensione({
    tenant,
    fascicolo: d.fascicolo,
    cliente: d.cliente,
    astensione: a,
    nomeDecisore: nomi[a.decisa_da] ?? '—',
  });
  await scriviAudit(c.env.DB, { tenantId, utenteId: c.get('utente').id, azione: 'VERBALE_ASTENSIONE', entita: 'astensioni', entitaId: a.id, ip: c.get('ip') });
  return rispostaDocx(costruisciDocx(corpo, { logoStudio: logoStudioDocx(tenant) }), `verbale-astensione-${d.fascicolo.codice.replace('/', '-')}.docx`);
});

api.get('/fascicoli/:id/astensioni', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, data_decisione, fondamento, sos_valutata FROM astensioni WHERE fascicolo_id = ? AND tenant_id = ? ORDER BY data_decisione DESC',
  ).bind(c.req.param('id'), c.get('tenantId')).all();
  return c.json(results ?? []);
});

api.get('/fascicoli/:id/fascicolo-ispezione', async (c) => {
  const tenantId = c.get('tenantId');
  const d = await datiFascicolo(c, c.req.param('id'));
  if (!d) return c.json({ errore: 'Fascicolo non trovato' }, 404);

  const { results: operazioni } = await c.env.DB.prepare('SELECT * FROM operazioni WHERE fascicolo_id = ? AND tenant_id = ? ORDER BY data_operazione DESC').bind(d.fascicolo.id, tenantId).all<any>();
  const { results: astensioni } = await c.env.DB.prepare('SELECT * FROM astensioni WHERE fascicolo_id = ? AND tenant_id = ? ORDER BY data_decisione DESC').bind(d.fascicolo.id, tenantId).all<any>();
  const autovalutazione = await c.env.DB.prepare('SELECT * FROM autovalutazioni WHERE tenant_id = ? ORDER BY versione DESC LIMIT 1').bind(tenantId).first<any>();
  const audit = await verificaCatenaAudit(c.env.DB, tenantId);

  const nomi = await nomiUtenti(c);
  const ultima = d.valutazioni[0] ?? null;
  const tenant = await tenantCorrente(c);
  const corpo = corpoFascicoloIspezione({
    tenant,
    fascicolo: d.fascicolo,
    cliente: d.cliente,
    valutazioni: d.valutazioni,
    titolari: d.titolari,
    documenti: d.documenti,
    operazioni: operazioni ?? [],
    astensioni: astensioni ?? [],
    autovalutazione,
    auditIntegro: audit.integra,
    ruleset: ruleset(ultima?.ruleset_id),
    nomiUtenti: nomi,
    nomeFirmatario: ultima?.firmata_da ? nomi[ultima.firmata_da] : nomi[d.fascicolo.creato_da],
  });
  await scriviAudit(c.env.DB, { tenantId, utenteId: c.get('utente').id, azione: 'VERBALE_FASCICOLO_ISPEZIONE', entita: 'fascicoli', entitaId: d.fascicolo.id, ip: c.get('ip') });
  return rispostaDocx(costruisciDocx(corpo, { logoStudio: logoStudioDocx(tenant) }), `fascicolo-ispezione-${d.fascicolo.codice.replace('/', '-')}.docx`);
});

app.route('/api', api);

// SPA: tutto il resto va agli asset statici.
//
// La Response restituita dal binding ASSETS ha headers immutabili: passandola
// così com'è, il middleware secureHeaders esplode con "Can't modify immutable
// headers" e ogni richiesta di asset diventa un 500. La si riavvolge in una
// Response nuova, che ha headers scrivibili. Bug trovato dal collaudo con
// browser reale: le prove sulle sole API non lo intercettavano, perché
// toccano solo /api.
app.get('*', async (c) => {
  const r = await c.env.ASSETS.fetch(c.req.raw);
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: new Headers(r.headers) });
});

export default {
  fetch: app.fetch,

  /**
   * Backup notturno su R2 (lib/backup.ts): dump SQL di piattaforma con
   * rotazione 30/12 + fotografia dell'archivio di ogni studio. La perdita
   * dei dati non è solo un disservizio: l'art. 32 co. 2 impone che le
   * modalità di conservazione prevengano qualsiasi perdita dei dati.
   */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(lavoroNotturno(env));
  },
};

/**
 * Cron notturno: avvisi canone, screening sanzioni (AR-M7), riepilogo
 * settimanale del lunedì e backup. Ogni blocco è isolato — un errore in
 * uno non azzittisce gli altri — ma il fallimento del BACKUP deve
 * risultare failed in dashboard, quindi resta ultimo e senza catch.
 */
async function lavoroNotturno(env: Env): Promise<void> {
  try {
    await avvisiCanone(env);
  } catch (e) {
    console.error('avvisi canone falliti:', e);
  }
  try {
    await screeningSchedulato(env);
  } catch (e) {
    console.error('screening sanzioni fallito:', e);
  }
  try {
    // Il riepilogo parte nella notte fra domenica e lunedì.
    if (new Date().getUTCDay() === 1) await riepiloghiSettimanali(env);
  } catch (e) {
    console.error('riepiloghi settimanali falliti:', e);
  }
  await backupSchedulato(env);
}

/** Email del lunedì ai titolari: solo quando c'è davvero qualcosa da fare. */
async function riepiloghiSettimanali(env: Env): Promise<void> {
  const tenants = (
    await env.DB.prepare("SELECT id, denominazione, stato FROM tenants WHERE stato IS NULL OR stato = 'attivo'").all<any>()
  ).results ?? [];

  for (const t of tenants) {
    try {
      const [scadenzario, screening, paesi, registroTe] = await Promise.all([
        calcolaScadenzario(env.DB, t.id),
        env.DB.prepare("SELECT COUNT(*) AS n FROM screening_esiti WHERE tenant_id = ? AND stato = 'DA_ESAMINARE'").bind(t.id).first<{ n: number }>(),
        clientiPaesiDaRivalutare(env.DB, t.id),
        statoRegistroTe(env.DB, t.id),
      ]);
      const registroTeAvviso =
        registroTe.accreditato && registroTe.giorniResidui !== null && registroTe.giorniResidui <= 60
          ? registroTe.giorniResidui < 0
            ? `L'accreditamento al registro dei titolari effettivi è SCADUTO il ${registroTe.scadeIl}: rinnovalo presso la Camera di Commercio.`
            : `L'accreditamento al registro dei titolari effettivi scade tra ${registroTe.giorniResidui} giorni (${registroTe.scadeIl}).`
          : null;
      const daFare = scadenzario.scadute.length + scadenzario.inScadenza.length + (screening?.n ?? 0) + paesi.length + (registroTeAvviso ? 1 : 0);
      if (!daFare) continue;   // niente da fare, niente rumore

      const titolari = (
        await env.DB.prepare("SELECT nome, email FROM utenti WHERE tenant_id = ? AND ruolo = 'TITOLARE' AND attivo = 1").bind(t.id).all<any>()
      ).results ?? [];
      for (const dest of titolari) {
        const inviata = await inviaEmailScadenzario(env, {
          destinatario: dest.email,
          nome: dest.nome,
          studio: t.denominazione,
          scadute: scadenzario.scadute,
          inScadenza: scadenzario.inScadenza,
          screeningDaEsaminare: screening?.n ?? 0,
          paesiDaRivalutare: paesi.length,
          registroTeAvviso,
        });
        console.log(`riepilogo settimanale ${t.denominazione} → ${dest.email}: ${inviata ? 'inviato' : 'NON inviato'}`);
      }
    } catch (e) {
      console.error(`riepilogo settimanale ${t.id} fallito:`, e);
    }
  }
}

async function avvisiCanone(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    "SELECT denominazione, stato, data_scadenza_canone FROM tenants WHERE data_scadenza_canone IS NOT NULL AND stato != 'cessato'",
  ).all<{ denominazione: string; stato: string; data_scadenza_canone: string }>();
  for (const t of results ?? []) {
    const giorni = giorniAllaScadenza(t.data_scadenza_canone);
    if (giorni === null || !(SOGLIE_AVVISO_CANONE as readonly number[]).includes(giorni)) continue;
    const inviata = await inviaEmailAvvisoCanone(env, { studio: t.denominazione, scadenza: t.data_scadenza_canone, giorni });
    console.log(`avviso canone ${t.denominazione} (${giorni} giorni): email ${inviata ? 'inviata' : 'NON inviata'}`);
  }
}
