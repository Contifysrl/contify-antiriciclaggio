import { useEffect, useState } from 'react';
import { api, dataOggi, formattaData } from '../api';
import { Riquadro } from '../componenti';
import { Badge, ErrorBanner, Modal } from '../components/ui';

// ── AR-M20-03: registro dei titolari effettivi (art. 21-ter) ──
// D.Lgs. 10.6.2026 n. 122, in vigore dal 23.7.2026. Il portale delle Camere
// di commercio non ha API: il professionista accreditato consulta e QUI
// registra la consultazione (esito, difformità, estratto conservato ex co.
// 12) e, se serve, la segnalazione alla Camera di commercio (co. 7). Ogni
// consultazione è una riga dello storico: in ispezione conta la storia.

const ESITI: Array<{ codice: string; etichetta: string; aiuto: string }> = [
  { codice: 'CORRISPONDE', etichetta: 'Corrisponde: i titolari nel registro coincidono con quelli accertati', aiuto: 'Conserva l’estratto (co. 12).' },
  { codice: 'DIFFORME', etichetta: 'Difforme: il registro riporta titolari diversi', aiuto: 'Va segnalato alla Camera di commercio (co. 7).' },
  { codice: 'NON_ISCRITTO', etichetta: 'Non iscritto: il cliente non ha comunicato il titolare effettivo', aiuto: 'È un’incongruenza: va segnalata (co. 7).' },
  { codice: 'NON_CONSULTABILE', etichetta: 'Non consultabile (esclusione ex art. 21-sexies, portale non operativo, accreditamento mancante)', aiuto: 'Indica il motivo: resta l’adeguata verifica ordinaria (co. 11).' },
];

const TONO: Record<string, 'teal' | 'red' | 'amber' | 'gray'> = { CORRISPONDE: 'teal', DIFFORME: 'red', NON_ISCRITTO: 'red', NON_CONSULTABILE: 'gray' };
const ETI: Record<string, string> = { CORRISPONDE: 'corrisponde', DIFFORME: 'difforme', NON_ISCRITTO: 'non iscritto', NON_CONSULTABILE: 'non consultabile' };

export interface ConsultazioneDto {
  id: string;
  fascicoloId: string | null;
  dataConsultazione: string;
  esito: string;
  titolariConfrontati: number;
  difformita: string | null;
  documentoId: string | null;
  documentoNome: string | null;
  segnalazione: { data: string; riferimento: string | null; note: string | null; da: string | null } | null;
  eseguitoDa: string | null;
  daSegnalare: boolean;
}

