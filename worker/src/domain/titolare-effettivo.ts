/**
 * DETERMINAZIONE DELLA TITOLARITÀ EFFETTIVA
 * Art. 20 del DLgs. 21.11.2007 n. 231.
 *
 * La norma detta una cascata di criteri da applicare in ordine, e il co. 6
 * impone di conservare traccia delle verifiche effettuate e, quando si arriva
 * al criterio residuale, delle ragioni che non hanno consentito di individuare
 * il titolare effettivo con i criteri precedenti.
 *
 * Il motore restituisce quindi non solo l'elenco dei titolari effettivi ma
 * anche il criterio applicato e la motivazione: senza quella motivazione il
 * fascicolo non e' conforme al co. 6, ed e' l'errore piu' frequente in sede
 * ispettiva.
 *
 * La soglia del co. 2 NON è più hardcoded (AR-M17): arriva dal ruleset
 * vigente alla data dell'analisi. Oggi «più del 25%»; dal 10.7.2027 il
 * Regolamento (UE) 2024/1624 dice «25% o più» (art. 52). La partecipazione
 * indiretta si calcola moltiplicando le quote lungo la catena: e' il criterio
 * dominicale. Il software non decide al posto del professionista, propone e
 * chiede conferma.
 *
 * Novità AR-M17 (visione «partire al contrario», §4):
 *  - `diritto` sulle partecipazioni: per il co. 2 conta la PROPRIETÀ (piena o
 *    nuda). Usufrutto, pegno, sequestro e pignoramento spostano il voto
 *    (art. 2352 c.c.) e sono materia del co. 3: non contano qui, ma il
 *    risultato li espone perché l'alert A2 li segnali;
 *  - quote proprie (art. 2357-ter c.c.): voto sospeso, escluse dal
 *    denominatore — le percentuali degli altri soci si ricalcolano;
 *  - `cariche` in ingresso: il co. 5 propone nomi veri (amministratori con
 *    poteri di rappresentanza/amministrazione) al posto di un flag manuale.
 */

import type { ParametriTitolarita } from './types';
import { CNDCEC_2025 } from './rulesets/cndcec-2025';
import { AMLR_2027 } from './rulesets/amlr-2027';

export type CriterioTitolarita =
  | 'PROPRIETA_DIRETTA' // art. 20 co. 2 lett. a)
  | 'PROPRIETA_INDIRETTA' // art. 20 co. 2 lett. b)
  | 'CONTROLLO' // art. 20 co. 3
  | 'PERSONA_GIURIDICA_PRIVATA' // art. 20 co. 4
  | 'RESIDUALE_POTERI' // art. 20 co. 5
  | 'TRUST' // art. 22 co. 5
  | 'PROCEDURA_CONCORSUALE';

export type DirittoPartecipazione =
  | 'PROPRIETA'
  | 'NUDA_PROPRIETA'
  | 'USUFRUTTO'
  | 'PEGNO'
  | 'SEQUESTRO'
  | 'PIGNORAMENTO'
  | 'COMPROPRIETA'
  | 'ALTRO';

/** Diritti che attribuiscono la titolarità del capitale ai fini del co. 2. */
export const DIRITTI_PROPRIETARI: ReadonlySet<DirittoPartecipazione> = new Set(['PROPRIETA', 'NUDA_PROPRIETA', 'COMPROPRIETA']);

export interface Partecipazione {
  id: string;
  /** Frazione 0..1 del capitale della partecipata. */
  quota: number;
  /** Default PROPRIETA. */
  diritto?: DirittoPartecipazione;
}

export interface NodoPartecipazione {
  /** Identificativo del soggetto: codice fiscale o chiave interna. */
  id: string;
  denominazione: string;
  tipo: 'PERSONA_FISICA' | 'PERSONA_GIURIDICA';
  /** Partecipazioni detenute DA questo nodo, con la relativa percentuale. */
  partecipazioni?: Partecipazione[];
  /** Controllo ex art. 2359 c.c. o vincoli contrattuali che danno influenza dominante. */
  controlloNonDominicale?: boolean;
  /** Poteri di rappresentanza legale, amministrazione o direzione. */
  poteriAmministrazione?: boolean;
  /** Paese ISO 3166-1 alpha-2 di sede/residenza, se noto. */
  paese?: string;
  /** Società fiduciaria (L. 1966/1939): interposizione, non si risale. */
  fiduciaria?: boolean;
  /** Trust o istituto affine: art. 22 co. 5. */
  trust?: boolean;
}

