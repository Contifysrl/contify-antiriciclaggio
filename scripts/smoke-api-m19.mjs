/**
 * Smoke test AR-M19: coda di revisione e cruscotto di completezza.
 *
 *   npx wrangler dev --port 8787 --local   (dopo reset + migrate 0001..0012 + seed, con SANZIONI_FIXTURES=1)
 *   node scripts/smoke-api-m19.mjs
 *
 * Cosa si dimostra:
 *  1. regole di completezza: ogni regola cita norma e modulistica; un cliente appena importato ha una sola
 *     cosa da fare (aprire il fascicolo); aperto il fascicolo compaiono valutazione, titolari, PEP, documenti;
 *  2. controllo costante: validazioni (esito, data, cosa si è controllato), registrazione con audit,
 *     `ultimo_controllo` scritto e scadenza spostata; storico;
 *  3. cessazione del fascicolo: stato CESSATO, termine di conservazione sui documenti (fascicolo e, se ultimo
 *     rapporto, cliente), il fascicolo esce dal cruscotto; seconda cessazione respinta;
 *  4. formazione: validazioni, registrazione con utenti dello studio e nomi liberi, elenco, indicatore AV.0
 *     «formazione» aggiornato, eliminazione riservata all'amministratore;
 *  5. caricamento in blocco di 20 visure: abbinamento per CF/P.IVA (una ESISTENTE con differenze), una
 *     doppia nella stessa corsa (GIA_IN_CODA), una senza denominazione (SCARTATA), PDF in transito;
 *  6. coda: le proposte con alert alti (4×25%) non sono applicabili in blocco; applica una NUOVA con
 *     correzione → MODIFICATA, cliente creato, visura conservata, proposta di titolarità in coda;
 *     applica l'ESISTENTE con un sottoinsieme di campi → MODIFICATA; scarto senza motivazione → 400;
 *  7. «Applica tutto»: applica solo le pulite e registra i titolari per proprietà; in coda restano le
 *     proposte con alert alti;
 *  8. A11: la stessa amministratrice in molti clienti → alert di ricorrenza (media, non bloccante);
 *  9. cruscotto: riepilogo «da completare» nel cruscotto e nel fattore AV.0 «organizzazione».
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

/** P.IVA italiane formalmente valide (cifra di controllo), diverse a ogni corsa. */
function pivaValida(seme) {
  const base = String(seme).padStart(10, '0').slice(-10);
  let somma = 0;
  for (let i = 0; i < 10; i++) {
    const d = Number(base[i]);
    if (i % 2 === 0) somma += d;
    else { const x = d * 2; somma += x > 9 ? x - 9 : x; }
  }
  return base + String((10 - (somma % 10)) % 10);
}

function voceDaVisura(v, extra = {}) {
  return {
    nomeFile: extra.nomeFile ?? `${(v.denominazione ?? 'visura').toLowerCase().replace(/\s+/g, '-')}.pdf`,
    anagrafica: {
      denominazione: v.denominazione, tipo: v.tipoProposto, codiceFiscale: v.codiceFiscale, partitaIva: v.partitaIva,
      paeseResidenza: 'IT', attivitaPrevalente: v.attivitaPrevalente, ateco: v.ateco,
      datiIdentificativi: {
        sede: v.sede.testo, provincia: v.sede.provincia, pec: v.pec, rea: v.rea, formaGiuridica: v.formaGiuridica, capitaleSociale: v.capitale.sottoscritto,
        dataCostituzione: v.dataCostituzione, visuraDel: v.dataEstrazione, oggettoSociale: v.oggettoSociale, statoAttivita: v.statoAttivita,
      },
      ...extra.anagrafica,
    },
    soci: v.soci, cariche: v.cariche, capitale: v.capitale, dataVisura: v.dataEstrazione, dataElencoSoci: v.dataElencoSoci,
    telemetria: { tipoVisura: v.tipoVisura, formaVisura: v.formaVisura, pagine: 7, campiNonTrovati: v.campiNonTrovati, avvisi: v.avvisi.length, soci: v.soci.length, cariche: v.cariche.length, tipoIncerto: v.tipoIncerto, dataEstrazione: v.dataEstrazione },
  };
}
/** Variante della fixture con denominazione e CF/P.IVA propri (soci e cariche invariati). */
function variante(v, n, prefisso = 'CODA') {
  const piva = pivaValida(`${suffisso}${String(n).padStart(2, '0')}`);
  return { ...v, denominazione: `${prefisso} ${n} ${suffisso} SRL`, codiceFiscale: piva, partitaIva: piva };
}

