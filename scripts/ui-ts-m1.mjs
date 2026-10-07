/**
 * Giro Playwright TS-M1: Registra (chat, domande, schede, striscia), Le mie ore, Registrazioni, Clienti, Servizi,
 * Impostazioni Timesheet, microfono con audio finto.
 *
 *   npx wrangler dev --port 8787 --local   (dopo reset + migrate 0001..0016 + seed, dist/ costruita, .dev.vars con AI_FIXTURES=1)
 *   node scripts/smoke-api-ts-m0.mjs       (attiva Timesheet sullo studio demo; oppure smoke-api-ts-m1)
 *   node scripts/ui-ts-m1.mjs              (CHROMIUM=/percorso/chrome se serve; richiede ffmpeg per l'audio finto)
 *
 * Dimostra:
 *  1. titolare: Servizi e tariffe (tariffa), Clienti (nuovo a mano, importazione di denominazioni, scheda con alias);
 *  2. collaboratore: Registra con la striscia di riepilogo; frase completa → scheda salvata; frase senza servizio →
 *     domanda con pulsanti → risposta → salvata; risposta scritta a una domanda; annulla; modifica; «Le mie ore»;
 *  3. titolare: Registrazioni con filtri, «da verificare», export; Impostazioni → regole, ore previste, consenso AI e voce;
 *  4. collaboratore: microfono con audio finto e fixture → frase trascritta → registrazione salvata.
 */
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const WAV = '/tmp/ui-ts-m1-voce.wav';
try { execSync(`ffmpeg -y -f lavfi -i "sine=frequency=440:duration=2" -ar 16000 -ac 1 ${WAV} 2>/dev/null`); } catch { /* senza ffmpeg il microfono si salta */ }
const conAudio = fs.existsSync(WAV);

const b = await chromium.launch({
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', ...(conAudio ? [`--use-file-for-fake-audio-capture=${WAV}`] : [])],
});
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone'] });
const p = await ctx.newPage();
let ok = 0, fail = 0;
const verifica = (d, cond) => { if (cond) { ok++; console.log(`  ok   ${d}`); } else { fail++; console.log(`  FAIL ${d}`); } };
p.on('pageerror', (e) => console.log('  PAGE ERROR', e.message));
const suffisso = Date.now().toString(36);

async function login(email, password) {
  await ctx.clearCookies();
  await p.goto(`${BASE}/`);
  await p.waitForSelector('input[type=email]');
  await p.fill('input[type=email]', email);
  await p.fill('input[type=password]', password);
  await p.click('button:has-text("Accedi")');
  await p.waitForSelector('aside nav');
}
async function vaiTs(pagina) {
  await p.goto(`${BASE}/#${pagina}`);
  await p.waitForTimeout(300);
  if (await p.locator('[data-test="modulo-TS"]').count()) {
    if ((await p.getAttribute('[data-test="modulo-TS"]', 'aria-pressed')) !== 'true') { await p.click('[data-test="modulo-TS"]'); await p.goto(`${BASE}/#${pagina}`); }
  }
  await p.waitForTimeout(400);
}
const schede = () => p.locator('[data-test="scheda-registrazione"]');

// ── 1. Titolare: servizi e clienti ───────────────────────────
console.log('== 1. Titolare: Servizi e tariffe, Clienti ==');
await login('titolare@studiodemo.it', 'Antiriciclaggio!2026');
await vaiTs('ts-servizi');
await p.waitForSelector('h1:has-text("Servizi e tariffe")');
verifica('otto servizi predefiniti', (await p.locator('[data-test="riga-servizio"]').count()) >= 8);
await p.locator('[data-test="riga-servizio"]:has-text("Contabilità") button:has-text("Modifica")').click();
await p.waitForSelector('[data-test="modal-servizio"]');
await p.fill('[data-test="servizio-tariffa"]', '45,00');
await p.click('[data-test="salva-servizio"]');
await p.waitForTimeout(500);
verifica('tariffa di Contabilità a 45,00 €', /45,00/.test(await p.locator('[data-test="riga-servizio"]:has-text("Contabilità")').textContent()));
await p.screenshot({ path: '/tmp/ui-ts-m1-1-servizi.png' });

