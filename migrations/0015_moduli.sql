-- TS-M0 — Moduli della piattaforma (Contify AR + Contify Timesheet).
--
-- La piattaforma ha due moduli vendibili separatamente: AR (antiriciclaggio)
-- e TS (Timesheet, rilevazione ore). Uno studio può averne uno solo o
-- entrambi, anche in momenti diversi. Qui si registra quali moduli ha ogni
-- studio e a quali accede ogni utente. Migrazione ADDITIVA: nessuna tabella
-- di AR cambia struttura, salvo le due colonne nuove su `utenti`.
--
-- Stati e precedenze (una sola regola):
--   - tenants.stato      = stato dello STUDIO intero (blocca tutto, voci comuni comprese);
--   - moduli_tenant.stato = stato del SOLO modulo;
--   - stato effettivo del modulo = il peggiore dei due (attivo < sospeso < cessato);
--   - riga assente = modulo non acquistato;
--   - rete di sicurezza: uno studio SENZA ALCUNA riga vale «AR attivo» (studi
--     creati dal codice precedente nella finestra fra migrazione e rilascio, o
--     dopo un ritorno indietro). Il lavoro notturno riesegue l'INSERT qui sotto.
-- Il contratto di AR resta su `tenants` (data_scadenza_canone, note_contratto,
-- professionisti_inclusi): il codice degli avvisi di canone non cambia. Per uno
-- studio con solo Timesheet quei campi restano vuoti e le date stanno sulla riga TS.
-- `moduli_tenant` NON entra nel backup dell'archivio: è contratto, non archivio.

CREATE TABLE IF NOT EXISTS moduli_tenant (
  tenant_id            TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  modulo               TEXT NOT NULL CHECK (modulo IN ('AR','TS')),
  stato                TEXT NOT NULL DEFAULT 'attivo' CHECK (stato IN ('attivo','sospeso','cessato')),
  data_attivazione     TEXT,
  data_scadenza_canone TEXT,
  posti_inclusi        INTEGER,                   -- memorizzato, non fatto rispettare: i prezzi non sono decisi
  note_contratto       TEXT,
  creato_il            TEXT NOT NULL DEFAULT (datetime('now')),
  aggiornato_il        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, modulo)
);

-- Tutti gli studi esistenti hanno AR: la riga nasce con la data di attivazione del contratto.
INSERT INTO moduli_tenant (tenant_id, modulo, stato, data_attivazione)
  SELECT t.id, 'AR', 'attivo', t.data_attivazione FROM tenants t
  WHERE NOT EXISTS (SELECT 1 FROM moduli_tenant m WHERE m.tenant_id = t.id AND m.modulo = 'AR');

-- Accessi per utente. accesso_ar = 0 implica ruolo = 'COLLABORATORE' (valore di
-- comodo): le interrogazioni di AR che cercano ruolo = 'TITOLARE' non cambiano e
-- chi usa solo Timesheet non occupa un posto professionista di AR. Il default 1
-- serve al codice precedente, che non conosce la colonna e crea utenti per studi
-- con AR. Chi amministra lo studio accede sempre a tutti i moduli.
ALTER TABLE utenti ADD COLUMN accesso_ar INTEGER NOT NULL DEFAULT 1 CHECK (accesso_ar IN (0,1));
-- Ruolo Timesheet, separato dal ruolo AR: NULL = non accede a Timesheet.
ALTER TABLE utenti ADD COLUMN ts_ruolo TEXT CHECK (ts_ruolo IN ('TITOLARE','COLLABORATORE'));
