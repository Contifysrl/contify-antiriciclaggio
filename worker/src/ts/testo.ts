/**
 * Contify Timesheet — utilità sul testo per il riconoscimento locale (TS-M1, passo 1).
 *
 * Funzioni pure, senza archivio: normalizzazione, spezzettamento in parole con
 * la posizione nel testo originale, somiglianza fra parole, elenchi di parole
 * che non identificano un cliente (forme giuridiche, parole comuni, nomi di
 * battesimo). Tutto il resto del riconoscimento (durata.ts, quando.ts,
 * riconoscitore.ts, interpretazione.ts) si appoggia qui.
 */

/** Minuscole, senza accenti, apostrofi e trattini resi spazi, punteggiatura via. */
export function normalizza(testo: string): string {
  return testo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Lettere non latine che somigliano a lettere latine (incolla da PDF, tastiere miste).
    .replace(/[а]/g, 'a').replace(/[е]/g, 'e').replace(/[о]/g, 'o').replace(/[р]/g, 'p').replace(/[с]/g, 'c')
    .replace(/[’'`´]/g, ' ')
    .replace(/[-–—_/\\]/g, ' ')
    .replace(/[^a-z0-9àèéìòù&\s.,;:()!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Parola {
  /** Parola normalizzata (minuscola, senza accenti). */
  t: string;
  /** Posizione nel testo originale (inizio incluso, fine esclusa). */
  inizio: number;
  fine: number;
  /** Indice della parola nella sequenza. */
  i: number;
}

/**
 * Spezza il testo in parole conservando la posizione nell'originale.
 * Le parole sono sequenze di lettere o cifre; «un'ora» diventa «un» e «ora»;
 * «1h30» resta una parola sola (la tratta durata.ts).
 */
export function parole(testo: string): Parola[] {
  const out: Parola[] = [];
  const re = /[\p{L}\p{N}]+(?:[.][\p{N}]+)?/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(testo))) {
    const grezzo = m[0];
    const t = normalizza(grezzo).replace(/[^a-z0-9.]/g, '');
    if (!t) continue;
    out.push({ t, inizio: m.index, fine: m.index + grezzo.length, i: out.length });
  }
  return out;
}

/** Distanza di Levenshtein (con trasposizioni adiacenti contate 1). */
export function distanza(a: string, b: string): number {
  if (a === b) return 0;
  const n = a.length, m = b.length;
  if (!n) return m;
  if (!m) return n;
  let prev2: number[] | null = null;
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    for (let j = 1; j <= m; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + costo);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}

/** Somiglianza 0..1 fra due parole normalizzate (1 = uguali). */
export function somiglianza(a: string, b: string): number {
  if (a === b) return 1;
  const l = Math.max(a.length, b.length);
  if (!l) return 1;
  return 1 - distanza(a, b) / l;
}

/**
 * Somiglianza «utile» per il riconoscimento: le parole corte devono essere
 * uguali, quelle medie quasi, quelle lunghe tollerano due errori di battitura
 * o di dettatura. Sotto la soglia vale 0.
 */
export function somiglianzaUtile(a: string, b: string): number {
  if (a === b) return 1;
  const l = Math.min(a.length, b.length);
  const s = somiglianza(a, b);
  if (l <= 5) return 0;
  if (l === 6) return s >= 0.83 ? s : 0;
  return s >= 0.75 ? s : 0;
}

/** Forme giuridiche e qualifiche che non identificano nessuno: si tolgono dai nomi. */
export const FORME_GIURIDICHE = new Set([
  'srl', 'srls', 'spa', 'snc', 'sas', 'ss', 'sapa', 'scarl', 'scrl', 'scpa', 'sc', 'soc', 'societa', 'coop', 'cooperativa',
  'semplice', 'unipersonale', 'liquidazione', 'impresa', 'individuale', 'ditta', 'sig', 'sigra', 'sigg', 'dott', 'dottssa',
  'dr', 'avv', 'ing', 'geom', 'rag', 'arch', 'prof', 'onlus', 'ets', 'aps', 'sas', 'sapa', 'c', 'co', 'e', 'di', 'del',
  'della', 'dei', 'degli', 'delle', 'al', 'alla', 'il', 'la', 'lo', 'i', 'gli', 'le', 'in', 'da', 'and', 'the', 'of',
]);

/** Parole vuote del parlato e della frase: non identificano niente e non finiscono nelle note. */
export const PAROLE_VUOTE = new Set([
  'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra', 'del',
  'dello', 'della', 'dei', 'degli', 'delle', 'al', 'allo', 'alla', 'ai', 'agli', 'alle', 'dal', 'dallo', 'dalla', 'dai',
  'dagli', 'dalle', 'nel', 'nello', 'nella', 'nei', 'negli', 'nelle', 'sul', 'sullo', 'sulla', 'sui', 'sugli', 'sulle',
  'e', 'ed', 'o', 'od', 'ma', 'poi', 'anche', 'pure', 'che', 'chi', 'cui', 'non', 'piu', 'meno', 'come', 'dove', 'quando',
  'ho', 'hai', 'ha', 'abbiamo', 'avete', 'hanno', 'sono', 'sei', 'siamo', 'siete', 'era', 'ero', 'stato', 'stata', 'fatto',
  'fatta', 'fatti', 'fatte', 'lavorato', 'passato', 'passata', 'dedicato', 'dedicata', 'speso', 'messo', 'messa', 'visto',
  'finito', 'finita', 'sistemato', 'sistemata', 'preparato', 'preparata', 'controllato', 'controllata', 'inviato', 'inviata',
  'mi', 'ti', 'ci', 'vi', 'si', 'ne', 'lui', 'lei', 'loro', 'me', 'te', 'questo', 'questa', 'questi', 'queste', 'quello',
  'quella', 'quelli', 'quelle', 'stesso', 'stessa', 'altro', 'altra', 'altri', 'altre', 'tutto', 'tutta', 'tutti', 'tutte',
  'ciao', 'grazie', 'allora', 'dunque', 'eh', 'ehm', 'mmm', 'cioe', 'insomma', 'praticamente', 'diciamo', 'ecco', 'niente',
  'circa', 'quasi', 'oltre', 'solo', 'soltanto', 'ancora', 'gia', 'sempre', 'mai', 'ora', 'adesso', 'oggi', 'ieri', 'domani',
  'mattina', 'mattino', 'stamattina', 'stamane', 'pomeriggio', 'sera', 'stasera', 'notte', 'giorno', 'giorni', 'settimana',
  'mese', 'anno', 'ore', 'ora', 'minuti', 'minuto', 'min', 'h', 'x', 'per', 'cliente', 'clienti', 'lavoro', 'lavori',
  'cose', 'cosa', 'roba', 'varie', 'vario', 'varia', 'nota', 'note', 'totale', 'ciascuno', 'ciascuna', 'ognuno', 'ognuna',
  'entrambi', 'entrambe', 'testa', 'tutte', 'mezza', 'mezzo', 'quarto', 'quarti', 'paio', 'po', 'bel', 'bella', 'bello',
  'signor', 'signora', 'signore', 'sig', 'dott', 'dottore', 'dottoressa', 'avvocato', 'ingegnere', 'geometra', 'ragioniere',
  'commercialista', 'consulente', 'collega', 'dipendente', 'dipendenti', 'socio', 'soci', 'fornitore', 'fornitori',
  'controparte', 'nuovo', 'nuova', 'vecchio', 'vecchia', 'scorso', 'scorsa', 'prossimo', 'prossima', 'passato', 'passata',
  'conto', 'nome', 'parte', 'fine', 'inizio', 'via', 'piazza', 'corso', 'presso', 'c', 'o',
]);

/**
 * Parole comuni dell'italiano e del lavoro di studio che possono stare in un
 * nome di cliente («Farmacia», «Centrale», «Formazione») ma anche nel discorso:
 * da sole non bastano a identificare un cliente.
 */
export const PAROLE_COMUNI = new Set([
  'studio', 'legale', 'associato', 'associati', 'associazione', 'culturale', 'sportiva', 'sportivo', 'dilettantistica',
  'italia', 'italiana', 'italiano', 'nord', 'sud', 'est', 'ovest', 'centro', 'centrale', 'nuova', 'nuovo', 'vecchia',
  'san', 'santa', 'santo', 'sant', 'bar', 'caffe', 'ristorante', 'trattoria', 'pizzeria', 'osteria', 'hotel', 'albergo',
  'farmacia', 'parafarmacia', 'panificio', 'pasticceria', 'gelateria', 'macelleria', 'supermercato', 'market', 'negozio',
  'officina', 'autofficina', 'carrozzeria', 'autotrasporti', 'trasporti', 'logistica', 'edile', 'edilizia', 'costruzioni',
  'impianti', 'impiantistica', 'idraulica', 'elettrica', 'elettrico', 'termoidraulica', 'serramenti', 'infissi',
  'fonderie', 'fonderia', 'officine', 'meccanica', 'metalmeccanica', 'industria', 'industrie', 'industriale',
  'commerciale', 'commercio', 'servizi', 'service', 'group', 'gruppo', 'holding', 'capital', 'finance', 'immobiliare',
  'immobili', 'agricola', 'agricolo', 'azienda', 'aziende', 'fattoria', 'cantina', 'vini', 'famiglia', 'family', 'fratelli',
  'figli', 'eredi', 'formazione', 'consulting', 'consulenza', 'consulenze', 'software', 'tech', 'digital', 'web', 'media',
  'design', 'moda', 'sport', 'fitness', 'palestra', 'salute', 'medica', 'medico', 'dentale', 'odontoiatrico', 'clinica',
  'sala', 'giochi', 'compro', 'oro', 'argento', 'gioielleria', 'orologeria', 'ottica', 'foto', 'stampa', 'tipografia',
  'grafica', 'pubblicita', 'eventi', 'viaggi', 'turismo', 'tour', 'noleggio', 'auto', 'moto', 'bici', 'faro', 'ponte',
  'torre', 'castello', 'villa', 'corte', 'borgo', 'piazza', 'via', 'lago', 'mare', 'monte', 'valle', 'fiume', 'sole',
  'luna', 'stella', 'stelle', 'alba', 'rosa', 'fiore', 'fiori', 'verde', 'blu', 'rosso', 'bianco',
  'nero', 'trust', 'fondazione', 'fondo', 'ente', 'comune', 'provincia', 'regione', 'istituto', 'scuola', 'asilo',
  'adige', 'brenta', 'piave', 'sile', 'bacchiglione', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette',
  'otto', 'nove', 'dieci', 'cento', 'mille', 'primo', 'prima', 'secondo', 'seconda', 'terzo', 'terza',
]);

/**
 * Nomi di battesimo frequenti: da soli identificano poco («Marco» può essere
 * un cliente, il figlio del cliente o il dipendente di un cliente).
 */
export const NOMI_DI_BATTESIMO = new Set([
  'alessandro', 'alessandra', 'alessia', 'alberto', 'alice', 'andrea', 'angela', 'angelo', 'anna', 'antonio', 'antonella',
  'barbara', 'beatrice', 'bruno', 'carla', 'carlo', 'caterina', 'chiara', 'claudia', 'claudio', 'corrado', 'cristina',
  'cristiano', 'daniela', 'daniele', 'dario', 'davide', 'demetrio', 'diego', 'elena', 'eleonora', 'elisa', 'elisabetta',
  'emanuele', 'emma', 'enrico', 'enzo', 'erica', 'evaristo', 'fabio', 'fabrizio', 'federica', 'federico', 'filippo',
  'francesca', 'francesco', 'franco', 'gabriele', 'gaia', 'giacomo', 'gianluca', 'gianni', 'gino', 'giorgia', 'giorgio',
  'giovanna', 'giovanni', 'giulia', 'giulio', 'giuseppe', 'greta', 'ilaria', 'ilenia', 'irene', 'laura', 'lavinia',
  'leonardo', 'lorenzo', 'luca', 'lucia', 'luciano', 'luigi', 'luisa', 'manuel', 'manuela', 'marco', 'margherita',
  'maria', 'marina', 'mario', 'marta', 'martina', 'massimo', 'matteo', 'maurizio', 'mauro', 'michela', 'michele',
  'monica', 'nicola', 'nicolo', 'nives', 'ottavia', 'paola', 'paolo', 'patrizia', 'pietro', 'riccardo', 'roberta',
  'roberto', 'rosa', 'sabrina', 'salvatore', 'sara', 'serena', 'sergio', 'silvia', 'simone', 'simona', 'sofia', 'stefania',
  'stefano', 'teresa', 'tommaso', 'tullio', 'ubaldo', 'umberto', 'valentina', 'valeria', 'valerio', 'vincenzo', 'vittoria',
  'vittorio', 'walter',
]);

/** Parole che restano dopo aver tolto forme giuridiche e articoli: quelle che identificano. */
export function paroleIdentificative(nome: string): string[] {
  return normalizza(nome)
    .replace(/[.,;:()!?]/g, ' ')
    .split(/\s+/)
    .filter((p) => p && !FORME_GIURIDICHE.has(p) && (p.length >= 3 || /^\d+$/.test(p)));
}
