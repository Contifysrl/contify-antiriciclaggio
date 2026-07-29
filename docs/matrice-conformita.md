# Matrice di conformità — obbligo di legge → funzione del software

Tracciabilità fra le disposizioni del **DLgs. 21.11.2007 n. 231** (testo consolidato Eutekne al
24.7.2026) e i punti del codice che le attuano. Serve a due cose: dimostrare in sede ispettiva
che l'adempimento è presidiato, e impedire che una modifica al codice faccia cadere un obbligo
senza che nessuno se ne accorga.

Legenda copertura: **P** presidiato · **PP** parzialmente presidiato · **F** fuori perimetro v1.

## Titolo I — valutazione del rischio

| Norma | Obbligo | Copertura | Dove |
|---|---|---|---|
| art. 15 co. 2 | Procedure oggettive e coerenti per l'analisi del rischio, considerando clientela, area geografica, canali distributivi, prodotti e servizi | P | `domain/rulesets/cndcec-2025.ts` → `autovalutazione.fattoriInerente`; `domain/risk.ts` → `calcolaAutovalutazione` |
| art. 15 co. 4 | Valutazione documentata, periodicamente aggiornata e messa a disposizione delle autorità | P | tabella `autovalutazioni` versionata; `scadenze.ts` → `scadenzaAggiornamentoAutovalutazione`; trigger `trg_autoval_immutabile` |
| art. 16 co. 1 | Presidi, controlli e procedure per mitigare il rischio | PP | campo `autovalutazioni.presidi`; la redazione del manuale delle procedure resta del professionista |
| art. 16 co. 3 | Programmi permanenti di formazione | PP | tabella `formazione`; fattore di vulnerabilità nell'autovalutazione. Nessuna gestione di corsi in v1 |
| art. 16 co. 4 | Rispetto della normativa sulla protezione dei dati | P | cifratura applicativa per tenant (`lib/crypto.ts`), RBAC, registro accessi, regione EU su D1 e R2 |

## Titolo II Capo I — adeguata verifica

| Norma | Obbligo | Copertura | Dove |
|---|---|---|---|
| art. 17 co. 1 lett. a) | Verifica all'instaurazione del rapporto o al conferimento dell'incarico | P | creazione del fascicolo con `data_conferimento` obbligatoria |
| art. 17 co. 1 lett. b) | Soglia di 15.000 euro per l'operazione occasionale, anche frazionata | P | `domain/norme.ts` → `OPERAZIONE_OCCASIONALE`; avviso alla creazione del fascicolo occasionale |
| art. 17 co. 2 | Verifica in ogni caso in presenza di sospetto o di dubbi sui dati | P | `risk.ts` → `esenzioneCaduta` e vincoli `SOSPETTO` / `DUBBI_IDENTIFICAZIONE` |
| art. 17 co. 3 | Misure proporzionali al rischio, graduate sui criteri di cliente e prestazione | P | Tabella A (4 criteri lett. a) e Tabella B (6 criteri lett. b) mappate uno a uno con il riferimento normativo nel ruleset |
| art. 17 co. 7 | Esclusione per mera redazione/trasmissione delle dichiarazioni fiscali e amministrazione del personale | P | `prestazioni.ts` → `esenteAdeguataVerifica`; ramo dedicato in `calcolaProfiloCliente`; nessuna scadenza generata |
| art. 18 co. 3 | Completamento della verifica entro 30 giorni; oltre, astensione e valutazione della SOS | P | `scadenze.ts` → `COMPLETAMENTO_VERIFICA`; stato `ASTENSIONE` sul fascicolo |
| art. 19 co. 1 lett. a) | Modalità di identificazione, anche senza presenza fisica | P | campo `modalita_identificazione` con le sole opzioni ammesse dalla norma |
| art. 19 co. 1 lett. c) | Acquisizione e valutazione di scopo e natura della prestazione | P | campo `scopo_natura` |
| art. 19 co. 1 lett. d) | Controllo costante nel corso del rapporto | P (cadenza organizzativa) | `scadenze.ts` → `CONTROLLO_COSTANTE`, marcato `normativa: false` |
| art. 20 co. 1-3 | Criteri di determinazione della titolarità effettiva, soglia del 25%, controllo | P | `titolare-effettivo.ts` → `analizzaTitolaritaEffettiva`, con catena partecipativa moltiplicativa |
| art. 20 co. 4 | Persone giuridiche private: fondatori, beneficiari, amministratori, cumulativamente | P | ramo `personaGiuridicaPrivata` |
| art. 20 co. 5-6 | Criterio residuale e obbligo di conservare le ragioni che hanno impedito gli altri criteri | P | `RESIDUALE_POTERI`; l'API rifiuta con 400 il salvataggio privo di motivazione |
| art. 21-ter | Accesso dei soggetti obbligati al registro dei titolari effettivi | PP | campi `registro_consultato`, `registro_data`, `registro_incongruenza` predisposti. Vedi nota sul registro in fondo |
| art. 23 co. 4 | Le misure semplificate sono escluse in presenza di sospetto | P | vincolo `VIETA_SEMPLIFICATA` |
| art. 24 co. 2 | Fattori di rischio elevato relativi a cliente, prodotti e area geografica | PP | circostanze `assettoProprietarioComplesso`, `elevatoUsoContante`, `paeseTerzoAltoRischio` |
| art. 24 co. 5 lett. a) | Rafforzata obbligatoria con Paesi terzi ad alto rischio | P | vincolo `PAESE_ALTO_RISCHIO` |
| art. 24 co. 5 lett. c) | Rafforzata obbligatoria per le PEP, salvo agiscano come organi della PA | P | vincoli `PEP` e `PEP_ORGANO_PA` |
| art. 24 co. 6 | Ex PEP entro un anno dalla cessazione, in presenza di rischio elevato | P | vincolo `EX_PEP` |
| art. 25 co. 4 e 4-bis | Contenuto delle misure rafforzate | PP | riportato nel testo dei vincoli. L'autorizzazione preventiva non è ancora un workflow con firma |

