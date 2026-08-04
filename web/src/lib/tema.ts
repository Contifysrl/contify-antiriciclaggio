// ── Tema dell'interfaccia (AR-M12, portato da Assist) ──────────
//
// Dodici tinte + modalità chiaro/notturna/auto. Le palette sono IDENTICHE
// a quelle di Assist (stesse scale chiare e notturne, stessi neutri):
// tutta l'app usa già le variabili CSS --c-*/--k-*/--rd-*/--am-*/--gr-*
// (tailwind.config.js), quindi qui basta riscrivere le variabili sul
// documentElement. I valori viaggiano come "R G B" per le trasparenze
// Tailwind (bg-teal-600/10).
//
// Persistenza: localStorage (subito, anche pre-login) + profilo utente
// sul server (segue l'utente su ogni dispositivo).

export interface Tema {
  nome: string;
  etichetta: string;
  campione: string; // il pallino nel selettore
  testo?: string;   // colore del testo sui pulsanti (default bianco)
  scala: Record<string, string>;
}

export const TEMI: Tema[] = [
  { nome: 'contify', etichetta: 'Contify', campione: '#048587', scala: { 50: '#eefafa', 100: '#d5f2f2', 200: '#aee4e5', 300: '#7bcfd1', 400: '#4ba5a5', 500: '#0e8a8f', 600: '#048587', 700: '#0a6068', 800: '#0d4f56', 900: '#0f4147' } },
  { nome: 'blu', etichetta: 'Blu', campione: '#276bef', scala: { 50: '#f3f7ff', 100: '#e4edfe', 200: '#cbddfd', 300: '#a9c6fc', 400: '#81acfb', 500: '#4c84f1', 600: '#276bef', 700: '#1b58d1', 800: '#1d4ca9', 900: '#1d4188' } },
  { nome: 'indaco', etichetta: 'Indaco', campione: '#8252f0', scala: { 50: '#f7f5ff', 100: '#edeafe', 200: '#dcd7fd', 300: '#c6bbfc', 400: '#af9bfb', 500: '#9273f2', 600: '#8252f0', 700: '#7534e6', 800: '#5f33b9', 900: '#4e3092' } },
  { nome: 'viola', etichetta: 'Viola', campione: '#b330e1', scala: { 50: '#fbf4ff', 100: '#f6e6fe', 200: '#efcffd', 300: '#e4adfc', 400: '#d389f3', 500: '#c653f2', 600: '#b330e1', 700: '#952dbc', 800: '#7a2e97', 900: '#632b7a' } },
  { nome: 'fucsia', etichetta: 'Fucsia', campione: '#c92ca9', scala: { 50: '#fff3fb', 100: '#fee4f5', 200: '#fdcaed', 300: '#faa6e2', 400: '#ed7fd0', 500: '#ec36c6', 600: '#c92ca9', 700: '#a82a8e', 800: '#892b73', 900: '#6f295f' } },
  { nome: 'rosa', etichetta: 'Rosa', campione: '#d52c71', scala: { 50: '#fff3f6', 100: '#fee6eb', 200: '#fdced9', 300: '#fcabc1', 400: '#fc7da4', 500: '#f43f86', 600: '#d52c71', 700: '#b12a60', 800: '#902b50', 900: '#752943' } },
  { nome: 'rosso', etichetta: 'Rosso', campione: '#af1223', scala: { 50: '#f9f4f4', 100: '#f9e6e4', 200: '#fdcdc9', 300: '#ffada7', 400: '#ff817c', 500: '#cd172b', 600: '#af1223', 700: '#931720', 800: '#7b1c1f', 900: '#661c1d' } },
  { nome: 'arancio', etichetta: 'Arancio', campione: '#ba5621', scala: { 50: '#fff4f0', 100: '#fee7de', 200: '#fdd2be', 300: '#fcb190', 400: '#fb8952', 500: '#da6629', 600: '#ba5621', 700: '#9b4a20', 800: '#7f4021', 900: '#683821' } },
  { nome: 'ambra', etichetta: 'Ambra', campione: '#986a21', scala: { 50: '#fff5e9', 100: '#fee9ce', 200: '#fdd59e', 300: '#f5ba62', 400: '#e39d20', 500: '#b37e28', 600: '#986a21', 700: '#7f5a20', 800: '#694c21', 900: '#574120' } },
  { nome: 'giallo', etichetta: 'Giallo', campione: '#fac300', testo: '#31280f', scala: { 50: '#fbf7ef', 100: '#fbefd3', 200: '#ffe5a8', 300: '#ffdc85', 400: '#ffcf50', 500: '#ffc818', 600: '#fac300', 700: '#785e0c', 800: '#644f14', 900: '#534317' } },
  { nome: 'verde', etichetta: 'Verde', campione: '#248343', scala: { 50: '#edfbef', 100: '#d7f7dc', 200: '#b5edbf', 300: '#87dd9a', 400: '#4ec972', 500: '#2c9b51', 600: '#248343', 700: '#226f3a', 800: '#245d33', 900: '#224d2d' } },
  { nome: 'grigio', etichetta: 'Grigio', campione: '#60758b', scala: { 50: '#f3f7fb', 100: '#e6eef6', 200: '#d0deed', 300: '#b4c8de', 400: '#95afcb', 500: '#738aa4', 600: '#60758b', 700: '#526374', 800: '#455360', 900: '#3b4550' } },
];

