/**
 * Smoke test AR-M16: posti professionista a contratto.
 *
 *   npx wrangler dev --port 8787 --local   (dopo reset + migrate 0001..0010 + seed)
 *   node scripts/smoke-api-m16.mjs
 *
 * Cosa si dimostra:
 *  1. senza limite (NULL) tutto funziona come prima;
 *  2. la console imposta i posti e li vede accanto ai professionisti attivi;
 *  3. col limite pieno la creazione/promozione di un professionista è
 *     rifiutata con un messaggio che dice cosa fare — mentre collaboratori
 *     e lettori restano liberi, e chi era già professionista non è toccato;
 *  4. alzare il limite (o toglierlo) riapre la porta.
 *
 * Il seed ha 2 professionisti attivi (usr_tit, usr_tit2). Si ripulisce da
 * solo: il limite torna NULL e gli utenti creati vengono disattivati.
 */

const BASE = process.env.BASE ?? 'http://localhost:8787';
let falliti = 0;
let passati = 0;

function verifica(descrizione, condizione, contesto) {
  if (condizione) { passati++; console.log(`  ok   ${descrizione}`); }
  else {
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

const amm = attore();       // amministratore dello studio demo
const operatore = attore(); // console Contify

const l1 = await amm('POST', '/auth/login', { email: 'titolare@studiodemo.it', password: 'Antiriciclaggio!2026' });
verifica('login amministratore studio', l1.stato === 200, l1);
const l2 = await operatore('POST', '/console/login', { email: 'assistenza@contify.it', password: 'ConsoleSmoke!1' });
verifica('login operatore console', l2.stato === 200, l2);

const TENANT = 'ten_demo';
const contratto = (extra) => operatore('POST', `/console/studi/${TENANT}/contratto`, {
  dataAttivazione: null, dataScadenzaCanone: null, noteContratto: null, ...extra,
});

console.log('\n== 1. Nessun limite (NULL) ==');
const azzera = await contratto({ professionistiInclusi: null });
verifica('contratto senza limite salvato', azzera.stato === 200, azzera);
const libero = await amm('POST', '/utenti', { nome: 'Terzo Professionista', email: 'terzo.m16@test.it', ruolo: 'TITOLARE' });
verifica('senza limite il terzo professionista si crea', libero.stato === 201, libero);
const idTerzo = libero.dati?.id;

console.log('\n== 2. La console imposta e vede i posti ==');
const nonValido = await contratto({ professionistiInclusi: 0 });
verifica('limite 0 respinto (minimo 1)', nonValido.stato === 400, nonValido);
const nonIntero = await contratto({ professionistiInclusi: 2.5 });
verifica('limite non intero respinto', nonIntero.stato === 400, nonIntero);
const imposta = await contratto({ professionistiInclusi: 3 });
verifica('limite 3 salvato', imposta.stato === 200, imposta);
const studi = await operatore('GET', '/console/studi');
const demo = (studi.dati?.studi ?? []).find((s) => s.id === TENANT);
verifica('la console vede professionisti attivi e limite',
  demo?.nProfessionisti === 3 && demo?.professionistiInclusi === 3, demo);
const io = await amm('GET', '/auth/io');
verifica('lo studio vede il proprio limite', io.dati?.studio?.professionistiInclusi === 3, io.dati?.studio);

console.log('\n== 3. Limite pieno ==');
const rifiutato = await amm('POST', '/utenti', { nome: 'Quarto Professionista', email: 'quarto.m16@test.it', ruolo: 'TITOLARE' });
verifica('il quarto professionista è rifiutato con 409',
  rifiutato.stato === 409 && rifiutato.dati?.postiEsauriti === true, rifiutato);
verifica('il messaggio dice cosa fare', /Assistenza/.test(rifiutato.dati?.errore ?? ''), rifiutato.dati);
const collaboratore = await amm('POST', '/utenti', { nome: 'Collab M16', email: 'collab.m16@test.it', ruolo: 'COLLABORATORE' });
verifica('un collaboratore si crea comunque (non conta come posto)', collaboratore.stato === 201, collaboratore);
const idCollab = collaboratore.dati?.id;
const promozione = await amm('POST', `/utenti/${idCollab}`, { ruolo: 'TITOLARE' });
verifica('promuovere un collaboratore a professionista è rifiutato a limite pieno',
  promozione.stato === 409 && promozione.dati?.postiEsauriti === true, promozione);
const rinomina = await amm('POST', `/utenti/${idTerzo}`, { nome: 'Terzo Professionista Rinominato' });
verifica('modificare un professionista già attivo non consuma posti', rinomina.stato === 200, rinomina);

console.log('\n== 4. Limite alzato o rimosso ==');
const alza = await contratto({ professionistiInclusi: 4 });
verifica('limite alzato a 4', alza.stato === 200, alza);
const oraPassa = await amm('POST', `/utenti/${idCollab}`, { ruolo: 'TITOLARE' });
verifica('con un posto libero la promozione passa', oraPassa.stato === 200, oraPassa);

// Limite più basso degli attivi: nessuno viene disattivato, ma non si aggiunge.
const stringi = await contratto({ professionistiInclusi: 2 });
verifica('limite sotto gli attivi accettato (non disattiva nessuno)', stringi.stato === 200, stringi);
const ioDopo = await amm('GET', '/auth/io');
verifica('gli utenti restano attivi anche oltre contratto',
  ioDopo.stato === 200 && ioDopo.dati?.utente?.attivo !== 0, ioDopo.dati?.utente);
const bloccato = await amm('POST', '/utenti', { nome: 'Quinto', email: 'quinto.m16@test.it', ruolo: 'TITOLARE' });
verifica('ma un nuovo professionista non entra', bloccato.stato === 409, bloccato);

console.log('\n== Pulizia ==');
const giu1 = await amm('POST', `/utenti/${idCollab}`, { ruolo: 'COLLABORATORE', attivo: false });
const giu2 = await amm('POST', `/utenti/${idTerzo}`, { ruolo: 'COLLABORATORE', attivo: false });
verifica('utenti di prova disattivati', giu1.stato === 200 && giu2.stato === 200, { giu1, giu2 });
const ripristina = await contratto({ professionistiInclusi: null });
verifica('limite rimosso', ripristina.stato === 200, ripristina);

console.log(`\n${passati} ok / ${falliti} FAIL`);
process.exit(falliti > 0 ? 1 : 0);
