/**
 * Smoke test AR-M18: il fascicolo proposto.
 *
 *   npx wrangler dev --port 8787 --local   (dopo reset + migrate 0001..0011 + seed, con SANZIONI_FIXTURES=1)
 *   node scripts/smoke-api-m18.mjs
 *
 * Cosa si dimostra:
 *  1. cataloghi: 107 province, settori esposti con fonte per voce; tabella province vuota all'inizio;
 *  2. fascicolo proposto da una SRL 70/30 (Padova, costituita da 10 mesi): A.1=1, A.2=1 dall'attività
 *     dichiarata (ATECO assente, non inventato), A.3 chiesto, A.4 CHIESTO «da verificare» finché la tabella
 *     delle province è vuota; esecutore = amministratore unico; A10 «recente costituzione»;
 *  3. tabella di studio delle province: validazione (sigla e livello), salvataggio con audit,
 *     poi A.4 = 3 con alert A10 per la provincia «alto»;
 *  4. nuovo fascicolo con esecutore dalla proposta → proposta ESECUTORE APPLICATA, RISCHIO_A PROPOSTA;
 *     checklist con visura presente/assente;
 *  5. consolidamento della Tabella A: scostarsi senza motivazione è vietato (400); con motivazione
 *     la proposta diventa MODIFICATA e la valutazione conserva provenienza e scostamenti;
 *     confermare i punteggi proposti → APPLICATA;
 *  6. dichiarazione art. 22 precompilata .docx (presenza);
 *  7. verifica a distanza dalla proposta: il cliente vede compagine e titolari, deve rispondere a tutte
 *     le domande (400 altrimenti), conferma → nessun segnale; acquisizione → documento
 *     DICHIARAZIONE_ART22 nel fascicolo e checklist aggiornata; risposta con correzioni/PEP → segnali;
 *  8. 4×25%: A.1=3, domande di controllo dell'alert A2 nella dichiarazione; società in liquidazione:
 *     A9, esecutore = liquidatore, A.2 dall'oggetto sociale (46.90 commercio all'ingrosso → 1).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leggiVisura } from '../web/src/lib/visura.ts';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const qui = path.dirname(fileURLToPath(import.meta.url));
let ok = 0, fail = 0;
function verifica(d, cond, ctx) {
  if (cond) { ok++; console.log(`  ok   ${d}`); }
  else { fail++; console.log(`  FAIL ${d}`); if (ctx !== undefined) console.log(`       ${JSON.stringify(ctx).slice(0, 600)}`); }
}
let cookie = '';
async function req(metodo, percorso, corpo, form, opz = {}) {
  const r = await fetch(`${BASE}/api${percorso}`, {
    method: metodo,
    headers: { ...(corpo && !form ? { 'Content-Type': 'application/json' } : {}), ...(cookie && !opz.senzaCookie ? { Cookie: cookie } : {}) },
    body: form ? form : corpo ? JSON.stringify(corpo) : undefined,
  });
  const set = r.headers.get('set-cookie');
  if (set && !opz.senzaCookie) cookie = set.split(';')[0];
  if (opz.binario) return { stato: r.status, tipo: r.headers.get('content-type'), bytes: (await r.arrayBuffer()).byteLength };
  const t = await r.text();
  let dati = null;
  try { dati = t ? JSON.parse(t) : null; } catch { dati = t; }
  return { stato: r.status, dati };
}
const fixture = (n) => leggiVisura(fs.readFileSync(path.join(qui, '..', 'tests', 'fixtures', 'visure', n), 'utf8'));
const suffisso = String(Date.now()).slice(-6);

function corpoDaVisura(v, extra = {}) {
  return {
    anagrafica: {
      denominazione: v.denominazione, tipo: v.tipoProposto, codiceFiscale: v.codiceFiscale, partitaIva: v.partitaIva,
      paeseResidenza: 'IT', attivitaPrevalente: v.attivitaPrevalente, ateco: v.ateco,
      datiIdentificativi: {
        sede: v.sede.testo, provincia: v.sede.provincia, pec: v.pec, rea: v.rea, formaGiuridica: v.formaGiuridica, capitaleSociale: v.capitale.sottoscritto,
        dataCostituzione: v.dataCostituzione, visuraDel: v.dataEstrazione, oggettoSociale: v.oggettoSociale, statoAttivita: v.statoAttivita, inLiquidazione: v.inLiquidazione || undefined,
      },
      ...extra.anagrafica,
    },
    soci: v.soci, cariche: v.cariche, capitale: v.capitale, dataVisura: v.dataEstrazione, dataElencoSoci: v.dataElencoSoci,
    telemetria: { tipoVisura: v.tipoVisura, formaVisura: v.formaVisura, pagine: 7, campiNonTrovati: v.campiNonTrovati, avvisi: v.avvisi.length, soci: v.soci.length, cariche: v.cariche.length, tipoIncerto: v.tipoIncerto, dataEstrazione: v.dataEstrazione },
    ...extra,
  };
}

const login = await req('POST', '/auth/login', { email: 'titolare@studiodemo.it', password: 'Antiriciclaggio!2026' });
verifica('login professionista', login.stato === 200, login);

// ── 1. Cataloghi ──────────────────────────────────────────────
console.log('\n== 1. Cataloghi e tabella province ==');
const prov = await req('GET', '/catalogo/province');
verifica('107 province con riferimento alla mappa ANR', prov.dati?.province?.length === 107 && /dt\.mef\.gov\.it/.test(prov.dati?.riferimento?.url ?? ''), prov.dati?.riferimento);
const sett = await req('GET', '/catalogo/settori-esposti');
verifica('settori esposti: ogni voce ha fonti e punteggio', Array.isArray(sett.dati) && sett.dati[0]?.voci?.every((v) => v.fonti.length > 0 && v.punteggio >= 1), sett.dati?.[0]?.voci?.slice(0, 2));
// La tabella potrebbe essere già stata compilata da una corsa precedente: la si azzera.
await req('POST', '/studio/province-contante', { province: [] });
const tab0 = await req('GET', '/studio/province-contante');
verifica('tabella province vuota (o azzerata)', tab0.stato === 200 && (tab0.dati?.tabella === null || tab0.dati?.tabella?.province?.length === 0), tab0.dati?.tabella);

// ── 2. Fascicolo proposto da SRL 70/30 ────────────────────────
console.log('\n== 2. Fascicolo proposto: SRL 70/30, tabella province vuota ==');
const v1 = fixture('srl-due-soci-pf.txt');
v1.codiceFiscale = `18234${suffisso}`; v1.partitaIva = v1.codiceFiscale;
const c1 = await req('POST', '/clienti/da-visura', corpoDaVisura(v1));
verifica('cliente da visura creato', c1.stato === 201, c1);
const id1 = c1.dati?.id;
const fp1 = await req('GET', `/clienti/${id1}/fascicolo-proposto`);
verifica('A.1 = 1 (struttura piana, due soci PF)', fp1.dati?.tabellaA?.natura_giuridica?.punteggio === 1 && fp1.dati?.tabellaA?.natura_giuridica?.stato === 'PROPOSTO', fp1.dati?.tabellaA?.natura_giuridica);
verifica('A.2 = 1 dall’attività dichiarata (agenzia di commercio informatico: non esposta), ATECO assente non inventato', fp1.dati?.tabellaA?.prevalente_attivita?.punteggio === 1 && /non rientra nei settori esposti/.test(fp1.dati?.tabellaA?.prevalente_attivita?.motivazione ?? '') && !/ATECO/.test(fp1.dati?.tabellaA?.prevalente_attivita?.motivazione.split(':')[0] ?? ''), fp1.dati?.tabellaA?.prevalente_attivita);
verifica('A.3 sempre chiesto', fp1.dati?.tabellaA?.comportamento?.stato === 'CHIESTO', fp1.dati?.tabellaA?.comportamento);
verifica('A.4 da verificare: Padova letta dalla sede, tabella dello studio vuota', fp1.dati?.tabellaA?.area_geografica_cliente?.stato === 'CHIESTO' && fp1.dati?.tabellaA?.area_geografica_cliente?.daVerificare === true && /Padova/.test(fp1.dati?.tabellaA?.area_geografica_cliente?.motivazione ?? ''), fp1.dati?.tabellaA?.area_geografica_cliente);
verifica('esecutore proposto: amministratore unico con rappresentanza', fp1.dati?.esecutore?.carica === 'AMMINISTRATORE_UNICO' && fp1.dati?.esecutore?.rappresentanzaLegale === true && /visura camerale del/.test(fp1.dati?.esecutore?.fonte ?? ''), fp1.dati?.esecutore);
verifica('checklist: visura mancante, identità esecutore e 2 TE, dichiarazione art. 22', fp1.dati?.checklist?.find((x) => x.codice === 'VISURA')?.presente === false && fp1.dati?.checklist?.filter((x) => x.codice.startsWith('ID_TE_')).length === 2 && fp1.dati?.checklist?.some((x) => x.codice === 'DICHIARAZIONE_ART22'), fp1.dati?.checklist?.map((x) => x.codice));
verifica('A10 «recente costituzione» (atto del 13/10/2025), nessun A9; provenienza dalla visura', fp1.dati?.alert?.length === 1 && fp1.dati?.alert?.[0]?.codice === 'A10' && /recente costituzione/.test(fp1.dati?.alert?.[0]?.titolo ?? '') && /visura estratta il/.test(fp1.dati?.provenienza ?? ''), fp1.dati?.alert);

// ── 3. Tabella province ───────────────────────────────────────
console.log('\n== 3. Tabella delle province dello studio ==');
const errSigla = await req('POST', '/studio/province-contante', { province: [{ sigla: 'XX', livello: 'ALTO' }] });
verifica('sigla sconosciuta → 400', errSigla.stato === 400, errSigla);
const errLiv = await req('POST', '/studio/province-contante', { province: [{ sigla: 'PD', livello: 'MEDIO' }] });
verifica('livello non ammesso → 400', errLiv.stato === 400, errLiv);
const tabOk = await req('POST', '/studio/province-contante', { province: [{ sigla: 'pd', livello: 'alto' }, { sigla: 'MI', livello: 'MEDIO_ALTO' }], fonte: 'ANR 2024, Fig. 3 (lettura dello studio)', dataFonte: '2024-11-01' });
verifica('tabella salvata e normalizzata', tabOk.stato === 200 && tabOk.dati?.tabella?.province?.length === 2 && tabOk.dati?.tabella?.province?.[0]?.sigla === 'MI', tabOk.dati);
const audit = await req('GET', '/audit');
verifica('audit PROVINCE_CONTANTE_AGGIORNATE', (audit.dati?.voci ?? audit.dati ?? []).some?.((a) => a.azione === 'PROVINCE_CONTANTE_AGGIORNATE'), null);
const fp1b = await req('GET', `/clienti/${id1}/fascicolo-proposto`);
verifica('A.4 = 3 per Padova «alto», con fonte della tabella dello studio', fp1b.dati?.tabellaA?.area_geografica_cliente?.punteggio === 3 && /tabella dello studio/.test(fp1b.dati?.tabellaA?.area_geografica_cliente?.fonte ?? ''), fp1b.dati?.tabellaA?.area_geografica_cliente);
verifica('alert A10 bassa per la provincia (oltre a quello sulla costituzione)', fp1b.dati?.alert?.some((a) => a.codice === 'A10' && a.gravita === 'bassa' && a.fattore === 'area_geografica_cliente'), fp1b.dati?.alert);

// ── 4. Nuovo fascicolo con esecutore dalla proposta ───────────
console.log('\n== 4. Fascicolo con esecutore proposto ==');
const e1 = fp1b.dati.esecutore;
const f1 = await req('POST', '/fascicoli', {
  clienteId: id1, prestazioneCodice: 'CONSULENZA_TRIBUTARIA', tipoRapporto: 'CONTINUATIVO', dataConferimento: '2026-09-01',
  esecutore: { nominativo: e1.nominativo, codiceFiscale: e1.codiceFiscale, carica: e1.carica, caricaTesto: e1.caricaTesto, fonte: e1.fonte, daProposta: true },
});
verifica('fascicolo 201 con proposta registrata ed esecutore APPLICATA', f1.stato === 201 && typeof f1.dati?.propostaFascicoloId === 'string' && f1.dati?.esecutore === 'APPLICATA', f1.dati);
const fid1 = f1.dati?.id;
const pr1 = await req('GET', `/fascicoli/${fid1}/proposta`);
verifica('proposte del fascicolo: RISCHIO_A aperta, ESECUTORE applicata', pr1.dati?.propostaRischioId === f1.dati?.propostaFascicoloId && pr1.dati?.proposte?.some((p) => p.ambito === 'ESECUTORE' && p.stato === 'APPLICATA'), pr1.dati?.proposte);
verifica('esecutore registrato sul fascicolo', pr1.dati?.esecutoreRegistrato?.nominativo === e1.nominativo, pr1.dati?.esecutoreRegistrato);
const fdet = await req('GET', `/fascicoli/${fid1}`);
verifica('GET fascicolo: esecutore in JSON', JSON.parse(fdet.dati?.fascicolo?.esecutore ?? '{}')?.nominativo === e1.nominativo, fdet.dati?.fascicolo?.esecutore);
// Visura conservata → la checklist la vede.
const form = new FormData();
form.append('file', new Blob([`%PDF-1.4 visura ${suffisso}\n%%EOF`], { type: 'application/pdf' }), 'visura.pdf');
form.append('tipo', 'VISURA');
await req('POST', `/clienti/${id1}/documenti`, null, form);
const pr1b = await req('GET', `/fascicoli/${fid1}/proposta`);
verifica('checklist: visura ora presente', pr1b.dati?.checklist?.find((x) => x.codice === 'VISURA')?.presente === true, pr1b.dati?.checklist?.find((x) => x.codice === 'VISURA'));

// ── 5. Valutazione con proposta ───────────────────────────────
console.log('\n== 5. Consolidamento della Tabella A dalla proposta ==');
const punteggi = Object.fromEntries(Object.values(pr1b.dati.tabellaA).map((f) => [f.codice, f.punteggio]));
const tabellaA = { natura_giuridica: 2, prevalente_attivita: 1, comportamento: 1, area_geografica_cliente: 3 }; // A.1 scostato (1 → 2)
const tabellaB = { tipologia: 1, modalita_svolgimento: 1, ammontare: 1, frequenza_durata: 1, ragionevolezza: 1, area_geografica_destinazione: 1 };
const val0 = await req('POST', `/fascicoli/${fid1}/valutazioni`, { tabellaA, tabellaB, circostanze: {}, proposta: { id: pr1b.dati.propostaRischioId, punteggi, provenienza: pr1b.dati.provenienza } });
verifica('scostamento senza motivazione → 400 con elenco', val0.stato === 400 && Array.isArray(val0.dati?.scostamenti) && val0.dati.scostamenti.length === 1, val0.dati);
const val1 = await req('POST', `/fascicoli/${fid1}/valutazioni`, { tabellaA, tabellaB, circostanze: {}, proposta: { id: pr1b.dati.propostaRischioId, punteggi, provenienza: pr1b.dati.provenienza, motivazioneScostamento: 'Nuovo cliente: struttura da conoscere meglio' } });
verifica('con motivazione → 201', val1.stato === 201, val1.dati);
const fdet2 = await req('GET', `/fascicoli/${fid1}`);
const ultima = fdet2.dati?.valutazioni?.[0];
verifica('la valutazione conserva provenienza e scostamento', /Tabella A proposta dal programma/.test(ultima?.motivazione ?? '') && /proposto 1, valutato 2/.test(ultima?.motivazione ?? '') && /Nuovo cliente/.test(ultima?.motivazione ?? ''), ultima?.motivazione);
const pr1c = await req('GET', `/fascicoli/${fid1}/proposta`);
verifica('proposta RISCHIO_A → MODIFICATA con motivazione cifrata', pr1c.dati?.proposte?.some((p) => p.ambito === 'RISCHIO_A' && p.stato === 'MODIFICATA' && /Nuovo cliente/.test(p.esito?.motivazione ?? '')), pr1c.dati?.proposte);
// Secondo fascicolo: si confermano i punteggi proposti → APPLICATA.
const f2 = await req('POST', '/fascicoli', { clienteId: id1, prestazioneCodice: 'TENUTA_CONTABILITA', tipoRapporto: 'CONTINUATIVO', dataConferimento: '2026-09-02' });
const pr2 = await req('GET', `/fascicoli/${f2.dati?.id}/proposta`);
const punteggi2 = Object.fromEntries(Object.values(pr2.dati.tabellaA).map((f) => [f.codice, f.punteggio]));
const val2 = await req('POST', `/fascicoli/${f2.dati?.id}/valutazioni`, { tabellaA: { ...punteggi2, prevalente_attivita: 1, comportamento: 1 }, circostanze: {}, proposta: { id: pr2.dati.propostaRischioId, punteggi: punteggi2, provenienza: pr2.dati.provenienza } });
verifica('punteggi proposti confermati → 201', val2.stato === 201, val2.dati);
const pr2b = await req('GET', `/fascicoli/${f2.dati?.id}/proposta`);
verifica('proposta RISCHIO_A → APPLICATA', pr2b.dati?.proposte?.some((p) => p.ambito === 'RISCHIO_A' && p.stato === 'APPLICATA'), pr2b.dati?.proposte);

// ── 6. Dichiarazione art. 22 .docx ────────────────────────────
console.log('\n== 6. Dichiarazione art. 22 precompilata (.docx) ==');
const docx = await req('GET', `/clienti/${id1}/dichiarazione-art22?fascicolo=${fid1}`, null, null, { binario: true });
verifica('docx generato', docx.stato === 200 && /wordprocessingml/.test(docx.tipo ?? '') && docx.bytes > 8000, docx);

// ── 7. Verifica a distanza dalla proposta ─────────────────────
console.log('\n== 7. Verifica a distanza con dichiarazione precompilata ==');
const vr = await req('POST', `/fascicoli/${fid1}/verifica-remota`, { richieste: { datiIdentificativi: false, documento: false, titolari: true, pep: false, dichiarazioneTe: true } });
verifica('richiesta creata con link', vr.stato === 201 && /#verifica\?token=/.test(vr.dati?.url ?? ''), vr.dati);
const token = vr.dati?.url?.split('token=')[1];
const pub = await req('GET', `/pubblico/verifica/${token}`, null, null, { senzaCookie: true });
verifica('pagina pubblica: compagine (2 soci), 2 titolari proposti, 5 domande, esecutore; sezione titolari libera spenta', pub.dati?.dichiarazioneTe?.ripartizione?.length === 2 && pub.dati?.dichiarazioneTe?.titolariProposti?.length === 2 && pub.dati?.dichiarazioneTe?.domande?.length === 5 && pub.dati?.dichiarazioneTe?.esecutore?.nominativo && pub.dati?.richieste?.titolari === false && pub.dati?.richieste?.precompilata === undefined, pub.dati);
const pre = pub.dati.dichiarazioneTe;
const invio = (dati) => { const fd = new FormData(); fd.set('dati', JSON.stringify(dati)); return req('POST', `/pubblico/verifica/${token}`, null, fd, { senzaCookie: true }); };
const r0 = await invio({ dichiarazione: { accettata: true, nomeDichiarante: 'Mario Rossi' }, dichiarazioneTe: { conferma: 'CONFERMA', risposte: [], pep: [] } });
verifica('senza risposte alle domande → 400', r0.stato === 400 && /domande/.test(r0.dati?.errore ?? ''), r0.dati);
const soggetti = [...pre.titolariProposti.map((t) => t.nominativo), pre.esecutore.nominativo].filter((x, i, a) => a.indexOf(x) === i);
const r1 = await invio({
  dichiarazione: { accettata: true, nomeDichiarante: pre.esecutore.nominativo },
  dichiarazioneTe: { conferma: 'CONFERMA', risposte: pre.domande.map((d) => ({ domanda: d, risposta: 'NO' })), pep: soggetti.map((n) => ({ nominativo: n, ruolo: 'TITOLARE_EFFETTIVO', pep: false })) },
});
verifica('conferma completa → ok', r1.stato === 200 && r1.dati?.ok === true, r1.dati);
const lista = await req('GET', `/fascicoli/${fid1}/verifiche-remote`);
const rid = lista.dati?.find((x) => x.stato === 'COMPLETATA')?.id;
const det = await req('GET', `/verifiche-remote/${rid}`);
verifica('lo studio vede risposte e precompilata; nessun segnale', det.dati?.dati?.dichiarazioneTe?.conferma === 'CONFERMA' && det.dati?.precompilata?.titolariProposti?.length === 2 && det.dati?.segnali?.length === 0, det.dati?.segnali);
const acq = await req('POST', `/verifiche-remote/${rid}/acquisisci`, { acquisisciDichiarazione: true });
verifica('acquisizione: dichiarazione nel fascicolo, titolari confermati restituiti al professionista', acq.dati?.applicato?.includes('dichiarazione_art22') && acq.dati?.titolariDichiarati?.length === 2 && acq.dati?.titolariDichiarati?.[0]?.confermato === true, acq.dati);
const fdet3 = await req('GET', `/fascicoli/${fid1}`);
verifica('documento DICHIARAZIONE_ART22 conservato (docx, sha256)', fdet3.dati?.documenti?.some((d) => d.tipo === 'DICHIARAZIONE_ART22' && /\.docx$/.test(d.nome_file) && d.sha256?.length === 64), fdet3.dati?.documenti);
const pr1d = await req('GET', `/fascicoli/${fid1}/proposta`);
verifica('checklist: dichiarazione art. 22 presente', pr1d.dati?.checklist?.find((x) => x.codice === 'DICHIARAZIONE_ART22')?.presente === true, pr1d.dati?.checklist?.find((x) => x.codice === 'DICHIARAZIONE_ART22'));
// Seconda richiesta: correzioni + un «Sì» + un PEP → segnali.
const vr2 = await req('POST', `/fascicoli/${fid1}/verifica-remota`, { richieste: { datiIdentificativi: false, documento: false, pep: false, dichiarazioneTe: true } });
const token2 = vr2.dati?.url?.split('token=')[1];
const fd2 = new FormData();
fd2.set('dati', JSON.stringify({
  dichiarazione: { accettata: true, nomeDichiarante: 'Mario Rossi' },
  dichiarazioneTe: {
    conferma: 'CORREGGE', correzioni: 'La quota di ESPOSITO MARIA è stata ceduta il 1.8.2026', titolari: [{ nominativo: 'NUOVO SOCIO', codiceFiscale: 'NVSSCO80A01H501U', quota: '70' }],
    risposte: pre.domande.map((d, i) => ({ domanda: d, risposta: i === 0 ? 'SI' : 'NO', dettagli: i === 0 ? 'patto parasociale del 2024' : '' })),
    pep: soggetti.map((n, i) => ({ nominativo: n, ruolo: 'TITOLARE_EFFETTIVO', pep: i === 0, dettagli: i === 0 ? 'consigliere regionale dal 2023' : '' })),
  },
}));
const r2 = await req('POST', `/pubblico/verifica/${token2}`, null, fd2, { senzaCookie: true });
verifica('correzione con Sì e PEP → accettata', r2.stato === 200, r2.dati);
const lista2 = await req('GET', `/fascicoli/${fid1}/verifiche-remote`);
const rid2 = lista2.dati?.find((x) => x.stato === 'COMPLETATA')?.id;
const det2 = await req('GET', `/verifiche-remote/${rid2}`);
verifica('tre segnali da valutare (correzione, Sì al controllo, PEP)', det2.dati?.segnali?.length === 3, det2.dati?.segnali);
const acq2 = await req('POST', `/verifiche-remote/${rid2}/acquisisci`, { acquisisciDichiarazione: false });
verifica('senza acquisire il documento: titolari corretti tornano al professionista, non si scrive nulla', acq2.dati?.titolariDichiarati?.[0]?.nominativo === 'NUOVO SOCIO' && !acq2.dati?.applicato?.includes('dichiarazione_art22') && acq2.dati?.segnali?.length === 3, acq2.dati);
const te1 = await req('GET', `/clienti/${id1}`);
verifica('titolari effettivi NON scritti dalla dichiarazione', (te1.dati?.titolariEffettivi ?? []).length === 0, te1.dati?.titolariEffettivi);

// ── 8. 4×25% e liquidazione ───────────────────────────────────
console.log('\n== 8. Quattro soci al 25% e società in liquidazione ==');
const v4 = fixture('srl-quattro-soci-25.txt');
v4.codiceFiscale = `18434${suffisso}`; v4.partitaIva = v4.codiceFiscale;
const c4 = await req('POST', '/clienti/da-visura', corpoDaVisura(v4));
const fp4 = await req('GET', `/clienti/${c4.dati?.id}/fascicolo-proposto`);
verifica('4×25%: A.1 = 3 (criterio della proprietà non individua TE)', fp4.dati?.tabellaA?.natura_giuridica?.punteggio === 3 && /non individua/.test(fp4.dati?.tabellaA?.natura_giuridica?.motivazione ?? ''), fp4.dati?.tabellaA?.natura_giuridica);
verifica('circostanza «assetto proprietario complesso» suggerita', fp4.dati?.circostanze?.some((c) => c.chiave === 'assettoProprietarioComplesso'), fp4.dati?.circostanze);
const docx4 = await req('GET', `/clienti/${c4.dati?.id}/dichiarazione-art22`, null, null, { binario: true });
verifica('dichiarazione art. 22 anche senza TE per proprietà', docx4.stato === 200 && docx4.bytes > 8000, docx4);

const vL = fixture('srl-liquidazione-fiduciaria-estero-quote-proprie.txt');
vL.codiceFiscale = `18534${suffisso}`; vL.partitaIva = vL.codiceFiscale;
const cL = await req('POST', '/clienti/da-visura', corpoDaVisura(vL));
verifica('cliente in liquidazione creato', cL.stato === 201, cL.dati);
const fpL = await req('GET', `/clienti/${cL.dati?.id}/fascicolo-proposto`);
verifica('A9 liquidazione (media)', fpL.dati?.alert?.some((a) => a.codice === 'A9' && a.gravita === 'media'), fpL.dati?.alert);
verifica('esecutore = liquidatore', fpL.dati?.esecutore?.carica === 'LIQUIDATORE', fpL.dati?.esecutore);
verifica('A.1 = 4 (fiduciaria fra i soci, socio estero)', fpL.dati?.tabellaA?.natura_giuridica?.punteggio === 4, fpL.dati?.tabellaA?.natura_giuridica);
verifica('A.2 = 1 da ATECO 46.90 (non esposto), con fonte della tabella', fpL.dati?.tabellaA?.prevalente_attivita?.punteggio === 1 && /46\.90/.test(fpL.dati?.tabellaA?.prevalente_attivita?.motivazione ?? ''), fpL.dati?.tabellaA?.prevalente_attivita);
verifica('checklist: mandato fiduciario e documentazione estera', fpL.dati?.checklist?.some((x) => x.tipoDocumento === 'MANDATO_FIDUCIARIO') && fpL.dati?.checklist?.some((x) => x.tipoDocumento === 'DOCUMENTAZIONE_ESTERA'), fpL.dati?.checklist?.map((x) => x.codice));

console.log(`\n${ok} ok / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