const login = await req('POST', '/auth/login', { email: 'titolare@studiodemo.it', password: 'Antiriciclaggio!2026' });
verifica('login professionista', login.stato === 200, login);

// ── 1. Regole e completezza ───────────────────────────────────
console.log('\n== 1. Regole di completezza ==');
const regole = await req('GET', '/catalogo/regole-completezza');
verifica('17 regole (13 M19 + A12 + 3 registro TE), ognuna con norma, modulistica e «quando»', regole.dati?.length === 17 && regole.dati.every((r) => r.norma && r.fonte && r.quando && r.pagina), regole.dati?.map((r) => r.codice));
const nuovoCliente = await req('POST', '/clienti', { tipo: 'SOCIETA_CAPITALI', denominazione: `COMPLETEZZA ${suffisso} SRL`, partitaIva: pivaValida(`${suffisso}99`) });
verifica('cliente creato a mano (come da import)', nuovoCliente.stato === 201, nuovoCliente.dati);
const idC = nuovoCliente.dati?.id;
let comp = await req('GET', '/completezza');
let vc = comp.dati?.clienti?.find((c) => c.id === idC);
verifica('cruscotto: struttura (avanzamento, perGravita, iniziaDa, regole)', typeof comp.dati?.avanzamento === 'number' && comp.dati?.perGravita && Array.isArray(comp.dati?.iniziaDa) && comp.dati?.regole?.length === 17, Object.keys(comp.dati ?? {}));
verifica('cliente appena creato: una sola cosa da fare, aprire il fascicolo (alta)', vc?.mancanze?.length === 1 && vc.mancanze[0].codice === 'FASCICOLO_ASSENTE' && vc.urgente === true, vc);
const fasc = await req('POST', '/fascicoli', { clienteId: idC, prestazioneCodice: 'CONSULENZA_TRIBUTARIA', dataConferimento: new Date().toISOString().slice(0, 10) });
verifica('fascicolo aperto', fasc.stato === 201, fasc.dati);
const idF = fasc.dati?.id;
comp = await req('GET', '/completezza');
vc = comp.dati?.clienti?.find((c) => c.id === idC);
const codici = (vc?.mancanze ?? []).map((m) => m.codice);
verifica('con il fascicolo: valutazione, titolari, PEP, documento, dichiarazione, visura', ['VALUTAZIONE_ASSENTE', 'TE_ASSENTI', 'PEP_NON_CHIESTO', 'ID_ASSENTE', 'ART22_ASSENTE', 'VISURA_ASSENTE'].every((k) => codici.includes(k)) && !codici.includes('FASCICOLO_ASSENTE'), codici);
verifica('le mancanze portano alla pagina giusta (fascicolo con id)', vc?.mancanze?.find((m) => m.codice === 'VALUTAZIONE_ASSENTE')?.fascicoloId === idF, vc?.mancanze?.[0]);

