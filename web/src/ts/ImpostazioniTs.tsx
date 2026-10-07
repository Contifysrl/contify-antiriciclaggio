import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, ErrorBanner, HelpLink } from '../components/ui';
import { type PersonaTs } from './api';

// ── Contify Timesheet — sezioni di Impostazioni (TS-M1, M1.5 e M1.6) ──
// Per il titolare Timesheet: le impostazioni dello studio (finestra dei
// collaboratori, chi può aggiungere clienti) e «Persone e ore previste» (ore
// a settimana e giorni di lavoro di ognuno, decisione A15). Per chi amministra
// lo studio: il consenso ad AI e voce, separato da quello di AR (B6, B12),
// dato dopo aver letto l'informativa di Timesheet.

interface StatoImpostazioni {
  impostazioni: { collaboratoriCreanoClienti: boolean; giorniIndietro: number };
  ai: { abilitata: boolean; voce: boolean; versioneInformativa: number | null; accettataDaNome: string | null; accettataIl: string | null; versioneCorrente: number; daRiaccettare: boolean; disponibile: boolean };
  limiti: { interpretazioniGiorno: number; secondiAudioGiorno: number };
}

export function ImpostazioniTimesheet({ titolare, amministratore }: { titolare: boolean; amministratore: boolean }) {
  const [stato, setStato] = useState<StatoImpostazioni | null>(null);
  const [errore, setErrore] = useState('');
  const carica = () => api.get<StatoImpostazioni>('/ts/impostazioni').then(setStato).catch((e) => setErrore((e as Error).message));
  useEffect(() => { if (titolare) carica(); }, [titolare]);
  if (!titolare) return null;
  return (
    <>
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      {stato && <RegoleTimesheet stato={stato} onCambiato={carica} />}
      <PersoneOrePreviste />
      {stato && amministratore && <ConsensoAiTimesheet stato={stato} onCambiato={carica} />}
    </>
  );
}

function RegoleTimesheet({ stato, onCambiato }: { stato: StatoImpostazioni; onCambiato: () => void }) {
  const [giorni, setGiorni] = useState(String(stato.impostazioni.giorniIndietro));
  const [clienti, setClienti] = useState(stato.impostazioni.collaboratoriCreanoClienti);
  const [errore, setErrore] = useState('');
  const [salvato, setSalvato] = useState(false);
  const salva = async () => {
    setErrore(''); setSalvato(false);
    try { await api.post('/ts/impostazioni', { giorniIndietro: Number(giorni), collaboratoriCreanoClienti: clienti }); setSalvato(true); onCambiato(); } catch (e) { setErrore((e as Error).message); }
  };
  return (
    <div className="scheda" data-test="regole-timesheet">
      <h3 className="!mt-0">Timesheet: regole dello studio <HelpLink sezione="ts-impostazioni" /></h3>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="label">Giorni indietro per i collaboratori</span>
          <input className="input !w-28 mono" type="number" min={0} max={365} value={giorni} onChange={(e) => setGiorni(e.target.value)} data-test="giorni-indietro" />
          <div className="aiuto mt-1">Un collaboratore può registrare, correggere ed eliminare solo lavori di questi ultimi giorni; per quelli più vecchi provvede il titolare, che non ha limiti.</div>
        </label>
        <label className="flex items-start gap-2 text-sm pt-6">
          <input type="checkbox" className="!w-4 mt-0.5" checked={clienti} onChange={(e) => setClienti(e.target.checked)} data-test="collaboratori-clienti" />
          <span>I collaboratori possono aggiungere un cliente dalla chat quando ne nominano uno che non esiste. Il cliente resta «da verificare» finché il titolare non ne completa l’anagrafica.</span>
        </label>
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button type="button" className="btn btn-primary btn-sm" onClick={salva} data-test="salva-regole">Salva</button>
        {salvato && <span className="text-sm text-teal-700">Salvato.</span>}
        {errore && <span className="errore !mt-0">{errore}</span>}
      </div>
    </div>
  );
}

