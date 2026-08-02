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
import { ImportClientiModal } from './ImportClienti';
import { TitolaritaEffettiva, VerificaADistanza } from './TitolaritaVerifica';

// ===========================================================================
export function Clienti({ vaiA }: { vaiA: (p: string) => void }) {
  const [lista, setLista] = useState<any[]>([]);
  const [nuovo, setNuovo] = useState(false);
  const [f, setF] = useState<any>({ tipo: 'SOCIETA_CAPITALI', paeseResidenza: 'IT' });
  const [errore, setErrore] = useState('');
  const [importa, setImporta] = useState(false);
  const [cercaInCorso, setCercaInCorso] = useState(false);
  const [avvisiLookup, setAvvisiLookup] = useState<string[]>([]);

  const carica = () => api.get<any[]>('/clienti').then(setLista);
  useEffect(() => { carica(); }, []);

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
      <button className="azione secondaria" onClick={() => setImporta(true)}>Importa da CSV</button>

      {nuovo && (
        <div className="scheda" style={{ marginTop: 14 }}>
          <div className="griglia c2">
            <div className="campo">
              <label>Denominazione o nominativo</label>
              <input value={f.denominazione ?? ''} onChange={(e) => setF({ ...f, denominazione: e.target.value })} />
            </div>
            <div className="campo">
              <label>Natura giuridica</label>
              <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
                <option value="PERSONA_FISICA">Persona fisica</option>
                <option value="SOCIETA_CAPITALI">Società di capitali</option>
                <option value="SOCIETA_PERSONE">Società di persone</option>
                <option value="ENTE_NON_PROFIT">Ente non profit</option>
                <option value="TRUST">Trust o istituto affine</option>
                <option value="ALTRO">Altro</option>
              </select>
            </div>
            <div className="campo">
              <label>Codice fiscale</label>
              <input value={f.codiceFiscale ?? ''} onChange={(e) => setF({ ...f, codiceFiscale: e.target.value })} />
            </div>
            <div className="campo">
              <label>Partita IVA</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={f.partitaIva ?? ''} onChange={(e) => setF({ ...f, partitaIva: e.target.value })} style={{ flex: 1 }} />
                <button
                  type="button"
                  className="azione secondaria"
                  onClick={compilaDaPiva}
                  disabled={cercaInCorso || !(f.partitaIva ?? '').trim()}
                  title="Compila denominazione e natura giuridica dall'archivio IVA europeo (VIES)"
                >
                  {cercaInCorso ? 'Cerco…' : 'Compila dai registri'}
                </button>
              </div>
            </div>
            <div className="campo">
              <label>Paese di residenza o sede</label>
              <input value={f.paeseResidenza} onChange={(e) => setF({ ...f, paeseResidenza: e.target.value })} />
            </div>
            <div className="campo">
              <label>Attività prevalente</label>
              <input value={f.attivitaPrevalente ?? ''} onChange={(e) => setF({ ...f, attivitaPrevalente: e.target.value })} />
            </div>
          </div>
          <div className="campo">
            <label>
              <input
                type="checkbox"
                style={{ width: 'auto', marginRight: 8 }}
                checked={Boolean(f.pep)}
                onChange={(e) => setF({ ...f, pep: e.target.checked })}
              />
              Persona politicamente esposta
            </label>
            {f.pep && (
              <>
                <label style={{ marginTop: 8 }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto', marginRight: 8 }}
                    checked={Boolean(f.pepOrganoPubblico)}
                    onChange={(e) => setF({ ...f, pepOrganoPubblico: e.target.checked })}
                  />
                  Agisce in veste di organo della pubblica amministrazione
                </label>
                <Riquadro tipo="avviso">
                  L’art. 24 co. 5 lett. c) impone la verifica rafforzata per le persone politicamente esposte, salvo
                  che agiscano come organi della pubblica amministrazione: in quel caso le misure sono commisurate al
                  rischio rilevato in concreto e la scelta va motivata nel fascicolo.
                </Riquadro>
              </>
            )}
          </div>
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

      <div className="scheda" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>Denominazione</th><th>Natura</th><th>CF / P.IVA</th><th>Paese</th><th>PEP</th><th>Fascicoli</th></tr></thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => vaiA(`fascicoli?cliente=${c.id}`)}>
                <td><strong>{c.denominazione}</strong></td>
                <td>{c.tipo.replace(/_/g, ' ').toLowerCase()}</td>
                <td className="mono">{c.codice_fiscale ?? c.partita_iva ?? '—'}</td>
                <td className="mono">{c.paese_residenza}</td>
                <td>{c.pep ? <span className="pillola r3">PEP</span> : '—'}</td>
                <td className="mono">{c.fascicoli}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {lista.length === 0 && <p className="caricamento">Nessun cliente registrato.</p>}
      </div>
      <PiedeLegale />
    </>
  );
}

