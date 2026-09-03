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
  descriviDispositivo,
  impostaCookieSessione,
  rifSessione,
  puoScrivere,
  puoVedereSos,
  richiediAutenticazione,
  rimuoviCookieSessione,
  soloAmministratore,
  soloTitolare,
} from './lib/auth';
import { cifra, decifra, generaPasswordTemporanea, hashPassword, nuovoId, nuovoToken, sha256Hex, verificaPassword } from './lib/crypto';
import {
  inviaEmailAvvisoCanone,
  inviaEmailBenvenuto,
  inviaEmailResetPassword,
  inviaEmailRispostaTicket,
  inviaEmailScadenzario,
  inviaEmailTicketAssistenza,
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
import { leggiProposte, propostaTitolarita, registraProposta, salvaCompagine, screeningCompagine, type CaricaIn, type SocioIn } from './lib/compagine';
import { ErroreAi, MODELLO_DEFAULT, aiAbilitata, generaBozza, rispostaChat, suggerisciIndicatori } from './lib/ai';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

import { CNDCEC_2025 } from './domain/rulesets/cndcec-2025';
import {
  calcolaIndicatori,
  calcolaScostamenti,
  type RigaFascicolo,
  type RigheVulnerabilita,
} from './domain/autoval-dati';
import { CATALOGO_PRESTAZIONI_2025, prestazioneObbligatoria, trovaPrestazione } from './domain/prestazioni';
import { calcolaAutovalutazione, calcolaProfiloCliente, ErroreDominio } from './domain/risk';
import { analizzaTitolaritaEffettiva } from './domain/titolare-effettivo';
import { calcolaScadenzeFascicolo, scadenzaComunicazioneMef, statoScadenze } from './domain/scadenze';
import { SOGLIE, TERMINI, aggiungiAnni, paeseAltoRischio, verificaContante } from './domain/norme';
import { AVVISO_INDICATORI, INDICATORI_UIF_2023 } from './domain/indicatori-uif';
import { NOVITA, idNovitaValido } from './domain/novita';
import { SUB_INDICI_UIF_2023 } from './domain/sub-indici-uif';
import { costruisciDocx, rispostaDocx } from './lib/docx';
import {
  corpoFascicoloIspezione,
  corpoSchedaVerifica,
  corpoVerbaleAstensione,
  corpoVerbaleAutovalutazione,
  type Professionista,
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
  const { email, password, ricordami } = await c.req.json<{ email?: string; password?: string; ricordami?: boolean }>();
  if (!email || !password) return c.json({ errore: 'Credenziali mancanti' }, 400);

  const u = await c.env.DB.prepare('SELECT * FROM utenti WHERE email = ? AND attivo = 1')
    .bind(email.toLowerCase().trim())
    .first<any>();

  // Risposta e tempi uniformi: non si deve poter dedurre se l'email esista.
  const ok = u ? await verificaPassword(password, u.password_hash) : await verificaPassword(password, await hashPassword('x'));
  if (!u || !ok) return c.json({ errore: 'Credenziali non valide' }, 401);

  const token = await creaSessione(c.env.DB, u, c.req.header('CF-Connecting-IP') ?? null, c.req.header('User-Agent') ?? null, ricordami === true);
  impostaCookieSessione(c, token, ricordami === true);
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
  const pubbliche = ['/api/auth/login', '/api/auth/logout', '/api/auth/password-dimenticata', '/api/auth/reset-password', '/api/pubblico/', '/api/console/'];
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
    // AR-M16: posti professionista a contratto. null = nessun limite pattuito.
    professionistiInclusi: t.professionisti_inclusi ?? null,
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
    tema: u.tema ?? null,
    modoColore: u.modo_colore ?? null,
    // AR-M15: il ruolo dice se firma, il flag dice se amministra.
    amministratore: u.amministratore === 1,
    professionista: u.ruolo === 'TITOLARE',
    codiceFiscale: u.codice_fiscale ?? null,
    ordine: u.ordine ?? null,
    numeroIscrizione: u.numero_iscrizione ?? null,
    qualifica: u.qualifica ?? null,
  };
}

api.get('/auth/io', async (c) => {
  const u = c.get('utente');
  const tenant = await c.env.DB.prepare('SELECT id, denominazione, piano, ruleset_default, parametri, stato, logo_url, professionisti_inclusi FROM tenants WHERE id = ?')
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
// ASPETTO DELL'INTERFACCIA (AR-M12) — tema colore e modo chiaro/notturna,
// scelte personali che seguono l'utente su ogni dispositivo. La lista dei
// temi è la stessa del frontend (web/src/lib/tema.ts): qui si valida.
// ===========================================================================

const TEMI_AMMESSI = ['contify', 'blu', 'indaco', 'viola', 'fucsia', 'rosa', 'rosso', 'arancio', 'ambra', 'giallo', 'verde', 'grigio'];
const MODI_AMMESSI = ['chiaro', 'scuro', 'auto'];

api.post('/auth/tema', async (c) => {
  const u = c.get('utente');
  const b = await c.req.json<any>().catch(() => ({}));
  const tema = b.tema === null ? null : String(b.tema ?? '');
  if (tema !== null && !TEMI_AMMESSI.includes(tema)) return c.json({ errore: 'Tema sconosciuto' }, 400);
  await c.env.DB.prepare('UPDATE utenti SET tema = ? WHERE id = ?').bind(tema, u.id).run();
  return c.json({ ok: true, tema });
});

api.post('/auth/modo', async (c) => {
  const u = c.get('utente');
  const b = await c.req.json<any>().catch(() => ({}));
  const modo = b.modo === null ? null : String(b.modo ?? '');
  if (modo !== null && !MODI_AMMESSI.includes(modo)) return c.json({ errore: 'Modo colore sconosciuto' }, 400);
  await c.env.DB.prepare('UPDATE utenti SET modo_colore = ? WHERE id = ?').bind(modo, u.id).run();
  return c.json({ ok: true, modo });
});

// ===========================================================================
// ACCESSI E DISPOSITIVI (AR-M12) — i dispositivi da cui l'utente risulta
// collegato. All'esterno viaggia solo un riferimento (hash troncato),
// mai l'id della sessione.
// ===========================================================================

api.get('/auth/sessioni', async (c) => {
  const u = c.get('utente');
  const corrente = c.get('sessioneId');
  const { results } = await c.env.DB.prepare(
    `SELECT id, creato_il, ultimo_utilizzo, scade_il, scade_assoluta, ricordami, user_agent
     FROM sessioni
     WHERE utente_id = ? AND scade_il > datetime('now')
       AND (scade_assoluta IS NULL OR scade_assoluta > datetime('now'))
     ORDER BY COALESCE(ultimo_utilizzo, creato_il) DESC`,
  ).bind(u.id).all<any>();
  const sessioni = await Promise.all((results ?? []).map(async (r: any) => ({
    rif: await rifSessione(r.id),
    dispositivo: descriviDispositivo(r.user_agent),
    accessoIl: r.creato_il,
    ultimoUtilizzo: r.ultimo_utilizzo ?? r.creato_il,
    scadeIl: r.scade_il,
    ricordami: r.ricordami === 1,
    corrente: r.id === corrente,
  })));
  return c.json({ sessioni });
});

api.post('/auth/sessioni/chiudi-altre', async (c) => {
  const u = c.get('utente');
  const corrente = c.get('sessioneId') ?? '';
  const r = await c.env.DB.prepare('DELETE FROM sessioni WHERE utente_id = ? AND id <> ?').bind(u.id, corrente).run();
  const chiuse = r.meta.changes ?? 0;
  if (chiuse > 0) {
    await scriviAudit(c.env.DB, {
      tenantId: u.tenant_id, utenteId: u.id, azione: 'SESSIONI_REVOCATE',
      dettaglio: { chiuse, ambito: 'altri_dispositivi' }, ip: c.get('ip'),
    });
  }
  return c.json({ ok: true, chiuse });
});

api.post('/auth/sessioni/:rif/chiudi', async (c) => {
  const u = c.get('utente');
  const corrente = c.get('sessioneId') ?? '';
  const rif = c.req.param('rif');
  if (!/^[0-9a-f]{16}$/.test(rif)) return c.json({ errore: 'Riferimento non valido' }, 400);
  const { results } = await c.env.DB.prepare('SELECT id FROM sessioni WHERE utente_id = ?').bind(u.id).all<any>();
  let bersaglio: string | null = null;
  for (const r of results ?? []) {
    if ((await rifSessione(r.id)) === rif) { bersaglio = r.id; break; }
  }
  if (!bersaglio) return c.json({ errore: 'Accesso non trovato' }, 404);
  await c.env.DB.prepare('DELETE FROM sessioni WHERE id = ?').bind(bersaglio).run();
  await scriviAudit(c.env.DB, {
    tenantId: u.tenant_id, utenteId: u.id, azione: 'SESSIONI_REVOCATE',
    dettaglio: { chiuse: 1, ambito: bersaglio === corrente ? 'questo_dispositivo' : 'un_dispositivo' }, ip: c.get('ip'),
  });
  if (bersaglio === corrente) rimuoviCookieSessione(c);
  return c.json({ ok: true, chiuse: 1, eraCorrente: bersaglio === corrente });
});

// ===========================================================================
// GESTIONE UTENTI DELLO STUDIO — solo l'AMMINISTRATORE (AR-M15)
//
// Regole di sicurezza (stesse di Assist):
// - la password iniziale è generata dal server, mostrata all'amministratore
//   UNA SOLA volta e mai salvata in chiaro né scritta nell'audit;
// - gli utenti creati (e quelli resettati) devono cambiare password al
//   primo accesso;
// - lo studio non può restare senza un professionista attivo (l'art. 38
//   vuole sempre qualcuno che possa accedere alle SOS) né senza un
//   amministratore attivo (nessuno potrebbe più gestire gli utenti);
// - disattivazione e reset amministrativo revocano le sessioni aperte.
//
// AR-M15: in uno studio associato i professionisti sono più d'uno e ciascuno
// identifica e firma per i propri clienti. L'amministrazione è un flag a
// parte proprio per non regalare a ogni associato backup ed Elimina Archivio.
// ===========================================================================

const RUOLI_VALIDI = ['TITOLARE', 'COLLABORATORE', 'LETTORE', 'REVISORE'];

async function altriTitolariAttivi(db: D1Database, tenantId: string, escludiId: string): Promise<number> {
  const r = await db.prepare(
    "SELECT COUNT(*) AS n FROM utenti WHERE tenant_id = ? AND ruolo = 'TITOLARE' AND attivo = 1 AND id <> ?",
  ).bind(tenantId, escludiId).first<{ n: number }>();
  return r?.n ?? 0;
}

/**
 * AR-M16. Il contratto può prevedere un numero di posti professionista
 * (tenants.professionisti_inclusi; NULL = nessun limite pattuito). Si
 * controlla QUI, alla creazione o riattivazione di un TITOLARE: è l'unico
 * punto in cui il numero può crescere. Il messaggio dice cosa fare, perché
 * chi lo legge è l'amministratore dello studio, non Contify.
 */
async function postiProfessionistaEsauriti(
  db: D1Database, tenantId: string, escludiId: string | null,
): Promise<string | null> {
  const t = await db.prepare('SELECT professionisti_inclusi AS n FROM tenants WHERE id = ?')
    .bind(tenantId).first<{ n: number | null }>();
  const limite = t?.n;
  if (limite === null || limite === undefined) return null;
  const attivi = await db.prepare(
    "SELECT COUNT(*) AS n FROM utenti WHERE tenant_id = ? AND ruolo = 'TITOLARE' AND attivo = 1 AND id <> ?",
  ).bind(tenantId, escludiId ?? '').first<{ n: number }>();
  if ((attivi?.n ?? 0) < limite) return null;
  return `Il contratto dello studio comprende ${limite} ${limite === 1 ? 'posto professionista' : 'posti professionista'}, già ${limite === 1 ? 'occupato' : 'occupati'}. Per aggiungerne apri una richiesta dalla pagina Assistenza: adegueremo il contratto.`;
}

async function altriAmministratoriAttivi(db: D1Database, tenantId: string, escludiId: string): Promise<number> {
  const r = await db.prepare(
    'SELECT COUNT(*) AS n FROM utenti WHERE tenant_id = ? AND amministratore = 1 AND attivo = 1 AND id <> ?',
  ).bind(tenantId, escludiId).first<{ n: number }>();
  return r?.n ?? 0;
}

/** Dati d'albo: compaiono nell'intestazione dei verbali del professionista. */
function datiAlbo(b: any, base: any = {}) {
  const testo = (v: unknown, attuale: unknown) =>
    v === undefined ? (attuale ?? null) : (String(v ?? '').trim().slice(0, 120) || null);
  return {
    codiceFiscale: testo(b.codiceFiscale, base.codice_fiscale),
    ordine: testo(b.ordine, base.ordine),
    numeroIscrizione: testo(b.numeroIscrizione, base.numero_iscrizione),
    qualifica: testo(b.qualifica, base.qualifica),
  };
}

/**
 * I professionisti dello studio: chi può essere indicato come incaricato di
 * una prestazione o come autore materiale dell'identificazione. Serve alle
 * tendine dell'interfaccia ed è leggibile da chiunque abbia accesso —
 * non è un dato riservato, è l'organigramma dello studio.
 */
api.get('/studio/professionisti', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, nome, email, amministratore, codice_fiscale, ordine, numero_iscrizione, qualifica, attivo
     FROM utenti WHERE tenant_id = ? AND ruolo = 'TITOLARE'
     ORDER BY attivo DESC, nome COLLATE NOCASE`,
  ).bind(c.get('tenantId')).all<any>();
  return c.json((results ?? []).map((u) => ({
    id: u.id, nome: u.nome, email: u.email,
    amministratore: u.amministratore === 1, attivo: Boolean(u.attivo),
    codiceFiscale: u.codice_fiscale, ordine: u.ordine,
    numeroIscrizione: u.numero_iscrizione, qualifica: u.qualifica,
  })));
});

/**
 * Il professionista indicato esiste, è attivo ed è dello studio?
 * Se non è indicato nulla si usa l'utente corrente quando è professionista:
 * è il caso normale (il professionista carica i propri clienti).
 */
async function risolviProfessionista(
  db: D1Database, tenantId: string, indicato: unknown, utente: any,
): Promise<{ id: string } | { errore: string }> {
  const id = indicato === undefined || indicato === null || indicato === '' ? null : String(indicato);
  if (!id) {
    if (utente.ruolo === 'TITOLARE') return { id: utente.id };
    return { errore: 'Indicare il professionista incaricato: chi inserisce non firma.' };
  }
  const r = await db.prepare(
    "SELECT id FROM utenti WHERE id = ? AND tenant_id = ? AND ruolo = 'TITOLARE' AND attivo = 1",
  ).bind(id, tenantId).first<any>();
  if (!r) return { errore: 'Il professionista indicato non esiste, non è attivo o non appartiene allo studio.' };
  return { id: String(r.id) };
}

api.get('/utenti', soloAmministratore, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, email, nome, ruolo, attivo, amministratore, cambio_password_richiesto, ultimo_accesso, creato_il,
            codice_fiscale, ordine, numero_iscrizione, qualifica
     FROM utenti WHERE tenant_id = ?
     ORDER BY attivo DESC, ruolo = 'TITOLARE' DESC, nome COLLATE NOCASE`,
  ).bind(c.get('tenantId')).all<any>();
  return c.json((results ?? []).map((u) => ({
    id: u.id, email: u.email, nome: u.nome, ruolo: u.ruolo,
    attivo: Boolean(u.attivo), amministratore: u.amministratore === 1,
    cambioPasswordRichiesto: Boolean(u.cambio_password_richiesto),
    ultimoAccesso: u.ultimo_accesso, creatoIl: u.creato_il,
    codiceFiscale: u.codice_fiscale, ordine: u.ordine,
    numeroIscrizione: u.numero_iscrizione, qualifica: u.qualifica,
  })));
});

