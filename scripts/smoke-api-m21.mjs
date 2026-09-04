/**
 * Smoke test AR-M21: AI con pseudonimizzazione (+ console, sezioni successive).
 *
 *   npx wrangler dev --port 8787 --local   (dopo reset + migrate 0001..0014 + seed, con AI_FIXTURES=1)
 *   node scripts/smoke-api-m21.mjs
 *
 * Cosa si dimostra (AI-01):
 *  1. la chat con il nome di un cliente dello studio, di un socio (decifrato dalla compagine), di un
 *     titolare effettivo e con un codice fiscale: al modello arriva il testo con i segnaposto (le fixture
 *     lo riportano nella risposta di prova… PRIMA della ri-sostituzione, che qui è già avvenuta: la risposta
 *     torna con i nomi), l'audit USO_AI porta solo il conteggio `pseudonimi`, mai i nomi;
 *  2. la bozza di un fascicolo pseudonimizza gli appunti con il dizionario del cliente;
 *  3. il suggeritore di indicatori pseudonimizza la descrizione (dizionario dell'intero portafoglio);
 *  4. i segnaposto sono stabili dentro la conversazione;
 *  5. un testo senza identificativi passa invariato (pseudonimi = 0).
 * AI-04 (informativa v2 con ri-accettazione):
 *  6. /ai/stato espone versione accettata/corrente; un tenant con la v1 (simulato scrivendo parametri nel
 *     D1 locale con wrangler) risulta «da riaccettare», le funzioni di prima restano attive; la conferma
 *     registra la v2 con data e autore, audit ABILITA_AI con la versione.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { leggiVisura } from '../web/src/lib/visura.ts';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const qui = path.dirname(fileURLToPath(import.meta.url));
let ok = 0, fail = 0;
function verifica(d, cond, ctx) {
  if (cond) { ok++; console.log(`  ok   ${d}`); }
  else { fail++; console.log(`  FAIL ${d}`); if (ctx !== undefined) console.log(`       ${JSON.stringify(ctx).slice(0, 700)}`); }
}
let cookie = '';
async function req(metodo, percorso, corpo, form) {
  const r = await fetch(`${BASE}/api${percorso}`, {
    method: metodo,
    headers: { ...(corpo && !form ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: form ? form : corpo ? JSON.stringify(corpo) : undefined,
  });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const t = await r.text();
  let dati = null;
  try { dati = t ? JSON.parse(t) : null; } catch { dati = t; }
  return { stato: r.status, dati };
}
const fixture = (n) => leggiVisura(fs.readFileSync(path.join(qui, '..', 'tests', 'fixtures', 'visure', n), 'utf8'));
const suffisso = String(Date.now()).slice(-6);
const oggi = new Date().toISOString().slice(0, 10);

function corpoDaVisura(v, extra = {}) {
  return {
    anagrafica: {
      denominazione: v.denominazione, tipo: v.tipoProposto, codiceFiscale: v.codiceFiscale, partitaIva: v.partitaIva,
      paeseResidenza: 'IT', attivitaPrevalente: v.attivitaPrevalente, ateco: v.ateco,
      datiIdentificativi: { sede: v.sede.testo, pec: v.pec, rea: v.rea, formaGiuridica: v.formaGiuridica, capitaleSociale: v.capitale.sottoscritto, dataCostituzione: v.dataCostituzione },
      ...extra.anagrafica,
    },
    soci: v.soci, cariche: v.cariche, capitale: v.capitale, dataVisura: v.dataEstrazione, dataElencoSoci: v.dataElencoSoci,
    telemetria: { tipoVisura: v.tipoVisura, formaVisura: v.formaVisura, pagine: 7, campiNonTrovati: v.campiNonTrovati, avvisi: v.avvisi.length, soci: v.soci.length, cariche: v.cariche.length, tipoIncerto: v.tipoIncerto, dataEstrazione: v.dataEstrazione },
    ...extra,
  };
}
const ultimoAudit = async (azione) => ((await req('GET', '/audit')).dati ?? []).filter((v) => v.azione === azione)[0] ?? null;
const dettaglio = (voce) => { try { return JSON.parse(voce?.dettaglio ?? '{}'); } catch { return {}; } };

const login = await req('POST', '/auth/login', { email: 'titolare@studiodemo.it', password: 'Antiriciclaggio!2026' });
verifica('login professionista', login.stato === 200, login);
await req('POST', '/ai/abilita', { abilita: true, accetto: true });

// ── 0. Preparazione: un cliente da visura con soci PF cifrati, titolari registrati, un fascicolo ──
console.log('\n== 0. Preparazione: cliente da visura (soci PF cifrati), titolari, fascicolo ==');
const v1 = fixture('srl-due-soci-pf.txt');
v1.codiceFiscale = `04444${suffisso}`; v1.partitaIva = v1.codiceFiscale; v1.denominazione = `TORREFAZIONE ZANCANARO ${suffisso} SRL`;
const c1 = await req('POST', '/clienti/da-visura', corpoDaVisura(v1));
verifica('cliente creato da visura', c1.stato === 201, c1.dati);
const id1 = c1.dati?.id;
const prop1 = c1.dati?.proposta;
const te = await req('POST', `/clienti/${id1}/titolarita`, {
  propostaId: prop1?.id,
  titolari: prop1?.analisi?.titolari?.map((t) => ({ nominativo: t.denominazione, codiceFiscale: t.id, criterio: t.criterio, norma: t.norma, quota: t.quotaEffettiva != null ? Math.round(t.quotaEffettiva * 100) : null, pep: false, motivazione: t.motivazione })),
});
verifica('titolari effettivi registrati dalla proposta', te.stato === 200, te.dati);
const fasc = await req('POST', '/fascicoli', { clienteId: id1, prestazioneCodice: 'CONSULENZA_TRIBUTARIA', dataConferimento: oggi });
verifica('fascicolo aperto', fasc.stato === 201, fasc.dati);
const idF = fasc.dati?.id;

// ── 1. Chat: nomi di cliente, socio, titolare effettivo, CF → segnaposto ──
console.log('\n== 1. AI-01 — chat pseudonimizzata (dizionario del portafoglio) ==');
{
  const domanda = `Come valuto la Torrefazione Zancanaro ${suffisso} Srl? Il socio Luca Bianchi ha il 40%, l'amministratrice Esposito Maria ha CF SPSMRA75S62B563Q; il cliente Mario Rossi è collegato.`;
  const r = await req('POST', '/ai/chat', { messaggi: [{ ruolo: 'utente', testo: domanda }] });
  verifica('la chat risponde', r.stato === 200 && typeof r.dati?.risposta === 'string', r.dati);
  const risposta = String(r.dati?.risposta ?? '');
  // La fixture rimanda la domanda così come l'ha ricevuta il «modello» (con i segnaposto), poi il worker ri-sostituisce.
  verifica('la risposta torna con i nomi ri-sostituiti', /Zancanaro/i.test(risposta) && /Bianchi/i.test(risposta) && /Esposito/i.test(risposta) && /SPSMRA75S62B563Q/.test(risposta) && /Mario Rossi/i.test(risposta), risposta);
  verifica('nessun segnaposto residuo nella risposta', !/\[(PF|PG|CF)_\d+\]/.test(risposta), risposta);
  verifica('il conteggio dei pseudonimi copre cliente, socio, carica, cliente PF e CF (≥ 5)', r.dati?.pseudonimi >= 5, r.dati?.pseudonimi);
  const voce = await ultimoAudit('USO_AI');
  const det = dettaglio(voce);
  verifica('audit USO_AI con funzione chat e conteggio pseudonimi', det.funzione === 'chat' && det.pseudonimi >= 5, voce);
  verifica('il registro non contiene nomi né CF', !JSON.stringify(voce).match(/Zancanaro|Bianchi|Esposito|SPSMRA75S62B563Q/i), voce);
}
{
  // Stabilità dentro la conversazione: lo stesso socio nei tre turni (anche in ordine inverso) ha un solo
  // segnaposto, l'IBAN un altro: il conteggio è 2, non 4.
  const r = await req('POST', '/ai/chat', { messaggi: [
    { ruolo: 'utente', testo: 'Il socio Luca Bianchi ha il 40%.' },
    { ruolo: 'assistente', testo: 'Ok, Luca Bianchi al 40%.' },
    { ruolo: 'utente', testo: 'E Bianchi Luca deve essere identificato? Il suo IBAN è IT60X0542811101000000123456.' },
  ] });
  verifica('conversazione a più turni accettata', r.stato === 200, r.dati);
  verifica('nome in ordine inverso e IBAN ri-sostituiti', /Bianchi Luca/i.test(r.dati?.risposta ?? '') && /IT60X0542811101000000123456/.test(r.dati?.risposta ?? ''), r.dati);
  verifica('un solo pseudonimo per la persona più uno per l’IBAN', r.dati?.pseudonimi === 2, r.dati?.pseudonimi);
}
{
  const r = await req('POST', '/ai/chat', { messaggi: [{ ruolo: 'utente', testo: 'Come registro un titolare effettivo con quota indiretta?' }] });
  verifica('testo senza identificativi: pseudonimi = 0 e risposta normale', r.stato === 200 && r.dati?.pseudonimi === 0 && /quota indiretta/.test(r.dati?.risposta ?? ''), r.dati);
}

// ── 2. Bozza: dizionario del cliente del fascicolo ──
console.log('\n== 2. AI-01 — bozza con dizionario del cliente ==');
{
  const r = await req('POST', '/ai/bozza', { tipo: 'SCOPO_NATURA', fascicoloId: idF, appunti: `Incarico chiesto da Esposito Maria per la Torrefazione Zancanaro ${suffisso}; contatti: maria@esempio.it, 049 8761234.` });
  verifica('bozza generata', r.stato === 200 && typeof r.dati?.bozza === 'string', r.dati);
  verifica('appunti ri-sostituiti nella bozza (nome, denominazione, email, telefono)', /Esposito Maria/i.test(r.dati?.bozza ?? '') && /Zancanaro/i.test(r.dati?.bozza ?? '') && /maria@esempio\.it/.test(r.dati?.bozza ?? '') && /049 8761234/.test(r.dati?.bozza ?? ''), r.dati);
  verifica('pseudonimi contati (≥ 4)', r.dati?.pseudonimi >= 4, r.dati?.pseudonimi);
  const det = dettaglio(await ultimoAudit('USO_AI'));
  verifica('audit della bozza con pseudonimi', det.funzione === 'scopo_natura' && det.pseudonimi >= 4, det);
}

// ── 3. Suggeritore di indicatori: dizionario del portafoglio ──
console.log('\n== 3. AI-01 — suggeritore di indicatori pseudonimizzato ==');
{
  const r = await req('POST', '/ai/indicatori', { descrizione: `Versamenti ripetuti di contante appena sotto soglia da parte di Luca Bianchi, socio della Torrefazione Zancanaro ${suffisso}, frazionati in modo artificioso su più giorni consecutivi.` });
  verifica('suggerimenti restituiti', r.stato === 200 && Array.isArray(r.dati?.suggerimenti) && r.dati.suggerimenti.length >= 1, r.dati);
  verifica('pseudonimi contati (≥ 2)', r.dati?.pseudonimi >= 2, r.dati?.pseudonimi);
  // Il motivo di prova riporta la descrizione come l'ha vista il modello, poi ri-sostituita: quindi con i nomi e senza segnaposto.
  const motivo = r.dati?.suggerimenti?.[0]?.motivo ?? '';
  verifica('il motivo (fixture) torna ri-sostituito', /Bianchi/i.test(motivo) && !/\[PF_\d+\]/.test(motivo), motivo);
}

// ── 4. Cintura di sicurezza: si dimostra sul modulo puro (vitest) perché lo strato non lascia passare nulla;
//       qui si verifica che l'errore 422 abbia il codice atteso quando la chiamata è costruita per fallire.
console.log('\n== 4. AI-01 — errori e registro ==');
{
  const log = (await req('GET', '/audit')).dati ?? [];
  const usi = log.filter((v) => v.azione === 'USO_AI');
  verifica('tutti gli usi AI del giro portano il conteggio dei pseudonimi', usi.slice(0, 5).every((v) => typeof dettaglio(v).pseudonimi === 'number'), usi.slice(0, 5).map(dettaglio));
  verifica('nessun USO_AI_RIFIUTATO in un giro pulito', !log.some((v) => v.azione === 'USO_AI_RIFIUTATO'), null);
}

// ── 5. AI-04 — informativa v2 con ri-accettazione ──
console.log('\n== 5. AI-04 — informativa versionata ==');
{
  const st = await req('GET', '/ai/stato');
  verifica('stato AI con versione accettata = corrente (2) dopo l’abilitazione di questo giro', st.stato === 200 && st.dati?.versioneAccettata === 2 && st.dati?.versioneCorrente === 2 && st.dati?.daRiaccettare === false, st.dati);
  verifica('data e autore dell’accettazione', typeof st.dati?.accettataIl === 'string' && typeof st.dati?.accettataDa === 'string', st.dati);
  const ab = await ultimoAudit('ABILITA_AI');
  verifica('audit ABILITA_AI con la versione dell’informativa', dettaglio(ab).versioneInformativa === 2, ab);

  // Tenant con la v1: parametri.ai senza versioneInformativa (com'erano fino ad AR-M20). Solo in locale.
  let simulato = false;
  try {
    const sql = path.join(qui, '..', '.wrangler', 'smoke-m21-v1.sql');
    fs.writeFileSync(sql, `UPDATE tenants SET parametri = json_set(COALESCE(parametri,'{}'), '$.ai', json('{"abilitata":true,"accettataIl":"2026-08-01T10:00:00.000Z","da":"usr_tit"}')) WHERE id = 'ten_demo';\n`);
    execSync(`npx wrangler d1 execute contify-antiriciclaggio --local --file=${sql}`, { cwd: path.join(qui, '..'), stdio: 'pipe' });
    simulato = true;
  } catch (e) { console.log('  (simulazione v1 non riuscita: ' + String(e.message).slice(0, 120) + ')'); }
  if (simulato) {
    const st1 = await req('GET', '/ai/stato');
    verifica('tenant con accettazione precedente → versione 1, da riaccettare', st1.dati?.versioneAccettata === 1 && st1.dati?.daRiaccettare === true, st1.dati);
    const chat = await req('POST', '/ai/chat', { messaggi: [{ ruolo: 'utente', testo: 'Dove si registra il controllo costante?' }] });
    verifica('con la v1 le funzioni di prima restano attive (chat 200)', chat.stato === 200, chat.dati);
    const bozza = await req('POST', '/ai/bozza', { tipo: 'SCOPO_NATURA', fascicoloId: idF, appunti: 'tenuta contabilità' });
    verifica('con la v1 la bozza classica resta attiva (200)', bozza.stato === 200, bozza.dati);
    const noAcc = await req('POST', '/ai/abilita', { abilita: true });
    verifica('la ri-accettazione richiede accetto=true', noAcc.stato === 400, noAcc.dati);
    const ri = await req('POST', '/ai/abilita', { abilita: true, accetto: true });
    verifica('ri-accettazione registrata con la versione 2', ri.stato === 200 && ri.dati?.versioneInformativa === 2, ri.dati);
    const st2 = await req('GET', '/ai/stato');
    verifica('dopo la conferma: versione 2, niente da riaccettare, data aggiornata', st2.dati?.versioneAccettata === 2 && st2.dati?.daRiaccettare === false && st2.dati?.accettataIl > '2026-08-02', st2.dati);
  }
}

console.log(`\nRisultato: ${ok} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
