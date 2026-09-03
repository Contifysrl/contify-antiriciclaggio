#!/usr/bin/env node
/**
 * Popola lo «Studio Collaudo» con un archivio fittizio, passando SOLO dalle API
 * (le stesse che usa l'interfaccia): ogni riga nasce cifrata con la chiave dello
 * studio, con la sua voce nel registro accessi e con le proposte del programma.
 *
 *   node scripts/popola-collaudo.mjs --url https://antiriciclaggio.contify.it --email s.callegaro@gmail.com
 *   node scripts/popola-collaudo.mjs                       (in locale: http://localhost:8787, titolare demo)
 *
 * Opzioni:
 *   --url <base>       indirizzo del programma (default http://localhost:8787)
 *   --email <email>    utente amministratore con cui entrare (default titolare@studiodemo.it)
 *   --azzera           se l'archivio non è vuoto, lo elimina prima («Elimina archivio», con backup di sicurezza)
 *   --forza            consente di lavorare su uno studio che NON si chiama «Studio Collaudo»
 *   --password-associato <p>  password da assegnare al secondo professionista (default Associato!Collaudo2026)
 *
 * La password dell'amministratore si scrive al momento (non compare a schermo)
 * oppure si passa nella variabile d'ambiente PASSWORD.
 *
 * Cosa costruisce (tutto inventato; nomi non comuni perché lo screening delle liste
 * lavora per contenuto; CF e P.IVA con checksum corretto ma di nessuno):
 *  - AI abilitata, tabella delle province a rischio contante, registro TE accreditato;
 *  - un secondo professionista associato (non amministratore) e una collaboratrice;
 *  - 9 società da visure (6 sintetiche: SRL 70/30, holding con usufrutto e CdA, 4×25%, SPA senza soci,
 *    SRL in liquidazione con fiduciaria/estero/quote proprie, impresa individuale; 3 vere anonimizzate
 *    che formano una catena su tre livelli: holding di una società semplice → SRL 50/50 e SRL unipersonale) con compagine,
 *    proposte di titolarità applicate/modificate/scartate, screening dei nomi, PDF conservati;
 *  - 14 clienti inseriti a mano (persone fisiche, società di persone, ente, trust; una PEP, una
 *    residente in paese terzo ad alto rischio, settori esposti: compro oro, gioco, cripto, immobiliare);
 *  - 21 prestazioni (fascicoli) in tutti gli stati: aperte, in verifica, complete (firmate anche
 *    dall'associato e una firmata in sostituzione con motivazione), una in astensione; Tabella A
 *    proposta applicata e una modificata con motivazione; tutte e quattro le classi di rischio;
 *    date nel passato così che il controllo costante risulti scaduto per alcune e in scadenza per altre;
 *  - operazioni (una in contante oltre soglia), una SOS in bozza e una trasmessa, un'astensione;
 *  - due richieste di verifica a distanza (una aperta, una completata dal cliente con la
 *    dichiarazione art. 22 e acquisita), documenti di identità;
 *  - autovalutazione dello studio proposta dai dati e firmata (per ultima: gli indicatori si
 *    calcolano sull'archivio popolato, che supera le 10 prestazioni).
 *
 * Ripetibile: «Impostazioni → Elimina archivio» (o --azzera) e rilancio. Gli utenti restano.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { leggiVisura } from '../web/src/lib/visura.ts';

// ── Argomenti ──────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opz = (nome, def) => { const i = argv.indexOf(nome); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def; };
const flag = (nome) => argv.includes(nome);
const BASE = (opz('--url', process.env.BASE ?? 'http://localhost:8787')).replace(/\/$/, '');
const EMAIL = opz('--email', 'titolare@studiodemo.it');
const PASSWORD_ASSOCIATO = opz('--password-associato', 'Associato!Collaudo2026');
const OGGI = new Date().toISOString().slice(0, 10);
const qui = path.dirname(fileURLToPath(import.meta.url));

// ── Trasporto ──────────────────────────────────────────────────
class Sessione {
  constructor(nome) { this.nome = nome; this.cookie = ''; }
  async req(metodo, percorso, corpo, form, o = {}) {
    const r = await fetch(`${BASE}/api${percorso}`, {
      method: metodo,
      headers: { ...(corpo && !form ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie && !o.senzaCookie ? { Cookie: this.cookie } : {}) },
      body: form ? form : corpo ? JSON.stringify(corpo) : undefined,
    });
    const set = r.headers.get('set-cookie');
    if (set && !o.senzaCookie) this.cookie = set.split(';')[0];
    if (o.binario) return { stato: r.status, tipo: r.headers.get('content-type'), bytes: (await r.arrayBuffer()).byteLength };
    const t = await r.text();
    let dati = null;
    try { dati = t ? JSON.parse(t) : null; } catch { dati = t; }
    return { stato: r.status, dati };
  }
  /** Come req, ma un esito diverso da quelli attesi ferma tutto: un archivio a metà non serve. */
  async deve(metodo, percorso, corpo, form, attesi = [200, 201], o = {}) {
    const r = await this.req(metodo, percorso, corpo, form, o);
    if (!attesi.includes(r.stato)) {
      throw new Error(`${metodo} ${percorso} → ${r.stato}: ${JSON.stringify(r.dati).slice(0, 500)}`);
    }
    return r.dati;
  }
}
const amm = new Sessione('amministratore');
const passi = [];
function passo(titolo) { passi.push(titolo); console.log(`\n== ${passi.length}. ${titolo} ==`); }
function nota(s) { console.log(`   ${s}`); }

function chiediPassword(prompt) {
  if (process.env.PASSWORD) return Promise.resolve(process.env.PASSWORD);
  return new Promise((risolvi) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const scrivi = rl._writeToOutput;
    rl.question(prompt, (p) => { rl._writeToOutput = scrivi; rl.close(); process.stdout.write('\n'); risolvi(p); });
    rl._writeToOutput = () => {};
  });
}

