/**
 * Contify Timesheet — passo 0 di TS-M1: prova dei motori di interpretazione.
 *
 *   npx vite-node scripts/prova-motori-ts.ts                 → motore L (solo locale)
 *   MOTORE=A CF_TOKEN=… npx vite-node scripts/prova-motori-ts.ts   → L + modello presso Cloudflare
 *   MOTORE=B ANTHROPIC_API_KEY=… npx vite-node scripts/prova-motori-ts.ts → L + Claude su testo mascherato
 *
 * Opzioni: SOLO=S001,S002 (sottoinsieme), DETTAGLIO=1 (stampa ogni frase),
 * TIPI=scritta,dettata (predefinito: scritte e dettate; «audio» richiede i
 * file in AUDIO_DIR e il motore di trascrizione, vedi sotto), RAPPORTO=file.md.
 *
 * Soglie della specifica: esatte + domanda giusta ≥ 90%; ZERO errori
 * silenziosi sul cliente; errori silenziosi ≤ 3%; tempo mediano ≤ 2 s e
 * ≤ 5 s nel 95% dei casi.
 *
 * Nel repo non entrano dati reali: clienti e frasi sono inventati.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { interpretaLocale, type Contesto, type Proposta } from '../worker/src/ts/interpretazione';
import { interpretaConMotoreA, type ChiamaModello } from '../worker/src/ts/motore-a';
import { riepiloga, valutaFrase, type Frase, type InsiemeFrasi, type Valutazione } from '../tests/lib/valuta-frasi';

const qui = path.dirname(fileURLToPath(import.meta.url));
const insieme: InsiemeFrasi = JSON.parse(fs.readFileSync(path.join(qui, '..', 'tests', 'fixtures', 'ts-frasi.json'), 'utf8'));
// FRASI=altro-file.json: un altro insieme di frasi (per esempio quello «cieco»), con clienti e servizi dell'insieme principale.
if (process.env.FRASI) {
  const altro: Partial<InsiemeFrasi> = JSON.parse(fs.readFileSync(process.env.FRASI, 'utf8'));
  insieme.frasi = altro.frasi ?? [];
  if (altro.oggi) insieme.oggi = altro.oggi;
  if (altro.clienti) insieme.clienti = altro.clienti;
  if (altro.servizi) insieme.servizi = altro.servizi;
}
const MOTORE = (process.env.MOTORE ?? 'L').toUpperCase();
const TIPI = (process.env.TIPI ?? 'scritta,dettata').split(',');
const SOLO = process.env.SOLO ? new Set(process.env.SOLO.split(',')) : null;
const DETTAGLIO = process.env.DETTAGLIO === '1';
const ACCOUNT = process.env.CF_ACCOUNT ?? '9ad614c9985d4666755dac81cd734842';
const MODELLO_A = process.env.MODELLO_A ?? '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const ctx: Contesto = { clienti: insieme.clienti, servizi: insieme.servizi, oggi: insieme.oggi };

const frasi = insieme.frasi.filter((f) => TIPI.includes(f.tipo) && (!SOLO || SOLO.has(f.id)));

/** Chiamata al modello presso Cloudflare via REST (dalla sandbox). Costo e tempi si misurano qui. */
function chiamaCloudflare(): ChiamaModello {
  const token = process.env.CF_TOKEN;
  if (!token) throw new Error('MOTORE=A richiede CF_TOKEN (permesso Workers AI: Read).');
  return async (messaggi, schema) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${MODELLO_A}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messaggi, max_tokens: 600, temperature: 0, response_format: { type: 'json_schema', json_schema: schema } }),
      signal: AbortSignal.timeout(20_000),
    });
    const corpo: any = await r.json();
    if (!r.ok || !corpo?.success) throw new Error(`Workers AI ${r.status}: ${JSON.stringify(corpo?.errors ?? corpo).slice(0, 300)}`);
    const res = corpo.result;
    const testo = typeof res?.response === 'string' ? res.response : JSON.stringify(res?.response ?? res);
    return { testo, usoTokens: res?.usage ?? null };
  };
}

async function interpreta(f: Frase): Promise<{ proposte: Proposta[]; ms: number; aiChiamata: boolean }> {
  const t0 = performance.now();
  if (MOTORE === 'L') {
    const proposte = interpretaLocale(f.testo, ctx);
    return { proposte, ms: performance.now() - t0, aiChiamata: false };
  }
  if (MOTORE === 'A') {
    const esito = await interpretaConMotoreA(f.testo, ctx, chiamaCloudflare());
    return { proposte: esito.proposte, ms: performance.now() - t0, aiChiamata: esito.aiChiamata };
  }
  throw new Error(`Motore ${MOTORE} non ancora realizzato in questo script.`);
}

