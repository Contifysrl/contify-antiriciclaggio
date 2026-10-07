/**
 * Contify Timesheet — passo 2 dell'interpretazione, motore A: modello presso
 * Cloudflare (Workers AI). Parte solo quando il passo 1 lascia qualcosa di
 * mancante o ambiguo: il modello riceve il testo, i servizi e SOLO i clienti
 * candidati del locale (mai l'elenco dello studio) e restituisce JSON secondo
 * uno schema.
 *
 * La risposta del modello è DATO NON FIDATO e vale solo come SUGGERIMENTO:
 * il locale decide ciò che è certo; dove il locale non ha deciso, il
 * servizio indicato dal modello va in testa ai candidati e, fra i candidati
 * cliente del locale, quello indicato dal modello va in testa; mai una scelta
 * certa, mai un cliente che il locale non aveva considerato. Minuti, data,
 * nota e numero di registrazioni restano quelli del locale. Così il modello
 * non può produrre un errore silenzioso né proporre un cliente inventato: può
 * solo far risparmiare un tocco. Regola nata dalla prova del 5/10/2026: usato
 * al posto del locale, il modello peggiorava tutto (3 errori sul cliente, 14
 * silenziosi); con l'elenco intero inventava clienti per nomi sconosciuti e
 * non recuperava quelli storpiati. Ogni identificativo si verifica contro lo
 * studio; se la risposta è malformata, in errore o in ritardo, vale il passo 1.
 *
 * Il trasporto (binding `env.AI` nel Worker, REST nelle prove) è iniettato:
 * questo file non conosce la rete.
 */

import { estraiDurate } from './durata';
import { estraiDate, giornoSettimana } from './quando';
import { completa, interpretaLocale, type Candidato, type Contesto, type Proposta } from './interpretazione';

export type MessaggioModello = { role: 'system' | 'user'; content: string };
export type ChiamaModello = (messaggi: MessaggioModello[], schema: Record<string, unknown>) => Promise<{ testo: string; usoTokens?: unknown }>;

export const TEMPO_MASSIMO_MODELLO_MS = 6000;

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

export const SCHEMA_RISPOSTA = {
  type: 'object',
  properties: {
    registrazioni: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          cliente: { type: ['string', 'null'] },
          candidati_cliente: { type: 'array', items: { type: 'string' } },
          servizio: { type: ['string', 'null'] },
          candidati_servizio: { type: 'array', items: { type: 'string' } },
          minuti: { type: ['integer', 'null'] },
          data: { type: ['string', 'null'] },
          nota: { type: ['string', 'null'] },
        },
        required: ['cliente', 'candidati_cliente', 'servizio', 'candidati_servizio', 'minuti', 'data', 'nota'],
      },
    },
  },
  required: ['registrazioni'],
};

export interface FattiLocali {
  durate: number[];
  date: Array<{ testo: string; data: string | null }>;
}