/** Testo sui pulsanti in notturna: quasi-nero, per tinte chiare e sature. */
const ON_SCURO = '#101418';

/** Scale accento in NOTTURNA (invertite e ricalibrate, come Assist). */
const SCURE: Record<string, Record<string, string>> = {
  contify: { 50: '#162929', 100: '#1b3f40', 200: '#1c5d5e', 300: '#148081', 400: '#009ea1', 500: '#00b2b4', 600: '#00bfc2', 700: '#47cacc', 800: '#68d3d4', 900: '#82dadc' },
  blu: { 50: '#122549', 100: '#0d2658', 200: '#0f3e98', 300: '#0a56e3', 400: '#2c73ff', 500: '#4a88ff', 600: '#5c95ff', 700: '#76a1f2', 800: '#8bade8', 900: '#9cb6e2' },
  indaco: { 50: '#2a1d4e', 100: '#422781', 200: '#652bcc', 300: '#844df9', 400: '#9978ff', 500: '#a88fff', 600: '#b29eff', 700: '#bbaef5', 800: '#c4bcef', 900: '#cdc9ec' },
  viola: { 50: '#361b42', 100: '#3e174d', 200: '#6b1c87', 300: '#9e17ca', 400: '#c815ff', 500: '#cf4fff', 600: '#d466ff', 700: '#d181f2', 800: '#d094ea', 900: '#d0a4e3' },
  fucsia: { 50: '#3d1933', 100: '#46153b', 200: '#791a65', 300: '#b21595', 400: '#e300be', 500: '#ff05d5', 600: '#ff48d8', 700: '#f472d3', 800: '#ec8ad1', 900: '#e59fd1' },
  rosa: { 50: '#401925', 100: '#4b1528', 200: '#801a43', 300: '#bd1560', 400: '#f10079', 500: '#ff3a8a', 600: '#ff5a95', 700: '#f47aa0', 800: '#eb90aa', 900: '#e5a2b3' },
  rosso: { 50: '#411918', 100: '#4c1615', 200: '#831b20', 300: '#c21628', 400: '#f8002f', 500: '#ff464c', 600: '#ff6261', 700: '#f4807a', 800: '#eb958f', 900: '#e5a49f' },
  arancio: { 50: '#392014', 100: '#492413', 200: '#773614', 300: '#ac490e', 400: '#d95900', 500: '#f46600', 600: '#ff7322', 700: '#f48d5c', 800: '#eca07e', 900: '#e7af97' },
  ambra: { 50: '#43331f', 100: '#5d4521', 200: '#825b1f', 300: '#b17816', 400: '#da9200', 500: '#f3a300', 600: '#ffb12b', 700: '#f8c57e', 800: '#f5d3a8', 900: '#f4e1c7' },
  giallo: { 50: '#2c2514', 100: '#31280f', 200: '#544212', 300: '#7a5f0d', 400: '#9a7700', 500: '#ae8700', 600: '#bc9100', 700: '#c29d38', 800: '#c9a854', 900: '#ceb26c' },
  verde: { 50: '#203b26', 100: '#23512f', 200: '#216f3a', 300: '#189548', 400: '#00b855', 500: '#00ce60', 600: '#00dc67', 700: '#4fe67e', 800: '#73f194', 900: '#aaf3b9' },
  grigio: { 50: '#262d33', 100: '#36404c', 200: '#4a5b6d', 300: '#637b95', 400: '#7a99b8', 500: '#91a9c4', 600: '#a0b6cc', 700: '#b3c2d1', 800: '#c1ccd7', 900: '#cfd5dd' },
};

