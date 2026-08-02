import { useEffect, useState } from 'react';
import { api } from './api';
import { LayoutAuth, LogoContify } from './components/LayoutAuth';
import { Icona } from './components/icone';
import { AvatarUtente } from './components/ui';
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

  const voci: Array<{ id: string; testo: string; icona: string; ruoli?: string[] }> = [
    { id: 'cruscotto', testo: 'Cruscotto', icona: 'dashboard' },
    { id: 'autovalutazione', testo: 'Autovalutazione studio', icona: 'grafico' },
    { id: 'clienti', testo: 'Clienti', icona: 'edificio' },
    { id: 'fascicoli', testo: 'Fascicoli', icona: 'elenco' },
    { id: 'scadenzario', testo: 'Scadenzario', icona: 'orologio' },
    { id: 'contante', testo: 'Limiti al contante', icona: 'mano' },
    { id: 'sos', testo: 'Segnalazioni', icona: 'avviso', ruoli: ['TITOLARE'] },
    { id: 'registro', testo: 'Registro accessi', icona: 'database' },
  ];

  return (
    <Shell
      sessione={sessione}
      voci={voci.filter((v) => !v.ruoli || v.ruoli.includes(sessione.utente.ruolo))}
      pagina={pagina}
      vaiA={vaiA}
    >
      {pagina === 'cruscotto' && <Cruscotto vaiA={vaiA} />}
      {pagina === 'autovalutazione' && <Autovalutazione />}
      {pagina === 'clienti' && <Clienti vaiA={vaiA} />}
      {pagina === 'fascicoli' && <Fascicoli vaiA={vaiA} />}
      {pagina === 'fascicolo' && <DettaglioFascicolo id={parametri.get('id') ?? ''} vaiA={vaiA} />}
      {pagina === 'scadenzario' && <Scadenzario vaiA={vaiA} />}
      {pagina === 'contante' && <Contante />}
      {pagina === 'sos' && <Sos />}
      {pagina === 'registro' && <Registro />}
    </Shell>
  );
}

/**
 * Shell dell'app in stile Assist: sidebar bianca sticky su desktop,
 * cassetto off-canvas su mobile, blocco utente con «Esci» sempre in vista.
 * Pre-login parla il prodotto; qui compare lo studio, dal database.
 */
function Shell({ sessione, voci, pagina, vaiA, children }: {
  sessione: Sessione;
  voci: Array<{ id: string; testo: string; icona: string }>;
  pagina: string;
  vaiA: (p: string) => void;
  children: React.ReactNode;
}) {
  const [menuAperto, setMenuAperto] = useState(false);
  const chiudiMenu = () => setMenuAperto(false);

  const navCls = (attiva: boolean) =>
    `w-full flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors text-left ${
      attiva ? 'bg-teal-600 text-accento-on' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800'
    }`;
  const attiva = (id: string) => pagina === id || (id === 'fascicoli' && pagina === 'fascicolo');

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Barra superiore, solo mobile: hamburger + brand */}
      <header className="lg:hidden sticky top-0 z-30 bg-ink-0 border-b border-ink-100 flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          className="p-1 -ml-1 text-ink-600 hover:text-ink-900"
          onClick={() => setMenuAperto(true)}
          aria-label="Apri il menu"
        >
          <Icona nome="menu" size={22} />
        </button>
        <LogoContify altezza={20} />
      </header>

      {menuAperto && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={chiudiMenu} aria-hidden="true" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 shrink-0 bg-ink-0 border-r border-ink-100 flex flex-col transform transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:z-auto lg:translate-x-0 ${
          menuAperto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-5 border-b border-ink-100 relative">
          <button
            type="button"
            className="lg:hidden absolute top-3 right-3 p-1 text-ink-400 hover:text-ink-700"
            onClick={chiudiMenu}
            aria-label="Chiudi il menu"
          >
            <Icona nome="x" size={20} />
          </button>
          <LogoContify altezza={24} />
          <div className="text-[11px] text-ink-400 font-medium mt-1">per {sessione.studio.denominazione}</div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto flex flex-col">
          {voci.map((v) => (
            <button
              key={v.id}
              type="button"
              className={navCls(attiva(v.id))}
              aria-current={attiva(v.id) ? 'page' : undefined}
              onClick={() => { vaiA(v.id); chiudiMenu(); }}
            >
              <Icona nome={v.icona} size={17} />
              <span>{v.testo}</span>
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-ink-100 text-sm">
          <div className="flex items-center gap-3 mb-2.5">
            <AvatarUtente nome={sessione.utente.nome} size={40} />
            <div className="min-w-0">
              <div className="font-semibold text-ink-800 truncate">{sessione.utente.nome}</div>
              <div className="text-xs text-ink-400 truncate capitalize">{sessione.utente.ruolo.toLowerCase()}</div>
            </div>
          </div>
          <button
            className="btn btn-secondary btn-sm w-full justify-center"
            onClick={async () => { await api.post('/auth/logout'); location.reload(); }}
          >
            Esci
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
        <div className="max-w-[1180px]">{children}</div>
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
