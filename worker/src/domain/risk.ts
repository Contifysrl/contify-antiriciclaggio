/**
 * MOTORE DI RISCHIO
 *
 * Funzioni pure, senza dipendenze da runtime, DB o rete: sono interamente
 * testabili e riproducibili. Il motore non conosce nessun numero: pesi, soglie
 * e fattori arrivano dal ruleset (vedi rulesets/cndcec-2025.ts).
 *
 * Due livelli, tenuti volutamente distinti:
 *
 *   1. ARITMETICA DELLE REGOLE TECNICHE — produce una classe di rischio.
 *   2. VINCOLI DI LEGGE — il DLgs. 231/2007 impone in certi casi un livello
 *      minimo di adeguata verifica a prescindere dal punteggio. L'aritmetica
 *      non puo' mai derogare alla norma; puo' solo innalzare.
 *
 * Questa separazione e' anche una scelta difensiva: nel verbale il
 * professionista deve poter mostrare sia il punteggio sia la ragione giuridica
 * per cui il livello e' stato eventualmente innalzato.
 */

import type {
  ClasseRischio,
  CircostanzeNormative,
  EsitoAutovalutazione,
  EsitoProfiloCliente,
  Fattore,
  InputAutovalutazione,
  InputProfiloCliente,
  LivelloVerifica,
  Punteggio,
  Ruleset,
  VincoloNormativo,
} from './types';

// ---------------------------------------------------------------------------
// Utilita' numeriche
// ---------------------------------------------------------------------------

/**
 * Arrotonda a 4 decimali per neutralizzare l'errore di rappresentazione dei
 * float (0,1 + 0,2 !== 0,3). Serve perche' i confronti con le soglie di classe
 * sono su estremi esatti come 1,6 e 2,6: senza normalizzazione un valore
 * calcolato come 2,5999999999999996 finirebbe nella classe sbagliata.
 */
export function arrotonda(n: number, decimali = 4): number {
  const f = Math.pow(10, decimali);
  return Math.round((n + Number.EPSILON) * f) / f;
}

function media(valori: number[]): number {
  if (valori.length === 0) throw new ErroreDominio('Media su insieme vuoto');
  return valori.reduce((a, b) => a + b, 0) / valori.length;
}

export class ErroreDominio extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErroreDominio';
  }
}

/** Verifica che ogni fattore atteso sia presente e valorizzato con un intero 1..4. */
function leggiPunteggi(fattori: Fattore[], input: Record<string, unknown>, etichettaGruppo: string): Punteggio[] {
  return fattori.map((f) => {
    const v = input[f.codice];
    if (v === undefined || v === null) {
      throw new ErroreDominio(`${etichettaGruppo}: manca il punteggio per "${f.etichetta}" (${f.codice})`);
    }
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 4) {
      throw new ErroreDominio(
        `${etichettaGruppo}: punteggio non valido per "${f.etichetta}" (${f.codice}): atteso un intero da 1 a 4, ricevuto ${JSON.stringify(v)}`,
      );
    }
    return v as Punteggio;
  });
}

/**
 * Colloca un valore nella classe di rischio.
 * Intervalli chiusi a sinistra e aperti a destra; l'ultima classe include
 * l'estremo superiore, altrimenti il punteggio massimo 4,0 resterebbe fuori.
 */
export function classificaRischio(valore: number, ruleset: Ruleset): { codice: ClasseRischio; etichetta: string } {
  const v = arrotonda(valore);
  const classi = ruleset.classi;
  for (let i = 0; i < classi.length; i++) {
    const c = classi[i];
    const ultima = i === classi.length - 1;
    if (v >= c.min && (ultima ? v <= c.max : v < c.max)) {
      return { codice: c.codice, etichetta: c.etichetta };
    }
  }
  throw new ErroreDominio(
    `Valore ${v} fuori dalla scala del ruleset "${ruleset.id}" (attesi valori tra ${classi[0].min} e ${classi[classi.length - 1].max})`,
  );
}

