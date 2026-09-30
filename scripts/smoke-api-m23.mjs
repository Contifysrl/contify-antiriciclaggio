/**
 * Smoke test AR-M23: le segnalazioni di Barbara (settembre 2026).
 *
 *   npx wrangler dev --port 8787 --local   (dopo reset + migrate 0001..0014 + seed, con *_FIXTURES=1)
 *   node scripts/smoke-api-m23.mjs
 *
 * Cosa si dimostra:
 *  1. persona fisica: alla creazione il titolare effettivo «coincide con il cliente» si registra da solo
 *     (criterio CLIENTE_PERSONA_FISICA); cambiare la natura giuridica lo chiude; tornare a PF lo riapre;
 *     il fascicolo proposto ha l'esecutore «in proprio» con i dati del cliente e chiede la AV.4;
 *     «Da completare» chiede la AV.4 anche alla persona fisica;
 *  2. AV.4 per opzione: persona fisica → opzione 1 (e nessun'altra nel testo); PF con procuratore →
 *     opzione 2; società con titolare registrato per proprietà → opzione 3 con sede/REA/CF;
 *     titolare residuale → opzione 4; Allegato con le Note 1-4;
 *  3. verifica a distanza della persona fisica: la pagina pubblica espone opzione e dichiarante;
 *     senza PEP del dichiarante → 400; con «agisco in proprio» → 200, acquisizione → documento
 *     DICHIARAZIONE_ART22; «agisco per conto di terzi» → segnale;
 *  4. archivio documenti unico: documento caricato nel fascicolo compare nell'archivio del cliente con
 *     il codice del fascicolo; stesso file dalla scheda cliente → già presente; GET /documenti/:id
 *     inline con Content-Disposition robusto, ?scarica=1 attachment; nel fascicolo gli ambiti;
 *  5. modifica dei dati dell'incarico: date corrette con audit prima/dopo; date future o malformate →
 *     400; nessuna modifica → 400; con valutazione firmata serve la motivazione;
 *  6. eliminazione: fascicolo vuoto → senza motivo 400, con motivo 200 e audit ELIMINA_FASCICOLO;
 *     il numero non si riassegna (MAX+1); fascicolo con documento → 409 con i motivi;
 *     collaboratore → 403.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { leggiVisura } from '../web/src/lib/visura.ts';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const qui = path.dirname(fileURLToPath(import.meta.url));
let ok = 0, fail = 0;
function verifica(d, cond, ctx) {
  if (cond) { ok++; console.log(`  ok   ${d}`); }
  else { fail++; console.log(`  FAIL ${d}`); if (ctx !== undefined) console.log(`       ${JSON.stringify(ctx).slice(0, 700)}`); }
}
let cookie = '';
async function req(metodo, percorso, corpo, form, opz = {}) {
  const r = await fetch(`${BASE}/api${percorso}`, {
    method: metodo,
    headers: { ...(corpo && !form ? { 'Content-Type': 'application/json' } : {}), ...(cookie && !opz.senzaCookie ? { Cookie: cookie } : {}) },
    body: form ? form : corpo ? JSON.stringify(corpo) : undefined,
    redirect: 'manual',
  });
  const set = r.headers.get('set-cookie');
  if (set && !opz.senzaCookie) cookie = set.split(';')[0];
  if (opz.binario) {
    const buf = new Uint8Array(await r.arrayBuffer());
    return { stato: r.status, tipo: r.headers.get('content-type'), disposition: r.headers.get('content-disposition'), bytes: buf.byteLength, buf };
  }
  const t = await r.text();
  let dati = null;
  try { dati = t ? JSON.parse(t) : null; } catch { dati = t; }
  return { stato: r.status, dati };
}
/** Testo piano del document.xml di un .docx (per cercare le frasi del modello). */
function testoDocx(buf) {
  const zip = unzipSync(buf);
  const xml = strFromU8(zip['word/document.xml']);
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}
const fixture = (n) => leggiVisura(fs.readFileSync(path.join(qui, '..', 'tests', 'fixtures', 'visure', n), 'utf8'));
const suffisso = String(Date.now()).slice(-6);
const oggi = new Date().toISOString().slice(0, 10);
const giorniFa = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
function corpoDaVisura(v, extra = {}) {
  return {
    anagrafica: {
      denominazione: v.denominazione, tipo: v.tipoProposto, codiceFiscale: v.codiceFiscale, partitaIva: v.partitaIva,
      paeseResidenza: 'IT', attivitaPrevalente: v.attivitaPrevalente, ateco: v.ateco,
      datiIdentificativi: { sede: v.sede.testo, provincia: v.sede.provincia, pec: v.pec, rea: v.rea, formaGiuridica: v.formaGiuridica, capitaleSociale: v.capitale.sottoscritto, dataCostituzione: v.dataCostituzione, visuraDel: v.dataEstrazione, oggettoSociale: v.oggettoSociale },
      ...extra.anagrafica,
    },
    soci: v.soci, cariche: v.cariche, capitale: v.capitale, dataVisura: v.dataEstrazione, dataElencoSoci: v.dataElencoSoci,
    telemetria: { tipoVisura: v.tipoVisura, formaVisura: v.formaVisura, pagine: 7, campiNonTrovati: v.campiNonTrovati, avvisi: v.avvisi.length, soci: v.soci.length, cariche: v.cariche.length, tipoIncerto: v.tipoIncerto, dataEstrazione: v.dataEstrazione },
  };
}
const formDoc = (contenuto, nome, tipo) => { const f = new FormData(); f.append('file', new Blob([contenuto], { type: 'application/pdf' }), nome); f.append('tipo', tipo); return f; };
const audit = async (azione) => (await req('GET', '/audit')).dati?.filter?.((a) => a.azione === azione) ?? [];