export type CodiceCarica =
  | 'AMMINISTRATORE_UNICO'
  | 'PRESIDENTE_CDA'
  | 'VICE_PRESIDENTE_CDA'
  | 'CONSIGLIERE_DELEGATO'
  | 'CONSIGLIERE'
  | 'SOCIO_AMMINISTRATORE'
  | 'TITOLARE'
  | 'LIQUIDATORE'
  | 'PROCURATORE'
  | 'INSTITORE'
  | 'SINDACO'
  | 'REVISORE'
  | 'CURATORE'
  | 'ALTRO';

/** Cariche con poteri di rappresentanza, amministrazione o direzione (co. 5). */
export const CARICHE_CON_POTERI: ReadonlySet<CodiceCarica> = new Set([
  'AMMINISTRATORE_UNICO',
  'PRESIDENTE_CDA',
  'CONSIGLIERE_DELEGATO',
  'SOCIO_AMMINISTRATORE',
  'TITOLARE',
  'LIQUIDATORE',
]);

export interface Carica {
  id: string;
  nome: string;
  carica: CodiceCarica;
  /** «Rappresentante dell'impresa» in visura. */
  rappresentanzaLegale?: boolean;
  /** Il consigliere semplice senza deleghe non ha poteri di gestione: con questo flag si può forzare. */
  poteri?: boolean;
}

export interface EsitoTitolareEffettivo {
  id: string;
  denominazione: string;
  criterio: CriterioTitolarita;
  norma: string;
  /** Quota complessiva, sommando tutti i percorsi della catena. Assente per i criteri non dominicali. */
  quotaEffettiva?: number;
  /** Catene di partecipazione che portano a questa persona fisica. */
  percorsi?: Array<{ catena: string[]; quota: number }>;
  motivazione: string;
}

export interface RisultatoAnalisiTitolarita {
  titolari: EsitoTitolareEffettivo[];
  criterioApplicato: CriterioTitolarita | 'NESSUNO';
  /**
   * Vero quando si e' dovuto ricorrere al criterio residuale del co. 5.
   * In quel caso il co. 6 impone di motivare per iscritto.
   */
  richiedeMotivazioneResiduale: boolean;
  avvertenze: string[];
  /** Parametri applicati (soglia, norma): finiscono in motivazione e verbale. */
  parametri: ParametriTitolarita & { rulesetId: string };
  /**
   * Quote effettive di TUTTE le persone fisiche raggiunte, anche sotto soglia:
   * servono agli alert (A1: nessuno sopra soglia; 50/50) e alla
   * dichiarazione art. 22 precompilata.
   */
  quotePersoneFisiche: Array<{ id: string; denominazione: string; quota: number }>;
  /**
   * Persone giuridiche raggiunte nella catena di cui NON si conosce la compagine
   * (non clienti dello studio, nessun socio descritto): finché ci sono, il
   * criterio della proprietà è incompleto, non fallito. Servono agli alert (A4).
   */
  nodiIrrisolti: Array<{ id: string; denominazione: string; quotaEffettiva: number; tramite: string }>;
  /** Vincoli sulle quote incontrati lungo la catena (usufrutto, pegno…): materia del co. 3. */
  vincoliSulleQuote: Array<{ soggettoId: string; denominazione: string; partecipataId: string; diritto: DirittoPartecipazione; quota: number }>;
  /** Quote proprie escluse dal denominatore, per partecipata. */
  quoteProprie: Array<{ partecipataId: string; quota: number }>;
}

/** Ruleset vigente per la titolarità effettiva alla data indicata (ISO). */
export function parametriTitolarita(dataIso?: string): ParametriTitolarita & { rulesetId: string } {
  const data = dataIso ?? new Date().toISOString().slice(0, 10);
  const r = data >= AMLR_2027.vigenzaDa ? AMLR_2027 : CNDCEC_2025;
  return { ...r.titolaritaEffettiva, rulesetId: r.id };
}

function superaSoglia(quota: number, p: ParametriTitolarita): boolean {
  // Arrotondamento a 4 decimali prima del confronto: 0.25 calcolato come
  // 25.000/100.000 deve restare 0.25, non 0.24999999.
  const q = Math.round(quota * 10000) / 10000;
  return p.sogliaInclusiva ? q >= p.sogliaPartecipazione : q > p.sogliaPartecipazione;
}

/**
 * Partecipazioni «proprietarie» di un nodo, con le quote proprie tolte dal
 * denominatore (art. 2357-ter c.c.: il voto sulle quote proprie è sospeso,
 * quindi le percentuali degli altri soci vanno ricalcolate sul capitale
 * residuo). Le partecipazioni con diritto non proprietario non entrano nel
 * calcolo del co. 2 ma vengono restituite a parte per gli alert.
 */
