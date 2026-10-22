import { loadConfig } from './config.js';
import { createPool, tx } from './db/pool.js';
import { migrateUp, migrateDown, migrationStatus } from './db/migrate.js';
import { bootstrapOrg } from './services/org.js';
import { verifyAuditChain } from './services/audit.js';

const [cmd, sub, ...rest] = process.argv.slice(2);
const cfg = loadConfig();
const db = createPool(cfg.databaseUrl, 2);
const log = (m: string) => console.log(m);

try {
  switch (cmd) {
    case 'migrate':
      if (sub === 'down') log(`rolled back: ${(await migrateDown(db, Number(rest[0] ?? 1), log)).join(', ') || 'nothing'}`);
      else if (sub === 'status') console.table(await migrationStatus(db));
      else log(`applied: ${(await migrateUp(db, log)).join(', ') || 'nothing (up to date)'}`);
      break;
    case 'bootstrap': {
      // kb bootstrap "Org name" owner@example.com "Owner Name" password
      const [orgName, email, name, password] = [sub, ...rest];
      if (!orgName || !email || !name || !password) throw new Error('usage: bootstrap <orgName> <email> <name> <password>');
      await migrateUp(db, log);
      const r = await tx(db, (q) => bootstrapOrg(q, { orgName, slug: 'org', ownerEmail: email, ownerName: name, password }));
      log(`organisation ${r.org.id} created, owner ${r.owner.email}`);
      break;
    }
    case 'audit-verify':
      console.log(await verifyAuditChain(db));
      break;
    case 'seed': {
      const { seedDemo } = await import('./seed.js');
      await migrateUp(db, log);
      await seedDemo(db, log);
      break;
    }
    default:
      console.log('commands: migrate [up|down N|status] | bootstrap | seed | audit-verify');
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await db.end();
}
