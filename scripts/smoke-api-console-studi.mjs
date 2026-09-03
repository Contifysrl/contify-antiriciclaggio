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
 *  8. il tenant demo non è stato toccato.
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

console.log(`\nEsito: ${passati} ok, ${falliti} falliti`);
process.exit(falliti ? 1 : 0);
