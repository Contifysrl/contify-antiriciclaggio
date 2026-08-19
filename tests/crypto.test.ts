import { describe, expect, it } from 'vitest';
import { b64, cifra, decifra, unb64 } from '../worker/src/lib/crypto';

// La MASTER_KEY arriva da `wrangler secret put`, cioè da un incolla umano:
// può presentarsi in base64url o senza padding. La decodifica deve essere
// tollerante (e il base64 standard deve passare invariato).

const bytes = new Uint8Array([251, 255, 62, 0, 1, 127, 200, 90, 33, 254, 17, 88, 249, 3, 250, 129]);
// b64(bytes) = '+/8+AAF/yFoh/hFY+QP6gQ==' → contiene sia '+' sia '/'

describe('unb64 tollerante', () => {
  it('decodifica il base64 standard', () => {
    expect(unb64(b64(bytes))).toEqual(bytes);
  });

  it('decodifica il base64url (- e _)', () => {
    const url = b64(bytes).replace(/\+/g, '-').replace(/\//g, '_');
    expect(unb64(url)).toEqual(bytes);
  });

  it('decodifica senza padding e con spazi attorno', () => {
    const senzaPad = ` ${b64(bytes).replace(/=+$/, '')}\n`;
    expect(unb64(senzaPad)).toEqual(bytes);
  });
});

describe('MASTER_KEY: diagnosi chiare invece di InvalidCharacterError', () => {
  const chiave = b64(crypto.getRandomValues(new Uint8Array(32)));

  it('cifra e decifra con la stessa chiave in base64 standard o base64url', async () => {
    const chiaveUrl = chiave.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const c = await cifra(chiaveUrl, 'ten_prova', 'testo riservato');
    // La stessa chiave, comunque scritta, deve aprire lo stesso contenuto.
    await expect(decifra(chiave, 'ten_prova', c)).resolves.toBe('testo riservato');
  });

  it('chiave assente: errore esplicito', async () => {
    await expect(cifra('', 'ten_prova', 'x')).rejects.toThrow(/MASTER_KEY assente/);
  });

  it('chiave della lunghezza sbagliata: errore esplicito con i byte contati', async () => {
    const corta = b64(crypto.getRandomValues(new Uint8Array(16)));
    await expect(cifra(corta, 'ten_prova', 'x')).rejects.toThrow(/attesi 32 byte, decodificati 16/);
  });

  it('valore non base64 (es. esadecimale con caratteri spuri): errore esplicito', async () => {
    await expect(cifra('!!!non-base64!!!', 'ten_prova', 'x')).rejects.toThrow(/non decodificabile come base64/);
  });
});
