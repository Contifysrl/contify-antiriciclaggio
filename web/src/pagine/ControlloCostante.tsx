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
