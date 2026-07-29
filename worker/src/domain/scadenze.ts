/**
 * SCADENZARIO ANTIRICICLAGGIO
 *
 * Genera le scadenze di un fascicolo a partire dalle date del rapporto e dal
 * profilo di rischio. Ogni scadenza porta con se' la norma che la impone, e
 * distingue esplicitamente le scadenze di legge da quelle organizzative: un
 * ispettore contesta le prime, le seconde sono scelte documentate dello studio.
 */

import { aggiungiAnni, aggiungiGiorni, aggiungiMesi, TERMINI } from './norme';
import type { ClasseRischio } from './types';

export type TipoScadenza =
  | 'COMPLETAMENTO_VERIFICA'
  | 'ACQUISIZIONE_CONSERVAZIONE'
  | 'CONTROLLO_COSTANTE'
  | 'FINE_CONSERVAZIONE'
  | 'COMUNICAZIONE_MEF'
  | 'AGGIORNAMENTO_AUTOVALUTAZIONE';

export interface Scadenza {
  tipo: TipoScadenza;
  etichetta: string;
  data: string;
  norma: string;
  /** false = scelta organizzativa dello studio, non termine di legge. */
  normativa: boolean;
  descrizione: string;
}

export interface DatiFascicoloScadenze {
  dataConferimentoIncarico: string;
  dataCessazione?: string | null;
  classeRischio: ClasseRischio;
  controlloCostanteMesi: number;
  /** Data dell'ultima verifica del controllo costante, se gia' eseguita. */
  ultimoControllo?: string | null;
  esenteAdeguataVerifica?: boolean;
}

export function calcolaScadenzeFascicolo(d: DatiFascicoloScadenze): Scadenza[] {
  const s: Scadenza[] = [];

  if (d.esenteAdeguataVerifica) {
    // Art. 17 co. 7: nessun obbligo di verifica, quindi nessuna scadenza di
    // verifica. La conservazione documentale della prestazione resta comunque
    // opportuna sul piano professionale, ma non discende dagli artt. 31-32.
    return s;
  }

  s.push({
    tipo: 'COMPLETAMENTO_VERIFICA',
    etichetta: 'Completamento della verifica dell’identità',
    data: aggiungiGiorni(d.dataConferimentoIncarico, TERMINI.COMPLETAMENTO_VERIFICA_GIORNI.valore),
    norma: TERMINI.COMPLETAMENTO_VERIFICA_GIORNI.norma,
    normativa: true,
    descrizione: TERMINI.COMPLETAMENTO_VERIFICA_GIORNI.descrizione,
  });

  s.push({
    tipo: 'ACQUISIZIONE_CONSERVAZIONE',
    etichetta: 'Acquisizione tempestiva dei dati nel sistema di conservazione',
    data: aggiungiGiorni(d.dataConferimentoIncarico, TERMINI.ACQUISIZIONE_CONSERVAZIONE_GIORNI.valore),
    norma: TERMINI.ACQUISIZIONE_CONSERVAZIONE_GIORNI.norma,
    normativa: true,
    descrizione: TERMINI.ACQUISIZIONE_CONSERVAZIONE_GIORNI.descrizione,
  });

  // Controllo costante: la legge lo impone (art. 19 co. 1 lett. d) ma non ne
  // fissa la cadenza. La periodicità è un parametro di studio.
  if (!d.dataCessazione && d.controlloCostanteMesi > 0) {
    const base = d.ultimoControllo ?? d.dataConferimentoIncarico;
    s.push({
      tipo: 'CONTROLLO_COSTANTE',
      etichetta: `Controllo costante (cadenza ${d.controlloCostanteMesi} mesi — rischio ${etichettaClasse(d.classeRischio)})`,
      data: aggiungiMesi(base, d.controlloCostanteMesi),
      norma: 'art. 19 co. 1 lett. d) DLgs. 231/2007',
      normativa: false,
      descrizione:
        'Il controllo costante è obbligatorio per legge; la cadenza è una scelta organizzativa dello studio, graduata sul profilo di ' +
        'rischio e modificabile nelle impostazioni. Va documentata nelle procedure interne ex art. 16.',
    });
  }

  // Conservazione decennale: decorre dalla cessazione del rapporto.
  if (d.dataCessazione) {
    s.push({
      tipo: 'FINE_CONSERVAZIONE',
      etichetta: 'Termine dell’obbligo di conservazione (10 anni)',
      data: aggiungiAnni(d.dataCessazione, TERMINI.CONSERVAZIONE_ANNI.valore),
      norma: TERMINI.CONSERVAZIONE_ANNI.norma,
      normativa: true,
      descrizione: TERMINI.CONSERVAZIONE_ANNI.descrizione,
    });
  }

  return s;
}

