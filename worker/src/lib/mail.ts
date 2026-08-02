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

async function invia(env: Env, destinatario: string, oggetto: string, html: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY non configurata: email NON inviata a', destinatario, '—', oggetto);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM ?? 'Contify AR <no-reply@contify.it>', to: [destinatario], subject: oggetto, html }),
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
