/**
 * Smoke test AR-M17: anagrafiche da visura, compagine, alert, documenti del cliente.
 *
 *   npx wrangler dev --port 8787 --local   (dopo reset + migrate 0001..0011 + seed, con SANZIONI_FIXTURES=1)
 *   node scripts/smoke-api-m17.mjs
 *
 * Cosa si dimostra:
 *  1. «Nuovo da visura» crea il cliente con compagine e cariche cifrate, proposta
 *     di titolarità (SRL 70/30: proprietà diretta, nessun alert) e telemetria anonima;
 *  2. la visura si conserva fra i documenti del cliente (sha256, niente doppioni,
 *     DELETE del cliente rifiutata perché ha documenti);
 *  3. lo stesso CF non produce un secondo cliente (409 doppione);
 *  4. quattro soci al 25%: A1 → A2 → A3 con bozza ex co. 6; la conferma della
 *     titolarità chiude la proposta come APPLICATA;
 *  5. socio persona giuridica già cliente dello studio: la catena si chiude da sola;
 *  6. «Aggiorna da visura»: PATCH selettivo + diff della compagine (serie temporale);
 *  7. screening automatico dei nomi estratti (fixture liste) → A8 bloccante, esito SOCIO;
 *  8. esito delle proposte: scartare senza motivazione è vietato.
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
  else { fail++; console.log(`  FAIL ${d}`); if (ctx !== undefined) console.log(`       ${JSON.stringify(ctx).slice(0, 500)}`); }
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

/** Ciò che il browser manda al worker a partire dalla VisuraLetta. */
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

const login = await req('POST', '/auth/login', { email: 'titolare@studiodemo.it', password: 'Antiriciclaggio!2026' });
verifica('login professionista', login.stato === 200, login);
// Liste sanzioni finte per lo screening immediato.
await req('POST', '/screening/esegui');

// ── 1. Nuovo da visura: SRL 70/30 ─────────────────────────────
console.log('\n== 1. Nuovo da visura (SRL due soci PF) ==');
const v1 = fixture('srl-due-soci-pf.txt');
const suffisso = String(Date.now()).slice(-6); // sei cifre: CF/P.IVA diversi a ogni corsa
v1.codiceFiscale = `01234${suffisso}`;
v1.partitaIva = v1.codiceFiscale;
const c1 = await req('POST', '/clienti/da-visura', corpoDaVisura(v1));
verifica('creazione 201 con id', c1.stato === 201 && typeof c1.dati?.id === 'string', c1);
const id1 = c1.dati?.id;
verifica('compagine aperta: 2 soci, 1 carica', c1.dati?.diff?.partecipazioni?.aperte === 2 && c1.dati?.diff?.cariche?.aperte === 1, c1.dati?.diff);
verifica('proposta: proprietà diretta, due titolari', c1.dati?.proposta?.analisi?.criterioApplicato === 'PROPRIETA_DIRETTA' && c1.dati?.proposta?.analisi?.titolari?.length === 2, c1.dati?.proposta?.analisi);
verifica('nessun alert per una SRL semplice', Array.isArray(c1.dati?.proposta?.alert) && c1.dati.proposta.alert.length === 0, c1.dati?.proposta?.alert);
const s1 = await req('GET', `/clienti/${id1}`);
verifica('scheda: ateco vuoto (non inventato), dati identificativi con sede/PEC/REA', s1.dati?.cliente?.ateco === null && s1.dati?.cliente?.dati_identificativi?.pec === 'esempio@pec.it' && s1.dati?.cliente?.dati_identificativi?.rea === 'PD - 123456', s1.dati?.cliente);
verifica('scheda: compagine in sintesi', s1.dati?.compagine?.soci === 2 && s1.dati?.compagine?.cariche === 1 && s1.dati?.compagine?.fonteData === '2025-10-15', s1.dati?.compagine);
const comp1 = await req('GET', `/clienti/${id1}/compagine`);
verifica('compagine decifrata: nomi e CF in chiaro per lo studio', comp1.dati?.soci?.[0]?.nome === 'ESPOSITO MARIA' && comp1.dati?.soci?.[0]?.codiceFiscale === 'SPSMRA75S62B563Q' && comp1.dati?.soci?.[0]?.quotaPercento === 70, comp1.dati?.soci);
verifica('carica decifrata con rappresentanza e poteri', comp1.dati?.cariche?.[0]?.carica === 'AMMINISTRATORE_UNICO' && comp1.dati?.cariche?.[0]?.rappresentanzaLegale === true && comp1.dati?.cariche?.[0]?.dataNomina === '2025-10-13', comp1.dati?.cariche);
verifica('proposta ANAGRAFICA registrata come applicata', comp1.dati?.proposte?.some((p) => p.ambito === 'ANAGRAFICA' && p.stato === 'APPLICATA'), comp1.dati?.proposte);

