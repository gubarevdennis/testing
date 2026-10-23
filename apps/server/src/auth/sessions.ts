import type { Queryable } from '../db/pool.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import type { AuthUser } from '../acl/engine.js';

export interface SessionInfo {
  id: string;
  userId: string;
  csrfToken: string;
  mfaPassed: boolean;
  expiresAt: Date;
}

export async function createSession(q: Queryable, userId: string, ttlHours: number, meta: { ip?: string | null; userAgent?: string | null; mfaPassed: boolean }) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const r = await q.query(
    `insert into sessions (user_id, token_hash, csrf_token, mfa_passed, expires_at, ip, user_agent)
     values ($1, $2, $3, $4, now() + make_interval(hours => $5), $6, $7) returning id, expires_at`,
    [userId, sha256(token), csrf, meta.mfaPassed, ttlHours, meta.ip ?? null, (meta.userAgent ?? '').slice(0, 400)],
  );
  return { token, csrf, id: r.rows[0].id as string, expiresAt: r.rows[0].expires_at as Date };
}

/** `idleHours`: a session unused for longer is no longer accepted (re-authentication after inactivity, ASVS V3.3). */
export async function lookupSession(q: Queryable, token: string, idleHours = 0): Promise<{ session: SessionInfo; user: AuthUser } | null> {
  const r = await q.query(
    `select s.id as sid, s.csrf_token, s.mfa_passed, s.expires_at, s.last_seen_at, u.*
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()
        and ($2::int = 0 or s.last_seen_at > now() - make_interval(hours => $2::int))`,
    [sha256(token), idleHours],
  );
  const row = r.rows[0];
  if (!row) return null;
  if (row.status !== 'active') return null;
  if (row.access_expires_at && new Date(row.access_expires_at) <= new Date()) return null;
  // Throttle last_seen updates to once per minute.
  if (Date.now() - new Date(row.last_seen_at).getTime() > 60_000) await q.query('update sessions set last_seen_at = now() where id = $1', [row.sid]);
  return {
    session: { id: row.sid, userId: row.id, csrfToken: row.csrf_token, mfaPassed: row.mfa_passed, expiresAt: row.expires_at },
    user: toAuthUser(row),
  };
}

export async function lookupApiToken(q: Queryable, token: string): Promise<AuthUser | null> {
  const r = await q.query(
    `update api_tokens t set last_used_at = now() from users u
      where t.token_hash = $1 and t.revoked_at is null and (t.expires_at is null or t.expires_at > now()) and u.id = t.user_id and u.status = 'active'
      returning u.*`,
    [sha256(token)],
  );
  return r.rows[0] ? toAuthUser(r.rows[0]) : null;
}

export function toAuthUser(row: any): AuthUser {
  return { id: row.id, orgId: row.org_id, name: row.name, email: row.email, kind: row.kind, orgRole: row.org_role, status: row.status };
}

export async function revokeUserSessions(q: Queryable, userId: string, reason: string) {
  await q.query(`update sessions set revoked_at = now(), revoke_reason = $2 where user_id = $1 and revoked_at is null`, [userId, reason]);
  await q.query(`update api_tokens set revoked_at = now() where user_id = $1 and revoked_at is null`, [userId]);
}
