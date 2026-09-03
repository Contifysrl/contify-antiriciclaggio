/**
 * DIFFERENZE DELLA COMPAGINE AL RINNOVO DELLA VISURA (AR-M20-02)
 *
 * Soci e cariche sono una serie temporale (`valido_dal/valido_al`): al
 * rinnovo della visura le righe scomparse si chiudono e quelle nuove si
 * aprono. Qui si legge quel diff in termini che il professionista capisce —
 * chi è entrato, chi è uscito, chi ha cambiato quota o carica — e si decide
 * se la STRUTTURA è cambiata, cioè se la nuova fotografia può spostare i
 * titolari effettivi o il profilo di rischio (Tabella A.1) e quindi merita
 * un controllo costante con esito «da rivalutare» (art. 19 co. 1 lett. d);
 * regole tecniche CNDCEC 2025: la valutazione si aggiorna quando cambiano
 * gli elementi su cui poggia).
 *
 * Il modulo è puro e non conosce D1: riceve due fotografie della compagine
 * (prima e dopo) e restituisce il confronto. Le righe si abbinano per
 * codice fiscale (hash o in chiaro) e, in mancanza, per nome normalizzato.
 * Le variazioni che NON toccano la struttura (una PEC, un domicilio, la
 * data di nomina) non contano: il diff riguarda quote, diritti, cariche e
 * poteri di rappresentanza.
 */

import type { DirittoPartecipazione, CodiceCarica } from './titolare-effettivo';
import { CARICHE_CON_POTERI, etichettaCarica } from './titolare-effettivo';

export interface SocioFoto {
  nome: string;
  /** Chiave stabile del soggetto: cf_hash, codice fiscale o null. */
  chiave?: string | null;
  tipo: string;
  /** Percentuale 0..100. */
  quotaPercento: number;
  diritto?: DirittoPartecipazione | null;
  quoteProprie?: boolean;
}

export interface CaricaFoto {
  nome: string;
  chiave?: string | null;
  carica: CodiceCarica;
  rappresentanzaLegale?: boolean;
}

export interface FotoCompagine {
  soci: SocioFoto[];
  cariche: CaricaFoto[];
}

export interface VariazioneSocio {
  nome: string;
  tipo: string;
  da: { quotaPercento: number; diritto: DirittoPartecipazione } | null;
  a: { quotaPercento: number; diritto: DirittoPartecipazione } | null;
}

export interface VariazioneCarica {
  nome: string;
  da: { carica: CodiceCarica; rappresentanzaLegale: boolean } | null;
  a: { carica: CodiceCarica; rappresentanzaLegale: boolean } | null;
}

