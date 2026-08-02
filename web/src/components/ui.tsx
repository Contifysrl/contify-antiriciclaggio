import { ReactNode, useEffect, useState } from 'react';
import { I, Icona } from './icone';

// ── Componenti UI del design system (portati da Assist, AR-M2) ─────

/** Help contestuale: "?" accanto ai titoli, apre la sezione della guida (AR-M5). */
export function HelpLink({ sezione }: { sezione: string }) {
  return (
    <a
      href={`#guida?sezione=${sezione}`}
      title="Apri la guida di questa pagina"
      aria-label="Guida di questa pagina"
      className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-ink-200 bg-ink-0 text-ink-400 text-xs font-bold hover:text-teal-700 hover:border-teal-300 transition-colors align-middle ml-2 no-underline"
    >
      ?
    </a>
  );
}

/** "Barbara Bettini" → "BB". */
export function iniziali(nome: string): string {
  const parti = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parti.length) return '?';
  const prima = parti[0][0] ?? '';
  const seconda = parti.length > 1 ? parti[parti.length - 1][0] ?? '' : '';
  return (prima + seconda).toUpperCase() || '?';
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div
        className={`card w-full ${wide ? 'max-w-4xl' : 'max-w-xl'} my-8`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-ink-100">
          <h2 className="font-bold text-ink-900 !m-0 !text-base">{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Chiudi">{I.x}</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** Cerchietto utente: per ora solo iniziali su teal (foto profilo in AR-M3). */
export function AvatarUtente({ nome, avatar, size = 40, className }: { nome: string; avatar?: string | null; size?: number; className?: string }) {
  return avatar ? (
    <img
      src={avatar}
      alt={`Foto profilo di ${nome}`}
      width={size}
      height={size}
      className={`rounded-full object-cover shrink-0 ${className ?? ''}`}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`rounded-full bg-teal-600 text-accento-on font-bold flex items-center justify-center shrink-0 select-none ${className ?? ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {iniziali(nome)}
    </span>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-16 px-4">
      <div className="mx-auto w-14 h-14 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mb-3"><Icona nome="pacco" size={26} /></div>
      <div className="font-bold text-ink-700">{title}</div>
      {hint && <div className="text-sm text-ink-400 mt-1 max-w-md mx-auto">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <svg className="animate-spin text-teal-600" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    </div>
  );
}

export function Badge({ children, tone = 'teal' }: { children: ReactNode; tone?: 'teal' | 'gray' | 'amber' | 'red' }) {
  const cls = {
    teal: 'bg-teal-600/10 text-teal-700',
    gray: 'bg-ink-500/10 text-ink-600',
    amber: 'bg-amber-500/15 text-amber-700',
    red: 'bg-red-500/10 text-red-700',
  }[tone];
  return <span className={`inline-block max-w-full truncate align-middle px-2.5 py-[3px] rounded-full text-[11px] leading-4 font-semibold ${cls}`}>{children}</span>;
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 mb-4">
      <span>{message}</span>
      {onDismiss && <button className="font-bold ml-3" onClick={onDismiss} aria-label="Chiudi">{I.x}</button>}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative flex-1 max-w-md">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300"><Icona nome="cerca" size={15} /></span>
      <input className="input pl-8" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

// ── Vista elenco/griglia ───────────────────────────────────────
// La scelta è ricordata per pagina; sotto i 768px la griglia è forzata.

export type Vista = 'elenco' | 'griglia';

const MQ_MOBILE = '(max-width: 767px)';

function useSchermoPiccolo(): boolean {
  const [piccolo, setPiccolo] = useState<boolean>(() => window.matchMedia(MQ_MOBILE).matches);
  useEffect(() => {
    const mq = window.matchMedia(MQ_MOBILE);
    const onChange = (e: MediaQueryListEvent) => setPiccolo(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return piccolo;
}

export function useVista(chiave: string): [Vista, (v: Vista) => void] {
  const [vista, setVista] = useState<Vista>(() =>
    (localStorage.getItem(`ar-vista-${chiave}`) === 'griglia' ? 'griglia' : 'elenco'));
  const schermoPiccolo = useSchermoPiccolo();
  const cambia = (v: Vista) => {
    setVista(v);
    try { localStorage.setItem(`ar-vista-${chiave}`, v); } catch { /* modalità privata */ }
  };
  return [schermoPiccolo ? 'griglia' : vista, cambia];
}

export function VistaToggle({ vista, onChange }: { vista: Vista; onChange: (v: Vista) => void }) {
  const cls = (attiva: boolean) =>
    `p-2 rounded-lg transition-colors ${attiva ? 'bg-teal-600 text-accento-on' : 'text-ink-400 hover:bg-ink-100 hover:text-ink-700'}`;
  return (
    <div className="hidden md:flex gap-1 bg-ink-0 border border-ink-100 rounded-xl p-1 shrink-0" role="group" aria-label="Modo di visualizzazione">
      <button type="button" className={cls(vista === 'elenco')} title="Vista a elenco"
        aria-pressed={vista === 'elenco'} onClick={() => onChange('elenco')}>
        <Icona nome="elenco" size={16} />
      </button>
      <button type="button" className={cls(vista === 'griglia')} title="Vista a griglia"
        aria-pressed={vista === 'griglia'} onClick={() => onChange('griglia')}>
        <Icona nome="griglia" size={16} />
      </button>
    </div>
  );
}

// ── Conferma di eliminazione in DUE passaggi ───────────────────
// Niente window.confirm: un modal che dice chiaramente COSA si sta
// eliminando e le conseguenze; il secondo passaggio è rosso e definitivo.
// In AR le eliminazioni sono rare per costruzione (conservazione ex artt.
// 31-32): il componente arriva ora per le anagrafiche e per AR-M4.

export function ConfermaEliminazione({ titolo, elemento, conseguenze, onConferma, onClose }: {
  titolo: string;
  elemento: string;
  conseguenze?: ReactNode;
  onConferma: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [inCorso, setInCorso] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && !inCorso && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose, inCorso]);

  const conferma = async () => {
    setInCorso(true);
    try {
      await onConferma();
      onClose();
    } finally {
      setInCorso(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 backdrop-blur-sm p-4 overflow-y-auto" onClick={() => !inCorso && onClose()}>
      <div className="card w-full max-w-md my-24" onClick={(e) => e.stopPropagation()}>
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0">
              <Icona nome={step === 1 ? 'cestino' : 'avviso'} size={18} />
            </span>
            <h2 className="font-bold text-ink-900 !m-0 !text-base">
              {step === 1 ? `Eliminare ${titolo}?` : 'Vuoi davvero proseguire?'}
            </h2>
          </div>
          <div className="text-sm text-ink-600 mb-1">
            {step === 1 ? <>Stai per eliminare {titolo}:</> : <>L’eliminazione di</>}
          </div>
          <div className="font-bold text-ink-900 mb-2 break-words">{elemento}</div>
          {step === 1
            ? conseguenze && <div className="text-sm text-ink-500 space-y-1">{conseguenze}</div>
            : <div className="text-sm text-red-700">è definitiva e non può essere annullata.</div>}
          <div className="flex justify-end gap-2 mt-5">
            <button className="btn btn-secondary" onClick={onClose} disabled={inCorso}>Annulla</button>
            {step === 1 ? (
              <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={() => setStep(2)}>Elimina</button>
            ) : (
              <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={conferma} disabled={inCorso}>
                {inCorso ? 'Eliminazione…' : 'Elimina definitivamente'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