const login = await req('POST', '/auth/login', { email: 'titolare@studiodemo.it', password: 'Antiriciclaggio!2026' });
verifica('login professionista', login.stato === 200, login);

// ── 1. Persona fisica: titolarità automatica, esecutore in proprio ──
console.log('\n== 1. Cliente persona fisica ==');
const cfPf = `BNCLCU80A01${String(suffisso).slice(0, 3)}X`;
const pf = await req('POST', '/clienti', {
  tipo: 'PERSONA_FISICA', denominazione: `BIANCHI LUCA ${suffisso}`, codiceFiscale: cfPf, paeseResidenza: 'IT', attivitaPrevalente: 'Consulenza informatica', ateco: '62.02.00',
  datiIdentificativi: { nome: 'Luca', cognome: 'Bianchi', dataNascita: '1980-01-01', luogoNascita: 'Padova', residenza: 'Via Verdi 3, 35100 Padova (PD)' },
});
verifica('cliente persona fisica creato', pf.stato === 201, pf);
const pfId = pf.dati?.id;
let dpf = await req('GET', `/clienti/${pfId}`);
verifica('titolare effettivo registrato da solo: coincide con il cliente (CLIENTE_PERSONA_FISICA, CF del cliente)',
  dpf.dati?.titolariEffettivi?.length === 1 && dpf.dati?.titolariEffettivi?.[0]?.criterio === 'CLIENTE_PERSONA_FISICA' && dpf.dati?.titolariEffettivi?.[0]?.codice_fiscale === cfPf, dpf.dati?.titolariEffettivi);
const auditTe = await audit('AGGIORNA_TITOLARITA');
verifica('audit AGGIORNA_TITOLARITA con automatica: true', auditTe.some((a) => a.entita_id === pfId && /"automatica":true/.test(a.dettaglio ?? '')), auditTe.slice(-1));
const aSoc = await req('PATCH', `/clienti/${pfId}`, { tipo: 'SOCIETA_CAPITALI' });
dpf = await req('GET', `/clienti/${pfId}`);
verifica('natura giuridica → società: la fotografia automatica si chiude', aSoc.stato === 200 && dpf.dati?.titolariEffettivi?.length === 0, dpf.dati?.titolariEffettivi);
await req('PATCH', `/clienti/${pfId}`, { tipo: 'PERSONA_FISICA' });
dpf = await req('GET', `/clienti/${pfId}`);
verifica('di nuovo persona fisica: fotografia riaperta', dpf.dati?.titolariEffettivi?.length === 1 && dpf.dati?.titolariEffettivi?.[0]?.criterio === 'CLIENTE_PERSONA_FISICA', dpf.dati?.titolariEffettivi);
const fpPf = await req('GET', `/clienti/${pfId}/fascicolo-proposto`);
verifica('fascicolo proposto: esecutore «in proprio» con i dati del cliente', fpPf.dati?.esecutore?.carica === 'IN_PROPRIO' && fpPf.dati?.esecutore?.nominativo === `BIANCHI LUCA ${suffisso}` && fpPf.dati?.esecutore?.codiceFiscale === cfPf, fpPf.dati?.esecutore);
verifica('checklist della persona fisica: documento, AV.4, incarico', JSON.stringify(fpPf.dati?.checklist?.map((x) => x.codice)) === JSON.stringify(['ID_CLIENTE', 'DICHIARAZIONE_ART22', 'INCARICO']), fpPf.dati?.checklist?.map((x) => x.codice));
const fPf = await req('POST', '/fascicoli', { clienteId: pfId, prestazioneCodice: 'TENUTA_CONTABILITA', tipoRapporto: 'CONTINUATIVO', dataConferimento: oggi, scopoNatura: 'Tenuta della contabilità semplificata dell’attività di consulenza', esecutore: { nominativo: fpPf.dati.esecutore.nominativo, codiceFiscale: fpPf.dati.esecutore.codiceFiscale, carica: 'IN_PROPRIO', caricaTesto: fpPf.dati.esecutore.caricaTesto } });
verifica('fascicolo della persona fisica aperto con esecutore in proprio (proposta APPLICATA)', fPf.stato === 201 && fPf.dati?.esecutore === 'APPLICATA', fPf.dati);
const fidPf = fPf.dati?.id;
const compl = await req('GET', '/completezza');
const rigaPf = compl.dati?.clienti?.find((c) => c.id === pfId || c.clienteId === pfId);
verifica('«Da completare» chiede la AV.4 anche alla persona fisica (e non i titolari)', rigaPf && rigaPf.mancanze?.some((m) => m.codice === 'ART22_ASSENTE') && !rigaPf.mancanze?.some((m) => m.codice === 'TE_ASSENTI'), rigaPf?.mancanze?.map((m) => m.codice));