## Titolo II Capo II — conservazione

| Norma | Obbligo | Copertura | Dove |
|---|---|---|---|
| art. 31 co. 1-2 | Conservazione dei documenti utili a ricostruire univocamente rapporto, soggetti, scopo e mezzi di pagamento | P | tabelle `documenti`, `operazioni`, `fascicoli`, `titolari_effettivi` |
| art. 31 | Conservazione decennale | P | `conserva_fino_al` calcolato dalla cessazione; trigger `trg_documenti_no_delete` |
| art. 32 co. 2 lett. a) | Accessibilità completa e tempestiva alle autorità | PP | API di lettura ed export JSON di backup. Manca un export formale per l'ispezione |
| art. 32 co. 2 lett. b) | Acquisizione entro 30 giorni | P | `data_acquisizione` e scadenza `ACQUISIZIONE_CONSERVAZIONE` |
| art. 32 co. 2 lett. c) | Integrità e non alterabilità dopo l'acquisizione | P | SHA-256 su ogni documento; trigger di immutabilità su valutazioni e autovalutazioni firmate; `audit_log` append-only |
| art. 32 co. 2 lett. d) | Trasparenza, completezza e storicità | P | versionamento delle valutazioni; storicizzazione della titolarità effettiva con `valido_dal` / `valido_al` |
| art. 32 co. 2 | Indicazione dei soggetti legittimati ad alimentare e accedere | P | ruoli in `utenti`; `audit_log` concatenato via hash, con verifica in `GET /api/audit/verifica` |

## Titolo II Capi III-IV — segnalazione e astensione

| Norma | Obbligo | Copertura | Dove |
|---|---|---|---|
| art. 35 co. 1 | Segnalazione senza ritardo in presenza di sospetto; il contante ricorrente è elemento di sospetto | P | modulo SOS; messaggio esplicito in `verificaContante` |
| art. 35 co. 2 | Divieto di compiere l'operazione prima della segnalazione, con le eccezioni di legge | P | campi `operazione_eseguita` e `motivo_esecuzione`, promemoria in risposta |
| art. 35 co. 3 | Contenuto: dati, descrizione dell'operazione e motivi del sospetto | P | l'API rifiuta con 400 la SOS priva di descrizione o motivi |
| art. 35 co. 5 | Esonero per le informazioni acquisite nell'esame della posizione giuridica | PP | circostanza `esameposizioneGiuridica`, con effetto segnaletico |
| art. 37 co. 1 | Trasmissione diretta alla UIF o tramite organismo di autoregolamentazione | P | campo `canale` |
| art. 38 | Riservatezza dell'identità del segnalante | P | accesso alle SOS ristretto al ruolo TITOLARE; `segnalante_id` mai restituito dalle API; contenuto cifrato AES-GCM con chiave derivata per tenant |
| art. 39 | Divieto di comunicare al cliente l'avvenuta segnalazione | PP | promemoria alla creazione. Nessun presidio tecnico possibile |
| art. 42 co. 1-2 | Obbligo di astensione e valutazione della SOS | P | tabella `astensioni` con fondamento normativo obbligatorio; vincoli `IMPOSSIBILITA_VERIFICA` ed `ENTITA_PAESE_ALTO_RISCHIO` |
| art. 42 co. 3 | Esonero dall'astensione per l'esame della posizione giuridica | PP | circostanza dedicata |

