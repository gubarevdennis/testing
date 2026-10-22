import type { FastifyRequest } from 'fastify';
import type { Logger } from 'pino';
import type pg from 'pg';
import { auditStandalone } from './audit.js';

/**
 * Records access denials (HTTP 403) in the audit log. Denials can be produced in bulk (a stale client polling,
 * a script probing ids), so the log is rate limited: one entry per actor + route + target per window, and a
 * global ceiling per window. Suppressed denials are counted and reported with the next written entry.
 */
export function createDenialLogger(db: pg.Pool, log: Logger, opts: { windowMs?: number; perWindow?: number } = {}) {
  const windowMs = opts.windowMs ?? 60_000;
  const perWindow = opts.perWindow ?? 300;
  const seen = new Map<string, number>();
  let windowStart = Date.now();
  let written = 0;
  let suppressed = 0;

  return function logDenial(req: FastifyRequest, message: string, kind: 'forbidden' | 'not_found' = 'forbidden') {
    const now = Date.now();
    if (now - windowStart > windowMs) {
      windowStart = now;
      written = 0;
      for (const [k, at] of seen) if (now - at > windowMs) seen.delete(k);
    }
    const route = req.routeOptions?.url ?? req.url.split('?')[0];
    const target = (req.params as Record<string, string> | undefined)?.id ?? null;
    const key = `${kind}|${req.user?.id ?? req.ip}|${req.method} ${route}|${target ?? ''}`;
    const last = seen.get(key);
    if ((last && now - last < windowMs) || written >= perWindow) {
      suppressed++;
      return;
    }
    seen.set(key, now);
    written++;
    const extra = suppressed;
    suppressed = 0;
    void auditStandalone(
      db,
      { orgId: req.user?.orgId ?? null, userId: req.user?.id ?? null, name: req.user?.name ?? null, sessionId: req.session?.id ?? null, ip: req.ip, correlationId: req.correlationId },
      // 404 is how the API hides resources the user may not see (D-11): such probes are audited as access.not_found.
      { action: kind === 'forbidden' ? 'access.denied' : 'access.not_found', outcome: 'denied', targetType: 'route', targetId: target, details: { method: req.method, route, message, suppressedSinceLast: extra } },
    ).catch((err) => log.warn({ err: (err as Error).message }, 'failed to audit access denial'));
  };
}

/**
 * Document views in the tamper-evident audit log (R-AUDIT-001, OPS-014): one record per user and page per window
 * (default 10 minutes) so that reading a document stays cheap while "who opened it and when" is answerable.
 */
export function createViewLogger(db: pg.Pool, log: Logger, opts: { windowMs?: number } = {}) {
  const windowMs = opts.windowMs ?? 600_000;
  const seen = new Map<string, number>();
  return function logView(req: FastifyRequest, pageId: string) {
    if (!req.user) return;
    const now = Date.now();
    const key = req.user.id + '|' + pageId;
    if ((seen.get(key) ?? 0) > now - windowMs) return;
    seen.set(key, now);
    if (seen.size > 50_000) for (const [k, at] of seen) if (at < now - windowMs) seen.delete(k);
    void auditStandalone(
      db,
      { orgId: req.user.orgId, userId: req.user.id, name: req.user.name, sessionId: req.session?.id ?? null, ip: req.ip, correlationId: req.correlationId },
      { action: 'page.view', targetType: 'page', targetId: pageId },
    ).catch((err) => log.warn({ err: (err as Error).message }, 'failed to audit page view'));
  };
}