function partecipazioniRilevanti(
  nodo: NodoPartecipazione,
  risultato: Pick<RisultatoAnalisiTitolarita, 'vincoliSulleQuote' | 'quoteProprie' | 'avvertenze'>,
  nodi: Map<string, NodoPartecipazione>,
): Partecipazione[] {
  const tutte = nodo.partecipazioni ?? [];
  const proprie = tutte.filter((p) => p.id === nodo.id).reduce((a, p) => a + p.quota, 0);
  const proprietarie = tutte.filter((p) => p.id !== nodo.id && DIRITTI_PROPRIETARI.has(p.diritto ?? 'PROPRIETA'));
  for (const p of tutte) {
    if (p.id === nodo.id) continue;
    if (!DIRITTI_PROPRIETARI.has(p.diritto ?? 'PROPRIETA')) {
      risultato.vincoliSulleQuote.push({
        soggettoId: p.id,
        denominazione: nodi.get(p.id)?.denominazione ?? p.id,
        partecipataId: nodo.id,
        diritto: p.diritto ?? 'ALTRO',
        quota: p.quota,
      });
    }
  }
  if (proprie > 0 && proprie < 1) {
    risultato.quoteProprie.push({ partecipataId: nodo.id, quota: proprie });
    risultato.avvertenze.push(
      `${nodo.denominazione} detiene quote proprie per il ${(proprie * 100).toFixed(2)}%: il voto è sospeso (art. 2357-ter c.c.) ` +
        'e le percentuali degli altri soci sono state ricalcolate sul capitale residuo.',
    );
    return proprietarie.map((p) => ({ ...p, quota: p.quota / (1 - proprie) }));
  }
  return proprietarie;
}

/**
 * Percorre la catena partecipativa a partire dal cliente e somma, per ogni
 * persona fisica, il prodotto delle quote lungo ciascun percorso.
 *
 * Il visitato lungo il percorso corrente evita i cicli (partecipazioni
 * incrociate): un anello A→B→A non deve mandare in ricorsione infinita.
 * Fiduciarie e trust NON si risalgono: sono interposizione (art. 20 co. 2
 * lett. b) e il fiduciante/il trust si trattano a parte (alert A6).
 */
function percorriCatena(
  nodi: Map<string, NodoPartecipazione>,
  idCorrente: string,
  quotaAccumulata: number,
  catena: string[],
  accumulatore: Map<string, Array<{ catena: string[]; quota: number }>>,
  visitatiNelPercorso: Set<string>,
  risultato: Pick<RisultatoAnalisiTitolarita, 'vincoliSulleQuote' | 'quoteProprie' | 'avvertenze' | 'nodiIrrisolti'>,
): void {
  const nodo = nodi.get(idCorrente);
  const avvertenze = risultato.avvertenze;
  if (!nodo) {
    avvertenze.push(`Soggetto "${idCorrente}" citato nella catena ma non presente tra i nodi: catena incompleta.`);
    return;
  }
  if (visitatiNelPercorso.has(idCorrente)) {
    avvertenze.push(
      `Rilevata partecipazione incrociata su "${nodo.denominazione}": il percorso è stato interrotto. ` +
        `Gli assetti circolari vanno valutati manualmente e sono di per sé un fattore di rischio (art. 24 co. 2 lett. a) n. 6).`,
    );
    return;
  }

  const prossimiVisitati = new Set(visitatiNelPercorso);
  prossimiVisitati.add(idCorrente);

  for (const p of partecipazioniRilevanti(nodo, risultato, nodi)) {
    const figlio = nodi.get(p.id);
    const quota = quotaAccumulata * p.quota;
    const nuovaCatena = [...catena, p.id];
    if (!figlio) {
      avvertenze.push(`Partecipante "${p.id}" non descritto: impossibile risalire oltre.`);
      continue;
    }
    if (figlio.tipo === 'PERSONA_FISICA') {
      const esistenti = accumulatore.get(p.id) ?? [];
      esistenti.push({ catena: nuovaCatena, quota });
      accumulatore.set(p.id, esistenti);
    } else if (figlio.fiduciaria || figlio.trust) {
      avvertenze.push(
        figlio.trust
          ? `"${figlio.denominazione}" è un trust: per la quota del ${(quota * 100).toFixed(2)}% si applica l'art. 22 co. 5 (costituente, trustee, guardiano, beneficiari).`
          : `"${figlio.denominazione}" è una società fiduciaria: interposizione ex art. 20 co. 2 lett. b). Il titolare effettivo della quota del ${(quota * 100).toFixed(2)}% è il fiduciante, da acquisire per iscritto.`,
      );
    } else if (!figlio.partecipazioni?.length && !figlio.controlloNonDominicale) {
      // Società di cui non si conosce la compagine: la catena si ferma qui,
      // e questo NON significa che nessuno superi la soglia. Si segnala.
      risultato.nodiIrrisolti.push({ id: figlio.id, denominazione: figlio.denominazione, quotaEffettiva: quota, tramite: nodo.denominazione });
      avvertenze.push(
        `"${figlio.denominazione}" (${(quota * 100).toFixed(2)}% tramite ${nodo.denominazione}) è una società di cui non si conosce la compagine: catena incompleta, serve la sua visura.`,
      );
    } else {
      percorriCatena(nodi, p.id, quota, nuovaCatena, accumulatore, prossimiVisitati, risultato);
    }
  }
}

