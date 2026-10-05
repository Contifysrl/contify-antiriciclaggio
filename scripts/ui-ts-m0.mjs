/**
 * Giro Playwright TS-M0: menu per modulo, selettore, gestione utenti, console.
 *
 *   npx wrangler dev --port 8787 --local   (dopo reset + migrate 0001..0015 + seed, con dist/ costruita)
 *   node scripts/smoke-api-ts-m0.mjs        (attiva Timesheet sullo studio demo)
 *   node scripts/ui-ts-m0.mjs               (CHROMIUM=/percorso/chrome se serve)
 *
 * Dimostra:
 *  1. studio con entrambi i moduli: il selettore «Antiriciclaggio | Timesheet» in cima alla barra laterale;
 *     con Timesheet il menu mostra la voce Timesheet più le voci comuni, nessuna voce di AR, il nome in
 *     alto è «Contify Timesheet», la pagina iniziale è «Registra» (TS-M1; in TS-M0 era la pagina provvisoria); con Antiriciclaggio
 *     torna il Cruscotto e il menu di sempre; la scelta resta dopo il ricaricamento;
 *  2. Impostazioni → Utenti: colonne «Antiriciclaggio» e «Timesheet»; «Nuovo utente» con i campi dei moduli;
 *     creazione di un utente con solo Timesheet dal modulo;
 *  3. l'utente con solo Timesheet entra senza selettore, senza voci di AR, senza «Attività», sulla pagina Timesheet;
 *     il link diretto a #clienti lo riporta alla pagina Timesheet;
 *  4. studio con solo AR (creato dalla console): nessun selettore, Cruscotto, menu identico a prima;
 *  5. console: etichette AR/TS nell'elenco, sezione «Moduli» nella scheda dello studio con le schede dei due
 *     moduli; «Nuovo studio» con le caselle dei moduli.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
let ok = 0, fail = 0;
const verifica = (d, cond) => { if (cond) { ok++; console.log(`  ok   ${d}`); } else { fail++; console.log(`  FAIL ${d}`); } };
p.on('pageerror', (e) => console.log('  PAGE ERROR', e.message));

const suffisso = Date.now().toString(36);
const modal = 'div.fixed.inset-0';
const vociMenu = async () => (await p.locator('aside nav button:not([data-test^="modulo-"])').allTextContents()).map((t) => t.replace(/\d+$/, '').trim());

async function login(email, password) {
  await ctx.clearCookies();
  await p.goto(`${BASE}/`);
  await p.waitForSelector('input[type=email]');
  await p.fill('input[type=email]', email);
  await p.fill('input[type=password]', password);
  await p.click('button:has-text("Accedi")');
  await p.waitForSelector('aside nav, input[placeholder="Almeno 8 caratteri"]');
}

/** Primo accesso: la password temporanea va sostituita. */
async function cambioPasswordSeChiesto(temporanea, nuova) {
  if (!(await p.locator('input[placeholder="Almeno 8 caratteri"]').count())) return;
  const campi = p.locator('input[type=password]');
  await campi.nth(0).fill(temporanea);
  await campi.nth(1).fill(nuova);
  await campi.nth(2).fill(nuova);
  await p.click('button:has-text("Salva e continua")');
  await p.waitForSelector('aside nav');
}

// ── 1. Studio con entrambi i moduli ──────────────────────────
console.log('== 1. Selettore dei moduli (studio demo con AR e Timesheet) ==');
await login('titolare@studiodemo.it', 'Antiriciclaggio!2026');
await p.waitForSelector('[data-test="selettore-moduli"]');
await p.waitForSelector('h1');
verifica('il selettore «Antiriciclaggio | Timesheet» c’è', (await p.locator('[data-test="modulo-AR"]').count()) === 1 && (await p.locator('[data-test="modulo-TS"]').count()) === 1);
verifica('all’inizio è scelto Antiriciclaggio e la pagina è il Cruscotto', (await p.getAttribute('[data-test="modulo-AR"]', 'aria-pressed')) === 'true' && (await p.locator('h1:has-text("Cruscotto")').count()) === 1);
let voci = await vociMenu();
verifica('menu AR: Cruscotto, Clienti, Fascicoli … e le voci comuni', voci.includes('Clienti') && voci.includes('Fascicoli') && voci.includes('Impostazioni') && voci.includes('Attività') && !voci.includes('Timesheet'));
await p.screenshot({ path: '/tmp/ui-ts-m0-1-ar.png' });

await p.click('[data-test="modulo-TS"]');
await p.waitForSelector('h1:has-text("Registra")');
verifica('con Timesheet: pagina iniziale «Registra» (TS-M1)', (await p.locator('h1:has-text("Registra")').count()) === 1);
voci = await vociMenu();
verifica('menu TS: Registra (e le voci del titolare) più le comuni, nessuna voce di AR', voci.includes('Registra') && voci.includes('Impostazioni') && voci.includes('Guida') && !voci.includes('Fascicoli') && !voci.includes('Cruscotto'));
verifica('il nome in alto segue il modulo: «Contify Timesheet»', /Timesheet/.test(await p.locator('aside').first().textContent()));
await p.screenshot({ path: '/tmp/ui-ts-m0-2-ts.png' });

