/**
 * Smoke test: attivazione di un nuovo studio dalla console.
 *
 *   npx wrangler dev --port 8787 --local   (dopo reset + migrate 0001..0011 + seed)
 *   node scripts/smoke-api-console-studi.mjs
 *
 * Cosa si dimostra:
 *  1. senza sessione console non si crea nulla;
 *  2. i controlli: denominazione obbligatoria, CF/P.IVA nel formato giusto,
 *     email del professionista obbligatoria e unica su tutta la piattaforma,
 *     date del contratto AAAA-MM-GG, posti 1..999;
 *  3. lo studio omonimo è fermato (409 `omonimo`) e passa solo con conferma;
 *  4. la creazione restituisce la password temporanea UNA volta, lo studio
 *     compare in elenco con 1 professionista / 1 utente e il contratto dato;
 *  5. il nuovo titolare entra, è amministratore, deve cambiare password,
 *     e dopo il cambio lavora davvero (crea un collaboratore);
 *  6. il registro del nuovo studio parte da STUDIO_ATTIVATO + CREA_UTENTE;
 *  7. la console corregge l'anagrafica (e la vede nel dettaglio) — con gli
 *     stessi controlli di formato;
 *  8. il tenant demo non è stato toccato;
 *  AR-M21 (CON-01/CON-02, migrazione 0014):
 *  9. reset password di un utente dalla console: la vecchia non entra più, la nuova sì con cambio richiesto,
 *     sessioni precedenti revocate, audit con l'operatore, riga in eventi_console; disattiva → login 403,
 *     riattiva → 200; l'unico amministratore si disattiva solo con «forza»;
 * 10. cancellazione: studio con un cliente → 409 archivio_non_vuoto con i conteggi; studio vuoto (creato
 *     apposta) → cancellato, 404 dopo, email riutilizzabile per un nuovo studio, evento STUDIO_ELIMINATO
 *     con denominazione/P.IVA/email/conteggi/operatore; conferma sbagliata → 400.
 */

const BASE = process.env.BASE ?? 'http://localhost:8787';
let falliti = 0;
let passati = 0;

function verifica(descrizione, condizione, contesto) {
  if (condizione) { passati++; console.log(`  ok   ${descrizione}`); }
  else {
    falliti++;
    console.log(`  FAIL ${descrizione}`);
    if (contesto !== undefined) console.log(`       ${JSON.stringify(contesto).slice(0, 400)}`);
  }
}