const audit1 = await req('GET', '/audit');
const visuraLetta = (audit1.dati?.voci ?? audit1.dati ?? []).find?.((a) => a.azione === 'VISURA_LETTA' && a.entita_id === id1);
verifica('audit VISURA_LETTA presente', Boolean(visuraLetta), Object.keys(audit1.dati ?? {}));
if (visuraLetta) {
  const det = String(visuraLetta.dettaglio ?? '');
  verifica('telemetria anonima: etichette non trovate, nessun nome/CF', det.includes('Codice ATECO') && !det.includes('ROSSI') && !det.includes('RSSMRA'), det);
}

// ── 2. Documenti del cliente ──────────────────────────────────
console.log('\n== 2. Visura conservata fra i documenti del cliente ==');
const pdfFinto = new Blob([`%PDF-1.4 fixture ${suffisso}\n%%EOF`], { type: 'application/pdf' });
const form = new FormData();
form.append('file', pdfFinto, 'visura-esempio.pdf');
form.append('tipo', 'VISURA');
form.append('dataRiferimento', '2025-12-03');
const d1 = await req('POST', `/clienti/${id1}/documenti`, null, form);
verifica('upload 201 con sha256', d1.stato === 201 && /^[0-9a-f]{64}$/.test(d1.dati?.sha256 ?? ''), d1);
const form2 = new FormData();
form2.append('file', pdfFinto, 'visura-esempio.pdf');
form2.append('tipo', 'VISURA');
const d1bis = await req('POST', `/clienti/${id1}/documenti`, null, form2);
verifica('stesso file: non duplicato (giaPresente)', d1bis.stato === 200 && d1bis.dati?.giaPresente === true && d1bis.dati?.id === d1.dati?.id, d1bis);
const docs = await req('GET', `/clienti/${id1}/documenti`);
verifica('elenco documenti del cliente: 1 visura del 3.12.2025', docs.dati?.length === 1 && docs.dati[0].tipo === 'VISURA' && docs.dati[0].data_riferimento === '2025-12-03', docs.dati);
const s1b = await req('GET', `/clienti/${id1}`);
verifica('scheda cliente: documenti elencati e collegamenti.documenti = 1', s1b.dati?.documenti?.length === 1 && s1b.dati?.collegamenti?.documenti === 1, s1b.dati?.collegamenti);
const scarica = await fetch(`${BASE}/api/documenti/${d1.dati?.id}`, { headers: { Cookie: cookie } });
verifica('GET /documenti/:id restituisce il PDF', scarica.status === 200 && (scarica.headers.get('content-type') ?? '').includes('pdf'), scarica.status);
const del1 = await req('DELETE', `/clienti/${id1}`);
verifica('DELETE cliente con documenti → 409 (art. 31)', del1.stato === 409 && del1.dati?.codice === 'cliente_collegato', del1);

// ── 3. Doppione ───────────────────────────────────────────────
console.log('\n== 3. Doppione ==');
const c1dup = await req('POST', '/clienti/da-visura', corpoDaVisura(v1));
verifica('stesso CF → 409 doppione con id del cliente esistente', c1dup.stato === 409 && c1dup.dati?.codice === 'doppione' && c1dup.dati?.clienteId === id1, c1dup);

