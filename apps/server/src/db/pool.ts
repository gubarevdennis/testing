import pg from 'pg';
import type { Logger } from 'pino';

// Return bigint columns (bigserial, counts) as JS numbers when safe; seq values stay well below 2^53.
pg.types.setTypeParser(20, (v) => Number(v));

export type Db = pg.Pool;
export type Tx = pg.PoolClient;
export type Queryable = pg.Pool | pg.PoolClient;

export function createPool(url: string, max: number, log?: Logger): pg.Pool {
  const pool = new pg.Pool({ connectionString: url, max, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
  pool.on('error', (err) => log?.error({ err }, 'postgres pool error'));
  // A connection that dies while its client is checked out (e.g. backend terminated, failover mid-transaction)
  // emits 'error' on the client; without a listener that is an uncaught exception that kills the process.
  // The pending query still fails and the broken client is discarded by the pool on release.
  pool.on('connect', (client) => client.on('error', (err) => log?.warn({ err: err.message }, 'postgres connection lost')));
  return pool;
}

const RETRYABLE = new Set(['40001', '40P01']); // serialization_failure, deadlock_detected
// admin_shutdown, crash_shutdown, cannot_connect_now (restart / failover / terminated backend)
const CONNECTION_SQLSTATES = new Set(['57P01', '57P02', '57P03', '53300']); // + too_many_connections
const CONNECTION_NODE_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN']);

/** The database is unreachable or the connection was lost (as opposed to an error in the statement itself). */
export function isConnectionError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code ?? '');
  if (CONNECTION_SQLSTATES.has(code) || code.startsWith('08') || CONNECTION_NODE_CODES.has(code)) return true;
  const msg = String(err.message ?? '');
  return /Connection terminated|connection timeout|Client has encountered a connection error|not queryable|does not allow connections|not currently accepting connections|the database system is (starting up|shutting down|in recovery mode)/i.test(msg);
}

/**
 * Runs fn inside a transaction. Retries the whole function on serialization failures / deadlocks, and on
 * connection-level failures that happen before COMMIT is sent (an uncommitted transaction never took effect).
 * A failure during COMMIT itself is ambiguous (it may have committed) and is never retried here.
 * fn must not have external side effects that are not idempotent.
 */
export async function tx<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>, opts: { isolation?: 'read committed' | 'repeatable read' | 'serializable'; retries?: number } = {}): Promise<T> {
  const retries = opts.retries ?? 5;
  for (let attempt = 0; ; attempt++) {
    let client: pg.PoolClient;
    try {
      client = await pool.connect();
    } catch (err) {
      if (isConnectionError(err) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 100 * 2 ** attempt + Math.random() * 50));
        continue;
      }
      throw err;
    }
    let committing = false;
    let broken: Error | undefined;
    try {
      await client.query(`begin isolation level ${opts.isolation ?? 'read committed'}`);
      const result = await fn(client);
      committing = true;
      await client.query('commit');
      return result;
    } catch (err: any) {
      if (isConnectionError(err)) broken = err;
      else await client.query('rollback').catch(() => undefined);
      if (RETRYABLE.has(err?.code) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 10 * 2 ** attempt + Math.random() * 20));
        continue;
      }
      if (broken && !committing && attempt < retries) {
        await new Promise((r) => setTimeout(r, 100 * 2 ** attempt + Math.random() * 50));
        continue;
      }
      throw err;
    } finally {
      client.release(broken); // a broken connection is discarded instead of being returned to the pool
    }
  }
}

export async function one<T = any>(q: Queryable, sql: string, params: unknown[] = []): Promise<T | null> {
  const r = await q.query(sql, params);
  return (r.rows[0] as T) ?? null;
}

export async function many<T = any>(q: Queryable, sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await q.query(sql, params);
  return r.rows as T[];
}