/** Il contesto che si manda al modello: servizi, clienti ristretti, fatti già riconosciuti localmente. */
export function preparaRichiesta(testo: string, ctx: Contesto, locali: Proposta[]): { messaggi: MessaggioModello[]; clientiInviati: Candidato[]; fatti: FattiLocali } {
  const durate = estraiDurate(testo).map((d) => d.minuti);
  const date = estraiDate(testo, ctx.oggi).map((q) => ({ testo: testo.slice(q.inizio, q.fine), data: q.futura ? null : q.data }));
  const candidatiLocali = new Map<string, Candidato>();
  for (const p of locali) {
    if (p.cliente.id) candidatiLocali.set(p.cliente.id, { id: p.cliente.id, nome: ctx.clienti.find((c) => c.id === p.cliente.id)?.nome ?? p.cliente.id });
    for (const c of p.cliente.candidati) candidatiLocali.set(c.id, c);
  }
  // Solo i clienti che il locale ha già considerato: il modello non ne introduce altri.
  const clientiInviati: Candidato[] = [...candidatiLocali.values()];

  const sistema = [
    'Sei il motore di una rilevazione ore per studi di commercialisti e consulenti del lavoro in Italia.',
    'Chi lavora scrive o detta per quale cliente ha lavorato, che tipo di lavoro (servizio) ha fatto e per quanto tempo.',
    'Il tuo compito: trasformare la frase in una o più registrazioni, una per ogni lavoro distinto (cliente + servizio + durata).',
    'Rispondi SOLO con JSON valido secondo lo schema richiesto, senza testo attorno.',
    '',
    'Regole:',
    `- Oggi è ${GIORNI[giornoSettimana(ctx.oggi)]} ${ctx.oggi}. Le date vanno scritte AAAA-MM-GG, mai nel futuro. Se la frase non dice il giorno, la data è oggi. Usa le date già risolte che ti vengono fornite.`,
    '- "cliente" è l\'id del cliente PIÙ PROBABILE fra quelli dell\'elenco fornito (anche se il nome è storpiato, con lettere sbagliate o parole unite/spezzate); gli altri plausibili, in ordine, in candidati_cliente. Null se l\'elenco è vuoto o nessun cliente dell\'elenco è plausibile: non inventare clienti fuori dall\'elenco. La tua scelta è un suggerimento: la conferma la dà chi registra.',
    '- Nomi di persone che compaiono come dipendenti, soci, avvocati, fornitori o controparti del cliente NON sono clienti: il cliente è quello per cui si lavora.',
    '- "servizio" è l\'id del servizio PIÙ ADATTO dell\'elenco, scelto dalle parole chiave e dal senso della frase; le alternative plausibili in candidati_servizio. Null solo se non si capisce. Non usare mai il servizio generico se non è detto esplicitamente.',
    '- "minuti": usa SOLO le durate già riconosciute che ti vengono fornite, assegnando ciascuna al lavoro giusto; null se per quel lavoro la frase non dà una durata. Se una sola durata vale per più clienti e la frase dice "ciascuno" o simili, ripetila; se dice un totale senza ripartizione, metti null a tutti.',
    '- "nota": ciò che la frase dice in più (dettagli del lavoro), senza ripetere cliente, servizio e durata; null se non c\'è nulla.',
    '- Il mese da solo ("cedolini di settembre") non è la data del lavoro ma il periodo a cui si riferisce.',
  ].join('\n');

  const utente = [
    `Frase: «${testo}»`,
    '',
    'Servizi dello studio (id: nome — parole chiave):',
    ...ctx.servizi.map((s) => `- ${s.id}: ${s.nome}${s.generico ? ' (generico)' : ''}${s.parole.length ? ' — ' + s.parole.join(', ') : ''}`),
    '',
    `Clienti possibili (id: nome):`,
    ...(clientiInviati.length ? clientiInviati.map((c) => `- ${c.id}: ${c.nome}`) : ['- (nessuno: la frase non nomina un cliente conosciuto; cliente null)']),
    '',
    `Durate riconosciute nella frase, in minuti e in ordine: ${durate.length ? durate.join(', ') : 'nessuna'}.`,
    `Date riconosciute nella frase: ${date.length ? date.map((d) => `«${d.testo}» = ${d.data ?? 'non determinabile (chiedere)'}`).join('; ') : 'nessuna (oggi)'}.`,
  ].join('\n');

  return { messaggi: [{ role: 'system', content: sistema }, { role: 'user', content: utente }], clientiInviati, fatti: { durate, date } };
}

/** Estrae l'oggetto JSON da una risposta che potrebbe avere testo attorno. */
export function estraiJson(testo: string): any | null {
  try { return JSON.parse(testo); } catch { /* prova a isolare */ }
  const i = testo.indexOf('{'), j = testo.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(testo.slice(i, j + 1)); } catch { return null; }
}