// ===========================================================================
// REGOLA TECNICA N. 1 — Autovalutazione del rischio dello studio
// Artt. 15 e 16 del DLgs. 231/2007.
// ===========================================================================

export function calcolaAutovalutazione(input: InputAutovalutazione, ruleset: Ruleset): EsitoAutovalutazione {
  const cfg = ruleset.autovalutazione;

  const puntiInerente = leggiPunteggi(cfg.fattoriInerente, input.inerente ?? {}, 'Rischio inerente');
  const puntiVulnerabilita = leggiPunteggi(cfg.fattoriVulnerabilita, input.vulnerabilita ?? {}, 'Vulnerabilità');

  const rischioInerente = arrotonda(media(puntiInerente));
  const vulnerabilita = arrotonda(media(puntiVulnerabilita));
  const rischioResiduo = arrotonda(rischioInerente * cfg.pesi.inerente + vulnerabilita * cfg.pesi.vulnerabilita);

  const classe = classificaRischio(rischioResiduo, ruleset);

  return {
    rulesetId: ruleset.id,
    rischioInerente,
    vulnerabilita,
    rischioResiduo,
    classe: classe.codice,
    etichettaClasse: classe.etichetta,
    dettaglio: {
      inerente: cfg.fattoriInerente.map((f, i) => ({
        codice: f.codice,
        etichetta: f.etichetta,
        punteggio: puntiInerente[i],
      })),
      vulnerabilita: cfg.fattoriVulnerabilita.map((f, i) => ({
        codice: f.codice,
        etichetta: f.etichetta,
        punteggio: puntiVulnerabilita[i],
      })),
    },
    formula:
      `rischio inerente = (${puntiInerente.join(' + ')}) / ${puntiInerente.length} = ${rischioInerente}; ` +
      `vulnerabilità = (${puntiVulnerabilita.join(' + ')}) / ${puntiVulnerabilita.length} = ${vulnerabilita}; ` +
      `rischio residuo = ${rischioInerente} × ${cfg.pesi.inerente} + ${vulnerabilita} × ${cfg.pesi.vulnerabilita} = ${rischioResiduo}`,
  };
}

// ===========================================================================
// REGOLA TECNICA N. 2 — Profilo di rischio del cliente
// Artt. 17-25 del DLgs. 231/2007.
// ===========================================================================

const ORDINE_LIVELLI: Record<LivelloVerifica, number> = {
  SEMPLIFICATA: 0,
  ORDINARIA: 1,
  RAFFORZATA: 2,
};

function alzaLivello(attuale: LivelloVerifica, minimo: LivelloVerifica): LivelloVerifica {
  return ORDINE_LIVELLI[minimo] > ORDINE_LIVELLI[attuale] ? minimo : attuale;
}

/**
 * Traduce le circostanze di fatto in vincoli giuridici sul livello di verifica.
 * Ogni vincolo porta con se' la norma: e' quanto va stampato nel fascicolo per
 * giustificare lo scostamento dal punteggio calcolato.
 */
