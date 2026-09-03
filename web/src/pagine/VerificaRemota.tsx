import { FormEvent, useEffect, useState } from 'react';

// ── Pagina PUBBLICA dell'adeguata verifica a distanza (AR-M8) ──
// Nessuna sessione: solo il token nel link. Il cliente compila,
// allega e dichiara; i dati arrivano cifrati allo studio.

interface DichiarazioneTePre {
  cliente: { denominazione: string; codiceFiscale: string | null; sede: string | null };
  fonte: { visuraDel: string | null; dataElencoSoci: string | null; capitaleSottoscritto: number | null };
  ripartizione: Array<{ nome: string; tipo: string; quotaPercento: number; diritto: string; paese: string | null }>;
  cariche: Array<{ nome: string; carica: string; rappresentanzaLegale: boolean }>;
  titolariProposti: Array<{ nominativo: string; etichettaCriterio: string; quota: number | null }>;
  criterioApplicato: string;
  esecutore: { nominativo: string; carica: string } | null;
  domande: string[];
  senzaCompagine: boolean;
}

interface InfoRichiesta {
  studio: string;
  logo: string | null;
  cliente: string;
  richieste: { datiIdentificativi: boolean; documento: boolean; titolari: boolean; pep: boolean; dichiarazioneTe?: boolean };
  dichiarazioneTe?: DichiarazioneTePre | null;
  scadeIl: string;
}

const dataIt = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const pct = (n: number) => `${n.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;

export function VerificaRemota({ token }: { token: string }) {
  const [info, setInfo] = useState<InfoRichiesta | null>(null);
  const [erroreCarico, setErroreCarico] = useState('');
  const [inviata, setInviata] = useState(false);

  useEffect(() => {
    fetch(`/api/pubblico/verifica/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const dati = await r.json();
        if (!r.ok) throw new Error((dati as any)?.errore ?? 'Collegamento non valido');
        setInfo(dati as InfoRichiesta);
      })
      .catch((e) => setErroreCarico((e as Error).message));
  }, [token]);

  return (
    <div className="min-h-screen bg-ink-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-6">
          {info?.logo
            ? <img src={info.logo} alt={`Logo ${info.studio}`} className="h-12 mx-auto object-contain" />
            : <div className="text-xl font-extrabold text-teal-800">{info?.studio ?? 'Adeguata verifica'}</div>}
          {info && <div className="text-sm text-ink-500 mt-1">{info.studio}</div>}
        </div>

        <div className="card p-6 sm:p-8">
          {erroreCarico && (
            <div className="text-center py-8">
              <div className="text-lg font-bold text-ink-800 mb-2">Collegamento non disponibile</div>
              <p className="text-sm text-ink-500">{erroreCarico}</p>
            </div>
          )}
          {!erroreCarico && !info && <div className="text-center py-8 text-sm text-ink-400">Caricamento…</div>}
          {info && inviata && (
            <div className="text-center py-8">
              <div className="text-lg font-bold text-teal-800 mb-2">Grazie, è tutto arrivato.</div>
              <p className="text-sm text-ink-600">
                I dati sono stati trasmessi in forma cifrata a {info.studio}, che li esaminerà e
                la contatterà se servisse altro. Può chiudere questa pagina.
              </p>
            </div>
          )}
          {info && !inviata && <ModuloVerifica token={token} info={info} onInviata={() => setInviata(true)} />}
        </div>

        <p className="text-[11px] text-ink-400 text-center mt-4">
          Modulo predisposto con Contify AR · AntiRiciclaggio — i dati viaggiano cifrati (TLS) e sono
          conservati su server nell'Unione Europea, cifrati con chiave dello studio.
        </p>
      </div>
    </div>
  );
}