export interface OpzioniAnalisi {
  personaGiuridicaPrivata?: boolean;
  fondatori?: string[];
  beneficiari?: string[];
  proceduraConcorsuale?: boolean;
  /** Cariche in visura: candidati per il criterio residuale (co. 5). */
  cariche?: Carica[];
  /** Data dell'analisi (ISO): sceglie il ruleset. Default oggi. */
  data?: string;
}

export function analizzaTitolaritaEffettiva(
  idCliente: string,
  nodi: NodoPartecipazione[],
  opzioni: OpzioniAnalisi = {},
): RisultatoAnalisiTitolarita {
  const mappa = new Map(nodi.map((n) => [n.id, n]));
  const cliente = mappa.get(idCliente);
  const parametri = parametriTitolarita(opzioni.data);
  const base = {
    avvertenze: [] as string[],
    parametri,
    quotePersoneFisiche: [] as RisultatoAnalisiTitolarita['quotePersoneFisiche'],
    vincoliSulleQuote: [] as RisultatoAnalisiTitolarita['vincoliSulleQuote'],
    quoteProprie: [] as RisultatoAnalisiTitolarita['quoteProprie'],
    nodiIrrisolti: [] as RisultatoAnalisiTitolarita['nodiIrrisolti'],
  };
  const avvertenze = base.avvertenze;

  if (!cliente) {
    return {
      ...base,
      titolari: [],
      criterioApplicato: 'NESSUNO',
      richiedeMotivazioneResiduale: true,
      avvertenze: [`Cliente "${idCliente}" non presente tra i nodi forniti.`],
    };
  }

  // Art. 20 co. 1: se il cliente è persona fisica il tema non si pone.
  if (cliente.tipo === 'PERSONA_FISICA') {
    return {
      ...base,
      titolari: [
        {
          id: cliente.id,
          denominazione: cliente.denominazione,
          criterio: 'PROPRIETA_DIRETTA',
          norma: 'art. 20 co. 1 DLgs. 231/2007',
          quotaEffettiva: 1,
          motivazione: 'Cliente persona fisica: coincide con il titolare effettivo salvo che agisca per conto di terzi.',
        },
      ],
      criterioApplicato: 'PROPRIETA_DIRETTA',
      richiedeMotivazioneResiduale: false,
      avvertenze: [
        'Verificare che il cliente non stia agendo per conto di un terzo: in tal caso il titolare effettivo è il terzo.',
      ],
    };
  }

  // Art. 20 co. 4: persone giuridiche private ex DPR 361/2000.
  // I titolari effettivi sono individuati CUMULATIVAMENTE, non in cascata.
  if (opzioni.personaGiuridicaPrivata) {
    const titolari: EsitoTitolareEffettivo[] = [];
    for (const id of opzioni.fondatori ?? []) {
      const n = mappa.get(id);
      titolari.push({
        id,
        denominazione: n?.denominazione ?? id,
        criterio: 'PERSONA_GIURIDICA_PRIVATA',
        norma: 'art. 20 co. 4 lett. a) DLgs. 231/2007',
        motivazione: 'Fondatore in vita.',
      });
    }
    for (const id of opzioni.beneficiari ?? []) {
      const n = mappa.get(id);
      titolari.push({
        id,
        denominazione: n?.denominazione ?? id,
        criterio: 'PERSONA_GIURIDICA_PRIVATA',
        norma: 'art. 20 co. 4 lett. b) DLgs. 231/2007',
        motivazione: 'Beneficiario individuato o facilmente individuabile.',
      });
    }
    for (const n of candidatiConPoteri(nodi, opzioni.cariche)) {
      titolari.push({
        id: n.id,
        denominazione: n.denominazione,
        criterio: 'PERSONA_GIURIDICA_PRIVATA',
        norma: 'art. 20 co. 4 lett. c) DLgs. 231/2007',
        motivazione: 'Titolare di poteri di rappresentanza legale, direzione e amministrazione.',
      });
    }
    return {
      ...base,
      titolari,
      criterioApplicato: 'PERSONA_GIURIDICA_PRIVATA',
      richiedeMotivazioneResiduale: titolari.length === 0,
    };
  }

  // Art. 20 co. 2: criterio dominicale, diretto e indiretto.
  const accumulatore = new Map<string, Array<{ catena: string[]; quota: number }>>();
  percorriCatena(mappa, idCliente, 1, [idCliente], accumulatore, new Set(), base);

  const sopraSoglia: EsitoTitolareEffettivo[] = [];
  for (const [id, percorsi] of accumulatore) {
    const quota = percorsi.reduce((a, p) => a + p.quota, 0);
    const n = mappa.get(id);
    base.quotePersoneFisiche.push({ id, denominazione: n?.denominazione ?? id, quota: Math.round(quota * 10000) / 10000 });
    if (superaSoglia(quota, parametri)) {
      const diretto = percorsi.some((p) => p.catena.length === 2);
      sopraSoglia.push({
        id,
        denominazione: n?.denominazione ?? id,
        criterio: diretto && percorsi.length === 1 ? 'PROPRIETA_DIRETTA' : 'PROPRIETA_INDIRETTA',
        norma: diretto && percorsi.length === 1 ? `${parametri.norma.replace('co. 2', 'co. 2 lett. a)')}` : `${parametri.norma.replace('co. 2', 'co. 2 lett. b)')}`,
        quotaEffettiva: Math.round(quota * 10000) / 10000,
        percorsi: percorsi.map((p) => ({ catena: p.catena, quota: Math.round(p.quota * 10000) / 10000 })),
        motivazione:
          `Titolarità di una partecipazione del ${(quota * 100).toFixed(2)}%, ${parametri.etichettaSoglia} del capitale, ` +
          (diretto ? 'detenuta direttamente.' : 'detenuta per il tramite di società controllate o interposta persona.'),
      });
    }
  }
  base.quotePersoneFisiche.sort((a, b) => b.quota - a.quota);

  // -------------------------------------------------------------------------
  // AR-M20-04 — Regolamento (UE) 2024/1624 (dal 10.7.2027): proprietà e
  // controllo in PARALLELO (art. 51), art. 54 nelle strutture a più livelli.
  // Gated dal ruleset: prima di quella data non cambia nulla.
  // -------------------------------------------------------------------------
  if (parametri.regime === 'PARALLELO_AMLR') {
    const esito = titolaritaParallelaAmlr(mappa, cliente, sopraSoglia, parametri, base, opzioni);
    if (esito) return esito;
  }

  if (sopraSoglia.length > 0) {
    sopraSoglia.sort((a, b) => (b.quotaEffettiva ?? 0) - (a.quotaEffettiva ?? 0));
    return {
      ...base,
      titolari: sopraSoglia,
      criterioApplicato: sopraSoglia[0].criterio,
      richiedeMotivazioneResiduale: false,
    };
  }

  if (accumulatore.size > 0 || (cliente.partecipazioni?.length ?? 0) > 0) {
    avvertenze.push(
      `Nessuna persona fisica detiene una partecipazione ${parametri.etichettaSoglia} (${parametri.norma}): il criterio della proprietà non individua titolari effettivi.`,
    );
  }

  // Catena incompleta ≠ criterio della proprietà fallito: finché una società
  // della catena non ha compagine nota, passare al controllo o al residuale
  // sarebbe dire «nessuno supera la soglia» senza averlo verificato. Ci si
  // ferma e si chiede la visura mancante (alert A4).
  if (base.nodiIrrisolti.length > 0) {
    avvertenze.push(
      `Catena partecipativa incompleta (${base.nodiIrrisolti.map((n) => n.denominazione).join(', ')}): i criteri dei commi 3 e 5 si applicano solo dopo aver risalito tutte le società della catena.`,
    );
    return { ...base, titolari: [], criterioApplicato: 'NESSUNO', richiedeMotivazioneResiduale: false };
  }

  // Art. 20 co. 3: controllo non dominicale.
  const perControllo = nodi.filter((n) => n.tipo === 'PERSONA_FISICA' && n.controlloNonDominicale);
  if (perControllo.length > 0) {
    return {
      ...base,
      titolari: perControllo.map((n) => ({
        id: n.id,
        denominazione: n.denominazione,
        criterio: 'CONTROLLO' as const,
        norma: 'art. 20 co. 3 DLgs. 231/2007',
        motivazione:
          'Controllo della maggioranza dei voti in assemblea ordinaria, voti sufficienti a esercitare influenza dominante ' +
          'o particolari vincoli contrattuali che consentono influenza dominante.',
      })),
      criterioApplicato: 'CONTROLLO',
      richiedeMotivazioneResiduale: false,
    };
  }

  // Art. 20 co. 5: criterio residuale. Il co. 6 impone di motivare per iscritto
  // perché non è stato possibile applicare i commi 1-4.
  const perPoteri = candidatiConPoteri(nodi, opzioni.cariche);
  if (perPoteri.length > 0) {
    avvertenze.push(
      'Applicato il criterio residuale dell’art. 20 co. 5. L’art. 20 co. 6 impone di conservare traccia delle verifiche svolte ' +
        'e delle ragioni che non hanno consentito di individuare il titolare effettivo con i criteri dei commi 1-4.',
    );
    return {
      ...base,
      titolari: perPoteri.map((n) => ({
        id: n.id,
        denominazione: n.denominazione,
        criterio: 'RESIDUALE_POTERI' as const,
        norma: 'art. 20 co. 5 DLgs. 231/2007',
        motivazione:
          'Nessun soggetto individuabile con i criteri dominicali o di controllo: titolare effettivo individuato nella persona fisica ' +
          `titolare di poteri di rappresentanza legale, amministrazione o direzione${n.caricaTesto ? ` (${n.caricaTesto})` : ''}.`,
      })),
      criterioApplicato: 'RESIDUALE_POTERI',
      richiedeMotivazioneResiduale: true,
    };
  }

  avvertenze.push(
    'Non è stato possibile individuare alcun titolare effettivo con i dati forniti. Se l’impossibilità è oggettiva e persiste, ' +
      'si applicano l’obbligo di astensione ex art. 42 co. 1 e la valutazione della segnalazione ex art. 35.',
  );
  return { ...base, titolari: [], criterioApplicato: 'NESSUNO', richiedeMotivazioneResiduale: true };
}

