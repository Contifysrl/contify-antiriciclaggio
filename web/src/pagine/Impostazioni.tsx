import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { AvatarUtente, Badge, ErrorBanner, HelpLink, Modal } from '../components/ui';
import { Icona } from '../components/icone';
import { ridimensionaAvatar, ridimensionaLogo } from '../lib/avatar';
import { PiedeLegale } from '../componenti';
import type { SessioneApp } from './Accessi';

// ── Impostazioni (AR-M3) ───────────────────────────────────────
// Profilo (foto), cambio password, e — solo per il titolare — la
// gestione degli utenti dello studio, sul modello di Assist.

const ETICHETTA_RUOLO: Record<string, string> = {
  TITOLARE: 'Titolare',
  COLLABORATORE: 'Collaboratore',
  LETTORE: 'Lettore',
  REVISORE: 'Revisore',
};

const DESCRIZIONE_RUOLO: Record<string, string> = {
  TITOLARE: 'Firma valutazioni e autovalutazioni, accede alle segnalazioni (art. 38), gestisce gli utenti.',
  COLLABORATORE: 'Inserisce e istruisce fascicoli e clienti; non firma e non vede le segnalazioni.',
  LETTORE: 'Sola lettura, senza accesso alle segnalazioni.',
  REVISORE: 'Funzione di revisione indipendente ex art. 16 co. 2 lett. b).',
};

interface UtenteRiga {
  id: string;
  email: string;
  nome: string;
  ruolo: string;
  attivo: boolean;
  cambioPasswordRichiesto: boolean;
  ultimoAccesso: string | null;
}

