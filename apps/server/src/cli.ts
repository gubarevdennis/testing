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
      else {
        // Backup-before-migration guard (R-OPS-004); --skip-backup-check is a deliberate, logged override
        // (restore.sh uses it: a database restored from a backup is itself the backup).
        const skip = rest.includes('--skip-backup-check') || sub === '--skip-backup-check';
        if (skip) console.error('WARNING: backup-before-migration check skipped (--skip-backup-check)');
        log(`applied: ${(await migrateUp(db, log, undefined, undefined, { requireBackupWithinMinutes: skip ? null : cfg.migrationBackupMaxAgeMinutes })).join(', ') || 'nothing (up to date)'}`);
      }
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
    case 'restore-pages': {
      // Page/space restore from a backup restored into a separate database (R-BACKUP-015), see BACKUP_RESTORE.md.
      // restore-pages --source <db url> (--page <id>... [--children] | --space <id>) --user <email> [--apply] [--label <text>] [--source-storage <dir>]
      const args = [sub, ...rest].filter((x): x is string => x !== undefined);
      const opt = (name: string) => args.filter((_, i) => args[i - 1] === name);
      const source = opt('--source')[0];
      if (!source || (!opt('--page').length && !opt('--space').length) || !opt('--user')[0]) throw new Error('usage: restore-pages --source <db url> (--page <id>... [--children] | --space <id>) --user <email> [--apply] [--label <text>] [--source-storage <dir>]');
      const { previewPartialRestore, applyPartialRestore } = await import('./services/partial-restore.js');
      const { createBlobStore } = await import('./storage/blob-store.js');
      const src = createPool(source, 2);
      try {
        const scope = { pageIds: opt('--page'), spaceId: opt('--space')[0], includeChildren: args.includes('--children') };
        if (!args.includes('--apply')) {
          console.log(JSON.stringify({ mode: 'preview', ...(await previewPartialRestore(db, src, scope)) }, null, 2));
          break;
        }
        const user = (await db.query('select id from users where lower(email) = lower($1)', [opt('--user')[0]])).rows[0];
        if (!user) throw new Error('user not found: ' + opt('--user')[0]);
        const liveStore = await createBlobStore(cfg);
        const srcDir = opt('--source-storage')[0];
        const sourceStore = srcDir ? await createBlobStore({ ...cfg, storage: { driver: 'fs', root: srcDir } }) : null;
        const label = opt('--label')[0] ?? `копия от ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
        const r = await tx(db, (q) => applyPartialRestore(db, src, scope, { userId: user.id, label, liveStore, sourceStore }, q));
        console.log(JSON.stringify({ mode: 'apply', ...r }, null, 2));
      } finally {
        await src.end();
      }
      break;
    }
    default:
      console.log('commands: migrate [up|down N|status] | bootstrap | seed | audit-verify | restore-pages');
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await db.end();
}
