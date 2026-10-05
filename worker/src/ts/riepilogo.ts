/**
 * Contify Timesheet — riepilogo personale (TS-M1, M1.3 bis; decisioni A14, A15).
 *
 * Chi registra vede lo stato del proprio lavoro senza doverlo chiedere: oggi,
 * la settimana (da lunedì a domenica), il mese. Solo il proprio lavoro,
 * nessun importo. Le ore previste le indica il titolare per persona (minuti a
 * settimana e giorni di lavoro); il previsto del giorno è il settimanale
 * diviso per i giorni di lavoro. Sotto il previsto non è un errore (il
 * programma non conosce ferie e permessi): si evidenzia solo il giorno di
 * lavoro già passato senza alcuna registrazione.
 *
 * Funzioni pure sul calendario (date AAAA-MM-GG, calcoli in UTC): «oggi» lo
 * decide il chiamante nel fuso di Roma.
 */

import { giornoSettimana, giorniPrima } from './quando';

export interface RegistrazioneMinima { data: string; minuti: number }
export interface PersonaRiepilogo { minutiSettimanali: number | null; giorniLavorativi: string }

export interface GiornoRiepilogo {
  data: string;
  minuti: number;
  previsti: number | null;
  lavorativo: boolean;
  /** Giorno lavorativo già passato senza registrazioni (oggi non è mai vuoto). */
  vuoto: boolean;
  festivo: boolean;
}

export interface Riepilogo {
  oggi: { data: string; minuti: number; registrazioni: number; previsti: number | null };
  settimana: GiornoRiepilogo[];
  mese: { minuti: number; previsti: number | null };
}

/** Pasqua gregoriana (algoritmo di Meeus/Jones/Butcher). */
export function pasqua(anno: number): string {
  const a = anno % 19, b = Math.floor(anno / 100), c = anno % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`;
}

/** Festività nazionali italiane (elenco fisso più il lunedì dell'Angelo); il patrono non è gestito. */
export function festivo(data: string): boolean {
  const anno = Number(data.slice(0, 4));
  const mg = data.slice(5);
  if (['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'].includes(mg)) return true;
  const p = pasqua(anno);
  return data === p || data === giorniPrima(p, -1);
}

/** Giorno di lavoro della persona: fra i suoi giorni (1 = lunedì … 7 = domenica) e non festivo. */
export function lavorativo(data: string, giorniLavorativi: string): boolean {
  const w = giornoSettimana(data); // 0 = domenica
  const n = w === 0 ? 7 : w;
  return giorniLavorativi.includes(String(n)) && !festivo(data);
}

export function previstoDelGiorno(persona: PersonaRiepilogo): number | null {
  if (!persona.minutiSettimanali) return null;
  const n = new Set(persona.giorniLavorativi.split('').filter((c) => /[1-7]/.test(c))).size;
  if (!n) return null;
  return Math.round(persona.minutiSettimanali / n);
}

/** Il lunedì della settimana che contiene la data. */
export function lunediDi(data: string): string {
  const w = giornoSettimana(data);
  return giorniPrima(data, (w + 6) % 7);
}

export function calcolaRiepilogo(oggi: string, registrazioni: RegistrazioneMinima[], persona: PersonaRiepilogo): Riepilogo {
  const perGiorno = new Map<string, { minuti: number; n: number }>();
  for (const r of registrazioni) {
    const v = perGiorno.get(r.data) ?? { minuti: 0, n: 0 };
    v.minuti += r.minuti;
    v.n += 1;
    perGiorno.set(r.data, v);
  }
  const previsto = previstoDelGiorno(persona);
  const lun = lunediDi(oggi);
  const settimana: GiornoRiepilogo[] = [];
  for (let i = 0; i < 7; i++) {
    const data = giorniPrima(lun, -i);
    const minuti = perGiorno.get(data)?.minuti ?? 0;
    const lav = lavorativo(data, persona.giorniLavorativi);
    const w = giornoSettimana(data);
    const fineSettimana = w === 0 || w === 6;
    if (fineSettimana && !lav && minuti === 0) continue;
    settimana.push({
      data, minuti, previsti: lav ? previsto : null, lavorativo: lav,
      vuoto: lav && data < oggi && minuti === 0, festivo: festivo(data),
    });
  }
  const mese = oggi.slice(0, 7);
  let minutiMese = 0;
  for (const [data, v] of perGiorno) if (data.startsWith(mese)) minutiMese += v.minuti;
  // Previsto del mese: giorni lavorativi della persona nel mese, fino a oggi compreso.
  let previstiMese: number | null = null;
  if (previsto != null) {
    previstiMese = 0;
    for (let g = 1; g <= 31; g++) {
      const data = `${mese}-${String(g).padStart(2, '0')}`;
      if (data > oggi) break;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number(data.slice(8)) !== g) continue;
      const d = new Date(`${data}T00:00:00Z`);
      if (Number.isNaN(d.getTime()) || d.getUTCDate() !== g) break;
      if (lavorativo(data, persona.giorniLavorativi)) previstiMese += previsto;
    }
  }
  const oggiV = perGiorno.get(oggi) ?? { minuti: 0, n: 0 };
  return {
    oggi: { data: oggi, minuti: oggiV.minuti, registrazioni: oggiV.n, previsti: lavorativo(oggi, persona.giorniLavorativi) ? previsto : null },
    settimana,
    mese: { minuti: minutiMese, previsti: previstiMese },
  };
}
