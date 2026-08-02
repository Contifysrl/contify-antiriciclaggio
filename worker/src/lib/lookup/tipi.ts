// ── Tipi della compilazione anagrafica da partita IVA (AR-M7) ──
//
// Portato da Assist (M28), senza la fonte IndicePA: i clienti di uno
// studio commercialista sono imprese e persone, non enti pubblici.
// Ogni fonte espone la stessa firma e restituisce lo stesso oggetto:
// aggiungere domani un fornitore a pagamento (visure camerali via API)
// non deve toccare né la rotta né l'interfaccia.

/** Campi che sappiamo proporre. Sempre presenti, `null` se la fonte non li dà. */
export type DatiAnagrafici = {
  ragioneSociale: string | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  provincia: string | null;
  codiceFiscale: string | null;
};

export const DATI_VUOTI: DatiAnagrafici = {
  ragioneSociale: null, indirizzo: null, cap: null, citta: null,
  provincia: null, codiceFiscale: null,
};

export type Fonte = 'VIES';

export type RisultatoFonte = {
  fonte: Fonte;
  /** VIES è da rileggere sempre: affidabilità media. */
  affidabilita: 'alta' | 'media';
  dati: DatiAnagrafici;
  /** Testi già pronti per la UI. */
  avvisi: string[];
};

/**
 * Esito di una singola fonte.
 *  - `trovato`         → dati utilizzabili
 *  - `assente`         → la fonte ha risposto: quella partita IVA non c'è
 *  - `non_disponibile` → la fonte non ha risposto (rete, timeout, servizio giù)
 *
 * La distinzione fra gli ultimi due è la cosa più importante del modulo:
 * dire «partita IVA inesistente» quando è il servizio a essere fermo fa
 * sembrare rotto il programma.
 */
export type EsitoFonte =
  | { stato: 'trovato'; risultato: RisultatoFonte }
  | { stato: 'assente' }
  | { stato: 'non_disponibile' };

/** Risposta dell'endpoint, così come la legge il frontend. */
export type RispostaLookup = {
  esito: 'trovato' | 'non_trovato' | 'partita_iva_non_valida'
       | 'fonte_non_disponibile' | 'limite_raggiunto';
  fonte: Fonte | null;
  affidabilita: 'alta' | 'media' | null;
  dati: DatiAnagrafici;
  avvisi: string[];
};
