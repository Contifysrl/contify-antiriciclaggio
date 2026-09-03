import { useEffect, useState } from 'react';
import { api, formattaData } from '../api';
import { Riquadro } from '../componenti';
import { Badge } from '../components/ui';

// ── AR-M18: il fascicolo proposto ────────────────────────────────
// Riquadro del fascicolo che mostra ciò che il programma ha dedotto dai dati
// camerali: Tabella A (con motivazione e fonte), esecutore, checklist dei
// documenti, circostanze di legge, alert A9-A10. Il professionista applica,
// corregge (motivando) o ignora: niente qui produce effetti da solo.

export interface FattoreProposto {
  codice: string;
  etichetta: string;
  punteggio: number | null;
  stato: 'PROPOSTO' | 'CHIESTO';
  motivazione: string;
  fonte: string;
  daVerificare?: boolean;
}

export interface PropostaFascicoloDto {
  tabellaA: Record<string, FattoreProposto>;
  circostanze: Array<{ chiave: string; motivo: string }>;
  esecutore: {
    nominativo: string; codiceFiscale: string | null; carica: string; caricaTesto: string; rappresentanzaLegale: boolean; dataNomina: string | null;
    fonte: string; motivazione: string; alternative: Array<{ nominativo: string; codiceFiscale: string | null; carica: string; caricaTesto: string }>;
  } | null;
  checklist: Array<{ codice: string; etichetta: string; perche: string; norma: string; tipoDocumento: string; soggetto?: string; obbligatoria: boolean; presente: boolean | null }>;
  alert: Array<{ codice: 'A9' | 'A10'; gravita: 'alta' | 'media' | 'bassa'; titolo: string; messaggio: string; norma: string; fattore?: string }>;
  provenienza: string;
  motivazioneValutazione: string;
  alertTitolarita: Array<{ codice: string; gravita: string; titolo: string; messaggio: string; bloccante: boolean }>;
  titolariProposti: Array<{ denominazione: string; criterio: string }>;
  tabellaProvinceCompilata: boolean;
  data: string;
  proposte: any[];
  propostaRischioId: string | null;
  esecutoreRegistrato: any | null;
}

/** Ciò che il consolidamento della valutazione manda al server insieme ai punteggi. */
export interface ContestoProposta {
  id: string | null;
  punteggi: Record<string, number | null>;
  provenienza: string;
  motivazioni: string;
}

export function contestoDaProposta(p: PropostaFascicoloDto): ContestoProposta {
  return {
    id: p.propostaRischioId,
    punteggi: Object.fromEntries(Object.values(p.tabellaA).map((f) => [f.codice, f.punteggio])),
    provenienza: p.provenienza,
    motivazioni: Object.values(p.tabellaA).filter((f) => f.stato === 'PROPOSTO').map((f) => `${f.etichetta}: ${f.punteggio} — ${f.motivazione} [${f.fonte}]`).join(' · '),
  };
}

const TONO: Record<string, 'red' | 'amber' | 'gray'> = { alta: 'red', media: 'amber', bassa: 'gray' };