api.post('/utenti', soloAmministratore, async (c) => {
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

  // AR-M16: i posti professionista sono quelli del contratto.
  if (ruolo === 'TITOLARE') {
    const esauriti = await postiProfessionistaEsauriti(c.env.DB, tenantId, null);
    if (esauriti) return c.json({ errore: esauriti, postiEsauriti: true }, 409);
  }

  // Solo un professionista può amministrare: chi gestisce utenti e archivio
  // deve poter rispondere di ciò che nell'archivio c'è.
  const amministratore = Boolean(b.amministratore) && ruolo === 'TITOLARE';
  const albo = datiAlbo(b);

  const passwordTemporanea = generaPasswordTemporanea();
  const id = nuovoId('usr');
  await c.env.DB.prepare(
    `INSERT INTO utenti (id, tenant_id, email, nome, password_hash, ruolo, cambio_password_richiesto,
      amministratore, codice_fiscale, ordine, numero_iscrizione, qualifica)
     VALUES (?,?,?,?,?,?,1,?,?,?,?,?)`,
  ).bind(
    id, tenantId, email, nome, await hashPassword(passwordTemporanea), ruolo,
    amministratore ? 1 : 0, albo.codiceFiscale, albo.ordine, albo.numeroIscrizione, albo.qualifica,
  ).run();

  await scriviAudit(c.env.DB, { tenantId, utenteId: autore.id, azione: 'CREA_UTENTE', entita: 'utenti', entitaId: id, dettaglio: { email, nome, ruolo, amministratore }, ip: c.get('ip') });

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

api.post('/utenti/:id', soloAmministratore, async (c) => {
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

  // Lo studio non può restare senza un professionista attivo: le SOS
  // (art. 38) sarebbero inaccessibili a chiunque.
  const perdeTitolare = target.ruolo === 'TITOLARE' && (nuovoRuolo !== 'TITOLARE' || !nuovoAttivo);
  if (perdeTitolare && (await altriTitolariAttivi(c.env.DB, tenantId, target.id)) === 0) {
    return c.json({ errore: 'Lo studio deve avere sempre almeno un professionista attivo' }, 409);
  }

  // AR-M16: promuovere o riattivare un professionista occupa un posto del
  // contratto. Chi era già professionista attivo non consuma nulla di nuovo.
  const diventaProfessionista =
    nuovoRuolo === 'TITOLARE' && nuovoAttivo && !(target.ruolo === 'TITOLARE' && target.attivo === 1);
  if (diventaProfessionista) {
    const esauriti = await postiProfessionistaEsauriti(c.env.DB, tenantId, target.id);
    if (esauriti) return c.json({ errore: esauriti, postiEsauriti: true }, 409);
  }

  // …né senza amministratore: nessuno potrebbe più gestire utenti, backup
  // e licenza, e non esiste un modo di rimediare da dentro il programma.
  const eraAmministratore = target.amministratore === 1;
  let nuovoAmministratore = b.amministratore !== undefined ? Boolean(b.amministratore) : eraAmministratore;
  if (nuovoRuolo !== 'TITOLARE' || !nuovoAttivo) nuovoAmministratore = false;
  if (eraAmministratore && !nuovoAmministratore && (await altriAmministratoriAttivi(c.env.DB, tenantId, target.id)) === 0) {
    return c.json({ errore: 'Lo studio deve avere sempre almeno un amministratore attivo' }, 409);
  }

  const albo = datiAlbo(b, target);
  await c.env.DB.prepare(
    `UPDATE utenti SET nome = ?, ruolo = ?, attivo = ?, amministratore = ?,
       codice_fiscale = ?, ordine = ?, numero_iscrizione = ?, qualifica = ? WHERE id = ?`,
  )
    .bind(
      nuovoNome, nuovoRuolo, nuovoAttivo ? 1 : 0, nuovoAmministratore ? 1 : 0,
      albo.codiceFiscale, albo.ordine, albo.numeroIscrizione, albo.qualifica, id,
    )
    .run();
  if (!nuovoAttivo) {
    await c.env.DB.prepare('DELETE FROM sessioni WHERE utente_id = ?').bind(id).run();
  }
  await scriviAudit(c.env.DB, {
    tenantId, utenteId: autore.id, azione: 'MODIFICA_UTENTE', entita: 'utenti', entitaId: id,
    dettaglio: { ruolo: nuovoRuolo, attivo: nuovoAttivo, amministratore: nuovoAmministratore }, ip: c.get('ip'),
  });
  return c.json({ ok: true });
});

api.post('/utenti/:id/reset-password', soloAmministratore, async (c) => {
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

api.post('/studio/logo', soloAmministratore, async (c) => {
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

api.post('/backup', soloAmministratore, async (c) => {
  const r = await runBackupTenant(c.env, c.get('tenantId'), 'manuale', c.get('utente').id);
  return c.json(r, 201);
});

api.get('/backup', soloAmministratore, async (c) => {
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

api.get('/backup/scarica', soloAmministratore, async (c) => {
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

api.post('/backup/ripristina', soloAmministratore, async (c) => {
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

api.post('/backup/elimina-archivio', soloAmministratore, async (c) => {
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

  // AR-M15. Il professionista di riferimento dell'intera importazione:
  // in uno studio associato si importa «il pacchetto di clienti di X».
  // Si può indicare per riga (colonna `professionista`, email o nome), ma
  // il caso normale è uno solo per file.
  const predefinito = await risolviProfessionista(c.env.DB, tenantId, b.professionistaId, u);
  if ('errore' in predefinito) return c.json({ errore: predefinito.errore }, 400);
  const { results: elencoProf } = await c.env.DB.prepare(
    "SELECT id, nome, email FROM utenti WHERE tenant_id = ? AND ruolo = 'TITOLARE' AND attivo = 1",
  ).bind(tenantId).all<any>();
  const perEmail = new Map((elencoProf ?? []).map((p: any) => [String(p.email).toLowerCase(), String(p.id)]));
  const perNome = new Map((elencoProf ?? []).map((p: any) => [String(p.nome).trim().toLowerCase(), String(p.id)]));

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

    // Indicazione per riga, se c'è e se corrisponde a un professionista
    // dello studio; altrimenti quella scelta per l'intero file.
    const indicato = String(r.professionista ?? '').trim().toLowerCase();
    const professionistaId = (indicato && (perEmail.get(indicato) ?? perNome.get(indicato))) || predefinito.id;

    await c.env.DB.prepare(
      `INSERT INTO clienti (id, tenant_id, tipo, denominazione, codice_fiscale, partita_iva,
        paese_residenza, attivita_prevalente, ateco, pep, note, creato_da, professionista_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      nuovoId('cli'), tenantId, tipo, denominazione, cf, piva,
      String(r.paeseResidenza ?? 'IT').trim().toUpperCase() || 'IT',
      String(r.attivitaPrevalente ?? '').trim() || null,
      String(r.ateco ?? '').trim() || null,
      r.pep === true || /^(s[iì]|x|1|true|y|yes)$/i.test(String(r.pep ?? '')) ? 1 : 0,
      String(r.note ?? '').trim() || null,
      u.id,
      professionistaId,
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
    try {
      await c.env.DOCS.put(r2Key, buf, { httpMetadata: { contentType: file.type } });
    } catch (e) {
      // Distinguere il sottosistema guasto: senza questo, ogni guasto qui era
      // un «Errore interno» indistinguibile per il cliente e per l'assistenza.
      console.error('verifica remota: salvataggio allegato su R2 fallito:', e);
      return c.json({ errore: 'Non è stato possibile salvare l’allegato: riprova tra qualche minuto o segnala il problema allo studio' }, 500);
    }
    allegati.push({ r2Key, nome, mime: file.type, dimensione: buf.byteLength, sha256: await sha256Hex(buf) });
  }
  if (JSON.parse(r.richieste).documento && allegati.length === 0) {
    return c.json({ errore: 'Allega il documento d’identità richiesto' }, 400);
  }

  let cifrato: { contenuto: string; iv: string };
  try {
    cifrato = await cifra(c.env.MASTER_KEY, r.tenant_id, JSON.stringify(dati));
  } catch (e) {
    console.error('verifica remota: cifratura non disponibile (MASTER_KEY?):', e);
    return c.json({ errore: 'Il servizio non riesce a salvare i dati in modo sicuro: segnala il problema allo studio' }, 500);
  }
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
api.post('/studio/registro-accreditamento', soloAmministratore, async (c) => {
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
// ASSISTENTE AI (AR-M9) — suggerimenti, mai decisioni
//
// Disattivato finché il titolare non lo abilita accettando l'informativa.
// All'API esterna arrivano solo i testi digitati (senza nominativi, come
// impone l'interfaccia) e i testi normativi candidati; nel registro resta
// l'uso della funzione, mai il contenuto.
// ===========================================================================

async function tenantConAiAbilitata(c: Ctx): Promise<boolean> {
  const t = await c.env.DB.prepare('SELECT parametri FROM tenants WHERE id = ?').bind(c.get('tenantId')).first<any>();
  return aiAbilitata(t?.parametri);
}

api.get('/ai/stato', async (c) => {
  return c.json({
    abilitata: await tenantConAiAbilitata(c),
    chiaveConfigurata: Boolean(c.env.ANTHROPIC_API_KEY) || c.env.AI_FIXTURES === '1',
    modello: c.env.AI_MODEL ?? MODELLO_DEFAULT,
  });
});

api.post('/ai/abilita', soloAmministratore, async (c) => {
  const u = c.get('utente');
  const b = await c.req.json<any>().catch(() => ({}));
  const abilita = Boolean(b.abilita);
  if (abilita && b.accetto !== true) {
    return c.json({ errore: "Per abilitare l'assistente serve l'accettazione esplicita dell'informativa" }, 400);
  }
  const t = await c.env.DB.prepare('SELECT parametri FROM tenants WHERE id = ?').bind(u.tenant_id).first<any>();
  const parametri = (() => { try { return JSON.parse(t?.parametri ?? '{}'); } catch { return {}; } })();
  parametri.ai = abilita ? { abilitata: true, accettataIl: new Date().toISOString(), da: u.id } : { abilitata: false };
  await c.env.DB.prepare('UPDATE tenants SET parametri = ? WHERE id = ?').bind(JSON.stringify(parametri), u.tenant_id).run();
  await scriviAudit(c.env.DB, {
    tenantId: u.tenant_id, utenteId: u.id, azione: abilita ? 'ABILITA_AI' : 'DISABILITA_AI', ip: c.get('ip'),
  });
  return c.json({ ok: true, abilitata: abilita });
});

/** Suggeritore di indicatori UIF: contenuto pre-SOS → riservato al titolare (art. 38). */
api.post('/ai/indicatori', puoVedereSos, async (c) => {
  if (!(await tenantConAiAbilitata(c))) {
    return c.json({ errore: "L'assistente AI non è abilitato: il titolare può attivarlo dalle Impostazioni", codice: 'ai_disabilitata' }, 403);
  }
  const b = await c.req.json<any>().catch(() => ({}));
  const descrizione = String(b.descrizione ?? '').trim();
  if (descrizione.length < 30) {
    return c.json({ errore: 'Descrivi l’operatività con qualche dettaglio in più (senza nominativi): almeno una frase.' }, 400);
  }
  try {
    const suggerimenti = await suggerisciIndicatori(c.env, descrizione);
    await scriviAudit(c.env.DB, {
      tenantId: c.get('tenantId'), utenteId: c.get('utente').id, azione: 'USO_AI',
      dettaglio: { funzione: 'indicatori_uif', suggerimenti: suggerimenti.length }, ip: c.get('ip'),
    });
    return c.json({ suggerimenti });
  } catch (e) {
    if (e instanceof ErroreAi) return c.json({ errore: e.message }, e.status as 400);
    throw e;
  }
});

api.post('/ai/bozza', puoScrivere, async (c) => {
  if (!(await tenantConAiAbilitata(c))) {
    return c.json({ errore: "L'assistente AI non è abilitato: il titolare può attivarlo dalle Impostazioni", codice: 'ai_disabilitata' }, 403);
  }
  const tenantId = c.get('tenantId');
  const b = await c.req.json<any>().catch(() => ({}));
  const tipo = String(b.tipo ?? '');
  if (tipo !== 'SCOPO_NATURA' && tipo !== 'MOTIVAZIONE_ASTENSIONE') {
    return c.json({ errore: 'Tipo di bozza non riconosciuto' }, 400);
  }

  // Il contesto arriva dal DATABASE, mai dal client: solo campi non
  // identificativi (prestazione, natura, attività), mai denominazioni.
  const contesto: any = { appunti: String(b.appunti ?? '').slice(0, 2000) };
  if (b.fascicoloId) {
    const f = await c.env.DB.prepare(
      `SELECT f.prestazione_descrizione, f.tipo_rapporto, f.importo_operazione, cl.tipo AS natura_cliente, cl.attivita_prevalente
       FROM fascicoli f JOIN clienti cl ON cl.id = f.cliente_id WHERE f.id = ? AND f.tenant_id = ?`,
    ).bind(String(b.fascicoloId), tenantId).first<any>();
    if (f) {
      contesto.prestazione = f.prestazione_descrizione;
      contesto.tipoRapporto = f.tipo_rapporto;
      contesto.importo = f.importo_operazione;
      contesto.naturaCliente = String(f.natura_cliente ?? '').replace(/_/g, ' ').toLowerCase();
      contesto.attivitaCliente = f.attivita_prevalente ?? undefined;
    }
  }
  if (tipo === 'MOTIVAZIONE_ASTENSIONE') contesto.fondamento = String(b.fondamento ?? '');

  try {
    const bozza = await generaBozza(c.env, tipo, contesto);
    await scriviAudit(c.env.DB, {
      tenantId, utenteId: c.get('utente').id, azione: 'USO_AI',
      dettaglio: { funzione: tipo.toLowerCase() }, ip: c.get('ip'),
    });
    return c.json({ bozza });
  } catch (e) {
    if (e instanceof ErroreAi) return c.json({ errore: e.message }, e.status as 400);
    throw e;
  }
});

/**
 * Chat di assistenza (AR-M10): aperta a tutti i ruoli dello studio — è
 * aiuto all'uso, non contenuto SOS. Nessuna conservazione dei messaggi
 * lato server; nel registro solo l'uso.
 */
api.post('/ai/chat', async (c) => {
  if (!(await tenantConAiAbilitata(c))) {
    return c.json({ errore: "L'assistente AI non è abilitato: il titolare può attivarlo dalle Impostazioni", codice: 'ai_disabilitata' }, 403);
  }
  const b = await c.req.json<any>().catch(() => ({}));
  const messaggi = Array.isArray(b.messaggi) ? b.messaggi : [];
  const validi = messaggi
    .filter((m: any) => (m?.ruolo === 'utente' || m?.ruolo === 'assistente') && typeof m?.testo === 'string' && m.testo.trim())
    .slice(-16);
  if (!validi.length || validi[validi.length - 1].ruolo !== 'utente') {
    return c.json({ errore: 'Scrivi una domanda' }, 400);
  }
  try {
    const risposta = await rispostaChat(c.env, validi);
    await scriviAudit(c.env.DB, {
      tenantId: c.get('tenantId'), utenteId: c.get('utente').id, azione: 'USO_AI',
      dettaglio: { funzione: 'chat' }, ip: c.get('ip'),
    });
    return c.json({ risposta });
  } catch (e) {
    if (e instanceof ErroreAi) return c.json({ errore: e.message }, e.status as 400);
    throw e;
  }
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

// ---------------------------------------------------------------------------
// AR-M15 — L'autovalutazione alimentata dai dati.
//
// Il collaudo chiedeva che l'autovalutazione si compilasse da sola man mano
// che i clienti vengono caricati, «con una media ponderata dei rischi dei
// clienti come gli altri programmi». La media ponderata non è il metodo del
// CNDCEC e non la si implementa: il Modello AV.0 àncora tre dei quattro
// fattori del rischio inerente a percentuali del portafoglio, e quelle si
// calcolano esattamente. Il resto si propone con la sua evidenza e resta
// giudizio del professionista, che firma.
// ---------------------------------------------------------------------------

/** Fotografia del portafoglio alla data odierna, per il calcolo AV.0. */
async function leggiIndicatori(c: Ctx | Context<{ Bindings: Env; Variables: Variabili }>) {
  const tenantId = c.get('tenantId');
  const db = c.env.DB;

  const { results: righe } = await db.prepare(
    `SELECT f.id, f.codice, f.cliente_id, cl.denominazione AS cliente, f.prestazione_codice,
            f.data_conferimento, f.data_cessazione, f.modalita_identificazione, cl.paese_residenza,
            v.livello_applicabile, v.esente_verifica, v.circostanze
     FROM fascicoli f
     JOIN clienti cl ON cl.id = f.cliente_id
     LEFT JOIN valutazioni_rischio v ON v.id = (
       SELECT id FROM valutazioni_rischio WHERE fascicolo_id = f.id ORDER BY versione DESC LIMIT 1)
     WHERE f.tenant_id = ? AND cl.attivo = 1`,
  ).bind(tenantId).all<any>();

  const fascicoli: RigaFascicolo[] = (righe ?? []).map((f) => ({
    id: String(f.id),
    codice: String(f.codice),
    clienteId: String(f.cliente_id),
    cliente: String(f.cliente ?? ''),
    prestazioneCodice: String(f.prestazione_codice),
    dataConferimento: String(f.data_conferimento),
    dataCessazione: f.data_cessazione ?? null,
    livelloApplicabile: f.livello_applicabile ?? null,
    // Senza valutazione l'esenzione discende dalla prestazione: la stessa
    // regola dello scadenzario, o i conti non tornerebbero fra le pagine.
    esenteVerifica: f.livello_applicabile != null
      ? Boolean(f.esente_verifica)
      : Boolean(trovaPrestazione(String(f.prestazione_codice))?.esenteAdeguataVerifica),
    circostanze: (() => { try { return JSON.parse(f.circostanze ?? '{}'); } catch { return {}; } })(),
    modalitaIdentificazione: f.modalita_identificazione ?? null,
    paeseCliente: f.paese_residenza ?? null,
  }));

  const numero = async (sql: string, ...bind: unknown[]) =>
    (await db.prepare(sql).bind(...bind).first<{ n: number }>())?.n ?? 0;

  const attiviSql = "f.tenant_id = ? AND f.data_cessazione IS NULL AND f.stato != 'CESSATO'";
  const [
    utentiAttivi, formazioneUltimoAnno, formazionePartecipanti, fascicoliAttivi,
    fascicoliConValutazione, fascicoliConValutazioneFirmata, clientiSocietariSenzaTitolare,
    documentiTotali, documentiEntro30Giorni, fascicoliSenzaDocumenti,
    sosTotali, sosNonConcluse, astensioniTotali,
  ] = await Promise.all([
    numero('SELECT COUNT(*) AS n FROM utenti WHERE tenant_id = ? AND attivo = 1', tenantId),
    numero("SELECT COUNT(*) AS n FROM formazione WHERE tenant_id = ? AND data_evento >= date('now','-12 months')", tenantId),
    numero(
      `SELECT COUNT(DISTINCT COALESCE(utente_id, partecipante)) AS n FROM formazione
       WHERE tenant_id = ? AND data_evento >= date('now','-12 months')`, tenantId),
    numero(`SELECT COUNT(*) AS n FROM fascicoli f WHERE ${attiviSql}`, tenantId),
    numero(`SELECT COUNT(*) AS n FROM fascicoli f WHERE ${attiviSql}
              AND EXISTS (SELECT 1 FROM valutazioni_rischio v WHERE v.fascicolo_id = f.id)`, tenantId),
    numero(`SELECT COUNT(*) AS n FROM fascicoli f WHERE ${attiviSql}
              AND EXISTS (SELECT 1 FROM valutazioni_rischio v WHERE v.fascicolo_id = f.id AND v.firmata_il IS NOT NULL)`, tenantId),
    numero(
      `SELECT COUNT(*) AS n FROM clienti c
        WHERE c.tenant_id = ? AND c.attivo = 1
          AND c.tipo IN ('SOCIETA_CAPITALI','SOCIETA_PERSONE','ENTE_NON_PROFIT','TRUST')
          AND NOT EXISTS (SELECT 1 FROM titolari_effettivi t WHERE t.cliente_id = c.id AND t.valido_al IS NULL)`, tenantId),
    numero('SELECT COUNT(*) AS n FROM documenti WHERE tenant_id = ?', tenantId),
    // Art. 31 co. 3: acquisizione entro trenta giorni dal fatto documentato.
    numero(
      `SELECT COUNT(*) AS n FROM documenti
        WHERE tenant_id = ? AND data_riferimento IS NOT NULL AND data_acquisizione IS NOT NULL
          AND julianday(substr(data_acquisizione,1,10)) - julianday(substr(data_riferimento,1,10)) <= 30`, tenantId),
    numero(`SELECT COUNT(*) AS n FROM fascicoli f WHERE ${attiviSql}
              AND NOT EXISTS (SELECT 1 FROM documenti d WHERE d.fascicolo_id = f.id)`, tenantId),
    numero('SELECT COUNT(*) AS n FROM segnalazioni_sospette WHERE tenant_id = ?', tenantId),
    numero("SELECT COUNT(*) AS n FROM segnalazioni_sospette WHERE tenant_id = ? AND stato IN ('BOZZA','IN_VALUTAZIONE')", tenantId),
    numero('SELECT COUNT(*) AS n FROM astensioni WHERE tenant_id = ?', tenantId),
  ]);

  const scadenzario = await calcolaScadenzario(db, tenantId);
  const controlliScaduti = scadenzario.scadute.filter((v: any) => v.tipo === 'CONTROLLO_COSTANTE').length;

  const vuln: RigheVulnerabilita = {
    utentiAttivi, formazioneUltimoAnno, formazionePartecipanti, fascicoliAttivi,
    fascicoliConValutazione, fascicoliConValutazioneFirmata, controlliScaduti,
    clientiSocietariSenzaTitolare, documentiTotali, documentiEntro30Giorni,
    fascicoliSenzaDocumenti, sosTotali, sosNonConcluse, astensioniTotali,
  };

  return calcolaIndicatori(fascicoli, vuln, oggi());
}

/** Punteggi registrati in una versione dell'autovalutazione. */
function punteggiDi(av: any): { inerente?: Record<string, number>; vulnerabilita?: Record<string, number> } | null {
  if (!av?.punteggi) return null;
  try { return JSON.parse(av.punteggi); } catch { return null; }
}

/**
 * I dati del portafoglio, sempre vivi, con lo scostamento rispetto alla
 * versione FIRMATA. L'autovalutazione firmata non si tocca (art. 32 co. 2
 * lett. c): qui si dice soltanto se conviene emetterne una nuova.
 */
api.get('/studio/indicatori', async (c) => {
  const tenantId = c.get('tenantId');
  const indicatori = await leggiIndicatori(c);
  const firmata = await c.env.DB.prepare(
    'SELECT * FROM autovalutazioni WHERE tenant_id = ? AND firmata_il IS NOT NULL ORDER BY versione DESC LIMIT 1',
  ).bind(tenantId).first<any>();

  const scostamenti = calcolaScostamenti(indicatori, punteggiDi(firmata));
  // Art. 15: l'autovalutazione va aggiornata periodicamente, e comunque
  // almeno ogni tre anni. Il promemoria vive qui, accanto ai dati che
  // giustificano l'aggiornamento.
  const scadutaPerTempo = firmata
    ? String(firmata.data_valutazione ?? '').slice(0, 10) < aggiungiAnni(oggi(), -3)
    : false;

  return c.json({
    indicatori,
    versioneFirmata: firmata
      ? { id: firmata.id, versione: firmata.versione, data: firmata.data_valutazione, classe: firmata.classe }
      : null,
    scostamenti,
    scadutaPerTempo,
    daAggiornare: scostamenti.length > 0 || scadutaPerTempo || !firmata,
  });
});

api.post('/studio/autovalutazioni', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const body = await c.req.json<any>();
  const rs = ruleset(body.rulesetId);

  // Il calcolo è del dominio: la route non conosce pesi né soglie.
  const esito = calcolaAutovalutazione({ inerente: body.inerente, vulnerabilita: body.vulnerabilita }, rs);

  // AR-M15. Gli indicatori si ricalcolano QUI, non si accettano dal client:
  // sono la prova di come si è arrivati al punteggio e devono venire dal
  // database, non dal browser. Dove il punteggio scelto si discosta dal
  // proposto, il ruleset stesso pretende «un'altra valutazione motivata»:
  // qui la motivazione diventa un campo obbligatorio, non un auspicio.
  const indicatori = await leggiIndicatori(c);
  const motivazioni: Record<string, string> = body.motivazioniScostamento ?? {};
  const fattori: Record<string, unknown> = {};
  const mancanti: string[] = [];
  const registra = (elenco: typeof indicatori.inerente, scelti: Record<string, number> | undefined, gruppo: string) => {
    for (const i of elenco) {
      const scelto = scelti?.[i.codice];
      if (typeof scelto !== 'number') continue;
      const motivazione = String(motivazioni[i.codice] ?? '').trim().slice(0, 500);
      const scostato = i.punteggio !== null && !i.indicativo && scelto !== i.punteggio;
      // La motivazione si pretende solo quando il dato ha un fondamento:
      // archivio con un numero significativo di fascicoli e un denominatore
      // reale. Altrimenti si chiederebbe al professionista di giustificarsi
      // davanti a una percentuale calcolata sul nulla — che è il contrario
      // di quello che serve.
      const vincolante = scostato && indicatori.significativo && i.denominatore > 0;
      if (vincolante && motivazione.length < 3) mancanti.push(i.etichetta);
      fattori[i.codice] = {
        gruppo,
        etichetta: i.etichetta,
        proposto: i.punteggio,
        scelto,
        origine: i.punteggio === null ? 'MANUALE' : scostato ? 'MODIFICATO' : 'CALCOLATO',
        motivazione: scostato ? motivazione : null,
        percentuale: i.percentuale,
        numeratore: i.numeratore,
        denominatore: i.denominatore,
        spiegazione: i.spiegazione,
      };
    }
  };
  registra(indicatori.inerente, body.inerente, 'inerente');
  registra(indicatori.vulnerabilita, body.vulnerabilita, 'vulnerabilita');
  if (mancanti.length) {
    return c.json({
      errore: `Il punteggio scelto si discosta da quello calcolato sui dati dello studio: motivare ${mancanti.join(', ')}.`,
      fattoriDaMotivare: mancanti,
    }, 400);
  }
  const snapshot = {
    calcolatoIl: indicatori.calcolatoIl,
    significativo: indicatori.significativo,
    minimoSignificativo: indicatori.minimoSignificativo,
    clientiAttivi: indicatori.clientiAttivi,
    fascicoliAttivi: indicatori.fascicoliAttivi,
    fattori,
  };

  const ultima = await c.env.DB.prepare('SELECT MAX(versione) AS v FROM autovalutazioni WHERE tenant_id = ?')
    .bind(tenantId)
    .first<{ v: number | null }>();
  const versione = (ultima?.v ?? 0) + 1;
  const id = nuovoId('av');

  await c.env.DB.prepare(
    `INSERT INTO autovalutazioni
     (id, tenant_id, versione, ruleset_id, data_valutazione, punteggi, rischio_inerente, vulnerabilita,
      rischio_residuo, classe, formula, note, presidi, creato_da, indicatori)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
      // Congelato con la versione: i clienti cambiano, il verbale no.
      JSON.stringify(snapshot),
    )
    .run();

  await scriviAudit(c.env.DB, {
    tenantId,
    utenteId: u.id,
    azione: 'CREA_AUTOVALUTAZIONE',
    entita: 'autovalutazioni',
    entitaId: id,
    dettaglio: {
      versione, classe: esito.classe, rischioResiduo: esito.rischioResiduo,
      fattoriModificati: Object.entries(fattori).filter(([, v]: any) => v.origine === 'MODIFICATO').map(([k]) => k),
    },
    ip: c.get('ip'),
  });

  return c.json({ id, versione, esito, indicatori: snapshot }, 201);
});

api.post('/studio/autovalutazioni/:id/firma', soloTitolare, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const id = c.req.param('id');
  const b = await c.req.json<any>().catch(() => ({}));
  // L'autovalutazione è dello studio: la firma chiunque sia professionista.
  // Una nota di firma resta comunque disponibile per i casi in cui firmi
  // qualcuno in luogo del referente antiriciclaggio.
  const nota = String(b.motivazioneFirma ?? '').trim().slice(0, 500) || null;
  const r = await c.env.DB.prepare('UPDATE autovalutazioni SET firmata_da = ?, firmata_il = ?, firma_motivazione = ? WHERE id = ? AND tenant_id = ? AND firmata_il IS NULL')
    .bind(u.id, new Date().toISOString(), nota, id, tenantId)
    .run();
  if (!r.meta.changes) return c.json({ errore: 'Autovalutazione inesistente o già firmata' }, 409);
  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'FIRMA_AUTOVALUTAZIONE', entita: 'autovalutazioni', entitaId: id, ip: c.get('ip') });
  return c.json({ ok: true });
});

// ===========================================================================
// CLIENTI E TITOLARITÀ EFFETTIVA
// ===========================================================================

/** Nature giuridiche ammesse: la stessa lista del CHECK sulla tabella clienti. */
const TIPI_CLIENTE = ['PERSONA_FISICA', 'SOCIETA_CAPITALI', 'SOCIETA_PERSONE', 'ENTE_NON_PROFIT', 'TRUST', 'ALTRO'];

/**
 * Che cosa resta appeso a un cliente (AR-M14). Serve a decidere se può essere
 * cancellato davvero o solo archiviato: dove c'è un fascicolo, un documento,
 * una SOS o una verifica a distanza, l'art. 31 impone la conservazione
 * decennale e la cancellazione fisica non è un'opzione.
 */
async function collegamentiCliente(db: D1Database, tenantId: string, clienteId: string) {
  const conta = async (tabella: string) =>
    (await db.prepare(`SELECT COUNT(*) AS n FROM ${tabella} WHERE cliente_id = ? AND tenant_id = ?`)
      .bind(clienteId, tenantId)
      .first<{ n: number }>())?.n ?? 0;
  const [fascicoli, documenti, segnalazioni, verifiche] = await Promise.all([
    conta('fascicoli'),
    conta('documenti'),
    conta('segnalazioni_sospette'),
    conta('richieste_verifica'),
  ]);
  return {
    fascicoli,
    documenti,
    segnalazioni,
    verifiche,
    eliminabile: fascicoli + documenti + segnalazioni + verifiche === 0,
  };
}

api.get('/clienti', async (c) => {
  // ?archiviati=1 mostra anche i clienti archiviati (attivo = 0), altrimenti
  // l'archiviazione sarebbe un vicolo cieco: si nasconde e non si ritrova più.
  const conArchiviati = c.req.query('archiviati') === '1';
  // ?professionista=<id> (AR-M15): negli studi associati serve vedere «i miei».
  // La visibilità resta di studio: questo è un filtro, non una barriera.
  const professionista = c.req.query('professionista') ?? null;
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.tipo, c.denominazione, c.codice_fiscale, c.partita_iva, c.paese_residenza, c.pep, c.attivo,
            c.professionista_id, u.nome AS professionista,
            (SELECT COUNT(*) FROM fascicoli f WHERE f.cliente_id = c.id) AS fascicoli
     FROM clienti c
     LEFT JOIN utenti u ON u.id = c.professionista_id
     WHERE c.tenant_id = ?${conArchiviati ? '' : ' AND c.attivo = 1'}${professionista ? ' AND c.professionista_id = ?' : ''}
     ORDER BY c.attivo DESC, c.denominazione`,
  )
    .bind(...(professionista ? [c.get('tenantId'), professionista] : [c.get('tenantId')]))
    .all();
  return c.json(results ?? []);
});

api.post('/clienti', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const b = await c.req.json<any>();
  if (!b.denominazione || !b.tipo) return c.json({ errore: 'Denominazione e tipo sono obbligatori' }, 400);

  // AR-M15: il professionista di riferimento del cliente. Se non è indicato
  // ed è un professionista a inserire, è lui; se inserisce un collaboratore
  // va detto per nome, perché chi inserisce non firma.
  const prof = await risolviProfessionista(c.env.DB, tenantId, b.professionistaId, u);
  if ('errore' in prof) return c.json({ errore: prof.errore }, 400);

  const id = nuovoId('cli');
  // I dati identificativi di dettaglio sono cifrati: sono la parte più sensibile
  // dell'anagrafica (documento, luogo e data di nascita, residenza).
  const dati = b.datiIdentificativi ? await cifra(c.env.MASTER_KEY, tenantId, JSON.stringify(b.datiIdentificativi)) : null;

  await c.env.DB.prepare(
    `INSERT INTO clienti (id, tenant_id, tipo, denominazione, codice_fiscale, partita_iva, dati_identificativi,
      paese_residenza, attivita_prevalente, ateco, pep, pep_organo_pubblico, note, creato_da, professionista_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      id, tenantId, b.tipo, b.denominazione, b.codiceFiscale ?? null, b.partitaIva ?? null,
      dati ? JSON.stringify(dati) : null, b.paeseResidenza ?? 'IT', b.attivitaPrevalente ?? null,
      b.ateco ?? null, b.pep ? 1 : 0, b.pepOrganoPubblico ? 1 : 0, b.note ?? null, u.id, prof.id,
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

  const collegamenti = await collegamentiCliente(c.env.DB, tenantId, id);
  // AR-M17: documenti agganciati al cliente (visure, incarico) e compagine vigente in sintesi.
  const { results: documenti } = await c.env.DB.prepare(
    'SELECT id, tipo, nome_file, dimensione, sha256, data_riferimento, data_acquisizione, conserva_fino_al FROM documenti WHERE cliente_id = ? AND tenant_id = ? ORDER BY data_acquisizione DESC',
  ).bind(id, tenantId).all();
  const compagine = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM partecipazioni WHERE cliente_id = ?1 AND tenant_id = ?2 AND valido_al IS NULL) AS soci,
            (SELECT COUNT(*) FROM cariche WHERE cliente_id = ?1 AND tenant_id = ?2 AND valido_al IS NULL) AS cariche,
            (SELECT MAX(fonte_data) FROM partecipazioni WHERE cliente_id = ?1 AND tenant_id = ?2 AND valido_al IS NULL) AS fonteData,
            (SELECT COUNT(*) FROM proposte WHERE cliente_id = ?1 AND tenant_id = ?2 AND stato = 'PROPOSTA') AS proposteAperte`,
  ).bind(id, tenantId).first<any>();
  if (cliente.professionista_id) {
    const p = await c.env.DB.prepare('SELECT nome FROM utenti WHERE id = ?').bind(cliente.professionista_id).first<any>();
    cliente.professionista = p?.nome ?? null;
  }

  await scriviAudit(c.env.DB, { tenantId, utenteId: c.get('utente').id, azione: 'LEGGI_CLIENTE', entita: 'clienti', entitaId: id, ip: c.get('ip') });
  return c.json({ cliente, titolariEffettivi: titolari ?? [], fascicoli: fascicoli ?? [], collegamenti, documenti: documenti ?? [], compagine });
});

/**
 * Modifica dell'anagrafica (AR-M14). Aggiorna solo i campi presenti nel corpo:
 * l'import deduce la natura giuridica dalla denominazione e va corretta a mano
 * quando sbaglia, come la finestra di import promette.
 */
api.patch('/clienti/:id', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const id = c.req.param('id');
  const b = await c.req.json<any>();

  const esistente = await c.env.DB.prepare('SELECT id FROM clienti WHERE id = ? AND tenant_id = ?')
    .bind(id, tenantId).first<any>();
  if (!esistente) return c.json({ errore: 'Cliente non trovato' }, 404);

  if (b.denominazione !== undefined && !String(b.denominazione).trim()) {
    return c.json({ errore: 'La denominazione non può restare vuota.' }, 400);
  }
  if (b.tipo !== undefined && !TIPI_CLIENTE.includes(b.tipo)) {
    return c.json({ errore: 'Natura giuridica non ammessa.' }, 400);
  }

  const set: string[] = [];
  const valori: unknown[] = [];
  const testo = (chiave: string, colonna: string) => {
    if (b[chiave] === undefined) return;
    const v = typeof b[chiave] === 'string' ? b[chiave].trim() : b[chiave];
    set.push(`${colonna} = ?`);
    valori.push(v === '' ? null : v);
  };
  testo('tipo', 'tipo');
  testo('denominazione', 'denominazione');
  testo('codiceFiscale', 'codice_fiscale');
  testo('partitaIva', 'partita_iva');
  testo('attivitaPrevalente', 'attivita_prevalente');
  testo('ateco', 'ateco');
  testo('note', 'note');
  // paese_residenza è NOT NULL: svuotarlo significa tornare al default.
  if (b.paeseResidenza !== undefined) {
    set.push('paese_residenza = ?');
    valori.push(String(b.paeseResidenza).trim().toUpperCase() || 'IT');
  }
  if (b.pep !== undefined) { set.push('pep = ?'); valori.push(b.pep ? 1 : 0); }
  if (b.pepOrganoPubblico !== undefined) { set.push('pep_organo_pubblico = ?'); valori.push(b.pepOrganoPubblico ? 1 : 0); }
  if (b.professionistaId !== undefined) {
    const prof = await risolviProfessionista(c.env.DB, tenantId, b.professionistaId, u);
    if ('errore' in prof) return c.json({ errore: prof.errore }, 400);
    set.push('professionista_id = ?');
    valori.push(prof.id);
  }
  if (b.datiIdentificativi !== undefined) {
    const dati = b.datiIdentificativi
      ? await cifra(c.env.MASTER_KEY, tenantId, JSON.stringify(b.datiIdentificativi))
      : null;
    set.push('dati_identificativi = ?');
    valori.push(dati ? JSON.stringify(dati) : null);
  }
  if (set.length === 0) return c.json({ errore: 'Nessun campo da aggiornare.' }, 400);

  set.push("aggiornato_il = datetime('now')");
  await c.env.DB.prepare(`UPDATE clienti SET ${set.join(', ')} WHERE id = ? AND tenant_id = ?`)
    .bind(...valori, id, tenantId)
    .run();

  await scriviAudit(c.env.DB, {
    tenantId, utenteId: u.id, azione: 'AGGIORNA_CLIENTE', entita: 'clienti', entitaId: id,
    dettaglio: { campi: Object.keys(b) }, ip: c.get('ip'),
  });
  return c.json({ ok: true });
});

/**
 * Archiviazione e ripristino (AR-M14). L'archiviazione toglie il cliente dagli
 * elenchi senza toccare un byte di quanto è stato registrato: è la via
 * compatibile con la conservazione decennale dell'art. 31.
 */
api.post('/clienti/:id/archiviazione', soloTitolare, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const id = c.req.param('id');
  const b = await c.req.json<any>().catch(() => ({}));
  const archivia = b.archivia !== false;

  const esito = await c.env.DB.prepare(
    "UPDATE clienti SET attivo = ?, aggiornato_il = datetime('now') WHERE id = ? AND tenant_id = ?",
  ).bind(archivia ? 0 : 1, id, tenantId).run();
  if (!esito.meta.changes) return c.json({ errore: 'Cliente non trovato' }, 404);

  await scriviAudit(c.env.DB, {
    tenantId, utenteId: u.id, azione: archivia ? 'ARCHIVIA_CLIENTE' : 'RIPRISTINA_CLIENTE',
    entita: 'clienti', entitaId: id, ip: c.get('ip'),
  });
  return c.json({ ok: true, attivo: archivia ? 0 : 1 });
});

/**
 * Cancellazione definitiva (AR-M14). Riservata all'amministratore dello
 * studio (AR-M15: non a ogni associato) e consentita solo se al cliente non
 * è appeso nulla di conservabile: serve a rimediare a un inserimento
 * sbagliato o a un import di prova, non a ripulire la storia.
 */
api.delete('/clienti/:id', soloAmministratore, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const id = c.req.param('id');

  const cliente = await c.env.DB.prepare(
    'SELECT id, denominazione, codice_fiscale, partita_iva FROM clienti WHERE id = ? AND tenant_id = ?',
  ).bind(id, tenantId).first<any>();
  if (!cliente) return c.json({ errore: 'Cliente non trovato' }, 404);
  const clienteId = String(cliente.id);

  const collegamenti = await collegamentiCliente(c.env.DB, tenantId, clienteId);
  if (!collegamenti.eliminabile) {
    return c.json({
      codice: 'cliente_collegato',
      errore:
        'Il cliente ha già documentazione registrata (fascicoli, documenti, segnalazioni o verifiche a distanza): '
        + 'l’art. 31 ne impone la conservazione per dieci anni. Puoi archiviarlo, così sparisce dagli elenchi '
        + 'senza perdere nulla di quanto registrato.',
      collegamenti,
    }, 409);
  }

  // L'audit precede la cancellazione: dopo, il riferimento non sarebbe più
  // risolvibile e nel registro resterebbe un id muto.
  await scriviAudit(c.env.DB, {
    tenantId, utenteId: u.id, azione: 'ELIMINA_CLIENTE', entita: 'clienti', entitaId: id,
    dettaglio: {
      denominazione: cliente.denominazione,
      codiceFiscale: cliente.codice_fiscale,
      partitaIva: cliente.partita_iva,
    },
    ip: c.get('ip'),
  });

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM titolari_effettivi WHERE cliente_id = ? AND tenant_id = ?').bind(id, tenantId),
    // AR-M17: compagine, cariche e proposte seguono il cliente (nessun documento: già verificato sopra).
    c.env.DB.prepare('DELETE FROM partecipazioni WHERE cliente_id = ? AND tenant_id = ?').bind(id, tenantId),
    c.env.DB.prepare('DELETE FROM cariche WHERE cliente_id = ? AND tenant_id = ?').bind(id, tenantId),
    c.env.DB.prepare('DELETE FROM proposte WHERE cliente_id = ? AND tenant_id = ?').bind(id, tenantId),
    c.env.DB.prepare("DELETE FROM screening_esiti WHERE tenant_id = ? AND soggetto_tipo IN ('SOCIO','CARICA') AND soggetto_id IN (SELECT id FROM partecipazioni WHERE cliente_id = ?3 UNION SELECT id FROM cariche WHERE cliente_id = ?3)").bind(tenantId, id, id),
    c.env.DB.prepare('DELETE FROM clienti WHERE id = ? AND tenant_id = ?').bind(id, tenantId),
  ]);

  return c.json({ ok: true });
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
  // AR-M17: se la fotografia nasce da una proposta del programma, la proposta
  // si chiude con l'esito (applicata tale e quale, o modificata: e allora si
  // dice il perché). È ciò che in ispezione dimostra la valutazione.
  let propostaEsito: string | null = null;
  if (typeof b.propostaId === 'string' && b.propostaId) {
    propostaEsito = b.propostaModificata ? 'MODIFICATA' : 'APPLICATA';
    const esito = JSON.stringify(await cifra(c.env.MASTER_KEY, tenantId, JSON.stringify({
      motivazione: b.propostaMotivazione ?? null, titolariRegistrati: b.titolari.map((t: any) => ({ nominativo: t.nominativo, criterio: t.criterio, quota: t.quota ?? null })),
    })));
    await c.env.DB.prepare(
      "UPDATE proposte SET stato = ?, esito = ?, rivista_da = ?, rivista_il = datetime('now') WHERE id = ? AND tenant_id = ? AND cliente_id = ? AND stato = 'PROPOSTA'",
    ).bind(propostaEsito, esito, u.id, b.propostaId, tenantId, clienteId).run();
  }
  await scriviAudit(c.env.DB, {
    tenantId, utenteId: u.id, azione: 'AGGIORNA_TITOLARITA', entita: 'clienti', entitaId: clienteId,
    dettaglio: { numeroTitolari: b.titolari.length, adesso, propostaId: b.propostaId ?? null, propostaEsito }, ip: c.get('ip'),
  });
  return c.json({ ok: true, propostaEsito });
});

// ===========================================================================
// AR-M17 — ANAGRAFICHE DA VISURA, COMPAGINE, PROPOSTE, DOCUMENTI DEL CLIENTE
// Il PDF viene letto nel browser (parser locale, niente AI): qui arrivano
// dati già strutturati e rivisti dall'utente. Il programma PROPONE, il
// professionista conferma: nessuna proposta produce effetti da sola.
// ===========================================================================

/** Campi dell'anagrafica accettati dal flusso «da visura» (stessi di POST/PATCH /clienti). */
function anagraficaDaCorpo(b: any) {
  const t = (v: unknown): string | null => (typeof v === 'string' ? v.trim() : v == null ? null : String(v));
  return {
    denominazione: t(b.denominazione) || '', tipo: String(b.tipo ?? ''), codiceFiscale: t(b.codiceFiscale)?.toUpperCase() || null, partitaIva: t(b.partitaIva) || null,
    paeseResidenza: String(b.paeseResidenza ?? 'IT').trim().toUpperCase() || 'IT', attivitaPrevalente: t(b.attivitaPrevalente) || null,
    ateco: t(b.ateco) || null, pep: Boolean(b.pep), pepOrganoPubblico: Boolean(b.pepOrganoPubblico), note: t(b.note) || null,
    datiIdentificativi: b.datiIdentificativi && typeof b.datiIdentificativi === 'object' ? b.datiIdentificativi : null,
  };
}

/** Soci e cariche dal corpo (già rivisti nel browser), con validazione minima. */
function compagineDaCorpo(b: any): { soci: SocioIn[]; cariche: CaricaIn[] } {
  const DIRITTI = ['PROPRIETA', 'NUDA_PROPRIETA', 'USUFRUTTO', 'PEGNO', 'SEQUESTRO', 'PIGNORAMENTO', 'COMPROPRIETA', 'ALTRO'];
  const TIPI = ['PERSONA_FISICA', 'PERSONA_GIURIDICA', 'FIDUCIARIA', 'TRUST', 'ALTRO'];
  const soci: SocioIn[] = (Array.isArray(b.soci) ? b.soci : [])
    .filter((s: any) => s && typeof s.nome === 'string' && s.nome.trim() && Number.isFinite(Number(s.quotaPercento)))
    .map((s: any) => ({
      nome: String(s.nome).trim(), codiceFiscale: s.codiceFiscale ? String(s.codiceFiscale).trim().toUpperCase() : null,
      tipo: TIPI.includes(s.tipo) ? s.tipo : 'ALTRO', quotaNominale: s.quotaNominale != null ? Number(s.quotaNominale) : null,
      quotaPercento: Math.max(0, Math.min(100, Number(s.quotaPercento))), diritto: DIRITTI.includes(s.diritto) ? s.diritto : 'PROPRIETA',
      quoteProprie: Boolean(s.quoteProprie), comproprieta: Boolean(s.comproprieta), paese: s.paese ? String(s.paese).toUpperCase().slice(0, 2) : null,
      domicilio: s.domicilio ?? null, pec: s.pec ?? null, versato: s.versato != null ? Number(s.versato) : null,
    }));
  const cariche: CaricaIn[] = (Array.isArray(b.cariche) ? b.cariche : [])
    .filter((c: any) => c && typeof c.nome === 'string' && c.nome.trim())
    .map((c: any) => ({
      nome: String(c.nome).trim(), codiceFiscale: c.codiceFiscale ? String(c.codiceFiscale).trim().toUpperCase() : null,
      carica: typeof c.carica === 'string' ? c.carica : 'ALTRO', caricaTesto: c.caricaTesto ?? null, rappresentanzaLegale: Boolean(c.rappresentanzaLegale),
      dataNomina: c.dataNomina ?? null, durata: c.durata ?? null, natoA: c.natoA ?? null, dataNascita: c.dataNascita ?? null,
      domicilio: c.domicilio ?? null, pec: c.pec ?? null, poteri: c.poteri ?? null, paese: c.paese ?? null,
    }));
  return { soci, cariche };
}

/** Telemetria ANONIMA del parser (M17-14): etichette non trovate, mai valori. */
async function audioVisuraLetta(c: Context<{ Bindings: Env; Variables: Variabili }>, tenantId: string, clienteId: string | null, b: any) {
  const t = b?.telemetria ?? {};
  await scriviAudit(c.env.DB, {
    tenantId, utenteId: c.get('utente').id, azione: 'VISURA_LETTA', entita: 'clienti', entitaId: clienteId ?? undefined,
    dettaglio: {
      tipoVisura: t.tipoVisura ?? null, formaVisura: t.formaVisura ?? null, pagine: Number(t.pagine) || null,
      campiNonTrovati: Array.isArray(t.campiNonTrovati) ? t.campiNonTrovati.slice(0, 30).map(String) : [],
      avvisi: Number(t.avvisi) || 0, soci: Number(t.soci) || 0, cariche: Number(t.cariche) || 0,
      tipoIncerto: Boolean(t.tipoIncerto), dataEstrazione: t.dataEstrazione ?? null,
    },
    ip: c.get('ip'),
  });
}

/** Doppioni: stesso CF o stessa P.IVA già in anagrafica (anche archiviati). */
async function clienteDoppione(db: D1Database, tenantId: string, cf: string | null, piva: string | null, escludi?: string) {
  if (!cf && !piva) return null;
  const r = await db.prepare(
    `SELECT id, denominazione, attivo FROM clienti WHERE tenant_id = ? ${escludi ? 'AND id != ?' : ''}
     AND ((? IS NOT NULL AND codice_fiscale = ?) OR (? IS NOT NULL AND partita_iva = ?)) ORDER BY attivo DESC LIMIT 1`,
  ).bind(...(escludi ? [tenantId, escludi] : [tenantId]), cf, cf, piva, piva).first<any>();
  return r ? { id: String(r.id), denominazione: String(r.denominazione), attivo: r.attivo === 1 } : null;
}

/**
 * Nuovo cliente da visura. Il corpo porta l'anagrafica rivista, soci e
 * cariche letti dal PDF, i dettagli per `dati_identificativi` e la data della
 * visura. Crea il cliente, persiste la compagine, calcola e registra la
 * proposta di titolarità con gli alert, lancia lo screening dei nomi. Il PDF
 * si carica subito dopo con POST /clienti/:id/documenti.
 */
api.post('/clienti/da-visura', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const b = await c.req.json<any>();
  const a = anagraficaDaCorpo(b.anagrafica ?? {});
  if (!a.denominazione || !a.tipo) return c.json({ errore: 'Denominazione e natura giuridica sono obbligatorie.' }, 400);
  if (!TIPI_CLIENTE.includes(a.tipo)) return c.json({ errore: 'Natura giuridica non ammessa.' }, 400);
  if (a.partitaIva && !normalizzaPiva(a.partitaIva)) return c.json({ errore: 'La partita IVA non è formalmente valida.' }, 400);

  const doppione = await clienteDoppione(c.env.DB, tenantId, a.codiceFiscale, a.partitaIva);
  if (doppione) {
    return c.json({
      codice: 'doppione', clienteId: doppione.id, denominazione: doppione.denominazione, attivo: doppione.attivo,
      errore: `${doppione.denominazione} è già in anagrafica con lo stesso codice fiscale o partita IVA${doppione.attivo ? '' : ' (archiviato)'}: apri la scheda e usa «Aggiorna da visura».`,
    }, 409);
  }
  const prof = await risolviProfessionista(c.env.DB, tenantId, b.anagrafica?.professionistaId, u);
  if ('errore' in prof) return c.json({ errore: prof.errore }, 400);

  const id = nuovoId('cli');
  const dati = a.datiIdentificativi ? await cifra(c.env.MASTER_KEY, tenantId, JSON.stringify(a.datiIdentificativi)) : null;
  await c.env.DB.prepare(
    `INSERT INTO clienti (id, tenant_id, tipo, denominazione, codice_fiscale, partita_iva, dati_identificativi,
      paese_residenza, attivita_prevalente, ateco, pep, pep_organo_pubblico, note, creato_da, professionista_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    id, tenantId, a.tipo, a.denominazione, a.codiceFiscale, a.partitaIva, dati ? JSON.stringify(dati) : null, a.paeseResidenza,
    a.attivitaPrevalente, a.ateco, a.pep ? 1 : 0, a.pepOrganoPubblico ? 1 : 0, a.note, u.id, prof.id,
  ).run();

  const { soci, cariche } = compagineDaCorpo(b);
  const dataVisura = typeof b.dataVisura === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.dataVisura) ? b.dataVisura : null;
  const diff = await salvaCompagine(c.env, tenantId, id, u.id, { soci, cariche, fonte: 'VISURA', fonteData: b.dataElencoSoci ?? dataVisura });
  await registraProposta(c.env, tenantId, id, u.id, 'ANAGRAFICA', 'VISURA', { anagrafica: a, dataVisura, applicataAllaCreazione: true }, [], 'APPLICATA');

  const screening = await screeningCompagine(c.env, tenantId, id).catch(() => ({ eseguito: false, nuove: 0 }));
  const proposta = await propostaTitolarita(c.env, tenantId, { id, denominazione: a.denominazione, tipo: a.tipo, codice_fiscale: a.codiceFiscale },
    { capitale: b.capitale ?? null, dataVisura, dataElencoSoci: b.dataElencoSoci ?? null });
  let propostaId: string | null = null;
  if (soci.length || cariche.length) {
    propostaId = await registraProposta(c.env, tenantId, id, u.id, 'TITOLARITA', 'VISURA',
      { titolari: proposta.analisi.titolari, criterio: proposta.analisi.criterioApplicato, bozzaMotivazione: proposta.bozzaMotivazione, dataVisura }, proposta.alert);
  }

  await audioVisuraLetta(c, tenantId, id, b);
  await scriviAudit(c.env.DB, {
    tenantId, utenteId: u.id, azione: 'CREA_CLIENTE', entita: 'clienti', entitaId: id,
    dettaglio: { origine: 'VISURA', dataVisura, soci: soci.length, cariche: cariche.length, alert: proposta.alert.map((x) => x.codice) }, ip: c.get('ip'),
  });
  return c.json({ id, diff, proposta: { ...proposta, id: propostaId }, screening }, 201);
});

/**
 * Aggiorna un cliente esistente da una visura più recente: PATCH selettivo
 * dei campi scelti dall'utente (confronto campo per campo fatto nel browser),
 * diff della compagine e delle cariche, nuova proposta di titolarità. È la
 * risposta operativa al controllo costante.
 */
api.post('/clienti/:id/da-visura', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const id = c.req.param('id') as string;
  const b = await c.req.json<any>();
  const cliente = await c.env.DB.prepare('SELECT id, denominazione, tipo, codice_fiscale, partita_iva, dati_identificativi FROM clienti WHERE id = ? AND tenant_id = ?')
    .bind(id, tenantId).first<any>();
  if (!cliente) return c.json({ errore: 'Cliente non trovato' }, 404);

  // 1. Campi dell'anagrafica scelti dall'utente.
  const campi = b.campi && typeof b.campi === 'object' ? b.campi : {};
  const set: string[] = [];
  const valori: unknown[] = [];
  const applicati: string[] = [];
  const testo = (chiave: string, colonna: string) => {
    if (campi[chiave] === undefined) return;
    const v = typeof campi[chiave] === 'string' ? campi[chiave].trim() : campi[chiave];
    set.push(`${colonna} = ?`); valori.push(v === '' ? null : v); applicati.push(chiave);
  };
  if (campi.tipo !== undefined && !TIPI_CLIENTE.includes(campi.tipo)) return c.json({ errore: 'Natura giuridica non ammessa.' }, 400);
  if (campi.codiceFiscale || campi.partitaIva) {
    const dopp = await clienteDoppione(c.env.DB, tenantId, campi.codiceFiscale ?? null, campi.partitaIva ?? null, id);
    if (dopp) return c.json({ codice: 'doppione', clienteId: dopp.id, errore: `Codice fiscale o partita IVA già presenti su ${dopp.denominazione}.` }, 409);
  }
  testo('tipo', 'tipo'); testo('denominazione', 'denominazione'); testo('codiceFiscale', 'codice_fiscale'); testo('partitaIva', 'partita_iva');
  testo('attivitaPrevalente', 'attivita_prevalente'); testo('ateco', 'ateco'); testo('note', 'note');
  if (campi.paeseResidenza !== undefined) { set.push('paese_residenza = ?'); valori.push(String(campi.paeseResidenza).trim().toUpperCase() || 'IT'); applicati.push('paeseResidenza'); }
  if (b.datiIdentificativi && typeof b.datiIdentificativi === 'object' && Object.keys(b.datiIdentificativi).length) {
    // I dettagli si FONDONO con quelli esistenti: la visura non sa nulla del documento d'identità.
    let attuali: Record<string, unknown> = {};
    if (cliente.dati_identificativi) {
      try { attuali = JSON.parse(await decifra(c.env.MASTER_KEY, tenantId, JSON.parse(cliente.dati_identificativi))); } catch { attuali = {}; }
    }
    const nuovi = { ...attuali, ...b.datiIdentificativi };
    set.push('dati_identificativi = ?'); valori.push(JSON.stringify(await cifra(c.env.MASTER_KEY, tenantId, JSON.stringify(nuovi))));
    applicati.push(...Object.keys(b.datiIdentificativi).map((k) => `datiIdentificativi.${k}`));
  }
  if (set.length) {
    set.push("aggiornato_il = datetime('now')");
    await c.env.DB.prepare(`UPDATE clienti SET ${set.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...valori, id, tenantId).run();
  }

  // 2. Compagine e cariche: diff temporale.
  const { soci, cariche } = compagineDaCorpo(b);
  const dataVisura = typeof b.dataVisura === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.dataVisura) ? b.dataVisura : null;
  const diff = (soci.length || cariche.length || b.svuotaCompagine)
    ? await salvaCompagine(c.env, tenantId, id, u.id, { soci, cariche, fonte: 'VISURA', fonteData: b.dataElencoSoci ?? dataVisura })
    : { partecipazioni: { aperte: 0, chiuse: 0, invariate: 0 }, cariche: { aperte: 0, chiuse: 0, invariate: 0 } };

  const screening = await screeningCompagine(c.env, tenantId, id).catch(() => ({ eseguito: false, nuove: 0 }));
  const denominazione = campi.denominazione ?? cliente.denominazione;
  const tipo = campi.tipo ?? cliente.tipo;
  const proposta = await propostaTitolarita(c.env, tenantId, { id, denominazione, tipo, codice_fiscale: campi.codiceFiscale ?? cliente.codice_fiscale },
    { capitale: b.capitale ?? null, dataVisura, dataElencoSoci: b.dataElencoSoci ?? null });
  let propostaId: string | null = null;
  const compagineCambiata = diff.partecipazioni.aperte + diff.partecipazioni.chiuse + diff.cariche.aperte + diff.cariche.chiuse > 0;
  if (compagineCambiata || b.forzaProposta) {
    propostaId = await registraProposta(c.env, tenantId, id, u.id, 'TITOLARITA', 'VISURA',
      { titolari: proposta.analisi.titolari, criterio: proposta.analisi.criterioApplicato, bozzaMotivazione: proposta.bozzaMotivazione, dataVisura, diff }, proposta.alert);
  }

  await audioVisuraLetta(c, tenantId, id, b);
  await scriviAudit(c.env.DB, {
    tenantId, utenteId: u.id, azione: 'AGGIORNA_CLIENTE', entita: 'clienti', entitaId: id,
    dettaglio: { origine: 'VISURA', dataVisura, campi: applicati, diff, alert: proposta.alert.map((x) => x.codice) }, ip: c.get('ip'),
  });
  return c.json({ ok: true, applicati, diff, compagineCambiata, proposta: { ...proposta, id: propostaId }, screening });
});

/** Compagine, cariche, proposta di titolarità viva (ricalcolata) e storico delle proposte. */
api.get('/clienti/:id/compagine', async (c) => {
  const tenantId = c.get('tenantId');
  const id = c.req.param('id') as string;
  const cliente = await c.env.DB.prepare('SELECT id, denominazione, tipo, codice_fiscale FROM clienti WHERE id = ? AND tenant_id = ?').bind(id, tenantId).first<any>();
  if (!cliente) return c.json({ errore: 'Cliente non trovato' }, 404);
  const proposta = await propostaTitolarita(c.env, tenantId, cliente);
  const proposte = await leggiProposte(c.env, tenantId, id);
  return c.json({ ...proposta, proposte });
});

/** Esito della revisione di una proposta: la prova, in ispezione, che il professionista ha valutato. */
api.post('/proposte/:id/esito', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const b = await c.req.json<any>().catch(() => ({}));
  const stato = String(b.stato ?? '');
  if (!['APPLICATA', 'MODIFICATA', 'SCARTATA'].includes(stato)) return c.json({ errore: 'Stato non valido: APPLICATA, MODIFICATA o SCARTATA.' }, 400);
  if (stato !== 'APPLICATA' && !String(b.motivazione ?? '').trim()) return c.json({ errore: 'Se ti scosti dalla proposta o la scarti, scrivi il perché: è ciò che documenta il tuo giudizio.' }, 400);
  const esito = JSON.stringify(await cifra(c.env.MASTER_KEY, tenantId, JSON.stringify({ motivazione: b.motivazione ?? null, dettaglio: b.dettaglio ?? null })));
  const r = await c.env.DB.prepare(
    "UPDATE proposte SET stato = ?, esito = ?, rivista_da = ?, rivista_il = datetime('now') WHERE id = ? AND tenant_id = ? AND stato = 'PROPOSTA'",
  ).bind(stato, esito, u.id, c.req.param('id'), tenantId).run();
  if (!r.meta.changes) return c.json({ errore: 'Proposta non trovata o già rivista' }, 404);
  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'RIVEDI_PROPOSTA', entita: 'proposte', entitaId: c.req.param('id'), dettaglio: { stato }, ip: c.get('ip') });
  return c.json({ ok: true });
});

/**
 * Documenti del cliente (visure, incarico…): gemello di POST /fascicoli/:id/documenti
 * con `cliente_id` al posto di `fascicolo_id`. La conservazione decennale
 * decorre dalla cessazione del rapporto: agganciato al solo cliente il
 * termine resta NULL finché esiste un rapporto in essere.
 */
api.post('/clienti/:id/documenti', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const clienteId = c.req.param('id') as string;
  const cliente = await c.env.DB.prepare('SELECT id FROM clienti WHERE id = ? AND tenant_id = ?').bind(clienteId, tenantId).first<any>();
  if (!cliente) return c.json({ errore: 'Cliente non trovato' }, 404);

  const form = await c.req.formData();
  const campo = form.get('file');
  if (typeof campo === 'string' || campo === null) return c.json({ errore: 'File mancante' }, 400);
  const file = campo as File;
  if (file.size > 20 * 1024 * 1024) return c.json({ errore: 'File troppo grande (massimo 20 MB).' }, 413);

  const buf = await file.arrayBuffer();
  const sha = await sha256Hex(buf);
  const tipo = String(form.get('tipo') ?? 'VISURA');
  // La stessa visura caricata due volte non si duplica: si restituisce quella esistente.
  const esistente = await c.env.DB.prepare('SELECT id, conserva_fino_al FROM documenti WHERE tenant_id = ? AND cliente_id = ? AND sha256 = ?')
    .bind(tenantId, clienteId, sha).first<any>();
  if (esistente) return c.json({ id: esistente.id, sha256: sha, conservaFinoAl: esistente.conserva_fino_al, giaPresente: true }, 200);

  const id = nuovoId('doc');
  const nome = file.name.replace(/[^\w.\- àèéìòù()]/gi, '_').slice(0, 120) || 'documento.pdf';
  const r2Key = `${tenantId}/cliente/${clienteId}/${id}-${nome}`;
  await c.env.DOCS.put(r2Key, buf, { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
  const dataRif = String(form.get('dataRiferimento') ?? '');
  await c.env.DB.prepare(
    `INSERT INTO documenti (id, tenant_id, cliente_id, tipo, nome_file, mime, dimensione, r2_key, sha256,
      data_riferimento, data_acquisizione, conserva_fino_al, creato_da)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(id, tenantId, clienteId, tipo, nome, file.type || 'application/octet-stream', buf.byteLength, r2Key, sha,
    /^\d{4}-\d{2}-\d{2}$/.test(dataRif) ? dataRif : oggi(), oggi(), null, u.id).run();

  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'ACQUISISCI_DOCUMENTO', entita: 'documenti', entitaId: id, dettaglio: { sha256: sha, clienteId, tipo }, ip: c.get('ip') });
  return c.json({ id, sha256: sha, conservaFinoAl: null }, 201);
});

api.get('/clienti/:id/documenti', async (c) => {
  const tenantId = c.get('tenantId');
  const { results } = await c.env.DB.prepare(
    `SELECT d.id, d.tipo, d.nome_file, d.mime, d.dimensione, d.sha256, d.data_riferimento, d.data_acquisizione, d.conserva_fino_al, d.fascicolo_id, u.nome AS acquisito_da
     FROM documenti d LEFT JOIN utenti u ON u.id = d.creato_da
     WHERE d.tenant_id = ? AND d.cliente_id = ? ORDER BY d.data_acquisizione DESC, d.creato_il DESC`,
  ).bind(tenantId, c.req.param('id')).all();
  return c.json(results ?? []);
});

// ===========================================================================
// FASCICOLI E VALUTAZIONE DEL RISCHIO — artt. 17-25
// ===========================================================================

api.get('/fascicoli', async (c) => {
  const professionista = c.req.query('professionista') ?? null;
  const cliente = c.req.query('cliente') ?? null;
  const filtri = (professionista ? ' AND f.professionista_id = ?' : '') + (cliente ? ' AND f.cliente_id = ?' : '');
  const valori = [c.get('tenantId'), ...(professionista ? [professionista] : []), ...(cliente ? [cliente] : [])];
  const { results } = await c.env.DB.prepare(
    `SELECT f.*, cl.denominazione AS cliente, u.nome AS professionista,
            v.classe, v.livello_applicabile, v.rischio_effettivo, v.firmata_il AS valutazione_firmata,
            v.controllo_costante_mesi, v.astensione_dovuta
     FROM fascicoli f
     JOIN clienti cl ON cl.id = f.cliente_id
     LEFT JOIN utenti u ON u.id = f.professionista_id
     LEFT JOIN valutazioni_rischio v ON v.id = (
       SELECT id FROM valutazioni_rischio WHERE fascicolo_id = f.id ORDER BY versione DESC LIMIT 1)
     WHERE f.tenant_id = ?${filtri} ORDER BY f.data_conferimento DESC`,
  )
    .bind(...valori)
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

  // AR-M15. Il professionista incaricato della prestazione e chi ha
  // materialmente identificato il cliente: l'art. 19 co. 1 lett. a) chiede
  // l'identificazione, e in uno studio associato chiedersi «chi» non è
  // pedanteria. In mancanza di indicazione l'identificazione è attribuita
  // al professionista incaricato, alla data di conferimento dell'incarico.
  const prof = await risolviProfessionista(c.env.DB, tenantId, b.professionistaId, u);
  if ('errore' in prof) return c.json({ errore: prof.errore }, 400);
  const identificatore = b.identificatoDa
    ? await risolviProfessionista(c.env.DB, tenantId, b.identificatoDa, u)
    : { id: prof.id };
  if ('errore' in identificatore) return c.json({ errore: identificatore.errore }, 400);
  const dataConferimento = b.dataConferimento ?? oggi();

  const id = nuovoId('fas');
  await c.env.DB.prepare(
    `INSERT INTO fascicoli (id, tenant_id, cliente_id, codice, prestazione_codice, prestazione_descrizione,
      tipo_rapporto, importo_operazione, data_conferimento, scopo_natura, esecutore, modalita_identificazione, creato_da,
      professionista_id, identificato_da, data_identificazione)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      id, tenantId, b.clienteId, codice, prestazione.codice, prestazione.descrizione,
      b.tipoRapporto ?? 'CONTINUATIVO', b.importoOperazione ?? null, dataConferimento,
      b.scopoNatura ?? null, b.esecutore ? JSON.stringify(b.esecutore) : null, b.modalitaIdentificazione ?? null, u.id,
      prof.id, identificatore.id, b.dataIdentificazione ?? dataConferimento,
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
    `SELECT f.*, cl.denominazione AS cliente, cl.pep, cl.paese_residenza,
            p.nome AS professionista, i.nome AS identificatore
     FROM fascicoli f
     JOIN clienti cl ON cl.id = f.cliente_id
     LEFT JOIN utenti p ON p.id = f.professionista_id
     LEFT JOIN utenti i ON i.id = f.identificato_da
     WHERE f.id = ? AND f.tenant_id = ?`,
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

/**
 * Riassegnazione (AR-M15): il professionista incaricato e l'autore
 * dell'identificazione cambiano — un associato subentra, un incarico passa
 * di mano. Non si riscrive la storia della verifica: si aggiorna a chi è
 * intestata la prestazione, e l'audit conserva il passaggio.
 */
api.post('/fascicoli/:id/professionista', puoScrivere, async (c) => {
  const tenantId = c.get('tenantId');
  const u = c.get('utente');
  const id = c.req.param('id');
  const b = await c.req.json<any>().catch(() => ({}));

  const f = await c.env.DB.prepare('SELECT id, professionista_id, identificato_da FROM fascicoli WHERE id = ? AND tenant_id = ?')
    .bind(id, tenantId).first<any>();
  if (!f) return c.json({ errore: 'Fascicolo non trovato' }, 404);

  const prof = await risolviProfessionista(c.env.DB, tenantId, b.professionistaId ?? f.professionista_id, u);
  if ('errore' in prof) return c.json({ errore: prof.errore }, 400);
  const identificatore = b.identificatoDa !== undefined
    ? await risolviProfessionista(c.env.DB, tenantId, b.identificatoDa, u)
    : { id: f.identificato_da ?? prof.id };
  if ('errore' in identificatore) return c.json({ errore: identificatore.errore }, 400);

  const dataIdent = b.dataIdentificazione === undefined ? undefined : String(b.dataIdentificazione ?? '').slice(0, 10);
  if (dataIdent !== undefined && dataIdent && !/^\d{4}-\d{2}-\d{2}$/.test(dataIdent)) {
    return c.json({ errore: 'La data di identificazione va indicata come AAAA-MM-GG' }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE fascicoli SET professionista_id = ?, identificato_da = ?,
       data_identificazione = COALESCE(?, data_identificazione), aggiornato_il = datetime('now')
     WHERE id = ? AND tenant_id = ?`,
  ).bind(prof.id, identificatore.id, dataIdent ?? null, id, tenantId).run();

  await scriviAudit(c.env.DB, {
    tenantId, utenteId: u.id, azione: 'ASSEGNA_PROFESSIONISTA', entita: 'fascicoli', entitaId: id,
    dettaglio: { da: f.professionista_id, a: prof.id, identificatoDa: identificatore.id }, ip: c.get('ip'),
  });
  return c.json({ ok: true });
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
  const idF = c.req.param('idF');
  const b = await c.req.json<any>().catch(() => ({}));

  // AR-M15. Firmare la verifica di un cliente altrui è legittimo ma non è
  // ordinario: si chiede il perché e lo si conserva. Il divieto secco
  // spingerebbe a firmare con le credenziali del collega, che è peggio.
  const f = await c.env.DB.prepare('SELECT professionista_id FROM fascicoli WHERE id = ? AND tenant_id = ?')
    .bind(idF, tenantId).first<any>();
  const perConto = Boolean(f?.professionista_id) && f.professionista_id !== u.id;
  const motivazione = String(b.motivazioneFirma ?? '').trim().slice(0, 500);
  if (perConto && motivazione.length < 3) {
    return c.json({
      errore: 'La prestazione è intestata a un altro professionista: indicare il motivo della firma (sostituzione, assenza, subentro).',
      richiedeMotivazione: true,
    }, 409);
  }

  const r = await c.env.DB.prepare(
    'UPDATE valutazioni_rischio SET firmata_da = ?, firmata_il = ?, firma_motivazione = ? WHERE id = ? AND tenant_id = ? AND firmata_il IS NULL',
  ).bind(u.id, new Date().toISOString(), perConto ? motivazione : null, id, tenantId).run();
  if (!r.meta.changes) return c.json({ errore: 'Valutazione inesistente o già firmata' }, 409);
  await c.env.DB.prepare("UPDATE fascicoli SET stato = 'COMPLETO' WHERE id = ? AND stato = 'IN_VERIFICA'")
    .bind(idF).run();
  await scriviAudit(c.env.DB, {
    tenantId, utenteId: u.id, azione: 'FIRMA_VALUTAZIONE', entita: 'valutazioni_rischio', entitaId: id,
    dettaglio: perConto ? { perContoDi: f.professionista_id, motivazione } : undefined, ip: c.get('ip'),
  });
  return c.json({ ok: true, perConto });
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

/**
 * Percorso «Per iniziare» (AR-M10): la checklist non si spunta a mano,
 * si spunta DA SOLA sui dati reali dello studio. È la guida passo passo
 * operativa: ogni passo dice dove si fa e perché la norma lo chiede.
 */
api.get('/primi-passi', async (c) => {
  const tenantId = c.get('tenantId');
  const [autovalFirmata, clienti, titolari, fascicoli, valutazioniFirmate, tenant] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM autovalutazioni WHERE tenant_id = ? AND firmata_il IS NOT NULL').bind(tenantId).first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM clienti WHERE tenant_id = ? AND attivo = 1').bind(tenantId).first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM titolari_effettivi WHERE tenant_id = ? AND valido_al IS NULL').bind(tenantId).first<{ n: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM fascicoli WHERE tenant_id = ? AND stato != 'CESSATO'").bind(tenantId).first<{ n: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM valutazioni_rischio WHERE tenant_id = ? AND firmata_il IS NOT NULL').bind(tenantId).first<{ n: number }>(),
    c.env.DB.prepare('SELECT parametri, logo_url FROM tenants WHERE id = ?').bind(tenantId).first<any>(),
  ]);
  const registroTe = await statoRegistroTe(c.env.DB, tenantId);

  const passi = [
    {
      id: 'autovalutazione',
      titolo: 'Compila e firma l’autovalutazione dello studio',
      spiega: 'È la base documentale che l’ispettore chiede per prima (artt. 15-16).',
      pagina: 'autovalutazione',
      fatto: (autovalFirmata?.n ?? 0) > 0,
      facoltativo: false,
    },
    {
      id: 'clienti',
      titolo: 'Carica i clienti dello studio',
      spiega: 'A mano, dalla partita IVA o con l’import CSV dal gestionale.',
      pagina: 'clienti',
      fatto: (clienti?.n ?? 0) > 0,
      facoltativo: false,
    },
    {
      id: 'fascicolo',
      titolo: 'Apri il primo fascicolo',
      spiega: 'Un fascicolo per ogni prestazione: incarico, scopo e natura (art. 19).',
      pagina: 'fascicoli',
      fatto: (fascicoli?.n ?? 0) > 0,
      facoltativo: false,
    },
    {
      id: 'valutazione',
      titolo: 'Registra e firma la prima valutazione del rischio',
      spiega: 'Tabelle A e B della modulistica CNDCEC; firmata, è congelata e fa prova.',
      pagina: 'fascicoli',
      fatto: (valutazioniFirmate?.n ?? 0) > 0,
      facoltativo: false,
    },
    {
      id: 'titolari',
      titolo: 'Registra i titolari effettivi dei clienti societari',
      spiega: 'Artt. 20-22: criteri guidati, fotografia storicizzata, riscontro col registro.',
      pagina: 'fascicoli',
      fatto: (titolari?.n ?? 0) > 0,
      facoltativo: false,
    },
    {
      id: 'registro-te',
      titolo: 'Registra l’accreditamento al registro dei titolari effettivi',
      spiega: 'D.M. 122/2026: accesso biennale via Camera di Commercio, promemoria al rinnovo.',
      pagina: 'controlli',
      fatto: registroTe.accreditato,
      facoltativo: false,
    },
    {
      id: 'logo',
      titolo: 'Carica il logo dello studio',
      spiega: 'Comparirà sui verbali accanto all’intestazione (facoltativo).',
      pagina: 'impostazioni',
      fatto: Boolean(logoStudio(tenant?.logo_url)),
      facoltativo: true,
    },
    {
      id: 'ai',
      titolo: 'Abilita l’assistente AI',
      spiega: 'Suggeritore di indicatori UIF, bozze e chat di aiuto (facoltativo, con informativa).',
      pagina: 'impostazioni',
      fatto: aiAbilitata(tenant?.parametri),
      facoltativo: true,
    },
  ];

  const obbligatori = passi.filter((s) => !s.facoltativo);
  return c.json({
    passi,
    completati: passi.filter((s) => s.fatto).length,
    completatoIlPercorso: obbligatori.every((s) => s.fatto),
  });
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

// ===========================================================================
// ASSISTENZA CON TICKET (AR-M11) — come in Assist: la richiesta apre una
// conversazione che vive nell'app; le email sono solo notifiche. Tutti i
// ruoli possono aprire richieste (anche il lettore: "non riesco a
// entrare/vedere" è assistenza); il titolare vede tutte le richieste dello
// studio, gli altri le proprie.
// ===========================================================================

/** Prossimo numero di ticket dello studio: TCK-2026-0001, TCK-2026-0002… */
async function prossimoNumeroTicket(db: D1Database, tenantId: string): Promise<string> {
  const anno = new Date().getFullYear();
  const prefisso = `TCK-${anno}-`;
  const ultimo = await db
    .prepare('SELECT numero FROM ticket WHERE tenant_id = ? AND numero LIKE ? ORDER BY numero DESC LIMIT 1')
    .bind(tenantId, `${prefisso}%`)
    .first<{ numero: string }>();
  const n = ultimo ? parseInt(ultimo.numero.slice(prefisso.length), 10) + 1 : 1;
  return `${prefisso}${String(n).padStart(4, '0')}`;
}

/** "Non letto" = messaggi altrui oltre quelli già visti (ticket_letture). */
const SQL_TICKET_NON_LETTO = `
  (SELECT COUNT(*) FROM ticket_messaggi m
    WHERE m.ticket_id = t.id AND (m.autore_id IS NULL OR m.autore_id <> ?3))
  > COALESCE((SELECT l.n_visti FROM ticket_letture l
    WHERE l.ticket_id = t.id AND l.utente_id = ?3), 0)`;

api.get('/assistenza', async (c) => {
  const u = c.get('utente');
  const soloPropri = u.ruolo !== 'TITOLARE' ? 1 : 0;
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.numero, t.oggetto, t.stato,
            t.created_at AS createdAt, t.updated_at AS updatedAt,
            t.autore_id AS autoreId, u.nome AS autoreNome,
            (SELECT COUNT(*) FROM ticket_messaggi m WHERE m.ticket_id = t.id) AS nMessaggi,
            (${SQL_TICKET_NON_LETTO}) AS nonLetto
     FROM ticket t
     JOIN utenti u ON u.id = t.autore_id
     WHERE t.tenant_id = ?1 AND (?2 = 0 OR t.autore_id = ?3)
     ORDER BY (t.stato = 'chiuso'), t.updated_at DESC`,
  ).bind(u.tenant_id, soloPropri, u.id).all<any>();
  return c.json({ ticket: results.map((t: any) => ({ ...t, nonLetto: !!t.nonLetto })) });
});

api.get('/assistenza/non-letti', async (c) => {
  const u = c.get('utente');
  const soloPropri = u.ruolo !== 'TITOLARE' ? 1 : 0;
  const r = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM ticket t
     WHERE t.tenant_id = ?1 AND (?2 = 0 OR t.autore_id = ?3) AND ${SQL_TICKET_NON_LETTO}`,
  ).bind(u.tenant_id, soloPropri, u.id).first<{ n: number }>();
  return c.json({ n: r?.n ?? 0 });
});

api.post('/assistenza', async (c) => {
  const u = c.get('utente');
  const b = await c.req.json<any>().catch(() => ({}));
  const oggetto = String(b.oggetto ?? '').trim().slice(0, 200);
  const testo = String(b.testo ?? b.messaggio ?? '').trim().slice(0, 5000);
  if (!oggetto || !testo) return c.json({ errore: 'Oggetto e messaggio sono obbligatori' }, 400);

  const ticketId = nuovoId('tck');
  // Due tentativi: il numero progressivo può collidere se due richieste
  // partono nello stesso istante (UNIQUE tenant_id+numero fa da arbitro).
  for (let tentativo = 0; tentativo < 2; tentativo++) {
    const numero = await prossimoNumeroTicket(c.env.DB, u.tenant_id);
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(
          "INSERT INTO ticket (id, tenant_id, numero, autore_id, oggetto, stato) VALUES (?, ?, ?, ?, ?, 'aperto')",
        ).bind(ticketId, u.tenant_id, numero, u.id, oggetto),
        c.env.DB.prepare(
          'INSERT INTO ticket_messaggi (id, tenant_id, ticket_id, autore_id, testo, da_assistenza) VALUES (?, ?, ?, ?, ?, 0)',
        ).bind(nuovoId('msg'), u.tenant_id, ticketId, u.id, testo),
      ]);
      await scriviAudit(c.env.DB, {
        tenantId: u.tenant_id, utenteId: u.id, azione: 'TICKET_APERTO',
        entita: 'ticket', entitaId: ticketId, dettaglio: { numero, oggetto }, ip: c.get('ip'),
      });
      const studio = await c.env.DB.prepare('SELECT denominazione FROM tenants WHERE id = ?').bind(u.tenant_id).first<any>();
      c.executionCtx.waitUntil(
        inviaEmailTicketAssistenza(c.env, {
          studio: studio?.denominazione ?? u.tenant_id,
          nome: u.nome, email: u.email, numero, oggetto, testo, nuovaRichiesta: true,
        }).catch((e) => console.error('Email ticket fallita', e)),
      );
      return c.json({ id: ticketId, numero }, 201);
    } catch (e) {
      if (tentativo === 1) throw e;
    }
  }
  return c.json({ errore: 'Impossibile assegnare il numero della richiesta, riprova' }, 500);
});

async function caricaTicket(db: D1Database, tenantId: string, id: string) {
  return db.prepare(
    `SELECT t.id, t.numero, t.oggetto, t.stato,
            t.created_at AS createdAt, t.updated_at AS updatedAt,
            t.autore_id AS autoreId, u.nome AS autoreNome, u.email AS autoreEmail
     FROM ticket t JOIN utenti u ON u.id = t.autore_id
     WHERE t.id = ? AND t.tenant_id = ?`,
  ).bind(id, tenantId).first<any>();
}

function puoVedereTicket(u: { ruolo: string; id: string }, t: { autoreId: string }): boolean {
  return u.ruolo === 'TITOLARE' || t.autoreId === u.id;
}

api.get('/assistenza/:id', async (c) => {
  const u = c.get('utente');
  const t = await caricaTicket(c.env.DB, u.tenant_id, c.req.param('id'));
  if (!t || !puoVedereTicket(u, t)) return c.json({ errore: 'Richiesta non trovata' }, 404);
  const { results: messaggi } = await c.env.DB.prepare(
    `SELECT m.id, m.testo, m.da_assistenza AS daAssistenza, m.created_at AS createdAt,
            m.autore_id AS autoreId, u.nome AS autoreNome
     FROM ticket_messaggi m LEFT JOIN utenti u ON u.id = m.autore_id
     WHERE m.ticket_id = ? AND m.tenant_id = ?
     ORDER BY m.created_at, m.rowid`,
  ).bind(t.id, u.tenant_id).all<any>();
  // Aprire la conversazione = averla letta fin qui.
  const nAltrui = messaggi.filter((m: any) => m.autoreId !== u.id).length;
  await c.env.DB.prepare(
    `INSERT INTO ticket_letture (tenant_id, ticket_id, utente_id, n_visti, letto_at)
     VALUES (?1, ?2, ?3, ?4, datetime('now'))
     ON CONFLICT(ticket_id, utente_id) DO UPDATE SET n_visti = ?4, letto_at = datetime('now')`,
  ).bind(u.tenant_id, t.id, u.id, nAltrui).run();
  return c.json({ ticket: t, messaggi: messaggi.map((m: any) => ({ ...m, daAssistenza: !!m.daAssistenza })) });
});

api.post('/assistenza/:id/messaggi', async (c) => {
  const u = c.get('utente');
  const t = await caricaTicket(c.env.DB, u.tenant_id, c.req.param('id'));
  if (!t || !puoVedereTicket(u, t)) return c.json({ errore: 'Richiesta non trovata' }, 404);
  if (t.stato === 'chiuso') return c.json({ errore: 'La richiesta è chiusa: per un nuovo problema aprine una nuova' }, 409);
  const b = await c.req.json<any>().catch(() => ({}));
  const testo = String(b.testo ?? '').trim().slice(0, 5000);
  if (!testo) return c.json({ errore: 'Il messaggio è vuoto' }, 400);

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO ticket_messaggi (id, tenant_id, ticket_id, autore_id, testo, da_assistenza) VALUES (?, ?, ?, ?, ?, 0)',
    ).bind(nuovoId('msg'), u.tenant_id, t.id, u.id, testo),
    c.env.DB.prepare(
      "UPDATE ticket SET stato = 'aperto', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?",
    ).bind(t.id, u.tenant_id),
  ]);
  await scriviAudit(c.env.DB, {
    tenantId: u.tenant_id, utenteId: u.id, azione: 'TICKET_MESSAGGIO',
    entita: 'ticket', entitaId: t.id, dettaglio: { numero: t.numero }, ip: c.get('ip'),
  });
  const studio = await c.env.DB.prepare('SELECT denominazione FROM tenants WHERE id = ?').bind(u.tenant_id).first<any>();
  c.executionCtx.waitUntil(
    inviaEmailTicketAssistenza(c.env, {
      studio: studio?.denominazione ?? u.tenant_id,
      nome: u.nome, email: u.email, numero: t.numero, oggetto: t.oggetto, testo, nuovaRichiesta: false,
    }).catch((e) => console.error('Email ticket fallita', e)),
  );
  return c.json({ ok: true }, 201);
});

