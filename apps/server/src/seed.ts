import type pg from 'pg';
import { tx } from './db/pool.js';
import { bootstrapOrg } from './services/org.js';

/** Demo organisation for local development and pilots (idempotent: does nothing if an organisation exists). */
export async function seedDemo(db: pg.Pool, log: (m: string) => void) {
  const n = (await db.query('select count(*)::int c from organizations')).rows[0].c;
  if (n > 0) {
    log('organisation already exists — seed skipped');
    return;
  }
  const { owner } = await tx(db, (q) => bootstrapOrg(q, { orgName: 'Демо-компания', slug: 'demo', ownerEmail: 'admin@demo.local', ownerName: 'Администратор', password: 'Demo-password-1' }));
  log(`demo organisation created; login admin@demo.local / Demo-password-1 (owner ${owner.id})`);
}
