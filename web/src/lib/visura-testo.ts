/**
 * Estrazione del testo da una visura camerale (AR-M17).
 *
 * Le visure InfoCamere sono PDF testuali: `getTextContent()` restituisce i
 * frammenti con le coordinate, e qui li si ricompone in RIGHE con CELLE
 * separate da tabulazione. La struttura del documento è a due colonne
 * (etichetta a sinistra, valore a destra): una cella vuota in testa alla
 * riga significa «continuazione del valore precedente». Il parser
 * (`leggiVisura` in visura.ts) lavora su questo testo, ed è quindi
 * testabile su fixture senza PDF né browser.
 *
 * `ricomponiRighe` è pura e condivisa con lo script `scripts/visura-testo.mjs`,
 * che genera le fixture dagli stessi frammenti: browser e test vedono lo
 * stesso testo, sempre.
 *
 * pdfjs-dist viene importato PIGRAMENTE dal modal (`estraiTestoPdf`): il bundle
 * principale non cresce, il PDF non esce dal browser.
 */

export interface FrammentoTesto {
  str: string;
  /** Coordinate PDF (origine in basso a sinistra). */
  x: number;
  y: number;
  larghezza: number;
}

/** Sotto questa ascissa un frammento apre la colonna delle etichette (layout InfoCamere, A4 = 595 pt). */
const X_COLONNA_VALORI = 140;
/** Distanza orizzontale oltre la quale due frammenti sono celle diverse. */
const GAP_CELLA = 12;
/** Tolleranza verticale per considerare due frammenti sulla stessa riga. */
const TOLLERANZA_RIGA = 2.5;

export function ricomponiRighe(frammenti: FrammentoTesto[]): string[] {
  const utili = frammenti.filter((f) => f.str.trim().length > 0);
  const righe: Array<{ y: number; items: FrammentoTesto[] }> = [];
  for (const f of utili) {
    const r = righe.find((x) => Math.abs(x.y - f.y) <= TOLLERANZA_RIGA);
    if (r) r.items.push(f);
    else righe.push({ y: f.y, items: [f] });
  }
  righe.sort((a, b) => b.y - a.y);
  const out: string[] = [];
  for (const r of righe) {
    r.items.sort((a, b) => a.x - b.x);
    let testo = r.items[0].x >= X_COLONNA_VALORI ? '\t' : '';
    let fine: number | null = null;
    for (const it of r.items) {
      if (fine !== null) {
        const gap = it.x - fine;
        testo += gap > GAP_CELLA ? '\t' : gap > 0.5 ? ' ' : '';
      }
      testo += it.str.trim();
      fine = it.x + it.larghezza;
    }
    out.push(testo.replace(/[  ]+/g, ' ').trimEnd());
  }
  return out;
}

export interface TestoVisura {
  testo: string;
  pagine: number;
  /** Frammenti di testo trovati: sotto una soglia il PDF è un'immagine (scansione). */
  frammenti: number;
}

/** Sotto questa media di frammenti per pagina il PDF non è una visura testuale. */
const MIN_FRAMMENTI_PER_PAGINA = 20;

export class PdfSenzaTesto extends Error {
  constructor() {
    super('Questo PDF è un’immagine: serve la visura originale scaricata dal Registro Imprese, non una scansione o una foto.');
  }
}

/**
 * Nel browser. pdfjs-dist arriva con `import()` al primo uso; il worker è
 * servito da Vite come asset (`?url`), così resta sotto la CSP `self`.
 */
export async function estraiTestoPdf(dati: ArrayBuffer): Promise<TestoVisura> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(dati), isEvalSupported: false }).promise;
  const pagine: string[] = [];
  let frammenti = 0;
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const pagina = await doc.getPage(p);
      const contenuto = await pagina.getTextContent();
      const items: FrammentoTesto[] = [];
      for (const it of contenuto.items) {
        if (!('str' in it)) continue;
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], larghezza: it.width });
      }
      frammenti += items.filter((i) => i.str.trim()).length;
      pagine.push(ricomponiRighe(items).join('\n'));
    }
  } finally {
    await doc.destroy();
  }
  if (doc.numPages === 0 || frammenti / doc.numPages < MIN_FRAMMENTI_PER_PAGINA) throw new PdfSenzaTesto();
  return { testo: pagine.join('\n\f\n'), pagine: doc.numPages, frammenti };
}