api.post('/assistenza/:id/chiudi', async (c) => {
  const u = c.get('utente');
  const t = await caricaTicket(c.env.DB, u.tenant_id, c.req.param('id'));
  if (!t || !puoVedereTicket(u, t)) return c.json({ errore: 'Richiesta non trovata' }, 404);
  if (t.stato === 'chiuso') return c.json({ errore: 'La richiesta è già chiusa' }, 409);
  await c.env.DB.prepare(
    "UPDATE ticket SET stato = 'chiuso', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?",
  ).bind(t.id, u.tenant_id).run();
  await scriviAudit(c.env.DB, {
    tenantId: u.tenant_id, utenteId: u.id, azione: 'TICKET_CHIUSO',
    entita: 'ticket', entitaId: t.id, dettaglio: { numero: t.numero }, ip: c.get('ip'),
  });
  return c.json({ stato: 'chiuso' });
});

// ===========================================================================
// NOVITÀ (AR-M11) — il changelog in-app. L'elenco vive nel dominio
// (novita.ts); qui solo la vista per utente, per il pallino nel menu.
// ===========================================================================

api.get('/novita', async (c) => {
  const u = c.get('utente');
  const r = await c.env.DB.prepare('SELECT novita_vista AS vista FROM utenti WHERE id = ?').bind(u.id).first<any>();
  return c.json({ novita: NOVITA, vista: r?.vista ?? null });
});