/**
 * Valida la risposta del modello contro lo studio e i fatti locali e la
 * traduce in proposte «del modello», da fondere con il locale (`fondi`).
 * Restituisce null se la risposta non è usabile (si tiene il passo 1).
 */
export function validaRisposta(grezzo: any, ctx: Contesto, clientiInviati: Candidato[], fatti: FattiLocali): Proposta[] | null {
  const reg = grezzo?.registrazioni;
  if (!Array.isArray(reg) || !reg.length || reg.length > 10) return null;
  const clientiOk = new Set(clientiInviati.map((c) => c.id));
  const nomeCliente = (id: string) => ctx.clienti.find((c) => c.id === id)?.nome ?? id;
  const servizi = new Map(ctx.servizi.map((s) => [s.id, s]));
  const dateOk = new Set<string>([ctx.oggi, ...fatti.date.map((d) => d.data).filter((d): d is string => !!d)]);
  const durateOk = new Set(fatti.durate);
  const out: Proposta[] = [];
  for (const r of reg) {
    if (!r || typeof r !== 'object') return null;
    const clienteId = typeof r.cliente === 'string' && clientiOk.has(r.cliente) ? r.cliente : null;
    const candTutti = (Array.isArray(r.candidati_cliente) ? r.candidati_cliente : []).filter((x: unknown) => typeof x === 'string' && clientiOk.has(x)) as string[];
    // Più di 4 candidati = il modello non sa (nella prova elencava tutti i clienti): nessun candidato.
    const candCliente = candTutti.length > 4 ? [] : candTutti;
    const servizio = typeof r.servizio === 'string' ? servizi.get(r.servizio) : undefined;
    const servizioId = servizio && !servizio.generico ? servizio.id : null;
    const candServizio = (Array.isArray(r.candidati_servizio) ? r.candidati_servizio : []).filter((x: unknown) => typeof x === 'string' && servizi.has(x)).slice(0, 4) as string[];
    const minuti = typeof r.minuti === 'number' && Number.isInteger(r.minuti) && durateOk.has(r.minuti) ? r.minuti : null;
    const data = typeof r.data === 'string' && dateOk.has(r.data) ? r.data : fatti.date.some((d) => d.data === null) ? null : fatti.date.length ? null : ctx.oggi;
    const nota = typeof r.nota === 'string' && r.nota.trim() ? r.nota.trim().slice(0, 500) : null;
    out.push({
      // Qui id e candidati convivono: sono la scelta principale e le alternative del modello, che `fondi` userà come suggerimenti.
      cliente: { id: clienteId, candidati: candCliente.filter((id) => id !== clienteId).map((id) => ({ id, nome: nomeCliente(id) })) },
      servizio: { id: servizioId, candidati: candServizio.filter((id) => id !== servizioId).map((id) => ({ id, nome: servizi.get(id)!.nome })) },
      minuti,
      data,
      nota,
      motore: 'AI',
    });
  }
  return out;
}

/** I suggerimenti del modello per un campo, in ordine: la scelta principale, poi i candidati. */
function suggeriti(campo: { id: string | null; candidati: Candidato[] }): Candidato[] {
  const visti = new Set<string>();
  const out: Candidato[] = [];
  for (const c of [campo.id ? { id: campo.id, nome: '' } : null, ...campo.candidati]) {
    if (c && !visti.has(c.id)) { visti.add(c.id); out.push(c); }
  }
  return out;
}

/** Mette in testa ai candidati del locale quelli suggeriti dal modello (stessi elementi, ordine diverso). */
function riordina(locali: Candidato[], suggerimenti: Candidato[]): Candidato[] {
  const ordine = new Map(suggerimenti.map((s, i) => [s.id, i]));
  return [...locali].sort((a, b) => (ordine.get(a.id) ?? Infinity) - (ordine.get(b.id) ?? Infinity));
}