// ── Generatori di dati formalmente validi ma di nessuno ────────
const CF_DISPARI = { 0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21, A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18, N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23 };
const CF_MESI = 'ABCDEHLMPRST';
function consonanti(s) { return s.toUpperCase().replace(/[^A-Z]/g, '').replace(/[AEIOU]/g, ''); }
function vocali(s) { return s.toUpperCase().replace(/[^A-Z]/g, '').replace(/[^AEIOU]/g, ''); }
function treLettere(s, nome = false) {
  const c = consonanti(s); const v = vocali(s);
  let r = nome && c.length >= 4 ? c[0] + c[2] + c[3] : c.slice(0, 3);
  if (r.length < 3) r = (r + v).slice(0, 3);
  return (r + 'XXX').slice(0, 3);
}
/** Codice fiscale di persona fisica con carattere di controllo corretto. */
function codiceFiscale(cognome, nome, nascita, sesso, belfiore) {
  const [aa, mm, gg] = nascita.split('-');
  const giorno = String(Number(gg) + (sesso === 'F' ? 40 : 0)).padStart(2, '0');
  const base = treLettere(cognome) + treLettere(nome, true) + aa.slice(2) + CF_MESI[Number(mm) - 1] + giorno + belfiore;
  let somma = 0;
  for (let i = 0; i < 15; i++) {
    const ch = base[i];
    somma += i % 2 === 0 ? CF_DISPARI[ch] : (/\d/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 65);
  }
  return base + String.fromCharCode(65 + (somma % 26));
}
/** Partita IVA con cifra di controllo corretta (ufficio 999 = codice riservato: non esiste). */
function partitaIva(seme) {
  const corpo = String(seme).padStart(7, '0').slice(-7) + '999';
  let somma = 0;
  for (let i = 0; i < 10; i++) {
    const n = Number(corpo[i]);
    if (i % 2 === 0) somma += n; else { const d = n * 2; somma += d > 9 ? d - 9 : d; }
  }
  return corpo + String((10 - (somma % 10)) % 10);
}
/** Un PDF minimo ma valido, con una riga di testo: serve a documenti che devono esistere, non a leggersi. */
function pdfMinimo(testo) {
  const contenuto = `BT /F1 12 Tf 50 780 Td (${testo.replace(/[()\\]/g, ' ')}) Tj ET`;
  const oggetti = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${contenuto.length} >>\nstream\n${contenuto}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offset = [];
  oggetti.forEach((o, i) => { offset.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${oggetti.length + 1}\n0000000000 65535 f \n`;
  for (const off of offset) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${oggetti.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([out], { type: 'application/pdf' });
}
const giorniFa = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const formDocumento = (blob, nome, tipo, data) => { const f = new FormData(); f.append('file', blob, nome); f.append('tipo', tipo); if (data) f.append('dataRiferimento', data); return f; };
const fixture = (n) => leggiVisura(fs.readFileSync(path.join(qui, '..', 'tests', 'fixtures', 'visure', n), 'utf8'));
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
  };
}

// ── Il portafoglio inventato ───────────────────────────────────
const PF = (cognome, nome, nascita, sesso, belfiore, luogo, residenza, extra = {}) => ({
  tipo: 'PERSONA_FISICA', denominazione: `${cognome} ${nome}`, codiceFiscale: codiceFiscale(cognome, nome, nascita, sesso, belfiore),
  paeseResidenza: 'IT', pep: false, pepOrganoPubblico: false,
  datiIdentificativi: { nome, cognome, dataNascita: nascita, luogoNascita: luogo, residenza, documentoTipo: 'CARTA_IDENTITA', documentoNumero: `CA${String(Math.abs(hash(cognome + nome))).padStart(7, '0').slice(0, 7)}`, documentoScadenza: '2031-03-15' },
  ...extra,
});
function hash(s) { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; }
const PG = (denominazione, tipo, seme, extra = {}) => ({ tipo, denominazione, codiceFiscale: partitaIva(seme), partitaIva: partitaIva(seme), paeseResidenza: 'IT', pep: false, pepOrganoPubblico: false, ...extra });

const CLIENTI_MANUALI = [
  PF('Brandolisio', 'Ottavia', '1968-04-12', 'F', 'G224', 'Padova (PD)', 'Via dei Colli 14, 35143 Padova (PD)', { pep: true, note: 'Assessora regionale in carica dal 2023: persona politicamente esposta (art. 1 co. 2 lett. dd).', attivitaPrevalente: 'Dirigente pubblico' }),
  PF('Zamperetti', 'Corrado', '1975-11-03', 'M', 'L781', 'Venezia (VE)', 'Riva degli Schiavoni 9, 30122 Venezia (VE)', { attivitaPrevalente: 'Agente di commercio', ateco: '46.19.01' }),
  PF('Quaglierini', 'Ilenia', '1989-02-21', 'F', 'A944', 'Bologna (BO)', 'Via Saragozza 88, 40135 Bologna (BO)', { attivitaPrevalente: 'Libera professionista (architetta)', ateco: '71.11.00' }),
  PF('Vendramel', 'Tullio', '1961-07-30', 'M', 'L219', 'Torino (TO)', 'Rruga Myslym Shyri 12, Tirana (Albania)', { paeseResidenza: 'AL', attivitaPrevalente: 'Imprenditore edile', note: 'Residente all\'estero dal 2019.' }),
  PF('Marangoni', 'Ubaldo', '1958-09-09', 'M', 'D612', 'Firenze (FI)', 'Via Roma 45, 36100 Vicenza (VI)', { attivitaPrevalente: 'Bar tabacchi', ateco: '47.26.00' }),
  PF('Sgarbossa', 'Nives', '1993-12-01', 'F', 'C351', 'Catania (CT)', 'Via Etnea 210, 95131 Catania (CT)', { attivitaPrevalente: 'Commercio elettronico', ateco: '47.91.10' }),
  PF('Toniolo Bressan', 'Evaristo', '1949-03-18', 'M', 'F839', 'Napoli (NA)', 'Corso Umberto I 33, 80138 Napoli (NA)', { attivitaPrevalente: 'Pensionato, redditi immobiliari' }),
  PG('Fonderie Valbrenta Srl', 'SOCIETA_CAPITALI', 1123581, { attivitaPrevalente: 'Fusione di ghisa', ateco: '24.51.00', datiIdentificativi: { sede: 'Via dell\'Industria 3, 36020 Solagna (VI)', provincia: 'VI', formaGiuridica: 'Società a responsabilità limitata', capitaleSociale: 250000, dataCostituzione: '2004-06-15' } }),
  PG('Girasole Società Semplice Agricola', 'SOCIETA_PERSONE', 3141592, { attivitaPrevalente: 'Coltivazione di cereali', ateco: '01.11.10', datiIdentificativi: { sede: 'Via Argine 120, 45011 Adria (RO)', provincia: 'RO', formaGiuridica: 'Società semplice' } }),
  PG('Associazione Culturale Il Faro di Brondolo', 'ENTE_NON_PROFIT', 2718281, { partitaIva: null, attivitaPrevalente: 'Attività culturali e ricreative', ateco: '94.99.20', datiIdentificativi: { sede: 'Piazza Vigo 7, 30015 Chioggia (VE)', provincia: 'VE', formaGiuridica: 'Associazione non riconosciuta' } }),
  PG('Trust Aurora Boreale', 'TRUST', 1618033, { partitaIva: null, attivitaPrevalente: 'Trust familiare di segregazione patrimoniale', datiIdentificativi: { sede: 'c/o trustee, Via Manzoni 5, 20121 Milano (MI)', provincia: 'MI', formaGiuridica: 'Trust interno con trustee professionale', note: 'Il trustee non fornisce l\'atto istitutivo.' } }),
  PG('Compro Oro Adige Snc di Fantinel & C.', 'SOCIETA_PERSONE', 1414213, { attivitaPrevalente: 'Commercio al dettaglio di oro usato', ateco: '47.77.00', datiIdentificativi: { sede: 'Corso Porta Nuova 40, 37122 Verona (VR)', provincia: 'VR', formaGiuridica: 'Società in nome collettivo' } }),
  PG('Sala Giochi La Lanterna Srl', 'SOCIETA_CAPITALI', 1732050, { attivitaPrevalente: 'Gestione di apparecchi da intrattenimento', ateco: '92.00.02', datiIdentificativi: { sede: 'Via Marina 18, 16126 Genova (GE)', provincia: 'GE', formaGiuridica: 'Società a responsabilità limitata', capitaleSociale: 10000, dataCostituzione: '2025-12-20' } }),
  PG('Cripto Nord Srl', 'SOCIETA_CAPITALI', 2236067, { attivitaPrevalente: 'Servizi relativi a valute virtuali', ateco: '66.19.40', datiIdentificativi: { sede: 'Via Torino 61, 20123 Milano (MI)', provincia: 'MI', formaGiuridica: 'Società a responsabilità limitata', capitaleSociale: 50000, dataCostituzione: '2023-02-01' } }),
];

const VISURE = [
  { file: 'srl-due-soci-pf.txt', pdf: 'srl-due-soci-pf.pdf', seme: 4102030, titolarita: 'APPLICA' },
  { file: 'srl-holding-usufrutto-cda.txt', seme: 4102031, titolarita: 'MODIFICA' },
  { file: 'srl-quattro-soci-25.txt', pdf: 'srl-quattro-soci-25.pdf', seme: 4102032, titolarita: 'RESIDUALE' },
  { file: 'spa-senza-soci.txt', seme: 4102033, titolarita: 'RESIDUALE' },
  { file: 'srl-liquidazione-fiduciaria-estero-quote-proprie.txt', seme: 4102034, titolarita: 'SCARTA' },
  { file: 'impresa-individuale.txt', seme: null, titolarita: 'NESSUNA' },
  // Catena vera su tre livelli (visure di Barbara, anonimizzate): la holding prima,
  // così le partecipate la trovano già in archivio e la catena si risolve da sola.
  { file: 'holding-socia-societa-semplice.txt', seme: null, titolarita: 'APPLICA' },
  { file: 'srl-socio-pf-e-holding-cda.txt', seme: null, titolarita: 'APPLICA' },
  { file: 'srl-unipersonale-socio-holding.txt', seme: null, titolarita: 'APPLICA' },
];

// ── Esecuzione ─────────────────────────────────────────────────
console.log(`Popolamento dell'archivio di collaudo su ${BASE} come ${EMAIL}`);
const password = await chiediPassword('Password: ');
if (!password) { console.error('Password mancante.'); process.exit(1); }

passo('Accesso e controlli di sicurezza');
const login = await amm.req('POST', '/auth/login', { email: EMAIL, password });
if (login.stato !== 200) { console.error(`Accesso rifiutato (${login.stato}): ${JSON.stringify(login.dati)}`); process.exit(1); }
const io = await amm.deve('GET', '/auth/io');
const studio = io.studio;
nota(`studio «${studio.denominazione}» (${studio.id}), utente ${io.utente.nome} — ruolo ${io.utente.ruolo}${io.utente.amministratore ? ', amministratore' : ''}`);
if (!io.utente.amministratore || io.utente.ruolo !== 'TITOLARE') { console.error('Serve un professionista amministratore.'); process.exit(1); }
if (!/collaudo|demo/i.test(studio.denominazione) && !flag('--forza')) {
  console.error(`Lo studio non si chiama «Studio Collaudo»: mi fermo per non popolare un archivio vero. Usa --forza se è davvero voluto.`);
  process.exit(1);
}
if (io.utente.cambioPasswordRichiesto) {
  console.error('La password è ancora quella temporanea: cambiala dal programma prima di popolare.');
  process.exit(1);
}
const clientiEsistenti = await amm.deve('GET', '/clienti?archiviati=1');
if (clientiEsistenti.length) {
  if (!flag('--azzera')) {
    console.error(`L'archivio contiene già ${clientiEsistenti.length} clienti. Rilancia con --azzera per eliminarlo (viene fatto un backup di sicurezza) o svuotalo da Impostazioni → Elimina archivio.`);
    process.exit(1);
  }
  const el = await amm.deve('POST', '/backup/elimina-archivio', { conferma: 'ELIMINA' });
  nota(`archivio eliminato (${el.totale ?? '?'} righe, backup di sicurezza ${el.backupPreEliminazione ?? ''})`);
}

passo('Impostazioni dello studio: AI, province a rischio contante, registro TE');
await amm.deve('POST', '/ai/abilita', { abilita: true, accetto: true });
nota('assistente AI abilitato');
await amm.deve('POST', '/studio/province-contante', {
  province: [{ sigla: 'PD', livello: 'ALTO' }, { sigla: 'NA', livello: 'ALTO' }, { sigla: 'GE', livello: 'MEDIO_ALTO' }, { sigla: 'CT', livello: 'MEDIO_ALTO' }],
  fonte: 'Lettura della mappa ANR 2024 (Fig. 3) da parte dello studio — dati di collaudo',
  dataFonte: '2024-11-01',
});
nota('tabella delle province: PD, NA alto; GE, CT medio-alto');
await amm.deve('POST', '/studio/registro-accreditamento', { data: giorniFa(400) });
nota('accreditamento al registro dei titolari effettivi registrato');

passo('Le persone dello studio');
const utentiAttuali = await amm.deve('GET', '/utenti');
async function utente(dati) {
  const c = utentiAttuali.find((u) => u.email === dati.email);
  if (c) { nota(`${dati.nome}: già presente`); return { id: c.id, passwordTemporanea: null }; }
  const r = await amm.deve('POST', '/utenti', dati, null, [201]);
  nota(`${dati.nome} creato (${dati.ruolo})`);
  return r;
}
const associato = await utente({ email: 'associato.collaudo@contify.it', nome: 'Lavinia Torresan', ruolo: 'TITOLARE', amministratore: false, codiceFiscale: codiceFiscale('Torresan', 'Lavinia', '1982-05-14', 'F', 'G224'), ordine: 'ODCEC di Padova', numeroIscrizione: 'A-2871', qualifica: 'Dott.ssa' });
const collaboratrice = await utente({ email: 'collaboratrice.collaudo@contify.it', nome: 'Serena Pizzolato', ruolo: 'COLLABORATORE' });
// L'associata entra con la sua sessione: firma i suoi fascicoli col suo nome.
const ass = new Sessione('associata');
{
  let l = await ass.req('POST', '/auth/login', { email: 'associato.collaudo@contify.it', password: PASSWORD_ASSOCIATO });
  if (l.stato !== 200 && associato.passwordTemporanea) {
    l = await ass.req('POST', '/auth/login', { email: 'associato.collaudo@contify.it', password: associato.passwordTemporanea });
    if (l.stato === 200) { await ass.deve('POST', '/auth/cambia-password', { attuale: associato.passwordTemporanea, nuova: PASSWORD_ASSOCIATO }); nota('password dell\'associata impostata'); }
  }
  if (l.stato !== 200) {
    // Utente sopravvissuto a un'esecuzione precedente con altra password: reset dalla console amministrativa.
    const rp = await amm.deve('POST', `/utenti/${associato.id}/reset-password`, {});
    await ass.deve('POST', '/auth/login', { email: 'associato.collaudo@contify.it', password: rp.passwordTemporanea });
    await ass.deve('POST', '/auth/cambia-password', { attuale: rp.passwordTemporanea, nuova: PASSWORD_ASSOCIATO });
    nota('password dell\'associata reimpostata');
  }
}
const professionisti = await amm.deve('GET', '/studio/professionisti');
const idTitolare = io.utente.id;
const idAssociata = associato.id;
nota(`professionisti attivi: ${professionisti.filter((p) => p.attivo).map((p) => p.nome).join(', ')}`);

passo('Società dalle visure camerali (compagine, titolarità, screening, PDF)');
const clienti = {}; // denominazione → { id, tipo, proposta, esecutore }
for (const v of VISURE) {
  const vis = fixture(v.file);
  // Le fixture sintetiche hanno P.IVA non valide: si sostituiscono. Quelle della
  // catena vera (già anonimizzate con P.IVA valide) restano com'è: i CF dei soci
  // devono coincidere con quelli dei clienti perché la catena si risolva.
  if (v.seme) { vis.partitaIva = partitaIva(v.seme); vis.codiceFiscale = vis.partitaIva; }
  else if (v.file === 'impresa-individuale.txt') { vis.codiceFiscale = codiceFiscale('Esposito', 'Maria', '1975-11-22', 'F', 'B563'); vis.partitaIva = partitaIva(4102035); }
  const professionistaId = /holding|quattro/.test(v.file) ? idAssociata : idTitolare;
  const r = await amm.deve('POST', '/clienti/da-visura', corpoDaVisura(vis, { anagrafica: { professionistaId } }), null, [201]);
  const id = r.id;
  clienti[vis.denominazione] = { id, tipo: vis.tipoProposto, visura: vis, proposta: r.proposta, professionistaId };
  const alert = (r.proposta?.alert ?? []).map((a) => a.codice).join(',') || 'nessuno';
  nota(`${vis.denominazione}: cliente ${id}, ${vis.soci.length} soci, ${vis.cariche.length} cariche, alert ${alert}, screening ${JSON.stringify(r.screening ?? null)}`);
  // Il PDF della visura in conservazione.
  const pdf = v.pdf ? new Blob([fs.readFileSync(path.join(qui, '..', 'tests', 'fixtures', 'visure', v.pdf))], { type: 'application/pdf' }) : pdfMinimo(`Visura camerale ${vis.denominazione} estratta il ${vis.dataEstrazione} - documento di collaudo`);
  await amm.deve('POST', `/clienti/${id}/documenti`, null, formDocumento(pdf, `visura-${id}.pdf`, 'VISURA', vis.dataEstrazione), [200, 201]);
  // Titolarità effettiva: il professionista rivede la proposta.
  const comp = await amm.deve('GET', `/clienti/${id}/compagine`);
  const prop = comp.proposte?.find((p) => p.ambito === 'TITOLARITA' && p.stato === 'PROPOSTA');
  const socioCf = (den) => vis.soci.find((s) => s.nome === den)?.codiceFiscale ?? null;
  const titolariProposti = (r.proposta?.analisi?.titolari ?? []).map((t) => ({ nominativo: t.denominazione, codiceFiscale: socioCf(t.denominazione), criterio: t.criterio, norma: t.norma, quota: t.quotaEffettiva ?? null, percorsi: t.percorsi ?? [], motivazione: t.motivazione, pep: false }));
  const sess = professionistaId === idAssociata ? ass : amm;
  if (v.titolarita === 'APPLICA' && prop && titolariProposti.length) {
    await sess.deve('POST', `/clienti/${id}/titolarita`, { propostaId: prop.id, titolari: titolariProposti, registroConsultato: true, registroData: giorniFa(20) });
    await sess.deve('POST', `/clienti/${id}/titolarita/registro`, { data: giorniFa(20), incongruenza: false, note: 'Registro consultato: coincide con la visura.' });
    nota('  titolarità confermata come proposta (APPLICATA), registro TE consultato');
  } else if (v.titolarita === 'MODIFICA' && prop) {
    const t = titolariProposti.length ? titolariProposti : [{ nominativo: vis.soci[0].nome, codiceFiscale: vis.soci[0].codiceFiscale, criterio: 'PROPRIETA_INDIRETTA', norma: 'art. 20 co. 2 lett. a) DLgs. 231/2007', quota: 0.6, percorsi: [], motivazione: 'Catena risalita con la visura della holding.', pep: false }];
    t.push({ nominativo: 'CORNARO BENEDETTA', codiceFiscale: codiceFiscale('Cornaro', 'Benedetta', '1966-10-02', 'F', 'F205'), criterio: 'PROPRIETA_INDIRETTA', norma: 'art. 20 co. 2 lett. a) DLgs. 231/2007', quota: 0.6, percorsi: [], motivazione: 'Socia unica della holding ALFA HOLDING SRL (60% di BETA INDUSTRIE): quota indiretta del 60%, dalla visura della holding del ' + giorniFa(30) + '.', pep: false });
    await sess.deve('POST', `/clienti/${id}/titolarita`, { propostaId: prop.id, propostaModificata: true, propostaMotivazione: 'La proposta si fermava alla holding: risalita la catena con la visura di ALFA HOLDING SRL, socia unica CORNARO BENEDETTA.', titolari: t, registroConsultato: false });
    nota('  titolarità MODIFICATA: catena risalita oltre la holding, con motivazione');
  } else if (v.titolarita === 'RESIDUALE' && prop) {
    const a3 = (r.proposta?.alert ?? []).find((a) => a.codice === 'A3');
    const carica = vis.cariche.find((c) => c.rappresentanzaLegale) ?? vis.cariche[0];
    const bozza = a3?.azione?.bozzaMotivazione ?? `Nessun socio detiene una partecipazione superiore al 25% né esercita il controllo; ai sensi dell'art. 20 co. 5 si individua il titolare effettivo nella persona titolare di poteri di rappresentanza legale (${carica?.carica ?? 'carica'}), come da visura del ${vis.dataEstrazione}.`;
    await sess.deve('POST', `/clienti/${id}/titolarita`, { propostaId: prop.id, titolari: [{ nominativo: carica.nome, codiceFiscale: carica.codiceFiscale ?? null, criterio: 'RESIDUALE_POTERI', norma: 'art. 20 co. 5 DLgs. 231/2007', quota: null, percorsi: [], motivazione: bozza, pep: false }] });
    nota(`  titolarità col criterio residuale (art. 20 co. 5): ${carica.nome}`);
  } else if (v.titolarita === 'SCARTA' && prop) {
    await sess.deve('POST', `/proposte/${prop.id}/esito`, { stato: 'SCARTATA', motivazione: 'Società in liquidazione con socia fiduciaria e socio estero senza codice fiscale: la proposta non è utilizzabile finché la fiduciaria non comunica i fiducianti (richiesta inviata il ' + giorniFa(10) + ').' });
    nota('  proposta di titolarità SCARTATA con motivazione (fiduciaria, estero, liquidazione)');
  } else {
    nota('  nessuna proposta di titolarità da rivedere');
  }
}

passo('Clienti inseriti a mano');
for (const [i, c] of CLIENTI_MANUALI.entries()) {
  const professionistaId = i % 3 === 2 ? idAssociata : idTitolare;
  const r = await amm.deve('POST', '/clienti', { ...c, professionistaId }, null, [201]);
  clienti[c.denominazione] = { id: r.id, tipo: c.tipo, professionistaId };
  if (c.tipo === 'PERSONA_FISICA') {
    await amm.deve('POST', `/clienti/${r.id}/documenti`, null, formDocumento(pdfMinimo(`Copia carta d'identita ${c.denominazione} - documento di collaudo`), `identita-${r.id}.pdf`, 'DOCUMENTO_IDENTITA', giorniFa(90 + i * 7)), [200, 201]);
  }
  nota(`${c.denominazione} (${c.tipo})${c.pep ? ' — PEP' : ''}${c.paeseResidenza !== 'IT' ? ` — residente ${c.paeseResidenza}` : ''}`);
}
// Titolari effettivi dichiarati per le società inserite a mano (senza visura: fonte dichiarazione).
const teManuali = {
  'Fonderie Valbrenta Srl': [{ nominativo: 'RIGONI ALDEBRANDO', codiceFiscale: codiceFiscale('Rigoni', 'Aldebrando', '1957-01-25', 'M', 'L840'), criterio: 'PROPRIETA_DIRETTA', norma: 'art. 20 co. 2 lett. a) DLgs. 231/2007', quota: 0.55, percorsi: [], motivazione: 'Quota del 55% dichiarata dal cliente (dichiarazione art. 22 del ' + giorniFa(200) + ').', pep: false }, { nominativo: 'RIGONI CLELIA', codiceFiscale: codiceFiscale('Rigoni', 'Clelia', '1985-08-16', 'F', 'L840'), criterio: 'PROPRIETA_DIRETTA', norma: 'art. 20 co. 2 lett. a) DLgs. 231/2007', quota: 0.45, percorsi: [], motivazione: 'Quota del 45% dichiarata dal cliente.', pep: false }],
  'Compro Oro Adige Snc di Fantinel & C.': [{ nominativo: 'FANTINEL GEDEONE', codiceFiscale: codiceFiscale('Fantinel', 'Gedeone', '1971-06-06', 'M', 'L781'), criterio: 'PROPRIETA_DIRETTA', norma: 'art. 20 co. 2 lett. a) DLgs. 231/2007', quota: 0.5, percorsi: [], motivazione: 'Socio accomandatario al 50%.', pep: false }, { nominativo: 'FANTINEL ARMIDA', codiceFiscale: codiceFiscale('Fantinel', 'Armida', '1974-02-28', 'F', 'L781'), criterio: 'PROPRIETA_DIRETTA', norma: 'art. 20 co. 2 lett. a) DLgs. 231/2007', quota: 0.5, percorsi: [], motivazione: 'Socia al 50%.', pep: false }],
  'Cripto Nord Srl': [{ nominativo: 'OLIVOTTO DEMETRIO', codiceFiscale: codiceFiscale('Olivotto', 'Demetrio', '1990-09-12', 'M', 'F205'), criterio: 'CONTROLLO', norma: 'art. 20 co. 3 DLgs. 231/2007', quota: 0.2, percorsi: [], motivazione: 'Detiene il 20% ma controlla la società in forza di un patto parasociale che gli attribuisce la maggioranza dei voti (art. 20 co. 3 lett. b).', pep: false }],
  'Sala Giochi La Lanterna Srl': [{ nominativo: 'MASCARDI SATURNINO', codiceFiscale: codiceFiscale('Mascardi', 'Saturnino', '1963-04-04', 'M', 'D969'), criterio: 'RESIDUALE_POTERI', norma: 'art. 20 co. 5 DLgs. 231/2007', quota: null, percorsi: [], motivazione: 'Quattro soci al 25% senza patti: nessuno supera la soglia né controlla; amministratore unico con poteri di rappresentanza legale (art. 20 co. 5).', pep: false }],
};
for (const [den, titolari] of Object.entries(teManuali)) {
  const c = clienti[den];
  const sess = c.professionistaId === idAssociata ? ass : amm;
  await sess.deve('POST', `/clienti/${c.id}/titolarita`, { titolari, registroConsultato: den !== 'Cripto Nord Srl', registroData: den !== 'Cripto Nord Srl' ? giorniFa(15) : null });
  nota(`titolari effettivi di ${den}: ${titolari.map((t) => t.nominativo).join(', ')}`);
}

passo('Prestazioni (fascicoli) e valutazioni del rischio');
const B = (n) => ({ tipologia: n, modalita_svolgimento: n, ammontare: n, frequenza_durata: n, ragionevolezza: n, area_geografica_destinazione: n });
const A = (n) => ({ natura_giuridica: n, prevalente_attivita: n, comportamento: n, area_geografica_cliente: n });
/**
 * Ogni voce: cliente, prestazione, giorni fa del conferimento, come chiudere:
 *  - proposta: 'APPLICA' usa i punteggi proposti (A.3 completato), 'MODIFICA' si scosta con motivazione, null = punteggi a mano;
 *  - firma: 'TITOLARE' | 'ASSOCIATA' | 'SOSTITUZIONE' (il titolare firma un fascicolo dell'associata) | null (resta in verifica);
 *  - valutazione: false = fascicolo appena aperto.
 */
const FASCICOLI = [
  { cliente: 'ESEMPIO SRL', prestazione: 'CONSULENZA_TRIBUTARIA', giorni: 30, proposta: 'APPLICA', A3: 1, tabellaB: B(1), firma: 'TITOLARE', esecutore: true, operazioni: [{ giorni: 20, descrizione: 'Acconto onorari', importo: 1500, mezzoPagamento: 'BONIFICO' }] },
  { cliente: 'ESEMPIO SRL', prestazione: 'TENUTA_CONTABILITA', giorni: 10, proposta: 'APPLICA', A3: 1, tabellaB: B(2), firma: null, esecutore: true },
  { cliente: 'BETA INDUSTRIE SRL', prestazione: 'FINANZA_STRAORDINARIA', giorni: 45, proposta: 'MODIFICA', modifica: { natura_giuridica: 3 }, motivazione: 'Holding con usufrutto scisso sulle quote e CdA a tre: la struttura è più articolata di quanto la sola ripartizione lasci vedere.', A3: 2, tabellaB: B(3), firma: 'ASSOCIATA', esecutore: true, circostanze: { assettoProprietarioComplesso: true } },
  { cliente: 'GAMMA FAMILY SRL', prestazione: 'CONSULENZA_BILANCIO', giorni: 800, proposta: 'APPLICA', A3: 2, tabellaB: B(2), firma: 'SOSTITUZIONE', esecutore: true },
  { cliente: 'OMEGA SPA', prestazione: 'COLLEGIO_SINDACALE', giorni: 1100, proposta: 'APPLICA', A3: 1, tabellaB: B(2), firma: 'TITOLARE', esecutore: true },
  { cliente: 'THETA SRL IN LIQUIDAZIONE', prestazione: 'CONSULENZA_ECONOMICO_FINANZIARIA', giorni: 60, proposta: null, tabellaA: A(4), tabellaB: B(4), circostanze: { entitaPaeseAltoRischio: true, assettoProprietarioComplesso: true, sospettoRiciclaggio: true }, firma: 'TITOLARE', esecutore: true, sos: true, operazioni: [{ giorni: 40, descrizione: 'Versamento in contante a saldo di un debito verso la società', importo: 7000, mezzoPagamento: 'CONTANTE', controparte: 'KAPPA TRADING LTD' }] },
  { cliente: 'ESPOSITO MARIA', prestazione: 'DICHIARAZIONI_FISCALI', giorni: 120, valutazione: false },
  { cliente: 'Brandolisio Ottavia', prestazione: 'CONSULENZA_TRIBUTARIA', giorni: 700, tabellaA: A(2), tabellaB: B(2), circostanze: { pep: true }, firma: 'TITOLARE', modalita: 'PRESENZA' },
  { cliente: 'Zamperetti Corrado', prestazione: 'ASSISTENZA_CONTINUATIVA', giorni: 5, valutazione: false, verificaRemota: 'APERTA', modalita: 'IDENTITA_DIGITALE' },
  { cliente: 'Quaglierini Ilenia', prestazione: 'DICHIARAZIONI_FISCALI', giorni: 200, valutazione: false },
  { cliente: 'Vendramel Tullio', prestazione: 'CONSULENZA_CONTRATTUALE', giorni: 90, tabellaA: { natura_giuridica: 1, prevalente_attivita: 2, comportamento: 2, area_geografica_cliente: 4 }, tabellaB: B(2), circostanze: { paeseTerzoAltoRischio: true }, firma: 'TITOLARE' },
  { cliente: 'Marangoni Ubaldo', prestazione: 'TENUTA_CONTABILITA', giorni: 1300, tabellaA: { natura_giuridica: 1, prevalente_attivita: 2, comportamento: 1, area_geografica_cliente: 1 }, tabellaB: B(1), firma: 'TITOLARE', operazioni: [{ giorni: 900, descrizione: 'Pagamento onorari in contante', importo: 1800, mezzoPagamento: 'CONTANTE' }] },
  { cliente: 'Toniolo Bressan Evaristo', prestazione: 'CONSULENZA_TRIBUTARIA', giorni: 15, tabellaA: A(1), tabellaB: B(1), firma: 'ASSOCIATA' },
  { cliente: 'Fonderie Valbrenta Srl', prestazione: 'REVISIONE_LEGALE', giorni: 720, tabellaA: A(2), tabellaB: B(2), firma: 'TITOLARE' },
  { cliente: 'Girasole Società Semplice Agricola', prestazione: 'TENUTA_CONTABILITA', giorni: 400, tabellaA: A(1), tabellaB: B(1), firma: 'TITOLARE' },
  { cliente: 'Associazione Culturale Il Faro di Brondolo', prestazione: 'CONSULENZA_TRIBUTARIA', giorni: 250, tabellaA: A(2), tabellaB: B(1), firma: null, modalita: 'ATTO_PUBBLICO' },
  { cliente: 'Trust Aurora Boreale', prestazione: 'AMMINISTRAZIONE_TRUST', giorni: 75, tabellaA: { natura_giuridica: 4, prevalente_attivita: 3, comportamento: 4, area_geografica_cliente: 2 }, tabellaB: B(3), circostanze: { assettoProprietarioComplesso: true, impossibilitaVerifica: true }, firma: null, astensione: true },
  { cliente: 'Compro Oro Adige Snc di Fantinel & C.', prestazione: 'TENUTA_CONTABILITA', giorni: 500, tabellaA: { natura_giuridica: 2, prevalente_attivita: 4, comportamento: 2, area_geografica_cliente: 2 }, tabellaB: B(3), circostanze: { elevatoUsoContante: true }, firma: 'TITOLARE', operazioni: [{ giorni: 30, descrizione: 'Acquisto oro usato da privato', importo: 4800, mezzoPagamento: 'CONTANTE', controparte: 'privato' }] },
  { cliente: 'Sala Giochi La Lanterna Srl', prestazione: 'COSTITUZIONE_ENTI_TRUST', giorni: 250, tabellaA: { natura_giuridica: 2, prevalente_attivita: 4, comportamento: 2, area_geografica_cliente: 3 }, tabellaB: B(2), firma: 'TITOLARE' },
  { cliente: 'Cripto Nord Srl', prestazione: 'BUSINESS_PLAN', giorni: 35, tabellaA: { natura_giuridica: 2, prevalente_attivita: 4, comportamento: 3, area_geografica_cliente: 2 }, tabellaB: B(3), circostanze: { elevatoUsoContante: false }, firma: 'ASSOCIATA', verificaRemota: 'COMPLETATA' },
  { cliente: 'Sgarbossa Nives', prestazione: 'DICHIARAZIONI_FISCALI', giorni: 3, valutazione: false },
  { cliente: 'AURIGA FORMAZIONE S.R.L.', prestazione: 'TENUTA_CONTABILITA', giorni: 20, proposta: 'APPLICA', A3: 1, tabellaB: B(2), firma: 'TITOLARE', esecutore: true },
  { cliente: 'SEI SIGMA ITALIA S.R.L.', prestazione: 'CONSULENZA_TRIBUTARIA', giorni: 8, valutazione: false, esecutore: true },
];
const fascicoli = [];
let sosFascicolo = null, astensioneFascicolo = null, vrAperta = null, vrCompletata = null;
for (const f of FASCICOLI) {
  const c = clienti[f.cliente];
  if (!c) throw new Error(`cliente ${f.cliente} non trovato`);
  const sess = c.professionistaId === idAssociata ? ass : amm;
  const corpo = {
    clienteId: c.id, prestazioneCodice: f.prestazione, tipoRapporto: f.giorni > 100 ? 'CONTINUATIVO' : 'OCCASIONALE',
    dataConferimento: giorniFa(f.giorni), dataIdentificazione: giorniFa(f.giorni), modalitaIdentificazione: f.modalita ?? 'PRESENZA',
    scopoNatura: `${f.prestazione.replace(/_/g, ' ').toLowerCase()} per ${f.cliente} — incarico di collaudo`,
    professionistaId: c.professionistaId, identificatoDa: c.professionistaId,
  };
  if (f.giorni <= 100 && /FINANZA|CONTRATTUALE|BUSINESS/.test(f.prestazione)) corpo.importoOperazione = 180000;
  if (f.esecutore) {
    const fp = await amm.deve('GET', `/clienti/${c.id}/fascicolo-proposto`);
    if (fp.esecutore?.nominativo) corpo.esecutore = { nominativo: fp.esecutore.nominativo, codiceFiscale: fp.esecutore.codiceFiscale, carica: fp.esecutore.carica, caricaTesto: fp.esecutore.caricaTesto, fonte: fp.esecutore.fonte, daProposta: true };
  }
  const r = await sess.deve('POST', '/fascicoli', corpo, null, [201]);
  const fid = r.id;
  fascicoli.push({ ...f, id: fid, codice: r.codice, clienteId: c.id, professionistaId: c.professionistaId });
  let riga = `${r.codice} ${f.cliente} — ${f.prestazione}`;
  if (f.valutazione === false) { nota(riga + ' (aperto, da valutare)'); }
  else {
    let tabellaA = f.tabellaA, proposta;
    if (f.proposta) {
      const pr = await sess.deve('GET', `/fascicoli/${fid}/proposta`);
      const punteggi = Object.fromEntries(Object.values(pr.tabellaA).map((x) => [x.codice, x.punteggio]));
      tabellaA = { ...punteggi, comportamento: f.A3 ?? 1 };
      for (const k of Object.keys(tabellaA)) if (tabellaA[k] == null) tabellaA[k] = 2;
      proposta = { id: pr.propostaRischioId, punteggi, provenienza: pr.provenienza };
      if (f.proposta === 'MODIFICA') { Object.assign(tabellaA, f.modifica); proposta.motivazioneScostamento = f.motivazione; }
    }
    const val = await sess.deve('POST', `/fascicoli/${fid}/valutazioni`, { tabellaA, tabellaB: f.tabellaB, circostanze: f.circostanze ?? {}, dataValutazione: giorniFa(Math.max(f.giorni - 3, 0)), proposta }, null, [201]);
    riga += ` → ${val.esito.etichettaClasse ?? val.esito.classe}, verifica ${val.esito.livelloApplicabile}${val.esito.livelloInnalzatoDaNorma ? ' (innalzata dalla norma)' : ''}`;
    if (f.firma === 'TITOLARE' || f.firma === 'ASSOCIATA') {
      // Firma il professionista a cui la prestazione è intestata, col suo accesso.
      await sess.deve('POST', `/fascicoli/${fid}/valutazioni/${val.id}/firma`, {});
      riga += `, firmata (${c.professionistaId === idAssociata ? 'associata' : 'titolare'})`;
    } else if (f.firma === 'SOSTITUZIONE') {
      await amm.deve('POST', `/fascicoli/${fid}/valutazioni/${val.id}/firma`, { motivazioneFirma: 'Firma in sostituzione della collega Torresan, assente per congedo: valutazione condivisa telefonicamente.' });
      riga += ', firmata in sostituzione con motivazione';
    }
    if (f.astensione) {
      await amm.deve('POST', `/fascicoli/${fid}/astensione`, { fondamento: 'ART_42_CO_1', motivazione: 'Il trustee non ha fornito l\'atto istitutivo né i nominativi di disponente e beneficiari entro il termine assegnato: impossibile completare l\'adeguata verifica (art. 42 co. 1). Valutata la segnalazione ex art. 35: non ricorrono al momento elementi di sospetto oltre la reticenza.', dataDecisione: giorniFa(f.giorni - 30), sosValutata: true }, null, [201]);
      astensioneFascicolo = fid; riga += ', ASTENSIONE';
    }
    nota(riga);
  }
  for (const op of f.operazioni ?? []) {
    const o = await sess.deve('POST', `/fascicoli/${fid}/operazioni`, { dataOperazione: giorniFa(op.giorni), descrizione: op.descrizione, importo: op.importo, mezzoPagamento: op.mezzoPagamento, controparte: op.controparte ?? null, intermediarioParte: false }, null, [201]);
    nota(`  operazione ${op.importo} € ${op.mezzoPagamento}${o.esitoContante && o.esitoContante.conforme === false ? ' — OLTRE SOGLIA art. 49 (comunicazione MEF entro ' + (o.scadenzaComunicazioneMef?.data ?? '30 gg') + ')' : ''}`);
  }
  if (f.sos) sosFascicolo = { fid, clienteId: c.id };
  if (f.verificaRemota === 'APERTA') vrAperta = { fid, clienteId: c.id, cliente: f.cliente };
  if (f.verificaRemota === 'COMPLETATA') vrCompletata = { fid, clienteId: c.id, cliente: f.cliente, sess };
}

passo('Segnalazioni di operazioni sospette');
{
  const s1 = await amm.deve('POST', '/sos', {
    fascicoloId: sosFascicolo.fid, clienteId: sosFascicolo.clienteId, dataRilevazione: giorniFa(38), canale: 'UIF_DIRETTA',
    descrizioneOperazione: 'Nel corso della liquidazione la società ha ricevuto da KAPPA TRADING LTD (Estonia) un versamento in contante di 7.000 euro a saldo di un credito mai iscritto nei bilanci precedenti; il liquidatore non è in grado di indicarne la causa.',
    motiviSospetto: 'Operazione in contante oltre soglia, controparte estera in paese terzo ad alto rischio, credito privo di giustificazione documentale, società in liquidazione con socia fiduciaria che non comunica i fiducianti.',
    soggetti: [{ nominativo: 'KAPPA TRADING LTD', ruolo: 'controparte' }], elementiRaccolti: 'Estratto conto, verbale di assemblea dei soci, corrispondenza col liquidatore.', operazioneEseguita: true, motivoEsecuzione: 'Operazione già avvenuta al momento della rilevazione.',
    indicatori: [1, 9, 13, 20],
  }, null, [201]);
  nota(`${s1.protocollo} in bozza (THETA SRL IN LIQUIDAZIONE)`);
  const fComproOro = fascicoli.find((f) => f.cliente.startsWith('Compro Oro'));
  const s2 = await amm.deve('POST', '/sos', {
    fascicoloId: fComproOro.id, clienteId: fComproOro.clienteId, dataRilevazione: giorniFa(140), canale: 'UIF_DIRETTA',
    descrizioneOperazione: 'Acquisti ripetuti di oro usato dallo stesso privato, sempre per importi appena sotto la soglia del contante, per un totale di 38.000 euro in quattro mesi.',
    motiviSospetto: 'Frazionamento artificioso, incoerenza tra il profilo del venditore (studente) e il valore conferito, compro oro con registro delle operazioni incompleto.',
    soggetti: [], elementiRaccolti: 'Registro delle operazioni del compro oro, copie dei documenti del venditore.', operazioneEseguita: true, motivoEsecuzione: 'Operazioni rilevate a posteriori dalla contabilità.', indicatori: [13, 14],
  }, null, [201]);
  await amm.deve('POST', `/sos/${s2.id}/stato`, { stato: 'TRASMESSA', dataTrasmissione: giorniFa(130) });
  nota(`${s2.protocollo} trasmessa (Compro Oro Adige)`);
}

passo('Verifica a distanza: una richiesta aperta e una completata dal cliente con la dichiarazione art. 22');
{
  const a = await amm.deve('POST', `/fascicoli/${vrAperta.fid}/verifica-remota`, { richieste: { datiIdentificativi: true, documento: true, pep: true }, emailCliente: 'cliente.collaudo@example.org' }, null, [201]);
  nota(`richiesta a ${vrAperta.cliente} in attesa (scade ${a.scadeIl}) — link: ${a.url}`);
  // Cripto Nord non ha compagine da visura: chiediamo dati, documento, PEP e titolari liberi.
  const b = await vrCompletata.sess.deve('POST', `/fascicoli/${vrCompletata.fid}/verifica-remota`, { richieste: { datiIdentificativi: true, documento: true, pep: true, titolari: true } }, null, [201]);
  const token = b.url.split('token=')[1];
  const fd = new FormData();
  fd.set('dati', JSON.stringify({
    dichiarazione: { accettata: true, nomeDichiarante: 'Demetrio Olivotto' },
    datiIdentificativi: { nome: 'Demetrio', cognome: 'Olivotto', dataNascita: '1990-09-12', luogoNascita: 'Milano (MI)', residenza: 'Via Torino 61, 20123 Milano (MI)', documentoTipo: 'PASSAPORTO', documentoNumero: 'YA7712340', documentoScadenza: '2032-01-10' },
    pep: { dichiarato: false },
    titolari: [{ nominativo: 'OLIVOTTO DEMETRIO', codiceFiscale: codiceFiscale('Olivotto', 'Demetrio', '1990-09-12', 'M', 'F205'), quota: '20', note: 'controllo per patto parasociale' }],
  }));
  fd.set('documento0', pdfMinimo('Passaporto Demetrio Olivotto - documento di collaudo'), 'passaporto.pdf');
  await new Sessione('cliente').deve('POST', `/pubblico/verifica/${token}`, null, fd, [200], { senzaCookie: true });
  const lista = await vrCompletata.sess.deve('GET', `/fascicoli/${vrCompletata.fid}/verifiche-remote`);
  const rid = lista.find((x) => x.stato === 'COMPLETATA')?.id;
  const acq = await vrCompletata.sess.deve('POST', `/verifiche-remote/${rid}/acquisisci`, { applicaDatiIdentificativi: true, applicaPep: true, acquisisciDocumenti: true });
  nota(`${vrCompletata.cliente}: risposta acquisita (${(acq.applicato ?? []).join(', ')})`);
  // ESEMPIO SRL: dichiarazione art. 22 precompilata dalla compagine, confermata dal cliente e acquisita nel fascicolo.
  const fEs = fascicoli.find((f) => f.cliente === 'ESEMPIO SRL');
  const c = await amm.deve('POST', `/fascicoli/${fEs.id}/verifica-remota`, { richieste: { datiIdentificativi: false, documento: false, dichiarazioneTe: true } }, null, [201]);
  const tok2 = c.url.split('token=')[1];
  const pub = await new Sessione('cliente').deve('GET', `/pubblico/verifica/${tok2}`, null, null, [200], { senzaCookie: true });
  const pre = pub.dichiarazioneTe;
  const soggetti = [...(pre.titolariProposti ?? []).map((t) => t.nominativo), pre.esecutore?.nominativo].filter((x, i, a) => x && a.indexOf(x) === i);
  const fd2 = new FormData();
  fd2.set('dati', JSON.stringify({
    dichiarazione: { accettata: true, nomeDichiarante: pre.esecutore?.nominativo ?? 'ESPOSITO MARIA' },
    dichiarazioneTe: { conferma: 'CONFERMA', risposte: (pre.domande ?? []).map((d) => ({ domanda: d, risposta: 'NO' })), pep: soggetti.map((n) => ({ nominativo: n, ruolo: 'TITOLARE_EFFETTIVO', pep: false })) },
  }));
  await new Sessione('cliente').deve('POST', `/pubblico/verifica/${tok2}`, null, fd2, [200], { senzaCookie: true });
  const l2 = await amm.deve('GET', `/fascicoli/${fEs.id}/verifiche-remote`);
  const rid2 = l2.find((x) => x.stato === 'COMPLETATA')?.id;
  const acq2 = await amm.deve('POST', `/verifiche-remote/${rid2}/acquisisci`, { acquisisciDichiarazione: true });
  nota(`ESEMPIO SRL: dichiarazione art. 22 confermata dal cliente e acquisita (${(acq2.applicato ?? []).join(', ')})`);
}

passo('Screening delle liste: una decisione motivata, se ci sono corrispondenze');
{
  const scr = await amm.req('GET', '/screening');
  const daEsaminare = (Array.isArray(scr.dati) ? scr.dati : scr.dati?.esiti ?? []).filter((e) => e.stato === 'DA_ESAMINARE');
  if (daEsaminare.length) {
    const e = daEsaminare[0];
    await amm.deve('POST', `/screening/${e.id}`, { stato: 'ESCLUSO', nota: 'Omonimia: data e luogo di nascita non coincidono con la voce di lista.' });
    nota(`${daEsaminare.length} corrispondenze da esaminare, una esclusa con motivazione (le altre restano da esaminare)`);
  } else nota('nessuna corrispondenza con le liste (in locale le fixture non ne producono)');
}

passo('AR-M19: controllo costante eseguito, un rapporto cessato, formazione registrata');
{
  // Il controllo costante di OMEGA SPA (incarico di tre anni fa) è stato fatto: nulla di nuovo.
  const omega = fascicoli.find((f) => f.cliente === 'OMEGA SPA');
  if (omega) await amm.deve('POST', `/fascicoli/${omega.id}/controllo-costante`, { esito: 'INVARIATO', verifiche: ['ANAGRAFICA', 'COMPAGINE', 'TITOLARI', 'LISTE'], note: 'Visura rinnovata e confrontata: compagine e collegio invariati.' }, null, [201]);
  // GAMMA FAMILY SRL: il controllo ha trovato un cambio di amministratore → da rivalutare.
  const gamma = fascicoli.find((f) => f.cliente === 'GAMMA FAMILY SRL');
  if (gamma) await amm.deve('POST', `/fascicoli/${gamma.id}/controllo-costante`, { esito: 'DA_RIVALUTARE', verifiche: ['COMPAGINE', 'TITOLARI'], note: 'Nominato un nuovo amministratore unico: la titolarità con criterio residuale va rivista.' }, null, [201]);
  // Marangoni: il rapporto è cessato da un anno (conservazione decennale in corso).
  const marangoni = fascicoli.find((f) => f.cliente === 'Marangoni Ubaldo');
  if (marangoni) await amm.deve('POST', `/fascicoli/${marangoni.id}/cessazione`, { dataCessazione: giorniFa(365), motivo: 'Cessazione dell’attività del cliente' });
  // Formazione dell'anno per tutto lo studio.
  const persone = await amm.deve('GET', '/studio/persone');
  await amm.deve('POST', '/studio/formazione', { titolo: 'Antiriciclaggio: regole tecniche e modulistica CNDCEC 2026', ente: 'ODCEC Padova', dataEvento: giorniFa(120), ore: 4, utentiIds: persone.map((p) => p.id) }, null, [201]);
  await amm.deve('POST', '/studio/formazione', { titolo: 'Titolare effettivo e registro: casi pratici', ente: 'CNDCEC (webinar)', dataEvento: giorniFa(40), ore: 2, utentiIds: persone.slice(0, 2).map((p) => p.id) }, null, [201]);
  nota('controlli costanti registrati (OMEGA invariato, GAMMA da rivalutare), Marangoni cessato, 2 eventi formativi');
}

passo('Autovalutazione dello studio, proposta dai dati e firmata');
{
  const ind = await amm.deve('GET', '/studio/indicatori');
  const i = ind.indicatori;
  const scegli = (lista, codice, fallback) => { const x = lista.find((y) => y.codice === codice); return x?.punteggio ?? fallback; };
  const inerente = { tipologia_clientela: scegli(i.inerente, 'tipologia_clientela', 2), area_geografica: scegli(i.inerente, 'area_geografica', 2), canali_distributivi: scegli(i.inerente, 'canali_distributivi', 2), servizi_offerti: scegli(i.inerente, 'servizi_offerti', 2) };
  const vulnerabilita = { formazione: 2, organizzazione_adeguata_verifica: scegli(i.vulnerabilita, 'organizzazione_adeguata_verifica', 2), organizzazione_conservazione: scegli(i.vulnerabilita, 'organizzazione_conservazione', 2), organizzazione_sos: scegli(i.vulnerabilita, 'organizzazione_sos', 2) };
  const motivazioniScostamento = { formazione: 'I professionisti hanno seguito nel 2026 i corsi antiriciclaggio dell\'ODCEC (attestati in archivio cartaceo), non ancora registrati nel programma.' };
  const av = await amm.deve('POST', '/studio/autovalutazioni', { inerente, vulnerabilita, motivazioniScostamento, dataValutazione: OGGI, note: 'Autovalutazione di collaudo: punteggi proposti dal portafoglio, scostamento motivato sulla formazione.', presidi: [] }, null, [201]);
  await amm.deve('POST', `/studio/autovalutazioni/${av.id}/firma`, {});
  nota(`versione ${av.versione}: rischio residuo ${av.esito.rischioResiduo} (${av.esito.classe}); indicatori significativi: ${i.significativo} (${i.fascicoliAttivi} prestazioni, ${i.clientiAttivi} clienti)`);
}

passo('Riepilogo');
{
  const cr = await amm.deve('GET', '/cruscotto');
  const sc = await amm.deve('GET', '/scadenzario');
  const au = await amm.deve('GET', '/audit/verifica');
  nota(`clienti ${Object.keys(clienti).length}, fascicoli ${fascicoli.length}; scadenzario: ${sc.scadute?.length ?? 0} scadute, ${sc.inScadenza?.length ?? 0} in scadenza, ${sc.future?.length ?? 0} future`);
  nota(`registro accessi integro: ${au.integro ?? au.ok ?? JSON.stringify(au).slice(0, 80)}`);
  if (cr && typeof cr === 'object') nota(`cruscotto: ${JSON.stringify(cr).slice(0, 300)}`);
  console.log(`\nFatto. Accessi:\n  ${EMAIL} (amministratore, la tua password)\n  associato.collaudo@contify.it / ${PASSWORD_ASSOCIATO} (professionista associata, Lavinia Torresan)\n  collaboratrice.collaudo@contify.it (Serena Pizzolato)${collaboratrice.passwordTemporanea ? ' / password temporanea ' + collaboratrice.passwordTemporanea : ' (password già impostata in un\'esecuzione precedente)'}`);
}
