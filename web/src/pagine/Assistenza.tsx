import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, EmptyState, ErrorBanner, HelpLink, Modal, Spinner } from '../components/ui';
import { Icona } from '../components/icone';
import { PiedeLegale } from '../componenti';
import type { SessioneApp } from './Accessi';

// ── Assistenza con ticket (AR-M11) ─────────────────────────────
// Come in Assist: ogni richiesta è una conversazione che vive nell'app.
// La risposta di Contify arriva qui (l'email è solo un avviso); aprire
// la conversazione la marca come letta e aggiorna il pallino del menu
// (evento 'ticket-letti'). Il titolare vede tutte le richieste dello
// studio, gli altri le proprie.

interface TicketRiga {
  id: string;
  numero: string;
  oggetto: string;
  stato: 'aperto' | 'risposto' | 'chiuso';
  createdAt: string;
  updatedAt: string;
  autoreId: string;
  autoreNome: string;
  nMessaggi: number;
  nonLetto: boolean;
}

interface Messaggio {
  id: string;
  testo: string;
  daAssistenza: boolean;
  createdAt: string;
  autoreNome: string | null;
}

const STATO_TICKET: Record<TicketRiga['stato'], { testo: string; tone: 'teal' | 'gray' | 'amber' }> = {
  aperto: { testo: 'In lavorazione', tone: 'amber' },
  risposto: { testo: 'Risposta ricevuta', tone: 'teal' },
  chiuso: { testo: 'Chiusa', tone: 'gray' },
};

/** Le date di D1 (datetime('now')) sono UTC senza suffisso: normalizza e mostra in ora locale. */
export function dataOraTicket(iso: string): string {
  let s = iso.includes('T') ? iso : iso.replace(' ', 'T');
  if (!/Z$|[+-]\d\d:?\d\d$/.test(s)) s += 'Z';
  const d = new Date(s);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
const dataOraIt = dataOraTicket;

// ── Domande frequenti (come in Assist) ─────────────────────────
// Le risposte rapide prima del ticket: la maggior parte delle richieste
// trova risposta qui o nella Guida. Ogni risposta collega la sezione
// giusta della Guida.

function LinkGuida({ sezione, children }: { sezione: string; children: React.ReactNode }) {
  return (
    <a href={`#guida?sezione=${sezione}`} className="text-teal-700 font-semibold hover:underline">
      {children}
    </a>
  );
}

const FAQ: Array<{ domanda: string; risposta: React.ReactNode }> = [
  {
    domanda: 'Da dove comincio? In che ordine inserisco i dati?',
    risposta: (
      <>
        L'ordine giusto è: <strong>autovalutazione dello studio → clienti (con i titolari
        effettivi) → fascicoli con la valutazione del rischio</strong>; da lì in poi lavora lo
        scadenzario. Nel <strong>Cruscotto</strong> trovi il percorso «Per iniziare», che si
        spunta da solo man mano che procedi; i dettagli sono nell'{' '}
        <LinkGuida sezione="introduzione">Introduzione della Guida</LinkGuida>.
      </>
    ),
  },
  {
    domanda: 'Come porto dentro i clienti dal gestionale?',
    risposta: (
      <>
        Nella pagina Clienti ci sono due acceleratori: <strong>«Importa da CSV»</strong> per
        caricare l'elenco completo esportato dal gestionale, e <strong>«Compila dai
        registri»</strong> che propone denominazione e natura giuridica a partire dalla partita
        IVA (archivio IVA europeo). I dettagli sono nella{' '}
        <LinkGuida sezione="clienti">sezione Clienti della Guida</LinkGuida>.
      </>
    ),
  },
  {
    domanda: 'Quando devo rifare l’adeguata verifica di un cliente?',
    risposta: (
      <>
        Lo dice lo <strong>Scadenzario</strong>, in base alla classe di rischio dell'ultima
        valutazione firmata: 36 mesi per il rischio non significativo e poco significativo,
        24 per l'abbastanza significativo, 12 per il molto significativo. I fascicoli scaduti
        o in scadenza compaiono in cima; vedi la{' '}
        <LinkGuida sezione="scadenzario">sezione Scadenzario della Guida</LinkGuida>.
      </>
    ),
  },
  {
    domanda: 'Ho dimenticato la password, come rientro?',
    risposta: (
      <>
        Dalla pagina di accesso scegli <strong>«Password dimenticata?»</strong>: arriva
        un'email con un link valido 60 minuti per impostarne una nuova. Se non arriva,
        controlla la posta indesiderata o chiedi al titolare dello studio un reset da
        Impostazioni; vedi la{' '}
        <LinkGuida sezione="impostazioni">sezione Impostazioni e utenti della Guida</LinkGuida>.
      </>
    ),
  },
  {
    domanda: 'Che differenza c’è tra titolare, collaboratore, lettore e revisore?',
    risposta: (
      <>
        Il <strong>titolare</strong> firma valutazioni e autovalutazioni, accede alle
        segnalazioni (art. 38) e gestisce utenti e backup; il <strong>collaboratore</strong>{' '}
        inserisce e istruisce clienti e fascicoli ma non firma e non vede le segnalazioni; il{' '}
        <strong>lettore</strong> consulta soltanto; il <strong>revisore</strong> svolge la
        funzione di revisione indipendente (art. 16 co. 2). I dettagli sono nell'{' '}
        <LinkGuida sezione="introduzione">Introduzione della Guida</LinkGuida>.
      </>
    ),
  },
  {
    domanda: 'I miei dati sono al sicuro? Come funzionano i backup?',
    risposta: (
      <>
        I dati stanno su server nell'<strong>Unione Europea</strong> e le informazioni più
        sensibili (dati identificativi di dettaglio, segnalazioni) sono <strong>cifrate</strong>.
        Ogni notte l'archivio viene fotografato da solo: restano 30 backup giornalieri e 12
        mensili, e il titolare può scaricarli o ripristinarli dalla pagina{' '}
        <strong>Backup</strong>; vedi la{' '}
        <LinkGuida sezione="backup">sezione Backup e ripristino della Guida</LinkGuida>.
      </>
    ),
  },
];