function dataIt(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function Impostazioni({ sessione, onSessioneAggiornata }: {
  sessione: SessioneApp;
  onSessioneAggiornata: (s: SessioneApp) => void;
}) {
  return (
    <>
      <h1>Impostazioni <HelpLink sezione="impostazioni" /></h1>
      <p className="occhiello">Il tuo profilo, la password e — per il titolare — gli utenti dello studio.</p>
      <Profilo sessione={sessione} onSessioneAggiornata={onSessioneAggiornata} />
      {sessione.utente.ruolo === 'TITOLARE' && <LogoStudio sessione={sessione} onSessioneAggiornata={onSessioneAggiornata} />}
      <CambiaPassword />
      {sessione.utente.ruolo === 'TITOLARE' && <GestioneUtenti ioId={sessione.utente.id} />}
      {sessione.utente.ruolo === 'TITOLARE' && <AssistenteAi />}
      <PiedeLegale />
    </>
  );
}

// ── Profilo: foto ──────────────────────────────────────────────
function Profilo({ sessione, onSessioneAggiornata }: {
  sessione: SessioneApp;
  onSessioneAggiornata: (s: SessioneApp) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [errore, setErrore] = useState('');

  const carica = async (file: File) => {
    setErrore('');
    try {
      const dataUrl = await ridimensionaAvatar(file);
      await api.post('/auth/avatar', { avatar: dataUrl });
      onSessioneAggiornata({ ...sessione, utente: { ...sessione.utente, avatar: dataUrl } });
    } catch (e) {
      setErrore((e as Error).message);
    }
  };

  const rimuovi = async () => {
    setErrore('');
    try {
      await api.post('/auth/avatar', { avatar: null });
      onSessioneAggiornata({ ...sessione, utente: { ...sessione.utente, avatar: null } });
    } catch (e) {
      setErrore((e as Error).message);
    }
  };

  return (
    <div className="scheda">
      <h3 className="!mt-0">Il tuo profilo</h3>
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      <div className="flex items-center gap-4">
        <AvatarUtente nome={sessione.utente.nome} avatar={sessione.utente.avatar} size={56} />
        <div className="min-w-0">
          <div className="font-semibold text-ink-800">{sessione.utente.nome}</div>
          <div className="text-xs text-ink-400">{sessione.utente.email} · {ETICHETTA_RUOLO[sessione.utente.ruolo] ?? sessione.utente.ruolo}</div>
          <div className="flex gap-2 mt-2">
            <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
              {sessione.utente.avatar ? 'Cambia foto' : 'Carica una foto'}
            </button>
            {sessione.utente.avatar && (
              <button className="btn btn-ghost btn-sm" onClick={rimuovi}>Rimuovi</button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) carica(f); e.target.value = ''; }}
      />
    </div>
  );
}

// ── Logo dello studio (AR-M6, solo titolare) ───────────────────
function LogoStudio({ sessione, onSessioneAggiornata }: {
  sessione: SessioneApp;
  onSessioneAggiornata: (s: SessioneApp) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const carica = async (file: File) => {
    setErrore('');
    setInvio(true);
    try {
      const { dataUrl, larghezza, altezza } = await ridimensionaLogo(file);
      await api.post('/studio/logo', { logo: dataUrl, larghezza, altezza });
      onSessioneAggiornata({ ...sessione, studio: { ...sessione.studio, logo: dataUrl } });
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setInvio(false);
    }
  };

  const rimuovi = async () => {
    setErrore('');
    try {
      await api.post('/studio/logo', { logo: null });
      onSessioneAggiornata({ ...sessione, studio: { ...sessione.studio, logo: null } });
    } catch (e) {
      setErrore((e as Error).message);
    }
  };

  return (
    <div className="scheda">
      <h3 className="!mt-0">Il tuo studio</h3>
      <div className="aiuto">
        Il logo compare nella barra laterale e nell’intestazione dei verbali, accanto al logo
        Contify. Meglio un PNG con sfondo trasparente; viene ridotto automaticamente.
      </div>
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      <div className="flex items-center gap-4">
        {sessione.studio.logo ? (
          <img src={sessione.studio.logo} alt={`Logo ${sessione.studio.denominazione}`} className="h-12 max-w-[220px] object-contain rounded bg-ink-50 border border-ink-100 px-2 py-1" />
        ) : (
          <div className="h-12 w-40 rounded bg-ink-50 border border-dashed border-ink-200 flex items-center justify-center text-xs text-ink-400">
            Nessun logo
          </div>
        )}
        <div className="min-w-0">
          <div className="font-semibold text-ink-800">{sessione.studio.denominazione}</div>
          <div className="flex gap-2 mt-2">
            <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={invio}>
              {invio ? 'Caricamento…' : sessione.studio.logo ? 'Cambia logo' : 'Carica il logo'}
            </button>
            {sessione.studio.logo && (
              <button className="btn btn-ghost btn-sm" onClick={rimuovi}>Rimuovi</button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) carica(f); e.target.value = ''; }}
      />
    </div>
  );
}

// ── Cambio password volontario ─────────────────────────────────
function CambiaPassword() {
  const [attuale, setAttuale] = useState('');
  const [nuova, setNuova] = useState('');
  const [conferma, setConferma] = useState('');
  const [esito, setEsito] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    setEsito('');
    if (nuova !== conferma) {
      setErrore('Le due password non coincidono');
      return;
    }
    setInvio(true);
    try {
      const r = await api.post<{ altreSessioniChiuse: number }>('/auth/cambia-password', { attuale, nuova });
      setEsito(
        r.altreSessioniChiuse > 0
          ? `Password aggiornata. Per sicurezza ${r.altreSessioniChiuse === 1 ? 'un’altra sessione aperta è stata chiusa' : `altre ${r.altreSessioniChiuse} sessioni aperte sono state chiuse`}.`
          : 'Password aggiornata.',
      );
      setAttuale(''); setNuova(''); setConferma('');
    } catch (err) {
      setErrore((err as Error).message);
    } finally {
      setInvio(false);
    }
  };

  return (
    <div className="scheda">
      <h3 className="!mt-0">Cambia password</h3>
      {esito && <div className="riquadro info !my-2">{esito}</div>}
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Password attuale</label>
          <input className="input" type="password" value={attuale} onChange={(e) => setAttuale(e.target.value)} required autoComplete="current-password" />
        </div>
        <div>
          <label className="label">Nuova password</label>
          <input className="input" type="password" value={nuova} onChange={(e) => setNuova(e.target.value)} placeholder="Almeno 8 caratteri" required autoComplete="new-password" />
        </div>
        <div>
          <label className="label">Ripeti la nuova</label>
          <input className="input" type="password" value={conferma} onChange={(e) => setConferma(e.target.value)} required autoComplete="new-password" />
        </div>
        <div className="sm:col-span-3">
          <button className="btn btn-primary" disabled={invio}>{invio ? 'Salvataggio…' : 'Aggiorna la password'}</button>
        </div>
      </form>
    </div>
  );
}