export function valutaVincoliNormativi(c: CircostanzeNormative = {}): VincoloNormativo[] {
  const vincoli: VincoloNormativo[] = [];

  // Art. 24 co. 5 lett. c). La deroga per le PEP che agiscono come organi
  // della PA e' espressa nella norma stessa: in quel caso le misure sono
  // commisurate al rischio in concreto, non automaticamente rafforzate.
  if (c.pep && !c.pepOrganoPubblico) {
    vincoli.push({
      codice: 'PEP',
      norma: 'art. 24 co. 5 lett. c) DLgs. 231/2007',
      descrizione:
        'Il cliente o il titolare effettivo è persona politicamente esposta: adeguata verifica rafforzata obbligatoria, ' +
        'con autorizzazione preventiva, accertamento dell’origine del patrimonio e dei fondi e controllo costante rafforzato (art. 25 co. 4).',
      effetto: 'IMPONE_RAFFORZATA',
    });
  }
  if (c.pep && c.pepOrganoPubblico) {
    vincoli.push({
      codice: 'PEP_ORGANO_PA',
      norma: 'art. 24 co. 5 lett. c), secondo periodo, DLgs. 231/2007',
      descrizione:
        'La persona politicamente esposta agisce in veste di organo della pubblica amministrazione: le misure sono commisurate ' +
        'al rischio rilevato in concreto e non scatta l’obbligo automatico di verifica rafforzata. Va motivato nel fascicolo.',
      effetto: 'SEGNALA',
    });
  }
  if (c.exPepRischioElevato) {
    vincoli.push({
      codice: 'EX_PEP',
      norma: 'art. 24 co. 6 DLgs. 231/2007',
      descrizione:
        'Cliente che ha cessato le cariche pubbliche da più di un anno, in presenza di elevato rischio: si applicano comunque ' +
        'misure di adeguata verifica rafforzata.',
      effetto: 'IMPONE_RAFFORZATA',
    });
  }
  if (c.paeseTerzoAltoRischio) {
    vincoli.push({
      codice: 'PAESE_ALTO_RISCHIO',
      norma: 'art. 24 co. 5 lett. a) e art. 25 co. 4-bis DLgs. 231/2007',
      descrizione:
        'La prestazione coinvolge Paesi terzi ad alto rischio: verifica rafforzata obbligatoria con informazioni aggiuntive su scopo, ' +
        'origine dei fondi, situazione economico-patrimoniale e motivazioni delle operazioni, oltre ad autorizzazione preventiva.',
      effetto: 'IMPONE_RAFFORZATA',
    });
  }
  if (c.sospettoRiciclaggio) {
    vincoli.push({
      codice: 'SOSPETTO',
      norma: 'artt. 17 co. 2 lett. a), 23 co. 4 e 35 DLgs. 231/2007',
      descrizione:
        'In presenza di sospetto di riciclaggio o finanziamento del terrorismo l’adeguata verifica è dovuta indipendentemente da ogni ' +
        'deroga, esenzione o soglia; le misure semplificate sono escluse e va valutata la segnalazione alla UIF.',
      effetto: 'VIETA_SEMPLIFICATA',
    });
  }
  if (c.dubbiIdentificazione) {
    vincoli.push({
      codice: 'DUBBI_IDENTIFICAZIONE',
      norma: 'art. 17 co. 2 lett. b) DLgs. 231/2007',
      descrizione:
        'Sussistono dubbi sulla veridicità o sull’adeguatezza dei dati precedentemente ottenuti: l’adeguata verifica va rieseguita in ogni caso.',
      effetto: 'VIETA_SEMPLIFICATA',
    });
  }
  if (c.entitaPaeseAltoRischio) {
    vincoli.push({
      codice: 'ENTITA_PAESE_ALTO_RISCHIO',
      norma: 'art. 42 co. 2 DLgs. 231/2007',
      descrizione:
        'Sono parte del rapporto società fiduciarie, trust, società anonime o controllate attraverso azioni al portatore con sede in Paesi ' +
        'terzi ad alto rischio: obbligo di astensione dall’instaurare il rapporto e di porre fine a quello in essere.',
      effetto: 'IMPONE_ASTENSIONE',
    });
  }
  if (c.impossibilitaVerifica) {
    vincoli.push({
      codice: 'IMPOSSIBILITA_VERIFICA',
      norma: 'art. 42 co. 1 DLgs. 231/2007',
      descrizione:
        'Impossibilità oggettiva di effettuare l’adeguata verifica ex art. 19 co. 1 lett. a), b) e c): il professionista si astiene ' +
        'dall’instaurare, eseguire o proseguire il rapporto e valuta la segnalazione di operazione sospetta.',
      effetto: 'IMPONE_ASTENSIONE',
    });
  }
  if (c.assettoProprietarioComplesso) {
    vincoli.push({
      codice: 'ASSETTO_COMPLESSO',
      norma: 'art. 24 co. 2 lett. a) nn. 3 e 6 DLgs. 231/2007',
      descrizione:
        'Struttura qualificabile come veicolo di interposizione patrimoniale o assetto proprietario anomalo rispetto all’attività svolta: ' +
        'fattore di rischio elevato da considerare nella graduazione delle misure.',
      effetto: 'SEGNALA',
    });
  }
  if (c.elevatoUsoContante) {
    vincoli.push({
      codice: 'USO_CONTANTE',
      norma: 'art. 24 co. 2 lett. a) n. 5 e art. 35 co. 1 DLgs. 231/2007',
      descrizione:
        'Attività economica caratterizzata da elevato utilizzo di contante: fattore di rischio elevato. Il ricorso frequente o ingiustificato ' +
        'al contante, anche sotto la soglia dell’art. 49, costituisce di per sé elemento di sospetto.',
      effetto: 'SEGNALA',
    });
  }
  if (c.esameposizioneGiuridica) {
    vincoli.push({
      codice: 'ESAME_POSIZIONE_GIURIDICA',
      norma: 'artt. 18 co. 4, 35 co. 5 e 42 co. 3 DLgs. 231/2007',
      descrizione:
        'Esame della posizione giuridica del cliente o difesa/rappresentanza in un procedimento giudiziario: fermi gli obblighi di ' +
        'identificazione, il professionista è esonerato dalla verifica dell’identità fino al conferimento dell’incarico, dall’obbligo di ' +
        'astensione e dall’obbligo di segnalazione per le informazioni così acquisite.',
      effetto: 'SEGNALA',
    });
  }

  return vincoli;
}

