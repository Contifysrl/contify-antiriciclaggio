import { durata, inizialeGiorno, nomeGiorno, ore, type Riepilogo } from './api';

// ── Contify Timesheet — striscia di riepilogo personale (TS-M1, M1.3 bis) ──
// «Oggi 5 h 30 di 8», la settimana come barrette sottili con l'iniziale del
// giorno, il totale del mese. Sta in una o due righe; sul telefono non supera
// un centinaio di punti. Sotto il previsto non è un errore: la barra è piena in
// proporzione, senza colori d'allarme né la parola «mancano». Il giorno vuoto
// (lavorativo, passato, senza registrazioni) si distingue anche senza colore:
// contorno tratteggiato. Ogni barretta ha il suo testo per chi usa un lettore
// di schermo. Solo il proprio lavoro, nessun importo.

export function StrisciaRiepilogo({ riepilogo, onGiorno, linkTutte }: {
  riepilogo: Riepilogo;
  onGiorno?: (data: string) => void;
  linkTutte?: string;
}) {
  const { oggi, settimana, mese } = riepilogo;
  const massimo = Math.max(60, ...settimana.map((g) => Math.max(g.minuti, g.previsti ?? 0)));
  return (
    <div className="card px-4 py-3 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2" data-test="striscia-riepilogo" aria-label="Riepilogo del tuo lavoro">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-ink-400 font-semibold">Oggi</div>
        <div className="font-mono font-bold text-lg text-ink-900 leading-tight" data-test="oggi-minuti">
          {durata(oggi.minuti)}{oggi.previsti != null && <span className="text-ink-400 font-normal text-sm"> di {durata(oggi.previsti)}</span>}
        </div>
      </div>
      <div className="flex items-end gap-1.5" role="list" aria-label="Questa settimana">
        {settimana.map((g) => {
          const altezza = Math.max(3, Math.round((g.minuti / massimo) * 36));
          const prevista = g.previsti != null ? Math.max(3, Math.round((g.previsti / massimo) * 36)) : null;
          const testo = `${nomeGiorno(g.data)}: ${g.minuti ? durata(g.minuti) : 'nessuna registrazione'}${g.previsti != null ? ` su ${durata(g.previsti)}` : ''}${g.vuoto ? ' (giorno vuoto)' : ''}${g.festivo ? ' (festivo)' : ''}`;
          const oggiQui = g.data === oggi.data;
          return (
            <button
              key={g.data}
              type="button"
              role="listitem"
              className="flex flex-col items-center gap-0.5 group"
              title={testo}
              aria-label={testo}
              onClick={() => onGiorno?.(g.data)}
              data-test={`giorno-${g.data}`}
              data-vuoto={g.vuoto ? '1' : '0'}
            >
              <span className="relative block w-4" style={{ height: 38 }}>
                {prevista != null && (
                  <span className="absolute bottom-0 left-0 right-0 rounded-sm border border-ink-200 bg-ink-50" style={{ height: prevista }} aria-hidden="true" />
                )}
                <span
                  className={`absolute bottom-0 left-0 right-0 rounded-sm ${g.minuti ? 'bg-teal-600' : g.vuoto ? 'border border-dashed border-ink-400' : 'bg-ink-200'} ${oggiQui ? 'ring-2 ring-teal-300' : ''}`}
                  style={{ height: g.minuti ? altezza : g.vuoto ? 6 : 3 }}
                  aria-hidden="true"
                />
              </span>
              <span className={`text-[10px] leading-none ${oggiQui ? 'font-bold text-teal-700' : g.lavorativo ? 'text-ink-500' : 'text-ink-300'}`} aria-hidden="true">{inizialeGiorno(g.data)}</span>
            </button>
          );
        })}
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-ink-400 font-semibold">Mese</div>
        <div className="font-mono font-bold text-lg text-ink-900 leading-tight">
          {ore(mese.minuti)}{mese.previsti != null && <span className="text-ink-400 font-normal text-sm"> di {ore(mese.previsti)}</span>}
        </div>
      </div>
      {linkTutte && <a href={linkTutte} className="text-sm font-semibold text-teal-700 ml-auto" data-test="link-mie-ore">Tutte le mie ore →</a>}
    </div>
  );
}
