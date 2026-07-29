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
 * La soglia del 25% e' quella del co. 2. La partecipazione indiretta si calcola
 * moltiplicando le quote lungo la catena: e' il criterio dominicale. Il
 * software non decide al posto del professionista, propone e chiede conferma.
 */

export type CriterioTitolarita =
  | 'PROPRIETA_DIRETTA' // art. 20 co. 2 lett. a)
  | 'PROPRIETA_INDIRETTA' // art. 20 co. 2 lett. b)
  | 'CONTROLLO' // art. 20 co. 3
  | 'PERSONA_GIURIDICA_PRIVATA' // art. 20 co. 4
  | 'RESIDUALE_POTERI' // art. 20 co. 5
  | 'TRUST' // art. 22 co. 5
  | 'PROCEDURA_CONCORSUALE';

export interface NodoPartecipazione {
  /** Identificativo del soggetto: codice fiscale o chiave interna. */
  id: string;
  denominazione: string;
  tipo: 'PERSONA_FISICA' | 'PERSONA_GIURIDICA';
  /** Partecipazioni detenute DA questo nodo, con la relativa percentuale. */
  partecipazioni?: Array<{ id: string; quota: number }>;
  /** Controllo ex art. 2359 c.c. o vincoli contrattuali che danno influenza dominante. */
  controlloNonDominicale?: boolean;
  /** Poteri di rappresentanza legale, amministrazione o direzione. */
  poteriAmministrazione?: boolean;
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
}

const SOGLIA_PARTECIPAZIONE = 0.25;

/**
 * Percorre la catena partecipativa a partire dal cliente e somma, per ogni
 * persona fisica, il prodotto delle quote lungo ciascun percorso.
 *
 * Il visitato lungo il percorso corrente evita i cicli (partecipazioni
 * incrociate): un anello A→B→A non deve mandare in ricorsione infinita.
 */
function percorriCatena(
  nodi: Map<string, NodoPartecipazione>,
  idCorrente: string,
  quotaAccumulata: number,
  catena: string[],
  accumulatore: Map<string, Array<{ catena: string[]; quota: number }>>,
  visitatiNelPercorso: Set<string>,
  avvertenze: string[],
): void {
  const nodo = nodi.get(idCorrente);
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

  for (const p of nodo.partecipazioni ?? []) {
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
    } else {
      percorriCatena(nodi, p.id, quota, nuovaCatena, accumulatore, prossimiVisitati, avvertenze);
    }
  }
}

