/**
 * Giro Playwright AR-M23b: il Worker davanti agli asset (run_worker_first).
 *
 * In produzione il livello degli asset di Cloudflare rispondeva con index.html
 * a OGNI navigazione (Sec-Fetch-Mode: navigate) verso un percorso che non è un
 * file — quindi anche a «Apri» su /api/documenti/:id — senza passare dal
 * Worker: «i documenti non si aprono» (Barbara). Con `run_worker_first = true`
 * tutte le richieste passano dal Worker, e per la prima volta anche l'HTML e gli
 * asset escono con le intestazioni di sicurezza (CSP). Questo giro verifica che
 * l'applicazione REGGA la CSP in ogni pagina, compreso il ritaglio di foto
 * profilo e logo (immagini blob:), e fissa il contratto della navigazione verso
 * un documento (200 inline application/pdf, non index.html).
 *
 * wrangler dev in locale non replica il fallback SPA di produzione: la prova
 * decisiva del bug resta il curl in produzione con Sec-Fetch-Mode: navigate
 * (vedi AR-M23b-rilascio.md).
 *
 *   npm run build && npx wrangler dev --port 8787 --local
 *   node scripts/ui-m23b.mjs        (CHROMIUM=/percorso/chrome se serve)
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
const p = await ctx.newPage();
let ok = 0, fail = 0;
const verifica = (d, cond) => { if (cond) { ok++; console.log(`  ok   ${d}`); } else { fail++; console.log(`  FAIL ${d}`); } };
const suffisso = String(Date.now()).slice(-6);

// Ogni violazione della CSP finisce in console come «Refused to …».
const violazioni = [];
p.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) violazioni.push(m.text()); });
p.on('pageerror', (e) => console.log('  PAGE ERROR', e.message));

// ── 0. L'HTML esce dal Worker con la CSP ───────────────────────
const prima = await p.goto(BASE);
const csp = prima.headers()['content-security-policy'] ?? '';
verifica('index.html servito con Content-Security-Policy', /default-src 'self'/.test(csp));
verifica('CSP: img-src ammette data: e blob: (foto profilo e logo)', /img-src[^;]*data:[^;]*blob:/.test(csp));
await p.fill('input[type=email]', 'titolare@studiodemo.it');
await p.fill('input[type=password]', 'Antiriciclaggio!2026');
await p.click('button:has-text("Accedi")');
await p.waitForTimeout(1500);

// ── 1. Tutte le pagine sotto CSP ───────────────────────────────
const pagine = ['cruscotto', 'completezza', 'coda', 'autovalutazione', 'clienti', 'fascicoli', 'scadenzario', 'contante', 'controlli', 'sos', 'normativa', 'attivita', 'impostazioni', 'backup', 'novita', 'guida', 'assistenza'];
for (const pg of pagine) {
  await p.goto(`${BASE}/#${pg}`);
  await p.waitForTimeout(700);
}
verifica(`nessuna violazione CSP su ${pagine.length} pagine`, violazioni.length === 0);

// ── 2. Foto profilo e logo: immagini blob: → canvas → data URL ─
await p.goto(`${BASE}/#impostazioni`);
await p.waitForSelector('button:has-text("Carica una foto"), button:has-text("Cambia foto")', { timeout: 10000 });
const png = await p.screenshot({ clip: { x: 0, y: 0, width: 64, height: 64 } }); // un PNG vero
const inputImmagini = p.locator('input[type=file][accept="image/*"]');
await inputImmagini.nth(0).setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png });
await p.waitForTimeout(1500);
verifica('foto profilo ritagliata e mostrata (img data:)', await p.locator('img[alt^="Foto profilo"]').count() > 0);
const nLogoInput = await inputImmagini.count();
if (nLogoInput > 1) {
  await inputImmagini.nth(1).setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png });
  await p.waitForTimeout(1500);
  verifica('logo dello studio ridotto e mostrato', await p.locator('img[alt*="ogo"]').count() > 0);
}
verifica('nessuna violazione CSP nel ritaglio di foto e logo (blob:)', violazioni.length === 0);
// Pulizia: la foto e il logo di prova non restano.
await p.evaluate(async () => { await fetch('/api/auth/avatar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ avatar: null }) }); });
if (nLogoInput > 1) await p.evaluate(async () => { await fetch('/api/studio/logo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logo: null }) }); });

// ── 3. Contratto della navigazione verso un documento ──────────
const pf = await p.evaluate(async ({ nome, cf }) => (await fetch('/api/clienti', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
  tipo: 'PERSONA_FISICA', denominazione: nome, codiceFiscale: cf, paeseResidenza: 'IT', attivitaPrevalente: 'Agente di commercio',
  datiIdentificativi: { nome: 'Bruno', cognome: 'Neri', dataNascita: '1980-02-02', luogoNascita: 'Padova', residenza: 'Via Roma 1, 35100 Padova (PD)' },
}) })).json(), { nome: `NERI BRUNO ${suffisso}`, cf: `NREBRN80B02${suffisso.slice(0, 3)}X` });
await p.goto(`${BASE}/#cliente?id=${pf.id}`);
await p.waitForSelector('[data-test=archivio-documenti]', { timeout: 10000 });
await p.selectOption('[data-test=archivio-documenti] select', 'DOCUMENTO_IDENTITA');
await p.setInputFiles('[data-test=archivio-documenti] [data-test=carica-documento]', { name: 'carta identità Neri.pdf', mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n% collaudo ${suffisso}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF`) });
await p.waitForSelector('[data-test=archivio-documenti] [data-test=documento]', { timeout: 10000 });
const hrefApri = await p.getAttribute('[data-test=apri-documento]', 'href');
verifica('«Apri» punta a /api/documenti/:id', /^\/api\/documenti\/doc_/.test(hrefApri ?? ''));
// La stessa richiesta che fa il browser quando segue il link (navigazione, non fetch):
// deve tornare il PDF inline, MAI index.html. In produzione lo prova il curl del rilascio.
const nav = await ctx.request.get(`${BASE}${hrefApri}`, { headers: { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', Accept: 'text/html,application/xhtml+xml,*/*' } });
const h = nav.headers();
verifica('navigazione verso il documento → 200 application/pdf inline (non index.html)', nav.status() === 200 && /application\/pdf/.test(h['content-type'] ?? '') && /^inline/.test(h['content-disposition'] ?? ''));
verifica('nome del file con accenti in filename* (RFC 5987)', /filename\*=UTF-8''carta%20identit%C3%A0%20Neri\.pdf/.test(h['content-disposition'] ?? ''));
const nav404 = await ctx.request.get(`${BASE}/api/documenti/doc_inesistente`, { headers: { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', Accept: 'text/html' } });
verifica('navigazione verso un documento inesistente → 404 JSON (non index.html)', nav404.status() === 404 && /json/.test(nav404.headers()['content-type'] ?? ''));
// Le rotte della SPA restano servite da index.html.
const spa = await ctx.request.get(`${BASE}/clienti/qualunque`, { headers: { 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document', Accept: 'text/html' } });
verifica('percorso non-API → index.html 200 con CSP', spa.status() === 200 && /text\/html/.test(spa.headers()['content-type'] ?? '') && /default-src/.test(spa.headers()['content-security-policy'] ?? ''));
const asset = await ctx.request.get(`${BASE}/anello-contify.png`);
verifica('asset statico servito dal Worker (200 image/png)', asset.status() === 200 && /image\/png/.test(asset.headers()['content-type'] ?? ''));

if (violazioni.length) console.log('  Violazioni CSP:\n   ' + violazioni.join('\n   '));
console.log(`\n${ok} ok, ${fail} fail`);
await b.close();
process.exit(fail ? 1 : 0);
