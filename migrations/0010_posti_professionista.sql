-- AR-M16 — Posti professionista nel contratto (console → Studi).
--
-- Con AR-M15 uno studio associato può avere più professionisti, e ogni
-- associato è un utente in più: il contratto deve dire quanti ne comprende.
-- NULL significa «nessun limite pattuito»: gli studi esistenti restano come
-- sono finché Contify non valorizza il campo dalla console. Il limite conta
-- i PROFESSIONISTI ATTIVI (ruolo TITOLARE), non gli utenti in generale:
-- collaboratori, lettori e revisori non firmano e non fanno prezzo.

ALTER TABLE tenants ADD COLUMN professionisti_inclusi INTEGER;
