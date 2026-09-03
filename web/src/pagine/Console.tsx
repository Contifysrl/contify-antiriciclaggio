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
  const [vista, setVista] = useState<'ticket' | 'studi'>('ticket');
  const [ticket, setTicket] = useState<TicketConsole[] | null>(null);
  const [errore, setErrore] = useState('');
  const [apertoId, setApertoId] = useState<string | null>(apri);

  const carica = () => {
    api.get<{ ticket: TicketConsole[] }>('/console/ticket')
      .then((r) => setTicket(r.ticket))
      .catch((e) => { setErrore((e as Error).message); setTicket([]); });
  };
  useEffect(() => { carica(); }, []);

  const tabCls = (attiva: boolean) =>
    `px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
      attiva ? 'bg-teal-600 text-accento-on' : 'text-ink-500 hover:bg-ink-200'
    }`;

  return (
    <div className="min-h-screen bg-ink-100 p-4 sm:p-8">
      <div className="max-w-[1000px] mx-auto">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <LogoContify altezza={24} />
          <span className="text-xs text-ink-400 font-semibold">Console assistenza</span>
          <div className="flex gap-1 ml-4 bg-ink-0 border border-ink-100 rounded-xl p-1">
            <button type="button" className={tabCls(vista === 'ticket')} onClick={() => setVista('ticket')}>Ticket</button>
            <button type="button" className={tabCls(vista === 'studi')} onClick={() => setVista('studi')}>Studi</button>
          </div>
          <span className="ml-auto text-sm text-ink-500">{operatore.nome}</span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={async () => { await api.post('/console/logout'); location.reload(); }}
          >
            Esci
          </button>
        </div>

        {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}

        {vista === 'studi' && <StudiConsole />}

        {vista === 'ticket' && (ticket === null ? (
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
        ))}

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

// ── Studi: licenza e contratto (AR-M12) ────────────────────────
// L'equivalente del riquadro «Licenza e contratto» di Assist, dalla
// console: stato commerciale, date del contratto e note, senza mai
// entrare negli archivi degli studi.

interface StudioRiga {
  id: string;
  denominazione: string;
  codiceFiscale: string | null;
  partitaIva: string | null;
  ordineIscrizione: string | null;
  stato: 'attivo' | 'sospeso' | 'cessato';
  dataAttivazione: string | null;
  dataScadenzaCanone: string | null;
  noteContratto: string | null;
  /** AR-M16: posti professionista a contratto. null = nessun limite. */
  professionistiInclusi: number | null;
  nUtenti: number;
  nProfessionisti: number;
  ultimoAccesso: string | null;
}

const STATO_STUDIO: Record<StudioRiga['stato'], { testo: string; tone: 'teal' | 'gray' | 'amber' }> = {
  attivo: { testo: 'Attivo', tone: 'teal' },
  sospeso: { testo: 'Sospeso (sola lettura)', tone: 'amber' },
  cessato: { testo: 'Cessato', tone: 'gray' },
};

function dataIt(iso: string | null): string {
  if (!iso) return '—';
  const [a, m, g] = iso.slice(0, 10).split('-');
  return `${g}/${m}/${a}`;
}

function giorniAScadenza(iso: string | null): number | null {
  if (!iso) return null;
  const oggi = new Date(); oggi.setUTCHours(0, 0, 0, 0);
  return Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - oggi.getTime()) / 86_400_000);
}

