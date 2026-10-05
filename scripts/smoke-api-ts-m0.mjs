/**
 * Smoke test TS-M0 — moduli della piattaforma e accessi per utente.
 *
 *   npx wrangler dev --port 8787 --local   (dopo reset + migrate 0001..0015 + seed)
 *   node scripts/smoke-api-ts-m0.mjs
 *   BASE=https://antiriciclaggio.contify.it STUDIO=<id Studio Collaudo> … (in prod SOLO sullo Studio Collaudo)
 *
 * Va eseguito DOPO le suite di AR: modifica lo studio demo (gli attiva Timesheet).
 *
 * Cosa si dimostra:
 *  1. rete di sicurezza: lo studio demo (nessuna riga in moduli_tenant) vale «AR attivo»;
 *     la sessione espone moduli {AR:'attivo', TS:null}, accessoAr, tsRuolo; /api/ts/* → 403 modulo_non_attivo;
 *  2. console: attivazione di Timesheet sullo studio → riga TS + riga AR materializzata, evento
 *     MODULO_ATTIVATO, ruoli Timesheet copiati (titolare/amministratore → TITOLARE, collaboratore → COLLABORATORE);
 *     elenco e dettaglio studi con i moduli; validazioni;
 *  3. un utente con solo Timesheet (accessoAr=0): ruolo AR forzato COLLABORATORE, 403 modulo_non_consentito
 *     su ogni rotta di AR, 200 su /api/ts/stato, le voci comuni funzionano, il registro attività no;
 *  4. validazioni sugli utenti: almeno un modulo, tsRuolo solo se lo studio ha Timesheet, chi amministra
 *     accede sempre ad AR, un professionista con clienti assegnati non perde AR;
 *  5. stati per modulo: TS sospeso = sola lettura su /api/ts, AR lavora; TS cessato = chiuso; riattivato;
 *  6. studio con solo Timesheet creato dalla console: primo utente TITOLARE Timesheet, AR rifiutato anche a chi
 *     amministra (modulo_non_attivo), voci comuni ok, /api/novita non mostra le novità di AR … e viceversa;
 *  7. studio creato dalla console senza indicare i moduli → solo AR (le chiamate esistenti non cambiano).
 */

const BASE = process.env.BASE ?? 'http://localhost:8787';
const STUDIO = process.env.STUDIO ?? 'ten_demo';
const EMAIL_TIT = process.env.EMAIL_TIT ?? 'titolare@studiodemo.it';
const PASS_TIT = process.env.PASS_TIT ?? 'Antiriciclaggio!2026';
const EMAIL_COL = process.env.EMAIL_COL ?? 'collaboratore@studiodemo.it';
const PASS_COL = process.env.PASS_COL ?? 'Collab!2026';
const EMAIL_OP = process.env.EMAIL_OP ?? 'assistenza@contify.it';
const PASS_OP = process.env.PASS_OP ?? 'ConsoleSmoke!1';

let falliti = 0;
let passati = 0;
function verifica(descrizione, condizione, contesto) {
  if (condizione) { passati++; console.log(`  ok   ${descrizione}`); }
  else {
    falliti++;
    console.log(`  FAIL ${descrizione}`);
    if (contesto !== undefined) console.log(`       ${JSON.stringify(contesto).slice(0, 500)}`);
  }
}

