import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { AvatarUtente, Badge, ErrorBanner, HelpLink, Modal } from '../components/ui';
import { Icona } from '../components/icone';
import { ridimensionaAvatar, ridimensionaLogo } from '../lib/avatar';
import { MODI, TEMI, aspettoLocale, impostaAspetto, modoValido, temaValido } from '../lib/tema';
import { PiedeLegale } from '../componenti';
import type { SessioneApp } from './Accessi';

// ── Impostazioni (AR-M3) ───────────────────────────────────────
// Profilo (foto), cambio password, e — solo per il titolare — la
// gestione degli utenti dello studio, sul modello di Assist.

// AR-M15. «Titolare» diventa «Professionista»: in uno studio associato i
// professionisti sono più d'uno e ciascuno identifica e firma per i propri
// clienti. Chi amministra lo studio è un flag a parte, non un ruolo.
const ETICHETTA_RUOLO: Record<string, string> = {
  TITOLARE: 'Professionista',
  COLLABORATORE: 'Collaboratore',
  LETTORE: 'Lettore',
  REVISORE: 'Revisore',
};

const DESCRIZIONE_RUOLO: Record<string, string> = {
  TITOLARE: 'Identifica i clienti, firma valutazioni e autovalutazione, accede alle segnalazioni (art. 38).',
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
  amministratore: boolean;
  cambioPasswordRichiesto: boolean;
  ultimoAccesso: string | null;
  codiceFiscale?: string | null;
  ordine?: string | null;
  numeroIscrizione?: string | null;
  qualifica?: string | null;
}

/** Campi d'albo, condivisi da creazione e modifica del professionista. */
function CampiAlbo({ valori, onChange }: {
  valori: { qualifica: string; ordine: string; numeroIscrizione: string; codiceFiscale: string };
  onChange: (v: { qualifica: string; ordine: string; numeroIscrizione: string; codiceFiscale: string }) => void;
}) {
  const campo = (k: keyof typeof valori, etichetta: string, placeholder?: string) => (
    <div>
      <label className="label">{etichetta}</label>
      <input
        className="input"
        value={valori[k]}
        placeholder={placeholder}
        onChange={(e) => onChange({ ...valori, [k]: e.target.value })}
      />
    </div>
  );
  return (
    <div className="rounded-lg border border-ink-100 p-3 space-y-3">
      <div className="text-sm font-semibold">Dati d’albo</div>
      <div className="aiuto">
        Compaiono nell’intestazione dei verbali e nella scheda di adeguata verifica: davanti a un’ispezione
        l’atto deve dire quale professionista ha identificato il cliente.
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {campo('qualifica', 'Qualifica', 'Dott. · Rag. · Avv.')}
        {campo('ordine', 'ODCEC di', 'Milano')}
        {campo('numeroIscrizione', 'Numero di iscrizione')}
        {campo('codiceFiscale', 'Codice fiscale')}
      </div>
    </div>
  );
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
  // AR-M15: amministrare lo studio non è più un attributo del ruolo.
  const amministratore = sessione.utente.amministratore === true;
  return (
    <>
      <h1>Impostazioni <HelpLink sezione="impostazioni" /></h1>
      <p className="occhiello">
        Aspetto, password e dispositivi collegati; per chi amministra lo studio anche utenti, logo,
        assistente AI e zona di sicurezza.
      </p>
      {amministratore && <LogoStudio sessione={sessione} onSessioneAggiornata={onSessioneAggiornata} />}
      {amministratore && <GestioneUtenti ioId={sessione.utente.id} />}
      {amministratore && <AssistenteAi />}
      <CambiaPassword />
      <AccessiDispositivi />
      <div className="grid gap-4 lg:grid-cols-3 my-4">
        <div className="lg:col-span-2"><AspettoInterfaccia sessione={sessione} onSessioneAggiornata={onSessioneAggiornata} /></div>
        <div><Profilo sessione={sessione} onSessioneAggiornata={onSessioneAggiornata} /></div>
      </div>
      {amministratore && <ZonaSicurezza />}
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
          <div className="aiuto mt-2">Cambiando la password gli accessi aperti su altri dispositivi vengono chiusi.</div>
        </div>
      </form>
    </div>
  );
}

// ── Accessi e dispositivi (AR-M12) ─────────────────────────────

interface AccessoRiga {
  rif: string;
  dispositivo: string;
  accessoIl: string;
  ultimoUtilizzo: string;
  scadeIl: string;
  ricordami: boolean;
  corrente: boolean;
}

