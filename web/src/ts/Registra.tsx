import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { ConfermaEliminazione, HelpLink } from '../components/ui';
import { Icona } from '../components/icone';
import { PiedeLegale } from '../componenti';
import { FormRegistrazione } from './FormRegistrazione';
import { Microfono } from './Microfono';
import { StrisciaRiepilogo } from './Riepilogo';
import { dataLunga, durata, leggiDurata, type Contesto, type Proposta, type Registrazione, type Riepilogo } from './api';

// ── Contify Timesheet — Registra (TS-M1, M1.6) ──────────────────
// La sola schermata del collaboratore (decisione A14): in alto il riepilogo
// del proprio lavoro, sotto la chat. Aspetto e comportamento della chat di
// AR: fumetti, casella in basso, accanto il microfono. La conversazione non si
// conserva (B4): all'apertura la pagina mostra le registrazioni di oggi
// ricostruite dall'archivio. Le proposte complete si salvano subito
// (automatica = 1); per le incomplete una domanda per volta, con i candidati
// come pulsanti (M1.3, «regola di salvataggio»). Testi neutri.

type Voce =
  | { tipo: 'utente'; testo: string }
  | { tipo: 'programma'; testo: string }
  | { tipo: 'scheda'; reg: Registrazione }
  | { tipo: 'avviso'; testo: string };

type Campo = 'cliente' | 'servizio' | 'minuti' | 'data';

const ESEMPI = ['2 ore di contabilità per …', 'Ieri un’ora e mezza di cedolini per …', 'Mezz’ora al telefono con … e poi 2 ore di bilancio per …'];
const SCELTE_MINUTI = [15, 30, 60, 90, 120, 180, 240];

function campoMancante(p: Proposta): Campo | null {
  if (!p.cliente.id) return 'cliente';
  if (!p.servizio.id) return 'servizio';
  if (p.minuti == null) return 'minuti';
  if (!p.data) return 'data';
  return null;
}
const completa = (p: Proposta) => campoMancante(p) === null;