await vaiTs('ts-clienti');
await p.waitForSelector('h1:has-text("Clienti")');
await p.click('[data-test="nuovo-a-mano"]');
await p.waitForSelector('[data-test="anagrafica-nuovo"]');
await p.fill('[data-test="denominazione"]', `Omega ${suffisso} Spa`);
await p.click('[data-test="salva-cliente"]');
await p.waitForTimeout(600);
verifica('cliente creato a mano compare in elenco', (await p.locator(`[data-test="riga-cliente"]:has-text("Omega ${suffisso}")`).count()) === 1);
await p.click('button:has-text("Da importazione")');
await p.waitForSelector('[data-test="import-clienti"]');
await p.fill('[data-test="denominazioni"]', `Fonderie Valbrenta ${suffisso} Srl\nTrattoria Al Ponte ${suffisso}\nOmega ${suffisso} Spa`);
await p.click('[data-test="importa"]');
await p.waitForSelector('[data-test="import-clienti"] >> text=clienti creati');
verifica('importazione di denominazioni: 2 creati, 1 scartato (doppione)', /2.*clienti creati.*1 righe scartate/s.test(await p.locator('[data-test="import-clienti"]').textContent()));
await p.click('button:has-text("Chiudi")');
await p.waitForTimeout(500);
await p.locator(`[data-test="riga-cliente"]:has-text("Trattoria Al Ponte ${suffisso}")`).click();
await p.waitForSelector('[data-test="scheda-cliente"]');
await p.fill('[data-test="scheda-cliente"] input[placeholder="nuovo modo di dire"]', 'il ponte');
await p.click('[data-test="scheda-cliente"] button:has-text("Aggiungi")');
await p.click('[data-test="salva-scheda"]');
await p.waitForTimeout(600);
verifica('alias «il ponte» salvato sulla trattoria', /il ponte/.test(await p.locator(`[data-test="riga-cliente"]:has-text("Trattoria Al Ponte ${suffisso}")`).textContent()));
await p.screenshot({ path: '/tmp/ui-ts-m1-2-clienti.png' });

// ── 2. Collaboratore: Registra ───────────────────────────────
console.log('== 2. Collaboratore: Registra ==');
await login('collaboratore@studiodemo.it', 'Collab!2026');
await vaiTs('ts-registra');
await p.waitForSelector('[data-test="chat-registra"]');
verifica('striscia di riepilogo presente', (await p.locator('[data-test="striscia-riepilogo"]').count()) === 1);
verifica('menu del collaboratore: solo Registra fra le voci Timesheet', !(await p.locator('aside nav button:has-text("Registrazioni")').count()) && !(await p.locator('aside nav button:has-text("Servizi e tariffe")').count()));
const schedePrima = await schede().count();
await p.fill('[data-test="campo-chat"]', `2 ore di contabilità per Omega ${suffisso}`);
await p.click('[data-test="invia-chat"]');
await p.waitForTimeout(1200);
verifica('frase completa → scheda salvata (Omega, Contabilità, 2 h)', (await schede().count()) === schedePrima + 1 && /Omega.*Contabilità.*2 h/s.test(await schede().last().textContent()));
verifica('la striscia aggiorna le ore di oggi', /2 h/.test(await p.locator('[data-test="oggi-minuti"]').textContent()));

await p.fill('[data-test="campo-chat"]', `un'ora per il ponte`);
await p.click('[data-test="invia-chat"]');
await p.waitForSelector('[data-test="domanda-servizio"]');
verifica('frase senza servizio → domanda con i servizi come pulsanti (il generico per ultimo)', (await p.locator('[data-test="domanda-servizio"] button').count()) >= 8 && /Altro$/.test((await p.locator('[data-test="domanda-servizio"] button').allTextContents()).join(' ').trim()));
await p.click('[data-test="domanda-servizio"] button:has-text("Paghe e contributi")');
await p.waitForTimeout(1200);
verifica('risposta con pulsante → scheda salvata (Trattoria, Paghe, 1 h)', (await schede().count()) === schedePrima + 2 && /Trattoria Al Ponte.*Paghe e contributi.*1 h/s.test(await schede().last().textContent()));

