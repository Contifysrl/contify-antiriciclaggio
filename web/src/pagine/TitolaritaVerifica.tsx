import { FormEvent, useEffect, useState } from 'react';
import { api, formattaData } from '../api';
import { Riquadro } from '../componenti';
import { Badge, ErrorBanner, Modal } from '../components/ui';

// ── Titolarità effettiva + verifica a distanza (AR-M8) ─────────
// Due sezioni del dettaglio fascicolo: la fotografia corrente dei
// titolari effettivi (artt. 20-22) con il riscontro del registro
// (D.M. 122/2026), e le richieste di verifica a distanza al cliente.

const CRITERI: Array<{ codice: string; etichetta: string; norma: string }> = [
  { codice: 'PROPRIETA_DIRETTA', etichetta: 'Proprietà diretta (>25%)', norma: 'art. 20 co. 2' },
  { codice: 'PROPRIETA_INDIRETTA', etichetta: 'Proprietà indiretta (>25%)', norma: 'art. 20 co. 2' },
  { codice: 'CONTROLLO', etichetta: 'Controllo della società', norma: 'art. 20 co. 3' },
  { codice: 'RESIDUALE_POTERI', etichetta: 'Criterio residuale: poteri di rappresentanza/amministrazione', norma: 'art. 20 co. 5' },
];

// ── Sezione: titolarità effettiva ──────────────────────────────

