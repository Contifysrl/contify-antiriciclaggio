-- 0006 — Adeguata verifica a distanza (AR-M8)
--
-- Il cliente riceve un link monouso e fornisce da sé dati identificativi,
-- documento, dichiarazione di titolarità effettiva e status PEP. Tutto
-- atterra QUI, in area di transito: nel fascicolo entra solo ciò che il
-- professionista esamina e acquisisce (l'adeguata verifica resta sua).
--
-- Sicurezza: nel database sta solo l'HASH del token (come per il reset
-- password); i dati forniti dal cliente sono cifrati con la chiave del
-- tenant; gli allegati stanno su R2 in area di transito e diventano
-- documenti del fascicolo solo all'acquisizione.

CREATE TABLE richieste_verifica (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fascicolo_id  TEXT NOT NULL REFERENCES fascicoli(id) ON DELETE CASCADE,
  cliente_id    TEXT NOT NULL REFERENCES clienti(id),
  token_hash    TEXT NOT NULL UNIQUE,
  richieste     TEXT NOT NULL,                -- JSON: cosa si chiede al cliente
  stato         TEXT NOT NULL DEFAULT 'INVIATA'
                 CHECK (stato IN ('INVIATA','COMPLETATA','ACQUISITA','ANNULLATA')),
  email_cliente TEXT,
  dati_cifrati  TEXT,                         -- AES-GCM con chiave del tenant
  iv            TEXT,
  allegati      TEXT NOT NULL DEFAULT '[]',   -- JSON: [{r2Key,nome,mime,dimensione,sha256}]
  scade_il      TEXT NOT NULL,
  completata_il TEXT,
  acquisita_da  TEXT REFERENCES utenti(id),
  acquisita_il  TEXT,
  creata_da     TEXT NOT NULL REFERENCES utenti(id),
  creato_il     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_verifiche_fascicolo ON richieste_verifica(tenant_id, fascicolo_id);
CREATE INDEX idx_verifiche_stato ON richieste_verifica(tenant_id, stato);

INSERT INTO d1_migrations (name) VALUES ('0006_verifica_remota.sql');
