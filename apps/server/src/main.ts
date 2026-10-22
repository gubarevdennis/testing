import { createServer } from './server.js';

const srv = await createServer();
const { app, cfg } = srv;
await app.listen({ port: cfg.port, host: cfg.host });
app.log.info(`Knowledge base listening on ${cfg.host}:${cfg.port}`);

let shuttingDown = false;
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`${sig}: graceful shutdown (flushing documents)`);
    const force = setTimeout(() => process.exit(1), 30_000);
    try {
      await srv.close();
    } finally {
      clearTimeout(force);
      process.exit(0);
    }
  });
}
