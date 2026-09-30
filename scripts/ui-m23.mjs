/**
 * Giro Playwright AR-M23: le segnalazioni di Barbara.
 *
 *   1. Clienti → nuovo cliente persona fisica → nella scheda il titolare effettivo «coincide con il
 *      cliente» c'è già; riquadro AV.4 con il pulsante per ogni cliente; Archivio documenti con
 *      «Allega» → il documento compare con «Apri» e «Scarica»; «Apri» apre DAVVERO una nuova scheda
 *      con il contenuto (era la segnalazione n. 2);
 *   2. Fascicoli → «Nuovo fascicolo» sulla persona fisica: esecutore «in proprio» precompilato;
 *   3. fascicolo: «Modifica i dati dell'incarico» (date), archivio documenti con il documento del
 *      cliente («scheda cliente»), allegato dal fascicolo, «Fascicolo aperto per errore?»;
 *   4. modulo pubblico della persona fisica: sezione «Chi rende la dichiarazione» precompilata,
 *      «Agisco in proprio», PEP del dichiarante, invio;
 *   5. eliminazione di un secondo fascicolo vuoto con motivo e doppia conferma.
 *
 *   npm run build && npx wrangler dev --port 8787 --local
 *   node scripts/ui-m23.mjs        (CHROMIUM=/percorso/chrome se serve)
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await b.newContext({ viewport: { width: 1280, height: 1100 }, acceptDownloads: true });
const p = await ctx.newPage();
const scatti = [];
const scatto = async (nome) => { const f = `/tmp/m23-${nome}.png`; await p.screenshot({ path: f, fullPage: true }); scatti.push(f); };
let ok = 0, fail = 0;
const verifica = (d, cond) => { if (cond) { ok++; console.log(`  ok   ${d}`); } else { fail++; console.log(`  FAIL ${d}`); } };
p.on('pageerror', (e) => console.log('  PAGE ERROR', e.message));
const suffisso = String(Date.now()).slice(-6);

await p.goto(BASE);
await p.fill('input[type=email]', 'titolare@studiodemo.it');
await p.fill('input[type=password]', 'Antiriciclaggio!2026');
await p.click('button:has-text("Accedi")');
await p.waitForTimeout(1500);

// ── 1. Cliente persona fisica ─────────────────────────────────
const cfPf = `VRDGNI85A01${suffisso.slice(0, 3)}Q`;
const pf = await p.evaluate(async ({ nome, cf }) => (await fetch('/api/clienti', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
  tipo: 'PERSONA_FISICA', denominazione: nome, codiceFiscale: cf, paeseResidenza: 'IT', attivitaPrevalente: 'Agente di commercio',
  datiIdentificativi: { nome: 'Gino', cognome: 'Verdi', dataNascita: '1985-01-01', luogoNascita: 'Vicenza', residenza: 'Via Dante 7, 36100 Vicenza (VI)' },
}) })).json(), { nome: `VERDI GINO ${suffisso}`, cf: cfPf });
await p.goto(`${BASE}/#cliente?id=${pf.id}`);
await p.waitForSelector('[data-test=scheda-av4]', { timeout: 10000 });
await p.waitForTimeout(500);
await scatto('1-cliente-pf');
const schedaCliente = await p.textContent('body');
verifica('titolare effettivo «coincide con il cliente» già registrato', /cliente persona fisica/i.test(schedaCliente) && new RegExp(`VERDI GINO ${suffisso}`).test(schedaCliente));
verifica('riquadro AV.4 con spiegazione dell’opzione 1 e pulsante', await p.isVisible('[data-test=cliente-art22]') && /opzione 1/.test(await p.textContent('[data-test=scheda-av4]')));
verifica('archivio documenti vuoto con «Allega»', await p.isVisible('[data-test=archivio-documenti] label:has-text("Allega un documento")') && /Nessun documento/.test(await p.textContent('[data-test=archivio-documenti]')));
// Allega un PDF (finto ma con intestazione PDF) come documento d'identità.
await p.selectOption('[data-test=archivio-documenti] select', 'DOCUMENTO_IDENTITA');
await p.setInputFiles('[data-test=archivio-documenti] [data-test=carica-documento]', { name: 'carta identità Verdi.pdf', mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n% collaudo ${suffisso}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF`) });
await p.waitForSelector('[data-test=archivio-documenti] [data-test=documento]', { timeout: 10000 });
await scatto('2-documento-caricato');
verifica('il documento compare nell’archivio con «Apri» e «Scarica»', await p.isVisible('[data-test=apri-documento]') && await p.isVisible('[data-test=scarica-documento]'));
// «Apri»: nuova scheda con il contenuto (la segnalazione di Barbara: «non c'è più la possibilità di aprirlo»).
// In headless Chromium il PDF non ha il visualizzatore e diventa un download: qui conta che la scheda si
// apra sull'URL del documento e che il server risponda 200 inline; nel browser vero il PDF si vede.
const risposte = [];
ctx.on('response', (r) => { if (r.url().includes('/api/documenti/')) risposte.push(r); });
const [nuovaScheda] = await Promise.all([ctx.waitForEvent('page', { timeout: 10000 }), p.click('[data-test=apri-documento]')]);
await p.waitForTimeout(1500);
const rispostaApri = risposte.find((r) => !r.url().includes('scarica=1'));
verifica('«Apri» apre una nuova scheda sul documento, che risponde 200 come PDF inline', /\/api\/documenti\//.test(nuovaScheda.url()) && Boolean(rispostaApri) && rispostaApri.status() === 200 && /application\/pdf/.test(rispostaApri.headers()['content-type'] ?? '') && /^inline/.test(rispostaApri.headers()['content-disposition'] ?? ''));
await nuovaScheda.close().catch(() => null);
// «Scarica»: download con il nome del file.
const [download] = await Promise.all([p.waitForEvent('download', { predicate: (d) => d.url().includes('scarica=1'), timeout: 10000 }), p.click('[data-test=scarica-documento]')]);
// Nota: lo shell headless di Chromium non decodifica filename* (nome «download»): nel browser vero il nome è quello del file.
const cdScarica = await p.evaluate(async (u) => (await fetch(u)).headers.get('content-disposition'), download.url());
verifica(`«Scarica» avvia il download come allegato con il nome del file (${download.suggestedFilename()})`, /^attachment; filename="carta identita Verdi\.pdf"; filename\*=UTF-8''carta%20identit%C3%A0%20Verdi\.pdf$/.test(cdScarica ?? ''));

// ── 2. Nuovo fascicolo sulla persona fisica: esecutore in proprio ──
await p.goto(`${BASE}/#fascicoli`);
await p.waitForTimeout(800);
await p.click('button:has-text("Nuovo fascicolo")');
await p.selectOption('select >> nth=0', pf.id);
await p.waitForSelector('[data-test=esecutore-in-proprio]', { timeout: 10000 });
await p.waitForTimeout(500);
await scatto('3-nuovo-fascicolo-pf');
const esecNome = await p.inputValue('[data-test=esecutore-form] input >> nth=0');
const esecCf = await p.inputValue('[data-test=esecutore-form] input >> nth=1');
verifica('esecutore precompilato con i dati del cliente («in proprio»)', esecNome === `VERDI GINO ${suffisso}` && esecCf === cfPf);
await p.selectOption('select >> nth=1', 'TENUTA_CONTABILITA');
await p.fill('textarea', 'Tenuta della contabilità dell’attività di agente di commercio');
await p.click('button:has-text("Apri il fascicolo")');
await p.waitForSelector('[data-test=archivio-documenti]', { timeout: 15000 });
await p.waitForTimeout(800);
const urlFascicolo = p.url();
const fid = /id=([^&]+)/.exec(urlFascicolo)?.[1];
await scatto('4-fascicolo-pf');
verifica('il fascicolo mostra l’archivio con il documento caricato dalla scheda cliente', /scheda cliente/.test(await p.textContent('[data-test=archivio-documenti]')));

// ── 3. Modifica dei dati dell'incarico ────────────────────────
await p.click('[data-test=modifica-incarico]');
await p.waitForSelector('[data-test=form-incarico]', { timeout: 5000 });
const ieri = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
await p.fill('[data-test=incarico-conferimento]', ieri);
await p.fill('[data-test=incarico-identificazione]', ieri);
await p.fill('[data-test=incarico-motivazione]', 'incarico conferito ieri, non oggi');
await scatto('5-modifica-incarico');
await p.click('[data-test=incarico-salva]');
await p.waitForSelector('[data-test=modifica-incarico]', { timeout: 10000 });
await p.waitForTimeout(500);
const occhiello = await p.textContent('.occhiello');
verifica('la data di conferimento è cambiata nella testata', occhiello.includes(ieri.split('-').reverse().join('.')));
// Allegato dal fascicolo.
await p.selectOption('[data-test=archivio-documenti] select', 'INCARICO');
await p.setInputFiles('[data-test=archivio-documenti] [data-test=carica-documento]', { name: 'lettera incarico.pdf', mimeType: 'application/pdf', buffer: Buffer.from(`%PDF-1.4\n% incarico ${suffisso}\n%%EOF`) });
await p.waitForTimeout(1500);
const righeDoc = await p.locator('[data-test=archivio-documenti] [data-test=documento]').count();
verifica(`due documenti nell’archivio del fascicolo (cliente + fascicolo): ${righeDoc}`, righeDoc === 2 && /questo fascicolo/.test(await p.textContent('[data-test=archivio-documenti]')));
await scatto('6-archivio-fascicolo');
verifica('con un documento il fascicolo non è più eliminabile e lo dice', /non si può eliminare/.test(await p.textContent('[data-test=zona-eliminazione]')));

// ── 4. Modulo pubblico della persona fisica (opzione 1) ───────
const vr = await p.evaluate(async (fid) => (await fetch(`/api/fascicoli/${fid}/verifica-remota`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ richieste: { datiIdentificativi: false, documento: false, pep: false, dichiarazioneTe: true } }) })).json(), fid);
const token = vr.url.split('token=')[1];
const pub = await ctx.newPage();
await pub.goto(`${BASE}/#verifica?token=${token}`);
await pub.waitForSelector('[data-test=dichiarante]', { timeout: 10000 });
await pub.waitForTimeout(500);
await pub.screenshot({ path: '/tmp/m23-7-pubblica-pf.png', fullPage: true }); scatti.push('/tmp/m23-7-pubblica-pf.png');
verifica('pagina pubblica: dati del dichiarante precompilati (nome e CF)', (await pub.inputValue('[data-test=dichiarante-nome]')) === `VERDI GINO ${suffisso}` && (await pub.locator('[data-test=dichiarante] input').nth(1).inputValue()) === cfPf);
verifica('opzione 1: «Agisco in proprio», niente domande sulla compagine', await pub.isVisible('[data-test=dichiarazione-te] [data-test=conferma-te]') && !(await pub.isVisible('[data-test=domanda-0]')));
await pub.click('[data-test=conferma-scopo]');
await pub.click('[data-test=dichiarazione-te] [data-test=conferma-te]');
await pub.click('input[type=checkbox]');
await pub.click('button:has-text("Invia allo studio")');
await pub.waitForTimeout(800);
verifica('senza il PEP del dichiarante il modulo si ferma', /politicamente esposta/.test(await pub.textContent('form')));
await pub.click('[data-test=pep-dichiarante-no]');
await pub.click('button:has-text("Invia allo studio")');
await pub.waitForSelector('text=Grazie, è tutto arrivato', { timeout: 10000 });
verifica('invio riuscito', true);
await pub.close();
await p.reload();
await p.waitForSelector('[data-test=archivio-documenti]', { timeout: 15000 });
await p.waitForTimeout(800);
const esamina = await p.locator('button:has-text("Esamina")').first();
verifica('lo studio vede la richiesta completata', await esamina.isVisible().catch(() => false));

// ── 5. Eliminazione di un fascicolo vuoto ─────────────────────
const f2 = await p.evaluate(async (id) => (await fetch('/api/fascicoli', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clienteId: id, prestazioneCodice: 'CONSULENZA_TRIBUTARIA', tipoRapporto: 'OCCASIONALE', importoOperazione: 1000, dataConferimento: new Date().toISOString().slice(0, 10) }) })).json(), pf.id);
await p.goto(`${BASE}/#fascicolo?id=${f2.id}`);
// Il cambio di hash non ricarica la pagina: si aspetta il codice del nuovo fascicolo nel titolo.
await p.waitForFunction((codice) => document.querySelector('h1')?.textContent?.includes(codice), f2.codice, { timeout: 15000 });
await p.waitForSelector('[data-test=zona-eliminazione]', { timeout: 15000 });
verifica('il fascicolo vuoto è eliminabile', await p.isVisible('[data-test=apri-elimina-fascicolo]'));
await p.click('[data-test=apri-elimina-fascicolo]');
await p.fill('[data-test=motivazione-elimina]', 'aperto per errore: prestazione sbagliata');
await scatto('8-elimina');
await p.click('[data-test=elimina-fascicolo]');
await p.waitForSelector('text=Eliminare il fascicolo?', { timeout: 5000 });
// Doppia conferma del componente ConfermaEliminazione: «Elimina» poi «Elimina definitivamente».
await p.click('.fixed button:has-text("Elimina")');
await p.waitForSelector('.fixed button:has-text("Elimina definitivamente")', { timeout: 5000 });
await p.click('.fixed button:has-text("Elimina definitivamente")');
await p.waitForURL(/#fascicoli$/, { timeout: 10000 }).catch(() => null);
await p.waitForTimeout(800);
const listaFascicoli = await p.evaluate(async () => (await fetch('/api/fascicoli')).json());
verifica('il fascicolo eliminato non c’è più in elenco', !listaFascicoli.some((x) => x.id === f2.id));
await scatto('9-dopo-eliminazione');

console.log(`\n${ok} ok / ${fail} FAIL — scatti: ${scatti.join(' ')}`);
await b.close();
process.exit(fail ? 1 : 0);