api.post('/auth/novita', async (c) => {
  const u = c.get('utente');
  const b = await c.req.json<any>().catch(() => ({}));
  const vista = String(b.vista ?? '');
  if (!idNovitaValido(vista)) return c.json({ errore: 'Novità sconosciuta' }, 400);
  await c.env.DB.prepare('UPDATE utenti SET novita_vista = ? WHERE id = ?').bind(vista, u.id).run();
  return c.json({ ok: true });
});

// ===========================================================================
// CONSOLE CONTIFY (AR-M11) — dove l'assistenza risponde ai ticket di TUTTI
// gli studi. Autenticazione separata dai tenant (operatori_console +
// sessioni_console, cookie proprio): un operatore non è un utente di
// studio e non ne eredita nulla. Montata sotto /api/console, esente dal
// middleware di sessione dei tenant (vedi `pubbliche`).
// ===========================================================================

const COOKIE_CONSOLE = 'antiriciclaggio_console';
const DURATA_CONSOLE_ORE = 12;

interface OperatoreConsole {
  id: string;
  email: string;
  nome: string;
  cambio_password_richiesto: number;
}

async function leggiSessioneConsole(db: D1Database, token: string | undefined): Promise<OperatoreConsole | null> {
  if (!token) return null;
  const riga = await db.prepare(
    `SELECT s.scade_il, o.id, o.email, o.nome, o.cambio_password_richiesto
     FROM sessioni_console s JOIN operatori_console o ON o.id = s.operatore_id
     WHERE s.id = ? AND o.attivo = 1`,
  ).bind(await sha256Hex(token)).first<any>();
  if (!riga) return null;
  if (riga.scade_il <= new Date().toISOString()) {
    await db.prepare('DELETE FROM sessioni_console WHERE id = ?').bind(await sha256Hex(token)).run();
    return null;
  }
  return riga as OperatoreConsole;
}

