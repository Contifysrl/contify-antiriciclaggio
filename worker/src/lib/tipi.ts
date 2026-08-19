export interface Env {
  DB: D1Database;
  DOCS: R2Bucket;
  BACKUPS: R2Bucket;
  ASSETS: Fetcher;
  AMBIENTE: string;
  MASTER_KEY: string;
  RESEND_API_KEY?: string;
  ASSISTENZA_EMAIL?: string;
  MAIL_FROM?: string;
  APP_BASE_URL?: string;
  /** '1' in locale: risposte VIES finte, ripetibili (mai in produzione). */
  VIES_FIXTURES?: string;
  /** '1' in locale: liste sanzioni finte, ripetibili (mai in produzione). */
  SANZIONI_FIXTURES?: string;
  URL_LISTA_UE?: string;
  URL_LISTA_ONU?: string;
  URL_LISTA_OFAC?: string;
  /** Secret: chiave API Anthropic per l'assistente AI (AR-M9). */
  ANTHROPIC_API_KEY?: string;
  /** Modello Claude da usare (default in lib/ai.ts). */
  AI_MODEL?: string;
  /** '1' in locale: risposte AI finte, ripetibili (mai in produzione). */
  AI_FIXTURES?: string;
}

export interface Utente {
  id: string;
  tenant_id: string;
  email: string;
  nome: string;
  ruolo: 'TITOLARE' | 'COLLABORATORE' | 'LETTORE' | 'REVISORE';
  attivo: number;
  /**
   * AR-M15. Il ruolo TITOLARE dice che l'utente è un professionista e può
   * firmare; questo flag dice che amministra lo studio (utenti, licenza,
   * logo, backup, eliminazione dell'archivio). In uno studio associato i
   * due insiemi non coincidono: gli associati firmano, uno solo amministra.
   */
  amministratore?: number;
  /** Dati d'albo, per l'intestazione dei verbali. */
  codice_fiscale?: string | null;
  ordine?: string | null;
  numero_iscrizione?: string | null;
  qualifica?: string | null;
  password_hash?: string;
  avatar?: string | null;
  cambio_password_richiesto?: number;
  tema?: string | null;
  modo_colore?: string | null;
}

export interface Sessione {
  id: string;
  utente_id: string;
  tenant_id: string;
  scade_il: string;
}

export interface Variabili {
  utente: Utente;
  /** Id (hash) della sessione corrente: serve all'elenco dispositivi. */
  sessioneId?: string;
  tenantId: string;
  /** Stato commerciale del tenant (attivo | sospeso | cessato), dalla sessione. */
  tenantStato: string;
  ip: string | null;
}
