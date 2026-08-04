import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, ErrorBanner, HelpLink, Spinner } from '../components/ui';
import { PiedeLegale } from '../componenti';

// ── Novità (AR-M11) ────────────────────────────────────────────
// Il changelog in-app, come in Assist: l'elenco arriva dal server
// (/api/novita) insieme all'ultima voce vista dall'utente. Aprire la
// pagina marca tutto come visto e avvisa il menu (evento 'novita-viste')
// così il pallino sparisce subito, senza ricaricare.

interface VoceNovita {
  id: string;
  data: string;
  titolo: string;
  punti: string[];
}

function dataEstesa(iso: string): string {
  const [a, m, g] = iso.split('-');
  const mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  return `${Number(g)} ${mesi[Number(m) - 1] ?? m} ${a}`;
}

export function Novita() {
  const [dati, setDati] = useState<{ novita: VoceNovita[]; vista: string | null } | null>(null);
  const [errore, setErrore] = useState('');

  useEffect(() => {
    api.get<{ novita: VoceNovita[]; vista: string | null }>('/novita')
      .then((r) => {
        setDati(r);
        // La voce più recente diventa la "vista": il pallino si spegne.
        const massima = r.novita.reduce((acc, n) => (n.id > acc ? n.id : acc), '');
        if (massima && massima !== r.vista) {
          api.post('/auth/novita', { vista: massima })
            .then(() => window.dispatchEvent(new Event('novita-viste')))
            .catch(() => { /* il pallino resterà: nessun danno */ });
        }
      })
      .catch((e) => setErrore((e as Error).message));
  }, []);

  const voci = dati ? [...dati.novita].sort((a, b) => (a.id < b.id ? 1 : -1)) : [];

  return (
    <>
      <h1>Novità <HelpLink sezione="novita" /></h1>
      <p className="occhiello">
        Il software cresce di continuo: qui trovi cosa è cambiato, dalla novità più recente
        alla più vecchia. Quando c’è qualcosa di nuovo te lo dice il pallino sulla voce di menu.
      </p>
      {errore && <ErrorBanner message={errore} onDismiss={() => setErrore('')} />}
      {!dati && !errore ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {voci.map((n) => {
            const nuova = !dati?.vista || n.id > (dati.vista ?? '');
            return (
              <div key={n.id} className={`scheda !my-0 ${nuova ? '!border-teal-300' : ''}`}>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-ink-400 uppercase tracking-wide">{dataEstesa(n.data)}</span>
                  {nuova && <Badge tone="teal">Nuovo</Badge>}
                </div>
                <div className="font-bold text-ink-900 mb-2">{n.titolo}</div>
                <ul className="list-disc pl-5 space-y-1.5">
                  {n.punti.map((p, i) => <li key={i} className="text-sm text-ink-600">{p}</li>)}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      <PiedeLegale />
    </>
  );
}
