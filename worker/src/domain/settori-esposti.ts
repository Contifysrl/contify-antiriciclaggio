/**
 * SETTORI ESPOSTI AL RISCHIO DI RICICLAGGIO (AR-M18, fattore A.2)
 *
 * Il fattore A.2 della Tabella A («prevalente attività svolta», art. 17 co. 3
 * lett. a) n. 2) chiede di valutare «le attività esposte al rischio di
 * infiltrazioni criminali e terroristiche» (Modello AV.1, Informativa CNDCEC
 * n. 57/2026). Qui vive la tabella che traduce l'ATECO e la descrizione
 * dell'attività in una PROPOSTA di punteggio con la fonte accanto a ogni voce.
 *
 * Regole di prudenza:
 *  - ogni voce cita il documento da cui discende: niente è ricordato a memoria;
 *  - la tabella è una serie temporale (come le soglie e i Paesi ad alto
 *    rischio): la prossima Analisi nazionale la aggiorna con una nuova
 *    finestra, senza riscrivere quella usata nei fascicoli del 2026;
 *  - il punteggio è PROPOSTO: il professionista lo conferma o si scosta con
 *    motivazione. Il programma non decide il rischio.
 *
 * Fonti (citate per esteso una volta qui):
 *  [ANR-2.1]  Analisi nazionale dei rischi di riciclaggio e di finanziamento del
 *             terrorismo 2024 (CSF/MEF), §2.1 «L'utilizzo del contante in Italia»:
 *             «I settori di attività economica in cui l'uso del contante risulta più
 *             pervasivo sono le famiglie produttrici, il settore alberghiero e della
 *             ristorazione e il commercio al minuto».
 *  [ANR-5.2.1] ANR 2024, §5.2.1 (commercialisti): «tra le principali aree di rischio
 *             dell'attività professionale rientrano: le compravendite immobiliari; le
 *             operazioni societarie; l'attività nel campo dello smaltimento dei rifiuti,
 *             dei "compro-oro", del gioco e delle scommesse; gli istituti giuridici quali
 *             il trust e le attività fiduciarie; le transazioni in crypto attività;
 *             l'erogazione e gestione dei finanziamenti pubblici alle imprese».
 *  [ANR-5.3.2] ANR 2024, §5.3.2 Operatori compro oro: «attività economiche considerate
 *             particolarmente suscettibili … di uso o abuso a fini di riciclaggio»,
 *             rischio specifico elevato.
 *  [ANR-5.3.3] ANR 2024, §5.3.3 Agenti immobiliari: «il mercato immobiliare è un contesto
 *             favorevole al fenomeno del riciclaggio».
 *  [ANR-5.3.4] ANR 2024, §5.3.4 settore dell'arte: «uno dei veicoli più idonei per il
 *             riciclaggio di proventi illeciti».
 *  [ANR-5.3.6] ANR 2024, §5.3.6 giochi e scommesse: «forte attrattiva per le organizzazioni
 *             criminali … ulteriore canale per riciclare e reimpiegare i proventi illeciti».
 *  [ANR-3.2]  ANR 2024, Tabella 3.2.1 minacce: traffico illecito di rifiuti e gioco
 *             d'azzardo «abbastanza significativa».
 *  [UIF-IND]  Provvedimento UIF 12.5.2023, indicatori di anomalia, sub-indice sui «soggetti
 *             attivi in settori particolarmente esposti a rischi di riciclaggio (ad es.
 *             compro oro, cambio valuta, gioco o scommesse, casinò, money transfer, gestori
 *             di dispositivi che consentono l'acquisto/vendita di valute virtuali)».
 *  [UIF-RA]   UIF, Rapporto annuale per il 2024 (n. 17, 2025) e per il 2025 (n. 18, 2026):
 *             flussi segnaletici sull'interesse della criminalità organizzata per le
 *             energie rinnovabili; incrementi marcati per operatori in oro e in valuta virtuale.
 *
 * I codici ATECO sono PREFISSI (divisione, gruppo o classe) della classificazione
 * ATECO 2007/2022; l'ATECO 2025 conserva la struttura a livello di divisione e gruppo
 * per le voci qui usate. Dove il codice non basta (compro oro, fiduciarie, cripto,
 * money transfer) decide la descrizione dell'attività o dell'oggetto sociale.
 */

import type { Punteggio } from './types';

export interface VoceSettore {
  codice: string;
  etichetta: string;
  /** Prefissi ATECO (senza punti o con punti: si confrontano sulle cifre). */
  ateco: string[];
  /** Parole chiave sull'attività prevalente / oggetto sociale (minuscole, senza accenti). */
  parole: RegExp | null;
  /** Punteggio A.2 proposto (1..4). */
  punteggio: Punteggio;
  /** Riferimenti alle fonti elencate in testa al file. */
  fonti: string[];
  /** Motivazione in chiaro, da riportare nella proposta e nel verbale. */
  motivo: string;
  /** Attività a elevato utilizzo di contante (art. 24 co. 2 lett. a) n. 5): suggerisce la circostanza. */
  contanteIntensivo?: boolean;
}

