/**
 * GENERATORE .DOCX MINIMALE PER I VERBALI
 *
 * Un .docx è un archivio ZIP di XML OOXML. Qui si genera a mano il minimo
 * indispensabile (document, styles, header con logo, footer con numerazione)
 * senza dipendere da librerie docx complete: nel Worker contano bundle piccolo
 * e nessuna dipendenza da API Node.
 *
 * Brand Contify: Pantone 7474 C #048587 (titoli, righe), Dark Cyan #04383B,
 * testo #1A2A2A, grigio #5A6A6A. Font Arial (fallback ufficiale del brand per
 * i documenti Office destinati a terzi). Logo in header, rapporto 3.6:1.
 */

import { zipSync, strToU8 } from 'fflate';
import { LOGO_CONTIFY_PNG_BASE64 } from './logo-contify';

// ---------------------------------------------------------------- colori
export const COLORI = {
  primario: '048587',
  scuro: '04383B',
  testo: '1A2A2A',
  grigio: '5A6A6A',
  rigaTenue: 'CCD9D9',
  fondoChiaro: 'E9F4F4',
  bianco: 'FFFFFF',
} as const;

// ---------------------------------------------------------------- escape
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------- run/paragrafi
export interface OpzioniTesto {
  bold?: boolean;
  italic?: boolean;
  colore?: string;
  /** Dimensione in punti (default: quella dello stile del paragrafo). */
  punti?: number;
  mono?: boolean;
}

export function run(testo: string, o: OpzioniTesto = {}): string {
  const props: string[] = [];
  if (o.mono) props.push('<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/>');
  if (o.bold) props.push('<w:b/>');
  if (o.italic) props.push('<w:i/>');
  if (o.colore) props.push(`<w:color w:val="${o.colore}"/>`);
  if (o.punti) props.push(`<w:sz w:val="${o.punti * 2}"/><w:szCs w:val="${o.punti * 2}"/>`);
  const rPr = props.length ? `<w:rPr>${props.join('')}</w:rPr>` : '';
  return `<w:r>${rPr}<w:t xml:space="preserve">${esc(testo)}</w:t></w:r>`;
}

export interface OpzioniParagrafo {
  stile?: 'Titolo1' | 'Titolo2' | 'Titolo3' | 'Occhiello' | 'Normale';
  allinea?: 'left' | 'center' | 'right' | 'both';
  spazioPrima?: number; // punti
  spazioDopo?: number; // punti
  mantieniConSuccessivo?: boolean;
}

export function par(contenuto: string | string[], o: OpzioniParagrafo = {}): string {
  const runs = Array.isArray(contenuto) ? contenuto.join('') : contenuto;
  const props: string[] = [];
  if (o.stile && o.stile !== 'Normale') props.push(`<w:pStyle w:val="${o.stile}"/>`);
  if (o.mantieniConSuccessivo) props.push('<w:keepNext/>');
  if (o.spazioPrima !== undefined || o.spazioDopo !== undefined) {
    props.push(
      `<w:spacing w:before="${(o.spazioPrima ?? 0) * 20}" w:after="${(o.spazioDopo ?? 6) * 20}"/>`,
    );
  }
  if (o.allinea) props.push(`<w:jc w:val="${o.allinea}"/>`);
  const pPr = props.length ? `<w:pPr>${props.join('')}</w:pPr>` : '';
  return `<w:p>${pPr}${runs}</w:p>`;
}

export function testo(t: string, op: OpzioniParagrafo = {}, ot: OpzioniTesto = {}): string {
  return par(run(t, ot), op);
}

export function titolo1(t: string): string {
  return par(run(t), { stile: 'Titolo1' });
}
export function titolo2(t: string): string {
  return par(run(t), { stile: 'Titolo2', mantieniConSuccessivo: true });
}
export function titolo3(t: string): string {
  return par(run(t), { stile: 'Titolo3', mantieniConSuccessivo: true });
}
export function occhiello(t: string): string {
  return par(run(t), { stile: 'Occhiello' });
}

export function elenco(voci: string[]): string {
  return voci
    .map(
      (v) =>
        `<w:p><w:pPr><w:pStyle w:val="Puntato"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run(v)}</w:p>`,
    )
    .join('');
}

// ---------------------------------------------------------------- tabelle
export interface Cella {
  contenuto: string; // già in forma di paragrafi OOXML
  larghezza?: number; // ventesimi di punto (dxa)
  fondo?: string;
  unisciColonne?: number;
}