// ── 2. AV.4 per opzione ───────────────────────────────────────
console.log('\n== 2. Dichiarazione AV.4: una sola opzione ==');
const d1 = await req('GET', `/clienti/${pfId}/dichiarazione-art22?fascicolo=${fidPf}`, null, null, { binario: true });
verifica('docx della persona fisica generato', d1.stato === 200 && /wordprocessingml/.test(d1.tipo ?? ''), d1.stato);
const t1 = d1.stato === 200 ? testoDocx(d1.buf) : '';
verifica('opzione 1 «agire in proprio», nessun’altra opzione stampata', /\(opzione 1\) di AGIRE IN PROPRIO/.test(t1) && !/\(opzione 3\)/.test(t1) && !/\(opzione 4\)/.test(t1), t1.slice(0, 300));
verifica('dati del dichiarante dall’anagrafica: CF, nascita, residenza; scopo dal fascicolo; attività e provincia', new RegExp(cfPf).test(t1) && /Padova il 01\.01\.1980/.test(t1) && /Via Verdi 3, 35100 Padova/.test(t1) && /Tenuta della contabilità semplificata/.test(t1) && /Consulenza informatica — ATECO 62\.02\.00/.test(t1) && /☒ Italia — Provincia: PD/.test(t1), null);
verifica('niente domande di controllo né Allegato B per la persona fisica; Note 1-4 e presa visione ci sono', !/Informazioni che risultano solo al cliente/.test(t1) && !/Allegato B/.test(t1) && /\(Nota 4\)/.test(t1) && /Per ricevuta e presa visione/.test(t1), null);

// PF con procuratore → opzione 2.
const pf2 = await req('POST', '/clienti', { tipo: 'PERSONA_FISICA', denominazione: `ROSSI MARIO ${suffisso}`, codiceFiscale: `RSSMRA70A01${String(suffisso).slice(0, 3)}Y`, paeseResidenza: 'IT' });
const fPf2 = await req('POST', '/fascicoli', { clienteId: pf2.dati?.id, prestazioneCodice: 'TENUTA_CONTABILITA', tipoRapporto: 'CONTINUATIVO', dataConferimento: oggi, esecutore: { nominativo: 'ROSSI ANNA', codiceFiscale: 'RSSNNA75A41G224Z', carica: 'PROCURATORE', caricaTesto: 'procuratrice' } });
const d2 = await req('GET', `/clienti/${pf2.dati?.id}/dichiarazione-art22?fascicolo=${fPf2.dati?.id}`, null, null, { binario: true });
const t2 = d2.stato === 200 ? testoDocx(d2.buf) : '';
verifica('persona fisica con procuratrice → opzione 2: dichiarante = esecutore, il cliente è la persona per conto della quale agisce', /\(opzione 2\) di AGIRE IN QUALITÀ DI ESECUTORE/.test(t2) && /ROSSI ANNA/.test(t2) && /In qualità di procuratrice/.test(t2) && new RegExp(`ROSSI MARIO ${suffisso}`).test(t2) && !/\(opzione 1\)/.test(t2), t2.slice(0, 300));