export function TsRegistra({ sessioneUtenteId, vaiA }: { sessioneUtenteId: string; vaiA: (p: string) => void }) {
  const [contesto, setContesto] = useState<Contesto | null>(null);
  const [riepilogo, setRiepilogo] = useState<Riepilogo | null>(null);
  const [flusso, setFlusso] = useState<Voce[]>([]);
  const [testo, setTesto] = useState('');
  const [inAttesa, setInAttesa] = useState(false);
  const [errore, setErrore] = useState('');
  // Proposte incomplete in attesa di risposta; la domanda riguarda il primo campo mancante della prima.
  const [inSospeso, setInSospeso] = useState<Proposta[]>([]);
  const [origineCorrente, setOrigineCorrente] = useState<'CHAT' | 'VOCE'>('CHAT');
  const [fraseCorrente, setFraseCorrente] = useState('');
  const [cercaCliente, setCercaCliente] = useState(false);
  const [nuovoCliente, setNuovoCliente] = useState<string | null>(null);
  const [altraDurata, setAltraDurata] = useState(false);
  const [altriServizi, setAltriServizi] = useState(false);
  const [aliasProposto, setAliasProposto] = useState<{ testo: string; clienteId: string; nome: string } | null>(null);
  const [aMano, setAMano] = useState(false);
  const [modifica, setModifica] = useState<Registrazione | null>(null);
  const [daEliminare, setDaEliminare] = useState<Registrazione | null>(null);
  const fondoRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLInputElement>(null);

  const caricaContesto = useCallback(() => api.get<Contesto>('/ts/contesto').then(setContesto), []);
  const caricaRiepilogo = useCallback(() => api.get<Riepilogo>('/ts/riepilogo').then(setRiepilogo).catch(() => { /* la striscia resta com'è */ }), []);

  useEffect(() => {
    caricaContesto().catch((e) => setErrore((e as Error).message));
    caricaRiepilogo();
  }, [caricaContesto, caricaRiepilogo]);

  // All'apertura: le registrazioni di oggi, ricostruite dall'archivio.
  useEffect(() => {
    if (!contesto) return;
    api.get<{ registrazioni: Registrazione[] }>(`/ts/registrazioni?da=${contesto.oggi}&a=${contesto.oggi}`)
      .then((r) => setFlusso(r.registrazioni.filter((x) => x.utenteId === sessioneUtenteId).reverse().map((reg) => ({ tipo: 'scheda', reg }))))
      .catch(() => { /* flusso vuoto */ });
  }, [contesto?.oggi, sessioneUtenteId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fondoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [flusso, inSospeso, inAttesa]);

  const aggiungi = (...v: Voce[]) => setFlusso((f) => [...f, ...v]);
  const nomeCliente = (id: string | null) => contesto?.clienti.find((c) => c.id === id)?.nome ?? '';
  const nomeServizio = (id: string | null) => contesto?.servizi.find((s) => s.id === id)?.nome ?? '';

  /** Salva le proposte complete; restituisce quelle che restano in sospeso. */
  const salva = async (proposte: Proposta[], frase: string, origine: 'CHAT' | 'VOCE', automatica: boolean): Promise<Proposta[]> => {
    const pronte = proposte.filter(completa);
    const resto = proposte.filter((p) => !completa(p));
    if (pronte.length) {
      try {
        const r = await api.post<{ registrazioni: Registrazione[] }>('/ts/registrazioni', {
          registrazioni: pronte.map((p) => ({
            clienteId: p.cliente.id, servizioId: p.servizio.id, minuti: p.minuti, data: p.data, nota: p.nota,
            testoOriginale: frase.slice(0, 1000), origine, motore: p.motore, automatica,
          })),
        });
        aggiungi(...r.registrazioni.map((reg) => ({ tipo: 'scheda', reg } as Voce)));
        const daVerificare = r.registrazioni.filter((x) => x.daVerificare);
        if (daVerificare.length) aggiungi({ tipo: 'avviso', testo: 'Segnata «da verificare»: chi dirige lo studio la controllerà. ' + spiegaMotivi(daVerificare.flatMap((x) => x.motivi ?? [])) });
        caricaRiepilogo();
        // Al primo salvataggio un cliente di Antiriciclaggio («ar:…») riceve il suo id Timesheet: si ricarica l'elenco.
        if (pronte.some((p) => p.cliente.id?.startsWith('ar:'))) caricaContesto().catch(() => { /* resta il vecchio */ });
      } catch (e) {
        aggiungi({ tipo: 'avviso', testo: (e as Error).message });
      }
    }
    return resto;
  };

  const domanda = (p: Proposta): string => {
    const campo = campoMancante(p);
    const pezzo = [nomeCliente(p.cliente.id), nomeServizio(p.servizio.id), p.minuti != null ? durata(p.minuti) : ''].filter(Boolean).join(', ');
    const su = pezzo ? ` (${pezzo})` : '';
    if (campo === 'cliente') return p.cliente.candidati.length ? `Per quale cliente${su}?` : `Per quale cliente${su}? Non ho riconosciuto il nome.`;
    if (campo === 'servizio') return `Che tipo di lavoro${su}?`;
    if (campo === 'minuti') return `Quanto tempo${su}?`;
    return `Che giorno${su}?`;
  };

  const gestisci = async (proposte: Proposta[], frase: string, origine: 'CHAT' | 'VOCE', automatica: boolean) => {
    const resto = await salva(proposte, frase, origine, automatica);
    setInSospeso(resto);
    if (resto.length) aggiungi({ tipo: 'programma', testo: domanda(resto[0]) });
    setCercaCliente(false);
    setNuovoCliente(null);
    setAltraDurata(false);
    setAltriServizi(false);
  };

  const invia = async (frase: string, origine: 'CHAT' | 'VOCE' = 'CHAT') => {
    const pulita = frase.trim();
    if (!pulita || inAttesa || !contesto) return;
    setErrore('');
    aggiungi({ tipo: 'utente', testo: pulita });
    setTesto('');
    setInAttesa(true);
    try {
      if (inSospeso.length) {
        // Risposta scritta a una domanda: il server completa le proposte in sospeso con il nuovo testo.
        const prima = inSospeso[0];
        const campo = campoMancante(prima);
        const r = await api.post<{ proposte: Proposta[]; limiteAi: boolean }>('/ts/interpreta', { testo: pulita, origine, inSospeso });
        const dopo = r.proposte[0];
        // Il nome non è stato riconosciuto: si offre la ricerca e, se permesso, il nuovo cliente.
        if (campo === 'cliente' && dopo && !dopo.cliente.id && !dopo.cliente.candidati.length) {
          setInSospeso(r.proposte);
          setCercaCliente(true);
          if (contesto.impostazioni.collaboratoriCreanoClienti || contesto.ruolo === 'TITOLARE') setNuovoCliente(pulita);
          aggiungi({ tipo: 'programma', testo: `Non trovo «${pulita}» fra i clienti. Cercalo nell'elenco${contesto.impostazioni.collaboratoriCreanoClienti || contesto.ruolo === 'TITOLARE' ? ' oppure crealo come nuovo cliente' : ''}.` });
        } else {
          if (campo === 'cliente' && dopo?.cliente.id && pulita.split(/\s+/).length <= 4 && !nomeCliente(dopo.cliente.id).toLowerCase().includes(pulita.toLowerCase())) {
            setAliasProposto({ testo: pulita.toLowerCase(), clienteId: dopo.cliente.id, nome: nomeCliente(dopo.cliente.id) });
          }
          await gestisci(r.proposte, fraseCorrente || pulita, origineCorrente, false);
        }
      } else {
        setFraseCorrente(pulita);
        setOrigineCorrente(origine);
        const r = await api.post<{ proposte: Proposta[]; limiteAi: boolean; motore: string }>('/ts/interpreta', { testo: pulita, origine });
        if (r.limiteAi) aggiungi({ tipo: 'avviso', testo: 'Per oggi l’aiuto dell’AI ha raggiunto il limite: continuo con il riconoscimento di base.' });
        await gestisci(r.proposte, pulita, origine, true);
      }
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setInAttesa(false);
      campoRef.current?.focus();
    }
  };

  /** Risposta con un pulsante: completa la proposta nel browser, senza chiamare il server. */
  const rispondi = async (campo: Campo, valore: string | number) => {
    if (!inSospeso.length) return;
    const [prima, ...altre] = inSospeso;
    const nuova: Proposta = { ...prima, cliente: { ...prima.cliente }, servizio: { ...prima.servizio } };
    let etichetta = '';
    if (campo === 'cliente') { nuova.cliente = { id: String(valore), candidati: [] }; etichetta = nomeCliente(String(valore)); }
    if (campo === 'servizio') { nuova.servizio = { id: String(valore), candidati: [] }; etichetta = nomeServizio(String(valore)); }
    if (campo === 'minuti') { nuova.minuti = Number(valore); etichetta = durata(Number(valore)); }
    if (campo === 'data') { nuova.data = String(valore); etichetta = dataLunga(String(valore), contesto?.oggi); }
    aggiungi({ tipo: 'utente', testo: etichetta });
    setInAttesa(true);
    try {
      await gestisci([nuova, ...altre], fraseCorrente, origineCorrente, false);
    } finally {
      setInAttesa(false);
    }
  };

  const creaCliente = async (nome: string) => {
    setInAttesa(true);
    try {
      const r = await api.post<{ cliente: { id: string; nome: string } }>('/ts/clienti', { denominazione: nome });
      await caricaContesto();
      setNuovoCliente(null);
      setCercaCliente(false);
      aggiungi({ tipo: 'avviso', testo: `Cliente «${r.cliente.nome}» creato, segnato «da verificare» finché chi dirige lo studio non ne completa l'anagrafica.` });
      await rispondiConCliente(r.cliente.id);
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setInAttesa(false);
    }
  };

  const rispondiConCliente = async (id: string) => {
    setCercaCliente(false);
    setNuovoCliente(null);
    await rispondi('cliente', id);
  };

  const salvaAlias = async () => {
    if (!aliasProposto) return;
    try {
      await api.post(`/ts/clienti/${aliasProposto.clienteId}/alias`, { alias: aliasProposto.testo });
      aggiungi({ tipo: 'avviso', testo: `D'ora in poi «${aliasProposto.testo}» è ${aliasProposto.nome}.` });
      caricaContesto().catch(() => { /* resta il vecchio */ });
    } catch (e) {
      aggiungi({ tipo: 'avviso', testo: (e as Error).message });
    } finally {
      setAliasProposto(null);
    }
  };

  const annulla = async (reg: Registrazione) => {
    try {
      await api.elimina(`/ts/registrazioni/${reg.id}`);
      setFlusso((f) => f.filter((v) => !(v.tipo === 'scheda' && v.reg.id === reg.id)));
      caricaRiepilogo();
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setDaEliminare(null);
    }
  };

  const trascrivi = async (audio: Blob, secondi: number): Promise<string> => {
    const fd = new FormData();
    fd.append('audio', audio, 'voce.webm');
    fd.append('secondi', String(secondi));
    const r = await fetch('/api/ts/trascrivi', { method: 'POST', body: fd, credentials: 'same-origin' });
    const dati = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dati?.errore ?? `Errore ${r.status}`);
    return dati?.testo ?? '';
  };

  const submit = (e: FormEvent) => { e.preventDefault(); invia(testo, 'CHAT'); };

  if (!contesto) return <div className="caricamento">{errore || 'Caricamento…'}</div>;
  const prima = inSospeso[0] ?? null;
  const campo = prima ? campoMancante(prima) : null;
  const serviziOrdinati = [...contesto.servizi.filter((s) => !s.generico), ...contesto.servizi.filter((s) => s.generico)];
  const ieri = (() => { const d = new Date(`${contesto.oggi}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();

  return (
    <>
      <h1>Registra <HelpLink sezione="ts-registra" /></h1>
      <p className="occhiello">Scrivi o detta per chi hai lavorato, cosa hai fatto e per quanto tempo: il programma registra. Qui vedi solo il tuo lavoro.</p>

      {riepilogo && <StrisciaRiepilogo riepilogo={riepilogo} onGiorno={(g) => vaiA(`ts-mie-ore?giorno=${g}`)} linkTutte="#ts-mie-ore" />}

      <div className="card flex flex-col" style={{ minHeight: 420, height: 'calc(100vh - 330px)' }} data-test="chat-registra">
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-ink-50 rounded-t-xl">
          {flusso.length === 0 && (
            <div className="space-y-2" data-test="stato-vuoto">
              <p className="text-sm text-ink-500">Nessuna registrazione oggi. Scrivi una frase come:</p>
              {ESEMPI.map((s) => (
                <button key={s} type="button" className="block w-full text-left text-sm px-3 py-2 rounded-lg bg-ink-0 border border-ink-100 hover:border-teal-300 hover:text-teal-800 transition-colors" onClick={() => { setTesto(s.replace(' …', ' ')); campoRef.current?.focus(); }}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {flusso.map((v, i) => {
            if (v.tipo === 'utente') return <div key={i} className="flex justify-end"><div className="max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap bg-teal-600 text-accento-on">{v.testo}</div></div>;
            if (v.tipo === 'programma') return <div key={i} className="flex justify-start"><div className="max-w-[85%] rounded-xl px-3 py-2 text-sm bg-ink-0 border border-ink-100 text-ink-800">{v.testo}</div></div>;
            if (v.tipo === 'avviso') return <div key={i} className="text-xs text-ink-500 px-1">{v.testo}</div>;
            const r = v.reg;
            return (
              <div key={`${i}-${r.id}`} className="flex justify-start">
                <div className="max-w-[85%] rounded-xl px-3 py-2 text-sm bg-ink-0 border border-teal-200 text-ink-800" data-test="scheda-registrazione">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-teal-600"><Icona nome="spunta" size={16} /></span>
                    <strong>{r.clienteNome}</strong>
                    <span className="text-ink-400">·</span>
                    <span>{r.servizioNome}</span>
                    <span className="text-ink-400">·</span>
                    <span className="font-mono">{durata(r.minuti)}</span>
                    <span className="text-ink-400">·</span>
                    <span className="text-ink-500">{dataLunga(r.data, contesto.oggi)}</span>
                    {r.daVerificare && <span className="pillola r3">da verificare</span>}
                  </div>
                  {r.nota && <div className="text-xs text-ink-500 mt-1">{r.nota}</div>}
                  <div className="flex gap-2 mt-1.5">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModifica(r)}>Modifica</button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => setDaEliminare(r)} data-test="annulla-registrazione">Annulla</button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Domanda in corso: i candidati come pulsanti */}
          {prima && campo && !inAttesa && (
            <div className="flex flex-wrap gap-2 pl-1" data-test={`domanda-${campo}`}>
              {campo === 'cliente' && !cercaCliente && prima.cliente.candidati.map((c) => (
                <button key={c.id} type="button" className="btn btn-secondary btn-sm" onClick={() => rispondiConCliente(c.id)}>{c.nome}</button>
              ))}
              {campo === 'cliente' && !cercaCliente && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCercaCliente(true)}>Cerca un altro cliente</button>
              )}
              {campo === 'cliente' && cercaCliente && (
                <div className="w-full max-w-md">
                  <CercaClienteInChat clienti={contesto.clienti} onScelto={rispondiConCliente} onChiudi={() => setCercaCliente(false)} />
                  {nuovoCliente && (
                    <button type="button" className="btn btn-primary btn-sm mt-2" onClick={() => creaCliente(nuovoCliente)} data-test="nuovo-cliente">
                      Nuovo cliente «{nuovoCliente}»
                    </button>
                  )}
                </div>
              )}
              {/* Servizio: prima i candidati (il primo può essere il suggerimento del modello) e il generico; «Altri…» mostra il resto dell'elenco. */}
              {campo === 'servizio' && (prima.servizio.candidati.length && !altriServizi ? [...prima.servizio.candidati, ...contesto.servizi.filter((s) => s.generico && !prima.servizio.candidati.some((c) => c.id === s.id))] : serviziOrdinati).map((s) => (
                <button key={s.id} type="button" className="btn btn-secondary btn-sm" onClick={() => rispondi('servizio', s.id)}>{s.nome}</button>
              ))}
              {campo === 'servizio' && prima.servizio.candidati.length > 0 && !altriServizi && serviziOrdinati.length > prima.servizio.candidati.length + 1 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAltriServizi(true)} data-test="altri-servizi">Altri…</button>
              )}
              {campo === 'minuti' && !altraDurata && SCELTE_MINUTI.map((m) => (
                <button key={m} type="button" className="btn btn-secondary btn-sm" onClick={() => rispondi('minuti', m)}>{durata(m)}</button>
              ))}
              {campo === 'minuti' && !altraDurata && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAltraDurata(true)}>Altro…</button>}
              {campo === 'minuti' && altraDurata && (
                <form className="flex gap-2 items-center" onSubmit={(e) => { e.preventDefault(); const m = leggiDurata(testo); if (m && m >= 1 && m <= 1440) { setTesto(''); rispondi('minuti', m); } }}>
                  <input className="input !w-40" autoFocus value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="1:30, 1,5 o 90" aria-label="Durata" />
                  <button className="btn btn-primary btn-sm" disabled={!leggiDurata(testo)}>Ok</button>
                </form>
              )}
              {campo === 'data' && (
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => rispondi('data', contesto.oggi)}>Oggi</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => rispondi('data', ieri)}>Ieri</button>
                  <input type="date" className="input !w-44" max={contesto.oggi} aria-label="Altro giorno" onChange={(e) => { if (e.target.value && e.target.value <= contesto.oggi) rispondi('data', e.target.value); }} />
                </>
              )}
            </div>
          )}
          {aliasProposto && !inAttesa && (
            <div className="flex flex-wrap items-center gap-2 pl-1 text-sm" data-test="proposta-alias">
              <span className="text-ink-700">La prossima volta «{aliasProposto.testo}» è {aliasProposto.nome}?</span>
              <button type="button" className="btn btn-primary btn-sm" onClick={salvaAlias}>Sì, ricordalo</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAliasProposto(null)}>No</button>
            </div>
          )}
          {inAttesa && <div className="text-xs text-ink-400">Un momento…</div>}
          {errore && <div className="text-xs text-red-600 font-semibold">{errore}</div>}
          <div ref={fondoRef} />
        </div>

        <form onSubmit={submit} className="p-3 border-t border-ink-100 bg-ink-0 rounded-b-xl">
          <div className="flex gap-2 items-center">
            <input
              ref={campoRef}
              className="input flex-1"
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              placeholder={prima ? (campo === 'cliente' ? 'Scrivi il nome del cliente…' : campo === 'servizio' ? 'Scrivi il tipo di lavoro…' : campo === 'minuti' ? 'Scrivi la durata…' : 'Scrivi il giorno…') : 'Per chi hai lavorato, cosa hai fatto, per quanto tempo…'}
              maxLength={1000}
              disabled={inAttesa}
              data-test="campo-chat"
            />
            <Microfono
              attivo={contesto.ai.voce && contesto.ai.disponibile && !contesto.ai.limiteAudioRaggiunto}
              trascrivi={trascrivi}
              onTrascrizione={(t) => invia(t, 'VOCE')}
              onErrore={(m) => setErrore(m)}
            />
            <button className="btn btn-primary" disabled={inAttesa || !testo.trim()} aria-label="Invia" data-test="invia-chat">
              <Icona nome="frecciaDestra" size={16} />
            </button>
          </div>
          <div className="flex justify-between items-center mt-1.5 text-[11px] text-ink-400">
            <span>{contesto.ai.abilitata ? 'Riconoscimento con l’aiuto dell’AI; la conversazione non viene conservata.' : 'La conversazione non viene conservata.'}</span>
            <button type="button" className="text-teal-700 font-semibold" onClick={() => setAMano(true)} data-test="aggiungi-a-mano">Aggiungi a mano</button>
          </div>
        </form>
      </div>

      {aMano && (
        <FormRegistrazione
          contesto={contesto}
          iniziale={null}
          titolo="Aggiungi una registrazione"
          onClose={() => setAMano(false)}
          onSalvata={(reg) => { setAMano(false); aggiungi({ tipo: 'scheda', reg }); caricaRiepilogo(); }}
        />
      )}
      {modifica && (
        <FormRegistrazione
          contesto={contesto}
          iniziale={modifica}
          titolo="Modifica la registrazione"
          onClose={() => setModifica(null)}
          onSalvata={(reg) => { setModifica(null); setFlusso((f) => f.map((v) => (v.tipo === 'scheda' && v.reg.id === reg.id ? { tipo: 'scheda', reg } : v))); caricaRiepilogo(); }}
        />
      )}
      {daEliminare && (
        <ConfermaEliminazione
          titolo="la registrazione"
          elemento={`${daEliminare.clienteNome} · ${daEliminare.servizioNome} · ${durata(daEliminare.minuti)}`}
          conseguenze={<div>La registrazione viene eliminata. Nel registro delle operazioni resta traccia dell’annullamento.</div>}
          onConferma={() => annulla(daEliminare)}
          onClose={() => setDaEliminare(null)}
        />
      )}
      <PiedeLegale />
    </>
  );
}

function spiegaMotivi(motivi: string[]): string {
  const m = new Set(motivi);
  const parti: string[] = [];
  if (m.has('oltre_16_ore')) parti.push('la giornata supera le 16 ore');
  if (m.has('cliente_da_verificare')) parti.push('il cliente è nuovo e va completato');
  if (m.has('servizio_generico')) parti.push('il servizio è quello generico');
  return parti.length ? `Motivo: ${parti.join('; ')}.` : '';
}

function CercaClienteInChat({ clienti, onScelto, onChiudi }: { clienti: Contesto['clienti']; onScelto: (id: string) => void; onChiudi: () => void }) {
  const [q, setQ] = useState('');
  const filtrati = (q.trim() ? clienti.filter((c) => c.nome.toLowerCase().includes(q.trim().toLowerCase()) || c.alias.some((a) => a.includes(q.trim().toLowerCase()))) : clienti).slice(0, 8);
  return (
    <div className="card p-2" data-test="cerca-cliente">
      <div className="flex gap-2 mb-1">
        <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca nell’elenco dei clienti…" aria-label="Cerca cliente" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onChiudi} aria-label="Chiudi la ricerca"><Icona nome="x" size={14} /></button>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {filtrati.map((c) => (
          <button key={c.id} type="button" className="block w-full text-left px-2 py-1.5 text-sm rounded hover:bg-ink-100" onClick={() => onScelto(c.id)}>{c.nome}</button>
        ))}
        {filtrati.length === 0 && <div className="text-xs text-ink-400 px-2 py-1.5">Nessun cliente con questo nome.</div>}
      </div>
    </div>
  );
}
