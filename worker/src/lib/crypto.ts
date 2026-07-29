/**
 * Primitive crittografiche. Solo WebCrypto: nessuna dipendenza esterna, il
 * Worker gira senza polyfill.
 *
 * Perché la cifratura applicativa in aggiunta a quella at-rest di Cloudflare:
 * i contenuti delle segnalazioni di operazione sospetta e i dati identificativi
 * dei clienti sono la parte del database che, se esfiltrata, fa il danno
 * peggiore. L'art. 38 co. 3-bis punisce con la reclusione da due a sei anni la
 * rivelazione dell'identità del segnalante. Cifrare a livello applicativo
 * significa che un dump del D1 non basta a leggere quei campi.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256Hex(input: string | ArrayBuffer): Promise<string> {
  const data = typeof input === 'string' ? enc.encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ------------------------------------------------------------------ password

const PBKDF2_ITER = 210_000; // allineato alle raccomandazioni OWASP per PBKDF2-SHA256

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITER, hash: 'SHA-256' },
    key,
    256,
  );
  return `pbkdf2$${PBKDF2_ITER}$${b64(salt)}$${b64(bits)}`;
}

export async function verificaPassword(password: string, stored: string): Promise<boolean> {
  const parti = stored.split('$');
  if (parti.length !== 4 || parti[0] !== 'pbkdf2') return false;
  const iter = Number(parti[1]);
  const salt = unb64(parti[2]);
  const atteso = unb64(parti[3]);
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, atteso.length * 8),
  );
  return confrontoCostante(bits, atteso);
}

/** Confronto a tempo costante: evita di far trapelare informazione dai tempi. */
export function confrontoCostante(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ------------------------------------------------------------- cifratura AES

/**
 * Deriva una chiave per tenant dalla MASTER_KEY, così che la compromissione di
 * un tenant non esponga gli altri. HKDF con il tenant id come info.
 */
async function chiaveTenant(masterKeyB64: string, tenantId: string): Promise<CryptoKey> {
  const master = unb64(masterKeyB64);
  if (master.length !== 32) throw new Error('MASTER_KEY deve essere una chiave base64 di 32 byte');
  const ikm = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('contify-presidio'), info: enc.encode(`tenant:${tenantId}`) },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface Cifrato {
  contenuto: string;
  iv: string;
}

export async function cifra(masterKeyB64: string, tenantId: string, testoInChiaro: string): Promise<Cifrato> {
  const key = await chiaveTenant(masterKeyB64, tenantId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(testoInChiaro));
  return { contenuto: b64(buf), iv: b64(iv) };
}

export async function decifra(masterKeyB64: string, tenantId: string, c: Cifrato): Promise<string> {
  const key = await chiaveTenant(masterKeyB64, tenantId);
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(c.iv) }, key, unb64(c.contenuto));
  return dec.decode(buf);
}

export function nuovoId(prefisso: string): string {
  return `${prefisso}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

export function nuovoToken(): string {
  return b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
}