// ── 4. Quattro soci al 25% ────────────────────────────────────
console.log('\n== 4. Quattro soci al 25%: A1 → A2 → A3 ==');
const v4 = fixture('srl-quattro-soci-25.txt');
v4.codiceFiscale = `04567${suffisso}`;
v4.partitaIva = v4.codiceFiscale;
const c4 = await req('POST', '/clienti/da-visura', corpoDaVisura(v4));
verifica('creazione', c4.stato === 201, c4);
const id4 = c4.dati?.id;
const codici4 = (c4.dati?.proposta?.alert ?? []).map((a) => a.codice);
verifica('alert A1, A2, A3 in quest’ordine', JSON.stringify(codici4) === '["A1","A2","A3"]', codici4);
const a3 = (c4.dati?.proposta?.alert ?? []).find((a) => a.codice === 'A3');
verifica('A3 bloccante con candidato DELTA DARIO e bozza ex co. 6', a3?.bloccante === true && a3?.azione?.candidati?.[0]?.nome === 'DELTA DARIO' && /art\. 20 co\. 5/.test(a3?.azione?.bozzaMotivazione ?? ''), a3?.azione);
verifica('la bozza cita la visura e la ripartizione', /01\/09\/2026/.test(a3?.azione?.bozzaMotivazione ?? '') && /ALFA ANNA 25%/.test(a3?.azione?.bozzaMotivazione ?? ''), a3?.azione?.bozzaMotivazione);
verifica('proposta TITOLARITA con codici alert in chiaro', typeof c4.dati?.proposta?.id === 'string', c4.dati?.proposta?.id);
const comp4 = await req('GET', `/clienti/${id4}/compagine`);
const prop4 = comp4.dati?.proposte?.find((p) => p.ambito === 'TITOLARITA');
verifica('proposta in stato PROPOSTA, alert [A1,A2,A3]', prop4?.stato === 'PROPOSTA' && prop4.alert.map((a) => a.codice).join() === 'A1,A2,A3', prop4);
const conferma4 = await req('POST', `/clienti/${id4}/titolarita`, {
  propostaId: prop4?.id,
  titolari: [{ nominativo: 'DELTA DARIO', codiceFiscale: 'DLTDRA90D04A944E', criterio: 'RESIDUALE_POTERI', norma: 'art. 20 co. 5', quota: null, pep: false, motivazione: a3?.azione?.bozzaMotivazione }],
});
verifica('conferma della titolarità con la proposta → APPLICATA', conferma4.stato === 200 && conferma4.dati?.propostaEsito === 'APPLICATA', conferma4);
const comp4b = await req('GET', `/clienti/${id4}/compagine`);
verifica('la proposta risulta rivista dal professionista', comp4b.dati?.proposte?.find((p) => p.id === prop4?.id)?.stato === 'APPLICATA' && comp4b.dati?.proposte?.find((p) => p.id === prop4?.id)?.rivistaDa, comp4b.dati?.proposte);

