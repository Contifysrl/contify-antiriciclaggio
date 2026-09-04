import { describe, expect, it } from 'vitest';
import {
  Pseudonimizzatore, compilaDizionario, identificativiResidui, pseudonimizza, ripristina,
} from '../worker/src/lib/pseudonimi';

const dizionario = compilaDizionario([
  { tipo: 'PF', nome: 'ROSSI MARIO' },
  { tipo: 'PF', nome: "D'Angelo Giuseppe Maria" },
  { tipo: 'PF', nome: 'Müller Élodie' },
  { tipo: 'PG', nome: 'Alfa Costruzioni S.r.l.' },
  { tipo: 'PG', nome: 'COBI SRL' },
  { tipo: 'PG', nome: 'Studio Srl' },          // solo parole generiche: vale solo per intero
  { tipo: 'PF', nome: 'Guida Costa' },         // due parole comuni: vale solo per intero
]);

describe('Pseudonimizzazione (AR-M21, AI-01) — dizionario di contesto', () => {
  it('riconosce un nome in entrambi gli ordini, senza accenti né maiuscole, e dà lo stesso segnaposto', () => {
    const { testo, mappa, pseudonimi } = pseudonimizza('Il socio Mario Rossi (ROSSI MARIO in visura) detiene il 40%; rossi mario è anche amministratore.', dizionario);
    expect(testo).toBe('Il socio [PF_1] ([PF_1] in visura) detiene il 40%; [PF_1] è anche amministratore.');
    expect(mappa['[PF_1]']).toBe('ROSSI MARIO');
    expect(pseudonimi).toBe(1);
  });

  it('vale anche il singolo cognome o nome non generico, ma non le parole comuni', () => {
    const { testo } = pseudonimizza('Rossi ha chiesto una guida; Costa non era presente ma Guida Costa sì.', dizionario);
    expect(testo).toBe('[PF_1] ha chiesto una guida; Costa non era presente ma [PF_2] sì.');
  });

  it('gestisce apostrofi, tre token con rotazioni e accenti', () => {
    const p = new Pseudonimizzatore(dizionario);
    expect(p.applica("Giuseppe Maria D'Angelo e D’ANGELO Giuseppe Maria; poi Elodie Muller e MÜLLER ÉLODIE.")).toBe('[PF_1] e [PF_1]; poi [PF_2] e [PF_2].');
    expect(p.mappa['[PF_2]']).toBe('Müller Élodie');
  });

  it('riconosce la denominazione con e senza forma giuridica, e i token distintivi delle società', () => {
    const { testo, mappa } = pseudonimizza('Il cliente Alfa Costruzioni S.r.l. (in breve «Alfa Costruzioni») e la COBI hanno un socio comune; lo Studio Srl no.', dizionario);
    expect(testo).toBe('Il cliente [PG_1]. (in breve «[PG_1]») e la [PG_2] hanno un socio comune; lo [PG_3] no.');
    expect(mappa['[PG_2]']).toBe('COBI SRL');
  });

  it('«alfa» e «studio» da soli non sono identificativi', () => {
    const { testo } = pseudonimizza('la versione alfa dello studio di settore', dizionario);
    expect(testo).toBe('la versione alfa dello studio di settore');
  });

  it('un testo senza identificativi resta identico e la mappa è vuota', () => {
    const t = 'Versamenti ripetuti di contante appena sotto soglia (art. 49, 5.000 €) su più giorni consecutivi dal 10/07/2027; capitale 3.000.000 €.';
    const r = pseudonimizza(t, dizionario);
    expect(r.testo).toBe(t);
    expect(r.pseudonimi).toBe(0);
  });
});

