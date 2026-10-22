import { describe, it, expect } from 'vitest';
import { base32Encode, base32Decode, currentTotp, checkTotp } from '../../apps/server/src/auth/totp';

// RFC 6238 Appendix B, SHA-1 key "12345678901234567890"; the RFC lists 8 digits, we use the 6-digit suffix.
const SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
const VECTORS: Array<[number, string]> = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
];

describe('TOTP (RFC 6238) — second factor', () => {
  it('base32 round trip', () => {
    expect(SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(SECRET).toString('ascii')).toBe('12345678901234567890');
  });
  it.each(VECTORS)('reference vector at T=%i', (t, code) => {
    expect(currentTotp(SECRET, t * 1000)).toBe(code);
    expect(checkTotp(SECRET, code, t * 1000)).toBe(true);
  });
  it('rejects wrong and far-off codes', () => {
    expect(checkTotp(SECRET, '000000', 59_000)).toBe(false);
    expect(checkTotp(SECRET, '287082', 59_000 + 10 * 60_000)).toBe(false);
  });
});
