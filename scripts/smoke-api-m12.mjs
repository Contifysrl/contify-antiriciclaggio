/**
 * Smoke test AR-M12: accessi/dispositivi, «Resta collegato», tema utente,
 * console Studi (licenza e contratto).
 *
 *   npx wrangler dev --port 8787 --local   (dopo reset + migrate 0001..0008 + seed)
 *   node scripts/smoke-api-m12.mjs
 *
 * Si ripulisce da solo: chiude le sessioni che apre e riporta lo stato
 * dello studio ad «attivo» e le date del contratto a NULL.
 */

const BASE = process.env.BASE ?? 'http://localhost:8787';
let falliti = 0;
let passati = 0;

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

function attore(userAgent) {
  let cookie = '';
  const f = async (metodo, percorso, corpo) => {
    const r = await fetch(`${BASE}/api${percorso}`, {
      method: metodo,
      headers: {
        ...(corpo ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(userAgent ? { 'User-Agent': userAgent } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const set = r.headers.get('set-cookie');
    if (set) {
      cookie = set.split(';')[0];
      f.ultimoSetCookie = set;
    }
    const t = await r.text();
    return { stato: r.status, dati: t ? JSON.parse(t) : null };
  };
  f.ultimoSetCookie = '';
  return f;
}

const UA_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';
const UA_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';

const tit = attore(UA_MAC);
const titAltro = attore(UA_WIN);
const consoleOp = attore();

console.log('\n== Login e «Resta collegato» ==');
{
  const l1 = await tit('POST', '/auth/login', { email: 'titolare@studiodemo.it', password: 'Antiriciclaggio!2026' });
  verifica('login senza «Resta collegato»', l1.stato === 200, l1);
  verifica('cookie di sessione senza scadenza (sparisce col browser)', !/expires=/i.test(tit.ultimoSetCookie), tit.ultimoSetCookie);
  const l2 = await titAltro('POST', '/auth/login', { email: 'titolare@studiodemo.it', password: 'Antiriciclaggio!2026', ricordami: true });
  verifica('login con «Resta collegato»', l2.stato === 200, l2);
  verifica('cookie persistente (con scadenza)', /expires=/i.test(titAltro.ultimoSetCookie), titAltro.ultimoSetCookie);
}

console.log('\n== Accessi e dispositivi ==');
{
  const s = await tit('GET', '/auth/sessioni');
  verifica('elenco accessi disponibile', s.stato === 200 && Array.isArray(s.dati.sessioni), s.dati);
  verifica('almeno due dispositivi collegati', s.dati.sessioni.length >= 2, s.dati.sessioni.length);
  const corrente = s.dati.sessioni.find((x) => x.corrente);
  verifica('il dispositivo corrente è marcato', Boolean(corrente), s.dati.sessioni);
  verifica('descrizione del dispositivo da user agent', corrente?.dispositivo === 'Safari su Mac', corrente);
  const altro = s.dati.sessioni.find((x) => !x.corrente && x.ricordami);
  verifica('l’accesso «Resta collegato» è riconoscibile', Boolean(altro), s.dati.sessioni);

  const r = await tit('POST', `/auth/sessioni/${altro.rif}/chiudi`);
  verifica('chiusura del singolo dispositivo', r.stato === 200 && r.dati.chiuse === 1, r.dati);
  const negato = await titAltro('GET', '/auth/io');
  verifica('il dispositivo chiuso è fuori (401)', negato.stato === 401, negato);

  await titAltro('POST', '/auth/login', { email: 'titolare@studiodemo.it', password: 'Antiriciclaggio!2026' });
  const tutte = await tit('POST', '/auth/sessioni/chiudi-altre');
  verifica('«Esci da tutti gli altri dispositivi»', tutte.stato === 200 && tutte.dati.chiuse >= 1, tutte.dati);
  const dopo = await tit('GET', '/auth/sessioni');
  verifica('resta solo il dispositivo corrente', dopo.dati.sessioni.length === 1 && dopo.dati.sessioni[0].corrente, dopo.dati);
}

console.log('\n== Aspetto: tema e modo colore ==');
{
  const invalido = await tit('POST', '/auth/tema', { tema: 'fluo' });
  verifica('tema sconosciuto rifiutato (400)', invalido.stato === 400, invalido);
  const ok = await tit('POST', '/auth/tema', { tema: 'indaco' });
  verifica('tema salvato', ok.stato === 200, ok);
  const modoNo = await tit('POST', '/auth/modo', { modo: 'buio-pesto' });
  verifica('modo sconosciuto rifiutato (400)', modoNo.stato === 400, modoNo);
  const modoSi = await tit('POST', '/auth/modo', { modo: 'scuro' });
  verifica('modo salvato', modoSi.stato === 200, modoSi);
  const io = await tit('GET', '/auth/io');
  verifica('il profilo restituisce tema e modo', io.dati.utente.tema === 'indaco' && io.dati.utente.modoColore === 'scuro', io.dati.utente);
  await tit('POST', '/auth/tema', { tema: null });
  await tit('POST', '/auth/modo', { modo: null });
  const io2 = await tit('GET', '/auth/io');
  verifica('tema e modo azzerabili', io2.dati.utente.tema === null && io2.dati.utente.modoColore === null, io2.dati.utente);
}

console.log('\n== Console: Studi (licenza e contratto) ==');
{
  const login = await consoleOp('POST', '/console/login', { email: 'assistenza@contify.it', password: 'ConsoleSmoke!1' });
  verifica('login console', login.stato === 200, login.dati);
  const studi = await consoleOp('GET', '/console/studi');
  verifica('elenco studi', studi.stato === 200 && studi.dati.studi.length >= 1, studi.dati);
  const demo = studi.dati.studi.find((s) => s.id === 'ten_demo');
  verifica('lo studio demo compare con gli utenti attivi', demo && demo.nUtenti >= 2, demo);

  const dataNo = await consoleOp('POST', '/console/studi/ten_demo/contratto', { dataScadenzaCanone: '31/12/2027' });
  verifica('data in formato sbagliato rifiutata (400)', dataNo.stato === 400, dataNo);
  const salva = await consoleOp('POST', '/console/studi/ten_demo/contratto', {
    dataAttivazione: '2026-07-20', dataScadenzaCanone: '2027-12-31', noteContratto: 'Prova smoke M12',
  });
  verifica('contratto salvato', salva.stato === 200, salva);
  const dopo = await consoleOp('GET', '/console/studi');
  const demo2 = dopo.dati.studi.find((s) => s.id === 'ten_demo');
  verifica('date e note persistite', demo2.dataAttivazione === '2026-07-20' && demo2.dataScadenzaCanone === '2027-12-31' && demo2.noteContratto === 'Prova smoke M12', demo2);

  const statoNo = await consoleOp('POST', '/console/studi/ten_demo/stato', { stato: 'in-ferie' });
  verifica('stato non valido rifiutato (400)', statoNo.stato === 400, statoNo);
  const sospendi = await consoleOp('POST', '/console/studi/ten_demo/stato', { stato: 'sospeso' });
  verifica('sospensione dalla console', sospendi.stato === 200, sospendi);
  const scrittura = await tit('POST', '/clienti', { tipo: 'PERSONA_FISICA', denominazione: 'Blocco Sospeso' });
  verifica('studio sospeso: scritture bloccate (403)', scrittura.stato === 403 && scrittura.dati?.codice === 'tenant_sospeso', scrittura);
  const lettura = await tit('GET', '/clienti');
  verifica('studio sospeso: la consultazione resta', lettura.stato === 200, lettura.stato);
  const riattiva = await consoleOp('POST', '/console/studi/ten_demo/stato', { stato: 'attivo' });
  verifica('riattivazione dalla console', riattiva.stato === 200, riattiva);

  // Ripulisce: contratto azzerato, come da seed.
  const pulizia = await consoleOp('POST', '/console/studi/ten_demo/contratto', { dataAttivazione: null, dataScadenzaCanone: null, noteContratto: null });
  verifica('pulizia del contratto di prova', pulizia.stato === 200, pulizia);

  const audit = await tit('GET', '/audit');
  const azioni = (audit.dati ?? []).map((v) => v.azione);
  verifica('STATO_TENANT nel registro dello studio', azioni.includes('STATO_TENANT'), azioni.slice(0, 8));
  verifica('CONTRATTO_AGGIORNATO nel registro dello studio', azioni.includes('CONTRATTO_AGGIORNATO'), azioni.slice(0, 8));
}

console.log(`\nEsito: ${passati} ok, ${falliti} falliti\n`);
process.exit(falliti ? 1 : 0);
