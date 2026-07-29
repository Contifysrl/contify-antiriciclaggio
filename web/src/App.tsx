import { useEffect, useState } from 'react';
import { api } from './api';
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
          CONTIFY ANTIRICICLAGGIO
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
    <div className="accesso">
      <form className="riquadro-accesso" onSubmit={entra}>
        <img src="/logo-contify.png" alt="Contify" />
        <h2 style={{ margin: '0 0 4px', color: 'var(--c-scuro)' }}>Contify Antiriciclaggio</h2>
        <p className="aiuto" style={{ marginBottom: 20 }}>
          Adempimenti del DLgs. 231/2007 per studi professionali.
        </p>
        <div className="campo">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        </div>
        <div className="campo">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <button className="azione" style={{ width: '100%' }} disabled={inCorso}>
          {inCorso ? 'Verifica…' : 'Entra'}
        </button>
        {errore && <div className="errore">{errore}</div>}
      </form>
    </div>
  );
}
