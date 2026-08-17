/** Giro di prova nell'interfaccia: elenco → scheda → modifica → archiviazione → cancellazione. */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await (await b.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
const scatti = [];
const scatto = async (nome) => { const f = `/tmp/m14-${nome}.png`; await p.screenshot({ path: f, fullPage: true }); scatti.push(f); };

await p.goto(BASE);
await p.fill('input[type=email]', 'titolare@studiodemo.it');
await p.fill('input[type=password]', 'Antiriciclaggio!2026');
await p.click('button:has-text("Accedi")');
await p.waitForTimeout(1500);

// Un cliente pulito, come quelli appena importati.
await p.goto(`${BASE}/#clienti`);
await p.waitForTimeout(800);
await p.click('button:has-text("Nuovo cliente")');
await p.waitForTimeout(300);
await p.fill('.scheda input >> nth=0', 'Prova Interfaccia S.n.c.');
await p.click('button:has-text("Salva")');
await p.waitForTimeout(1200);
await scatto('1-elenco');

// Il click sulla riga deve aprire la SCHEDA, non i fascicoli.
await p.click('table tbody tr:has-text("Prova Interfaccia")');
await p.waitForTimeout(1200);
console.log('hash dopo il click sulla riga:', await p.evaluate(() => location.hash));
console.log('titolo pagina:', await p.textContent('h1'));
await scatto('2-scheda');

// Modifica.
await p.click('button:has-text("Modifica l’anagrafica")');
await p.waitForTimeout(400);
await p.selectOption('.scheda select >> nth=0', 'PERSONA_FISICA');
await p.click('button:has-text("Salva le modifiche")');
await p.waitForTimeout(1200);
console.log('natura dopo la modifica:', (await p.textContent('.occhiello')).trim().slice(0, 60));
await scatto('3-modificato');

// Archiviazione e ripristino.
await p.click('button:has-text("Archivia il cliente")');
await p.waitForTimeout(1200);
console.log('archiviato:', await p.isVisible('button:has-text("Ripristina fra i clienti attivi")'));
await scatto('4-archiviato');
await p.click('button:has-text("Ripristina fra i clienti attivi")');
await p.waitForTimeout(1200);

// Cancellazione, con la conferma a due passi.
await p.click('button:has-text("Elimina definitivamente")');
await p.waitForTimeout(400);
await scatto('5-conferma-1');
await p.click('.card button:text-is("Elimina")');
await p.waitForTimeout(400);
await scatto('6-conferma-2');
await p.click('.card button:has-text("Elimina definitivamente")');
await p.waitForTimeout(1500);
console.log('hash dopo la cancellazione:', await p.evaluate(() => location.hash));
console.log('il cliente è ancora in elenco:', await p.isVisible('table tbody tr:has-text("Prova Interfaccia")'));
await scatto('7-dopo-cancellazione');

console.log('scatti:', scatti.join(' '));
await b.close();
