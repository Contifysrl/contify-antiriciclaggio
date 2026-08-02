import { FormEvent, useEffect, useState } from 'react';
import { api, formattaData } from '../api';
import { PiedeLegale, Riquadro } from '../componenti';
import { Badge, ErrorBanner, HelpLink, Modal } from '../components/ui';

// ── Controlli automatici (AR-M7) ───────────────────────────────
// Screening notturno su liste sanzioni UE/ONU/OFAC + paesi terzi ad
// alto rischio. La corrispondenza è un fatto da esaminare, mai
// un'accusa: la decisione (esclusa/confermata) è del professionista,
// motivata e tracciata.

interface Esito {
  id: string;
  soggetto_tipo: 'CLIENTE' | 'TITOLARE_EFFETTIVO';
  nominativo: string;
  fonte: string;
  voce_lista: string;
  punteggio: number;
  stato: 'DA_ESAMINARE' | 'ESCLUSO' | 'CONFERMATO';
  nota: string | null;
  deciso_da_nome: string | null;
  deciso_il: string | null;
  creato_il: string;
}

interface DatiScreening {
  esiti: Esito[];
  ultimaCorsa: { eseguito_il: string; soggetti: number; corrispondenze_nuove: number } | null;
  liste: { aggiornatoIl: string; fonti: Record<string, { voci: number }>; voci: number } | null;
  paesiDaRivalutare: Array<{ clienteId: string; denominazione: string; paese: string; fonte: string; vigenteDal: string; ultimaValutazione: string | null }>;
  registroTe: { accreditato: boolean; accreditatoIl: string | null; scadeIl: string | null; giorniResidui: number | null };
}

const ETICHETTA_FONTE: Record<string, string> = {
  UE: 'UE (sanzioni finanziarie)',
  ONU: 'ONU (Consiglio di Sicurezza)',
  OFAC: 'OFAC (Tesoro USA)',
};