const consoleApp = new Hono<{ Bindings: Env; Variables: Variabili & { operatore: OperatoreConsole } }>();

consoleApp.post('/login', async (c) => {
  const { email, password } = await c.req.json<any>().catch(() => ({}));
  if (!email || !password) return c.json({ errore: 'Credenziali mancanti' }, 400);
  const o = await c.env.DB.prepare('SELECT * FROM operatori_console WHERE email = ? AND attivo = 1')
    .bind(String(email).toLowerCase().trim())
    .first<any>();
  // Tempi uniformi, come il login dei tenant: nessuna enumerazione.
  const ok = o ? await verificaPassword(String(password), o.password_hash) : await verificaPassword(String(password), await hashPassword('x'));
  if (!o || !ok) return c.json({ errore: 'Credenziali non valide' }, 401);

  const token = nuovoToken();
  const scadeIl = new Date(Date.now() + DURATA_CONSOLE_ORE * 3600_000).toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO sessioni_console (id, operatore_id, scade_il, ip, user_agent) VALUES (?, ?, ?, ?, ?)')
      .bind(await sha256Hex(token), o.id, scadeIl, c.req.header('CF-Connecting-IP') ?? null, c.req.header('User-Agent') ?? null),
    c.env.DB.prepare('UPDATE operatori_console SET ultimo_accesso = ? WHERE id = ?').bind(new Date().toISOString(), o.id),
  ]);
  setCookie(c, COOKIE_CONSOLE, token, { httpOnly: true, secure: true, sameSite: 'Strict', path: '/', maxAge: DURATA_CONSOLE_ORE * 3600 });
  return c.json({ operatore: { email: o.email, nome: o.nome, cambioPasswordRichiesto: o.cambio_password_richiesto === 1 } });
});