export function FascicoloProposto({ fascicoloId, clienteId, esente, valutata, aggiornaAl = 0, onApplicaTabellaA, onApplicaCircostanze, onEsecutoreRegistrato, vaiA }: {
  fascicoloId: string;
  /** Contatore che il fascicolo incrementa quando ricarica i dati: la proposta si ricalcola (documenti, esecutore). */
  aggiornaAl?: number;
  clienteId: string;
  /** Prestazione esente dalla verifica: la Tabella A non serve. */
  esente: boolean;
  /** C'è già una valutazione consolidata: la proposta resta consultabile ma non insiste. */
  valutata: boolean;
  onApplicaTabellaA: (punteggi: Record<string, number>, contesto: ContestoProposta) => void;
  onApplicaCircostanze: (chiavi: string[]) => void;
  onEsecutoreRegistrato: () => void;
  vaiA: (p: string) => void;
}) {
  const [p, setP] = useState<PropostaFascicoloDto | null>(null);
  const [errore, setErrore] = useState('');
  const [aperto, setAperto] = useState(!valutata);
  const [esecutoreForm, setEsecutoreForm] = useState<{ nominativo: string; codiceFiscale: string; caricaTesto: string; carica: string | null } | null>(null);
  const [invio, setInvio] = useState(false);

  const carica = () => api.get<PropostaFascicoloDto>(`/fascicoli/${fascicoloId}/proposta`).then(setP).catch((e) => setErrore(e.message));
  useEffect(() => { carica(); /* eslint-disable-next-line */ }, [fascicoloId, aggiornaAl]);

  if (errore) return <Riquadro tipo="avviso">Proposta del fascicolo non disponibile: {errore}</Riquadro>;
  if (!p) return null;

  const fattori = Object.values(p.tabellaA);
  const proposti = fattori.filter((f) => f.stato === 'PROPOSTO' && f.punteggio !== null);
  const chiesti = fattori.filter((f) => f.stato === 'CHIESTO');
  const registrato = p.esecutoreRegistrato;
  const propostaEsecutoreId = p.proposte.find((x) => x.ambito === 'ESECUTORE' && x.stato === 'PROPOSTA')?.id ?? null;

  async function registraEsecutore(corpo: any) {
    setInvio(true); setErrore('');
    try {
      await api.post(`/fascicoli/${fascicoloId}/esecutore`, { esecutore: corpo, propostaId: propostaEsecutoreId });
      setEsecutoreForm(null);
      await carica();
      onEsecutoreRegistrato();
    } catch (e) { setErrore((e as Error).message); } finally { setInvio(false); }
  }

  return (
    <div className="scheda" data-test="fascicolo-proposto">
      <div className="flex items-center justify-between gap-3">
        <h3 className="!mt-0 !mb-0">Fascicolo proposto dai dati camerali</h3>
        <button className="btn btn-ghost btn-sm" onClick={() => setAperto(!aperto)}>{aperto ? 'Riduci' : 'Mostra'}</button>
      </div>
      <div className="aiuto">
        Proposta calcolata il {formattaData(p.data)} — {p.provenienza}. Il programma propone, tu confermi o correggi: ogni scostamento resta motivato nel fascicolo.
        {' '}<a href={`#cliente?id=${clienteId}`} onClick={(e) => { e.preventDefault(); vaiA(`cliente?id=${clienteId}`); }}>Scheda del cliente</a>
      </div>

      {/* Alert A9-A10 e sintesi degli alert di titolarità */}
      {p.alert.map((a, i) => (
        <div key={i} className={`riquadro ${a.gravita === 'alta' ? 'critico' : a.gravita === 'media' ? 'avviso' : 'info'}`} data-test={`alert-${a.codice}`}>
          <strong>{a.codice} · {a.titolo}</strong> — {a.messaggio}
          <span className="norma">{a.norma}</span>
        </div>
      ))}
      {p.alertTitolarita.length > 0 && (
        <div className="riquadro info">
          Titolarità effettiva: {p.alertTitolarita.map((a) => <Badge key={a.codice} tone={TONO[a.gravita] ?? 'gray'}>{a.codice}</Badge>)}{' '}
          {p.alertTitolarita.filter((a) => a.bloccante).length > 0 ? 'ci sono alert bloccanti da chiudere nella scheda del cliente prima di registrare i titolari effettivi.' : 'gli alert si gestiscono nella scheda del cliente.'}
        </div>
      )}

      {aperto && (
        <>
          {/* Esecutore */}
          <h4>Esecutore (art. 1 co. 2 lett. p)</h4>
          {registrato ? (
            <p className="text-sm">
              Registrato: <strong>{registrato.nominativo}</strong>{registrato.caricaTesto ? ` — ${registrato.caricaTesto}` : ''}{registrato.codiceFiscale ? ` (${registrato.codiceFiscale})` : ''}.
              {' '}<button className="btn btn-ghost btn-sm" onClick={() => setEsecutoreForm({ nominativo: registrato.nominativo ?? '', codiceFiscale: registrato.codiceFiscale ?? '', caricaTesto: registrato.caricaTesto ?? '', carica: registrato.carica ?? null })}>Modifica</button>
            </p>
          ) : p.esecutore ? (
            <div className="riquadro info" data-test="esecutore-proposto">
              <strong>{p.esecutore.nominativo}</strong> — {p.esecutore.caricaTesto}{p.esecutore.rappresentanzaLegale ? ', rappresentante dell’impresa' : ''} <Badge tone="teal">proposto</Badge>
              <div className="text-sm mt-1">{p.esecutore.motivazione}</div>
              {p.esecutore.alternative.length > 0 && (
                <div className="text-xs text-ink-500 mt-1">In alternativa: {p.esecutore.alternative.map((a) => `${a.nominativo} (${a.caricaTesto})`).join('; ')}.</div>
              )}
              <div className="mt-2 flex gap-2 flex-wrap">
                <button className="btn btn-primary btn-sm" disabled={invio} data-test="registra-esecutore"
                  onClick={() => registraEsecutore({ nominativo: p.esecutore!.nominativo, codiceFiscale: p.esecutore!.codiceFiscale, carica: p.esecutore!.carica, caricaTesto: p.esecutore!.caricaTesto, fonte: p.esecutore!.fonte })}>
                  È lui/lei: registra come esecutore
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEsecutoreForm({ nominativo: '', codiceFiscale: '', caricaTesto: '', carica: null })}>È un’altra persona…</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-500">
              Nessuna carica con poteri in archivio: indica chi conferisce l’incarico.{' '}
              <button className="btn btn-secondary btn-sm" onClick={() => setEsecutoreForm({ nominativo: '', codiceFiscale: '', caricaTesto: '', carica: null })}>Indica l’esecutore</button>
            </p>
          )}
          {esecutoreForm && (
            <div className="griglia c3" style={{ marginTop: 8 }}>
              <div className="campo"><label>Nome e cognome</label><input value={esecutoreForm.nominativo} onChange={(e) => setEsecutoreForm({ ...esecutoreForm, nominativo: e.target.value })} /></div>
              <div className="campo"><label>Codice fiscale</label><input value={esecutoreForm.codiceFiscale} onChange={(e) => setEsecutoreForm({ ...esecutoreForm, codiceFiscale: e.target.value.toUpperCase() })} /></div>
              <div className="campo"><label>In qualità di</label><input value={esecutoreForm.caricaTesto} placeholder="es. procuratore, amministratore" onChange={(e) => setEsecutoreForm({ ...esecutoreForm, caricaTesto: e.target.value })} /></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <button className="btn btn-primary btn-sm" disabled={invio || !esecutoreForm.nominativo.trim()} onClick={() => registraEsecutore({ ...esecutoreForm, fonte: 'indicato dal professionista' })}>Registra</button>
                <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => setEsecutoreForm(null)}>Annulla</button>
              </div>
            </div>
          )}

          {/* Tabella A */}
          {!esente && (
            <>
              <h4>Tabella A proposta</h4>
              <table>
                <thead><tr><th>Fattore</th><th>Punteggio</th><th>Motivazione e fonte</th></tr></thead>
                <tbody>
                  {fattori.map((f) => (
                    <tr key={f.codice} data-test={`proposta-${f.codice}`}>
                      <td><strong>{f.etichetta}</strong></td>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                        {f.punteggio !== null ? <><span style={{ fontSize: 18, fontWeight: 700 }}>{f.punteggio}</span> <Badge tone="teal">proposto</Badge></> : <Badge tone={f.daVerificare ? 'amber' : 'gray'}>{f.daVerificare ? 'da verificare' : 'chiesto'}</Badge>}
                      </td>
                      <td className="text-sm">
                        {f.motivazione}
                        <div className="text-xs text-ink-400 mt-1">Fonte: {f.fonte}</div>
                        {f.codice === 'area_geografica_cliente' && f.daVerificare && !p.tabellaProvinceCompilata && (
                          <div className="text-xs mt-1"><a href="#impostazioni" onClick={(e) => { e.preventDefault(); vaiA('impostazioni'); }}>Compila la tabella delle province in Impostazioni</a></div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!valutata && proposti.length > 0 && (
                <div className="mt-2 flex gap-2 flex-wrap items-center">
                  <button className="btn btn-primary btn-sm" data-test="applica-tabella-a"
                    onClick={() => onApplicaTabellaA(Object.fromEntries(proposti.map((f) => [f.codice, f.punteggio as number])), contestoDaProposta(p))}>
                    Usa i punteggi proposti nella Tabella A
                  </button>
                  {chiesti.length > 0 && <span className="text-xs text-ink-500">Restano da valutare a mano: {chiesti.map((f) => f.etichetta).join(', ')}.</span>}
                </div>
              )}
              {p.circostanze.length > 0 && (
                <div className="riquadro avviso" style={{ marginTop: 10 }}>
                  <strong>Circostanze di legge suggerite:</strong>
                  <ul style={{ margin: '4px 0 0 18px' }}>{p.circostanze.map((c) => <li key={c.chiave}>{c.motivo} <span className="mono text-xs">({c.chiave})</span></li>)}</ul>
                  {!valutata && <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => onApplicaCircostanze(p.circostanze.map((c) => c.chiave))}>Spunta le circostanze suggerite</button>}
                </div>
              )}
            </>
          )}

          {/* Checklist documenti */}
          <h4>Documenti da raccogliere</h4>
          <table>
            <thead><tr><th>Stato</th><th>Documento</th><th>Perché</th></tr></thead>
            <tbody>
              {p.checklist.map((v) => (
                <tr key={v.codice} data-test={`checklist-${v.codice}`}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {v.presente === true ? <Badge tone="teal">presente</Badge> : v.presente === null ? <Badge tone="amber">da verificare</Badge> : <Badge tone={v.obbligatoria ? 'red' : 'gray'}>{v.obbligatoria ? 'manca' : 'consigliato'}</Badge>}
                  </td>
                  <td><strong>{v.etichetta}</strong><div className="text-xs text-ink-400 mono">{v.tipoDocumento.toLowerCase().replace(/_/g, ' ')}</div></td>
                  <td className="text-sm">{v.perche}<span className="norma">{v.norma}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex gap-2 flex-wrap items-center">
            <button className="btn btn-secondary btn-sm" data-test="scarica-art22"
              onClick={() => api.scarica(`/clienti/${clienteId}/dichiarazione-art22?fascicolo=${fascicoloId}`).catch((e) => setErrore(e.message))}>
              Dichiarazione art. 22 precompilata (.docx)
            </button>
            <span className="text-xs text-ink-500">Per la firma in presenza. A distanza: «Nuova richiesta al cliente» qui sotto, con la dichiarazione precompilata.</span>
          </div>
        </>
      )}
    </div>
  );
}
