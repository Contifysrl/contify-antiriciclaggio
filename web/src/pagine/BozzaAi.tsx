import { useState } from 'react';
import { api } from '../api';

// ── Bozza AI dei campi discorsivi (AR-M9) ──────────────────────
// Un bottone accanto al campo: la bozza generata SOSTITUISCE il testo
// nel campo, dove resta modificabile. Chi firma assume la bozza come
// propria: l'interfaccia lo ricorda ogni volta.

export function BozzaAi({ tipo, contesto, onBozza }: {
  tipo: 'SCOPO_NATURA' | 'MOTIVAZIONE_ASTENSIONE';
  contesto: { fascicoloId?: string; fondamento?: string; appunti?: string };
  onBozza: (testo: string) => void;
}) {
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState('');
  const [generata, setGenerata] = useState(false);

  const genera = async () => {
    setErrore('');
    setInCorso(true);
    try {
      const r = await api.post<{ bozza: string }>('/ai/bozza', { tipo, ...contesto });
      onBozza(r.bozza);
      setGenerata(true);
    } catch (e) {
      setErrore((e as Error).message);
    } finally {
      setInCorso(false);
    }
  };

  return (
    <div style={{ marginTop: 6 }}>
      <button type="button" className="azione secondaria" onClick={genera} disabled={inCorso}>
        {inCorso ? 'L’assistente scrive…' : generata ? 'Rigenera la bozza (AI)' : 'Bozza con l’AI'}
      </button>
      {generata && !errore && (
        <span className="aiuto" style={{ display: 'inline', marginLeft: 10 }}>
          Bozza generata con AI: rivedila e correggila — firmandola la assumi come tua.
        </span>
      )}
      {errore && <div className="errore">{errore}</div>}
    </div>
  );
}
