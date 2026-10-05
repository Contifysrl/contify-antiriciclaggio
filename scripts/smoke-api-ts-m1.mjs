/**
 * Smoke test TS-M1 — Contify Timesheet: registrare.
 *
 *   npx wrangler dev --port 8787 --local   (dopo reset + migrate 0001..0016 + seed; .dev.vars con AI_FIXTURES=1, VIES_FIXTURES=1)
 *   node scripts/smoke-api-ts-m1.mjs
 *   BASE=https://antiriciclaggio.contify.it STUDIO=<id Studio Collaudo> … (in prod SOLO sullo Studio Collaudo)
 *
 * Va eseguito DOPO le suite di AR e dopo smoke-api-ts-m0 (o da solo su DB azzerato: attiva Timesheet sullo studio demo).
 * Lascia dati Timesheet nello studio demo; alla fine prova backup → ripristino → «Elimina archivio».
 *
 * Cosa si dimostra:
 *  1. attivazione di Timesheet: otto servizi predefiniti, ruoli copiati; contesto per titolare (tariffe) e collaboratore (senza);
 *  2. clienti nei quattro modi: a mano, da partita IVA (VIES finto), importazione (righe e sole denominazioni), visura
 *     (righe già lette nel browser); doppioni scartati con motivo; i clienti di AR compaiono come «ar:<id>»;
 *     il collaboratore crea un cliente dalla chat «da verificare», non fa lookup; alias unici per studio;
 *  3. interpretazione: frase completa → proposta completa; domanda → risposta scritta con inSospeso;
 *  4. registrazioni: nascita della riga ts_clienti al primo salvataggio di un cliente AR; il collaboratore vede solo le sue
 *     e senza tariffe; a nome di altri solo il titolare; data futura e fuori finestra rifiutate; modifica ed eliminazione
 *     con le regole di autore e finestra; «da verificare» per servizio generico e oltre 16 ore; nel registro solo
 *     modifiche ed eliminazioni (non le creazioni);
 *  5. riepilogo personale con ore previste; persone (solo titolare);
 *  6. servizi e tariffe: nuovo, modifica, generico non disattivabile, servizio disattivato rifiutato; tariffa fotografata;
 *  7. impostazioni: finestra e clienti dal collaboratore; consenso AI (solo chi amministra, con informativa);
 *     trascrizione rifiutata senza consenso, accettata con le fixture; interpretazione con il motore AI (fixture);
 *  8. export Excel; 9. backup → ripristino (le ore tornano) → «Elimina archivio» (le ore vanno via, le ore previste restano).
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
    if (contesto !== undefined) console.log(`       ${JSON.stringify(contesto).slice(0, 600)}`);
  }
}

function attore() {
  let cookie = '';
  const f = async (metodo, percorso, corpo, opz = {}) => {
    const r = await fetch(`${BASE}/api${percorso}`, {
      method: metodo,
      headers: { ...(corpo && !opz.form ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: corpo ? (opz.form ? corpo : JSON.stringify(corpo)) : undefined,
    });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    if (opz.raw) return { stato: r.status, headers: r.headers, bytes: new Uint8Array(await r.arrayBuffer()) };
    const t = await r.text();
    let dati = null;
    try { dati = t ? JSON.parse(t) : null; } catch { dati = { testo: t.slice(0, 120) }; }
    return { stato: r.status, dati };
  };
  return f;
}

const titolare = attore();
const collaboratore = attore();
const operatore = attore();
const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const giorniFa = (n) => { const d = new Date(`${oggi}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const suffisso = Date.now().toString(36);

// ── 1. Attivazione e contesto ────────────────────────────────
console.log('== 1. Attivazione di Timesheet e contesto ==');
{
  const l = await operatore('POST', '/console/login', { email: EMAIL_OP, password: PASS_OP });
  verifica('login operatore console', l.stato === 200, l.dati);
  const a = await operatore('POST', `/console/studi/${STUDIO}/moduli/TS`, { stato: 'attivo' });
  verifica('Timesheet attivo sullo studio (già attivo o appena attivato)', a.stato === 200 && a.dati?.modulo?.stato === 'attivo', a.dati);
  if (a.dati?.creato) verifica('alla prima attivazione nascono gli otto servizi predefiniti', a.dati?.serviziCreati === 8, a.dati);

  const lt = await titolare('POST', '/auth/login', { email: EMAIL_TIT, password: PASS_TIT });
  verifica('login titolare (amministratore)', lt.stato === 200 && lt.dati?.studio?.moduli?.TS === 'attivo', lt.dati?.studio);
  const lc = await collaboratore('POST', '/auth/login', { email: EMAIL_COL, password: PASS_COL });
  verifica('login collaboratore con ruolo Timesheet COLLABORATORE', lc.stato === 200 && lc.dati?.utente?.tsRuolo === 'COLLABORATORE', lc.dati?.utente);

  const ct = await titolare('GET', '/ts/contesto');
  verifica('contesto titolare: ruolo TITOLARE, 8 servizi con tariffe e parole chiave', ct.stato === 200 && ct.dati?.ruolo === 'TITOLARE' && ct.dati?.servizi?.length >= 8 && ct.dati.servizi.every((s) => 'tariffaOrariaCent' in s), ct.dati?.servizi?.[0]);
  verifica('contesto: i clienti di AR compaiono con id «ar:…»', ct.dati?.clienti?.some((c) => c.id === 'ar:cli_alfa' && c.collegatoAr) && ct.dati?.clienti?.some((c) => c.id === 'ar:cli_beta'), ct.dati?.clienti);
  verifica('contesto: AI non abilitata, oggi nel fuso di Roma', ct.dati?.ai?.abilitata === false && ct.dati?.oggi === oggi, ct.dati?.ai);
  const cc = await collaboratore('GET', '/ts/contesto');
  verifica('contesto collaboratore: ruolo COLLABORATORE, servizi senza tariffe', cc.stato === 200 && cc.dati?.ruolo === 'COLLABORATORE' && cc.dati.servizi.every((s) => !('tariffaOrariaCent' in s)), cc.dati?.servizi?.[0]);
}

// ── 2. Clienti ───────────────────────────────────────────────
console.log('== 2. Clienti nei quattro modi, doppioni, alias ==');
let idManuale, idChat, servizi;
{
  const m = await titolare('POST', '/ts/clienti', { denominazione: `Fonderie Valbrenta ${suffisso} Srl`, codiceFiscale: '02233445566', pec: 'valbrenta@pec.it' });
  verifica('a mano con il codice fiscale di un cliente AR → 409 doppione (il confronto comprende i clienti di AR)', m.stato === 409 && m.dati?.codice === 'doppione', m.dati);
  const m2 = await titolare('POST', '/ts/clienti', { denominazione: `Fonderie Valbrenta ${suffisso} Srl`, partitaIva: '01234567897', sede: 'Via Industria 3, Solagna', pec: 'valbrenta@pec.it', codiceDestinatario: 'ABC1234' });
  verifica('a mano: creato con origine MANUALE e dati cifrati leggibili', m2.stato === 201 && m2.dati?.cliente?.origine === 'MANUALE' && m2.dati.cliente.dati?.pec === 'valbrenta@pec.it', m2.dati);
  idManuale = m2.dati?.cliente?.id;
  const m3 = await titolare('POST', '/ts/clienti', { denominazione: `fonderie valbrenta ${suffisso} srl` });
  verifica('stessa denominazione senza CF/P.IVA → 409', m3.stato === 409, m3.dati);

  const v = await titolare('GET', '/ts/lookup/piva/02233445566');
  verifica('da partita IVA: la rotta Timesheet risponde con lo schema di AR (esito, dati)', v.stato === 200 && typeof v.dati?.esito === 'string' && 'dati' in v.dati, v.dati);
  const vc = await collaboratore('GET', '/ts/lookup/piva/02233445566');
  verifica('il collaboratore non fa lookup (403)', vc.stato === 403, vc.dati);

  const imp = await titolare('POST', '/ts/clienti/import', { righe: [
    { denominazione: `Omega ${suffisso} Spa`, partitaIva: '00000000001' },
    { denominazione: `Beta Industrie ${suffisso} Srl`, codiceFiscale: `BI${suffisso.toUpperCase().padEnd(9, 'X')}`, partitaIva: '01234567897' },
    { denominazione: '' },
    { denominazione: `Gamma Family ${suffisso} Srl`, personaFisica: false, email: 'gamma@example.it' },
  ] });
  verifica('importazione: 1 creata (Gamma), 3 scartate con motivo (P.IVA non valida, P.IVA già presente, denominazione mancante)', imp.stato === 200 && imp.dati?.creati === 1 && imp.dati?.scartate?.length === 3, imp.dati);
  const imp2 = await titolare('POST', '/ts/clienti/import', { denominazioni: `Trattoria Al Ponte ${suffisso}\nBar Centrale ${suffisso}\n\nTrattoria Al Ponte ${suffisso}` });
  verifica('importazione di sole denominazioni: 2 creati, il doppione nel file scartato', imp2.stato === 200 && imp2.dati?.creati === 2 && imp2.dati?.scartate?.length === 1, imp2.dati);
  const vis = await titolare('POST', '/ts/clienti', { denominazione: `Esempio ${suffisso} Srl`, codiceFiscale: '12345678903', partitaIva: '12345678903', sede: 'Via Roma 1, Padova', pec: 'esempio@pec.it', origine: 'VISURA' });
  verifica('da visura (letta nel browser): salvati solo i dati della società, origine VISURA', vis.stato === 201 && vis.dati?.cliente?.origine === 'VISURA' && vis.dati.cliente.codiceFiscale === '12345678903', vis.dati);

  const ch = await collaboratore('POST', '/ts/clienti', { denominazione: `Nuovo Cliente Chat ${suffisso}`, partitaIva: '09876543217', pec: 'x@pec.it' });
  verifica('il collaboratore crea dalla chat: solo denominazione, «da verificare», origine CHAT, senza P.IVA né dati', ch.stato === 201 && ch.dati?.cliente?.daVerificare === true && ch.dati.cliente.origine === 'CHAT' && !ch.dati.cliente.partitaIva, ch.dati);
  idChat = ch.dati?.cliente?.id;

  const al = await collaboratore('POST', `/ts/clienti/${idManuale}/alias`, { alias: 'la fonderia' });
  verifica('alias aggiunto dal collaboratore', al.stato === 200 && al.dati?.alias?.includes('la fonderia'), al.dati);
  const al2 = await titolare('POST', `/ts/clienti/${idChat}/alias`, { alias: 'La Fonderia' });
  verifica('lo stesso alias su un altro cliente → 409', al2.stato === 409 && al2.dati?.codice === 'alias_in_uso', al2.dati);
  const alAr = await collaboratore('POST', '/ts/clienti/ar:cli_beta/alias', { alias: 'il rossi' });
  verifica('alias su un cliente AR: nasce la riga ts_clienti collegata', alAr.stato === 200 && alAr.dati?.clienteId && !alAr.dati.clienteId.startsWith('ar:'), alAr.dati);

  const el = await titolare('GET', '/ts/clienti');
  verifica('elenco clienti del titolare: manuale, import, chat (da verificare), AR non usati come ar:', el.stato === 200 && el.dati?.clienti?.some((c) => c.id === idManuale) && el.dati.clienti.some((c) => c.id === 'ar:cli_alfa') && el.dati.clienti.some((c) => c.clienteArId === 'cli_beta' && !c.id.startsWith('ar:')), el.dati?.clienti?.map((c) => c.id));
  const elc = await collaboratore('GET', '/ts/clienti');
  verifica('l’elenco completo è del titolare (collaboratore 403)', elc.stato === 403, elc.dati);
  const mod = await titolare('POST', `/ts/clienti/${idChat}`, { denominazione: `Nuovo Cliente ${suffisso} Srl`, partitaIva: '09876543217', daVerificare: false, pec: 'nuovo@pec.it' });
  verifica('il titolare completa l’anagrafica del cliente nato dalla chat e toglie «da verificare»', mod.stato === 200 && mod.dati?.cliente?.daVerificare === false && mod.dati.cliente.partitaIva === '09876543217' && mod.dati.cliente.dati?.pec === 'nuovo@pec.it', mod.dati);
  const coll = await titolare('POST', `/ts/clienti/${idManuale}`, { clienteArId: 'cli_alfa' });
  verifica('collegamento manuale a un cliente AR: il nome mostrato diventa quello di AR', coll.stato === 200 && coll.dati?.cliente?.collegatoAr && coll.dati.cliente.nome === 'Alfa Costruzioni Srl', coll.dati);
  const sc = await titolare('POST', `/ts/clienti/${idManuale}`, { clienteArId: null });
  verifica('scollegamento: il cliente torna autonomo', sc.stato === 200 && !sc.dati?.cliente?.collegatoAr, sc.dati);
  const rn = await titolare('POST', `/ts/clienti/${idManuale}`, { denominazione: `Fonderie Valbrenta ${suffisso} Srl` });
  verifica('nome proprio ripristinato', rn.stato === 200 && rn.dati?.cliente?.nome === `Fonderie Valbrenta ${suffisso} Srl`, rn.dati);
  servizi = (await titolare('GET', '/ts/servizi')).dati?.servizi ?? [];
}

const servizio = (nome) => servizi.find((s) => s.nome === nome);

// ── 3. Interpretazione ──────────────────────────────────────
console.log('== 3. Interpretazione locale ==');
{
  const i = await collaboratore('POST', '/ts/interpreta', { testo: '2 ore di contabilità per Alfa Costruzioni', origine: 'CHAT' });
  const p = i.dati?.proposte?.[0];
  verifica('frase completa → una proposta completa: cliente AR certo, Contabilità, 120 minuti, oggi', i.stato === 200 && i.dati?.proposte?.length === 1 && p?.cliente?.id === 'ar:cli_alfa' && p?.servizio?.id === servizio('Contabilità')?.id && p?.minuti === 120 && p?.data === oggi && i.dati.motore === 'LOCALE', i.dati);
  const i2 = await collaboratore('POST', '/ts/interpreta', { testo: '2 ore per Alfa Costruzioni' });
  const p2 = i2.dati?.proposte?.[0];
  verifica('senza servizio → servizio nullo (si chiede)', i2.stato === 200 && p2?.cliente?.id === 'ar:cli_alfa' && p2?.servizio?.id === null, i2.dati);
  const i3 = await collaboratore('POST', '/ts/interpreta', { testo: 'contabilità', inSospeso: i2.dati.proposte });
  verifica('risposta scritta con inSospeso → proposta completata', i3.stato === 200 && i3.dati?.proposte?.[0]?.servizio?.id === servizio('Contabilità')?.id && i3.dati.proposte[0].minuti === 120, i3.dati);
  const i4 = await collaboratore('POST', '/ts/interpreta', { testo: `un'ora di paghe per la fonderia` });
  verifica('alias «la fonderia» → cliente certo', i4.stato === 200 && i4.dati?.proposte?.[0]?.cliente?.id === idManuale && i4.dati.proposte[0].minuti === 60, i4.dati);
  const i5 = await collaboratore('POST', '/ts/interpreta', { testo: '' });
  verifica('testo vuoto → 400', i5.stato === 400, i5.dati);
}

// ── 4. Registrazioni ────────────────────────────────────────
console.log('== 4. Registrazioni ==');
let regCol, regTit, regAltri;
{
  const r = await collaboratore('POST', '/ts/registrazioni', { registrazioni: [
    { clienteId: 'ar:cli_alfa', servizioId: servizio('Contabilità').id, minuti: 120, data: oggi, origine: 'CHAT', motore: 'LOCALE', automatica: true, testoOriginale: '2 ore di contabilità per Alfa Costruzioni' },
    { clienteId: idManuale, servizioId: servizio('Paghe e contributi').id, minuti: 60, nota: 'cedolini di settembre', origine: 'CHAT', motore: 'LOCALE' },
  ] });
  verifica('il collaboratore salva due registrazioni (una per un cliente AR: nasce la riga ts_clienti)', r.stato === 201 && r.dati?.registrazioni?.length === 2 && !r.dati.registrazioni[0].clienteId.startsWith('ar:') && r.dati.registrazioni[0].clienteNome === 'Alfa Costruzioni Srl', r.dati);
  verifica('il collaboratore non vede la tariffa; la nota torna decifrata', r.dati?.registrazioni?.[1]?.tariffaCent === null && r.dati?.registrazioni?.[1]?.nota === 'cedolini di settembre', r.dati?.registrazioni?.[1]);
  regCol = r.dati?.registrazioni?.[0]?.id;
  const ct = await titolare('GET', '/ts/contesto');
  verifica('dopo il primo salvataggio Alfa Costruzioni non è più «ar:…» nell’elenco', ct.dati?.clienti?.some((c) => c.nome === 'Alfa Costruzioni Srl' && !c.id.startsWith('ar:')) && !ct.dati.clienti.some((c) => c.id === 'ar:cli_alfa'), ct.dati?.clienti?.map((c) => c.id));

  const f = await collaboratore('POST', '/ts/registrazioni', { clienteId: idManuale, servizioId: servizio('Contabilità').id, minuti: 30, data: giorniFa(-1) });
  verifica('data futura → 400', f.stato === 400, f.dati);
  const ff = await collaboratore('POST', '/ts/registrazioni', { clienteId: idManuale, servizioId: servizio('Contabilità').id, minuti: 30, data: giorniFa(30) });
  verifica('collaboratore fuori finestra (30 giorni fa) → 403 fuori_finestra', ff.stato === 403 && ff.dati?.codice === 'fuori_finestra', ff.dati);
  const ft = await titolare('POST', '/ts/registrazioni', { clienteId: idManuale, servizioId: servizio('Contabilità').id, minuti: 30, data: giorniFa(30), origine: 'MANUALE' });
  verifica('il titolare non ha finestra → 201', ft.stato === 201, ft.dati);
  regTit = ft.dati?.registrazioni?.[0]?.id;
  const alt = await collaboratore('POST', '/ts/registrazioni', { clienteId: idManuale, servizioId: servizio('Contabilità').id, minuti: 30, utenteId: 'usr_tit' });
  verifica('collaboratore a nome di altri → 403', alt.stato === 403, alt.dati);
  const altT = await titolare('POST', '/ts/registrazioni', { clienteId: idManuale, servizioId: servizio('Contabilità').id, minuti: 45, utenteId: 'usr_col', nota: 'inserita dal titolare' });
  verifica('titolare a nome del collaboratore → 201, utente = collaboratore', altT.stato === 201 && altT.dati?.registrazioni?.[0]?.utenteId === 'usr_col' && altT.dati.registrazioni[0].creatoDa === 'usr_tit', altT.dati);
  regAltri = altT.dati?.registrazioni?.[0]?.id;
  const altX = await titolare('POST', '/ts/registrazioni', { clienteId: idManuale, servizioId: servizio('Contabilità').id, minuti: 45, utenteId: 'usr_inesistente' });
  verifica('persona di un altro studio o inesistente → 404', altX.stato === 404, altX.dati);
  const ce = await collaboratore('POST', '/ts/registrazioni', { clienteId: 'cli_alfa', servizioId: servizio('Contabilità').id, minuti: 10 });
  verifica('id di cliente non Timesheet (id AR nudo) → 404', ce.stato === 404, ce.dati);

  const gen = await collaboratore('POST', '/ts/registrazioni', { clienteId: idManuale, servizioId: servizio('Altro').id, minuti: 20 });
  verifica('servizio generico → «da verificare» con motivo servizio_generico', gen.stato === 201 && gen.dati?.registrazioni?.[0]?.daVerificare === true && gen.dati.registrazioni[0].motivi.includes('servizio_generico'), gen.dati);
  const lungo = await collaboratore('POST', '/ts/registrazioni', { clienteId: idManuale, servizioId: servizio('Contabilità').id, minuti: 900, data: giorniFa(1) });
  const lungo2 = await collaboratore('POST', '/ts/registrazioni', { clienteId: idManuale, servizioId: servizio('Contabilità').id, minuti: 120, data: giorniFa(1) });
  verifica('oltre 16 ore nel giorno → «da verificare» (oltre_16_ore)', lungo.stato === 201 && lungo2.stato === 201 && lungo2.dati?.registrazioni?.[0]?.motivi?.includes('oltre_16_ore'), lungo2.dati);
  const dv = await collaboratore('POST', '/ts/registrazioni', { clienteId: idChat, servizioId: servizio('Contabilità').id, minuti: 15 });
  verifica('cliente nato dalla chat ma già verificato dal titolare → non «da verificare»', dv.stato === 201 && dv.dati?.registrazioni?.[0]?.daVerificare === false, dv.dati);

  const mie = await collaboratore('GET', '/ts/registrazioni');
  verifica('il collaboratore vede solo le proprie (compresa quella inserita dal titolare a suo nome), senza tariffe', mie.stato === 200 && mie.dati?.registrazioni?.every((x) => x.utenteId === 'usr_col' && x.tariffaCent === null) && mie.dati.registrazioni.some((x) => x.id === regAltri), mie.dati?.registrazioni?.map((x) => [x.id, x.utenteId]));
  const tutte = await titolare('GET', '/ts/registrazioni');
  verifica('il titolare vede tutte, con la tariffa fotografata', tutte.stato === 200 && tutte.dati?.registrazioni?.some((x) => x.utenteId === 'usr_tit') && tutte.dati.registrazioni.some((x) => x.utenteId === 'usr_col') && tutte.dati.registrazioni.every((x) => typeof x.tariffaCent === 'number'), tutte.dati?.registrazioni?.[0]);
  const filtro = await titolare('GET', `/ts/registrazioni?utenteId=usr_col&daVerificare=1`);
  verifica('filtri: persona + da verificare', filtro.stato === 200 && filtro.dati?.registrazioni?.length >= 2 && filtro.dati.registrazioni.every((x) => x.utenteId === 'usr_col' && x.daVerificare), filtro.dati?.registrazioni?.length);

  const m1 = await collaboratore('POST', `/ts/registrazioni/${regCol}`, { minuti: 150, nota: 'corretta' });
  verifica('il collaboratore modifica la propria', m1.stato === 200 && m1.dati?.registrazione?.minuti === 150 && m1.dati.registrazione.nota === 'corretta', m1.dati);
  const m2 = await collaboratore('POST', `/ts/registrazioni/${regTit}`, { minuti: 10 });
  verifica('il collaboratore non modifica quella del titolare → 403', m2.stato === 403, m2.dati);
  const m3 = await collaboratore('POST', `/ts/registrazioni/${gen.dati.registrazioni[0].id}`, { daVerificare: false });
  verifica('il collaboratore non toglie «da verificare» → 403', m3.stato === 403, m3.dati);
  const m4 = await titolare('POST', `/ts/registrazioni/${gen.dati.registrazioni[0].id}`, { daVerificare: false, servizioId: servizio('Consulenza').id });
  verifica('il titolare cambia servizio (tariffa rifotografata) e toglie «da verificare»', m4.stato === 200 && m4.dati?.registrazione?.daVerificare === false && m4.dati.registrazione.servizioId === servizio('Consulenza').id && m4.dati.registrazione.tariffaCent === servizio('Consulenza').tariffaOrariaCent, m4.dati);
  const m5 = await collaboratore('POST', `/ts/registrazioni/${regCol}`, { data: giorniFa(20) });
  verifica('spostare fuori finestra → 403', m5.stato === 403 && m5.dati?.codice === 'fuori_finestra', m5.dati);
  const d1 = await collaboratore('DELETE', `/ts/registrazioni/${lungo.dati.registrazioni[0].id}`);
  verifica('il collaboratore elimina la propria', d1.stato === 200, d1.dati);
  const d2 = await collaboratore('DELETE', `/ts/registrazioni/${regTit}`);
  verifica('il collaboratore non elimina quella del titolare → 403', d2.stato === 403, d2.dati);

  const au = await titolare('GET', '/audit');
  const azioni = (Array.isArray(au.dati) ? au.dati : []).map((v) => v.azione);
  verifica('registro: modifica, eliminazione e «a nome di altri» ci sono; la creazione ordinaria no', azioni.includes('TS_MODIFICA_REGISTRAZIONE') && azioni.includes('TS_ELIMINA_REGISTRAZIONE') && azioni.includes('TS_REGISTRA_PER_ALTRI') && !azioni.includes('TS_CREA_REGISTRAZIONE'), azioni.filter((a) => a.startsWith('TS_')));
}

// ── 5. Riepilogo e persone ──────────────────────────────────
console.log('== 5. Riepilogo personale e ore previste ==');
{
  const r0 = await collaboratore('GET', '/ts/riepilogo');
  verifica('riepilogo senza ore previste: solo totali, oggi conta le registrazioni del collaboratore', r0.stato === 200 && r0.dati?.oggi?.previsti === null && r0.dati.oggi.registrazioni >= 4 && Array.isArray(r0.dati.settimana) && typeof r0.dati.mese?.minuti === 'number', r0.dati);
  const pc = await collaboratore('GET', '/ts/persone');
  verifica('persone: solo titolare (403)', pc.stato === 403, pc.dati);
  const pt = await titolare('GET', '/ts/persone');
  verifica('persone del titolare: compaiono titolare e collaboratore con ruolo Timesheet', pt.stato === 200 && pt.dati?.persone?.some((p) => p.utenteId === 'usr_col') && pt.dati.persone.some((p) => p.utenteId === 'usr_tit'), pt.dati);
  const ore = await titolare('POST', '/ts/persone/usr_col', { minutiSettimanali: 2400, giorniLavorativi: '12345' });
  verifica('ore previste del collaboratore: 40 ore su 5 giorni', ore.stato === 200 && ore.dati?.persona?.minutiSettimanali === 2400, ore.dati);
  const r1 = await collaboratore('GET', '/ts/riepilogo');
  const oggiLav = r1.dati?.settimana?.find((g) => g.data === oggi);
  verifica('riepilogo con ore previste: 480 al giorno nei giorni lavorativi', r1.stato === 200 && (oggiLav ? oggiLav.previsti === 480 || !oggiLav.lavorativo : true) && r1.dati.settimana.some((g) => g.previsti === 480), r1.dati);
  const oreX = await titolare('POST', '/ts/persone/usr_col', { minutiSettimanali: 99999 });
  verifica('ore previste fuori scala → 400', oreX.stato === 400, oreX.dati);
  const oreY = await titolare('POST', '/ts/persone/usr_altro_studio', { minutiSettimanali: 1200 });
  verifica('persona di un altro studio → 404', oreY.stato === 404, oreY.dati);
}

// ── 6. Servizi e tariffe ────────────────────────────────────
console.log('== 6. Servizi e tariffe ==');
{
  const n = await titolare('POST', '/ts/servizi', { nome: `Revisione ${suffisso}`, tariffaOrariaCent: 9000, paroleChiave: ['revision', 'collegio sindacale'] });
  verifica('nuovo servizio con tariffa e parole chiave', n.stato === 201 && n.dati?.servizi?.some((s) => s.nome === `Revisione ${suffisso}` && s.tariffaOrariaCent === 9000), n.dati);
  const idRev = n.dati?.id;
  const cont = servizio('Contabilità');
  const t = await titolare('POST', `/ts/servizi/${cont.id}`, { tariffaOrariaCent: 4500 });
  verifica('tariffa di Contabilità portata a 45 €/h', t.stato === 200 && t.dati?.servizi?.find((s) => s.id === cont.id)?.tariffaOrariaCent === 4500, t.dati);
  const r = await titolare('POST', '/ts/registrazioni', { clienteId: idManuale, servizioId: cont.id, minuti: 60, origine: 'MANUALE' });
  verifica('la nuova registrazione fotografa la tariffa nuova (4500); le vecchie restano a 0', r.stato === 201 && r.dati?.registrazioni?.[0]?.tariffaCent === 4500, r.dati);
  const vecchia = (await titolare('GET', '/ts/registrazioni')).dati?.registrazioni?.find((x) => x.id === regCol);
  verifica('la registrazione precedente conserva la tariffa fotografata al suo salvataggio (0)', vecchia?.tariffaCent === 0, vecchia);
  const g = await titolare('POST', `/ts/servizi/${servizio('Altro').id}`, { attivo: false });
  verifica('il servizio generico non si disattiva → 409', g.stato === 409, g.dati);
  const off = await titolare('POST', `/ts/servizi/${idRev}`, { attivo: false });
  verifica('un servizio si disattiva', off.stato === 200 && off.dati?.servizi?.find((s) => s.id === idRev)?.attivo === false, off.dati);
  const ro = await collaboratore('POST', '/ts/registrazioni', { clienteId: idManuale, servizioId: idRev, minuti: 30 });
  verifica('registrare con un servizio disattivato → 404', ro.stato === 404, ro.dati);
  const sc = await collaboratore('GET', '/ts/servizi');
  verifica('elenco servizi completo: solo titolare (403)', sc.stato === 403, sc.dati);
  const pre = await titolare('POST', '/ts/servizi/predefiniti');
  verifica('i predefiniti non si duplicano se lo studio ha già servizi (creati 0)', pre.stato === 200 && pre.dati?.creati === 0, pre.dati);
}

// ── 7. Impostazioni e consenso ──────────────────────────────
console.log('== 7. Impostazioni, consenso AI, voce ==');
{
  const g = await titolare('GET', '/ts/impostazioni');
  verifica('impostazioni predefinite: collaboratori creano clienti, 7 giorni indietro, AI non abilitata', g.stato === 200 && g.dati?.impostazioni?.collaboratoriCreanoClienti === true && g.dati.impostazioni.giorniIndietro === 7 && g.dati.ai?.abilitata === false, g.dati);
  const s = await titolare('POST', '/ts/impostazioni', { giorniIndietro: 3, collaboratoriCreanoClienti: false });
  verifica('finestra a 3 giorni e clienti solo dal titolare', s.stato === 200 && s.dati?.impostazioni?.giorniIndietro === 3, s.dati);
  const ff = await collaboratore('POST', '/ts/registrazioni', { clienteId: idManuale, servizioId: servizio('Contabilità').id, minuti: 30, data: giorniFa(5) });
  verifica('collaboratore a 5 giorni con finestra 3 → 403', ff.stato === 403 && ff.dati?.codice === 'fuori_finestra', ff.dati);
  const cc = await collaboratore('POST', '/ts/clienti', { denominazione: `Vietato ${suffisso}` });
  verifica('collaboratore crea cliente con l’impostazione spenta → 403', cc.stato === 403 && cc.dati?.codice === 'clienti_solo_titolare', cc.dati);
  await titolare('POST', '/ts/impostazioni', { giorniIndietro: 7, collaboratoriCreanoClienti: true });

  const tr0 = await collaboratore('POST', '/ts/trascrivi', new FormData(), { form: true });
  verifica('trascrizione senza consenso → 403 voce_non_attiva', tr0.stato === 403 && tr0.dati?.codice === 'voce_non_attiva', tr0.dati);
  const noInf = await titolare('POST', '/ts/impostazioni/ai', { abilitata: true, voce: true });
  verifica('consenso senza aver letto l’informativa → 400', noInf.stato === 400 && noInf.dati?.codice === 'informativa_non_confermata', noInf.dati);
  const cCol = await collaboratore('POST', '/ts/impostazioni/ai', { abilitata: true, voce: true, informativaLetta: true });
  verifica('consenso dal collaboratore (non amministra) → 403', cCol.stato === 403, cCol.dati);
  const ok = await titolare('POST', '/ts/impostazioni/ai', { abilitata: true, voce: true, informativaLetta: true });
  verifica('consenso dato da chi amministra: abilitata, voce, versione informativa 1', ok.stato === 200 && ok.dati?.ai?.abilitata === true && ok.dati.ai.voce === true && ok.dati.ai.versioneInformativa === 1, ok.dati);
  const ct = await collaboratore('GET', '/ts/contesto');
  verifica('contesto: AI e voce attive e disponibili (fixture)', ct.dati?.ai?.abilitata === true && ct.dati.ai.voce === true && ct.dati.ai.disponibile === true, ct.dati?.ai);

  const fd = new FormData();
  fd.append('audio', new Blob([new Uint8Array(20000)], { type: 'audio/webm' }), 'voce.webm');
  fd.append('secondi', '4');
  const tr = await collaboratore('POST', '/ts/trascrivi', fd, { form: true });
  verifica('trascrizione con le fixture → testo, secondi contati', tr.stato === 200 && tr.dati?.testo === 'due ore di contabilità per omega' && tr.dati.secondi === 4, tr.dati);
  const fd2 = new FormData();
  fd2.append('audio', new Blob([new Uint8Array(100)], { type: 'audio/webm' }), 'voce.webm');
  const tr2 = await collaboratore('POST', '/ts/trascrivi', fd2, { form: true });
  verifica('audio sotto un secondo → scartato senza errore', tr2.stato === 200 && tr2.dati?.scartato === true, tr2.dati);
  const fd3 = new FormData();
  fd3.append('audio', new Blob([new Uint8Array(1_600_000)], { type: 'audio/webm' }), 'voce.webm');
  const tr3 = await collaboratore('POST', '/ts/trascrivi', fd3, { form: true });
  verifica('audio troppo grande → 413', tr3.stato === 413, tr3.dati);

  const ia = await collaboratore('POST', '/ts/interpreta', { testo: 'due ore per la lanterna' });
  verifica('frase incompleta con AI abilitata → passo 2 (fixture): motore AI, nessun cliente inventato', ia.stato === 200 && ia.dati?.motore === 'AI' && ia.dati.proposte?.[0]?.cliente?.id === null && ia.dati.proposte[0].minuti === 120, ia.dati);
  const spento = await titolare('POST', '/ts/impostazioni/ai', { abilitata: false });
  verifica('consenso ritirato', spento.stato === 200 && spento.dati?.ai?.abilitata === false, spento.dati);
}

// ── 8. Export ───────────────────────────────────────────────
console.log('== 8. Export Excel ==');
{
  const ex = await titolare('GET', `/ts/registrazioni/export?utenteId=usr_col`, undefined, { raw: true });
  verifica('export .xlsx del titolare: 200, tipo Excel, file ZIP (PK)', ex.stato === 200 && (ex.headers.get('content-type') ?? '').includes('spreadsheetml') && ex.bytes[0] === 0x50 && ex.bytes[1] === 0x4b && ex.bytes.length > 2000, { stato: ex.stato, tipo: ex.headers.get('content-type'), bytes: ex.bytes.length });
  const exc = await collaboratore('GET', '/ts/registrazioni/export');
  verifica('export: solo titolare (403)', exc.stato === 403, exc.dati);
}

// ── 9. Backup, ripristino, elimina archivio ─────────────────
console.log('== 9. Backup → ripristino → elimina archivio ==');
{
  const prima = (await titolare('GET', '/ts/registrazioni')).dati?.registrazioni?.length ?? 0;
  const bk = await titolare('POST', '/backup');
  verifica('backup manuale con i dati Timesheet', bk.stato === 201 && bk.dati?.key, bk.dati);
  const extra = await titolare('POST', '/ts/registrazioni', { clienteId: idManuale, servizioId: servizio('Contabilità').id, minuti: 5, origine: 'MANUALE' });
  verifica('registrazione aggiunta dopo il backup', extra.stato === 201, extra.dati);
  const rip = await titolare('POST', '/backup/ripristina', { conferma: 'RIPRISTINA', key: bk.dati?.key });
  verifica('ripristino riuscito', rip.stato === 200 && rip.dati?.righeRipristinate > 0, rip.dati);
  const dopo = (await titolare('GET', '/ts/registrazioni')).dati?.registrazioni?.length ?? 0;
  verifica('le ore tornano a quelle del backup (la registrazione aggiunta dopo sparisce)', dopo === prima, { prima, dopo });
  const pers = (await titolare('GET', '/ts/persone')).dati?.persone?.find((p) => p.utenteId === 'usr_col');
  verifica('le ore previste sopravvivono al ripristino', pers?.minutiSettimanali === 2400, pers);
  const el = await titolare('POST', '/backup/elimina-archivio', { conferma: 'ELIMINA' });
  verifica('«Elimina archivio» eseguito', el.stato === 200, el.dati);
  const vuoto = await titolare('GET', '/ts/registrazioni');
  const clienti = await titolare('GET', '/ts/clienti');
  verifica('dopo «Elimina archivio»: nessuna registrazione, nessun cliente Timesheet (restano solo gli «ar:» se AR li ha ancora)', vuoto.dati?.registrazioni?.length === 0 && (clienti.dati?.clienti ?? []).every((c) => c.id.startsWith('ar:')), { reg: vuoto.dati?.registrazioni?.length, clienti: clienti.dati?.clienti?.map((c) => c.id) });
  const pers2 = (await titolare('GET', '/ts/persone')).dati?.persone?.find((p) => p.utenteId === 'usr_col');
  verifica('le ore previste sopravvivono anche a «Elimina archivio»', pers2?.minutiSettimanali === 2400, pers2);
  const srv = await titolare('GET', '/ts/servizi');
  verifica('i servizi sono andati via con l’archivio; «Crea i predefiniti» li rimette', (srv.dati?.servizi?.length ?? 0) === 0 && (await titolare('POST', '/ts/servizi/predefiniti')).dati?.creati === 8, srv.dati);
}

console.log(`\nTS-M1: ${passati} ok, ${falliti} falliti`);
process.exit(falliti ? 1 : 0);