export function analizzaTitolaritaEffettiva(
  idCliente: string,
  nodi: NodoPartecipazione[],
  opzioni: {
    personaGiuridicaPrivata?: boolean;
    fondatori?: string[];
    beneficiari?: string[];
    proceduraConcorsuale?: boolean;
  } = {},
): RisultatoAnalisiTitolarita {
  const mappa = new Map(nodi.map((n) => [n.id, n]));
  const cliente = mappa.get(idCliente);
  const avvertenze: string[] = [];

  if (!cliente) {
    return {
      titolari: [],
      criterioApplicato: 'NESSUNO',
      richiedeMotivazioneResiduale: true,
      avvertenze: [`Cliente "${idCliente}" non presente tra i nodi forniti.`],
    };
  }

  // Art. 20 co. 1: se il cliente è persona fisica il tema non si pone.
  if (cliente.tipo === 'PERSONA_FISICA') {
    return {
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
    for (const n of nodi) {
      if (n.poteriAmministrazione && n.tipo === 'PERSONA_FISICA') {
        titolari.push({
          id: n.id,
          denominazione: n.denominazione,
          criterio: 'PERSONA_GIURIDICA_PRIVATA',
          norma: 'art. 20 co. 4 lett. c) DLgs. 231/2007',
          motivazione: 'Titolare di poteri di rappresentanza legale, direzione e amministrazione.',
        });
      }
    }
    return {
      titolari,
      criterioApplicato: 'PERSONA_GIURIDICA_PRIVATA',
      richiedeMotivazioneResiduale: titolari.length === 0,
      avvertenze,
    };
  }

  // Art. 20 co. 2: criterio dominicale, diretto e indiretto.
  const accumulatore = new Map<string, Array<{ catena: string[]; quota: number }>>();
  percorriCatena(mappa, idCliente, 1, [idCliente], accumulatore, new Set(), avvertenze);

  const sopraSoglia: EsitoTitolareEffettivo[] = [];
  for (const [id, percorsi] of accumulatore) {
    const quota = percorsi.reduce((a, p) => a + p.quota, 0);
    if (quota > SOGLIA_PARTECIPAZIONE) {
      const diretto = percorsi.some((p) => p.catena.length === 2);
      const n = mappa.get(id);
      sopraSoglia.push({
        id,
        denominazione: n?.denominazione ?? id,
        criterio: diretto && percorsi.length === 1 ? 'PROPRIETA_DIRETTA' : 'PROPRIETA_INDIRETTA',
        norma: diretto && percorsi.length === 1 ? 'art. 20 co. 2 lett. a) DLgs. 231/2007' : 'art. 20 co. 2 lett. b) DLgs. 231/2007',
        quotaEffettiva: Math.round(quota * 10000) / 10000,
        percorsi: percorsi.map((p) => ({ catena: p.catena, quota: Math.round(p.quota * 10000) / 10000 })),
        motivazione:
          `Titolarità di una partecipazione del ${(quota * 100).toFixed(2)}%, superiore al 25% del capitale, ` +
          (diretto ? 'detenuta direttamente.' : 'detenuta per il tramite di società controllate o interposta persona.'),
      });
    }
  }

  if (sopraSoglia.length > 0) {
    sopraSoglia.sort((a, b) => (b.quotaEffettiva ?? 0) - (a.quotaEffettiva ?? 0));
    return {
      titolari: sopraSoglia,
      criterioApplicato: sopraSoglia[0].criterio,
      richiedeMotivazioneResiduale: false,
      avvertenze,
    };
  }

  // Art. 20 co. 3: controllo non dominicale.
  const perControllo = nodi.filter((n) => n.tipo === 'PERSONA_FISICA' && n.controlloNonDominicale);
  if (perControllo.length > 0) {
    return {
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
      avvertenze,
    };
  }

  // Art. 20 co. 5: criterio residuale. Il co. 6 impone di motivare per iscritto
  // perché non è stato possibile applicare i commi 1-4.
  const perPoteri = nodi.filter((n) => n.tipo === 'PERSONA_FISICA' && n.poteriAmministrazione);
  if (perPoteri.length > 0) {
    avvertenze.push(
      'Applicato il criterio residuale dell’art. 20 co. 5. L’art. 20 co. 6 impone di conservare traccia delle verifiche svolte ' +
        'e delle ragioni che non hanno consentito di individuare il titolare effettivo con i criteri dei commi 1-4.',
    );
    return {
      titolari: perPoteri.map((n) => ({
        id: n.id,
        denominazione: n.denominazione,
        criterio: 'RESIDUALE_POTERI' as const,
        norma: 'art. 20 co. 5 DLgs. 231/2007',
        motivazione:
          'Nessun soggetto individuabile con i criteri dominicali o di controllo: titolare effettivo individuato nella persona fisica ' +
          'titolare di poteri di rappresentanza legale, amministrazione o direzione.',
      })),
      criterioApplicato: 'RESIDUALE_POTERI',
      richiedeMotivazioneResiduale: true,
      avvertenze,
    };
  }

  avvertenze.push(
    'Non è stato possibile individuare alcun titolare effettivo con i dati forniti. Se l’impossibilità è oggettiva e persiste, ' +
      'si applicano l’obbligo di astensione ex art. 42 co. 1 e la valutazione della segnalazione ex art. 35.',
  );
  return { titolari: [], criterioApplicato: 'NESSUNO', richiedeMotivazioneResiduale: true, avvertenze };
}
