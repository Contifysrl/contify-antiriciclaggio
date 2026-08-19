-- Dati di collaudo. NON usare in produzione: le password sono note.
DELETE FROM sessioni; DELETE FROM utenti; DELETE FROM tenants;
DELETE FROM sessioni_console; DELETE FROM operatori_console;

-- Operatore della console assistenza (AR-M11). Password: ConsoleSmoke!1
INSERT INTO operatori_console (id, email, nome, password_hash, cambio_password_richiesto)
VALUES ('opc_smoke', 'assistenza@contify.it', 'Operatore Smoke', 'pbkdf2$100000$lThtvYQB4I1wmmiI+4q3Xg==$IpfgRONUKaLx53Y9ann8I93oNw3ioQeC30zeE17k9aw=', 0);

INSERT INTO tenants (id, denominazione, codice_fiscale, ordine_iscrizione, piano, ruleset_default, parametri)
VALUES ('ten_demo', 'Studio Commercialista Demo', '01234567890', 'ODCEC Padova', 'BASE', 'cndcec-2025',
        '{"giorniPreavviso":30,"referenteAntiriciclaggio":"Dott. Demo"}');

-- AR-M15: due professionisti, come in uno studio associato. Il secondo
-- (usr_tit2) NON amministra: serve a provare che identifica e firma senza
-- ereditare utenti, backup ed Elimina Archivio. Stessa password del primo.
INSERT INTO utenti (id, tenant_id, email, nome, password_hash, ruolo, amministratore, qualifica, ordine, numero_iscrizione) VALUES
  ('usr_tit', 'ten_demo', 'titolare@studiodemo.it', 'Dott. Demo Titolare', 'pbkdf2$100000$DwgDOG/NsorSMTucXh1U4g==$qWeJ9ZbcYy5kG3zmKJjh6/ZRcBO7YWSuIBEhCNOHvfs=', 'TITOLARE', 1, 'Dott.', 'Milano', '12345'),
  ('usr_tit2', 'ten_demo', 'associato@studiodemo.it', 'Dott.ssa Elena Associata', 'pbkdf2$100000$DwgDOG/NsorSMTucXh1U4g==$qWeJ9ZbcYy5kG3zmKJjh6/ZRcBO7YWSuIBEhCNOHvfs=', 'TITOLARE', 0, 'Dott.ssa', 'Milano', '67890'),
  ('usr_col', 'ten_demo', 'collaboratore@studiodemo.it', 'Anna Collaboratrice', 'pbkdf2$100000$CnRgoTxuZg6B0pRgoeRDhg==$Ph15AlT80cZz0eEBgb9M8yd5XT6ekWeQW6RbsU6cnqs=', 'COLLABORATORE', 0, NULL, NULL, NULL);

INSERT INTO clienti (id, tenant_id, tipo, denominazione, codice_fiscale, partita_iva, paese_residenza, attivita_prevalente, creato_da)
VALUES
 ('cli_alfa', 'ten_demo', 'SOCIETA_CAPITALI', 'Alfa Costruzioni Srl', '02233445566', '02233445566', 'IT', 'Costruzioni edili', 'usr_tit'),
 ('cli_beta', 'ten_demo', 'PERSONA_FISICA', 'Mario Rossi', 'RSSMRA70A01G224E', NULL, 'IT', 'Lavoratore autonomo', 'usr_tit');

-- Un cliente per ciascun professionista: senza questo i filtri «i miei»
-- sarebbero indistinguibili in locale.
UPDATE clienti SET professionista_id = 'usr_tit'  WHERE id = 'cli_alfa';
UPDATE clienti SET professionista_id = 'usr_tit2' WHERE id = 'cli_beta';