await p.fill('[data-test="campo-chat"]', 'bilancio 3 ore');
await p.click('[data-test="invia-chat"]');
await p.waitForSelector('[data-test="domanda-cliente"]');
await p.fill('[data-test="campo-chat"]', `Valbrenta`);
await p.click('[data-test="invia-chat"]');
await p.waitForTimeout(1500);
verifica('risposta scritta alla domanda sul cliente → scheda salvata (Valbrenta, Bilancio, 3 h)', (await schede().count()) === schedePrima + 3 && /Valbrenta.*Bilancio.*3 h/s.test(await schede().last().textContent()));
await p.screenshot({ path: '/tmp/ui-ts-m1-3-registra.png' });

await p.fill('[data-test="campo-chat"]', '2 ore di contabilità per Ferramenta Zanon');
await p.click('[data-test="invia-chat"]');
await p.waitForSelector('[data-test="domanda-cliente"]');
await p.click('[data-test="domanda-cliente"] button:has-text("Cerca un altro cliente")');
await p.waitForSelector('[data-test="cerca-cliente"]');
await p.fill('[data-test="cerca-cliente"] input', 'Omega');
await p.click(`[data-test="cerca-cliente"] button:has-text("Omega ${suffisso}")`);
await p.waitForTimeout(1200);
verifica('cliente non riconosciuto → ricerca nell’elenco → salvata', (await schede().count()) === schedePrima + 4 && /Omega/.test(await schede().last().textContent()));

await schede().last().locator('[data-test="annulla-registrazione"]').click();
await p.waitForSelector('text=Eliminare la registrazione?');
await p.click('div.fixed.inset-0 button:has-text("Elimina")');
await p.waitForSelector('button:has-text("Elimina definitivamente")');
await p.click('button:has-text("Elimina definitivamente")');
await p.waitForTimeout(800);
verifica('«Annulla» toglie la scheda', (await schede().count()) === schedePrima + 3);

await schede().last().locator('button:has-text("Modifica")').click();
await p.waitForSelector('[data-test="form-registrazione"]');
await p.fill('[data-test="campo-durata"]', '2:30');
await p.click('[data-test="salva-registrazione"]');
await p.waitForTimeout(800);
verifica('«Modifica» cambia la durata (2 h 30)', /2 h 30/.test(await schede().last().textContent()));

await p.click('[data-test="link-mie-ore"]');
await p.waitForSelector('h1:has-text("Le mie ore")');
verifica('«Le mie ore»: la settimana corrente con il totale', /Totale/.test(await p.locator('[data-test="totale-settimana"]').textContent()) && (await p.locator('[data-test^="giorno-"] table tr').count()) >= 3);
await p.screenshot({ path: '/tmp/ui-ts-m1-4-mie-ore.png' });

// ── 3. Titolare: Registrazioni e Impostazioni ─────────────────
console.log('== 3. Titolare: Registrazioni, Impostazioni ==');
await login('titolare@studiodemo.it', 'Antiriciclaggio!2026');
await vaiTs('ts-registrazioni');
await p.waitForSelector('h1:has-text("Registrazioni")');
await p.waitForTimeout(600);
verifica('tabella con le registrazioni del collaboratore', (await p.locator('[data-test="riga-registrazione"]').count()) >= 3);
await p.selectOption('[data-test="filtro-persona"]', { label: 'Anna Collaboratrice' });
await p.waitForTimeout(600);
verifica('filtro per persona', (await p.locator('[data-test="riga-registrazione"]').count()) >= 3 && !(await p.locator('[data-test="riga-registrazione"]:has-text("Dott. Demo")').count()));
const [download] = await Promise.all([p.waitForEvent('download'), p.click('[data-test="export"]')]);
verifica('export Excel scaricato (.xlsx)', /\.xlsx$/.test(download.suggestedFilename()));
await p.screenshot({ path: '/tmp/ui-ts-m1-5-registrazioni.png' });

