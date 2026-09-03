-- AR-M19 — Registro dei controlli costanti eseguiti.
--
-- L'art. 19 co. 1 lett. d) impone il controllo costante nel corso del
-- rapporto; le regole tecniche lo graduano sul rischio (36/36/24/12 mesi).
-- Fino a M18 il programma calcolava la scadenza ma non aveva un modo per
-- registrare che il controllo era stato FATTO: `fascicoli.ultimo_controllo`
-- non veniva mai scritto e la scadenza restava «scaduta» per sempre. Qui ogni
-- controllo eseguito lascia una riga: data, chi, cosa è stato verificato,
-- esito (nulla è cambiato / serve una nuova valutazione), così in ispezione
-- il controllo costante è documentato e non soltanto programmato.
--
-- Nessun dato personale in chiaro oltre alle note del professionista.
CREATE TABLE controlli_costanti (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fascicolo_id  TEXT NOT NULL REFERENCES fascicoli(id) ON DELETE CASCADE,
  data_controllo TEXT NOT NULL,
  esito         TEXT NOT NULL CHECK (esito IN ('INVARIATO','DA_RIVALUTARE')),
  verifiche     TEXT NOT NULL DEFAULT '[]',   -- JSON: cosa è stato controllato (anagrafica, compagine, titolari, operatività, liste)
  note          TEXT,
  eseguito_da   TEXT NOT NULL REFERENCES utenti(id),
  creato_il     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_controlli_fascicolo ON controlli_costanti(tenant_id, fascicolo_id, data_controllo);