/** Le date di D1 sono UTC, con o senza suffisso: normalizza e mostra locale. */
function dataOraSessione(iso: string): string {
  let x = iso.includes('T') ? iso : iso.replace(' ', 'T');
  if (!/Z$|[+-]\d\d:?\d\d$/.test(x)) x += 'Z';
  const d = new Date(x);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ', ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function AccessiDispositivi() {
  const [sessioni, setSessioni] = useState<AccessoRiga[] | null>(null);
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);

  const carica = () => {
    api.get<{ sessioni: AccessoRiga[] }>('/auth/sessioni')
      .then((r) => setSessioni(r.sessioni))
      .catch((e) => { setErrore((e as Error).message); setSessioni([]); });
  };
  useEffect(() => { carica(); }, []);

  const chiudiAltre = async () => {
    setErrore('');
    setInCorso(true);
    try {
      await api.post('/auth/sessioni/chiudi-altre');
      carica();
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setInCorso(false);
    }
  };

  const chiudiUna = async (rif: string) => {
    setErrore('');
    try {
      const r = await api.post<{ eraCorrente: boolean }>(`/auth/sessioni/${rif}/chiudi`);
      if (r.eraCorrente) { location.reload(); return; }
      carica();
    } catch (e) {
      setErrore((e as Error).message);
    }
  };

  const altre = (sessioni ?? []).filter((s) => !s.corrente).length;

  return (
    <div className="scheda">
      <h3 className="!mt-0">Accessi</h3>
      <div className="aiuto">
        I dispositivi da cui risulti collegato. Un accesso si chiude da solo dopo un periodo di
        inattività: 8 ore, oppure 7 giorni se al momento dell’ingresso hai spuntato «Resta
        collegato su questo computer». Se non riconosci un dispositivo, chiudilo e cambia la password.
      </div>
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      {sessioni === null ? (
        <div className="text-sm text-ink-400 py-2">Caricamento…</div>
      ) : (
        <div className="divide-y divide-ink-100">
          {sessioni.map((s) => (
            <div key={s.rif} className="py-3 flex items-start gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-ink-800 text-sm">{s.dispositivo}</span>
                  {s.corrente && <Badge tone="teal">Questo dispositivo</Badge>}
                  {s.ricordami && <Badge tone="gray">Resta collegato</Badge>}
                </div>
                <div className="text-xs text-ink-400 mt-0.5">
                  Ultimo utilizzo {dataOraSessione(s.ultimoUtilizzo)} · accesso del {dataOraSessione(s.accessoIl)} · scade il {dataOraSessione(s.scadeIl)}
                </div>
              </div>
              {!s.corrente && (
                <button className="btn btn-ghost btn-sm shrink-0" onClick={() => chiudiUna(s.rif)}>Chiudi</button>
              )}
            </div>
          ))}
        </div>
      )}
      {altre > 0 && (
        <button className="btn btn-secondary btn-sm mt-2" onClick={chiudiAltre} disabled={inCorso}>
          {inCorso ? 'Chiusura…' : 'Esci da tutti gli altri dispositivi'}
        </button>
      )}
    </div>
  );
}

// ── Aspetto dell'interfaccia (AR-M12) ──────────────────────────