// ===========================================================================
export function Fascicoli({ vaiA }: { vaiA: (p: string) => void }) {
  const [lista, setLista] = useState<any[]>([]);
  const [clienti, setClienti] = useState<any[]>([]);
  const [prestazioni, setPrestazioni] = useState<Prestazione[]>([]);
  const [nuovo, setNuovo] = useState(false);
  const [f, setF] = useState<any>({ tipoRapporto: 'CONTINUATIVO', dataConferimento: dataOggi() });
  const [avvisi, setAvvisi] = useState<string[]>([]);
  const [errore, setErrore] = useState('');

  const carica = () => api.get<any[]>('/fascicoli').then(setLista);
  useEffect(() => {
    carica();
    api.get<any[]>('/clienti').then(setClienti);
    api.get<Prestazione[]>('/catalogo/prestazioni').then(setPrestazioni);
  }, []);

  const prestazioneScelta = prestazioni.find((p) => p.codice === f.prestazioneCodice);

  async function salva() {
    setErrore('');
    try {
      const r = await api.post<{ id: string; avvisi: string[] }>('/fascicoli', f);
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
          <div className="campo">
            <label>Scopo e natura della prestazione</label>
            <div className="aiuto">Art. 19 co. 1 lett. c): va acquisita e valutata la compatibilità con quanto lo studio conosce del cliente.</div>
            <textarea value={f.scopoNatura ?? ''} onChange={(e) => setF({ ...f, scopoNatura: e.target.value })} />
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
        <table>
          <thead>
            <tr><th>Codice</th><th>Cliente</th><th>Prestazione</th><th>Conferimento</th><th>Rischio</th><th>Verifica</th><th>Stato</th></tr>
          </thead>
          <tbody>
            {lista.map((x) => (
              <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => vaiA(`fascicolo?id=${x.id}`)}>
                <td className="mono">{x.codice}</td>
                <td><strong>{x.cliente}</strong></td>
                <td>{x.prestazione_descrizione}</td>
                <td className="mono">{formattaData(x.data_conferimento)}</td>
                <td>{x.classe ? <PillolaRischio classe={x.classe as ClasseRischio} /> : <span className="pillola r3">da valutare</span>}</td>
                <td>{x.livello_applicabile?.toLowerCase() ?? '—'}</td>
                <td>{x.stato === 'ASTENSIONE' ? <span className="pillola r4">astensione</span> : x.stato.toLowerCase()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {lista.length === 0 && <p className="caricamento">Nessun fascicolo aperto.</p>}
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

  const carica = () => {
    api.get<any>(`/fascicoli/${id}`).then(setD);
    api.get<any[]>(`/fascicoli/${id}/astensioni`).then(setAstensioni).catch(() => setAstensioni([]));
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

  async function consolida() {
    setErrore('');
    try {
      await api.post(`/fascicoli/${id}/valutazioni`, {
        tabellaA: tabA,
        tabellaB: serveB ? tabB : undefined,
        circostanze: circ,
      });
      setAnteprima(null);
      setTabA({}); setTabB({}); setCirc({});
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
            <button
              className="azione"
              onClick={async () => { await api.post(`/fascicoli/${id}/valutazioni/${ultima.id}/firma`); carica(); }}
            >
              Firma la valutazione
            </button>
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
              <button className="azione" onClick={consolida}>Consolida la valutazione</button>
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