function attore() {
  let cookie = '';
  return async (metodo, percorso, corpo) => {
    const r = await fetch(`${BASE}/api${percorso}`, {
      method: metodo,
      headers: { ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const t = await r.text();
    return { stato: r.status, dati: t ? JSON.parse(t) : null };
  };
}

const anonimo = attore();
const operatore = attore();
const titolare = attore();

const suffisso = Date.now().toString(36);
const EMAIL = `bianchi.${suffisso}@studiobianchi.test`;
const corpoBase = () => ({
  denominazione: `Studio Bianchi ${suffisso}`,
  codiceFiscale: '12345678901',
  partitaIva: '12345678901',
  ordineIscrizione: 'ODCEC Verona',
  dataAttivazione: '2026-09-03',
  dataScadenzaCanone: '2027-09-02',
  professionistiInclusi: 2,
  noteContratto: 'Offerta 2026-12',
  professionista: { nome: 'Dott. Luca Bianchi', email: EMAIL, qualifica: 'Dott.', ordine: 'Verona', numeroIscrizione: '999' },
});

console.log('== 1. Senza sessione console ==');
const noAuth = await anonimo('POST', '/console/studi', corpoBase());
verifica('POST /console/studi senza sessione → 401', noAuth.stato === 401, noAuth);

const l = await operatore('POST', '/console/login', { email: 'assistenza@contify.it', password: 'ConsoleSmoke!1' });
verifica('login operatore console', l.stato === 200, l);
const prima = await operatore('GET', '/console/studi');
const nPrima = prima.dati.studi.length;

console.log('\n== 2. Controlli di ingresso ==');
const senzaNome = await operatore('POST', '/console/studi', { ...corpoBase(), denominazione: '  ' });
verifica('denominazione vuota → 400', senzaNome.stato === 400, senzaNome);
const cfErrato = await operatore('POST', '/console/studi', { ...corpoBase(), codiceFiscale: 'ABC' });
verifica('codice fiscale malformato → 400', cfErrato.stato === 400, cfErrato);
const pivaErrata = await operatore('POST', '/console/studi', { ...corpoBase(), partitaIva: '123' });
verifica('partita IVA non a 11 cifre → 400', pivaErrata.stato === 400, pivaErrata);
const senzaEmail = await operatore('POST', '/console/studi', { ...corpoBase(), professionista: { nome: 'X', email: 'niente' } });
verifica('email professionista non valida → 400', senzaEmail.stato === 400, senzaEmail);
const senzaProf = await operatore('POST', '/console/studi', { ...corpoBase(), professionista: { email: EMAIL, nome: '' } });
verifica('nome professionista vuoto → 400', senzaProf.stato === 400, senzaProf);
const emailPresa = await operatore('POST', '/console/studi', { ...corpoBase(), professionista: { nome: 'X', email: 'titolare@studiodemo.it' } });
verifica('email già usata in un altro studio → 409', emailPresa.stato === 409, emailPresa);
const dataErrata = await operatore('POST', '/console/studi', { ...corpoBase(), dataScadenzaCanone: '02/09/2027' });
verifica('data non AAAA-MM-GG → 400', dataErrata.stato === 400, dataErrata);
const postiErrati = await operatore('POST', '/console/studi', { ...corpoBase(), professionistiInclusi: 0 });
verifica('posti 0 → 400', postiErrati.stato === 400, postiErrati);
const dopoErrori = await operatore('GET', '/console/studi');
verifica('nessuno studio creato dai tentativi falliti', dopoErrori.dati.studi.length === nPrima, dopoErrori.dati.studi.length);

console.log('\n== 3. Omonimia ==');
const omonimo = await operatore('POST', '/console/studi', { ...corpoBase(), denominazione: 'studio commercialista DEMO', professionista: { nome: 'X', email: `x.${suffisso}@test.it` } });
verifica('stesso nome del tenant demo → 409 omonimo', omonimo.stato === 409 && omonimo.dati.codice === 'omonimo', omonimo);

console.log('\n== 4. Creazione ==');
const creato = await operatore('POST', '/console/studi', corpoBase());
verifica('POST /console/studi → 201 con id e password temporanea',
  creato.stato === 201 && /^ten_/.test(creato.dati.id) && /^usr_/.test(creato.dati.utenteId) && typeof creato.dati.passwordTemporanea === 'string' && creato.dati.passwordTemporanea.length >= 10, creato);
verifica('la risposta dice se l\'email è partita (boolean)', typeof creato.dati.emailInviata === 'boolean', creato.dati);
const TEN = creato.dati.id;
const PWD = creato.dati.passwordTemporanea;

const elenco = await operatore('GET', '/console/studi');
const riga = elenco.dati.studi.find((s) => s.id === TEN);
verifica('lo studio compare in elenco', !!riga, elenco.dati.studi.map((s) => s.denominazione));
verifica('elenco: attivo, 1 professionista, 1 utente, posti 2, date del contratto',
  riga && riga.stato === 'attivo' && riga.nProfessionisti === 1 && riga.nUtenti === 1 && riga.professionistiInclusi === 2
    && riga.dataAttivazione === '2026-09-03' && riga.dataScadenzaCanone === '2027-09-02' && riga.noteContratto === 'Offerta 2026-12', riga);
verifica('elenco: anagrafica (CF, P.IVA, ordine)', riga && riga.codiceFiscale === '12345678901' && riga.partitaIva === '12345678901' && riga.ordineIscrizione === 'ODCEC Verona', riga);

const dettaglio = await operatore('GET', `/console/studi/${TEN}`);
verifica('GET /console/studi/:id → studio + utenti', dettaglio.stato === 200 && dettaglio.dati.utenti.length === 1
  && dettaglio.dati.utenti[0].email === EMAIL && dettaglio.dati.utenti[0].ruolo === 'TITOLARE' && dettaglio.dati.utenti[0].amministratore === true, dettaglio);
const nonEsiste = await operatore('GET', '/console/studi/ten_nessuno');
verifica('studio inesistente → 404', nonEsiste.stato === 404, nonEsiste);

console.log('\n== 5. Il nuovo titolare entra ==');
const login = await titolare('POST', '/auth/login', { email: EMAIL, password: PWD });
verifica('login con la password temporanea', login.stato === 200, login);
const me = await titolare('GET', '/auth/io');
verifica('è amministratore, titolare, del nuovo studio, con cambio password richiesto',
  me.stato === 200 && me.dati.utente?.ruolo === 'TITOLARE' && me.dati.utente?.amministratore === true
    && me.dati.studio?.id === TEN && me.dati.utente?.cambioPasswordRichiesto === true, me.dati);
const NUOVA = 'NuovaPassword!2026';
const cambio = await titolare('POST', '/auth/cambia-password', { attuale: PWD, nuova: NUOVA });
verifica('cambio password', cambio.stato === 200, cambio);
const me1 = await titolare('GET', '/auth/io');
verifica('dopo il cambio non è più richiesto', me1.dati.utente?.cambioPasswordRichiesto === false, me1.dati.utente);
const clienti = await titolare('GET', '/clienti');
verifica('dopo il cambio: elenco clienti vuoto ma accessibile', clienti.stato === 200 && Array.isArray(clienti.dati) && clienti.dati.length === 0, clienti);
const collab = await titolare('POST', '/utenti', { email: `collab.${suffisso}@studiobianchi.test`, nome: 'Anna Collab', ruolo: 'COLLABORATORE' });
verifica('l\'amministratore crea un collaboratore', collab.stato === 201, collab);
const secondoTit = await titolare('POST', '/utenti', { email: `tit2.${suffisso}@studiobianchi.test`, nome: 'Dott. Due', ruolo: 'TITOLARE' });
verifica('secondo professionista entro i 2 posti a contratto', secondoTit.stato === 201, secondoTit);
const terzoTit = await titolare('POST', '/utenti', { email: `tit3.${suffisso}@studiobianchi.test`, nome: 'Dott. Tre', ruolo: 'TITOLARE' });
verifica('terzo professionista oltre i posti → 409', terzoTit.stato === 409 && terzoTit.dati.postiEsauriti === true, terzoTit);

console.log('\n== 6. Registro ==');
const audit = await titolare('GET', '/audit');
const azioni = (Array.isArray(audit.dati) ? audit.dati : []).map((v) => v.azione);
verifica('registro con STUDIO_ATTIVATO e CREA_UTENTE', audit.stato === 200 && azioni.includes('STUDIO_ATTIVATO') && azioni.includes('CREA_UTENTE'), { stato: audit.stato, azioni: azioni.slice(0, 10) });
const primaVoce = Array.isArray(audit.dati) ? audit.dati[audit.dati.length - 1] : null;
verifica('la prima voce del registro è STUDIO_ATTIVATO', primaVoce?.azione === 'STUDIO_ATTIVATO', primaVoce);

console.log('\n== 7. Anagrafica dalla console ==');
const anagNo = await operatore('POST', `/console/studi/${TEN}/anagrafica`, { partitaIva: '12' });
verifica('P.IVA malformata → 400', anagNo.stato === 400, anagNo);
const anagVuota = await operatore('POST', `/console/studi/${TEN}/anagrafica`, { denominazione: '' });
verifica('denominazione vuota → 400', anagVuota.stato === 400, anagVuota);
const anagOk = await operatore('POST', `/console/studi/${TEN}/anagrafica`, { denominazione: `Studio Bianchi & Neri ${suffisso}`, codiceFiscale: 'bnc lcu 80a01 l781 z', ordineIscrizione: 'ODCEC Vicenza' });
verifica('anagrafica salvata (CF normalizzato maiuscolo senza spazi, P.IVA invariata)',
  anagOk.stato === 200 && anagOk.dati.studio.codiceFiscale === 'BNCLCU80A01L781Z' && anagOk.dati.studio.partitaIva === '12345678901' && anagOk.dati.studio.ordineIscrizione === 'ODCEC Vicenza', anagOk);
const dett2 = await operatore('GET', `/console/studi/${TEN}`);
verifica('il dettaglio riflette la modifica', dett2.dati.studio.denominazione === `Studio Bianchi & Neri ${suffisso}` && dett2.dati.studio.codiceFiscale === 'BNCLCU80A01L781Z', dett2.dati.studio);
const me2 = await titolare('GET', '/auth/io');
verifica('lo studio vede la nuova denominazione', me2.dati.studio?.denominazione === `Studio Bianchi & Neri ${suffisso}`, me2.dati.studio);

console.log('\n== 8. Il tenant demo è intatto ==');
const demo = (await operatore('GET', '/console/studi')).dati.studi.find((s) => s.id === 'ten_demo');
verifica('ten_demo ancora presente con i suoi utenti', demo && demo.nUtenti >= 3, demo);

console.log('\n== 9. CON-02: reset password e stato di un utente dalla console ==');
{
  const utenti = (await operatore('GET', `/console/studi/${TEN}`)).dati.utenti;
  const collabRiga = utenti.find((u) => u.ruolo === 'COLLABORATORE');
  const collabAttore = attore();
  const collabLogin0 = await collabAttore('POST', '/auth/login', { email: collabRiga.email, password: 'x' });
  verifica('preparazione: il collaboratore esiste (login con password sconosciuta → 401)', collabLogin0.stato === 401, collabLogin0);

  // Reset del titolare: la sua sessione (titolare) deve cadere.
  const reset = await operatore('POST', `/console/studi/${TEN}/utenti/${creato.dati.utenteId}/reset-password`, {});
  verifica('reset → nuova password temporanea mostrata una volta', reset.stato === 200 && typeof reset.dati.passwordTemporanea === 'string' && reset.dati.passwordTemporanea.length >= 10 && typeof reset.dati.emailInviata === 'boolean', reset);
  const vecchia = await titolare('GET', '/auth/io');
  verifica('la sessione precedente del titolare è revocata', vecchia.stato === 401, vecchia);
  const conVecchia = await titolare('POST', '/auth/login', { email: EMAIL, password: NUOVA });
  verifica('la vecchia password non entra più (401)', conVecchia.stato === 401, conVecchia);
  const conNuova = await titolare('POST', '/auth/login', { email: EMAIL, password: reset.dati.passwordTemporanea });
  const ioNuova = await titolare('GET', '/auth/io');
  verifica('la nuova entra con cambio password richiesto', conNuova.stato === 200 && ioNuova.dati?.utente?.cambioPasswordRichiesto === true, ioNuova.dati);
  await titolare('POST', '/auth/cambia-password', { attuale: reset.dati.passwordTemporanea, nuova: NUOVA });
  const auditR = (await titolare('GET', '/audit')).dati ?? [];
  const vR = auditR.find((v) => v.azione === 'RESET_PASSWORD_UTENTE');
  verifica('audit RESET_PASSWORD_UTENTE con l’operatore della console', vR && /operatore/.test(vR.dettaglio ?? '') && /console/.test(vR.dettaglio ?? ''), vR);
  const eventi = (await operatore('GET', `/console/eventi?studio=${TEN}`)).dati.eventi;
  verifica('eventi_console: riga RESET_PASSWORD_UTENTE per lo studio', eventi.some((e) => e.azione === 'RESET_PASSWORD_UTENTE' && e.tenantId === TEN && e.dettaglio?.email === EMAIL), eventi);
  const resetIgnoto = await operatore('POST', `/console/studi/${TEN}/utenti/usr_nessuno/reset-password`, {});
  verifica('utente inesistente → 404', resetIgnoto.stato === 404, resetIgnoto);

  // Disattiva / riattiva il collaboratore.
  const off = await operatore('POST', `/console/studi/${TEN}/utenti/${collabRiga.id}/stato`, { attivo: false });
  verifica('disattiva → ok', off.stato === 200 && off.dati.attivo === false, off);
  const resetOff = await operatore('POST', `/console/studi/${TEN}/utenti/${collabRiga.id}/reset-password`, {});
  verifica('reset su utente disattivato → 409', resetOff.stato === 409 && resetOff.dati.codice === 'utente_disattivato', resetOff);
  const on = await operatore('POST', `/console/studi/${TEN}/utenti/${collabRiga.id}/stato`, { attivo: true });
  verifica('riattiva → ok', on.stato === 200 && on.dati.attivo === true, on);
  const resetCollab = await operatore('POST', `/console/studi/${TEN}/utenti/${collabRiga.id}/reset-password`, {});
  const cLogin = await collabAttore('POST', '/auth/login', { email: collabRiga.email, password: resetCollab.dati.passwordTemporanea });
  verifica('il collaboratore riattivato entra con la password del reset', cLogin.stato === 200, cLogin);
  const off2 = await operatore('POST', `/console/studi/${TEN}/utenti/${collabRiga.id}/stato`, { attivo: false });
  const cIo = await collabAttore('GET', '/auth/io');
  verifica('disattivato di nuovo: sessione caduta (401)', off2.stato === 200 && cIo.stato === 401, cIo);
  const cLogin2 = await collabAttore('POST', '/auth/login', { email: collabRiga.email, password: resetCollab.dati.passwordTemporanea });
  verifica('utente disattivato: login respinto', cLogin2.stato === 401 || cLogin2.stato === 403, cLogin2);
  // L'unico amministratore: 409 senza forza, ok con forza, poi riattivato.
  const ultimo = await operatore('POST', `/console/studi/${TEN}/utenti/${creato.dati.utenteId}/stato`, { attivo: false });
  verifica('disattivare l’unico amministratore → 409 ultimo_amministratore', ultimo.stato === 409 && ultimo.dati.codice === 'ultimo_amministratore', ultimo);
  const forzato = await operatore('POST', `/console/studi/${TEN}/utenti/${creato.dati.utenteId}/stato`, { attivo: false, forza: true });
  verifica('…con forza → disattivato', forzato.stato === 200 && forzato.dati.attivo === false, forzato);
  const rientro = await operatore('POST', `/console/studi/${TEN}/utenti/${creato.dati.utenteId}/stato`, { attivo: true });
  verifica('riattivato (entro i posti a contratto)', rientro.stato === 200 && rientro.dati.attivo === true, rientro);
  const eventi2 = (await operatore('GET', `/console/eventi?studio=${TEN}`)).dati.eventi;
  verifica('eventi_console con le righe STATO_UTENTE', eventi2.filter((e) => e.azione === 'STATO_UTENTE').length >= 4, eventi2.length);
}

console.log('\n== 10. CON-01: cancellazione di uno studio creato per errore ==');
{
  // Lo studio Bianchi ha utenti ma nessun cliente: è «vuoto» ai fini dell'archivio. Prima un cliente lo rende non vuoto.
  await titolare('POST', '/auth/login', { email: EMAIL, password: NUOVA });
  const cli = await titolare('POST', '/clienti', { tipo: 'PERSONA_FISICA', denominazione: 'Cliente Di Prova' });
  verifica('preparazione: un cliente nello studio Bianchi', cli.stato === 201, cli);
  const arch = await operatore('GET', `/console/studi/${TEN}/archivio`);
  verifica('GET /archivio: non vuoto, 1 cliente', arch.stato === 200 && arch.dati.vuoto === false && arch.dati.conteggi.clienti === 1, arch.dati);
  const noConf = await operatore('DELETE', `/console/studi/${TEN}`, { conferma: 'Studio Sbagliato' });
  verifica('conferma sbagliata → 400', noConf.stato === 400 && noConf.dati.codice === 'conferma_errata', noConf);
  const denominazioneAttuale = (await operatore('GET', `/console/studi/${TEN}`)).dati.studio.denominazione;
  const pieno = await operatore('DELETE', `/console/studi/${TEN}`, { conferma: denominazioneAttuale });
  verifica('studio con un cliente → 409 archivio_non_vuoto con i conteggi', pieno.stato === 409 && pieno.dati.codice === 'archivio_non_vuoto' && pieno.dati.conteggi.clienti === 1, pieno);
  const ancora = await operatore('GET', `/console/studi/${TEN}`);
  verifica('lo studio è ancora lì', ancora.stato === 200, ancora.stato);

  // Uno studio creato per errore: nasce e si cancella.
  const EMAIL_ERR = `errore.${suffisso}@studioerrato.test`;
  const err = await operatore('POST', '/console/studi', { ...corpoBase(), denominazione: `Studio Errato ${suffisso}`, codiceFiscale: '98765432109', partitaIva: '98765432109', professionista: { ...corpoBase().professionista, email: EMAIL_ERR } });
  verifica('studio creato per errore', err.stato === 201, err);
  const TEN_ERR = err.dati.id;
  const archVuoto = await operatore('GET', `/console/studi/${TEN_ERR}/archivio`);
  verifica('è vuoto (zero clienti/fascicoli/documenti/oggetti R2)', archVuoto.dati.vuoto === true, archVuoto.dati);
  const del = await operatore('DELETE', `/console/studi/${TEN_ERR}`, { conferma: `Studio Errato ${suffisso}` });
  verifica('cancellato: 1 utente eliminato, email liberata', del.stato === 200 && del.dati.utentiEliminati === 1 && del.dati.emailLiberate.includes(EMAIL_ERR) && /^evc_/.test(del.dati.eventoId), del);
  const dopo = await operatore('GET', `/console/studi/${TEN_ERR}`);
  verifica('dopo: 404', dopo.stato === 404, dopo.stato);
  const inElenco = (await operatore('GET', '/console/studi')).dati.studi.some((s) => s.id === TEN_ERR);
  verifica('non è più in elenco', !inElenco);
  const loginErr = await attore()('POST', '/auth/login', { email: EMAIL_ERR, password: err.dati.passwordTemporanea });
  verifica('il suo utente non entra più (401)', loginErr.stato === 401, loginErr);
  const eventi = (await operatore('GET', `/console/eventi?studio=${TEN_ERR}`)).dati.eventi;
  const ev = eventi.find((e) => e.azione === 'STUDIO_ELIMINATO');
  verifica('eventi_console: STUDIO_ELIMINATO con denominazione, P.IVA, email degli utenti, conteggi e operatore',
    ev && ev.dettaglio.denominazione === `Studio Errato ${suffisso}` && ev.dettaglio.partitaIva === '98765432109' && ev.dettaglio.utenti?.[0]?.email === EMAIL_ERR && ev.dettaglio.conteggi?.clienti === 0 && ev.operatore, ev);
  const riuso = await operatore('POST', '/console/studi', { ...corpoBase(), denominazione: `Studio Rifatto ${suffisso}`, codiceFiscale: '98765432109', partitaIva: '98765432109', professionista: { ...corpoBase().professionista, email: EMAIL_ERR } });
  verifica('la stessa email serve per un nuovo studio (era unica su tutta la piattaforma)', riuso.stato === 201, riuso);
  const delIgnoto = await operatore('DELETE', '/console/studi/ten_nessuno', { conferma: 'x' });
  verifica('studio inesistente → 404', delIgnoto.stato === 404, delIgnoto.stato);
}

console.log(`\nEsito: ${passati} ok, ${falliti} falliti`);
process.exit(falliti ? 1 : 0);