/**
 * Art. 51-54 Reg. (UE) 2024/1624 (AR-M20-04). Restituisce il risultato
 * completo, oppure null se non c'è nulla da aggiungere al criterio della
 * proprietà (nel qual caso il flusso ordinario prosegue con la stessa
 * soglia inclusiva già letta dal ruleset).
 *
 * Il controllo tramite partecipazione è «50% più uno» (art. 53 par. 2 lett.
 * c): una persona fisica controlla una società se ne detiene direttamente
 * più della metà, o se controlla una società che ne detiene più della metà
 * (catena di maggioranze, art. 53 par. 2 lett. b). Art. 54:
 *  (a) chi controlla un'entità che ha una quota diretta rilevante (≥ 25%)
 *      nel cliente è titolare effettivo, anche se moltiplicando le quote
 *      resterebbe sotto soglia (es. 51% di una holding al 30%: 15,3% per
 *      l'art. 52, ma titolare per l'art. 54);
 *  (b) chi ha una quota rilevante (≥ 25%, diretta o indiretta) nell'entità
 *      che controlla il cliente (> 50%) è titolare effettivo.
 * Il controllo «via other means» (art. 53 par. 3-4: flag controlloNonDominicale)
 * si aggiunge sempre, indipendentemente dalla proprietà (art. 51 co. 2).
 */
