/**
 * Smoke test AR-M11: assistenza con ticket, novità, console Contify.
 *
 *   npx wrangler dev --port 8787 --local   (dopo reset + migrate 0001..0007 + seed)
 *   node scripts/smoke-api-m11.mjs
 *
 * Si ripulisce da solo: i ticket creati restano ma non disturbano le altre
 * suite (nessun conteggio globale li considera); rieseguendo la suite i
 * numeri progressivi avanzano e le verifiche restano valide.
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

/** Attore con il proprio barattolo di cookie. */
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

const collab = attore();
const titolare = attore();
const consoleOp = attore();
const anonimo = attore();

console.log('\n== Novità ==');
{
  const login = await collab('POST', '/auth/login', { email: 'collaboratore@studiodemo.it', password: 'Collab!2026' });
  verifica('login collaboratore', login.stato === 200, login);
  const nov = await collab('GET', '/novita');
  verifica('GET /novita elenca le voci', nov.stato === 200 && Array.isArray(nov.dati.novita) && nov.dati.novita.length >= 3, nov.dati);
  const invalida = await collab('POST', '/auth/novita', { vista: 'voce-inesistente' });
  verifica('vista sconosciuta rifiutata (400)', invalida.stato === 400, invalida);
  const massima = nov.dati.novita.map((n) => n.id).sort().at(-1);
  const ok = await collab('POST', '/auth/novita', { vista: massima });
  verifica('vista aggiornata', ok.stato === 200, ok);
  const dopo = await collab('GET', '/novita');
  verifica('vista persistita', dopo.dati.vista === massima, dopo.dati);
}

console.log('\n== Ticket: apertura e visibilità ==');
let ticketId = '';
{
  const t = await collab('POST', '/assistenza', { oggetto: 'Prova smoke M11', testo: 'Messaggio iniziale della prova.' });
  verifica('il collaboratore apre una richiesta (201)', t.stato === 201 && t.dati.numero?.startsWith('TCK-'), t.dati);
  ticketId = t.dati.id;
  const vuoto = await collab('POST', '/assistenza', { oggetto: '', testo: '' });
  verifica('oggetto/messaggio obbligatori (400)', vuoto.stato === 400, vuoto);
  const lista = await collab('GET', '/assistenza');
  verifica('il collaboratore vede la sua richiesta', lista.dati.ticket.some((x) => x.id === ticketId), lista.dati);
  const nonLetti = await collab('GET', '/assistenza/non-letti');
  verifica('il proprio messaggio non conta come non letto', nonLetti.dati.n === 0, nonLetti.dati);

  const loginTit = await titolare('POST', '/auth/login', { email: 'titolare@studiodemo.it', password: 'Antiriciclaggio!2026' });
  verifica('login titolare', loginTit.stato === 200, loginTit);
  const listaTit = await titolare('GET', '/assistenza');
  verifica('il titolare vede le richieste dello studio', listaTit.dati.ticket.some((x) => x.id === ticketId), listaTit.dati);
  const nl = await titolare('GET', '/assistenza/non-letti');
  verifica('per il titolare la richiesta è da leggere', nl.dati.n >= 1, nl.dati);
  const det = await titolare('GET', `/assistenza/${ticketId}`);
  verifica('dettaglio con messaggi', det.stato === 200 && det.dati.messaggi.length === 1, det.dati);
  const nl2 = await titolare('GET', '/assistenza/non-letti');
  verifica('aprire la conversazione la marca letta', nl2.dati.n === 0, nl2.dati);
}

console.log('\n== Console: accesso e risposta ==');
{
  const negato = await anonimo('GET', '/console/ticket');
  verifica('console senza sessione → 401', negato.stato === 401, negato);
  const sbagliato = await consoleOp('POST', '/console/login', { email: 'assistenza@contify.it', password: 'errata' });
  verifica('credenziali errate → 401', sbagliato.stato === 401, sbagliato);
  const login = await consoleOp('POST', '/console/login', { email: 'assistenza@contify.it', password: 'ConsoleSmoke!1' });
  verifica('login console', login.stato === 200 && login.dati.operatore?.email === 'assistenza@contify.it', login.dati);
  const lista = await consoleOp('GET', '/console/ticket');
  verifica('la console vede il ticket con lo studio', lista.dati.ticket.some((x) => x.id === ticketId && x.studio), lista.dati);
  const risposta = await consoleOp('POST', `/console/ticket/${ticketId}/rispondi`, { testo: 'Risposta di prova della console.' });
  verifica('la console risponde (201)', risposta.stato === 201, risposta);
  const det = await consoleOp('GET', `/console/ticket/${ticketId}`);
  verifica('stato → risposto', det.dati.ticket.stato === 'risposto', det.dati.ticket);
  verifica('il messaggio è marcato da_assistenza', det.dati.messaggi.at(-1).daAssistenza === true, det.dati.messaggi);
}

console.log('\n== Ticket: lettura, replica e chiusura ==');
{
  const nl = await collab('GET', '/assistenza/non-letti');
  verifica('la risposta risulta da leggere per l’autore', nl.dati.n === 1, nl.dati);
  const det = await collab('GET', `/assistenza/${ticketId}`);
  verifica('l’autore legge la risposta', det.dati.messaggi.length === 2, det.dati);
  const replica = await collab('POST', `/assistenza/${ticketId}/messaggi`, { testo: 'Grazie, replica di prova.' });
  verifica('l’autore replica (201)', replica.stato === 201, replica);
  const det2 = await collab('GET', `/assistenza/${ticketId}`);
  verifica('stato → aperto dopo la replica', det2.dati.ticket.stato === 'aperto', det2.dati.ticket);

  const chiudi = await consoleOp('POST', `/console/ticket/${ticketId}/chiudi`);
  verifica('la console chiude il ticket', chiudi.stato === 200 && chiudi.dati.stato === 'chiuso', chiudi);
  const dopoChiusura = await collab('POST', `/assistenza/${ticketId}/messaggi`, { testo: 'Non deve passare' });
  verifica('richiesta chiusa: niente nuovi messaggi (409)', dopoChiusura.stato === 409, dopoChiusura);
  const giaChiuso = await collab('POST', `/assistenza/${ticketId}/chiudi`);
  verifica('chiusura doppia rifiutata (409)', giaChiuso.stato === 409, giaChiuso);
}

console.log('\n== Registro ==');
{
  const audit = await titolare('GET', '/audit');
  const azioni = audit.dati.map((v) => v.azione);
  verifica('TICKET_APERTO nel registro', azioni.includes('TICKET_APERTO'), azioni.slice(0, 10));
  verifica('TICKET_RISPOSTA_ASSISTENZA nel registro', azioni.includes('TICKET_RISPOSTA_ASSISTENZA'), azioni.slice(0, 10));
  verifica('TICKET_CHIUSO nel registro', azioni.includes('TICKET_CHIUSO'), azioni.slice(0, 10));
  const integrita = await titolare('GET', '/audit/verifica');
  verifica('catena del registro integra', integrita.dati.integra === true, integrita.dati);
}

console.log(`\nEsito: ${passati} ok, ${falliti} falliti\n`);
process.exit(falliti ? 1 : 0);