/** Neutri (ink) e semafori (red/amber/green) — chiaro e notturna. */
const NEUTRI_CHIARO = {
  ink: { 0: '#ffffff', 50: '#f7f8f9', 100: '#eceef0', 200: '#d5d9dd', 300: '#b1b8bf', 400: '#8a939c', 500: '#6b747e', 600: '#555d66', 700: '#454b53', 800: '#3a3f45', 900: '#24272b' },
  red: { 50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d' },
  amber: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f' },
  green: { 50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d' },
};

const NEUTRI_SCURO = {
  ink: { 0: '#1c2024', 50: '#14171a', 100: '#262b31', 200: '#333941', 300: '#454d56', 400: '#848e98', 500: '#98a2ac', 600: '#b0b9c1', 700: '#c6ced5', 800: '#dae0e5', 900: '#eaeef1' },
  red: { 50: '#461c19', 100: '#651f1e', 200: '#952023', 300: '#d01828', 400: '#ff2a37', 500: '#ff6f68', 600: '#ff867f', 700: '#f69e97', 800: '#f0b0aa', 900: '#ecc0bb' },
  amber: { 50: '#352616', 100: '#493317', 200: '#6a4616', 300: '#925e0f', 400: '#b97600', 500: '#da8b00', 600: '#ec9700', 700: '#f2a641', 800: '#efb572', 900: '#ebc397' },
  green: { 50: '#172d1e', 100: '#1a3f25', 200: '#195930', 300: '#117a3f', 400: '#00984d', 500: '#00b55c', 600: '#00c264', 700: '#46cd77', 800: '#66d68a', 900: '#80de9b' },
};

export const MODI = [
  { nome: 'chiaro', etichetta: 'Chiaro', descrizione: 'Fondo bianco, sempre.' },
  { nome: 'scuro', etichetta: 'Notturna', descrizione: 'Fondo scuro, sempre.' },
  { nome: 'auto', etichetta: 'Come il computer', descrizione: 'Segue le impostazioni del tuo computer.' },
] as const;

export type Modo = (typeof MODI)[number]['nome'];

const TEMA_DEFAULT = 'contify';
const MODO_DEFAULT: Modo = 'chiaro';
const CHIAVE_TEMA = 'ar-tema';
const CHIAVE_MODO = 'ar-modo';

export function temaValido(t: unknown): t is string {
  return typeof t === 'string' && TEMI.some((x) => x.nome === t);
}
export function modoValido(m: unknown): m is Modo {
  return m === 'chiaro' || m === 'scuro' || m === 'auto';
}
function trovaTema(nome: string | null | undefined): Tema {
  return TEMI.find((t) => t.nome === nome) ?? TEMI[0];
}

/** "#048587" → "4 133 135" (formato delle variabili Tailwind). */
function rgb(hex: string): string {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
}

function sistemaScuro(): boolean {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
}

function scuroEffettivo(modo: string | null | undefined): boolean {
  const m = modoValido(modo) ? modo : MODO_DEFAULT;
  return m === 'scuro' || (m === 'auto' && sistemaScuro());
}

/** Riscrive tutte le variabili CSS per tema+modo correnti. */
export function applicaAspetto(tema: string | null | undefined, modo: string | null | undefined): void {
  const t = trovaTema(tema);
  const scuro = scuroEffettivo(modo);
  const el = document.documentElement;
  const scala = scuro ? SCURE[t.nome] : t.scala;
  for (const [k, v] of Object.entries(scala)) el.style.setProperty(`--c-${k}`, rgb(v));
  el.style.setProperty('--c-on', rgb(scuro ? ON_SCURO : (t.testo ?? '#ffffff')));
  const n = scuro ? NEUTRI_SCURO : NEUTRI_CHIARO;
  for (const [k, v] of Object.entries(n.ink)) el.style.setProperty(`--k-${k}`, rgb(v));
  for (const [pfx, sc] of [['rd', n.red], ['am', n.amber], ['gr', n.green]] as const) {
    for (const [k, v] of Object.entries(sc)) el.style.setProperty(`--${pfx}-${k}`, rgb(v));
  }
  el.dataset.tema = t.nome;
  el.dataset.modo = scuro ? 'scuro' : 'chiaro';
  el.style.colorScheme = scuro ? 'dark' : 'light';
}

export function aspettoLocale(): { tema: string; modo: Modo } {
  let tema: string = TEMA_DEFAULT;
  let modo: Modo = MODO_DEFAULT;
  try {
    const t = localStorage.getItem(CHIAVE_TEMA);
    if (temaValido(t)) tema = t;
    const m = localStorage.getItem(CHIAVE_MODO);
    if (modoValido(m)) modo = m;
  } catch { /* modalità privata */ }
  return { tema, modo };
}

export function salvaAspettoLocale(tema: string | null, modo: string | null): void {
  try {
    if (temaValido(tema)) localStorage.setItem(CHIAVE_TEMA, tema); else localStorage.removeItem(CHIAVE_TEMA);
    if (modoValido(modo)) localStorage.setItem(CHIAVE_MODO, modo); else localStorage.removeItem(CHIAVE_MODO);
  } catch { /* modalità privata */ }
}

let modoCorrente: Modo = MODO_DEFAULT;
let temaCorrente: string = TEMA_DEFAULT;

/** Da chiamare una volta all'avvio: applica il tema salvato e segue il sistema in «auto». */
export function avviaAspetto(): void {
  const { tema, modo } = aspettoLocale();
  temaCorrente = tema;
  modoCorrente = modo;
  applicaAspetto(tema, modo);
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (modoCorrente === 'auto') applicaAspetto(temaCorrente, 'auto');
    });
  } catch { /* matchMedia assente: pazienza */ }
}

/** Applica e memorizza (locale): la persistenza sul server la fa chi chiama. */
export function impostaAspetto(tema: string | null | undefined, modo: string | null | undefined): void {
  temaCorrente = temaValido(tema) ? tema : TEMA_DEFAULT;
  modoCorrente = modoValido(modo) ? modo : MODO_DEFAULT;
  salvaAspettoLocale(temaCorrente, modoCorrente);
  applicaAspetto(temaCorrente, modoCorrente);
}
