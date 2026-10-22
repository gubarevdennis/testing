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
  return pool;
}

const RETRYABLE = new Set(['40001', '40P01']); // serialization_failure, deadlock_detected

/**
 * Runs fn inside a transaction. Retries on serialization failures / deadlocks (the whole function is re-run),
 * so fn must not have external side effects that are not idempotent.
 */
export async function tx<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>, opts: { isolation?: 'read committed' | 'repeatable read' | 'serializable'; retries?: number } = {}): Promise<T> {
  const retries = opts.retries ?? 5;
  for (let attempt = 0; ; attempt++) {
    const client = await pool.connect();
    try {
      await client.query(`begin isolation level ${opts.isolation ?? 'read committed'}`);
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (err: any) {
      await client.query('rollback').catch(() => undefined);
      if (RETRYABLE.has(err?.code) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 10 * 2 ** attempt + Math.random() * 20));
        continue;
      }
      throw err;
    } finally {
      client.release();
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
