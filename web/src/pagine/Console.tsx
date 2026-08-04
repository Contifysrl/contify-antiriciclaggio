import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';
import { LogoContify } from '../components/LayoutAuth';
import { Badge, ErrorBanner, Modal, Spinner } from '../components/ui';
import { dataOraTicket } from './Assistenza';

// ── Console Contify (AR-M11) ───────────────────────────────────
// Il pannello con cui l'assistenza Contify risponde ai ticket di tutti
// gli studi (#console). Autenticazione separata dai tenant: operatori in
// operatori_console, cookie proprio. Non compare in nessun menu: ci si
// arriva dal link nelle email di notifica o digitando l'indirizzo.

interface Operatore {
  email: string;
  nome: string;
  cambioPasswordRichiesto: boolean;
}

interface TicketConsole {
  id: string;
  numero: string;
  oggetto: string;
  stato: 'aperto' | 'risposto' | 'chiuso';
  createdAt: string;
  updatedAt: string;
  studio: string;
  autoreNome: string;
  autoreEmail: string;
  nMessaggi: number;
}

const STATO: Record<TicketConsole['stato'], { testo: string; tone: 'teal' | 'gray' | 'amber' }> = {
  aperto: { testo: 'Da rispondere', tone: 'amber' },
  risposto: { testo: 'Risposta inviata', tone: 'teal' },
  chiuso: { testo: 'Chiuso', tone: 'gray' },
};

export function Console({ apri }: { apri: string | null }) {
  const [operatore, setOperatore] = useState<Operatore | null>(null);
  const [caricando, setCaricando] = useState(true);

  useEffect(() => {
    api.get<{ operatore: Operatore }>('/console/me')
      .then((r) => setOperatore(r.operatore))
      .catch(() => setOperatore(null))
      .finally(() => setCaricando(false));
  }, []);

  if (caricando) return <div className="caricamento" style={{ padding: 40 }}>Caricamento…</div>;
  if (!operatore) return <AccessoConsole onEntrato={setOperatore} />;
  if (operatore.cambioPasswordRichiesto) {
    return <CambioPasswordConsole onFatto={() => setOperatore({ ...operatore, cambioPasswordRichiesto: false })} />;
  }
  return <TicketConsolePagina operatore={operatore} apri={apri} />;
}

function CorniceAuth({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-100 p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-1"><LogoContify altezza={26} /></div>
        <div className="text-xs text-ink-400 font-semibold mb-5">Console assistenza — riservata a Contify</div>
        {children}
      </div>
    </div>
  );
}

function AccessoConsole({ onEntrato }: { onEntrato: (o: Operatore) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      const r = await api.post<{ operatore: Operatore }>('/console/login', { email, password });
      onEntrato(r.operatore);
    } catch (err) {
      setErrore((err as Error).message);
      setInvio(false);
    }
  };

  return (
    <CorniceAuth>
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="username" />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        <button className="btn btn-primary w-full justify-center" disabled={invio}>
          {invio ? 'Accesso…' : 'Entra nella console'}
        </button>
      </form>
    </CorniceAuth>
  );
}

function CambioPasswordConsole({ onFatto }: { onFatto: () => void }) {
  const [attuale, setAttuale] = useState('');
  const [nuova, setNuova] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      await api.post('/console/cambia-password', { attuale, nuova });
      onFatto();
    } catch (err) {
      setErrore((err as Error).message);
      setInvio(false);
    }
  };

  return (
    <CorniceAuth>
      <p className="text-sm text-ink-600 mb-3">La password temporanea va sostituita prima di continuare.</p>
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Password attuale</label>
          <input className="input" type="password" value={attuale} onChange={(e) => setAttuale(e.target.value)} required autoFocus autoComplete="current-password" />
        </div>
        <div>
          <label className="label">Nuova password (almeno 10 caratteri)</label>
          <input className="input" type="password" value={nuova} onChange={(e) => setNuova(e.target.value)} required minLength={10} autoComplete="new-password" />
        </div>
        <button className="btn btn-primary w-full justify-center" disabled={invio}>
          {invio ? 'Salvataggio…' : 'Imposta la nuova password'}
        </button>
      </form>
    </CorniceAuth>
  );
}

