import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Encryption of small secrets stored in the database (TOTP seeds) with AES-256-GCM. The key is derived from SECRET_KEY
 * with HKDF, so a database dump alone does not reveal second factors. Values written before encryption was introduced
 * (no `v1:` prefix) are still read, and re-encrypted on the next write.
 */
const PREFIX = 'v1:';

function key(secretKey: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secretKey, 'kb-secretbox', purpose, 32));
}

export function sealSecret(secretKey: string, purpose: string, plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(secretKey, purpose), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}

export function openSecret(secretKey: string, purpose: string, stored: string | null): string | null {
  if (!stored) return null;
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const d = createDecipheriv('aes-256-gcm', key(secretKey, purpose), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return null; // wrong key or tampered value: the factor cannot be verified
  }
}
