/**
 * PROPOSTA DEL FASCICOLO (AR-M18) — lato worker
 *
 * Raccoglie i fatti dall'archivio (anagrafica e dettagli cifrati, compagine,
 * proposta di titolarità viva con alert A1-A8, titolari registrati, documenti
 * conservati, tabella delle province dello studio) e chiama il motore puro
 * `proponiFascicolo`. Qui nessuna regola di dominio: solo letture.
 */

import type { Env } from './tipi';
import { decifra } from './crypto';
import { leggiCompagine, propostaTitolarita } from './compagine';
import { paeseAltoRischio } from '../domain/norme';
import { proponiFascicolo, type FascicoloProposto, type InputFascicoloProposto } from '../domain/fascicolo-proposto';
import type { TabellaProvinceContante } from '../domain/province';
import type { SocioCompagine } from '../domain/alert-titolarita';

const oggi = () => new Date().toISOString().slice(0, 10);

export async function parametriTenant(env: Env, tenantId: string): Promise<Record<string, any>> {
  const t = await env.DB.prepare('SELECT parametri FROM tenants WHERE id = ?').bind(tenantId).first<any>();
  try { return JSON.parse(t?.parametri ?? '{}') ?? {}; } catch { return {}; }
}

export function tabellaProvince(parametri: Record<string, any>): TabellaProvinceContante | null {
  const p = parametri?.provinceContante;
  if (!p || !Array.isArray(p.province)) return null;
  return {
    fonte: String(p.fonte ?? ''), dataFonte: p.dataFonte ?? null, aggiornatoIl: String(p.aggiornatoIl ?? ''), aggiornatoDa: p.aggiornatoDa ?? null,
    province: p.province.map((r: any) => ({ sigla: String(r.sigla).toUpperCase(), livello: r.livello === 'ALTO' ? 'ALTO' : 'MEDIO_ALTO' })),
  };
}

export async function dettagliCliente(env: Env, tenantId: string, cliente: any): Promise<Record<string, any> | null> {
  if (!cliente?.dati_identificativi) return null;
  try {
    const raw = typeof cliente.dati_identificativi === 'string' ? JSON.parse(cliente.dati_identificativi) : cliente.dati_identificativi;
    if (raw && typeof raw === 'object' && 'contenuto' in raw) return JSON.parse(await decifra(env.MASTER_KEY, tenantId, raw));
    return raw;
  } catch {
    return null;
  }
}

export interface PropostaFascicoloCompleta extends FascicoloProposto {
  /** Proposta di titolarità viva (alert A1-A8, analisi), per il riquadro del fascicolo. */
  titolarita: Awaited<ReturnType<typeof propostaTitolarita>>;
  tabellaProvinceCompilata: boolean;
  data: string;
}

/**
 * Proposta viva per un cliente (ed eventualmente per un fascicolo, di cui si
 * considerano anche i documenti e l'esecutore già registrato).
 */
