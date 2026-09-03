/**
 * Smoke test AR-M20: controllo costante alimentato dai dati.
 *
 *   npx wrangler dev --port 8787 --local   (dopo reset + migrate 0001..0013 + seed, con SANZIONI_FIXTURES=1)
 *   node scripts/smoke-api-m20.mjs
 *
 * Cosa si dimostra:
 *  1. A12 — anzianità della visura: con un fascicolo valutato (cadenza 24 mesi) e una visura del 2023 il
 *     programma segnala A12 nella proposta di titolarità, mette «Rinnovo della visura» fra le scadenze e
 *     «Visura camerale da rinnovare» fra le cose da completare; una visura recente spegne tutto;
 *  2. M20-02 — rinnovo con diff: soci e cariche variati sono descritti riga per riga; se cambia la
 *     struttura nasce una proposta RIVALUTAZIONE per il fascicolo vivo valutato (una sola, anche
 *     ripetendo); il controllo costante registrato con `propostaId` la chiude (DA_RIVALUTARE → APPLICATA,
 *     INVARIATO → MODIFICATA con motivazione obbligatoria); un cambio di solo sindaco non è struttura;
 *  3. M20-03 — registro dei titolari effettivi (art. 21-ter, D.Lgs. 122/2026): accreditamento con
 *     delegati; consultazione con validazioni; prova dell'iscrizione (co. 12) agganciata; difformità →
 *     alert A13 e mancanza alta; segnalazione alla Camera di commercio (co. 7) con validazioni; il vecchio
 *     riscontro AR-M8 resta compatibile; audit.
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
async function caricaDoc(clienteId, tipo, nome, dataRiferimento) {
  const form = new FormData();
  form.append('file', new Blob([`%PDF-1.4 ${nome} ${suffisso} ${Math.random()}\n%%EOF`], { type: 'application/pdf' }), nome);
  form.append('tipo', tipo);
  if (dataRiferimento) form.append('dataRiferimento', dataRiferimento);
  return req('POST', `/clienti/${clienteId}/documenti`, null, form);
}
const mancanze = async (id) => ((await req('GET', '/completezza')).dati?.clienti?.find((c) => c.id === id)?.mancanze ?? []).map((m) => m.codice);

const login = await req('POST', '/auth/login', { email: 'titolare@studiodemo.it', password: 'Antiriciclaggio!2026' });
verifica('login professionista', login.stato === 200, login);
await req('POST', '/screening/esegui');

// ── 0. Cliente da visura, fascicolo valutato e firmato, titolari registrati ──
console.log('\n== 0. Preparazione: cliente da visura (70/30), fascicolo valutato, titolari ==');
const v1 = fixture('srl-due-soci-pf.txt');
v1.codiceFiscale = `05555${suffisso}`; v1.partitaIva = v1.codiceFiscale; v1.denominazione = `RINNOVO ${suffisso} SRL`;
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
const idF = fasc.dati?.id;
{
  const A = { natura_giuridica: 4, prevalente_attivita: 4, comportamento: 4, area_geografica_cliente: 4 };
  const B = { tipologia: 4, modalita_svolgimento: 4, ammontare: 4, frequenza_durata: 4, ragionevolezza: 4, area_geografica_destinazione: 4 };
  const val = await req('POST', `/fascicoli/${idF}/valutazioni`, { tabellaA: A, tabellaB: B, circostanze: {} });
  verifica('valutazione con controllo costante a 24 mesi', val.stato === 201 && val.dati?.esito?.controlloCostanteMesi === 24, val.dati?.esito);
  const firma = await req('POST', `/fascicoli/${idF}/valutazioni/${val.dati?.id}/firma`);
  verifica('valutazione firmata', firma.stato === 200, firma.dati);
}

// ── 1. A12 ──────────────────────────────────────────────────
console.log('\n== 1. A12: anzianità della visura vs cadenza del controllo costante ==');
const vecchia = await caricaDoc(id1, 'VISURA', 'visura-2023.pdf', '2023-01-10');
verifica('visura del 2023 conservata', vecchia.stato === 201, vecchia.dati);
let comp = await req('GET', `/clienti/${id1}/compagine`);
let a12 = comp.dati?.alert?.find((a) => a.codice === 'A12');
verifica('A12 nella proposta: bassa, non bloccante, azione «Aggiorna da visura», cadenza 24', a12 && a12.gravita === 'bassa' && !a12.bloccante && a12.azione?.tipo === 'RINNOVA_VISURA' && a12.azione?.cadenzaMesi === 24, comp.dati?.alert?.map((a) => a.codice));
verifica('il messaggio cita la data della visura e la cadenza', a12?.messaggio?.includes('10/01/2023') && a12?.messaggio?.includes('24 mesi'), a12?.messaggio);
let scad = await req('GET', '/scadenzario');
let rinnovo = scad.dati?.scadute?.find((s) => s.tipo === 'RINNOVO_VISURA' && s.fascicoloId === idF);
verifica('scadenzario: «Rinnovo della visura» SCADUTA sul fascicolo, organizzativa, art. 19 co. 1 lett. d)', rinnovo && rinnovo.normativa === false && rinnovo.norma.includes('lett. d)') && rinnovo.data === '2025-01-10', rinnovo);
let codici = await mancanze(id1);
verifica('da completare: VISURA_DA_RINNOVARE presente, VISURA_ASSENTE no', codici.includes('VISURA_DA_RINNOVARE') && !codici.includes('VISURA_ASSENTE'), codici);
const nuova = await caricaDoc(id1, 'VISURA', 'visura-oggi.pdf', oggi);
verifica('visura di oggi conservata', nuova.stato === 201, nuova.dati);
comp = await req('GET', `/clienti/${id1}/compagine`);
verifica('con la visura recente A12 tace', !comp.dati?.alert?.some((a) => a.codice === 'A12'), comp.dati?.alert?.map((a) => a.codice));
scad = await req('GET', '/scadenzario');
rinnovo = [...(scad.dati?.future ?? [])].find((s) => s.tipo === 'RINNOVO_VISURA' && s.fascicoloId === idF);
verifica('scadenzario: il rinnovo è FUTURO (visura + 24 mesi)', rinnovo && rinnovo.giorniResidui > 700, [scad.dati?.scadute?.filter((s) => s.tipo === 'RINNOVO_VISURA' && s.fascicoloId === idF), rinnovo]);
codici = await mancanze(id1);
verifica('VISURA_DA_RINNOVARE sparita', !codici.includes('VISURA_DA_RINNOVARE'), codici);

// ── 2. Rinnovo con diff e rivalutazione proposta ────────────
console.log('\n== 2. Rinnovo della visura: diff e proposta di rivalutazione ==');
// Solo un sindaco in più: non è struttura.
const v1s = structuredClone(v1);
v1s.cariche.push({ nome: 'SINDACO NUOVO', codiceFiscale: 'SNDNVO70A01H501X', id: 'SNDNVO70A01H501X', carica: 'SINDACO', caricaTesto: 'sindaco effettivo', rappresentanzaLegale: false });
const aggS = await req('POST', `/clienti/${id1}/da-visura`, { ...corpoDaVisura(v1s), campi: {}, dataVisura: oggi });
verifica('nuovo sindaco: variazione descritta, struttura NON cambiata, nessuna rivalutazione', aggS.stato === 200 && aggS.dati?.variazioni?.righe?.some((r) => r.includes('SINDACO NUOVO')) && aggS.dati?.variazioni?.strutturaCambiata === false && aggS.dati?.rivalutazioni?.length === 0, aggS.dati?.variazioni);
// Cessione: 70/30 → 40/30/30 con un socio nuovo.
const v1b = structuredClone(v1s);
v1b.soci[0] = { ...v1b.soci[0], quotaPercento: 40 };
v1b.soci.push({ ...v1b.soci[1], nome: 'TERZO SOCIO', codiceFiscale: 'TRZSCO85C03L219K', id: 'TRZSCO85C03L219K', quotaPercento: 30 });
const agg = await req('POST', `/clienti/${id1}/da-visura`, { ...corpoDaVisura(v1b), campi: {}, dataVisura: oggi });
verifica('rinnovo ok: quota variata + socio entrato descritti', agg.stato === 200 && agg.dati?.variazioni?.righe?.some((r) => r.startsWith('Quota variata:')) && agg.dati?.variazioni?.righe?.some((r) => r.includes('Socio entrato: TERZO SOCIO')), agg.dati?.variazioni);
verifica('struttura cambiata → una proposta RIVALUTAZIONE per il fascicolo valutato', agg.dati?.variazioni?.strutturaCambiata === true && agg.dati?.rivalutazioni?.length === 1 && agg.dati?.rivalutazioni?.[0]?.fascicoloId === idF, agg.dati?.rivalutazioni);
const propRiv = agg.dati?.rivalutazioni?.[0]?.propostaId;
comp = await req('GET', `/clienti/${id1}/compagine`);
const pr = comp.dati?.proposte?.find((p) => p.id === propRiv);
verifica('la proposta è leggibile: ambito RIVALUTAZIONE, riepilogo con la visura di oggi, esito proposto DA_RIVALUTARE', pr?.ambito === 'RIVALUTAZIONE' && pr?.stato === 'PROPOSTA' && pr?.contenuto?.esitoProposto === 'DA_RIVALUTARE' && pr?.contenuto?.riepilogo?.includes('Quota variata'), pr);
codici = await mancanze(id1);
verifica('da completare: PROPOSTA_DA_RIVEDERE', codici.includes('PROPOSTA_DA_RIVEDERE'), codici);
const agg2 = await req('POST', `/clienti/${id1}/da-visura`, { ...corpoDaVisura(v1b), campi: {}, dataVisura: oggi });
verifica('stessa visura ricaricata: nessuna variazione, nessuna seconda proposta', agg2.stato === 200 && agg2.dati?.variazioni?.righe?.length === 0 && agg2.dati?.rivalutazioni?.length === 0, agg2.dati?.variazioni);
const v1c = structuredClone(v1b);
v1c.soci[0].quotaPercento = 35; v1c.soci[2].quotaPercento = 35;
const agg3 = await req('POST', `/clienti/${id1}/da-visura`, { ...corpoDaVisura(v1c), campi: {}, dataVisura: oggi });
verifica('altra variazione con proposta già aperta: non se ne accoda un’altra', agg3.stato === 200 && agg3.dati?.variazioni?.strutturaCambiata === true && agg3.dati?.rivalutazioni?.length === 0, agg3.dati?.rivalutazioni);
const invSenzaNote = await req('POST', `/fascicoli/${idF}/controllo-costante`, { esito: 'INVARIATO', verifiche: ['COMPAGINE'], propostaId: propRiv });
verifica('«invariato» sulla proposta senza motivazione → 400', invSenzaNote.stato === 400, invSenzaNote.dati);
const ctl = await req('POST', `/fascicoli/${idF}/controllo-costante`, { esito: 'DA_RIVALUTARE', verifiche: pr?.contenuto?.verificheProposte ?? ['COMPAGINE'], note: pr?.contenuto?.riepilogo, propostaId: propRiv });
verifica('controllo costante «da rivalutare» registrato con la proposta → APPLICATA', ctl.stato === 201 && ctl.dati?.prossimaValutazione === true && ctl.dati?.proposta === 'APPLICATA', ctl.dati);
comp = await req('GET', `/clienti/${id1}/compagine`);
verifica('la proposta risulta APPLICATA e rivista', comp.dati?.proposte?.find((p) => p.id === propRiv)?.stato === 'APPLICATA' && comp.dati?.proposte?.find((p) => p.id === propRiv)?.rivistaDa, comp.dati?.proposte?.map((p) => [p.ambito, p.stato]));
const ctlDoppio = await req('POST', `/fascicoli/${idF}/controllo-costante`, { esito: 'INVARIATO', verifiche: ['COMPAGINE'], note: 'Rivisto: nulla da fare', propostaId: propRiv });
verifica('la stessa proposta non si chiude due volte (controllo registrato, proposta non toccata)', ctlDoppio.stato === 201 && ctlDoppio.dati?.proposta === null, ctlDoppio.dati);
const audit = await req('GET', '/audit');
verifica('audit AGGIORNA_CLIENTE con strutturaCambiata e rivalutazioniProposte', (audit.dati ?? []).some((a) => a.azione === 'AGGIORNA_CLIENTE' && String(a.dettaglio ?? '').includes('"strutturaCambiata":true') && String(a.dettaglio ?? '').includes('"rivalutazioniProposte":1')), (audit.dati ?? []).filter((a) => a.azione === 'AGGIORNA_CLIENTE').slice(0, 2).map((a) => a.dettaglio));

// ── 3. Registro dei titolari effettivi ──────────────────────
console.log('\n== 3. Registro dei titolari effettivi (art. 21-ter, D.Lgs. 122/2026) ==');
const persone = await req('GET', '/studio/persone');
const delegato = (persone.dati ?? []).find((p) => p.nome && !/titolare/i.test(p.nome))?.id ?? persone.dati?.[0]?.id;
const accr = await req('POST', '/studio/registro-accreditamento', { data: '2026-08-01', delegati: [delegato, 'utente-inesistente'], riferimento: `PRA/2026/${suffisso}`, cameraDiCommercio: 'Padova' });
verifica('accreditamento con delegati (solo utenti veri), riferimento e Camera; scade fra due anni', accr.stato === 200 && accr.dati?.registroTe?.scadeIl === '2028-08-01' && accr.dati?.registroTe?.delegati?.length === 1 && accr.dati?.registroTe?.riferimento === `PRA/2026/${suffisso}`, accr.dati);
const futuroAccr = await req('POST', '/studio/registro-accreditamento', { data: '2099-01-01' });
verifica('accreditamento con data futura respinto', futuroAccr.stato === 400, futuroAccr.dati);
let reg = await req('GET', `/clienti/${id1}/registro-te`);
verifica('storico vuoto, accreditamento visibile, tipo documento della prova', reg.dati?.consultazioni?.length === 0 && reg.dati?.accreditamento?.accreditato === true && reg.dati?.tipoDocumentoProva === 'ESTRATTO_REGISTRO_TE', reg.dati);
codici = await mancanze(id1);
verifica('da completare: REGISTRO_TE_NON_CONSULTATO (titolari registrati, nessuna consultazione)', codici.includes('REGISTRO_TE_NON_CONSULTATO'), codici);
const esitoNo = await req('POST', `/clienti/${id1}/registro-te`, { data: oggi, esito: 'BOH' });
verifica('esito non valido → 400', esitoNo.stato === 400, esitoNo.dati);
const diffNo = await req('POST', `/clienti/${id1}/registro-te`, { data: oggi, esito: 'DIFFORME' });
verifica('difforme senza descrizione → 400', diffNo.stato === 400, diffNo.dati);
const futura = await req('POST', `/clienti/${id1}/registro-te`, { data: '2099-01-01', esito: 'CORRISPONDE' });
verifica('data futura → 400', futura.stato === 400, futura.dati);
const ncNo = await req('POST', `/clienti/${id1}/registro-te`, { data: oggi, esito: 'NON_CONSULTABILE' });
verifica('non consultabile senza motivo → 400', ncNo.stato === 400, ncNo.dati);
const k1 = await req('POST', `/clienti/${id1}/registro-te`, { data: oggi, esito: 'CORRISPONDE', fascicoloId: idF });
verifica('consultazione CORRISPONDE registrata, titolari confrontati > 0', k1.stato === 201 && k1.dati?.esito === 'CORRISPONDE' && k1.dati?.titolariConfrontati > 0 && k1.dati?.daSegnalare === false && k1.dati?.fascicoloId === idF, k1.dati);
codici = await mancanze(id1);
verifica('da completare: REGISTRO_TE_PROVA_ASSENTE (corrisponde, ma senza estratto)', codici.includes('REGISTRO_TE_PROVA_ASSENTE') && !codici.includes('REGISTRO_TE_NON_CONSULTATO'), codici);
const estratto = await caricaDoc(id1, 'ESTRATTO_REGISTRO_TE', 'estratto-registro.pdf', oggi);
verifica('estratto del registro conservato fra i documenti del cliente', estratto.stato === 201, estratto.dati);
const provaNo = await req('POST', `/registro-te/${k1.dati?.id}/prova`, { documentoId: 'doc-inesistente' });
verifica('prova con documento inesistente → 400', provaNo.stato === 400, provaNo.dati);
const prova = await req('POST', `/registro-te/${k1.dati?.id}/prova`, { documentoId: estratto.dati?.id });
verifica('estratto agganciato alla consultazione (co. 12)', prova.stato === 200 && prova.dati?.documentoId === estratto.dati?.id && prova.dati?.documentoNome === 'estratto-registro.pdf', prova.dati);
codici = await mancanze(id1);
verifica('nessuna mancanza sul registro', !codici.some((k) => k.startsWith('REGISTRO_TE') || k === 'DIFFORMITA_NON_SEGNALATA'), codici);
const cli = await req('GET', `/clienti/${id1}`);
verifica('compatibilità AR-M8: la fotografia dei titolari porta registro_consultato = 1 senza incongruenza', (cli.dati?.titolariEffettivi ?? []).every((t) => t.registro_consultato === 1 && t.registro_incongruenza === 0 && t.registro_data === oggi), cli.dati?.titolariEffettivi);
const k2 = await req('POST', `/clienti/${id1}/registro-te`, { data: oggi, esito: 'DIFFORME', difformita: 'Nel registro risulta ancora il socio uscito con il 70%.' });
verifica('consultazione DIFFORME registrata, da segnalare, difformità leggibile (cifrata a riposo)', k2.stato === 201 && k2.dati?.daSegnalare === true && k2.dati?.difformita?.includes('socio uscito'), k2.dati);
comp = await req('GET', `/clienti/${id1}/compagine`);
const a13 = comp.dati?.alert?.find((a) => a.codice === 'A13');
verifica('A13 nella proposta: alta, non bloccante, azione SEGNALA_DIFFORMITA sulla consultazione', a13 && a13.gravita === 'alta' && !a13.bloccante && a13.azione?.tipo === 'SEGNALA_DIFFORMITA' && a13.azione?.consultazioneId === k2.dati?.id, comp.dati?.alert?.map((a) => a.codice));
codici = await mancanze(id1);
const mDiff = ((await req('GET', '/completezza')).dati?.clienti?.find((c) => c.id === id1)?.mancanze ?? []).find((m) => m.codice === 'DIFFORMITA_NON_SEGNALATA');
verifica('da completare: DIFFORMITA_NON_SEGNALATA, alta, per prima', codici[0] === 'DIFFORMITA_NON_SEGNALATA' && mDiff?.gravita === 'alta', codici);
const segNoCons = await req('POST', `/registro-te/${k1.dati?.id}/segnalazione`, { data: oggi });
verifica('segnalazione su una consultazione che corrisponde → 400', segNoCons.stato === 400, segNoCons.dati);
const segPrima = await req('POST', `/registro-te/${k2.dati?.id}/segnalazione`, { data: '2020-01-01' });
verifica('segnalazione precedente alla consultazione → 400', segPrima.stato === 400, segPrima.dati);
const seg = await req('POST', `/registro-te/${k2.dati?.id}/segnalazione`, { data: oggi, riferimento: `CCIAA-PD/${suffisso}`, note: 'Inviata con dichiarazione sostitutiva via PEC.' });
verifica('segnalazione registrata con riferimento e note', seg.stato === 200 && seg.dati?.segnalazione?.riferimento === `CCIAA-PD/${suffisso}` && seg.dati?.segnalazione?.note?.includes('PEC') && seg.dati?.daSegnalare === false, seg.dati);
const segDoppia = await req('POST', `/registro-te/${k2.dati?.id}/segnalazione`, { data: oggi });
verifica('seconda segnalazione respinta', segDoppia.stato === 400, segDoppia.dati);
comp = await req('GET', `/clienti/${id1}/compagine`);
verifica('A13 tace dopo la segnalazione', !comp.dati?.alert?.some((a) => a.codice === 'A13'), comp.dati?.alert?.map((a) => a.codice));
codici = await mancanze(id1);
verifica('DIFFORMITA_NON_SEGNALATA sparita', !codici.includes('DIFFORMITA_NON_SEGNALATA'), codici);
const legacy = await req('POST', `/clienti/${id1}/titolarita/registro`, { data: oggi, incongruenza: false });
verifica('vecchio riscontro AR-M8 → consultazione CORRISPONDE', legacy.stato === 200 && legacy.dati?.consultazione?.esito === 'CORRISPONDE', legacy.dati);
reg = await req('GET', `/clienti/${id1}/registro-te`);
verifica('storico: 3 consultazioni, la più recente prima, chi le ha fatte', reg.dati?.consultazioni?.length === 3 && reg.dati.consultazioni.every((k) => k.eseguitoDa), reg.dati?.consultazioni?.map((k) => [k.esito, k.eseguitoDa]));
const audit2 = await req('GET', '/audit');
const azioni = new Set((audit2.dati ?? []).map((a) => a.azione));
verifica('audit: CONSULTAZIONE_REGISTRO_TE, SEGNALAZIONE_DIFFORMITA_TE, PROVA_REGISTRO_TE, ACCREDITAMENTO_REGISTRO_TE', ['CONSULTAZIONE_REGISTRO_TE', 'SEGNALAZIONE_DIFFORMITA_TE', 'PROVA_REGISTRO_TE', 'ACCREDITAMENTO_REGISTRO_TE'].every((k) => azioni.has(k)), [...azioni].filter((k) => k.includes('TE')));
const nomiInAudit = (audit2.dati ?? []).filter((a) => ['CONSULTAZIONE_REGISTRO_TE', 'SEGNALAZIONE_DIFFORMITA_TE'].includes(a.azione)).some((a) => String(a.dettaglio ?? '').includes('socio uscito') || String(a.dettaglio ?? '').includes('PEC'));
verifica('l’audit non contiene la descrizione della difformità né le note (cifrate nella riga)', !nomiInAudit);
const regole = await req('GET', '/catalogo/regole-completezza');
verifica('17 regole di completezza (13 + A12 + 3 registro TE)', regole.dati?.length === 17, regole.dati?.map((r) => r.codice));

console.log(`\n== Esito: ${ok} ok / ${fail} FAIL ==`);
process.exit(fail ? 1 : 0);
