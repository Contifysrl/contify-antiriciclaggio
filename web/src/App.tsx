import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { aspettoLocale, impostaAspetto } from './lib/tema';
import { LogoContify } from './components/LayoutAuth';
import { Icona } from './components/icone';
import { AvatarUtente } from './components/ui';
import { ridimensionaAvatar } from './lib/avatar';
import { Accesso, CambioPasswordObbligatorio, PasswordDimenticata, ResetPassword, type SessioneApp } from './pagine/Accessi';
import { Autovalutazione, Cruscotto, Registro } from './pagine/Studio';
import { Clienti, DettaglioFascicolo, Fascicoli } from './pagine/Fascicoli';
import { DettaglioCliente } from './pagine/Cliente';
import { Contante, Scadenzario, Sos } from './pagine/Presidi';
import { Controlli } from './pagine/Controlli';
import { Completezza } from './pagine/Completezza';
import { Coda } from './pagine/Coda';
import { Normativa } from './pagine/Normativa';
import { Impostazioni } from './pagine/Impostazioni';
import { Backup } from './pagine/Backup';
import { Novita } from './pagine/Novita';
import { Guida } from './pagine/Guida';
import { Assistenza } from './pagine/Assistenza';
import { Console } from './pagine/Console';
import { VerificaRemota } from './pagine/VerificaRemota';
import { ChatAssistente } from './pagine/ChatAssistente';
import { TsRegistra } from './ts/Registra';
import { TsMieOre } from './ts/MieOre';
import { TsRegistrazioni } from './ts/Registrazioni';
import { TsClienti } from './ts/Clienti';
import { TsServizi } from './ts/Servizi';
import { NOME_MODULO, type Modulo, accedeAdAr, moduliDisponibili, pubblicaModuloCorrente, statoModulo, useModulo } from './lib/moduli';

type Sessione = SessioneApp;

/** Routing su hash: nessuna dipendenza da un router. Hash vuoto = pagina iniziale del modulo. */
function usaPercorso(): [string, (p: string) => void] {
  const [p, setP] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    const h = () => setP(window.location.hash.slice(1));
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return [p, (nuovo: string) => { window.location.hash = nuovo; }];
}

// TS-M0: ogni voce appartiene a un modulo o è comune ai due. Le pagine di
// dettaglio (cliente, fascicolo, registro) seguono la voce che le apre.
type ClasseVoce = Modulo | 'COMUNE';
const PAGINE_AR = new Set(['cruscotto', 'completezza', 'coda', 'autovalutazione', 'clienti', 'cliente', 'fascicoli', 'fascicolo', 'scadenzario', 'contante', 'controlli', 'sos', 'normativa']);
const PAGINE_TS = new Set(['ts-inizio', 'ts-registra', 'ts-mie-ore', 'ts-registrazioni', 'ts-clienti', 'ts-servizi']);
const PAGINA_INIZIALE: Record<Modulo, string> = { AR: 'cruscotto', TS: 'ts-registra' };
// TS-M1: le pagine del titolare Timesheet (chi amministra lo studio vi accede comunque).
const PAGINE_TS_TITOLARE = new Set(['ts-registrazioni', 'ts-clienti', 'ts-servizi']);

