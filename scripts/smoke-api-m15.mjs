/**
 * Smoke test AR-M15: studio associato e autovalutazione alimentata dai dati.
 *
 *   npx wrangler dev --port 8787 --local   (dopo reset + migrate 0001..0009 + seed)
 *   node scripts/smoke-api-m15.mjs
 *
 * Che cosa si vuole dimostrare, in ordine di importanza:
 *  1. un professionista che non amministra NON può toccare utenti, backup
 *     né l'archivio — è la ragione per cui AR-M15 esiste;
 *  2. clienti e fascicoli portano il nome del professionista incaricato e di
 *     chi ha identificato, e i filtri per professionista funzionano;
 *  3. firmare la valutazione di un collega è possibile ma vuole il perché;
 *  4. gli indicatori AV.0 si calcolano sui dati veri, e sotto la soglia di
 *     significatività non propongono punteggi.
 *
 * Si ripulisce da solo: quanto creato qui viene cancellato o archiviato.
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

const amministratore = attore();   // usr_tit  — professionista E amministratore
const associata = attore();        // usr_tit2 — professionista, NON amministratore
const collab = attore();

const l1 = await amministratore('POST', '/auth/login', { email: 'titolare@studiodemo.it', password: 'Antiriciclaggio!2026' });
verifica('login amministratore', l1.stato === 200, l1);
const l2 = await associata('POST', '/auth/login', { email: 'associato@studiodemo.it', password: 'Antiriciclaggio!2026' });
verifica('login professionista associato', l2.stato === 200, l2);
const l3 = await collab('POST', '/auth/login', { email: 'collaboratore@studiodemo.it', password: 'Collab!2026' });
verifica('login collaboratore', l3.stato === 200, l3);

console.log('\n== 1. Amministrazione separata dal ruolo ==');
const io1 = await amministratore('GET', '/auth/io');
verifica('l’amministratore si riconosce come tale', io1.dati?.utente?.amministratore === true, io1.dati?.utente);
const io2 = await associata('GET', '/auth/io');
verifica('l’associata è professionista ma non amministratore',
  io2.dati?.utente?.professionista === true && io2.dati?.utente?.amministratore === false, io2.dati?.utente);

const utentiVietati = await associata('GET', '/utenti');
verifica('l’associata NON può elencare gli utenti', utentiVietati.stato === 403, utentiVietati);
const backupVietato = await associata('GET', '/backup');
verifica('l’associata NON può vedere i backup', backupVietato.stato === 403, backupVietato);
const eliminaVietata = await associata('POST', '/backup/elimina-archivio', { conferma: 'no' });
verifica('l’associata NON può eliminare l’archivio', eliminaVietata.stato === 403, eliminaVietata);
const logoVietato = await associata('POST', '/studio/logo', { logo: null });
verifica('l’associata NON può cambiare il logo dello studio', logoVietato.stato === 403, logoVietato);
const utentiOk = await amministratore('GET', '/utenti');
verifica('l’amministratore elenca gli utenti', utentiOk.stato === 200 && Array.isArray(utentiOk.dati), utentiOk);
verifica('l’elenco utenti riporta il flag amministratore',
  (utentiOk.dati ?? []).some((u) => u.amministratore === true) && (utentiOk.dati ?? []).some((u) => u.amministratore === false),
  utentiOk.dati);

console.log('\n== 2. Chi identifica e chi segue ==');
const prof = await associata('GET', '/studio/professionisti');
verifica('elenco professionisti visibile a tutti', prof.stato === 200 && prof.dati.length >= 2, prof.dati);
const idAmm = (prof.dati ?? []).find((p) => p.email === 'titolare@studiodemo.it')?.id;
const idAss = (prof.dati ?? []).find((p) => p.email === 'associato@studiodemo.it')?.id;
verifica('i professionisti hanno i dati d’albo', Boolean((prof.dati ?? []).find((p) => p.id === idAss)?.numeroIscrizione), prof.dati);

const cliente = await associata('POST', '/clienti', {
  tipo: 'SOCIETA_CAPITALI', denominazione: 'Smoke M15 Srl', codiceFiscale: '09876543210', paeseResidenza: 'IT',
});
verifica('l’associata crea un cliente', cliente.stato === 201, cliente);
const idCliente = cliente.dati?.id;
const schedaCliente = await amministratore('GET', `/clienti/${idCliente}`);
verifica('il cliente è intestato a chi lo ha creato',
  schedaCliente.dati?.cliente?.professionista_id === idAss, schedaCliente.dati?.cliente);

const clienteCollab = await collab('POST', '/clienti', { tipo: 'ALTRO', denominazione: 'Smoke M15 senza prof' });
verifica('il collaboratore deve indicare il professionista', clienteCollab.stato === 400, clienteCollab);
const clienteCollabOk = await collab('POST', '/clienti', {
  tipo: 'ALTRO', denominazione: 'Smoke M15 con prof', professionistaId: idAmm,
});
verifica('il collaboratore può creare indicando il professionista', clienteCollabOk.stato === 201, clienteCollabOk);
const idClienteCollab = clienteCollabOk.dati?.id;

const clientiFiltrati = await amministratore('GET', `/clienti?professionista=${idAss}`);
verifica('filtro clienti per professionista',
  clientiFiltrati.stato === 200 && clientiFiltrati.dati.every((c) => c.professionista_id === idAss)
    && clientiFiltrati.dati.some((c) => c.id === idCliente),
  clientiFiltrati.dati?.slice(0, 3));

const fascicolo = await associata('POST', '/fascicoli', {
  clienteId: idCliente,
  prestazioneCodice: 'TENUTA_CONTABILITA',
  dataConferimento: '2026-02-01',
  modalitaIdentificazione: 'PRESENZA',
  scopoNatura: 'Tenuta della contabilità ordinaria',
});
verifica('l’associata apre un fascicolo', fascicolo.stato === 201, fascicolo);
const idFascicolo = fascicolo.dati?.id;
const dettaglio = await amministratore('GET', `/fascicoli/${idFascicolo}`);
verifica('il fascicolo porta professionista e identificatore',
  dettaglio.dati?.fascicolo?.professionista_id === idAss && dettaglio.dati?.fascicolo?.identificato_da === idAss,
  dettaglio.dati?.fascicolo);
verifica('la data di identificazione ricade sul conferimento',
  dettaglio.dati?.fascicolo?.data_identificazione === '2026-02-01', dettaglio.dati?.fascicolo);

const riassegna = await amministratore('POST', `/fascicoli/${idFascicolo}/professionista`, {
  professionistaId: idAmm, identificatoDa: idAss, dataIdentificazione: '2026-02-03',
});
verifica('riassegnazione del fascicolo', riassegna.stato === 200, riassegna);
const dopoRiassegna = await amministratore('GET', `/fascicoli/${idFascicolo}`);
verifica('la riassegnazione tiene distinti incaricato e identificatore',
  dopoRiassegna.dati?.fascicolo?.professionista_id === idAmm
    && dopoRiassegna.dati?.fascicolo?.identificato_da === idAss
    && dopoRiassegna.dati?.fascicolo?.data_identificazione === '2026-02-03',
  dopoRiassegna.dati?.fascicolo);

const professionistaInesistente = await amministratore('POST', `/fascicoli/${idFascicolo}/professionista`, {
  professionistaId: 'usr_col',
});
verifica('un collaboratore non può essere professionista incaricato', professionistaInesistente.stato === 400, professionistaInesistente);

const fascicoliFiltrati = await amministratore('GET', `/fascicoli?professionista=${idAmm}`);
verifica('filtro fascicoli per professionista',
  fascicoliFiltrati.stato === 200 && fascicoliFiltrati.dati.every((f) => f.professionista_id === idAmm),
  fascicoliFiltrati.dati?.slice(0, 2));

console.log('\n== 3. Firma per conto di un collega ==');
const valutazione = await associata('POST', `/fascicoli/${idFascicolo}/valutazioni`, {
  tabellaA: { natura_giuridica: 2, prevalente_attivita: 2, comportamento: 1, area_geografica_cliente: 1 },
  circostanze: {},
});
verifica('valutazione registrata', valutazione.stato === 201, valutazione);
const idValutazione = valutazione.dati?.id;

// Il fascicolo è ora intestato all'amministratore: l'associata firma per conto.
const firmaSenzaMotivo = await associata('POST', `/fascicoli/${idFascicolo}/valutazioni/${idValutazione}/firma`);
verifica('firmare per un collega senza motivo è rifiutato',
  firmaSenzaMotivo.stato === 409 && firmaSenzaMotivo.dati?.richiedeMotivazione === true, firmaSenzaMotivo);
const firmaConMotivo = await associata('POST', `/fascicoli/${idFascicolo}/valutazioni/${idValutazione}/firma`, {
  motivazioneFirma: 'Sostituzione del collega in ferie',
});
verifica('con il motivo la firma passa', firmaConMotivo.stato === 200 && firmaConMotivo.dati?.perConto === true, firmaConMotivo);
const conFirma = await amministratore('GET', `/fascicoli/${idFascicolo}`);
verifica('la motivazione della firma è conservata',
  conFirma.dati?.valutazioni?.[0]?.firma_motivazione === 'Sostituzione del collega in ferie',
  conFirma.dati?.valutazioni?.[0]);

const collabFirma = await collab('POST', `/fascicoli/${idFascicolo}/valutazioni/${idValutazione}/firma`);
verifica('il collaboratore non firma comunque', collabFirma.stato === 403, collabFirma);

console.log('\n== 4. Indicatori del portafoglio (Modello AV.0) ==');
const ind = await amministratore('GET', '/studio/indicatori');
verifica('gli indicatori si calcolano', ind.stato === 200 && Array.isArray(ind.dati?.indicatori?.inerente), ind.dati);
const fattori = Object.fromEntries((ind.dati?.indicatori?.inerente ?? []).map((i) => [i.codice, i]));
verifica('i quattro fattori del rischio inerente ci sono tutti',
  ['tipologia_clientela', 'area_geografica', 'canali_distributivi', 'servizi_offerti'].every((k) => fattori[k]),
  Object.keys(fattori));
verifica('i canali distributivi restano indicativi (AV.0 li dichiara residuali)',
  fattori.canali_distributivi?.indicativo === true && fattori.canali_distributivi?.punteggio === null,
  fattori.canali_distributivi);
verifica('ogni fattore espone numeratore e denominatore',
  (ind.dati?.indicatori?.inerente ?? []).every((i) => typeof i.numeratore === 'number' && typeof i.denominatore === 'number'),
  ind.dati?.indicatori?.inerente);
verifica('sotto la soglia non si propongono punteggi di rischio inerente',
  ind.dati?.indicatori?.significativo === true
    || (ind.dati?.indicatori?.inerente ?? []).every((i) => i.punteggio === null),
  { significativo: ind.dati?.indicatori?.significativo, fascicoli: ind.dati?.indicatori?.fascicoliAttivi });
verifica('la vulnerabilità è proposta con la sua evidenza',
  (ind.dati?.indicatori?.vulnerabilita ?? []).every((i) => typeof i.spiegazione === 'string' && i.spiegazione.length > 10),
  ind.dati?.indicatori?.vulnerabilita);

const punteggi = { tipologia_clientela: 2, area_geografica: 1, canali_distributivi: 2, servizi_offerti: 2 };
const vulnerabilita = { formazione: 3, organizzazione_adeguata_verifica: 2, organizzazione_conservazione: 2, organizzazione_sos: 3 };
const nuovaAv = await amministratore('POST', '/studio/autovalutazioni', {
  inerente: punteggi, vulnerabilita, note: 'Smoke M15',
});
verifica('autovalutazione registrata', nuovaAv.stato === 201, nuovaAv);
verifica('la versione conserva gli indicatori usati',
  Boolean(nuovaAv.dati?.indicatori?.fattori && Object.keys(nuovaAv.dati.indicatori.fattori).length === 8),
  nuovaAv.dati?.indicatori);
verifica('ogni fattore registra l’origine del punteggio',
  Object.values(nuovaAv.dati?.indicatori?.fattori ?? {}).every((f) => ['CALCOLATO', 'MODIFICATO', 'MANUALE'].includes(f.origine)),
  nuovaAv.dati?.indicatori?.fattori);

console.log('\n== Pulizia ==');
await amministratore('POST', `/clienti/${idCliente}/archiviazione`, { archivia: true });
const eliminaCollab = await amministratore('DELETE', `/clienti/${idClienteCollab}`);
verifica('cliente di prova senza collegamenti eliminato', eliminaCollab.stato === 200, eliminaCollab);
const eliminaDaAssociata = await associata('DELETE', `/clienti/${idClienteCollab}`);
verifica('la cancellazione resta all’amministratore', eliminaDaAssociata.stato === 403, eliminaDaAssociata);

console.log(`\n${passati} ok / ${falliti} FAIL`);
process.exit(falliti > 0 ? 1 : 0);
