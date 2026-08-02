import { FormEvent, useState } from 'react';
import { api } from '../api';
import { LayoutAuth } from '../components/LayoutAuth';
import { Icona } from '../components/icone';

// ── Pagine di autenticazione (AR-M3) ───────────────────────────
// Accesso, recupero password via email, reset con token, cambio
// obbligatorio al primo accesso. Tutte sul LayoutAuth di Assist.

export interface SessioneApp {
  utente: { id: string; nome: string; email: string; ruolo: string; avatar?: string | null; cambioPasswordRichiesto?: boolean };
  studio: { id: string; denominazione: string; piano: string; stato?: string; logo?: string | null };
}

/** Campo password con occhio mostra/nascondi. */
function CampoPassword({ valore, onChange, placeholder, autoComplete, autoFocus }: {
  valore: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: string; autoFocus?: boolean;
}) {
  const [mostra, setMostra] = useState(false);
  return (
    <div className="relative">
      <input
        className="input pr-10"
        type={mostra ? 'text' : 'password'}
        value={valore}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        autoComplete={autoComplete}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 px-3 flex items-center text-ink-400 hover:text-ink-700 transition-colors"
        onClick={() => setMostra((v) => !v)}
        aria-label={mostra ? 'Nascondi password' : 'Mostra password'}
        aria-pressed={mostra}
      >
        <Icona nome="occhio" size={16} />
      </button>
    </div>
  );
}

export function Accesso({ onEntrato }: { onEntrato: (s: SessioneApp) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);

  async function entra(e: FormEvent) {
    e.preventDefault();
    setErrore('');
    setInCorso(true);
    try {
      onEntrato(await api.post<SessioneApp>('/auth/login', { email, password }));
    } catch (err) {
      setErrore((err as Error).message);
    } finally {
      setInCorso(false);
    }
  }

  return (
    <LayoutAuth
      titolo="Accedi a Contify AR"
      sottotitolo="AntiRiciclaggio — adempimenti del DLgs. 231/2007 per studi professionali"
    >
      <form onSubmit={entra} className="space-y-4">
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Inserisci il tuo indirizzo email"
            autoFocus
            required
            autoComplete="username"
          />
        </div>
        <div>
          <label className="label">Password</label>
          <CampoPassword valore={password} onChange={setPassword} placeholder="Inserisci la tua password" autoComplete="current-password" />
        </div>
        {errore && <div className="text-sm text-red-600 font-semibold">{errore}</div>}
        <button className="btn btn-primary w-full justify-center py-2.5" disabled={inCorso}>
          {inCorso ? 'Accesso in corso…' : <>Accedi <Icona nome="frecciaDestra" size={15} /></>}
        </button>
        <div className="flex w-full justify-between mt-1">
          <a href="#password-dimenticata" className="text-sm text-ink-400 hover:text-ink-700 transition-colors">
            Password dimenticata?
          </a>
        </div>
        {/* Accettazione condizioni: quando le CGS di Contify AR saranno
            approvate dallo studio legale, questa riga linkerà il documento. */}
        <p className="text-[11px] text-ink-400 text-center pt-2">
          Accedendo accetti le Condizioni Generali di Servizio di Contify AR.
        </p>
      </form>
    </LayoutAuth>
  );
}

/**
 * Richiesta di reset: si inserisce l'email e, se esiste un account attivo,
 * arriva una mail con il link monouso. Il messaggio di conferma è identico
 * in ogni caso (niente enumerazione degli account).
 */
export function PasswordDimenticata() {
  const [email, setEmail] = useState('');
  const [inviata, setInviata] = useState(false);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      await api.post('/auth/password-dimenticata', { email });
      setInviata(true);
    } catch (err) {
      setErrore((err as Error).message);
    } finally {
      setInvio(false);
    }
  };

  return (
    <LayoutAuth titolo="Recupero password" sottotitolo="Ti inviamo via email un link per impostare una nuova password">
      {inviata ? (
        <div className="space-y-4">
          <div className="rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-sm px-4 py-3">
            Se <span className="font-semibold">{email}</span> corrisponde a un account attivo,
            riceverai a breve un'email con il link per impostare una nuova password.
            Il link vale <span className="font-semibold">60 minuti</span>.
          </div>
          <div className="text-xs text-ink-400">
            Non arriva nulla? Controlla la posta indesiderata, verifica di aver scritto
            l'indirizzo con cui accedi, oppure chiedi al titolare dello studio.
          </div>
          <a href="#" className="btn btn-secondary w-full justify-center">Torna all'accesso</a>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-ink-500">
            Inserisci l'email con cui accedi: ti invieremo un link per impostare una nuova password.
          </p>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required autoComplete="username" />
          </div>
          {errore && <div className="text-sm text-red-600 font-semibold">{errore}</div>}
          <button className="btn btn-primary w-full justify-center py-2.5" disabled={invio}>
            {invio ? 'Invio in corso…' : 'Inviami il link'}
          </button>
          <div className="text-center">
            <a href="#" className="text-sm text-teal-700 font-semibold hover:underline">Torna all'accesso</a>
          </div>
        </form>
      )}
    </LayoutAuth>
  );
}

