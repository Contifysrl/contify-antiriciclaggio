/**
 * Contify Timesheet — sotto-programma montato su /api/ts (TS-M0: stato; TS-M1: tutto il resto).
 *
 * Passa dalla stessa catena di AR: autenticazione, poi controllo dei moduli
 * (lib/moduli.ts): qui arrivano solo utenti di uno studio con Timesheet e con
 * un ruolo Timesheet (o che amministrano lo studio). Lo stato del modulo
 * (sospeso = sola lettura) è già applicato da bloccoPerStato.
 *
 * Regole (SPEC-TS-M0-M1.md, M1.2):
 * - il server non si fida del browser: cliente, servizio, persona e
 *   registrazione devono appartenere allo studio; minuti interi 1–1440; data
 *   non futura; testo ≤ 1000, nota ≤ 500;
 * - finestra del collaboratore: crea, modifica ed elimina solo registrazioni
 *   la cui data non è più vecchia di N giorni (impostazione, predefinito 7);
 *   il titolare non ha finestra; nessuno tocca una registrazione con proforma;
 * - nel registro delle operazioni vanno modifiche ed eliminazioni di
 *   registrazioni, registrazioni a nome di altri, servizi e tariffe, clienti,
 *   alias, consenso AI, ore previste, impostazioni. NON la creazione ordinaria
 *   di ogni registrazione (la riga dice già chi, quando e da chi).
 */

import { Hono, type Context } from 'hono';
import type { Env, Variabili } from '../lib/tipi';
import { statoEffettivo } from '../lib/moduli';
import { statoValido } from '../lib/licenza';
import { scriviAudit } from '../lib/audit';
import { soloAmministratore } from '../lib/auth';
import { nuovoId } from '../lib/crypto';
import { cercaAnagrafica, limiteSuperato } from '../lib/lookup';
import { normalizzaPiva } from '../lib/lookup/piva';
import { creaXlsx } from '../lib/xlsx';
import { soloTitolareTs, titolareTs } from './permessi';
import {
  CONSENSO_VUOTO, LIMITE_INTERPRETAZIONI_GIORNO, LIMITE_SECONDI_AUDIO_GIORNO, MINUTI_GIORNO_SOSPETTI, VERSIONE_INFORMATIVA_TS,
  aiTsAttiva, assicuraClienteTs, assicuraServiziPredefiniti, cifraJson, cifraTesto, clienteTs, contaUsoAi, dataValida, elencoClientiTs,
  elencoPersone, elencoRegistrazioni, elencoServizi, minutiDelGiorno, oggiRoma, parametriTs, persona, registrazione,
  salvaRegistrazione, scriviParametriTs, scriviPersona, trovaDoppione, usoAiOggi,
  type ClienteTs, type DatiCliente, type Servizio,
} from './archivio';
import { calcolaRiepilogo, lunediDi } from './riepilogo';
import { completa, completaInSospeso, interpretaLocale, type Contesto, type Proposta } from './interpretazione';
import { interpretaConMotoreA, type ChiamaModello } from './motore-a';
import { giorniPrima } from './quando';

export const tsApp = new Hono<{ Bindings: Env; Variables: Variabili }>();

type Ctx = Context<{ Bindings: Env; Variables: Variabili }>;

export const MODELLO_INTERPRETAZIONE = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const MODELLO_TRASCRIZIONE = '@cf/openai/whisper-large-v3-turbo';
const AUDIO_MAX_BYTE = 1_500_000;
const AUDIO_MAX_SECONDI = 60;

// ── Utilità ─────────────────────────────────────────────────────

const testo = (v: unknown, max: number): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const intero = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null);

function errore(c: Ctx, messaggio: string, status: 400 | 403 | 404 | 409 | 413 | 429 = 400, extra: Record<string, unknown> = {}) {
  return c.json({ errore: messaggio, ...extra }, status);
}

const bindingAi = (c: Ctx): { run: (modello: string, input: Record<string, unknown>) => Promise<any> } | null => {
  const ai = c.env.AI as unknown as { run?: unknown } | undefined;
  return ai && typeof ai.run === 'function' ? (ai as any) : null;
};
const aiDisponibile = (c: Ctx) => Boolean(bindingAi(c)) || c.env.AI_FIXTURES === '1';

async function contestoStudio(c: Ctx): Promise<{ ctx: Contesto; clienti: ClienteTs[]; servizi: Servizio[] }> {
  const tenantId = c.get('tenantId');
  const moduli = c.get('moduli');
  const [clienti, servizi] = await Promise.all([
    elencoClientiTs(c.env, tenantId, { conAr: moduli.AR === 'attivo', soloAttivi: true }),
    elencoServizi(c.env.DB, tenantId, true),
  ]);
  const ctx: Contesto = {
    clienti: clienti.map((x) => ({ id: x.id, nome: x.nome, alias: x.alias, pf: x.personaFisica })),
    servizi: servizi.map((s) => ({ id: s.id, nome: s.nome, parole: s.paroleChiave, generico: s.generico })),
    oggi: oggiRoma(),
  };
  return { ctx, clienti, servizi };
}

/** Finestra del collaboratore: la data del lavoro non può essere più vecchia di N giorni. */
export function fuoriFinestra(u: { amministratore?: number; ts_ruolo?: string | null }, data: string, giorniIndietro: number, oggi: string): boolean {
  if (titolareTs(u)) return false;
  return data < giorniPrima(oggi, giorniIndietro);
}

/** Il trasporto verso il modello presso Cloudflare (binding `AI`), con le fixture per le prove. */
function chiamaModello(c: Ctx, locali: Proposta[]): ChiamaModello {
  if (c.env.AI_FIXTURES === '1') {
    return async () => ({
      testo: JSON.stringify({
        registrazioni: locali.map((p) => ({
          cliente: p.cliente.id ?? (p.cliente.candidati.length === 1 ? p.cliente.candidati[0].id : null),
          candidati_cliente: p.cliente.id ? [] : p.cliente.candidati.map((x) => x.id),
          servizio: p.servizio.id ?? (p.servizio.candidati.length === 1 ? p.servizio.candidati[0].id : null),
          candidati_servizio: p.servizio.id ? [] : p.servizio.candidati.map((x) => x.id),
          minuti: p.minuti, data: p.data, nota: p.nota,
        })),
      }),
      usoTokens: { fixture: true },
    });
  }
  return async (messaggi, schema) => {
    const ai = bindingAi(c);
    if (!ai) throw new Error('Il collegamento ai modelli non è configurato');
    const r = await ai.run(MODELLO_INTERPRETAZIONE, { messages: messaggi, max_tokens: 600, temperature: 0, response_format: { type: 'json_schema', json_schema: schema } });
    const out = r?.response;
    return { testo: typeof out === 'string' ? out : JSON.stringify(out ?? r), usoTokens: r?.usage ?? null };
  };
}

