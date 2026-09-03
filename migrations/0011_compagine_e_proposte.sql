-- AR-M17 — Compagine sociale, cariche e proposte del programma.
--
-- «Partire al contrario» (visione del 20.8.2026): la visura camerale non
-- alimenta solo l'anagrafica ma anche la COMPAGINE (soci e diritti sulle
-- quote) e le CARICHE (amministratori con poteri), che sono dati di fatto
-- datati e servono a più cose: proposta dei titolari effettivi (art. 20),
-- rischio A.1, controllo costante, incroci di portafoglio.
--
-- Scelte da difendere (visione §4):
--  * i dati di persone fisiche (nome, CF, domicilio, poteri) sono cifrati
--    con la chiave applicativa per tenant, come dati_identificativi;
--  * accanto al CF cifrato c'è `cf_hash`: HMAC-SHA256 con chiave per tenant.
--    Non invertibile, non confrontabile fra studi, ma permette i JOIN senza
--    decifrare («la holding socia di Alfa è il cliente Beta», «lo stesso
--    amministratore compare in dodici società»);
--  * serie temporale valido_dal / valido_al: la compagine del 2026 resta
--    leggibile nel 2031, quando il fascicolo sarà ispezionato; al rinnovo
--    della visura si chiudono le righe vecchie e si aprono le nuove;
--  * `proposte` è una tabella e non stato del browser: la coda di revisione
--    (M19) deve sopravvivere alla sessione, e la proposta rifiutata documenta
--    il giudizio esercitato dal professionista. Separa «ciò che il software
--    pensa» da «ciò che lo studio ha registrato»: i verbali continuano a
--    stampare solo dati registrati.
--
-- Base giuridica per i dati di soci e amministratori (terzi non clienti):
-- obbligo di legge, art. 6 par. 1 lett. c) GDPR + artt. 18-22 DLgs. 231/2007;
-- conservazione decennale art. 31; minimizzazione: si conserva ciò che serve
-- alla titolarità effettiva, non la visura in chiaro (il PDF sta su R2).