// Società con titolare registrato per proprietà → opzione 3.
const v3 = fixture('srl-due-soci-pf.txt');
v3.codiceFiscale = `23234${suffisso}`; v3.partitaIva = v3.codiceFiscale;
const c3 = await req('POST', '/clienti/da-visura', corpoDaVisura(v3));
verifica('SRL 70/30 da visura creata', c3.stato === 201, c3);
const id3 = c3.dati?.id;
const comp3 = await req('GET', `/clienti/${id3}/compagine`);
const propId3 = comp3.dati?.proposte?.find((p) => p.ambito === 'TITOLARITA' && p.stato === 'PROPOSTA')?.id ?? null;
const titProposti = (comp3.dati?.analisi?.titolari ?? []).map((t) => ({ nominativo: t.denominazione, codiceFiscale: /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(t.id) ? t.id : null, criterio: t.criterio, norma: t.norma, quota: t.quotaEffettiva != null ? Math.round(t.quotaEffettiva * 10000) / 100 : null, pep: false, motivazione: t.motivazione }));
const reg3 = await req('POST', `/clienti/${id3}/titolarita`, { titolari: titProposti, propostaId: propId3 });
verifica('titolari per proprietà registrati dalla proposta', reg3.stato === 200 && titProposti.length === 2, reg3.dati);
const f3 = await req('POST', '/fascicoli', { clienteId: id3, prestazioneCodice: 'TENUTA_CONTABILITA', tipoRapporto: 'CONTINUATIVO', dataConferimento: oggi, esecutore: { nominativo: comp3.dati?.cariche?.[0]?.nome ?? 'AMMINISTRATORE', codiceFiscale: comp3.dati?.cariche?.[0]?.codiceFiscale ?? null, carica: 'AMMINISTRATORE_UNICO', caricaTesto: 'amministratore unico' } });
const d3 = await req('GET', `/clienti/${id3}/dichiarazione-art22?fascicolo=${f3.dati?.id}`, null, null, { binario: true });
const t3 = d3.stato === 200 ? testoDocx(d3.buf) : '';
verifica('società → opzione 3 con sede, Registro Imprese, REA e CF; titolari registrati con la relazione (quota) e ☒ non PEP', /\(opzione 3\) di AGIRE PER CONTO DELLA SOCIETÀ\/ENTE/.test(t3) && /iscritta al Registro delle Imprese di [A-Z]{2}/.test(t3) && new RegExp(`codice fiscale ${v3.codiceFiscale}`).test(t3) && /socio con partecipazione diretta del 70% del capitale/.test(t3) && /☒ il titolare effettivo NON costituisce persona politicamente esposta/.test(t3) && !/\(opzione 1\)/.test(t3) && !/\(opzione 4\)/.test(t3), t3.slice(0, 400));
verifica('opzione 3: domande di controllo e Allegato B con la ripartizione', /Informazioni che risultano solo al cliente/.test(t3) && /Allegato B — dati camerali/.test(t3), null);

// Titolare residuale → opzione 4.
const c4 = await req('POST', '/clienti', { tipo: 'SOCIETA_CAPITALI', denominazione: `QUATTRO SOCI SRL ${suffisso}`, codiceFiscale: `44234${suffisso}`, partitaIva: `44234${suffisso}`, paeseResidenza: 'IT', datiIdentificativi: { sede: 'Via Roma 1, 35100 Padova (PD)', provincia: 'PD', rea: 'PD - 999999' } });
await req('POST', `/clienti/${c4.dati?.id}/titolarita`, { titolari: [{ nominativo: 'VERDI GINO', codiceFiscale: 'VRDGNI65A01G224K', criterio: 'RESIDUALE_POTERI', norma: 'art. 20 co. 5', quota: null, pep: false, motivazione: 'Quattro soci al 25%: nessuna proprietà né controllo; amministratore unico con poteri.' }] });
const d4 = await req('GET', `/clienti/${c4.dati?.id}/dichiarazione-art22`, null, null, { binario: true });
const t4 = d4.stato === 200 ? testoDocx(d4.buf) : '';
verifica('titolare residuale → opzione 4 con l’attestazione sui poteri e REA', /\(opzione 4\)/.test(t4) && /ATTESTA che il titolare effettivo coincide/.test(t4) && /REA PD - 999999/.test(t4) && /VERDI GINO/.test(t4) && !/\(opzione 3\)/.test(t4), t4.slice(0, 400));
const auditAv4 = await audit('DICHIARAZIONE_ART22_GENERATA');
verifica('ogni generazione è nel registro', auditAv4.length >= 4, auditAv4.length);