const valutazioni: Valutazione[] = [];
const tempi: number[] = [];
let chiamateAi = 0;
for (const f of frasi) {
  let esito: { proposte: Proposta[]; ms: number; aiChiamata: boolean };
  try {
    esito = await interpreta(f);
  } catch (e) {
    console.error(`${f.id}: errore ${String(e)}`);
    esito = { proposte: interpretaLocale(f.testo, ctx), ms: 0, aiChiamata: false };
  }
  if (esito.aiChiamata) { chiamateAi++; tempi.push(esito.ms); }
  const v = valutaFrase(f, esito.proposte, insieme.oggi);
  valutazioni.push(v);
  if (DETTAGLIO || v.esito !== 'esatta') {
    const riga = `${f.id} [${v.esito}${v.erroriCliente ? ' CLIENTE' : ''}] «${f.testo}»`;
    console.log(riga);
    for (const d of v.dettagli) console.log(`     ${d}`);
    if (DETTAGLIO) console.log('     →', JSON.stringify(esito.proposte.map((p) => ({ c: p.cliente.id ?? p.cliente.candidati.map((x) => x.id), s: p.servizio.id ?? p.servizio.candidati.map((x) => x.id), m: p.minuti, d: p.data, nota: p.nota }))));
  }
}

const r = riepiloga(valutazioni);
const perTipo = (tipo: string) => riepiloga(valutazioni.filter((v) => frasi.find((f) => f.id === v.id)?.tipo === tipo));
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const ordinati = [...tempi].sort((a, b) => a - b);
const mediana = ordinati.length ? ordinati[Math.floor(ordinati.length / 2)] : 0;
const p95 = ordinati.length ? ordinati[Math.min(ordinati.length - 1, Math.floor(ordinati.length * 0.95))] : 0;

const righe = [
  `# Prova dei motori — motore ${MOTORE} (${new Date().toISOString().slice(0, 10)})`,
  '',
  `Frasi: ${r.totale} (${TIPI.join(', ')}). Modello A: ${MOTORE === 'A' ? MODELLO_A : '—'}.`,
  '',
  '| Misura | Valore | Soglia |',
  '|---|---|---|',
  `| Esatte | ${r.esatte} (${pct(r.esatte / r.totale)}) | |`,
  `| Domanda giusta | ${r.domande} (${pct(r.domande / r.totale)}) | |`,
  `| **Esatte + domanda giusta** | **${pct(r.quotaBuone)}** | ≥ 90% |`,
  `| Domande superflue | ${r.superflue} | |`,
  `| Candidato mancante | ${r.candidatiMancanti} | |`,
  `| **Errori silenziosi sul cliente** | **${r.erroriCliente}** | 0 |`,
  `| Errori silenziosi (frasi) | ${r.silenziose} (${pct(r.quotaSilenziose)}) | ≤ 3% |`,
  `| Chiamate al modello | ${chiamateAi} | |`,
  `| Tempo mediano / 95° (solo chiamate AI) | ${(mediana / 1000).toFixed(2)} s / ${(p95 / 1000).toFixed(2)} s | ≤ 2 s / ≤ 5 s |`,
  '',
  ...TIPI.map((t) => { const x = perTipo(t); return `- ${t}: ${x.totale} frasi, esatte+domanda ${pct(x.quotaBuone)}, silenziose ${x.silenziose}, errori cliente ${x.erroriCliente}`; }),
  '',
  '## Frasi non esatte',
  '',
  ...valutazioni.filter((v) => v.esito !== 'esatta').map((v) => `- ${v.id} **${v.esito}**${v.erroriCliente ? ' (CLIENTE)' : ''}: ${v.dettagli.join('; ')}`),
];
console.log('\n' + righe.join('\n'));
if (process.env.RAPPORTO) fs.writeFileSync(process.env.RAPPORTO, righe.join('\n') + '\n');

const supera = r.quotaBuone >= 0.9 && r.erroriCliente === 0 && r.quotaSilenziose <= 0.03;
console.log(`\nMotore ${MOTORE}: ${supera ? 'SUPERA' : 'NON SUPERA'} le soglie.`);