function DomandaFrequente({ domanda, risposta }: { domanda: string; risposta: React.ReactNode }) {
  const [aperta, setAperta] = useState(false);
  return (
    <div className="border border-ink-100 rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-ink-800 hover:bg-ink-50"
        onClick={() => setAperta((a) => !a)}
      >
        <span>{domanda}</span>
        <span className={`text-ink-400 transition-transform ${aperta ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {aperta && <div className="px-4 pb-4 text-sm text-ink-600 leading-relaxed">{risposta}</div>}
    </div>
  );
}

function PrimaDiAprire() {
  return (
    <div className="scheda">
      <h3 className="!mt-0 flex items-center gap-2">
        <Icona nome="aiuto" size={18} />
        <span>Prima di aprire una richiesta</span>
      </h3>
      <p className="text-sm text-ink-600 mb-4">
        La <strong>Guida</strong> risponde già alla maggior parte delle domande: come impostare
        autovalutazione e fascicoli, importare i clienti, leggere lo scadenzario, gestire backup,
        utenti e password. Ogni pagina ha anche il pulsante <strong>?</strong> accanto al titolo,
        che apre direttamente la sezione giusta.
      </p>
      <div className="space-y-2 mb-4">
        {FAQ.map((f) => <DomandaFrequente key={f.domanda} {...f} />)}
      </div>
      <a href="#guida" className="btn btn-secondary inline-flex items-center gap-2 no-underline">
        <Icona nome="aiuto" size={16} />
        <span>Apri la Guida</span>
      </a>
    </div>
  );
}

export function Assistenza({ sessione, apri }: { sessione: SessioneApp; apri: string | null }) {
  const [ticket, setTicket] = useState<TicketRiga[] | null>(null);
  const [errore, setErrore] = useState('');
  const [nuovoAperto, setNuovoAperto] = useState(false);
  const [apertoId, setApertoId] = useState<string | null>(apri);

  const carica = () => {
    api.get<{ ticket: TicketRiga[] }>('/assistenza')
      .then((r) => setTicket(r.ticket))
      .catch((e) => { setErrore((e as Error).message); setTicket([]); });
  };
  useEffect(() => { carica(); }, []);
  useEffect(() => { if (apri) setApertoId(apri); }, [apri]);

  return (
    <>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h1>Assistenza <HelpLink sezione="assistenza" /></h1>
        <button className="btn btn-primary btn-sm shrink-0 mt-1" onClick={() => setNuovoAperto(true)}>
          <Icona nome="piu" size={15} /> Nuova richiesta
        </button>
      </div>
      <p className="occhiello">
        Le risposte rapide alle domande più comuni e, se non bastano, le tue richieste di
        assistenza: ogni richiesta resta qui con tutta la conversazione.
      </p>

      <PrimaDiAprire />

      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}

      {ticket === null ? (
        <Spinner />
      ) : ticket.length === 0 ? (
        <div className="scheda">
          <EmptyState
            title="Nessuna richiesta di assistenza"
            hint="Quando apri una richiesta, la conversazione con Contify resta qui: niente email da ritrovare."
            action={<button className="btn btn-primary" onClick={() => setNuovoAperto(true)}>Apri la prima richiesta</button>}
          />
        </div>
      ) : (
        <div className="scheda">
          <table>
            <thead>
              <tr><th>Numero</th><th>Oggetto</th><th>Stato</th><th>Aggiornata</th><th>Messaggi</th></tr>
            </thead>
            <tbody>
              {ticket.map((t) => (
                <tr key={t.id} className="cursor-pointer hover:bg-ink-50" onClick={() => setApertoId(t.id)}>
                  <td className="mono whitespace-nowrap">{t.numero}</td>
                  <td className="font-semibold">
                    {t.oggetto}
                    {t.nonLetto && <span className="ml-2 inline-block w-2 h-2 rounded-full bg-teal-600 align-middle" aria-label="Messaggi da leggere" />}
                    {sessione.utente.ruolo === 'TITOLARE' && t.autoreId !== sessione.utente.id && (
                      <span className="block text-xs font-normal text-ink-400">di {t.autoreNome}</span>
                    )}
                  </td>
                  <td><Badge tone={STATO_TICKET[t.stato].tone}>{STATO_TICKET[t.stato].testo}</Badge></td>
                  <td className="whitespace-nowrap">{dataOraIt(t.updatedAt)}</td>
                  <td>{t.nMessaggi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nuovoAperto && (
        <NuovaRichiesta
          onChiudi={() => setNuovoAperto(false)}
          onCreata={(id) => { setNuovoAperto(false); carica(); setApertoId(id); }}
        />
      )}
      {apertoId && (
        <ConversazioneTicket
          id={apertoId}
          ioId={sessione.utente.id}
          onChiudi={() => { setApertoId(null); carica(); window.dispatchEvent(new Event('ticket-letti')); }}
        />
      )}
      <PiedeLegale />
    </>
  );
}

function NuovaRichiesta({ onChiudi, onCreata }: { onChiudi: () => void; onCreata: (id: string) => void }) {
  const [oggetto, setOggetto] = useState('');
  const [testo, setTesto] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      const r = await api.post<{ id: string; numero: string }>('/assistenza', { oggetto, testo });
      onCreata(r.id);
    } catch (err) {
      setErrore((err as Error).message);
      setInvio(false);
    }
  };

  return (
    <Modal title="Nuova richiesta di assistenza" onClose={onChiudi}>
      <form onSubmit={submit} className="space-y-3 text-sm">
        <div className="riquadro avviso !my-0">
          Non inserire mai nel messaggio dati di clienti dello studio né contenuti di
          segnalazioni: per l’assistenza tecnica non servono.
        </div>
        {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
        <div>
          <label className="label">Oggetto</label>
          <input className="input" value={oggetto} onChange={(e) => setOggetto(e.target.value)} required maxLength={200} autoFocus placeholder="Es. Dubbio sul calcolo della Tabella B" />
        </div>
        <div>
          <label className="label">Messaggio</label>
          <textarea className="input min-h-[140px]" value={testo} onChange={(e) => setTesto(e.target.value)} required maxLength={5000} placeholder="Descrivi la richiesta…" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-secondary" onClick={onChiudi}>Annulla</button>
          <button className="btn btn-primary" disabled={invio}>{invio ? 'Invio in corso…' : 'Invia la richiesta'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ConversazioneTicket({ id, ioId, onChiudi }: { id: string; ioId: string; onChiudi: () => void }) {
  const [dati, setDati] = useState<{ ticket: TicketRiga & { autoreEmail: string }; messaggi: Messaggio[] } | null>(null);
  const [errore, setErrore] = useState('');
  const [testo, setTesto] = useState('');
  const [invio, setInvio] = useState(false);
  const [confermaChiudi, setConfermaChiudi] = useState(false);

  const carica = () => {
    api.get<{ ticket: TicketRiga & { autoreEmail: string }; messaggi: Messaggio[] }>(`/assistenza/${id}`)
      .then(setDati)
      .catch((e) => setErrore((e as Error).message));
  };
  useEffect(() => { carica(); }, [id]);

  const rispondi = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      await api.post(`/assistenza/${id}/messaggi`, { testo });
      setTesto('');
      carica();
    } catch (err) {
      setErrore((err as Error).message);
    } finally {
      setInvio(false);
    }
  };

  const chiudi = async () => {
    setErrore('');
    try {
      await api.post(`/assistenza/${id}/chiudi`);
      setConfermaChiudi(false);
      carica();
    } catch (err) {
      setErrore((err as Error).message);
    }
  };

  if (!dati && !errore) {
    return <Modal title="Richiesta di assistenza" onClose={onChiudi}><Spinner /></Modal>;
  }
  if (!dati) {
    return (
      <Modal title="Richiesta di assistenza" onClose={onChiudi}>
        <ErrorBanner message={errore} />
      </Modal>
    );
  }

  const t = dati.ticket;
  return (
    <Modal title={`${t.numero} — ${t.oggetto}`} onClose={onChiudi} wide>
      <div className="flex items-center gap-2 mb-4">
        <Badge tone={STATO_TICKET[t.stato].tone}>{STATO_TICKET[t.stato].testo}</Badge>
        <span className="text-xs text-ink-400">aperta il {dataOraIt(t.createdAt)}</span>
        {t.stato !== 'chiuso' && (
          <button className="btn btn-ghost btn-sm ml-auto" onClick={() => setConfermaChiudi(true)}>
            Segna come risolta
          </button>
        )}
      </div>
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}

      <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1 mb-4">
        {dati.messaggi.map((m) => (
          <div key={m.id} className={`max-w-[85%] ${m.daAssistenza ? '' : 'ml-auto'}`}>
            <div className={`rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
              m.daAssistenza ? 'bg-teal-600/10 text-ink-800' : 'bg-ink-100 text-ink-800'
            }`}>
              {m.testo}
            </div>
            <div className={`text-[11px] text-ink-400 mt-0.5 ${m.daAssistenza ? '' : 'text-right'}`}>
              {m.daAssistenza ? 'Assistenza Contify' : (m.autoreNome ?? 'Utente dello studio')} · {dataOraIt(m.createdAt)}
            </div>
          </div>
        ))}
      </div>

      {t.stato === 'chiuso' ? (
        <div className="riquadro info !my-0 text-sm">
          Questa richiesta è chiusa: per un nuovo problema aprine una nuova dalla pagina Assistenza.
        </div>
      ) : (
        <form onSubmit={rispondi} className="space-y-2">
          <textarea
            className="input min-h-[90px]"
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            required
            maxLength={5000}
            placeholder="Scrivi un messaggio…"
          />
          <div className="flex justify-end">
            <button className="btn btn-primary btn-sm" disabled={invio || !testo.trim()}>
              {invio ? 'Invio…' : 'Invia'}
            </button>
          </div>
        </form>
      )}

      {confermaChiudi && (
        <Modal title="Chiudere la richiesta?" onClose={() => setConfermaChiudi(false)}>
          <div className="space-y-3 text-sm">
            <p>
              La richiesta <strong>{t.numero}</strong> verrà segnata come risolta: la conversazione resta
              consultabile, ma non si potranno aggiungere altri messaggi. Per un nuovo problema si apre
              una nuova richiesta.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setConfermaChiudi(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={chiudi}>Chiudi la richiesta</button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
