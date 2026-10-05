/**
 * Contify Timesheet — passo 2 dell'interpretazione, motore A: modello presso
 * Cloudflare (Workers AI). Parte solo quando il passo 1 lascia qualcosa di
 * mancante o ambiguo, anche il cliente: il modello riceve il testo, i servizi
 * e un elenco RISTRETTO di clienti (i candidati locali, oppure tutti i clienti
 * dello studio fino a 150) e restituisce JSON secondo uno schema.
 *
 * La risposta del modello è DATO NON FIDATO: ogni identificativo si verifica
 * contro lo studio; i minuti devono coincidere con una durata riconosciuta
 * localmente, le date con una data riconosciuta localmente (o oggi); altrimenti
 * il campo torna nullo e si chiede. Se la risposta è malformata, in errore o
 * in ritardo, vale il solo passo 1.
 *
 * Il trasporto (binding `env.AI` nel Worker, REST nelle prove) è iniettato:
 * questo file non conosce la rete.
 */

import { estraiDurate } from './durata';
import { estraiDate, giornoSettimana } from './quando';
import { completa, interpretaLocale, type Candidato, type Contesto, type Proposta } from './interpretazione';

export type MessaggioModello = { role: 'system' | 'user'; content: string };
export type ChiamaModello = (messaggi: MessaggioModello[], schema: Record<string, unknown>) => Promise<{ testo: string; usoTokens?: unknown }>;

/** Oltre questo numero di clienti si passano al modello i più usati di recente (il chiamante li ordina così). */
export const MAX_CLIENTI_AL_MODELLO = 150;
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
  const mancaCliente = locali.some((p) => !p.cliente.id);
  const clientiInviati: Candidato[] = mancaCliente && !candidatiLocali.size
    ? ctx.clienti.slice(0, MAX_CLIENTI_AL_MODELLO).map((c) => ({ id: c.id, nome: c.nome }))
    : mancaCliente
      ? [...candidatiLocali.values()]
      : [...candidatiLocali.values()];

  const sistema = [
    'Sei il motore di una rilevazione ore per studi di commercialisti e consulenti del lavoro in Italia.',
    'Chi lavora scrive o detta per quale cliente ha lavorato, che tipo di lavoro (servizio) ha fatto e per quanto tempo.',
    'Il tuo compito: trasformare la frase in una o più registrazioni, una per ogni lavoro distinto (cliente + servizio + durata).',
    'Rispondi SOLO con JSON valido secondo lo schema richiesto, senza testo attorno.',
    '',
    'Regole:',
    `- Oggi è ${GIORNI[giornoSettimana(ctx.oggi)]} ${ctx.oggi}. Le date vanno scritte AAAA-MM-GG, mai nel futuro. Se la frase non dice il giorno, la data è oggi. Usa le date già risolte che ti vengono fornite.`,
    '- "cliente" è l\'id di un cliente dell\'elenco fornito, oppure null se la frase non nomina nessun cliente dell\'elenco, o nomina un cliente che non c\'è, o è ambigua fra più clienti (in quel caso metti gli id possibili in candidati_cliente).',
    '- Nomi di persone che compaiono come dipendenti, soci, avvocati, fornitori o controparti del cliente NON sono clienti: il cliente è quello per cui si lavora.',
    '- Non confondere clienti con nomi simili: se il testo non basta a distinguerli, cliente null e tutti i possibili in candidati_cliente. Un nome dettato può avere lettere sbagliate o parole unite/spezzate.',
    '- "servizio" è l\'id di un servizio dell\'elenco, scelto dalle parole chiave e dal senso della frase; null se non si capisce o se più servizi sono plausibili (mettili in candidati_servizio). Non usare mai il servizio generico se non è detto esplicitamente.',
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
    ...clientiInviati.map((c) => `- ${c.id}: ${c.nome}`),
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
 * Valida la risposta del modello contro lo studio e i fatti locali.
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
    const candCliente = (Array.isArray(r.candidati_cliente) ? r.candidati_cliente : []).filter((x: unknown) => typeof x === 'string' && clientiOk.has(x)).slice(0, 4) as string[];
    const servizio = typeof r.servizio === 'string' ? servizi.get(r.servizio) : undefined;
    const servizioId = servizio && !servizio.generico ? servizio.id : null;
    const candServizio = (Array.isArray(r.candidati_servizio) ? r.candidati_servizio : []).filter((x: unknown) => typeof x === 'string' && servizi.has(x)).slice(0, 4) as string[];
    const minuti = typeof r.minuti === 'number' && Number.isInteger(r.minuti) && durateOk.has(r.minuti) ? r.minuti : null;
    const data = typeof r.data === 'string' && dateOk.has(r.data) ? r.data : fatti.date.some((d) => d.data === null) ? null : fatti.date.length ? null : ctx.oggi;
    const nota = typeof r.nota === 'string' && r.nota.trim() ? r.nota.trim().slice(0, 500) : null;
    out.push({
      cliente: { id: clienteId, candidati: clienteId ? [] : candCliente.map((id) => ({ id, nome: nomeCliente(id) })) },
      servizio: { id: servizioId, candidati: servizioId ? [] : candServizio.map((id) => ({ id, nome: servizi.get(id)!.nome })) },
      minuti,
      data,
      nota,
      motore: 'AI',
    });
  }
  return out;
}

export interface EsitoMotoreA {
  proposte: Proposta[];
  aiChiamata: boolean;
  /** Motivo per cui vale il solo passo 1, se così è andata. */
  ripiego?: string;
  usoTokens?: unknown;
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
  return { proposte: valide, aiChiamata: true, usoTokens: risposta.usoTokens };
}
