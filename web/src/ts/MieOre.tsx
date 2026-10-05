import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { ConfermaEliminazione, HelpLink } from '../components/ui';
import { PiedeLegale } from '../componenti';
import { FormRegistrazione } from './FormRegistrazione';
import { dataLunga, durata, giornoSettimana, ore, type Contesto, type Registrazione } from './api';

// ── Contify Timesheet — Le mie ore (TS-M1) ──────────────────────
// Senza voce di menu: si apre dalla striscia di riepilogo. Elenco per
// settimana con totale per giorno e per settimana; i giorni di lavoro passati
// senza registrazioni sono in evidenza; modifica in Modal, eliminazione con
// conferma, «Aggiungi a mano». Solo il proprio lavoro, nessun importo.

function lunediDi(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function piuGiorni(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function TsMieOre({ giorno }: { giorno: string | null }) {
  const [contesto, setContesto] = useState<Contesto | null>(null);
  const [righe, setRighe] = useState<Registrazione[]>([]);
  const [lunedi, setLunedi] = useState<string>('');
  const [errore, setErrore] = useState('');
  const [modifica, setModifica] = useState<Registrazione | null>(null);
  const [nuova, setNuova] = useState<string | null>(null);
  const [daEliminare, setDaEliminare] = useState<Registrazione | null>(null);

  useEffect(() => {
    api.get<Contesto>('/ts/contesto').then((c) => { setContesto(c); setLunedi(lunediDi(giorno && /^\d{4}-\d{2}-\d{2}$/.test(giorno) ? giorno : c.oggi)); }).catch((e) => setErrore((e as Error).message));
  }, [giorno]);

  const carica = () => {
    if (!lunedi) return;
    api.get<{ registrazioni: Registrazione[] }>(`/ts/registrazioni?da=${lunedi}&a=${piuGiorni(lunedi, 6)}`).then((r) => setRighe(r.registrazioni)).catch((e) => setErrore((e as Error).message));
  };
  useEffect(carica, [lunedi]); // eslint-disable-line react-hooks/exhaustive-deps

  const giorni = useMemo(() => {
    if (!lunedi || !contesto) return [];
    return Array.from({ length: 7 }, (_, i) => piuGiorni(lunedi, i)).filter((d) => {
      const w = giornoSettimana(d);
      const fine = w === 0 || w === 6;
      return !fine || righe.some((r) => r.data === d);
    }).map((d) => ({ data: d, righe: righe.filter((r) => r.data === d) }));
  }, [lunedi, righe, contesto]);

  if (!contesto) return <div className="caricamento">{errore || 'Caricamento…'}</div>;
  const totale = righe.reduce((s, r) => s + r.minuti, 0);
  const settimanaCorrente = lunediDi(contesto.oggi) === lunedi;
  const evidenzia = (d: string) => d < contesto.oggi && giornoSettimana(d) >= 1 && giornoSettimana(d) <= 5;

  return (
    <>
      <h1>Le mie ore <HelpLink sezione="ts-registra" /></h1>
      <p className="occhiello">Il tuo lavoro registrato, settimana per settimana. Puoi correggere o annullare le registrazioni degli ultimi {contesto.impostazioni.giorniIndietro} giorni{contesto.ruolo === 'TITOLARE' ? ' (come titolare, anche le più vecchie)' : ''}.</p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLunedi(piuGiorni(lunedi, -7))} aria-label="Settimana precedente">← Settimana precedente</button>
        <span className="text-sm font-semibold text-ink-700" data-test="settimana">Settimana dal {dataLunga(lunedi)} al {dataLunga(piuGiorni(lunedi, 6))}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLunedi(piuGiorni(lunedi, 7))} disabled={settimanaCorrente} aria-label="Settimana successiva">Settimana successiva →</button>
        <span className="ml-auto font-mono font-bold text-ink-900" data-test="totale-settimana">Totale {ore(totale)}</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setNuova(contesto.oggi)} data-test="aggiungi-a-mano">Aggiungi a mano</button>
      </div>
      {errore && <div className="errore">{errore}</div>}

      {giorni.map(({ data, righe: r }) => (
        <div key={data} className={`scheda !mb-3 ${evidenzia(data) && !r.length ? 'border-dashed border-ink-300' : ''}`} data-test={`giorno-${data}`}>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="!m-0 capitalize">{dataLunga(data, contesto.oggi)}</h3>
            <span className="font-mono text-sm text-ink-500">{r.length ? durata(r.reduce((s, x) => s + x.minuti, 0)) : evidenzia(data) ? 'nessuna registrazione' : ''}</span>
            {data <= contesto.oggi && <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={() => setNuova(data)}>+ Aggiungi</button>}
          </div>
          {r.length > 0 && (
            <table>
              <thead><tr><th>Cliente</th><th>Servizio</th><th>Durata</th><th>Nota</th><th></th></tr></thead>
              <tbody>
                {r.map((x) => (
                  <tr key={x.id}>
                    <td><strong>{x.clienteNome}</strong>{x.daVerificare && <span className="pillola r3 ml-2">da verificare</span>}</td>
                    <td>{x.servizioNome}</td>
                    <td className="mono">{durata(x.minuti)}</td>
                    <td className="text-ink-500 text-sm">{x.nota ?? ''}</td>
                    <td className="text-right whitespace-nowrap">
                      {!x.proformaId && <>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModifica(x)}>Modifica</button>
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => setDaEliminare(x)}>Elimina</button>
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {nuova && (
        <FormRegistrazione contesto={contesto} iniziale={{ data: nuova }} titolo="Aggiungi una registrazione" onClose={() => setNuova(null)} onSalvata={() => { setNuova(null); carica(); }} />
      )}
      {modifica && (
        <FormRegistrazione contesto={contesto} iniziale={modifica} titolo="Modifica la registrazione" onClose={() => setModifica(null)} onSalvata={() => { setModifica(null); carica(); }} />
      )}
      {daEliminare && (
        <ConfermaEliminazione
          titolo="la registrazione"
          elemento={`${daEliminare.clienteNome} · ${daEliminare.servizioNome} · ${durata(daEliminare.minuti)} · ${dataLunga(daEliminare.data)}`}
          conseguenze={<div>Nel registro delle operazioni resta traccia dell’eliminazione.</div>}
          onConferma={async () => { try { await api.elimina(`/ts/registrazioni/${daEliminare.id}`); carica(); } catch (e) { setErrore((e as Error).message); } finally { setDaEliminare(null); } }}
          onClose={() => setDaEliminare(null)}
        />
      )}
      <PiedeLegale />
    </>
  );
}