function AspettoInterfaccia({ sessione, onSessioneAggiornata }: {
  sessione: SessioneApp;
  onSessioneAggiornata: (s: SessioneApp) => void;
}) {
  const locale = aspettoLocale();
  const tema = (temaValido(sessione.utente.tema) ? sessione.utente.tema : locale.tema) as string;
  const modo = (modoValido(sessione.utente.modoColore) ? sessione.utente.modoColore : locale.modo) as string;
  const [errore, setErrore] = useState('');

  const cambiaTema = async (nome: string) => {
    setErrore('');
    impostaAspetto(nome, modo);
    onSessioneAggiornata({ ...sessione, utente: { ...sessione.utente, tema: nome } });
    try { await api.post('/auth/tema', { tema: nome }); } catch (e) { setErrore((e as Error).message); }
  };
  const cambiaModo = async (nome: string) => {
    setErrore('');
    impostaAspetto(tema, nome);
    onSessioneAggiornata({ ...sessione, utente: { ...sessione.utente, modoColore: nome } });
    try { await api.post('/auth/modo', { modo: nome }); } catch (e) { setErrore((e as Error).message); }
  };

  return (
    <div className="scheda !my-0 h-full">
      <h3 className="!mt-0">Aspetto dell’interfaccia</h3>
      <div className="aiuto">
        La scelta vale solo per te, su qualsiasi computer usi per entrare. Cambiano i colori di
        pulsanti, collegamenti e grafici; i rossi delle eliminazioni e gli avvisi restano
        riconoscibili come sono.
      </div>
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}

      <div className="label mt-3">Chiaro o notturna</div>
      <div className="grid gap-2 sm:grid-cols-3">
        {MODI.map((m) => (
          <button
            key={m.nome}
            type="button"
            onClick={() => cambiaModo(m.nome)}
            aria-pressed={modo === m.nome}
            className={`text-left rounded-lg border px-3.5 py-2.5 transition-colors ${
              modo === m.nome ? 'border-teal-400 bg-teal-600/5 ring-1 ring-teal-400' : 'border-ink-200 hover:border-ink-300'
            }`}
          >
            <div className="text-sm font-semibold text-ink-800">{modo === m.nome ? '✓ ' : ''}{m.etichetta}</div>
            <div className="text-xs text-ink-400">{m.descrizione}</div>
          </button>
        ))}
      </div>

      <div className="label mt-4">Colore</div>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        {TEMI.map((t) => (
          <button
            key={t.nome}
            type="button"
            onClick={() => cambiaTema(t.nome)}
            aria-pressed={tema === t.nome}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
              tema === t.nome ? 'border-ink-400 bg-ink-100' : 'border-ink-200 hover:border-ink-300'
            }`}
          >
            <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: t.campione }} aria-hidden="true" />
            <span className="text-sm font-semibold text-ink-800 truncate">{t.etichetta}</span>
          </button>
        ))}
      </div>
      <div className="aiuto mt-3">
        Contify è il colore predefinito del programma. Ogni tonalità è scelta perché la scritta
        sui pulsanti resti leggibile: è il motivo per cui i colori caldi sono più profondi di
        come li si immagina, e per cui il Giallo porta la scritta scura. In modalità notturna
        ogni colore ha una seconda versione, più chiara, per staccarsi dal fondo.
      </div>
    </div>
  );
}

// ── Zona di sicurezza (AR-M12): eliminazione dell'archivio ─────

function ZonaSicurezza() {
  const [aperto, setAperto] = useState(false);
  return (
    <div className="scheda border !border-red-200">
      <h3 className="!mt-0 flex items-center gap-2 text-red-700">
        <Icona nome="avviso" size={17} />
        <span>Zona di sicurezza</span>
      </h3>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="aiuto !mt-0 max-w-2xl">
          <strong>Elimina Archivio</strong> cancella definitivamente tutti i dati operativi dello
          studio: clienti, fascicoli, valutazioni, documenti, operazioni, segnalazioni,
          astensioni, formazione e autovalutazioni. Restano utenti, impostazioni e registro
          delle attività. Prima della cancellazione viene creato automaticamente un backup.
          Utile per svuotare i dati di prova prima di caricare quelli reali.
        </div>
        <button className="btn bg-red-600 text-white hover:bg-red-700 shrink-0" onClick={() => setAperto(true)}>
          Elimina Archivio
        </button>
      </div>
      {aperto && <EliminaArchivioModal onChiudi={() => setAperto(false)} />}
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
        Il professionista identifica i clienti, firma e accede alle segnalazioni; collaboratore, lettore e
        revisore hanno accessi ridotti. In uno studio associato i professionisti sono più d’uno: ciascuno
        segue i propri clienti. L’amministratore è chi gestisce utenti, licenza, backup e archivio — non
        serve che lo siano tutti. Lo studio deve avere sempre almeno un professionista e un amministratore attivi.
      </div>
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      <table>
        <thead>
          <tr><th>Nome</th><th>Email</th><th>Ruolo</th><th>Studio</th><th>Stato</th><th>Ultimo accesso</th><th /></tr>
        </thead>
        <tbody>
          {utenti.map((u) => (
            <tr key={u.id}>
              <td className="font-semibold">{u.nome}{u.id === ioId && <span className="text-ink-400 font-normal"> (tu)</span>}</td>
              <td>{u.email}</td>
              <td><Badge tone={u.ruolo === 'TITOLARE' ? 'teal' : 'gray'}>{ETICHETTA_RUOLO[u.ruolo] ?? u.ruolo}</Badge></td>
              <td>{u.amministratore ? <Badge tone="amber">amministratore</Badge> : <span className="text-ink-400">—</span>}</td>
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
  const [amministratore, setAmministratore] = useState(false);
  const [albo, setAlbo] = useState({ qualifica: '', ordine: '', numeroIscrizione: '', codiceFiscale: '' });
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      const r = await api.post<{ passwordTemporanea: string; emailInviata: boolean }>('/utenti', {
        nome, email, ruolo, amministratore: ruolo === 'TITOLARE' && amministratore, ...albo,
      });
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
        {ruolo === 'TITOLARE' && (
          <>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" className="!w-4" checked={amministratore} onChange={(e) => setAmministratore(e.target.checked)} />
              <span className="text-sm">Amministra lo studio (utenti, licenza, backup, archivio)</span>
            </label>
            <CampiAlbo valori={albo} onChange={setAlbo} />
          </>
        )}
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
  const [amministratore, setAmministratore] = useState(utente.amministratore);
  const [albo, setAlbo] = useState({
    qualifica: utente.qualifica ?? '',
    ordine: utente.ordine ?? '',
    numeroIscrizione: utente.numeroIscrizione ?? '',
    codiceFiscale: utente.codiceFiscale ?? '',
  });
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);

  const salva = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      await api.post(`/utenti/${utente.id}`, {
        nome, ruolo, attivo, amministratore: ruolo === 'TITOLARE' && attivo && amministratore, ...albo,
      });
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
        {ruolo === 'TITOLARE' && attivo && (
          <>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" className="!w-4" checked={amministratore} onChange={(e) => setAmministratore(e.target.checked)} />
              <span className="text-sm">Amministra lo studio (utenti, licenza, backup, archivio)</span>
            </label>
            <CampiAlbo valori={albo} onChange={setAlbo} />
          </>
        )}
        {io && <div className="aiuto">Stai modificando il tuo stesso account: non puoi lasciare lo studio senza un professionista né senza un amministratore attivo.</div>}
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

// ── Eliminazione dell'archivio (nata in AR-M4, qui dalla Zona di sicurezza) ──

function EliminaArchivioModal({ onChiudi }: { onChiudi: () => void }) {
  const [passo, setPasso] = useState(1);
  const [parola, setParola] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [fatto, setFatto] = useState<{ totale: number } | null>(null);

  const elimina = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      const r = await api.post<{ totale: number }>('/backup/elimina-archivio', { conferma: parola.trim().toUpperCase() });
      setFatto(r);
    } catch (err) {
      setErrore((err as Error).message);
      setInvio(false);
    }
  };

  if (fatto) {
    return (
      <Modal title="Archivio eliminato" onClose={() => window.location.reload()}>
        <div className="space-y-3 text-sm">
          <div className="riquadro info !my-0">
            Archivio svuotato: <strong>{fatto.totale} righe</strong> rimosse.
          </div>
          <p>
            La fotografia di sicurezza («pre-eliminazione») è nella lista dei backup: da lì
            l’archivio resta interamente recuperabile con un ripristino.
          </p>
          <div className="text-right">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Ricarica l’applicazione</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Elimina l’archivio — passo ${passo} di 3`} onClose={onChiudi}>
      {passo === 1 && (
        <div className="space-y-3 text-sm">
          <p>
            Questa operazione <strong>svuota l’intero archivio dello studio</strong>: clienti, fascicoli,
            valutazioni del rischio, documenti, operazioni, segnalazioni, astensioni, formazione e
            autovalutazioni.
          </p>
          <p>Non tocca: gli utenti e le loro password, le impostazioni dello studio, il registro degli accessi.</p>
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn btn-secondary" onClick={onChiudi}>Annulla</button>
            <button className="btn btn-primary" onClick={() => setPasso(2)}>Ho capito, continua</button>
          </div>
        </div>
      )}
      {passo === 2 && (
        <div className="space-y-3 text-sm">
          <div className="riquadro avviso !my-0">
            Prima dell’eliminazione viene creato <strong>obbligatoriamente</strong> un backup di sicurezza:
            se il backup non riesce, l’archivio non viene toccato. Dal backup («pre-eliminazione»)
            tutto resta recuperabile con un ripristino.
          </div>
          <p>
            Ricorda che i documenti acquisiti sono soggetti a conservazione decennale
            (art. 31 DLgs. 231/2007): eliminali solo se l’obbligo è assolto altrove
            o se si tratta di dati di prova.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn btn-secondary" onClick={onChiudi}>Annulla</button>
            <button className="btn btn-primary" onClick={() => setPasso(3)}>Continua</button>
          </div>
        </div>
      )}
      {passo === 3 && (
        <form onSubmit={elimina} className="space-y-3 text-sm">
          <p>Ultimo passaggio: per eliminare davvero l’archivio scrivi la parola di conferma.</p>
          <div>
            <label className="label">Per confermare scrivi ELIMINA</label>
            <input className="input" value={parola} onChange={(e) => setParola(e.target.value)} autoFocus placeholder="ELIMINA" />
          </div>
          {errore && <div className="errore">{errore}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn btn-secondary" onClick={onChiudi}>Annulla</button>
            <button className="btn btn-primary !bg-red-600 hover:!bg-red-700" disabled={invio || parola.trim().toUpperCase() !== 'ELIMINA'}>
              {invio ? 'Eliminazione in corso…' : 'Elimina l’archivio'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