## Titolo III — limitazioni all'uso del contante

| Norma | Obbligo | Copertura | Dove |
|---|---|---|---|
| art. 49 co. 1 e 3-bis | Divieto di trasferimento pari o superiore alla soglia, con la storia delle modifiche | P | `norme.ts` → serie temporale `CONTANTE` (3.000 → 2.000 dal 1.7.2020 → 5.000 dal 1.1.2023) |
| art. 49 co. 2 | Rimessa di denaro: 1.000 euro | P | serie `RIMESSA_DENARO` |
| art. 49 co. 3 | Negoziazione a pronti in valuta: 3.000 euro, con la parentesi 2020-2022 a 2.000 | P | serie `NEGOZIAZIONE_VALUTA` |
| art. 49 co. 5 e 8 | Assegni: beneficiario e non trasferibilità da 1.000 euro | PP | soglia censita; nessun controllo automatico sugli assegni in v1 |
| art. 49 co. 13 | Inapplicabilità quando è parte un intermediario | P | opzione `intermediarioParte` |
| art. 51 | Comunicazione al MEF entro 30 giorni | PP | scadenza generata e campo `comunicazione_mef`. L'invio via SIAR resta manuale |

## Fuori perimetro nella v1

| Ambito | Motivo |
|---|---|
| art. 34-bis, organismo di gestione accentrata | Riguarda i notai |
| art. 43-45-bis, prestatori di servizi di pagamento e cripto | Non applicabile ai commercialisti |
| art. 47, comunicazioni oggettive | Non ancora attuato per i professionisti |
| art. 48, canale interno di segnalazione delle violazioni | Da valutare per gli studi strutturati (piano Avanzata) |
| artt. 55-69, sanzioni | Il software non calcola sanzioni: le richiama nei messaggi ma non le liquida |

## Punti aperti da chiudere prima della vendita

1. **Indicatori di anomalia UIF 21-32.** I titoli letterali del provvedimento 12.5.2023 non sono
   stati riscontrati integralmente: le voci sono marcate `verificato: false` e l'interfaccia le
   segnala. Vanno completate dall'allegato ufficiale, insieme ai circa 400 sub-indici, che sono
   il livello operativamente utile. Un indicatore citato male in una segnalazione è peggio di un
   indicatore mancante.
2. **Sub-descrittori dei punteggi 1-4 delle Tabelle A e B.** Le regole tecniche non li
   esemplificano: stanno nella modulistica allegata all'Informativa CNDCEC n. 57 del 26.3.2026.
   Finché non sono caricati, la scala resta a giudizio del professionista, il che è legittimo ma
   meno guidato.
3. **Periodicità del controllo costante (36/24/12/6 mesi).** Non è un termine di legge. È
   implementata come parametro di studio e marcata come tale in interfaccia; va confermata con
   la modulistica CNDCEC prima di presentarla come standard di categoria.
4. **Registro dei titolari effettivi.** Il DLgs. 122/2026, in vigore dal 23.7.2026, ha sbloccato
   il quadro normativo, ma l'accesso dei soggetti obbligati non è ancora operativo: attende i
   provvedimenti attuativi (specifiche tecniche, disciplinare del DM MEF 55/2022, provvedimento
   di apertura del sistema di accesso). I campi ci sono; l'integrazione va attivata quando il
   canale esiste. Va aggiunto il workflow di segnalazione delle incongruenze, che il decreto
   pone a carico dei soggetti obbligati.
5. **Orizzonte 10 luglio 2027.** Il Regolamento (UE) 2024/1624 sostituirà il DLgs. 231/2007 e le
   regole tecniche andranno riemanate. Per questo pesi, soglie e catalogo delle prestazioni sono
   in un ruleset versionato e i fascicoli conservano il `ruleset_id` con cui sono stati valutati:
   aggiungere il ruleset 2027 sarà un file nuovo, non una riscrittura.