export interface DiffCompagine {
  soci: { entrati: VariazioneSocio[]; usciti: VariazioneSocio[]; variati: VariazioneSocio[] };
  cariche: { entrate: VariazioneCarica[]; uscite: VariazioneCarica[]; variate: VariazioneCarica[] };
  /** Almeno una variazione fra soci o cariche. */
  cambiata: boolean;
  /**
   * La variazione può spostare titolari effettivi o rischio: soci entrati o
   * usciti, quote o diritti cambiati, cariche con poteri di amministrazione o
   * rappresentanza entrate/uscite/cambiate. Un sindaco che cambia non è
   * struttura.
   */
  strutturaCambiata: boolean;
  /** Riepilogo in italiano, una riga per variazione (per le note del controllo costante e l'audit). */
  righe: string[];
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const chiaveDi = (x: { chiave?: string | null; nome: string }) => (x.chiave && x.chiave.trim() ? `K:${x.chiave.trim().toUpperCase()}` : `N:${norm(x.nome)}`);
const pct = (q: number) => `${(Math.round(q * 100) / 100).toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;
const ETICHETTA_DIRITTO: Record<DirittoPartecipazione, string> = {
  PROPRIETA: 'proprietà', NUDA_PROPRIETA: 'nuda proprietà', USUFRUTTO: 'usufrutto', PEGNO: 'pegno', SEQUESTRO: 'sequestro',
  PIGNORAMENTO: 'pignoramento', COMPROPRIETA: 'comproprietà', ALTRO: 'altro diritto',
};

function raggruppaSoci(soci: SocioFoto[]): Map<string, { nome: string; tipo: string; quotaPercento: number; diritto: DirittoPartecipazione }> {
  const m = new Map<string, { nome: string; tipo: string; quotaPercento: number; diritto: DirittoPartecipazione }>();
  for (const s of soci) {
    if (s.quoteProprie) continue; // le quote proprie non sono un socio
    const diritto = s.diritto ?? 'PROPRIETA';
    const k = `${chiaveDi(s)}|${diritto}`;
    const cur = m.get(k);
    if (cur) cur.quotaPercento = Math.round((cur.quotaPercento + s.quotaPercento) * 100) / 100;
    else m.set(k, { nome: s.nome, tipo: s.tipo, quotaPercento: Math.round(s.quotaPercento * 100) / 100, diritto });
  }
  return m;
}

function raggruppaCariche(cariche: CaricaFoto[]): Map<string, { nome: string; carica: CodiceCarica; rappresentanzaLegale: boolean }> {
  const m = new Map<string, { nome: string; carica: CodiceCarica; rappresentanzaLegale: boolean }>();
  for (const c of cariche) {
    const k = chiaveDi(c);
    const cur = m.get(k);
    // Una persona con più cariche: si tiene la più pesante (come fa il parser).
    if (!cur || PESO[c.carica] > PESO[cur.carica]) m.set(k, { nome: c.nome, carica: c.carica, rappresentanzaLegale: Boolean(c.rappresentanzaLegale) || Boolean(cur?.rappresentanzaLegale) });
    else if (c.rappresentanzaLegale) cur.rappresentanzaLegale = true;
  }
  return m;
}

const PESO: Record<CodiceCarica, number> = {
  AMMINISTRATORE_UNICO: 10, LIQUIDATORE: 9, CURATORE: 9, PRESIDENTE_CDA: 8, CONSIGLIERE_DELEGATO: 7, VICE_PRESIDENTE_CDA: 6,
  SOCIO_AMMINISTRATORE: 6, TITOLARE: 6, CONSIGLIERE: 5, INSTITORE: 4, PROCURATORE: 3, SINDACO: 2, REVISORE: 2, ALTRO: 0,
};

const conPoteri = (c: { carica: CodiceCarica; rappresentanzaLegale: boolean }) => CARICHE_CON_POTERI.has(c.carica) || c.rappresentanzaLegale;

export function diffCompagine(prima: FotoCompagine, dopo: FotoCompagine): DiffCompagine {
  const out: DiffCompagine = {
    soci: { entrati: [], usciti: [], variati: [] },
    cariche: { entrate: [], uscite: [], variate: [] },
    cambiata: false,
    strutturaCambiata: false,
    righe: [],
  };

  // Soci: si abbinano per soggetto (a prescindere dal diritto), così una
  // quota che passa da proprietà a nuda proprietà è una variazione, non
  // un'uscita più un'entrata.
  const sPrima = raggruppaSoci(prima.soci);
  const sDopo = raggruppaSoci(dopo.soci);
  const perSoggetto = (m: Map<string, { nome: string; tipo: string; quotaPercento: number; diritto: DirittoPartecipazione }>) => {
    const r = new Map<string, Array<{ nome: string; tipo: string; quotaPercento: number; diritto: DirittoPartecipazione }>>();
    for (const [k, v] of m) {
      const sogg = k.slice(0, k.lastIndexOf('|'));
      r.set(sogg, [...(r.get(sogg) ?? []), v]);
    }
    return r;
  };
  const pS = perSoggetto(sPrima);
  const dS = perSoggetto(sDopo);
  const descr = (l: Array<{ quotaPercento: number; diritto: DirittoPartecipazione }>) =>
    l.map((x) => `${pct(x.quotaPercento)}${x.diritto === 'PROPRIETA' ? '' : ` in ${ETICHETTA_DIRITTO[x.diritto]}`}`).join(' + ');
  const principale = (l: Array<{ quotaPercento: number; diritto: DirittoPartecipazione }>) => {
    const tot = l.reduce((a, x) => a + x.quotaPercento, 0);
    const dir = l.length === 1 ? l[0].diritto : 'ALTRO';
    return { quotaPercento: Math.round(tot * 100) / 100, diritto: dir as DirittoPartecipazione };
  };
  for (const [k, l] of pS) {
    const n = dS.get(k);
    if (!n) {
      out.soci.usciti.push({ nome: l[0].nome, tipo: l[0].tipo, da: principale(l), a: null });
      out.righe.push(`Socio uscito: ${l[0].nome} (${descr(l)}).`);
      continue;
    }
    const uguale = l.length === n.length && l.every((x) => n.some((y) => y.diritto === x.diritto && Math.abs(y.quotaPercento - x.quotaPercento) < 0.005));
    if (!uguale) {
      out.soci.variati.push({ nome: n[0].nome, tipo: n[0].tipo, da: principale(l), a: principale(n) });
      out.righe.push(`Quota variata: ${n[0].nome} da ${descr(l)} a ${descr(n)}.`);
    }
  }
  for (const [k, n] of dS) {
    if (pS.has(k)) continue;
    out.soci.entrati.push({ nome: n[0].nome, tipo: n[0].tipo, da: null, a: principale(n) });
    out.righe.push(`Socio entrato: ${n[0].nome} (${descr(n)}).`);
  }

  // Cariche.
  const cPrima = raggruppaCariche(prima.cariche);
  const cDopo = raggruppaCariche(dopo.cariche);
  const eti = (c: { carica: CodiceCarica; rappresentanzaLegale: boolean }) => `${etichettaCarica(c.carica)}${c.rappresentanzaLegale ? ', rappresentante legale' : ''}`;
  let poteriToccati = false;
  for (const [k, p] of cPrima) {
    const n = cDopo.get(k);
    if (!n) {
      out.cariche.uscite.push({ nome: p.nome, da: p, a: null });
      out.righe.push(`Carica cessata: ${p.nome}, ${eti(p)}.`);
      if (conPoteri(p)) poteriToccati = true;
      continue;
    }
    if (n.carica !== p.carica || n.rappresentanzaLegale !== p.rappresentanzaLegale) {
      out.cariche.variate.push({ nome: n.nome, da: p, a: n });
      out.righe.push(`Carica variata: ${n.nome} da ${eti(p)} a ${eti(n)}.`);
      if (conPoteri(p) || conPoteri(n)) poteriToccati = true;
    }
  }
  for (const [k, n] of cDopo) {
    if (cPrima.has(k)) continue;
    out.cariche.entrate.push({ nome: n.nome, da: null, a: n });
    out.righe.push(`Nuova carica: ${n.nome}, ${eti(n)}.`);
    if (conPoteri(n)) poteriToccati = true;
  }

  const sociToccati = out.soci.entrati.length + out.soci.usciti.length + out.soci.variati.length > 0;
  out.cambiata = sociToccati || out.cariche.entrate.length + out.cariche.uscite.length + out.cariche.variate.length > 0;
  out.strutturaCambiata = sociToccati || poteriToccati;
  return out;
}

/** Testo per le note del controllo costante «da rivalutare» proposto dal diff. */
export function riepilogoDiff(d: DiffCompagine, dataVisura: string | null): string {
  const intro = dataVisura ? `Visura del ${dataVisura.slice(0, 10).split('-').reverse().join('/')}: ` : 'Dal rinnovo della visura: ';
  return intro + (d.righe.length ? d.righe.join(' ') : 'nessuna variazione di compagine o cariche.');
}
