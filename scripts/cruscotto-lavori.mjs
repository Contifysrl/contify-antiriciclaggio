#!/usr/bin/env node
/**
 * Genera il cruscotto HTML dei lavori Contify AR (M17→M20) a partire dal
 * piano in Markdown. Nessuna dipendenza.
 *
 *   node cruscotto-lavori.mjs PIANO-LAVORI-AR-M17-M20.md cruscotto-lavori-AR.html
 *
 * Legge le tabelle con colonne «Cod. | Attività | [Chi |] Stato | Verifica»
 * sotto ogni intestazione `## `, conta gli stati e produce una pagina
 * auto-contenuta (niente script esterni, niente storage del browser).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [, , sorgente = 'PIANO-LAVORI-AR-M17-M20.md', destinazione = 'cruscotto-lavori-AR.html'] = process.argv;
const md = readFileSync(sorgente, 'utf8');

const STATI = {
  '[ ]': { codice: 'da_fare', etichetta: 'Da fare', colore: '#94a3b8' },
  '[~]': { codice: 'in_corso', etichetta: 'In corso', colore: '#f59e0b' },
  '[x]': { codice: 'fatto', etichetta: 'Fatto', colore: '#048587' },
  '[!]': { codice: 'bloccato', etichetta: 'Bloccato', colore: '#dc2626' },
  '[-]': { codice: 'rinviato', etichetta: 'Rinviato', colore: '#cbd5e1' },
};

const sezioni = [];
let corrente = null;
let intestazione = null;
let diario = [];
let inDiario = false;

for (const riga of md.split('\n')) {
  const h2 = riga.match(/^## (.+)$/);
  if (h2) {
    inDiario = /^Diario/.test(h2[1]);
    corrente = inDiario || /^Legenda|^Decisioni/.test(h2[1]) ? null : { titolo: h2[1].trim(), attivita: [] };
    if (corrente) sezioni.push(corrente);
    intestazione = null;
    continue;
  }
  if (!riga.startsWith('|')) { intestazione = null; continue; }
  const celle = riga.split('|').slice(1, -1).map((c) => c.trim());
  if (/^-+$/.test(celle[0]?.replace(/\s/g, '') ?? '')) continue; // separatore
  if (!intestazione) { intestazione = celle; continue; }
  if (inDiario) { diario.push(celle); continue; }
  if (!corrente) continue;
  const idx = (nome) => intestazione.findIndex((c) => c.toLowerCase().startsWith(nome));
  const stato = celle[idx('stato')] ?? '';
  const def = STATI[stato] ?? STATI['[ ]'];
  corrente.attivita.push({
    codice: celle[idx('cod')] ?? '',
    testo: celle[idx('attivit')] ?? '',
    chi: idx('chi') >= 0 ? celle[idx('chi')] : '',
    stato: def,
    verifica: celle[idx('verifica')] ?? '',
  });
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  .replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

const conta = (att) => {
  const c = { da_fare: 0, in_corso: 0, fatto: 0, bloccato: 0, rinviato: 0 };
  for (const a of att) c[a.stato.codice]++;
  return c;
};
const tutte = sezioni.flatMap((s) => s.attivita);
const totale = conta(tutte);
const pct = (c) => { const base = c.da_fare + c.in_corso + c.fatto + c.bloccato; return base ? Math.round((c.fatto / base) * 100) : 0; };

const barra = (c) => {
  const base = c.da_fare + c.in_corso + c.fatto + c.bloccato || 1;
  const seg = (n, col) => (n ? `<span style="width:${(n / base) * 100}%;background:${col}"></span>` : '');
  return `<div class="barra">${seg(c.fatto, '#048587')}${seg(c.in_corso, '#f59e0b')}${seg(c.bloccato, '#dc2626')}${seg(c.da_fare, '#e2e8f0')}</div>`;
};

const oggi = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });

const html = `<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Contify AR — Cruscotto lavori M17→M20</title>
<style>
:root{--brand:#048587;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--bg:#f8fafc}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 -apple-system,Segoe UI,Inter,sans-serif;color:var(--ink);background:var(--bg)}
header{background:#fff;border-bottom:1px solid var(--line);padding:20px 28px;display:flex;align-items:center;gap:18px;flex-wrap:wrap}
header h1{font-size:20px;margin:0}header .sub{color:var(--muted);font-size:13px}
.logo{width:36px;height:36px;border-radius:9px;background:var(--brand);color:#fff;display:grid;place-items:center;font-weight:700}
main{max-width:1100px;margin:0 auto;padding:24px 20px 60px}
.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px}
.kpi .card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.kpi .n{font-size:28px;font-weight:700;line-height:1}.kpi .l{color:var(--muted);font-size:12px;margin-top:4px}
.barra{display:flex;height:10px;border-radius:6px;overflow:hidden;background:#e2e8f0;margin:8px 0 4px}.barra span{display:block;height:100%}
section{background:#fff;border:1px solid var(--line);border-radius:12px;margin-bottom:16px;overflow:hidden}
section h2{font-size:16px;margin:0;padding:14px 18px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:12px;cursor:pointer}
section h2 small{color:var(--muted);font-weight:500;font-size:13px}
table{width:100%;border-collapse:collapse}td,th{padding:9px 14px;border-top:1px solid var(--line);vertical-align:top;text-align:left;font-size:14px}
th{background:#f8fafc;color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.03em;border-top:0}
td.cod{white-space:nowrap;font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:var(--muted)}
.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;color:#fff;white-space:nowrap}
code{background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12.5px}
.filtri{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}.filtri button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:5px 12px;font-size:13px;cursor:pointer}
.filtri button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.nascosta{display:none}.chiusa table{display:none}
footer{color:var(--muted);font-size:12px;text-align:center;margin-top:30px}
@media print{.filtri{display:none}section h2{cursor:default}}
</style></head><body>
<header><div class="logo">AR</div><div><h1>Contify AR — Piano dei lavori M17 → M20</h1><div class="sub">«Partire al contrario»: dalla visura al fascicolo proposto · generato il ${oggi} da <code>${esc(sorgente)}</code></div></div></header>
<main>
<div class="kpi">
  <div class="card"><div class="n">${pct(totale)}%</div><div class="l">Avanzamento complessivo</div>${barra(totale)}</div>
  <div class="card"><div class="n" style="color:#048587">${totale.fatto}</div><div class="l">Fatte e verificate</div></div>
  <div class="card"><div class="n" style="color:#f59e0b">${totale.in_corso}</div><div class="l">In corso</div></div>
  <div class="card"><div class="n" style="color:#dc2626">${totale.bloccato}</div><div class="l">Bloccate</div></div>
  <div class="card"><div class="n">${totale.da_fare}</div><div class="l">Da fare</div></div>
</div>
<div class="filtri"><span style="color:var(--muted);font-size:13px;align-self:center">Mostra:</span>
${['tutte', ...Object.values(STATI).map((s) => s.codice)].map((c, i) => `<button data-f="${c}" class="${i === 0 ? 'on' : ''}">${c === 'tutte' ? 'Tutte' : Object.values(STATI).find((s) => s.codice === c).etichetta}</button>`).join('')}
</div>
${sezioni.map((s) => {
  const c = conta(s.attivita);
  return `<section><h2 onclick="this.parentElement.classList.toggle('chiusa')"><span>${esc(s.titolo)}</span><small>${c.fatto}/${s.attivita.length} · ${pct(c)}%</small></h2>
${barra(c)}
<table><thead><tr><th>Cod.</th><th>Attività</th>${s.attivita.some((a) => a.chi) ? '<th>Chi</th>' : ''}<th>Stato</th><th>Verifica</th></tr></thead><tbody>
${s.attivita.map((a) => `<tr data-s="${a.stato.codice}"><td class="cod">${esc(a.codice)}</td><td>${esc(a.testo)}</td>${s.attivita.some((x) => x.chi) ? `<td>${esc(a.chi)}</td>` : ''}<td><span class="pill" style="background:${a.stato.colore}">${a.stato.etichetta}</span></td><td style="color:var(--muted)">${esc(a.verifica)}</td></tr>`).join('\n')}
</tbody></table></section>`;
}).join('\n')}
${diario.length ? `<section><h2><span>Diario delle sessioni</span><small>${diario.length} voci</small></h2><table><thead><tr><th>Data</th><th>Sessione</th><th>Cosa è stato fatto</th><th>Cosa resta / decisioni</th></tr></thead><tbody>
${diario.map((d) => `<tr>${d.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`).join('\n')}</tbody></table></section>` : ''}
<footer>Il piano si aggiorna nel file Markdown; questa pagina è una vista generata (non modificare a mano).</footer>
</main>
<script>
document.querySelectorAll('.filtri button').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.filtri button').forEach(x=>x.classList.remove('on'));b.classList.add('on');
  const f=b.dataset.f;document.querySelectorAll('tr[data-s]').forEach(r=>r.classList.toggle('nascosta',f!=='tutte'&&r.dataset.s!==f));
}));
</script>
</body></html>`;

writeFileSync(destinazione, html);
console.log(`Cruscotto scritto in ${destinazione}: ${tutte.length} attività, ${pct(totale)}% completato.`);