export default function App() {
  const [sessione, setSessione] = useState<Sessione | null>(null);
  const [caricando, setCaricando] = useState(true);
  const [percorso, vaiA] = usaPercorso();
  // TS-M0: i moduli che lo studio ha e a cui l'utente accede; il modulo
  // scelto nella barra laterale è ricordato nel browser.
  const disponibili = sessione ? moduliDisponibili(sessione) : [];
  const [modulo, cambiaModulo] = useModulo(disponibili);
  pubblicaModuloCorrente(modulo);

  useEffect(() => {
    api.get<Sessione>('/auth/io').then(setSessione).catch(() => setSessione(null)).finally(() => setCaricando(false));
  }, []);

  // Il tema del profilo segue l'utente su ogni dispositivo (AR-M12):
  // quello salvato sul server vince su quello locale.
  useEffect(() => {
    if (!sessione) return;
    const locale = aspettoLocale();
    impostaAspetto(sessione.utente.tema ?? locale.tema, sessione.utente.modoColore ?? locale.modo);
  }, [sessione?.utente.tema, sessione?.utente.modoColore, sessione !== null]);

  if (caricando) return <div className="caricamento" style={{ padding: 40 }}>Caricamento…</div>;

  const [paginaRichiesta, query] = percorso.split('?');
  const parametri = new URLSearchParams(query ?? '');
  const inizio = modulo ? PAGINA_INIZIALE[modulo] : 'impostazioni';
  // Senza il modulo di una pagina (studio che non lo ha, o utente che non vi
  // accede) si torna alla pagina iniziale del modulo scelto: il server
  // rifiuterebbe comunque ogni chiamata.
  let pagina = paginaRichiesta || inizio;
  if (pagina === 'ts-inizio') pagina = 'ts-registra'; // il vecchio hash di TS-M0 resta valido
  if ((PAGINE_AR.has(pagina) && !disponibili.includes('AR')) || (PAGINE_TS.has(pagina) && !disponibili.includes('TS'))) pagina = inizio;
  const titolareTs = !!sessione && (sessione.utente.amministratore === true || sessione.utente.tsRuolo === 'TITOLARE');
  if (PAGINE_TS_TITOLARE.has(pagina) && !titolareTs) pagina = inizio;

  // ── Rotte pubbliche (anche con sessione: il link del cliente vince) ──
  if (pagina === 'verifica') return <VerificaRemota token={parametri.get('token') ?? ''} />;
  // Console assistenza Contify (AR-M11): autenticazione propria, separata
  // dalla sessione dello studio. Non compare in nessun menu.
  if (pagina === 'console') return <Console apri={parametri.get('apri')} />;

  // ── Rotte pubbliche pre-login ────────────────────────────────
  if (!sessione) {
    if (pagina === 'password-dimenticata') return <PasswordDimenticata />;
    if (pagina === 'reset') return <ResetPassword token={parametri.get('token') ?? ''} />;
    return <Accesso onEntrato={(s) => { setSessione(s); vaiA(''); }} />;
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

  // AR-M15: alcune voci dipendono dal ruolo (chi firma), altre
  // dall'amministrazione dello studio (chi tiene la licenza e l'archivio).
  // TS-M0: ogni voce ha il suo modulo; si vede se lo studio ha il modulo,
  // l'utente vi accede ed è il modulo scelto; le voci comuni si vedono sempre.
  const voci: Array<{ id: string; testo: string; icona: string; modulo: ClasseVoce; ruoli?: string[]; soloAmministratore?: boolean; soloTitolareTs?: boolean }> = [
    { id: 'cruscotto', testo: 'Cruscotto', icona: 'dashboard', modulo: 'AR' },
    // AR-M19: «oggi ti mancano N cose» e le proposte del programma da rivedere.
    { id: 'completezza', testo: 'Da completare', icona: 'spunta', modulo: 'AR' },
    { id: 'coda', testo: 'Coda di revisione', icona: 'carica', modulo: 'AR' },
    { id: 'autovalutazione', testo: 'Autovalutazione studio', icona: 'grafico', modulo: 'AR' },
    { id: 'clienti', testo: 'Clienti', icona: 'edificio', modulo: 'AR' },
    { id: 'fascicoli', testo: 'Fascicoli', icona: 'elenco', modulo: 'AR' },
    { id: 'scadenzario', testo: 'Scadenzario', icona: 'orologio', modulo: 'AR' },
    { id: 'contante', testo: 'Limiti al contante', icona: 'mano', modulo: 'AR' },
    { id: 'controlli', testo: 'Controlli automatici', icona: 'cerca', modulo: 'AR' },
    { id: 'sos', testo: 'Segnalazioni', icona: 'avviso', modulo: 'AR', ruoli: ['TITOLARE'] },
    { id: 'normativa', testo: 'Normativa', icona: 'libro', modulo: 'AR' },
    // Contify Timesheet (TS-M1): il collaboratore ha una sola voce; le altre sono del titolare Timesheet.
    { id: 'ts-registra', testo: 'Registra', icona: 'orologio', modulo: 'TS' },
    { id: 'ts-registrazioni', testo: 'Registrazioni', icona: 'tabella', modulo: 'TS', soloTitolareTs: true },
    { id: 'ts-clienti', testo: 'Clienti', icona: 'edificio', modulo: 'TS', soloTitolareTs: true },
    { id: 'ts-servizi', testo: 'Servizi e tariffe', icona: 'etichetta', modulo: 'TS', soloTitolareTs: true },
    // Blocco di servizio, stesse voci e stesso ordine di Assist (AR-M11).
    { id: 'impostazioni', testo: 'Impostazioni', icona: 'ingranaggio', modulo: 'COMUNE' },
    { id: 'backup', testo: 'Backup', icona: 'database', modulo: 'COMUNE', soloAmministratore: true },
    // «Attività» è il registro: lo vede chi accede ad AR o amministra (regola di /api/audit*).
    { id: 'attivita', testo: 'Attività', icona: 'attivita', modulo: 'COMUNE' },
    { id: 'novita', testo: 'Novità', icona: 'campana', modulo: 'COMUNE' },
    { id: 'guida', testo: 'Guida', icona: 'aiuto', modulo: 'COMUNE' },
    { id: 'assistenza', testo: 'Assistenza', icona: 'salvagente', modulo: 'COMUNE' },
  ];
  const vedeAttivita = accedeAdAr(sessione);

  return (
    <Shell
      sessione={sessione}
      onSessioneAggiornata={setSessione}
      voci={voci.filter((v) =>
        (v.modulo === 'COMUNE' || v.modulo === modulo) &&
        (v.id !== 'attivita' || vedeAttivita) &&
        (!v.ruoli || v.ruoli.includes(sessione.utente.ruolo)) &&
        (!v.soloAmministratore || sessione.utente.amministratore === true) &&
        (!v.soloTitolareTs || titolareTs))}
      pagina={pagina}
      vaiA={vaiA}
      modulo={modulo}
      disponibili={disponibili}
      onCambiaModulo={(m) => { cambiaModulo(m); vaiA(PAGINA_INIZIALE[m]); }}
    >
      {pagina === 'cruscotto' && <Cruscotto vaiA={vaiA} />}
      {pagina === 'ts-registra' && <TsRegistra sessioneUtenteId={sessione.utente.id} vaiA={vaiA} />}
      {pagina === 'ts-mie-ore' && <TsMieOre giorno={parametri.get('giorno')} />}
      {pagina === 'ts-registrazioni' && titolareTs && <TsRegistrazioni />}
      {pagina === 'ts-clienti' && titolareTs && <TsClienti />}
      {pagina === 'ts-servizi' && titolareTs && <TsServizi />}
      {pagina === 'completezza' && <Completezza vaiA={vaiA} />}
      {pagina === 'coda' && <Coda vaiA={vaiA} />}
      {pagina === 'autovalutazione' && <Autovalutazione amministratore={sessione.utente.amministratore === true} />}
      {pagina === 'clienti' && <Clienti vaiA={vaiA} />}
      {pagina === 'cliente' && <DettaglioCliente id={parametri.get('id') ?? ''} ruolo={sessione.utente.ruolo} amministratore={sessione.utente.amministratore === true} vaiA={vaiA} />}
      {pagina === 'fascicoli' && <Fascicoli vaiA={vaiA} cliente={parametri.get('cliente')} />}
      {pagina === 'fascicolo' && <DettaglioFascicolo id={parametri.get('id') ?? ''} vaiA={vaiA} />}
      {pagina === 'scadenzario' && <Scadenzario vaiA={vaiA} />}
      {pagina === 'contante' && <Contante />}
      {pagina === 'controlli' && <Controlli vaiA={vaiA} ruolo={sessione.utente.ruolo} />}
      {pagina === 'sos' && <Sos />}
      {pagina === 'normativa' && <Normativa />}
      {/* «Attività» è il nuovo nome del registro; il vecchio hash resta valido. */}
      {(pagina === 'attivita' || pagina === 'registro') && vedeAttivita && <Registro />}
      {pagina === 'impostazioni' && <Impostazioni sessione={sessione} onSessioneAggiornata={setSessione} />}
      {pagina === 'backup' && sessione.utente.amministratore === true && <Backup />}
      {pagina === 'novita' && <Novita />}
      {pagina === 'guida' && <Guida sessione={sessione} sezione={parametri.get('sezione')} />}
      {pagina === 'assistenza' && <Assistenza sessione={sessione} apri={parametri.get('apri')} />}
    </Shell>
  );
}

/**
 * Shell dell'app in stile Assist: sidebar bianca sticky su desktop,
 * cassetto off-canvas su mobile, blocco utente con «Esci» sempre in vista.
 * Pre-login parla il prodotto; qui compare lo studio, dal database.
 */
function Shell({ sessione, onSessioneAggiornata, voci, pagina, vaiA, modulo, disponibili, onCambiaModulo, children }: {
  sessione: Sessione;
  onSessioneAggiornata: (s: Sessione) => void;
  voci: Array<{ id: string; testo: string; icona: string }>;
  pagina: string;
  vaiA: (p: string) => void;
  /** TS-M0: modulo scelto (null = l'utente non accede a nessun modulo), moduli disponibili, cambio. */
  modulo: Modulo | null;
  disponibili: Modulo[];
  onCambiaModulo: (m: Modulo) => void;
  children: React.ReactNode;
}) {
  const [menuAperto, setMenuAperto] = useState(false);
  const prodotto = modulo === 'TS' ? 'Timesheet' : 'AR';
  const accedeAr = disponibili.includes('AR');
  // Stato effettivo del modulo scelto: i riquadri di sospeso/cessato valgono per lui.
  const statoCorrente = modulo ? statoModulo(sessione, modulo) : sessione.studio.stato;
  const chiudiMenu = () => setMenuAperto(false);
  const fileAvatarRef = useRef<HTMLInputElement>(null);

  // ── Pallini sul menu (AR-M11, come Assist) ───────────────────
  // «Novità» non ancora viste e messaggi di assistenza non letti.
  const [nNovita, setNNovita] = useState(0);
  const [nAssistenza, setNAssistenza] = useState(0);
  const [nCoda, setNCoda] = useState(0);
  useEffect(() => {
    let vivo = true;
    const novita = () => {
      api.get<{ novita: Array<{ id: string }>; vista: string | null }>('/novita')
        .then((r) => { if (vivo) setNNovita(r.novita.filter((n) => !r.vista || n.id > r.vista!).length); })
        .catch(() => { /* pallino assente: nessun danno */ });
    };
    const assistenza = () => {
      api.get<{ n: number }>('/assistenza/non-letti')
        .then((r) => { if (vivo) setNAssistenza(r.n); })
        .catch(() => { /* idem */ });
    };
    // AR-M19: proposte in attesa nella coda di revisione.
    const coda = () => {
      api.get<{ n: number }>('/coda/conteggio')
        .then((r) => { if (vivo) setNCoda(r.n); })
        .catch(() => { /* idem */ });
    };
    novita();
    assistenza();
    if (accedeAr) coda();
    const timer = window.setInterval(assistenza, 60_000);
    window.addEventListener('novita-viste', novita);
    window.addEventListener('ticket-letti', assistenza);
    if (accedeAr) {
      window.addEventListener('coda-cambiata', coda);
      window.addEventListener('hashchange', coda);
    }
    return () => {
      vivo = false;
      window.clearInterval(timer);
      window.removeEventListener('novita-viste', novita);
      window.removeEventListener('ticket-letti', assistenza);
      window.removeEventListener('coda-cambiata', coda);
      window.removeEventListener('hashchange', coda);
    };
  }, [accedeAr]);
  const pallini: Record<string, number> = { novita: nNovita, assistenza: nAssistenza, coda: nCoda };

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
  const attiva = (id: string) =>
    pagina === id
    || (id === 'clienti' && pagina === 'cliente')
    || (id === 'fascicoli' && pagina === 'fascicolo')
    || (id === 'attivita' && pagina === 'registro')
    || (id === 'ts-registra' && pagina === 'ts-mie-ore');

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
        <LogoContify altezza={20} prodotto={prodotto} />
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
          <LogoContify altezza={24} prodotto={prodotto} />
          <div className="text-[11px] text-ink-400 font-medium mt-1">per {sessione.studio.denominazione}</div>
          {sessione.studio.logo && (
            <img
              src={sessione.studio.logo}
              alt={`Logo ${sessione.studio.denominazione}`}
              className="mt-3 h-8 max-w-[184px] object-contain object-left"
            />
          )}
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto flex flex-col">
          {/* TS-M0: chi ha entrambi i moduli sceglie qui; con uno solo
              l'interfaccia resta identica a prima. */}
          {disponibili.length > 1 && (
            <div className="flex gap-1 bg-ink-50 border border-ink-100 rounded-xl p-1 mb-2" role="group" aria-label="Modulo" data-test="selettore-moduli">
              {disponibili.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    modulo === m ? 'bg-teal-600 text-accento-on' : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800'
                  }`}
                  aria-pressed={modulo === m}
                  data-test={`modulo-${m}`}
                  onClick={() => { if (m !== modulo) { onCambiaModulo(m); chiudiMenu(); } }}
                >
                  {NOME_MODULO[m]}
                </button>
              ))}
            </div>
          )}
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
              {(pallini[v.id] ?? 0) > 0 && (
                <span
                  className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-teal-600 text-accento-on text-[11px] font-bold flex items-center justify-center"
                  aria-label={`${pallini[v.id]} da leggere`}
                >
                  {pallini[v.id]}
                </span>
              )}
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
              {/* AR-M15: «Titolare» era il ruolo di chi firma; negli studi
                  associati sono più d'uno e si chiamano professionisti.
                  L'amministrazione è un attributo a parte. */}
              <div className="text-xs text-ink-400 truncate">
                {sessione.utente.ruolo === 'TITOLARE' ? 'Professionista' : sessione.utente.ruolo.charAt(0) + sessione.utente.ruolo.slice(1).toLowerCase()}
                {sessione.utente.amministratore === true && ' · amministratore'}
              </div>
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
          {statoCorrente === 'sospeso' && (
            <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">
              <strong>Servizio in sola lettura.</strong> Puoi consultare ed esportare i dati dello studio,
              ma non modificarli. Per riattivare le modifiche contatta Contify (anche dal modulo di assistenza).
            </div>
          )}
          {statoCorrente === 'cessato' && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-3">
              <strong>Il servizio non è più attivo per questo studio.</strong> Contatta Contify
              (info@contify.it) per riattivarlo.
            </div>
          )}
          {modulo === null && (
            <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">
              <strong>Il tuo utente non accede a nessun modulo dello studio.</strong> Chiedi a chi amministra
              lo studio di abilitarti ad Antiriciclaggio o di assegnarti un ruolo Timesheet.
            </div>
          )}
          {children}
        </div>
      </main>

      {/* Chat di assistenza (AR-M10): compare solo con l'AI abilitata, ed è di AR. */}
      {modulo === 'AR' && <ChatAssistente />}
    </div>
  );
}
