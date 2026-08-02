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
      {sessione.utente.ruolo === 'TITOLARE' && <BackupArchivio />}
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

// ── Backup, ripristino ed eliminazione archivio (AR-M4) ────────

interface BackupRiga {
  key: string;
  tipo: 'daily' | 'monthly' | 'pre-ripristino' | 'pre-eliminazione';
  bytes: number;
  caricatoIl: string;
  righe: number | null;
  trigger: string | null;
}

const ETICHETTA_TIPO_BACKUP: Record<BackupRiga['tipo'], string> = {
  daily: 'giornaliero',
  monthly: 'mensile',
  'pre-ripristino': 'pre-ripristino',
  'pre-eliminazione': 'pre-eliminazione',
};

function dimensione(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dataOraIt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function BackupArchivio() {
  const [backups, setBackups] = useState<BackupRiga[]>([]);
  const [errore, setErrore] = useState('');
  const [esito, setEsito] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [daRipristinare, setDaRipristinare] = useState<BackupRiga | null>(null);
  const [eliminaAperto, setEliminaAperto] = useState(false);

  const carica = () => api.get<{ backups: BackupRiga[] }>('/backup').then((r) => setBackups(r.backups)).catch((e) => setErrore(e.message));
  useEffect(() => { carica(); }, []);

  const backupAdesso = async () => {
    setErrore(''); setEsito(''); setInCorso(true);
    try {
      const r = await api.post<{ key: string; righe: number }>('/backup');
      setEsito(`Backup eseguito: ${r.righe} righe messe al sicuro.`);
      carica();
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setInCorso(false);
    }
  };

  return (
    <div className="scheda">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="!m-0">Backup dell’archivio</h3>
        <button className="btn btn-secondary btn-sm" onClick={backupAdesso} disabled={inCorso}>
          {inCorso ? 'Backup in corso…' : 'Esegui un backup adesso'}
        </button>
      </div>
      <div className="aiuto">
        Ogni notte l’archivio dello studio viene fotografato automaticamente su server nell’Unione Europea:
        restano gli ultimi 30 backup giornalieri e 12 mensili. Da qui puoi scaricarli o riportare
        l’archivio a una data precedente (art. 32 co. 2 DLgs. 231/2007).
      </div>
      {esito && <div className="riquadro info !my-2">{esito}</div>}
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      {backups.length === 0 ? (
        <div className="text-sm text-ink-400 py-3">
          Nessun backup ancora presente: il primo verrà creato questa notte, oppure eseguine uno adesso.
        </div>
      ) : (
        <table>
          <thead>
            <tr><th>Data</th><th>Tipo</th><th>Contenuto</th><th>Dimensione</th><th /></tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.key}>
                <td className="font-semibold whitespace-nowrap">{dataOraIt(b.caricatoIl)}</td>
                <td>
                  <Badge tone={b.tipo === 'monthly' ? 'teal' : b.tipo === 'daily' ? 'gray' : 'amber'}>
                    {ETICHETTA_TIPO_BACKUP[b.tipo]}
                  </Badge>
                </td>
                <td>{b.righe !== null ? `${b.righe} righe` : '—'}</td>
                <td>{dimensione(b.bytes)}</td>
                <td className="text-right whitespace-nowrap">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => api.scarica(`/backup/scarica?key=${encodeURIComponent(b.key)}`).catch((e) => setErrore(e.message))}
                  >
                    Scarica
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setDaRipristinare(b)}>Ripristina…</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-6 pt-4 border-t border-red-200">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-red-700 text-sm">Elimina l’archivio</div>
            <div className="aiuto !mt-0.5">
              Svuota clienti, fascicoli, valutazioni, documenti e segnalazioni dello studio.
              Prima viene creato un backup di sicurezza, da cui tutto resta recuperabile.
            </div>
          </div>
          <button className="btn btn-secondary btn-sm !text-red-700 shrink-0" onClick={() => setEliminaAperto(true)}>
            Elimina archivio…
          </button>
        </div>
      </div>

      {daRipristinare && (
        <RipristinaModal backup={daRipristinare} onChiudi={() => setDaRipristinare(null)} />
      )}
      {eliminaAperto && (
        <EliminaArchivioModal onChiudi={() => setEliminaAperto(false)} />
      )}
    </div>
  );
}

function RipristinaModal({ backup, onChiudi }: { backup: BackupRiga; onChiudi: () => void }) {
  const [parola, setParola] = useState('');
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const [fatto, setFatto] = useState<{ righeRipristinate: number; backupPreRipristino: string } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrore('');
    setInvio(true);
    try {
      const r = await api.post<{ righeRipristinate: number; backupPreRipristino: string }>('/backup/ripristina', {
        key: backup.key,
        conferma: parola.trim().toUpperCase(),
      });
      setFatto(r);
    } catch (err) {
      setErrore((err as Error).message);
      setInvio(false);
    }
  };

  if (fatto) {
    return (
      <Modal title="Ripristino completato" onClose={() => window.location.reload()}>
        <div className="space-y-3 text-sm">
          <div className="riquadro info !my-0">
            L’archivio è tornato alla fotografia del {dataOraIt(backup.caricatoIl)}:{' '}
            <strong>{fatto.righeRipristinate} righe</strong> ripristinate.
          </div>
          <p>
            Lo stato che c’era un attimo prima del ripristino è al sicuro nella lista dei backup
            con tipo «pre-ripristino»: anche questa operazione è reversibile.
          </p>
          <div className="text-right">
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Ricarica l’applicazione</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Ripristina un backup" onClose={onChiudi}>
      <form onSubmit={submit} className="space-y-3 text-sm">
        <p>
          Stai per riportare <strong>tutto l’archivio dello studio</strong> alla fotografia del{' '}
          <strong>{dataOraIt(backup.caricatoIl)}</strong>
          {backup.righe !== null && <> ({backup.righe} righe)</>}: ciò che è stato inserito o modificato
          dopo quella data sparirà dall’archivio.
        </p>
        <div className="riquadro avviso !my-0">
          Prima di toccare qualsiasi dato verrà creata una fotografia di sicurezza («pre-ripristino»):
          se cambi idea, potrai tornare allo stato di adesso. Gli utenti, le password e il registro
          degli accessi non vengono toccati.
        </div>
        <div>
          <label className="label">Per confermare scrivi RIPRISTINA</label>
          <input className="input" value={parola} onChange={(e) => setParola(e.target.value)} autoFocus placeholder="RIPRISTINA" />
        </div>
        {errore && <div className="errore">{errore}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-secondary" onClick={onChiudi}>Annulla</button>
          <button className="btn btn-primary" disabled={invio || parola.trim().toUpperCase() !== 'RIPRISTINA'}>
            {invio ? 'Ripristino in corso…' : 'Ripristina l’archivio'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

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
