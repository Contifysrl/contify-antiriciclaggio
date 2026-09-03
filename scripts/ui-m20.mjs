/**
 * Giro Playwright AR-M20: controllo costante alimentato dai dati.
 *
 *   1. Scheda cliente con visura vecchia → alert A12 «Visura da rinnovare» con pulsante che apre «Aggiorna da visura»;
 *   2. Rinnovo (via API) che cambia la struttura → riquadro «La compagine è cambiata» nella scheda cliente →
 *      registra il controllo costante dal modal → la proposta chiude e il riquadro sparisce;
 *   3. Fascicolo → «Registro dei titolari effettivi»: nuova consultazione DIFFORME → riquadro «da segnalare» →
 *      registra la segnalazione → storico con esito e riferimento;
 *   4. Controlli automatici → accreditamento con riferimento e delegati;
 *   5. Da completare → tabella delle regole con le voci nuove; Novità → voce del rilascio.
 *
 *   npm run build && npx wrangler dev --port 8787 --local && node scripts/smoke-api-m17.mjs
 *   node scripts/ui-m20.mjs        (CHROMIUM=/percorso/chrome se serve)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { leggiVisura } from '../web/src/lib/visura.ts';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const qui = path.dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await b.newContext({ viewport: { width: 1280, height: 1100 } });
const p = await ctx.newPage();
const scatti = [];
const scatto = async (nome) => { const f = `/tmp/m20-${nome}.png`; await p.screenshot({ path: f, fullPage: true }); scatti.push(f); };
let ok = 0, fail = 0;
const verifica = (d, cond) => { if (cond) { ok++; console.log(`  ok   ${d}`); } else { fail++; console.log(`  FAIL ${d}`); } };
p.on('pageerror', (e) => console.log('  PAGE ERROR', e.message));
const api = (metodo, percorso, corpo) => p.evaluate(async ({ metodo, percorso, corpo }) => {
  const r = await fetch(`/api${percorso}`, { method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
  return r.json().catch(() => null);
}, { metodo, percorso, corpo });
const upload = (percorso, nome, tipo, dataRiferimento) => p.evaluate(async ({ percorso, nome, tipo, dataRiferimento }) => {
  const f = new FormData();
  f.append('file', new Blob([`%PDF-1.4 ${nome} ${Math.random()}\n%%EOF`], { type: 'application/pdf' }), nome);
  f.append('tipo', tipo);
  if (dataRiferimento) f.append('dataRiferimento', dataRiferimento);
  const r = await fetch(`/api${percorso}`, { method: 'POST', body: f });
  return r.json().catch(() => null);
}, { percorso, nome, tipo, dataRiferimento });
const fixture = (n) => leggiVisura(fs.readFileSync(path.join(qui, '..', 'tests', 'fixtures', 'visure', n), 'utf8'));
const suffisso = String(Date.now()).slice(-6);
const oggi = new Date().toISOString().slice(0, 10);
function corpoDaVisura(v, extra = {}) {
  return {
    anagrafica: {
      denominazione: v.denominazione, tipo: v.tipoProposto, codiceFiscale: v.codiceFiscale, partitaIva: v.partitaIva, paeseResidenza: 'IT',
      attivitaPrevalente: v.attivitaPrevalente, ateco: v.ateco, datiIdentificativi: { sede: v.sede.testo, pec: v.pec, rea: v.rea },
    },
    soci: v.soci, cariche: v.cariche, capitale: v.capitale, dataVisura: v.dataEstrazione, dataElencoSoci: v.dataElencoSoci,
    telemetria: { tipoVisura: v.tipoVisura, formaVisura: v.formaVisura, pagine: 7, campiNonTrovati: [], avvisi: 0, soci: v.soci.length, cariche: v.cariche.length, tipoIncerto: false, dataEstrazione: v.dataEstrazione },
    ...extra,
  };
}

await p.goto(BASE);
await p.fill('input[type=email]', 'titolare@studiodemo.it');
await p.fill('input[type=password]', 'Antiriciclaggio!2026');
await p.click('button:has-text("Accedi")');
await p.waitForTimeout(1500);

// ── Preparazione via API: cliente da visura, titolari, fascicolo valutato e firmato, visura vecchia ──
const v = fixture('srl-due-soci-pf.txt');
v.codiceFiscale = `07777${suffisso}`; v.partitaIva = v.codiceFiscale; v.denominazione = `PLAYWRIGHT M20 ${suffisso} SRL`;
const creato = await api('POST', '/clienti/da-visura', corpoDaVisura(v));
const idC = creato?.id;
const teReg = await api('POST', `/clienti/${idC}/titolarita`, {
  propostaId: creato?.proposta?.id,
  titolari: (creato?.proposta?.analisi?.titolari ?? []).map((t) => ({ nominativo: t.denominazione, codiceFiscale: t.id, criterio: t.criterio, norma: t.norma, quota: Math.round((t.quotaEffettiva ?? 0) * 100), pep: false, motivazione: t.motivazione })),
});
const fasc = await api('POST', '/fascicoli', { clienteId: idC, prestazioneCodice: 'CONSULENZA_TRIBUTARIA', dataConferimento: oggi });
const A = { natura_giuridica: 4, prevalente_attivita: 4, comportamento: 4, area_geografica_cliente: 4 };
const B = { tipologia: 4, modalita_svolgimento: 4, ammontare: 4, frequenza_durata: 4, ragionevolezza: 4, area_geografica_destinazione: 4 };
const val = await api('POST', `/fascicoli/${fasc.id}/valutazioni`, { tabellaA: A, tabellaB: B, circostanze: {} });
await api('POST', `/fascicoli/${fasc.id}/valutazioni/${val.id}/firma`);
await upload(`/clienti/${idC}/documenti`, 'visura-2023.pdf', 'VISURA', '2023-01-10');
verifica('preparazione: cliente, titolari, fascicolo firmato, visura del 2023', Boolean(idC && teReg?.ok && fasc?.id && val?.id));
if (!teReg?.ok) console.log('  titolarita:', JSON.stringify(teReg).slice(0, 300));

// ── 1. A12 nella scheda cliente ───────────────────────────────
await p.goto(`${BASE}/#cliente?id=${idC}`);
await p.waitForSelector('[data-test=a12-rinnova]', { timeout: 20000 });
await scatto('1-a12');
verifica('A12 «Visura da rinnovare» con la data della visura', /Visura da rinnovare/.test(await p.textContent('body')) && /10\/01\/2023/.test(await p.textContent('body')));
await p.click('[data-test=a12-rinnova]');
await p.waitForSelector('div.fixed.inset-0', { timeout: 10000 });
verifica('il pulsante apre «Aggiorna da visura»', /visura/i.test(await p.textContent('div.fixed.inset-0')));
await scatto('2-a12-modal');
await p.keyboard.press('Escape');
await p.waitForTimeout(300);

// ── 2. Rinnovo con struttura cambiata → rivalutazione proposta ──
const v2 = structuredClone(v);
v2.soci[0] = { ...v2.soci[0], quotaPercento: 40 };
v2.soci.push({ ...v2.soci[1], nome: 'TERZO SOCIO', codiceFiscale: 'TRZSCO85C03L219K', id: 'TRZSCO85C03L219K', quotaPercento: 30 });
const agg = await api('POST', `/clienti/${idC}/da-visura`, { ...corpoDaVisura(v2), campi: {}, dataVisura: oggi });
verifica('rinnovo via API: struttura cambiata, una proposta di rivalutazione', agg?.variazioni?.strutturaCambiata === true && agg?.rivalutazioni?.length === 1);
await p.reload();
await p.waitForSelector('[data-test=rivalutazione-proposta]', { timeout: 20000 });
await scatto('3-rivalutazione');
const boxRiv = await p.textContent('[data-test=rivalutazione-proposta]');
verifica('riquadro «La compagine è cambiata» con le variazioni (socio entrato, quota variata)', /Socio entrato: TERZO SOCIO/.test(boxRiv) && /Quota variata/.test(boxRiv));
await p.click('[data-test=rivalutazione-registra]');
await p.waitForSelector('[data-test=rivalutazione-salva]');
verifica('modal con esito proposto «da rivalutare» e note precompilate', await p.isChecked('[data-test=rivalutazione-si]') && /Quota variata/.test(await p.inputValue('[data-test=rivalutazione-note]')));
await scatto('4-rivalutazione-modal');
await p.click('[data-test=rivalutazione-salva]');
await p.waitForSelector('text=Controllo costante registrato sul fascicolo', { timeout: 10000 });
await p.waitForTimeout(800);
await scatto('5-rivalutazione-fatta');
verifica('controllo registrato, nessuna proposta aperta', (await p.locator('[data-test=rivalutazione-voce]').count()) === 0);
const comp = await api('GET', `/clienti/${idC}/compagine`);
verifica('la proposta RIVALUTAZIONE risulta APPLICATA', comp?.proposte?.some((x) => x.ambito === 'RIVALUTAZIONE' && x.stato === 'APPLICATA'));

// ── 3. Registro TE nel fascicolo ──────────────────────────────
await p.goto(`${BASE}/#fascicolo?id=${fasc.id}`);
await p.waitForSelector('[data-test=registro-te]', { timeout: 20000 });
await p.click('[data-test=nuova-consultazione]');
await p.waitForSelector('[data-test=consultazione-salva]');
await p.click('[data-test=esito-DIFFORME]');
await p.click('[data-test=consultazione-salva]');
await p.waitForTimeout(600);
verifica('difforme senza descrizione: errore mostrato', /Descrivi la difformità/.test(await p.textContent('div.fixed.inset-0').catch(() => '')) || /Descrivi la difformità/.test(await p.textContent('[data-test=registro-te]')));
await p.fill('[data-test=consultazione-note]', 'Nel registro risulta ancora il socio al 70%.');
await scatto('6-consultazione-modal');
await p.click('[data-test=consultazione-salva]');
await p.waitForSelector('[data-test=segnala-difformita]', { timeout: 10000 });
await p.waitForTimeout(400);
await scatto('7-da-segnalare');
verifica('consultazione registrata: riquadro «incongruenza da segnalare» e storico con «difforme»', /da segnalare/.test(await p.textContent('[data-test=registro-te]')) && /difforme/.test(await p.textContent('[data-test=storico-consultazioni]')));
await p.click('[data-test=segnala-difformita]');
await p.waitForSelector('[data-test=segnalazione-salva]');
await p.fill('[data-test=segnalazione-riferimento]', `CCIAA-PD/${suffisso}`);
await p.click('[data-test=segnalazione-salva]');
await p.waitForSelector('text=Segnalazione registrata', { timeout: 10000 });
await p.waitForTimeout(400);
await scatto('8-segnalata');
const storico = await p.textContent('[data-test=storico-consultazioni]');
verifica('segnalazione nello storico con il riferimento; nessuna incongruenza pendente', new RegExp(`CCIAA-PD/${suffisso}`).test(storico) && (await p.locator('[data-test=segnala-difformita]').count()) === 0);

// ── 4. Controlli automatici: accreditamento con delegati ──────
await p.goto(`${BASE}/#controlli`);
await p.waitForSelector('text=Registro dei titolari effettivi', { timeout: 20000 });
await p.click('button:has-text("accreditamento…"), button:has-text("rinnovo…")');
await p.waitForSelector('[data-test=form-accreditamento]');
await p.fill('[data-test=form-accreditamento] input[placeholder^="es. PRA"]', `PRA/2026/${suffisso}`);
const caselle = p.locator('[data-test=form-accreditamento] input[type=checkbox]');
if ((await caselle.count()) > 0 && !(await caselle.first().isChecked())) await caselle.first().click();
await scatto('9-accreditamento');
await p.click('[data-test=accreditamento-salva]');
await p.waitForTimeout(1200);
const testoAccr = await p.textContent('body');
verifica('accreditamento salvato con riferimento e almeno un delegato', new RegExp(`PRA/2026/${suffisso}`).test(testoAccr) && !/Delegati all’accesso: nessuno/.test(testoAccr));
await scatto('10-accreditamento-salvato');

// ── 5. Da completare e Novità ─────────────────────────────────
await p.goto(`${BASE}/#completezza`);
await p.waitForSelector('[data-test=completezza-riepilogo]', { timeout: 20000 });
await p.click('button:has-text("Da dove vengono queste regole?")');
await p.waitForSelector('[data-test=regole]');
const regole = await p.textContent('[data-test=regole]');
verifica('tabella delle regole con «Visura camerale da rinnovare» e le tre sul registro TE', /da rinnovare/.test(regole) && /122/.test(regole) && (await p.locator('[data-test=regole] tbody tr').count()) === 17);
await scatto('11-regole');
await p.goto(`${BASE}/#novita`);
await p.waitForTimeout(1200);
verifica('Novità: voce del rilascio M20', /Controllo costante alimentato dai dati/.test(await p.textContent('body')));
await scatto('12-novita');

await b.close();
console.log(`\n${ok} ok / ${fail} FAIL`);
console.log('Scatti:', scatti.join(' '));
process.exit(fail ? 1 : 0);