-- ---------------------------------------------------------- partecipazioni
CREATE TABLE partecipazioni (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id          TEXT NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,   -- la partecipata
  socio_tipo          TEXT NOT NULL CHECK (socio_tipo IN ('PERSONA_FISICA','PERSONA_GIURIDICA','FIDUCIARIA','TRUST','ALTRO')),
  socio_nome          TEXT NOT NULL,          -- JSON {contenuto, iv} cifrato per le persone fisiche; in chiaro per le PG
  socio_cf            TEXT,                   -- JSON cifrato (sempre, anche per le PG: coerenza e semplicità)
  socio_cf_hash       TEXT,                   -- HMAC per tenant del CF normalizzato: chiave degli incroci
  socio_cliente_id    TEXT REFERENCES clienti(id),   -- valorizzato se il socio è a sua volta cliente dello studio
  quota_nominale      REAL,
  quota_percento      REAL NOT NULL,          -- percentuale 0..100 sul capitale sottoscritto (quote proprie escluse)
  diritto             TEXT NOT NULL DEFAULT 'PROPRIETA'
                      CHECK (diritto IN ('PROPRIETA','NUDA_PROPRIETA','USUFRUTTO','PEGNO','SEQUESTRO','PIGNORAMENTO','COMPROPRIETA','ALTRO')),
  quote_proprie       INTEGER NOT NULL DEFAULT 0,    -- 1 se la riga è la società stessa (art. 2357-ter c.c.)
  paese               TEXT,                   -- ISO 3166-1 alpha-2, se desumibile
  dettagli            TEXT,                   -- JSON cifrato: domicilio, PEC, versato, note dal parser
  fonte               TEXT NOT NULL CHECK (fonte IN ('VISURA','DICHIARAZIONE','REGISTRO_TE','MANUALE')),
  fonte_documento_id  TEXT REFERENCES documenti(id),
  fonte_data          TEXT NOT NULL,          -- data della visura / dichiarazione (data dell'elenco soci se nota)
  valido_dal          TEXT NOT NULL,
  valido_al           TEXT,
  creato_da           TEXT NOT NULL REFERENCES utenti(id),
  creato_il           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_partecipazioni_cliente ON partecipazioni(tenant_id, cliente_id, valido_al);
CREATE INDEX idx_partecipazioni_cf_hash ON partecipazioni(tenant_id, socio_cf_hash);

-- ---------------------------------------------------------------- cariche
CREATE TABLE cariche (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id          TEXT NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
  nome                TEXT NOT NULL,          -- JSON cifrato
  cf                  TEXT,                   -- JSON cifrato
  cf_hash             TEXT,
  carica              TEXT NOT NULL,          -- AMMINISTRATORE_UNICO | PRESIDENTE_CDA | VICE_PRESIDENTE_CDA | CONSIGLIERE_DELEGATO | CONSIGLIERE
                                              -- | SOCIO_AMMINISTRATORE | TITOLARE | LIQUIDATORE | PROCURATORE | INSTITORE | SINDACO | REVISORE | CURATORE | ALTRO
  carica_testo        TEXT,                   -- dicitura letterale della visura
  rappresentanza_legale INTEGER NOT NULL DEFAULT 0,
  poteri              TEXT,                   -- JSON cifrato: testo dei poteri e date dalla visura
  fonte               TEXT NOT NULL CHECK (fonte IN ('VISURA','DICHIARAZIONE','REGISTRO_TE','MANUALE')),
  fonte_documento_id  TEXT REFERENCES documenti(id),
  fonte_data          TEXT NOT NULL,
  valido_dal          TEXT NOT NULL,
  valido_al           TEXT,
  creato_da           TEXT NOT NULL REFERENCES utenti(id),
  creato_il           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_cariche_cliente ON cariche(tenant_id, cliente_id, valido_al);
CREATE INDEX idx_cariche_cf_hash ON cariche(tenant_id, cf_hash);

-- --------------------------------------------------------------- proposte
CREATE TABLE proposte (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id    TEXT REFERENCES clienti(id) ON DELETE CASCADE,   -- NULL finché il cliente non esiste (M19: nuovo da visura in coda)
  ambito        TEXT NOT NULL CHECK (ambito IN ('ANAGRAFICA','TITOLARITA','ESECUTORE','RISCHIO_A','DOCUMENTI','SCREENING')),
  origine       TEXT NOT NULL CHECK (origine IN ('VISURA','REGISTRI','DICHIARAZIONE','PORTAFOGLIO')),
  contenuto     TEXT NOT NULL,                -- JSON cifrato: valori proposti + regola + motivazione + provenienza
  alert         TEXT NOT NULL DEFAULT '[]',   -- JSON in chiaro: [{codice, gravita}] — nessun dato personale
  stato         TEXT NOT NULL DEFAULT 'PROPOSTA' CHECK (stato IN ('PROPOSTA','APPLICATA','MODIFICATA','SCARTATA')),
  esito         TEXT,                         -- JSON cifrato: cosa è stato applicato e perché ci si è scostati
  rivista_da    TEXT REFERENCES utenti(id),
  rivista_il    TEXT,
  creato_da     TEXT REFERENCES utenti(id),
  creato_il     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_proposte_cliente ON proposte(tenant_id, cliente_id, stato);
CREATE INDEX idx_proposte_stato ON proposte(tenant_id, stato, creato_il);

-- ----------------------------------------------- screening: nuovi soggetti
-- Lo screening automatico dei nomi estratti dalla visura (soci persone
-- fisiche e titolari di cariche) richiede due tipi di soggetto in più.
-- SQLite non modifica un CHECK: si ricrea la tabella copiando i dati.
CREATE TABLE screening_esiti_nuova (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  soggetto_tipo  TEXT NOT NULL CHECK (soggetto_tipo IN ('CLIENTE','TITOLARE_EFFETTIVO','SOCIO','CARICA')),
  soggetto_id    TEXT NOT NULL,
  nominativo     TEXT NOT NULL,
  fonte          TEXT NOT NULL,
  voce_lista     TEXT NOT NULL,
  voce_id        TEXT NOT NULL,
  punteggio      REAL NOT NULL,
  stato          TEXT NOT NULL DEFAULT 'DA_ESAMINARE'
                  CHECK (stato IN ('DA_ESAMINARE','ESCLUSO','CONFERMATO')),
  nota           TEXT,
  deciso_da      TEXT REFERENCES utenti(id),
  deciso_il      TEXT,
  creato_il      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, soggetto_tipo, soggetto_id, fonte, voce_id)
);
INSERT INTO screening_esiti_nuova SELECT id, tenant_id, soggetto_tipo, soggetto_id, nominativo, fonte, voce_lista, voce_id, punteggio, stato, nota, deciso_da, deciso_il, creato_il FROM screening_esiti;
DROP INDEX IF EXISTS idx_screening_stato;
DROP TABLE screening_esiti;
ALTER TABLE screening_esiti_nuova RENAME TO screening_esiti;
CREATE INDEX idx_screening_stato ON screening_esiti(tenant_id, stato);