describe('Pseudonimizzazione — pattern indipendenti dal contesto', () => {
  it('codice fiscale, partita IVA (anche con IT), IBAN a gruppi, PEC, telefono fisso e cellulare', () => {
    const t = 'CF RSSMRA80A01H501U, P.IVA IT01234567890 o 01234567890, IBAN IT60 X054 2811 1010 0000 0123 456, ' +
      'pec alfa@pec.it, tel. 049 8761234, cell +39 347 980 3438 e 3479803438.';
    const { testo, mappa } = pseudonimizza(t);
    expect(testo).toBe('CF [CF_1], P.IVA [PIVA_1] o [PIVA_2], IBAN [IBAN_1], pec [EMAIL_1], tel. [TEL_1], cell [TEL_2] e [TEL_3].');
    expect(mappa['[CF_1]']).toBe('RSSMRA80A01H501U');
    expect(mappa['[EMAIL_1]']).toBe('alfa@pec.it');
  });

  it('lo stesso CF scritto in minuscolo ha lo stesso segnaposto', () => {
    const { testo } = pseudonimizza('RSSMRA80A01H501U poi rssmra80a01h501u');
    expect(testo).toBe('[CF_1] poi [CF_1]');
  });

  it('indirizzo con civico, CAP e comune; non i modi di dire («via email», «corso di formazione», «campo di applicazione»)', () => {
    const { testo, mappa } = pseudonimizza('Sede in Corso Milano 106, 35139 Padova (PD); invio via PEC il 12 del mese; corso di formazione del 12; campo di applicazione dell’art. 12.');
    expect(testo).toBe('Sede in [INDIRIZZO_1]; invio via PEC il 12 del mese; corso di formazione del 12; campo di applicazione dell’art. 12.');
    expect(mappa['[INDIRIZZO_1]']).toBe('Corso Milano 106, 35139 Padova (PD)');
  });

  it('importi, capitali, date e codici dei fascicoli non sono scambiati per telefoni o partite IVA', () => {
    const t = 'capitale 3000000 euro, importo 15000 €, il 01/07/2027, fascicolo 2026/0042, quota 33,33%, 10.000.000';
    expect(pseudonimizza(t).testo).toBe(t);
  });
});

describe('Pseudonimizzazione — stabilità, ri-sostituzione e cintura di sicurezza', () => {
  it('i segnaposto restano stabili su più testi della stessa chiamata (la chat)', () => {
    const p = new Pseudonimizzatore(dizionario);
    const a = p.applica('Come valuto Mario Rossi, socio di COBI SRL?');
    const b = p.applica('Rossi Mario ha il 60% di COBI.');
    expect(a).toBe('Come valuto [PF_1], socio di [PG_1]?');
    expect(b).toBe('[PF_1] ha il 60% di [PG_1].');
    expect(p.pseudonimi).toBe(2);
  });

  it('la ri-sostituzione è integrale e tollera «PF_1» senza parentesi', () => {
    const p = new Pseudonimizzatore(dizionario);
    p.applica('Mario Rossi e Alfa Costruzioni Srl, CF RSSMRA80A01H501U');
    const risposta = 'Per [PF_1], socio di [PG_1] (codice fiscale [CF_1]), PF_1 va identificato; [PG_1] resta il cliente.';
    expect(p.ripristina(risposta)).toBe('Per ROSSI MARIO, socio di Alfa Costruzioni S.r.l. (codice fiscale RSSMRA80A01H501U), ROSSI MARIO va identificato; Alfa Costruzioni S.r.l. resta il cliente.');
    expect(ripristina('[PF_9] non esiste', p.mappa)).toBe('[PF_9] non esiste');
  });

  it('la cintura di sicurezza trova un nome del dizionario o un CF sopravvissuti, e tace sul testo pulito', () => {
    expect(identificativiResidui('Il socio [PF_1] detiene il 40% di [PG_1].', dizionario)).toEqual([]);
    expect(identificativiResidui('Il socio Rossi detiene il 40% di [PG_1].', dizionario)).toEqual(['PF']);
    expect(identificativiResidui('Il socio [PF_1] con CF RSSMRA80A01H501U', dizionario)).toEqual(['CF']);
    expect(identificativiResidui('Come si registra un titolare effettivo con quota indiretta?', dizionario)).toEqual([]);
  });
});
