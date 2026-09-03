/**
 * Giro Playwright AR-M18: il fascicolo proposto.
 *
 *   1. Impostazioni → tabella delle province con flussi anomali di contante (PD alto);
 *   2. Fascicoli → «Nuovo fascicolo» su un cliente da visura: esecutore precompilato dalle cariche;
 *   3. fascicolo: riquadro «Fascicolo proposto» (Tabella A con motivazioni, alert A10, esecutore
 *      registrato, checklist), «Usa i punteggi proposti», scostamento → motivazione obbligatoria,
 *      consolidamento; scheda di verifica scaricabile;
 *   4. verifica a distanza con la dichiarazione art. 22 precompilata: il cliente (pagina pubblica)
 *      conferma la ricostruzione, risponde alle domande e dichiara i PEP; lo studio esamina e
 *      acquisisce → documento nel fascicolo.
 *
 *   npm run build && npx wrangler dev --port 8787 --local && node scripts/smoke-api-m17.mjs (crea i clienti da visura)
 *   node scripts/ui-m18.mjs        (CHROMIUM=/percorso/chrome se serve)
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await b.newContext({ viewport: { width: 1280, height: 1100 } });
const p = await ctx.newPage();
const scatti = [];
const scatto = async (nome) => { const f = `/tmp/m18-${nome}.png`; await p.screenshot({ path: f, fullPage: true }); scatti.push(f); };
let ok = 0, fail = 0;
const verifica = (d, cond) => { if (cond) { ok++; console.log(`  ok   ${d}`); } else { fail++; console.log(`  FAIL ${d}`); } };
p.on('pageerror', (e) => console.log('  PAGE ERROR', e.message));

await p.goto(BASE);
await p.fill('input[type=email]', 'titolare@studiodemo.it');
await p.fill('input[type=password]', 'Antiriciclaggio!2026');
await p.click('button:has-text("Accedi")');
await p.waitForTimeout(1500);

// Un cliente da visura con compagine (creato dallo smoke m17/m18): ESEMPIO SRL (Padova).
const clienti = await p.evaluate(async () => (await fetch('/api/clienti')).json());
const cliente = clienti.find((c) => c.denominazione === 'ESEMPIO SRL') ?? clienti.find((c) => c.tipo === 'SOCIETA_CAPITALI');
verifica(`cliente di prova: ${cliente?.denominazione}`, Boolean(cliente));

// ── 1. Province ───────────────────────────────────────────────
await p.evaluate(async () => { await fetch('/api/studio/province-contante', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ province: [] }) }); });
await p.goto(`${BASE}/#impostazioni`);
await p.waitForSelector('[data-test=province-contante]', { timeout: 10000 });
await scatto('1-province');
verifica('riquadro province con link alla mappa ANR', await p.isVisible('[data-test=province-contante] a[href*="dt.mef.gov.it"]'));
await p.click('[data-test=province-modifica]');
await p.selectOption('[data-test=province-select]', 'PD');
await p.click('button:has-text("Aggiungi come «alto»")');
await p.click('[data-test=province-salva]');
await p.waitForSelector('text=Tabella salvata', { timeout: 10000 });
await scatto('2-province-salvate');
verifica('Padova salvata come alto', /Padova \(PD\) · alto/.test(await p.textContent('[data-test=province-contante]')));

// ── 2. Nuovo fascicolo con esecutore proposto ─────────────────
await p.goto(`${BASE}/#fascicoli`);
await p.waitForTimeout(800);
await p.click('button:has-text("Nuovo fascicolo")');
await p.selectOption('select >> nth=0', cliente.id);
await p.waitForSelector('[data-test=esecutore-form]', { timeout: 10000 });
await p.waitForTimeout(800);
await scatto('3-nuovo-fascicolo');
const esecutoreNome = await p.inputValue('[data-test=esecutore-form] input >> nth=0');
verifica(`esecutore precompilato dalle cariche (${esecutoreNome})`, esecutoreNome.length > 3);
await p.selectOption('select >> nth=1', 'CONSULENZA_TRIBUTARIA');
await p.click('button:has-text("Apri il fascicolo")');
await p.waitForSelector('[data-test=fascicolo-proposto]', { timeout: 15000 });
await p.waitForTimeout(800);
await scatto('4-fascicolo-proposto');
const riquadro = await p.textContent('[data-test=fascicolo-proposto]');
verifica('esecutore registrato dalla proposta', /Registrato:/.test(riquadro) && riquadro.includes(esecutoreNome));
verifica('Tabella A proposta con A.1 e A.4 e motivazioni', await p.isVisible('[data-test=proposta-natura_giuridica]') && /Padova/.test(riquadro));
verifica('A.3 chiesto', /chiesto/.test(await p.textContent('[data-test=proposta-comportamento]')));
verifica('alert A10 (provincia e/o costituzione recente)', await p.isVisible('[data-test=alert-A10]'));
verifica('checklist con la voce «dichiarazione art. 22» e il suo stato', /manca|presente/.test(await p.textContent('[data-test=checklist-DICHIARAZIONE_ART22]')));

// ── 3. Tabella A dalla proposta, scostamento motivato ─────────
await p.click('[data-test=applica-tabella-a]');
await p.waitForTimeout(300);
const premuti = await p.locator('.scala button[aria-pressed=true]').count();
verifica(`punteggi proposti applicati alla Tabella A (${premuti} fattori)`, premuti >= 2);
// A.2 e A.3: quelli «chiesti» o già proposti si completano a mano; A.1 si sposta da 1 a 2 → scostamento.
const gruppi = p.locator('.scheda:has(h3:has-text("Tabella A")) .campo');
const nGruppi = await gruppi.count();
for (let i = 0; i < nGruppi; i++) {
  const g = gruppi.nth(i);
  const etichetta = await g.locator('label').first().textContent();
  if (/Natura giuridica/.test(etichetta)) await g.locator('.scala button').nth(1).click();
  else if (/Comportamento/.test(etichetta) || /Prevalente/.test(etichetta)) { if ((await g.locator('.scala button[aria-pressed=true]').count()) === 0) await g.locator('.scala button').nth(0).click(); }
}
const gruppiB = p.locator('.scheda:has(h3:has-text("Tabella B")) .campo');
for (let i = 0; i < (await gruppiB.count()); i++) await gruppiB.nth(i).locator('.scala button').nth(0).click();
await p.waitForSelector('text=Anteprima dell’esito', { timeout: 10000 });
await p.waitForTimeout(500);
await scatto('5-scostamento');
verifica('scostamento rilevato: motivazione richiesta e consolida disabilitato', await p.isVisible('[data-test=motivazione-scostamento]') && await p.isDisabled('[data-test=consolida]'));
await p.fill('[data-test=motivazione-scostamento]', 'Cliente nuovo, struttura da approfondire: prudenza sul primo fascicolo.');
await p.click('[data-test=consolida]');
await p.waitForSelector('text=Valutazione vigente', { timeout: 15000 });
await p.waitForTimeout(800);
await scatto('6-consolidata');
verifica('valutazione consolidata', await p.isVisible('h3:has-text("Valutazione vigente")'));

// ── 4. Verifica a distanza con la dichiarazione precompilata ──
await p.click('button:has-text("Nuova richiesta al cliente…")');
await p.waitForTimeout(300);
const M = 'div.fixed.inset-0';
await p.click(`${M} label:has-text("PRECOMPILATA") input`);
await p.click(`${M} input[type=checkbox] >> nth=0`); // togli dati identificativi
await p.click(`${M} input[type=checkbox] >> nth=1`); // togli documento
await p.click(`${M} button:has-text("Crea il collegamento")`);
await p.waitForSelector('text=Collegamento creato', { timeout: 10000 });
const url = await p.textContent('div.font-mono.break-all');
verifica('link monouso creato', /#verifica\?token=/.test(url ?? ''));
await scatto('7-link');
await p.keyboard.press('Escape');

// Il cliente, in un altro browser.
const cliPage = await (await b.newContext({ viewport: { width: 900, height: 1400 } })).newPage();
cliPage.on('pageerror', (e) => console.log('  PAGE ERROR (cliente)', e.message));
// In locale il link porta il dominio di produzione (urlApp): si tiene solo il token.
await cliPage.goto(`${BASE}/${url.trim().slice(url.trim().indexOf('#'))}`);
await cliPage.waitForSelector('[data-test=dichiarazione-te]', { timeout: 15000 });
await cliPage.screenshot({ path: '/tmp/m18-8-cliente.png', fullPage: true }); scatti.push('/tmp/m18-8-cliente.png');
const testoCliente = await cliPage.textContent('[data-test=dichiarazione-te]');
verifica('il cliente vede la ripartizione e il titolare individuato', /capitale/.test(testoCliente) && /Titolare effettivo individuato/.test(testoCliente));
await cliPage.click('[data-test=conferma-te]');
const domande = await cliPage.locator('[data-test^=domanda-]').count();
verifica(`cinque domande sul controllo (${domande})`, domande === 5);
for (let i = 0; i < domande; i++) await cliPage.locator(`[data-test=domanda-${i}] input[type=radio]`).nth(0).click();
const pepSogg = await cliPage.locator('[data-test=pep-soggetto]').count();
for (let i = 0; i < pepSogg; i++) await cliPage.locator('[data-test=pep-soggetto]').nth(i).locator('input[type=radio]').nth(0).click();
await cliPage.fill('input.input >> nth=-1', 'Maria Esposito');
await cliPage.click('input[type=checkbox]');
await cliPage.click('button:has-text("Invia allo studio")');
await cliPage.waitForTimeout(2500);
const erroreCliente = await cliPage.locator('div.text-red-600').textContent().catch(() => '');
await cliPage.screenshot({ path: '/tmp/m18-8b-invio.png', fullPage: true }); scatti.push('/tmp/m18-8b-invio.png');
verifica(`invio del cliente riuscito${erroreCliente ? ` (errore: ${erroreCliente})` : ''}`, await cliPage.isVisible('text=Grazie, è tutto arrivato'));

// Lo studio esamina e acquisisce.
await p.reload();
await p.waitForSelector('button:has-text("Esamina e acquisisci")', { timeout: 15000 });
await p.click('button:has-text("Esamina e acquisisci")');
await p.waitForSelector('[data-test=dichiarazione-ricevuta]', { timeout: 10000 });
await scatto('9-esamina');
verifica('lo studio vede la dichiarazione confermata senza segnali', /confermato/.test(await p.textContent('[data-test=dichiarazione-ricevuta]')));
await p.click('button:has-text("Acquisisci quanto selezionato")');
await p.waitForTimeout(2000);
await scatto('10-acquisita');
const corpo = await p.textContent('body');
verifica('documento DICHIARAZIONE_ART22 fra i documenti del fascicolo', /DICHIARAZIONE_ART22/.test(corpo) || /dichiarazione-art22/.test(corpo));
await p.click('[data-test=fascicolo-proposto] button:has-text("Mostra")');
await p.waitForSelector('[data-test=checklist-DICHIARAZIONE_ART22]', { timeout: 10000 });
verifica('checklist: dichiarazione art. 22 presente', /presente/.test(await p.textContent('[data-test=checklist-DICHIARAZIONE_ART22]')));
await scatto('11-checklist');

console.log(`\n${ok} ok / ${fail} FAIL`);
console.log('scatti:', scatti.join(' '));
await b.close();
process.exit(fail ? 1 : 0);
