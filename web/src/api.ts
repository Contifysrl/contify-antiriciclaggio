/** Client HTTP. Il cookie di sessione viaggia da solo: nessun token in JS. */

async function chiamata<T>(metodo: string, percorso: string, corpo?: unknown): Promise<T> {
  const r = await fetch(`/api${percorso}`, {
    method: metodo,
    credentials: 'same-origin',
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const testo = await r.text();
  const dati = testo ? JSON.parse(testo) : null;
  if (!r.ok) throw new Error(dati?.errore ?? `Errore ${r.status}`);
  return dati as T;
}

export const api = {
  get: <T,>(p: string) => chiamata<T>('GET', p),
  post: <T,>(p: string, corpo?: unknown) => chiamata<T>('POST', p, corpo),
  patch: <T,>(p: string, corpo?: unknown) => chiamata<T>('PATCH', p, corpo),
  elimina: <T,>(p: string) => chiamata<T>('DELETE', p),
  /** Scarica un file generato dal server (verbali .docx) rispettando gli errori JSON. */
  scarica: async (p: string) => {
    const r = await fetch(`/api${p}`, { credentials: 'same-origin' });
    if (!r.ok) {
      const testo = await r.text();
      let dati: any = null;
      try { dati = testo ? JSON.parse(testo) : null; } catch { /* corpo non JSON */ }
      throw new Error(dati?.errore ?? `Errore ${r.status}`);
    }
    const blob = await r.blob();
    const nome = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') ?? '')?.[1] ?? 'documento.docx';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
  },
};

// ---------------------------------------------------------------------- tipi

export type ClasseRischio =
  | 'NON_SIGNIFICATIVO'
  | 'POCO_SIGNIFICATIVO'
  | 'ABBASTANZA_SIGNIFICATIVO'
  | 'MOLTO_SIGNIFICATIVO';

export interface Fattore {
  codice: string;
  etichetta: string;
  aiuto?: string;
  norma?: string;
  /** Criteri di valutazione dalla modulistica CNDCEC (Informativa n. 57/2026). */
  criteri?: string[];
  /** Ancoraggi dei punteggi 1..4 dalla modulistica CNDCEC (indice 0 = punteggio 1). */
  descrittoriPunteggio?: [string, string, string, string];
}

export interface Ruleset {
  id: string;
  etichetta: string;
  fonte: string;
  scala: Array<{ valore: number; etichetta: string }>;
  classi: Array<{ codice: ClasseRischio; etichetta: string; min: number; max: number }>;
  autovalutazione: { fattoriInerente: Fattore[]; fattoriVulnerabilita: Fattore[]; pesi: { inerente: number; vulnerabilita: number } };
  adeguataVerifica: { tabellaA: Fattore[]; tabellaB: Fattore[]; pesi: { inerente: number; specifico: number } };
  periodicitaControlloMesi: Record<ClasseRischio, number>;
}

export interface Prestazione {
  codice: string;
  descrizione: string;
  gradoInerente: number;
  esoneroTabellaB?: boolean;
  esenteAdeguataVerifica?: boolean;
  note?: string;
}

export interface Vincolo { codice: string; norma: string; descrizione: string; effetto: string }

export interface EsitoProfilo {
  esenteAdeguataVerifica: boolean;
  rischioInerente: number;
  rischioSpecifico: number;
  rischioEffettivo: number;
  classe: ClasseRischio;
  etichettaClasse: string;
  livelloCalcolato: string;
  livelloApplicabile: string;
  livelloInnalzatoDaNorma: boolean;
  vincoli: Vincolo[];
  astensioneDovuta: boolean;
  valutareSos: boolean;
  tabellaBCompilata: boolean;
  formula: string;
  controlloCostanteMesi: number;
}

export interface EsitoAutovalutazione {
  rischioInerente: number;
  vulnerabilita: number;
  rischioResiduo: number;
  classe: ClasseRischio;
  etichettaClasse: string;
  formula: string;
}

export const CLASSE_STILE: Record<ClasseRischio, string> = {
  NON_SIGNIFICATIVO: 'r1',
  POCO_SIGNIFICATIVO: 'r2',
  ABBASTANZA_SIGNIFICATIVO: 'r3',
  MOLTO_SIGNIFICATIVO: 'r4',
};

export function dataOggi(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formattaData(iso?: string | null): string {
  if (!iso) return '—';
  const [a, m, g] = iso.slice(0, 10).split('-');
  return `${g}.${m}.${a}`;
}