// ── Stato (TS-M0) ───────────────────────────────────────────────

/** Stato del modulo per l'utente corrente: serve al client e alle prove. */
tsApp.get('/stato', (c) => {
  const u = c.get('utente');
  const moduli = c.get('moduli');
  const stato = moduli.TS ? statoEffettivo(statoValido(c.get('tenantStato')), moduli.TS) : null;
  return c.json({ modulo: 'TS', stato, tsRuolo: u.ts_ruolo ?? null, amministratore: u.amministratore === 1 });
});

// ── Contesto ────────────────────────────────────────────────────

tsApp.get('/contesto', async (c) => {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  const titolare = titolareTs(u);
  const { clienti, servizi } = await contestoStudio(c);
  const p = await parametriTs(c.env.DB, tenantId);
  const oggi = oggiRoma();
  const uso = await usoAiOggi(c.env.DB, tenantId, u.id, oggi);
  const aiAttiva = aiTsAttiva(p);
  return c.json({
    oggi,
    ruolo: titolare ? 'TITOLARE' : 'COLLABORATORE',
    amministratore: u.amministratore === 1,
    clienti: clienti.map((x) => ({ id: x.id, nome: x.nome, personaFisica: x.personaFisica, alias: x.alias, daVerificare: x.daVerificare, collegatoAr: x.collegatoAr })),
    servizi: servizi.map((s) => ({ id: s.id, nome: s.nome, generico: s.generico, ...(titolare ? { tariffaOrariaCent: s.tariffaOrariaCent, paroleChiave: s.paroleChiave } : {}) })),
    ai: {
      abilitata: aiAttiva,
      voce: aiAttiva && p.ai.voce,
      disponibile: aiDisponibile(c),
      limiteInterpretazioniRaggiunto: uso.interpretazioni >= LIMITE_INTERPRETAZIONI_GIORNO,
      limiteAudioRaggiunto: uso.secondiAudio >= LIMITE_SECONDI_AUDIO_GIORNO,
    },
    impostazioni: { collaboratoriCreanoClienti: p.impostazioni.collaboratoriCreanoClienti, giorniIndietro: p.impostazioni.giorniIndietro },
    moduli: c.get('moduli'),
  });
});

// ── Interpretazione ─────────────────────────────────────────────

/** Ricostruisce le proposte in sospeso ricevute dal browser scartando ciò che non torna. */
export function proposteDalBrowser(v: unknown, ctx: Contesto): Proposta[] {
  if (!Array.isArray(v)) return [];
  const clienti = new Map(ctx.clienti.map((x) => [x.id, x.nome]));
  const servizi = new Map(ctx.servizi.map((x) => [x.id, x.nome]));
  const cand = (ids: unknown, mappa: Map<string, string>) =>
    (Array.isArray(ids) ? ids : [])
      .map((x: any) => (typeof x === 'string' ? x : x?.id))
      .filter((id: unknown): id is string => typeof id === 'string' && mappa.has(id))
      .slice(0, 4)
      .map((id) => ({ id, nome: mappa.get(id)! }));
  return v.slice(0, 5).flatMap((p: any): Proposta[] => {
    if (!p || typeof p !== 'object') return [];
    const cId = typeof p.cliente?.id === 'string' && clienti.has(p.cliente.id) ? p.cliente.id : null;
    const sId = typeof p.servizio?.id === 'string' && servizi.has(p.servizio.id) ? p.servizio.id : null;
    const minuti = intero(p.minuti);
    return [{
      cliente: { id: cId, candidati: cId ? [] : cand(p.cliente?.candidati, clienti) },
      servizio: { id: sId, candidati: sId ? [] : cand(p.servizio?.candidati, servizi) },
      minuti: minuti != null && minuti >= 1 && minuti <= 1440 ? minuti : null,
      data: dataValida(p.data) && p.data <= ctx.oggi ? p.data : null,
      nota: testo(p.nota, 500),
      motore: p.motore === 'AI' ? 'AI' : 'LOCALE',
    }];
  });
}

tsApp.post('/interpreta', async (c) => {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  const b = await c.req.json<any>().catch(() => ({}));
  const frase = testo(b.testo, 1000);
  if (!frase) return errore(c, 'Scrivi cosa hai fatto, per chi e per quanto tempo.');
  const { ctx } = await contestoStudio(c);
  const inSospeso = proposteDalBrowser(b.inSospeso, ctx);

  let proposte = inSospeso.length ? completaInSospeso(inSospeso, frase, ctx) : interpretaLocale(frase, ctx);
  let motore: 'LOCALE' | 'AI' = 'LOCALE';
  let limiteAi = false;

  // Passo 2: solo se manca qualcosa, con il consenso dello studio, sotto i limiti.
  if (!proposte.every(completa)) {
    const p = await parametriTs(c.env.DB, tenantId);
    if (aiTsAttiva(p) && aiDisponibile(c)) {
      const uso = await usoAiOggi(c.env.DB, tenantId, u.id, ctx.oggi);
      if (uso.interpretazioni >= LIMITE_INTERPRETAZIONI_GIORNO) limiteAi = true;
      else {
        const esito = await interpretaConMotoreA(frase, ctx, chiamaModello(c, proposte));
        if (esito.aiChiamata) await contaUsoAi(c.env.DB, tenantId, u.id, ctx.oggi, { interpretazioni: 1 });
        if (!esito.ripiego) {
          motore = 'AI';
          // Le proposte in sospeso già complete non si perdono: il modello ha visto solo la frase nuova.
          proposte = inSospeso.length ? [...inSospeso.filter(completa), ...esito.proposte] : esito.proposte;
        }
      }
    }
  }
  return c.json({ proposte, motore, limiteAi });
});

// ── Trascrizione (voce) ─────────────────────────────────────────

