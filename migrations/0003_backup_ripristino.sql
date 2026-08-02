-- 0003 — Backup e ripristino self-service (AR-M4)
--
-- Flag di manutenzione per tenant. Serve a UNA cosa sola: permettere a
-- ripristino ed eliminazione archivio (operazioni del titolare, con
-- backup preventivo obbligatorio su R2) di rimuovere righe di
-- `documenti` altrimenti protette dal termine decennale di
-- conservazione. Per qualsiasi DELETE ordinario la protezione
-- dell'art. 31 resta identica a prima: il flag è normalmente a 0 e
-- viene alzato solo per la durata dell'operazione, dal codice che
-- ha appena scritto la fotografia di sicurezza.

CREATE TABLE manutenzione_flag (
  tenant_id    TEXT PRIMARY KEY REFERENCES tenants(id),
  attiva       INTEGER NOT NULL DEFAULT 0,
  impostata_il TEXT
);

DROP TRIGGER trg_documenti_no_delete;

-- Identico all'originale, più la clausola sul flag di manutenzione.
CREATE TRIGGER trg_documenti_no_delete
BEFORE DELETE ON documenti
FOR EACH ROW WHEN OLD.conserva_fino_al IS NOT NULL AND OLD.conserva_fino_al > date('now')
  AND NOT EXISTS (SELECT 1 FROM manutenzione_flag WHERE tenant_id = OLD.tenant_id AND attiva = 1)
BEGIN
  SELECT RAISE(ABORT, 'Documento in conservazione obbligatoria fino al termine decennale (art. 31 DLgs. 231/2007).');
END;

INSERT INTO d1_migrations (name) VALUES ('0003_backup_ripristino.sql');