function titolaritaParallelaAmlr(
  nodi: Map<string, NodoPartecipazione>,
  cliente: NodoPartecipazione,
  perProprieta: EsitoTitolareEffettivo[],
  parametri: ParametriTitolarita & { rulesetId: string },
  base: Pick<RisultatoAnalisiTitolarita, 'avvertenze' | 'quotePersoneFisiche' | 'vincoliSulleQuote' | 'quoteProprie' | 'nodiIrrisolti' | 'parametri'>,
  opzioni: OpzioniAnalisi,
): RisultatoAnalisiTitolarita | null {
  const sogliaControllo = parametri.sogliaControllo ?? 0.5;
  const normaControllo = parametri.normaControllo ?? 'artt. 51-54 Reg. (UE) 2024/1624';
  const controlla = (quota: number) => Math.round(quota * 10000) / 10000 > sogliaControllo;
  const risolta = (n: NodoPartecipazione) => n.tipo === 'PERSONA_GIURIDICA' && !n.fiduciaria && !n.trust && (n.partecipazioni?.length ?? 0) > 0;

  // Partecipazioni proprietarie di un nodo, con le quote proprie tolte dal
  // denominatore: stesso calcolo di partecipazioniRilevanti, senza effetti.
  const partecipazioniDi = (n: NodoPartecipazione): Partecipazione[] => {
    const tutte = n.partecipazioni ?? [];
    const proprie = tutte.filter((p) => p.id === n.id).reduce((a, p) => a + p.quota, 0);
    const prop = tutte.filter((p) => p.id !== n.id && DIRITTI_PROPRIETARI.has(p.diritto ?? 'PROPRIETA'));
    return proprie > 0 && proprie < 1 ? prop.map((p) => ({ ...p, quota: p.quota / (1 - proprie) })) : prop;
  };

  // Persone fisiche che controllano una società (catena di maggioranze).
  const controllantiDi = (pgId: string, visitati: Set<string>): Array<{ id: string; via: string[] }> => {
    const n = nodi.get(pgId);
    if (!n || visitati.has(pgId)) return [];
    const v = new Set(visitati); v.add(pgId);
    const out: Array<{ id: string; via: string[] }> = [];
    for (const p of partecipazioniDi(n)) {
      if (!controlla(p.quota)) continue;
      const socio = nodi.get(p.id);
      if (!socio) continue;
      if (socio.tipo === 'PERSONA_FISICA') out.push({ id: p.id, via: [pgId] });
      else if (risolta(socio)) for (const c of controllantiDi(p.id, v)) out.push({ id: c.id, via: [pgId, ...c.via] });
    }
    return out;
  };

  const aggiunti = new Map<string, EsitoTitolareEffettivo>();
  const nome = (id: string) => nodi.get(id)?.denominazione ?? id;
  const pct = (q: number) => `${(q * 100).toFixed(2)}%`;
  const aggiungi = (id: string, motivazione: string, norma: string) => {
    if (perProprieta.some((t) => t.id === id)) {
      // Già titolare per proprietà: la nota sul controllo arricchisce la motivazione.
      const t = perProprieta.find((x) => x.id === id)!;
      if (!t.motivazione.includes(motivazione)) t.motivazione += ` ${motivazione}`;
      return;
    }
    const cur = aggiunti.get(id);
    if (cur) { if (!cur.motivazione.includes(motivazione)) cur.motivazione += ` ${motivazione}`; return; }
    aggiunti.set(id, { id, denominazione: nome(id), criterio: 'CONTROLLO', norma, motivazione });
  };

  const dirette = partecipazioniDi(cliente);
  for (const p of dirette) {
    const socio = nodi.get(p.id);
    if (!socio || socio.tipo !== 'PERSONA_GIURIDICA' || !risolta(socio)) continue;
    // Art. 54 lett. a): controlla un'entità con quota diretta rilevante nel cliente.
    if (superaSoglia(p.quota, parametri)) {
      for (const c of controllantiDi(p.id, new Set([cliente.id]))) {
        aggiungi(c.id,
          `Controlla ${c.via.map(nome).join(' → ')} (oltre il ${pct(sogliaControllo)} lungo la catena), che detiene direttamente il ${pct(p.quota)} del cliente: titolare effettivo ai sensi dell'art. 54 lett. a) Reg. (UE) 2024/1624, a prescindere dal prodotto delle quote.`,
          `${normaControllo} — art. 54 lett. a)`);
      }
    }
    // Art. 54 lett. b): quota rilevante nell'entità che controlla il cliente (anche a catena).
    if (controlla(p.quota)) {
      const controllanti: string[] = [p.id];
      // Chi controlla la controllante controlla, a sua volta, il cliente (art. 53 par. 2 lett. b).
      const visitati = new Set([cliente.id, p.id]);
      let frontiera = [p.id];
      while (frontiera.length) {
        const prossima: string[] = [];
        for (const id of frontiera) {
          const n = nodi.get(id)!;
          for (const q of partecipazioniDi(n)) {
            const soc = nodi.get(q.id);
            if (soc && soc.tipo === 'PERSONA_GIURIDICA' && risolta(soc) && controlla(q.quota) && !visitati.has(q.id)) { visitati.add(q.id); controllanti.push(q.id); prossima.push(q.id); }
          }
        }
        frontiera = prossima;
      }
      for (const cId of controllanti) {
        const acc = new Map<string, Array<{ catena: string[]; quota: number }>>();
        const scarto = { avvertenze: [] as string[], vincoliSulleQuote: [] as RisultatoAnalisiTitolarita['vincoliSulleQuote'], quoteProprie: [] as RisultatoAnalisiTitolarita['quoteProprie'], nodiIrrisolti: [] as RisultatoAnalisiTitolarita['nodiIrrisolti'] };
        percorriCatena(nodi, cId, 1, [cId], acc, new Set([cliente.id]), scarto);
        for (const [pfId, percorsi] of acc) {
          const quota = percorsi.reduce((a, x) => a + x.quota, 0);
          if (!superaSoglia(quota, parametri)) continue;
          aggiungi(pfId,
            `Detiene il ${pct(quota)} di ${nome(cId)}, che controlla il cliente (oltre il ${pct(sogliaControllo)}${cId === p.id ? ` con il ${pct(p.quota)} diretto` : ', a catena'}): titolare effettivo ai sensi dell'art. 54 lett. b) Reg. (UE) 2024/1624.`,
            `${normaControllo} — art. 54 lett. b)`);
        }
      }
    }
  }

  // Art. 51 co. 2 e 53 par. 3-4: controllo «via other means», in parallelo.
  for (const n of nodi.values()) {
    if (n.tipo === 'PERSONA_FISICA' && n.controlloNonDominicale) {
      aggiungi(n.id, 'Controlla il cliente con altri mezzi (maggioranza dei voti, nomina della maggioranza degli amministratori, diritti di veto o di decisione, accordi, rapporti familiari, nominee): art. 53 par. 3-4 Reg. (UE) 2024/1624, individuato indipendentemente dalla proprietà (art. 51).', `${normaControllo} — art. 53 par. 3-4`);
    }
  }

  const titolari = [...perProprieta.sort((a, b) => (b.quotaEffettiva ?? 0) - (a.quotaEffettiva ?? 0)), ...aggiunti.values()];
  if (titolari.length > 0) {
    if (aggiunti.size) base.avvertenze.push('Regolamento (UE) 2024/1624: proprietà e controllo individuati in parallelo (art. 51); nelle strutture a più livelli si applica l’art. 54.');
    return {
      ...base,
      titolari,
      criterioApplicato: perProprieta.length ? perProprieta[0].criterio : 'CONTROLLO',
      richiedeMotivazioneResiduale: false,
    };
  }

  // Nulla per proprietà né per controllo. Catena incompleta → ci si ferma (come nel regime 2025).
  if (base.nodiIrrisolti.length > 0) {
    base.avvertenze.push(
      `Catena partecipativa incompleta (${base.nodiIrrisolti.map((n) => n.denominazione).join(', ')}): l'art. 52 par. 1 impone di considerare tutte le partecipazioni a ogni livello prima di concludere.`,
    );
    return { ...base, titolari: [], criterioApplicato: 'NESSUNO', richiedeMotivazioneResiduale: false };
  }
  const perPoteri = candidatiConPoteri([...nodi.values()], opzioni.cariche);
  const normaRes = parametri.normaResiduale ?? 'art. 63 par. 4 Reg. (UE) 2024/1624';
  if (perPoteri.length > 0) {
    base.avvertenze.push(
      `Nessun titolare effettivo per proprietà (art. 52) né per controllo (artt. 53-54): si indicano i dirigenti di livello superiore (${normaRes}), con motivazione scritta delle verifiche svolte.`,
    );
    return {
      ...base,
      titolari: perPoteri.map((n) => ({
        id: n.id, denominazione: n.denominazione, criterio: 'RESIDUALE_POTERI' as const, norma: normaRes,
        motivazione: `Nessuna persona fisica individuata per proprietà o controllo: dirigente di livello superiore${n.caricaTesto ? ` (${n.caricaTesto})` : ''}.`,
      })),
      criterioApplicato: 'RESIDUALE_POTERI',
      richiedeMotivazioneResiduale: true,
    };
  }
  base.avvertenze.push('Non è stato possibile individuare alcun titolare effettivo con i dati forniti (Reg. (UE) 2024/1624, artt. 51-54 e 63).');
  return { ...base, titolari: [], criterioApplicato: 'NESSUNO', richiedeMotivazioneResiduale: true };
}

