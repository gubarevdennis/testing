/**
 * SSO account resolution and claim mapping (OIDC callback, routes/auth.ts).
 *
 * Matching: by the IdP subject (users.external_id) first, then by e-mail. An account already bound to another
 * subject is refused (the IdP re-used an e-mail for a different person). `email_verified: false` is refused.
 * Provisioning: a missing account is created as an active employee only when the organisation enabled
 * «Автоматическое создание учётных записей при входе через SSO» (settings.oidcJitProvisioning); otherwise the
 * administrator must create (invite) it first.
 * Groups/department (OIDC_GROUPS_CLAIM / OIDC_DEPARTMENT_CLAIM): claim values are matched by name to existing groups
 * and departments (never created). Memberships added this way are marked source = 'oidc' and are the only ones the
 * mapping ever removes — memberships set by administrators are never touched. Changes are audited and bump the ACL
 * epoch (open documents re-check access).
 */
import type { Tx } from '../db/pool.js';
import { audit, type AuditActor } from './audit.js';
import { ensurePersonalSpace, orgSettings } from './org.js';
import { bumpAclEpoch } from '../acl/engine.js';
import { claimList } from '../auth/oidc.js';

export type SsoDenial = 'no_email' | 'email_unverified' | 'no_account' | 'account_disabled' | 'subject_mismatch' | 'access_expired';

export class SsoDenied extends Error {
  constructor(
    public readonly code: SsoDenial,
    public readonly userId: string | null = null,
    public readonly orgId: string | null = null,
  ) {
    super(code);
  }
}

export interface ClaimMapping {
  groupsClaim?: string | null;
  departmentClaim?: string | null;
}

export async function resolveSsoUser(q: Tx, claims: Record<string, unknown> & { sub: string }, mapping: ClaimMapping, actor: Omit<AuditActor, 'userId' | 'orgId' | 'name'>) {
  const email = String(claims.email ?? '').trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) throw new SsoDenied('no_email');
  if (claims.email_verified === false) throw new SsoDenied('email_unverified');
  const bySub = (await q.query(`select * from users where external_id = $1 order by created_at limit 1`, [claims.sub])).rows[0];
  let user = bySub ?? (await q.query(`select * from users where lower(email) = $1 order by created_at limit 1`, [email])).rows[0];
  if (user && user.external_id && user.external_id !== claims.sub) throw new SsoDenied('subject_mismatch', user.id, user.org_id);
  if (!user) {
    const org = (await q.query(`select id from organizations order by created_at limit 1`)).rows[0];
    if (!org) throw new SsoDenied('no_account');
    const settings = await orgSettings(q, org.id);
    if (!settings.oidcJitProvisioning) throw new SsoDenied('no_account', null, org.id);
    const name = String(claims.name ?? ([claims.given_name, claims.family_name].filter(Boolean).join(' ') || email.split('@')[0])).slice(0, 200);
    user = (
      await q.query(`insert into users (org_id, email, name, kind, org_role, status, external_id) values ($1, $2, $3, 'employee', 'member', 'active', $4) returning *`, [org.id, email, name, claims.sub])
    ).rows[0];
    await ensurePersonalSpace(q, user);
    await audit(q, { ...actor, orgId: org.id, userId: user.id, name: user.name }, { action: 'user.create', targetType: 'user', targetId: user.id, details: { email, kind: 'employee', method: 'oidc_jit' } });
    await bumpAclEpoch(q, org.id);
  }
  if (user.status === 'invited') user = (await q.query(`update users set status = 'active', updated_at = now() where id = $1 returning *`, [user.id])).rows[0];
  if (user.status !== 'active') throw new SsoDenied('account_disabled', user.id, user.org_id);
  if (user.access_expires_at && new Date(user.access_expires_at) <= new Date()) throw new SsoDenied('access_expired', user.id, user.org_id);
  if (!user.external_id) user = (await q.query(`update users set external_id = $2 where id = $1 returning *`, [user.id, claims.sub])).rows[0];
  const sync = await syncClaimGroups(q, user, claims, mapping);
  if (sync.added.length || sync.removed.length || sync.department !== undefined) {
    await audit(q, { ...actor, orgId: user.org_id, userId: user.id, name: user.name }, { action: 'user.sso_sync', targetType: 'user', targetId: user.id, details: sync });
    await bumpAclEpoch(q, user.org_id);
  }
  await q.query('update users set last_login_at = now(), failed_logins = 0, locked_until = null where id = $1', [user.id]);
  return user;
}

async function syncClaimGroups(q: Tx, user: { id: string; org_id: string; primary_group_id: string | null }, claims: Record<string, unknown>, m: ClaimMapping) {
  const added: string[] = [];
  const removed: string[] = [];
  let department: string | null | undefined;
  const sync = async (kind: 'group' | 'department', names: string[]) => {
    const wanted = names.length
      ? (await q.query(`select id, name from groups where org_id = $1 and kind = $2 and deleted_at is null and lower(name) = any($3::text[])`, [user.org_id, kind, names.map((n) => n.toLowerCase())])).rows
      : [];
    const wantedIds = new Set(wanted.map((g) => g.id as string));
    for (const g of wanted) {
      const r = await q.query(`insert into group_members (group_id, user_id, source) values ($1, $2, 'oidc') on conflict (group_id, user_id) do nothing`, [g.id, user.id]);
      if (r.rowCount) added.push(g.name);
    }
    const stale = await q.query(
      `delete from group_members gm using groups g where g.id = gm.group_id and gm.user_id = $1 and gm.source = 'oidc' and g.kind = $2 and not (gm.group_id = any($3::uuid[])) returning g.name`,
      [user.id, kind, [...wantedIds]],
    );
    removed.push(...stale.rows.map((r) => r.name as string));
    return wanted;
  };
  // A claim that is absent leaves memberships unchanged (the IdP did not say anything); an empty claim removes them.
  if (m.groupsClaim && m.groupsClaim in claims) await sync('group', claimList(claims[m.groupsClaim]));
  if (m.departmentClaim && m.departmentClaim in claims) {
    const wanted = await sync('department', claimList(claims[m.departmentClaim]).slice(0, 1));
    const next = wanted[0]?.id ?? null;
    if (next && next !== user.primary_group_id) {
      await q.query('update users set primary_group_id = $2, updated_at = now() where id = $1', [user.id, next]);
      department = wanted[0].name;
    }
  }
  return { added, removed, ...(department !== undefined ? { department } : {}) };
}
