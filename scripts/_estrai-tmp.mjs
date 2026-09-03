import fs from 'node:fs';
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const data = new Uint8Array(fs.readFileSync(process.argv[2]));
const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
let tot = 0; const out = [];
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  const items = tc.items.filter(i => 'str' in i).map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height }));
  tot += items.length;
  // raggruppa per y (tolleranza 2pt)
  items.sort((a,b)=> b.y - a.y || a.x - b.x);
  const righe = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const r = righe.find(r => Math.abs(r.y - it.y) <= 2.5);
    if (r) r.items.push(it); else righe.push({ y: it.y, items: [it] });
  }
  righe.sort((a,b)=> b.y-a.y);
  for (const r of righe) {
    r.items.sort((a,b)=>a.x-b.x);
    let s = ''; let fine = null;
    for (const it of r.items) {
      if (fine !== null) { const gap = it.x - fine; s += gap > 6 ? '   ' : (gap > 1 ? ' ' : ''); }
      s += it.str; fine = it.x + it.w;
    }
    out.push(s.trimEnd());
  }
  out.push('\f');
}
console.error('items', tot);
console.log(out.join('\n'));
