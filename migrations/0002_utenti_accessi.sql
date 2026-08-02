-- ---------------------------------------------------------------------------
-- Contify AR — 0002: gestione utenti e accessi (AR-M3)
--
-- - foto profilo (data URL JPEG ~128px, ridimensionata lato browser);
-- - obbligo di cambio password al primo accesso (utenti creati dal titolare
--   o dopo un reset amministrativo);
-- - token monouso per il reset password via email: nel database sta SOLO
--   l'hash SHA-256 del token, il token in chiaro viaggia nel link della mail.
-- ---------------------------------------------------------------------------

ALTER TABLE utenti ADD COLUMN avatar TEXT;
ALTER TABLE utenti ADD COLUMN cambio_password_richiesto INTEGER NOT NULL DEFAULT 0;

CREATE TABLE password_reset_token (
  token_hash TEXT PRIMARY KEY,
  utente_id  TEXT NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  scade_il   TEXT NOT NULL,
  usato_il   TEXT,
  creato_il  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_reset_utente ON password_reset_token(utente_id);

INSERT INTO d1_migrations (name) VALUES ('0002_utenti_accessi.sql');