// ── 2. Controllo costante ─────────────────────────────────────
console.log('\n== 2. Controllo costante ==');
{
  const A = { natura_giuridica: 4, prevalente_attivita: 4, comportamento: 4, area_geografica_cliente: 4 };
  const B = { tipologia: 4, modalita_svolgimento: 4, ammontare: 4, frequenza_durata: 4, ragionevolezza: 4, area_geografica_destinazione: 4 };
  const val = await req('POST', `/fascicoli/${idF}/valutazioni`, { tabellaA: A, tabellaB: B, circostanze: { pep: true } });
  verifica('valutazione abbastanza significativa (controllo a 24 mesi), PEP → rafforzata', val.stato === 201 && val.dati?.esito?.controlloCostanteMesi === 24 && val.dati?.esito?.livelloApplicabile === 'RAFFORZATA', val.dati?.esito);
  const firma = await req('POST', `/fascicoli/${idF}/valutazioni/${val.dati?.id}/firma`);
  verifica('valutazione firmata', firma.stato === 200, firma.dati);
  const noEsito = await req('POST', `/fascicoli/${idF}/controllo-costante`, { verifiche: ['ANAGRAFICA'] });
  verifica('esito obbligatorio (400)', noEsito.stato === 400, noEsito.dati);
  const noVerifiche = await req('POST', `/fascicoli/${idF}/controllo-costante`, { esito: 'INVARIATO', verifiche: [] });
  verifica('serve dire cosa si è controllato (400)', noVerifiche.stato === 400, noVerifiche.dati);
  const futura = await req('POST', `/fascicoli/${idF}/controllo-costante`, { esito: 'INVARIATO', verifiche: ['ANAGRAFICA'], dataControllo: '2099-01-01' });
  verifica('data futura respinta (400)', futura.stato === 400, futura.dati);
  const senzaNote = await req('POST', `/fascicoli/${idF}/controllo-costante`, { esito: 'DA_RIVALUTARE', verifiche: ['COMPAGINE'] });
  verifica('«da rivalutare» senza note respinto (400)', senzaNote.stato === 400, senzaNote.dati);
  const ctl = await req('POST', `/fascicoli/${idF}/controllo-costante`, { esito: 'INVARIATO', verifiche: ['ANAGRAFICA', 'COMPAGINE', 'TITOLARI', 'LISTE'], note: 'Nulla di nuovo in visura.' });
  verifica('controllo registrato', ctl.stato === 201 && ctl.dati?.esito === 'INVARIATO' && ctl.dati?.prossimaValutazione === false, ctl.dati);
  const f = await req('GET', `/fascicoli/${idF}`);
  verifica('`ultimo_controllo` scritto sul fascicolo', f.dati?.fascicolo?.ultimo_controllo === ctl.dati?.data, f.dati?.fascicolo?.ultimo_controllo);
  const cc = f.dati?.scadenze?.find((s) => s.tipo === 'CONTROLLO_COSTANTE');
  verifica('prossimo controllo fra 24 mesi dal controllo eseguito', cc && cc.giorniResidui > 700 && cc.giorniResidui < 740, cc);
  const storico = await req('GET', `/fascicoli/${idF}/controlli-costanti`);
  verifica('storico dei controlli con chi e cosa', storico.dati?.length === 1 && storico.dati[0].verifiche.length === 4 && storico.dati[0].eseguito_da, storico.dati);
  const audit = await req('GET', '/audit');
  verifica('audit CONTROLLO_COSTANTE', (audit.dati ?? []).some((v) => v.azione === 'CONTROLLO_COSTANTE' && v.entita_id === idF));
}