await p.reload();
await p.waitForSelector('aside nav');
verifica('la scelta del modulo resta dopo il ricaricamento', (await p.getAttribute('[data-test="modulo-TS"]', 'aria-pressed')) === 'true' && (await p.locator('h1:has-text("Registra")').count()) === 1);

await p.click('[data-test="modulo-AR"]');
await p.waitForSelector('h1:has-text("Cruscotto")');
verifica('tornando ad Antiriciclaggio: Cruscotto', true);

// Guida: capitolo «Moduli e accessi»
await p.goto(`${BASE}/#guida?sezione=moduli`);
await p.waitForSelector('#guida-moduli');
verifica('la Guida ha il capitolo «Moduli e accessi»', /Moduli e accessi/.test(await p.textContent('#guida-moduli')));

// ── 2. Impostazioni → Utenti ─────────────────────────────────
console.log('== 2. Impostazioni → Utenti ==');
await p.goto(`${BASE}/#impostazioni`);
await p.waitForSelector('h3:has-text("Utenti dello studio")');
const intestazioni = await p.locator('div.scheda:has(h3:has-text("Utenti dello studio")) thead th').allTextContents();
verifica('colonne «Antiriciclaggio» e «Timesheet» nella tabella utenti', intestazioni.includes('Antiriciclaggio') && intestazioni.includes('Timesheet'));
const rigaTit = p.locator('[data-test="utente-titolare@studiodemo.it"]');
verifica('il titolare risulta con AR «sì» e Timesheet «Titolare»', /sì/.test(await rigaTit.locator('[data-test="accesso-ar"]').textContent()) && /Titolare/.test(await rigaTit.locator('[data-test="ruolo-ts"]').textContent()));
await p.screenshot({ path: '/tmp/ui-ts-m0-3-utenti.png', fullPage: true });

await p.click('button:has-text("Nuovo utente")');
await p.waitForSelector(`${modal} [data-test="campo-ruolo-ts"]`);
verifica('«Nuovo utente» mostra «Accede ad Antiriciclaggio» e «Ruolo Timesheet»', (await p.locator(`${modal} [data-test="campo-accesso-ar"]`).count()) === 1);
const EMAIL_TS = `ore.ui.${suffisso}@studiodemo.test`;
await p.fill(`${modal} input[type=email]`, EMAIL_TS);
await p.locator(`${modal} input.input`).first().fill('Utente Ore UI');
await p.uncheck(`${modal} [data-test="campo-accesso-ar"]`);
verifica('senza AR la tendina del ruolo AR si disattiva', await p.locator(`${modal} select.input`).first().isDisabled());
await p.selectOption(`${modal} [data-test="campo-ruolo-ts"]`, 'COLLABORATORE');
await p.screenshot({ path: '/tmp/ui-ts-m0-4-nuovo-utente.png' });
await p.click(`${modal} button:has-text("Crea l’utente")`);
await p.waitForSelector(`${modal}:has-text("Credenziali di primo accesso")`);
const pwdTs = (await p.locator(`${modal} .font-mono strong`).nth(1).textContent())?.trim();
verifica('utente creato con password temporanea', !!pwdTs && pwdTs.length >= 10);
await p.click(`${modal} button:has-text("Ho preso nota")`);
await p.waitForSelector(`[data-test="utente-${EMAIL_TS}"]`);
const rigaTs = p.locator(`[data-test="utente-${EMAIL_TS}"]`);
verifica('in tabella: AR «no», Timesheet «Collaboratore»', /no/.test(await rigaTs.locator('[data-test="accesso-ar"]').textContent()) && /Collaboratore/.test(await rigaTs.locator('[data-test="ruolo-ts"]').textContent()));

// ── 3. L'utente con solo Timesheet ───────────────────────────
console.log('== 3. Utente con solo Timesheet ==');
await login(EMAIL_TS, pwdTs);
await cambioPasswordSeChiesto(pwdTs, 'OreUi!2026xxx');
await p.waitForTimeout(500);
verifica('nessun selettore (un solo modulo)', (await p.locator('[data-test="selettore-moduli"]').count()) === 0);
verifica('pagina iniziale: Registra', (await p.locator('h1:has-text("Registra")').count()) === 1);
voci = await vociMenu();
verifica('menu senza voci di AR e senza «Attività»', !voci.includes('Fascicoli') && !voci.includes('Cruscotto') && !voci.includes('Attività') && voci.includes('Registra') && voci.includes('Impostazioni'));
verifica('la pagina Registra mostra la chat e non le voci del titolare', (await p.locator('[data-test="chat-registra"]').count()) === 1 && !voci.includes('Registrazioni') && !voci.includes('Servizi e tariffe'));
await p.goto(`${BASE}/#clienti`);
await p.waitForTimeout(400);
verifica('#clienti (pagina di AR) riporta alla pagina iniziale di Timesheet', (await p.locator('h1:has-text("Registra")').count()) === 1);
await p.screenshot({ path: '/tmp/ui-ts-m0-5-solo-ts.png' });

