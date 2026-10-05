-- TS-M1 — Contify Timesheet: base dell'archivio (clienti, servizi, registrazioni,
-- contatori d'uso dell'AI, ore previste per persona).
--
-- Migrazione ADDITIVA: nessuna tabella di AR cambia. Tutte le tabelle hanno
-- tenant_id; ogni interrogazione lo filtra (regola della piattaforma).
--
-- Clienti (scelta B2 di DECISIONI-TS.md): Timesheet ha un suo elenco,
-- collegato a quello di AR tramite cliente_ar_id SENZA chiave esterna (una
-- ricostruzione della tabella clienti in una futura migrazione di AR
-- azzererebbe in silenzio i collegamenti; un ripristino, che reinserisce gli
-- stessi id, ricollega da solo). Nessuna copia di massa: la riga nasce quando
-- si salva la prima registrazione per quel cliente. denominazione e alias sono
-- in chiaro perché servono al riconoscimento; codice fiscale e partita IVA in
-- chiaro come in AR (doppioni, e in TS-M3 Fatture in Cloud); il resto
-- dell'anagrafica è cifrato in `dati`.
--
-- Registrazioni: nota e testo_originale sono cifrati (nel testo libero finisce
-- di tutto). tariffa_cent è la tariffa oraria del servizio al momento del
-- salvataggio (scelta B13): cambiarla dopo non riscrive il passato.
-- automatica = 1 se salvata senza alcuna domanda; motore dice chi ha capito la
-- frase. Servono alle misure del pilota (PIANO-LAVORI-TS.md).
--
-- Backup: ts_clienti, ts_servizi, ts_registrazioni entrano in TABELLE_ARCHIVIO
-- (dopo `clienti`); ts_uso_ai (contatore) e ts_persone (configurazione delle
-- persone, come `utenti`) no.

CREATE TABLE IF NOT EXISTS ts_clienti (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  denominazione  TEXT NOT NULL,
  persona_fisica INTEGER NOT NULL DEFAULT 0 CHECK (persona_fisica IN (0,1)),
  codice_fiscale TEXT,
  partita_iva    TEXT,
  dati           TEXT,                         -- cifrato: sede, PEC, codice destinatario, email, telefono
  origine        TEXT NOT NULL DEFAULT 'MANUALE' CHECK (origine IN ('MANUALE','VIES','IMPORT','VISURA','CHAT','AR')),
  cliente_ar_id  TEXT,                         -- id in clienti; volutamente SENZA chiave esterna
  alias          TEXT,                         -- JSON: modi di dire imparati
  attivo         INTEGER NOT NULL DEFAULT 1 CHECK (attivo IN (0,1)),
  da_verificare  INTEGER NOT NULL DEFAULT 0 CHECK (da_verificare IN (0,1)),
  creato_da      TEXT REFERENCES utenti(id),
  creato_il      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ts_clienti_ar ON ts_clienti(tenant_id, cliente_ar_id) WHERE cliente_ar_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ts_clienti_tenant ON ts_clienti(tenant_id, attivo);
CREATE INDEX IF NOT EXISTS idx_ts_clienti_piva ON ts_clienti(tenant_id, partita_iva);
CREATE INDEX IF NOT EXISTS idx_ts_clienti_cf ON ts_clienti(tenant_id, codice_fiscale);

CREATE TABLE IF NOT EXISTS ts_servizi (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id),
  nome                TEXT NOT NULL,
  tariffa_oraria_cent INTEGER NOT NULL DEFAULT 0,
  parole_chiave       TEXT,                    -- JSON
  generico            INTEGER NOT NULL DEFAULT 0 CHECK (generico IN (0,1)),
  attivo              INTEGER NOT NULL DEFAULT 1 CHECK (attivo IN (0,1)),
  ordine              INTEGER NOT NULL DEFAULT 0,
  creato_il           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ts_servizi_tenant ON ts_servizi(tenant_id, attivo);

CREATE TABLE IF NOT EXISTS ts_registrazioni (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  utente_id        TEXT NOT NULL REFERENCES utenti(id),      -- chi ha lavorato
  creato_da        TEXT NOT NULL REFERENCES utenti(id),      -- chi ha inserito
  cliente_id       TEXT NOT NULL REFERENCES ts_clienti(id),
  servizio_id      TEXT NOT NULL REFERENCES ts_servizi(id),
  data             TEXT NOT NULL CHECK (data GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  minuti           INTEGER NOT NULL CHECK (typeof(minuti) = 'integer' AND minuti > 0 AND minuti <= 1440),
  tariffa_cent     INTEGER,                    -- tariffa oraria valida al momento del salvataggio
  nota             TEXT,                       -- cifrata
  testo_originale  TEXT,                       -- cifrato
  origine          TEXT NOT NULL CHECK (origine IN ('CHAT','VOCE','MANUALE')),
  motore           TEXT NOT NULL CHECK (motore IN ('LOCALE','AI','MANUALE')),
  automatica       INTEGER NOT NULL DEFAULT 0 CHECK (automatica IN (0,1)),  -- salvata senza alcuna domanda
  da_verificare    INTEGER NOT NULL DEFAULT 0 CHECK (da_verificare IN (0,1)),
  proforma_id      TEXT,                       -- usato da TS-M2
  creato_il        TEXT NOT NULL DEFAULT (datetime('now')),
  modificato_il    TEXT,
  modificato_da    TEXT REFERENCES utenti(id)
);
CREATE INDEX IF NOT EXISTS idx_ts_reg_data    ON ts_registrazioni(tenant_id, data);
CREATE INDEX IF NOT EXISTS idx_ts_reg_utente  ON ts_registrazioni(tenant_id, utente_id, data);
CREATE INDEX IF NOT EXISTS idx_ts_reg_cliente ON ts_registrazioni(tenant_id, cliente_id, data);

CREATE TABLE IF NOT EXISTS ts_uso_ai (
  tenant_id       TEXT NOT NULL,               -- senza chiave esterna: è un contatore
  utente_id       TEXT NOT NULL,
  giorno          TEXT NOT NULL,               -- giorno a Roma, calcolato dal server
  interpretazioni INTEGER NOT NULL DEFAULT 0,
  secondi_audio   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, utente_id, giorno)
);

CREATE TABLE IF NOT EXISTS ts_persone (
  utente_id          TEXT PRIMARY KEY REFERENCES utenti(id),
  tenant_id          TEXT NOT NULL REFERENCES tenants(id),
  minuti_settimanali INTEGER CHECK (minuti_settimanali IS NULL OR (typeof(minuti_settimanali) = 'integer' AND minuti_settimanali > 0 AND minuti_settimanali <= 6000)),
  giorni_lavorativi  TEXT NOT NULL DEFAULT '12345' CHECK (giorni_lavorativi <> '' AND giorni_lavorativi NOT GLOB '*[^1-7]*'),  -- 1 = lunedì … 7 = domenica
  aggiornato_il      TEXT NOT NULL DEFAULT (datetime('now'))
);
