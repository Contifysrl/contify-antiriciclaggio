import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Field, HelpLink, Modal } from '../components/ui';
import { PiedeLegale } from '../componenti';
import { euro, type Servizio } from './api';

// ── Contify Timesheet — Servizi e tariffe (TS-M1, titolare) ─────
// I tipi di lavoro dello studio con la tariffa oraria e le parole chiave che
// il programma riconosce nelle frasi. La tariffa si fotografa sulla
// registrazione quando viene salvata (B13): cambiarla non riscrive il passato.
// Il servizio generico («Altro») resta sempre attivo. Le tariffe sono dati
// dello studio, non prezzi di Contify.

export function TsServizi() {
  const [servizi, setServizi] = useState<Servizio[]>([]);
  const [errore, setErrore] = useState('');
  const [aperto, setAperto] = useState<Servizio | 'nuovo' | null>(null);

  const carica = () => api.get<{ servizi: Servizio[] }>('/ts/servizi').then((r) => setServizi(r.servizi)).catch((e) => setErrore((e as Error).message));
  useEffect(() => { carica(); }, []);

  const sposta = async (s: Servizio, delta: number) => {
    const ordinati = [...servizi].sort((a, b) => a.ordine - b.ordine || a.nome.localeCompare(b.nome));
    const i = ordinati.findIndex((x) => x.id === s.id);
    const j = i + delta;
    if (j < 0 || j >= ordinati.length) return;
    [ordinati[i], ordinati[j]] = [ordinati[j], ordinati[i]];
    try {
      await Promise.all(ordinati.map((x, k) => (x.ordine !== k ? api.post(`/ts/servizi/${x.id}`, { ordine: k }) : Promise.resolve())));
      carica();
    } catch (e) { setErrore((e as Error).message); }
  };

  const predefiniti = async () => {
    try { await api.post('/ts/servizi/predefiniti'); carica(); } catch (e) { setErrore((e as Error).message); }
  };

  return (
    <>
      <h1>Servizi e tariffe <HelpLink sezione="ts-servizi" /></h1>
      <p className="occhiello">I tipi di lavoro che lo studio registra, con la tariffa oraria e le parole che il programma riconosce nelle frasi. La tariffa in vigore viene copiata su ogni registrazione al momento del salvataggio: cambiarla non modifica le ore già registrate.</p>
      <div className="flex gap-2 mb-3">
        <button type="button" className="btn btn-primary" onClick={() => setAperto('nuovo')} data-test="nuovo-servizio">Nuovo servizio</button>
        {servizi.length === 0 && <button type="button" className="btn btn-secondary" onClick={predefiniti} data-test="crea-predefiniti">Crea i servizi predefiniti</button>}
      </div>
      {errore && <div className="errore">{errore}</div>}
      <div className="scheda">
        <table>
          <thead><tr><th></th><th>Servizio</th><th>Tariffa oraria</th><th>Parole chiave</th><th>Stato</th><th></th></tr></thead>
          <tbody>
            {[...servizi].sort((a, b) => a.ordine - b.ordine || a.nome.localeCompare(b.nome)).map((s, i, arr) => (
              <tr key={s.id} style={{ opacity: s.attivo ? 1 : 0.55 }} data-test="riga-servizio">
                <td className="whitespace-nowrap">
                  <button type="button" className="btn btn-ghost btn-sm" aria-label="Sposta su" disabled={i === 0} onClick={() => sposta(s, -1)}>↑</button>
                  <button type="button" className="btn btn-ghost btn-sm" aria-label="Sposta giù" disabled={i === arr.length - 1} onClick={() => sposta(s, 1)}>↓</button>
                </td>
                <td><strong>{s.nome}</strong>{s.generico && <Badge tone="gray">generico</Badge>}</td>
                <td className="mono">{euro(s.tariffaOrariaCent)}</td>
                <td className="text-sm text-ink-500">{s.paroleChiave.join(', ') || (s.generico ? 'si sceglie solo a mano' : '—')}</td>
                <td>{s.attivo ? <Badge tone="teal">attivo</Badge> : <Badge tone="gray">non attivo</Badge>}</td>
                <td className="text-right"><button type="button" className="btn btn-secondary btn-sm" onClick={() => setAperto(s)}>Modifica</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {servizi.length === 0 && <p className="caricamento">Nessun servizio: crea i predefiniti o aggiungine uno.</p>}
      </div>
      {aperto && <ModalServizio servizio={aperto === 'nuovo' ? null : aperto} onClose={() => setAperto(null)} onFatto={() => { setAperto(null); carica(); }} />}
      <PiedeLegale />
    </>
  );
}

function ModalServizio({ servizio, onClose, onFatto }: { servizio: Servizio | null; onClose: () => void; onFatto: () => void }) {
  const [nome, setNome] = useState(servizio?.nome ?? '');
  const [tariffa, setTariffa] = useState(servizio ? (servizio.tariffaOrariaCent / 100).toLocaleString('it-IT', { minimumFractionDigits: 2 }) : '');
  const [parole, setParole] = useState((servizio?.paroleChiave ?? []).join(', '));
  const [attivo, setAttivo] = useState(servizio?.attivo ?? true);
  const [errore, setErrore] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const cent = Math.round(Number(tariffa.replace(/\./g, '').replace(',', '.')) * 100);
  const valido = nome.trim() && Number.isFinite(cent) && cent >= 0;

  const salva = async () => {
    setErrore(''); setInCorso(true);
    try {
      const corpo = { nome: nome.trim(), tariffaOrariaCent: cent, paroleChiave: parole.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean), attivo };
      await api.post(servizio ? `/ts/servizi/${servizio.id}` : '/ts/servizi', corpo);
      onFatto();
    } catch (e) { setErrore((e as Error).message); } finally { setInCorso(false); }
  };

  return (
    <Modal title={servizio ? servizio.nome : 'Nuovo servizio'} onClose={onClose}>
      <div className="space-y-3" data-test="modal-servizio">
        <Field label="Nome"><input className="input" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} data-test="servizio-nome" /></Field>
        <Field label="Tariffa oraria (€)"><input className="input mono !w-40" value={tariffa} onChange={(e) => setTariffa(e.target.value)} placeholder="0,00" data-test="servizio-tariffa" /></Field>
        {!servizio?.generico && (
          <Field label="Parole chiave">
            <textarea className="input" rows={3} value={parole} onChange={(e) => setParole(e.target.value)} placeholder="contabil, fattur, prima nota" />
            <div className="aiuto mt-1">Separate da virgola. Una radice vale per tutte le parole che iniziano così: «contabil» riconosce contabilità e contabile. Due parole insieme («prima nota») devono comparire una dopo l’altra.</div>
          </Field>
        )}
        {!servizio?.generico && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="!w-4" checked={attivo} onChange={(e) => setAttivo(e.target.checked)} />Attivo (si può usare nelle registrazioni nuove)</label>}
        {errore && <div className="errore">{errore}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Annulla</button>
          <button type="button" className="btn btn-primary" onClick={salva} disabled={!valido || inCorso} data-test="salva-servizio">{inCorso ? 'Salvo…' : 'Salva'}</button>
        </div>
      </div>
    </Modal>
  );
}
