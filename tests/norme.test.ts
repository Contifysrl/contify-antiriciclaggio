import { describe, expect, it } from 'vitest';
import {
  aggiungiAnni,
  aggiungiGiorni,
  aggiungiMesi,
  sogliaVigente,
  verificaContante,
  TERMINI,
} from '../worker/src/domain/norme';

describe('Soglie dell’art. 49 nel tempo', () => {
  it('applica 3.000 euro fino al 30.6.2020', () => {
    expect(sogliaVigente('CONTANTE', '2019-05-10').valore).toBe(3000);
  });

  it('applica 2.000 euro dal 1.7.2020 al 31.12.2022', () => {
    expect(sogliaVigente('CONTANTE', '2021-03-01').valore).toBe(2000);
    expect(sogliaVigente('CONTANTE', '2022-12-31').valore).toBe(2000);
  });

  it('applica 5.000 euro dal 1.1.2023', () => {
    expect(sogliaVigente('CONTANTE', '2023-01-01').valore).toBe(5000);
    expect(sogliaVigente('CONTANTE', '2026-07-29').valore).toBe(5000);
  });

  it('tiene distinta la soglia della negoziazione in valuta, tornata a 3.000 dal 2023', () => {
    // Il co. 3-bis, dal 1.1.2023, riferisce ai 5.000 euro il solo divieto del
    // co. 1: la soglia del co. 3 torna quindi al valore originario.
    expect(sogliaVigente('NEGOZIAZIONE_VALUTA', '2021-06-01').valore).toBe(2000);
    expect(sogliaVigente('NEGOZIAZIONE_VALUTA', '2026-07-29').valore).toBe(3000);
    expect(sogliaVigente('CONTANTE', '2026-07-29').valore).toBe(5000);
  });

  it('applica 1.000 euro alla rimessa di denaro', () => {
    expect(sogliaVigente('RIMESSA_DENARO', '2026-07-29').valore).toBe(1000);
  });
});

describe('Verifica di un trasferimento in contante', () => {
  it('considera vietato l’importo pari alla soglia', () => {
    const e = verificaContante(5000, '2026-07-29');
    expect(e.conforme).toBe(false);
    expect(e.comunicazioneMef).toBe(true);
  });

  it('considera consentito l’importo di un centesimo inferiore', () => {
    const e = verificaContante(4999.99, '2026-07-29');
    expect(e.conforme).toBe(true);
    expect(e.comunicazioneMef).toBe(false);
  });

  it('usa la soglia vigente alla data dell’operazione, non a quella odierna', () => {
    // 3.000 euro nel 2021 erano vietati (soglia 2.000); oggi sono consentiti.
    expect(verificaContante(3000, '2021-09-15').conforme).toBe(false);
    expect(verificaContante(3000, '2026-07-29').conforme).toBe(true);
  });

  it('non applica le limitazioni quando è parte un intermediario (art. 49 co. 13)', () => {
    const e = verificaContante(50000, '2026-07-29', { intermediarioParte: true });
    expect(e.conforme).toBe(true);
    expect(e.messaggio).toContain('co. 13');
  });

  it('calcola la scadenza della comunicazione al MEF a 30 giorni dalla violazione', () => {
    const e = verificaContante(6000, '2026-03-10');
    expect(e.scadenzaComunicazioneMef).toBe('2026-04-09');
  });

  it('ricorda che il contante sotto soglia resta elemento di sospetto (art. 35 co. 1)', () => {
    expect(verificaContante(1000, '2026-07-29').messaggio).toContain('elemento di sospetto');
  });
});

describe('Termini normativi', () => {
  it('fissa a 30 giorni il completamento della verifica dell’identità', () => {
    expect(TERMINI.COMPLETAMENTO_VERIFICA_GIORNI.valore).toBe(30);
    expect(TERMINI.COMPLETAMENTO_VERIFICA_GIORNI.norma).toContain('art. 18');
  });

  it('fissa a 10 anni la conservazione', () => {
    expect(TERMINI.CONSERVAZIONE_ANNI.valore).toBe(10);
    expect(TERMINI.CONSERVAZIONE_ANNI.norma).toContain('art. 31');
  });
});

describe('Aritmetica delle date', () => {
  it('somma i giorni attraversando il cambio d’anno', () => {
    expect(aggiungiGiorni('2025-12-20', 30)).toBe('2026-01-19');
  });

  it('gestisce l’anno bisestile', () => {
    expect(aggiungiGiorni('2028-02-28', 1)).toBe('2028-02-29');
    expect(aggiungiGiorni('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('non trabocca al mese successivo sommando mesi al 31', () => {
    // 31 gennaio + 1 mese: senza correzione JavaScript restituirebbe il 3 marzo.
    expect(aggiungiMesi('2026-01-31', 1)).toBe('2026-02-28');
    expect(aggiungiMesi('2026-03-31', 1)).toBe('2026-04-30');
  });

  it('somma i mesi nel caso ordinario', () => {
    expect(aggiungiMesi('2026-07-29', 12)).toBe('2027-07-29');
    expect(aggiungiMesi('2026-07-29', 6)).toBe('2027-01-29');
  });

  it('somma gli anni per la conservazione decennale', () => {
    expect(aggiungiAnni('2026-07-29', 10)).toBe('2036-07-29');
  });

  it('rifiuta date non valide', () => {
    expect(() => aggiungiGiorni('non-una-data', 1)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Vincolo di piattaforma: Cloudflare Workers limita PBKDF2 a 100.000
// iterazioni in produzione (workerd #1346). Il collaudo locale non lo
// intercetta, quindi lo si blinda qui: se qualcuno rialza l'iterazione senza
// sapere del limite, questo test glielo dice prima del deploy.
import { hashPassword, verificaPassword } from '../worker/src/lib/crypto';

describe('vincolo Cloudflare su PBKDF2', () => {
  it('genera hash con non più di 100.000 iterazioni', async () => {
    const h = await hashPassword('prova');
    const iter = Number(h.split('$')[1]);
    expect(iter).toBeLessThanOrEqual(100_000);
    expect(await verificaPassword('prova', h)).toBe(true);
    expect(await verificaPassword('sbagliata', h)).toBe(false);
  });

  it('rifiuta pulitamente gli hash sopra il limite invece di lanciare', async () => {
    const h = await hashPassword('prova');
    const sopra = h.replace('$100000$', '$210000$');
    expect(await verificaPassword('prova', sopra)).toBe(false);
  });
});