tsApp.post('/trascrivi', async (c) => {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  const p = await parametriTs(c.env.DB, tenantId);
  if (!aiTsAttiva(p) || !p.ai.voce) return errore(c, 'La dettatura vocale non è attiva per questo studio: chi amministra lo studio può attivarla dalle Impostazioni.', 403, { codice: 'voce_non_attiva' });
  const oggi = oggiRoma();
  const uso = await usoAiOggi(c.env.DB, tenantId, u.id, oggi);
  if (uso.secondiAudio >= LIMITE_SECONDI_AUDIO_GIORNO) return errore(c, 'Per oggi hai raggiunto il limite di dettatura vocale: puoi continuare scrivendo.', 429, { codice: 'limite_audio' });

  const form = await c.req.formData().catch(() => null);
  const campo = form?.get('audio');
  if (!campo || typeof campo === 'string') return errore(c, 'Audio mancante.');
  const file = campo as File;
  if (file.size > AUDIO_MAX_BYTE) return errore(c, 'Registrazione troppo lunga: al massimo un minuto.', 413);
  if (file.size < 1000) return c.json({ testo: '', secondi: 0, scartato: true });
  const dichiarati = Number(form?.get('secondi') ?? 0);
  const secondi = Math.min(AUDIO_MAX_SECONDI, Math.max(1, Number.isFinite(dichiarati) && dichiarati > 0 ? Math.round(dichiarati) : Math.ceil(file.size / 16_000)));

  let trascritto = '';
  let secondiModello: number | null = null;
  if (c.env.AI_FIXTURES === '1') {
    trascritto = 'due ore di contabilità per omega';
  } else {
    const ai = bindingAi(c);
    if (!ai) return errore(c, 'La trascrizione non è disponibile in questo momento.', 403, { codice: 'voce_non_disponibile' });
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binario = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const base64 = btoa(binario);
    const { servizi } = await contestoStudio(c);
    // Suggerimento con i soli nomi dei servizi (i nomi dei clienti si aggiungono solo se il passo 0 lo conferma).
    const prompt = `Rilevazione ore di uno studio di commercialisti. Servizi: ${servizi.map((s) => s.nome).join(', ')}.`;
    try {
      const r = await ai.run(MODELLO_TRASCRIZIONE, { audio: base64, language: 'it', vad_filter: true, initial_prompt: prompt });
      trascritto = String(r?.text ?? '').trim();
      const durata = Number(r?.transcription_info?.duration ?? r?.duration);
      if (Number.isFinite(durata) && durata > 0) secondiModello = Math.round(durata);
    } catch (e) {
      console.error('trascrizione', String(e));
      return errore(c, 'La trascrizione non è riuscita: riprova o scrivi il testo.', 400, { codice: 'trascrizione_fallita' });
    }
  }
  const conteggiati = secondiModello ?? secondi;
  await contaUsoAi(c.env.DB, tenantId, u.id, oggi, { secondiAudio: conteggiati });
  // L'audio non si conserva da nessuna parte. Trascrizioni vuote si scartano.
  if (!trascritto || trascritto.length < 2) return c.json({ testo: '', secondi: conteggiati, scartato: true });
  return c.json({ testo: trascritto, secondi: conteggiati });
});

// ── Registrazioni ───────────────────────────────────────────────

interface CorpoRegistrazione {
  clienteId: string;
  servizioId: string;
  minuti: number;
  data: string;
  nota: string | null;
  testoOriginale: string | null;
  origine: 'CHAT' | 'VOCE' | 'MANUALE';
  motore: 'LOCALE' | 'AI' | 'MANUALE';
  automatica: boolean;
  utenteId: string | null;
}

export function leggiCorpoRegistrazione(r: any, oggi: string): CorpoRegistrazione | string {
  if (!r || typeof r !== 'object') return 'Registrazione non valida';
  const clienteId = testo(r.clienteId, 80);
  const servizioId = testo(r.servizioId, 80);
  const minuti = intero(r.minuti);
  const data = typeof r.data === 'string' ? r.data : oggi;
  if (!clienteId) return 'Manca il cliente';
  if (!servizioId) return 'Manca il servizio';
  if (minuti == null || minuti < 1 || minuti > 1440) return 'La durata deve essere fra 1 minuto e 24 ore';
  if (!dataValida(data)) return 'Data non valida';
  if (data > oggi) return 'Non si registra nel futuro';
  const origine = ['CHAT', 'VOCE', 'MANUALE'].includes(r.origine) ? r.origine : 'MANUALE';
  const motore = ['LOCALE', 'AI', 'MANUALE'].includes(r.motore) ? r.motore : origine === 'MANUALE' ? 'MANUALE' : 'LOCALE';
  return {
    clienteId, servizioId, minuti, data, nota: testo(r.nota, 500), testoOriginale: testo(r.testoOriginale, 1000),
    origine, motore, automatica: r.automatica === true, utenteId: testo(r.utenteId, 80),
  };
}

tsApp.get('/registrazioni', async (c) => {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  const q = c.req.query();
  const titolare = titolareTs(u);
  const righe = await elencoRegistrazioni(c.env, tenantId, {
    utenteId: titolare ? testo(q.utenteId, 80) : u.id,
    clienteId: testo(q.clienteId, 80),
    servizioId: testo(q.servizioId, 80),
    da: dataValida(q.da) ? q.da : null,
    a: dataValida(q.a) ? q.a : null,
    daVerificare: q.daVerificare === '1',
    limite: intero(q.limite) ?? undefined,
  }, true);
  // Il collaboratore non vede importi né tariffe (A14).
  return c.json({ registrazioni: titolare ? righe : righe.map((r) => ({ ...r, tariffaCent: null })) });
});

tsApp.get('/registrazioni/export', soloTitolareTs, async (c) => {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  const q = c.req.query();
  const righe = await elencoRegistrazioni(c.env, tenantId, {
    utenteId: testo(q.utenteId, 80), clienteId: testo(q.clienteId, 80), servizioId: testo(q.servizioId, 80),
    da: dataValida(q.da) ? q.da : null, a: dataValida(q.a) ? q.a : null, daVerificare: q.daVerificare === '1', limite: 5000,
  }, true);
  const xlsx = creaXlsx([{
    nome: 'Registrazioni',
    colonne: ['Data', 'Persona', 'Cliente', 'Servizio', 'Minuti', 'Ore', 'Tariffa oraria (€)', 'Valore (€)', 'Nota', 'Origine', 'Da verificare', 'Inserita il'],
    larghezze: [12, 24, 36, 26, 8, 8, 16, 12, 50, 10, 13, 20],
    righe: righe.map((r) => [
      r.data, r.utenteNome, r.clienteNome, r.servizioNome, r.minuti, Math.round((r.minuti / 60) * 100) / 100,
      r.tariffaCent != null ? r.tariffaCent / 100 : null, r.tariffaCent != null ? Math.round((r.minuti / 60) * r.tariffaCent) / 100 : null,
      r.nota, r.origine, r.daVerificare ? 'sì' : '', r.creatoIl,
    ]),
  }]);
  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'TS_ESPORTA', entita: 'ts_registrazioni', dettaglio: { righe: righe.length, filtri: q }, ip: c.get('ip') });
  const nome = `contify-timesheet-registrazioni-${oggiRoma()}.xlsx`;
  return new Response(xlsx, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nome}"`,
    },
  });
});

