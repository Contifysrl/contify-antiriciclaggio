import { useEffect, useState } from 'react';
import { api } from './api';
import { LayoutAuth } from './components/LayoutAuth';
import { Icona } from './components/icone';
import { Autovalutazione, Cruscotto, Registro } from './pagine/Studio';
import { Clienti, DettaglioFascicolo, Fascicoli } from './pagine/Fascicoli';
import { Contante, Scadenzario, Sos } from './pagine/Presidi';

interface Sessione {
  utente: { id: string; nome: string; email: string; ruolo: string };
  studio: { id: string; denominazione: string; piano: string };
}

/** Routing su hash: nessuna dipendenza da un router, l'app ha nove schermate. */
function usaPercorso(): [string, (p: string) => void] {
  const [p, setP] = useState(() => window.location.hash.slice(1) || 'cruscotto');
  useEffect(() => {
    const h = () => setP(window.location.hash.slice(1) || 'cruscotto');
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return [p, (nuovo: string) => { window.location.hash = nuovo; }];
}

export default function App() {
  const [sessione, setSessione] = useState<Sessione | null>(null);
  const [caricando, setCaricando] = useState(true);
  const [percorso, vaiA] = usaPercorso();

  useEffect(() => {
    api.get<Sessione>('/auth/io').then(setSessione).catch(() => setSessione(null)).finally(() => setCaricando(false));
  }, []);

  if (caricando) return <div className="caricamento" style={{ padding: 40 }}>Caricamento…</div>;
  if (!sessione) return <Accesso onEntrato={setSessione} />;

  const [pagina, query] = percorso.split('?');
  const parametri = new URLSearchParams(query ?? '');

  const voci: Array<{ id: string; testo: string; ruoli?: string[] }> = [
    { id: 'cruscotto', testo: 'Cruscotto' },
    { id: 'autovalutazione', testo: 'Autovalutazione studio' },
    { id: 'clienti', testo: 'Clienti' },
    { id: 'fascicoli', testo: 'Fascicoli' },
    { id: 'scadenzario', testo: 'Scadenzario' },
    { id: 'contante', testo: 'Limiti al contante' },
    { id: 'sos', testo: 'Segnalazioni', ruoli: ['TITOLARE'] },
    { id: 'registro', testo: 'Registro accessi' },
  ];

  return (
    <div className="app">
      <nav className="nav">
        <div className="marchio">
          <img src="/logo-contify-white.png" alt="Contify" />
        </div>
        <div className="sottotitolo" style={{ padding: '0 8px', marginBottom: 18, fontSize: 11, color: 'var(--c-chiaro)', letterSpacing: '.08em' }}>
          AR · ANTIRICICLAGGIO
        </div>
        {voci
          .filter((v) => !v.ruoli || v.ruoli.includes(sessione.utente.ruolo))
          .map((v) => (
            <button
              key={v.id}
              aria-current={pagina === v.id || (v.id === 'fascicoli' && pagina === 'fascicolo') ? 'page' : undefined}
              onClick={() => vaiA(v.id)}
            >
              <span className="testo">{v.testo}</span>
            </button>
          ))}
        <div className="separatore" />
        <div className="piede">
          <div><strong>{sessione.studio.denominazione}</strong></div>
          <div>{sessione.utente.nome} · {sessione.utente.ruolo.toLowerCase()}</div>
          <button
            style={{ marginTop: 10, padding: '6px 0' }}
            onClick={async () => { await api.post('/auth/logout'); location.reload(); }}
          >
            Esci
          </button>
        </div>
      </nav>

      <main className="contenuto">
        {pagina === 'cruscotto' && <Cruscotto vaiA={vaiA} />}
        {pagina === 'autovalutazione' && <Autovalutazione />}
        {pagina === 'clienti' && <Clienti vaiA={vaiA} />}
        {pagina === 'fascicoli' && <Fascicoli vaiA={vaiA} />}
        {pagina === 'fascicolo' && <DettaglioFascicolo id={parametri.get('id') ?? ''} vaiA={vaiA} />}
        {pagina === 'scadenzario' && <Scadenzario vaiA={vaiA} />}
        {pagina === 'contante' && <Contante />}
        {pagina === 'sos' && <Sos />}
        {pagina === 'registro' && <Registro />}
      </main>
    </div>
  );
}

function Accesso({ onEntrato }: { onEntrato: (s: Sessione) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostraPassword, setMostraPassword] = useState(false);
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);

  async function entra(e: React.FormEvent) {
    e.preventDefault();
    setErrore('');
    setInCorso(true);
    try {
      onEntrato(await api.post<Sessione>('/auth/login', { email, password }));
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
          <div className="relative">
            <input
              className="input pr-10"
              type={mostraPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Inserisci la tua password"
              required
              autoComplete="current-password"
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 px-3 flex items-center text-ink-400 hover:text-ink-700 transition-colors"
              onClick={() => setMostraPassword((v) => !v)}
              aria-label={mostraPassword ? 'Nascondi password' : 'Mostra password'}
              aria-pressed={mostraPassword}
            >
              <Icona nome="occhio" size={16} />
            </button>
          </div>
        </div>
        {errore && <div className="text-sm text-red-600 font-semibold">{errore}</div>}
        <button className="btn btn-primary w-full justify-center py-2.5" disabled={inCorso}>
          {inCorso ? 'Accesso in corso…' : <>Accedi <Icona nome="frecciaDestra" size={15} /></>}
        </button>
        {/* Accettazione condizioni: quando le CGS di Contify AR saranno
            approvate dallo studio legale, questa riga linkerà il documento. */}
        <p className="text-[11px] text-ink-400 text-center pt-2">
          Accedendo accetti le Condizioni Generali di Servizio di Contify AR.
        </p>
      </form>
    </LayoutAuth>
  );
}
