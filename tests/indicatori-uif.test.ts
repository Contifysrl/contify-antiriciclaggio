import { describe, expect, it } from 'vitest';
import {
  AVVISO_INDICATORI,
  INDICATORI_UIF_2023,
  indicatoriDaVerificare,
  indicatoriPerCommercialista,
} from '../worker/src/domain/indicatori-uif';
import { SUB_INDICI_UIF_2023, contaSubIndici, testoSubIndice } from '../worker/src/domain/sub-indici-uif';

// La tassonomia è trascritta dall'allegato al provvedimento UIF 12.5.2023
// (G.U. 25.5.2023 n. 121). I riscontri letterali qui sotto sono citazioni
// esatte del testo ufficiale: se un test fallisce, NON adattare l'atteso —
// ricontrollare la trascrizione sulla fonte.

describe('struttura della tassonomia UIF 2023', () => {
  it('contiene 34 indicatori numerati senza buchi', () => {
    expect(INDICATORI_UIF_2023.map((i) => i.numero)).toEqual(
      Array.from({ length: 34 }, (_, k) => k + 1),
    );
  });

  it('ripartisce le sezioni come da allegato: A 1-8, B 9-32, C 33-34', () => {
    for (const i of INDICATORI_UIF_2023) {
      const attesa = i.numero <= 8 ? 'A' : i.numero <= 32 ? 'B' : 'C';
      expect(i.sezione, `indicatore ${i.numero}`).toBe(attesa);
    }
  });

  it('marca come generali gli indicatori A1-A8 e B9-B14 (e la sezione C)', () => {
    for (const i of INDICATORI_UIF_2023) {
      expect(i.generale, `indicatore ${i.numero}`).toBe(i.numero <= 14 || i.numero >= 33);
    }
  });

  it('ha tutti i titoli riscontrati sul testo ufficiale: nessun segnaposto residuo', () => {
    expect(indicatoriDaVerificare()).toEqual([]);
    for (const i of INDICATORI_UIF_2023) {
      expect(i.titoloUfficiale).not.toContain('[da riscontrare');
      expect(i.titoloUfficiale.length).toBeGreaterThan(60);
    }
  });

  it('conta 400 sub-indici totali come dichiarato dall’allegato', () => {
    expect(contaSubIndici()).toBe(400);
  });

  it('ha sub-indici per ogni indicatore, in numero riscontrato sul testo', () => {
    const attesi: Record<number, number> = {
      1: 7, 20: 15, 21: 7, 22: 16, 23: 22, 26: 13, 30: 13, 31: 16, 32: 11, 33: 17, 34: 4,
    };
    for (const i of INDICATORI_UIF_2023) {
      expect(SUB_INDICI_UIF_2023[i.numero]?.length, `indicatore ${i.numero}`).toBeGreaterThan(0);
    }
    for (const [n, count] of Object.entries(attesi)) {
      expect(SUB_INDICI_UIF_2023[Number(n)].length, `indicatore ${n}`).toBe(count);
    }
  });
});

describe('riscontri letterali sul provvedimento', () => {
  it('indicatore 21 (revisione): incipit letterale', () => {
    expect(INDICATORI_UIF_2023[20].titoloUfficiale).toMatch(
      /^Operatività oggetto di revisione che, per le caratteristiche e gli importi,/,
    );
  });

  it('sub-indice 21.7: fatture d’importo tondo con causali generiche', () => {
    expect(testoSubIndice('21.7')).toContain('numerose fatture d’importo tondo');
  });

  it('sub-indice 20.9: trasferimento della sede legale all’estero', () => {
    expect(testoSubIndice('20.9')).toMatch(
      /^Trasferimento della sede legale all’estero da parte di società in difficoltà economica/,
    );
  });

  it('sub-indice 33.11: sistemi informali di trasferimento (hawala)', () => {
    expect(testoSubIndice('33.11')).toContain('hawala');
  });

  it('sub-indice 34.4: beni dual use e triangolazioni finanziarie', () => {
    expect(testoSubIndice('34.4')).toContain('dual use');
    expect(testoSubIndice('34.4')).toContain('triangolazioni finanziarie');
  });

  it('testoSubIndice rifiuta codici inesistenti o malformati', () => {
    expect(testoSubIndice('21.8')).toBeUndefined(); // il 21 ha 7 sub-indici
    expect(testoSubIndice('35.1')).toBeUndefined();
    expect(testoSubIndice('21')).toBeUndefined();
    expect(testoSubIndice('21.0')).toBeUndefined();
  });
});

describe('selezione per i commercialisti (CNDCEC ottobre 2024)', () => {
  it('esclude i soli indicatori 16, 22-25 e 27', () => {
    const esclusi = INDICATORI_UIF_2023
      .filter((i) => i.rilevanzaCommercialista === 'NON_RILEVANTE')
      .map((i) => i.numero);
    expect(esclusi).toEqual([16, 22, 23, 24, 25, 27]);
    expect(indicatoriPerCommercialista().map((i) => i.numero)).not.toContain(22);
    expect(indicatoriPerCommercialista(true)).toHaveLength(34);
  });

  it('l’avviso ricorda che l’elencazione non è esaustiva né vincolante', () => {
    expect(AVVISO_INDICATORI).toMatch(/non è esaustiva né vincolante/);
  });
});