export interface SerieSettori {
  da: string;
  a: string | null;
  fonte: string;
  voci: VoceSettore[];
}

export const SETTORI_ESPOSTI: SerieSettori[] = [
  {
    da: '2024-11-01',
    a: null,
    fonte: 'Analisi nazionale dei rischi 2024 (CSF/MEF, novembre 2024); Provvedimento UIF 12.5.2023; Rapporti annuali UIF 2024-2025',
    voci: [
      {
        codice: 'GIOCO',
        etichetta: 'Gioco, scommesse, case da gioco',
        ateco: ['92.00'],
        parole: /\b(scommess|gioco d.azzardo|giochi|casin[oò]|slot|videolotter|vlt|bingo|lotteri)/,
        punteggio: 4,
        fonti: ['ANR-5.2.1', 'ANR-5.3.6', 'ANR-3.2', 'UIF-IND'],
        motivo: 'settore dei giochi e delle scommesse: «forte attrattiva per le organizzazioni criminali» (ANR 2024 §5.3.6) e settore «particolarmente esposto» negli indicatori UIF',
        contanteIntensivo: true,
      },
      {
        codice: 'COMPRO_ORO',
        etichetta: 'Compro oro e commercio di oro e preziosi',
        ateco: ['47.77', '46.48', '32.12', '24.41'],
        parole: /\b(compro ?oro|oro\b|orefic|gioiell|preziosi|metalli preziosi|argenteria)/,
        punteggio: 4,
        fonti: ['ANR-5.2.1', 'ANR-5.3.2', 'UIF-IND', 'UIF-RA'],
        motivo: 'compro oro e commercio di oro e preziosi: attività «particolarmente suscettibili … di uso o abuso a fini di riciclaggio», rischio specifico elevato (ANR 2024 §5.3.2)',
        contanteIntensivo: true,
      },
      {
        codice: 'CRIPTO',
        etichetta: 'Cripto-attività e valute virtuali',
        ateco: [],
        parole: /\b(cripto|crypto|valut[ae] virtual|bitcoin|blockchain|asset digital|portafogli[o]? digital|casp\b|vasp\b|exchange)/,
        punteggio: 4,
        fonti: ['ANR-5.2.1', 'UIF-IND', 'UIF-RA'],
        motivo: 'transazioni in cripto-attività: area di rischio indicata per i commercialisti (ANR 2024 §5.2.1) e settore «particolarmente esposto» negli indicatori UIF',
      },
      {
        codice: 'CAMBIO_MONEY_TRANSFER',
        etichetta: 'Cambio valuta e money transfer',
        ateco: [],
        parole: /\b(cambiavalut|cambio valut|money transfer|rimess[ae] di denaro|trasferimento di fondi)/,
        punteggio: 4,
        fonti: ['UIF-IND'],
        motivo: 'cambio valuta e money transfer: settori «particolarmente esposti a rischi di riciclaggio» negli indicatori di anomalia UIF',
        contanteIntensivo: true,
      },
      {
        codice: 'RIFIUTI',
        etichetta: 'Raccolta, trattamento e smaltimento dei rifiuti; bonifiche',
        ateco: ['38', '39'],
        parole: /\b(rifiut|smaltiment|bonific|discaric|rottam)/,
        punteggio: 3,
        fonti: ['ANR-5.2.1', 'ANR-3.2'],
        motivo: 'smaltimento dei rifiuti: area di rischio per i commercialisti (ANR 2024 §5.2.1); il traffico illecito di rifiuti è minaccia «abbastanza significativa» (Tab. 3.2.1)',
      },
      {
        codice: 'FIDUCIARIE_TRUST',
        etichetta: 'Società fiduciarie, trust e amministrazione di beni per conto terzi',
        ateco: [],
        parole: /\b(fiduciari|trust\b|trustee|intestazione fiduciaria)/,
        punteggio: 3,
        fonti: ['ANR-5.2.1'],
        motivo: 'attività fiduciarie e trust: istituti indicati fra le aree di rischio per i commercialisti (ANR 2024 §5.2.1)',
      },
      {
        codice: 'IMMOBILIARE',
        etichetta: 'Compravendita e sviluppo immobiliare',
        ateco: ['68.1', '41.1'],
        parole: /\b(compravendita (di )?immobil|immobiliar|sviluppo di progetti immobiliari)/,
        punteggio: 3,
        fonti: ['ANR-5.2.1', 'ANR-5.3.3'],
        motivo: 'compravendite immobiliari: area di rischio per i commercialisti (ANR 2024 §5.2.1); «il mercato immobiliare è un contesto favorevole al fenomeno del riciclaggio» (§5.3.3)',
      },
      {
        codice: 'ARTE',
        etichetta: 'Commercio di opere d’arte, antiquariato, case d’asta',
        ateco: ['47.78.3', '47.79.1'],
        parole: /\b(opere d.arte|galleri[ae] d.arte|antiquari|antichit|cas[ae] d.asta|oggetti d.arte)/,
        punteggio: 3,
        fonti: ['ANR-5.3.4'],
        motivo: 'settore dell’arte: «uno dei veicoli più idonei per il riciclaggio di proventi illeciti» (ANR 2024 §5.3.4)',
      },
      {
        codice: 'ENERGIE_RINNOVABILI',
        etichetta: 'Produzione di energia da fonti rinnovabili',
        ateco: ['35.11'],
        parole: /\b(rinnovabil|fotovoltaic|eolic|impianti energetici|biogas|biomass)/,
        punteggio: 3,
        fonti: ['UIF-RA'],
        motivo: 'energie rinnovabili: la UIF segnala flussi che «mostrano l’interesse degli ambienti di criminalità organizzata nel settore» (Rapporto annuale 2025)',
      },
      {
        codice: 'RISTORAZIONE_ALLOGGIO',
        etichetta: 'Alloggio e ristorazione',
        ateco: ['55', '56'],
        parole: /\b(ristorant|ristorazion|bar\b|pizzeri|alberg|hotel|b&b|bed and breakfast|affittacamere|pubblici esercizi|discotec)/,
        punteggio: 2,
        fonti: ['ANR-2.1', 'ANR-5.3.3'],
        motivo: 'settore alberghiero e della ristorazione: fra quelli in cui «l’uso del contante risulta più pervasivo» (ANR 2024 §2.1)',
        contanteIntensivo: true,
      },
      {
        codice: 'COMMERCIO_MINUTO',
        etichetta: 'Commercio al dettaglio',
        ateco: ['47'],
        parole: /\b(commercio al (minuto|dettaglio)|vendita al dettaglio|negozi)/,
        punteggio: 2,
        fonti: ['ANR-2.1'],
        motivo: 'commercio al minuto: fra i settori in cui «l’uso del contante risulta più pervasivo» (ANR 2024 §2.1)',
        contanteIntensivo: true,
      },
    ],
  },
];