/**
 * Scadenza di aggiornamento dell'autovalutazione dello studio.
 * L'aggiornamento 2025 delle regole tecniche ha eliminato la cadenza triennale
 * fissa: l'aggiornamento e' rimesso al professionista, ma va comunque effettuato
 * entro un anno dalla pubblicazione dell'aggiornamento dell'Analisi nazionale
 * dei rischi del Comitato di sicurezza finanziaria (art. 14 co. 4).
 */
export function scadenzaAggiornamentoAutovalutazione(dataPubblicazioneAnr: string): Scadenza {
  return {
    tipo: 'AGGIORNAMENTO_AUTOVALUTAZIONE',
    etichetta: 'Aggiornamento dell’autovalutazione del rischio dello studio',
    data: aggiungiAnni(dataPubblicazioneAnr, 1),
    norma: 'art. 15 co. 4 DLgs. 231/2007 e Regole tecniche CNDCEC 2025',
    normativa: true,
    descrizione:
      'La valutazione del rischio va documentata e periodicamente aggiornata. Le regole tecniche 2025 hanno eliminato la cadenza ' +
      'triennale fissa ma richiedono l’aggiornamento entro un anno dalla pubblicazione dell’aggiornamento dell’Analisi nazionale dei rischi.',
  };
}

export function scadenzaComunicazioneMef(dataViolazione: string): Scadenza {
  return {
    tipo: 'COMUNICAZIONE_MEF',
    etichetta: 'Comunicazione al MEF dell’infrazione ai limiti sull’uso del contante',
    data: aggiungiGiorni(dataViolazione, TERMINI.COMUNICAZIONE_MEF_GIORNI.valore),
    norma: TERMINI.COMUNICAZIONE_MEF_GIORNI.norma,
    normativa: true,
    descrizione: TERMINI.COMUNICAZIONE_MEF_GIORNI.descrizione,
  };
}

function etichettaClasse(c: ClasseRischio): string {
  return {
    NON_SIGNIFICATIVO: 'non significativo',
    POCO_SIGNIFICATIVO: 'poco significativo',
    ABBASTANZA_SIGNIFICATIVO: 'abbastanza significativo',
    MOLTO_SIGNIFICATIVO: 'molto significativo',
  }[c];
}

export interface ScadenzaConStato extends Scadenza {
  stato: 'SCADUTA' | 'IN_SCADENZA' | 'FUTURA';
  giorniResidui: number;
}

/** Classifica le scadenze rispetto a una data di riferimento (default: oggi). */
export function statoScadenze(scadenze: Scadenza[], oggi: string, giorniPreavviso = 30): ScadenzaConStato[] {
  const riferimento = new Date(`${oggi}T00:00:00Z`).getTime();
  return scadenze
    .map((s) => {
      const t = new Date(`${s.data}T00:00:00Z`).getTime();
      const giorniResidui = Math.round((t - riferimento) / 86400000);
      const stato: ScadenzaConStato['stato'] =
        giorniResidui < 0 ? 'SCADUTA' : giorniResidui <= giorniPreavviso ? 'IN_SCADENZA' : 'FUTURA';
      return { ...s, stato, giorniResidui };
    })
    .sort((a, b) => a.giorniResidui - b.giorniResidui);
}
