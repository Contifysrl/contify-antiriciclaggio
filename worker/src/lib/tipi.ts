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
}

export interface Utente {
  id: string;
  tenant_id: string;
  email: string;
  nome: string;
  ruolo: 'TITOLARE' | 'COLLABORATORE' | 'LETTORE' | 'REVISORE';
  attivo: number;
  password_hash?: string;
  avatar?: string | null;
  cambio_password_richiesto?: number;
}

export interface Sessione {
  id: string;
  utente_id: string;
  tenant_id: string;
  scade_il: string;
}

export interface Variabili {
  utente: Utente;
  tenantId: string;
  ip: string | null;
}