/**
 * Fonde il passo 1 con la risposta (validata) del modello. Il locale decide
 * ciò che è certo e quante registrazioni sono; il modello può solo suggerire:
 * - cliente certo nel locale → resta; candidati nel locale → gli stessi, con il
 *   suggerito in testa; nessun candidato → resta nessuno (il modello non
 *   introduce clienti: nella prova ne inventava per i nomi sconosciuti);
 * - servizio: certo nel locale → resta; altrimenti il suggerito in testa ai
 *   candidati del locale (mai certo, mai il generico);
 * - minuti, data, nota: sempre dal locale.
 * `motore` vale 'AI' solo dove un suggerimento è entrato.
 */
export function fondi(locali: Proposta[], modello: Proposta[], ctx: Contesto): Proposta[] {
  const nomeCliente = (id: string) => ctx.clienti.find((c) => c.id === id)?.nome ?? id;
  const nomeServizio = (id: string) => ctx.servizi.find((s) => s.id === id)?.nome ?? id;
  return locali.map((l, i) => {
    const m = modello[i];
    if (!m) return l;
    let usato = false;
    let cliente = l.cliente;
    if (!l.cliente.id) {
      // Più di 4 suggerimenti = il modello non sa (nella prova elencava tutti i clienti): nessun suggerimento.
      const tutti = suggeriti(m.cliente);
      const sugg = tutti.length > 4 ? [] : tutti.map((c) => ({ id: c.id, nome: nomeCliente(c.id) }));
      if (sugg.length && l.cliente.candidati.length) {
        const nuovi = riordina(l.cliente.candidati, sugg);
        usato = usato || nuovi[0].id !== l.cliente.candidati[0].id;
        cliente = { id: null, candidati: nuovi };
      }
    }
    let servizio = l.servizio;
    if (!l.servizio.id) {
      const sugg = suggeriti(m.servizio).filter((s) => !ctx.servizi.find((x) => x.id === s.id)?.generico).map((s) => ({ id: s.id, nome: nomeServizio(s.id) }));
      if (sugg.length) {
        const visti = new Set(sugg.map((s) => s.id));
        servizio = { id: null, candidati: [...sugg, ...l.servizio.candidati.filter((c) => !visti.has(c.id))].slice(0, 4) };
        usato = true;
      }
    }
    return usato ? { ...l, cliente, servizio, motore: 'AI' } : l;
  });
}

export interface EsitoMotoreA {
  proposte: Proposta[];
  aiChiamata: boolean;
  /** Motivo per cui vale il solo passo 1, se così è andata. */
  ripiego?: string;
  usoTokens?: unknown;
  /** La risposta del modello validata, prima della fusione (per le prove e i rapporti). */
  modello?: Proposta[];
}

/** Passo 1 sempre; passo 2 (modello) solo se qualcosa manca o è ambiguo. */
export async function interpretaConMotoreA(testo: string, ctx: Contesto, chiama: ChiamaModello): Promise<EsitoMotoreA> {
  const locali = interpretaLocale(testo, ctx);
  if (locali.every(completa)) return { proposte: locali, aiChiamata: false };
  const { messaggi, clientiInviati, fatti } = preparaRichiesta(testo, ctx, locali);
  let risposta: { testo: string; usoTokens?: unknown };
  try {
    risposta = await Promise.race([
      chiama(messaggi, SCHEMA_RISPOSTA),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('tempo scaduto')), TEMPO_MASSIMO_MODELLO_MS)),
    ]);
  } catch (e) {
    return { proposte: locali, aiChiamata: true, ripiego: `errore del modello: ${String(e)}` };
  }
  const grezzo = estraiJson(risposta.testo);
  const valide = grezzo ? validaRisposta(grezzo, ctx, clientiInviati, fatti) : null;
  if (!valide) return { proposte: locali, aiChiamata: true, ripiego: 'risposta non valida', usoTokens: risposta.usoTokens };
  return { proposte: fondi(locali, valide, ctx), aiChiamata: true, usoTokens: risposta.usoTokens, modello: valide };
}
