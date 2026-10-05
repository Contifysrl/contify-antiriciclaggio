/**
 * Generatore minimo di file Excel (.xlsx) scritto in casa su fflate, come
 * `docx.ts` fa per i documenti Word: nessuna libreria nuova. Serve agli export
 * di Contify Timesheet (TS-M1: registrazioni filtrate); si rivaluta in TS-M4
 * quando gli export diventano molti.
 *
 * Celle: testo (inline string), numero, oppure vuoto. Le date si passano come
 * testo AAAA-MM-GG. Una riga di intestazione in grassetto per foglio.
 */

import { strToU8, zipSync } from 'fflate';

export type CellaXlsx = string | number | null | undefined;

export interface FoglioXlsx {
  nome: string;
  colonne: string[];
  righe: CellaXlsx[][];
  /** Larghezza delle colonne in caratteri (facoltativa). */
  larghezze?: number[];
}

function xml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function rif(col: number, riga: number): string {
  let s = '';
  let c = col;
  while (c >= 0) { s = String.fromCharCode(65 + (c % 26)) + s; c = Math.floor(c / 26) - 1; }
  return `${s}${riga}`;
}

function cella(v: CellaXlsx, col: number, riga: number, stile?: number): string {
  const r = rif(col, riga);
  const s = stile ? ` s="${stile}"` : '';
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${r}"${s}><v>${v}</v></c>`;
  return `<c r="${r}" t="inlineStr"${s}><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`;
}

function foglioXml(f: FoglioXlsx): string {
  const righe: string[] = [];
  righe.push(`<row r="1">${f.colonne.map((c, i) => cella(c, i, 1, 1)).join('')}</row>`);
  f.righe.forEach((r, i) => {
    righe.push(`<row r="${i + 2}">${r.map((v, j) => cella(v, j, i + 2)).join('')}</row>`);
  });
  const cols = f.larghezze?.length
    ? `<cols>${f.larghezze.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${righe.join('')}</sheetData></worksheet>`;
}

const STILI = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`;

export function creaXlsx(fogli: FoglioXlsx[]): Uint8Array {
  if (!fogli.length) throw new Error('Nessun foglio');
  const file: Record<string, Uint8Array> = {};
  file['[Content_Types].xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${fogli.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  file['_rels/.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  file['xl/workbook.xml'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${fogli.map((f, i) => `<sheet name="${xml(f.nome.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  file['xl/_rels/workbook.xml.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${fogli.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${fogli.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  file['xl/styles.xml'] = strToU8(STILI);
  fogli.forEach((f, i) => { file[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(foglioXml(f)); });
  return zipSync(file, { level: 6 });
}