// ── 5. Catena risolta da sola ─────────────────────────────────
console.log('\n== 5. Socio persona giuridica già cliente: catena risolta ==');
const cfHolding = `03456${suffisso}`;
const holding = await req('POST', '/clienti', { denominazione: 'ALFA HOLDING SRL', tipo: 'SOCIETA_CAPITALI', codiceFiscale: cfHolding, partitaIva: cfHolding });
verifica('holding creata a mano', holding.stato === 201, holding);
const idH = holding.dati?.id;
// La holding ha un socio unico persona fisica al 100%.
const aggH = await req('POST', `/clienti/${idH}/da-visura`, {
  soci: [{ nome: 'VERDI GIULIA', codiceFiscale: 'VRDGLI70E50F205Q', tipo: 'PERSONA_FISICA', quotaPercento: 100, diritto: 'PROPRIETA' }],
  cariche: [{ nome: 'VERDI GIULIA', codiceFiscale: 'VRDGLI70E50F205Q', carica: 'AMMINISTRATORE_UNICO', rappresentanzaLegale: true }],
  dataVisura: '2026-05-01', campi: {},
});
verifica('compagine della holding registrata', aggH.stato === 200 && aggH.dati?.diff?.partecipazioni?.aperte === 1, aggH);
const vB = fixture('srl-holding-usufrutto-cda.txt');
vB.codiceFiscale = `02345${suffisso}`;
vB.partitaIva = vB.codiceFiscale;
vB.soci[0].codiceFiscale = cfHolding; vB.soci[0].id = cfHolding;
const cB = await req('POST', '/clienti/da-visura', corpoDaVisura(vB));
verifica('Beta creata', cB.stato === 201, cB);
const idB = cB.dati?.id;
const pB = cB.dati?.proposta;
verifica('catena innestata con la holding', pB?.catena?.[0]?.clienteId === idH, pB?.catena);
verifica('Giulia Verdi titolare per proprietà INDIRETTA al 60%', pB?.analisi?.titolari?.some((t) => t.denominazione === 'VERDI GIULIA' && t.criterio === 'PROPRIETA_INDIRETTA' && t.quotaEffettiva === 0.6), pB?.analisi?.titolari);
verifica('Neri Anna (nuda proprietà 25%) NON supera la soglia; usufrutto segnalato', !pB?.analisi?.titolari?.some((t) => t.denominazione === 'NERI ANNA') && pB?.analisi?.vincoliSulleQuote?.[0]?.diritto === 'USUFRUTTO', pB?.analisi?.vincoliSulleQuote);
const codiciB = (pB?.alert ?? []).map((a) => a.codice).sort();
verifica('alert: A2 (usufrutto), A4 catena risolta, A7 capitale non versato; niente A1/A3/A5', JSON.stringify(codiciB) === '["A2","A4","A7"]', pB?.alert?.map((a) => [a.codice, a.titolo]));
verifica('A4 dice «catena risolta» e rimanda alla scheda della holding', pB?.alert?.find((a) => a.codice === 'A4')?.azione?.tipo === 'CATENA_RISOLTA', pB?.alert?.find((a) => a.codice === 'A4'));

// ── 6. Aggiorna da visura ─────────────────────────────────────
console.log('\n== 6. Aggiorna da visura: diff della compagine ==');
const vB2 = structuredClone(vB);
vB2.soci = vB2.soci.filter((s) => s.nome !== 'GIALLI MARCO');
vB2.soci.push({ ...vB.soci[3], nome: 'NUOVO SOCIO', codiceFiscale: 'NVOSCO90A01H501Z', id: 'NVOSCO90A01H501Z' });
const agg = await req('POST', `/clienti/${idB}/da-visura`, {
  ...corpoDaVisura(vB2), campi: { ateco: '62.10.00', attivitaPrevalente: 'PRODUZIONE DI SOFTWARE (aggiornata)' }, datiIdentificativi: { pec: 'nuova@pec.it' }, dataVisura: '2026-09-01',
});
verifica('aggiornamento ok con campi applicati', agg.stato === 200 && agg.dati?.applicati?.includes('ateco') && agg.dati?.applicati?.includes('datiIdentificativi.pec'), agg.dati);
verifica('diff: 1 socio chiuso, 1 aperto, 3 invariati', agg.dati?.diff?.partecipazioni?.chiuse === 1 && agg.dati?.diff?.partecipazioni?.aperte === 1 && agg.dati?.diff?.partecipazioni?.invariate === 3, agg.dati?.diff);
verifica('cariche invariate', agg.dati?.diff?.cariche?.chiuse === 0 && agg.dati?.diff?.cariche?.invariate === 3, agg.dati?.diff);
const sB = await req('GET', `/clienti/${idB}`);
verifica('PATCH selettivo applicato e dati identificativi FUSI (sede conservata, PEC nuova)', sB.dati?.cliente?.ateco === '62.10.00' && sB.dati?.cliente?.dati_identificativi?.pec === 'nuova@pec.it' && typeof sB.dati?.cliente?.dati_identificativi?.sede === 'string', sB.dati?.cliente?.dati_identificativi);
const compB = await req('GET', `/clienti/${idB}/compagine`);
verifica('compagine vigente: 4 soci, senza GIALLI, con NUOVO SOCIO', compB.dati?.soci?.length === 4 && !compB.dati.soci.some((s) => s.nome === 'GIALLI MARCO') && compB.dati.soci.some((s) => s.nome === 'NUOVO SOCIO'), compB.dati?.soci?.map((s) => s.nome));
verifica('nuova proposta TITOLARITA aperta e la precedente scartata', compB.dati?.proposte?.filter((p) => p.ambito === 'TITOLARITA' && p.stato === 'PROPOSTA').length === 1 && compB.dati?.proposte?.some((p) => p.ambito === 'TITOLARITA' && p.stato === 'SCARTATA'), compB.dati?.proposte?.map((p) => [p.ambito, p.stato]));

