import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Icona } from '../components/icone';

// ── Chat di assistenza in-app (AR-M10) ─────────────────────────
// Pulsante flottante + pannello. La conversazione vive SOLO nel
// browser: il server non la conserva. Compare quando l'assistente AI
// dello studio è abilitato (opt-in del titolare, AR-M9).

type Messaggio = { ruolo: 'utente' | 'assistente'; testo: string };

const SUGGERIMENTI = [
  'Da dove comincio con un cliente nuovo?',
  'Quando scatta la verifica rafforzata?',
  'Come registro il titolare effettivo?',
  'Cosa devo fare per il controllo costante?',
];

export function ChatAssistente() {
  const [disponibile, setDisponibile] = useState(false);
  const [aperta, setAperta] = useState(false);
  const [messaggi, setMessaggi] = useState<Messaggio[]>([]);
  const [testo, setTesto] = useState('');
  const [inAttesa, setInAttesa] = useState(false);
  const [errore, setErrore] = useState('');
  const fondoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<{ abilitata: boolean }>('/ai/stato').then((s) => setDisponibile(s.abilitata)).catch(() => setDisponibile(false));
  }, []);

  useEffect(() => {
    fondoRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messaggi, inAttesa]);

  if (!disponibile) return null;

  const invia = async (domanda: string) => {
    const pulita = domanda.trim();
    if (!pulita || inAttesa) return;
    setErrore('');
    const conversazione: Messaggio[] = [...messaggi, { ruolo: 'utente', testo: pulita }];
    setMessaggi(conversazione);
    setTesto('');
    setInAttesa(true);
    try {
      const r = await api.post<{ risposta: string }>('/ai/chat', { messaggi: conversazione });
      setMessaggi([...conversazione, { ruolo: 'assistente', testo: r.risposta }]);
    } catch (e) {
      setErrore((e as Error).message);
      setMessaggi(messaggi); // la domanda non consumata torna nel campo
      setTesto(pulita);
    } finally {
      setInAttesa(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    invia(testo);
  };

  return (
    <>
      {!aperta && (
        <button
          type="button"
          onClick={() => setAperta(true)}
          title="Assistente Contify AR"
          aria-label="Apri l'assistente"
          className="fixed bottom-5 right-5 z-40 w-13 h-13 rounded-full bg-teal-600 text-accento-on shadow-lg hover:bg-teal-700 transition-colors flex items-center justify-center"
          style={{ width: 52, height: 52 }}
        >
          <Icona nome="chat" size={24} />
        </button>
      )}

      {aperta && (
        <div className="fixed bottom-5 right-5 z-40 w-[380px] max-w-[calc(100vw-2rem)] card shadow-2xl flex flex-col" style={{ height: 520, maxHeight: 'calc(100vh - 4rem)' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100 bg-ink-0 rounded-t-xl">
            <div>
              <div className="font-bold text-ink-900 text-sm">Assistente Contify AR</div>
              <div className="text-[11px] text-ink-400">Uso del software e orientamento normativo</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setAperta(false)} aria-label="Chiudi">
              <Icona nome="x" size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-ink-50">
            {messaggi.length === 0 && (
              <div className="space-y-2">
                <p className="text-sm text-ink-500">
                  Chiedimi come si fa qualcosa in Contify AR o un orientamento sulla normativa.
                  <span className="font-semibold"> Descrivi i fatti, non le persone:</span> i nomi dell’archivio e i dati identificativi vengono comunque sostituiti da segnaposto prima dell’invio.
                </p>
                {SUGGERIMENTI.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="block w-full text-left text-sm px-3 py-2 rounded-lg bg-ink-0 border border-ink-100 hover:border-teal-300 hover:text-teal-800 transition-colors"
                    onClick={() => invia(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messaggi.map((m, i) => (
              <div key={i} className={m.ruolo === 'utente' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.ruolo === 'utente' ? 'bg-teal-600 text-accento-on' : 'bg-ink-0 border border-ink-100 text-ink-800'
                  }`}
                >
                  {m.testo}
                </div>
              </div>
            ))}
            {inAttesa && <div className="text-xs text-ink-400">L’assistente sta scrivendo…</div>}
            {errore && <div className="text-xs text-red-600 font-semibold">{errore}</div>}
            <div ref={fondoRef} />
          </div>

          <form onSubmit={submit} className="p-3 border-t border-ink-100 bg-ink-0 rounded-b-xl">
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={testo}
                onChange={(e) => setTesto(e.target.value)}
                placeholder="Scrivi una domanda…"
                maxLength={2000}
              />
              <button className="btn btn-primary" disabled={inAttesa || !testo.trim()} aria-label="Invia">
                <Icona nome="frecciaDestra" size={16} />
              </button>
            </div>
            <div className="text-[10px] text-ink-400 mt-1.5">
              Risposte generate con AI: possono contenere errori — verifica sempre sulle fonti. La conversazione non viene conservata.
            </div>
          </form>
        </div>
      )}
    </>
  );
}
