/**
 * I professionisti dello studio (AR-M15).
 *
 * In uno studio associato più associati identificano i clienti e firmano
 * ciascuno per i propri: serve poterli scegliere quando si apre un cliente o
 * un fascicolo, e poter filtrare gli elenchi per «i miei». La visibilità
 * resta di studio — questo è un filtro, non una barriera.
 */

import { useEffect, useState } from 'react';
import { api } from '../api';

export interface Professionista {
  id: string;
  nome: string;
  email: string;
  amministratore: boolean;
  attivo: boolean;
  qualifica?: string | null;
  ordine?: string | null;
  numeroIscrizione?: string | null;
  codiceFiscale?: string | null;
}

export function useProfessionisti(): Professionista[] {
  const [elenco, setElenco] = useState<Professionista[]>([]);
  useEffect(() => {
    api.get<Professionista[]>('/studio/professionisti').then(setElenco).catch(() => setElenco([]));
  }, []);
  return elenco;
}

export function nomeProfessionista(elenco: Professionista[], id?: string | null): string {
  if (!id) return '—';
  const p = elenco.find((x) => x.id === id);
  return p ? [p.qualifica, p.nome].filter(Boolean).join(' ') : '—';
}

/**
 * Il filtro «professionista» sugli elenchi. Compare solo quando i
 * professionisti attivi sono più d'uno: in uno studio individuale sarebbe
 * una tendina con una sola voce, cioè rumore.
 */
export function FiltroProfessionista({ elenco, valore, onCambia, etichetta = 'Professionista' }: {
  elenco: Professionista[];
  valore: string;
  onCambia: (v: string) => void;
  etichetta?: string;
}) {
  const attivi = elenco.filter((p) => p.attivo);
  if (attivi.length < 2) return null;
  return (
    <label style={{ fontWeight: 400, marginRight: 16 }}>
      {etichetta}:{' '}
      <select
        style={{ width: 'auto', display: 'inline-block' }}
        value={valore}
        onChange={(e) => onCambia(e.target.value)}
      >
        <option value="">Tutti</option>
        {attivi.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
      </select>
    </label>
  );
}

/** Scelta del professionista incaricato in un form. */
export function CampoProfessionista({ elenco, valore, onCambia, etichetta, aiuto }: {
  elenco: Professionista[];
  valore: string | null | undefined;
  onCambia: (v: string) => void;
  etichetta: string;
  aiuto?: string;
}) {
  const attivi = elenco.filter((p) => p.attivo);
  return (
    <div className="campo">
      <label>{etichetta}</label>
      <select value={valore ?? ''} onChange={(e) => onCambia(e.target.value)}>
        <option value="">Seleziona…</option>
        {attivi.map((p) => (
          <option key={p.id} value={p.id}>
            {[p.qualifica, p.nome].filter(Boolean).join(' ')}
          </option>
        ))}
      </select>
      {aiuto && <div className="aiuto">{aiuto}</div>}
    </div>
  );
}