// ── 3. Verifica a distanza della persona fisica ───────────────
console.log('\n== 3. Verifica a distanza: persona fisica, opzione 1 ==');
const vr = await req('POST', `/fascicoli/${fidPf}/verifica-remota`, { richieste: { datiIdentificativi: false, documento: false, pep: false, dichiarazioneTe: true } });
verifica('richiesta creata', vr.stato === 201, vr);
const token = vr.dati?.url?.split('token=')[1];
const pub = await req('GET', `/pubblico/verifica/${token}`, null, null, { senzaCookie: true });
verifica('pagina pubblica: opzione 1, dichiarante precompilato, nessuna domanda, prestazione', pub.dati?.dichiarazioneTe?.opzione === 1 && pub.dati?.dichiarazioneTe?.dichiarante?.codiceFiscale === cfPf && pub.dati?.dichiarazioneTe?.domande?.length === 0 && pub.dati?.dichiarazioneTe?.prestazione?.scopoNatura, pub.dati?.dichiarazioneTe);
const invia = async (dichiarazioneTe) => {
  const fd = new FormData();
  fd.set('dati', JSON.stringify({ dichiarazione: { accettata: true, nomeDichiarante: 'Luca Bianchi' }, dichiarazioneTe }));
  return req('POST', `/pubblico/verifica/${token}`, null, fd, { senzaCookie: true });
};
const senzaPep = await invia({ scopo: { conferma: 'CONFERMA' }, conferma: 'CONFERMA', risposte: [], pep: [] });
verifica('senza lo status PEP del dichiarante → 400', senzaPep.stato === 400 && /politicamente esposta/.test(senzaPep.dati?.errore ?? ''), senzaPep.dati);
const okPf = await invia({ scopo: { conferma: 'CONFERMA' }, conferma: 'CONFERMA', risposte: [], pep: [], pepDichiarante: { pep: false }, dichiarante: { nome: 'Luca Bianchi', codiceFiscale: cfPf, natoA: 'Padova', natoIl: '1980-01-01', residenza: 'Via Verdi 3, Padova' }, attivita: 'consulenza informatica', ambito: { italiaProvincia: 'PD' } });
verifica('«agisco in proprio» + non PEP → accettata', okPf.stato === 200, okPf.dati);
const lista = await req('GET', `/fascicoli/${fidPf}/verifiche-remote`);
const rid = lista.dati?.find((x) => x.stato === 'COMPLETATA')?.id;
const det = await req('GET', `/verifiche-remote/${rid}`);
verifica('lo studio vede la risposta: nessun segnale, dichiarante con i dati', det.dati?.segnali?.length === 0 && det.dati?.dati?.dichiarazioneTe?.pepDichiarante?.pep === false && det.dati?.dati?.dichiarazioneTe?.dichiarante?.natoIl === '1980-01-01', det.dati?.dati?.dichiarazioneTe);
const acq = await req('POST', `/verifiche-remote/${rid}/acquisisci`, {});
verifica('acquisizione → documento DICHIARAZIONE_ART22 nel fascicolo', acq.stato === 200 && acq.dati?.applicato?.includes('dichiarazione_art22'), acq.dati);
const docsPf = await req('GET', `/clienti/${pfId}/documenti`);
const docAv4 = docsPf.dati?.find((d) => d.tipo === 'DICHIARAZIONE_ART22');
verifica('l’archivio del cliente lo vede con il codice del fascicolo', docAv4 && docAv4.fascicolo_id === fidPf && /^\d{4}\/\d{4}$/.test(docAv4.fascicolo_codice ?? ''), docAv4);
const docAv4Bin = await req('GET', `/documenti/${docAv4?.id}`, null, null, { binario: true });
const tAv4 = docAv4Bin.stato === 200 ? testoDocx(docAv4Bin.buf) : '';
verifica('la trascrizione riporta ☒ opzione 1 e ☒ non PEP, resa a distanza', /☒ \(opzione 1\) di AGIRE IN PROPRIO/.test(tAv4) && /☒ di NON costituire persona politicamente esposta/.test(tAv4) && /Dichiarazione resa a distanza/.test(tAv4), tAv4.slice(0, 300));
const complPf2 = await req('GET', '/completezza');
const rigaPf2 = complPf2.dati?.clienti?.find((c) => c.id === pfId || c.clienteId === pfId);
verifica('«Da completare» non chiede più la AV.4', !rigaPf2?.mancanze?.some((m) => m.codice === 'ART22_ASSENTE'), rigaPf2?.mancanze?.map((m) => m.codice));
// Seconda richiesta: «agisco per conto di terzi» → segnale.
const vrB = await req('POST', `/fascicoli/${fidPf}/verifica-remota`, { richieste: { datiIdentificativi: false, documento: false, pep: false, dichiarazioneTe: true } });
const tokenB = vrB.dati?.url?.split('token=')[1];
const fdB = new FormData();
fdB.set('dati', JSON.stringify({ dichiarazione: { accettata: true, nomeDichiarante: 'Luca Bianchi' }, dichiarazioneTe: { scopo: { conferma: 'CONFERMA' }, conferma: 'CORREGGE', correzioni: 'agisco per conto di mio padre, procura del 2.1.2026', titolari: [{ nominativo: 'BIANCHI GIUSEPPE', codiceFiscale: 'BNCGPP50A01G224W' }], risposte: [], pep: [], pepDichiarante: { pep: true, dettagli: 'assessore regionale dal 2024' } } }));
const rB = await req('POST', `/pubblico/verifica/${tokenB}`, null, fdB, { senzaCookie: true });
const ridB = (await req('GET', `/fascicoli/${fidPf}/verifiche-remote`)).dati?.find((x) => x.stato === 'COMPLETATA')?.id;
const detB = await req('GET', `/verifiche-remote/${ridB}`);
verifica('«agisco per conto di terzi» + PEP → due segnali (opzione 2, PEP)', rB.stato === 200 && detB.dati?.segnali?.length === 2 && detB.dati?.segnali?.some((s) => /NON agire in proprio/.test(s)) && detB.dati?.segnali?.some((s) => /assessore regionale/.test(s)), detB.dati?.segnali);