tsApp.post('/registrazioni', async (c) => {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  const b = await c.req.json<any>().catch(() => ({}));
  const voci: any[] = Array.isArray(b.registrazioni) ? b.registrazioni : [b];
  if (!voci.length) return errore(c, 'Nessuna registrazione');
  if (voci.length > 10) return errore(c, 'Al massimo dieci registrazioni per volta');
  const oggi = oggiRoma();
  const p = await parametriTs(c.env.DB, tenantId);
  const titolare = titolareTs(u);
  const servizi = await elencoServizi(c.env.DB, tenantId, false);

  // Prima si valida tutto, poi si salva: o tutte o nessuna (per quanto possibile senza transazioni lunghe).
  const pronte: Array<{ r: CorpoRegistrazione; utenteId: string; cliente: ClienteTs; servizio: Servizio }> = [];
  for (let i = 0; i < voci.length; i++) {
    const r = leggiCorpoRegistrazione(voci[i], oggi);
    if (typeof r === 'string') return errore(c, `Registrazione ${i + 1}: ${r}`);
    let utenteId = u.id;
    if (r.utenteId && r.utenteId !== u.id) {
      // A nome di un'altra persona: solo il titolare, solo per persone dello stesso studio con ruolo Timesheet.
      if (!titolare) return errore(c, 'Puoi registrare solo il tuo lavoro.', 403);
      const altro = await c.env.DB.prepare('SELECT id FROM utenti WHERE id = ? AND tenant_id = ? AND attivo = 1 AND (ts_ruolo IS NOT NULL OR amministratore = 1)').bind(r.utenteId, tenantId).first<any>();
      if (!altro) return errore(c, 'Persona non trovata nello studio.', 404);
      utenteId = r.utenteId;
    }
    if (fuoriFinestra(u, r.data, p.impostazioni.giorniIndietro, oggi)) {
      return errore(c, `Puoi registrare solo i lavori degli ultimi ${p.impostazioni.giorniIndietro} giorni; per i giorni precedenti chiedi a chi dirige lo studio.`, 403, { codice: 'fuori_finestra' });
    }
    const servizio = servizi.find((s) => s.id === r.servizioId);
    if (!servizio || !servizio.attivo) return errore(c, 'Servizio non trovato o non attivo.', 404);
    const cliente = await assicuraClienteTs(c.env, tenantId, r.clienteId, u.id);
    if (!cliente) return errore(c, 'Cliente non trovato o non attivo.', 404);
    pronte.push({ r, utenteId, cliente, servizio });
  }

  const esiti: Array<{ id: string; daVerificare: boolean; motivi: string[] }> = [];
  for (const { r, utenteId, cliente, servizio } of pronte) {
    const esito = await salvaRegistrazione(c.env, tenantId, {
      utenteId, creatoDa: u.id, cliente, servizio, data: r.data, minuti: r.minuti, nota: r.nota, testoOriginale: r.testoOriginale,
      origine: r.origine, motore: r.motore, automatica: r.automatica,
    });
    if (utenteId !== u.id) {
      await scriviAudit(c.env.DB, {
        tenantId, utenteId: u.id, azione: 'TS_REGISTRA_PER_ALTRI', entita: 'ts_registrazioni', entitaId: esito.id,
        dettaglio: { perUtente: utenteId, data: r.data, minuti: r.minuti, clienteId: cliente.id, servizioId: servizio.id }, ip: c.get('ip'),
      });
    }
    esiti.push(esito);
  }
  const salvate = [];
  for (let i = 0; i < esiti.length; i++) {
    const r = await registrazione(c.env, tenantId, esiti[i].id, true);
    if (r) salvate.push({ ...r, tariffaCent: titolare ? r.tariffaCent : null, motivi: esiti[i].motivi });
  }
  return c.json({ ok: true, registrazioni: salvate }, 201);
});

type RegistrazioneLetta = NonNullable<Awaited<ReturnType<typeof registrazione>>>;

async function registrazioneModificabile(c: Ctx, id: string): Promise<{ r: RegistrazioneLetta; giorniIndietro: number } | Response> {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  const r = await registrazione(c.env, tenantId, id, true);
  if (!r) return errore(c, 'Registrazione non trovata.', 404);
  const titolare = titolareTs(u);
  if (!titolare && r.utenteId !== u.id && r.creatoDa !== u.id) return errore(c, 'Puoi modificare solo le tue registrazioni.', 403);
  if (r.proformaId) return errore(c, 'La registrazione è già in un proforma e non si modifica.', 409, { codice: 'in_proforma' });
  const p = await parametriTs(c.env.DB, tenantId);
  if (fuoriFinestra(u, r.data, p.impostazioni.giorniIndietro, oggiRoma())) {
    return errore(c, `Le registrazioni più vecchie di ${p.impostazioni.giorniIndietro} giorni le modifica chi dirige lo studio.`, 403, { codice: 'fuori_finestra' });
  }
  return { r, giorniIndietro: p.impostazioni.giorniIndietro };
}

tsApp.post('/registrazioni/:id', async (c) => {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  const esito = await registrazioneModificabile(c, c.req.param('id') ?? '');
  if (esito instanceof Response) return esito;
  const { r, giorniIndietro } = esito;
  const b = await c.req.json<any>().catch(() => ({}));
  const oggi = oggiRoma();
  const titolare = titolareTs(u);

  const nuovo = { clienteId: r.clienteId, servizioId: r.servizioId, minuti: r.minuti, data: r.data, nota: r.nota, daVerificare: r.daVerificare, tariffaCent: r.tariffaCent };
  if (b.minuti !== undefined) {
    const m = intero(b.minuti);
    if (m == null || m < 1 || m > 1440) return errore(c, 'La durata deve essere fra 1 minuto e 24 ore');
    nuovo.minuti = m;
  }
  if (b.data !== undefined) {
    if (!dataValida(b.data) || b.data > oggi) return errore(c, 'Data non valida o nel futuro');
    if (fuoriFinestra(u, b.data, giorniIndietro, oggi)) return errore(c, `Puoi spostare una registrazione solo entro gli ultimi ${giorniIndietro} giorni.`, 403, { codice: 'fuori_finestra' });
    nuovo.data = b.data;
  }
  if (b.nota !== undefined) nuovo.nota = testo(b.nota, 500);
  let servizio: Servizio | null = null;
  if (b.servizioId !== undefined && b.servizioId !== r.servizioId) {
    servizio = (await elencoServizi(c.env.DB, tenantId, true)).find((s) => s.id === b.servizioId) ?? null;
    if (!servizio) return errore(c, 'Servizio non trovato o non attivo.', 404);
    nuovo.servizioId = servizio.id;
    nuovo.tariffaCent = servizio.tariffaOrariaCent;
  }
  if (b.clienteId !== undefined && b.clienteId !== r.clienteId) {
    const cliente = await assicuraClienteTs(c.env, tenantId, String(b.clienteId), u.id);
    if (!cliente) return errore(c, 'Cliente non trovato o non attivo.', 404);
    nuovo.clienteId = cliente.id;
  }
  if (b.daVerificare !== undefined) {
    if (!titolare) return errore(c, 'Solo chi dirige lo studio può togliere «da verificare».', 403);
    nuovo.daVerificare = b.daVerificare === true;
  } else if (!titolare) {
    // Una modifica del collaboratore riaccende il controllo se supera le 16 ore o usa il generico.
    const altri = await minutiDelGiorno(c.env.DB, tenantId, r.utenteId, nuovo.data, r.id);
    const generico = servizio ? servizio.generico : (await elencoServizi(c.env.DB, tenantId, false)).find((s) => s.id === nuovo.servizioId)?.generico ?? false;
    if (altri + nuovo.minuti > MINUTI_GIORNO_SOSPETTI || generico) nuovo.daVerificare = true;
  }

  await c.env.DB.prepare(
    `UPDATE ts_registrazioni SET cliente_id = ?, servizio_id = ?, minuti = ?, data = ?, nota = ?, tariffa_cent = ?, da_verificare = ?, modificato_il = datetime('now'), modificato_da = ?
     WHERE id = ? AND tenant_id = ?`,
  ).bind(nuovo.clienteId, nuovo.servizioId, nuovo.minuti, nuovo.data, await cifraTesto(c.env, tenantId, nuovo.nota), nuovo.tariffaCent, nuovo.daVerificare ? 1 : 0, u.id, r.id, tenantId).run();

  await scriviAudit(c.env.DB, {
    tenantId, utenteId: u.id, azione: 'TS_MODIFICA_REGISTRAZIONE', entita: 'ts_registrazioni', entitaId: r.id,
    dettaglio: {
      perUtente: r.utenteId,
      prima: { data: r.data, minuti: r.minuti, clienteId: r.clienteId, servizioId: r.servizioId, daVerificare: r.daVerificare },
      dopo: { data: nuovo.data, minuti: nuovo.minuti, clienteId: nuovo.clienteId, servizioId: nuovo.servizioId, daVerificare: nuovo.daVerificare },
      automatica: r.automatica, motore: r.motore, origine: r.origine,
    },
    ip: c.get('ip'),
  });
  const agg = await registrazione(c.env, tenantId, r.id, true);
  return c.json({ ok: true, registrazione: agg && !titolare ? { ...agg, tariffaCent: null } : agg });
});

