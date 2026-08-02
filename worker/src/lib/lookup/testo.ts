/**
 * Normalizzazione dei testi che arrivano dal VIES: sono tutti in
 * MAIUSCOLO, senza accenti (sostituiti da un apostrofo finale) e con le
 * sigle societarie scritte in modi diversi.
 *
 * I dati di IndicePA sono gia scritti bene: NON vanno passati di qui,
 * basta comprimere gli spazi doppi.
 */

/** Sigle e acronimi che restano in maiuscolo cosi come sono. */
const ACRONIMI = new Set([
  'IRCCS', 'ASL', 'ASST', 'ULSS', 'AULSS', 'AUSL', 'USL', 'AOU', 'AO',
  'ATS', 'ASP', 'APSS', 'IPAB', 'ONLUS', 'APS', 'ODV', 'RSA', 'CRO',
  'INAIL', 'INPS', 'CNR', 'ISS', 'ARPA', 'SB', 'SPDC', 'AVIS', 'CUP',
]);

/** Forme societarie riportate a una scrittura sola. */
const FORME: Record<string, string> = {
  'SRL': 'S.r.l.', 'S.R.L.': 'S.r.l.', 'SRLS': 'S.r.l.s.',
  'SPA': 'S.p.A.', 'S.P.A.': 'S.p.A.',
  'SAS': 'S.a.s.', 'S.A.S.': 'S.a.s.',
  'SNC': 'S.n.c.', 'S.N.C.': 'S.n.c.',
  'SCARL': 'S.c.a.r.l.', 'SCRL': 'S.c.r.l.',
};

/** Parole che restano minuscole quando non sono la prima. */
const MINUSCOLE = new Set([
  'di', 'de', 'del', 'dello', 'della', 'dei', 'degli', 'delle', 'da',
  'dal', 'dalla', 'e', 'ed', 'in', 'il', 'lo', 'la', 'i', 'gli', 'le',
  'al', 'alla', 'ai', 'con', 'su', 'per', 'tra', 'fra',
]);

/** Preposizioni elise: restano minuscole, la parola dopo no. */
const ELISIONI = /^(dell|all|dall|nell|sull|coll|nel|l|d)(['’])(.+)$/i;

/**
 * Parole in cui l'apostrofo finale e autentico e NON un accento mancante.
 * "Ca'" e frequente in Veneto e Lombardia: Ca' Foscari, Ca' Granda.
 */
const APOSTROFO_VERO = new Set(["CA'", "PO'", "MO'", "BE'", "DA'", "DI'", "FA'", "STA'", "VA'"]);

const VOCALI_ACCENTATE: Record<string, string> = {
  a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù',
  A: 'À', E: 'È', I: 'Ì', O: 'Ò', U: 'Ù',
};

/**
 * Il VIES scrive le vocali accentate finali con l'apostrofo:
 * SOCIETA' -> Società, OLIVE' -> Olivè, E' -> È.
 */
function accentaFinale(parola: string): string {
  const m = parola.match(/^(.*?)([aeiouAEIOU])['’]$/);
  if (!m) return parola;
  return m[1] + VOCALI_ACCENTATE[m[2]];
}

/** Maiuscola iniziale, comprese le lettere dopo apostrofo o trattino. */
function iniziali(parola: string): string {
  return parola
    .toLowerCase()
    .replace(/(^|['’\-])([a-zàèéìòù])/g, (_m, sep, lettera) => sep + lettera.toUpperCase());
}

/**
 * Da MAIUSCOLO a Iniziali Maiuscole, rispettando acronimi, forme
 * societarie, preposizioni, elisioni e iniziali puntate.
 */
export function normalizzaTesto(input: string | null | undefined): string | null {
  if (!input) return null;
  const pulito = input.replace(/\s+/g, ' ').trim();
  if (!pulito) return null;

  // Se il testo non e tutto maiuscolo arriva da una fonte gia pulita.
  if (pulito !== pulito.toUpperCase()) return pulito;

  const parole = pulito.split(' ');
  const fuori: string[] = [];

  for (let i = 0; i < parole.length; i++) {
    const p = parole[i];

    // Le forme societarie puntate (S.R.L.) vanno riconosciute prima
    // della regola sulle sigle puntate, altrimenti passerebbero intatte.
    if (FORME[p]) { fuori.push(FORME[p]); continue; }

    // Sigle puntate intere (I.R.C.C.S.) e iniziali puntate (G.): intatte.
    if (/^(?:[A-Z]\.){2,}$/.test(p) || /^[A-Z]\.$/.test(p)) { fuori.push(p); continue; }

    const nudo = p.replace(/[.,;]+$/, '');
    const coda = p.slice(nudo.length);

    if (FORME[nudo]) { fuori.push(FORME[nudo] + coda); continue; }
    if (ACRONIMI.has(nudo)) { fuori.push(nudo + coda); continue; }
    if (APOSTROFO_VERO.has(nudo)) { fuori.push(iniziali(nudo) + coda); continue; }
    // Numeri romani e parole che iniziano per cifra restano come sono.
    if (/^[IVXLC]{2,}$/.test(nudo)) { fuori.push(nudo + coda); continue; }
    if (/^\d/.test(nudo)) { fuori.push(p); continue; }
    // Lettera singola: e un'iniziale (LARGO G A BRAMBILLA), resta maiuscola.
    if (/^[A-Z]$/.test(nudo)) { fuori.push(p); continue; }

    // Preposizione elisa non iniziale: dell'Industria, all'Angelo.
    const elisione = nudo.match(ELISIONI);
    if (i > 0 && elisione) {
      fuori.push(elisione[1].toLowerCase() + "'" + accentaFinale(iniziali(elisione[3])) + coda);
      continue;
    }

    const minuscolo = nudo.toLowerCase();
    if (i > 0 && MINUSCOLE.has(minuscolo)) { fuori.push(minuscolo + coda); continue; }

    fuori.push(accentaFinale(iniziali(nudo)) + coda);
  }

  return fuori.join(' ');
}

/**
 * Ripulisce la ragione sociale dai rifiuti presenti nel dato di origine.
 * Caso reale: "OSPEDALE P. PEDERZOLI CASA DI CURA PRIVATA SPA !!SPA".
 */
export function ripuliscRagioneSociale(input: string | null | undefined): string | null {
  if (!input) return null;
  const senzaRumore = input
    .replace(/\s*!!\s*\S+\s*$/, '')   // suffissi con doppio punto esclamativo
    .replace(/\s+/g, ' ')
    .trim();
  return normalizzaTesto(senzaRumore);
}

/** Il VIES tronca la denominazione a 60 caratteri: lo segnaliamo. */
export function probabilmenteTroncata(originale: string | null | undefined): boolean {
  return !!originale && originale.trim().length >= 60;
}

/**
 * Euristica sui gruppi IVA: senza l'API dell'Agenzia delle Entrate non
 * e possibile riconoscerli con certezza. Serve solo a mostrare un avviso.
 */
export function sembraGruppoIva(originale: string | null | undefined): boolean {
  if (!originale) return false;
  return /\bGRUPPO\s+IVA\b/i.test(originale) || /^GRUPPO\b/i.test(originale.trim());
}
