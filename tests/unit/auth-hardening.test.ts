import { describe, expect, it } from 'vitest';
import { passwordProblems } from '../../apps/server/src/auth/passwords';
import { openSecret, sealSecret } from '../../apps/server/src/auth/secretbox';
import { checkTotp, newTotpSecret } from '../../apps/server/src/auth/totp';

// ASVS V2.1 (password length and common passwords), V2.8/V6.4 (second-factor secrets encrypted at rest).
describe('password policy', () => {
  it('requires 12 characters, letters and digits', () => {
    expect(passwordProblems('Короткий-1')).toMatch(/12 символов/);
    expect(passwordProblems('только-буквы-тут')).toMatch(/буквы и цифры/);
    expect(passwordProblems('Надёжный-пароль-2026')).toBeNull();
  });
  it('refuses common passwords padded with digits and punctuation', () => {
    expect(passwordProblems('Password123456!')).toMatch(/распространён/);
    expect(passwordProblems('qwertyuiop-2024')).toMatch(/распространён/);
    expect(passwordProblems('йцукенгшщзхъ1')).toMatch(/распространён/);
    expect(passwordProblems('111111111111a')).toMatch(/распространён/);
  });
});

describe('secret box', () => {
  const key = 'test-key-0123456789abcdefghijklmnopqrstuv';
  it('round-trips and never stores the plaintext', () => {
    const sealed = sealSecret(key, 'totp', 'JBSWY3DPEHPK3PXP');
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(sealed).not.toBe(sealSecret(key, 'totp', 'JBSWY3DPEHPK3PXP')); // random IV
    expect(openSecret(key, 'totp', sealed)).toBe('JBSWY3DPEHPK3PXP');
  });
  it('rejects a wrong key, another purpose or a tampered value; reads legacy plaintext', () => {
    const sealed = sealSecret(key, 'totp', 'JBSWY3DPEHPK3PXP');
    expect(openSecret(key + 'x', 'totp', sealed)).toBeNull();
    expect(openSecret(key, 'other', sealed)).toBeNull();
    const raw = Buffer.from(sealed.slice(3), 'base64');
    raw[raw.length - 1] ^= 1;
    expect(openSecret(key, 'totp', 'v1:' + raw.toString('base64'))).toBeNull();
    expect(openSecret(key, 'totp', 'JBSWY3DPEHPK3PXP')).toBe('JBSWY3DPEHPK3PXP');
  });
  it('an undecryptable secret never verifies a TOTP code (no empty-key HMAC)', () => {
    for (let c = 0; c < 1_000_000; c += 99_991) expect(checkTotp('', String(c).padStart(6, '0'))).toBe(false);
    expect(newTotpSecret().length).toBeGreaterThanOrEqual(16);
  });
});
