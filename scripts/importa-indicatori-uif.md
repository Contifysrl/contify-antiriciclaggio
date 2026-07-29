# Tassonomia degli indicatori di anomalia UIF — provenienza del dato

Completata il 29.7.2026. I 34 indicatori (titoli letterali in `titoloUfficiale`) e i 400
sub-indici sono trascritti dall'allegato al **Provvedimento UIF del 12 maggio 2023**
(G.U. Serie Generale n. 121 del 25.5.2023, applicabile dal 1.1.2024), PDF ufficiale:

    https://uif.bancaditalia.it/normativa/norm-indicatori-anomalia/Provvedimento_della_UIF_del_12_maggio_2023_e_allegato.pdf

## Come è stata fatta la trascrizione

- Estrazione testuale dal PDF (pdftotext) e parsing strutturale con validazione:
  34 indicatori contigui 1-34, sub-indici contigui n.1..n.k per ciascuno, 400 totali
  (il conteggio coincide con quanto dichiarato nell'allegato stesso: "34 indicatori...
  ciascuno articolato in sub-indici").
- I richiami alle note a piè di pagina presenti nel PDF (sub-indici 4.4, 30.5, 30.8)
  sono stati rimossi dal testo trascritto; le note non fanno parte del sub-indice.
- File generati: `worker/src/domain/indicatori-uif.ts` (indicatori) e
  `worker/src/domain/sub-indici-uif.ts` (sub-indici). **Non modificare a mano i testi**:
  in caso di dubbio si riparte dal PDF ufficiale.
- Riscontri letterali a campione in `tests/indicatori-uif.test.ts` (se un test fallisce
  non si adatta l'atteso: si ricontrolla la fonte).

## Distinzione tra i campi

- `titoloUfficiale` / testi dei sub-indici: **testo normativo letterale**, citabile in una
  segnalazione.
- `titolo`: etichetta sintetica di comodo per l'interfaccia, NON testo normativo.
- `rilevanzaCommercialista` e `notaCndcec`: guida tratta dal documento CNDCEC "Gli
  indicatori di anomalia per la segnalazione di operazioni sospette" (ottobre 2024) e dai
  criteri dell'allegato UIF; non rilevanti per i commercialisti: 16, 22-25, 27, salvo
  conoscenza diretta dell'operatività anomala. La selezione resta responsabilità del
  professionista.

Regola invariata: non inventare il testo di un indicatore. Un indicatore citato male in
una segnalazione alla UIF è peggio di un indicatore mancante.
