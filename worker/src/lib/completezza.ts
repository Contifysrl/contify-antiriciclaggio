/**
 * CRUSCOTTO DI COMPLETEZZA (AR-M19) — lettura dei dati per tenant.
 *
 * Qui si raccolgono, con poche query, tutti i fatti che il motore puro
 * (`domain/completezza.ts`) trasforma nella lista delle cose da completare:
 * clienti attivi, fascicoli con l'ultima valutazione e le loro scadenze
 * (stesso calcolo dello scadenzario, o i conti non tornerebbero fra le
 * pagine), titolari effettivi vigenti, documenti conservati, proposte in
 * attesa, corrispondenze da decidere, PEP chiesto.
 */

import type { Env } from './tipi';
import { calcolaScadenzeFascicolo, statoScadenze } from '../domain/scadenze';
import { trovaPrestazione } from '../domain/prestazioni';
import { statoRegistroClienti } from './registro-te';
import { calcolaCompletezza, type ClienteCompletezza, type EsitoCompletezza, type FascicoloCompletezza } from '../domain/completezza';

const oggi = () => new Date().toISOString().slice(0, 10);

export async function leggiClientiCompletezza(env: Env, tenantId: string): Promise<ClienteCompletezza[]> {
  const db = env.DB;
  const [clienti, fascicoli, titolari, documenti, proposte, screening, richieste] = await Promise.all([
    db.prepare(
      `SELECT c.id, c.denominazione, c.tipo, c.pep, c.professionista_id, u.nome AS professionista
       FROM clienti c LEFT JOIN utenti u ON u.id = c.professionista_id
       WHERE c.tenant_id = ? AND c.attivo = 1 ORDER BY c.denominazione`,
    ).bind(tenantId).all<any>(),
    db.prepare(
      `SELECT f.id, f.codice, f.cliente_id, f.prestazione_codice, f.data_conferimento, f.data_cessazione, f.ultimo_controllo, f.stato,
              v.classe, v.controllo_costante_mesi, v.esente_verifica, v.firmata_il, v.data_valutazione
       FROM fascicoli f
       LEFT JOIN valutazioni_rischio v ON v.id = (SELECT id FROM valutazioni_rischio WHERE fascicolo_id = f.id ORDER BY versione DESC LIMIT 1)
       WHERE f.tenant_id = ?`,
    ).bind(tenantId).all<any>(),
    db.prepare('SELECT cliente_id, COUNT(*) AS n FROM titolari_effettivi WHERE tenant_id = ? AND valido_al IS NULL GROUP BY cliente_id').bind(tenantId).all<any>(),
    db.prepare(
      `SELECT d.tipo, d.data_riferimento, d.fascicolo_id, COALESCE(d.cliente_id, f.cliente_id) AS cliente_id
       FROM documenti d LEFT JOIN fascicoli f ON f.id = d.fascicolo_id WHERE d.tenant_id = ?`,
    ).bind(tenantId).all<any>(),
    db.prepare("SELECT id, cliente_id, ambito, alert FROM proposte WHERE tenant_id = ? AND stato = 'PROPOSTA' AND cliente_id IS NOT NULL").bind(tenantId).all<any>(),
    db.prepare(
      `SELECT COALESCE(
          CASE s.soggetto_tipo WHEN 'CLIENTE' THEN s.soggetto_id END,
          t.cliente_id, p.cliente_id, k.cliente_id) AS cliente_id, COUNT(*) AS n
       FROM screening_esiti s
       LEFT JOIN titolari_effettivi t ON s.soggetto_tipo = 'TITOLARE_EFFETTIVO' AND t.id = s.soggetto_id
       LEFT JOIN partecipazioni p ON s.soggetto_tipo = 'SOCIO' AND p.id = s.soggetto_id
       LEFT JOIN cariche k ON s.soggetto_tipo = 'CARICA' AND k.id = s.soggetto_id
       WHERE s.tenant_id = ? AND s.stato = 'DA_ESAMINARE' GROUP BY 1`,
    ).bind(tenantId).all<any>(),
    db.prepare("SELECT cliente_id, richieste FROM richieste_verifica WHERE tenant_id = ? AND stato IN ('COMPLETATA','ACQUISITA')").bind(tenantId).all<any>(),
  ]);
  // AR-M20-03: registro dei titolari effettivi.
  const [registro, titolariData] = await Promise.all([
    statoRegistroClienti(env, tenantId),
    db.prepare('SELECT cliente_id, MAX(valido_dal) AS dal FROM titolari_effettivi WHERE tenant_id = ? AND valido_al IS NULL GROUP BY cliente_id').bind(tenantId).all<any>(),
  ]);
  const titolariDal = new Map<string, string>((titolariData.results ?? []).map((r: any) => [r.cliente_id, String(r.dal ?? '')]));

  const data = oggi();
  const perCliente = new Map<string, FascicoloCompletezza[]>();
  for (const f of fascicoli.results ?? []) {
    const esente = f.classe != null ? Boolean(f.esente_verifica) : Boolean(trovaPrestazione(f.prestazione_codice)?.esenteAdeguataVerifica);
    const valutazione = f.classe != null
      ? { firmata: Boolean(f.firmata_il), classe: f.classe, dataValutazione: String(f.data_valutazione ?? '').slice(0, 10), controlloCostanteMesi: f.controllo_costante_mesi ?? 0 }
      : null;
    const scadenze = statoScadenze(
      calcolaScadenzeFascicolo({
        dataConferimentoIncarico: f.data_conferimento, dataCessazione: f.data_cessazione, classeRischio: f.classe ?? 'POCO_SIGNIFICATIVO',
        controlloCostanteMesi: f.controllo_costante_mesi ?? 0, ultimoControllo: f.ultimo_controllo, esenteAdeguataVerifica: esente,
        verificaCompletataIl: f.firmata_il ?? (f.stato === 'ASTENSIONE' ? f.data_conferimento : null),
      }),
      data,
    );
    const lista = perCliente.get(f.cliente_id) ?? [];
    lista.push({
      id: f.id, codice: f.codice, stato: f.stato, dataConferimento: f.data_conferimento, dataCessazione: f.data_cessazione ?? null,
      prestazioneCodice: f.prestazione_codice, esenteVerifica: esente, valutazione, scadenze, ultimoControllo: f.ultimo_controllo ?? null,
    });
    perCliente.set(f.cliente_id, lista);
  }

  const nTitolari = new Map<string, number>((titolari.results ?? []).map((r: any) => [r.cliente_id, r.n]));
  const docs = new Map<string, ClienteCompletezza['documenti']>();
  for (const d of documenti.results ?? []) {
    if (!d.cliente_id) continue;
    const l = docs.get(d.cliente_id) ?? [];
    l.push({ tipo: d.tipo, dataRiferimento: d.data_riferimento ?? null, fascicoloId: d.fascicolo_id ?? null });
    docs.set(d.cliente_id, l);
  }
  const props = new Map<string, ClienteCompletezza['proposteAperte']>();
  for (const p of proposte.results ?? []) {
    const l = props.get(p.cliente_id) ?? [];
    let alert: any[] = [];
    try { alert = JSON.parse(p.alert ?? '[]'); } catch { alert = []; }
    l.push({ id: p.id, ambito: p.ambito, alert });
    props.set(p.cliente_id, l);
  }
  const nScreening = new Map<string, number>((screening.results ?? []).filter((r: any) => r.cliente_id).map((r: any) => [r.cliente_id, r.n]));
  const pepChiesto = new Set<string>();
  for (const r of richieste.results ?? []) {
    try {
      const q = JSON.parse(r.richieste ?? '{}');
      if (q.pep !== false || q.dichiarazioneTe) pepChiesto.add(r.cliente_id);
    } catch { /* richiesta illeggibile: non conta */ }
  }
  for (const d of documenti.results ?? []) {
    if (d.cliente_id && (d.tipo === 'DICHIARAZIONE_ART22' || d.tipo === 'AUTOCERTIFICAZIONE_TE')) pepChiesto.add(d.cliente_id);
  }

  return (clienti.results ?? []).map((c: any) => ({
    id: c.id, denominazione: c.denominazione, tipo: c.tipo, professionista: c.professionista ?? null, professionistaId: c.professionista_id ?? null,
    pep: c.pep === 1, fascicoli: perCliente.get(c.id) ?? [], titolariVigenti: nTitolari.get(c.id) ?? 0, documenti: docs.get(c.id) ?? [],
    proposteAperte: props.get(c.id) ?? [], screeningDaEsaminare: nScreening.get(c.id) ?? 0, pepChiesto: pepChiesto.has(c.id),
    registroTe: (() => {
      const r = registro.get(c.id);
      return { titolariRegistratiIl: titolariDal.get(c.id) || null, ultima: r?.ultima ? { data: r.ultima.data, esito: r.ultima.esito, prova: r.ultima.prova } : null, daSegnalare: r?.daSegnalare.length ?? 0 };
    })(),
  }));
}

export async function completezzaStudio(env: Env, tenantId: string): Promise<EsitoCompletezza> {
  return calcolaCompletezza(await leggiClientiCompletezza(env, tenantId), oggi());
}