// ── 7. Screening automatico dei nomi estratti ─────────────────
console.log('\n== 7. Screening dei nomi estratti (fixture liste) ==');
const vS = fixture('srl-quattro-soci-25.txt');
vS.codiceFiscale = `09999${suffisso}`;
vS.partitaIva = vS.codiceFiscale; vS.denominazione = 'SOCIETA COLLAUDO SCREENING SRL';
vS.soci[0] = { ...vS.soci[0], nome: 'MARIO ROSSI COLLAUDO SANZIONI', codiceFiscale: 'RSSMRA60A01H501S', id: 'RSSMRA60A01H501S' };
const cS = await req('POST', '/clienti/da-visura', corpoDaVisura(vS));
verifica('creazione', cS.stato === 201, cS);
const idS = cS.dati?.id;
verifica('screening eseguito con corrispondenze nuove', cS.dati?.screening?.eseguito === true && cS.dati?.screening?.nuove >= 1, cS.dati?.screening);
const a8 = (cS.dati?.proposta?.alert ?? []).find((a) => a.codice === 'A8');
verifica('A8 bloccante con il nominativo', a8?.bloccante === true && a8?.azione?.nominativi?.[0]?.includes('COLLAUDO'), a8);
const scr = await req('GET', '/screening');
const esitoSocio = (scr.dati?.esiti ?? []).find((e) => e.soggetto_tipo === 'SOCIO' && e.nominativo.includes('COLLAUDO'));
verifica('esito SOCIO nei controlli automatici, da esaminare', esitoSocio?.stato === 'DA_ESAMINARE', scr.dati?.esiti?.slice(0, 3));
if (esitoSocio) {
  const dec = await req('POST', `/screening/${esitoSocio.id}`, { stato: 'ESCLUSO', nota: 'Omonimia: data di nascita diversa dalla voce in lista.' });
  verifica('decisione con motivazione', dec.stato === 200, dec);
  const compS = await req('GET', `/clienti/${idS}/compagine`);
  verifica('dopo l’esclusione motivata A8 non scatta più', !(compS.dati?.alert ?? []).some((a) => a.codice === 'A8'), compS.dati?.alert?.map((a) => a.codice));
}

// ── 8. Esito delle proposte ───────────────────────────────────
console.log('\n== 8. Esito delle proposte ==');
const propS = (await req('GET', `/clienti/${idS}/compagine`)).dati?.proposte?.find((p) => p.ambito === 'TITOLARITA' && p.stato === 'PROPOSTA');
const noMot = await req('POST', `/proposte/${propS?.id}/esito`, { stato: 'SCARTATA' });
verifica('scartare senza motivazione → 400', noMot.stato === 400, noMot);
const conMot = await req('POST', `/proposte/${propS?.id}/esito`, { stato: 'SCARTATA', motivazione: 'Compagine da verificare con il cliente prima di registrare.' });
verifica('scartata con motivazione → ok', conMot.stato === 200, conMot);
const bis = await req('POST', `/proposte/${propS?.id}/esito`, { stato: 'APPLICATA' });
verifica('una proposta già rivista non si rivede (404)', bis.stato === 404, bis);
const lettore = await req('GET', '/audit');
const voci = lettore.dati?.voci ?? lettore.dati ?? [];
verifica('RIVEDI_PROPOSTA nel registro', Array.isArray(voci) && voci.some((a) => a.azione === 'RIVEDI_PROPOSTA'), voci.slice?.(0, 2));

// ── Pulizia ───────────────────────────────────────────────────
console.log('\n== Pulizia ==');
for (const id of [idS, idB, idH, id4]) {
  if (!id) continue;
  const r = await req('DELETE', `/clienti/${id}`);
  verifica(`cancellazione ${id} (nessun documento)`, r.stato === 200, r);
}
const arch = await req('POST', `/clienti/${id1}/archiviazione`, { archivia: true });
verifica('il cliente con la visura conservata si archivia', arch.stato === 200, arch);

console.log(`\n${ok} ok / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
