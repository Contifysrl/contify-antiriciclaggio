-- Dati di collaudo. NON usare in produzione: le password sono note.
DELETE FROM sessioni; DELETE FROM utenti; DELETE FROM tenants;

INSERT INTO tenants (id, denominazione, codice_fiscale, ordine_iscrizione, piano, ruleset_default, parametri)
VALUES ('ten_demo', 'Studio Commercialista Demo', '01234567890', 'ODCEC Padova', 'BASE', 'cndcec-2025',
        '{"giorniPreavviso":30,"referenteAntiriciclaggio":"Dott. Demo"}');

INSERT INTO utenti (id, tenant_id, email, nome, password_hash, ruolo) VALUES
  ('usr_tit', 'ten_demo', 'titolare@studiodemo.it', 'Dott. Demo Titolare', 'pbkdf2$210000$xzdgNRi8pz90E4ILCLcTWw==$bez1gQFjdifr44hxcU07lTgzCHm8DN4UFnC7HL8HcWk=', 'TITOLARE'),
  ('usr_col', 'ten_demo', 'collaboratore@studiodemo.it', 'Anna Collaboratrice', 'pbkdf2$210000$7whuZETCPYLVMzMv9vPPww==$PB0HS4CQ6Tnu7XvIW99/OhDn0kleG9rwTPqedTeLamE=', 'COLLABORATORE');

INSERT INTO clienti (id, tenant_id, tipo, denominazione, codice_fiscale, partita_iva, paese_residenza, attivita_prevalente, creato_da)
VALUES
 ('cli_alfa', 'ten_demo', 'SOCIETA_CAPITALI', 'Alfa Costruzioni Srl', '02233445566', '02233445566', 'IT', 'Costruzioni edili', 'usr_tit'),
 ('cli_beta', 'ten_demo', 'PERSONA_FISICA', 'Mario Rossi', 'RSSMRA70A01G224E', NULL, 'IT', 'Lavoratore autonomo', 'usr_tit');
