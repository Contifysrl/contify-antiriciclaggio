import { useEffect, useMemo, useState } from 'react';
import { api, type ClasseRischio } from '../api';
import { PiedeLegale, PillolaRischio, Riquadro } from '../componenti';
import { Badge, HelpLink, SearchInput } from '../components/ui';

// ── AR-M19: il cruscotto di completezza («Da completare») ──────
// Per ogni cliente attivo il programma calcola cosa manca perché sia a
// posto e lo presenta come una lista finita, ordinata per rischio e per
// scadenza. Tono di servizio: «14 cose da completare», non «14 violazioni».

type Gravita = 'alta' | 'media' | 'bassa';
interface Mancanza { codice: string; etichetta: string; gravita: Gravita; norma: string; dettaglio: string; pagina: string; azione: string; fascicoloId?: string; giorniResidui?: number }
interface ClienteDaCompletare { id: string; denominazione: string; tipo: string; professionista: string | null; professionistaId: string | null; classe: ClasseRischio | null; mancanze: Mancanza[]; giorniPeggiore: number | null; urgente: boolean }
interface Regola { codice: string; etichetta: string; gravita: Gravita; norma: string; fonte: string; quando: string; pagina: string; azione: string }
export interface EsitoCompletezza {
  calcolatoIl: string; clientiAttivi: number; clientiCompleti: number; avanzamento: number; totaleMancanze: number;
  perGravita: Record<Gravita, number>; perRegola: Array<{ codice: string; etichetta: string; gravita: Gravita; n: number }>;
  clienti: ClienteDaCompletare[]; iniziaDa: Array<{ clienteId: string; denominazione: string; mancanza: Mancanza }>; regole: Regola[];
}

const TONO: Record<Gravita, 'red' | 'amber' | 'gray'> = { alta: 'red', media: 'amber', bassa: 'gray' };
const ETICHETTA_GRAVITA: Record<Gravita, string> = { alta: 'urgente', media: 'da fare', bassa: 'quando puoi' };

/** Dove porta una mancanza: pagina + parametri. */
export function percorsoMancanza(clienteId: string, m: Mancanza): string {
  switch (m.pagina) {
    case 'fascicolo': return m.fascicoloId ? `fascicolo?id=${m.fascicoloId}` : `fascicoli?cliente=${clienteId}`;
    case 'fascicoli': return `fascicoli?cliente=${clienteId}`;
    case 'cliente': return `cliente?id=${clienteId}`;
    case 'controlli': return 'controlli';
    case 'coda': return 'coda';
    default: return `cliente?id=${clienteId}`;
  }
}

export function BarraAvanzamento({ percentuale, etichetta }: { percentuale: number; etichetta?: string }) {
  return (
    <div data-test="barra-avanzamento">
      <div className="h-2.5 rounded-full bg-ink-100 overflow-hidden">
        <div className="h-full bg-teal-600 transition-all" style={{ width: `${Math.max(0, Math.min(100, percentuale))}%` }} />
      </div>
      {etichetta && <div className="text-xs text-ink-400 mt-1">{etichetta}</div>}
    </div>
  );
}