function ModuloVerifica({ token, info, onInviata }: { token: string; info: InfoRichiesta; onInviata: () => void }) {
  const [d, setD] = useState<any>({});
  const [pep, setPep] = useState<'no' | 'si' | ''>('');
  const [pepDettagli, setPepDettagli] = useState('');
  const [titolari, setTitolari] = useState<Array<{ nominativo: string; codiceFiscale: string; quota: string }>>([
    { nominativo: '', codiceFiscale: '', quota: '' },
  ]);
  const [files, setFiles] = useState<File[]>([]);
  // AR-M18: dichiarazione art. 22 precompilata.
  const pre = info.dichiarazioneTe ?? null;
  const [conferma, setConferma] = useState<'CONFERMA' | 'CORREGGE' | ''>('');
  const [correzioni, setCorrezioni] = useState('');
  const [risposte, setRisposte] = useState<Record<string, { risposta: 'SI' | 'NO' | ''; dettagli: string }>>({});
  const [pepSoggetti, setPepSoggetti] = useState<Record<string, { pep: boolean | null; dettagli: string }>>({});
  const soggettiPep = pre ? [
    ...pre.titolariProposti.map((t) => ({ nominativo: t.nominativo, ruolo: 'TITOLARE_EFFETTIVO' as const, etichetta: 'titolare effettivo' })),
    ...(pre.esecutore ? [{ nominativo: pre.esecutore.nominativo, ruolo: 'ESECUTORE' as const, etichetta: pre.esecutore.carica }] : []),
  ].filter((x, i, a) => a.findIndex((y) => y.nominativo === x.nominativo) === i) : [];
  const [dichiara, setDichiara] = useState(false);
  const [nomeDichiarante, setNomeDichiarante] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const campo = (chiave: string, etichetta: string, opz: { placeholder?: string; type?: string; obbligatorio?: boolean } = {}) => (
    <div>
      <label className="label">{etichetta}</label>
      <input
        className="input"
        type={opz.type ?? 'text'}
        value={d[chiave] ?? ''}
        onChange={(e) => setD({ ...d, [chiave]: e.target.value })}
        placeholder={opz.placeholder}
        required={opz.obbligatorio !== false}
      />
    </div>
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    if (info.richieste.pep && !pep) { setErrore('Indica se sei una persona politicamente esposta'); return; }
    if (info.richieste.documento && files.length === 0) { setErrore('Allega il documento d’identità'); return; }
    if (pre && info.richieste.dichiarazioneTe) {
      if (!conferma) { setErrore('Indica se confermi o correggi la ricostruzione del titolare effettivo'); return; }
      if (conferma === 'CORREGGE' && !correzioni.trim() && !titolari.some((t) => t.nominativo.trim())) { setErrore('Descrivi cosa non corrisponde o indica i titolari effettivi'); return; }
      if (pre.domande.some((d) => !risposte[d]?.risposta)) { setErrore('Rispondi a tutte le domande sul controllo della società'); return; }
      if (soggettiPep.some((s) => pepSoggetti[s.nominativo]?.pep == null)) { setErrore('Indica per ciascuna persona se è politicamente esposta'); return; }
    }
    if (!dichiara) { setErrore('Conferma la dichiarazione di veridicità per procedere'); return; }
    setInvio(true);
    try {
      const dati: any = { dichiarazione: { accettata: true, nomeDichiarante } };
      if (pre && info.richieste.dichiarazioneTe) {
        dati.dichiarazioneTe = {
          conferma,
          correzioni: conferma === 'CORREGGE' ? correzioni.trim() : '',
          titolari: conferma === 'CORREGGE' ? titolari.filter((t) => t.nominativo.trim()).map((t) => ({ nominativo: t.nominativo.trim(), codiceFiscale: t.codiceFiscale.trim().toUpperCase(), quota: t.quota.trim() })) : [],
          risposte: pre.domande.map((d) => ({ domanda: d, risposta: risposte[d].risposta, dettagli: risposte[d].dettagli })),
          pep: soggettiPep.map((s) => ({ nominativo: s.nominativo, ruolo: s.ruolo, pep: pepSoggetti[s.nominativo].pep === true, dettagli: pepSoggetti[s.nominativo].dettagli })),
        };
      }
      if (info.richieste.datiIdentificativi) dati.datiIdentificativi = d;
      if (info.richieste.pep) dati.pep = { dichiarato: pep === 'si', dettagli: pep === 'si' ? pepDettagli : '' };
      if (info.richieste.titolari) {
        dati.titolari = titolari
          .filter((t) => t.nominativo.trim())
          .map((t) => ({ nominativo: t.nominativo.trim(), codiceFiscale: t.codiceFiscale.trim().toUpperCase(), quota: t.quota.trim() }));
      }
      const form = new FormData();
      form.set('dati', JSON.stringify(dati));
      files.forEach((f, i) => form.set(`documento${i}`, f));
      const r = await fetch(`/api/pubblico/verifica/${encodeURIComponent(token)}`, { method: 'POST', body: form });
      const corpo = await r.json().catch(() => null);
      if (!r.ok) throw new Error((corpo as any)?.errore ?? `Errore ${r.status}`);
      onInviata();
    } catch (err) {
      setErrore((err as Error).message);
      setInvio(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <h1 className="!text-xl !mb-1">Dati per l'adeguata verifica</h1>
        <p className="text-sm text-ink-500">
          La normativa antiriciclaggio (DLgs. 231/2007) richiede allo studio di identificare i propri
          clienti. Le chiediamo pochi minuti per <strong>{info.cliente}</strong>.
        </p>
      </div>

      {info.richieste.datiIdentificativi && (
        <section className="space-y-3">
          <h2 className="!text-base !m-0">1 · Dati identificativi</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {campo('nome', 'Nome')}
            {campo('cognome', 'Cognome')}
            {campo('codiceFiscale', 'Codice fiscale', { placeholder: 'RSSMRA80A01H501U' })}
            {campo('dataNascita', 'Data di nascita', { type: 'date' })}
            {campo('luogoNascita', 'Luogo di nascita')}
            {campo('residenza', 'Indirizzo di residenza')}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Tipo di documento</label>
              <select className="input" value={d.documentoTipo ?? 'CARTA_IDENTITA'} onChange={(e) => setD({ ...d, documentoTipo: e.target.value })}>
                <option value="CARTA_IDENTITA">Carta d'identità</option>
                <option value="PASSAPORTO">Passaporto</option>
                <option value="PATENTE">Patente</option>
              </select>
            </div>
            {campo('documentoNumero', 'Numero documento')}
            {campo('documentoScadenza', 'Scadenza documento', { type: 'date' })}
          </div>
        </section>
      )}

      {info.richieste.documento && (
        <section className="space-y-2">
          <h2 className="!text-base !m-0">{info.richieste.datiIdentificativi ? '2' : '1'} · Documento d'identità</h2>
          <p className="text-sm text-ink-500">Fotografa o scansiona il documento (fronte e retro): PDF, JPG o PNG, max 8 MB per file.</p>
          <input
            type="file"
            className="input !py-2"
            accept=".pdf,.jpg,.jpeg,.png"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))}
          />
          {files.length > 0 && (
            <ul className="text-xs text-ink-500 list-disc ml-5">
              {files.map((f, i) => <li key={i}>{f.name} ({Math.round(f.size / 1024)} KB)</li>)}
            </ul>
          )}
        </section>
      )}

      {pre && info.richieste.dichiarazioneTe && (
        <section className="space-y-3" data-test="dichiarazione-te">
          <h2 className="!text-base !m-0">Titolare effettivo: conferma o correggi</h2>
          <p className="text-sm text-ink-500">
            La legge chiede al cliente di dichiarare per iscritto chi possiede o controlla la società (art. 22 DLgs. 231/2007).
            Lo studio ha già ricostruito la situazione dai dati del Registro Imprese: le chiediamo di verificarla.
          </p>
          {!pre.senzaCompagine ? (
            <div className="rounded-lg bg-ink-50 border border-ink-100 px-4 py-3 text-sm space-y-2">
              <div>
                Dalla visura camerale{pre.fonte.visuraDel ? ` del ${dataIt(pre.fonte.visuraDel)}` : ''} il capitale
                {pre.fonte.capitaleSottoscritto != null ? ` di € ${pre.fonte.capitaleSottoscritto.toLocaleString('it-IT', { minimumFractionDigits: 2 })}` : ''} risulta così ripartito:
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {pre.ripartizione.map((s, i) => (
                    <tr key={i}><td className="py-0.5">{s.nome}{s.paese && s.paese !== 'IT' ? ` (${s.paese})` : ''}</td><td className="py-0.5 text-right font-mono">{pct(s.quotaPercento)}</td><td className="py-0.5 pl-2 text-ink-400">{s.diritto !== 'PROPRIETA' ? s.diritto.replace(/_/g, ' ').toLowerCase() : ''}</td></tr>
                  ))}
                </tbody>
              </table>
              <div>
                {pre.titolariProposti.length > 0
                  ? <>Titolare effettivo individuato: {pre.titolariProposti.map((t, i) => <span key={i}><strong>{t.nominativo}</strong> ({t.etichettaCriterio}{t.quota != null ? `, ${pct(t.quota)}` : ''}){i < pre.titolariProposti.length - 1 ? '; ' : ''}</span>)}.</>
                  : <>In base a questa ripartizione nessuna persona fisica supera la soglia di legge: contano le risposte alle domande qui sotto.</>}
              </div>
            </div>
          ) : (
            <p className="text-sm">Lo studio non dispone ancora dei dati camerali: indichi qui sotto i titolari effettivi.</p>
          )}
          <div className="flex gap-2">
            <label className={`flex-1 border rounded-lg px-3 py-2 cursor-pointer text-sm ${conferma === 'CONFERMA' ? 'border-teal-400 bg-teal-50' : 'border-ink-200'}`}>
              <input type="radio" className="!w-auto mr-2" checked={conferma === 'CONFERMA'} onChange={() => setConferma('CONFERMA')} data-test="conferma-te" />
              Confermo: corrisponde alla situazione effettiva
            </label>
            <label className={`flex-1 border rounded-lg px-3 py-2 cursor-pointer text-sm ${conferma === 'CORREGGE' ? 'border-amber-400 bg-amber-50' : 'border-ink-200'}`}>
              <input type="radio" className="!w-auto mr-2" checked={conferma === 'CORREGGE'} onChange={() => setConferma('CORREGGE')} />
              Non corrisponde: correggo
            </label>
          </div>
          {conferma === 'CORREGGE' && (
            <div className="space-y-2">
              <div>
                <label className="label">Cosa non corrisponde</label>
                <textarea className="input" rows={3} value={correzioni} onChange={(e) => setCorrezioni(e.target.value)} placeholder="es. la quota di … è stata ceduta il …; il socio … detiene per conto di …" />
              </div>
              <div className="text-sm text-ink-500">Se diversi da quelli indicati, i titolari effettivi sono:</div>
              {titolari.map((t, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto] items-end">
                  <div><label className="label">Nome e cognome</label><input className="input" value={t.nominativo} onChange={(e) => setTitolari(titolari.map((x, j) => j === i ? { ...x, nominativo: e.target.value } : x))} /></div>
                  <div><label className="label">Codice fiscale</label><input className="input" value={t.codiceFiscale} onChange={(e) => setTitolari(titolari.map((x, j) => j === i ? { ...x, codiceFiscale: e.target.value } : x))} /></div>
                  <div><label className="label">% quota</label><input className="input" value={t.quota} onChange={(e) => setTitolari(titolari.map((x, j) => j === i ? { ...x, quota: e.target.value } : x))} /></div>
                  <button type="button" className="btn btn-ghost btn-sm mb-0.5" onClick={() => setTitolari(titolari.filter((_, j) => j !== i))} disabled={titolari.length === 1}>✕</button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTitolari([...titolari, { nominativo: '', codiceFiscale: '', quota: '' }])}>Aggiungi una persona</button>
            </div>
          )}

          <h3 className="!text-sm !mt-3 !mb-0">Informazioni che la visura non riporta</h3>
          <p className="text-sm text-ink-500">Risponda per ciascuna domanda. In caso di «Sì», precisi.</p>
          <div className="space-y-2">
            {pre.domande.map((d, i) => (
              <div key={i} className="rounded-lg border border-ink-100 px-3 py-2 text-sm" data-test={`domanda-${i}`}>
                <div className="mb-1">{d}</div>
                <div className="flex gap-3">
                  <label className="flex items-center gap-1 cursor-pointer"><input type="radio" className="!w-auto" checked={risposte[d]?.risposta === 'NO'} onChange={() => setRisposte({ ...risposte, [d]: { risposta: 'NO', dettagli: '' } })} /> No</label>
                  <label className="flex items-center gap-1 cursor-pointer"><input type="radio" className="!w-auto" checked={risposte[d]?.risposta === 'SI'} onChange={() => setRisposte({ ...risposte, [d]: { risposta: 'SI', dettagli: risposte[d]?.dettagli ?? '' } })} /> Sì</label>
                </div>
                {risposte[d]?.risposta === 'SI' && (
                  <input className="input mt-1" placeholder="Precisi (chi, cosa, da quando)" value={risposte[d].dettagli} onChange={(e) => setRisposte({ ...risposte, [d]: { risposta: 'SI', dettagli: e.target.value } })} required />
                )}
              </div>
            ))}
          </div>

          {soggettiPep.length > 0 && (
            <>
              <h3 className="!text-sm !mt-3 !mb-0">Persone politicamente esposte</h3>
              <p className="text-sm text-ink-500">
                Per ciascuna persona indichi se ricopre o ha cessato da meno di un anno cariche pubbliche apicali, o se è familiare o stretto collaboratore di chi le ricopre.
              </p>
              <div className="space-y-2">
                {soggettiPep.map((s) => (
                  <div key={s.nominativo} className="rounded-lg border border-ink-100 px-3 py-2 text-sm" data-test="pep-soggetto">
                    <div className="mb-1"><strong>{s.nominativo}</strong> <span className="text-ink-400">— {s.etichetta}</span></div>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-1 cursor-pointer"><input type="radio" className="!w-auto" checked={pepSoggetti[s.nominativo]?.pep === false} onChange={() => setPepSoggetti({ ...pepSoggetti, [s.nominativo]: { pep: false, dettagli: '' } })} /> Non è PEP</label>
                      <label className="flex items-center gap-1 cursor-pointer"><input type="radio" className="!w-auto" checked={pepSoggetti[s.nominativo]?.pep === true} onChange={() => setPepSoggetti({ ...pepSoggetti, [s.nominativo]: { pep: true, dettagli: pepSoggetti[s.nominativo]?.dettagli ?? '' } })} /> È PEP</label>
                    </div>
                    {pepSoggetti[s.nominativo]?.pep === true && (
                      <input className="input mt-1" placeholder="Carica e da quando" value={pepSoggetti[s.nominativo].dettagli} onChange={(e) => setPepSoggetti({ ...pepSoggetti, [s.nominativo]: { pep: true, dettagli: e.target.value } })} required />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {info.richieste.titolari && (
        <section className="space-y-2">
          <h2 className="!text-base !m-0">Titolarità effettiva</h2>
          <p className="text-sm text-ink-500">
            Indichi le persone fisiche che, in ultima istanza, possiedono o controllano la società
            (di regola chi detiene più del 25% del capitale, direttamente o indirettamente).
          </p>
          {titolari.map((t, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto] items-end">
              <div>
                <label className="label">Nome e cognome</label>
                <input className="input" value={t.nominativo} onChange={(e) => setTitolari(titolari.map((x, j) => j === i ? { ...x, nominativo: e.target.value } : x))} />
              </div>
              <div>
                <label className="label">Codice fiscale</label>
                <input className="input" value={t.codiceFiscale} onChange={(e) => setTitolari(titolari.map((x, j) => j === i ? { ...x, codiceFiscale: e.target.value } : x))} />
              </div>
              <div>
                <label className="label">% quota</label>
                <input className="input" value={t.quota} onChange={(e) => setTitolari(titolari.map((x, j) => j === i ? { ...x, quota: e.target.value } : x))} placeholder="es. 50" />
              </div>
              <button type="button" className="btn btn-ghost btn-sm mb-0.5" onClick={() => setTitolari(titolari.filter((_, j) => j !== i))} disabled={titolari.length === 1}>✕</button>
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTitolari([...titolari, { nominativo: '', codiceFiscale: '', quota: '' }])}>
            Aggiungi un titolare
          </button>
        </section>
      )}

      {info.richieste.pep && (
        <section className="space-y-2">
          <h2 className="!text-base !m-0">Persone politicamente esposte</h2>
          <p className="text-sm text-ink-500">
            È «politicamente esposto» chi ricopre o ha cessato da meno di un anno cariche pubbliche
            apicali (ministri, parlamentari, sindaci di grandi comuni, vertici di enti e società
            pubbliche…), oppure i loro familiari stretti e chi con loro ha stretti legami d'affari.
          </p>
          <div className="flex gap-2">
            <label className={`flex-1 border rounded-lg px-3 py-2 cursor-pointer text-sm ${pep === 'no' ? 'border-teal-400 bg-teal-50' : 'border-ink-200'}`}>
              <input type="radio" className="!w-auto mr-2" checked={pep === 'no'} onChange={() => setPep('no')} />
              No, nessuna delle situazioni descritte
            </label>
            <label className={`flex-1 border rounded-lg px-3 py-2 cursor-pointer text-sm ${pep === 'si' ? 'border-amber-400 bg-amber-50' : 'border-ink-200'}`}>
              <input type="radio" className="!w-auto mr-2" checked={pep === 'si'} onChange={() => setPep('si')} />
              Sì
            </label>
          </div>
          {pep === 'si' && (
            <div>
              <label className="label">Indichi la carica e da quando</label>
              <input className="input" value={pepDettagli} onChange={(e) => setPepDettagli(e.target.value)} required />
            </div>
          )}
        </section>
      )}

      <section className="space-y-3 border-t border-ink-100 pt-4">
        <div>
          <label className="label">Nome e cognome di chi compila</label>
          <input className="input" value={nomeDichiarante} onChange={(e) => setNomeDichiarante(e.target.value)} required />
        </div>
        <label className="flex items-start gap-2 cursor-pointer text-sm text-ink-700">
          <input type="checkbox" className="!w-4 mt-0.5" checked={dichiara} onChange={(e) => setDichiara(e.target.checked)} />
          <span>
            Dichiaro, consapevole delle responsabilità previste dall'art. 55 co. 3 del DLgs. 231/2007
            per chi fornisce dati falsi o informazioni non veritiere, che quanto indicato è esatto e
            veritiero (art. 22 DLgs. 231/2007).
          </span>
        </label>
      </section>

      {errore && <div className="text-sm text-red-600 font-semibold">{errore}</div>}
      <button className="btn btn-primary w-full justify-center py-2.5" disabled={invio}>
        {invio ? 'Invio in corso…' : 'Invia allo studio in modo sicuro'}
      </button>
    </form>
  );
}
