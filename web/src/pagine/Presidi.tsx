import { useEffect, useState } from 'react';
import { api, dataOggi, formattaData } from '../api';
import { PiedeLegale, Riquadro, Tessera } from '../componenti';

// ===========================================================================
export function Scadenzario({ vaiA }: { vaiA: (p: string) => void }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { api.get('/scadenzario').then(setD); }, []);
  if (!d) return <div className="caricamento">Caricamento…</div>;

  const sezione = (titolo: string, voci: any[], tipo: 'critico' | 'avviso' | 'info') =>
    voci.length > 0 && (
      <>
        <h2>{titolo}</h2>
        <div className="scheda">
          <table>
            <thead><tr><th>Fascicolo</th><th>Cliente</th><th>Adempimento</th><th>Termine</th><th>Giorni</th><th>Fonte</th></tr></thead>
            <tbody>
              {voci.map((s, i) => (
                <tr key={i} style={{ cursor: 'pointer' }} onClick={() => vaiA(`fascicolo?id=${s.fascicoloId}`)}>
                  <td className="mono">{s.codice}</td>
                  <td>{s.cliente}</td>
                  <td>{s.etichetta}</td>
                  <td className="mono">{formattaData(s.data)}</td>
                  <td className="mono">{s.giorniResidui}</td>
                  <td className="mono" style={{ color: 'var(--c-grey)' }}>
                    {s.norma}{!s.normativa && ' · parametro di studio'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );

  return (
    <>
      <h1>Scadenzario</h1>
      <p className="occhiello">
        Termini di legge e adempimenti organizzativi, distinti fra loro. I primi sono contestabili in sede ispettiva,
        i secondi sono scelte documentate dello studio e restano modificabili nelle impostazioni.
      </p>
      <div className="griglia c3">
        <Tessera etichetta="Scadute" valore={d.scadute.length} />
        <Tessera etichetta="Entro 30 giorni" valore={d.inScadenza.length} />
        <Tessera etichetta="Future" valore={d.future.length} />
      </div>
      {sezione('Scadute', d.scadute, 'critico')}
      {sezione('In scadenza', d.inScadenza, 'avviso')}
      {sezione('Future', d.future, 'info')}
      {d.scadute.length + d.inScadenza.length + d.future.length === 0 && (
        <Riquadro tipo="info">Nessuna scadenza calcolabile: apri un fascicolo per popolare lo scadenzario.</Riquadro>
      )}
      <PiedeLegale />
    </>
  );
}

// ===========================================================================
export function Contante() {
  const [importo, setImporto] = useState<number>(5000);
  const [data, setData] = useState(dataOggi());
  const [tipo, setTipo] = useState('CONTANTE');
  const [intermediario, setIntermediario] = useState(false);
  const [esito, setEsito] = useState<any>(null);
  const [soglie, setSoglie] = useState<any>(null);

  useEffect(() => { api.get('/catalogo/soglie').then(setSoglie); }, []);

  async function verifica() {
    setEsito(await api.post('/strumenti/contante', { importo, data, tipo, intermediarioParte: intermediario }));
  }

  return (
    <>
      <h1>Limitazioni all’uso del contante</h1>
      <p className="occhiello">
        Art. 49 del DLgs. 231/2007. La soglia applicabile è quella vigente alla data dell’operazione, non quella
        odierna: un pagamento del 2021 va giudicato con il limite di 2.000 euro, non con quello attuale.
      </p>

      <div className="scheda">
        <div className="griglia c3">
          <div className="campo">
            <label>Importo</label>
            <input type="number" value={importo} onChange={(e) => setImporto(Number(e.target.value))} />
          </div>
          <div className="campo">
            <label>Data dell’operazione</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="campo">
            <label>Fattispecie</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="CONTANTE">Trasferimento di contante o titoli al portatore (co. 1)</option>
              <option value="RIMESSA_DENARO">Rimessa di denaro / money transfer (co. 2)</option>
              <option value="NEGOZIAZIONE_VALUTA">Negoziazione a pronti in valuta (co. 3)</option>
            </select>
          </div>
        </div>
        <label style={{ fontWeight: 400 }}>
          <input
            type="checkbox"
            style={{ width: 'auto', marginRight: 8 }}
            checked={intermediario}
            onChange={(e) => setIntermediario(e.target.checked)}
          />
          È parte del trasferimento una banca, Poste, un istituto di moneta elettronica o di pagamento (co. 13)
        </label>
        <div style={{ marginTop: 14 }}>
          <button className="azione" onClick={verifica}>Verifica</button>
        </div>
      </div>

      {esito && (
        <Riquadro tipo={esito.conforme ? 'info' : 'critico'}>
          <strong>{esito.conforme ? 'Operazione consentita' : 'Trasferimento vietato'}</strong>
          <p style={{ margin: '8px 0 0' }}>{esito.messaggio}</p>
          {esito.comunicazioneMef && (
            <p style={{ margin: '8px 0 0' }}>
              Comunicazione al MEF — Ragioneria territoriale dello Stato entro il{' '}
              <strong>{formattaData(esito.scadenzaComunicazioneMef)}</strong>.
            </p>
          )}
          <span className="norma">{esito.norma} · {esito.fonte}</span>
        </Riquadro>
      )}

      {soglie && (
        <>
          <h2>Storia delle soglie</h2>
          <div className="scheda">
            <table>
              <thead><tr><th>Fattispecie</th><th>Dal</th><th>Al</th><th>Soglia</th><th>Fonte</th></tr></thead>
              <tbody>
                {soglie.soglie.flatMap((s: any) =>
                  s.serie.map((v: any, i: number) => (
                    <tr key={`${s.codice}-${i}`}>
                      <td>{i === 0 ? s.etichetta : ''}</td>
                      <td className="mono">{formattaData(v.da)}</td>
                      <td className="mono">{v.a ? formattaData(v.a) : 'in vigore'}</td>
                      <td className="mono">{v.valore.toLocaleString('it-IT')} €</td>
                      <td className="mono" style={{ color: 'var(--c-grey)' }}>{v.fonte}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      <PiedeLegale />
    </>
  );
}

// ===========================================================================
export function Sos() {
  const [lista, setLista] = useState<any[]>([]);
  const [indicatori, setIndicatori] = useState<any>(null);
  const [nuova, setNuova] = useState(false);
  const [f, setF] = useState<any>({ dataRilevazione: dataOggi(), canale: 'UIF_DIRETTA', indicatori: [] as number[] });
  const [promemoria, setPromemoria] = useState<string[]>([]);
  const [errore, setErrore] = useState('');

  const carica = () => api.get<any[]>('/sos').then(setLista).catch((e) => setErrore(e.message));
  useEffect(() => { carica(); api.get('/catalogo/indicatori').then(setIndicatori); }, []);

  async function salva() {
    setErrore('');
    try {
      const r = await api.post<{ promemoria: string[] }>('/sos', f);
      setPromemoria(r.promemoria);
      setNuova(false);
      setF({ dataRilevazione: dataOggi(), canale: 'UIF_DIRETTA', indicatori: [] });
      carica();
    } catch (e) { setErrore((e as Error).message); }
  }

  function toggleIndicatore(n: number) {
    setF((s: any) => ({
      ...s,
      indicatori: s.indicatori.includes(n)
        ? s.indicatori.filter((x: number | string) => x !== n && !String(x).startsWith(`${n}.`))
        : [...s.indicatori, n],
    }));
  }

  // Il sub-indice è il livello che si cita nella segnalazione ("20.9").
  // Selezionarlo seleziona anche l'indicatore padre.
  function toggleSubIndice(codice: string) {
    const padre = Number(codice.split('.')[0]);
    setF((s: any) => {
      if (s.indicatori.includes(codice)) {
        return { ...s, indicatori: s.indicatori.filter((x: number | string) => x !== codice) };
      }
      const conPadre = s.indicatori.includes(padre) ? s.indicatori : [...s.indicatori, padre];
      return { ...s, indicatori: [...conPadre, codice] };
    });
  }

  return (
    <>
      <h1>Segnalazioni di operazione sospetta</h1>
      <p className="occhiello">
        Artt. 35-39. L’accesso è riservato al titolare: l’art. 38 impone di assicurare la riservatezza dell’identità
        del segnalante e punisce con la reclusione da due a sei anni chi la rivela indebitamente. Il contenuto delle
        segnalazioni è cifrato con la chiave dello studio.
      </p>

      {promemoria.map((p, i) => <Riquadro key={i} tipo="avviso">{p}</Riquadro>)}
      {errore && <Riquadro tipo="critico">{errore}</Riquadro>}

      <button className="azione" onClick={() => setNuova(!nuova)}>{nuova ? 'Annulla' : 'Nuova segnalazione'}</button>

      {nuova && (
        <div className="scheda" style={{ marginTop: 14 }}>
          <div className="griglia c3">
            <div className="campo">
              <label>Data di rilevazione</label>
              <input type="date" value={f.dataRilevazione} onChange={(e) => setF({ ...f, dataRilevazione: e.target.value })} />
            </div>
            <div className="campo">
              <label>Canale di trasmissione</label>
              <select value={f.canale} onChange={(e) => setF({ ...f, canale: e.target.value })}>
                <option value="UIF_DIRETTA">Direttamente alla UIF</option>
                <option value="ORGANISMO_AUTOREGOLAMENTAZIONE">Tramite l’organismo di autoregolamentazione</option>
              </select>
              <div className="aiuto">Art. 37 co. 1. L’organismo inoltra la segnalazione priva del nominativo del segnalante.</div>
            </div>
            <div className="campo">
              <label>Operazione già eseguita</label>
              <select
                value={f.operazioneEseguita ? 'si' : 'no'}
                onChange={(e) => setF({ ...f, operazioneEseguita: e.target.value === 'si' })}
              >
                <option value="no">No, sospesa in attesa della segnalazione</option>
                <option value="si">Sì, eseguita</option>
              </select>
            </div>
          </div>

          {f.operazioneEseguita && (
            <div className="campo">
              <label>Motivo dell’esecuzione anticipata</label>
              <div className="aiuto">
                Art. 35 co. 2: obbligo di legge di ricevere l’atto, impossibilità di rinvio tenuto conto della normale
                operatività, o rischio che il differimento ostacoli le indagini. In tali casi la UIF va informata
                immediatamente dopo l’esecuzione.
              </div>
              <textarea value={f.motivoEsecuzione ?? ''} onChange={(e) => setF({ ...f, motivoEsecuzione: e.target.value })} />
            </div>
          )}

          <div className="campo">
            <label>Descrizione dell’operazione</label>
            <div className="aiuto">Art. 35 co. 3.</div>
            <textarea value={f.descrizioneOperazione ?? ''} onChange={(e) => setF({ ...f, descrizioneOperazione: e.target.value })} />
          </div>
          <div className="campo">
            <label>Motivi del sospetto</label>
            <div className="aiuto">
              Caratteristiche, entità, natura dell’operazione, collegamento o frazionamento, capacità economica e
              attività del soggetto.
            </div>
            <textarea value={f.motiviSospetto ?? ''} onChange={(e) => setF({ ...f, motiviSospetto: e.target.value })} />
          </div>

          {indicatori && (
            <div className="campo">
              <label>Indicatori di anomalia ricorrenti</label>
              <div className="aiuto">
                Provvedimento UIF 12.5.2023, applicabile dal 1.1.2024. Sono mostrati gli indicatori che il CNDCEC
                ritiene rilevanti o potenzialmente rilevanti per i commercialisti.
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e2ecec', borderRadius: 8, padding: 10 }}>
                {indicatori.indicatori
                  .filter((i: any) => i.rilevanzaCommercialista !== 'NON_RILEVANTE')
                  .map((i: any) => (
                    <div key={i.numero} style={{ marginBottom: 6 }}>
                      <label style={{ fontWeight: 400, fontSize: 13 }} title={i.titoloUfficiale}>
                        <input
                          type="checkbox"
                          style={{ width: 'auto', marginRight: 8 }}
                          checked={f.indicatori.includes(i.numero)}
                          onChange={() => toggleIndicatore(i.numero)}
                        />
                        <span className="mono">{i.sezione}{i.numero}</span> — {i.titolo}
                      </label>
                      {(indicatori.subIndici?.[i.numero] ?? []).length > 0 && (
                        <details style={{ marginLeft: 26 }}>
                          <summary style={{ fontSize: 12, color: '#5a7a7a', cursor: 'pointer' }}>
                            Sub-indici ({indicatori.subIndici[i.numero].length}) — nella segnalazione si cita il sub-indice
                          </summary>
                          <div style={{ fontSize: 12, margin: '4px 0 8px', color: '#41605f' }}>{i.titoloUfficiale}</div>
                          {indicatori.subIndici[i.numero].map((t: string, idx: number) => {
                            const codice = `${i.numero}.${idx + 1}`;
                            return (
                              <label key={codice} style={{ fontWeight: 400, fontSize: 12, display: 'block', marginBottom: 4 }}>
                                <input
                                  type="checkbox"
                                  style={{ width: 'auto', marginRight: 8 }}
                                  checked={f.indicatori.includes(codice)}
                                  onChange={() => toggleSubIndice(codice)}
                                />
                                <span className="mono">{codice}</span> {t}
                              </label>
                            );
                          })}
                        </details>
                      )}
                    </div>
                  ))}
              </div>
              <Riquadro tipo="avviso">{indicatori.avviso}</Riquadro>
            </div>
          )}

          <button
            className="azione"
            onClick={salva}
            disabled={!f.descrizioneOperazione || !f.motiviSospetto}
          >
            Registra la segnalazione
          </button>
        </div>
      )}

      <div className="scheda" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>Protocollo</th><th>Rilevazione</th><th>Stato</th><th>Canale</th><th>Trasmessa</th><th>Indicatori</th></tr></thead>
          <tbody>
            {lista.map((s) => (
              <tr key={s.id}>
                <td className="mono">{s.protocollo}</td>
                <td className="mono">{formattaData(s.data_rilevazione)}</td>
                <td><span className="pillola r2">{s.stato.toLowerCase().replace(/_/g, ' ')}</span></td>
                <td>{s.canale === 'UIF_DIRETTA' ? 'UIF' : 'Organismo'}</td>
                <td className="mono">{formattaData(s.data_trasmissione)}</td>
                <td className="mono">{JSON.parse(s.indicatori || '[]').join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {lista.length === 0 && !errore && <p className="caricamento">Nessuna segnalazione registrata.</p>}
      </div>
      <PiedeLegale />
    </>
  );
}
