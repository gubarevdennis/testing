/**
 * Rate limits shared by all application instances (SEC-L4).
 *
 * Security-relevant limits — sign-in (/auth/login, invitation acceptance, SSO start/callback), public-link passwords and
 * uploads — are counted in PostgreSQL (UNLOGGED table rate_limit_counters, fixed windows aligned on the database clock),
 * so N instances behind a load balancer enforce the same limit as one. Routes opt in with
 * `config.rateLimit.distributed = true`; every other route keeps the in-process counter (general overload protection,
 * no database round trip).
 *
 * Fast path: once a key is over its limit, the instance remembers it until the window ends and rejects locally without
 * querying the database. The counter itself is a single INSERT … ON CONFLICT DO UPDATE (row lock on one key, no
 * advisory locks). If PostgreSQL is unreachable the limiter falls back to the local counter (the request would fail on
 * the database anyway; the limit must not turn an outage into a lock-out). Old windows are deleted every minute.
 */
import { createHash } from 'node:crypto';
import type pg from 'pg';
import type { Logger } from 'pino';

export interface Hit {
  current: number;
  ttl: number;
}

/** Fixed-window counter in process memory (per instance). */
export class LocalWindows {
  private m = new Map<string, { start: number; count: number }>();
  hit(key: string, windowMs: number): Hit {
    const now = Date.now();
    const start = Math.floor(now / windowMs) * windowMs;
    let e = this.m.get(key);
    if (!e || e.start !== start) {
      e = { start, count: 0 };
      this.m.set(key, e);
      if (this.m.size > 50_000) for (const [k, v] of this.m) if (v.start < start) this.m.delete(k);
    }
    e.count += 1;
    return { current: e.count, ttl: start + windowMs - now };
  }
  read(key: string, windowMs: number): Hit {
    const now = Date.now();
    const start = Math.floor(now / windowMs) * windowMs;
    const e = this.m.get(key);
    return e && e.start === start ? { current: e.count, ttl: start + windowMs - now } : { current: 0, ttl: 0 };
  }
}

const HIT_SQL = `
  with w as (select to_timestamp(floor(extract(epoch from clock_timestamp()) * 1000 / $2) * $2 / 1000.0) as ws)
  insert into rate_limit_counters (key, window_start, count) select $1, ws, 1 from w
  on conflict (key, window_start) do update set count = rate_limit_counters.count + 1
  returning count, greatest(0, extract(epoch from window_start) * 1000 + $2 - extract(epoch from clock_timestamp()) * 1000)::int as ttl`;

export class SharedRateLimiter {
  private blocked = new Map<string, number>(); // key → epoch ms when its window ends (over the limit until then)
  private local = new LocalWindows();
  private timer: NodeJS.Timeout | null = null;
  /** Database round trips (tests and diagnostics: the fast path must not query). */
  dbHits = 0;

  constructor(
    private readonly db: pg.Pool,
    private readonly log?: Pick<Logger, 'warn'>,
  ) {
    this.timer = setInterval(() => void this.cleanup(), 60_000);
    this.timer.unref?.();
  }

  /** Counts one request for `key` in a window of `windowMs`; `max` enables the local fast path once exceeded. */
  async hit(key: string, windowMs: number, max: number): Promise<Hit> {
    const until = this.blocked.get(key);
    const now = Date.now();
    if (until && until > now) return { current: max + 1, ttl: until - now };
    if (until) this.blocked.delete(key);
    try {
      this.dbHits += 1;
      const r = (await this.db.query(HIT_SQL, [key, windowMs])).rows[0];
      const res = { current: Number(r.count), ttl: Number(r.ttl) };
      if (res.current > max) {
        this.blocked.set(key, now + res.ttl);
        if (this.blocked.size > 50_000) for (const [k, t] of this.blocked) if (t <= now) this.blocked.delete(k);
      }
      return res;
    } catch (e) {
      this.log?.warn({ err: (e as Error).message }, 'shared rate limit unavailable, using the local counter');
      return this.local.hit(key, windowMs);
    }
  }

  async read(key: string, windowMs: number): Promise<Hit> {
    try {
      const r = (
        await this.db.query(
          `select count, greatest(0, extract(epoch from window_start) * 1000 + $2 - extract(epoch from clock_timestamp()) * 1000)::int as ttl from rate_limit_counters
            where key = $1 and window_start = to_timestamp(floor(extract(epoch from clock_timestamp()) * 1000 / $2) * $2 / 1000.0)`,
          [key, windowMs],
        )
      ).rows[0];
      return r ? { current: Number(r.count), ttl: Number(r.ttl) } : { current: 0, ttl: 0 };
    } catch {
      return this.local.read(key, windowMs);
    }
  }

  async cleanup() {
    try {
      await this.db.query(`delete from rate_limit_counters where window_start < now() - interval '2 hours'`);
    } catch {
      /* next time */
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

/** Counter keys are hashed: the default key is the session cookie, which must never be stored in clear. */
export const limitKey = (scope: string, key: string) => createHash('sha256').update(scope + '|' + key).digest('base64url').slice(0, 32);

type Cb = (err: Error | null, res?: Hit) => void;
type WindowParam = number | ((...a: unknown[]) => number);

/**
 * Store for @fastify/rate-limit. The root instance (global limit) and routes without `distributed: true` count
 * locally; distributed routes count in PostgreSQL under "<route>|<key>".
 */
export function rateLimitStore(limiter: SharedRateLimiter) {
  return class KbRateLimitStore {
    readonly local = new LocalWindows();
    constructor(readonly opts: { distributed?: boolean; prefix?: string } = {}) {}
    incr(key: string, cb: Cb, timeWindow: WindowParam, max: number) {
      const ms = typeof timeWindow === 'number' ? timeWindow : 60_000;
      if (!this.opts.distributed) return cb(null, this.local.hit(key, ms));
      limiter.hit(limitKey(this.opts.prefix ?? '', key), ms, max).then((r) => cb(null, r), (e) => cb(e as Error));
    }
    read(key: string, cb: Cb, timeWindow: WindowParam) {
      const ms = typeof timeWindow === 'number' ? timeWindow : 60_000;
      if (!this.opts.distributed) return cb(null, this.local.read(key, ms));
      limiter.read(limitKey(this.opts.prefix ?? '', key), ms).then((r) => cb(null, r), (e) => cb(e as Error));
    }
    child(routeOptions: { distributed?: boolean; groupId?: string; routeInfo?: { method?: string | string[]; url?: string } }) {
      const ri = routeOptions.routeInfo ?? {};
      return new KbRateLimitStore({ distributed: !!routeOptions.distributed, prefix: routeOptions.groupId ?? `${[ri.method].flat().join(',')} ${ri.url ?? ''}` });
    }
  };
}