tsApp.delete('/registrazioni/:id', async (c) => {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  const esito = await registrazioneModificabile(c, c.req.param('id') ?? '');
  if (esito instanceof Response) return esito;
  const { r } = esito;
  await c.env.DB.prepare('DELETE FROM ts_registrazioni WHERE id = ? AND tenant_id = ?').bind(r.id, tenantId).run();
  await scriviAudit(c.env.DB, {
    tenantId, utenteId: u.id, azione: 'TS_ELIMINA_REGISTRAZIONE', entita: 'ts_registrazioni', entitaId: r.id,
    dettaglio: { perUtente: r.utenteId, data: r.data, minuti: r.minuti, clienteId: r.clienteId, servizioId: r.servizioId, automatica: r.automatica, motore: r.motore, origine: r.origine, creatoIl: r.creatoIl },
    ip: c.get('ip'),
  });
  return c.json({ ok: true });
});

// ── Riepilogo personale ─────────────────────────────────────────

tsApp.get('/riepilogo', async (c) => {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  const oggi = oggiRoma();
  // Dal lunedì della settimana o dal primo del mese, il più vecchio dei due, fino a oggi.
  const lun = lunediDi(oggi);
  const primo = `${oggi.slice(0, 7)}-01`;
  const da = lun < primo ? lun : primo;
  const { results } = await c.env.DB.prepare(
    'SELECT data, minuti FROM ts_registrazioni WHERE tenant_id = ? AND utente_id = ? AND data >= ? AND data <= ?',
  ).bind(tenantId, u.id, da, oggi).all<{ data: string; minuti: number }>();
  const p = await persona(c.env.DB, tenantId, u.id);
  return c.json(calcolaRiepilogo(oggi, results ?? [], p));
});

// ── Clienti ─────────────────────────────────────────────────────

function leggiDatiCliente(b: any): DatiCliente | null {
  const d: DatiCliente = {
    sede: testo(b.sede, 200), pec: testo(b.pec, 120), codiceDestinatario: testo(b.codiceDestinatario, 7)?.toUpperCase() ?? null,
    email: testo(b.email, 120), telefono: testo(b.telefono, 40),
  };
  return Object.values(d).some((v) => v) ? d : null;
}

export function leggiAnagrafica(b: any): { denominazione: string; personaFisica: boolean; codiceFiscale: string | null; partitaIva: string | null; dati: DatiCliente | null } | string {
  const denominazione = testo(b.denominazione ?? b.nome, 200);
  if (!denominazione) return 'Manca la denominazione';
  const cf = testo(b.codiceFiscale, 16)?.toUpperCase() ?? null;
  if (cf && !/^[A-Z0-9]{11,16}$/.test(cf)) return 'Codice fiscale non valido';
  let piva = testo(b.partitaIva, 13);
  if (piva) {
    const n = normalizzaPiva(piva);
    if (!n.valida) return 'Partita IVA non valida';
    piva = n.piva;
  }
  return { denominazione, personaFisica: b.personaFisica === true, codiceFiscale: cf, partitaIva: piva, dati: leggiDatiCliente(b) };
}

const ORIGINI_CLIENTE = new Set(['MANUALE', 'VIES', 'IMPORT', 'VISURA', 'CHAT']);

tsApp.get('/clienti', soloTitolareTs, async (c) => {
  const tenantId = c.get('tenantId');
  const clienti = await elencoClientiTs(c.env, tenantId, { conAr: c.get('moduli').AR === 'attivo', conDati: true });
  return c.json({ clienti });
});