export interface EsitoSettore {
  voce: VoceSettore | null;
  /** Come si è arrivati alla voce: per codice ATECO o per parole chiave. */
  via: 'ATECO' | 'PAROLE' | null;
  serie: { da: string; fonte: string } | null;
}

const cifre = (s: string) => s.replace(/[^0-9]/g, '');

function normalizza(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Cerca il settore esposto vigente alla data. Prima per ATECO (prefisso più
 * lungo che combacia, così 47.77 vince su 47), poi per parole chiave
 * sull'attività prevalente e sull'oggetto sociale. Fra più voci per parole
 * chiave vince quella col punteggio più alto: è una proposta prudente, non
 * una condanna.
 */
export function settoreEsposto(
  input: { ateco?: string | null; attivita?: string | null; oggettoSociale?: string | null },
  data: string,
): EsitoSettore {
  const serie = SETTORI_ESPOSTI.find((s) => data >= s.da && (s.a === null || data <= s.a));
  if (!serie) return { voce: null, via: null, serie: null };
  const info = { da: serie.da, fonte: serie.fonte };

  const codice = cifre(input.ateco ?? '');
  if (codice) {
    let migliore: { voce: VoceSettore; lunghezza: number } | null = null;
    for (const v of serie.voci) {
      for (const p of v.ateco) {
        const pc = cifre(p);
        if (codice.startsWith(pc) && (!migliore || pc.length > migliore.lunghezza)) migliore = { voce: v, lunghezza: pc.length };
      }
    }
    if (migliore) return { voce: migliore.voce, via: 'ATECO', serie: info };
  }

  const testo = normalizza([input.attivita, input.oggettoSociale].filter(Boolean).join(' · '));
  if (testo) {
    let migliore: VoceSettore | null = null;
    for (const v of serie.voci) {
      if (v.parole && v.parole.test(testo) && (!migliore || v.punteggio > migliore.punteggio)) migliore = v;
    }
    if (migliore) return { voce: migliore, via: 'PAROLE', serie: info };
  }
  return { voce: null, via: null, serie: info };
}

/** Voce del catalogo per codice, nella serie vigente alla data (AR-M21, AI-03: i codici dell'AI si riscontrano qui). */
export function voceSettorePerCodice(codice: string | null | undefined, data: string): { voce: VoceSettore; serie: { da: string; fonte: string } } | null {
  const serie = SETTORI_ESPOSTI.find((s) => data >= s.da && (s.a === null || data <= s.a));
  if (!serie || !codice) return null;
  const voce = serie.voci.find((v) => v.codice === String(codice).trim().toUpperCase());
  return voce ? { voce, serie: { da: serie.da, fonte: serie.fonte } } : null;
}

/** Tutti i settori esposti richiamati da un testo (per l'indicatore «oggetto sociale molto ampio», A10). */
export function settoriRichiamati(testo: string | null | undefined, data: string): VoceSettore[] {
  const serie = SETTORI_ESPOSTI.find((s) => data >= s.da && (s.a === null || data <= s.a));
  const t = normalizza(testo);
  if (!serie || !t) return [];
  return serie.voci.filter((v) => v.parole && v.parole.test(t));
}