export function RegistroTeBox({ clienteId, fascicoloId, documenti, titolari, onCambiato, compatto }: {
  clienteId: string;
  fascicoloId?: string | null;
  /** Documenti del cliente (per scegliere l'estratto come prova). */
  documenti?: Array<{ id: string; tipo: string; nome_file: string; data_riferimento?: string }>;
  /** Titolari effettivi vigenti: senza, la consultazione non ha termine di confronto. */
  titolari: number;
  onCambiato?: () => void;
  compatto?: boolean;
}) {
  const [dati, setDati] = useState<{ consultazioni: ConsultazioneDto[]; accreditamento: any; tipoDocumentoProva: string } | null>(null);
  const [modal, setModal] = useState<'consultazione' | null>(null);
  const [segnala, setSegnala] = useState<ConsultazioneDto | null>(null);
  const [prova, setProva] = useState<ConsultazioneDto | null>(null);
  const [errore, setErrore] = useState('');
  const [esitoMsg, setEsitoMsg] = useState('');
  const [invio, setInvio] = useState(false);
  // form consultazione
  const [data, setData] = useState(dataOggi());
  const [esito, setEsito] = useState('CORRISPONDE');
  const [difformita, setDifformita] = useState('');
  const [documentoId, setDocumentoId] = useState('');
  // form segnalazione
  const [sData, setSData] = useState(dataOggi());
  const [sRif, setSRif] = useState('');
  const [sNote, setSNote] = useState('');

  const [docCliente, setDocCliente] = useState<any[]>([]);
  const carica = () => Promise.all([
    api.get<any>(`/clienti/${clienteId}/registro-te`).then(setDati).catch(() => setDati(null)),
    documenti ? Promise.resolve() : api.get<any[]>(`/clienti/${clienteId}/documenti`).then((d) => setDocCliente(Array.isArray(d) ? d : [])).catch(() => setDocCliente([])),
  ]);
  useEffect(() => { carica(); /* eslint-disable-next-line */ }, [clienteId]);

  const estratti = (documenti ?? docCliente).filter((d) => d.tipo === (dati?.tipoDocumentoProva ?? 'ESTRATTO_REGISTRO_TE'));
  const pendenti = dati?.consultazioni.filter((k) => k.daSegnalare) ?? [];
  const ultima = dati?.consultazioni[0] ?? null;

  const registra = async () => {
    setErrore(''); setInvio(true);
    try {
      await api.post(`/clienti/${clienteId}/registro-te`, { data, esito, difformita, documentoId: documentoId || null, fascicoloId: fascicoloId ?? null });
      setModal(null); setDifformita(''); setDocumentoId('');
      setEsitoMsg(esito === 'DIFFORME' || esito === 'NON_ISCRITTO'
        ? 'Consultazione registrata. L’incongruenza va segnalata alla Camera di commercio: quando l’hai fatto, registra qui data e riferimento.'
        : 'Consultazione registrata.');
      await carica(); onCambiato?.();
    } catch (e) { setErrore((e as Error).message); } finally { setInvio(false); }
  };
  const registraSegnalazione = async () => {
    if (!segnala) return;
    setErrore(''); setInvio(true);
    try {
      await api.post(`/registro-te/${segnala.id}/segnalazione`, { data: sData, riferimento: sRif, note: sNote });
      setSegnala(null); setSRif(''); setSNote('');
      setEsitoMsg('Segnalazione registrata: l’incongruenza è documentata come comunicata alla Camera di commercio.');
      await carica(); onCambiato?.();
    } catch (e) { setErrore((e as Error).message); } finally { setInvio(false); }
  };
  const agganciaProva = async () => {
    if (!prova || !documentoId) return;
    setErrore(''); setInvio(true);
    try {
      await api.post(`/registro-te/${prova.id}/prova`, { documentoId });
      setProva(null); setDocumentoId('');
      setEsitoMsg('Estratto agganciato alla consultazione (art. 21-ter co. 12).');
      await carica(); onCambiato?.();
    } catch (e) { setErrore((e as Error).message); } finally { setInvio(false); }
  };

  return (
    <div className={compatto ? '' : 'scheda'} id="registro-te" data-test="registro-te">
      {!compatto && <h3>Registro dei titolari effettivi</h3>}
      <p className="aiuto">
        Art. 21-ter DLgs. 231/2007 (D.Lgs. 122/2026): il soggetto obbligato accreditato consulta il registro per l’adeguata verifica, conserva la prova dell’iscrizione o un estratto e segnala tempestivamente alla Camera di commercio le incongruenze. La consultazione non sostituisce l’adeguata verifica: la confronta.
        {dati && !dati.accreditamento?.accreditato && <> <strong>Lo studio non ha registrato l’accreditamento</strong> (Controlli → Registro dei titolari effettivi).</>}
      </p>
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      {esitoMsg && <Riquadro tipo="info">{esitoMsg}</Riquadro>}
      {pendenti.length > 0 && (
        <Riquadro tipo="critico">
          <strong>{pendenti.length === 1 ? 'Un’incongruenza da segnalare' : `${pendenti.length} incongruenze da segnalare`}</strong> alla Camera di commercio (art. 21-ter co. 7).
          {pendenti.map((k) => (
            <div key={k.id} className="mt-1 flex items-center justify-between gap-2">
              <span className="text-sm">Consultazione del {formattaData(k.dataConsultazione)} — {ETI[k.esito]}: {k.difformita}</span>
              <button className="btn btn-primary btn-sm shrink-0" data-test="segnala-difformita" onClick={() => { setSegnala(k); setSData(dataOggi()); }}>Registra la segnalazione…</button>
            </div>
          ))}
        </Riquadro>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <button className="btn btn-secondary btn-sm" data-test="nuova-consultazione" disabled={titolari === 0} title={titolari === 0 ? 'Registra prima i titolari effettivi: la consultazione li confronta' : undefined}
          onClick={() => { setData(dataOggi()); setEsito('CORRISPONDE'); setDifformita(''); setDocumentoId(''); setModal('consultazione'); }}>
          {ultima ? 'Nuova consultazione del registro…' : 'Registra la consultazione del registro…'}
        </button>
        {ultima && <span className="text-xs text-ink-500">Ultima: {formattaData(ultima.dataConsultazione)} · <Badge tone={TONO[ultima.esito]}>{ETI[ultima.esito]}</Badge>{ultima.esito === 'CORRISPONDE' && !ultima.documentoId ? ' · estratto non conservato' : ''}</span>}
      </div>
      {dati && dati.consultazioni.length > 0 && (
        <table className="mt-3" data-test="storico-consultazioni">
          <thead><tr><th>Data</th><th>Esito</th><th>Titolari</th><th>Note / difformità</th><th>Estratto</th><th>Segnalazione</th><th>Chi</th></tr></thead>
          <tbody>
            {dati.consultazioni.map((k) => (
              <tr key={k.id}>
                <td className="mono">{formattaData(k.dataConsultazione)}</td>
                <td><Badge tone={TONO[k.esito]}>{ETI[k.esito]}</Badge></td>
                <td className="mono">{k.titolariConfrontati}</td>
                <td className="text-xs">{k.difformita ?? '—'}</td>
                <td className="text-xs">
                  {k.documentoId ? <a href={`/api/documenti/${k.documentoId}`} target="_blank" rel="noreferrer">{k.documentoNome ?? 'estratto'}</a>
                    : k.esito === 'CORRISPONDE' ? <button className="btn btn-ghost btn-sm" onClick={() => { setProva(k); setDocumentoId(estratti[0]?.id ?? ''); }}>Aggancia l’estratto…</button> : '—'}
                </td>
                <td className="text-xs">
                  {k.segnalazione ? <>{formattaData(k.segnalazione.data)}{k.segnalazione.riferimento ? ` · ${k.segnalazione.riferimento}` : ''}</>
                    : k.daSegnalare ? <Badge tone="red">da fare</Badge> : '—'}
                </td>
                <td className="text-xs">{k.eseguitoDa ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modal === 'consultazione' && (
        <Modal title="Consultazione del registro dei titolari effettivi" onClose={() => setModal(null)}>
          <div className="space-y-3 text-sm">
            <p className="aiuto">Consulta il registro dal portale delle Camere di commercio con l’accesso accreditato dello studio, poi registra qui cosa hai trovato rispetto ai {titolari} titolar{titolari === 1 ? 'e' : 'i'} effettiv{titolari === 1 ? 'o' : 'i'} accertat{titolari === 1 ? 'o' : 'i'}.</p>
            <label className="label">Data della consultazione</label>
            <input className="input" type="date" value={data} max={dataOggi()} onChange={(e) => setData(e.target.value)} data-test="consultazione-data" />
            <label className="label">Esito</label>
            <div className="space-y-1">
              {ESITI.map((x) => (
                <label key={x.codice} className="flex items-start gap-2 cursor-pointer">
                  <input type="radio" className="!w-4 mt-1" checked={esito === x.codice} onChange={() => setEsito(x.codice)} data-test={`esito-${x.codice}`} />
                  <span>{x.etichetta} <span className="text-ink-400">— {x.aiuto}</span></span>
                </label>
              ))}
            </div>
            <label className="label">{esito === 'CORRISPONDE' ? 'Note (facoltative)' : esito === 'NON_CONSULTABILE' ? 'Motivo (obbligatorio)' : 'Descrizione dell’incongruenza (obbligatoria: è il contenuto della segnalazione)'}</label>
            <textarea className="input min-h-[70px]" value={difformita} onChange={(e) => setDifformita(e.target.value)} data-test="consultazione-note" />
            <label className="label">Estratto / prova dell’iscrizione (co. 12)</label>
            <select className="input" value={documentoId} onChange={(e) => setDocumentoId(e.target.value)} data-test="consultazione-prova">
              <option value="">— nessuno per ora (caricalo fra i documenti del cliente come «Estratto del registro TE») —</option>
              {estratti.map((d) => <option key={d.id} value={d.id}>{d.nome_file}{d.data_riferimento ? ` (${formattaData(d.data_riferimento)})` : ''}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={registra} disabled={invio} data-test="consultazione-salva">{invio ? 'Registrazione…' : 'Registra la consultazione'}</button>
            </div>
          </div>
        </Modal>
      )}
      {segnala && (
        <Modal title="Segnalazione alla Camera di commercio (art. 21-ter co. 7)" onClose={() => setSegnala(null)}>
          <div className="space-y-3 text-sm">
            <Riquadro tipo="avviso">
              La segnalazione si presenta con dichiarazione sostitutiva alla Camera di commercio territorialmente competente (co. 8); il segnalante resta anonimo verso il titolare. Qui registri che l’hai fatta: data, riferimento (protocollo o ricevuta) e note.
            </Riquadro>
            <div className="text-xs text-ink-500">Consultazione del {formattaData(segnala.dataConsultazione)} — {ETI[segnala.esito]}: {segnala.difformita}</div>
            <label className="label">Data della segnalazione</label>
            <input className="input" type="date" value={sData} max={dataOggi()} onChange={(e) => setSData(e.target.value)} data-test="segnalazione-data" />
            <label className="label">Riferimento (protocollo, ricevuta)</label>
            <input className="input" value={sRif} onChange={(e) => setSRif(e.target.value)} data-test="segnalazione-riferimento" />
            <label className="label">Note (facoltative)</label>
            <textarea className="input min-h-[60px]" value={sNote} onChange={(e) => setSNote(e.target.value)} />
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setSegnala(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={registraSegnalazione} disabled={invio} data-test="segnalazione-salva">{invio ? 'Registrazione…' : 'Registra la segnalazione'}</button>
            </div>
          </div>
        </Modal>
      )}
      {prova && (
        <Modal title="Estratto del registro (art. 21-ter co. 12)" onClose={() => setProva(null)}>
          <div className="space-y-3 text-sm">
            <p className="aiuto">Scegli l’estratto già caricato fra i documenti del cliente (tipo «Estratto del registro TE»).</p>
            <select className="input" value={documentoId} onChange={(e) => setDocumentoId(e.target.value)}>
              <option value="">— scegli —</option>
              {estratti.map((d) => <option key={d.id} value={d.id}>{d.nome_file}</option>)}
            </select>
            {!estratti.length && <div className="text-xs text-ink-500">Nessun estratto fra i documenti: caricalo dalla scheda del cliente («Allega un documento» → Estratto del registro TE).</div>}
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setProva(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={agganciaProva} disabled={invio || !documentoId}>Aggancia</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
