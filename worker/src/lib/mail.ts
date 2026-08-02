/**
 * EMAIL TRANSAZIONALI VIA RESEND (AR-M3)
 *
 * Usate per il reset password self-service e per il benvenuto dei nuovi
 * utenti. Mittente e URL base stanno in wrangler.toml (MAIL_FROM,
 * APP_BASE_URL); la chiave API è un secret del Worker (RESEND_API_KEY).
 * Senza chiave configurata l'invio viene saltato con un log: gli endpoint
 * non si rompono (utile in locale e negli smoke) e la risposta dice al
 * chiamante se la mail è partita davvero.
 */

import type { Env } from './tipi';

const PRODOTTO = 'Contify AR';
const PAYOFF = 'AntiRiciclaggio — DLgs. 231/2007';

function involucro(contenuto: string): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
    <div style="font-size:22px;font-weight:800;color:#0a6068;margin-bottom:2px">${PRODOTTO}</div>
    <div style="font-size:13px;color:#6b7280;margin-bottom:20px">${PAYOFF}</div>
    ${contenuto}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <div style="font-size:11px;color:#9ca3af">Contify Srl · Corso Milano 106, Padova — messaggio automatico, non rispondere.</div>
  </div>`;
}

async function invia(env: Env, destinatario: string, oggetto: string, html: string, rispondiA?: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY non configurata: email NON inviata a', destinatario, '—', oggetto);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_FROM ?? 'Contify AR <no-reply@contify.it>',
      to: [destinatario],
      subject: oggetto,
      html,
      ...(rispondiA ? { reply_to: [rispondiA] } : {}),
    }),
  });
  if (!res.ok) {
    console.error('Invio email fallito', res.status, await res.text().catch(() => ''));
    return false;
  }
  return true;
}

export function urlApp(env: Env): string {
  return env.APP_BASE_URL ?? 'https://antiriciclaggio.contify.it';
}

export async function inviaEmailResetPassword(env: Env, destinatario: string, urlReset: string): Promise<boolean> {
  const html = involucro(`
    <p style="font-size:15px;color:#111827">È stata richiesta la reimpostazione della password per questo indirizzo email.</p>
    <p style="margin:28px 0;text-align:center">
      <a href="${urlReset}" style="background:#048587;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px;display:inline-block">Imposta una nuova password</a>
    </p>
    <p style="font-size:13px;color:#6b7280">Il link vale <strong>60 minuti</strong> e può essere usato una sola volta.
    Se non hai richiesto tu il reset, ignora questa email: la tua password resta invariata.</p>
    <p style="font-size:12px;color:#9ca3af">Se il pulsante non funziona, copia questo indirizzo nel browser:<br>
    <span style="word-break:break-all">${urlReset}</span></p>`);
  return invia(env, destinatario, `${PRODOTTO} — reimposta la tua password`, html);
}

export async function inviaEmailBenvenuto(
  env: Env,
  dati: { destinatario: string; nome: string; passwordTemporanea: string; studio: string },
): Promise<boolean> {
  const html = involucro(`
    <p style="font-size:15px;color:#111827">Ti diamo il benvenuto su ${PRODOTTO}, lo strumento antiriciclaggio di <strong>${dati.studio}</strong>.</p>
    <p style="font-size:14px;color:#111827">Le tue credenziali di primo accesso:</p>
    <p style="font-size:14px;background:#f3f4f6;border-radius:8px;padding:12px 16px">
      Email: <strong>${dati.destinatario}</strong><br>
      Password temporanea: <strong style="font-family:ui-monospace,monospace">${dati.passwordTemporanea}</strong></p>
    <p style="font-size:13px;color:#6b7280">Al primo accesso ti verrà chiesto di scegliere una password personale.</p>
    <p style="margin:28px 0;text-align:center">
      <a href="${urlApp(env)}" style="background:#048587;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px;display:inline-block">Accedi a ${PRODOTTO}</a>
    </p>`);
  return invia(env, dati.destinatario, `${PRODOTTO} — il tuo accesso`, html);
}

/**
 * Richiesta di assistenza (AR-M5): parte verso Contify con i riferimenti
 * dello studio; reply-to sull'email dell'utente, così la risposta è un
 * semplice "Rispondi". Il contenuto è sanificato (testo semplice in HTML).
 */
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function inviaEmailAssistenza(
  env: Env,
  dati: { studio: string; nome: string; email: string; ruolo: string; oggetto: string; messaggio: string },
): Promise<boolean> {
  const destinatario = env.ASSISTENZA_EMAIL ?? 'info@contify.it';
  const html = involucro(`
    <p style="font-size:14px;color:#111827"><strong>Richiesta di assistenza da ${PRODOTTO}</strong></p>
    <p style="font-size:13px;background:#f3f4f6;border-radius:8px;padding:12px 16px;color:#111827">
      Studio: <strong>${escapeHtml(dati.studio)}</strong><br>
      Utente: <strong>${escapeHtml(dati.nome)}</strong> (${escapeHtml(dati.email)}, ${escapeHtml(dati.ruolo.toLowerCase())})</p>
    <p style="font-size:14px;color:#111827"><strong>${escapeHtml(dati.oggetto)}</strong></p>
    <p style="font-size:14px;color:#374151;white-space:pre-wrap">${escapeHtml(dati.messaggio)}</p>`);
  return invia(env, destinatario, `${PRODOTTO} — assistenza: ${dati.oggetto}`, html, dati.email);
}

/**
 * Avviso a Contify sul canone di uno studio (AR-M6): parte dal cron
 * notturno quando i giorni alla scadenza toccano una soglia di avviso.
 */
export async function inviaEmailAvvisoCanone(
  env: Env,
  dati: { studio: string; scadenza: string; giorni: number },
): Promise<boolean> {
  const destinatario = env.ASSISTENZA_EMAIL ?? 'info@contify.it';
  const quando =
    dati.giorni > 0 ? `scade tra ${dati.giorni} giorni` : dati.giorni === 0 ? 'scade OGGI' : `è scaduto da ${-dati.giorni} giorni`;
  const html = involucro(`
    <p style="font-size:14px;color:#111827"><strong>Canone ${PRODOTTO}</strong></p>
    <p style="font-size:14px;color:#111827">Il canone dello studio <strong>${escapeHtml(dati.studio)}</strong> ${quando}
    (scadenza: <strong>${dati.scadenza}</strong>).</p>
    <p style="font-size:13px;color:#6b7280">Promemoria automatico dal controllo notturno. Stato e scadenza si
    amministrano sul database (tenants.stato, tenants.data_scadenza_canone).</p>`);
  return invia(env, destinatario, `${PRODOTTO} — canone ${dati.studio}: ${quando}`, html);
}

/**
 * Riepilogo settimanale dello scadenzario (AR-M7): parte il lunedì
 * notte verso ogni titolare attivo dello studio. Niente dati di
 * clienti nel corpo oltre alla denominazione: il dettaglio sta
 * nell'applicazione.
 */
export async function inviaEmailScadenzario(
  env: Env,
  dati: {
    destinatario: string;
    nome: string;
    studio: string;
    scadute: Array<{ cliente: string; codice: string; descrizione?: string }>;
    inScadenza: Array<{ cliente: string; codice: string; giorniResidui?: number }>;
    screeningDaEsaminare: number;
    paesiDaRivalutare: number;
    /** Avviso già formattato sull'accreditamento al registro TE, se serve. */
    registroTeAvviso?: string | null;
  },
): Promise<boolean> {
  const rigaElenco = (testo: string) => `<li style="margin-bottom:4px">${escapeHtml(testo)}</li>`;
  const MAX_RIGHE = 8;

  const blocchi: string[] = [];
  if (dati.scadute.length) {
    blocchi.push(`<p style="font-size:14px;color:#b91c1c;margin-bottom:6px"><strong>${dati.scadute.length} adempimenti scaduti</strong></p>
      <ul style="font-size:13px;color:#374151;margin-top:0">${dati.scadute.slice(0, MAX_RIGHE).map((v) => rigaElenco(`${v.cliente} — fascicolo ${v.codice}`)).join('')}
      ${dati.scadute.length > MAX_RIGHE ? rigaElenco(`… e altri ${dati.scadute.length - MAX_RIGHE}`) : ''}</ul>`);
  }
  if (dati.inScadenza.length) {
    blocchi.push(`<p style="font-size:14px;color:#92400e;margin-bottom:6px"><strong>${dati.inScadenza.length} in scadenza nei prossimi 30 giorni</strong></p>
      <ul style="font-size:13px;color:#374151;margin-top:0">${dati.inScadenza.slice(0, MAX_RIGHE).map((v) => rigaElenco(`${v.cliente} — fascicolo ${v.codice}${v.giorniResidui !== undefined ? ` (${v.giorniResidui} giorni)` : ''}`)).join('')}
      ${dati.inScadenza.length > MAX_RIGHE ? rigaElenco(`… e altri ${dati.inScadenza.length - MAX_RIGHE}`) : ''}</ul>`);
  }
  if (dati.screeningDaEsaminare > 0) {
    blocchi.push(`<p style="font-size:14px;color:#92400e"><strong>${dati.screeningDaEsaminare}</strong> corrispondenze dello screening sanzioni da esaminare.</p>`);
  }
  if (dati.paesiDaRivalutare > 0) {
    blocchi.push(`<p style="font-size:14px;color:#92400e"><strong>${dati.paesiDaRivalutare}</strong> clienti in paesi terzi ad alto rischio da rivalutare.</p>`);
  }
  if (dati.registroTeAvviso) {
    blocchi.push(`<p style="font-size:14px;color:#92400e">${escapeHtml(dati.registroTeAvviso)}</p>`);
  }

  const html = involucro(`
    <p style="font-size:15px;color:#111827">Buongiorno ${escapeHtml(dati.nome.split(' ')[0])},<br>
    ecco il punto della settimana per <strong>${escapeHtml(dati.studio)}</strong>.</p>
    ${blocchi.join('')}
    <p style="margin:28px 0;text-align:center">
      <a href="${urlApp(env)}/#scadenzario" style="background:#048587;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px;display:inline-block">Apri lo scadenzario</a>
    </p>
    <p style="font-size:12px;color:#9ca3af">Ricevi questo riepilogo ogni lunedì quando c'è qualcosa da fare.</p>`);
  return invia(env, dati.destinatario, `${PRODOTTO} — ${dati.scadute.length ? `${dati.scadute.length} adempimenti scaduti` : 'il punto della settimana'}`, html);
}

