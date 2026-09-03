/**
 * Giro Playwright AR-M19: coda di revisione e cruscotto di completezza.
 *
 *   1. Cruscotto → riquadro «Oggi ti mancano N cose» con «Inizia da»;
 *   2. Da completare → riepilogo, barra di avanzamento, filtri, tabella delle regole, pulsante che porta al fascicolo;
 *   3. Coda di revisione → caricamento in blocco di due PDF (letti nel browser), proposta con alert a destra,
 *      Invio applica → la proposta di titolarità entra in coda → conferma dei titolari; «Applica tutto» disabilitato
 *      quando restano solo proposte con alert alti;
 *   4. Fascicolo → registra il controllo costante (modal) → riga nello storico; cessazione del rapporto;
 *   5. Autovalutazione → registro della formazione: nuovo evento → riga in tabella.
 *
 *   npm run build && npx wrangler dev --port 8787 --local && node scripts/smoke-api-m17.mjs && node scripts/smoke-api-m19.mjs
 *   node scripts/ui-m19.mjs        (CHROMIUM=/percorso/chrome se serve)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const qui = path.dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await b.newContext({ viewport: { width: 1280, height: 1100 } });
const p = await ctx.newPage();
const scatti = [];
const scatto = async (nome) => { const f = `/tmp/m19-${nome}.png`; await p.screenshot({ path: f, fullPage: true }); scatti.push(f); };
let ok = 0, fail = 0;
const verifica = (d, cond) => { if (cond) { ok++; console.log(`  ok   ${d}`); } else { fail++; console.log(`  FAIL ${d}`); } };
p.on('pageerror', (e) => console.log('  PAGE ERROR', e.message));
const api = (metodo, percorso, corpo) => p.evaluate(async ({ metodo, percorso, corpo }) => {
  const r = await fetch(`/api${percorso}`, { method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
  return r.json().catch(() => null);
}, { metodo, percorso, corpo });

await p.goto(BASE);
await p.fill('input[type=email]', 'titolare@studiodemo.it');
await p.fill('input[type=password]', 'Antiriciclaggio!2026');
await p.click('button:has-text("Accedi")');
await p.waitForTimeout(1500);

// Coda pulita da corse precedenti: le visure in attesa si scartano (con motivazione), le titolarità restano.
const pendenti = await api('GET', '/coda');
for (const v of pendenti ?? []) {
  if (v.ambito === 'ANAGRAFICA') await api('POST', `/coda/${v.id}/scarta`, { motivazione: 'Pulizia del collaudo' });
  else await api('POST', `/proposte/${v.id}/esito`, { stato: 'SCARTATA', motivazione: 'Pulizia del collaudo' });
}

// ── 1. Cruscotto ──────────────────────────────────────────────
await p.goto(`${BASE}/#cruscotto`);
await p.waitForSelector('[data-test=cruscotto-completezza]', { timeout: 15000 });
await scatto('1-cruscotto');
const riquadro = await p.textContent('[data-test=cruscotto-completezza]');
verifica('cruscotto: «Oggi ti mancano N cose» con «Inizia da»', /Oggi ti mancano \d+ cose/.test(riquadro) && /Inizia da/.test(riquadro));

// ── 2. Da completare ──────────────────────────────────────────
await p.click('nav button:has-text("Da completare")');
await p.waitForSelector('[data-test=completezza-riepilogo]', { timeout: 15000 });
await p.waitForTimeout(500);
await scatto('2-da-completare');
verifica('riepilogo con barra di avanzamento e «Inizia da qui»', await p.isVisible('[data-test=barra-avanzamento]') && await p.isVisible('[data-test=inizia-da]'));
const nClienti = await p.locator('[data-test=cliente-da-completare]').count();
verifica(`elenco dei clienti da completare (${nClienti})`, nClienti > 0);
await p.click('button:has-text("Da dove vengono queste regole?")');
await p.waitForSelector('[data-test=regole]');
verifica('tabella delle 13 regole con norma e modulistica', (await p.locator('[data-test=regole] tbody tr').count()) === 13 && /57\/2026/.test(await p.textContent('[data-test=regole]')));
await scatto('3-regole');
await p.selectOption('[data-test=filtri] select >> nth=0', 'alta');
await p.waitForTimeout(300);
const soloUrgenti = await p.locator('[data-test=elenco-clienti] .badge, [data-test=elenco-clienti] span').allTextContents();
verifica('filtro «urgenti»: nessuna voce «da fare» o «quando puoi»', !soloUrgenti.some((t) => t === 'da fare' || t === 'quando puoi'));
await p.selectOption('[data-test=filtri] select >> nth=0', '');
const primoBottone = p.locator('[data-test=cliente-da-completare] li button').first();
const testoAzione = await primoBottone.textContent();
await primoBottone.click();
await p.waitForTimeout(800);
verifica(`il pulsante «${testoAzione}» porta alla pagina dove si risolve`, /#(fascicol|cliente|controlli|coda)/.test(p.url()));

// ── 3. Coda di revisione ──────────────────────────────────────
await p.goto(`${BASE}/#coda`);
await p.waitForSelector('[data-test=carica-in-blocco]', { timeout: 15000 });
await scatto('4-coda-vuota');
const [chooser] = await Promise.all([
  p.waitForEvent('filechooser'),
  p.click('[data-test=scegli-visure]'),
]);
await chooser.setFiles([
  path.join(qui, '..', 'tests', 'fixtures', 'visure', 'srl-due-soci-pf.pdf'),
  path.join(qui, '..', 'tests', 'fixtures', 'visure', 'srl-quattro-soci-25.pdf'),
]);
await p.waitForSelector('[data-test=coda-voce]', { timeout: 30000 });
await p.waitForTimeout(800);
await scatto('5-coda-proposta');
verifica('due visure accodate, lette nel browser', /Proposta 1 di 2/.test(await p.textContent('[data-test=coda-posizione]')));
verifica('proposta a sinistra (soci e cariche), alert a destra', await p.isVisible('[data-test=coda-voce] table') && await p.isVisible('[data-test=coda-alert]'));

/** Scorre la coda con le frecce finché la voce corrente soddisfa il predicato (l'ordine di ingestione non è garantito). */
async function vaiAVoce(pred, nome) {
  const n = Number((/di (\d+)/.exec(await p.textContent('[data-test=coda-posizione]')) ?? [])[1] ?? 1);
  for (let k = 0; k < n; k++) {
    if (pred(await p.textContent('[data-test=coda-voce]'), await p.textContent('[data-test=coda-alert]'))) return true;
    await p.keyboard.press(k < n - 1 ? 'ArrowRight' : 'ArrowLeft');
    await p.waitForTimeout(500);
  }
  for (let k = 0; k < n; k++) {
    if (pred(await p.textContent('[data-test=coda-voce]'), await p.textContent('[data-test=coda-alert]'))) return true;
    await p.keyboard.press('ArrowLeft');
    await p.waitForTimeout(500);
  }
  console.log(`  (voce «${nome}» non trovata)`, (await p.textContent('[data-test=coda-voce]')).slice(0, 120).replace(/\s+/g, ' '), '|', (await p.textContent('[data-test=coda-alert]')).slice(0, 80).replace(/\s+/g, ' '));
  return false;
}
const posPrima = await p.textContent('[data-test=coda-posizione]');
await p.keyboard.press('ArrowRight');
await p.waitForTimeout(400);
verifica('freccia → scorre alla seconda proposta', posPrima !== (await p.textContent('[data-test=coda-posizione]')));
verifica('la 4×25% (GAMMA FAMILY) mostra A1 (alta) fra gli alert', await vaiAVoce((v, a) => /GAMMA FAMILY/.test(v) && /A1\b/.test(a), 'GAMMA'));
await scatto('6-coda-quattro-soci');
// Invio applica ESEMPIO SRL (70/30, nessun alert alto) → la titolarità entra in coda.
verifica('ESEMPIO SRL in coda senza alert alti', await vaiAVoce((v, a) => /ESEMPIO SRL/.test(v) && !/A1\b/.test(a), 'ESEMPIO'));
await p.keyboard.press('Enter');
await p.waitForSelector('text=La proposta dei titolari effettivi è entrata in coda', { timeout: 20000 });
await p.waitForTimeout(800);
await scatto('7-coda-titolarita');
verifica('dopo Invio la proposta di titolarità è in coda (sempre 2 voci)', /di 2/.test(await p.textContent('[data-test=coda-posizione]')));
verifica('voce di titolarità di ESEMPIO SRL con la proposta viva', await vaiAVoce((v) => /Titolari effettivi di ESEMPIO SRL/.test(v) && /Proposta del programma/.test(v), 'titolarità ESEMPIO'));
await p.click('button:has-text("Conferma e registra i titolari effettivi")');
await p.waitForSelector('text=Titolari effettivi registrati', { timeout: 20000 });
verifica('titolari registrati dalla coda (proprietà 70/30)', true);
await p.waitForTimeout(600);
await scatto('8-coda-dopo');
verifica('«Applica tutto» disabilitato: resta solo la 4×25% con alert alto', await p.isDisabled('[data-test=applica-tutto]'));
// Scarto con motivazione della 4×25%.
verifica('la voce rimasta è la visura GAMMA FAMILY', await vaiAVoce((v) => /GAMMA FAMILY/.test(v), 'GAMMA'));
await p.click('[data-test=scarta]');
await p.fill('[data-test=scarta-motivo]', 'Collaudo: società non cliente');
await p.click('[data-test=scarta-conferma]');
await p.waitForSelector('text=Proposta scartata con motivazione', { timeout: 10000 });
verifica('scarto con motivazione', true);