function cella(c: Cella): string {
  const props: string[] = [];
  if (c.larghezza) props.push(`<w:tcW w:w="${c.larghezza}" w:type="dxa"/>`);
  if (c.unisciColonne) props.push(`<w:gridSpan w:val="${c.unisciColonne}"/>`);
  if (c.fondo) props.push(`<w:shd w:val="clear" w:color="auto" w:fill="${c.fondo}"/>`);
  props.push('<w:vAlign w:val="center"/>');
  return `<w:tc><w:tcPr>${props.join('')}</w:tcPr>${c.contenuto}</w:tc>`;
}

export function tabella(righe: Cella[][], opzioni: { larghezze?: number[] } = {}): string {
  const griglia = (opzioni.larghezze ?? [])
    .map((w) => `<w:gridCol w:w="${w}"/>`)
    .join('');
  const corpo = righe.map((r) => `<w:tr>${r.map(cella).join('')}</w:tr>`).join('');
  return (
    '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>' +
    `<w:tblBorders>` +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="${COLORI.rigaTenue}"/>`)
      .join('') +
    '</w:tblBorders>' +
    '<w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar>' +
    `</w:tblPr><w:tblGrid>${griglia}</w:tblGrid>${corpo}</w:tbl>` +
    // Word vuole un paragrafo dopo ogni tabella.
    '<w:p><w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr></w:p>'
  );
}

/** Riga di intestazione tabella: fondo primario, testo bianco in grassetto. */
export function rigaIntestazione(celle: string[], larghezze?: number[]): Cella[] {
  return celle.map((t, i) => ({
    contenuto: par(run(t, { bold: true, colore: COLORI.bianco }), { spazioDopo: 0 }),
    fondo: COLORI.primario,
    larghezza: larghezze?.[i],
  }));
}

/** Tabella etichetta/valore per i blocchi anagrafici. */
export function tabellaDati(coppie: Array<[string, string]>): string {
  return tabella(
    coppie.map(([k, v]) => [
      {
        contenuto: par(run(k, { bold: true, colore: COLORI.scuro }), { spazioDopo: 0 }),
        fondo: COLORI.fondoChiaro,
        larghezza: 3200,
      },
      { contenuto: par(run(v || '—'), { spazioDopo: 0 }), larghezza: 6440 },
    ]),
    { larghezze: [3200, 6440] },
  );
}

/** Blocco firma: luogo/data a sinistra, firma a destra. */
export function bloccoFirma(ruolo: string, nome: string): string {
  return (
    testo(' ', { spazioDopo: 10 }) +
    tabella(
      [
        [
          { contenuto: par(run('Luogo e data', { colore: COLORI.grigio })), larghezza: 4820 },
          { contenuto: par(run(ruolo, { colore: COLORI.grigio })), larghezza: 4820 },
        ],
        [
          { contenuto: testo(' ', { spazioDopo: 16 }), larghezza: 4820 },
          {
            contenuto: testo(' ', { spazioDopo: 16 }) + par(run(nome, { bold: true })),
            larghezza: 4820,
          },
        ],
      ],
      { larghezze: [4820, 4820] },
    )
  );
}

// ---------------------------------------------------------------- documento
const STILI = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr>
    <w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>
    <w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="${COLORI.testo}"/>
  </w:rPr></w:rPrDefault>
  <w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normale"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Titolo1"><w:name w:val="heading 1"/><w:basedOn w:val="Normale"/>
    <w:pPr><w:spacing w:before="120" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="40"/><w:szCs w:val="40"/><w:color w:val="${COLORI.scuro}"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Titolo2"><w:name w:val="heading 2"/><w:basedOn w:val="Normale"/>
    <w:pPr><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/><w:color w:val="${COLORI.primario}"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Titolo3"><w:name w:val="heading 3"/><w:basedOn w:val="Normale"/>
    <w:pPr><w:spacing w:before="160" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="${COLORI.scuro}"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Occhiello"><w:name w:val="Occhiello"/><w:basedOn w:val="Normale"/>
    <w:rPr><w:color w:val="${COLORI.grigio}"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Puntato"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normale"/>
    <w:pPr><w:spacing w:after="40"/></w:pPr></w:style>
</w:styles>`;

const NUMERAZIONE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/>
    <w:pPr><w:ind w:left="360" w:hanging="200"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="${COLORI.primario}"/></w:rPr></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

function base64ToU8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Costruisce il .docx completo. `corpo` è OOXML già composto con gli helper.
 * L'header porta il logo Contify (regola non negoziabile del brand) e la
 * dicitura di riservatezza; il footer la provenienza e la numerazione.
 */
export function costruisciDocx(corpo: string, opzioni: { etichettaHeader?: string } = {}): Uint8Array {
  const etichetta = opzioni.etichettaHeader ?? 'Documento riservato — DLgs. 231/2007';

  // Logo: 720x199 px → in EMU a ~40 px/cm di resa: larghezza 4,32 cm.
  const cx = 1555200; // 4.32 cm in EMU
  const cy = 429840; // 1.194 cm (rapporto 3.6:1 rispettato)
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:p>
    <w:pPr>
      <w:tabs><w:tab w:val="right" w:pos="9640"/></w:tabs>
      <w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="${COLORI.primario}"/></w:pBdr>
      <w:spacing w:after="240"/>
    </w:pPr>
    <w:r><w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0">
        <wp:extent cx="${cx}" cy="${cy}"/>
        <wp:docPr id="1" name="Logo Contify"/>
        <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic>
            <pic:nvPicPr><pic:cNvPr id="1" name="logo-contify.png"/><pic:cNvPicPr/></pic:nvPicPr>
            <pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
            <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
              <a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
          </pic:pic>
        </a:graphicData></a:graphic>
      </wp:inline>
    </w:drawing></w:r>
    <w:r><w:tab/></w:r>
    ${run(etichetta, { colore: COLORI.grigio, punti: 8 })}
  </w:p>
</w:hdr>`;

  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr>
      <w:tabs><w:tab w:val="right" w:pos="9640"/></w:tabs>
      <w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="${COLORI.rigaTenue}"/></w:pBdr>
      <w:spacing w:after="0"/>
    </w:pPr>
    ${run('Generato con Contify AR · AntiRiciclaggio — Contify Srl · Corso Milano 106, Padova', { colore: COLORI.grigio, punti: 7.5 })}
    <w:r><w:tab/></w:r>
    ${run('Pag. ', { colore: COLORI.grigio, punti: 7.5 })}
    <w:r><w:rPr><w:color w:val="${COLORI.grigio}"/><w:sz w:val="15"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:rPr><w:color w:val="${COLORI.grigio}"/><w:sz w:val="15"/></w:rPr><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>
    <w:r><w:rPr><w:color w:val="${COLORI.grigio}"/><w:sz w:val="15"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>
    ${run(' di ', { colore: COLORI.grigio, punti: 7.5 })}
    <w:r><w:rPr><w:color w:val="${COLORI.grigio}"/><w:sz w:val="15"/></w:rPr><w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:rPr><w:color w:val="${COLORI.grigio}"/><w:sz w:val="15"/></w:rPr><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r>
    <w:r><w:rPr><w:color w:val="${COLORI.grigio}"/><w:sz w:val="15"/></w:rPr><w:fldChar w:fldCharType="end"/></w:r>
  </w:p>
</w:ftr>`;

  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${corpo}
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rIdHeader"/>
      <w:footerReference w:type="default" r:id="rIdFooter"/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1985" w:right="1134" w:bottom="1418" w:left="1134" w:header="567" w:footer="567"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;

  const relsRadice = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const relsDocumento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`;

  const relsHeader = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo-contify.png"/>
</Relationships>`;

  return zipSync({
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(relsRadice),
    'word/document.xml': strToU8(document),
    'word/styles.xml': strToU8(STILI),
    'word/numbering.xml': strToU8(NUMERAZIONE),
    'word/header1.xml': strToU8(header),
    'word/footer1.xml': strToU8(footer),
    'word/_rels/document.xml.rels': strToU8(relsDocumento),
    'word/_rels/header1.xml.rels': strToU8(relsHeader),
    'word/media/logo-contify.png': base64ToU8(LOGO_CONTIFY_PNG_BASE64),
  });
}

/** Risposta HTTP per un .docx generato. */
export function rispostaDocx(contenuto: Uint8Array, nomeFile: string): Response {
  const corpo = new Uint8Array(contenuto); // copia con ArrayBuffer proprio
  return new Response(corpo, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${nomeFile.replace(/[^\w.\- ]/g, '_')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