/** Imposta la nuova password a partire dal token del link email. */
export function ResetPassword({ token }: { token: string }) {
  const [nuova, setNuova] = useState('');
  const [conferma, setConferma] = useState('');
  const [fatto, setFatto] = useState(false);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    if (nuova !== conferma) {
      setErrore('Le due password non coincidono');
      return;
    }
    setInvio(true);
    try {
      await api.post('/auth/reset-password', { token, nuova });
      setFatto(true);
    } catch (err) {
      setErrore((err as Error).message);
    } finally {
      setInvio(false);
    }
  };

  return (
    <LayoutAuth titolo="Nuova password" sottotitolo="Scegli la password con cui accederai d'ora in poi">
      {fatto ? (
        <div className="space-y-4">
          <div className="rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-sm px-4 py-3">
            Password aggiornata. Per sicurezza tutte le sessioni aperte sono state chiuse:
            accedi con la nuova password.
          </div>
          <a href="#" className="btn btn-primary w-full justify-center">Vai all'accesso</a>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Nuova password</label>
            <CampoPassword valore={nuova} onChange={setNuova} placeholder="Almeno 8 caratteri" autoComplete="new-password" autoFocus />
          </div>
          <div>
            <label className="label">Ripeti la nuova password</label>
            <CampoPassword valore={conferma} onChange={setConferma} autoComplete="new-password" />
          </div>
          {errore && <div className="text-sm text-red-600 font-semibold">{errore}</div>}
          <button className="btn btn-primary w-full justify-center py-2.5" disabled={invio}>
            {invio ? 'Salvataggio…' : 'Imposta la password'}
          </button>
        </form>
      )}
    </LayoutAuth>
  );
}

/**
 * Cambio password OBBLIGATORIO al primo accesso (utente creato dal titolare
 * o dopo un reset amministrativo): si entra nell'app solo dopo averla
 * cambiata. La "password attuale" è quella temporanea appena usata.
 */
export function CambioPasswordObbligatorio({ sessione, onFatto }: { sessione: SessioneApp; onFatto: () => void }) {
  const [attuale, setAttuale] = useState('');
  const [nuova, setNuova] = useState('');
  const [conferma, setConferma] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    if (nuova !== conferma) {
      setErrore('Le due password non coincidono');
      return;
    }
    setInvio(true);
    try {
      await api.post('/auth/cambia-password', { attuale, nuova });
      onFatto();
    } catch (err) {
      setErrore((err as Error).message);
    } finally {
      setInvio(false);
    }
  };

  return (
    <LayoutAuth
      titolo="Scegli la tua password"
      sottotitolo={`Prima di iniziare, ${sessione.utente.nome.split(' ')[0]}, imposta una password personale`}
      benvenutoTitolo="Ti diamo il benvenuto!"
      benvenutoTesto="La password temporanea vale solo per il primo accesso: scegline una tua per proseguire."
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Password temporanea</label>
          <CampoPassword valore={attuale} onChange={setAttuale} autoComplete="current-password" autoFocus />
        </div>
        <div>
          <label className="label">Nuova password</label>
          <CampoPassword valore={nuova} onChange={setNuova} placeholder="Almeno 8 caratteri" autoComplete="new-password" />
        </div>
        <div>
          <label className="label">Ripeti la nuova password</label>
          <CampoPassword valore={conferma} onChange={setConferma} autoComplete="new-password" />
        </div>
        {errore && <div className="text-sm text-red-600 font-semibold">{errore}</div>}
        <button className="btn btn-primary w-full justify-center py-2.5" disabled={invio}>
          {invio ? 'Salvataggio…' : 'Salva e continua'}
        </button>
      </form>
    </LayoutAuth>
  );
}