function attore() {
  let cookie = '';
  const f = async (metodo, percorso, corpo) => {
    const r = await fetch(`${BASE}/api${percorso}`, {
      method: metodo,
      headers: { ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const t = await r.text();
    let dati = null;
    try { dati = t ? JSON.parse(t) : null; } catch { dati = { testo: t.slice(0, 120) }; }
    return { stato: r.status, dati };
  };
  f.reset = () => { cookie = ''; };
  return f;
}

const titolare = attore();
const collaboratore = attore();
const operatore = attore();
const soloTs = attore();
const suffisso = Date.now().toString(36);

// ── 1. Rete di sicurezza ─────────────────────────────────────
console.log('== 1. Studio senza righe in moduli_tenant = AR attivo ==');
{
  const l = await titolare('POST', '/auth/login', { email: EMAIL_TIT, password: PASS_TIT });
  verifica('login titolare', l.stato === 200, l.dati);
  verifica('la sessione espone i moduli: AR attivo, TS assente', l.dati?.studio?.moduli?.AR === 'attivo' && l.dati?.studio?.moduli?.TS === null, l.dati?.studio);
  verifica('utente: accessoAr true, tsRuolo null', l.dati?.utente?.accessoAr === true && l.dati?.utente?.tsRuolo === null, l.dati?.utente);
  const io = await titolare('GET', '/auth/io');
  verifica('/auth/io ripete moduli e accessi', io.dati?.studio?.moduli?.AR === 'attivo' && io.dati?.utente?.accessoAr === true, io.dati);
  const ts = await titolare('GET', '/ts/stato');
  verifica('/api/ts/stato → 403 modulo_non_attivo (lo studio non ha Timesheet)', ts.stato === 403 && ts.dati?.codice === 'modulo_non_attivo', ts);
  const cl = await titolare('GET', '/clienti');
  verifica('le rotte di AR funzionano come prima', cl.stato === 200, cl);
  const au = await titolare('GET', '/audit');
  verifica('il registro attività funziona come prima', au.stato === 200, au);
}

// ── 2. Console: attiva Timesheet ─────────────────────────────
console.log('== 2. Console: attivazione di Timesheet sullo studio ==');
{
  const l = await operatore('POST', '/console/login', { email: EMAIL_OP, password: PASS_OP });
  verifica('login operatore console', l.stato === 200, l.dati);

  const male = await operatore('POST', `/console/studi/${STUDIO}/moduli/XX`, { stato: 'attivo' });
  verifica('modulo sconosciuto → 400', male.stato === 400, male);
  const male2 = await operatore('POST', `/console/studi/${STUDIO}/moduli/TS`, { stato: 'boh' });
  verifica('stato non valido → 400', male2.stato === 400, male2);
  const male3 = await operatore('POST', `/console/studi/${STUDIO}/moduli/TS`, { stato: 'attivo', dataAttivazione: '4/10/2026' });
  verifica('data non AAAA-MM-GG → 400', male3.stato === 400, male3);

  const att = await operatore('POST', `/console/studi/${STUDIO}/moduli/TS`, { stato: 'attivo', dataAttivazione: '2026-10-04', noteContratto: 'pilota' });
  verifica('POST moduli/TS attivo → 200, creato', att.stato === 200 && att.dati?.creato === true, att);

  const det = await operatore('GET', `/console/studi/${STUDIO}`);
  verifica('dettaglio studio: riga AR materializzata (rete di sicurezza) e riga TS attiva',
    det.dati?.moduli?.AR?.stato === 'attivo' && det.dati?.moduli?.TS?.stato === 'attivo' && det.dati?.moduli?.TS?.noteContratto === 'pilota', det.dati?.moduli);
  verifica('dettaglio studio: utenti con accessoAr e tsRuolo copiati (titolare → TITOLARE, collaboratore → COLLABORATORE)',
    (det.dati?.utenti ?? []).some((u) => u.ruolo === 'TITOLARE' && u.tsRuolo === 'TITOLARE' && u.accessoAr === true)
    && (det.dati?.utenti ?? []).some((u) => u.ruolo === 'COLLABORATORE' && u.tsRuolo === 'COLLABORATORE'), det.dati?.utenti);

  const elenco = await operatore('GET', '/console/studi');
  const riga = (elenco.dati?.studi ?? []).find((s) => s.id === STUDIO);
  verifica('elenco studi: moduli AR e TS sulla riga dello studio', riga?.moduli?.AR?.stato === 'attivo' && riga?.moduli?.TS?.stato === 'attivo', riga);

  const ev = await operatore('GET', `/console/eventi?studio=${STUDIO}`);
  verifica('evento console MODULO_ATTIVATO', (ev.dati?.eventi ?? []).some((e) => e.azione === 'MODULO_ATTIVATO' && e.dettaglio?.modulo === 'TS'), ev.dati?.eventi?.slice(0, 3));

  const agg = await operatore('POST', `/console/studi/${STUDIO}/moduli/TS`, { stato: 'attivo', dataScadenzaCanone: '2027-10-03', postiInclusi: 5 });
  verifica('secondo POST = aggiornamento (creato false), date e posti salvati', agg.stato === 200 && agg.dati?.creato === false, agg);
  const det2 = await operatore('GET', `/console/studi/${STUDIO}`);
  verifica('dettaglio: scadenza e posti della riga TS', det2.dati?.moduli?.TS?.dataScadenzaCanone === '2027-10-03' && det2.dati?.moduli?.TS?.postiInclusi === 5, det2.dati?.moduli);
  const ev2 = await operatore('GET', `/console/eventi?studio=${STUDIO}`);
  verifica('evento console MODULO_AGGIORNATO', (ev2.dati?.eventi ?? []).some((e) => e.azione === 'MODULO_AGGIORNATO'), ev2.dati?.eventi?.slice(0, 3));

  // Il contratto di AR su tenants non è stato toccato.
  verifica('contratto AR su tenants invariato (riga AR senza scadenza propria)', det2.dati?.moduli?.AR?.dataScadenzaCanone == null, det2.dati?.moduli?.AR);
}

// ── 3. La sessione del titolare vede entrambi i moduli ───────
console.log('== 3. Sessioni dopo l’attivazione ==');
{
  const io = await titolare('GET', '/auth/io');
  verifica('titolare: moduli AR e TS attivi, tsRuolo TITOLARE', io.dati?.studio?.moduli?.TS === 'attivo' && io.dati?.utente?.tsRuolo === 'TITOLARE', io.dati);
  const ts = await titolare('GET', '/ts/stato');
  verifica('/api/ts/stato → 200 con stato attivo e ruolo TITOLARE', ts.stato === 200 && ts.dati?.stato === 'attivo' && ts.dati?.tsRuolo === 'TITOLARE', ts);

  const lc = await collaboratore('POST', '/auth/login', { email: EMAIL_COL, password: PASS_COL });
  verifica('login collaboratore', lc.stato === 200, lc.dati);
  verifica('collaboratore: tsRuolo COLLABORATORE copiato, accessoAr true', lc.dati?.utente?.tsRuolo === 'COLLABORATORE' && lc.dati?.utente?.accessoAr === true, lc.dati?.utente);
  const tsc = await collaboratore('GET', '/ts/stato');
  verifica('collaboratore: /api/ts/stato → 200', tsc.stato === 200, tsc);
}

// ── 4. Utente con solo Timesheet ─────────────────────────────
console.log('== 4. Utente con solo Timesheet (accessoAr = 0) ==');
let utenteSoloTs = null;
{
  const EMAIL = `solo.ts.${suffisso}@studiodemo.test`;
  const r = await titolare('POST', '/utenti', { nome: 'Ore Soltanto', email: EMAIL, ruolo: 'TITOLARE', accessoAr: false, tsRuolo: 'COLLABORATORE' });
  verifica('creazione utente solo Timesheet → 201', r.stato === 201 && typeof r.dati?.passwordTemporanea === 'string', r);
  utenteSoloTs = r.dati;

  const el = await titolare('GET', '/utenti');
  const riga = (el.dati ?? []).find((u) => u.email === EMAIL);
  verifica('GET /utenti espone accessoAr false e tsRuolo COLLABORATORE', riga?.accessoAr === false && riga?.tsRuolo === 'COLLABORATORE', riga);
  verifica('ruolo AR forzato a COLLABORATORE (accesso_ar = 0 implica COLLABORATORE)', riga?.ruolo === 'COLLABORATORE', riga);

  const prof = await titolare('GET', '/studio/professionisti');
  verifica('non compare fra i professionisti di AR', !(prof.dati ?? []).some((p) => p.email === EMAIL), prof.dati);
  const pers = await titolare('GET', '/studio/persone');
  verifica('non compare fra le persone di AR (formazione)', !(pers.dati ?? []).some((p) => p.nome === 'Ore Soltanto'), pers.dati);

  const au = await titolare('GET', '/audit');
  verifica('audit CREA_UTENTE con accessoAr e tsRuolo nel dettaglio',
    (au.dati?.righe ?? au.dati ?? []).some((a) => a.azione === 'CREA_UTENTE' && String(a.dettaglio ?? '').includes('tsRuolo')), (au.dati?.righe ?? au.dati ?? []).slice(0, 2));

  const l = await soloTs('POST', '/auth/login', { email: EMAIL, password: r.dati.passwordTemporanea });
  verifica('login utente solo Timesheet', l.stato === 200, l.dati);
  const cp = await soloTs('POST', '/auth/cambia-password', { attuale: r.dati.passwordTemporanea, nuova: 'SoloOre!2026xx' });
  verifica('cambio password al primo accesso (voce comune, passa)', cp.stato === 200, cp);
  const io = await soloTs('GET', '/auth/io');
  verifica('sessione: accessoAr false, tsRuolo COLLABORATORE', io.dati?.utente?.accessoAr === false && io.dati?.utente?.tsRuolo === 'COLLABORATORE', io.dati?.utente);

  for (const p of ['/clienti', '/fascicoli', '/cruscotto', '/scadenzario', '/studio/persone', '/ai/stato', '/catalogo/prestazioni', '/coda/conteggio']) {
    const x = await soloTs('GET', p);
    verifica(`GET ${p} → 403 modulo_non_consentito`, x.stato === 403 && x.dati?.codice === 'modulo_non_consentito', x);
  }
  const post = await soloTs('POST', '/clienti', { denominazione: 'X', tipo: 'SOCIETA_CAPITALI' });
  verifica('POST /clienti → 403 modulo_non_consentito', post.stato === 403 && post.dati?.codice === 'modulo_non_consentito', post);
  const ts = await soloTs('GET', '/ts/stato');
  verifica('GET /ts/stato → 200', ts.stato === 200 && ts.dati?.tsRuolo === 'COLLABORATORE', ts);
  const nov = await soloTs('GET', '/novita');
  verifica('GET /novita (comune) → 200', nov.stato === 200, nov);
  const ass = await soloTs('GET', '/assistenza/non-letti');
  verifica('GET /assistenza/non-letti (comune) → 200', ass.stato === 200, ass);
  const au2 = await soloTs('GET', '/audit');
  verifica('GET /audit → 403 (niente AR e non amministra)', au2.stato === 403, au2);
  const ut = await soloTs('GET', '/utenti');
  verifica('GET /utenti → 403 (non amministra: regola di sempre)', ut.stato === 403, ut);
  const sess = await soloTs('GET', '/auth/sessioni');
  verifica('GET /auth/sessioni (comune) → 200', sess.stato === 200, sess);
}

// ── 5. Validazioni sugli utenti ──────────────────────────────
console.log('== 5. Validazioni sugli utenti ==');
{
  const nessuno = await titolare('POST', '/utenti', { nome: 'Nessun Modulo', email: `nessuno.${suffisso}@studiodemo.test`, ruolo: 'COLLABORATORE', accessoAr: false, tsRuolo: null });
  verifica('utente senza alcun modulo → 400', nessuno.stato === 400, nessuno);
  const ruoloMale = await titolare('POST', '/utenti', { nome: 'Ruolo Male', email: `ruolo.${suffisso}@studiodemo.test`, ruolo: 'COLLABORATORE', tsRuolo: 'CAPO' });
  verifica('tsRuolo non valido → 400', ruoloMale.stato === 400, ruoloMale);

  // Chi amministra accede sempre ad AR: togliergli l'accesso non ha effetto.
  const el = await titolare('GET', '/utenti');
  const io = (el.dati ?? []).find((u) => u.email === EMAIL_TIT);
  const toglio = await titolare('POST', `/utenti/${io.id}`, { accessoAr: false });
  verifica('togliere AR a chi amministra → 200 ma resta con accesso', toglio.stato === 200, toglio);
  const el2 = await titolare('GET', '/utenti');
  verifica('… accessoAr ancora true, ruolo ancora TITOLARE', (el2.dati ?? []).find((u) => u.id === io.id)?.accessoAr === true && (el2.dati ?? []).find((u) => u.id === io.id)?.ruolo === 'TITOLARE', el2.dati);

  // Un professionista non amministratore con clienti assegnati non perde AR.
  const EMAIL_P = `prof.${suffisso}@studiodemo.test`;
  const p = await titolare('POST', '/utenti', { nome: 'Prof Assegnato', email: EMAIL_P, ruolo: 'TITOLARE', tsRuolo: null });
  verifica('professionista (non amministratore) creato', p.stato === 201, p);
  const cli = await titolare('POST', '/clienti', { denominazione: `Cliente del prof ${suffisso}`, tipo: 'SOCIETA_CAPITALI', professionistaId: p.dati?.id });
  verifica('cliente assegnato al professionista', cli.stato === 201 || cli.stato === 200, cli);
  const tolgo = await titolare('POST', `/utenti/${p.dati?.id}`, { accessoAr: false, tsRuolo: 'COLLABORATORE' });
  verifica('togliere AR a un professionista con clienti assegnati → 409', tolgo.stato === 409, tolgo);
  const cambio = await titolare('POST', `/utenti/${p.dati?.id}`, { tsRuolo: 'TITOLARE' });
  verifica('cambiare solo il ruolo Timesheet → 200', cambio.stato === 200, cambio);
  const el3 = await titolare('GET', '/utenti');
  verifica('… tsRuolo TITOLARE, accessoAr ancora true', (el3.dati ?? []).find((u) => u.id === p.dati?.id)?.tsRuolo === 'TITOLARE' && (el3.dati ?? []).find((u) => u.id === p.dati?.id)?.accessoAr === true, el3.dati);
  const au = await titolare('GET', '/audit');
  verifica('audit MODIFICA_UTENTE con tsRuolo', (au.dati?.righe ?? au.dati ?? []).some((a) => a.azione === 'MODIFICA_UTENTE' && String(a.dettaglio ?? '').includes('tsRuolo')), (au.dati?.righe ?? au.dati ?? []).slice(0, 2));
}

// ── 6. Stati del modulo ──────────────────────────────────────
console.log('== 6. Stati del modulo Timesheet ==');
{
  const sosp = await operatore('POST', `/console/studi/${STUDIO}/moduli/TS`, { stato: 'sospeso' });
  verifica('TS sospeso → 200', sosp.stato === 200, sosp);
  const g = await titolare('GET', '/ts/stato');
  verifica('TS sospeso: GET /ts/stato → 200 con stato sospeso', g.stato === 200 && g.dati?.stato === 'sospeso', g);
  const p = await titolare('POST', '/ts/stato', {});
  verifica('TS sospeso: POST su /api/ts → 403 tenant_sospeso', p.stato === 403 && p.dati?.codice === 'tenant_sospeso', p);
  const cl = await titolare('POST', '/clienti', { denominazione: `Cliente con TS sospeso ${suffisso}`, tipo: 'SOCIETA_CAPITALI' });
  verifica('TS sospeso: AR continua a scrivere', cl.stato === 201 || cl.stato === 200, cl);
  const io = await titolare('GET', '/auth/io');
  verifica('sessione: moduli.TS = sospeso', io.dati?.studio?.moduli?.TS === 'sospeso', io.dati?.studio);

  const cess = await operatore('POST', `/console/studi/${STUDIO}/moduli/TS`, { stato: 'cessato' });
  verifica('TS cessato → 200', cess.stato === 200, cess);
  const g2 = await titolare('GET', '/ts/stato');
  verifica('TS cessato: GET /ts/stato → 403 tenant_cessato', g2.stato === 403 && g2.dati?.codice === 'tenant_cessato', g2);
  const cl2 = await titolare('GET', '/clienti');
  verifica('TS cessato: AR lavora', cl2.stato === 200, cl2);

  const riatt = await operatore('POST', `/console/studi/${STUDIO}/moduli/TS`, { stato: 'attivo' });
  verifica('TS riattivato → 200', riatt.stato === 200, riatt);
  const g3 = await titolare('GET', '/ts/stato');
  verifica('TS riattivato: GET /ts/stato → 200', g3.stato === 200 && g3.dati?.stato === 'attivo', g3);
}

// ── 7. Studio con solo Timesheet dalla console ───────────────
console.log('== 7. Studio con solo Timesheet (console) ==');
{
  const EMAIL = `ore.${suffisso}@studio-ore.test`;
  const male = await operatore('POST', '/console/studi', { denominazione: `Studio Ore ${suffisso}`, moduli: ['XX'], professionista: { nome: 'Dott. Ore', email: EMAIL } });
  verifica('moduli non validi → 400', male.stato === 400, male);
  const vuoto = await operatore('POST', '/console/studi', { denominazione: `Studio Ore ${suffisso}`, moduli: [], professionista: { nome: 'Dott. Ore', email: EMAIL } });
  verifica('nessun modulo → 400', vuoto.stato === 400, vuoto);

  const r = await operatore('POST', '/console/studi', {
    denominazione: `Studio Ore ${suffisso}`, moduli: ['TS'], dataAttivazione: '2026-10-04', dataScadenzaCanone: '2027-10-03', noteContratto: 'solo ore',
    professionista: { nome: 'Dott. Ore', email: EMAIL, qualifica: 'Dott.' },
  });
  verifica('studio con solo Timesheet creato → 201', r.stato === 201 && typeof r.dati?.passwordTemporanea === 'string', r);
  const det = await operatore('GET', `/console/studi/${r.dati?.id}`);
  verifica('dettaglio: solo la riga TS, con scadenza e note (il contratto AR su tenants resta vuoto)',
    det.dati?.moduli?.AR === null && det.dati?.moduli?.TS?.stato === 'attivo' && det.dati?.moduli?.TS?.dataScadenzaCanone === '2027-10-03' && det.dati?.studio?.dataScadenzaCanone == null, det.dati);
  verifica('primo utente: amministratore, tsRuolo TITOLARE, accessoAr true', (det.dati?.utenti ?? [])[0]?.tsRuolo === 'TITOLARE' && (det.dati?.utenti ?? [])[0]?.accessoAr === true, det.dati?.utenti);

  const u = attore();
  const l = await u('POST', '/auth/login', { email: EMAIL, password: r.dati.passwordTemporanea });
  verifica('login nello studio con solo Timesheet', l.stato === 200 && l.dati?.studio?.moduli?.AR === null && l.dati?.studio?.moduli?.TS === 'attivo', l.dati);
  await u('POST', '/auth/cambia-password', { attuale: r.dati.passwordTemporanea, nuova: 'OreSoltanto!2026' });
  const cl = await u('GET', '/clienti');
  verifica('AR rifiutato anche a chi amministra: 403 modulo_non_attivo', cl.stato === 403 && cl.dati?.codice === 'modulo_non_attivo', cl);
  const ts = await u('GET', '/ts/stato');
  verifica('/api/ts/stato → 200', ts.stato === 200 && ts.dati?.tsRuolo === 'TITOLARE', ts);
  const ut = await u('GET', '/utenti');
  verifica('voce comune /utenti → 200 (amministra)', ut.stato === 200, ut);
  const au = await u('GET', '/audit');
  verifica('registro attività → 200 (amministra)', au.stato === 200, au);
  const nov = await u('GET', '/novita');
  verifica('/novita: nessuna novità di AR per chi ha solo Timesheet', nov.stato === 200 && !(nov.dati?.novita ?? []).some((n) => n.modulo === 'AR') && (nov.dati?.novita ?? []).some((n) => n.modulo === 'TS'), nov.dati?.novita?.map((n) => [n.id, n.modulo]));
  const novAr = await titolare('GET', '/novita');
  verifica('/novita per lo studio con entrambi i moduli: vede tutto', novAr.stato === 200 && (novAr.dati?.novita ?? []).some((n) => n.modulo === 'TS') && (novAr.dati?.novita ?? []).some((n) => !n.modulo), novAr.dati?.novita?.map((n) => [n.id, n.modulo]));

  // Utente nuovo in uno studio senza AR: nasce senza AR; tsRuolo obbligatorio se non amministra.
  const nuovo = await u('POST', '/utenti', { nome: 'Collab Ore', email: `collab.ore.${suffisso}@studio-ore.test`, ruolo: 'COLLABORATORE', tsRuolo: 'COLLABORATORE' });
  verifica('nuovo utente nello studio solo-TS → 201', nuovo.stato === 201, nuovo);
  const el = await u('GET', '/utenti');
  verifica('… nasce con accessoAr false', (el.dati ?? []).find((x) => x.nome === 'Collab Ore')?.accessoAr === false, el.dati);
  const senza = await u('POST', '/utenti', { nome: 'Senza Ruolo', email: `senza.${suffisso}@studio-ore.test`, ruolo: 'COLLABORATORE' });
  verifica('utente senza tsRuolo in uno studio senza AR → 400 (nessun modulo)', senza.stato === 400, senza);
}

// ── 8. Studio creato senza indicare i moduli → solo AR ───────
console.log('== 8. Studio dalla console senza il campo moduli ==');
{
  const EMAIL = `ar.${suffisso}@studio-ar.test`;
  const r = await operatore('POST', '/console/studi', { denominazione: `Studio Solo AR ${suffisso}`, professionista: { nome: 'Dott. Ar', email: EMAIL } });
  verifica('creato → 201', r.stato === 201, r);
  const det = await operatore('GET', `/console/studi/${r.dati?.id}`);
  verifica('solo la riga AR, nessuna TS', det.dati?.moduli?.AR?.stato === 'attivo' && det.dati?.moduli?.TS === null, det.dati?.moduli);
  verifica('primo utente senza ruolo Timesheet', (det.dati?.utenti ?? [])[0]?.tsRuolo === null, det.dati?.utenti);
  const u = attore();
  await u('POST', '/auth/login', { email: EMAIL, password: r.dati.passwordTemporanea });
  const tsr = await u('POST', '/utenti', { nome: 'X', email: `x.${suffisso}@studio-ar.test`, ruolo: 'COLLABORATORE', tsRuolo: 'COLLABORATORE' });
  verifica('tsRuolo in uno studio senza Timesheet → 400', tsr.stato === 400, tsr);
}

console.log(`\n${passati} ok, ${falliti} FAIL`);
process.exit(falliti ? 1 : 0);
