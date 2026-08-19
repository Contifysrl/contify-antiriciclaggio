/**
 * Giro di prova nell'interfaccia AR-M15: studio associato e autovalutazione
 * alimentata dai dati. Verifica quello che uno screenshot mostra e un test
 * API non vede: che i campi ci siano davvero, che il professionista che non
 * amministra non veda Backup, e che «Compila con i punteggi calcolati»
 * riempia i fattori.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const scatti = [];
const scatto = async (p, nome) => { const f = `/tmp/m15-${nome}.png`; await p.screenshot({ path: f, fullPage: true }); scatti.push(f); };

// Un contesto per utente: due sessioni nello stesso contesto condividono il
// cookie e la seconda non vedrebbe mai il modulo di accesso.
const entra = async (email, password) => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1100 } });
  const p = await ctx.newPage();
  await p.goto(BASE);
  await p.fill('input[type=email]', email);
  await p.fill('input[type=password]', password);
  await p.click('button:has-text("Accedi")');
  await p.waitForTimeout(1500);
  return p;
};

// ── 1. Il professionista che NON amministra ────────────────────
const associata = await entra('associato@studiodemo.it', 'Antiriciclaggio!2026');
console.log('associata — voce Backup nel menu:', (await associata.textContent('body')).includes('Backup'));
await associata.goto(`${BASE}/#impostazioni`);
await associata.waitForTimeout(1200);
{
  const t = await associata.textContent('body');
  console.log('associata — vede «Utenti dello studio»:', t.includes('Utenti dello studio'));
  console.log('associata — vede la Zona di sicurezza:', t.includes('Zona di sicurezza'));
}
await scatto(associata, '1-associata-impostazioni');

// ── 2. L'amministratore: utenti con dati d'albo ────────────────
const amm = await entra('titolare@studiodemo.it', 'Antiriciclaggio!2026');
await amm.goto(`${BASE}/#impostazioni`);
await amm.waitForTimeout(1000);
{
  const t = await amm.textContent('body');
  console.log('amministratore — vede «Utenti dello studio»:', t.includes('Utenti dello studio'));
  console.log('amministratore — badge amministratore in tabella:', t.includes('amministratore'));
}
await scatto(amm, '2-amministratore-utenti');

// ── 3. Clienti e fascicoli col professionista ──────────────────
await amm.goto(`${BASE}/#clienti`);
await amm.waitForTimeout(1000);
{
  const t = await amm.textContent('body');
  console.log('clienti — filtro professionista presente:', t.includes('Professionista:'));
  console.log('clienti — colonna Professionista:', (await amm.textContent('thead')).includes('Professionista'));
}
await scatto(amm, '3-clienti');

await amm.goto(`${BASE}/#fascicoli`);
await amm.waitForTimeout(1000);
await amm.click('button:has-text("Nuovo fascicolo")');
await amm.waitForTimeout(400);
{
  const t = await amm.textContent('body');
  console.log('nuovo fascicolo — campo «Professionista incaricato»:', t.includes('Professionista incaricato'));
  console.log('nuovo fascicolo — campo «Identificazione eseguita da»:', t.includes('Identificazione eseguita da'));
}
await scatto(amm, '4-nuovo-fascicolo');

// ── 4. Autovalutazione alimentata dai dati ─────────────────────
await amm.goto(`${BASE}/#autovalutazione`);
await amm.waitForTimeout(1500);
{
  const t = await amm.textContent('body');
  console.log('autovalutazione — scheda «Dati dello studio»:', t.includes('Dati dello studio'));
  console.log('autovalutazione — avviso di non significatività:', /meno di \d+ prestazioni/.test(t));
  console.log('autovalutazione — percentuali con denominatore:', /\d+ \/ \d+ = /.test(t));
}
await scatto(amm, '5-autovalutazione-dati');

const bottone = amm.locator('button:has-text("Compila con i punteggi calcolati")');
console.log('autovalutazione — pulsante di compilazione attivo:', await bottone.isEnabled());
if (await bottone.isEnabled()) {
  await amm.click('button:has-text("Compila con i punteggi calcolati")');
  await amm.waitForTimeout(600);
  // La scala dei punteggi è fatta di bottoni con aria-pressed, non di radio.
  const selezionati = await amm.evaluate(() =>
    document.querySelectorAll('.scala button[aria-pressed="true"]').length);
  console.log('autovalutazione — punteggi valorizzati dopo il click:', selezionati);
  await scatto(amm, '6-autovalutazione-compilata');
}

console.log('scatti:', scatti.join(' '));
await b.close();