tsApp.post('/clienti', async (c) => {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  const b = await c.req.json<any>().catch(() => ({}));
  const titolare = titolareTs(u);
  const p = await parametriTs(c.env.DB, tenantId);
  if (!titolare && !p.impostazioni.collaboratoriCreanoClienti) return errore(c, 'In questo studio i clienti nuovi li aggiunge chi dirige lo studio.', 403, { codice: 'clienti_solo_titolare' });
  const anag = leggiAnagrafica(b);
  if (typeof anag === 'string') return errore(c, anag);
  const elenco = await elencoClientiTs(c.env, tenantId, { conAr: c.get('moduli').AR === 'attivo' });
  const doppione = trovaDoppione(elenco, anag);
  if (doppione) return errore(c, `Cliente già presente: ${doppione.nome}`, 409, { codice: 'doppione', cliente: doppione });
  const id = nuovoId('tsc');
  // Il collaboratore crea il cliente dalla chat con la sola denominazione, «da verificare» (C8).
  const origine = titolare ? (ORIGINI_CLIENTE.has(String(b.origine)) ? String(b.origine) : 'MANUALE') : 'CHAT';
  await c.env.DB.prepare(
    `INSERT INTO ts_clienti (id, tenant_id, denominazione, persona_fisica, codice_fiscale, partita_iva, dati, origine, da_verificare, creato_da)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    id, tenantId, anag.denominazione, titolare && anag.personaFisica ? 1 : 0, titolare ? anag.codiceFiscale : null, titolare ? anag.partitaIva : null,
    titolare ? await cifraJson(c.env, tenantId, anag.dati) : null, origine, titolare ? 0 : 1, u.id,
  ).run();
  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'TS_CREA_CLIENTE', entita: 'ts_clienti', entitaId: id, dettaglio: { origine, daVerificare: !titolare }, ip: c.get('ip') });
  return c.json({ ok: true, cliente: await clienteTs(c.env, tenantId, id, titolare) }, 201);
});

tsApp.post('/clienti/import', soloTitolareTs, async (c) => {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  const b = await c.req.json<any>().catch(() => ({}));
  let righe: any[] = Array.isArray(b.righe) ? b.righe : [];
  // Via breve: un elenco di sole denominazioni, una per riga.
  if (!righe.length && typeof b.denominazioni === 'string') righe = b.denominazioni.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean).map((d: string) => ({ denominazione: d }));
  if (!righe.length) return errore(c, 'Nessuna riga da importare');
  if (righe.length > 500) return errore(c, 'Massimo 500 righe per volta');
  const elenco = await elencoClientiTs(c.env, tenantId, { conAr: c.get('moduli').AR === 'attivo' });
  const scartate: Array<{ riga: number; motivo: string }> = [];
  let creati = 0;
  for (let i = 0; i < righe.length; i++) {
    const anag = leggiAnagrafica(righe[i]);
    if (typeof anag === 'string') { scartate.push({ riga: i + 1, motivo: anag }); continue; }
    const d = trovaDoppione(elenco, anag);
    if (d) { scartate.push({ riga: i + 1, motivo: d.motivo }); continue; }
    const id = nuovoId('tsc');
    await c.env.DB.prepare(
      `INSERT INTO ts_clienti (id, tenant_id, denominazione, persona_fisica, codice_fiscale, partita_iva, dati, origine, creato_da) VALUES (?, ?, ?, ?, ?, ?, ?, 'IMPORT', ?)`,
    ).bind(id, tenantId, anag.denominazione, anag.personaFisica ? 1 : 0, anag.codiceFiscale, anag.partitaIva, await cifraJson(c.env, tenantId, anag.dati), u.id).run();
    elenco.push({ id, nome: anag.denominazione, personaFisica: anag.personaFisica, codiceFiscale: anag.codiceFiscale, partitaIva: anag.partitaIva, origine: 'IMPORT', clienteArId: null, collegatoAr: false, arMancante: false, alias: [], attivo: true, daVerificare: false, dati: null, creatoIl: null });
    creati++;
  }
  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'TS_IMPORT_CLIENTI', entita: 'ts_clienti', dettaglio: { righe: righe.length, creati, scartate: scartate.length }, ip: c.get('ip') });
  return c.json({ ok: true, creati, scartate });
});

tsApp.get('/lookup/piva/:piva', soloTitolareTs, async (c) => {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  // Stesso tetto orario e stessa cache della rotta di AR: il contatore è l'audit LOOKUP_ANAGRAFICA.
  if (await limiteSuperato(c.env.DB, tenantId)) return c.json({ esito: 'limite_raggiunto', fonte: null, affidabilita: null, dati: {}, avvisi: [] });
  const risposta = await cercaAnagrafica(c.env, c.req.param('piva') ?? '');
  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'LOOKUP_ANAGRAFICA', entita: 'ts_clienti', dettaglio: { esito: risposta.esito, fonte: risposta.fonte, modulo: 'TS' }, ip: c.get('ip') });
  return c.json(risposta);
});

/** Un modo di dire può puntare a un solo cliente per studio. */
async function aliasInUso(c: Ctx, alias: string[], escludiId: string): Promise<{ alias: string; nome: string } | null> {
  if (!alias.length) return null;
  const { results } = await c.env.DB.prepare('SELECT id, denominazione, alias FROM ts_clienti WHERE tenant_id = ? AND id != ? AND alias IS NOT NULL').bind(c.get('tenantId'), escludiId).all<any>();
  for (const r of results ?? []) {
    let a: string[] = [];
    try { a = JSON.parse(r.alias ?? '[]'); } catch { a = []; }
    const comune = alias.find((x) => a.includes(x));
    if (comune) return { alias: comune, nome: r.denominazione };
  }
  return null;
}

tsApp.post('/clienti/:id/alias', async (c) => {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  const id = c.req.param('id') ?? '';
  const b = await c.req.json<any>().catch(() => ({}));
  const nuovo = testo(b.alias, 60)?.toLowerCase() ?? null;
  if (!nuovo) return errore(c, 'Manca il modo di dire');
  const cliente = id.startsWith('ar:') ? await assicuraClienteTs(c.env, tenantId, id, u.id) : await clienteTs(c.env, tenantId, id);
  if (!cliente) return errore(c, 'Cliente non trovato.', 404);
  if (cliente.alias.includes(nuovo)) return c.json({ ok: true, clienteId: cliente.id, alias: cliente.alias });
  const conflitto = await aliasInUso(c, [nuovo], cliente.id);
  if (conflitto) return errore(c, `«${nuovo}» indica già ${conflitto.nome}.`, 409, { codice: 'alias_in_uso' });
  const alias = [...cliente.alias, nuovo].slice(0, 30);
  await c.env.DB.prepare('UPDATE ts_clienti SET alias = ? WHERE id = ? AND tenant_id = ?').bind(JSON.stringify(alias), cliente.id, tenantId).run();
  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'TS_ALIAS', entita: 'ts_clienti', entitaId: cliente.id, dettaglio: { alias: nuovo }, ip: c.get('ip') });
  return c.json({ ok: true, clienteId: cliente.id, alias });
});

tsApp.post('/clienti/:id', soloTitolareTs, async (c) => {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  const id = c.req.param('id') ?? '';
  const cur = id.startsWith('ar:') ? await assicuraClienteTs(c.env, tenantId, id, u.id) : await clienteTs(c.env, tenantId, id, true);
  if (!cur) return errore(c, 'Cliente non trovato.', 404);
  const b = await c.req.json<any>().catch(() => ({}));
  const campi: string[] = [];
  const valori: unknown[] = [];
  const dettaglio: Record<string, unknown> = {};

  if (b.attivo !== undefined) { campi.push('attivo = ?'); valori.push(b.attivo === true ? 1 : 0); dettaglio.attivo = b.attivo === true; }
  if (b.daVerificare !== undefined) { campi.push('da_verificare = ?'); valori.push(b.daVerificare === true ? 1 : 0); dettaglio.daVerificare = b.daVerificare === true; }
  if (b.alias !== undefined) {
    const alias = (Array.isArray(b.alias) ? [...new Set(b.alias.map((a: unknown) => String(a).trim().toLowerCase()).filter((a: string) => a && a.length <= 60))] : []).slice(0, 30) as string[];
    const conflitto = await aliasInUso(c, alias, cur.id);
    if (conflitto) return errore(c, `«${conflitto.alias}» indica già ${conflitto.nome}.`, 409, { codice: 'alias_in_uso' });
    campi.push('alias = ?'); valori.push(JSON.stringify(alias)); dettaglio.alias = alias;
  }
  if (b.clienteArId !== undefined) {
    // Collegamento manuale a un cliente di AR dello stesso studio (o scollegamento con null).
    if (b.clienteArId === null) { campi.push('cliente_ar_id = NULL'); dettaglio.clienteArId = null; }
    else {
      const ar = await c.env.DB.prepare('SELECT id, denominazione FROM clienti WHERE id = ? AND tenant_id = ?').bind(String(b.clienteArId), tenantId).first<any>();
      if (!ar) return errore(c, 'Cliente Antiriciclaggio non trovato nello studio.', 404);
      const gia = await c.env.DB.prepare('SELECT id FROM ts_clienti WHERE tenant_id = ? AND cliente_ar_id = ? AND id != ?').bind(tenantId, ar.id, cur.id).first<any>();
      if (gia) return errore(c, 'Quel cliente Antiriciclaggio è già collegato a un altro cliente Timesheet.', 409);
      campi.push('cliente_ar_id = ?', 'denominazione = ?'); valori.push(ar.id, ar.denominazione);
      dettaglio.clienteArId = ar.id;
    }
  }
  const toccaAnagrafica = ['denominazione', 'codiceFiscale', 'partitaIva', 'personaFisica', 'sede', 'pec', 'codiceDestinatario', 'email', 'telefono'].some((k) => b[k] !== undefined);
  if (toccaAnagrafica) {
    const collegato = cur.collegatoAr && !cur.arMancante && b.clienteArId !== null;
    const anag = leggiAnagrafica({
      denominazione: b.denominazione ?? cur.nome, codiceFiscale: b.codiceFiscale ?? cur.codiceFiscale, partitaIva: b.partitaIva ?? cur.partitaIva,
      personaFisica: b.personaFisica ?? cur.personaFisica,
      sede: b.sede ?? cur.dati?.sede, pec: b.pec ?? cur.dati?.pec, codiceDestinatario: b.codiceDestinatario ?? cur.dati?.codiceDestinatario,
      email: b.email ?? cur.dati?.email, telefono: b.telefono ?? cur.dati?.telefono,
    });
    if (typeof anag === 'string') return errore(c, anag);
    if (!collegato) {
      // Anagrafica propria: per i clienti collegati ad AR si modifica in AR (resta in sola lettura qui).
      const elenco = await elencoClientiTs(c.env, tenantId, { conAr: c.get('moduli').AR === 'attivo' });
      const d = trovaDoppione(elenco, anag, cur.id);
      if (d) return errore(c, `Cliente già presente: ${d.nome}`, 409, { codice: 'doppione', cliente: d });
      campi.push('denominazione = ?', 'persona_fisica = ?', 'codice_fiscale = ?', 'partita_iva = ?');
      valori.push(anag.denominazione, anag.personaFisica ? 1 : 0, anag.codiceFiscale, anag.partitaIva);
      dettaglio.anagrafica = true;
      if (ORIGINI_CLIENTE.has(String(b.origine))) { campi.push('origine = ?'); valori.push(String(b.origine)); }
    }
    // I dati di fatturazione (sede, PEC, codice destinatario, email, telefono) sono di Timesheet anche per i collegati.
    campi.push('dati = ?'); valori.push(await cifraJson(c.env, tenantId, anag.dati));
    dettaglio.dati = true;
  }
  if (!campi.length) return errore(c, 'Niente da modificare');
  await c.env.DB.prepare(`UPDATE ts_clienti SET ${campi.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...valori, cur.id, tenantId).run();
  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'TS_MODIFICA_CLIENTE', entita: 'ts_clienti', entitaId: cur.id, dettaglio, ip: c.get('ip') });
  return c.json({ ok: true, cliente: await clienteTs(c.env, tenantId, cur.id, true) });
});

