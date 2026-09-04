/**
 * Giro Playwright AR-M21: AI con pseudonimizzazione + console.
 *
 *   AI-04: Impostazioni → Assistente AI: tenant con la v1 (simulata via wrangler sul D1 locale) → riquadro
 *          «L'informativa è cambiata» → conferma → «Informativa v2 accettata il … da …»; disabilita → informativa
 *          intera con spunta e «Abilita»; chat con il nuovo avviso.
 *   (le sezioni AI-02/AI-03/CON si aggiungono qui)
 *
 *   npm run build && npx wrangler dev --port 8787 --local
 *   node scripts/ui-m21.mjs        (CHROMIUM=/percorso/chrome se serve)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

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
}

await b.close();
console.log(`\n${ok} ok / ${fail} FAIL`);
console.log('Scatti:', scatti.join(' '));
process.exit(fail ? 1 : 0);
