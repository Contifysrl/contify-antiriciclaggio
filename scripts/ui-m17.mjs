/**
 * Giro Playwright AR-M17: «Nuovo da visura» con il PDF sintetico a quattro
 * soci al 25% → revisione → compagine → proposta con A1/A2/A3 → sequenza
 * guidata → registrazione col criterio residuale → scheda del cliente con
 * compagine, documenti (visura conservata) e «Aggiorna da visura».
 *
 *   npm run build && npx wrangler dev --port 8787 --local
 *   node scripts/ui-m17.mjs        (CHROMIUM=/percorso/chrome se serve)
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const qui = path.dirname(fileURLToPath(import.meta.url));
const PDF = path.join(qui, '..', 'tests', 'fixtures', 'visure', 'srl-quattro-soci-25.pdf');
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await (await b.newContext({ viewport: { width: 1280, height: 1100 } })).newPage();
const scatti = [];
const M = 'div.fixed.inset-0'; // il modal (la classe .card è anche delle schede di pagina)
const scatto = async (nome) => { const f = `/tmp/m17-${nome}.png`; await p.screenshot({ path: f, fullPage: true }); scatti.push(f); };
let ok = 0, fail = 0;
const verifica = (d, cond) => { if (cond) { ok++; console.log(`  ok   ${d}`); } else { fail++; console.log(`  FAIL ${d}`); } };
p.on('pageerror', (e) => console.log('  PAGE ERROR', e.message));

await p.goto(BASE);
await p.fill('input[type=email]', 'titolare@studiodemo.it');
await p.fill('input[type=password]', 'Antiriciclaggio!2026');
await p.click('button:has-text("Accedi")');
await p.waitForTimeout(1500);

// Se una corsa precedente ha lasciato GAMMA FAMILY SRL: si cancella se possibile,
// altrimenti (ha la visura fra i documenti) si rinomina e si archivia, così il
// CF torna libero e il giro resta ripetibile.
const lista = await p.evaluate(async () => (await fetch('/api/clienti?archiviati=1')).json());
for (const c of lista.filter((x) => x.denominazione === 'GAMMA FAMILY SRL')) {
  await p.evaluate(async (id) => {
    const r = await fetch(`/api/clienti/${id}`, { method: 'DELETE' });
    if (r.status === 409) {
      const n = String(Date.now()).slice(-6);
      await fetch(`/api/clienti/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ denominazione: `GAMMA FAMILY SRL (prova ${n})`, codiceFiscale: `9${n}0000`, partitaIva: `9${n}0000` }) });
      await fetch(`/api/clienti/${id}/archiviazione`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archivia: true }) });
    }
  }, c.id);
}

await p.goto(`${BASE}/#clienti`);
await p.waitForTimeout(800);
await p.click('button:has-text("Nuovo da visura")');
await p.waitForTimeout(400);
await scatto('1-carica');
verifica('modal «Nuovo cliente da visura camerale» aperto', await p.isVisible('h2:has-text("Nuovo cliente da visura")'));

// Caricamento del PDF: pdfjs arriva con import() al primo uso.
await p.setInputFiles(`${M} input[type=file]`, PDF);
await p.waitForSelector('text=Anagrafica precompilata', { timeout: 20000 });
await scatto('2-revisione');
const denominazione = await p.inputValue(`${M} input >> nth=0`);
verifica(`denominazione precompilata (${denominazione})`, denominazione === 'GAMMA FAMILY SRL');
verifica('data di estrazione mostrata', await p.isVisible('text=estratta il'));
verifica('ATECO precompilato', (await p.evaluate(() => [...document.querySelectorAll('div.fixed.inset-0 input')].map((i) => i.value))).includes('47.71.10'));

await p.click('button:has-text("Avanti: compagine e cariche")');
await p.waitForTimeout(400);
await scatto('3-compagine');
const righeSoci = await p.locator(`${M} table tbody tr`).count();
verifica(`compagine: 4 soci + 1 carica in tabella (${righeSoci} righe)`, righeSoci === 5);
verifica('quote al 25 (campo modificabile)', (await p.evaluate(() => [...document.querySelectorAll('div.fixed.inset-0 table input')].map((i) => i.value))).filter((v) => v === '25').length === 4);

await p.click('button:has-text("Crea il cliente e proponi")');
await p.waitForSelector('text=Titolari effettivi proposti', { timeout: 15000 });
await p.waitForTimeout(500);
await scatto('4-proposta');
const testoProposta = await p.textContent(M);
verifica('A1 presente («non individua titolari effettivi»)', /A1/.test(testoProposta) && /non individua titolari effettivi/i.test(testoProposta));
verifica('A2 e A3 presenti', /A2/.test(testoProposta) && /A3/.test(testoProposta));
verifica('screening dei nomi eseguito o rinviato (mai silenzioso)', /screening/i.test(testoProposta));

await p.click(`${M} button:has-text("Apri la sequenza guidata") >> nth=0`);
await p.waitForTimeout(400);
await scatto('5-sequenza');
verifica('sequenza guidata con i tre gradini', await p.isVisible('text=Residuale (co. 5)'));
const bozza = await p.inputValue(`${M} textarea`);
verifica('bozza ex co. 6 precompilata dai fatti', /art\. 20 co\. 5/.test(bozza) && /DELTA DARIO/.test(bozza));
verifica('candidato DELTA DARIO spuntato', await p.isChecked(`${M} input[type=checkbox] >> nth=0`));
await p.fill(`${M} textarea`, bozza + ' Verificato in presenza dal professionista.');
await p.click('button:has-text("Registra col criterio residuale")');
await p.waitForTimeout(1500);
await scatto('6-registrato');
verifica('titolarità registrata → passo finale', await p.isVisible('button:has-text("Apri la scheda del cliente")'));
await p.click('button:has-text("Apri la scheda del cliente")');
await p.waitForTimeout(1500);
await scatto('7-scheda');
verifica('scheda del cliente aperta', (await p.textContent('h1')).includes('GAMMA FAMILY SRL'));
const scheda = await p.textContent('body');
verifica('titolare effettivo vigente DELTA DARIO col criterio residuale', /DELTA DARIO/.test(scheda) && /residuale poteri/i.test(scheda));
verifica('compagine mostrata nella scheda', /Compagine e cariche dalla visura/.test(scheda) && /ALFA ANNA/.test(scheda));
verifica('visura conservata fra i documenti', /srl-quattro-soci-25\.pdf/.test(scheda));
verifica('storico delle proposte con esito applicata/modificata', /Storico delle proposte/.test(scheda));
verifica('pulsante «Aggiorna da visura»', await p.isVisible('button:has-text("Aggiorna da visura")'));

// Aggiorna da visura: stesso PDF → nessuna differenza da applicare, compagine invariata.
await p.click('button:has-text("Aggiorna da visura")');
await p.setInputFiles(`${M} input[type=file]`, PDF);
await p.waitForSelector('text=Confronto campo per campo', { timeout: 20000 });
await scatto('8-confronto');
const spuntate = await p.locator(`${M} table tbody input[type=checkbox]:checked`).count();
verifica(`confronto: nessuna differenza pre-spuntata con la stessa visura (${spuntate})`, spuntate === 0);
await p.click('button:has-text("Avanti: compagine e cariche")');
await p.waitForTimeout(300);
await p.click('button:has-text("Applica e proponi")');
await p.waitForSelector('text=Cliente aggiornato', { timeout: 15000 });
const esito = await p.textContent(M);
verifica('compagine invariata (0 nuove, 0 chiuse, 4 invariate)', /0 righe nuove, 0 chiuse, 4 invariate/.test(esito));
await scatto('9-aggiornata');

console.log(`\n${ok} ok / ${fail} FAIL`);
console.log('scatti:', scatti.join(' '));
await b.close();
process.exit(fail ? 1 : 0);