function StudiConsole() {
  const [studi, setStudi] = useState<StudioRiga[] | null>(null);
  const [errore, setErrore] = useState('');
  const [aperto, setAperto] = useState<StudioRiga | null>(null);
  const [nuovo, setNuovo] = useState(false);

  const carica = () => {
    api.get<{ studi: StudioRiga[] }>('/console/studi')
      .then((r) => setStudi(r.studi))
      .catch((e) => { setErrore((e as Error).message); setStudi([]); });
  };
  useEffect(() => { carica(); }, []);

  return (
    <>
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <span className="text-sm text-ink-500">
          {studi === null ? '' : `${studi.length} stud${studi.length === 1 ? 'io' : 'i'}`}
        </span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setNuovo(true)}>
          + Nuovo studio
        </button>
      </div>
      {studi === null ? (
        <Spinner />
      ) : studi.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-400">Nessuno studio ancora: attiva il primo con «Nuovo studio».</div>
      ) : (
        <div className="card p-5">
          <table>
            <thead>
              <tr><th>Studio</th><th>Stato</th><th>Attivazione</th><th>Scadenza canone</th><th>Professionisti</th><th>Utenti</th></tr>
            </thead>
            <tbody>
              {studi.map((s) => {
                const giorni = giorniAScadenza(s.dataScadenzaCanone);
                return (
                  <tr key={s.id} className="cursor-pointer hover:bg-ink-50" onClick={() => setAperto(s)}>
                    <td className="font-semibold">{s.denominazione}</td>
                    <td><Badge tone={STATO_STUDIO[s.stato].tone}>{STATO_STUDIO[s.stato].testo}</Badge></td>
                    <td className="whitespace-nowrap">{dataIt(s.dataAttivazione)}</td>
                    <td className="whitespace-nowrap">
                      {dataIt(s.dataScadenzaCanone)}
                      {giorni !== null && (
                        <span className={`block text-xs ${giorni < 0 ? 'text-red-600 font-semibold' : giorni <= 30 ? 'text-amber-600' : 'text-ink-400'}`}>
                          {giorni < 0 ? `scaduto da ${-giorni} giorni` : `mancano ${giorni} giorni`}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {s.nProfessionisti}
                      {s.professionistiInclusi !== null && (
                        <span className={s.nProfessionisti > s.professionistiInclusi ? 'text-red-600 font-semibold' : 'text-ink-400'}>
                          {' '}/ {s.professionistiInclusi}
                        </span>
                      )}
                      {s.professionistiInclusi !== null && s.nProfessionisti > s.professionistiInclusi && (
                        <span className="block text-xs text-red-600 font-semibold">oltre contratto</span>
                      )}
                    </td>
                    <td>{s.nUtenti}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {aperto && (
        <StudioModal studio={aperto} onChiudi={(ricarica) => { setAperto(null); if (ricarica) carica(); }} />
      )}
      {nuovo && (
        <NuovoStudioModal onChiudi={(creato) => { setNuovo(false); if (creato) carica(); }} />
      )}
    </>
  );
}

// ── Nuovo studio ───────────────────────────────────────────────
// Attiva uno studio con il suo primo professionista amministratore.
// La password temporanea si vede qui una volta sola: se l'email di
// benvenuto non parte (o non arriva), va comunicata a voce.

interface EsitoNuovoStudio {
  id: string;
  utenteId: string;
  passwordTemporanea: string;
  emailInviata: boolean;
}

function NuovoStudioModal({ onChiudi }: { onChiudi: (creato: boolean) => void }) {
  const [denominazione, setDenominazione] = useState('');
  const [codiceFiscale, setCodiceFiscale] = useState('');
  const [partitaIva, setPartitaIva] = useState('');
  const [ordineIscrizione, setOrdineIscrizione] = useState('');
  const [attivazione, setAttivazione] = useState(new Date().toISOString().slice(0, 10));
  const [scadenza, setScadenza] = useState('');
  const [posti, setPosti] = useState('');
  const [note, setNote] = useState('');
  const [pNome, setPNome] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pQualifica, setPQualifica] = useState('Dott.');
  const [pCf, setPCf] = useState('');
  const [pOrdine, setPOrdine] = useState('');
  const [pNumero, setPNumero] = useState('');
  const [errore, setErrore] = useState('');
  const [omonimo, setOmonimo] = useState(false);
  const [invio, setInvio] = useState(false);
  const [esito, setEsito] = useState<EsitoNuovoStudio | null>(null);
  const [copiato, setCopiato] = useState(false);

  const submit = async (e: FormEvent, confermaOmonimo = false) => {
    e.preventDefault();
    setErrore(''); setInvio(true);
    try {
      const r = await api.post<EsitoNuovoStudio>('/console/studi', {
        denominazione, codiceFiscale, partitaIva, ordineIscrizione,
        dataAttivazione: attivazione || null,
        dataScadenzaCanone: scadenza || null,
        professionistiInclusi: posti.trim() === '' ? null : Number(posti),
        noteContratto: note.trim() || null,
        confermaOmonimo,
        professionista: { nome: pNome, email: pEmail, qualifica: pQualifica, codiceFiscale: pCf, ordine: pOrdine, numeroIscrizione: pNumero },
      });
      setEsito(r);
    } catch (err) {
      const msg = (err as Error).message;
      setOmonimo(/gi[àa] uno studio chiamato/i.test(msg));
      setErrore(msg);
    } finally {
      setInvio(false);
    }
  };

  const copia = async () => {
    if (!esito) return;
    try {
      await navigator.clipboard.writeText(`${pEmail}\n${esito.passwordTemporanea}`);
      setCopiato(true);
    } catch { /* clipboard non disponibile */ }
  };

  if (esito) {
    return (
      <Modal title={`Studio attivato — ${denominazione}`} onClose={() => onChiudi(true)}>
        <div className="space-y-3 text-sm">
          <div className={`riquadro ${esito.emailInviata ? 'info' : 'avviso'} !my-0`}>
            {esito.emailInviata
              ? <>L'email di benvenuto è partita verso <strong>{pEmail}</strong>.</>
              : <>L'email di benvenuto <strong>non è partita</strong>: comunica le credenziali a voce o per altra via.</>}
          </div>
          <p>Credenziali di primo accesso di <strong>{pNome}</strong> (la password compare qui una volta sola e al primo accesso va cambiata):</p>
          <div className="bg-ink-100 rounded-lg px-4 py-3 mono text-sm">
            <div>Email: <strong>{pEmail}</strong></div>
            <div>Password temporanea: <strong data-test="password-temporanea">{esito.passwordTemporanea}</strong></div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={copia}>{copiato ? 'Copiato' : 'Copia credenziali'}</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onChiudi(true)}>Chiudi</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Nuovo studio" onClose={() => onChiudi(false)} wide>
      {errore && <ErrorBanner message={errore} onDismiss={() => { setErrore(''); setOmonimo(false); }} />}
      <form onSubmit={(e) => submit(e)} className="space-y-4 text-sm">
        <fieldset className="space-y-3">
          <legend className="font-semibold text-ink-700">Studio</legend>
          <div>
            <label className="label">Denominazione</label>
            <input className="input" value={denominazione} onChange={(e) => setDenominazione(e.target.value)} required maxLength={200} autoFocus placeholder="Studio Rossi & Associati" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Codice fiscale</label>
              <input className="input mono" value={codiceFiscale} onChange={(e) => setCodiceFiscale(e.target.value.toUpperCase())} maxLength={16} />
            </div>
            <div>
              <label className="label">Partita IVA</label>
              <input className="input mono" value={partitaIva} onChange={(e) => setPartitaIva(e.target.value)} maxLength={11} inputMode="numeric" />
            </div>
            <div>
              <label className="label">Ordine (ODCEC)</label>
              <input className="input" value={ordineIscrizione} onChange={(e) => setOrdineIscrizione(e.target.value)} maxLength={120} placeholder="ODCEC Padova" />
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="font-semibold text-ink-700">Primo professionista (amministratore dello studio)</legend>
          <div className="grid gap-3 sm:grid-cols-[100px_1fr_1fr]">
            <div>
              <label className="label">Qualifica</label>
              <input className="input" value={pQualifica} onChange={(e) => setPQualifica(e.target.value)} maxLength={120} />
            </div>
            <div>
              <label className="label">Nome e cognome</label>
              <input className="input" value={pNome} onChange={(e) => setPNome(e.target.value)} required maxLength={120} />
            </div>
            <div>
              <label className="label">Email (sarà il suo accesso)</label>
              <input className="input" type="email" value={pEmail} onChange={(e) => setPEmail(e.target.value)} required autoComplete="off" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Codice fiscale</label>
              <input className="input mono" value={pCf} onChange={(e) => setPCf(e.target.value.toUpperCase())} maxLength={16} />
            </div>
            <div>
              <label className="label">Ordine di iscrizione</label>
              <input className="input" value={pOrdine} onChange={(e) => setPOrdine(e.target.value)} maxLength={120} placeholder="Padova" />
            </div>
            <div>
              <label className="label">Numero di iscrizione</label>
              <input className="input" value={pNumero} onChange={(e) => setPNumero(e.target.value)} maxLength={120} />
            </div>
          </div>
          <div className="aiuto">
            Riceve una password temporanea da cambiare al primo accesso, e potrà aggiungere gli altri utenti da solo.
            Qualifica, ordine e numero compaiono nell'intestazione dei verbali: si possono completare dopo.
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="font-semibold text-ink-700">Contratto</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Attivazione</label>
              <input className="input" type="date" value={attivazione} onChange={(e) => setAttivazione(e.target.value)} />
            </div>
            <div>
              <label className="label">Scadenza canone</label>
              <input className="input" type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)} />
            </div>
            <div>
              <label className="label">Posti professionista</label>
              <input className="input" type="number" min={1} max={999} value={posti} onChange={(e) => setPosti(e.target.value)} placeholder="vuoto = nessun limite" />
            </div>
          </div>
          <div>
            <label className="label">Note contratto (visibili solo a Contify)</label>
            <textarea className="input min-h-[60px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Numero offerta, referente, condizioni particolari…" />
          </div>
        </fieldset>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChiudi(false)}>Annulla</button>
          {omonimo && (
            <button type="button" className="btn btn-secondary btn-sm !text-amber-700" disabled={invio} onClick={(e) => submit(e as unknown as FormEvent, true)}>
              È un altro studio: crea comunque
            </button>
          )}
          <button className="btn btn-primary btn-sm" disabled={invio}>{invio ? 'Attivazione…' : 'Attiva lo studio'}</button>
        </div>
      </form>
    </Modal>
  );
}

function StudioModal({ studio, onChiudi }: { studio: StudioRiga; onChiudi: (ricarica: boolean) => void }) {
  const [attivazione, setAttivazione] = useState(studio.dataAttivazione?.slice(0, 10) ?? '');
  const [scadenza, setScadenza] = useState(studio.dataScadenzaCanone?.slice(0, 10) ?? '');
  const [note, setNote] = useState(studio.noteContratto ?? '');
  const [posti, setPosti] = useState(studio.professionistiInclusi !== null ? String(studio.professionistiInclusi) : '');
  const [errore, setErrore] = useState('');
  const [esito, setEsito] = useState('');
  const [invio, setInvio] = useState(false);
  const [confermaStato, setConfermaStato] = useState<'sospeso' | 'cessato' | 'attivo' | null>(null);
  const [toccato, setToccato] = useState(false);
  const [anag, setAnag] = useState({
    denominazione: studio.denominazione,
    codiceFiscale: studio.codiceFiscale ?? '',
    partitaIva: studio.partitaIva ?? '',
    ordineIscrizione: studio.ordineIscrizione ?? '',
  });
  const [salvaAnag, setSalvaAnag] = useState(false);
  const [titolo, setTitolo] = useState(studio.denominazione);

  const salvaAnagrafica = async (e: FormEvent) => {
    e.preventDefault();
    setErrore(''); setEsito(''); setSalvaAnag(true);
    try {
      await api.post(`/console/studi/${studio.id}/anagrafica`, anag);
      setEsito('Anagrafica salvata.');
      setTitolo(anag.denominazione.trim());
      setToccato(true);
    } catch (err) {
      setErrore((err as Error).message);
    } finally {
      setSalvaAnag(false);
    }
  };

  const salva = async (e: FormEvent) => {
    e.preventDefault();
    setErrore(''); setEsito(''); setInvio(true);
    try {
      await api.post(`/console/studi/${studio.id}/contratto`, {
        dataAttivazione: attivazione || null,
        dataScadenzaCanone: scadenza || null,
        noteContratto: note.trim() || null,
        professionistiInclusi: posti.trim() === '' ? null : Number(posti),
      });
      setEsito('Contratto salvato.');
      setToccato(true);
    } catch (err) {
      setErrore((err as Error).message);
    } finally {
      setInvio(false);
    }
  };

  const cambiaStato = async (stato: 'attivo' | 'sospeso' | 'cessato') => {
    setErrore(''); setEsito('');
    try {
      await api.post(`/console/studi/${studio.id}/stato`, { stato });
      onChiudi(true);
    } catch (err) {
      setErrore((err as Error).message);
      setConfermaStato(null);
    }
  };

  const ETICHETTA_CONFERMA: Record<string, { titolo: string; corpo: string; bottone: string }> = {
    sospeso: {
      titolo: 'Sospendere lo studio?',
      corpo: 'Lo studio passa in sola lettura: consultazione, export e backup restano possibili, le modifiche no. Nessuna email parte in automatico.',
      bottone: 'Sospendi (sola lettura)',
    },
    cessato: {
      titolo: 'Segnare lo studio come cessato?',
      corpo: 'L\'accesso viene chiuso (restano solo login/logout). I dati NON vengono toccati: per la cancellazione vera serve la procedura concordata col cliente.',
      bottone: 'Segna cessato',
    },
    attivo: {
      titolo: 'Riattivare lo studio?',
      corpo: 'Lo studio torna pienamente operativo.',
      bottone: 'Riattiva',
    },
  };

  return (
    <Modal title={titolo} onClose={() => onChiudi(toccato)} wide>
      <div className="flex items-center gap-2 mb-4">
        <Badge tone={STATO_STUDIO[studio.stato].tone}>{STATO_STUDIO[studio.stato].testo}</Badge>
        <span className="text-xs text-ink-400">
          {studio.nUtenti} utenti attivi · {studio.nProfessionisti} professionist{studio.nProfessionisti === 1 ? 'a' : 'i'}
        </span>
      </div>
      {esito && <div className="riquadro info !my-2 text-sm">{esito}</div>}
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}

      <form onSubmit={salvaAnagrafica} className="space-y-3 text-sm mb-5 pb-5 border-b border-ink-100">
        <div className="font-semibold text-ink-700">Anagrafica dello studio</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Denominazione</label>
            <input className="input" value={anag.denominazione} onChange={(e) => setAnag({ ...anag, denominazione: e.target.value })} required maxLength={200} />
          </div>
          <div>
            <label className="label">Codice fiscale</label>
            <input className="input mono" value={anag.codiceFiscale} onChange={(e) => setAnag({ ...anag, codiceFiscale: e.target.value.toUpperCase() })} maxLength={16} />
          </div>
          <div>
            <label className="label">Partita IVA</label>
            <input className="input mono" value={anag.partitaIva} onChange={(e) => setAnag({ ...anag, partitaIva: e.target.value })} maxLength={11} inputMode="numeric" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Ordine (ODCEC)</label>
            <input className="input" value={anag.ordineIscrizione} onChange={(e) => setAnag({ ...anag, ordineIscrizione: e.target.value })} maxLength={120} />
          </div>
        </div>
        <div className="flex justify-end">
          <button className="btn btn-secondary btn-sm" disabled={salvaAnag}>{salvaAnag ? 'Salvataggio…' : 'Salva anagrafica'}</button>
        </div>
        <div className="aiuto">Lo studio non può modificare da solo questi dati: compaiono nei verbali e nei backup.</div>
      </form>

      <form onSubmit={salva} className="space-y-3 text-sm">
        <div className="font-semibold text-ink-700">Licenza e contratto</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Attivazione</label>
            <input className="input" type="date" value={attivazione} onChange={(e) => setAttivazione(e.target.value)} />
          </div>
          <div>
            <label className="label">Scadenza canone</label>
            <input className="input" type="date" value={scadenza} onChange={(e) => setScadenza(e.target.value)} />
          </div>
          <div>
            <label className="label">Posti professionista a contratto</label>
            <input
              className="input"
              type="number"
              min={1}
              max={999}
              value={posti}
              onChange={(e) => setPosti(e.target.value)}
              placeholder="vuoto = nessun limite"
            />
            <div className="aiuto mt-1">
              Conta i professionisti attivi (chi identifica e firma), non collaboratori e lettori.
              Un limite sotto gli attivi non disattiva nessuno: impedisce solo di aggiungerne.
            </div>
          </div>
        </div>
        <div>
          <label className="label">Note contratto (visibili solo a Contify)</label>
          <textarea className="input min-h-[70px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Numero offerta, referente, condizioni particolari…" />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button className="btn btn-primary btn-sm" disabled={invio}>{invio ? 'Salvataggio…' : 'Salva contratto'}</button>
          {studio.stato !== 'sospeso' && studio.stato !== 'cessato' && (
            <button type="button" className="btn btn-secondary btn-sm !text-amber-700" onClick={() => setConfermaStato('sospeso')}>
              Sospendi (sola lettura)
            </button>
          )}
          {studio.stato !== 'cessato' && (
            <button type="button" className="btn btn-secondary btn-sm !text-red-700" onClick={() => setConfermaStato('cessato')}>
              Segna cessato
            </button>
          )}
          {studio.stato !== 'attivo' && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfermaStato('attivo')}>
              Riattiva
            </button>
          )}
        </div>
        <div className="aiuto">
          Nessuna sospensione avviene in automatico: alle soglie di scadenza parte solo un
          promemoria via email a Contify. Gli avvisi del canone restano quelli del lavoro notturno.
        </div>
      </form>

      {confermaStato && (
        <Modal title={ETICHETTA_CONFERMA[confermaStato].titolo} onClose={() => setConfermaStato(null)}>
          <div className="space-y-3 text-sm">
            <p>{ETICHETTA_CONFERMA[confermaStato].corpo}</p>
            <div className="flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setConfermaStato(null)}>Annulla</button>
              <button className="btn btn-primary" onClick={() => cambiaStato(confermaStato)}>
                {ETICHETTA_CONFERMA[confermaStato].bottone}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
