import { loadConfig, type Config } from './config.js';
import { buildApp, createLogger } from './app.js';
import { createPool } from './db/pool.js';
import { migrateUp } from './db/migrate.js';
import { createBlobStore } from './storage/blob-store.js';
import { Worker } from './jobs/worker.js';
import './jobs/handlers.js';

/** Creates a fully wired server (used by main and by tests). */
export async function createServer(overrides: Partial<Config> = {}, opts: { migrate?: boolean; worker?: boolean } = {}) {
  const cfg = loadConfig(overrides);
  const log = createLogger(cfg);
  const db = createPool(cfg.databaseUrl, cfg.dbPoolSize, log);
  if (opts.migrate !== false) await migrateUp(db, (m) => log.info(m));
  const store = await createBlobStore(cfg);
  const { app, services } = await buildApp({ cfg, db, log, store });
  const worker = new Worker(services, log);
  if (opts.worker ?? cfg.workerEnabled) worker.start();
  app.addHook('onClose', async () => {
    await worker.stop();
  });
  const close = async () => {
    await app.close();
    await db.end();
  };
  return { app, services, worker, cfg, close };
}