await p.goto(`${BASE}/#impostazioni`);
await p.waitForSelector('[data-test="regole-timesheet"]');
await p.fill('[data-test="giorni-indietro"]', '10');
await p.click('[data-test="salva-regole"]');
await p.waitForSelector('[data-test="regole-timesheet"] >> text=Salvato.');
verifica('regole Timesheet salvate (10 giorni)', true);
const rigaCol = p.locator('[data-test="persona-usr_col"]');
await rigaCol.locator('input[aria-label^="Ore a settimana"]').fill('40');
await rigaCol.locator('button:has-text("Salva")').click();
await p.waitForSelector('[data-test="persona-usr_col"] >> text=Salvato.');
verifica('ore previste del collaboratore salvate (40 h)', true);
verifica('consenso AI Timesheet: informativa visibile prima di abilitare', (await p.locator('[data-test="consenso-ai-ts"] [data-test="informativa-ts"]').count()) === 1);
await p.check('[data-test="voce-ts"]');
await p.check('[data-test="accetto-informativa-ts"]');
await p.click('[data-test="abilita-ai-ts"]');
await p.waitForSelector('[data-test="consenso-ai-ts"] >> text=abilitata');
verifica('AI e voce abilitate per lo studio', (await p.locator('[data-test="consenso-ai-ts"] >> text=voce attiva').count()) === 1);
await p.screenshot({ path: '/tmp/ui-ts-m1-6-impostazioni.png' });

// ── 4. Collaboratore: microfono ──────────────────────────────
console.log('== 4. Collaboratore: microfono con audio finto ==');
await login('collaboratore@studiodemo.it', 'Collab!2026');
await vaiTs('ts-registra');
await p.waitForSelector('[data-test="chat-registra"]');
verifica('con le ore previste la striscia mostra «di 8 h»', /di 8 h/.test(await p.locator('[data-test="oggi-minuti"]').textContent()));
if (conAudio) {
  const prima = await schede().count();
  verifica('il microfono compare con la voce abilitata', (await p.locator('[data-test="microfono"]').count()) === 1);
  await p.click('[data-test="microfono"] button');
  await p.waitForTimeout(1500);
  verifica('stato «In ascolto…» leggibile', /In ascolto/.test(await p.locator('[data-test="microfono"]').textContent()));
  await p.click('[data-test="microfono"] button');
  await p.waitForTimeout(2500);
  // Le fixture trascrivono «due ore di contabilità per omega»: il cliente Omega esiste (creato al punto 1).
  verifica('trascrizione (fixture) → frase nel flusso → scheda salvata (Omega, Contabilità, 2 h)', (await schede().count()) === prima + 1 && /Omega.*Contabilità.*2 h/s.test(await schede().last().textContent()));
  await p.screenshot({ path: '/tmp/ui-ts-m1-7-voce.png' });
} else {
  console.log('  (ffmpeg assente: microfono non provato)');
}

// Con l'AI abilitata il modello (fixture) suggerisce il primo servizio: nella domanda compare per primo,
// poi il generico e «Altri…» che apre l'elenco intero. Il suggerimento non decide: la scheda nasce solo dopo il tocco.
{
  const prima = await schede().count();
  await p.fill('[data-test="campo-chat"]', `un'ora per Omega ${suffisso}`);
  await p.click('[data-test="invia-chat"]');
  await p.waitForSelector('[data-test="domanda-servizio"]');
  const testi = await p.locator('[data-test="domanda-servizio"] button').allTextContents();
  verifica('AI abilitata, frase senza servizio → il suggerimento del modello è il primo pulsante, poi il generico e «Altri…»', testi.length === 3 && testi[0] === 'Contabilità' && testi[1] === 'Altro' && testi[2] === 'Altri…', testi);
  verifica('nessuna scheda salvata dal solo suggerimento', (await schede().count()) === prima);
  await p.click('[data-test="altri-servizi"]');
  verifica('«Altri…» mostra l’elenco intero dei servizi', (await p.locator('[data-test="domanda-servizio"] button').count()) >= 8);
  await p.click('[data-test="domanda-servizio"] button:has-text("Consulenza")');
  await p.waitForTimeout(1200);
  verifica('scelta diversa dal suggerimento → scheda salvata (Omega, Consulenza, 1 h)', (await schede().count()) === prima + 1 && /Omega.*Consulenza.*1 h/s.test(await schede().last().textContent()));
}

await b.close();
console.log(`\nUI TS-M1: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
