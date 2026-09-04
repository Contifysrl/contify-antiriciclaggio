/**
 * Giro Playwright AR-M21: AI con pseudonimizzazione + console.
 *
 *   AI-04: Impostazioni → Assistente AI: tenant con la v1 (simulata via wrangler sul D1 locale) → riquadro
 *          «L'informativa è cambiata» → conferma → «Informativa v2 accettata il … da …»; disabilita → informativa
 *          intera con spunta e «Abilita»; chat con il nuovo avviso.
 *   AI-02: scheda del cliente 4×25% → proposta con A3 → sequenza guidata → «Rendi leggibile (AI)» → il testo torna
 *          nella textarea con l'avviso «verificato sui numeri» → registra col residuale → proposta MODIFICATA e
 *          titolare residuale nella scheda.
 *   AI-03: fascicolo di un cliente con oggetto sociale non riconosciuto → «Chiedi all'AI (oggetto sociale)» in A.2 →
 *          esito nel riquadro, A.2 = 4 con badge «AI — da confermare» e provenienza.
 *   (le sezioni CON si aggiungono qui)
 *
 *   npm run build && npx wrangler dev --port 8787 --local
 *   node scripts/ui-m21.mjs        (CHROMIUM=/percorso/chrome se serve)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { leggiVisura } from '../web/src/lib/visura.ts';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const qui = path.dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await b.newContext({ viewport: { width: 1280, height: 1100 } });
const p = await ctx.newPage();
const scatti = [];
const scatto = async (nome) => { const f = `/tmp/m21-${nome}.png`; await p.screenshot({ path: f, fullPage: true }); scatti.push(f); };
let ok = 0, fail = 0;
const verifica = (d, cond) => { if (cond) { ok++; console.log(`  ok   ${d}`); } else { fail++; console.log(`  FAIL ${d}`); } };
p.on('pageerror', (e) => console.log('  PAGE ERROR', e.message));
const fixture = (n) => leggiVisura(fs.readFileSync(path.join(qui, '..', 'tests', 'fixtures', 'visure', n), 'utf8'));
const suffisso = String(Date.now()).slice(-6);
function corpoDaVisura(v, extra = {}) {
  return {
    anagrafica: {
      denominazione: v.denominazione, tipo: v.tipoProposto, codiceFiscale: v.codiceFiscale, partitaIva: v.partitaIva, paeseResidenza: 'IT',
      attivitaPrevalente: v.attivitaPrevalente, ateco: v.ateco, datiIdentificativi: { sede: v.sede.testo, pec: v.pec, rea: v.rea, capitaleSociale: v.capitale.sottoscritto },
    },
    soci: v.soci, cariche: v.cariche, capitale: v.capitale, dataVisura: v.dataEstrazione, dataElencoSoci: v.dataElencoSoci,
    telemetria: { tipoVisura: v.tipoVisura, formaVisura: v.formaVisura, pagine: 7, campiNonTrovati: [], avvisi: 0, soci: v.soci.length, cariche: v.cariche.length, tipoIncerto: false, dataEstrazione: v.dataEstrazione },
    ...extra,
  };
}
const api = (metodo, percorso, corpo) => p.evaluate(async ({ metodo, percorso, corpo }) => {
  const r = await fetch(`/api${percorso}`, { method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
  return r.json().catch(() => null);
}, { metodo, percorso, corpo });

await p.goto(BASE);
await p.fill('input[type=email]', 'titolare@studiodemo.it');
await p.fill('input[type=password]', 'Antiriciclaggio!2026');
await p.click('button:has-text("Accedi")');
await p.waitForTimeout(1500);

// ── AI-04: informativa v2 con ri-accettazione ──
console.log('\n== AI-04 — Impostazioni, informativa versionata ==');
{
  const sql = path.join(qui, '..', '.wrangler', 'ui-m21-v1.sql');
  fs.writeFileSync(sql, `UPDATE tenants SET parametri = json_set(COALESCE(parametri,'{}'), '$.ai', json('{"abilitata":true,"accettataIl":"2026-08-01T10:00:00.000Z","da":"usr_tit"}')) WHERE id = 'ten_demo';\n`);
  execSync(`npx wrangler d1 execute contify-antiriciclaggio --local --file=${sql}`, { cwd: path.join(qui, '..'), stdio: 'pipe' });
  await p.goto(`${BASE}/#impostazioni`);
  await p.waitForTimeout(1200);
  await p.locator('[data-test=assistente-ai]').scrollIntoViewIfNeeded();
  verifica('riquadro «L’informativa è cambiata» con la data dell’accettazione v1', await p.locator('[data-test=informativa-cambiata]').isVisible() && /v1 accettata il 01\/08\/2026/.test(await p.textContent('[data-test=informativa-cambiata]')));
  verifica('informativa v2 in pagina (segnaposto, blocco tecnico, registro)', /\[PF_1\]/.test(await p.textContent('[data-test=informativa-ai]')) && /Blocco tecnico/.test(await p.textContent('[data-test=informativa-ai]')));
  verifica('il pulsante di conferma è spento finché non si spunta', await p.locator('[data-test=conferma-informativa]').isDisabled());
  await scatto('01-informativa-cambiata');
  await p.check('[data-test=accetto-informativa]');
  await p.click('[data-test=conferma-informativa]');
  await p.waitForTimeout(1200);
  verifica('dopo la conferma: «abilitato» con «Informativa v2 accettata il … da …»', /v2 accettata il/.test(await p.textContent('[data-test=accettazione-ai]')) && (await p.locator('[data-test=informativa-cambiata]').count()) === 0);
  await scatto('02-informativa-confermata');
  const st = await api('GET', '/ai/stato');
  verifica('API: versione 2, nulla da riaccettare', st?.versioneAccettata === 2 && st?.daRiaccettare === false);

  await p.click('[data-test=assistente-ai] button:has-text("Disabilita")');
  await p.waitForTimeout(1000);
  verifica('disabilitato: informativa intera, spunta e «Abilita l’assistente»', (await p.locator('[data-test=abilita-ai]').count()) === 1 && await p.locator('[data-test=abilita-ai]').isDisabled());
  await p.check('[data-test=accetto-informativa]');
  await p.click('[data-test=abilita-ai]');
  await p.waitForTimeout(1200);
  verifica('riabilitato con la v2', /v2 accettata il/.test(await p.textContent('[data-test=accettazione-ai]')));
  await scatto('03-riabilitato');

  await p.goto(`${BASE}/#cruscotto`);
  await p.waitForTimeout(1200);
  await p.click('button[aria-label="Apri l\'assistente"]');
  await p.waitForTimeout(500);
  verifica('chat: avviso «Descrivi i fatti, non le persone» con la sostituzione automatica', /Descrivi i fatti, non le persone/.test(await p.textContent('body')) && /segnaposto/.test(await p.textContent('body')));
  await scatto('04-chat-avviso');
  await p.click('button[aria-label="Chiudi"]');
}

// ── AI-02: motivazione co. 6 leggibile dalla scheda del cliente ──
console.log('\n== AI-02 — «Rendi leggibile (AI)» nella proposta di titolarità ==');
{
  const v4 = fixture('srl-quattro-soci-25.txt');
  v4.codiceFiscale = `08888${suffisso}`; v4.partitaIva = v4.codiceFiscale; v4.denominazione = `PLAYWRIGHT QUATTRO ${suffisso} SRL`;
  const creato = await api('POST', '/clienti/da-visura', corpoDaVisura(v4));
  verifica('preparazione: cliente 4×25% con proposta A3', Boolean(creato?.id) && (creato?.proposta?.alert ?? []).some((a) => a.codice === 'A3'));
  await p.goto(`${BASE}/#cliente?id=${creato.id}`);
  await p.waitForTimeout(1500);
  await p.click('button:has-text("Apri la sequenza guidata") >> nth=0');
  await p.waitForTimeout(800);
  const prima = await p.inputValue('[data-test=motivazione-co6]');
  verifica('sequenza guidata con la bozza deterministica e il pulsante «Rendi leggibile (AI)»', prima.length > 100 && (await p.locator('[data-test=rendi-leggibile]').count()) === 1);
  await scatto('05-sequenza-prima');
  await p.click('[data-test=rendi-leggibile]');
  await p.waitForTimeout(1500);
  const dopo = await p.inputValue('[data-test=motivazione-co6]');
  verifica('testo riscritto nella textarea, con i nomi e senza segnaposto', dopo !== prima && /Riscrittura di prova/.test(dopo) && !/\[(PF|PG)_\d+\]/.test(dopo) && /PLAYWRIGHT QUATTRO/i.test(dopo));
  verifica('avviso «verificato sui numeri dei fatti»', /verificato sui numeri/.test(await p.textContent('[data-test=avviso-ai]')));
  await scatto('06-riscritta');
  await p.click('button:has-text("Registra col criterio residuale")');
  await p.waitForTimeout(1500);
  const comp = await api('GET', `/clienti/${creato.id}/compagine`);
  const prop = (comp?.proposte ?? []).find((x) => x.id === creato?.proposta?.id);
  verifica('proposta MODIFICATA con provenienza AI + professionista', prop?.stato === 'MODIFICATA' && prop?.esito?.provenienzaMotivazione === 'AI_PROFESSIONISTA');
  await p.reload();
  await p.waitForTimeout(1500);
  verifica('scheda: titolare effettivo col criterio residuale', /residuale/i.test(await p.textContent('body')));
  await scatto('07-scheda');
}

// ── AI-03: classificazione dell'oggetto sociale dal fascicolo proposto ──
console.log('\n== AI-03 — «Chiedi all’AI (oggetto sociale)» nel fascicolo proposto ==');
{
  const v = fixture('srl-due-soci-pf.txt');
  v.codiceFiscale = `09990${suffisso}`; v.partitaIva = v.codiceFiscale; v.denominazione = `PLAYWRIGHT METALLI ${suffisso} SRL`;
  v.ateco = '46.90.00'; v.attivitaPrevalente = 'Commercio all’ingrosso non specializzato';
  const corpo = corpoDaVisura(v);
  corpo.anagrafica.datiIdentificativi = { ...corpo.anagrafica.datiIdentificativi, oggettoSociale: `La ${v.denominazione} acquista da privati e rivende monili e gioie usate, lingotti e monete.`, visuraDel: v.dataEstrazione };
  const creato = await api('POST', '/clienti/da-visura', corpo);
  const fasc = await api('POST', '/fascicoli', { clienteId: creato?.id, prestazioneCodice: 'CONSULENZA_TRIBUTARIA', dataConferimento: new Date().toISOString().slice(0, 10) });
  verifica('preparazione: cliente con oggetto sociale e fascicolo', Boolean(creato?.id && fasc?.id));
  await p.goto(`${BASE}/#fascicolo?id=${fasc.id}`);
  await p.waitForSelector('[data-test=fascicolo-proposto]', { timeout: 15000 });
  await p.waitForTimeout(800);
  const rigaPrima = await p.textContent('[data-test=proposta-prevalente_attivita]');
  verifica('A.2 = 1 proposto con il pulsante «Chiedi all’AI»', /non rientra nei settori esposti/.test(rigaPrima) && (await p.locator('[data-test=chiedi-ai-settore]').count()) === 1);
  await scatto('08-a2-prima');
  await p.click('[data-test=chiedi-ai-settore]');
  await p.waitForTimeout(1800);
  const esito = await p.textContent('[data-test=esito-ai-settore]');
  verifica('esito: l’AI propone «Compro oro…» (punteggio 4)', /Compro oro/.test(esito) && /punteggio 4/.test(esito));
  const rigaDopo = await p.textContent('[data-test=proposta-prevalente_attivita]');
  verifica('A.2 = 4 con badge «AI — da confermare» e motivazione con la provenienza', /AI — da confermare/.test(rigaDopo) && /riconosciuto dall’AI/.test(rigaDopo) && (await p.locator('[data-test=chiedi-ai-settore]').count()) === 0);
  await scatto('09-a2-dopo');
}

await b.close();
console.log(`\n${ok} ok / ${fail} FAIL`);
console.log('Scatti:', scatti.join(' '));
process.exit(fail ? 1 : 0);
