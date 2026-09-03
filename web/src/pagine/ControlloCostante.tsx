import { useEffect, useState } from 'react';
import { api, dataOggi, formattaData } from '../api';
import { Riquadro } from '../componenti';
import { Badge, ErrorBanner, Modal } from '../components/ui';

// ── AR-M19: controllo costante eseguito e cessazione del rapporto ──
// Due lacune emerse nel collaudo: lo scadenzario calcolava il controllo
// costante ma non c'era modo di dire «l'ho fatto», e nessun fascicolo poteva
// cessare. Qui il professionista registra il controllo (cosa ha guardato,
// con che esito) e chiude il rapporto, da cui decorre la conservazione.

const VERIFICHE: Array<{ codice: string; testo: string }> = [
  { codice: 'ANAGRAFICA', testo: 'Dati anagrafici e sede (visura o riscontro)' },
  { codice: 'COMPAGINE', testo: 'Compagine sociale e cariche' },
  { codice: 'TITOLARI', testo: 'Titolari effettivi (invariati, registro consultato)' },
  { codice: 'OPERATIVITA', testo: 'Operatività e coerenza con scopo e natura della prestazione' },
  { codice: 'LISTE', testo: 'Liste sanzioni e Paesi ad alto rischio' },
  { codice: 'PEP', testo: 'Status PEP del cliente e dei titolari effettivi' },
  { codice: 'DOCUMENTI', testo: 'Validità dei documenti conservati' },
];