export async function propostaFascicolo(
  env: Env,
  tenantId: string,
  cliente: any,
  fascicolo: { id: string; esecutore?: string | null } | null = null,
): Promise<PropostaFascicoloCompleta> {
  const data = oggi();
  const [parametri, dettagli, titolarita] = await Promise.all([
    parametriTenant(env, tenantId),
    dettagliCliente(env, tenantId, cliente),
    propostaTitolarita(env, tenantId, { id: cliente.id, denominazione: cliente.denominazione, tipo: cliente.tipo, codice_fiscale: cliente.codice_fiscale }),
  ]);
  const provinceContante = tabellaProvince(parametri);

  const { results: titolariRegistrati } = await env.DB.prepare(
    'SELECT nominativo, codice_fiscale, pep FROM titolari_effettivi WHERE cliente_id = ? AND tenant_id = ? AND valido_al IS NULL',
  ).bind(cliente.id, tenantId).all<any>();
  const { results: documenti } = await env.DB.prepare(
    fascicolo
      ? 'SELECT tipo, data_riferimento, fascicolo_id FROM documenti WHERE tenant_id = ? AND (cliente_id = ? OR fascicolo_id = ?)'
      : 'SELECT tipo, data_riferimento, fascicolo_id FROM documenti WHERE tenant_id = ? AND cliente_id = ?',
  ).bind(tenantId, cliente.id, ...(fascicolo ? [fascicolo.id] : [])).all<any>();

  const idSocio = (s: { cfHash: string | null; nome: string }) => s.cfHash ?? s.nome.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const soci: SocioCompagine[] = titolarita.soci.map((s) => ({
    id: idSocio(s), nome: s.nome, tipo: s.tipo, quota: s.quotaPercento / 100, diritto: s.diritto ?? 'PROPRIETA', paese: s.paese ?? undefined,
    quoteProprie: s.quoteProprie, comproprieta: s.comproprieta,
    clienteStudio: s.socioClienteId ? { id: s.socioClienteId, denominazione: s.nome, visuraDel: titolarita.catena.find((c) => c.clienteId === s.socioClienteId)?.visuraDel ?? null } : null,
  }));

  let esecutoreRegistrato: any = null;
  if (fascicolo?.esecutore) { try { esecutoreRegistrato = JSON.parse(fascicolo.esecutore); } catch { esecutoreRegistrato = null; } }

  const input: InputFascicoloProposto = {
    data,
    cliente: {
      id: cliente.id, denominazione: cliente.denominazione, tipo: cliente.tipo, ateco: cliente.ateco, attivitaPrevalente: cliente.attivita_prevalente,
      paeseResidenza: cliente.paese_residenza, pep: cliente.pep === 1 || cliente.pep === true,
      dettagli: dettagli
        ? {
            sede: dettagli.sede ?? null, provincia: dettagli.provincia ?? null, formaGiuridica: dettagli.formaGiuridica ?? null,
            capitaleSociale: dettagli.capitaleSociale != null ? Number(dettagli.capitaleSociale) : null,
            capitaleVersato: dettagli.capitaleVersato != null ? Number(dettagli.capitaleVersato) : null,
            dataCostituzione: dettagli.dataCostituzione ?? null, statoAttivita: dettagli.statoAttivita ?? null,
            inLiquidazione: dettagli.inLiquidazione ?? null, proceduraConcorsuale: dettagli.proceduraConcorsuale ?? null,
            oggettoSociale: dettagli.oggettoSociale ?? null, visuraDel: dettagli.visuraDel ?? null,
          }
        : null,
    },
    soci,
    cariche: titolarita.cariche.map((c) => ({
      id: c.cfHash ?? c.nome.toUpperCase().replace(/[^A-Z0-9]+/g, '_'), nome: c.nome, codiceFiscale: c.codiceFiscale ?? null, carica: c.carica,
      caricaTesto: c.caricaTesto ?? null, rappresentanzaLegale: c.rappresentanzaLegale, dataNomina: c.dataNomina ?? null, poteri: c.poteri ?? null,
    })),
    analisi: titolarita.soci.length ? titolarita.analisi : null,
    alertTitolarita: titolarita.alert,
    catena: titolarita.catena,
    titolariRegistrati: (titolariRegistrati ?? []).map((t: any) => ({ nominativo: t.nominativo, codiceFiscale: t.codice_fiscale, pep: t.pep === 1 })),
    documenti: (documenti ?? []).map((d: any) => ({ tipo: d.tipo, dataRiferimento: d.data_riferimento, fascicoloId: d.fascicolo_id })),
    provinceContante,
    paeseAltoRischio: (p) => paeseAltoRischio(p, data),
    esecutoreRegistrato,
  };
  const proposta = proponiFascicolo(input);
  return { ...proposta, titolarita, tabellaProvinceCompilata: Boolean(provinceContante && provinceContante.province.length), data };
}

/** Compagine in chiaro: riusata dalla dichiarazione art. 22. */
export { leggiCompagine };