export function calcolaProfiloCliente(input: InputProfiloCliente, ruleset: Ruleset): EsitoProfiloCliente {
  const cfg = ruleset.adeguataVerifica;
  const p = input.prestazione;
  const circostanze = input.circostanze ?? {};
  const vincoli = valutaVincoliNormativi(circostanze);

  const astensioneDovuta = vincoli.some((v) => v.effetto === 'IMPONE_ASTENSIONE');

  // Art. 17 co. 7: esenzione per mera redazione/trasmissione delle dichiarazioni
  // fiscali e per gli adempimenti di amministrazione del personale (L. 12/1979).
  // L'esenzione cade se c'e' sospetto o se ci sono dubbi identificativi
  // (art. 17 co. 2): in quel caso la verifica e' dovuta "in ogni caso".
  const esenzioneCaduta = Boolean(circostanze.sospettoRiciclaggio || circostanze.dubbiIdentificazione);
  if (p.esenteAdeguataVerifica && !esenzioneCaduta) {
    return {
      rulesetId: ruleset.id,
      esenteAdeguataVerifica: true,
      rischioInerente: p.gradoInerente,
      rischioSpecifico: 0,
      rischioEffettivo: 0,
      classe: 'NON_SIGNIFICATIVO',
      etichettaClasse: 'Non applicabile',
      livelloCalcolato: 'SEMPLIFICATA',
      livelloApplicabile: 'SEMPLIFICATA',
      livelloInnalzatoDaNorma: false,
      vincoli: [
        {
          codice: 'ESENZIONE_ART_17_7',
          norma: 'art. 17 co. 7 DLgs. 231/2007',
          descrizione:
            'Prestazione di mera redazione e trasmissione, o di sola trasmissione, delle dichiarazioni derivanti da obblighi fiscali, ovvero ' +
            'adempimenti in materia di amministrazione del personale ex art. 2 co. 1 della L. 11.1.1979 n. 12: gli obblighi di adeguata verifica ' +
            'non si osservano. L’esenzione riguarda la singola prestazione: se allo stesso cliente sono rese altre prestazioni, per quelle la ' +
            'verifica è dovuta.',
          effetto: 'ESCLUDE_OBBLIGO',
        },
        ...vincoli,
      ],
      astensioneDovuta,
      valutareSos: false,
      tabellaBCompilata: false,
      formula: 'Prestazione esente da adeguata verifica ex art. 17 co. 7 DLgs. 231/2007: nessun punteggio da calcolare.',
      controlloCostanteMesi: 0,
    };
  }

  const puntiA = leggiPunteggi(cfg.tabellaA, input.tabellaA ?? {}, 'Tabella A (cliente)');
  const sommaA = puntiA.reduce((a, b) => a + b, 0);

  // La Tabella B non si compila per le prestazioni che ne sono esonerate
  // (revisione legale, tenuta della contabilità, assistenza continuativa):
  // in quel caso si divide la sola somma della Tabella A per 4.
  const usaTabellaB = !p.esoneroTabellaB;
  let rischioSpecifico: number;
  let formulaSpecifico: string;
  let puntiB: Punteggio[] = [];

  if (usaTabellaB) {
    puntiB = leggiPunteggi(cfg.tabellaB, input.tabellaB ?? {}, 'Tabella B (prestazione)');
    const sommaB = puntiB.reduce((a, b) => a + b, 0);
    const divisore = cfg.tabellaA.length + cfg.tabellaB.length;
    rischioSpecifico = arrotonda((sommaA + sommaB) / divisore);
    formulaSpecifico = `rischio specifico = (ΣA ${sommaA} + ΣB ${sommaB}) / ${divisore} = ${rischioSpecifico}`;
  } else {
    const divisore = cfg.tabellaA.length;
    rischioSpecifico = arrotonda(sommaA / divisore);
    formulaSpecifico =
      `rischio specifico = ΣA ${sommaA} / ${divisore} = ${rischioSpecifico} ` +
      `(Tabella B non compilata: prestazione esonerata dalla Regola tecnica n. 2)`;
  }

  const rischioInerente = p.gradoInerente;
  const rischioEffettivo = arrotonda(rischioInerente * cfg.pesi.inerente + rischioSpecifico * cfg.pesi.specifico);
  const classe = classificaRischio(rischioEffettivo, ruleset);

  const livelloCalcolato = cfg.livelli[classe.codice];
  let livelloApplicabile = livelloCalcolato;

  for (const v of vincoli) {
    if (v.effetto === 'IMPONE_RAFFORZATA') livelloApplicabile = alzaLivello(livelloApplicabile, 'RAFFORZATA');
    if (v.effetto === 'VIETA_SEMPLIFICATA') livelloApplicabile = alzaLivello(livelloApplicabile, 'ORDINARIA');
  }

  return {
    rulesetId: ruleset.id,
    esenteAdeguataVerifica: false,
    rischioInerente,
    rischioSpecifico,
    rischioEffettivo,
    classe: classe.codice,
    etichettaClasse: classe.etichetta,
    livelloCalcolato,
    livelloApplicabile,
    livelloInnalzatoDaNorma: ORDINE_LIVELLI[livelloApplicabile] > ORDINE_LIVELLI[livelloCalcolato],
    vincoli,
    astensioneDovuta,
    valutareSos: Boolean(circostanze.sospettoRiciclaggio) || astensioneDovuta,
    tabellaBCompilata: usaTabellaB,
    formula:
      `rischio inerente (prestazione "${p.descrizione}") = ${rischioInerente}; ` +
      `${formulaSpecifico}; ` +
      `rischio effettivo = ${rischioInerente} × ${cfg.pesi.inerente} + ${rischioSpecifico} × ${cfg.pesi.specifico} = ${rischioEffettivo}`,
    controlloCostanteMesi: ruleset.periodicitaControlloMesi[classe.codice],
  };
}
