import { type ReactNode } from 'react';
import { moduloCorrente } from './lib/moduli';
import { CLASSE_STILE, type ClasseRischio, type Fattore, type Ruleset, type Vincolo } from './api';

export function Tessera({ etichetta, valore, nota }: { etichetta: string; valore: ReactNode; nota?: string }) {
  return (
    <div className="tessera">
      <div className="etichetta">{etichetta}</div>
      <div className="valore">{valore}</div>
      {nota && <div className="nota">{nota}</div>}
    </div>
  );
}

export function PillolaRischio({ classe, testo }: { classe: ClasseRischio; testo?: string }) {
  return <span className={`pillola ${CLASSE_STILE[classe]}`}>{testo ?? classe.replace(/_/g, ' ').toLowerCase()}</span>;
}

export function Riquadro({ tipo, children }: { tipo: 'info' | 'avviso' | 'critico'; children: ReactNode }) {
  return <div className={`riquadro ${tipo}`}>{children}</div>;
}

/**
 * Selettore di punteggio 1-4. Le regole tecniche usano una scala ordinale
 * chiusa: un campo numerico libero inviterebbe a inserire 2,5, che non esiste
 * nel modello. Quattro bottoni rendono impossibile l'input non valido.
 */
export function ScalaPunteggio({
  fattore,
  valore,
  scala,
  onChange,
}: {
  fattore: Fattore;
  valore?: number;
  scala: Array<{ valore: number; etichetta: string }>;
  onChange: (v: number) => void;
}) {
  return (
    <div className="campo">
      <label>{fattore.etichetta}</label>
      {fattore.aiuto && <div className="aiuto">{fattore.aiuto}</div>}
      {fattore.norma && <div className="aiuto mono">{fattore.norma}</div>}
      {fattore.criteri && fattore.criteri.length > 0 && (
        <details className="aiuto" style={{ marginBottom: 6 }}>
          <summary style={{ cursor: 'pointer' }}>Criteri di valutazione (modulistica CNDCEC, Informativa n. 57/2026)</summary>
          <ul style={{ margin: '4px 0 0 18px' }}>
            {fattore.criteri.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </details>
      )}
      <div className="scala">
        {scala.map((s, i) => (
          <button
            key={s.valore}
            type="button"
            aria-pressed={valore === s.valore}
            onClick={() => onChange(s.valore)}
            title={fattore.descrittoriPunteggio?.[i] ?? s.etichetta}
          >
            {s.valore} · {s.etichetta.split(' ')[0]}
          </button>
        ))}
      </div>
      {fattore.descrittoriPunteggio && valore && (
        <div className="aiuto" style={{ marginTop: 4 }}>
          Ancoraggio del punteggio {valore} (Modello AV.0/AV.1): {fattore.descrittoriPunteggio[valore - 1]}
        </div>
      )}
    </div>
  );
}

/** Elenco dei vincoli di legge che hanno inciso sull'esito. */
export function ElencoVincoli({ vincoli }: { vincoli: Vincolo[] }) {
  if (vincoli.length === 0) return null;
  return (
    <>
      <h3>Vincoli normativi rilevati</h3>
      {vincoli.map((v) => (
        <Riquadro
          key={v.codice}
          tipo={
            v.effetto === 'IMPONE_ASTENSIONE'
              ? 'critico'
              : v.effetto === 'SEGNALA' || v.effetto === 'ESCLUDE_OBBLIGO'
                ? 'info'
                : 'avviso'
          }
        >
          {v.descrizione}
          <span className="norma">{v.norma}</span>
        </Riquadro>
      ))}
    </>
  );
}

export function GruppoFattori({
  titolo,
  fattori,
  valori,
  ruleset,
  onChange,
}: {
  titolo: string;
  fattori: Fattore[];
  valori: Record<string, number>;
  ruleset: Ruleset;
  onChange: (codice: string, v: number) => void;
}) {
  return (
    <div className="scheda">
      <h3>{titolo}</h3>
      {fattori.map((f) => (
        <ScalaPunteggio
          key={f.codice}
          fattore={f}
          valore={valori[f.codice]}
          scala={ruleset.scala}
          onChange={(v) => onChange(f.codice, v)}
        />
      ))}
    </div>
  );
}

/**
 * Il piede legale segue il modulo scelto nella barra laterale (TS-M0): la
 * dicitura antiriciclaggio non ha senso nelle pagine di Timesheet. Il modulo
 * corrente lo pubblica App.tsx in `moduloCorrente()`, così le pagine comuni
 * non devono passarsi il dato.
 */
export function PiedeLegale() {
  const modulo = moduloCorrente();
  return (
    <div className="piede-legale">
      {modulo === 'TS' ? (
        <>
          Contify Timesheet è uno strumento di supporto all’organizzazione dello studio: registra il lavoro
          svolto e prepara i proforma. Le registrazioni, le tariffe e i documenti emessi restano sotto la
          responsabilità dello studio.
        </>
      ) : (
        <>
          Contify AR (AntiRiciclaggio) è uno strumento di supporto agli adempimenti del DLgs. 21.11.2007 n. 231 e alle regole tecniche
          adottate dal CNDCEC ai sensi dell’art. 11 co. 2. Gli esiti prodotti non sostituiscono la valutazione del
          professionista incaricato, cui restano imputate le decisioni sull’adeguata verifica, sull’astensione e sulla
          segnalazione di operazioni sospette.
        </>
      )}
    </div>
  );
}
