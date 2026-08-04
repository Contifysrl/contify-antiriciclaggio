-- AR-M12 — Impostazioni come Assist: accessi/dispositivi e tema utente.
--
--  1. Sessioni con scadenza per INATTIVITÀ (rinnovo scorrevole) e tetto
--     assoluto, come Assist: 8 ore / 24 ore, oppure 7 giorni / 30 giorni
--     con «Resta collegato su questo computer» nel login. Le sessioni
--     esistenti (scade_il fisso) restano valide: al primo utilizzo il
--     rinnovo le porta al nuovo regime.
--  2. Tema dell'interfaccia per utente (12 colori) e modo colore
--     (chiaro / scuro / auto): la scelta segue l'utente su ogni
--     dispositivo, non solo nel localStorage.

ALTER TABLE sessioni ADD COLUMN scade_assoluta TEXT;
ALTER TABLE sessioni ADD COLUMN ricordami INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessioni ADD COLUMN ultimo_utilizzo TEXT;

ALTER TABLE utenti ADD COLUMN tema TEXT;
ALTER TABLE utenti ADD COLUMN modo_colore TEXT;
