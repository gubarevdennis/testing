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

  return function logDenial(req: FastifyRequest, message: string) {
    const now = Date.now();
    if (now - windowStart > windowMs) {
      windowStart = now;
      written = 0;
      for (const [k, at] of seen) if (now - at > windowMs) seen.delete(k);
    }
    const route = req.routeOptions?.url ?? req.url.split('?')[0];
    const target = (req.params as Record<string, string> | undefined)?.id ?? null;
    const key = `${req.user?.id ?? req.ip}|${req.method} ${route}|${target ?? ''}`;
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
      { action: 'access.denied', outcome: 'denied', targetType: 'route', targetId: target, details: { method: req.method, route, message, suppressedSinceLast: extra } },
    ).catch((err) => log.warn({ err: (err as Error).message }, 'failed to audit access denial'));
  };
}