function dataOraIt(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') || iso.includes(' ') ? iso.replace(' ', 'T') + (iso.endsWith('Z') ? '' : 'Z') : iso);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

export function Controlli({ vaiA, ruolo }: { vaiA: (p: string) => void; ruolo: string }) {
  const [dati, setDati] = useState<DatiScreening | null>(null);
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState('');
  const [daDecidere, setDaDecidere] = useState<Esito | null>(null);

  const carica = () => api.get<DatiScreening>('/screening').then(setDati).catch((e) => setErrore(e.message));
  useEffect(() => { carica(); }, []);

  const eseguiAdesso = async () => {
    setErrore(''); setEsito(''); setInCorso(true);
    try {
      const r = await api.post<{ soggetti: number; nuoveCorrispondenze: number }>('/screening/esegui');
      setEsito(`Screening completato: ${r.soggetti} anagrafiche controllate, ${r.nuoveCorrispondenze} nuove corrispondenze.`);
      carica();
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setInCorso(false);
    }
  };

  const daEsaminare = dati?.esiti.filter((e) => e.stato === 'DA_ESAMINARE') ?? [];
  const decisi = dati?.esiti.filter((e) => e.stato !== 'DA_ESAMINARE') ?? [];

  return (
    <>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h1>Controlli automatici <HelpLink sezione="controlli" /></h1>
        <button className="btn btn-secondary btn-sm shrink-0 mt-1" onClick={eseguiAdesso} disabled={inCorso}>
          {inCorso ? 'Controllo in corso…' : 'Esegui adesso'}
        </button>
      </div>
      <p className="occhiello">
        Ogni notte tutti i clienti e i titolari effettivi vengono confrontati con le liste sanzioni
        UE, ONU e OFAC, e i paesi delle anagrafiche con l’elenco europeo dei paesi terzi ad alto
        rischio. Le corrispondenze sono segnalazioni da esaminare: la decisione resta tua e viene registrata.
      </p>

      {esito && <div className="riquadro info !my-2">{esito}</div>}
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}

      <div className="scheda">
        <h3 className="!mt-0">Stato del controllo</h3>
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div>
            <div className="text-ink-400 text-xs font-semibold uppercase">Ultimo screening</div>
            <div className="font-semibold text-ink-800">{dati?.ultimaCorsa ? dataOraIt(dati.ultimaCorsa.eseguito_il) : 'mai eseguito'}</div>
            {dati?.ultimaCorsa && <div className="text-xs text-ink-400">{dati.ultimaCorsa.soggetti} anagrafiche controllate</div>}
          </div>
          <div>
            <div className="text-ink-400 text-xs font-semibold uppercase">Liste in uso</div>
            {dati?.liste ? (
              <>
                <div className="font-semibold text-ink-800">{dati.liste.voci.toLocaleString('it-IT')} voci</div>
                <div className="text-xs text-ink-400">aggiornate il {dataOraIt(dati.liste.aggiornatoIl)}</div>
              </>
            ) : (
              <div className="text-ink-400">non ancora scaricate</div>
            )}
          </div>
          <div>
            <div className="text-ink-400 text-xs font-semibold uppercase">Da esaminare</div>
            <div className={`font-semibold ${daEsaminare.length ? 'text-amber-700' : 'text-ink-800'}`}>{daEsaminare.length}</div>
          </div>
        </div>
      </div>

      {dati && (
        <RegistroTe registro={dati.registroTe} ruolo={ruolo} onAggiornato={carica} />
      )}

      {dati && dati.paesiDaRivalutare.length > 0 && (
        <div className="scheda">
          <h3 className="!mt-0">Paesi terzi ad alto rischio: valutazioni da aggiornare</h3>
          <div className="aiuto">
            Questi clienti hanno sede o residenza in paesi entrati nell’elenco europeo dopo la loro
            ultima valutazione firmata (o mai valutati): l’art. 24 co. 5 lett. a) impone la verifica rafforzata.
          </div>
          <table>
            <thead><tr><th>Cliente</th><th>Paese</th><th>In elenco dal</th><th>Ultima valutazione</th><th /></tr></thead>
            <tbody>
              {dati.paesiDaRivalutare.map((p) => (
                <tr key={p.clienteId}>
                  <td className="font-semibold">{p.denominazione}</td>
                  <td>{p.paese}</td>
                  <td>{formattaData(p.vigenteDal)}</td>
                  <td>{p.ultimaValutazione ? formattaData(p.ultimaValutazione) : 'mai'}</td>
                  <td className="text-right">
                    <button className="btn btn-ghost btn-sm" onClick={() => vaiA(`fascicoli?cliente=${p.clienteId}`)}>Apri i fascicoli</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="scheda">
        <h3 className="!mt-0">Corrispondenze con le liste sanzioni</h3>
        {daEsaminare.length === 0 && decisi.length === 0 && (
          <Riquadro tipo="info">
            Nessuna corrispondenza: nell’ultimo controllo nessun cliente o titolare effettivo
            coincide con le liste. Il confronto si ripete ogni notte.
          </Riquadro>
        )}
        {(daEsaminare.length > 0 || decisi.length > 0) && (
          <table>
            <thead><tr><th>Anagrafica</th><th>Voce di lista</th><th>Fonte</th><th>Affinità</th><th>Stato</th><th /></tr></thead>
            <tbody>
              {[...daEsaminare, ...decisi].map((e) => (
                <tr key={e.id}>
                  <td>
                    <div className="font-semibold">{e.nominativo}</div>
                    <div className="text-xs text-ink-400">{e.soggetto_tipo === 'CLIENTE' ? 'cliente' : 'titolare effettivo'}</div>
                  </td>
                  <td>{e.voce_lista}</td>
                  <td className="whitespace-nowrap">{ETICHETTA_FONTE[e.fonte] ?? e.fonte}</td>
                  <td>{Math.round(e.punteggio * 100)}%</td>
                  <td>
                    {e.stato === 'DA_ESAMINARE' && <Badge tone="amber">da esaminare</Badge>}
                    {e.stato === 'ESCLUSO' && <Badge tone="gray">esclusa</Badge>}
                    {e.stato === 'CONFERMATO' && <Badge tone="red">confermata</Badge>}
                    {e.stato !== 'DA_ESAMINARE' && e.deciso_da_nome && (
                      <div className="text-xs text-ink-400 mt-0.5">{e.deciso_da_nome}, {dataOraIt(e.deciso_il)}</div>
                    )}
                  </td>
                  <td className="text-right">
                    <button className="btn btn-ghost btn-sm" onClick={() => setDaDecidere(e)}>
                      {e.stato === 'DA_ESAMINARE' ? 'Esamina' : 'Rivedi'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {daDecidere && (
        <DecisioneModal esito={daDecidere} onChiudi={() => setDaDecidere(null)} onDeciso={() => { setDaDecidere(null); carica(); }} />
      )}
      <PiedeLegale />
    </>
  );
}

// ── Registro dei titolari effettivi (D.M. 122/2026, AR-M8) ─────

function RegistroTe({ registro, ruolo, onAggiornato }: {
  registro: DatiScreening['registroTe'];
  ruolo: string;
  onAggiornato: () => void;
}) {
  const [apri, setApri] = useState(false);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const salva = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      await api.post('/studio/registro-accreditamento', { data });
      setApri(false);
      onAggiornato();
    } catch (err) {
      setErrore((err as Error).message);
    } finally {
      setInvio(false);
    }
  };

  const inScadenza = registro.accreditato && registro.giorniResidui !== null && registro.giorniResidui <= 60;

  return (
    <div className="scheda">
      <h3 className="!mt-0">Registro dei titolari effettivi (D.M. 122/2026)</h3>
      <div className="aiuto">
        Dal 23 luglio 2026 i soggetti obbligati consultano il registro previa richiesta di
        accreditamento alla Camera di Commercio, valida due anni. Registra qui la data
        dell’accreditamento: al rinnovo ci pensa il promemoria.
      </div>
      {!registro.accreditato && (
        <Riquadro tipo="avviso">
          Accreditamento non ancora registrato. Senza accreditamento il riscontro della titolarità
          effettiva col registro (art. 21-ter) non è possibile.
        </Riquadro>
      )}
      {registro.accreditato && (
        <p className="text-sm">
          Accreditamento del <strong>{formattaData(registro.accreditatoIl)}</strong> — valido fino al{' '}
          <strong>{formattaData(registro.scadeIl)}</strong>{' '}
          {registro.giorniResidui !== null && (
            registro.giorniResidui < 0
              ? <Badge tone="red">scaduto da {-registro.giorniResidui} giorni</Badge>
              : inScadenza
                ? <Badge tone="amber">scade tra {registro.giorniResidui} giorni</Badge>
                : <Badge tone="teal">{registro.giorniResidui} giorni residui</Badge>
          )}
        </p>
      )}
      {ruolo === 'TITOLARE' && !apri && (
        <button className="btn btn-secondary btn-sm" onClick={() => setApri(true)}>
          {registro.accreditato ? 'Registra un rinnovo…' : 'Registra l’accreditamento…'}
        </button>
      )}
      {apri && (
        <form onSubmit={salva} className="flex items-end gap-2 mt-2">
          <div>
            <label className="label">Data dell’accreditamento (o del rinnovo)</label>
            <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} required />
          </div>
          <button className="btn btn-primary btn-sm mb-0.5" disabled={invio}>{invio ? 'Salvo…' : 'Salva'}</button>
          <button type="button" className="btn btn-ghost btn-sm mb-0.5" onClick={() => setApri(false)}>Annulla</button>
        </form>
      )}
      {errore && <div className="errore">{errore}</div>}
    </div>
  );
}

function DecisioneModal({ esito, onChiudi, onDeciso }: { esito: Esito; onChiudi: () => void; onDeciso: () => void }) {
  const [stato, setStato] = useState<'ESCLUSO' | 'CONFERMATO'>('ESCLUSO');
  const [nota, setNota] = useState(esito.nota ?? '');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      await api.post(`/screening/${esito.id}`, { stato, nota });
      onDeciso();
    } catch (err) {
      setErrore((err as Error).message);
      setInvio(false);
    }
  };

  return (
    <Modal title="Esamina la corrispondenza" onClose={onChiudi}>
      <form onSubmit={submit} className="space-y-3 text-sm">
        <div className="rounded-lg bg-ink-50 border border-ink-100 px-4 py-3">
          <div><span className="text-ink-400">Anagrafica dello studio:</span> <strong>{esito.nominativo}</strong></div>
          <div><span className="text-ink-400">Voce di lista ({ETICHETTA_FONTE[esito.fonte] ?? esito.fonte}):</span> <strong>{esito.voce_lista}</strong></div>
          <div><span className="text-ink-400">Affinità del nome:</span> {Math.round(esito.punteggio * 100)}%</div>
        </div>
        <p>
          Verifica con i dati che hai in fascicolo (data e luogo di nascita, codice fiscale,
          documento): l’omonimia è l’esito di gran lunga più frequente.
        </p>
        <div className="flex gap-2">
          <label className={`flex-1 border rounded-lg px-3 py-2 cursor-pointer ${stato === 'ESCLUSO' ? 'border-teal-400 bg-teal-50' : 'border-ink-200'}`}>
            <input type="radio" className="!w-auto mr-2" checked={stato === 'ESCLUSO'} onChange={() => setStato('ESCLUSO')} />
            <strong>Escludi</strong> — persona/entità diversa
          </label>
          <label className={`flex-1 border rounded-lg px-3 py-2 cursor-pointer ${stato === 'CONFERMATO' ? 'border-red-400 bg-red-50' : 'border-ink-200'}`}>
            <input type="radio" className="!w-auto mr-2" checked={stato === 'CONFERMATO'} onChange={() => setStato('CONFERMATO')} />
            <strong>Conferma</strong> — è la stessa
          </label>
        </div>
        {stato === 'CONFERMATO' && (
          <Riquadro tipo="critico">
            Una corrispondenza confermata impone l’astensione e il congelamento dei rapporti, e va
            valutata la segnalazione: prosegui dal fascicolo del cliente e dalla sezione Segnalazioni.
          </Riquadro>
        )}
        <div>
          <label className="label">Motivazione (obbligatoria: è ciò che esibisci in caso di controllo)</label>
          <textarea className="input min-h-[80px]" value={nota} onChange={(e) => setNota(e.target.value)} required
            placeholder={stato === 'ESCLUSO' ? 'Es. Data di nascita diversa (12.3.1961 vs 1975); codice fiscale verificato.' : 'Elementi che confermano la coincidenza…'} />
        </div>
        {errore && <div className="errore">{errore}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-secondary" onClick={onChiudi}>Annulla</button>
          <button className="btn btn-primary" disabled={invio}>{invio ? 'Salvataggio…' : 'Registra la decisione'}</button>
        </div>
      </form>
    </Modal>
  );
}