consoleApp.post('/logout', async (c) => {
  const token = getCookie(c, COOKIE_CONSOLE);
  if (token) await c.env.DB.prepare('DELETE FROM sessioni_console WHERE id = ?').bind(await sha256Hex(token)).run();
  deleteCookie(c, COOKIE_CONSOLE, { path: '/' });
  return c.json({ ok: true });
});

consoleApp.use('/*', async (c, next) => {
  const operatore = await leggiSessioneConsole(c.env.DB, getCookie(c, COOKIE_CONSOLE));
  if (!operatore) {
    deleteCookie(c, COOKIE_CONSOLE, { path: '/' });
    return c.json({ errore: 'Sessione console non valida' }, 401);
  }
  c.set('operatore', operatore);
  // Password temporanea: prima si cambia, poi si lavora.
  const path = c.req.path;
  if (operatore.cambio_password_richiesto === 1 && !path.endsWith('/me') && !path.endsWith('/cambia-password')) {
    return c.json({ errore: 'Devi impostare una nuova password prima di continuare', codice: 'cambio_password_richiesto' }, 403);
  }
  return next();
});

consoleApp.get('/me', (c) => {
  const o = c.get('operatore');
  return c.json({ operatore: { email: o.email, nome: o.nome, cambioPasswordRichiesto: o.cambio_password_richiesto === 1 } });
});