// ── Gestione utenti (solo titolare) ────────────────────────────
function GestioneUtenti({ ioId }: { ioId: string }) {
  const [utenti, setUtenti] = useState<UtenteRiga[]>([]);
  const [errore, setErrore] = useState('');
  const [nuovo, setNuovo] = useState(false);
  const [modifica, setModifica] = useState<UtenteRiga | null>(null);
  const [credenziali, setCredenziali] = useState<{ email: string; password: string; emailInviata: boolean } | null>(null);

  const carica = () => api.get<UtenteRiga[]>('/utenti').then(setUtenti).catch((e) => setErrore(e.message));
  useEffect(() => { carica(); }, []);

  return (
    <div className="scheda">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="!m-0">Utenti dello studio</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setNuovo(true)}>
          <Icona nome="piu" size={14} /> Nuovo utente
        </button>
      </div>
      <div className="aiuto">
        Il titolare firma e accede alle segnalazioni; collaboratore, lettore e revisore hanno accessi ridotti.
        Lo studio deve avere sempre almeno un titolare attivo.
      </div>
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      <table>
        <thead>
          <tr><th>Nome</th><th>Email</th><th>Ruolo</th><th>Stato</th><th>Ultimo accesso</th><th /></tr>
        </thead>
        <tbody>
          {utenti.map((u) => (
            <tr key={u.id}>
              <td className="font-semibold">{u.nome}{u.id === ioId && <span className="text-ink-400 font-normal"> (tu)</span>}</td>
              <td>{u.email}</td>
              <td><Badge tone={u.ruolo === 'TITOLARE' ? 'teal' : 'gray'}>{ETICHETTA_RUOLO[u.ruolo] ?? u.ruolo}</Badge></td>
              <td>
                {u.attivo
                  ? u.cambioPasswordRichiesto
                    ? <Badge tone="amber">primo accesso da fare</Badge>
                    : <Badge tone="teal">attivo</Badge>
                  : <Badge tone="red">disattivato</Badge>}
              </td>
              <td>{dataIt(u.ultimoAccesso)}</td>
              <td className="text-right">
                <button className="btn btn-ghost btn-sm" onClick={() => setModifica(u)}>Gestisci</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {nuovo && (
        <NuovoUtente
          onChiudi={() => setNuovo(false)}
          onCreato={(cred) => { setNuovo(false); setCredenziali(cred); carica(); }}
        />
      )}
      {modifica && (
        <ModificaUtente
          utente={modifica}
          io={modifica.id === ioId}
          onChiudi={() => setModifica(null)}
          onSalvato={() => { setModifica(null); carica(); }}
          onReset={(cred) => { setModifica(null); setCredenziali(cred); carica(); }}
        />
      )}
      {credenziali && (
        <Modal title="Credenziali di primo accesso" onClose={() => setCredenziali(null)}>
          <div className="space-y-3 text-sm">
            <p>
              {credenziali.emailInviata
                ? 'Le credenziali sono state inviate via email. Le trovi anche qui, per comunicarle a voce se serve:'
                : 'L’email non è partita (invio non configurato o non riuscito): comunica queste credenziali di persona.'}
            </p>
            <div className="rounded-lg bg-ink-50 border border-ink-100 px-4 py-3 font-mono text-[13px]">
              <div>Email: <strong>{credenziali.email}</strong></div>
              <div>Password temporanea: <strong>{credenziali.password}</strong></div>
            </div>
            <div className="riquadro avviso !my-0">
              Questa password compare <strong>solo adesso</strong>: non è salvata da nessuna parte e non potrà
              essere recuperata. Al primo accesso verrà chiesto di sostituirla.
            </div>
            <div className="text-right">
              <button className="btn btn-primary" onClick={() => setCredenziali(null)}>Ho preso nota</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Assistente AI (AR-M9, solo titolare) ───────────────────────
function AssistenteAi() {
  const [stato, setStato] = useState<{ abilitata: boolean; chiaveConfigurata: boolean; modello: string } | null>(null);
  const [accetto, setAccetto] = useState(false);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const carica = () => api.get<any>('/ai/stato').then(setStato).catch((e) => setErrore(e.message));
  useEffect(() => { carica(); }, []);

  const imposta = async (abilita: boolean) => {
    setErrore('');
    setInvio(true);
    try {
      await api.post('/ai/abilita', abilita ? { abilita: true, accetto: true } : { abilita: false });
      setAccetto(false);
      carica();
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setInvio(false);
    }
  };

  return (
    <div className="scheda">
      <h3 className="!mt-0">Assistente AI</h3>
      <div className="aiuto">
        Suggerisce gli indicatori di anomalia UIF pertinenti a partire dalla descrizione
        dell’operatività e prepara bozze dei campi discorsivi (scopo/natura, motivazione
        dell’astensione). Sono <strong>suggerimenti da rivedere</strong>: ogni valutazione resta
        del professionista.
      </div>
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      {stato && !stato.chiaveConfigurata && (
        <div className="riquadro avviso !my-2">
          Il servizio non è ancora attivo lato Contify (chiave API non configurata): l’abilitazione
          resta possibile ma le funzioni daranno errore finché l’attivazione non è completata.
        </div>
      )}
      {stato?.abilitata ? (
        <>
          <p className="text-sm">
            <Badge tone="teal">abilitato</Badge>{' '}
            <span className="text-ink-500">I testi digitati (senza nominativi) vengono elaborati dal modello {stato.modello} via API Anthropic; nel registro resta solo l’uso della funzione.</span>
          </p>
          <button className="btn btn-secondary btn-sm" onClick={() => imposta(false)} disabled={invio}>Disabilita</button>
        </>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="rounded-lg bg-ink-50 border border-ink-100 px-4 py-3 space-y-1">
            <div className="font-semibold text-ink-800">Informativa per l’abilitazione</div>
            <ul className="list-disc ml-5 text-ink-600 space-y-1">
              <li>I testi digitati nelle funzioni AI vengono inviati all’API Anthropic (Claude) per la sola elaborazione, senza conservazione né addestramento sui dati.</li>
              <li>L’interfaccia richiede di <strong>non inserire mai nominativi</strong>, codici fiscali o altri dati identificativi: descrivere i fatti, non le persone.</li>
              <li>I dati dell’archivio inviati automaticamente sono solo non identificativi (tipo di prestazione, natura del cliente, attività).</li>
              <li>Nel registro delle attività resta traccia dell’uso della funzione, mai del contenuto.</li>
            </ul>
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" className="!w-4 mt-0.5" checked={accetto} onChange={(e) => setAccetto(e.target.checked)} />
            <span>Ho letto l’informativa e abilito l’assistente AI per lo studio.</span>
          </label>
          <button className="btn btn-primary btn-sm" onClick={() => imposta(true)} disabled={!accetto || invio}>
            {invio ? 'Attivazione…' : 'Abilita l’assistente'}
          </button>
        </div>
      )}
    </div>
  );
}

function NuovoUtente({ onChiudi, onCreato }: {
  onChiudi: () => void;
  onCreato: (cred: { email: string; password: string; emailInviata: boolean }) => void;
}) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [ruolo, setRuolo] = useState('COLLABORATORE');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      const r = await api.post<{ passwordTemporanea: string; emailInviata: boolean }>('/utenti', { nome, email, ruolo });
      onCreato({ email: email.toLowerCase().trim(), password: r.passwordTemporanea, emailInviata: r.emailInviata });
    } catch (err) {
      setErrore((err as Error).message);
      setInvio(false);
    }
  };

  return (
    <Modal title="Nuovo utente" onClose={onChiudi}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Nome e cognome</label>
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus required />
        </div>
        <div>
          <label className="label">Email (sarà il nome utente)</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label">Ruolo</label>
          <select className="input" value={ruolo} onChange={(e) => setRuolo(e.target.value)}>
            {Object.entries(ETICHETTA_RUOLO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="aiuto mt-1">{DESCRIZIONE_RUOLO[ruolo]}</div>
        </div>
        {errore && <div className="errore">{errore}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-secondary" onClick={onChiudi}>Annulla</button>
          <button className="btn btn-primary" disabled={invio}>{invio ? 'Creazione…' : 'Crea l’utente'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ModificaUtente({ utente, io, onChiudi, onSalvato, onReset }: {
  utente: UtenteRiga;
  io: boolean;
  onChiudi: () => void;
  onSalvato: () => void;
  onReset: (cred: { email: string; password: string; emailInviata: boolean }) => void;
}) {
  const [nome, setNome] = useState(utente.nome);
  const [ruolo, setRuolo] = useState(utente.ruolo);
  const [attivo, setAttivo] = useState(utente.attivo);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const salva = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      await api.post(`/utenti/${utente.id}`, { nome, ruolo, attivo });
      onSalvato();
    } catch (err) {
      setErrore((err as Error).message);
      setInvio(false);
    }
  };

  const reset = async () => {
    setErrore('');
    setInvio(true);
    try {
      const r = await api.post<{ passwordTemporanea: string; emailInviata: boolean }>(`/utenti/${utente.id}/reset-password`);
      onReset({ email: utente.email, password: r.passwordTemporanea, emailInviata: r.emailInviata });
    } catch (err) {
      setErrore((err as Error).message);
      setInvio(false);
    }
  };

  return (
    <Modal title={`Gestisci ${utente.nome}`} onClose={onChiudi}>
      <form onSubmit={salva} className="space-y-3">
        <div className="text-xs text-ink-400">{utente.email}</div>
        <div>
          <label className="label">Nome e cognome</label>
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </div>
        <div>
          <label className="label">Ruolo</label>
          <select className="input" value={ruolo} onChange={(e) => setRuolo(e.target.value)}>
            {Object.entries(ETICHETTA_RUOLO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="aiuto mt-1">{DESCRIZIONE_RUOLO[ruolo]}</div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" className="!w-4" checked={attivo} onChange={(e) => setAttivo(e.target.checked)} />
          <span className="text-sm">Account attivo</span>
        </label>
        {io && <div className="aiuto">Stai modificando il tuo stesso account: non puoi lasciare lo studio senza un titolare attivo.</div>}
        {errore && <div className="errore">{errore}</div>}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={reset}
            disabled={invio}
            title="Genera una nuova password temporanea e chiude le sessioni aperte dell'utente"
          >
            Reimposta la password
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={onChiudi}>Annulla</button>
            <button className="btn btn-primary" disabled={invio}>{invio ? 'Salvataggio…' : 'Salva'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