// ── 3. Cessazione ─────────────────────────────────────────────
console.log('\n== 3. Cessazione del fascicolo ==');
{
  const form = new FormData();
  form.append('file', new Blob(['%PDF-1.4 prova incarico'], { type: 'application/pdf' }), 'incarico.pdf');
  form.append('tipo', 'INCARICO');
  const doc = await req('POST', `/fascicoli/${idF}/documenti`, null, form);
  verifica('documento del fascicolo senza termine di conservazione (rapporto in essere)', doc.stato === 201 && doc.dati?.conservaFinoAl === null, doc.dati);
  const prima = await req('POST', `/fascicoli/${idF}/cessazione`, { dataCessazione: '2020-01-01' });
  verifica('cessazione prima del conferimento respinta (400)', prima.stato === 400, prima.dati);
  const oggi = new Date().toISOString().slice(0, 10);
  const cess = await req('POST', `/fascicoli/${idF}/cessazione`, { dataCessazione: oggi, motivo: 'Fine dell’incarico' });
  verifica('fascicolo cessato, conservazione decennale calcolata, era l’ultimo rapporto', cess.stato === 200 && cess.dati?.conservaFinoAl?.startsWith(String(Number(oggi.slice(0, 4)) + 10)) && cess.dati?.ultimoRapporto === true, cess.dati);
  const f = await req('GET', `/fascicoli/${idF}`);
  verifica('stato CESSATO e documento con termine di conservazione', f.dati?.fascicolo?.stato === 'CESSATO' && f.dati?.documenti?.[0]?.conserva_fino_al === cess.dati?.conservaFinoAl, f.dati?.documenti);
  const doppia = await req('POST', `/fascicoli/${idF}/cessazione`, {});
  verifica('seconda cessazione respinta (400)', doppia.stato === 400, doppia.dati);
  const ctlDopo = await req('POST', `/fascicoli/${idF}/controllo-costante`, { esito: 'INVARIATO', verifiche: ['ANAGRAFICA'] });
  verifica('controllo costante su fascicolo cessato respinto (400)', ctlDopo.stato === 400, ctlDopo.dati);
  const comp2 = await req('GET', '/completezza');
  const vc2 = comp2.dati?.clienti?.find((c) => c.id === idC);
  verifica('nel cruscotto il cliente torna a «nessun fascicolo aperto»', vc2?.mancanze?.length === 1 && vc2.mancanze[0].codice === 'FASCICOLO_ASSENTE', vc2?.mancanze);
}

// ── 4. Formazione ─────────────────────────────────────────────
console.log('\n== 4. Formazione ==');
{
  const io = await req('GET', '/auth/io');
  const noTitolo = await req('POST', '/studio/formazione', { titolo: 'x', dataEvento: '2026-05-05', utenteId: io.dati?.utente?.id });
  verifica('titolo obbligatorio (400)', noTitolo.stato === 400, noTitolo.dati);
  const noPart = await req('POST', '/studio/formazione', { titolo: 'Corso antiriciclaggio ODCEC', dataEvento: '2026-05-05' });
  verifica('almeno un partecipante (400)', noPart.stato === 400, noPart.dati);
  const ev = await req('POST', '/studio/formazione', { titolo: `Corso antiriciclaggio ODCEC ${suffisso}`, ente: 'ODCEC Padova', dataEvento: '2026-05-05', ore: 4, utentiIds: [io.dati?.utente?.id], partecipanti: ['Praticante Esterno'] });
  verifica('evento registrato per un utente e un nome libero (2 righe)', ev.stato === 201 && ev.dati?.partecipanti === 2 && ev.dati?.ids?.length === 2, ev.dati);
  const lista = await req('GET', '/studio/formazione');
  verifica('elenco con il nome dell’utente e il partecipante esterno', lista.dati?.some((r) => r.titolo.includes(suffisso) && r.utente) && lista.dati?.some((r) => r.partecipante === 'Praticante Esterno'), lista.dati?.slice(0, 3));
  const ind = await req('GET', '/studio/indicatori');
  const form = ind.dati?.indicatori?.vulnerabilita?.find((i) => i.codice === 'formazione');
  verifica('indicatore AV.0 «formazione» vede l’evento', form && form.numeratore >= 1 && /eventi negli ultimi dodici mesi/.test(form.spiegazione), form);
  const org = ind.dati?.indicatori?.vulnerabilita?.find((i) => i.codice === 'organizzazione_adeguata_verifica');
  verifica('indicatore «organizzazione» cita il cruscotto di completezza', /senza nulla da completare/.test(org?.spiegazione ?? ''), org);
  const del = await req('DELETE', `/studio/formazione/${ev.dati?.ids?.[1]}`);
  verifica('eliminazione (amministratore)', del.stato === 200, del.dati);
}

