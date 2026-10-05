import { useEffect, useRef, useState } from 'react';
import { Icona } from '../components/icone';

// ── Contify Timesheet — dettatura (TS-M1, M1.4) ─────────────────
// Un tocco avvia, un tocco ferma; arresto automatico a 60 secondi. Gli stati
// si leggono anche senza il colore («In ascolto… 0:07», «Trascrivo…»). L'audio
// va al server che lo trascrive e non lo conserva; qui resta solo finché la
// trascrizione non è arrivata. Se il microfono è negato o assente, il
// messaggio ricorda la dettatura della tastiera, che funziona comunque.

export const SECONDI_MASSIMI = 60;

function formatoSupportato(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const f of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(f)) return f;
  }
  return null;
}

export type StatoMicrofono = 'pronto' | 'ascolto' | 'trascrizione' | 'errore';

export function Microfono({ attivo, onTrascrizione, onErrore, trascrivi }: {
  /** Voce consentita per lo studio e disponibile. */
  attivo: boolean;
  onTrascrizione: (testo: string) => void;
  onErrore: (messaggio: string) => void;
  /** Invia l'audio al server; restituisce il testo (vuoto se scartato). */
  trascrivi: (audio: Blob, secondi: number) => Promise<string>;
}) {
  const [stato, setStato] = useState<StatoMicrofono>('pronto');
  const [secondi, setSecondi] = useState(0);
  const registratore = useRef<MediaRecorder | null>(null);
  const pezzi = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const inizio = useRef(0);
  const flusso = useRef<MediaStream | null>(null);

  const pulisci = () => {
    if (timer.current) { window.clearInterval(timer.current); timer.current = null; }
    flusso.current?.getTracks().forEach((t) => t.stop());
    flusso.current = null;
    registratore.current = null;
  };
  useEffect(() => () => pulisci(), []);

  const ferma = () => {
    const r = registratore.current;
    if (r && r.state !== 'inactive') r.stop();
  };

  const avvia = async () => {
    const formato = formatoSupportato();
    if (!formato || !navigator.mediaDevices?.getUserMedia) {
      onErrore('Questo browser non permette di registrare l’audio. Puoi usare la dettatura della tastiera del telefono o scrivere.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      flusso.current = stream;
      const r = new MediaRecorder(stream, { mimeType: formato });
      pezzi.current = [];
      r.ondataavailable = (e) => { if (e.data.size) pezzi.current.push(e.data); };
      r.onstop = async () => {
        const durata = Math.max(1, Math.round((Date.now() - inizio.current) / 1000));
        const audio = new Blob(pezzi.current, { type: formato.split(';')[0] });
        pulisci();
        if (durata < 1 || audio.size < 1000) { setStato('pronto'); setSecondi(0); return; }
        setStato('trascrizione');
        try {
          const testo = await trascrivi(audio, durata);
          if (testo) onTrascrizione(testo);
          else onErrore('Non ho sentito nulla: riprova parlando più vicino al microfono, o scrivi.');
          setStato('pronto');
        } catch (e) {
          setStato('errore');
          onErrore((e as Error).message);
          window.setTimeout(() => setStato('pronto'), 1500);
        } finally {
          setSecondi(0);
        }
      };
      registratore.current = r;
      inizio.current = Date.now();
      setSecondi(0);
      setStato('ascolto');
      r.start(250);
      timer.current = window.setInterval(() => {
        const s = Math.round((Date.now() - inizio.current) / 1000);
        setSecondi(s);
        if (s >= SECONDI_MASSIMI) ferma();
      }, 250);
    } catch {
      pulisci();
      setStato('pronto');
      onErrore('Il microfono non è disponibile: controlla il permesso nelle impostazioni del browser. Puoi comunque usare la dettatura della tastiera o scrivere.');
    }
  };

  if (!attivo) return null;
  const mmss = `${Math.floor(secondi / 60)}:${String(secondi % 60).padStart(2, '0')}`;
  const etichetta = stato === 'ascolto' ? `In ascolto… ${mmss}` : stato === 'trascrizione' ? 'Trascrivo…' : stato === 'errore' ? 'Non riuscito' : 'Detta a voce';

  return (
    <span className="inline-flex items-center gap-2" data-test="microfono" data-stato={stato}>
      <button
        type="button"
        className={`btn ${stato === 'ascolto' ? 'btn-primary' : 'btn-secondary'}`}
        onClick={stato === 'ascolto' ? ferma : stato === 'pronto' ? avvia : undefined}
        disabled={stato === 'trascrizione'}
        aria-label={stato === 'ascolto' ? 'Ferma la registrazione' : 'Detta a voce'}
        aria-pressed={stato === 'ascolto'}
        title={stato === 'ascolto' ? 'Tocca per fermare' : 'Tocca per dettare (al massimo un minuto)'}
      >
        <Icona nome="microfono" size={16} />
        <span className="text-xs">{etichetta}</span>
      </button>
    </span>
  );
}
