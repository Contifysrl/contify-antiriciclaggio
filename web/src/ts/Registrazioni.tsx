import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { ConfermaEliminazione, HelpLink, VistaToggle, useVista } from '../components/ui';
import { PiedeLegale, Tessera } from '../componenti';
import { FormRegistrazione } from './FormRegistrazione';
import { dataBreve, dataLunga, durata, euro, ore, type Contesto, type PersonaTs, type Registrazione } from './api';

// ── Contify Timesheet — Registrazioni (TS-M1, titolare) ─────────
// Tutte le registrazioni dello studio con filtri per persona, cliente,
// servizio, periodo e «da verificare»; totali in testa; riga cliccabile apre
// la modifica; export in Excel delle registrazioni filtrate.

function primoDelMese(iso: string): string { return `${iso.slice(0, 7)}-01`; }

export function TsRegistrazioni() {
  const [contesto, setContesto] = useState<Contesto | null>(null);
  const [persone, setPersone] = useState<PersonaTs[]>([]);
  const [righe, setRighe] = useState<Registrazione[]>([]);
  const [filtri, setFiltri] = useState({ utenteId: '', clienteId: '', servizioId: '', da: '', a: '', daVerificare: false });
  const [errore, setErrore] = useState('');
  const [modifica, setModifica] = useState<Registrazione | null>(null);
  const [nuova, setNuova] = useState(false);
  const [daEliminare, setDaEliminare] = useState<Registrazione | null>(null);
  const [vista, setVista] = useVista('ts-registrazioni');

  useEffect(() => {
    api.get<Contesto>('/ts/contesto').then((c) => { setContesto(c); setFiltri((f) => ({ ...f, da: primoDelMese(c.oggi), a: c.oggi })); }).catch((e) => setErrore((e as Error).message));
    api.get<{ persone: PersonaTs[] }>('/ts/persone').then((r) => setPersone(r.persone)).catch(() => { /* niente filtro persona */ });
  }, []);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (filtri.utenteId) q.set('utenteId', filtri.utenteId);
    if (filtri.clienteId) q.set('clienteId', filtri.clienteId);
    if (filtri.servizioId) q.set('servizioId', filtri.servizioId);
    if (filtri.da) q.set('da', filtri.da);
    if (filtri.a) q.set('a', filtri.a);
    if (filtri.daVerificare) q.set('daVerificare', '1');
    return q.toString();
  }, [filtri]);

  const carica = () => {
    if (!contesto) return;
    api.get<{ registrazioni: Registrazione[] }>(`/ts/registrazioni?${query}`).then((r) => setRighe(r.registrazioni)).catch((e) => setErrore((e as Error).message));
  };
  useEffect(carica, [query, contesto]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!contesto) return <div className="caricamento">{errore || 'Caricamento…'}</div>;
  const minuti = righe.reduce((s, r) => s + r.minuti, 0);
  const valore = righe.reduce((s, r) => s + (r.tariffaCent != null ? Math.round((r.minuti / 60) * r.tariffaCent) : 0), 0);
  const nDaVerificare = righe.filter((r) => r.daVerificare).length;
  const personeAttive = persone.filter((p) => p.attivo && (p.tsRuolo || p.amministratore));

  return (
    <>
      <h1>Registrazioni <HelpLink sezione="ts-registrazioni" /></h1>
      <p className="occhiello">Il lavoro registrato da tutte le persone dello studio. Le registrazioni «da verificare» hanno un cliente nuovo, il servizio generico o una giornata oltre le 16 ore: controllale e togli il segno.</p>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-4">
        <Tessera etichetta="Registrazioni" valore={righe.length} />
        <Tessera etichetta="Ore" valore={ore(minuti)} />
        <Tessera etichetta="Valore a tariffa" valore={euro(valore)} nota="ore × tariffa oraria del servizio al momento della registrazione" />
        <Tessera etichetta="Da verificare" valore={nDaVerificare} />
      </div>

      <div className="scheda">
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-xs text-ink-500">Persona<br />
            <select className="input !w-44" value={filtri.utenteId} onChange={(e) => setFiltri({ ...filtri, utenteId: e.target.value })} data-test="filtro-persona">
              <option value="">Tutte</option>
              {personeAttive.map((p) => <option key={p.utenteId} value={p.utenteId}>{p.nome}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-500">Cliente<br />
            <select className="input !w-52" value={filtri.clienteId} onChange={(e) => setFiltri({ ...filtri, clienteId: e.target.value })}>
              <option value="">Tutti</option>
              {contesto.clienti.filter((c) => !c.id.startsWith('ar:')).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-500">Servizio<br />
            <select className="input !w-44" value={filtri.servizioId} onChange={(e) => setFiltri({ ...filtri, servizioId: e.target.value })}>
              <option value="">Tutti</option>
              {contesto.servizi.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-500">Dal<br /><input type="date" className="input !w-40" value={filtri.da} max={contesto.oggi} onChange={(e) => setFiltri({ ...filtri, da: e.target.value })} /></label>
          <label className="text-xs text-ink-500">Al<br /><input type="date" className="input !w-40" value={filtri.a} max={contesto.oggi} onChange={(e) => setFiltri({ ...filtri, a: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" className="!w-4" checked={filtri.daVerificare} onChange={(e) => setFiltri({ ...filtri, daVerificare: e.target.checked })} />Solo da verificare</label>
          <div className="ml-auto flex gap-2 items-center">
            <VistaToggle vista={vista} onChange={setVista} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => api.scarica(`/ts/registrazioni/export?${query}`).catch((e) => setErrore(e.message))} data-test="export">Esporta in Excel</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setNuova(true)}>Aggiungi a mano</button>
          </div>
        </div>
        {errore && <div className="errore">{errore}</div>}

        {vista === 'elenco' ? (
          <table className="mt-3">
            <thead><tr><th>Giorno</th><th>Persona</th><th>Cliente</th><th>Servizio</th><th>Durata</th><th>Tariffa</th><th>Nota</th><th>Origine</th><th></th></tr></thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setModifica(r)} title="Apri la registrazione" data-test="riga-registrazione">
                  <td className="mono">{dataBreve(r.data)}</td>
                  <td>{r.utenteNome}</td>
                  <td><strong>{r.clienteNome}</strong>{r.daVerificare && <span className="pillola r3 ml-2">da verificare</span>}</td>
                  <td>{r.servizioNome}</td>
                  <td className="mono">{durata(r.minuti)}</td>
                  <td className="mono">{r.tariffaCent != null ? euro(r.tariffaCent) : '—'}</td>
                  <td className="text-sm text-ink-500">{r.nota ?? ''}</td>
                  <td className="text-xs text-ink-400">{r.origine === 'VOCE' ? 'voce' : r.origine === 'CHAT' ? 'chat' : 'a mano'}{r.motore === 'AI' ? ' · AI' : ''}</td>
                  <td className="text-right whitespace-nowrap">{!r.proformaId && <button type="button" className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); setDaEliminare(r); }}>Elimina</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 mt-3">
            {righe.map((r) => (
              <button key={r.id} type="button" className="card p-3 text-left hover:border-teal-300" onClick={() => setModifica(r)}>
                <div className="text-xs text-ink-400">{dataLunga(r.data, contesto.oggi)} · {r.utenteNome}</div>
                <div className="font-semibold text-ink-900">{r.clienteNome}</div>
                <div className="text-sm text-ink-600">{r.servizioNome} · <span className="font-mono">{durata(r.minuti)}</span></div>
                {r.daVerificare && <span className="pillola r3 mt-1">da verificare</span>}
              </button>
            ))}
          </div>
        )}
        {righe.length === 0 && <p className="caricamento">Nessuna registrazione con questi filtri.</p>}
      </div>

      {nuova && (
        <FormRegistrazione contesto={contesto} iniziale={null} titolo="Aggiungi una registrazione" persone={personeAttive.map((p) => ({ utenteId: p.utenteId, nome: p.nome }))} onClose={() => setNuova(false)} onSalvata={() => { setNuova(false); carica(); }} />
      )}
      {modifica && (
        <ModificaTitolare contesto={contesto} reg={modifica} onClose={() => setModifica(null)} onSalvata={() => { setModifica(null); carica(); }} />
      )}
      {daEliminare && (
        <ConfermaEliminazione
          titolo="la registrazione"
          elemento={`${daEliminare.utenteNome} · ${daEliminare.clienteNome} · ${durata(daEliminare.minuti)} · ${dataLunga(daEliminare.data)}`}
          conseguenze={<div>Nel registro delle operazioni resta traccia dell’eliminazione.</div>}
          onConferma={async () => { try { await api.elimina(`/ts/registrazioni/${daEliminare.id}`); carica(); } catch (e) { setErrore((e as Error).message); } finally { setDaEliminare(null); } }}
          onClose={() => setDaEliminare(null)}
        />
      )}
      <PiedeLegale />
    </>
  );
}

/** Modifica del titolare: il modulo comune più il segno «da verificare» e la frase originale. */
function ModificaTitolare({ contesto, reg, onClose, onSalvata }: { contesto: Contesto; reg: Registrazione; onClose: () => void; onSalvata: () => void }) {
  const [errore, setErrore] = useState('');
  const togli = async () => {
    try { await api.post(`/ts/registrazioni/${reg.id}`, { daVerificare: false }); onSalvata(); } catch (e) { setErrore((e as Error).message); }
  };
  return (
    <>
      <FormRegistrazione contesto={contesto} iniziale={reg} titolo={`Registrazione di ${reg.utenteNome}`} onClose={onClose} onSalvata={onSalvata} />
      {(reg.daVerificare || reg.testoOriginale) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 card shadow-xl px-4 py-3 text-sm max-w-lg" data-test="dettagli-titolare">
          {reg.testoOriginale && <div className="text-ink-500 mb-1">Frase originale: «{reg.testoOriginale}»</div>}
          {reg.daVerificare && <button type="button" className="btn btn-primary btn-sm" onClick={togli} data-test="togli-da-verificare">Verificata: togli il segno</button>}
          {errore && <div className="errore">{errore}</div>}
        </div>
      )}
    </>
  );
}
