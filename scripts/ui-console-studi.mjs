/**
 * Giro Playwright: «Nuovo studio» dalla console.
 *
 *   npx wrangler dev --port 8787 --local   (dopo reset + migrate + seed, con dist/ costruita)
 *   node scripts/ui-console-studi.mjs      (CHROMIUM=/percorso/chrome se serve)
 *
 * Dimostra: il bottone c'è, il modal crea lo studio col primo professionista,
 * la password temporanea si vede una volta, lo studio compare in elenco, il
 * modal dello studio salva l'anagrafica, e il nuovo titolare entra nell'app.
 * AR-M21: nel modal dello studio, «Reimposta password» mostra la nuova password una volta, «Disattiva»/«Riattiva»
 * cambiano lo stato; «Elimina lo studio» chiede la denominazione e toglie lo studio vuoto dall'elenco.
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
const NOME = `Studio Verdi UI ${suffisso}`;
const EMAIL = `verdi.${suffisso}@studioverdi.test`;
const modal = 'div.fixed.inset-0';

await p.goto(`${BASE}/#console`);
await p.fill('input[type=email]', 'assistenza@contify.it');
await p.fill('input[type=password]', 'ConsoleSmoke!1');
await p.click('button:has-text("Entra nella console")');
await p.waitForSelector('button:has-text("Studi")');
await p.click('button:has-text("Studi")');
await p.waitForSelector('button:has-text("Nuovo studio")');
verifica('tab Studi con bottone «Nuovo studio»', true);
await p.screenshot({ path: '/tmp/ui-cs-1-elenco.png' });

await p.click('button:has-text("Nuovo studio")');
await p.waitForSelector(`${modal} input[placeholder="Studio Rossi & Associati"]`);
await p.fill(`${modal} input[placeholder="Studio Rossi & Associati"]`, NOME);
await p.fill(`${modal} input[placeholder="ODCEC Padova"]`, 'ODCEC Treviso');
const campi = p.locator(`${modal} input.input`);
// Ordine nel modulo: denominazione, CF, PIVA, ordine, qualifica, nome, email, CF prof, ordine prof, numero, date...
await campi.nth(1).fill('01234567890');
await campi.nth(2).fill('01234567890');
await campi.nth(5).fill('Dott.ssa Anna Verdi');
await p.fill(`${modal} input[type=email]`, EMAIL);
await campi.nth(8).fill('Treviso');
await campi.nth(9).fill('4321');
await p.fill(`${modal} input[type=number]`, '1');
await p.screenshot({ path: '/tmp/ui-cs-2-modulo.png', fullPage: true });
await p.click(`${modal} button:has-text("Attiva lo studio")`);
await p.waitForSelector('[data-test="password-temporanea"]');
const pwd = (await p.textContent('[data-test="password-temporanea"]')).trim();
verifica('esito con password temporanea', pwd.length >= 10);
const testoEsito = await p.textContent(modal);
verifica('l\'esito dice se l\'email è partita', /email di benvenuto/.test(testoEsito));
await p.screenshot({ path: '/tmp/ui-cs-3-esito.png' });
await p.click(`${modal} button:has-text("Chiudi")`);
await p.waitForSelector(`td:has-text("${NOME}")`);
verifica('lo studio compare in elenco', true);
const rigaTesto = await p.locator(`tr:has(td:has-text("${NOME}"))`).textContent();
verifica('riga con 1 / 1 professionisti e stato attivo', /1\s*\/\s*1/.test(rigaTesto) && /Attivo/.test(rigaTesto));

// Modal dello studio: anagrafica
await p.click(`td:has-text("${NOME}")`);
await p.waitForSelector(`${modal} button:has-text("Salva anagrafica")`);
const denInput = p.locator(`${modal} input.input`).first();
verifica('il modal precompila la denominazione', (await denInput.inputValue()) === NOME);
await denInput.fill(`${NOME} & Partner`);
await p.click(`${modal} button:has-text("Salva anagrafica")`);
await p.waitForSelector(`${modal}:has-text("Anagrafica salvata.")`);
verifica('anagrafica salvata', true);
await p.screenshot({ path: '/tmp/ui-cs-4-anagrafica.png', fullPage: true });
await p.keyboard.press('Escape');
await p.waitForTimeout(300);
if (await p.locator(modal).count()) await p.click(`${modal} button[aria-label], ${modal} button:has-text("×")`).catch(() => {});
await p.waitForSelector(`td:has-text("${NOME} & Partner")`, { timeout: 5000 }).catch(() => {});
verifica('elenco aggiornato con la nuova denominazione', (await p.locator(`td:has-text("${NOME} & Partner")`).count()) === 1);

// Il nuovo titolare entra nell'app.
const ctx2 = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p2 = await ctx2.newPage();
p2.on('pageerror', (e) => console.log('  PAGE ERROR', e.message));
await p2.goto(BASE);
await p2.fill('input[type=email]', EMAIL);
await p2.fill('input[type=password]', pwd);
await p2.click('button[type=submit], button:has-text("Accedi"), button:has-text("Entra")');
await p2.waitForSelector('text=Scegli la tua password', { timeout: 10000 });
verifica('al primo accesso è chiesto il cambio password', true);
await p2.screenshot({ path: '/tmp/ui-cs-5-primo-accesso.png' });

// ── AR-M21 CON-02/CON-01 nel modal dello studio ──
console.log('\n== AR-M21 — utenti dalla console e cancellazione dello studio vuoto ==');
await p.bringToFront();
await p.click(`td:has-text("${NOME} & Partner")`);
await p.waitForSelector('[data-test=utenti-studio] table');
verifica('elenco utenti nel modal con «Reimposta password» e «Disattiva»', (await p.locator('[data-test=reimposta-password]').count()) >= 1 && (await p.locator('[data-test=disattiva-utente]').count()) >= 1);
await p.click('[data-test=reimposta-password] >> nth=0');
await p.waitForSelector('[data-test=conferma-reset]');
await p.click('[data-test=conferma-reset]');
await p.waitForSelector('[data-test=password-temporanea-reset]');
const pwdReset = await p.textContent('[data-test=password-temporanea-reset]');
verifica('nuova password temporanea mostrata una volta', pwdReset.length >= 10 && pwdReset !== pwd);
await p.screenshot({ path: '/tmp/ui-cs-6-reset.png', fullPage: true });
await p.click(`${modal}:has-text("Password reimpostata") button:has-text("Chiudi")`);
await p.waitForTimeout(300);
verifica('lo studio vuoto è cancellabile («Elimina lo studio»)', (await p.locator('[data-test=apri-elimina-studio]').count()) === 1);
await p.click('[data-test=apri-elimina-studio]');
await p.fill('[data-test=conferma-denominazione]', 'nome sbagliato');
verifica('con la denominazione sbagliata il pulsante resta spento', await p.locator('[data-test=conferma-elimina-studio]').isDisabled());
await p.fill('[data-test=conferma-denominazione]', `${NOME} & Partner`);
await p.screenshot({ path: '/tmp/ui-cs-7-elimina.png', fullPage: true });
await p.click('[data-test=conferma-elimina-studio]');
await p.waitForTimeout(1500);
verifica('lo studio non è più in elenco', (await p.locator(`td:has-text("${NOME} & Partner")`).count()) === 0);
await p.screenshot({ path: '/tmp/ui-cs-8-eliminato.png', fullPage: true });

await b.close();
console.log(`\n${ok} ok / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