// ── 5. Caricamento in blocco ──────────────────────────────────
console.log('\n== 5. Caricamento in blocco di 20 visure ==');
const base = fixture('srl-due-soci-pf.txt');
const quattro = fixture('srl-quattro-soci-25.txt');
// Un cliente ESISTENTE, creato a mano con la stessa P.IVA della prima variante ma dati vecchi.
const vEs = variante(base, 1);
const esistente = await req('POST', '/clienti', { tipo: 'SOCIETA_CAPITALI', denominazione: `${vEs.denominazione} (VECCHIA)`, partitaIva: vEs.partitaIva, attivitaPrevalente: 'Da aggiornare' });
verifica('cliente esistente da abbinare', esistente.stato === 201, esistente.dati);
const voci = [];
for (let n = 1; n <= 17; n++) voci.push(voceDaVisura(variante(base, n)));
voci.push(voceDaVisura(variante(quattro, 18)));            // 4×25%: alert A1 (alta)
voci.push(voceDaVisura(variante(base, 5)));                // doppia nella stessa corsa
voci.push({ nomeFile: 'scansione.pdf', anagrafica: { denominazione: '', tipo: '' }, soci: [], cariche: [] }); // illeggibile
const acc = await req('POST', '/coda/visure', { voci });
verifica('20 voci accodate: 201 con 20 esiti', acc.stato === 201 && acc.dati?.esiti?.length === 20, acc.dati?.esiti?.length);
const esiti = acc.dati?.esiti ?? [];
verifica('17 + 1 proposte in coda (nuove + esistente)', esiti.filter((e) => e.id).length === 18, esiti.map((e) => e.abbinamento));
verifica('la prima è ESISTENTE, abbinata per P.IVA', esiti[0]?.abbinamento === 'ESISTENTE' && esiti[0]?.clienteId === esistente.dati?.id, esiti[0]);
verifica('le altre sono NUOVE', esiti.slice(1, 17).every((e) => e.abbinamento === 'NUOVO'), esiti.slice(1, 17).map((e) => e.abbinamento));
verifica('la doppia è GIA_IN_CODA, l’illeggibile SCARTATA', esiti[18]?.abbinamento === 'GIA_IN_CODA' && esiti[19]?.abbinamento === 'SCARTATA' && esiti[19]?.errore, [esiti[18], esiti[19]]);
verifica('4×25%: alert A1 alta già in ingestione', esiti[17]?.alert?.some((a) => a.codice === 'A1' && a.gravita === 'alta'), esiti[17]);
const nessunCliente = await req('GET', '/clienti');
verifica('nessun cliente creato dall’ingestione', !(nessunCliente.dati ?? []).some((c) => c.denominazione === `CODA 2 ${suffisso} SRL`), (nessunCliente.dati ?? []).filter((c) => c.denominazione.includes(suffisso)).map((c) => c.denominazione));
const audit1 = await req('GET', '/audit');
verifica('audit VISURE_ACCODATE', (audit1.dati ?? []).some((v) => v.azione === 'VISURE_ACCODATE'));
{
  const form = new FormData();
  form.append('file', new Blob(['%PDF-1.4 visura di prova'], { type: 'application/pdf' }), 'coda-2.pdf');
  const pdf = await req('POST', `/coda/${esiti[1].id}/pdf`, null, form);
  verifica('PDF in transito agganciato alla proposta', pdf.stato === 200, pdf.dati);
}