// ── 4. Archivio documenti unico ───────────────────────────────
console.log('\n== 4. Archivio documenti ==');
const pdfFinto = `%PDF-1.4 ${suffisso} carta identita`;
const up1 = await req('POST', `/fascicoli/${fidPf}/documenti`, null, formDoc(pdfFinto, "Carta d'identità – Bianchi «fronte».pdf", 'DOCUMENTO_IDENTITA'));
verifica('documento caricato dal fascicolo (nome ripulito, cliente_id valorizzato)', up1.stato === 201 && up1.dati?.sha256?.length === 64, up1.dati);
const up2 = await req('POST', `/clienti/${pfId}/documenti`, null, formDoc(pdfFinto, 'stesso-file.pdf', 'DOCUMENTO_IDENTITA'));
verifica('stesso file dalla scheda cliente → già presente, stesso id', up2.stato === 200 && up2.dati?.giaPresente === true && up2.dati?.id === up1.dati?.id, up2.dati);
const docs = await req('GET', `/clienti/${pfId}/documenti`);
const docId = docs.dati?.find((d) => d.id === up1.dati?.id);
verifica('archivio del cliente: il documento del fascicolo c’è, con codice del fascicolo, etichetta e chi lo ha acquisito', docId && docId.fascicolo_codice && docId.etichetta === 'Documento d’identità' && docId.acquisito_da, docId);
const fdet = await req('GET', `/fascicoli/${fidPf}`);
verifica('nel fascicolo: ambito FASCICOLO per il documento e la AV.4 acquisita', fdet.dati?.documenti?.filter((d) => d.ambito === 'FASCICOLO').length === 2, fdet.dati?.documenti?.map((d) => [d.tipo, d.ambito]));
const apri = await req('GET', `/documenti/${up1.dati?.id}`, null, null, { binario: true });
verifica('GET /documenti/:id: 200, inline, filename ASCII + filename* UTF-8, contenuto integro', apri.stato === 200 && /^inline; filename="[\x20-\x7E]+"; filename\*=UTF-8''/.test(apri.disposition ?? '') && apri.bytes === new TextEncoder().encode(pdfFinto).byteLength, apri.disposition);
const scarica = await req('GET', `/documenti/${up1.dati?.id}?scarica=1`, null, null, { binario: true });
verifica('?scarica=1 → attachment', scarica.stato === 200 && /^attachment;/.test(scarica.disposition ?? ''), scarica.disposition);
const auditLeggi = await audit('LEGGI_DOCUMENTO');
verifica('ogni apertura è nel registro (LEGGI_DOCUMENTO)', auditLeggi.filter((a) => a.entita_id === up1.dati?.id).length >= 2, auditLeggi.length);
const upAltro = await req('POST', `/fascicoli/${f3.dati?.id}/documenti`, null, formDoc(pdfFinto, 'altro-cliente.pdf', 'INCARICO'));
verifica('lo stesso contenuto per un ALTRO cliente non è un doppione', upAltro.stato === 201 && upAltro.dati?.id !== up1.dati?.id, upAltro.dati);
const upNo = await req('POST', `/fascicoli/fas_inesistente/documenti`, null, formDoc(pdfFinto, 'x.pdf', 'ALTRO'));
verifica('fascicolo inesistente → 404', upNo.stato === 404, upNo);

