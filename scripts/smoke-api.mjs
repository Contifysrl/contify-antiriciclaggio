/**
 * Smoke test end-to-end contro `wrangler dev`.
 * Percorre il ciclo reale: accesso, autovalutazione, cliente, titolarità
 * effettiva, fascicolo, valutazione con vincolo PEP, firma, immutabilità,
 * operazione in contante, astensione, SOS, integrità del registro.
 *
 *   npx wrangler dev --port 8787 --local
 *   node scripts/smoke-api.mjs
 */

const BASE = process.env.BASE ?? 'http://localhost:8787';
let cookie = '';
let falliti = 0;
let passati = 0;

async function req(metodo, percorso, corpo) {
  const r = await fetch(`${BASE}/api${percorso}`, {
    method: metodo,
    headers: { ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const t = await r.text();
  return { stato: r.status, dati: t ? JSON.parse(t) : null };
}

function verifica(descrizione, condizione, contesto) {
  if (condizione) {
    passati++;
    console.log(`  ok   ${descrizione}`);
  } else {
    falliti++;
    console.log(`  FAIL ${descrizione}`);
    if (contesto !== undefined) console.log(`       ${JSON.stringify(contesto).slice(0, 400)}`);
  }
}

console.log('\n== Accesso ==');
{
  const r = await req('POST', '/auth/login', { email: 'titolare@studiodemo.it', password: 'sbagliata' });
  verifica('credenziali errate respinte con 401', r.stato === 401, r.dati);
}
{
  const r = await req('POST', '/auth/login', { email: 'titolare@studiodemo.it', password: 'Antiriciclaggio!2026' });
  verifica('accesso del titolare riuscito', r.stato === 200 && r.dati.utente.ruolo === 'TITOLARE', r.dati);
  verifica('lo studio arriva dal database, non dal client', r.dati?.studio?.denominazione === 'Studio Commercialista Demo');
}

console.log('\n== Autovalutazione dello studio (artt. 15-16) ==');
let idAutoval;
{
  const r = await req('POST', '/studio/autovalutazioni', {
    inerente: { tipologia_clientela: 3, area_geografica: 2, canali_distributivi: 2, servizi_offerti: 3 },
    vulnerabilita: { formazione: 2, organizzazione_adeguata_verifica: 2, organizzazione_conservazione: 2, organizzazione_sos: 2 },
    note: 'Prima autovalutazione, collaudo.',
  });
  idAutoval = r.dati?.id;
  // inerente = 10/4 = 2,5 · vulnerabilità = 2 · residuo = 2,5x0,4 + 2x0,6 = 2,2
  verifica('rischio inerente calcolato come media semplice', r.dati?.esito?.rischioInerente === 2.5, r.dati?.esito);
  verifica('rischio residuo ponderato 40/60', r.dati?.esito?.rischioResiduo === 2.2, r.dati?.esito);
  verifica('classe poco significativa', r.dati?.esito?.classe === 'POCO_SIGNIFICATIVO');
}
{
  const r = await req('POST', '/studio/autovalutazioni', { inerente: { tipologia_clientela: 3 }, vulnerabilita: {} });
  verifica('input incompleto respinto con messaggio di dominio', r.stato === 400 && /Area geografica/.test(r.dati?.errore ?? ''), r.dati);
}
{
  const r = await req('POST', `/studio/autovalutazioni/${idAutoval}/firma`);
  verifica('firma registrata', r.stato === 200, r.dati);
  const r2 = await req('POST', `/studio/autovalutazioni/${idAutoval}/firma`);
  verifica('seconda firma rifiutata con 409', r2.stato === 409, r2.dati);
}

console.log('\n== Titolarità effettiva (art. 20) ==');
{
  const r = await req('POST', '/clienti/cli_alfa/titolarita/analizza', {
    idCliente: 'ALFA',
    nodi: [
      { id: 'ALFA', denominazione: 'Alfa Costruzioni Srl', tipo: 'PERSONA_GIURIDICA', partecipazioni: [{ id: 'HOLD', quota: 0.6 }, { id: 'VERDI', quota: 0.4 }] },
      { id: 'HOLD', denominazione: 'Holding Spa', tipo: 'PERSONA_GIURIDICA', partecipazioni: [{ id: 'ROSSI', quota: 0.7 }, { id: 'NERI', quota: 0.3 }] },
      { id: 'ROSSI', denominazione: 'Mario Rossi', tipo: 'PERSONA_FISICA' },
      { id: 'NERI', denominazione: 'Anna Neri', tipo: 'PERSONA_FISICA' },
      { id: 'VERDI', denominazione: 'Ugo Verdi', tipo: 'PERSONA_FISICA' },
    ],
  });
  const rossi = r.dati?.titolari?.find((t) => t.id === 'ROSSI');
  verifica('quota indiretta calcolata sulla catena (0,6 x 0,7 = 0,42)', rossi?.quotaEffettiva === 0.42, r.dati?.titolari);
  verifica('sotto il 25% non è titolare effettivo (Neri 18%)', !r.dati?.titolari?.some((t) => t.id === 'NERI'));
  verifica('Verdi al 40% è titolare effettivo diretto', r.dati?.titolari?.some((t) => t.id === 'VERDI'));
}
{
  const r = await req('POST', '/clienti/cli_alfa/titolarita', {
    titolari: [
      { nominativo: 'Mario Rossi', criterio: 'PROPRIETA_INDIRETTA', norma: 'art. 20 co. 2 lett. b) DLgs. 231/2007', quota: 0.42, motivazione: 'Partecipazione indiretta del 42% tramite Holding Spa.' },
    ],
    registroConsultato: false,
  });
  verifica('titolarità effettiva registrata', r.stato === 200, r.dati);
}
{
  const r = await req('POST', '/clienti/cli_alfa/titolarita', {
    titolari: [{ nominativo: 'X', criterio: 'RESIDUALE_POTERI', norma: 'art. 20 co. 5' }],
  });
  verifica('criterio residuale senza motivazione respinto (art. 20 co. 6)', r.stato === 400 && /co. 6/.test(r.dati?.errore ?? ''), r.dati);
}

console.log('\n== Fascicolo e valutazione del rischio ==');
let idFascicolo;
{
  const r = await req('POST', '/fascicoli', {
    clienteId: 'cli_alfa',
    prestazioneCodice: 'FINANZA_STRAORDINARIA',
    tipoRapporto: 'CONTINUATIVO',
    dataConferimento: '2026-07-01',
    scopoNatura: 'Assistenza in operazione di conferimento di ramo d’azienda.',
    modalitaIdentificazione: 'PRESENZA',
  });
  idFascicolo = r.dati?.id;
  verifica('fascicolo creato con codice progressivo annuale', /^2026\/\d{4}$/.test(r.dati?.codice ?? ''), r.dati);
}
{
  const r = await req('POST', '/fascicoli', {
    clienteId: 'cli_beta', prestazioneCodice: 'DICHIARAZIONI_FISCALI', tipoRapporto: 'CONTINUATIVO', dataConferimento: '2026-07-01',
  });
  verifica('prestazione esente segnala l’art. 17 co. 7', (r.dati?.avvisi ?? []).some((a) => /17 co. 7/.test(a)), r.dati?.avvisi);
}
{
  const r = await req('POST', '/fascicoli', {
    clienteId: 'cli_beta', prestazioneCodice: 'CONSULENZA_TRIBUTARIA', tipoRapporto: 'OCCASIONALE',
    importoOperazione: 20000, dataConferimento: '2026-07-01',
  });
  verifica('operazione occasionale sopra 15.000 euro segnalata', (r.dati?.avvisi ?? []).some((a) => /15000|15\.000/.test(a)), r.dati?.avvisi);
}

let idValutazione;
{
  const A = { natura_giuridica: 2, prevalente_attivita: 2, comportamento: 2, area_geografica_cliente: 2 };
  const B = { tipologia: 2, modalita_svolgimento: 2, ammontare: 2, frequenza_durata: 2, ragionevolezza: 2, area_geografica_destinazione: 2 };
  const r = await req('POST', `/fascicoli/${idFascicolo}/valutazioni`, { tabellaA: A, tabellaB: B, circostanze: {} });
  idValutazione = r.dati?.id;
  // specifico = 20/10 = 2 · effettivo = 4x0,3 + 2x0,7 = 2,6 -> abbastanza significativo
  verifica('rischio specifico = (ΣA + ΣB)/10', r.dati?.esito?.rischioSpecifico === 2, r.dati?.esito);
  verifica('rischio effettivo ponderato 30/70', r.dati?.esito?.rischioEffettivo === 2.6, r.dati?.esito);
  verifica('classe abbastanza significativa nonostante i float', r.dati?.esito?.classe === 'ABBASTANZA_SIGNIFICATIVO');
  // Riferimento CNDCEC (Informativa 57/2026): verifica ordinaria -> 24 mesi.
  verifica('controllo costante a 24 mesi (verifica ordinaria)', r.dati?.esito?.controlloCostanteMesi === 24);
}
{
  const A = { natura_giuridica: 1, prevalente_attivita: 1, comportamento: 1, area_geografica_cliente: 1 };
  const B = { tipologia: 1, modalita_svolgimento: 1, ammontare: 1, frequenza_durata: 1, ragionevolezza: 1, area_geografica_destinazione: 1 };
  const r = await req('POST', '/strumenti/simula-rischio', {
    prestazioneCodice: 'CONSULENZA_TRIBUTARIA', tabellaA: A, tabellaB: B, circostanze: { pep: true },
  });
  verifica('il punteggio darebbe semplificata', r.dati?.livelloCalcolato === 'SEMPLIFICATA', r.dati);
  verifica('la PEP impone la rafforzata (art. 24 co. 5 lett. c)', r.dati?.livelloApplicabile === 'RAFFORZATA');
  verifica('lo scostamento è dichiarato', r.dati?.livelloInnalzatoDaNorma === true);
}
{
  const r = await req('POST', `/fascicoli/${idFascicolo}/valutazioni/${idValutazione}/firma`);
  verifica('valutazione firmata dal titolare', r.stato === 200, r.dati);
}

console.log('\n== Limiti all’uso del contante (art. 49) ==');
{
  const r = await req('POST', '/strumenti/contante', { importo: 3000, data: '2021-09-15' });
  verifica('3.000 euro nel 2021 violano la soglia di 2.000', r.dati?.conforme === false && r.dati?.soglia === 2000, r.dati);
}
{
  const r = await req('POST', '/strumenti/contante', { importo: 3000, data: '2026-07-29' });
  verifica('3.000 euro oggi sono consentiti (soglia 5.000)', r.dati?.conforme === true && r.dati?.soglia === 5000, r.dati);
}
{
  const r = await req('POST', `/fascicoli/${idFascicolo}/operazioni`, {
    dataOperazione: '2026-07-10', descrizione: 'Acconto in contante', importo: 7000, mezzoPagamento: 'CONTANTE',
  });
  verifica('operazione oltre soglia registrata come violazione', r.dati?.esitoContante?.conforme === false, r.dati);
  verifica('scadenza MEF a 30 giorni', r.dati?.scadenzaComunicazioneMef?.data === '2026-08-09', r.dati?.scadenzaComunicazioneMef);
}

console.log('\n== Astensione e segnalazione (artt. 42, 35-39) ==');
{
  const r = await req('POST', `/fascicoli/${idFascicolo}/astensione`, {
    fondamento: 'ART_42_CO_1', motivazione: 'Impossibilità di acquisire i dati sul titolare effettivo entro trenta giorni.', sosValutata: true,
  });
  verifica('astensione registrata con promemoria sulla SOS', r.stato === 201 && /art. 35/.test(r.dati?.promemoria ?? ''), r.dati);
}
{
  const r = await req('POST', '/sos', {
    fascicoloId: idFascicolo, clienteId: 'cli_alfa', dataRilevazione: '2026-07-15',
    descrizioneOperazione: 'Versamenti frazionati in contante non coerenti con il volume d’affari dichiarato.',
    motiviSospetto: 'Frazionamento artificioso e incoerenza con il profilo economico.',
    indicatori: [9, 13, 20],
  });
  verifica('SOS creata con protocollo annuale', /^SOS-2026-\d{3}$/.test(r.dati?.protocollo ?? ''), r.dati);
  verifica('promemoria sul divieto di comunicazione (art. 39)', (r.dati?.promemoria ?? []).some((p) => /art\. 39/i.test(p)), r.dati?.promemoria);
}
{
  const r = await req('GET', '/sos');
  verifica('elenco SOS non espone il segnalante né il contenuto', r.stato === 200 && r.dati.length === 1 && !('segnalante_id' in r.dati[0]) && !('contenuto_cifrato' in r.dati[0]), r.dati?.[0]);
}

console.log('\n== Verbali stampabili (.docx) ==');
async function reqDocx(percorso) {
  const r = await fetch(`${BASE}/api${percorso}`, { headers: cookie ? { Cookie: cookie } : {} });
  const buf = new Uint8Array(await r.arrayBuffer());
  return { stato: r.status, tipo: r.headers.get('Content-Type') ?? '', nome: r.headers.get('Content-Disposition') ?? '', bytes: buf };
}
{
  const r = await reqDocx(`/studio/autovalutazioni/${idAutoval}/verbale`);
  verifica('verbale di autovalutazione: 200, content-type docx, archivio ZIP', r.stato === 200 && r.tipo.includes('wordprocessingml') && r.bytes[0] === 0x50 && r.bytes[1] === 0x4b, { stato: r.stato, tipo: r.tipo });
  verifica('verbale di autovalutazione: nome file con versione', /verbale-autovalutazione-v\d+\.docx/.test(r.nome), r.nome);
}
{
  const r = await reqDocx(`/fascicoli/${idFascicolo}/scheda-verifica`);
  verifica('scheda di adeguata verifica scaricabile', r.stato === 200 && r.bytes.length > 30000, { stato: r.stato, dimensione: r.bytes.length });
}
{
  const elenco = await req('GET', `/fascicoli/${idFascicolo}/astensioni`);
  verifica('elenco astensioni del fascicolo', elenco.stato === 200 && elenco.dati.length === 1, elenco.dati);
  const r = await reqDocx(`/fascicoli/${idFascicolo}/astensioni/${elenco.dati[0].id}/verbale`);
  verifica('verbale di astensione scaricabile', r.stato === 200 && r.bytes[0] === 0x50, { stato: r.stato });
}
{
  const r = await reqDocx(`/fascicoli/${idFascicolo}/fascicolo-ispezione`);
  verifica('fascicolo per l’ispezione scaricabile', r.stato === 200 && r.bytes.length > 30000, { stato: r.stato, dimensione: r.bytes.length });
  // Il fascicolo non deve mai contenere il protocollo delle SOS (artt. 38-39):
  // si decomprime davvero l'archivio, un semplice scan dei byte compressi
  // darebbe una falsa sicurezza.
  const { unzipSync, strFromU8 } = await import('fflate');
  const doc = strFromU8(unzipSync(r.bytes)['word/document.xml']);
  verifica('il fascicolo non espone protocolli SOS', !doc.includes('SOS-2026'));
  verifica('il fascicolo contiene il verbale di astensione', doc.includes('Verbale di astensione'));
  verifica('il fascicolo dichiara l’integrità del registro', doc.includes('catena crittografica'));
}

console.log('\n== Segregazione per ruolo ==');
{
  await req('POST', '/auth/logout');
  await req('POST', '/auth/login', { email: 'collaboratore@studiodemo.it', password: 'Collab!2026' });
  const r = await req('GET', '/sos');
  verifica('il collaboratore non accede alle SOS (art. 38)', r.stato === 403, r.dati);
  const r2 = await req('POST', `/fascicoli/${idFascicolo}/valutazioni/${idValutazione}/firma`);
  verifica('il collaboratore non firma le valutazioni', r2.stato === 403, r2.dati);
  const r3 = await req('GET', '/clienti');
  verifica('il collaboratore vede comunque i clienti', r3.stato === 200 && r3.dati.length >= 2);
}

console.log('\n== Gestione utenti e password (AR-M3) ==');
let passwordTemporanea;
let idNuovoUtente;
{
  await req('POST', '/auth/logout');
  await req('POST', '/auth/login', { email: 'titolare@studiodemo.it', password: 'Antiriciclaggio!2026' });
  const r = await req('GET', '/utenti');
  verifica('elenco utenti riservato al titolare', r.stato === 200 && r.dati.length >= 2, r.dati);
  const r2 = await req('POST', '/utenti', { nome: 'Rita Revisora', email: 'revisora.smoke@test.it', ruolo: 'REVISORE' });
  verifica('utente creato con password temporanea monouso', r2.stato === 201 && typeof r2.dati?.passwordTemporanea === 'string' && r2.dati.passwordTemporanea.length >= 12, r2.dati);
  passwordTemporanea = r2.dati?.passwordTemporanea;
  idNuovoUtente = r2.dati?.id;
  const r3 = await req('POST', '/utenti', { nome: 'Doppione', email: 'revisora.smoke@test.it', ruolo: 'LETTORE' });
  verifica('email duplicata respinta con 409', r3.stato === 409, r3.dati);
}
{
  // Il titolare non può lasciare lo studio senza titolari attivi.
  const elenco = await req('GET', '/utenti');
  const io = elenco.dati.find((u) => u.email === 'titolare@studiodemo.it');
  const r = await req('POST', `/utenti/${io.id}`, { attivo: false });
  verifica('lo studio non resta mai senza un titolare attivo', r.stato === 409, r.dati);
}
{
  // Primo accesso del nuovo utente: password temporanea + cambio obbligato.
  await req('POST', '/auth/logout');
  const r = await req('POST', '/auth/login', { email: 'revisora.smoke@test.it', password: passwordTemporanea });
  verifica('primo accesso con password temporanea', r.stato === 200 && r.dati?.utente?.cambioPasswordRichiesto === true, r.dati);
  const corta = await req('POST', '/auth/cambia-password', { attuale: passwordTemporanea, nuova: 'corta' });
  verifica('password nuova troppo corta respinta', corta.stato === 400, corta.dati);
  const r2 = await req('POST', '/auth/cambia-password', { attuale: passwordTemporanea, nuova: 'RevisoraNuova!1' });
  verifica('cambio password al primo accesso', r2.stato === 200, r2.dati);
  const io = await req('GET', '/auth/io');
  verifica('obbligo di cambio azzerato dopo il cambio', io.dati?.utente?.cambioPasswordRichiesto === false, io.dati);
}
{
  // Reset self-service: la richiesta risponde sempre ok (niente enumerazione);
  // un token inventato viene rifiutato senza rivelare nulla.
  const r = await req('POST', '/auth/password-dimenticata', { email: 'inesistente@test.it' });
  verifica('password dimenticata: risposta identica anche per email ignote', r.stato === 200 && r.dati?.ok === true, r.dati);
  const r2 = await req('POST', '/auth/reset-password', { token: 'x'.repeat(43), nuova: 'NuovaPassword!1' });
  verifica('token di reset inventato respinto', r2.stato === 400, r2.dati);
}
{
  // Reset amministrativo: revoca le sessioni e impone il cambio.
  await req('POST', '/auth/logout');
  await req('POST', '/auth/login', { email: 'titolare@studiodemo.it', password: 'Antiriciclaggio!2026' });
  const r = await req('POST', `/utenti/${idNuovoUtente}/reset-password`);
  verifica('reset amministrativo genera nuova password temporanea', r.stato === 200 && typeof r.dati?.passwordTemporanea === 'string', r.dati);
  const r2 = await req('POST', `/utenti/${idNuovoUtente}`, { attivo: false });
  verifica('utente disattivabile dal titolare', r2.stato === 200, r2.dati);
}
{
  const r = await req('POST', '/auth/avatar', { avatar: 'data:image/jpeg;base64,' + 'A'.repeat(64) });
  verifica('foto profilo salvata', r.stato === 200, r.dati);
  const io = await req('GET', '/auth/io');
  verifica('la foto torna nella sessione', typeof io.dati?.utente?.avatar === 'string', io.dati?.utente?.avatar?.slice(0, 30));
}

console.log('\n== Integrità del registro (art. 32) ==');
{
  await req('POST', '/auth/logout');
  await req('POST', '/auth/login', { email: 'titolare@studiodemo.it', password: 'Antiriciclaggio!2026' });
  const r = await req('GET', '/audit/verifica');
  verifica('catena degli accessi integra', r.dati?.integra === true, r.dati);
  verifica('la catena copre tutte le scritture del collaudo', (r.dati?.righeVerificate ?? 0) >= 15, r.dati);
  const log = await req('GET', '/audit');
  verifica('il registro non contiene il contenuto delle SOS', !JSON.stringify(log.dati).includes('Frazionamento artificioso'));
}

console.log('\n== Guida, assistenza ed export registro (AR-M5) ==');
{
  // Assistenza: campi obbligatori, invio registrato (senza corpo nel registro).
  const rNo = await req('POST', '/assistenza', { oggetto: '', messaggio: '' });
  verifica('assistenza senza oggetto respinta', rNo.stato === 400, rNo.dati);
  const r = await req('POST', '/assistenza', { oggetto: 'Prova collaudo', messaggio: 'Messaggio di prova del collaudo automatico.' });
  verifica('richiesta di assistenza accettata', r.stato === 200 && r.dati?.ok === true, r.dati);
  verifica('la risposta dice se l’email è partita', typeof r.dati?.emailInviata === 'boolean', r.dati);
  const log = await req('GET', '/audit');
  const voce = (log.dati ?? []).find((v) => v.azione === 'RICHIESTA_ASSISTENZA');
  verifica('l’assistenza è tracciata nel registro', Boolean(voce), voce);
  verifica('il corpo del messaggio NON è nel registro', !JSON.stringify(log.dati).includes('Messaggio di prova del collaudo'));
}
{
  // Export CSV del registro: intestazione, impronte, BOM per Excel.
  const r = await fetch(`${BASE}/api/audit/export`, { headers: { Cookie: cookie } });
  const grezzo = new Uint8Array(await r.arrayBuffer());
  const testo = new TextDecoder().decode(grezzo);
  verifica('export CSV del registro: 200 e content-type csv', r.status === 200 && (r.headers.get('Content-Type') ?? '').includes('csv'));
  // text() striperebbe il BOM: si controllano i byte grezzi (EF BB BF).
  verifica('il CSV parte con il BOM UTF-8 (Excel)', grezzo[0] === 0xef && grezzo[1] === 0xbb && grezzo[2] === 0xbf);
  verifica('il CSV ha intestazione e impronte della catena', testo.includes('hash riga') && testo.includes('LOGIN'));
  verifica('il CSV non contiene il contenuto delle SOS', !testo.includes('Frazionamento artificioso'));
  const log = await req('GET', '/audit');
  verifica('anche l’esportazione è tracciata', (log.dati ?? []).some((v) => v.azione === 'ESPORTA_REGISTRO'), null);
}

console.log('\n== Logo dello studio e ciclo commerciale (AR-M6) ==');
{
  const PNG_1x1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const rNo = await req('POST', '/studio/logo', { logo: 'data:image/jpeg;base64,xxxx' });
  verifica('logo non-PNG respinto', rNo.stato === 400, rNo.dati);

  const r = await req('POST', '/studio/logo', { logo: PNG_1x1, larghezza: 1, altezza: 1 });
  verifica('logo dello studio caricato', r.stato === 200 && r.dati?.ok === true, r.dati);
  const io = await req('GET', '/auth/io');
  verifica('il logo torna nella sessione', typeof io.dati?.studio?.logo === 'string', io.dati?.studio);
  verifica('la sessione riporta lo stato commerciale', io.dati?.studio?.stato === 'attivo', io.dati?.studio);

  // Il verbale ora incorpora il logo dello studio nell'intestazione.
  const { unzipSync, strFromU8 } = await import('fflate');
  const doc = await reqDocx(`/studio/autovalutazioni/${idAutoval}/verbale`);
  const conLogo = unzipSync(doc.bytes);
  verifica('il verbale incorpora il logo dello studio', 'word/media/logo-studio.png' in conLogo);
  verifica('l’header referenzia il logo dello studio', strFromU8(conLogo['word/header1.xml']).includes('rIdLogoStudio'));

  const rVia = await req('POST', '/studio/logo', { logo: null });
  verifica('logo rimosso', rVia.stato === 200 && rVia.dati?.logo === null, rVia.dati);
  const doc2 = await reqDocx(`/studio/autovalutazioni/${idAutoval}/verbale`);
  verifica('senza logo il verbale torna alla sola intestazione Contify', !('word/media/logo-studio.png' in unzipSync(doc2.bytes)));
}

console.log('\n== Backup, ripristino ed eliminazione archivio (AR-M4) ==');
let chiaveBackupManuale;
{
  // Backup manuale: chiave nel prefisso dello studio, righe contate.
  const r = await req('POST', '/backup');
  verifica('backup manuale eseguito', r.stato === 201 && typeof r.dati?.key === 'string' && r.dati.key.startsWith('tenant/'), r.dati);
  verifica('il backup contiene le righe dell’archivio', (r.dati?.righe ?? 0) > 10, r.dati);
  verifica('il primo backup del mese scrive anche il mensile', r.dati?.mensileScritto === null || String(r.dati?.mensileScritto).includes('/monthly/'), r.dati);
  chiaveBackupManuale = r.dati?.key;
}
{
  const r = await req('GET', '/backup');
  verifica('elenco dei backup dello studio', r.stato === 200 && r.dati.backups.some((b) => b.key === chiaveBackupManuale), r.dati);
  const rScarica = await fetch(`${BASE}/api/backup/scarica?key=${encodeURIComponent(chiaveBackupManuale)}`, { headers: { Cookie: cookie } });
  verifica('download del backup (.json.gz)', rScarica.status === 200 && (rScarica.headers.get('Content-Type') ?? '').includes('gzip'));
  const rAltrui = await req('GET', `/backup/scarica?key=${encodeURIComponent('tenant/altro-studio/daily/archivio-2026-01-01.json.gz')}`);
  verifica('chiave di un altro studio respinta', rAltrui.stato === 400, rAltrui.dati);
}
let clientiPrima;
{
  // Ripristino: un cliente creato DOPO il backup deve sparire.
  clientiPrima = (await req('GET', '/clienti')).dati.length;
  const r = await req('POST', '/clienti', { tipo: 'PERSONA_FISICA', denominazione: 'Cliente Da Ripristino', codiceFiscale: 'RPRTST80A01H501X' });
  verifica('cliente usa-e-getta creato dopo il backup', r.stato === 201 || r.stato === 200, r.dati);
  verifica('il cliente in più è nell’archivio', (await req('GET', '/clienti')).dati.length === clientiPrima + 1);

  const rNo = await req('POST', '/backup/ripristina', { key: chiaveBackupManuale, conferma: 'ripristina tutto' });
  verifica('ripristino senza parola esatta respinto', rNo.stato === 400, rNo.dati);

  const rSi = await req('POST', '/backup/ripristina', { key: chiaveBackupManuale, conferma: 'RIPRISTINA' });
  verifica('ripristino eseguito', rSi.stato === 200 && (rSi.dati?.righeRipristinate ?? 0) > 10, rSi.dati);
  verifica('fotografia pre-ripristino creata', String(rSi.dati?.backupPreRipristino ?? '').includes('/pre-ripristino/'), rSi.dati);
  verifica('l’archivio è tornato alla fotografia', (await req('GET', '/clienti')).dati.length === clientiPrima);

  const audit = await req('GET', '/audit/verifica');
  verifica('la catena del registro resta integra dopo il ripristino', audit.dati?.integra === true, audit.dati);
}
{
  // Eliminazione archivio: parola obbligatoria, backup preventivo, tutto svuotato.
  const rNo = await req('POST', '/backup/elimina-archivio', { conferma: 'ELIMINA TUTTO' });
  verifica('eliminazione senza parola esatta respinta', rNo.stato === 400, rNo.dati);

  const r = await req('POST', '/backup/elimina-archivio', { conferma: 'ELIMINA' });
  verifica('archivio eliminato con conteggio', r.stato === 200 && (r.dati?.totale ?? 0) > 10, r.dati);
  verifica('fotografia pre-eliminazione creata', String(r.dati?.backupPreEliminazione ?? '').includes('/pre-eliminazione/'), r.dati);
  verifica('dopo l’eliminazione non restano clienti', (await req('GET', '/clienti')).dati.length === 0);
  verifica('dopo l’eliminazione non restano fascicoli', (await req('GET', '/fascicoli')).dati.length === 0);

  // Reversibilità: dal backup pre-eliminazione si torna indietro.
  const elenco = await req('GET', '/backup');
  const pre = elenco.dati.backups.find((b) => b.tipo === 'pre-eliminazione');
  verifica('il backup pre-eliminazione è in elenco', Boolean(pre), elenco.dati);
  const rTorna = await req('POST', '/backup/ripristina', { key: pre.key, conferma: 'RIPRISTINA' });
  verifica('l’eliminazione è reversibile dal backup', rTorna.stato === 200 && (await req('GET', '/clienti')).dati.length === clientiPrima, rTorna.dati);

  const audit = await req('GET', '/audit/verifica');
  verifica('la catena del registro resta integra dopo l’eliminazione', audit.dati?.integra === true, audit.dati);
}
{
  // Le operazioni sui backup sono riservate al titolare.
  await req('POST', '/auth/logout');
  await req('POST', '/auth/login', { email: 'collaboratore@studiodemo.it', password: 'Collab!2026' });
  const r = await req('GET', '/backup');
  verifica('i backup sono riservati al titolare', r.stato === 403, r.dati);
  const r2 = await req('POST', '/backup/elimina-archivio', { conferma: 'ELIMINA' });
  verifica('l’eliminazione è riservata al titolare', r2.stato === 403, r2.dati);
}

console.log('\n== Sessione ==');
{
  await req('POST', '/auth/logout');
  const r = await req('GET', '/cruscotto');
  verifica('dopo il logout le API rispondono 401', r.stato === 401, r.dati);
}

console.log(`\n${passati} verifiche superate, ${falliti} fallite\n`);
process.exit(falliti === 0 ? 0 : 1);
