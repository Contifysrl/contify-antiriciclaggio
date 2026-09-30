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
  /** AR-M22: scopo e natura della prestazione (art. 18 co. 1 lett. c), dal fascicolo. */
  prestazione?: { codice: string; descrizione: string; tipoRapporto: 'CONTINUATIVO' | 'OCCASIONALE'; dataConferimento: string | null; scopoNatura: string | null } | null;
  /** AR-M23: modello AV.4 per opzione (1 PF in proprio, 2 PF tramite esecutore, 3 società, 4 residuale). */
  opzione?: 1 | 2 | 3 | 4 | null;
  dichiarante?: { nominativo: string; codiceFiscale: string | null; natoA: string | null; natoIl: string | null; nazionalita: string | null; residenza: string | null; domicilio: string | null; qualita: string | null } | null;
  societa?: { denominazione: string; sedeLegale: string | null; registroImpreseDi: string | null; rea: string | null; codiceFiscale: string | null } | null;
  titolari?: Array<{ nominativo: string; codiceFiscale: string | null; natoA: string | null; natoIl: string | null; residenza: string | null; relazione: string; etichettaCriterio: string; quota: number | null }>;
  attivita?: { descrizione: string | null; ateco: string | null; settore: string | null } | null;
  ambito?: { provincia: string | null; paese: string | null; classe: 'ITALIA' | 'UE' | 'EXTRA_UE' | 'RISCHIO' | null } | null;
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
  // AR-M22: scopo e natura della prestazione.
  const prestazione = pre?.prestazione ?? null;
  const [scopo, setScopo] = useState<'CONFERMA' | 'PRECISA' | ''>(prestazione && !prestazione.scopoNatura ? 'PRECISA' : '');
  const [scopoTesto, setScopoTesto] = useState('');
  const [risposte, setRisposte] = useState<Record<string, { risposta: 'SI' | 'NO' | ''; dettagli: string }>>({});
  const [pepSoggetti, setPepSoggetti] = useState<Record<string, { pep: boolean | null; dettagli: string }>>({});
  const soggettiPep = pre ? [
    ...pre.titolariProposti.map((t) => ({ nominativo: t.nominativo, ruolo: 'TITOLARE_EFFETTIVO' as const, etichetta: 'titolare effettivo' })),
    ...(pre.esecutore ? [{ nominativo: pre.esecutore.nominativo, ruolo: 'ESECUTORE' as const, etichetta: pre.esecutore.carica }] : []),
  ].filter((x, i, a) => a.findIndex((y) => y.nominativo === x.nominativo) === i) : [];
  const [dichiara, setDichiara] = useState(false);
  const [nomeDichiarante, setNomeDichiarante] = useState(pre?.dichiarante?.nominativo ?? '');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  // AR-M23: il modello AV.4 per opzione. Dati di chi firma, PEP del dichiarante, attività, ambito, fondi (facoltativi).
  const opzione: 1 | 2 | 3 | 4 = pre?.opzione ?? 3;
  const [dich, setDich] = useState<Record<string, string>>({
    codiceFiscale: pre?.dichiarante?.codiceFiscale ?? '', natoA: pre?.dichiarante?.natoA ?? '', natoIl: pre?.dichiarante?.natoIl ?? '',
    nazionalita: pre?.dichiarante?.nazionalita ?? '', residenza: pre?.dichiarante?.residenza ?? '', domicilio: pre?.dichiarante?.domicilio ?? '',
  });
  const [pepDich, setPepDich] = useState<{ pep: boolean | null; dettagli: string }>({ pep: null, dettagli: '' });
  const [attivita, setAttivita] = useState([pre?.attivita?.descrizione, pre?.attivita?.ateco ? `ATECO ${pre.attivita.ateco}` : null].filter(Boolean).join(' — '));
  const [ambito, setAmbito] = useState<Record<string, string>>({
    italiaProvincia: pre?.ambito?.classe === 'ITALIA' ? (pre.ambito.provincia ?? '') : '', paeseUe: pre?.ambito?.classe === 'UE' ? (pre.ambito.paese ?? '') : '',
    paeseExtraUe: pre?.ambito?.classe === 'EXTRA_UE' ? (pre.ambito.paese ?? '') : '', paeseRischio: pre?.ambito?.classe === 'RISCHIO' ? (pre.ambito.paese ?? '') : '', altro: '',
  });
  const [provenienzaFondi, setProvenienzaFondi] = useState('');
  const [mezziPagamento, setMezziPagamento] = useState('');

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
      if (prestazione) {
        if (!scopo) { setErrore('Indica se lo scopo della prestazione è quello descritto oppure precisalo'); return; }
        if (scopo === 'PRECISA' && !scopoTesto.trim()) { setErrore('Indica lo scopo per cui richiedi la prestazione allo studio'); return; }
      }
      if (!conferma) { setErrore(opzione === 1 ? 'Indica se agisci in proprio oppure per conto di altri' : 'Indica se confermi o correggi la ricostruzione del titolare effettivo'); return; }
      if (conferma === 'CORREGGE' && !correzioni.trim() && !titolari.some((t) => t.nominativo.trim())) { setErrore(opzione === 1 ? 'Indica per conto di chi agisci (nome, cognome e codice fiscale) o descrivi la situazione' : 'Descrivi cosa non corrisponde o indica i titolari effettivi'); return; }
      if (pre.domande.some((d) => !risposte[d]?.risposta)) { setErrore('Rispondi a tutte le domande sul controllo della società'); return; }
      if (soggettiPep.some((s) => pepSoggetti[s.nominativo]?.pep == null)) { setErrore('Indica per ciascuna persona se è politicamente esposta'); return; }
      if (opzione === 1 && pepDich.pep == null) { setErrore('Indica se sei una persona politicamente esposta'); return; }
      if (pepDich.pep === true && !pepDich.dettagli.trim()) { setErrore('Indica la carica pubblica ricoperta (o il legame con chi la ricopre)'); return; }
    }
    if (!dichiara) { setErrore('Conferma la dichiarazione di veridicità per procedere'); return; }
    setInvio(true);
    try {
      const dati: any = { dichiarazione: { accettata: true, nomeDichiarante } };
      if (pre && info.richieste.dichiarazioneTe) {
        dati.dichiarazioneTe = {
          scopo: prestazione ? { conferma: scopo, testo: scopo === 'PRECISA' ? scopoTesto.trim() : '' } : null,
          conferma,
          correzioni: conferma === 'CORREGGE' ? correzioni.trim() : '',
          titolari: conferma === 'CORREGGE' ? titolari.filter((t) => t.nominativo.trim()).map((t) => ({ nominativo: t.nominativo.trim(), codiceFiscale: t.codiceFiscale.trim().toUpperCase(), quota: t.quota.trim() })) : [],
          risposte: pre.domande.map((d) => ({ domanda: d, risposta: risposte[d].risposta, dettagli: risposte[d].dettagli })),
          pep: soggettiPep.map((s) => ({ nominativo: s.nominativo, ruolo: s.ruolo, pep: pepSoggetti[s.nominativo].pep === true, dettagli: pepSoggetti[s.nominativo].dettagli })),
          // AR-M23: modello AV.4 — chi firma, il suo status PEP, attività, ambito, fondi (facoltativi).
          dichiarante: { nome: nomeDichiarante.trim(), qualita: pre.dichiarante?.qualita ?? pre.esecutore?.carica ?? null, ...dich },
          pepDichiarante: opzione === 1 ? { pep: pepDich.pep === true, dettagli: pepDich.dettagli.trim() } : undefined,
          attivita: attivita.trim(), ambito, provenienzaFondi: provenienzaFondi.trim(), mezziPagamento: mezziPagamento.trim(),
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

      {pre && info.richieste.dichiarazioneTe && prestazione && (
        <section className="space-y-3" data-test="dichiarazione-scopo">
          <h2 className="!text-base !m-0">Scopo e natura della prestazione richiesta</h2>
          <p className="text-sm text-ink-500">
            La legge chiede allo studio di conoscere lo scopo e la natura della prestazione (art. 18 co. 1 lett. c DLgs. 231/2007)
            e al cliente di fornire l'informazione per iscritto (art. 22).
          </p>
          <div className="rounded-lg bg-ink-50 border border-ink-100 px-4 py-3 text-sm space-y-1">
            <div>Prestazione richiesta: <strong>{prestazione.descrizione}</strong> ({prestazione.tipoRapporto === 'OCCASIONALE' ? 'prestazione occasionale' : 'rapporto continuativo'}{prestazione.dataConferimento ? `, conferita il ${dataIt(prestazione.dataConferimento)}` : ''}).</div>
            {prestazione.scopoNatura && <div>Scopo e natura, come risultano allo studio: <em>{prestazione.scopoNatura}</em></div>}
          </div>
          {prestazione.scopoNatura ? (
            <div className="flex gap-2">
              <label className={`flex-1 border rounded-lg px-3 py-2 cursor-pointer text-sm ${scopo === 'CONFERMA' ? 'border-teal-400 bg-teal-50' : 'border-ink-200'}`}>
                <input type="radio" className="!w-auto mr-2" checked={scopo === 'CONFERMA'} onChange={() => setScopo('CONFERMA')} data-test="conferma-scopo" />
                Confermo: lo scopo è quello descritto
              </label>
              <label className={`flex-1 border rounded-lg px-3 py-2 cursor-pointer text-sm ${scopo === 'PRECISA' ? 'border-amber-400 bg-amber-50' : 'border-ink-200'}`}>
                <input type="radio" className="!w-auto mr-2" checked={scopo === 'PRECISA'} onChange={() => setScopo('PRECISA')} data-test="precisa-scopo" />
                Preciso o integro
              </label>
            </div>
          ) : (
            <p className="text-sm">Lo studio non ha ancora descritto lo scopo: lo indichi lei qui sotto.</p>
          )}
          {scopo === 'PRECISA' && (
            <textarea className="input" rows={3} value={scopoTesto} onChange={(e) => setScopoTesto(e.target.value)} placeholder="es. tenuta della contabilità e adempimenti fiscali dell'attività di …; assistenza nella cessione di …" data-test="scopo-testo" />
          )}
        </section>
      )}

      {pre && info.richieste.dichiarazioneTe && (
        <section className="space-y-3" data-test="dichiarante">
          <h2 className="!text-base !m-0">Chi rende la dichiarazione</h2>
          <p className="text-sm text-ink-500">
            {opzione === 1
              ? 'La dichiarazione è sua: controlli i dati e completi quelli mancanti.'
              : <>Rende la dichiarazione <strong>{pre.dichiarante?.nominativo ?? 'chi rappresenta il cliente'}</strong>{pre.dichiarante?.qualita ? ` in qualità di ${pre.dichiarante.qualita}` : ''}: controlli i dati e completi quelli mancanti.</>}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Nome e cognome</label><input className="input" value={nomeDichiarante} onChange={(e) => setNomeDichiarante(e.target.value)} required data-test="dichiarante-nome" /></div>
            <div><label className="label">Codice fiscale</label><input className="input" value={dich.codiceFiscale} onChange={(e) => setDich({ ...dich, codiceFiscale: e.target.value.toUpperCase() })} /></div>
            <div><label className="label">Nato/a a</label><input className="input" value={dich.natoA} onChange={(e) => setDich({ ...dich, natoA: e.target.value })} /></div>
            <div><label className="label">Data di nascita</label><input className="input" type="date" value={dich.natoIl} onChange={(e) => setDich({ ...dich, natoIl: e.target.value })} /></div>
            <div><label className="label">Residenza (comune, via, n.)</label><input className="input" value={dich.residenza} onChange={(e) => setDich({ ...dich, residenza: e.target.value })} /></div>
            <div><label className="label">Domicilio (se diverso)</label><input className="input" value={dich.domicilio} onChange={(e) => setDich({ ...dich, domicilio: e.target.value })} /></div>
          </div>
          {opzione === 1 && (
            <div className="rounded-lg border border-ink-100 px-3 py-2 text-sm" data-test="pep-dichiarante">
              <div className="mb-1">È una <strong>persona politicamente esposta</strong>? (ricopre o ha cessato da meno di un anno cariche pubbliche apicali, o è familiare o stretto collaboratore di chi le ricopre)</div>
              <div className="flex gap-3">
                <label className="flex items-center gap-1 cursor-pointer"><input type="radio" className="!w-auto" checked={pepDich.pep === false} onChange={() => setPepDich({ pep: false, dettagli: '' })} data-test="pep-dichiarante-no" /> No</label>
                <label className="flex items-center gap-1 cursor-pointer"><input type="radio" className="!w-auto" checked={pepDich.pep === true} onChange={() => setPepDich({ pep: true, dettagli: pepDich.dettagli })} /> Sì</label>
              </div>
              {pepDich.pep === true && <input className="input mt-1" placeholder="Carica e da quando" value={pepDich.dettagli} onChange={(e) => setPepDich({ pep: true, dettagli: e.target.value })} required />}
            </div>
          )}
        </section>
      )}

      {pre && info.richieste.dichiarazioneTe && opzione === 1 && (
        <section className="space-y-3" data-test="dichiarazione-te">
          <h2 className="!text-base !m-0">Titolare effettivo</h2>
          <p className="text-sm text-ink-500">
            La legge chiede al cliente di dichiarare per iscritto per conto di chi agisce (art. 22 DLgs. 231/2007). Per una persona fisica che richiede la prestazione per sé non esiste un titolare effettivo diverso da lei.
          </p>
          <div className="flex gap-2">
            <label className={`flex-1 border rounded-lg px-3 py-2 cursor-pointer text-sm ${conferma === 'CONFERMA' ? 'border-teal-400 bg-teal-50' : 'border-ink-200'}`}>
              <input type="radio" className="!w-auto mr-2" checked={conferma === 'CONFERMA'} onChange={() => setConferma('CONFERMA')} data-test="conferma-te" />
              Agisco in proprio: richiedo la prestazione per me e non esiste un diverso titolare effettivo
            </label>
            <label className={`flex-1 border rounded-lg px-3 py-2 cursor-pointer text-sm ${conferma === 'CORREGGE' ? 'border-amber-400 bg-amber-50' : 'border-ink-200'}`}>
              <input type="radio" className="!w-auto mr-2" checked={conferma === 'CORREGGE'} onChange={() => setConferma('CORREGGE')} />
              Agisco per conto di un’altra persona
            </label>
          </div>
          {conferma === 'CORREGGE' && (
            <div className="space-y-2">
              <div>
                <label className="label">Per conto di chi, e in base a quale titolo (procura, tutela, mandato…)</label>
                <textarea className="input" rows={2} value={correzioni} onChange={(e) => setCorrezioni(e.target.value)} placeholder="es. agisco per conto di mio padre, in forza di procura del …" />
              </div>
              <div className="text-sm text-ink-500">Le persone per conto delle quali agisce:</div>
              {titolari.map((t, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[2fr_2fr_auto] items-end">
                  <div><label className="label">Nome e cognome</label><input className="input" value={t.nominativo} onChange={(e) => setTitolari(titolari.map((x, j) => j === i ? { ...x, nominativo: e.target.value } : x))} /></div>
                  <div><label className="label">Codice fiscale</label><input className="input" value={t.codiceFiscale} onChange={(e) => setTitolari(titolari.map((x, j) => j === i ? { ...x, codiceFiscale: e.target.value } : x))} /></div>
                  <button type="button" className="btn btn-ghost btn-sm mb-0.5" onClick={() => setTitolari(titolari.filter((_, j) => j !== i))} disabled={titolari.length === 1}>✕</button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTitolari([...titolari, { nominativo: '', codiceFiscale: '', quota: '' }])}>Aggiungi una persona</button>
            </div>
          )}
        </section>
      )}

      {pre && info.richieste.dichiarazioneTe && opzione !== 1 && (
        <section className="space-y-3" data-test="dichiarazione-te">
          <h2 className="!text-base !m-0">Titolare effettivo: conferma o correggi</h2>
          <p className="text-sm text-ink-500">
            {opzione === 2
              ? <>La legge chiede di dichiarare per iscritto per conto di chi si agisce (art. 22 DLgs. 231/2007). Lo studio ha registrato che lei agisce per conto di <strong>{info.cliente}</strong>: le chiediamo di confermarlo.</>
              : <>La legge chiede al cliente di dichiarare per iscritto chi possiede o controlla la società (art. 22 DLgs. 231/2007). Lo studio ha già ricostruito la situazione{pre.senzaCompagine ? '' : ' dai dati del Registro Imprese'}: le chiediamo di verificarla.</>}
          </p>
          {opzione >= 3 && pre.societa && (
            <div className="rounded-lg bg-ink-50 border border-ink-100 px-4 py-3 text-sm">
              Società/ente: <strong>{pre.societa.denominazione}</strong>{pre.societa.sedeLegale ? `, sede legale in ${pre.societa.sedeLegale}` : ''}{pre.societa.registroImpreseDi ? `, Registro delle Imprese di ${pre.societa.registroImpreseDi}` : ''}{pre.societa.rea ? ` (REA ${pre.societa.rea})` : ''}{pre.societa.codiceFiscale ? `, codice fiscale ${pre.societa.codiceFiscale}` : ''}.
            </div>
          )}
          {opzione >= 3 && !pre.senzaCompagine && (
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
            </div>
          )}
          {(pre.titolari?.length ?? 0) > 0 ? (
            <div className="rounded-lg bg-ink-50 border border-ink-100 px-4 py-3 text-sm space-y-1" data-test="titolari-modello">
              <div>{opzione === 2 ? 'Persona per conto della quale agisce:' : opzione === 4 ? 'Titolare effettivo individuato con il criterio residuale (poteri di rappresentanza, amministrazione o direzione — art. 20 co. 5):' : pre.titolari!.length > 1 ? 'Titolari effettivi individuati:' : 'Titolare effettivo individuato:'}</div>
              {pre.titolari!.map((t, i) => (
                <div key={i}><strong>{t.nominativo}</strong>{t.codiceFiscale ? ` (${t.codiceFiscale})` : ''} — {t.relazione}{t.natoA || t.natoIl ? `; nato/a ${t.natoA ? `a ${t.natoA}` : ''}${t.natoIl ? ` il ${dataIt(t.natoIl)}` : ''}` : ''}{t.residenza ? `; residente in ${t.residenza}` : ''}</div>
              ))}
            </div>
          ) : opzione >= 3 && !pre.senzaCompagine ? (
            <p className="text-sm">In base alla ripartizione nessuna persona fisica supera la soglia di legge: contano le risposte alle domande qui sotto.</p>
          ) : opzione >= 3 ? (
            <p className="text-sm">Lo studio non dispone ancora dei dati camerali: indichi qui sotto i titolari effettivi.</p>
          ) : null}
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

          {pre.domande.length > 0 && <>
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
          </>}

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

      {pre && info.richieste.dichiarazioneTe && (
        <section className="space-y-3" data-test="attivita-ambito">
          <h2 className="!text-base !m-0">Attività, ambito territoriale, fondi</h2>
          <div>
            <label className="label">Attività e settore merceologico principale</label>
            <input className="input" value={attivita} onChange={(e) => setAttivita(e.target.value)} placeholder="es. commercio al dettaglio di abbigliamento" data-test="attivita" />
          </div>
          <div>
            <div className="label">Dove si svolge prevalentemente l’attività (anche più risposte)</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div><label className="text-xs text-ink-500">Italia — provincia</label><input className="input" value={ambito.italiaProvincia} onChange={(e) => setAmbito({ ...ambito, italiaProvincia: e.target.value })} placeholder="es. PD" /></div>
              <div><label className="text-xs text-ink-500">Paese UE</label><input className="input" value={ambito.paeseUe} onChange={(e) => setAmbito({ ...ambito, paeseUe: e.target.value })} /></div>
              <div><label className="text-xs text-ink-500">Paese extra UE</label><input className="input" value={ambito.paeseExtraUe} onChange={(e) => setAmbito({ ...ambito, paeseExtraUe: e.target.value })} /></div>
              <div><label className="text-xs text-ink-500">Paese a rischio riciclaggio/finanziamento del terrorismo</label><input className="input" value={ambito.paeseRischio} onChange={(e) => setAmbito({ ...ambito, paeseRischio: e.target.value })} /></div>
            </div>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-600">Provenienza dei fondi e mezzi di pagamento (compilare se lo studio lo ha chiesto o se la prestazione riguarda un’operazione)</summary>
            <div className="space-y-2 mt-2">
              <div><label className="label">Situazione economico-patrimoniale e/o provenienza dei fondi utilizzati nell’operazione</label><textarea className="input" rows={2} value={provenienzaFondi} onChange={(e) => setProvenienzaFondi(e.target.value)} /></div>
              <div><label className="label">Mezzi di pagamento forniti allo studio per l’operazione</label><input className="input" value={mezziPagamento} onChange={(e) => setMezziPagamento(e.target.value)} placeholder="es. bonifico da conto intestato al cliente" /></div>
            </div>
          </details>
          <p className="text-xs text-ink-400">
            Con l’invio dichiara inoltre che i fondi e le risorse economiche eventualmente utilizzati non provengono né sono destinati ad attività criminose o al finanziamento del terrorismo, e di non essere destinatario di misure di congelamento (d.lgs. 109/2007).
          </p>
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
        {!(pre && info.richieste.dichiarazioneTe) && (
          <div>
            <label className="label">Nome e cognome di chi compila</label>
            <input className="input" value={nomeDichiarante} onChange={(e) => setNomeDichiarante(e.target.value)} required />
          </div>
        )}
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
