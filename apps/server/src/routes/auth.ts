import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { tx } from '../db/pool.js';
import { actorOf, parse, requireUser, SESSION_COOKIE, CSRF_COOKIE, type Services } from '../app.js';
import { createSession, toAuthUser } from '../auth/sessions.js';
import { hashPassword, verifyPassword, passwordProblems } from '../auth/passwords.js';
import { checkTotp, newTotpSecret, totpUri } from '../auth/totp.js';
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
    return { initialized: r.rows[0].c > 0 };
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

  app.post('/api/v1/auth/login', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
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
      if (!checkTotp(user.mfa_secret, body.totp)) return fail('bad_totp', 'Неверный код подтверждения');
    }
    await s.db.query('update users set failed_logins = 0, locked_until = null, last_login_at = now() where id = $1', [user.id]);
    const mustEnrollMfa = settings.requireMfa && !user.mfa_enabled;
    const sess = await createSession(s.db, user.id, s.cfg.sessionTtlHours, { ip: req.ip, userAgent: req.headers['user-agent'], mfaPassed: true });
    setCookies(reply, sess.token, sess.csrf, sess.expiresAt);
    await auditStandalone(s.db, { orgId: user.org_id, userId: user.id, name: user.name, sessionId: sess.id, ip: req.ip, correlationId: req.correlationId }, { action: 'auth.login', details: { method: 'password', mfa: !!user.mfa_enabled } });
    if (user.kind === 'employee') await ensurePersonalSpace(s.db, user);
    return { user: toAuthUser(user), csrfToken: sess.csrf, mustEnrollMfa };
  });

  app.post('/api/v1/auth/logout', async (req, reply) => {
    if (req.session) {
      await s.db.query(`update sessions set revoked_at = now(), revoke_reason = 'logout' where id = $1`, [req.session.id]);
      await auditStandalone(s.db, actorOf(req), { action: 'auth.logout' });
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.clearCookie(CSRF_COOKIE, { path: '/' });
    return { ok: true };
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
    await s.db.query('update users set mfa_secret = $2 where id = $1 and not mfa_enabled', [user.id, secret]);
    const row = (await s.db.query('select mfa_enabled from users where id = $1', [user.id])).rows[0];
    if (row.mfa_enabled) throw conflict('mfa_enabled', 'Двухфакторная аутентификация уже включена');
    return { secret, uri: totpUri(secret, user.email) };
  });

  app.post('/api/v1/auth/mfa/enable', async (req) => {
    const user = requireUser(req);
    const { code } = parse(z.object({ code: z.string() }), req.body);
    const row = (await s.db.query('select mfa_secret from users where id = $1', [user.id])).rows[0];
    if (!row.mfa_secret || !checkTotp(row.mfa_secret, code)) throw new AppError(400, 'bad_code', 'Неверный код подтверждения');
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
    if (!row.mfa_enabled || !checkTotp(row.mfa_secret, code)) throw new AppError(400, 'bad_code', 'Неверный код подтверждения');
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

  app.post('/api/v1/auth/sessions/revoke-others', async (req) => {
    const user = requireUser(req);
    await s.db.query(`update sessions set revoked_at = now(), revoke_reason = 'user' where user_id = $1 and id <> $2 and revoked_at is null`, [user.id, req.session?.id ?? null]);
    return { ok: true };
  });

  /** Accepting an invitation sets the password and activates the account. */
  app.post('/api/v1/auth/invite/accept', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
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

  // ---- OIDC SSO (authorization code + PKCE). Enabled when OIDC_* variables are configured.
  if (s.cfg.oidc) {
    const oidc = await import('../auth/oidc.js');
    const provider = await oidc.createOidc(s.cfg.oidc);
    app.get('/api/v1/auth/oidc/start', async (req: FastifyRequest, reply) => {
      const { url, state, verifier } = await provider.start();
      reply.setCookie('kb_oidc', JSON.stringify({ state, verifier }), { path: '/api/v1/auth/oidc', httpOnly: true, sameSite: 'lax', secure: s.cfg.cookieSecure, maxAge: 600 });
      return reply.redirect(url);
    });
    app.get('/api/v1/auth/oidc/callback', async (req, reply) => {
      const saved = JSON.parse(req.cookies.kb_oidc ?? '{}');
      const claims = await provider.callback(new URL(req.url, s.cfg.publicUrl), saved.state, saved.verifier);
      const email = String(claims.email ?? '').toLowerCase();
      if (!email) throw unauthorized('Провайдер не передал email');
      let user = (await s.db.query(`select * from users where lower(email) = $1 order by created_at limit 1`, [email])).rows[0];
      if (!user) throw unauthorized('Учётная запись не найдена. Обратитесь к администратору.');
      if (user.status === 'invited') user = (await s.db.query(`update users set status = 'active', external_id = $2 where id = $1 returning *`, [user.id, claims.sub])).rows[0];
      if (user.status !== 'active') throw unauthorized('Учётная запись отключена');
      const sess = await createSession(s.db, user.id, s.cfg.sessionTtlHours, { ip: req.ip, userAgent: req.headers['user-agent'], mfaPassed: true });
      setCookies(reply, sess.token, sess.csrf, sess.expiresAt);
      await auditStandalone(s.db, { orgId: user.org_id, userId: user.id, name: user.name, ip: req.ip, correlationId: req.correlationId }, { action: 'auth.login', details: { method: 'oidc' } });
      reply.clearCookie('kb_oidc', { path: '/api/v1/auth/oidc' });
      return reply.redirect('/');
    });
  }

}
