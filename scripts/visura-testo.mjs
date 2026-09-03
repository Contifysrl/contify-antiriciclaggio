/**
 * Estrae da un PDF di visura lo stesso testo a righe/celle che il browser
 * passa a `leggiVisura()` (AR-M17). Serve a costruire le fixture dei test:
 *
 *   node scripts/visura-testo.mjs campioni/visura.pdf > tests/fixtures/visure/nome.txt
 *
 * Poi si ANONIMIZZA a mano (nomi, CF, indirizzi, PEC) lasciando intatto il
 * layout. Usa la stessa `ricomponiRighe` del frontend (Node ≥ 22.18 legge il
 * TypeScript erasable senza trascrizione).
 */
import fs from 'node:fs';
import { ricomponiRighe } from '../web/src/lib/visura-testo.ts';

const file = process.argv[2];
if (!file) {
  console.error('uso: node scripts/visura-testo.mjs <visura.pdf>');
  process.exit(1);
}
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true, isEvalSupported: false }).promise;
const pagine = [];
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p);
  const tc = await page.getTextContent();
  const items = tc.items.filter((i) => 'str' in i).map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], larghezza: i.width }));
  pagine.push(ricomponiRighe(items).join('\n'));
}
process.stdout.write(pagine.join('\n\f\n') + '\n');
