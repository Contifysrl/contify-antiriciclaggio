-- 0004 — Ciclo di vita commerciale del tenant (AR-M6)
--
-- Stato contrattuale e scadenza del canone sul tenant, come in Assist:
--   stato: attivo | sospeso (sola lettura) | cessato (accesso chiuso)
-- Lo stato si amministra a database; il blocco è applicato dal Worker
-- (lib/licenza.ts). Nessun CHECK sul valore: un valore imprevisto
-- degrada ad 'attivo' nel codice, mai a un blocco accidentale.
--
-- Il piano commerciale resta UNO SOLO (tutto compreso): la colonna
-- tenants.piano esiste dalla 0001 e non viene usata per gating.

ALTER TABLE tenants ADD COLUMN stato TEXT NOT NULL DEFAULT 'attivo';
ALTER TABLE tenants ADD COLUMN data_attivazione TEXT;
ALTER TABLE tenants ADD COLUMN data_scadenza_canone TEXT;
ALTER TABLE tenants ADD COLUMN note_contratto TEXT;

INSERT INTO d1_migrations (name) VALUES ('0004_ciclo_commerciale.sql');
