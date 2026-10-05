// ── Contify Timesheet — tipi delle risposte di /api/ts e formati comuni (TS-M1) ──

export type Candidato = { id: string; nome: string };

export interface Proposta {
  cliente: { id: string | null; candidati: Candidato[] };
  servizio: { id: string | null; candidati: Candidato[] };
  minuti: number | null;
  data: string | null;
  nota: string | null;
  motore: 'LOCALE' | 'AI';
}

export interface ClienteBreve {
  id: string;
  nome: string;
  personaFisica: boolean;
  alias: string[];
  daVerificare: boolean;
  collegatoAr: boolean;
}

export interface ServizioBreve {
  id: string;
  nome: string;
  generico: boolean;
  tariffaOrariaCent?: number;
  paroleChiave?: string[];
}

export interface Contesto {
  oggi: string;
  ruolo: 'TITOLARE' | 'COLLABORATORE';
  amministratore: boolean;
  clienti: ClienteBreve[];
  servizi: ServizioBreve[];
  ai: { abilitata: boolean; voce: boolean; disponibile: boolean; limiteInterpretazioniRaggiunto: boolean; limiteAudioRaggiunto: boolean };
  impostazioni: { collaboratoriCreanoClienti: boolean; giorniIndietro: number };
}

export interface Registrazione {
  id: string;
  utenteId: string;
  utenteNome: string;
  creatoDa: string;
  clienteId: string;
  clienteNome: string;
  servizioId: string;
  servizioNome: string;
  data: string;
  minuti: number;
  tariffaCent: number | null;
  nota: string | null;
  testoOriginale: string | null;
  origine: 'CHAT' | 'VOCE' | 'MANUALE';
  motore: 'LOCALE' | 'AI' | 'MANUALE';
  automatica: boolean;
  daVerificare: boolean;
  proformaId: string | null;
  creatoIl: string;
  modificatoIl: string | null;
  motivi?: string[];
}

export interface GiornoRiepilogo {
  data: string;
  minuti: number;
  previsti: number | null;
  lavorativo: boolean;
  vuoto: boolean;
  festivo: boolean;
}

export interface Riepilogo {
  oggi: { data: string; minuti: number; registrazioni: number; previsti: number | null };
  settimana: GiornoRiepilogo[];
  mese: { minuti: number; previsti: number | null };
}

export interface ClienteTs {
  id: string;
  nome: string;
  personaFisica: boolean;
  codiceFiscale: string | null;
  partitaIva: string | null;
  origine: string;
  clienteArId: string | null;
  collegatoAr: boolean;
  arMancante: boolean;
  alias: string[];
  attivo: boolean;
  daVerificare: boolean;
  dati: { sede?: string | null; pec?: string | null; codiceDestinatario?: string | null; email?: string | null; telefono?: string | null } | null;
  creatoIl: string | null;
}

export interface Servizio {
  id: string;
  nome: string;
  tariffaOrariaCent: number;
  paroleChiave: string[];
  generico: boolean;
  attivo: boolean;
  ordine: number;
}

export interface PersonaTs {
  utenteId: string;
  nome: string;
  tsRuolo: 'TITOLARE' | 'COLLABORATORE' | null;
  amministratore: boolean;
  attivo: boolean;
  minutiSettimanali: number | null;
  giorniLavorativi: string;
}

/** «5 h 30», «45 min», «0 min». */
export function durata(minuti: number | null | undefined): string {
  if (minuti == null) return '—';
  const h = Math.floor(minuti / 60), m = minuti % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/** «5,5 h» per i totali. */
export function ore(minuti: number): string {
  return `${(Math.round((minuti / 60) * 10) / 10).toLocaleString('it-IT')} h`;
}

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const GIORNI_BREVI = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export function giornoSettimana(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}
export function nomeGiorno(iso: string): string { return GIORNI[giornoSettimana(iso)]; }
export function inizialeGiorno(iso: string): string { return GIORNI_BREVI[giornoSettimana(iso)]; }

/** «lunedì 5 ottobre». */
export function dataLunga(iso: string, oggi?: string): string {
  if (oggi && iso === oggi) return 'oggi';
  const [a, m, g] = iso.split('-').map(Number);
  const anno = oggi && !oggi.startsWith(String(a)) ? ` ${a}` : '';
  return `${GIORNI[giornoSettimana(iso)]} ${g} ${MESI[m - 1]}${anno}`;
}

/** «05/10/2026». */
export function dataBreve(iso: string): string {
  const [a, m, g] = iso.split('-');
  return `${g}/${m}/${a}`;
}

export function euro(cent: number | null | undefined): string {
  if (cent == null) return '—';
  return (cent / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

/** Minuti ← «1,5», «1:30», «90» (minuti se > 24 o se finisce in «m»). */
export function leggiDurata(testo: string): number | null {
  const t = testo.trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return null;
  let m = /^(\d{1,2})[:h](\d{1,2})$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d{1,3})(m|min|minuti)$/.exec(t);
  if (m) return Number(m[1]);
  m = /^(\d{1,2})(h|ore?)$/.exec(t);
  if (m) return Number(m[1]) * 60;
  m = /^(\d{1,2})(?:[.,](\d{1,2}))?$/.exec(t);
  if (m) {
    const intero = Number(m[1]);
    if (!m[2]) return intero > 24 ? intero : intero * 60;
    return Math.round((intero + Number(`0.${m[2]}`)) * 60);
  }
  return null;
}
