-- AR-M21 (CON-01/CON-02): eventi della console che devono sopravvivere al
-- tenant. L'audit_log è per tenant (e immutabile): la cancellazione di uno
-- studio creato per errore lascerebbe la traccia senza il suo contesto.
-- Qui restano operatore, azione, tenant e un dettaglio JSON senza dati dei
-- clienti (lo studio si cancella solo se vuoto).
CREATE TABLE eventi_console (
  id         TEXT PRIMARY KEY,
  operatore  TEXT NOT NULL,                       -- email dell'operatore della console
  azione     TEXT NOT NULL,                       -- STUDIO_ELIMINATO | RESET_PASSWORD_UTENTE | STATO_UTENTE
  tenant_id  TEXT,                                -- nessuna FK: il tenant può non esistere più
  dettaglio  TEXT,                                -- JSON
  creato_il  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_eventi_console_tenant ON eventi_console(tenant_id, creato_il);
CREATE INDEX idx_eventi_console_data ON eventi_console(creato_il);