consoleApp.post('/cambia-password', async (c) => {
  const o = c.get('operatore');
  const b = await c.req.json<any>().catch(() => ({}));
  const attuale = String(b.attuale ?? '');
  const nuova = String(b.nuova ?? '');
  if (nuova.length < 10) return c.json({ errore: 'La nuova password deve avere almeno 10 caratteri' }, 400);
  const riga = await c.env.DB.prepare('SELECT password_hash FROM operatori_console WHERE id = ?').bind(o.id).first<any>();
  if (!riga || !(await verificaPassword(attuale, riga.password_hash))) {
    return c.json({ errore: 'La password attuale non è corretta' }, 400);
  }
  await c.env.DB.prepare('UPDATE operatori_console SET password_hash = ?, cambio_password_richiesto = 0 WHERE id = ?')
    .bind(await hashPassword(nuova), o.id).run();
  const token = getCookie(c, COOKIE_CONSOLE);
  await c.env.DB.prepare('DELETE FROM sessioni_console WHERE operatore_id = ? AND id <> ?')
    .bind(o.id, token ? await sha256Hex(token) : '').run();
  return c.json({ ok: true });
});

consoleApp.get('/ticket', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.numero, t.oggetto, t.stato,
            t.created_at AS createdAt, t.updated_at AS updatedAt,
            te.denominazione AS studio, u.nome AS autoreNome, u.email AS autoreEmail,
            (SELECT COUNT(*) FROM ticket_messaggi m WHERE m.ticket_id = t.id) AS nMessaggi
     FROM ticket t
     JOIN tenants te ON te.id = t.tenant_id
     JOIN utenti u ON u.id = t.autore_id
     ORDER BY (t.stato = 'chiuso'), (t.stato = 'risposto'), t.updated_at DESC`,
  ).all<any>();
  return c.json({ ticket: results });
});

async function caricaTicketConsole(db: D1Database, id: string) {
  return db.prepare(
    `SELECT t.id, t.tenant_id AS tenantId, t.numero, t.oggetto, t.stato,
            t.created_at AS createdAt, t.updated_at AS updatedAt,
            te.denominazione AS studio, u.nome AS autoreNome, u.email AS autoreEmail
     FROM ticket t
     JOIN tenants te ON te.id = t.tenant_id
     JOIN utenti u ON u.id = t.autore_id
     WHERE t.id = ? OR t.numero = ?`,
  ).bind(id, id).first<any>();
}

consoleApp.get('/ticket/:id', async (c) => {
  const t = await caricaTicketConsole(c.env.DB, c.req.param('id'));
  if (!t) return c.json({ errore: 'Ticket non trovato' }, 404);
  const { results: messaggi } = await c.env.DB.prepare(
    `SELECT m.id, m.testo, m.da_assistenza AS daAssistenza, m.created_at AS createdAt, u.nome AS autoreNome
     FROM ticket_messaggi m LEFT JOIN utenti u ON u.id = m.autore_id
     WHERE m.ticket_id = ? ORDER BY m.created_at, m.rowid`,
  ).bind(t.id).all<any>();
  return c.json({ ticket: t, messaggi: messaggi.map((m: any) => ({ ...m, daAssistenza: !!m.daAssistenza })) });
});

consoleApp.post('/ticket/:id/rispondi', async (c) => {
  const o = c.get('operatore');
  const t = await caricaTicketConsole(c.env.DB, c.req.param('id'));
  if (!t) return c.json({ errore: 'Ticket non trovato' }, 404);
  if (t.stato === 'chiuso') return c.json({ errore: 'Il ticket è chiuso' }, 409);
  const b = await c.req.json<any>().catch(() => ({}));
  const testo = String(b.testo ?? '').trim().slice(0, 5000);
  if (!testo) return c.json({ errore: 'Il messaggio è vuoto' }, 400);

  await c.env.DB.batch([
    c.env.DB.prepare(
      'INSERT INTO ticket_messaggi (id, tenant_id, ticket_id, autore_id, testo, da_assistenza) VALUES (?, ?, ?, NULL, ?, 1)',
    ).bind(nuovoId('msg'), t.tenantId, t.id, testo),
    c.env.DB.prepare(
      "UPDATE ticket SET stato = 'risposto', updated_at = datetime('now') WHERE id = ?",
    ).bind(t.id),
  ]);
  // Nel registro dello studio resta la traccia della risposta (senza contenuto).
  await scriviAudit(c.env.DB, {
    tenantId: t.tenantId, utenteId: null, azione: 'TICKET_RISPOSTA_ASSISTENZA',
    entita: 'ticket', entitaId: t.id, dettaglio: { numero: t.numero, operatore: o.email },
  });
  c.executionCtx.waitUntil(
    inviaEmailRispostaTicket(c.env, t.autoreEmail, { numero: t.numero, oggetto: t.oggetto, ticketId: t.id })
      .catch((e) => console.error('Email risposta ticket fallita', e)),
  );
  return c.json({ ok: true }, 201);
});

consoleApp.post('/ticket/:id/chiudi', async (c) => {
  const o = c.get('operatore');
  const t = await caricaTicketConsole(c.env.DB, c.req.param('id'));
  if (!t) return c.json({ errore: 'Ticket non trovato' }, 404);
  if (t.stato === 'chiuso') return c.json({ errore: 'Il ticket è già chiuso' }, 409);
  await c.env.DB.prepare("UPDATE ticket SET stato = 'chiuso', updated_at = datetime('now') WHERE id = ?").bind(t.id).run();
  await scriviAudit(c.env.DB, {
    tenantId: t.tenantId, utenteId: null, azione: 'TICKET_CHIUSO',
    entita: 'ticket', entitaId: t.id, dettaglio: { numero: t.numero, operatore: o.email },
  });
  return c.json({ stato: 'chiuso' });
});

// ── Studi: licenza e contratto (AR-M12) ────────────────────────
// L'equivalente del riquadro «Licenza e contratto» di Assist, ma nella
// console: Contify non entra negli archivi degli studi. Lo stato
// commerciale resta il punto di controllo di AR-M6 (bloccoPerStato);
// qui cambia solo CHI lo amministra: la console invece del database.

consoleApp.get('/studi', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.denominazione, t.stato, t.data_attivazione AS dataAttivazione,
            t.data_scadenza_canone AS dataScadenzaCanone, t.note_contratto AS noteContratto,
            t.professionisti_inclusi AS professionistiInclusi,
            (SELECT COUNT(*) FROM utenti u WHERE u.tenant_id = t.id AND u.attivo = 1) AS nUtenti,
            (SELECT COUNT(*) FROM utenti u WHERE u.tenant_id = t.id AND u.attivo = 1 AND u.ruolo = 'TITOLARE') AS nProfessionisti,
            (SELECT MAX(ultimo_accesso) FROM utenti u WHERE u.tenant_id = t.id) AS ultimoAccesso
     FROM tenants t
     ORDER BY t.denominazione`,
  ).all<any>();
  return c.json({ studi: results });
});