export function ControlloCostanteBox({ fascicoloId, fascicolo, onCambiato, vaiA }: {
  fascicoloId: string;
  fascicolo: any;
  onCambiato: () => void;
  vaiA?: (p: string) => void;
}) {
  const [storico, setStorico] = useState<any[]>([]);
  const [modal, setModal] = useState<'controllo' | 'cessazione' | null>(null);
  const [errore, setErrore] = useState('');
  const [esito, setEsito] = useState('');
  const [data, setData] = useState(dataOggi());
  const [tipoEsito, setTipoEsito] = useState<'INVARIATO' | 'DA_RIVALUTARE'>('INVARIATO');
  const [verifiche, setVerifiche] = useState<Record<string, boolean>>({ ANAGRAFICA: true, COMPAGINE: true, TITOLARI: true, LISTE: true });
  const [note, setNote] = useState('');
  const [motivo, setMotivo] = useState('');
  const [invio, setInvio] = useState(false);

  const carica = () => api.get<any[]>(`/fascicoli/${fascicoloId}/controlli-costanti`).then(setStorico).catch(() => setStorico([]));
  useEffect(() => { carica(); }, [fascicoloId]);

  const cessato = fascicolo.stato === 'CESSATO' || Boolean(fascicolo.data_cessazione);

  const registra = async () => {
    setErrore(''); setInvio(true);
    try {
      const r = await api.post<any>(`/fascicoli/${fascicoloId}/controllo-costante`, {
        dataControllo: data, esito: tipoEsito, verifiche: Object.keys(verifiche).filter((k) => verifiche[k]), note,
      });
      setModal(null); setNote('');
      setEsito(r.prossimaValutazione
        ? 'Controllo registrato. Hai indicato che qualcosa è cambiato: registra una nuova valutazione del rischio qui sotto.'
        : 'Controllo costante registrato: la prossima scadenza decorre da oggi.');
      carica(); onCambiato();
    } catch (e) { setErrore((e as Error).message); } finally { setInvio(false); }
  };

  const cessa = async () => {
    setErrore(''); setInvio(true);
    try {
      const r = await api.post<any>(`/fascicoli/${fascicoloId}/cessazione`, { dataCessazione: data, motivo });
      setModal(null);
      setEsito(`Rapporto cessato il ${formattaData(r.dataCessazione)}: i documenti si conservano fino al ${formattaData(r.conservaFinoAl)} (art. 31).${r.ultimoRapporto ? ' Era l’ultimo rapporto in essere con il cliente.' : ''}`);
      carica(); onCambiato();
    } catch (e) { setErrore((e as Error).message); } finally { setInvio(false); }
  };

  return (
    <div className="scheda" data-test="controllo-costante">
      <h3>Controllo costante e rapporto</h3>
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      {esito && <Riquadro tipo="info">{esito}</Riquadro>}
      {cessato ? (
        <Riquadro tipo="info">
          Rapporto cessato il <strong>{formattaData(fascicolo.data_cessazione)}</strong>: il controllo costante non è più dovuto; i dati si conservano dieci anni dalla cessazione.
          <span className="norma">art. 31 co. 1-2 DLgs. 231/2007</span>
        </Riquadro>
      ) : (
        <>
          <p className="aiuto">
            Il controllo costante è obbligatorio nel corso del rapporto (art. 19 co. 1 lett. d); la cadenza è graduata sul rischio. Registrare il controllo eseguito è ciò che, in ispezione, distingue un controllo programmato da un controllo fatto.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary btn-sm" data-test="registra-controllo" onClick={() => { setData(dataOggi()); setModal('controllo'); }}>Registra il controllo costante eseguito</button>
            <button className="btn btn-secondary btn-sm" data-test="cessa-rapporto" onClick={() => { setData(dataOggi()); setModal('cessazione'); }}>Il rapporto è cessato…</button>
            {vaiA && <button className="btn btn-ghost btn-sm" onClick={() => vaiA(`cliente?id=${fascicolo.cliente_id}`)}>Aggiorna da visura (scheda cliente)</button>}
          </div>
        </>
      )}
      {storico.length > 0 && (
        <table className="mt-3" data-test="storico-controlli">
          <thead><tr><th>Data</th><th>Esito</th><th>Cosa è stato controllato</th><th>Note</th><th>Chi</th></tr></thead>
          <tbody>
            {storico.map((s) => (
              <tr key={s.id}>
                <td>{formattaData(s.data_controllo)}</td>
                <td><Badge tone={s.esito === 'INVARIATO' ? 'teal' : 'amber'}>{s.esito === 'INVARIATO' ? 'nulla di nuovo' : 'da rivalutare'}</Badge></td>
                <td className="text-xs">{(s.verifiche as string[]).map((v) => VERIFICHE.find((x) => x.codice === v)?.testo.split(' (')[0] ?? v).join(', ')}</td>
                <td className="text-xs">{s.note ?? '—'}</td>
                <td className="text-xs">{s.eseguito_da ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal === 'controllo' && (
        <Modal title="Registra il controllo costante" onClose={() => setModal(null)}>
          <div className="space-y-3 text-sm">
            <label className="label">Data del controllo</label>
            <input className="input" type="date" value={data} max={dataOggi()} onChange={(e) => setData(e.target.value)} />
            <label className="label">Cosa hai controllato</label>
            <div className="space-y-1">
              {VERIFICHE.map((v) => (
                <label key={v.codice} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="!w-4" checked={Boolean(verifiche[v.codice])} onChange={(e) => setVerifiche({ ...verifiche, [v.codice]: e.target.checked })} />
                  <span>{v.testo}</span>
                </label>
              ))}
            </div>
            <label className="label">Esito</label>
            <label className="flex items-center gap-2 cursor-pointer"><input type="radio" className="!w-4" checked={tipoEsito === 'INVARIATO'} onChange={() => setTipoEsito('INVARIATO')} /> Nulla è cambiato: la valutazione resta valida</label>
            <label className="flex items-center gap-2 cursor-pointer"><input type="radio" className="!w-4" checked={tipoEsito === 'DA_RIVALUTARE'} onChange={() => setTipoEsito('DA_RIVALUTARE')} /> Qualcosa è cambiato: serve una nuova valutazione</label>
            <label className="label">Note{tipoEsito === 'DA_RIVALUTARE' ? ' (obbligatorie: cosa è cambiato)' : ''}</label>
            <textarea className="input min-h-[70px]" value={note} onChange={(e) => setNote(e.target.value)} data-test="controllo-note" />
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={registra} disabled={invio} data-test="controllo-salva">{invio ? 'Registrazione…' : 'Registra'}</button>
            </div>
          </div>
        </Modal>
      )}
      {modal === 'cessazione' && (
        <Modal title="Cessazione del rapporto" onClose={() => setModal(null)}>
          <div className="space-y-3 text-sm">
            <Riquadro tipo="avviso">
              Nulla viene cancellato: il fascicolo resta consultabile e i suoi documenti ricevono il termine di conservazione decennale (art. 31). Se è l’ultimo rapporto con il cliente, il termine si applica anche ai documenti della scheda cliente.
            </Riquadro>
            <label className="label">Data di cessazione</label>
            <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            <label className="label">Motivo (facoltativo)</label>
            <input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Fine dell’incarico, revoca, cessazione dell’attività…" />
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={cessa} disabled={invio} data-test="cessazione-conferma">{invio ? 'Registrazione…' : 'Registra la cessazione'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── AR-M20-02: rivalutazione proposta dal rinnovo della visura ──
// Al rinnovo della visura, se cambiano soci, quote o cariche con poteri, il
// programma propone di registrare il controllo costante «da rivalutare» sui
// fascicoli vivi valutati. Il professionista lo registra (con le variazioni
// già scritte nelle note) oppure dichiara che nulla va rivalutato, dicendo
// perché: in entrambi i casi la proposta chiude con un esito documentato.

export function RivalutazioneBox({ proposte, onCambiato, vaiA }: {
  proposte: any[];
  onCambiato: () => void;
  vaiA?: (p: string) => void;
}) {
  const [aperta, setAperta] = useState<any | null>(null);
  const [tipoEsito, setTipoEsito] = useState<'INVARIATO' | 'DA_RIVALUTARE'>('DA_RIVALUTARE');
  const [note, setNote] = useState('');
  const [data, setData] = useState(dataOggi());
  const [errore, setErrore] = useState('');
  const [esito, setEsito] = useState('');
  const [invio, setInvio] = useState(false);

  const aperte = proposte.filter((p) => p.ambito === 'RIVALUTAZIONE' && p.stato === 'PROPOSTA');
  if (!aperte.length && !esito) return null;

  const apri = (p: any) => { setAperta(p); setTipoEsito('DA_RIVALUTARE'); setNote(p.contenuto?.riepilogo ?? ''); setData(dataOggi()); setErrore(''); };
  const registra = async () => {
    if (!aperta) return;
    setErrore(''); setInvio(true);
    try {
      const r = await api.post<any>(`/fascicoli/${aperta.contenuto.fascicoloId}/controllo-costante`, {
        dataControllo: data, esito: tipoEsito, verifiche: aperta.contenuto?.verificheProposte ?? ['COMPAGINE', 'TITOLARI'], note, propostaId: aperta.id,
      });
      setAperta(null);
      setEsito(r.prossimaValutazione
        ? `Controllo costante registrato sul fascicolo ${aperta.contenuto.codice}: ora registra la nuova valutazione del rischio dal fascicolo.`
        : `Controllo costante registrato sul fascicolo ${aperta.contenuto.codice}: hai motivato perché la valutazione resta valida.`);
      onCambiato();
    } catch (e) { setErrore((e as Error).message); } finally { setInvio(false); }
  };

  return (
    <div className="riquadro avviso" data-test="rivalutazione-proposta">
      <strong>La compagine è cambiata: il programma propone il controllo costante «da rivalutare»</strong>
      <p className="aiuto !mt-1">
        Il rinnovo della visura ha cambiato soci, quote o cariche con poteri. Il controllo costante (art. 19 co. 1 lett. d) va documentato e, se la struttura incide sul rischio o sui titolari effettivi, la valutazione si aggiorna (Regole tecniche CNDCEC 2025). Decidi tu: registra il controllo con l’esito che ritieni.
      </p>
      {esito && <Riquadro tipo="info">{esito}</Riquadro>}
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      <ul className="mt-2 space-y-2">
        {aperte.map((p) => (
          <li key={p.id} className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm" data-test="rivalutazione-voce">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Badge tone="amber">fascicolo {p.contenuto?.codice ?? '—'}</Badge>
                <ul className="mt-1 ml-4 list-disc text-xs text-ink-700">{(p.contenuto?.righe ?? []).map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
              </div>
              <div className="shrink-0 flex flex-col gap-1">
                <button className="btn btn-primary btn-sm" data-test="rivalutazione-registra" onClick={() => apri(p)}>Registra il controllo costante…</button>
                {vaiA && p.contenuto?.fascicoloId && <button className="btn btn-ghost btn-sm" onClick={() => vaiA(`fascicolo?id=${p.contenuto.fascicoloId}`)}>Apri il fascicolo</button>}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {aperta && (
        <Modal title={`Controllo costante — fascicolo ${aperta.contenuto?.codice ?? ''}`} onClose={() => setAperta(null)}>
          <div className="space-y-3 text-sm">
            <label className="label">Data del controllo</label>
            <input className="input" type="date" value={data} max={dataOggi()} onChange={(e) => setData(e.target.value)} />
            <label className="label">Esito</label>
            <label className="flex items-center gap-2 cursor-pointer"><input type="radio" className="!w-4" checked={tipoEsito === 'DA_RIVALUTARE'} onChange={() => setTipoEsito('DA_RIVALUTARE')} data-test="rivalutazione-si" /> La struttura è cambiata: serve una nuova valutazione (proposto)</label>
            <label className="flex items-center gap-2 cursor-pointer"><input type="radio" className="!w-4" checked={tipoEsito === 'INVARIATO'} onChange={() => setTipoEsito('INVARIATO')} data-test="rivalutazione-no" /> Nulla da rivalutare: la valutazione resta valida (spiega perché)</label>
            <label className="label">Note (cosa è cambiato / perché la valutazione resta valida)</label>
            <textarea className="input min-h-[90px]" value={note} onChange={(e) => setNote(e.target.value)} data-test="rivalutazione-note" />
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setAperta(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={registra} disabled={invio} data-test="rivalutazione-salva">{invio ? 'Registrazione…' : 'Registra'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