// ── Persone e ore previste ──────────────────────────────────────

tsApp.get('/persone', soloTitolareTs, async (c) => {
  return c.json({ persone: await elencoPersone(c.env.DB, c.get('tenantId')) });
});

tsApp.post('/persone/:utenteId', soloTitolareTs, async (c) => {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  const utenteId = c.req.param('utenteId') ?? '';
  const altro = await c.env.DB.prepare('SELECT id FROM utenti WHERE id = ? AND tenant_id = ?').bind(utenteId, tenantId).first<any>();
  if (!altro) return errore(c, 'Persona non trovata nello studio.', 404);
  const b = await c.req.json<any>().catch(() => ({}));
  let minuti: number | null = null;
  if (b.minutiSettimanali !== null && b.minutiSettimanali !== undefined && b.minutiSettimanali !== '') {
    minuti = intero(b.minutiSettimanali);
    if (minuti == null || minuti < 1 || minuti > 6000) return errore(c, 'Le ore previste a settimana devono essere fra 1 minuto e 100 ore');
  }
  const giorni = typeof b.giorniLavorativi === 'string' ? [...new Set(b.giorniLavorativi.replace(/[^1-7]/g, '').split(''))].sort().join('') : '12345';
  if (!giorni) return errore(c, 'Indica almeno un giorno di lavoro');
  await scriviPersona(c.env.DB, tenantId, utenteId, { minutiSettimanali: minuti, giorniLavorativi: giorni });
  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'TS_ORE_PREVISTE', entita: 'ts_persone', entitaId: utenteId, dettaglio: { minutiSettimanali: minuti, giorniLavorativi: giorni }, ip: c.get('ip') });
  return c.json({ ok: true, persona: { utenteId, minutiSettimanali: minuti, giorniLavorativi: giorni } });
});

// ── Servizi e tariffe ───────────────────────────────────────────

tsApp.get('/servizi', soloTitolareTs, async (c) => {
  return c.json({ servizi: await elencoServizi(c.env.DB, c.get('tenantId'), false) });
});

function leggiServizio(b: any): { nome: string; tariffaOrariaCent: number; paroleChiave: string[]; attivo: boolean; ordine: number } | string {
  const nome = testo(b.nome, 80);
  if (!nome) return 'Manca il nome del servizio';
  const tariffa = b.tariffaOrariaCent === undefined || b.tariffaOrariaCent === null ? 0 : intero(b.tariffaOrariaCent);
  if (tariffa == null || tariffa < 0 || tariffa > 10_000_000) return 'Tariffa oraria non valida';
  const parole = (Array.isArray(b.paroleChiave) ? [...new Set(b.paroleChiave.map((p: unknown) => String(p).trim().toLowerCase()).filter((p: string) => p && p.length <= 40))] : []).slice(0, 40) as string[];
  return { nome, tariffaOrariaCent: tariffa, paroleChiave: parole, attivo: b.attivo !== false, ordine: intero(b.ordine) ?? 0 };
}