/**
 * Invito all'adeguata verifica a distanza (AR-M8): il link monouso
 * arriva al cliente con le istruzioni; scade e non è riutilizzabile.
 */
export async function inviaEmailVerificaRemota(
  env: Env,
  dati: { destinatario: string; studio: string; cliente: string; url: string; scadeIl: string },
): Promise<boolean> {
  const scade = dati.scadeIl.slice(0, 10).split('-').reverse().join('.');
  const html = involucro(`
    <p style="font-size:15px;color:#111827">Gentile cliente,<br>
    lo studio <strong>${escapeHtml(dati.studio)}</strong> le chiede di fornire i dati richiesti
    dalla normativa antiriciclaggio (DLgs. 231/2007) per <strong>${escapeHtml(dati.cliente)}</strong>.</p>
    <p style="font-size:14px;color:#374151">Bastano pochi minuti: dati identificativi, un documento
    d'identità e poche dichiarazioni. I dati viaggiano cifrati e arrivano solo allo studio.</p>
    <p style="margin:28px 0;text-align:center">
      <a href="${dati.url}" style="background:#048587;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px;display:inline-block">Compila in sicurezza</a>
    </p>
    <p style="font-size:13px;color:#6b7280">Il collegamento vale fino al <strong>${scade}</strong> e può
    essere usato una sola volta. Se non è lei il destinatario, ignori questa email.</p>
    <p style="font-size:12px;color:#9ca3af">Se il pulsante non funziona, copi questo indirizzo nel browser:<br>
    <span style="word-break:break-all">${dati.url}</span></p>`);
  return invia(env, dati.destinatario, `${escapeHtml(dati.studio)} — dati per l'adeguata verifica`, html);
}

/** Avviso allo studio: il cliente ha completato la verifica a distanza. */
export async function inviaEmailVerificaCompletata(
  env: Env,
  dati: { destinatario: string; nome: string; cliente: string; fascicolo: string },
): Promise<boolean> {
  const html = involucro(`
    <p style="font-size:15px;color:#111827">${escapeHtml(dati.nome.split(' ')[0])},<br>
    il cliente <strong>${escapeHtml(dati.cliente)}</strong> ha completato la verifica a distanza
    per il fascicolo <strong>${escapeHtml(dati.fascicolo)}</strong>.</p>
    <p style="font-size:14px;color:#374151">I dati sono in attesa del tuo esame: entra nel fascicolo
    e acquisisci ciò che ritieni corretto.</p>
    <p style="margin:28px 0;text-align:center">
      <a href="${urlApp(env)}" style="background:#048587;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px;display:inline-block">Apri Contify AR</a>
    </p>`);
  return invia(env, dati.destinatario, `${PRODOTTO} — verifica completata da ${dati.cliente}`, html);
}