// ── 5. Modifica dei dati dell'incarico ────────────────────────
console.log('\n== 5. Modifica dei dati dell’incarico ==');
const mod1 = await req('PATCH', `/fascicoli/${fidPf}`, { dataConferimento: giorniFa(10), dataIdentificazione: giorniFa(9), modalitaIdentificazione: 'PRESENZA' });
verifica('date e modalità corrette', mod1.stato === 200 && mod1.dati?.modifiche?.dataConferimento?.a === giorniFa(10) && mod1.dati?.modifiche?.dataIdentificazione?.da === oggi, mod1.dati);
const fdet2 = await req('GET', `/fascicoli/${fidPf}`);
verifica('il fascicolo rilegge le date nuove', fdet2.dati?.fascicolo?.data_conferimento === giorniFa(10) && fdet2.dati?.fascicolo?.data_identificazione === giorniFa(9) && fdet2.dati?.fascicolo?.modalita_identificazione === 'PRESENZA', fdet2.dati?.fascicolo);
const auditMod = await audit('MODIFICA_FASCICOLO');
verifica('audit MODIFICA_FASCICOLO con prima/dopo', auditMod.some((a) => a.entita_id === fidPf && /"dataConferimento":\{"da":/.test(a.dettaglio ?? '')), auditMod.slice(-1));
const modFut = await req('PATCH', `/fascicoli/${fidPf}`, { dataConferimento: '2099-01-01' });
verifica('data futura → 400', modFut.stato === 400, modFut.dati);
const modMal = await req('PATCH', `/fascicoli/${fidPf}`, { dataIdentificazione: '31/12/2025' });
verifica('data malformata → 400', modMal.stato === 400, modMal.dati);
const modNo = await req('PATCH', `/fascicoli/${fidPf}`, { dataConferimento: giorniFa(10) });
verifica('nessuna modifica → 400', modNo.stato === 400 && /Nessuna modifica/.test(modNo.dati?.errore ?? ''), modNo.dati);
const modTipo = await req('PATCH', `/fascicoli/${fidPf}`, { tipoRapporto: 'ALTRO' });
verifica('tipo di rapporto non ammesso → 400', modTipo.stato === 400, modTipo.dati);
// Con valutazione firmata: motivazione obbligatoria.
const rs = await req('GET', '/catalogo/ruleset');
const tabA = Object.fromEntries(rs.dati.adeguataVerifica.tabellaA.map((x) => [x.codice, 1]));
const tabB = Object.fromEntries(rs.dati.adeguataVerifica.tabellaB.map((x) => [x.codice, 1]));
const val = await req('POST', `/fascicoli/${fidPf}/valutazioni`, { tabellaA: tabA, tabellaB: tabB, circostanze: {} });
const firma = await req('POST', `/fascicoli/${fidPf}/valutazioni/${val.dati?.id}/firma`, {});
verifica('valutazione registrata e firmata', val.stato === 201 && firma.stato === 200, { val: val.dati, firma: firma.dati });
const modSenza = await req('PATCH', `/fascicoli/${fidPf}`, { scopoNatura: 'Contabilità e dichiarazioni' });
verifica('con valutazione firmata, senza motivazione → 400', modSenza.stato === 400 && /motiv/i.test(modSenza.dati?.errore ?? ''), modSenza.dati);
const modCon = await req('PATCH', `/fascicoli/${fidPf}`, { scopoNatura: 'Contabilità e dichiarazioni', motivazione: 'precisato lo scopo dopo il colloquio con il cliente' });
verifica('con motivazione → 200', modCon.stato === 200 && modCon.dati?.modifiche?.scopoNatura, modCon.dati);

// ── 6. Eliminazione del fascicolo ─────────────────────────────
console.log('\n== 6. Fascicolo aperto per errore ==');
const fErr = await req('POST', '/fascicoli', { clienteId: pf2.dati?.id, prestazioneCodice: 'TENUTA_CONTABILITA', tipoRapporto: 'CONTINUATIVO', dataConferimento: oggi });
const codErr = fErr.dati?.codice;
const fdErr = await req('GET', `/fascicoli/${fErr.dati?.id}`);
verifica('fascicolo nuovo: eliminabile, nessun motivo contrario', fdErr.dati?.collegamenti?.eliminabile === true && fdErr.dati?.collegamenti?.motivi?.length === 0, fdErr.dati?.collegamenti);
const delNo = await req('DELETE', `/fascicoli/${fErr.dati?.id}`, { motivazione: 'x' });
verifica('senza motivo (o troppo corto) → 400', delNo.stato === 400, delNo.dati);
const delOk = await req('DELETE', `/fascicoli/${fErr.dati?.id}`, { motivazione: 'aperto per errore sul cliente sbagliato' });
verifica('con il motivo → eliminato', delOk.stato === 200 && delOk.dati?.codice === codErr, delOk.dati);
const dopo = await req('GET', `/fascicoli/${fErr.dati?.id}`);
verifica('il fascicolo non c’è più', dopo.stato === 404, dopo.stato);
const auditDel = await audit('ELIMINA_FASCICOLO');
verifica('audit ELIMINA_FASCICOLO con codice, cliente, prestazione e motivo (scritto prima)', auditDel.some((a) => a.entita_id === fErr.dati?.id && new RegExp(`"codice":"${codErr.replace('/', '\\\\/')}"|"codice":"${codErr}"`).test(a.dettaglio ?? '') && /aperto per errore/.test(a.dettaglio ?? '')), auditDel.slice(-1));
// Doppioni: A e B aperti, A (in mezzo) eliminato, C deve superare B (MAX+1, non COUNT+1).
const fA = await req('POST', '/fascicoli', { clienteId: pf2.dati?.id, prestazioneCodice: 'TENUTA_CONTABILITA', tipoRapporto: 'CONTINUATIVO', dataConferimento: oggi });
const fB = await req('POST', '/fascicoli', { clienteId: pf2.dati?.id, prestazioneCodice: 'TENUTA_CONTABILITA', tipoRapporto: 'CONTINUATIVO', dataConferimento: oggi });
await req('DELETE', `/fascicoli/${fA.dati?.id}`, { motivazione: 'aperto due volte per errore' });
const fNuovo = await req('POST', '/fascicoli', { clienteId: pf2.dati?.id, prestazioneCodice: 'TENUTA_CONTABILITA', tipoRapporto: 'CONTINUATIVO', dataConferimento: oggi });
verifica('eliminato un fascicolo in mezzo alla serie, il prossimo numero non è un doppione (MAX+1)', fNuovo.stato === 201 && fNuovo.dati?.codice > fB.dati?.codice, { A: fA.dati?.codice, B: fB.dati?.codice, C: fNuovo.dati?.codice });
await req('DELETE', `/fascicoli/${fB.dati?.id}`, { motivazione: 'pulizia del collaudo' });
const delDoc = await req('DELETE', `/fascicoli/${fidPf}`, { motivazione: 'provo a eliminare un fascicolo con documenti' });
verifica('fascicolo con documenti e valutazione firmata → 409 con i motivi', delDoc.stato === 409 && delDoc.dati?.codice === 'fascicolo_collegato' && delDoc.dati?.collegamenti?.motivi?.length >= 2, delDoc.dati?.collegamenti?.motivi);
const delNon = await req('DELETE', `/fascicoli/fas_inesistente`, { motivazione: 'non esiste proprio' });
verifica('fascicolo inesistente → 404', delNon.stato === 404, delNon.dati);
// Collaboratore: non può eliminare.
const cookieProf = cookie;
await req('POST', '/auth/login', { email: 'collaboratore@studiodemo.it', password: 'Collab!2026' });
const delColl = await req('DELETE', `/fascicoli/${fNuovo.dati?.id}`, { motivazione: 'il collaboratore non può' });
verifica('collaboratore → 403', delColl.stato === 403, delColl.dati);
const modColl = await req('PATCH', `/fascicoli/${fNuovo.dati?.id}`, { dataIdentificazione: giorniFa(1) });
verifica('il collaboratore può invece correggere le date', modColl.stato === 200, modColl.dati);
cookie = cookieProf;
const delFine = await req('DELETE', `/fascicoli/${fNuovo.dati?.id}`, { motivazione: 'pulizia del collaudo' });
verifica('il professionista lo elimina', delFine.stato === 200, delFine.dati);

console.log(`\n== Esito: ${ok} ok / ${fail} FAIL ==`);
process.exit(fail ? 1 : 0);