consoleApp.post('/studi/:id/contratto', async (c) => {
  const o = c.get('operatore');
  const t = await c.env.DB.prepare('SELECT id, denominazione FROM tenants WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!t) return c.json({ errore: 'Studio non trovato' }, 404);
  const b = await c.req.json<any>().catch(() => ({}));
  const data = (v: unknown) => {
    if (v === null || v === undefined || v === '') return null;
    const s = String(v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
  };
  const attivazione = data(b.dataAttivazione);
  const scadenza = data(b.dataScadenzaCanone);
  if (attivazione === undefined || scadenza === undefined) {
    return c.json({ errore: 'Le date vanno indicate come AAAA-MM-GG' }, 400);
  }
  const note = b.noteContratto === null ? null : String(b.noteContratto ?? '').trim().slice(0, 2000) || null;

  // AR-M16: posti professionista a contratto. Vuoto/null = nessun limite.
  // Si può impostare un limite più basso dei professionisti già attivi: non
  // disattiva nessuno (sarebbe un danno operativo deciso da fuori), ma da
  // quel momento lo studio non può aggiungerne. La console lo evidenzia.
  let posti: number | null;
  if (b.professionistiInclusi === null || b.professionistiInclusi === undefined || b.professionistiInclusi === '') {
    posti = null;
  } else {
    const n = Number(b.professionistiInclusi);
    if (!Number.isInteger(n) || n < 1 || n > 999) {
      return c.json({ errore: 'I posti professionista vanno indicati come numero intero da 1 a 999, o lasciati vuoti per nessun limite' }, 400);
    }
    posti = n;
  }

  await c.env.DB.prepare(
    'UPDATE tenants SET data_attivazione = ?, data_scadenza_canone = ?, note_contratto = ?, professionisti_inclusi = ? WHERE id = ?',
  ).bind(attivazione, scadenza, note, posti, t.id).run();
  await scriviAudit(c.env.DB, {
    tenantId: t.id, utenteId: null, azione: 'CONTRATTO_AGGIORNATO',
    entita: 'tenants', entitaId: t.id,
    dettaglio: { operatore: o.email, dataAttivazione: attivazione, dataScadenzaCanone: scadenza, professionistiInclusi: posti },
  });
  return c.json({ ok: true });
});

consoleApp.post('/studi/:id/stato', async (c) => {
  const o = c.get('operatore');
  const t = await c.env.DB.prepare('SELECT id, denominazione, stato FROM tenants WHERE id = ?').bind(c.req.param('id')).first<any>();
  if (!t) return c.json({ errore: 'Studio non trovato' }, 404);
  const b = await c.req.json<any>().catch(() => ({}));
  const stato = String(b.stato ?? '');
  if (!['attivo', 'sospeso', 'cessato'].includes(stato)) return c.json({ errore: 'Stato non valido' }, 400);
  if (stato === t.stato) return c.json({ ok: true, stato });
  await c.env.DB.prepare('UPDATE tenants SET stato = ? WHERE id = ?').bind(stato, t.id).run();
  await scriviAudit(c.env.DB, {
    tenantId: t.id, utenteId: null, azione: 'STATO_TENANT',
    entita: 'tenants', entitaId: t.id, dettaglio: { operatore: o.email, da: t.stato, a: stato },
  });
  return c.json({ ok: true, stato });
});

api.route('/console', consoleApp);

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

/**
 * Le schede dei professionisti per l'intestazione dei verbali (AR-M15):
 * qualifica e iscrizione all'albo, non il solo nome di battesimo.
 */
async function schedeProfessionisti(c: Ctx): Promise<Record<string, Professionista>> {
  const { results } = await c.env.DB.prepare(
    'SELECT id, nome, qualifica, ordine, numero_iscrizione, codice_fiscale FROM utenti WHERE tenant_id = ?',
  ).bind(c.get('tenantId')).all<any>();
  return Object.fromEntries((results ?? []).map((u) => [u.id, {
    nome: u.nome,
    qualifica: u.qualifica ?? null,
    ordine: u.ordine ?? null,
    numeroIscrizione: u.numero_iscrizione ?? null,
    codiceFiscale: u.codice_fiscale ?? null,
  } as Professionista]));
}

api.get('/studio/autovalutazioni/:id/verbale', async (c) => {
  const tenantId = c.get('tenantId');
  const av = await c.env.DB.prepare('SELECT * FROM autovalutazioni WHERE id = ? AND tenant_id = ?')
    .bind(c.req.param('id'), tenantId).first<any>();
  if (!av) return c.json({ errore: 'Autovalutazione non trovata' }, 404);

  const nomi = await nomiUtenti(c);
  const schede = await schedeProfessionisti(c);
  const tenant = await tenantCorrente(c);
  const corpo = corpoVerbaleAutovalutazione({
    tenant,
    av,
    ruleset: ruleset(av.ruleset_id),
    nomeCreatore: nomi[av.creato_da] ?? '—',
    nomeFirmatario: av.firmata_da ? nomi[av.firmata_da] : null,
    firmatario: av.firmata_da ? schede[av.firmata_da] ?? null : null,
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
  const schede = await schedeProfessionisti(c);
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
    professionista: d.fascicolo.professionista_id ? schede[d.fascicolo.professionista_id] ?? null : null,
    identificatore: d.fascicolo.identificato_da ? schede[d.fascicolo.identificato_da] ?? null : null,
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
  const schede = await schedeProfessionisti(c);
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
    professionista: d.fascicolo.professionista_id ? schede[d.fascicolo.professionista_id] ?? null : null,
    identificatore: d.fascicolo.identificato_da ? schede[d.fascicolo.identificato_da] ?? null : null,
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
    // Igiene delle sessioni scadute (AR-M12): il taglio vero lo fa già il
    // middleware; qui si evita solo l'accumulo di righe morte.
    await env.DB.prepare(
      "DELETE FROM sessioni WHERE scade_il <= datetime('now') OR (scade_assoluta IS NOT NULL AND scade_assoluta <= datetime('now'))",
    ).run();
    await env.DB.prepare("DELETE FROM sessioni_console WHERE scade_il <= datetime('now')").run();
  } catch (e) {
    console.error('pulizia sessioni fallita:', e);
  }
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
