import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { tx } from '../db/pool.js';
import { actorOf, parse, requireUser, SESSION_COOKIE, CSRF_COOKIE, type Services } from '../app.js';
import { createSession, toAuthUser } from '../auth/sessions.js';
import { hashPassword, verifyPassword, passwordProblems } from '../auth/passwords.js';
import { checkTotp, newTotpSecret, totpUri } from '../auth/totp.js';
import { openSecret, sealSecret } from '../auth/secretbox.js';
import { audit, auditStandalone } from '../services/audit.js';
import { bootstrapOrg, ensurePersonalSpace, orgSettings } from '../services/org.js';
import { AppError, badRequest, conflict, unauthorized } from '../lib/errors.js';
import { sha256 } from '../lib/crypto.js';

const MAX_FAILED = 10;
const LOCK_MINUTES = 15;

export async function authRoutes(app: FastifyInstance, s: Services) {
  const setCookies = (reply: FastifyReply, token: string, csrf: string, expires: Date) => {
    reply.setCookie(SESSION_COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: s.cfg.cookieSecure, expires });
    reply.setCookie(CSRF_COOKIE, csrf, { path: '/', httpOnly: false, sameSite: 'lax', secure: s.cfg.cookieSecure, expires });
  };

  app.get('/api/v1/setup/status', async () => {
    const r = await s.db.query('select count(*)::int c from organizations');
    return { initialized: r.rows[0].c > 0, sso: !!s.cfg.oidc };
  });

  /** First-run bootstrap: only possible while no organisation exists. */
  app.post('/api/v1/setup', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = parse(
      z.object({ orgName: z.string().min(1).max(200), slug: z.string().regex(/^[a-z0-9-]{2,50}$/).optional(), ownerEmail: z.string().email(), ownerName: z.string().min(1).max(200), password: z.string() }),
      req.body,
    );
    const result = await tx(s.db, async (q) => {
      await q.query('select pg_advisory_xact_lock(1)');
      const n = await q.query('select count(*)::int c from organizations');
      if (n.rows[0].c > 0) throw conflict('already_initialized', 'Система уже настроена');
      return bootstrapOrg(q, { ...body, slug: body.slug ?? 'org' });
    });
    const sess = await createSession(s.db, result.owner.id, s.cfg.sessionTtlHours, { ip: req.ip, userAgent: req.headers['user-agent'], mfaPassed: true });
    setCookies(reply, sess.token, sess.csrf, sess.expiresAt);
    return { user: toAuthUser(result.owner), csrfToken: sess.csrf };
  });

  app.post('/api/v1/auth/login', { config: { rateLimit: { max: s.cfg.authRateLimitPerMinute, timeWindow: '1 minute', distributed: true } as any } }, async (req, reply) => {
    const body = parse(z.object({ email: z.string().min(3).max(320), password: z.string().min(1).max(1024), totp: z.string().optional(), org: z.string().optional() }), req.body);
    const email = body.email.trim().toLowerCase();
    const rows = (await s.db.query(`select u.* from users u join organizations o on o.id = u.org_id where lower(u.email) = $1 ${body.org ? 'and o.slug = $2' : ''} order by u.created_at limit 2`, body.org ? [email, body.org] : [email])).rows;
    const user = rows[0];
    const fail = async (reason: string, message = 'Неверный email или пароль') => {
      if (user) await s.db.query(`update users set failed_logins = failed_logins + 1, locked_until = case when failed_logins + 1 >= $2 then now() + make_interval(mins => $3) else locked_until end where id = $1`, [user.id, MAX_FAILED, LOCK_MINUTES]);
      await auditStandalone(s.db, { orgId: user?.org_id ?? null, userId: user?.id ?? null, ip: req.ip, correlationId: req.correlationId }, { action: 'auth.login', outcome: 'denied', details: { email, reason } });
      throw unauthorized(message);
    };
    if (!user) {
      await verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$4uL2aYv0wEQ3cZQwQ3XoG3Yt2q3OX3n5S0m9ZQvJk2E', body.password); // equalise timing
      return fail('unknown_user');
    }
    if (user.locked_until && new Date(user.locked_until) > new Date()) return fail('locked', 'Слишком много неудачных попыток. Попробуйте позже.');
    if (user.status !== 'active') return fail('status_' + user.status, user.status === 'invited' ? 'Примите приглашение, чтобы установить пароль' : 'Учётная запись отключена');
    if (user.access_expires_at && new Date(user.access_expires_at) <= new Date()) return fail('expired', 'Срок доступа истёк');
    const settings = await orgSettings(s.db, user.org_id);
    if (settings.ssoOnly && user.org_role !== 'owner') return fail('sso_only', 'Вход возможен только через корпоративный SSO');
    if (!(await verifyPassword(user.password_hash, body.password))) return fail('bad_password');
    if (user.mfa_enabled) {
      if (!body.totp) return reply.status(200).send({ mfaRequired: true });
      if (!checkTotp(openSecret(s.cfg.secretKey, 'totp', user.mfa_secret) ?? '', body.totp)) return fail('bad_totp', 'Неверный код подтверждения');
    }
    await s.db.query('update users set failed_logins = 0, locked_until = null, last_login_at = now() where id = $1', [user.id]);
    const mustEnrollMfa = settings.requireMfa && !user.mfa_enabled;
    const sess = await createSession(s.db, user.id, s.cfg.sessionTtlHours, { ip: req.ip, userAgent: req.headers['user-agent'], mfaPassed: true });
    setCookies(reply, sess.token, sess.csrf, sess.expiresAt);
    await auditStandalone(s.db, { orgId: user.org_id, userId: user.id, name: user.name, sessionId: sess.id, ip: req.ip, correlationId: req.correlationId }, { action: 'auth.login', details: { method: 'password', mfa: !!user.mfa_enabled } });
    if (user.kind === 'employee') await ensurePersonalSpace(s.db, user);
    return { user: toAuthUser(user), csrfToken: sess.csrf, mustEnrollMfa };
  });

  /** Set when OIDC is configured (below): the IdP end-session URL for an SSO session. */
  let oidcLogoutUrl: ((sessionId: string) => Promise<string | null>) | null = null;

  app.post('/api/v1/auth/logout', async (req, reply) => {
    let redirect: string | null = null;
    if (req.session) {
      // SSO session: the browser is sent on to the IdP so its session ends too (RP-initiated logout).
      redirect = oidcLogoutUrl ? await oidcLogoutUrl(req.session.id).catch(() => null) : null;
      await s.db.query(`update sessions set revoked_at = now(), revoke_reason = 'logout', id_token_sealed = null where id = $1`, [req.session.id]);
      await auditStandalone(s.db, actorOf(req), { action: 'auth.logout', details: redirect ? { method: 'oidc' } : undefined });
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.clearCookie(CSRF_COOKIE, { path: '/' });
    return { ok: true, redirect };
  });

  app.get('/api/v1/auth/me', async (req) => {
    const user = requireUser(req);
    const row = (await s.db.query('select u.*, o.name as org_name, o.slug as org_slug from users u join organizations o on o.id = u.org_id where u.id = $1', [user.id])).rows[0];
    const personal = (await s.db.query(`select id from spaces where kind = 'personal' and owner_user_id = $1`, [user.id])).rows[0];
    const settings = await orgSettings(s.db, user.orgId);
    return {
      user: { ...toAuthUser(row), mfaEnabled: row.mfa_enabled, title: row.title, preferences: row.preferences, accessExpiresAt: row.access_expires_at },
      org: { id: row.org_id, name: row.org_name, slug: row.org_slug, settings: { guestsEnabled: settings.guestsEnabled, publicLinksEnabled: settings.publicLinksEnabled, requireMfa: settings.requireMfa } },
      personalSpaceId: personal?.id ?? null,
      csrfToken: req.session?.csrfToken ?? null,
      sso: !!s.cfg.oidc,
    };
  });

  /** Own profile: display name and job title (email and role are managed by administrators / SSO). */
  app.patch('/api/v1/auth/me', async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ name: z.string().trim().min(1).max(200).optional(), title: z.string().trim().max(200).nullable().optional() }), req.body);
    const r = await tx(s.db, async (q) => {
      const row = (
        await q.query(`update users set name = coalesce($2, name), title = case when $3::boolean then $4 else title end, updated_at = now() where id = $1 returning name, title`, [user.id, body.name ?? null, body.title !== undefined, body.title ?? null])
      ).rows[0];
      await audit(q, actorOf(req), { action: 'user.profile_update', targetType: 'user', targetId: user.id, details: { fields: Object.keys(body) } });
      return row;
    });
    return { user: r };
  });

  app.patch('/api/v1/auth/me/preferences', async (req) => {
    const user = requireUser(req);
    const body = parse(z.record(z.string(), z.unknown()), req.body);
    if (JSON.stringify(body).length > 20_000) throw badRequest('Слишком большие настройки');
    const r = await s.db.query(`update users set preferences = preferences || $2::jsonb, updated_at = now() where id = $1 returning preferences`, [user.id, body]);
    return { preferences: r.rows[0].preferences };
  });

  app.post('/api/v1/auth/password', async (req) => {
    const user = requireUser(req);
    const body = parse(z.object({ current: z.string(), next: z.string() }), req.body);
    const row = (await s.db.query('select password_hash from users where id = $1', [user.id])).rows[0];
    if (!(await verifyPassword(row.password_hash, body.current))) throw new AppError(400, 'bad_password', 'Текущий пароль указан неверно');
    const p = passwordProblems(body.next);
    if (p) throw badRequest(p);
    await tx(s.db, async (q) => {
      await q.query('update users set password_hash = $2, updated_at = now() where id = $1', [user.id, await hashPassword(body.next)]);
      // Other sessions are signed out after a password change.
      await q.query(`update sessions set revoked_at = now(), revoke_reason = 'password_change' where user_id = $1 and id <> $2 and revoked_at is null`, [user.id, req.session?.id ?? null]);
      await audit(q, actorOf(req), { action: 'auth.password_change', targetType: 'user', targetId: user.id });
    });
    return { ok: true };
  });

  app.post('/api/v1/auth/mfa/setup', async (req) => {
    const user = requireUser(req);
    const secret = newTotpSecret();
    await s.db.query('update users set mfa_secret = $2 where id = $1 and not mfa_enabled', [user.id, sealSecret(s.cfg.secretKey, 'totp', secret)]);
    const row = (await s.db.query('select mfa_enabled from users where id = $1', [user.id])).rows[0];
    if (row.mfa_enabled) throw conflict('mfa_enabled', 'Двухфакторная аутентификация уже включена');
    return { secret, uri: totpUri(secret, user.email) };
  });

  app.post('/api/v1/auth/mfa/enable', async (req) => {
    const user = requireUser(req);
    const { code } = parse(z.object({ code: z.string() }), req.body);
    const row = (await s.db.query('select mfa_secret from users where id = $1', [user.id])).rows[0];
    if (!row.mfa_secret || !checkTotp(openSecret(s.cfg.secretKey, 'totp', row.mfa_secret) ?? '', code)) throw new AppError(400, 'bad_code', 'Неверный код подтверждения');
    await tx(s.db, async (q) => {
      await q.query('update users set mfa_enabled = true where id = $1', [user.id]);
      await audit(q, actorOf(req), { action: 'auth.mfa_enable', targetType: 'user', targetId: user.id });
    });
    return { ok: true };
  });

  app.post('/api/v1/auth/mfa/disable', async (req) => {
    const user = requireUser(req);
    const { code } = parse(z.object({ code: z.string() }), req.body);
    const row = (await s.db.query('select mfa_secret, mfa_enabled from users where id = $1', [user.id])).rows[0];
    if (!row.mfa_enabled || !checkTotp(openSecret(s.cfg.secretKey, 'totp', row.mfa_secret) ?? '', code)) throw new AppError(400, 'bad_code', 'Неверный код подтверждения');
    const settings = await orgSettings(s.db, user.orgId);
    if (settings.requireMfa) throw conflict('mfa_required', 'Политика организации требует двухфакторную аутентификацию');
    await tx(s.db, async (q) => {
      await q.query('update users set mfa_enabled = false, mfa_secret = null where id = $1', [user.id]);
      await audit(q, actorOf(req), { action: 'auth.mfa_disable', targetType: 'user', targetId: user.id });
    });
    return { ok: true };
  });

  app.get('/api/v1/auth/sessions', async (req) => {
    const user = requireUser(req);
    const r = await s.db.query(`select id, created_at, last_seen_at, expires_at, ip, user_agent from sessions where user_id = $1 and revoked_at is null and expires_at > now() order by last_seen_at desc`, [user.id]);
    return { sessions: r.rows.map((x) => ({ ...x, current: x.id === req.session?.id })) };
  });

  app.delete('/api/v1/auth/sessions/:id', async (req) => {
    const user = requireUser(req);
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    if (id === req.session?.id) throw badRequest('Чтобы завершить текущий сеанс, выйдите из системы');
    const r = await s.db.query(`update sessions set revoked_at = now(), revoke_reason = 'user' where id = $1 and user_id = $2 and revoked_at is null`, [id, user.id]);
    if (!r.rowCount) throw new AppError(404, 'not_found', 'Сеанс не найден');
    return { ok: true };
  });

  app.post('/api/v1/auth/sessions/revoke-others', async (req) => {
    const user = requireUser(req);
    await s.db.query(`update sessions set revoked_at = now(), revoke_reason = 'user' where user_id = $1 and id <> $2 and revoked_at is null`, [user.id, req.session?.id ?? null]);
    return { ok: true };
  });

  /** Accepting an invitation sets the password and activates the account. */
  app.post('/api/v1/auth/invite/accept', { config: { rateLimit: { max: s.cfg.authRateLimitPerMinute, timeWindow: '1 minute', distributed: true } as any } }, async (req, reply) => {
    const body = parse(z.object({ token: z.string().min(10), password: z.string(), name: z.string().min(1).max(200).optional() }), req.body);
    const p = passwordProblems(body.password);
    if (p) throw badRequest(p);
    const user = await tx(s.db, async (q) => {
      const inv = (await q.query(`select * from invitations where token_hash = $1 for update`, [sha256(body.token)])).rows[0];
      if (!inv || inv.revoked_at || inv.accepted_at || new Date(inv.expires_at) <= new Date()) throw new AppError(400, 'invite_invalid', 'Приглашение недействительно или истекло');
      const u = (await q.query('select * from users where id = $1', [inv.user_id])).rows[0];
      if (!u || u.status === 'suspended' || u.status === 'deactivated') throw new AppError(400, 'invite_invalid', 'Учётная запись отключена');
      await q.query(`update users set password_hash = $2, status = 'active', name = coalesce($3, name), updated_at = now() where id = $1`, [u.id, await hashPassword(body.password), body.name ?? null]);
      await q.query('update invitations set accepted_at = now() where id = $1', [inv.id]);
      await audit(q, { orgId: u.org_id, userId: u.id, name: u.name, ip: req.ip, correlationId: req.correlationId }, { action: 'user.invite_accept', targetType: 'user', targetId: u.id });
      return (await q.query('select * from users where id = $1', [u.id])).rows[0];
    });
    const sess = await createSession(s.db, user.id, s.cfg.sessionTtlHours, { ip: req.ip, userAgent: req.headers['user-agent'], mfaPassed: true });
    setCookies(reply, sess.token, sess.csrf, sess.expiresAt);
    return { user: toAuthUser(user), csrfToken: sess.csrf };
  });

  // ---- OIDC SSO (authorization code + PKCE + state + nonce). Enabled when OIDC_* variables are configured.
  // Every failure ends on the login page with a reason (?sso_error=<code>) and an audit record — never a 500.
  if (s.cfg.oidc) {
    const oidcCfg = s.cfg.oidc;
    const provider = (await import('../auth/oidc.js')).createOidc(oidcCfg);
    const { OidcError } = await import('../auth/oidc.js');
    const { resolveSsoUser, SsoDenied } = await import('../services/sso.js');
    const OIDC_COOKIE = 'kb_oidc';
    const cookiePath = '/api/v1/auth/oidc';
    const toLogin = (reply: FastifyReply, code: string) => reply.redirect('/?sso_error=' + encodeURIComponent(code));
    /** Relative in-app path only (no scheme, no protocol-relative //host, no backslashes): no open redirect. */
    const safeReturn = (v: unknown) => (typeof v === 'string' && /^\/(?![/\\])[^\s\\]*$/.test(v) && v.length < 2000 ? v : '/');

    app.get('/api/v1/auth/oidc/start', { config: { rateLimit: { max: s.cfg.authRateLimitPerMinute, timeWindow: '1 minute', distributed: true } as any } }, async (req: FastifyRequest, reply) => {
      let st;
      try {
        st = await provider.start();
      } catch (e) {
        req.log.error({ err: e }, 'oidc start failed');
        return toLogin(reply, 'idp_unavailable');
      }
      const returnTo = safeReturn((req.query as Record<string, unknown>)?.returnTo);
      reply.setCookie(OIDC_COOKIE, JSON.stringify({ state: st.state, verifier: st.verifier, nonce: st.nonce, returnTo }), { path: cookiePath, httpOnly: true, sameSite: 'lax', secure: s.cfg.cookieSecure, maxAge: 600 });
      return reply.redirect(st.url);
    });

    app.get('/api/v1/auth/oidc/callback', { config: { rateLimit: { max: s.cfg.authRateLimitPerMinute, timeWindow: '1 minute', distributed: true } as any } }, async (req, reply) => {
      let saved: Record<string, unknown> = {};
      try {
        saved = JSON.parse(req.cookies[OIDC_COOKIE] ?? '{}') ?? {};
      } catch {
        /* tampered cookie = no saved state */
      }
      // The state cookie is single-use, whatever the outcome.
      reply.clearCookie(OIDC_COOKIE, { path: cookiePath });
      const actor = { ip: req.ip, correlationId: req.correlationId };
      const deny = async (code: string, detail: string, who: { userId?: string | null; orgId?: string | null } = {}) => {
        await auditStandalone(s.db, { ...actor, userId: who.userId ?? null, orgId: who.orgId ?? null }, { action: 'auth.login', outcome: 'denied', details: { method: 'oidc', reason: code, detail: detail.slice(0, 300) } });
        return toLogin(reply, code);
      };
      let result;
      try {
        // The registered redirect URI (not PUBLIC_URL/Host) is what the code was issued for; only the query is taken.
        const current = new URL(oidcCfg.redirectUri);
        current.search = new URL(req.url, 'http://local').search;
        result = await provider.callback(current, saved);
      } catch (e) {
        if (e instanceof OidcError) {
          req.log.warn({ err: e.message, code: e.code }, 'oidc callback rejected');
          return deny(e.code, e.message);
        }
        throw e;
      }
      let user;
      try {
        user = await tx(s.db, (q) => resolveSsoUser(q, result.claims, oidcCfg, actor));
      } catch (e) {
        if (e instanceof SsoDenied) return deny(e.code, String(result.claims.email ?? ''), { userId: e.userId, orgId: e.orgId });
        throw e;
      }
      const sess = await createSession(s.db, user.id, s.cfg.sessionTtlHours, { ip: req.ip, userAgent: req.headers['user-agent'], mfaPassed: true });
      await s.db.query(`update sessions set auth_method = 'oidc', id_token_sealed = $2 where id = $1`, [sess.id, sealSecret(s.cfg.secretKey, 'oidc-id-token', result.idToken)]);
      setCookies(reply, sess.token, sess.csrf, sess.expiresAt);
      await auditStandalone(s.db, { orgId: user.org_id, userId: user.id, name: user.name, sessionId: sess.id, ip: req.ip, correlationId: req.correlationId }, { action: 'auth.login', details: { method: 'oidc', sub: result.claims.sub } });
      return reply.redirect(safeReturn(saved.returnTo));
    });

    /** IdP logout URL for the current session (used by POST /auth/logout; exposed for clients that sign out elsewhere). */
    oidcLogoutUrl = async (sessionId: string) => {
      const row = (await s.db.query(`select auth_method, id_token_sealed from sessions where id = $1`, [sessionId])).rows[0];
      if (row?.auth_method !== 'oidc') return null;
      return provider.logoutUrl(openSecret(s.cfg.secretKey, 'oidc-id-token', row.id_token_sealed));
    };
  }

}