/**
 * Persone fisiche con poteri di rappresentanza, amministrazione o direzione:
 * dai nodi con flag manuale e dalle cariche in visura. Le cariche prevalgono
 * sul flag quando descrivono la stessa persona (stesso id).
 */
function candidatiConPoteri(
  nodi: NodoPartecipazione[],
  cariche: Carica[] | undefined,
): Array<{ id: string; denominazione: string; caricaTesto?: string }> {
  const out = new Map<string, { id: string; denominazione: string; caricaTesto?: string }>();
  for (const c of cariche ?? []) {
    const conPoteri = c.poteri ?? (CARICHE_CON_POTERI.has(c.carica) || Boolean(c.rappresentanzaLegale));
    if (!conPoteri) continue;
    out.set(c.id, { id: c.id, denominazione: c.nome, caricaTesto: etichettaCarica(c.carica) + (c.rappresentanzaLegale ? ', rappresentante legale' : '') });
  }
  for (const n of nodi) {
    if (n.tipo === 'PERSONA_FISICA' && n.poteriAmministrazione && !out.has(n.id)) {
      out.set(n.id, { id: n.id, denominazione: n.denominazione });
    }
  }
  return [...out.values()];
}

export function etichettaCarica(c: CodiceCarica): string {
  const e: Record<CodiceCarica, string> = {
    AMMINISTRATORE_UNICO: 'amministratore unico',
    PRESIDENTE_CDA: 'presidente del consiglio di amministrazione',
    VICE_PRESIDENTE_CDA: 'vice presidente del consiglio di amministrazione',
    CONSIGLIERE_DELEGATO: 'amministratore delegato',
    CONSIGLIERE: 'consigliere',
    SOCIO_AMMINISTRATORE: 'socio amministratore',
    TITOLARE: 'titolare',
    LIQUIDATORE: 'liquidatore',
    PROCURATORE: 'procuratore',
    INSTITORE: 'institore',
    SINDACO: 'sindaco',
    REVISORE: 'revisore',
    CURATORE: 'curatore',
    ALTRO: 'altra carica',
  };
  return e[c] ?? c;
}
