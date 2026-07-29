-- =============================================================================
-- Contify Presidio — schema iniziale
-- SaaS antiriciclaggio per studi professionali. Cloudflare D1 (SQLite).
--
-- Principi di modellazione:
--
--  1. MULTI-TENANT PER RIGA. Ogni tabella di dominio ha tenant_id e ogni query
--     applicativa lo filtra. In D1 non esiste row-level security: il filtro sta
--     nel layer di accesso (worker/src/lib/db.ts), che non espone mai una query
--     senza tenant. Gli indici sono composti (tenant_id, ...) per rendere il
--     filtro gratuito e non un ripensamento.
--
--  2. IMMUTABILITÀ DOVE LA NORMA LA CHIEDE. L'art. 32 co. 2 lett. c) impone la
--     non alterabilità dei dati dopo l'acquisizione e la lett. d) impone la
--     storicità. Le valutazioni di rischio e i verbali non si aggiornano: si
--     versionano. Un UPDATE su una valutazione firmata è impedito da trigger.
--
--  3. TRACCIABILITÀ DEGLI ACCESSI. L'art. 32 co. 2 richiede di indicare i
--     soggetti legittimati ad alimentare il sistema e ad accedervi. La tabella
--     audit_log è append-only e concatenata via hash: un'alterazione a
--     posteriori rompe la catena ed è rilevabile.
--
--  4. SEGREGAZIONE DELLE SOS. Le segnalazioni di operazione sospetta e
--     l'identità del segnalante hanno un regime di riservatezza rinforzato
--     (artt. 38 e 39; art. 38 co. 3-bis punisce la rivelazione con la
--     reclusione da due a sei anni). Stanno in tabelle separate, con contenuto
--     cifrato a livello applicativo e accesso ristretto per ruolo.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- tenant
CREATE TABLE tenants (
  id                TEXT PRIMARY KEY,
  denominazione     TEXT NOT NULL,
  codice_fiscale    TEXT,
  partita_iva       TEXT,
  ordine_iscrizione TEXT,                       -- ODCEC di appartenenza
  piano             TEXT NOT NULL DEFAULT 'BASE' CHECK (piano IN ('BASE','AVANZATA','PREMIUM')),
  logo_url          TEXT,
  -- Ruleset applicato di default ai nuovi fascicoli. I fascicoli esistenti
  -- conservano il proprio: cambiare qui non riscrive la storia.
  ruleset_default   TEXT NOT NULL DEFAULT 'cndcec-2025',
  -- Parametri organizzativi (JSON): periodicità del controllo costante,
  -- giorni di preavviso dello scadenzario, referente antiriciclaggio.
  parametri         TEXT NOT NULL DEFAULT '{}',
  attivo            INTEGER NOT NULL DEFAULT 1,
  creato_il         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------- utenti
-- Ruoli:
--   TITOLARE   — professionista incaricato: firma valutazioni e SOS
--   COLLABORATORE — inserisce e istruisce, non firma
--   LETTORE    — sola lettura, nessun accesso alle SOS
--   REVISORE   — funzione di revisione indipendente (art. 16 co. 2 lett. b)
CREATE TABLE utenti (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,
  nome           TEXT NOT NULL,
  password_hash  TEXT NOT NULL,                 -- PBKDF2-SHA256, salt incluso
  ruolo          TEXT NOT NULL CHECK (ruolo IN ('TITOLARE','COLLABORATORE','LETTORE','REVISORE')),
  attivo         INTEGER NOT NULL DEFAULT 1,
  ultimo_accesso TEXT,
  creato_il      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_utenti_email ON utenti(email);
CREATE INDEX idx_utenti_tenant ON utenti(tenant_id, attivo);

CREATE TABLE sessioni (
  id         TEXT PRIMARY KEY,                  -- hash del token, mai il token
  utente_id  TEXT NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
  tenant_id  TEXT NOT NULL,
  scade_il   TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  creato_il  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessioni_utente ON sessioni(utente_id);
CREATE INDEX idx_sessioni_scadenza ON sessioni(scade_il);

-- ------------------------------------------- autovalutazione dello studio
-- Artt. 15-16. Versionata: ogni aggiornamento è una nuova riga, mai un UPDATE.
CREATE TABLE autovalutazioni (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  versione           INTEGER NOT NULL,
  ruleset_id         TEXT NOT NULL,
  data_valutazione   TEXT NOT NULL,
  punteggi           TEXT NOT NULL,             -- JSON: {inerente:{...}, vulnerabilita:{...}}
  rischio_inerente   REAL NOT NULL,
  vulnerabilita      REAL NOT NULL,
  rischio_residuo    REAL NOT NULL,
  classe             TEXT NOT NULL,
  formula            TEXT NOT NULL,             -- traccia del calcolo, per il verbale
  note               TEXT,
  presidi            TEXT,                      -- JSON: misure di mitigazione ex art. 16
  firmata_da         TEXT REFERENCES utenti(id),
  firmata_il         TEXT,
  creato_da          TEXT NOT NULL REFERENCES utenti(id),
  creato_il          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_autoval_versione ON autovalutazioni(tenant_id, versione);

-- Art. 32 co. 2 lett. c): non alterabilità dopo l'acquisizione.
-- Una volta firmata, la valutazione è congelata. Correggere significa
-- emettere una nuova versione, che è esattamente ciò che vuole la norma.
CREATE TRIGGER trg_autoval_immutabile
BEFORE UPDATE ON autovalutazioni
FOR EACH ROW WHEN OLD.firmata_il IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Autovalutazione firmata: non modificabile (art. 32 co. 2 lett. c DLgs. 231/2007). Emettere una nuova versione.');
END;

-- ---------------------------------------------------------------- clienti
CREATE TABLE clienti (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo                TEXT NOT NULL CHECK (tipo IN ('PERSONA_FISICA','SOCIETA_CAPITALI','SOCIETA_PERSONE','ENTE_NON_PROFIT','TRUST','ALTRO')),
  denominazione       TEXT NOT NULL,
  codice_fiscale      TEXT,
  partita_iva         TEXT,
  -- Dati identificativi di dettaglio, cifrati a livello applicativo:
  -- estremi del documento, luogo e data di nascita, residenza.
  dati_identificativi TEXT,
  paese_residenza     TEXT NOT NULL DEFAULT 'IT',
  attivita_prevalente TEXT,
  ateco               TEXT,
  pep                 INTEGER NOT NULL DEFAULT 0,
  pep_organo_pubblico INTEGER NOT NULL DEFAULT 0,
  note                TEXT,
  attivo              INTEGER NOT NULL DEFAULT 1,
  creato_da           TEXT NOT NULL REFERENCES utenti(id),
  creato_il           TEXT NOT NULL DEFAULT (datetime('now')),
  aggiornato_il       TEXT
);
CREATE INDEX idx_clienti_tenant ON clienti(tenant_id, attivo);
CREATE INDEX idx_clienti_cf ON clienti(tenant_id, codice_fiscale);

-- ---------------------------------------------------- titolarità effettiva
-- Art. 20. Si conserva il criterio applicato e la motivazione: il co. 6 lo
-- impone espressamente quando si ricorre al criterio residuale del co. 5.
CREATE TABLE titolari_effettivi (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL,
  cliente_id     TEXT NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
  nominativo     TEXT NOT NULL,
  codice_fiscale TEXT,
  criterio       TEXT NOT NULL,                 -- PROPRIETA_DIRETTA | ... | RESIDUALE_POTERI
  norma          TEXT NOT NULL,
  quota          REAL,
  percorsi       TEXT,                          -- JSON: catene di partecipazione
  motivazione    TEXT NOT NULL,
  pep            INTEGER NOT NULL DEFAULT 0,
  -- Consultazione del registro dei titolari effettivi ex art. 21-ter.
  -- Va tracciata perché l'art. 31 co. 2 lett. b-bis) la richiede tra i dati da
  -- conservare. Il registro non è ancora operativo per i soggetti obbligati:
  -- il campo resta valorizzabile appena lo sarà.
  registro_consultato    INTEGER NOT NULL DEFAULT 0,
  registro_data          TEXT,
  registro_incongruenza  INTEGER NOT NULL DEFAULT 0,
  registro_note          TEXT,
  valido_dal     TEXT NOT NULL,
  valido_al      TEXT,
  creato_da      TEXT NOT NULL REFERENCES utenti(id),
  creato_il      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_te_cliente ON titolari_effettivi(tenant_id, cliente_id, valido_al);

-- ------------------------------------------------------------- fascicoli
-- Un fascicolo = una prestazione professionale resa a un cliente.
-- Non un cliente: lo stesso cliente può avere prestazioni con profili di
-- rischio diversi, e l'esenzione dell'art. 17 co. 7 è per prestazione.
CREATE TABLE fascicoli (
  id                     TEXT PRIMARY KEY,
  tenant_id              TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id             TEXT NOT NULL REFERENCES clienti(id),
  codice                 TEXT NOT NULL,          -- progressivo leggibile, es. 2026/0042
  prestazione_codice     TEXT NOT NULL,
  prestazione_descrizione TEXT NOT NULL,         -- denormalizzata: il catalogo può cambiare
  tipo_rapporto          TEXT NOT NULL DEFAULT 'CONTINUATIVO' CHECK (tipo_rapporto IN ('CONTINUATIVO','OCCASIONALE')),
  importo_operazione     REAL,
  data_conferimento      TEXT NOT NULL,
  data_cessazione        TEXT,
  scopo_natura           TEXT,                   -- art. 19 co. 1 lett. c)
  esecutore              TEXT,                   -- JSON: dati dell'esecutore, se diverso dal cliente
  modalita_identificazione TEXT,                 -- art. 19 co. 1 lett. a): presenza, SPID, firma digitale, ...
  stato                  TEXT NOT NULL DEFAULT 'APERTO' CHECK (stato IN ('APERTO','IN_VERIFICA','COMPLETO','ASTENSIONE','CESSATO')),
  ultimo_controllo       TEXT,
  creato_da              TEXT NOT NULL REFERENCES utenti(id),
  creato_il              TEXT NOT NULL DEFAULT (datetime('now')),
  aggiornato_il          TEXT
);
CREATE UNIQUE INDEX idx_fascicoli_codice ON fascicoli(tenant_id, codice);
CREATE INDEX idx_fascicoli_cliente ON fascicoli(tenant_id, cliente_id);
CREATE INDEX idx_fascicoli_stato ON fascicoli(tenant_id, stato);

-- ------------------------------------------------ valutazioni di rischio
-- Versionate come le autovalutazioni. Conservano il ruleset usato: un
-- fascicolo aperto nel 2024 va riletto con le regole tecniche di allora.
CREATE TABLE valutazioni_rischio (
  id                     TEXT PRIMARY KEY,
  tenant_id              TEXT NOT NULL,
  fascicolo_id           TEXT NOT NULL REFERENCES fascicoli(id) ON DELETE CASCADE,
  versione               INTEGER NOT NULL,
  ruleset_id             TEXT NOT NULL,
  data_valutazione       TEXT NOT NULL,
  tabella_a              TEXT NOT NULL,          -- JSON
  tabella_b              TEXT,                   -- JSON, null se esonerata
  circostanze            TEXT NOT NULL DEFAULT '{}',  -- JSON: PEP, paese alto rischio, sospetto...
  esente_verifica        INTEGER NOT NULL DEFAULT 0,
  rischio_inerente       REAL NOT NULL,
  rischio_specifico      REAL NOT NULL,
  rischio_effettivo      REAL NOT NULL,
  classe                 TEXT NOT NULL,
  livello_calcolato      TEXT NOT NULL,
  livello_applicabile    TEXT NOT NULL,
  livello_innalzato      INTEGER NOT NULL DEFAULT 0,
  vincoli                TEXT NOT NULL DEFAULT '[]',  -- JSON: vincoli normativi applicati
  astensione_dovuta      INTEGER NOT NULL DEFAULT 0,
  valutare_sos           INTEGER NOT NULL DEFAULT 0,
  controllo_costante_mesi INTEGER NOT NULL DEFAULT 0,
  formula                TEXT NOT NULL,
  motivazione            TEXT,
  firmata_da             TEXT REFERENCES utenti(id),
  firmata_il             TEXT,
  creato_da              TEXT NOT NULL REFERENCES utenti(id),
  creato_il              TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_valutazioni_versione ON valutazioni_rischio(fascicolo_id, versione);
CREATE INDEX idx_valutazioni_tenant ON valutazioni_rischio(tenant_id, classe);

CREATE TRIGGER trg_valutazione_immutabile
BEFORE UPDATE ON valutazioni_rischio
FOR EACH ROW WHEN OLD.firmata_il IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Valutazione firmata: non modificabile (art. 32 co. 2 lett. c DLgs. 231/2007). Emettere una nuova versione.');
END;

-- --------------------------------------------------------- conservazione
-- Artt. 31-32. I documenti stanno su R2; qui vive il metadato, l'hash per
-- l'integrità e la data di acquisizione che misura la tempestività (30 gg).
CREATE TABLE documenti (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fascicolo_id      TEXT REFERENCES fascicoli(id) ON DELETE CASCADE,
  cliente_id        TEXT REFERENCES clienti(id) ON DELETE CASCADE,
  tipo              TEXT NOT NULL,               -- DOCUMENTO_IDENTITA | VISURA | AUTOCERTIFICAZIONE_TE | INCARICO | ALTRO
  nome_file         TEXT NOT NULL,
  mime              TEXT NOT NULL,
  dimensione        INTEGER NOT NULL,
  r2_key            TEXT NOT NULL,
  sha256            TEXT NOT NULL,               -- integrità ex art. 32 co. 2 lett. c)
  data_riferimento  TEXT NOT NULL,               -- data del documento
  data_acquisizione TEXT NOT NULL,               -- quando è entrato nel sistema
  conserva_fino_al  TEXT,                        -- calcolata: cessazione + 10 anni
  creato_da         TEXT NOT NULL REFERENCES utenti(id),
  creato_il         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_documenti_fascicolo ON documenti(tenant_id, fascicolo_id);
CREATE INDEX idx_documenti_conservazione ON documenti(tenant_id, conserva_fino_al);

-- I documenti conservati non si cancellano prima del termine decennale.
CREATE TRIGGER trg_documenti_no_delete
BEFORE DELETE ON documenti
FOR EACH ROW WHEN OLD.conserva_fino_al IS NOT NULL AND OLD.conserva_fino_al > date('now')
BEGIN
  SELECT RAISE(ABORT, 'Documento in conservazione obbligatoria fino al termine decennale (art. 31 DLgs. 231/2007).');
END;

-- --------------------------------------------------------------- operazioni
-- Operazioni rilevanti sul fascicolo, incluse quelle in contante da verificare
-- ai sensi dell'art. 49.
CREATE TABLE operazioni (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fascicolo_id       TEXT NOT NULL REFERENCES fascicoli(id) ON DELETE CASCADE,
  data_operazione    TEXT NOT NULL,
  descrizione        TEXT NOT NULL,
  importo            REAL NOT NULL,
  mezzo_pagamento    TEXT NOT NULL,              -- CONTANTE | BONIFICO | ASSEGNO | ...
  controparte        TEXT,
  -- Esito del controllo art. 49, calcolato con la soglia vigente alla data.
  esito_contante     TEXT,                       -- JSON
  violazione_art49   INTEGER NOT NULL DEFAULT 0,
  comunicazione_mef  TEXT,                       -- JSON: stato, protocollo, data invio
  creato_da          TEXT NOT NULL REFERENCES utenti(id),
  creato_il          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_operazioni_fascicolo ON operazioni(tenant_id, fascicolo_id, data_operazione);
CREATE INDEX idx_operazioni_violazioni ON operazioni(tenant_id, violazione_art49);

-- ---------------------------------------------------------------------- SOS
-- Artt. 35-39. Regime di riservatezza rinforzato.
-- `contenuto_cifrato` è cifrato in AES-GCM lato applicativo con chiave del
-- tenant: chi legge il database senza la chiave non legge la segnalazione.
-- `segnalante_id` è la sola colonna che lega la SOS a una persona fisica e non
-- è mai restituita dalle API di elenco.
CREATE TABLE segnalazioni_sospette (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  protocollo          TEXT NOT NULL,
  fascicolo_id        TEXT REFERENCES fascicoli(id),
  cliente_id          TEXT REFERENCES clienti(id),
  stato               TEXT NOT NULL DEFAULT 'BOZZA'
                       CHECK (stato IN ('BOZZA','IN_VALUTAZIONE','ARCHIVIATA','TRASMESSA','ESITO_RICEVUTO')),
  data_rilevazione    TEXT NOT NULL,
  data_trasmissione   TEXT,
  canale              TEXT,                      -- UIF_DIRETTA | ORGANISMO_AUTOREGOLAMENTAZIONE
  operazione_eseguita INTEGER NOT NULL DEFAULT 0,-- art. 35 co. 2: eseguita prima della segnalazione?
  motivo_esecuzione   TEXT,                      -- obbligo di legge di ricevere l'atto, indagini, ...
  indicatori          TEXT NOT NULL DEFAULT '[]',-- JSON: numeri degli indicatori UIF ricorrenti
  contenuto_cifrato   TEXT NOT NULL,             -- AES-GCM: descrizione operazione e motivi del sospetto
  iv                  TEXT NOT NULL,
  segnalante_id       TEXT NOT NULL REFERENCES utenti(id),
  esito               TEXT,
  creato_il           TEXT NOT NULL DEFAULT (datetime('now')),
  aggiornato_il       TEXT
);
CREATE UNIQUE INDEX idx_sos_protocollo ON segnalazioni_sospette(tenant_id, protocollo);
CREATE INDEX idx_sos_stato ON segnalazioni_sospette(tenant_id, stato);

-- Art. 42: verbale di astensione. Va tenuto anche quando NON sfocia in SOS,
-- perché documenta la decisione del professionista.
CREATE TABLE astensioni (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fascicolo_id   TEXT NOT NULL REFERENCES fascicoli(id) ON DELETE CASCADE,
  data_decisione TEXT NOT NULL,
  fondamento     TEXT NOT NULL CHECK (fondamento IN ('ART_42_CO_1','ART_42_CO_2','ART_18_CO_3')),
  motivazione    TEXT NOT NULL,
  sos_valutata   INTEGER NOT NULL DEFAULT 0,
  sos_id         TEXT REFERENCES segnalazioni_sospette(id),
  decisa_da      TEXT NOT NULL REFERENCES utenti(id),
  creato_il      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_astensioni_fascicolo ON astensioni(tenant_id, fascicolo_id);

-- ------------------------------------------------------------- formazione
-- Art. 16 co. 3: programmi permanenti di formazione. È un fattore di
-- vulnerabilità dell'autovalutazione: tenerne traccia rende il punteggio
-- difendibile invece che dichiarato.
CREATE TABLE formazione (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  utente_id   TEXT REFERENCES utenti(id),
  partecipante TEXT NOT NULL,
  titolo      TEXT NOT NULL,
  ente        TEXT,
  data_evento TEXT NOT NULL,
  ore         REAL NOT NULL DEFAULT 0,
  attestato_documento_id TEXT REFERENCES documenti(id),
  creato_il   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_formazione_tenant ON formazione(tenant_id, data_evento);

-- --------------------------------------------------------------- audit log
-- Append-only, concatenato via hash. `hash_precedente` è l'hash della riga
-- immediatamente precedente dello stesso tenant: verificare la catena
-- (GET /api/audit/verifica) dimostra che nessuna riga è stata alterata o
-- rimossa. È la risposta operativa all'art. 32 co. 2, che chiede integrità,
-- non alterabilità e tracciabilità degli accessi.
CREATE TABLE audit_log (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id        TEXT NOT NULL,
  utente_id        TEXT,
  azione           TEXT NOT NULL,                -- LOGIN | CREA_FASCICOLO | FIRMA_VALUTAZIONE | LEGGI_SOS | ...
  entita           TEXT,
  entita_id        TEXT,
  dettaglio        TEXT,
  ip               TEXT,
  hash_precedente  TEXT,
  hash_riga        TEXT NOT NULL,
  creato_il        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_tenant ON audit_log(tenant_id, id);
CREATE INDEX idx_audit_entita ON audit_log(tenant_id, entita, entita_id);

CREATE TRIGGER trg_audit_no_update
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'Il registro degli accessi è immodificabile (art. 32 co. 2 DLgs. 231/2007).');
END;

CREATE TRIGGER trg_audit_no_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'Il registro degli accessi non è cancellabile (art. 32 co. 2 DLgs. 231/2007).');
END;

-- ------------------------------------------------------------- migrazioni
CREATE TABLE d1_migrations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO d1_migrations (name) VALUES ('0001_init.sql');
