import { useEffect, useMemo, useState } from 'react';
import {
  api,
  dataOggi,
  formattaData,
  type ClasseRischio,
  type EsitoProfilo,
  type Prestazione,
  type Ruleset,
} from '../api';
import { ElencoVincoli, GruppoFattori, PiedeLegale, PillolaRischio, Riquadro, Tessera } from '../componenti';
import { HelpLink } from '../components/ui';
import { CampiCliente, etichettaTipo } from './Cliente';
import { ImportClientiModal } from './ImportClienti';
import { VisuraModal } from './Visura';
import { TitolaritaEffettiva, VerificaADistanza } from './TitolaritaVerifica';
import { BozzaAi } from './BozzaAi';
import { ControlloCostanteBox } from './ControlloCostante';
import { FascicoloProposto, type ContestoProposta } from './FascicoloProposto';
import { CampoProfessionista, FiltroProfessionista, useProfessionisti } from '../lib/professionisti';

// ===========================================================================
export function Clienti({ vaiA }: { vaiA: (p: string) => void }) {
  const [lista, setLista] = useState<any[]>([]);
  const [nuovo, setNuovo] = useState(false);
  const [f, setF] = useState<any>({ tipo: 'SOCIETA_CAPITALI', paeseResidenza: 'IT' });
  const [errore, setErrore] = useState('');
  const [importa, setImporta] = useState(false);
  const [daVisura, setDaVisura] = useState(false);
  const [cercaInCorso, setCercaInCorso] = useState(false);
  const [avvisiLookup, setAvvisiLookup] = useState<string[]>([]);
  const [conArchiviati, setConArchiviati] = useState(false);
  const [filtroProf, setFiltroProf] = useState('');
  const professionisti = useProfessionisti();

  const carica = () => api.get<any[]>(`/clienti${conArchiviati ? '?archiviati=1' : ''}`).then(setLista);
  useEffect(() => { carica(); /* eslint-disable-next-line */ }, [conArchiviati]);

  // AR-M7: compilazione dell'anagrafica dalla partita IVA (VIES).
  const compilaDaPiva = async () => {
    setErrore('');
    setAvvisiLookup([]);
    setCercaInCorso(true);
    try {
      const r = await api.get<any>(`/lookup/piva/${encodeURIComponent(f.partitaIva ?? '')}`);
      if (r.esito === 'trovato') {
        const nome: string = r.dati.ragioneSociale ?? '';
        const tipo = /S\.r\.l\.|S\.p\.A\.|S\.c\./i.test(nome) ? 'SOCIETA_CAPITALI'
          : /S\.a\.s\.|S\.n\.c\./i.test(nome) ? 'SOCIETA_PERSONE' : f.tipo;
        setF({ ...f, denominazione: f.denominazione?.trim() ? f.denominazione : nome, tipo, paeseResidenza: 'IT' });
        setAvvisiLookup(r.avvisi ?? []);
      } else if (r.esito === 'partita_iva_non_valida') {
        setErrore('La partita IVA non è formalmente valida: controlla le 11 cifre.');
      } else if (r.esito === 'non_trovato') {
        setErrore('Partita IVA non presente nell’archivio europeo (in Italia l’iscrizione al VIES è facoltativa): compila a mano.');
      } else if (r.esito === 'limite_raggiunto') {
        setErrore('Troppe ricerche in quest’ora: riprova più tardi.');
      } else {
        setErrore('Il servizio europeo non risponde in questo momento: riprova tra poco o compila a mano.');
      }
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setCercaInCorso(false);
    }
  };

  async function salva() {
    setErrore('');
    try {
      await api.post('/clienti', f);
      setNuovo(false);
      setF({ tipo: 'SOCIETA_CAPITALI', paeseResidenza: 'IT' });
      carica();
    } catch (e) { setErrore((e as Error).message); }
  }

  return (
    <>
      <h1>Clienti <HelpLink sezione="clienti" /></h1>
      <p className="occhiello">
        Anagrafica dei clienti dello studio. I dati identificativi di dettaglio sono cifrati: chi legge il database
        senza la chiave dello studio non li vede.
      </p>

      <button className="azione" onClick={() => setNuovo(!nuovo)}>
        {nuovo ? 'Annulla' : 'Nuovo cliente'}
      </button>{' '}
      <button className="azione secondaria" onClick={() => setImporta(true)}>Importa da CSV</button>{' '}
      <button className="azione secondaria" onClick={() => setDaVisura(true)} title="Carica il PDF della visura camerale: anagrafica, soci, cariche e titolari effettivi proposti">Nuovo da visura</button>

      {nuovo && (
        <div className="scheda" style={{ marginTop: 14 }}>
          <CampiCliente f={f} setF={setF} onCompilaDaPiva={compilaDaPiva} cercaInCorso={cercaInCorso} />
          {professionisti.filter((p) => p.attivo).length > 1 && (
            <CampoProfessionista
              elenco={professionisti}
              valore={f.professionistaId}
              onCambia={(v) => setF({ ...f, professionistaId: v })}
              etichetta="Professionista di riferimento"
              aiuto="Chi segue il cliente e ne firma le valutazioni. Se non lo indichi e sei un professionista, sei tu."
            />
          )}
          {avvisiLookup.length > 0 && (
            <Riquadro tipo="avviso">
              {avvisiLookup.map((a, i) => <div key={i}>{a}</div>)}
            </Riquadro>
          )}
          <button className="azione" onClick={salva} disabled={!f.denominazione}>Salva</button>
          {errore && <div className="errore">{errore}</div>}
        </div>
      )}

      {importa && (
        <ImportClientiModal onChiudi={() => setImporta(false)} onImportati={() => { setImporta(false); carica(); }} />
      )}
      {daVisura && (
        <VisuraModal modo="nuovo" onChiudi={() => setDaVisura(false)} onFatto={(id) => { setDaVisura(false); carica(); vaiA(`cliente?id=${id}`); }} vaiA={vaiA} />
      )}

      <div className="scheda" style={{ marginTop: 16 }}>
        <label style={{ fontWeight: 400, marginBottom: 10, display: 'block' }}>
          <input
            type="checkbox"
            style={{ width: 'auto', marginRight: 8 }}
            checked={conArchiviati}
            onChange={(e) => setConArchiviati(e.target.checked)}
          />
          Mostra anche i clienti archiviati
        </label>
        <FiltroProfessionista elenco={professionisti} valore={filtroProf} onCambia={setFiltroProf} />
        <table>
          <thead>
            <tr>
              <th>Denominazione</th><th>Natura</th><th>CF / P.IVA</th><th>Paese</th>
              {professionisti.filter((p) => p.attivo).length > 1 && <th>Professionista</th>}
              <th>PEP</th><th>Fascicoli</th>
            </tr>
          </thead>
          <tbody>
            {lista.filter((c) => !filtroProf || c.professionista_id === filtroProf).map((c) => (
              <tr
                key={c.id}
                style={{ cursor: 'pointer', opacity: c.attivo ? 1 : 0.55 }}
                title="Apri la scheda del cliente"
                onClick={() => vaiA(`cliente?id=${c.id}`)}
              >
                <td>
                  <strong>{c.denominazione}</strong>
                  {!c.attivo && <span className="pillola r3" style={{ marginLeft: 8 }}>archiviato</span>}
                </td>
                <td>{etichettaTipo(c.tipo)}</td>
                <td className="mono">{c.codice_fiscale ?? c.partita_iva ?? '—'}</td>
                <td className="mono">{c.paese_residenza}</td>
                {professionisti.filter((p) => p.attivo).length > 1 && <td>{c.professionista ?? '—'}</td>}
                <td>{c.pep ? <span className="pillola r3">PEP</span> : '—'}</td>
                <td className="mono">{c.fascicoli}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {lista.filter((c) => !filtroProf || c.professionista_id === filtroProf).length === 0 && (
          <p className="caricamento">{filtroProf ? 'Nessun cliente per il professionista scelto.' : 'Nessun cliente registrato.'}</p>
        )}
      </div>
      <PiedeLegale />
    </>
  );
}

// ===========================================================================
export function Fascicoli({ vaiA, cliente }: { vaiA: (p: string) => void; cliente?: string | null }) {
  const [lista, setLista] = useState<any[]>([]);
  const [clienti, setClienti] = useState<any[]>([]);
  const [prestazioni, setPrestazioni] = useState<Prestazione[]>([]);
  const [nuovo, setNuovo] = useState(false);
  const [f, setF] = useState<any>({ tipoRapporto: 'CONTINUATIVO', dataConferimento: dataOggi() });
  const [avvisi, setAvvisi] = useState<string[]>([]);
  const [errore, setErrore] = useState('');
  const [filtroProf, setFiltroProf] = useState('');
  const professionisti = useProfessionisti();
  const piuProfessionisti = professionisti.filter((p) => p.attivo).length > 1;

  const carica = () => api.get<any[]>('/fascicoli').then(setLista);
  useEffect(() => {
    carica();
    api.get<any[]>('/clienti').then(setClienti);
    api.get<Prestazione[]>('/catalogo/prestazioni').then(setPrestazioni);
  }, []);

  const prestazioneScelta = prestazioni.find((p) => p.codice === f.prestazioneCodice);
  // AR-M18: appena scelto il cliente, il programma propone l'esecutore dalle cariche in archivio.
  const [esecutoreProposto, setEsecutoreProposto] = useState<any | null>(null);
  useEffect(() => {
    if (!nuovo || !f.clienteId) { setEsecutoreProposto(null); return; }
    let attivo = true;
    api.get<any>(`/clienti/${f.clienteId}/fascicolo-proposto`)
      .then((r) => {
        if (!attivo) return;
        setEsecutoreProposto(r.esecutore ?? null);
        setF((prev: any) => ({
          ...prev,
          esecutore: r.esecutore
            ? { nominativo: r.esecutore.nominativo, codiceFiscale: r.esecutore.codiceFiscale ?? '', caricaTesto: r.esecutore.caricaTesto, carica: r.esecutore.carica, fonte: r.esecutore.fonte, daProposta: true }
            : prev.esecutore,
        }));
      })
      .catch(() => { if (attivo) setEsecutoreProposto(null); });
    return () => { attivo = false; };
    // eslint-disable-next-line
  }, [f.clienteId, nuovo]);
  // Filtro per cliente: onorato anche quando arriva da un link vecchio
  // (#fascicoli?cliente=…), che fino a M13 veniva ignorato.
  const visibili = (cliente ? lista.filter((x) => x.cliente_id === cliente) : lista)
    .filter((x) => !filtroProf || x.professionista_id === filtroProf);
  const clienteFiltrato = cliente ? clienti.find((x) => x.id === cliente) : undefined;

  async function salva() {
    setErrore('');
    try {
      const corpo = { ...f, esecutore: f.esecutore?.nominativo?.trim() ? f.esecutore : undefined };
      const r = await api.post<{ id: string; avvisi: string[] }>('/fascicoli', corpo);
      setAvvisi(r.avvisi);
      setNuovo(false);
      carica();
      vaiA(`fascicolo?id=${r.id}`);
    } catch (e) { setErrore((e as Error).message); }
  }

  return (
    <>
      <h1>Fascicoli <HelpLink sezione="fascicoli" /></h1>
      <p className="occhiello">
        Un fascicolo corrisponde a una prestazione professionale, non a un cliente: lo stesso cliente può avere
        prestazioni con profili di rischio diversi, e l’esenzione dell’art. 17 co. 7 opera per singola prestazione.
      </p>

      {avvisi.map((a, i) => <Riquadro key={i} tipo="avviso">{a}</Riquadro>)}

      {cliente && (
        <Riquadro tipo="info">
          Sono mostrati i soli fascicoli di <strong>{clienteFiltrato?.denominazione ?? 'un cliente'}</strong>.{' '}
          <a href="#fascicoli">Mostra tutti i fascicoli</a>
          {clienteFiltrato && <> · <a href={`#cliente?id=${cliente}`}>apri la scheda del cliente</a></>}
        </Riquadro>
      )}

      <button className="azione" onClick={() => setNuovo(!nuovo)}>{nuovo ? 'Annulla' : 'Nuovo fascicolo'}</button>

      {nuovo && (
        <div className="scheda" style={{ marginTop: 14 }}>
          <div className="griglia c2">
            <div className="campo">
              <label>Cliente</label>
              <select value={f.clienteId ?? ''} onChange={(e) => setF({ ...f, clienteId: e.target.value })}>
                <option value="">Seleziona…</option>
                {clienti.map((c) => <option key={c.id} value={c.id}>{c.denominazione}</option>)}
              </select>
            </div>
            <div className="campo">
              <label>Prestazione professionale</label>
              <select value={f.prestazioneCodice ?? ''} onChange={(e) => setF({ ...f, prestazioneCodice: e.target.value })}>
                <option value="">Seleziona…</option>
                {[1, 2, 3, 4].map((g) => (
                  <optgroup key={g} label={`Rischio inerente ${g}`}>
                    {prestazioni.filter((p) => p.gradoInerente === g && !p.esenteAdeguataVerifica).map((p) => (
                      <option key={p.codice} value={p.codice}>{p.descrizione}</option>
                    ))}
                  </optgroup>
                ))}
                <optgroup label="Fuori obbligo di adeguata verifica (art. 17 co. 7)">
                  {prestazioni.filter((p) => p.esenteAdeguataVerifica).map((p) => (
                    <option key={p.codice} value={p.codice}>{p.descrizione}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div className="campo">
              <label>Tipo di rapporto</label>
              <select value={f.tipoRapporto} onChange={(e) => setF({ ...f, tipoRapporto: e.target.value })}>
                <option value="CONTINUATIVO">Rapporto continuativo</option>
                <option value="OCCASIONALE">Operazione occasionale</option>
              </select>
            </div>
            <div className="campo">
              <label>Data di conferimento dell’incarico</label>
              <input type="date" value={f.dataConferimento} onChange={(e) => setF({ ...f, dataConferimento: e.target.value })} />
            </div>
            {f.tipoRapporto === 'OCCASIONALE' && (
              <div className="campo">
                <label>Importo dell’operazione</label>
                <input type="number" value={f.importoOperazione ?? ''} onChange={(e) => setF({ ...f, importoOperazione: Number(e.target.value) })} />
                <div className="aiuto">Da 15.000 euro l’adeguata verifica è obbligatoria (art. 17 co. 1 lett. b).</div>
              </div>
            )}
            {piuProfessionisti && (
              <CampoProfessionista
                elenco={professionisti}
                valore={f.professionistaId}
                onCambia={(v) => setF({ ...f, professionistaId: v, identificatoDa: f.identificatoDa ?? v })}
                etichetta="Professionista incaricato"
                aiuto="A chi è intestata la prestazione: è il suo nome che compare sulla scheda di adeguata verifica."
              />
            )}
            {piuProfessionisti && (
              <CampoProfessionista
                elenco={professionisti}
                valore={f.identificatoDa ?? f.professionistaId}
                onCambia={(v) => setF({ ...f, identificatoDa: v })}
                etichetta="Identificazione eseguita da"
                aiuto="Art. 19 co. 1 lett. a): chi ha materialmente identificato il cliente, se diverso dall’incaricato."
              />
            )}
            <div className="campo">
              <label>Data dell’identificazione</label>
              <input
                type="date"
                value={f.dataIdentificazione ?? f.dataConferimento}
                onChange={(e) => setF({ ...f, dataIdentificazione: e.target.value })}
              />
              <div className="aiuto">Se non indicata, coincide con il conferimento dell’incarico.</div>
            </div>
            <div className="campo">
              <label>Modalità di identificazione</label>
              <select value={f.modalitaIdentificazione ?? ''} onChange={(e) => setF({ ...f, modalitaIdentificazione: e.target.value })}>
                <option value="">Seleziona…</option>
                <option value="PRESENZA">In presenza, con documento d’identità</option>
                <option value="ATTO_PUBBLICO">Dati risultanti da atto pubblico o scrittura autenticata</option>
                <option value="IDENTITA_DIGITALE">Identità digitale di livello almeno significativo (SPID, CIE, eIDAS)</option>
                <option value="FIRMA_DIGITALE">Certificato qualificato per firma elettronica</option>
                <option value="GIA_IDENTIFICATO">Cliente già identificato dallo studio, informazioni aggiornate</option>
              </select>
              <div className="aiuto">Art. 19 co. 1 lett. a).</div>
            </div>
          </div>
          {f.clienteId && clienti.find((c) => c.id === f.clienteId)?.tipo !== 'PERSONA_FISICA' && (
            <div className="scheda" style={{ marginTop: 4 }} data-test="esecutore-form">
              <h3 className="!mt-0">Esecutore (chi conferisce l’incarico in nome del cliente)</h3>
              {esecutoreProposto ? (
                <div className="aiuto">
                  Proposto dai dati camerali: <strong>{esecutoreProposto.nominativo}</strong> — {esecutoreProposto.caricaTesto}{esecutoreProposto.rappresentanzaLegale ? ', rappresentante dell’impresa' : ''} ({esecutoreProposto.fonte}).
                  Conferma o correggi: la visura non dice chi si presenta in studio (art. 1 co. 2 lett. p).
                </div>
              ) : (
                <div className="aiuto">Nessuna carica con poteri in archivio: indica chi conferisce l’incarico, oppure lascia vuoto e completa dal fascicolo.</div>
              )}
              <div className="griglia c3">
                <div className="campo"><label>Nome e cognome</label><input value={f.esecutore?.nominativo ?? ''} onChange={(e) => setF({ ...f, esecutore: { ...(f.esecutore ?? {}), nominativo: e.target.value, daProposta: false } })} /></div>
                <div className="campo"><label>Codice fiscale</label><input value={f.esecutore?.codiceFiscale ?? ''} onChange={(e) => setF({ ...f, esecutore: { ...(f.esecutore ?? {}), codiceFiscale: e.target.value.toUpperCase() } })} /></div>
                <div className="campo"><label>In qualità di</label><input value={f.esecutore?.caricaTesto ?? ''} onChange={(e) => setF({ ...f, esecutore: { ...(f.esecutore ?? {}), caricaTesto: e.target.value } })} /></div>
              </div>
            </div>
          )}
          <div className="campo">
            <label>Scopo e natura della prestazione</label>
            <div className="aiuto">Art. 19 co. 1 lett. c): va acquisita e valutata la compatibilità con quanto lo studio conosce del cliente.</div>
            <textarea value={f.scopoNatura ?? ''} onChange={(e) => setF({ ...f, scopoNatura: e.target.value })} />
            <BozzaAi
              tipo="SCOPO_NATURA"
              contesto={{ appunti: f.scopoNatura ?? '' }}
              onBozza={(t) => setF({ ...f, scopoNatura: t })}
            />
          </div>

          {prestazioneScelta?.esenteAdeguataVerifica && (
            <Riquadro tipo="info">
              Prestazione fuori dall’obbligo di adeguata verifica ex art. 17 co. 7. L’esenzione riguarda questa
              prestazione: se allo stesso cliente lo studio rende anche altro, per quelle prestazioni la verifica è
              dovuta.
            </Riquadro>
          )}
          {prestazioneScelta?.esoneroTabellaB && (
            <Riquadro tipo="info">
              Per questa prestazione la Regola tecnica n. 2 esonera dalla compilazione della Tabella B: il rischio
              specifico si calcolerà sulla sola Tabella A.
            </Riquadro>
          )}

          <button className="azione" onClick={salva} disabled={!f.clienteId || !f.prestazioneCodice}>Apri il fascicolo</button>
          {errore && <div className="errore">{errore}</div>}
        </div>
      )}

      <div className="scheda" style={{ marginTop: 16 }}>
        <FiltroProfessionista elenco={professionisti} valore={filtroProf} onCambia={setFiltroProf} />
        <table>
          <thead>
            <tr>
              <th>Codice</th><th>Cliente</th><th>Prestazione</th><th>Conferimento</th>
              {piuProfessionisti && <th>Professionista</th>}
              <th>Rischio</th><th>Verifica</th><th>Stato</th>
            </tr>
          </thead>
          <tbody>
            {visibili.map((x) => (
              <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => vaiA(`fascicolo?id=${x.id}`)}>
                <td className="mono">{x.codice}</td>
                <td><strong>{x.cliente}</strong></td>
                <td>{x.prestazione_descrizione}</td>
                <td className="mono">{formattaData(x.data_conferimento)}</td>
                {piuProfessionisti && <td>{x.professionista ?? '—'}</td>}
                <td>{x.classe ? <PillolaRischio classe={x.classe as ClasseRischio} /> : <span className="pillola r3">da valutare</span>}</td>
                <td>{x.livello_applicabile?.toLowerCase() ?? '—'}</td>
                <td>{x.stato === 'ASTENSIONE' ? <span className="pillola r4">astensione</span> : x.stato.toLowerCase()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibili.length === 0 && (
          <p className="caricamento">{cliente ? 'Nessun fascicolo per questo cliente.' : 'Nessun fascicolo aperto.'}</p>
        )}
      </div>
      <PiedeLegale />
    </>
  );
}

// ===========================================================================
export function DettaglioFascicolo({ id, vaiA }: { id: string; vaiA: (p: string) => void }) {
  const [d, setD] = useState<any>(null);
  const [rs, setRs] = useState<Ruleset | null>(null);
  const [prestazioni, setPrestazioni] = useState<Prestazione[]>([]);
  const [tabA, setTabA] = useState<Record<string, number>>({});
  const [tabB, setTabB] = useState<Record<string, number>>({});
  const [circ, setCirc] = useState<Record<string, boolean>>({});
  const [anteprima, setAnteprima] = useState<EsitoProfilo | null>(null);
  const [errore, setErrore] = useState('');
  const [astensioni, setAstensioni] = useState<any[]>([]);
  const [formAst, setFormAst] = useState<any>(null); // null = form chiuso
  const [titolariDichiarati, setTitolariDichiarati] = useState<any[] | null>(null); // dalla verifica a distanza
  // AR-M18: contesto della proposta applicata alla Tabella A (id, punteggi proposti) e motivazione dello scostamento.
  const [proposta, setProposta] = useState<ContestoProposta | null>(null);
  const [motivazioneScostamento, setMotivazioneScostamento] = useState('');

  const [tick, setTick] = useState(0);
  const carica = () => {
    api.get<any>(`/fascicoli/${id}`).then(setD);
    api.get<any[]>(`/fascicoli/${id}/astensioni`).then(setAstensioni).catch(() => setAstensioni([]));
    setTick((t) => t + 1);
  };
  useEffect(() => {
    carica();
    api.get<Ruleset>('/catalogo/ruleset').then(setRs);
    api.get<Prestazione[]>('/catalogo/prestazioni').then(setPrestazioni);
  }, [id]);

  const prestazione = useMemo(
    () => prestazioni.find((p) => p.codice === d?.fascicolo?.prestazione_codice),
    [prestazioni, d],
  );
  const serveB = prestazione ? !prestazione.esoneroTabellaB && !prestazione.esenteAdeguataVerifica : true;

  // Anteprima in tempo reale: il professionista vede l'effetto di ogni
  // punteggio prima di consolidare la valutazione.
  useEffect(() => {
    if (!prestazione || !rs) return;
    const completoA = rs.adeguataVerifica.tabellaA.every((f) => tabA[f.codice]);
    const completoB = !serveB || rs.adeguataVerifica.tabellaB.every((f) => tabB[f.codice]);
    if (!prestazione.esenteAdeguataVerifica && (!completoA || !completoB)) { setAnteprima(null); return; }
    api
      .post<EsitoProfilo>('/strumenti/simula-rischio', {
        prestazioneCodice: prestazione.codice,
        tabellaA: tabA,
        tabellaB: serveB ? tabB : undefined,
        circostanze: circ,
      })
      .then(setAnteprima)
      .catch(() => setAnteprima(null));
  }, [tabA, tabB, circ, prestazione, rs, serveB]);

  if (!d || !rs) return <div className="caricamento">Caricamento…</div>;
  const f = d.fascicolo;
  const ultima = d.valutazioni[0];

  const scostamenti = proposta
    ? Object.entries(proposta.punteggi).filter(([k, v]) => v != null && tabA[k] != null && Number(v) !== Number(tabA[k]))
    : [];

  async function consolida() {
    setErrore('');
    try {
      await api.post(`/fascicoli/${id}/valutazioni`, {
        tabellaA: tabA,
        tabellaB: serveB ? tabB : undefined,
        circostanze: circ,
        proposta: proposta ? { ...proposta, motivazioneScostamento } : undefined,
      });
      setAnteprima(null);
      setTabA({}); setTabB({}); setCirc({}); setProposta(null); setMotivazioneScostamento('');
      carica();
    } catch (e) { setErrore((e as Error).message); }
  }

  const circostanzeDisponibili: Array<{ chiave: string; testo: string; norma: string }> = [
    { chiave: 'pep', testo: 'Il cliente o il titolare effettivo è persona politicamente esposta', norma: 'art. 24 co. 5 lett. c)' },
    { chiave: 'pepOrganoPubblico', testo: 'La PEP agisce come organo della pubblica amministrazione', norma: 'art. 24 co. 5 lett. c), secondo periodo' },
    { chiave: 'paeseTerzoAltoRischio', testo: 'La prestazione coinvolge Paesi terzi ad alto rischio', norma: 'art. 24 co. 5 lett. a)' },
    { chiave: 'assettoProprietarioComplesso', testo: 'Assetto proprietario anomalo o veicolo di interposizione patrimoniale', norma: 'art. 24 co. 2 lett. a) nn. 3 e 6' },
    { chiave: 'elevatoUsoContante', testo: 'Attività caratterizzata da elevato utilizzo di contante', norma: 'art. 24 co. 2 lett. a) n. 5' },
    { chiave: 'dubbiIdentificazione', testo: 'Dubbi sulla veridicità o adeguatezza dei dati identificativi', norma: 'art. 17 co. 2 lett. b)' },
    { chiave: 'sospettoRiciclaggio', testo: 'Sospetto di riciclaggio o di finanziamento del terrorismo', norma: 'artt. 17 co. 2 lett. a), 23 co. 4, 35' },
    { chiave: 'impossibilitaVerifica', testo: 'Impossibilità oggettiva di completare l’adeguata verifica', norma: 'art. 42 co. 1' },
    { chiave: 'entitaPaeseAltoRischio', testo: 'Fiduciarie, trust o società anonime con sede in Paesi terzi ad alto rischio', norma: 'art. 42 co. 2' },
    { chiave: 'esameposizioneGiuridica', testo: 'Esame della posizione giuridica o difesa in giudizio', norma: 'artt. 18 co. 4, 35 co. 5, 42 co. 3' },
  ];

  return (
    <>
      <h1>Fascicolo {f.codice} <HelpLink sezione="fascicoli" /></h1>
      <p className="occhiello">
        {f.cliente} — {f.prestazione_descrizione} · incarico conferito il {formattaData(f.data_conferimento)}
      </p>
      {(f.professionista || f.identificatore) && (
        <p className="occhiello">
          Professionista incaricato: <strong>{f.professionista ?? '—'}</strong>
          {f.identificatore && (
            <> · identificazione eseguita da <strong>{f.identificatore}</strong>
              {f.data_identificazione ? ` il ${formattaData(f.data_identificazione)}` : ''} (art. 19 co. 1 lett. a)</>
          )}
        </p>
      )}

      <div style={{ marginBottom: 14 }}>
        <button
          className="azione secondaria"
          title="Scheda di adeguata verifica in formato Word, con i dati registrati"
          onClick={() => api.scarica(`/fascicoli/${id}/scheda-verifica`).catch((e) => setErrore(e.message))}
        >
          Scheda di verifica .docx
        </button>
        <button
          className="azione secondaria"
          style={{ marginLeft: 8 }}
          title="Fascicolo completo da esibire in sede di ispezione (le SOS restano escluse: artt. 38-39)"
          onClick={() => api.scarica(`/fascicoli/${id}/fascicolo-ispezione`).catch((e) => setErrore(e.message))}
        >
          Fascicolo per l’ispezione .docx
        </button>
      </div>

      {d.scadenze.filter((s: any) => s.stato === 'SCADUTA').map((s: any) => (
        <Riquadro key={s.tipo} tipo="critico">
          <strong>{s.etichetta}</strong>: termine del {formattaData(s.data)}, scaduto da {Math.abs(s.giorniResidui)} giorni.
          <span className="norma">{s.norma}</span>
        </Riquadro>
      ))}

      {/* AR-M19: controllo costante eseguito e cessazione del rapporto. */}
      <ControlloCostanteBox fascicoloId={id} fascicolo={f} onCambiato={carica} vaiA={vaiA} />

      {ultima && (
        <div className="scheda">
          <h3>Valutazione vigente — versione {ultima.versione}</h3>
          <div className="griglia c4">
            <Tessera etichetta="Rischio inerente" valore={Number(ultima.rischio_inerente).toFixed(2)} />
            <Tessera etichetta="Rischio specifico" valore={Number(ultima.rischio_specifico).toFixed(2)} />
            <Tessera etichetta="Rischio effettivo" valore={Number(ultima.rischio_effettivo).toFixed(2)} />
            <Tessera
              etichetta="Adeguata verifica"
              valore={<span style={{ fontSize: 19 }}>{ultima.livello_applicabile.toLowerCase()}</span>}
              nota={ultima.livello_innalzato ? 'innalzata per obbligo di legge' : undefined}
            />
          </div>
          <p style={{ marginTop: 12 }}>
            Classe <PillolaRischio classe={ultima.classe as ClasseRischio} /> · controllo costante ogni{' '}
            {ultima.controllo_costante_mesi} mesi ·{' '}
            {ultima.firmata_il ? `firmata il ${formattaData(ultima.firmata_il)}` : 'non firmata'}
          </p>
          <p className="mono" style={{ color: 'var(--c-grey)' }}>{ultima.formula}</p>
          <ElencoVincoli vincoli={JSON.parse(ultima.vincoli || '[]')} />
          {!ultima.firmata_il && (
            <FirmaValutazione
              fascicoloId={id}
              valutazioneId={ultima.id}
              onFirmata={carica}
              onErrore={setErrore}
            />
          )}
          {Boolean(ultima.astensione_dovuta) && (
            <Riquadro tipo="critico">
              Ricorrono i presupposti dell’obbligo di astensione ex art. 42. Va redatto il verbale di astensione e
              valutata la segnalazione di operazione sospetta ai sensi dell’art. 35, documentando la valutazione anche
              se si conclude in senso negativo.
              <div style={{ marginTop: 10 }}>
                <button
                  className="azione secondaria"
                  onClick={() => setFormAst({ fondamento: 'ART_42_CO_1', motivazione: '', sosValutata: false })}
                >
                  Redigi il verbale di astensione
                </button>
                <button className="azione secondaria" style={{ marginLeft: 8 }} onClick={() => vaiA('sos')}>Vai alle segnalazioni</button>
              </div>
            </Riquadro>
          )}
        </div>
      )}

      {(astensioni.length > 0 || formAst) && (
        <div className="scheda">
          <h3>Astensione (art. 42)</h3>
          {astensioni.length > 0 && (
            <table>
              <thead><tr><th>Data</th><th>Fondamento</th><th>SOS valutata</th><th /></tr></thead>
              <tbody>
                {astensioni.map((a) => (
                  <tr key={a.id}>
                    <td>{formattaData(a.data_decisione)}</td>
                    <td className="mono">{a.fondamento.replace(/_/g, ' ').toLowerCase()}</td>
                    <td>{a.sos_valutata ? 'Sì' : 'No'}</td>
                    <td>
                      <button
                        className="azione secondaria"
                        onClick={() => api.scarica(`/fascicoli/${id}/astensioni/${a.id}/verbale`).catch((e) => setErrore(e.message))}
                      >
                        Verbale .docx
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {formAst && (
            <div style={{ marginTop: 12 }}>
              <div className="campo">
                <label>Fondamento normativo</label>
                <select value={formAst.fondamento} onChange={(e) => setFormAst({ ...formAst, fondamento: e.target.value })}>
                  <option value="ART_42_CO_1">Art. 42 co. 1 — impossibilità di completare l’adeguata verifica</option>
                  <option value="ART_42_CO_2">Art. 42 co. 2 — fiduciarie, trust o anonime da Paesi terzi ad alto rischio</option>
                  <option value="ART_18_CO_3">Art. 18 co. 3 — impossibilità di aggiornamento nel controllo costante</option>
                </select>
              </div>
              <div className="campo">
                <label>Motivazione</label>
                <textarea
                  value={formAst.motivazione}
                  onChange={(e) => setFormAst({ ...formAst, motivazione: e.target.value })}
                  placeholder="Circostanze di fatto che fondano l’astensione"
                />
                <BozzaAi
                  tipo="MOTIVAZIONE_ASTENSIONE"
                  contesto={{ fascicoloId: id, fondamento: formAst.fondamento, appunti: formAst.motivazione }}
                  onBozza={(t) => setFormAst({ ...formAst, motivazione: t })}
                />
              </div>
              <label style={{ fontWeight: 400 }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto', marginRight: 8 }}
                  checked={formAst.sosValutata}
                  onChange={(e) => setFormAst({ ...formAst, sosValutata: e.target.checked })}
                />
                La posizione è stata valutata ai fini della segnalazione ex art. 35 (obbligo dell’art. 42 co. 1)
              </label>
              <div style={{ marginTop: 10 }}>
                <button
                  className="azione"
                  disabled={!formAst.motivazione}
                  onClick={async () => {
                    setErrore('');
                    try {
                      await api.post(`/fascicoli/${id}/astensione`, formAst);
                      setFormAst(null);
                      carica();
                    } catch (e) { setErrore((e as Error).message); }
                  }}
                >
                  Registra l’astensione
                </button>
                <button className="azione secondaria" style={{ marginLeft: 8 }} onClick={() => setFormAst(null)}>Annulla</button>
              </div>
            </div>
          )}
          {!formAst && (
            <button
              className="azione secondaria"
              style={{ marginTop: 8 }}
              onClick={() => setFormAst({ fondamento: 'ART_42_CO_1', motivazione: '', sosValutata: false })}
            >
              Registra una nuova astensione
            </button>
          )}
        </div>
      )}

      <FascicoloProposto
        fascicoloId={id}
        clienteId={d.fascicolo.cliente_id}
        esente={Boolean(prestazione?.esenteAdeguataVerifica)}
        valutata={Boolean(ultima)}
        aggiornaAl={tick}
        onApplicaTabellaA={(punteggi, contesto) => { setTabA((s) => ({ ...s, ...punteggi })); setProposta(contesto); }}
        onApplicaCircostanze={(chiavi) => setCirc((s) => ({ ...s, ...Object.fromEntries(chiavi.map((k) => [k, true])) }))}
        onEsecutoreRegistrato={carica}
        vaiA={vaiA}
      />

      <h2>{ultima ? 'Nuova valutazione' : 'Valutazione del rischio'}</h2>
      {prestazione?.esenteAdeguataVerifica ? (
        <Riquadro tipo="info">
          Prestazione esente da adeguata verifica ex art. 17 co. 7: non è richiesta la profilatura del cliente.
          Registra comunque la valutazione per lasciarne traccia nel fascicolo.
          <div style={{ marginTop: 10 }}>
            <button className="azione" onClick={consolida}>Registra l’esenzione</button>
          </div>
        </Riquadro>
      ) : (
        <>
          <Riquadro tipo="info">
            Rischio inerente della prestazione: <strong>{prestazione?.gradoInerente}</strong> secondo la Tabella 1
            della Regola tecnica n. 2. Il rischio effettivo pondera il rischio inerente al{' '}
            {rs.adeguataVerifica.pesi.inerente * 100}% e il rischio specifico al {rs.adeguataVerifica.pesi.specifico * 100}%.
          </Riquadro>

          <GruppoFattori
            titolo="Tabella A — fattori relativi al cliente"
            fattori={rs.adeguataVerifica.tabellaA}
            valori={tabA}
            ruleset={rs}
            onChange={(c, v) => setTabA((s) => ({ ...s, [c]: v }))}
          />
          {serveB ? (
            <GruppoFattori
              titolo="Tabella B — fattori relativi alla prestazione o operazione"
              fattori={rs.adeguataVerifica.tabellaB}
              valori={tabB}
              ruleset={rs}
              onChange={(c, v) => setTabB((s) => ({ ...s, [c]: v }))}
            />
          ) : (
            <Riquadro tipo="info">
              Tabella B non richiesta per questa prestazione: il rischio specifico è la somma della Tabella A divisa
              per quattro.
            </Riquadro>
          )}

          <div className="scheda">
            <h3>Circostanze rilevanti per legge</h3>
            <div className="aiuto" style={{ marginBottom: 10 }}>
              Queste circostanze non entrano nel punteggio: incidono direttamente sul livello di verifica dovuto. Il
              punteggio non può mai derogare alla norma, può solo innalzare.
            </div>
            {circostanzeDisponibili.map((c) => (
              <label key={c.chiave} style={{ fontWeight: 400, marginBottom: 7 }}>
                <input
                  type="checkbox"
                  style={{ width: 'auto', marginRight: 8 }}
                  checked={Boolean(circ[c.chiave])}
                  onChange={(e) => setCirc({ ...circ, [c.chiave]: e.target.checked })}
                />
                {c.testo} <span className="mono" style={{ color: 'var(--c-grey)' }}>({c.norma})</span>
              </label>
            ))}
          </div>

          {anteprima && (
            <div className="scheda">
              <h3>Anteprima dell’esito</h3>
              <div className="griglia c4">
                <Tessera etichetta="Inerente" valore={anteprima.rischioInerente.toFixed(2)} />
                <Tessera etichetta="Specifico" valore={anteprima.rischioSpecifico.toFixed(2)} />
                <Tessera etichetta="Effettivo" valore={anteprima.rischioEffettivo.toFixed(2)} />
                <Tessera
                  etichetta="Verifica dovuta"
                  valore={<span style={{ fontSize: 19 }}>{anteprima.livelloApplicabile.toLowerCase()}</span>}
                />
              </div>
              <p style={{ marginTop: 12 }}>
                Classe <PillolaRischio classe={anteprima.classe} testo={anteprima.etichettaClasse} />
              </p>
              {anteprima.livelloInnalzatoDaNorma && (
                <Riquadro tipo="avviso">
                  Il calcolo darebbe una verifica <strong>{anteprima.livelloCalcolato.toLowerCase()}</strong>, ma una
                  disposizione di legge impone il livello <strong>{anteprima.livelloApplicabile.toLowerCase()}</strong>.
                  Lo scostamento va riportato nel fascicolo con la relativa norma.
                </Riquadro>
              )}
              <p className="mono" style={{ color: 'var(--c-grey)' }}>{anteprima.formula}</p>
              <ElencoVincoli vincoli={anteprima.vincoli} />
              {proposta && (
                <Riquadro tipo={scostamenti.length ? 'avviso' : 'info'}>
                  {scostamenti.length === 0
                    ? 'Tabella A: punteggi proposti dal programma confermati. La provenienza e le motivazioni restano nella valutazione e nel verbale.'
                    : <>
                        Ti sei scostato dalla proposta su {scostamenti.map(([k, v]) => `${k.replace(/_/g, ' ')} (proposto ${v}, valutato ${tabA[k]})`).join(', ')}: scrivi il perché.
                        <textarea data-test="motivazione-scostamento" value={motivazioneScostamento} onChange={(e) => setMotivazioneScostamento(e.target.value)} placeholder="Motivazione dello scostamento dalla proposta" style={{ marginTop: 6 }} />
                      </>}
                </Riquadro>
              )}
              <button className="azione" onClick={consolida} disabled={scostamenti.length > 0 && !motivazioneScostamento.trim()} data-test="consolida">Consolida la valutazione</button>
              {errore && <div className="errore">{errore}</div>}
            </div>
          )}
        </>
      )}

      <TitolaritaEffettiva
        clienteId={d.fascicolo.cliente_id}
        titolari={d.titolari ?? []}
        precompilati={titolariDichiarati}
        onAggiornato={() => { setTitolariDichiarati(null); carica(); }}
      />

      <VerificaADistanza
        fascicoloId={id}
        clienteId={d.fascicolo.cliente_id}
        onDatiAcquisiti={carica}
        onTitolariDichiarati={setTitolariDichiarati}
      />

      <h2>Scadenzario del fascicolo</h2>
      <div className="scheda">
        <table>
          <thead><tr><th>Adempimento</th><th>Termine</th><th>Stato</th><th>Fonte</th></tr></thead>
          <tbody>
            {d.scadenze.map((s: any) => (
              <tr key={s.tipo}>
                <td>{s.etichetta}</td>
                <td className="mono">{formattaData(s.data)}</td>
                <td>
                  <span className={`pillola ${s.stato === 'SCADUTA' ? 'r4' : s.stato === 'IN_SCADENZA' ? 'r3' : 'r1'}`}>
                    {s.stato.toLowerCase().replace('_', ' ')}
                  </span>
                </td>
                <td className="mono" style={{ color: 'var(--c-grey)' }}>
                  {s.norma}
                  {!s.normativa && <> · parametro di studio</>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.scadenze.length === 0 && <p className="caricamento">Nessuna scadenza: prestazione fuori obbligo.</p>}
      </div>

      <h2>Documenti conservati</h2>
      <div className="scheda">
        <table>
          <thead><tr><th>Tipo</th><th>File</th><th>Impronta SHA-256</th><th>Acquisito</th><th>Conservare fino al</th></tr></thead>
          <tbody>
            {d.documenti.map((x: any) => (
              <tr key={x.id}>
                <td>{x.tipo}</td>
                <td><a href={`/api/documenti/${x.id}`} target="_blank" rel="noreferrer">{x.nome_file}</a></td>
                <td className="mono" style={{ fontSize: 11 }}>{x.sha256.slice(0, 24)}…</td>
                <td className="mono">{formattaData(x.data_acquisizione)}</td>
                <td className="mono">{formattaData(x.conserva_fino_al)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.documenti.length === 0 && (
          <p className="caricamento">
            Nessun documento acquisito. L’art. 31 co. 2 richiede copia dei documenti acquisiti in sede di adeguata verifica.
          </p>
        )}
      </div>

      <PiedeLegale />
    </>
  );
}


/**
 * Firma della valutazione (AR-M15). Se la prestazione è intestata a un altro
 * professionista il server chiede il motivo: la si raccoglie qui e si
 * riprova. Non è un divieto — in uno studio associato sostituirsi a un
 * collega assente è normale — ma resta scritto nel verbale.
 */
function FirmaValutazione({ fascicoloId, valutazioneId, onFirmata, onErrore }: {
  fascicoloId: string;
  valutazioneId: string;
  onFirmata: () => void;
  onErrore: (m: string) => void;
}) {
  const [motivazione, setMotivazione] = useState('');
  const [chiedi, setChiedi] = useState(false);
  const [invio, setInvio] = useState(false);

  const firma = async () => {
    setInvio(true);
    try {
      await api.post(`/fascicoli/${fascicoloId}/valutazioni/${valutazioneId}/firma`,
        motivazione ? { motivazioneFirma: motivazione } : undefined);
      setChiedi(false);
      setMotivazione('');
      onFirmata();
    } catch (e) {
      const m = (e as Error).message;
      if (/altro professionista/i.test(m)) { setChiedi(true); onErrore(''); }
      else onErrore(m);
    } finally {
      setInvio(false);
    }
  };

  if (!chiedi) {
    return <button className="azione" onClick={firma} disabled={invio}>Firma la valutazione</button>;
  }
  return (
    <div className="campo">
      <label>Motivo della firma</label>
      <div className="aiuto">
        La prestazione è intestata a un altro professionista: indica perché firmi tu (sostituzione, assenza,
        subentro). La nota compare nella scheda di adeguata verifica.
      </div>
      <input value={motivazione} onChange={(e) => setMotivazione(e.target.value)} autoFocus />
      <button className="azione" onClick={firma} disabled={invio || motivazione.trim().length < 3}>
        Firma la valutazione
      </button>{' '}
      <button className="azione secondaria" onClick={() => { setChiedi(false); setMotivazione(''); }}>Annulla</button>
    </div>
  );
}
