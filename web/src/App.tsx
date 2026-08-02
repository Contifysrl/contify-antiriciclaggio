import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { LogoContify } from './components/LayoutAuth';
import { Icona } from './components/icone';
import { AvatarUtente } from './components/ui';
import { ridimensionaAvatar } from './lib/avatar';
import { Accesso, CambioPasswordObbligatorio, PasswordDimenticata, ResetPassword, type SessioneApp } from './pagine/Accessi';
import { Autovalutazione, Cruscotto, Registro } from './pagine/Studio';
import { Clienti, DettaglioFascicolo, Fascicoli } from './pagine/Fascicoli';
import { Contante, Scadenzario, Sos } from './pagine/Presidi';
import { Controlli } from './pagine/Controlli';
import { Impostazioni } from './pagine/Impostazioni';
import { Guida } from './pagine/Guida';
import { VerificaRemota } from './pagine/VerificaRemota';
import { ChatAssistente } from './pagine/ChatAssistente';

type Sessione = SessioneApp;

/** Routing su hash: nessuna dipendenza da un router. */
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

  const [pagina, query] = percorso.split('?');
  const parametri = new URLSearchParams(query ?? '');

  // ── Rotte pubbliche (anche con sessione: il link del cliente vince) ──
  if (pagina === 'verifica') return <VerificaRemota token={parametri.get('token') ?? ''} />;

  // ── Rotte pubbliche pre-login ────────────────────────────────
  if (!sessione) {
    if (pagina === 'password-dimenticata') return <PasswordDimenticata />;
    if (pagina === 'reset') return <ResetPassword token={parametri.get('token') ?? ''} />;
    return <Accesso onEntrato={(s) => { setSessione(s); vaiA('cruscotto'); }} />;
  }

  // ── Primo accesso: la password temporanea va sostituita ──────
  if (sessione.utente.cambioPasswordRichiesto) {
    return (
      <CambioPasswordObbligatorio
        sessione={sessione}
        onFatto={() => setSessione({ ...sessione, utente: { ...sessione.utente, cambioPasswordRichiesto: false } })}
      />
    );
  }

  const voci: Array<{ id: string; testo: string; icona: string; ruoli?: string[] }> = [
    { id: 'cruscotto', testo: 'Cruscotto', icona: 'dashboard' },
    { id: 'autovalutazione', testo: 'Autovalutazione studio', icona: 'grafico' },
    { id: 'clienti', testo: 'Clienti', icona: 'edificio' },
    { id: 'fascicoli', testo: 'Fascicoli', icona: 'elenco' },
    { id: 'scadenzario', testo: 'Scadenzario', icona: 'orologio' },
    { id: 'contante', testo: 'Limiti al contante', icona: 'mano' },
    { id: 'controlli', testo: 'Controlli automatici', icona: 'cerca' },
    { id: 'sos', testo: 'Segnalazioni', icona: 'avviso', ruoli: ['TITOLARE'] },
    { id: 'registro', testo: 'Registro accessi', icona: 'database' },
    { id: 'impostazioni', testo: 'Impostazioni', icona: 'ingranaggio' },
    { id: 'guida', testo: 'Guida e assistenza', icona: 'aiuto' },
  ];

  return (
    <Shell
      sessione={sessione}
      onSessioneAggiornata={setSessione}
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
      {pagina === 'controlli' && <Controlli vaiA={vaiA} ruolo={sessione.utente.ruolo} />}
      {pagina === 'sos' && <Sos />}
      {pagina === 'registro' && <Registro />}
      {pagina === 'impostazioni' && <Impostazioni sessione={sessione} onSessioneAggiornata={setSessione} />}
      {pagina === 'guida' && <Guida sessione={sessione} sezione={parametri.get('sezione')} />}
    </Shell>
  );
}

/**
 * Shell dell'app in stile Assist: sidebar bianca sticky su desktop,
 * cassetto off-canvas su mobile, blocco utente con «Esci» sempre in vista.
 * Pre-login parla il prodotto; qui compare lo studio, dal database.
 */
function Shell({ sessione, onSessioneAggiornata, voci, pagina, vaiA, children }: {
  sessione: Sessione;
  onSessioneAggiornata: (s: Sessione) => void;
  voci: Array<{ id: string; testo: string; icona: string }>;
  pagina: string;
  vaiA: (p: string) => void;
  children: React.ReactNode;
}) {
  const [menuAperto, setMenuAperto] = useState(false);
  const chiudiMenu = () => setMenuAperto(false);
  const fileAvatarRef = useRef<HTMLInputElement>(null);

  // Foto profilo caricabile anche dalla sidebar, come in Assist.
  const caricaAvatar = async (file: File) => {
    try {
      const dataUrl = await ridimensionaAvatar(file);
      await api.post('/auth/avatar', { avatar: dataUrl });
      onSessioneAggiornata({ ...sessione, utente: { ...sessione.utente, avatar: dataUrl } });
    } catch {
      /* l'errore dettagliato è gestito nella pagina Impostazioni */
    }
  };

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
          {sessione.studio.logo && (
            <img
              src={sessione.studio.logo}
              alt={`Logo ${sessione.studio.denominazione}`}
              className="mt-2 h-8 max-w-[180px] object-contain object-left"
            />
          )}
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
            <button
              type="button"
              onClick={() => fileAvatarRef.current?.click()}
              title="Carica o cambia la tua foto profilo"
              aria-label="Cambia foto profilo"
              className="rounded-full shrink-0 hover:ring-2 hover:ring-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-shadow"
            >
              <AvatarUtente nome={sessione.utente.nome} avatar={sessione.utente.avatar} size={40} />
            </button>
            <div className="min-w-0">
              <div className="font-semibold text-ink-800 truncate">{sessione.utente.nome}</div>
              <div className="text-xs text-ink-400 truncate capitalize">{sessione.utente.ruolo.toLowerCase()}</div>
            </div>
          </div>
          <input
            ref={fileAvatarRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) caricaAvatar(f); e.target.value = ''; }}
          />
          <button
            className="btn btn-secondary btn-sm w-full justify-center"
            onClick={async () => { await api.post('/auth/logout'); location.reload(); }}
          >
            Esci
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8">
        <div className="max-w-[1180px]">
          {/* Stato commerciale (AR-M6): il blocco vero è lato server; qui
              si spiega all'utente perché i salvataggi falliscono. */}
          {sessione.studio.stato === 'sospeso' && (
            <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">
              <strong>Servizio in sola lettura.</strong> Puoi consultare ed esportare i dati dello studio,
              ma non modificarli. Per riattivare le modifiche contatta Contify (anche dal modulo di assistenza).
            </div>
          )}
          {sessione.studio.stato === 'cessato' && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">
              <strong>Il servizio non è più attivo per questo studio.</strong> Contatta Contify
              (info@contify.it) per riattivarlo.
            </div>
          )}
          {children}
        </div>
      </main>

      {/* Chat di assistenza (AR-M10): compare solo con l'AI abilitata. */}
      <ChatAssistente />
    </div>
  );
}
