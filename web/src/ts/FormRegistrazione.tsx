import { useMemo, useState } from 'react';
import { api } from '../api';
import { Field, Modal } from '../components/ui';
import { durata, leggiDurata, type ClienteBreve, type Contesto, type Registrazione, type ServizioBreve } from './api';

// ── Contify Timesheet — modulo «Aggiungi a mano» / «Modifica» (TS-M1) ──
// Lo stesso modulo serve a creare una registrazione a mano e a correggerne una.
// Il cliente si sceglie da un campo di ricerca sull'elenco dello studio; la
// durata si scrive come si preferisce («1,5», «1:30», «90»); la data non può
// essere nel futuro. Il titolare può registrare a nome di un'altra persona.

export function CampoCliente({ clienti, valore, onChange, autoFocus, placeholder }: {
  clienti: ClienteBreve[];
  valore: string | null;
  onChange: (id: string | null) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const scelto = clienti.find((c) => c.id === valore) ?? null;
  const [ricerca, setRicerca] = useState('');
  const [aperto, setAperto] = useState(false);
  const filtrati = useMemo(() => {
    const q = ricerca.trim().toLowerCase();
    const base = q ? clienti.filter((c) => c.nome.toLowerCase().includes(q) || c.alias.some((a) => a.includes(q))) : clienti;
    return base.slice(0, 12);
  }, [clienti, ricerca]);
  if (scelto) {
    return (
      <div className="flex items-center gap-2">
        <span className="input flex-1 !py-1.5">{scelto.nome}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { onChange(null); setRicerca(''); setAperto(true); }}>Cambia</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input
        className="input"
        value={ricerca}
        autoFocus={autoFocus}
        placeholder={placeholder ?? 'Cerca il cliente…'}
        onChange={(e) => { setRicerca(e.target.value); setAperto(true); }}
        onFocus={() => setAperto(true)}
        onBlur={() => window.setTimeout(() => setAperto(false), 150)}
        aria-label="Cliente"
        data-test="campo-cliente"
      />
      {aperto && (
        <div className="absolute z-20 mt-1 w-full card shadow-lg max-h-64 overflow-y-auto">
          {filtrati.map((c) => (
            <button
              key={c.id}
              type="button"
              className="block w-full text-left px-3 py-2 text-sm hover:bg-ink-100"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(c.id); setAperto(false); }}
            >
              {c.nome}{c.daVerificare && <span className="pillola r3 ml-2">da verificare</span>}
            </button>
          ))}
          {filtrati.length === 0 && <div className="px-3 py-2 text-sm text-ink-400">Nessun cliente con questo nome.</div>}
        </div>
      )}
    </div>
  );
}

export interface ValoriRegistrazione {
  clienteId: string | null;
  servizioId: string | null;
  durata: string;
  data: string;
  nota: string;
  utenteId?: string | null;
}

export function FormRegistrazione({ contesto, iniziale, titolo, persone, onSalvata, onClose }: {
  contesto: Contesto;
  /** Registrazione da modificare, oppure valori di partenza per una nuova. */
  iniziale: Registrazione | Partial<ValoriRegistrazione> | null;
  titolo: string;
  /** Per il titolare: le persone a nome delle quali può registrare. */
  persone?: Array<{ utenteId: string; nome: string }>;
  onSalvata: (r: Registrazione) => void;
  onClose: () => void;
}) {
  const modifica = !!iniziale && 'id' in iniziale;
  const reg = modifica ? (iniziale as Registrazione) : null;
  const init = !modifica ? (iniziale as Partial<ValoriRegistrazione> | null) : null;
  const [v, setV] = useState<ValoriRegistrazione>({
    clienteId: reg?.clienteId ?? init?.clienteId ?? null,
    servizioId: reg?.servizioId ?? init?.servizioId ?? null,
    durata: reg ? durata(reg.minuti) : init?.durata ?? '',
    data: reg?.data ?? init?.data ?? contesto.oggi,
    nota: reg?.nota ?? init?.nota ?? '',
    utenteId: reg?.utenteId ?? init?.utenteId ?? null,
  });
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const minuti = leggiDurata(v.durata.replace(' h ', ':').replace(/\s*h$/, 'h').replace(/\s*min$/, 'm'));
  const servizi: ServizioBreve[] = [...contesto.servizi.filter((s) => !s.generico), ...contesto.servizi.filter((s) => s.generico)];
  const valido = !!v.clienteId && !!v.servizioId && minuti != null && minuti >= 1 && minuti <= 1440 && !!v.data && v.data <= contesto.oggi;

  const salva = async () => {
    if (!valido) return;
    setErrore('');
    setInvio(true);
    try {
      if (reg) {
        const r = await api.post<{ registrazione: Registrazione }>(`/ts/registrazioni/${reg.id}`, {
          clienteId: v.clienteId, servizioId: v.servizioId, minuti, data: v.data, nota: v.nota.trim() || null,
        });
        onSalvata(r.registrazione);
      } else {
        const r = await api.post<{ registrazioni: Registrazione[] }>('/ts/registrazioni', {
          clienteId: v.clienteId, servizioId: v.servizioId, minuti, data: v.data, nota: v.nota.trim() || null, origine: 'MANUALE', motore: 'MANUALE',
          ...(v.utenteId ? { utenteId: v.utenteId } : {}),
        });
        onSalvata(r.registrazioni[0]);
      }
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setInvio(false);
    }
  };

  return (
    <Modal title={titolo} onClose={onClose}>
      <div className="space-y-3" data-test="form-registrazione">
        {persone && persone.length > 1 && !reg && (
          <Field label="Per chi">
            <select className="input" value={v.utenteId ?? ''} onChange={(e) => setV({ ...v, utenteId: e.target.value || null })}>
              <option value="">Me</option>
              {persone.map((p) => <option key={p.utenteId} value={p.utenteId}>{p.nome}</option>)}
            </select>
          </Field>
        )}
        <Field label="Cliente">
          <CampoCliente clienti={contesto.clienti} valore={v.clienteId} onChange={(id) => setV({ ...v, clienteId: id })} autoFocus={!v.clienteId} />
        </Field>
        <Field label="Servizio">
          <select className="input" value={v.servizioId ?? ''} onChange={(e) => setV({ ...v, servizioId: e.target.value || null })} data-test="campo-servizio">
            <option value="">— scegli —</option>
            {servizi.map((s) => <option key={s.id} value={s.id}>{s.nome}{s.generico ? ' (generico)' : ''}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Durata">
            <input className="input" value={v.durata} onChange={(e) => setV({ ...v, durata: e.target.value })} placeholder="1:30, 1,5 o 90" data-test="campo-durata" />
            <div className="aiuto mt-1">{minuti != null ? `= ${durata(minuti)}` : 'ore e minuti, per esempio 1:30'}</div>
          </Field>
          <Field label="Giorno">
            <input className="input" type="date" value={v.data} max={contesto.oggi} onChange={(e) => setV({ ...v, data: e.target.value })} data-test="campo-data" />
          </Field>
        </div>
        <Field label="Nota (facoltativa)">
          <input className="input" value={v.nota} maxLength={500} onChange={(e) => setV({ ...v, nota: e.target.value })} placeholder="Dettagli del lavoro" />
        </Field>
        {errore && <div className="errore">{errore}</div>}
        <div className="flex gap-2 justify-end pt-1">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Annulla</button>
          <button type="button" className="btn btn-primary" onClick={salva} disabled={!valido || invio} data-test="salva-registrazione">{invio ? 'Salvo…' : reg ? 'Salva le modifiche' : 'Registra'}</button>
        </div>
      </div>
    </Modal>
  );
}