// ── 4. Studio con solo AR ────────────────────────────────────
console.log('== 4. Studio con solo AR dalla console ==');
const rc = await fetch(`${BASE}/api/console/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'assistenza@contify.it', password: 'ConsoleSmoke!1' }) });
const cookieConsole = rc.headers.get('set-cookie').split(';')[0];
const EMAIL_AR = `ar.ui.${suffisso}@studio-ar-ui.test`;
const rs = await fetch(`${BASE}/api/console/studi`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieConsole }, body: JSON.stringify({ denominazione: `Studio Solo AR UI ${suffisso}`, professionista: { nome: 'Dott. Ar Ui', email: EMAIL_AR } }) });
const studioAr = await rs.json();
verifica('studio con solo AR creato (campo moduli assente = AR)', rs.status === 201 && JSON.stringify(studioAr.moduli) === '["AR"]');
await login(EMAIL_AR, studioAr.passwordTemporanea);
await cambioPasswordSeChiesto(studioAr.passwordTemporanea, 'ArUi!2026xxxx');
await p.waitForTimeout(500);
verifica('solo AR: nessun selettore', (await p.locator('[data-test="selettore-moduli"]').count()) === 0);
verifica('solo AR: Cruscotto e menu di sempre', (await p.locator('h1:has-text("Cruscotto")').count()) === 1 && (await vociMenu()).includes('Clienti'));
await p.goto(`${BASE}/#impostazioni`);
await p.waitForSelector('h3:has-text("Utenti dello studio")');
const intestazioniAr = await p.locator('div.scheda:has(h3:has-text("Utenti dello studio")) thead th').allTextContents();
verifica('solo AR: nessuna colonna «Antiriciclaggio»/«Timesheet» in Utenti', !intestazioniAr.includes('Antiriciclaggio') && !intestazioniAr.includes('Timesheet'));

// ── 5. Console ───────────────────────────────────────────────
console.log('== 5. Console ==');
await ctx.clearCookies();
await p.goto(`${BASE}/#console`);
await p.fill('input[type=email]', 'assistenza@contify.it');
await p.fill('input[type=password]', 'ConsoleSmoke!1');
await p.click('button:has-text("Entra nella console")');
await p.waitForSelector('button:has-text("Studi")');
await p.click('button:has-text("Studi")');
await p.waitForSelector('td:has-text("Studio Commercialista Demo")');
const rigaDemo = p.locator('tr:has(td:has-text("Studio Commercialista Demo"))');
const badgeDemo = await rigaDemo.locator('[data-test="badge-moduli"]').textContent();
verifica('elenco studi: etichette AR e TS sullo studio demo', /AR/.test(badgeDemo) && /TS/.test(badgeDemo));
await p.screenshot({ path: '/tmp/ui-ts-m0-6-console-elenco.png' });
await rigaDemo.locator('td').first().click();
await p.waitForSelector(`${modal} [data-test="moduli-studio"]`);
await p.waitForSelector(`${modal} [data-test="scheda-modulo-TS"]`);
verifica('scheda dello studio: sezione «Moduli» con Antiriciclaggio e Timesheet attivi', /attivo/.test(await p.textContent(`${modal} [data-test="scheda-modulo-AR"]`)) && /attivo/.test(await p.textContent(`${modal} [data-test="scheda-modulo-TS"]`)));
await p.click(`${modal} [data-test="modifica-modulo-TS"]`);
await p.waitForSelector(`${modal} [data-test="stato-modulo-TS"]`);
verifica('«Modifica» apre stato, date, posti e note del modulo', (await p.locator(`${modal} [data-test="salva-modulo-TS"]`).count()) === 1);
await p.click(`${modal} [data-test="salva-modulo-TS"]`);
await p.waitForSelector(`${modal} [data-test="esito-moduli"]`);
verifica('salvataggio del modulo con esito', /aggiornato/.test(await p.textContent(`${modal} [data-test="esito-moduli"]`)));
await p.screenshot({ path: '/tmp/ui-ts-m0-7-console-moduli.png', fullPage: true });
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
await p.click('button:has-text("Nuovo studio")');
await p.waitForSelector(`${modal} [data-test="modulo-ts"]`);
verifica('«Nuovo studio» ha le caselle dei moduli, AR già spuntata', (await p.isChecked(`${modal} [data-test="modulo-ar"]`)) && !(await p.isChecked(`${modal} [data-test="modulo-ts"]`)));
await p.screenshot({ path: '/tmp/ui-ts-m0-8-console-nuovo.png' });

await b.close();
console.log(`\n${ok} ok, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