// ── 6. La coda ────────────────────────────────────────────────
console.log('\n== 6. Coda di revisione ==');
let coda = await req('GET', '/coda');
const conteggio = await req('GET', '/coda/conteggio');
verifica('la coda elenca le 18 proposte di questa corsa (più quelle pendenti)', coda.dati?.filter((v) => v.ambito === 'ANAGRAFICA' && v.visura?.anagrafica?.denominazione?.includes(suffisso)).length === 18 && conteggio.dati?.n >= 18, [coda.dati?.length, conteggio.dati]);
const vocePrima = coda.dati?.find((v) => v.id === esiti[0].id);
verifica('l’ESISTENTE mostra cliente attuale e differenze (denominazione, attività)', vocePrima?.cliente?.id === esistente.dati?.id && vocePrima?.visura?.differenze?.some((d) => d.chiave === 'denominazione') && vocePrima?.visura?.differenze?.some((d) => d.chiave === 'attivitaPrevalente'), vocePrima?.visura?.differenze);
const voceNuova = coda.dati?.find((v) => v.id === esiti[1].id);
verifica('la NUOVA porta anagrafica, soci, cariche, titolari proposti (70/30) e il PDF', voceNuova?.visura?.abbinamento === 'NUOVO' && voceNuova?.visura?.soci?.length === 2 && voceNuova?.visura?.titolarita?.titolari?.length === 2 && voceNuova?.visura?.pdf?.nome === 'coda-2.pdf', voceNuova?.visura?.titolarita);
const voceQuattro = coda.dati?.find((v) => v.id === esiti[17].id);
verifica('4×25% non applicabile in blocco; le 70/30 sì', voceQuattro?.applicabileInBlocco === false && voceNuova?.applicabileInBlocco === true, [voceQuattro?.alert, voceNuova?.alert]);
verifica('i contenuti della coda sono cifrati nel database (alert in chiaro, anagrafica no)', voceNuova?.alert !== undefined);

const appl = await req('POST', `/coda/${esiti[1].id}/applica`, { anagrafica: { attivitaPrevalente: 'Consulenza corretta a mano' } });
verifica('NUOVA applicata con correzione → MODIFICATA, cliente creato, visura conservata, titolarità in coda', appl.stato === 200 && appl.dati?.stato === 'MODIFICATA' && appl.dati?.clienteId && appl.dati?.documentoId && appl.dati?.propostaTitolaritaId, appl.dati);
const cl2 = await req('GET', `/clienti/${appl.dati?.clienteId}`);
verifica('il cliente ha l’attività corretta e la visura fra i documenti', cl2.dati?.cliente?.attivita_prevalente === 'Consulenza corretta a mano' && cl2.dati?.documenti?.some((d) => d.tipo === 'VISURA'), [cl2.dati?.cliente?.attivita_prevalente, cl2.dati?.documenti]);
const compag = await req('GET', `/clienti/${appl.dati?.clienteId}/compagine`);
verifica('compagine persistita (2 soci, 1 carica) e proposta TITOLARITA in stato PROPOSTA', compag.dati?.soci?.length === 2 && compag.dati?.cariche?.length === 1 && compag.dati?.proposte?.some((p) => p.ambito === 'TITOLARITA' && p.stato === 'PROPOSTA') && compag.dati?.proposte?.some((p) => p.ambito === 'ANAGRAFICA' && p.stato === 'MODIFICATA'), compag.dati?.proposte?.map((p) => [p.ambito, p.stato]));
const gia = await req('POST', `/coda/${esiti[1].id}/applica`, {});
verifica('la stessa proposta non si applica due volte (404)', gia.stato === 404, gia.dati);

const chiaviEs = vocePrima.visura.differenze.filter((d) => d.chiave !== 'denominazione').map((d) => d.chiave);
const applEs = await req('POST', `/coda/${esiti[0].id}/applica`, { chiavi: chiaviEs });
verifica('ESISTENTE applicata con un sottoinsieme di campi → MODIFICATA', applEs.stato === 200 && applEs.dati?.stato === 'MODIFICATA' && applEs.dati?.clienteId === esistente.dati?.id, applEs.dati);
const clEs = await req('GET', `/clienti/${esistente.dati?.id}`);
verifica('denominazione NON toccata, attività aggiornata dalla visura', /VECCHIA/.test(clEs.dati?.cliente?.denominazione) && clEs.dati?.cliente?.attivita_prevalente !== 'Da aggiornare', [clEs.dati?.cliente?.denominazione, clEs.dati?.cliente?.attivita_prevalente]);

