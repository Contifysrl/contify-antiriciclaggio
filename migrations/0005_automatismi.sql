-- 0005 — Automatismi su dati pubblici (AR-M7)
--
-- 1. Cache della compilazione anagrafica da partita IVA (VIES).
--    Dato pubblico e ricostruibile: NON entra nei backup né nei dump
--    (vedi TABELLE_NON_DUMP in lib/backup.ts).
-- 2. Screening liste sanzioni: in D1 stanno SOLO le corrispondenze
--    trovate (con lo stato di lavorazione) e il diario delle corse.
--    Le liste complete vivono su R2.

CREATE TABLE lookup_piva_cache (
  piva      TEXT PRIMARY KEY,
  fonte     TEXT NOT NULL,
  payload   TEXT NOT NULL,
  creato_il TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Corrispondenza di un cliente o titolare effettivo con una voce di
-- lista. UNIQUE su (tenant, soggetto, fonte, voce): la stessa
-- corrispondenza non si ripresenta a ogni corsa notturna.
CREATE TABLE screening_esiti (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  soggetto_tipo  TEXT NOT NULL CHECK (soggetto_tipo IN ('CLIENTE','TITOLARE_EFFETTIVO')),
  soggetto_id    TEXT NOT NULL,
  nominativo     TEXT NOT NULL,               -- come registrato al momento del confronto
  fonte          TEXT NOT NULL,               -- UE | ONU | OFAC
  voce_lista     TEXT NOT NULL,               -- nome nella lista
  voce_id        TEXT NOT NULL,               -- identificativo nella lista di origine
  punteggio      REAL NOT NULL,
  stato          TEXT NOT NULL DEFAULT 'DA_ESAMINARE'
                  CHECK (stato IN ('DA_ESAMINARE','ESCLUSO','CONFERMATO')),
  nota           TEXT,
  deciso_da      TEXT REFERENCES utenti(id),
  deciso_il      TEXT,
  creato_il      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, soggetto_tipo, soggetto_id, fonte, voce_id)
);
CREATE INDEX idx_screening_stato ON screening_esiti(tenant_id, stato);

-- Diario delle corse: quando è girato lo screening, su quante anagrafiche,
-- con quali liste. È ciò che si esibisce per dimostrare il controllo
-- costante; le corse di routine NON intasano il registro degli accessi.
CREATE TABLE screening_corse (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  eseguito_il           TEXT NOT NULL DEFAULT (datetime('now')),
  liste_aggiornate_il   TEXT,
  soggetti              INTEGER NOT NULL,
  corrispondenze_nuove  INTEGER NOT NULL
);
CREATE INDEX idx_screening_corse ON screening_corse(tenant_id, id);

INSERT INTO d1_migrations (name) VALUES ('0005_automatismi.sql');
