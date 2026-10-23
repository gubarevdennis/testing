import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, setupOrg, expectStatus, Api, type TestServer } from '../support/harness.js';
import { createHmac } from 'node:crypto';

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer();
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => ts?.close());

// RFC 6238 code for a base32 secret (same algorithm as the server, independent implementation for the test)
function totp(secret: string, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.replace(/=+$/, '')) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', key).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

describe('authentication hardening (ASVS V2/V3)', () => {
  it('a session idle longer than SESSION_IDLE_HOURS is refused; an active one keeps working', async () => {
    const u = await org.user('Idle');
    await u.get('/api/v1/auth/me');
    await ts.db.query(`update sessions set last_seen_at = now() - interval '11 hours' where user_id = $1`, [u.id]);
    await u.get('/api/v1/auth/me'); // still inside the idle window (default 12 h)
    await ts.db.query(`update sessions set last_seen_at = now() - interval '13 hours' where user_id = $1`, [u.id]);
    await expectStatus(u.get('/api/v1/auth/me'), 401);
  });

  it('weak and common passwords are refused on change; a strong one is accepted', async () => {
    const u = await org.user('Pw');
    await expectStatus(u.post('/api/v1/auth/password', { current: u.password, next: 'Short-pw-1' }), 400);
    await expectStatus(u.post('/api/v1/auth/password', { current: u.password, next: 'Password12345!' }), 400);
    await u.post('/api/v1/auth/password', { current: u.password, next: 'Новый-надёжный-пароль-7' });
  });

  it('the TOTP secret is stored encrypted and login with the second factor works', async () => {
    const u = await org.user('Mfa');
    const { secret } = await u.post('/api/v1/auth/mfa/setup', {});
    const stored = (await ts.db.query('select mfa_secret from users where id = $1', [u.id])).rows[0].mfa_secret as string;
    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored).not.toContain(secret);
    await u.post('/api/v1/auth/mfa/enable', { code: totp(secret) });
    const fresh = new Api(ts.url);
    const first = await fresh.post('/api/v1/auth/login', { email: u.email, password: u.password });
    expect(first.mfaRequired).toBe(true);
    await fresh.login(u.email, u.password, totp(secret));
    expect((await fresh.get('/api/v1/auth/me')).user.id).toBe(u.id);
  });
});