const GIORNI = [['1', 'lun'], ['2', 'mar'], ['3', 'mer'], ['4', 'gio'], ['5', 'ven'], ['6', 'sab'], ['7', 'dom']] as const;

function PersoneOrePreviste() {
  const [persone, setPersone] = useState<PersonaTs[]>([]);
  const [errore, setErrore] = useState('');
  const [bozze, setBozze] = useState<Record<string, { ore: string; giorni: string }>>({});
  const [salvato, setSalvato] = useState<string | null>(null);
  const carica = () => api.get<{ persone: PersonaTs[] }>('/ts/persone').then((r) => {
    setPersone(r.persone);
    setBozze(Object.fromEntries(r.persone.map((p) => [p.utenteId, { ore: p.minutiSettimanali != null ? String(Math.round((p.minutiSettimanali / 60) * 10) / 10).replace('.', ',') : '', giorni: p.giorniLavorativi }])));
  }).catch((e) => setErrore((e as Error).message));
  useEffect(() => { carica(); }, []);

  const salva = async (p: PersonaTs) => {
    const b = bozze[p.utenteId];
    setErrore(''); setSalvato(null);
    const ore = b.ore.trim() ? Number(b.ore.replace(',', '.')) : null;
    if (ore != null && (!Number.isFinite(ore) || ore <= 0 || ore > 100)) { setErrore('Le ore a settimana devono essere fra 0 e 100.'); return; }
    try {
      await api.post(`/ts/persone/${p.utenteId}`, { minutiSettimanali: ore != null ? Math.round(ore * 60) : null, giorniLavorativi: b.giorni });
      setSalvato(p.utenteId);
      carica();
    } catch (e) { setErrore((e as Error).message); }
  };

  return (
    <div className="scheda" data-test="persone-ore-previste">
      <h3 className="!mt-0">Persone e ore previste</h3>
      <div className="aiuto">
        Le ore a settimana e i giorni di lavoro di ognuno: il riepilogo mostra le ore registrate rispetto a quelle previste. Se per una persona non le indichi, vede solo i totali.
        Sotto il previsto non è un errore (il programma non conosce ferie e permessi): si evidenziano solo i giorni di lavoro passati rimasti vuoti.
      </div>
      {errore && <div className="errore">{errore}</div>}
      <table>
        <thead><tr><th>Persona</th><th>Ruolo Timesheet</th><th>Ore a settimana</th><th>Giorni di lavoro</th><th></th></tr></thead>
        <tbody>
          {persone.map((p) => {
            const b = bozze[p.utenteId] ?? { ore: '', giorni: '12345' };
            return (
              <tr key={p.utenteId} style={{ opacity: p.attivo ? 1 : 0.55 }} data-test={`persona-${p.utenteId}`}>
                <td><strong>{p.nome}</strong>{!p.attivo && <Badge tone="gray">non attivo</Badge>}</td>
                <td className="text-sm">{p.tsRuolo === 'TITOLARE' ? 'titolare' : p.tsRuolo === 'COLLABORATORE' ? 'collaboratore' : p.amministratore ? 'amministra lo studio' : '—'}</td>
                <td><input className="input !w-24 mono" value={b.ore} placeholder="es. 40" onChange={(e) => setBozze({ ...bozze, [p.utenteId]: { ...b, ore: e.target.value } })} aria-label={`Ore a settimana di ${p.nome}`} /></td>
                <td>
                  <div className="flex gap-1 flex-wrap">
                    {GIORNI.map(([n, et]) => (
                      <label key={n} className={`px-2 py-0.5 rounded-lg border text-xs cursor-pointer ${b.giorni.includes(n) ? 'bg-teal-600 text-accento-on border-teal-600' : 'border-ink-200 text-ink-500'}`}>
                        <input type="checkbox" className="sr-only" checked={b.giorni.includes(n)} onChange={(e) => setBozze({ ...bozze, [p.utenteId]: { ...b, giorni: e.target.checked ? [...new Set([...b.giorni, n])].sort().join('') : b.giorni.replace(n, '') } })} />
                        {et}
                      </label>
                    ))}
                  </div>
                </td>
                <td className="text-right whitespace-nowrap">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => salva(p)} disabled={!b.giorni}>Salva</button>
                  {salvato === p.utenteId && <span className="text-xs text-teal-700 ml-2">Salvato.</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {persone.length === 0 && <p className="caricamento">Nessuna persona con un ruolo Timesheet: assegnalo in «Utenti dello studio».</p>}
    </div>
  );
}

export function InformativaTimesheet() {
  return (
    <div className="riquadro info text-sm space-y-2" data-test="informativa-ts">
      <p><strong>Informativa sull’uso dell’intelligenza artificiale in Contify Timesheet (versione 1).</strong></p>
      <p>
        <strong>Cosa fa.</strong> Quando una frase scritta o dettata non basta al riconoscimento di base (cliente, servizio, durata, giorno), il programma la passa a un modello linguistico che <strong>suggerisce</strong> la scelta più probabile: il suggerimento compare come primo pulsante della domanda, non viene mai salvato da solo. Ciò che il riconoscimento di base ha già stabilito con certezza non viene modificato dal modello, e il modello non può proporre un cliente che il programma non abbia già individuato come possibile. Con la voce, l’audio viene trascritto in testo da un modello di riconoscimento del parlato e poi trattato come una frase scritta.
      </p>
      <p>
        <strong>Cosa viene inviato e a chi.</strong> La frase (che può contenere nomi di clienti e di altre persone, scritti da chi registra), l’elenco dei servizi dello studio e i soli clienti che il riconoscimento di base ha individuato come possibili per quella frase (nome e identificativo interno), mai l’elenco intero dello studio; per la voce, l’audio della registrazione. I modelli sono eseguiti presso <strong>Cloudflare</strong>, lo stesso fornitore che custodisce l’archivio dello studio, nell’ambito del suo accordo sul trattamento dei dati. Cloudflare dichiara di non conservare i contenuti inviati ai modelli, di non usarli per addestrare e di non condividerli con altri clienti. L’elaborazione dei modelli può avvenire in centri dati fuori dall’Unione Europea: non c’è una garanzia di elaborazione in Europa.
      </p>
      <p>
        <strong>Cosa non viene conservato.</strong> L’audio non viene scritto da nessuna parte: esiste solo il tempo della trascrizione. La conversazione in chat non viene conservata; restano le registrazioni salvate, con la frase originale cifrata nell’archivio dello studio. La voce non serve a riconoscere chi parla.
      </p>
      <p>
        <strong>Registro delle operazioni.</strong> Modifiche ed eliminazioni di registrazioni, cambi di configurazione e questo consenso restano nel registro «Attività», che non si cancella, nemmeno con «Elimina archivio».
      </p>
      <p>
        <strong>Limiti.</strong> I modelli possono sbagliare: per questo il loro suggerimento è sempre una domanda a cui rispondere, ogni valore incerto viene chiesto e chi dirige lo studio può correggere tutto. L’uso è limitato per persona e per giorno. Senza questo consenso il programma funziona comunque con il riconoscimento di base e l’inserimento a mano; la dettatura della tastiera del telefono resta disponibile e non passa da Contify.
      </p>
      <p className="text-xs text-ink-500">Questo testo va letto insieme alle condizioni di servizio e alla nomina a responsabile del trattamento di Contify Srl, estese al modulo Timesheet.</p>
    </div>
  );
}

function ConsensoAiTimesheet({ stato, onCambiato }: { stato: StatoImpostazioni; onCambiato: () => void }) {
  const [accetto, setAccetto] = useState(false);
  const [voce, setVoce] = useState(stato.ai.voce || !stato.ai.abilitata);
  const [errore, setErrore] = useState('');
  const [invio, setInvio] = useState(false);
  const imposta = async (abilitata: boolean) => {
    setErrore(''); setInvio(true);
    try { await api.post('/ts/impostazioni/ai', { abilitata, voce: abilitata && voce, informativaLetta: accetto }); setAccetto(false); onCambiato(); } catch (e) { setErrore((e as Error).message); } finally { setInvio(false); }
  };
  const accettazione = stato.ai.accettataIl ? `Informativa v${stato.ai.versioneInformativa} accettata il ${new Date(stato.ai.accettataIl).toLocaleDateString('it-IT')}${stato.ai.accettataDaNome ? ` da ${stato.ai.accettataDaNome}` : ''}.` : '';
  return (
    <div className="scheda" data-test="consenso-ai-ts">
      <h3 className="!mt-0">Timesheet: AI e dettatura vocale</h3>
      <div className="aiuto">
        Con il consenso, le frasi che il riconoscimento di base non capisce da solo vengono interpretate da un modello e si può dettare a voce. È separato dall’assistente AI di Antiriciclaggio. Lo attiva chi amministra lo studio dopo aver letto l’informativa.
      </div>
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      {!stato.ai.disponibile && <div className="riquadro avviso !my-2">Il collegamento ai modelli non è ancora attivo lato Contify: il consenso resta possibile ma le funzioni AI saranno disponibili solo dopo l’attivazione.</div>}
      {stato.ai.abilitata && !stato.ai.daRiaccettare && (
        <>
          <p className="text-sm">
            <Badge tone="teal">abilitata</Badge>{' '}{stato.ai.voce ? <Badge tone="teal">voce attiva</Badge> : <Badge tone="gray">voce non attiva</Badge>}
            {accettazione && <span className="block text-ink-500 mt-1">{accettazione}</span>}
            <span className="block text-ink-500 mt-1">Limiti per persona e per giorno: {stato.limiti.interpretazioniGiorno} interpretazioni con AI e {Math.round(stato.limiti.secondiAudioGiorno / 60)} minuti di audio.</span>
          </p>
          <details className="text-sm mb-2"><summary className="cursor-pointer text-teal-700">Rileggi l’informativa</summary><div className="mt-2"><InformativaTimesheet /></div></details>
          <div className="flex gap-2 flex-wrap items-center">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="!w-4" checked={voce} onChange={(e) => setVoce(e.target.checked)} />Dettatura vocale</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="!w-4" checked={accetto} onChange={(e) => setAccetto(e.target.checked)} />Confermo l’informativa</label>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => imposta(true)} disabled={invio || !accetto || voce === stato.ai.voce}>Aggiorna</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => imposta(false)} disabled={invio} data-test="disabilita-ai-ts">Disabilita</button>
          </div>
        </>
      )}
      {(!stato.ai.abilitata || stato.ai.daRiaccettare) && (
        <div className="space-y-2 text-sm">
          {stato.ai.daRiaccettare && <div className="riquadro avviso !my-2"><strong>L’informativa è cambiata: rileggila e conferma.</strong> {accettazione}</div>}
          <InformativaTimesheet />
          <label className="flex items-center gap-2"><input type="checkbox" className="!w-4" checked={voce} onChange={(e) => setVoce(e.target.checked)} data-test="voce-ts" />Attiva anche la dettatura vocale (l’audio va al modello di trascrizione e non viene conservato)</label>
          <label className="flex items-start gap-2 cursor-pointer"><input type="checkbox" className="!w-4 mt-0.5" checked={accetto} onChange={(e) => setAccetto(e.target.checked)} data-test="accetto-informativa-ts" /><span>Ho letto l’informativa e abilito l’AI di Timesheet per lo studio.</span></label>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => imposta(true)} disabled={!accetto || invio} data-test="abilita-ai-ts">{invio ? 'Attivazione…' : 'Abilita'}</button>
        </div>
      )}
    </div>
  );
}
