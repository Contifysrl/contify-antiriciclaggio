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
  const [ticket, setTicket] = useState<TicketConsole[] | null>(null);
  const [errore, setErrore] = useState('');
  const [apertoId, setApertoId] = useState<string | null>(apri);

  const carica = () => {
    api.get<{ ticket: TicketConsole[] }>('/console/ticket')
      .then((r) => setTicket(r.ticket))
      .catch((e) => { setErrore((e as Error).message); setTicket([]); });
  };
  useEffect(() => { carica(); }, []);

  return (
    <div className="min-h-screen bg-ink-100 p-4 sm:p-8">
      <div className="max-w-[1000px] mx-auto">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <LogoContify altezza={24} />
          <span className="text-xs text-ink-400 font-semibold">Console assistenza</span>
          <span className="ml-auto text-sm text-ink-500">{operatore.nome}</span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={async () => { await api.post('/console/logout'); location.reload(); }}
          >
            Esci
          </button>
        </div>

        {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}

        {ticket === null ? (
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
        )}

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
