/**
 * Smoke test AR-M14: scheda cliente, modifica, archiviazione e cancellazione.
 *
 *   npx wrangler dev --port 8787 --local   (dopo reset + migrate 0001..0008 + seed)
 *   node scripts/smoke-api-m14.mjs
 *
 * Si ripulisce da solo: i clienti creati qui vengono cancellati o archiviati
 * in coda alla suite, così i conteggi del cruscotto restano quelli del seed.
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

const titolare = attore();
const collab = attore();

const login1 = await titolare('POST', '/auth/login', { email: 'titolare@studiodemo.it', password: 'Antiriciclaggio!2026' });
verifica('login titolare', login1.stato === 200, login1);
const login2 = await collab('POST', '/auth/login', { email: 'collaboratore@studiodemo.it', password: 'Collab!2026' });
verifica('login collaboratore', login2.stato === 200, login2);

console.log('\n== Scheda del cliente ==');
const creato = await titolare('POST', '/clienti', {
  tipo: 'SOCIETA_PERSONE',
  denominazione: 'Smoke M14 S.n.c.',
  codiceFiscale: '01234567897',
  paeseResidenza: 'it',
});
verifica('cliente creato', creato.stato === 201 && creato.dati.id, creato);
const id = creato.dati.id;

const scheda = await titolare('GET', `/clienti/${id}`);
verifica('GET /clienti/:id restituisce la scheda', scheda.stato === 200 && scheda.dati.cliente.denominazione === 'Smoke M14 S.n.c.', scheda.dati?.cliente);
verifica('la scheda porta i collegamenti', scheda.dati.collegamenti && scheda.dati.collegamenti.eliminabile === true, scheda.dati?.collegamenti);
verifica('cliente inesistente → 404', (await titolare('GET', '/clienti/cli_inesistente')).stato === 404);

console.log('\n== Modifica dell’anagrafica ==');
const patch = await titolare('PATCH', `/clienti/${id}`, {
  tipo: 'SOCIETA_CAPITALI',
  attivitaPrevalente: 'Commercio all’ingrosso',
  paeseResidenza: '',
  pep: true,
});
verifica('PATCH accettato', patch.stato === 200, patch);
const dopo = await titolare('GET', `/clienti/${id}`);
verifica('natura giuridica corretta', dopo.dati.cliente.tipo === 'SOCIETA_CAPITALI', dopo.dati?.cliente?.tipo);
verifica('attività prevalente salvata', dopo.dati.cliente.attivita_prevalente === 'Commercio all’ingrosso', dopo.dati?.cliente);
verifica('paese vuoto → default IT', dopo.dati.cliente.paese_residenza === 'IT', dopo.dati?.cliente?.paese_residenza);
verifica('PEP salvato', dopo.dati.cliente.pep === 1, dopo.dati?.cliente?.pep);
verifica('campi non inviati non toccati', dopo.dati.cliente.codice_fiscale === '01234567897', dopo.dati?.cliente);
verifica('aggiornato_il valorizzato', Boolean(dopo.dati.cliente.aggiornato_il), dopo.dati?.cliente?.aggiornato_il);

verifica(
  'denominazione vuota rifiutata (400)',
  (await titolare('PATCH', `/clienti/${id}`, { denominazione: '  ' })).stato === 400,
);
verifica(
  'natura giuridica inventata rifiutata (400)',
  (await titolare('PATCH', `/clienti/${id}`, { tipo: 'SOCIETA_ALIENA' })).stato === 400,
);
verifica('corpo vuoto rifiutato (400)', (await titolare('PATCH', `/clienti/${id}`, {})).stato === 400);
verifica('PATCH su cliente inesistente → 404', (await titolare('PATCH', '/clienti/cli_inesistente', { note: 'x' })).stato === 404);
verifica('anche il collaboratore può modificare', (await collab('PATCH', `/clienti/${id}`, { note: 'nota del collaboratore' })).stato === 200);

console.log('\n== Archiviazione ==');
const attiviPrima = await titolare('GET', '/clienti');
verifica('il cliente è negli attivi', attiviPrima.dati.some((c) => c.id === id), attiviPrima.stato);

verifica('il collaboratore non può archiviare (403)', (await collab('POST', `/clienti/${id}/archiviazione`, { archivia: true })).stato === 403);

const arch = await titolare('POST', `/clienti/${id}/archiviazione`, { archivia: true });
verifica('archiviazione accettata', arch.stato === 200 && arch.dati.attivo === 0, arch);
const attiviDopo = await titolare('GET', '/clienti');
verifica('sparito dagli attivi', !attiviDopo.dati.some((c) => c.id === id), attiviDopo.stato);
const conArchiviati = await titolare('GET', '/clienti?archiviati=1');
verifica('visibile con ?archiviati=1', conArchiviati.dati.some((c) => c.id === id && c.attivo === 0), conArchiviati.stato);

const ripr = await titolare('POST', `/clienti/${id}/archiviazione`, { archivia: false });
verifica('ripristino accettato', ripr.stato === 200 && ripr.dati.attivo === 1, ripr);
verifica('tornato fra gli attivi', (await titolare('GET', '/clienti')).dati.some((c) => c.id === id));
verifica('archiviazione di un id inesistente → 404', (await titolare('POST', '/clienti/cli_inesistente/archiviazione', { archivia: true })).stato === 404);

console.log('\n== Cancellazione ==');
verifica('il collaboratore non può cancellare (403)', (await collab('DELETE', `/clienti/${id}`)).stato === 403);

// Un cliente con un fascicolo non si cancella: art. 31, conservazione decennale.
const conFascicolo = await titolare('POST', '/clienti', { tipo: 'SOCIETA_CAPITALI', denominazione: 'Smoke M14 con fascicolo S.r.l.' });
const idConFascicolo = conFascicolo.dati.id;
const fasc = await titolare('POST', '/fascicoli', {
  clienteId: idConFascicolo,
  prestazioneCodice: (await titolare('GET', '/catalogo/prestazioni')).dati[0].codice,
  tipoRapporto: 'CONTINUATIVO',
  dataConferimento: new Date().toISOString().slice(0, 10),
});
verifica('fascicolo di prova creato', fasc.stato === 200 || fasc.stato === 201, fasc);

const rifiutata = await titolare('DELETE', `/clienti/${idConFascicolo}`);
verifica('cliente con fascicolo non cancellabile (409)', rifiutata.stato === 409, rifiutata);
verifica('il 409 spiega perché', rifiutata.dati?.codice === 'cliente_collegato' && rifiutata.dati?.collegamenti?.fascicoli >= 1, rifiutata.dati);
verifica('la scheda segnala non eliminabile', (await titolare('GET', `/clienti/${idConFascicolo}`)).dati.collegamenti.eliminabile === false);
verifica('resta archiviabile', (await titolare('POST', `/clienti/${idConFascicolo}/archiviazione`, { archivia: true })).stato === 200);

// Il cliente pulito invece si cancella davvero.
const canc = await titolare('DELETE', `/clienti/${id}`);
verifica('cliente senza collegamenti cancellato', canc.stato === 200, canc);
verifica('non più leggibile (404)', (await titolare('GET', `/clienti/${id}`)).stato === 404);
verifica('sparito anche dagli archiviati', !(await titolare('GET', '/clienti?archiviati=1')).dati.some((c) => c.id === id));
verifica('seconda cancellazione → 404', (await titolare('DELETE', `/clienti/${id}`)).stato === 404);

const registro = await titolare('GET', '/audit');
const riga = registro.dati.find((r) => r.azione === 'ELIMINA_CLIENTE' && r.entita_id === id);
verifica('la cancellazione è nel registro delle attività', Boolean(riga), registro.stato);
verifica(
  'il registro conserva la denominazione cancellata',
  riga && JSON.parse(riga.dettaglio ?? '{}').denominazione === 'Smoke M14 S.n.c.',
  riga?.dettaglio,
);
verifica('la catena del registro regge', (await titolare('GET', '/audit/verifica')).dati?.integra === true);

console.log(`\n${passati} verifiche superate, ${falliti} fallite`);
process.exit(falliti === 0 ? 0 : 1);
