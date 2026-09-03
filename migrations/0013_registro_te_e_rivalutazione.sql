-- AR-M20 — Controllo costante alimentato dai dati.
--
-- 1) Registro dei titolari effettivi (D.Lgs. 10.6.2026 n. 122, nuovo art.
--    21-ter DLgs. 231/2007, in vigore dal 23.7.2026). Il soggetto obbligato
--    accreditato consulta il registro per l'adeguata verifica (co. 1-2),
--    segnala tempestivamente alla Camera di commercio le incongruenze fra il
--    registro e i dati acquisiti (co. 7) e conserva la prova dell'iscrizione
--    o un estratto (co. 12). La consultazione non esonera dall'adeguata
--    verifica (co. 11). Il portale non offre API: qui si REGISTRA la
--    consultazione fatta dal professionista, con esito, prova e segnalazione.
--    Ogni consultazione lascia una riga: in ispezione conta la storia, non
--    l'ultimo flag. (I campi registro_* di titolari_effettivi, AR-M8,
--    restano per compatibilita' e vengono aggiornati dall'ultima riga.)
--
-- 2) Le proposte del programma acquistano l'ambito RIVALUTAZIONE: al rinnovo
--    della visura, se cambia la struttura (soci, quote, cariche con poteri),
--    il programma propone di registrare il controllo costante con esito
--    «da rivalutare» sui fascicoli vivi valutati. SQLite non modifica un
--    CHECK: la tabella si ricrea copiando i dati.
--
-- Nessun dato personale in chiaro: la descrizione delle difformita' e le
-- note della segnalazione sono cifrate per tenant (contengono nominativi).

CREATE TABLE consultazioni_registro_te (
  id                        TEXT PRIMARY KEY,
  tenant_id                 TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id                TEXT NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
  fascicolo_id              TEXT REFERENCES fascicoli(id) ON DELETE SET NULL,
  data_consultazione        TEXT NOT NULL,
  esito                     TEXT NOT NULL CHECK (esito IN ('CORRISPONDE','DIFFORME','NON_ISCRITTO','NON_CONSULTABILE')),
  titolari_confrontati      INTEGER NOT NULL DEFAULT 0,
  difformita                TEXT,                 -- JSON cifrato: descrizione della difformita' (nominativi)
  documento_id              TEXT REFERENCES documenti(id) ON DELETE SET NULL,   -- prova dell'iscrizione / estratto (co. 12)
  segnalazione_data         TEXT,                 -- data della segnalazione alla Camera di commercio (co. 7)
  segnalazione_riferimento  TEXT,                 -- protocollo / ricevuta, in chiaro (nessun dato personale)
  segnalazione_note         TEXT,                 -- JSON cifrato
  segnalazione_da           TEXT REFERENCES utenti(id),
  eseguito_da               TEXT NOT NULL REFERENCES utenti(id),
  creato_il                 TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_consultazioni_te_cliente ON consultazioni_registro_te(tenant_id, cliente_id, data_consultazione);
CREATE INDEX idx_consultazioni_te_esito ON consultazioni_registro_te(tenant_id, esito, segnalazione_data);

CREATE TABLE proposte_nuova (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id    TEXT REFERENCES clienti(id) ON DELETE CASCADE,
  ambito        TEXT NOT NULL CHECK (ambito IN ('ANAGRAFICA','TITOLARITA','ESECUTORE','RISCHIO_A','DOCUMENTI','SCREENING','RIVALUTAZIONE')),
  origine       TEXT NOT NULL CHECK (origine IN ('VISURA','REGISTRI','DICHIARAZIONE','PORTAFOGLIO')),
  contenuto     TEXT NOT NULL,
  alert         TEXT NOT NULL DEFAULT '[]',
  stato         TEXT NOT NULL DEFAULT 'PROPOSTA' CHECK (stato IN ('PROPOSTA','APPLICATA','MODIFICATA','SCARTATA')),
  esito         TEXT,
  rivista_da    TEXT REFERENCES utenti(id),
  rivista_il    TEXT,
  creato_da     TEXT REFERENCES utenti(id),
  creato_il     TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO proposte_nuova SELECT id, tenant_id, cliente_id, ambito, origine, contenuto, alert, stato, esito, rivista_da, rivista_il, creato_da, creato_il FROM proposte;
DROP TABLE proposte;
ALTER TABLE proposte_nuova RENAME TO proposte;
CREATE INDEX idx_proposte_cliente ON proposte(tenant_id, cliente_id, stato);
CREATE INDEX idx_proposte_stato ON proposte(tenant_id, stato, creato_il);