export function Completezza({ vaiA }: { vaiA: (p: string) => void }) {
  const [d, setD] = useState<EsitoCompletezza | null>(null);
  const [errore, setErrore] = useState('');
  const [gravita, setGravita] = useState<Gravita | ''>('');
  const [regola, setRegola] = useState('');
  const [cerca, setCerca] = useState('');
  const [mostraRegole, setMostraRegole] = useState(false);

  useEffect(() => { api.get<EsitoCompletezza>('/completezza').then(setD).catch((e) => setErrore(e.message)); }, []);

  const clienti = useMemo(() => {
    if (!d) return [];
    const q = cerca.trim().toLowerCase();
    return d.clienti
      .map((c) => ({ ...c, mancanze: c.mancanze.filter((m) => (!gravita || m.gravita === gravita) && (!regola || m.codice === regola)) }))
      .filter((c) => c.mancanze.length > 0 && (!q || c.denominazione.toLowerCase().includes(q) || (c.professionista ?? '').toLowerCase().includes(q)));
  }, [d, gravita, regola, cerca]);

  if (errore) return <Riquadro tipo="critico">{errore}</Riquadro>;
  if (!d) return <div className="caricamento">Caricamento…</div>;

  const tutto = d.totaleMancanze === 0;
  return (
    <>
      <h1>Da completare <HelpLink sezione="completezza" /></h1>
      <p className="occhiello">
        Per ogni cliente, cosa manca perché il fascicolo antiriciclaggio sia a posto: una lista finita, ordinata per urgenza,
        rischio e scadenza. Ogni voce dice la norma che la chiede e dove si risolve.
      </p>

      <div className="scheda" data-test="completezza-riepilogo">
        {tutto ? (
          <p className="text-lg font-semibold text-teal-700 !m-0">Tutto a posto: nessuna cosa da completare per i {d.clientiAttivi} clienti attivi.</p>
        ) : (
          <p className="text-lg font-semibold text-ink-900 !m-0">
            Oggi ti mancano <span className="font-mono">{d.totaleMancanze}</span> cose
            {d.perGravita.alta > 0 && <>, <span className="text-red-700">{d.perGravita.alta} urgent{d.perGravita.alta === 1 ? 'e' : 'i'}</span></>}
            . {d.clientiCompleti} clienti su {d.clientiAttivi} sono già a posto.
          </p>
        )}
        <div className="mt-3">
          <BarraAvanzamento percentuale={d.avanzamento} etichetta={`${d.avanzamento}% dei clienti attivi senza nulla da completare`} />
        </div>
        {d.iniziaDa.length > 0 && (
          <div className="mt-4" data-test="inizia-da">
            <div className="text-xs uppercase tracking-wide text-ink-400 font-semibold mb-1">Inizia da qui</div>
            <ol className="space-y-1 list-decimal ml-5">
              {d.iniziaDa.map((x, i) => (
                <li key={i}>
                  <button className="text-left hover:underline" onClick={() => vaiA(percorsoMancanza(x.clienteId, x.mancanza))}>
                    <strong>{x.denominazione}</strong> — {x.mancanza.etichetta.toLowerCase()} <Badge tone={TONO[x.mancanza.gravita]}>{ETICHETTA_GRAVITA[x.mancanza.gravita]}</Badge>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {!tutto && (
        <>
          <div className="flex flex-wrap gap-2 items-center mb-3" data-test="filtri">
            <SearchInput value={cerca} onChange={setCerca} placeholder="Cerca cliente o professionista" />
            <select className="input !w-auto" value={gravita} onChange={(e) => setGravita(e.target.value as Gravita | '')}>
              <option value="">Tutte le urgenze</option>
              <option value="alta">Urgenti ({d.perGravita.alta})</option>
              <option value="media">Da fare ({d.perGravita.media})</option>
              <option value="bassa">Quando puoi ({d.perGravita.bassa})</option>
            </select>
            <select className="input !w-auto" value={regola} onChange={(e) => setRegola(e.target.value)}>
              <option value="">Tutte le cose da fare</option>
              {d.perRegola.map((r) => <option key={r.codice} value={r.codice}>{r.etichetta} ({r.n})</option>)}
            </select>
            <button className="btn btn-ghost btn-sm ml-auto" onClick={() => setMostraRegole(!mostraRegole)}>{mostraRegole ? 'Nascondi le regole' : 'Da dove vengono queste regole?'}</button>
          </div>

          {mostraRegole && (
            <div className="scheda" data-test="regole">
              <h3>Le regole di completezza</h3>
              <p className="aiuto">Derivate dal DLgs. 231/2007 e dalla modulistica CNDCEC (Modello AV.1, Informativa n. 57/2026). Non sono inventate: ogni regola cita dove l’adempimento va documentato.</p>
              <div className="overflow-x-auto">
                <table>
                  <thead><tr><th>Regola</th><th>Urgenza</th><th>Quando scatta</th><th>Norma</th><th>Modulistica</th></tr></thead>
                  <tbody>
                    {d.regole.map((r) => (
                      <tr key={r.codice}>
                        <td className="font-semibold">{r.etichetta}</td>
                        <td><Badge tone={TONO[r.gravita]}>{ETICHETTA_GRAVITA[r.gravita]}</Badge></td>
                        <td className="text-xs">{r.quando}</td>
                        <td className="text-xs font-mono">{r.norma}</td>
                        <td className="text-xs">{r.fonte}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="space-y-3" data-test="elenco-clienti">
            {clienti.length === 0 && <p className="caricamento">Nessun cliente corrisponde ai filtri.</p>}
            {clienti.map((c) => (
              <div key={c.id} className={`card p-4 ${c.urgente ? 'border-red-200' : ''}`} data-test="cliente-da-completare">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <button className="font-bold text-ink-900 hover:underline" onClick={() => vaiA(`cliente?id=${c.id}`)}>{c.denominazione}</button>
                  {c.classe && <PillolaRischio classe={c.classe} />}
                  {c.professionista && <span className="text-xs text-ink-400">· {c.professionista}</span>}
                  <span className="text-xs text-ink-400 ml-auto">{c.mancanze.length} {c.mancanze.length === 1 ? 'cosa' : 'cose'} da completare</span>
                </div>
                <ul className="space-y-1.5">
                  {c.mancanze.map((m, i) => (
                    <li key={`${m.codice}-${i}`} className="flex flex-wrap items-start gap-2 text-sm">
                      <Badge tone={TONO[m.gravita]}>{ETICHETTA_GRAVITA[m.gravita]}</Badge>
                      <div className="flex-1 min-w-[200px]">
                        <strong>{m.etichetta}</strong> <span className="text-ink-600">— {m.dettaglio}</span>
                        <div className="font-mono text-[11px] text-ink-400">{m.norma}</div>
                      </div>
                      <button className="btn btn-secondary btn-sm shrink-0" onClick={() => vaiA(percorsoMancanza(c.id, m))}>{m.azione}</button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
      <PiedeLegale />
    </>
  );
}