// ── 4. Fascicolo: controllo costante e cessazione ─────────────
const clienti = await api('GET', '/clienti');
const cliente = clienti.find((c) => c.denominazione === 'ESEMPIO SRL') ?? clienti[0];
const nuovo = await api('POST', '/fascicoli', { clienteId: cliente.id, prestazioneCodice: 'CONSULENZA_TRIBUTARIA', dataConferimento: '2026-06-01' });
await p.goto(`${BASE}/#fascicolo?id=${nuovo.id}`);
await p.waitForSelector('[data-test=controllo-costante]', { timeout: 15000 });
await p.click('[data-test=registra-controllo]');
await p.waitForSelector('[data-test=controllo-salva]');
await p.fill('[data-test=controllo-note]', 'Visura riscontrata, nulla di nuovo.');
await scatto('9-controllo-modal');
await p.click('[data-test=controllo-salva]');
await p.waitForSelector('[data-test=storico-controlli]', { timeout: 10000 });
await p.waitForTimeout(500);
await scatto('10-controllo-registrato');
verifica('controllo costante registrato: riga nello storico con «nulla di nuovo»', /nulla di nuovo/.test(await p.textContent('[data-test=storico-controlli]')));
await p.click('[data-test=cessa-rapporto]');
await p.waitForSelector('[data-test=cessazione-conferma]');
await p.click('[data-test=cessazione-conferma]');
await p.waitForSelector('text=Rapporto cessato il', { timeout: 10000 });
await p.waitForTimeout(500);
await scatto('11-cessato');
verifica('rapporto cessato con termine di conservazione', /si conservano fino al/.test(await p.textContent('[data-test=controllo-costante]')));

// ── 5. Formazione ─────────────────────────────────────────────
await p.goto(`${BASE}/#autovalutazione`);
await p.waitForSelector('[data-test=formazione]', { timeout: 15000 });
await p.click('[data-test=formazione-nuovo]');
await p.fill('[data-test=formazione-titolo]', 'Aggiornamento antiriciclaggio ODCEC');
await p.click('[data-test=formazione] input[type=checkbox] >> nth=0');
await p.click('[data-test=formazione-salva]');
await p.waitForSelector('text=si aggiorna da solo', { timeout: 10000 });
await p.waitForTimeout(500);
await scatto('12-formazione');
verifica('evento formativo registrato in tabella', /Aggiornamento antiriciclaggio ODCEC/.test(await p.textContent('[data-test=formazione-elenco]')));

await b.close();
console.log(`\n${ok} ok / ${fail} FAIL`);
console.log('Scatti:', scatti.join(' '));
process.exit(fail ? 1 : 0);
