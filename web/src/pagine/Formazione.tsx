import { useEffect, useState } from 'react';
import { api, dataOggi, formattaData } from '../api';
import { Riquadro } from '../componenti';
import { ErrorBanner } from '../components/ui';

// ── AR-M19: registro della formazione (art. 16 co. 3) ───────────
// La tabella esisteva dal primo giorno ma nessuna rotta la scriveva: il
// fattore «formazione» del Modello AV.0 restava per forza a 4. Qui si
// registra chi ha partecipato a cosa, e l'indicatore si aggiorna da solo.

export function RegistroFormazione({ amministratore, onCambiato }: { amministratore: boolean; onCambiato?: () => void }) {
  const [eventi, setEventi] = useState<any[]>([]);
  const [persone, setPersone] = useState<Array<{ id: string; nome: string }>>([]);
  const [aperto, setAperto] = useState(false);
  const [f, setF] = useState<any>({ titolo: '', ente: '', dataEvento: dataOggi(), ore: 2, utentiIds: [] as string[], esterni: '' });
  const [errore, setErrore] = useState('');
  const [esito, setEsito] = useState('');

  const carica = () => api.get<any[]>('/studio/formazione').then(setEventi).catch(() => setEventi([]));
  useEffect(() => { carica(); api.get<any[]>('/studio/persone').then(setPersone).catch(() => setPersone([])); }, []);

  const salva = async () => {
    setErrore('');
    try {
      const r = await api.post<any>('/studio/formazione', {
        titolo: f.titolo, ente: f.ente, dataEvento: f.dataEvento, ore: Number(f.ore), utentiIds: f.utentiIds,
        partecipanti: String(f.esterni).split(/[;\n]/).map((x: string) => x.trim()).filter(Boolean),
      });
      setEsito(`Registrato per ${r.partecipanti} partecipant${r.partecipanti === 1 ? 'e' : 'i'}: il fattore «formazione» dell’autovalutazione si aggiorna da solo.`);
      setAperto(false); setF({ ...f, titolo: '', ente: '', esterni: '', utentiIds: [] });
      carica(); onCambiato?.();
    } catch (e) { setErrore((e as Error).message); }
  };

  const elimina = async (id: string) => {
    setErrore('');
    try { await api.elimina(`/studio/formazione/${id}`); carica(); onCambiato?.(); } catch (e) { setErrore((e as Error).message); }
  };

  return (
    <div className="scheda" data-test="formazione">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="!m-0">Formazione del personale (art. 16 co. 3)</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setAperto(!aperto)} data-test="formazione-nuovo">{aperto ? 'Chiudi' : 'Registra un evento formativo'}</button>
      </div>
      <p className="aiuto">Corsi, webinar e aggiornamenti seguiti dal personale dello studio. Alimentano il fattore «formazione» del Modello AV.0 e sono la prova, in ispezione, dell’obbligo formativo.</p>
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      {esito && <Riquadro tipo="info">{esito}</Riquadro>}
      {aperto && (
        <div className="rounded-lg border border-ink-200 p-4 space-y-3 text-sm mb-3">
          <div className="griglia c2">
            <div><label className="label">Titolo dell’evento</label><input className="input" value={f.titolo} onChange={(e) => setF({ ...f, titolo: e.target.value })} data-test="formazione-titolo" /></div>
            <div><label className="label">Ente organizzatore</label><input className="input" value={f.ente} onChange={(e) => setF({ ...f, ente: e.target.value })} placeholder="ODCEC, CNDCEC, altro" /></div>
            <div><label className="label">Data</label><input className="input" type="date" value={f.dataEvento} max={dataOggi()} onChange={(e) => setF({ ...f, dataEvento: e.target.value })} /></div>
            <div><label className="label">Ore</label><input className="input" type="number" min={0} step={0.5} value={f.ore} onChange={(e) => setF({ ...f, ore: e.target.value })} /></div>
          </div>
          <label className="label">Partecipanti dello studio</label>
          <div className="flex flex-wrap gap-3">
            {persone.map((p) => (
              <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="!w-4" checked={f.utentiIds.includes(p.id)} onChange={(e) => setF({ ...f, utentiIds: e.target.checked ? [...f.utentiIds, p.id] : f.utentiIds.filter((x: string) => x !== p.id) })} />
                {p.nome}
              </label>
            ))}
          </div>
          <label className="label">Altri partecipanti (uno per riga o separati da «;»)</label>
          <textarea className="input min-h-[50px]" value={f.esterni} onChange={(e) => setF({ ...f, esterni: e.target.value })} placeholder="Praticanti, collaboratori esterni…" />
          <div className="flex justify-end"><button className="btn btn-primary" onClick={salva} data-test="formazione-salva">Registra</button></div>
        </div>
      )}
      {eventi.length === 0 ? (
        <p className="caricamento">Nessun evento registrato.</p>
      ) : (
        <div className="overflow-x-auto">
          <table data-test="formazione-elenco">
            <thead><tr><th>Data</th><th>Evento</th><th>Ente</th><th>Partecipante</th><th>Ore</th>{amministratore && <th />}</tr></thead>
            <tbody>
              {eventi.map((e) => (
                <tr key={e.id}>
                  <td className="mono">{formattaData(e.data_evento)}</td>
                  <td className="font-semibold">{e.titolo}</td>
                  <td>{e.ente ?? '—'}</td>
                  <td>{e.utente ?? e.partecipante}</td>
                  <td className="mono">{e.ore}</td>
                  {amministratore && <td><button className="btn btn-ghost btn-sm" onClick={() => elimina(e.id)} title="Elimina">✕</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