export function TitolaritaEffettiva({ clienteId, titolari, precompilati, onAggiornato }: {
  clienteId: string;
  titolari: any[];
  /** Dichiarati dal cliente via verifica a distanza: prefigurano il form. */
  precompilati?: Array<{ nominativo: string; codiceFiscale?: string; quota?: string }> | null;
  onAggiornato: () => void;
}) {
  const [modifica, setModifica] = useState(false);
  const [righe, setRighe] = useState<any[]>([]);
  const [errore, setErrore] = useState('');
  const [esito, setEsito] = useState('');
  const [riscontro, setRiscontro] = useState(false);

  useEffect(() => {
    if (precompilati?.length) {
      setRighe(precompilati.map((p) => ({
        nominativo: p.nominativo, codiceFiscale: p.codiceFiscale ?? '',
        criterio: 'PROPRIETA_DIRETTA', quota: p.quota ?? '', pep: false, motivazione: 'Dichiarazione del cliente, verificata dal professionista.',
      })));
      setModifica(true);
    }
  }, [precompilati]);

  const apriModifica = () => {
    setRighe(titolari.length
      ? titolari.map((t) => ({ nominativo: t.nominativo, codiceFiscale: t.codice_fiscale ?? '', criterio: t.criterio, quota: t.quota ?? '', pep: Boolean(t.pep), motivazione: t.motivazione ?? '' }))
      : [{ nominativo: '', codiceFiscale: '', criterio: 'PROPRIETA_DIRETTA', quota: '', pep: false, motivazione: '' }]);
    setModifica(true);
  };

  const salva = async () => {
    setErrore('');
    try {
      await api.post(`/clienti/${clienteId}/titolarita`, {
        titolari: righe
          .filter((r) => r.nominativo.trim())
          .map((r) => ({
            nominativo: r.nominativo.trim(),
            codiceFiscale: r.codiceFiscale.trim().toUpperCase() || null,
            criterio: r.criterio,
            norma: CRITERI.find((c) => c.codice === r.criterio)?.norma ?? 'art. 20',
            quota: r.quota ? Number(String(r.quota).replace(',', '.')) : null,
            pep: r.pep,
            motivazione: r.motivazione,
          })),
      });
      setModifica(false);
      setEsito('Titolarità aggiornata: la fotografia precedente resta storicizzata.');
      onAggiornato();
    } catch (e) {
      setErrore((e as Error).message);
    }
  };

  const riga = (r: any, i: number) => (
    <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1.4fr_2fr_0.8fr_auto] items-end border-b border-ink-100 pb-2">
      <div>
        <label className="label">Nome e cognome</label>
        <input className="input" value={r.nominativo} onChange={(e) => setRighe(righe.map((x, j) => j === i ? { ...x, nominativo: e.target.value } : x))} />
      </div>
      <div>
        <label className="label">Codice fiscale</label>
        <input className="input" value={r.codiceFiscale} onChange={(e) => setRighe(righe.map((x, j) => j === i ? { ...x, codiceFiscale: e.target.value } : x))} />
      </div>
      <div>
        <label className="label">Criterio (artt. 20-22)</label>
        <select className="input" value={r.criterio} onChange={(e) => setRighe(righe.map((x, j) => j === i ? { ...x, criterio: e.target.value } : x))}>
          {CRITERI.map((c) => <option key={c.codice} value={c.codice}>{c.etichetta}</option>)}
        </select>
      </div>
      <div>
        <label className="label">% quota</label>
        <input className="input" value={r.quota} onChange={(e) => setRighe(righe.map((x, j) => j === i ? { ...x, quota: e.target.value } : x))} />
      </div>
      <button type="button" className="btn btn-ghost btn-sm mb-0.5" onClick={() => setRighe(righe.filter((_, j) => j !== i))} disabled={righe.length === 1}>✕</button>
      <label className="sm:col-span-2 flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" className="!w-4" checked={r.pep} onChange={(e) => setRighe(righe.map((x, j) => j === i ? { ...x, pep: e.target.checked } : x))} />
        Persona politicamente esposta
      </label>
      {r.criterio === 'RESIDUALE_POTERI' && (
        <div className="sm:col-span-5">
          <label className="label">Motivazione (obbligatoria per il criterio residuale, art. 20 co. 6)</label>
          <input className="input" value={r.motivazione} onChange={(e) => setRighe(righe.map((x, j) => j === i ? { ...x, motivazione: e.target.value } : x))} />
        </div>
      )}
    </div>
  );

  const nonRiscontrati = titolari.filter((t) => !t.registro_consultato);
  const incongruenze = titolari.filter((t) => t.registro_incongruenza);

  return (
    <>
      <h2>Titolarità effettiva (artt. 20-22)</h2>
      <div className="scheda">
        {esito && <div className="riquadro info !my-2">{esito}</div>}
        {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}

        {titolari.length > 0 && !modifica && (
          <table>
            <thead><tr><th>Titolare effettivo</th><th>Criterio</th><th>Quota</th><th>PEP</th><th>Registro TE</th></tr></thead>
            <tbody>
              {titolari.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="font-semibold">{t.nominativo}</div>
                    {t.codice_fiscale && <div className="text-xs text-ink-400 mono">{t.codice_fiscale}</div>}
                  </td>
                  <td className="text-sm">{CRITERI.find((c) => c.codice === t.criterio)?.etichetta ?? t.criterio}</td>
                  <td>{t.quota != null ? `${t.quota}%` : '—'}</td>
                  <td>{t.pep ? <Badge tone="red">PEP</Badge> : '—'}</td>
                  <td>
                    {t.registro_consultato
                      ? t.registro_incongruenza
                        ? <Badge tone="red">difformità {formattaData(t.registro_data)}</Badge>
                        : <Badge tone="teal">riscontrato {formattaData(t.registro_data)}</Badge>
                      : <Badge tone="amber">da riscontrare</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {titolari.length === 0 && !modifica && (
          <p className="caricamento">
            Nessun titolare effettivo registrato. L’art. 21-ter richiede l’identificazione e, dal
            D.M. 122/2026, il riscontro con il registro presso la Camera di Commercio.
          </p>
        )}
        {incongruenze.length > 0 && !modifica && (
          <Riquadro tipo="critico">
            Difformità rilevata rispetto al registro: va comunicata al gestore (art. 21 co. 4) e
            documentata nel fascicolo. La nota inserita fa parte del riscontro.
          </Riquadro>
        )}

        {modifica && (
          <div className="space-y-3">
            {righe.map(riga)}
            <div className="flex justify-between">
              <button className="btn btn-secondary btn-sm" onClick={() => setRighe([...righe, { nominativo: '', codiceFiscale: '', criterio: 'PROPRIETA_DIRETTA', quota: '', pep: false, motivazione: '' }])}>
                Aggiungi un titolare
              </button>
              <div className="flex gap-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setModifica(false)}>Annulla</button>
                <button className="btn btn-primary btn-sm" onClick={salva} disabled={!righe.some((r) => r.nominativo.trim())}>
                  Registra la fotografia
                </button>
              </div>
            </div>
            <div className="aiuto">
              La fotografia precedente non si sovrascrive: si chiude e resta in archivio (art. 32 co. 2).
            </div>
          </div>
        )}

        {!modifica && (
          <div className="flex gap-2 mt-3">
            <button className="btn btn-secondary btn-sm" onClick={apriModifica}>
              {titolari.length ? 'Aggiorna la titolarità' : 'Registra i titolari effettivi'}
            </button>
            {titolari.length > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={() => setRiscontro(true)}>
                {nonRiscontrati.length ? 'Riscontro col registro…' : 'Nuovo riscontro col registro…'}
              </button>
            )}
          </div>
        )}
      </div>

      {riscontro && (
        <RiscontroRegistroModal
          clienteId={clienteId}
          onChiudi={() => setRiscontro(false)}
          onFatto={() => { setRiscontro(false); setEsito('Riscontro registrato.'); onAggiornato(); }}
        />
      )}
    </>
  );
}

function RiscontroRegistroModal({ clienteId, onChiudi, onFatto }: { clienteId: string; onChiudi: () => void; onFatto: () => void }) {
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [incongruenza, setIncongruenza] = useState(false);
  const [note, setNote] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      await api.post(`/clienti/${clienteId}/titolarita/registro`, { data, incongruenza, note });
      onFatto();
    } catch (err) {
      setErrore((err as Error).message);
      setInvio(false);
    }
  };

  return (
    <Modal title="Riscontro col registro dei titolari effettivi" onClose={onChiudi}>
      <form onSubmit={submit} className="space-y-3 text-sm">
        <p>
          Registra l’esito della consultazione del registro (accesso accreditato presso la Camera di
          Commercio, D.M. 122/2026): l’art. 31 co. 2 chiede di conservarne traccia. Puoi allegare la
          visura fra i documenti del fascicolo.
        </p>
        <div>
          <label className="label">Data della consultazione</label>
          <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} required />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="!w-4" checked={incongruenza} onChange={(e) => setIncongruenza(e.target.checked)} />
          <span>Ho rilevato una <strong>difformità</strong> tra registro e titolarità accertata</span>
        </label>
        {incongruenza && (
          <Riquadro tipo="critico">
            La difformità va comunicata al gestore del registro (art. 21 co. 4): descrivila qui e
            documenta la comunicazione nel fascicolo.
          </Riquadro>
        )}
        <div>
          <label className="label">{incongruenza ? 'Descrizione della difformità (obbligatoria)' : 'Note (facoltative)'}</label>
          <textarea className="input min-h-[70px]" value={note} onChange={(e) => setNote(e.target.value)} required={incongruenza} />
        </div>
        {errore && <div className="errore">{errore}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-secondary" onClick={onChiudi}>Annulla</button>
          <button className="btn btn-primary" disabled={invio}>{invio ? 'Salvataggio…' : 'Registra il riscontro'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Sezione: verifica a distanza ───────────────────────────────

export function VerificaADistanza({ fascicoloId, clienteId, onDatiAcquisiti, onTitolariDichiarati }: {
  fascicoloId: string;
  clienteId: string;
  onDatiAcquisiti: () => void;
  onTitolariDichiarati: (titolari: any[]) => void;
}) {
  const [richieste, setRichieste] = useState<any[]>([]);
  const [nuova, setNuova] = useState(false);
  const [linkCreato, setLinkCreato] = useState<{ url: string; scadeIl: string; emailInviata: boolean } | null>(null);
  const [esamina, setEsamina] = useState<string | null>(null);
  const [errore, setErrore] = useState('');

  const carica = () => api.get<any[]>(`/fascicoli/${fascicoloId}/verifiche-remote`).then(setRichieste).catch(() => setRichieste([]));
  useEffect(() => { carica(); }, [fascicoloId]);

  const ETICHETTA_STATO: Record<string, { testo: string; tone: 'teal' | 'gray' | 'amber' | 'red' }> = {
    INVIATA: { testo: 'in attesa del cliente', tone: 'amber' },
    COMPLETATA: { testo: 'compilata: da esaminare', tone: 'teal' },
    ACQUISITA: { testo: 'acquisita nel fascicolo', tone: 'gray' },
    ANNULLATA: { testo: 'annullata', tone: 'gray' },
  };

  return (
    <>
      <h2>Adeguata verifica a distanza</h2>
      <div className="scheda">
        <div className="aiuto">
          Invia al cliente un collegamento sicuro e monouso: compila i dati, allega il documento e
          dichiara titolarità effettiva e status PEP da casa. Nel fascicolo entra solo ciò che
          esamini e acquisisci tu.
        </div>
        {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}

        {richieste.length > 0 && (
          <table>
            <thead><tr><th>Creata</th><th>Stato</th><th>Scade</th><th /></tr></thead>
            <tbody>
              {richieste.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{formattaData(r.creato_il)}</td>
                  <td><Badge tone={ETICHETTA_STATO[r.stato]?.tone ?? 'gray'}>{ETICHETTA_STATO[r.stato]?.testo ?? r.stato}</Badge></td>
                  <td className="mono">{formattaData(r.scade_il)}</td>
                  <td className="text-right whitespace-nowrap">
                    {r.stato === 'COMPLETATA' && (
                      <button className="btn btn-primary btn-sm" onClick={() => setEsamina(r.id)}>Esamina e acquisisci</button>
                    )}
                    {r.stato === 'INVIATA' && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={async () => { try { await api.post(`/verifiche-remote/${r.id}/annulla`); carica(); } catch (e) { setErrore((e as Error).message); } }}
                      >
                        Annulla
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-3">
          <button className="btn btn-secondary btn-sm" onClick={() => setNuova(true)}>Nuova richiesta al cliente…</button>
        </div>
      </div>

      {nuova && (
        <NuovaRichiestaModal
          fascicoloId={fascicoloId}
          onChiudi={() => setNuova(false)}
          onCreata={(r) => { setNuova(false); setLinkCreato(r); carica(); }}
        />
      )}
      {linkCreato && (
        <Modal title="Collegamento creato" onClose={() => setLinkCreato(null)}>
          <div className="space-y-3 text-sm">
            {linkCreato.emailInviata
              ? <Riquadro tipo="info">Email inviata al cliente. Il collegamento, se serve, è anche qui:</Riquadro>
              : <p>Invia questo collegamento al cliente (email, PEC o come preferisci):</p>}
            <div className="rounded-lg bg-ink-50 border border-ink-100 px-3 py-2 font-mono text-xs break-all select-all">{linkCreato.url}</div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-ink-400">Vale fino al {formattaData(linkCreato.scadeIl)} e si usa una volta sola.</span>
              <button className="btn btn-primary btn-sm" onClick={() => { navigator.clipboard?.writeText(linkCreato.url); }}>Copia</button>
            </div>
          </div>
        </Modal>
      )}
      {esamina && (
        <EsaminaModal
          richiestaId={esamina}
          onChiudi={() => setEsamina(null)}
          onAcquisita={(titolari) => {
            setEsamina(null);
            carica();
            onDatiAcquisiti();
            if (titolari.length) onTitolariDichiarati(titolari);
          }}
        />
      )}
    </>
  );
}

function NuovaRichiestaModal({ fascicoloId, onChiudi, onCreata }: {
  fascicoloId: string;
  onChiudi: () => void;
  onCreata: (r: { url: string; scadeIl: string; emailInviata: boolean }) => void;
}) {
  const [cosa, setCosa] = useState({ datiIdentificativi: true, documento: true, titolari: false, pep: true });
  const [email, setEmail] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      const r = await api.post<{ url: string; scadeIl: string; emailInviata: boolean }>(`/fascicoli/${fascicoloId}/verifica-remota`, {
        richieste: cosa,
        emailCliente: email.trim() || undefined,
      });
      onCreata(r);
    } catch (err) {
      setErrore((err as Error).message);
      setInvio(false);
    }
  };

  const voce = (chiave: keyof typeof cosa, testo: string) => (
    <label className="flex items-center gap-2 cursor-pointer text-sm">
      <input type="checkbox" className="!w-4" checked={cosa[chiave]} onChange={(e) => setCosa({ ...cosa, [chiave]: e.target.checked })} />
      {testo}
    </label>
  );

  return (
    <Modal title="Richiedi i dati al cliente" onClose={onChiudi}>
      <form onSubmit={submit} className="space-y-3 text-sm">
        <p>Scegli cosa chiedere: il modulo del cliente mostrerà solo queste sezioni.</p>
        <div className="space-y-2">
          {voce('datiIdentificativi', 'Dati identificativi (nome, nascita, residenza, estremi documento)')}
          {voce('documento', 'Copia del documento d’identità (upload)')}
          {voce('titolari', 'Dichiarazione di titolarità effettiva (per società ed enti)')}
          {voce('pep', 'Dichiarazione sullo status di persona politicamente esposta')}
        </div>
        <div>
          <label className="label">Email del cliente (facoltativa: se la indichi, l’invito parte da qui)</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@esempio.it" />
        </div>
        {errore && <div className="errore">{errore}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-secondary" onClick={onChiudi}>Annulla</button>
          <button className="btn btn-primary" disabled={invio}>{invio ? 'Creazione…' : 'Crea il collegamento'}</button>
        </div>
      </form>
    </Modal>
  );
}

function EsaminaModal({ richiestaId, onChiudi, onAcquisita }: {
  richiestaId: string;
  onChiudi: () => void;
  onAcquisita: (titolariDichiarati: any[]) => void;
}) {
  const [dettaglio, setDettaglio] = useState<any>(null);
  const [applica, setApplica] = useState({ applicaDatiIdentificativi: true, applicaPep: true, acquisisciDocumenti: true });
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  useEffect(() => {
    api.get<any>(`/verifiche-remote/${richiestaId}`).then(setDettaglio).catch((e) => setErrore(e.message));
  }, [richiestaId]);

  const acquisisci = async () => {
    setErrore('');
    setInvio(true);
    try {
      const r = await api.post<{ titolariDichiarati: any[] }>(`/verifiche-remote/${richiestaId}/acquisisci`, applica);
      onAcquisita(r.titolariDichiarati ?? []);
    } catch (e) {
      setErrore((e as Error).message);
      setInvio(false);
    }
  };

  const d = dettaglio?.dati;
  const di = d?.datiIdentificativi;

  return (
    <Modal title="Esamina la verifica compilata dal cliente" onClose={onChiudi} wide>
      <div className="space-y-4 text-sm">
        {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
        {!dettaglio && !errore && <div className="text-ink-400">Caricamento…</div>}
        {dettaglio && (
          <>
            {di && (
              <section>
                <h3 className="!mt-0 !mb-2">Dati identificativi dichiarati</h3>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-ink-50 border border-ink-100 px-4 py-3">
                  {Object.entries({
                    'Nome': `${di.nome ?? ''} ${di.cognome ?? ''}`.trim(), 'Codice fiscale': di.codiceFiscale,
                    'Nascita': [di.dataNascita, di.luogoNascita].filter(Boolean).join(' — '), 'Residenza': di.residenza,
                    'Documento': [di.documentoTipo, di.documentoNumero].filter(Boolean).join(' '), 'Scadenza documento': di.documentoScadenza,
                  }).map(([k, v]) => v ? <div key={k}><span className="text-ink-400">{k}:</span> <strong>{String(v)}</strong></div> : null)}
                </div>
              </section>
            )}
            {d?.pep && (
              <section>
                <h3 className="!mt-0 !mb-2">Dichiarazione PEP</h3>
                {d.pep.dichiarato
                  ? <Riquadro tipo="critico">Il cliente SI DICHIARA politicamente esposto{d.pep.dettagli ? `: ${d.pep.dettagli}` : ''}. L’acquisizione imposta la qualifica sul cliente (verifica rafforzata, art. 24 co. 5).</Riquadro>
                  : <p>Il cliente dichiara di NON essere persona politicamente esposta.</p>}
              </section>
            )}
            {Array.isArray(d?.titolari) && d.titolari.length > 0 && (
              <section>
                <h3 className="!mt-0 !mb-2">Titolari effettivi dichiarati</h3>
                <ul className="list-disc ml-5">
                  {d.titolari.map((t: any, i: number) => (
                    <li key={i}><strong>{t.nominativo}</strong>{t.codiceFiscale ? ` — ${t.codiceFiscale}` : ''}{t.quota ? ` — ${t.quota}%` : ''}</li>
                  ))}
                </ul>
                <div className="aiuto">
                  La dichiarazione del cliente non basta: all’acquisizione ti verrà proposta nel
                  modulo della titolarità, dove scegli criterio e motivazione (artt. 20-22).
                </div>
              </section>
            )}
            {dettaglio.allegati?.length > 0 && (
              <section>
                <h3 className="!mt-0 !mb-2">Allegati</h3>
                <ul className="list-disc ml-5">
                  {dettaglio.allegati.map((a: any) => (
                    <li key={a.indice}>
                      <a href={`/api/verifiche-remote/${richiestaId}/allegati/${a.indice}`} target="_blank" rel="noreferrer">{a.nome}</a>
                      {' '}({Math.round(a.dimensione / 1024)} KB) <span className="mono text-xs text-ink-400">SHA-256 {String(a.sha256).slice(0, 16)}…</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {d?.dichiarazione && (
              <p className="text-xs text-ink-400">
                Dichiarazione di veridicità ex art. 22 accettata da {d.dichiarazione.nomeDichiarante ?? 'cliente'} il{' '}
                {d.dichiarazione.dataOra ? new Date(d.dichiarazione.dataOra).toLocaleString('it-IT') : '—'}.
              </p>
            )}

            <section className="border-t border-ink-100 pt-3 space-y-2">
              <h3 className="!mt-0 !mb-1">Cosa acquisire nel fascicolo</h3>
              {di && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="!w-4" checked={applica.applicaDatiIdentificativi} onChange={(e) => setApplica({ ...applica, applicaDatiIdentificativi: e.target.checked })} />
                  Dati identificativi (cifrati nell’anagrafica del cliente)
                </label>
              )}
              {d?.pep && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="!w-4" checked={applica.applicaPep} onChange={(e) => setApplica({ ...applica, applicaPep: e.target.checked })} />
                  Qualifica PEP dichiarata
                </label>
              )}
              {dettaglio.allegati?.length > 0 && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="!w-4" checked={applica.acquisisciDocumenti} onChange={(e) => setApplica({ ...applica, acquisisciDocumenti: e.target.checked })} />
                  Allegati come documenti del fascicolo (conservazione decennale, impronta inclusa)
                </label>
              )}
            </section>

            <div className="flex justify-end gap-2 pt-1">
              <button className="btn btn-secondary" onClick={onChiudi}>Chiudi</button>
              <button className="btn btn-primary" onClick={acquisisci} disabled={invio}>
                {invio ? 'Acquisizione…' : 'Acquisisci quanto selezionato'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