function TicketConsolePagina({ operatore, apri }: { operatore: Operatore; apri: string | null }) {
  const [vista, setVista] = useState<'ticket' | 'studi'>('ticket');
  const [ticket, setTicket] = useState<TicketConsole[] | null>(null);
  const [errore, setErrore] = useState('');
  const [apertoId, setApertoId] = useState<string | null>(apri);

  const carica = () => {
    api.get<{ ticket: TicketConsole[] }>('/console/ticket')
      .then((r) => setTicket(r.ticket))
      .catch((e) => { setErrore((e as Error).message); setTicket([]); });
  };
  useEffect(() => { carica(); }, []);

  const tabCls = (attiva: boolean) =>
    `px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
      attiva ? 'bg-teal-600 text-accento-on' : 'text-ink-500 hover:bg-ink-200'
    }`;

  return (
    <div className="min-h-screen bg-ink-100 p-4 sm:p-8">
      <div className="max-w-[1000px] mx-auto">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <LogoContify altezza={24} />
          <span className="text-xs text-ink-400 font-semibold">Console assistenza</span>
          <div className="flex gap-1 ml-4 bg-ink-0 border border-ink-100 rounded-xl p-1">
            <button type="button" className={tabCls(vista === 'ticket')} onClick={() => setVista('ticket')}>Ticket</button>
            <button type="button" className={tabCls(vista === 'studi')} onClick={() => setVista('studi')}>Studi</button>
          </div>
          <span className="ml-auto text-sm text-ink-500">{operatore.nome}</span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={async () => { await api.post('/console/logout'); location.reload(); }}
          >
            Esci
          </button>
        </div>

        {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}

        {vista === 'studi' && <StudiConsole />}

        {vista === 'ticket' && (ticket === null ? (
          <Spinner />
        ) : ticket.length === 0 ? (
          <div className="card p-8 text-center text-sm text-ink-400">Nessun ticket: tutto tranquillo.</div>
        ) : (
          <div className="card p-5">
            <table>
              <thead>
                <tr><th>Numero</th><th>Studio</th><th>Oggetto</th><th>Stato</th><th>Aggiornato</th></tr>
              </thead>
              <tbody>
                {ticket.map((t) => (
                  <tr key={t.id} className="cursor-pointer hover:bg-ink-50" onClick={() => setApertoId(t.id)}>
                    <td className="mono whitespace-nowrap">{t.numero}</td>
                    <td className="font-semibold">{t.studio}</td>
                    <td>
                      {t.oggetto}
                      <span className="block text-xs text-ink-400">di {t.autoreNome} ({t.autoreEmail})</span>
                    </td>
                    <td><Badge tone={STATO[t.stato].tone}>{STATO[t.stato].testo}</Badge></td>
                    <td className="whitespace-nowrap">{dataOraTicket(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {apertoId && (
          <ConversazioneConsole id={apertoId} onChiudi={() => { setApertoId(null); carica(); }} />
        )}
      </div>
    </div>
  );
}

function ConversazioneConsole({ id, onChiudi }: { id: string; onChiudi: () => void }) {
  const [dati, setDati] = useState<{ ticket: TicketConsole; messaggi: Array<{ id: string; testo: string; daAssistenza: boolean; createdAt: string; autoreNome: string | null }> } | null>(null);
  const [errore, setErrore] = useState('');
  const [testo, setTesto] = useState('');
  const [invio, setInvio] = useState(false);

  const carica = () => {
    api.get<typeof dati>(`/console/ticket/${encodeURIComponent(id)}`)
      .then((r) => setDati(r))
      .catch((e) => setErrore((e as Error).message));
  };
  useEffect(() => { carica(); }, [id]);

  const rispondi = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      await api.post(`/console/ticket/${encodeURIComponent(dati?.ticket.id ?? id)}/rispondi`, { testo });
      setTesto('');
      carica();
    } catch (err) {
      setErrore((err as Error).message);
    } finally {
      setInvio(false);
    }
  };

  const chiudiTicket = async () => {
    setErrore('');
    try {
      await api.post(`/console/ticket/${encodeURIComponent(dati?.ticket.id ?? id)}/chiudi`);
      carica();
    } catch (err) {
      setErrore((err as Error).message);
    }
  };

  if (!dati && !errore) return <Modal title="Ticket" onClose={onChiudi}><Spinner /></Modal>;
  if (!dati) return <Modal title="Ticket" onClose={onChiudi}><ErrorBanner message={errore} /></Modal>;

  const t = dati.ticket;
  return (
    <Modal title={`${t.numero} — ${t.oggetto}`} onClose={onChiudi} wide>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Badge tone={STATO[t.stato].tone}>{STATO[t.stato].testo}</Badge>
        <span className="text-xs text-ink-400">
          {t.studio} · {t.autoreNome} ({t.autoreEmail}) · aperto il {dataOraTicket(t.createdAt)}
        </span>
        {t.stato !== 'chiuso' && (
          <button className="btn btn-ghost btn-sm ml-auto" onClick={chiudiTicket}>Chiudi il ticket</button>
        )}
      </div>
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}

      <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1 mb-4">
        {dati.messaggi.map((m) => (
          <div key={m.id} className={`max-w-[85%] ${m.daAssistenza ? 'ml-auto' : ''}`}>
            <div className={`rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
              m.daAssistenza ? 'bg-teal-600/10 text-ink-800' : 'bg-ink-100 text-ink-800'
            }`}>
              {m.testo}
            </div>
            <div className={`text-[11px] text-ink-400 mt-0.5 ${m.daAssistenza ? 'text-right' : ''}`}>
              {m.daAssistenza ? 'Assistenza Contify' : (m.autoreNome ?? 'Utente dello studio')} · {dataOraTicket(m.createdAt)}
            </div>
          </div>
        ))}
      </div>

      {t.stato === 'chiuso' ? (
        <div className="riquadro info !my-0 text-sm">Ticket chiuso.</div>
      ) : (
        <form onSubmit={rispondi} className="space-y-2">
          <textarea
            className="input min-h-[90px]"
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            required
            maxLength={5000}
            placeholder="Scrivi la risposta… (l'utente riceve un avviso email e la legge nell'app)"
          />
          <div className="flex justify-end">
            <button className="btn btn-primary btn-sm" disabled={invio || !testo.trim()}>
              {invio ? 'Invio…' : 'Invia la risposta'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ── Studi: licenza e contratto (AR-M12) ────────────────────────
// L'equivalente del riquadro «Licenza e contratto» di Assist, dalla
// console: stato commerciale, date del contratto e note, senza mai
// entrare negli archivi degli studi.

interface StudioRiga {
  id: string;
  denominazione: string;
  stato: 'attivo' | 'sospeso' | 'cessato';
  dataAttivazione: string | null;
  dataScadenzaCanone: string | null;
  noteContratto: string | null;
  nUtenti: number;
  ultimoAccesso: string | null;
}

const STATO_STUDIO: Record<StudioRiga['stato'], { testo: string; tone: 'teal' | 'gray' | 'amber' }> = {
  attivo: { testo: 'Attivo', tone: 'teal' },
  sospeso: { testo: 'Sospeso (sola lettura)', tone: 'amber' },
  cessato: { testo: 'Cessato', tone: 'gray' },
};

function dataIt(iso: string | null): string {
  if (!iso) return '—';
  const [a, m, g] = iso.slice(0, 10).split('-');
  return `${g}/${m}/${a}`;
}

function giorniAScadenza(iso: string | null): number | null {
  if (!iso) return null;
  const oggi = new Date(); oggi.setUTCHours(0, 0, 0, 0);
  return Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - oggi.getTime()) / 86_400_000);
}

function StudiConsole() {
  const [studi, setStudi] = useState<StudioRiga[] | null>(null);
  const [errore, setErrore] = useState('');
  const [aperto, setAperto] = useState<StudioRiga | null>(null);

  const carica = () => {
    api.get<{ studi: StudioRiga[] }>('/console/studi')
      .then((r) => setStudi(r.studi))
      .catch((e) => { setErrore((e as Error).message); setStudi([]); });
  };
  useEffect(() => { carica(); }, []);

  return (
    <>
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      {studi === null ? (
        <Spinner />
      ) : (
        <div className="card p-5">
          <table>
            <thead>
              <tr><th>Studio</th><th>Stato</th><th>Attivazione</th><th>Scadenza canone</th><th>Utenti</th></tr>
            </thead>
            <tbody>
              {studi.map((s) => {
                const giorni = giorniAScadenza(s.dataScadenzaCanone);
                return (
                  <tr key={s.id} className="cursor-pointer hover:bg-ink-50" onClick={() => setAperto(s)}>
                    <td className="font-semibold">{s.denominazione}</td>
                    <td><Badge tone={STATO_STUDIO[s.stato].tone}>{STATO_STUDIO[s.stato].testo}</Badge></td>
                    <td className="whitespace-nowrap">{dataIt(s.dataAttivazione)}</td>
                    <td className="whitespace-nowrap">
                      {dataIt(s.dataScadenzaCanone)}
                      {giorni !== null && (
                        <span className={`block text-xs ${giorni < 0 ? 'text-red-600 font-semibold' : giorni <= 30 ? 'text-amber-600' : 'text-ink-400'}`}>
                          {giorni < 0 ? `scaduto da ${-giorni} giorni` : `mancano ${giorni} giorni`}
                        </span>
                      )}
                    </td>
                    <td>{s.nUtenti}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {aperto && (
        <StudioModal studio={aperto} onChiudi={(ricarica) => { setAperto(null); if (ricarica) carica(); }} />
      )}
    </>
  );
}

function StudioModal({ studio, onChiudi }: { studio: StudioRiga; onChiudi: (ricarica: boolean) => void }) {
  const [attivazione, setAttivazione] = useState(studio.dataAttivazione?.slice(0, 10) ?? '');
  const [scadenza, setScadenza] = useState(studio.dataScadenzaCanone?.slice(0, 10) ?? '');
  const [note, setNote] = useState(studio.noteContratto ?? '');
  const [errore, setErrore] = useState('');
  const [esito, setEsito] = useState('');
  const [invio, setInvio] = useState(false);
  const [confermaStato, setConfermaStato] = useState<'sospeso' | 'cessato' | 'attivo' | null>(null);
  const [toccato, setToccato] = useState(false);

  const salva = async (e: FormEvent) => {
    e.preventDefault();
    setErrore(''); setEsito(''); setInvio(true);
    try {
      await api.post(`/console/studi/${studio.id}/contratto`, {
        dataAttivazione: attivazione || null,
        dataScadenzaCanone: scadenza || null,
        noteContratto: note.trim() || null,
      });
      setEsito('Contratto salvato.');
      setToccato(true);
    } catch (err) {
      setErrore((err as Error).message);
    } finally {
      setInvio(false);
    }
  };

  const cambiaStato = async (stato: 'attivo' | 'sospeso' | 'cessato') => {
    setErrore(''); setEsito('');
    try {
      await api.post(`/console/studi/${studio.id}/stato`, { stato });
      onChiudi(true);
    } catch (err) {
      setErrore((err as Error).message);
      setConfermaStato(null);
    }
  };

  const ETICHETTA_CONFERMA: Record<string, { titolo: string; corpo: string; bottone: string }> = {
    sospeso: {
      titolo: 'Sospendere lo studio?',
      corpo: 'Lo studio passa in sola lettura: consultazione, export e backup restano possibili, le modifiche no. Nessuna email parte in automatico.',
      bottone: 'Sospendi (sola lettura)',
    },
    cessato: {
      titolo: 'Segnare lo studio come cessato?',
      corpo: 'L\'accesso viene chiuso (restano solo login/logout). I dati NON vengono toccati: per la cancellazione vera serve la procedura concordata col cliente.',
      bottone: 'Segna cessato',
    },
    attivo: {
      titolo: 'Riattivare lo studio?',
      corpo: 'Lo studio torna pienamente operativo.',
      bottone: 'Riattiva',
    },
  };

  return (
    <Modal title={studio.denominazione} onClose={() => onChiudi(toccato)} wide>
      <div className="flex items-center gap-2 mb-4">
        <Badge tone={STATO_STUDIO[studio.stato].tone}>{STATO_STUDIO[studio.stato].testo}</Badge>
        <span className="text-xs text-ink-400">{studio.nUtenti} utenti attivi</span>
      </div>
      {esito && <div className="riquadro info !my-2 text-sm">{esito}</div>}
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      <form onSubmit={salva} className="space-y-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Attivazione</label>
            <input className="input" type="date" value={attivazione} onChange={(e) => setAttivazione(e.target.value)} />
          </div>
          <div>
            <label className="label">Scadenza canone</label>
            <input className="input" type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Note contratto (visibili solo a Contify)</label>
          <textarea className="input min-h-[70px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Numero offerta, referente, condizioni particolari…" />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button className="btn btn-primary btn-sm" disabled={invio}>{invio ? 'Salvataggio…' : 'Salva contratto'}</button>
          {studio.stato !== 'sospeso' && studio.stato !== 'cessato' && (
            <button type="button" className="btn btn-secondary btn-sm !text-amber-700" onClick={() => setConfermaStato('sospeso')}>
              Sospendi (sola lettura)
            </button>
          )}
          {studio.stato !== 'cessato' && (
            <button type="button" className="btn btn-secondary btn-sm !text-red-700" onClick={() => setConfermaStato('cessato')}>
              Segna cessato
            </button>
          )}
          {studio.stato !== 'attivo' && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfermaStato('attivo')}>
              Riattiva
            </button>
          )}
        </div>
        <div className="aiuto">
          Nessuna sospensione avviene in automatico: alle soglie di scadenza parte solo un
          promemoria via email a Contify. Gli avvisi del canone restano quelli del lavoro notturno.
        </div>
      </form>

      {confermaStato && (
        <Modal title={ETICHETTA_CONFERMA[confermaStato].titolo} onClose={() => setConfermaStato(null)}>
          <div className="space-y-3 text-sm">
            <p>{ETICHETTA_CONFERMA[confermaStato].corpo}</p>
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setConfermaStato(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={() => cambiaStato(confermaStato)}>
                {ETICHETTA_CONFERMA[confermaStato].bottone}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