tsApp.post('/servizi', soloTitolareTs, async (c) => {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  const b = await c.req.json<any>().catch(() => ({}));
  const s = leggiServizio(b);
  if (typeof s === 'string') return errore(c, s);
  const id = nuovoId('tss');
  await c.env.DB.prepare('INSERT INTO ts_servizi (id, tenant_id, nome, tariffa_oraria_cent, parole_chiave, generico, attivo, ordine) VALUES (?, ?, ?, ?, ?, 0, ?, ?)')
    .bind(id, tenantId, s.nome, s.tariffaOrariaCent, JSON.stringify(s.paroleChiave), s.attivo ? 1 : 0, s.ordine).run();
  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'TS_CREA_SERVIZIO', entita: 'ts_servizi', entitaId: id, dettaglio: s, ip: c.get('ip') });
  return c.json({ ok: true, id, servizi: await elencoServizi(c.env.DB, tenantId, false) }, 201);
});

tsApp.post('/servizi/predefiniti', soloTitolareTs, async (c) => {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  const creati = await assicuraServiziPredefiniti(c.env.DB, tenantId);
  if (creati) await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'TS_SERVIZI_PREDEFINITI', entita: 'ts_servizi', dettaglio: { creati }, ip: c.get('ip') });
  return c.json({ ok: true, creati, servizi: await elencoServizi(c.env.DB, tenantId, false) });
});

tsApp.post('/servizi/:id', soloTitolareTs, async (c) => {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  const id = c.req.param('id') ?? '';
  const cur = (await elencoServizi(c.env.DB, tenantId, false)).find((s) => s.id === id);
  if (!cur) return errore(c, 'Servizio non trovato.', 404);
  const b = await c.req.json<any>().catch(() => ({}));
  const s = leggiServizio({ nome: b.nome ?? cur.nome, tariffaOrariaCent: b.tariffaOrariaCent ?? cur.tariffaOrariaCent, paroleChiave: b.paroleChiave ?? cur.paroleChiave, attivo: b.attivo ?? cur.attivo, ordine: b.ordine ?? cur.ordine });
  if (typeof s === 'string') return errore(c, s);
  if (cur.generico && !s.attivo) return errore(c, 'Il servizio generico non si disattiva: serve alle registrazioni senza un servizio preciso.', 409);
  await c.env.DB.prepare('UPDATE ts_servizi SET nome = ?, tariffa_oraria_cent = ?, parole_chiave = ?, attivo = ?, ordine = ? WHERE id = ? AND tenant_id = ?')
    .bind(s.nome, s.tariffaOrariaCent, JSON.stringify(s.paroleChiave), s.attivo ? 1 : 0, s.ordine, id, tenantId).run();
  await scriviAudit(c.env.DB, {
    tenantId, utenteId: u.id, azione: 'TS_MODIFICA_SERVIZIO', entita: 'ts_servizi', entitaId: id,
    dettaglio: { prima: { nome: cur.nome, tariffaOrariaCent: cur.tariffaOrariaCent, attivo: cur.attivo }, dopo: { nome: s.nome, tariffaOrariaCent: s.tariffaOrariaCent, attivo: s.attivo } }, ip: c.get('ip'),
  });
  return c.json({ ok: true, servizi: await elencoServizi(c.env.DB, tenantId, false) });
});

// ── Impostazioni e consenso ─────────────────────────────────────

tsApp.get('/impostazioni', soloTitolareTs, async (c) => {
  const tenantId = c.get('tenantId');
  const p = await parametriTs(c.env.DB, tenantId);
  let accettataDaNome: string | null = null;
  if (p.ai.accettataDa) {
    const x = await c.env.DB.prepare('SELECT nome FROM utenti WHERE id = ? AND tenant_id = ?').bind(p.ai.accettataDa, tenantId).first<any>();
    accettataDaNome = x?.nome ?? null;
  }
  return c.json({
    impostazioni: p.impostazioni,
    ai: { ...p.ai, accettataDaNome, versioneCorrente: VERSIONE_INFORMATIVA_TS, daRiaccettare: p.ai.abilitata && p.ai.versioneInformativa !== VERSIONE_INFORMATIVA_TS, disponibile: aiDisponibile(c) },
    limiti: { interpretazioniGiorno: LIMITE_INTERPRETAZIONI_GIORNO, secondiAudioGiorno: LIMITE_SECONDI_AUDIO_GIORNO },
  });
});

tsApp.post('/impostazioni', soloTitolareTs, async (c) => {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  const b = await c.req.json<any>().catch(() => ({}));
  const p = await parametriTs(c.env.DB, tenantId);
  if (b.collaboratoriCreanoClienti !== undefined) p.impostazioni.collaboratoriCreanoClienti = b.collaboratoriCreanoClienti === true;
  if (b.giorniIndietro !== undefined) {
    const g = intero(b.giorniIndietro);
    if (g == null || g < 0 || g > 365) return errore(c, 'I giorni indietro devono essere fra 0 e 365');
    p.impostazioni.giorniIndietro = g;
  }
  await scriviParametriTs(c.env.DB, tenantId, p);
  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'TS_IMPOSTAZIONI', entita: 'tenants', entitaId: tenantId, dettaglio: p.impostazioni, ip: c.get('ip') });
  return c.json({ ok: true, impostazioni: p.impostazioni });
});

/** Consenso ad AI e voce: solo chi amministra lo studio, dopo aver letto l'informativa (B6, B12). */
tsApp.post('/impostazioni/ai', soloAmministratore, async (c) => {
  const u = c.get('utente');
  const tenantId = c.get('tenantId');
  const b = await c.req.json<any>().catch(() => ({}));
  const p = await parametriTs(c.env.DB, tenantId);
  const abilitata = b.abilitata === true;
  const voce = abilitata && b.voce === true;
  if (abilitata && b.informativaLetta !== true) return errore(c, 'Per attivare l’AI di Timesheet va letta e confermata l’informativa.', 400, { codice: 'informativa_non_confermata' });
  p.ai = abilitata
    ? { abilitata: true, voce, versioneInformativa: VERSIONE_INFORMATIVA_TS, accettataDa: u.id, accettataIl: new Date().toISOString() }
    : { ...CONSENSO_VUOTO };
  await scriviParametriTs(c.env.DB, tenantId, p);
  await scriviAudit(c.env.DB, { tenantId, utenteId: u.id, azione: 'TS_CONSENSO_AI', entita: 'tenants', entitaId: tenantId, dettaglio: { abilitata, voce, versioneInformativa: abilitata ? VERSIONE_INFORMATIVA_TS : null }, ip: c.get('ip') });
  return c.json({ ok: true, ai: p.ai });
});
