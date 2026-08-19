-- AR-M15 — Studio associato e autovalutazione alimentata dai dati.
--
--  1. Il ruolo TITOLARE faceva due mestieri: firmare gli atti che impegnano
--     la responsabilità del professionista (valutazioni, autovalutazione,
--     SOS, astensioni) e amministrare lo studio (utenti, licenza, logo,
--     backup, eliminazione dell'archivio). In uno studio associato più
--     associati devono poter identificare e firmare senza per questo
--     ricevere il pulsante che cancella l'archivio di tutti: si separa
--     l'amministrazione in un flag, e TITOLARE resta il professionista.
--     Il valore in banca dati NON cambia: ricostruire `utenti` in D1 per
--     riscrivere un CHECK significherebbe muovere tutte le chiavi esterne.
--
--  2. L'adeguata verifica è attribuita nominativamente: chi segue la
--     prestazione e chi ha materialmente identificato il cliente
--     (art. 19 co. 1 lett. a). Finora si desumeva da `creato_da`, che è
--     chi ha digitato — non necessariamente chi ha identificato.
--
--  3. L'autovalutazione conserva anche gli indicatori di portafoglio usati
--     per proporre i punteggi: senza i numeri e i loro denominatori il
--     verbale non è verificabile in ispezione.

-- ------------------------------------------------------------------ utenti
ALTER TABLE utenti ADD COLUMN amministratore INTEGER NOT NULL DEFAULT 0;
ALTER TABLE utenti ADD COLUMN codice_fiscale TEXT;
ALTER TABLE utenti ADD COLUMN ordine TEXT;              -- ODCEC di iscrizione
ALTER TABLE utenti ADD COLUMN numero_iscrizione TEXT;
ALTER TABLE utenti ADD COLUMN qualifica TEXT;           -- per l'intestazione dei verbali

-- Amministratore: il TITOLARE più anziano di ciascuno studio, non tutti.
-- Chi amministrava fino a ieri continua ad amministrare; gli associati che
-- verranno aggiunti dopo nascono professionisti e basta.
UPDATE utenti SET amministratore = 1 WHERE id IN (
  SELECT u.id FROM utenti u
   WHERE u.ruolo = 'TITOLARE' AND u.attivo = 1
     AND u.creato_il = (SELECT MIN(u2.creato_il) FROM utenti u2
                         WHERE u2.tenant_id = u.tenant_id AND u2.ruolo = 'TITOLARE' AND u2.attivo = 1)
);

-- Rete di sicurezza: uno studio senza alcun TITOLARE attivo (non dovrebbe
-- esistere) resterebbe senza amministratore e quindi senza gestione utenti.
UPDATE utenti SET amministratore = 1 WHERE id IN (
  SELECT u.id FROM utenti u
   WHERE u.attivo = 1
     AND NOT EXISTS (SELECT 1 FROM utenti a WHERE a.tenant_id = u.tenant_id AND a.amministratore = 1)
     AND u.creato_il = (SELECT MIN(u3.creato_il) FROM utenti u3 WHERE u3.tenant_id = u.tenant_id AND u3.attivo = 1)
);

-- ------------------------------------------- professionista e identificazione
ALTER TABLE clienti   ADD COLUMN professionista_id    TEXT REFERENCES utenti(id);
ALTER TABLE fascicoli ADD COLUMN professionista_id    TEXT REFERENCES utenti(id);
ALTER TABLE fascicoli ADD COLUMN identificato_da      TEXT REFERENCES utenti(id);
ALTER TABLE fascicoli ADD COLUMN data_identificazione TEXT;

-- Attribuzione dello storico: chi ha creato, se è un professionista;
-- altrimenti l'amministratore dello studio. Mai NULL, altrimenti i filtri
-- per professionista nasconderebbero i fascicoli più vecchi.
UPDATE clienti SET professionista_id = COALESCE(
  (SELECT u.id FROM utenti u WHERE u.id = clienti.creato_da AND u.ruolo = 'TITOLARE'),
  (SELECT a.id FROM utenti a WHERE a.tenant_id = clienti.tenant_id AND a.amministratore = 1 ORDER BY a.creato_il LIMIT 1)
) WHERE professionista_id IS NULL;

UPDATE fascicoli SET professionista_id = COALESCE(
  (SELECT u.id FROM utenti u WHERE u.id = fascicoli.creato_da AND u.ruolo = 'TITOLARE'),
  (SELECT c.professionista_id FROM clienti c WHERE c.id = fascicoli.cliente_id)
) WHERE professionista_id IS NULL;

-- Per lo storico l'identificazione si data al conferimento dell'incarico:
-- è il momento in cui l'art. 19 la colloca.
UPDATE fascicoli SET identificato_da = professionista_id WHERE identificato_da IS NULL;
UPDATE fascicoli SET data_identificazione = data_conferimento WHERE data_identificazione IS NULL;

CREATE INDEX idx_clienti_professionista   ON clienti(tenant_id, professionista_id);
CREATE INDEX idx_fascicoli_professionista ON fascicoli(tenant_id, professionista_id);

-- --------------------------------------------------------- autovalutazione
-- JSON: numeratori, denominatori e punteggi proposti alla data della
-- valutazione. Congelati con la versione: i clienti cambiano, il verbale no.
ALTER TABLE autovalutazioni ADD COLUMN indicatori TEXT;

-- ------------------------------------------------------- firma per conto
-- In uno studio associato capita che a firmare sia un professionista diverso
-- da quello incaricato (assenza, sostituzione, subentro). Non si vieta: si
-- registra il perché, e il verbale lo stampa. Un divieto tecnico produrrebbe
-- solo firme intestate alla persona sbagliata.
ALTER TABLE valutazioni_rischio ADD COLUMN firma_motivazione TEXT;
ALTER TABLE autovalutazioni     ADD COLUMN firma_motivazione TEXT;