const scartoNo = await req('POST', `/coda/${esiti[2].id}/scarta`, { motivazione: '' });
verifica('scarto senza motivazione respinto (400)', scartoNo.stato === 400, scartoNo.dati);
const scarto = await req('POST', `/coda/${esiti[2].id}/scarta`, { motivazione: 'Visura di una società che non è più cliente.' });
verifica('scarto con motivazione', scarto.stato === 200, scarto.dati);

// ── 7. Applica tutto ──────────────────────────────────────────
console.log('\n== 7. Applica tutto ==');
const tutto = await req('POST', '/coda/applica-tutto');
verifica('applicate le 14 visure pulite (16 nuove meno una applicata a mano e una scartata) e registrati i titolari per proprietà', tutto.stato === 200 && tutto.dati?.visure === 14 && tutto.dati?.titolarita >= 15 && tutto.dati?.errori?.length === 0, tutto.dati);
coda = await req('GET', '/coda');
verifica('in coda resta la 4×25% (alert alto), niente titolarità pulite', coda.dati?.some((v) => v.id === esiti[17].id) && !coda.dati?.some((v) => v.ambito === 'TITOLARITA' && v.applicabileInBlocco), coda.dati?.map((v) => [v.ambito, v.cliente?.denominazione, v.applicabileInBlocco]));
const cl3 = await req('GET', `/clienti/${appl.dati?.clienteId}`);
verifica('il cliente applicato prima ha ora i titolari effettivi registrati (70/30 → ESPOSITO MARIA)', cl3.dati?.titolariEffettivi?.some((t) => t.nominativo === 'ESPOSITO MARIA' && t.valido_al === null), cl3.dati?.titolariEffettivi);
const comp3 = await req('GET', '/completezza');
verifica('il cruscotto non segnala più titolari mancanti per quel cliente', !(comp3.dati?.clienti?.find((c) => c.id === appl.dati?.clienteId)?.mancanze ?? []).some((m) => m.codice === 'TE_ASSENTI'), comp3.dati?.clienti?.find((c) => c.id === appl.dati?.clienteId)?.mancanze?.map((m) => m.codice));

// ── 8. A11 ────────────────────────────────────────────────────
console.log('\n== 8. A11 ricorrenza nel portafoglio ==');
{
  const c = await req('GET', `/clienti/${appl.dati?.clienteId}/compagine`);
  const a11 = c.dati?.alert?.find((a) => a.codice === 'A11');
  verifica('ESPOSITO MARIA amministra ormai molti clienti: A11 media, non bloccante, con l’elenco', a11 && a11.gravita === 'media' && a11.bloccante === false && a11.azione?.tipo === 'VALUTA_RICORRENZA' && a11.azione.clienti.length >= 5, a11 ? { gravita: a11.gravita, n: a11.azione?.clienti?.length } : c.dati?.alert?.map((a) => a.codice));
  const fp = await req('GET', `/clienti/${appl.dati?.clienteId}/fascicolo-proposto`);
  verifica('l’alert arriva anche nel fascicolo proposto', fp.dati?.alertTitolarita?.some((a) => a.codice === 'A11'), fp.dati?.alertTitolarita?.map((a) => a.codice));
}

// ── 9. Cruscotto ──────────────────────────────────────────────
console.log('\n== 9. Cruscotto ==');
{
  const cr = await req('GET', '/cruscotto');
  verifica('riepilogo «da completare» nel cruscotto', cr.dati?.completezza && typeof cr.dati.completezza.totaleMancanze === 'number' && Array.isArray(cr.dati.completezza.iniziaDa), cr.dati?.completezza);
  const comp4 = await req('GET', '/completezza');
  verifica('ordine: i clienti urgenti vengono prima', (() => { const l = comp4.dati?.clienti ?? []; const primoNon = l.findIndex((c) => !c.urgente); return primoNon === -1 || !l.slice(primoNon).some((c) => c.urgente); })(), comp4.dati?.clienti?.map((c) => c.urgente));
  verifica('perRegola coerente col totale', (comp4.dati?.perRegola ?? []).reduce((s, r) => s + r.n, 0) === comp4.dati?.totaleMancanze);
}

console.log(`\n${ok} ok / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
