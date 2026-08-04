-- AR-M11 — Menu come Assist: assistenza con ticket, pagina Novità.
--
-- Tre gruppi di oggetti:
--  1. ticket / ticket_messaggi / ticket_letture: il sistema di assistenza
--     in-app (come Assist). I ticket NON fanno parte dell'archivio dello
--     studio: backup-ripristino ed Elimina archivio non li toccano, come
--     gli utenti e il registro.
--  2. utenti.novita_vista: l'ultima novità vista dall'utente (id della
--     voce), per il pallino «Novità» nel menu.
--  3. operatori_console / sessioni_console: gli operatori Contify che
--     rispondono ai ticket dalla console (#console). Tabelle di
--     piattaforma, senza tenant_id.

ALTER TABLE utenti ADD COLUMN novita_vista TEXT;

CREATE TABLE ticket (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  numero      TEXT NOT NULL,                -- TCK-2026-0001, progressivo per studio
  autore_id   TEXT NOT NULL REFERENCES utenti(id),
  oggetto     TEXT NOT NULL,
  stato       TEXT NOT NULL DEFAULT 'aperto' CHECK (stato IN ('aperto', 'risposto', 'chiuso')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, numero)
);
CREATE INDEX idx_ticket_tenant ON ticket(tenant_id, stato);

CREATE TABLE ticket_messaggi (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  ticket_id      TEXT NOT NULL REFERENCES ticket(id),
  -- NULL = messaggio dell'assistenza Contify (dalla console).
  autore_id      TEXT REFERENCES utenti(id),
  testo          TEXT NOT NULL,
  da_assistenza  INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ticket_messaggi ON ticket_messaggi(ticket_id);

-- Quanti messaggi "altrui" l'utente ha già visto di ogni ticket: il
-- confronto con il conteggio attuale dà il «non letto».
CREATE TABLE ticket_letture (
  tenant_id  TEXT NOT NULL,
  ticket_id  TEXT NOT NULL REFERENCES ticket(id),
  utente_id  TEXT NOT NULL REFERENCES utenti(id),
  n_visti    INTEGER NOT NULL DEFAULT 0,
  letto_at   TEXT,
  PRIMARY KEY (ticket_id, utente_id)
);

CREATE TABLE operatori_console (
  id                         TEXT PRIMARY KEY,
  email                      TEXT NOT NULL UNIQUE,
  nome                       TEXT NOT NULL,
  password_hash              TEXT NOT NULL,
  attivo                     INTEGER NOT NULL DEFAULT 1,
  cambio_password_richiesto  INTEGER NOT NULL DEFAULT 1,
  ultimo_accesso             TEXT
);

-- Sessioni della console: come `sessioni`, in D1 sta solo lo SHA-256
-- del token. Escluse dal dump di piattaforma (transitorie).
CREATE TABLE sessioni_console (
  id           TEXT PRIMARY KEY,
  operatore_id TEXT NOT NULL REFERENCES operatori_console(id) ON DELETE CASCADE,
  scade_il     TEXT NOT NULL,
  ip           TEXT,
  user_agent   TEXT
);
