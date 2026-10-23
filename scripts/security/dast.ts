// Baseline DAST, black-box (R-SECURITY-004): starts its own server process on a fresh database and probes it over
// HTTP/WebSocket with tests/support/dast.ts. Never touches other instances: own port (DAST_PORT, default 4390),
// own database (kb_dast_<pid>), own data directory; only the process it started is stopped.
//
//   npm run security:dast                       # server from sources (tsx), like the e2e server
//   KB_SERVER_BUILT=1 npm run security:dast     # server from apps/server/dist (run `npm run build` first)
//
// Report: test-results/security/dast-report.json (+ a text summary on stdout). Exit 1 on any finding.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Dast, summarize } from '../../tests/support/dast.js';
import { startIsolatedServer } from './isolated-server.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const limits = { authPerMinute: 15, apiPerMinute: 1500 };
const srv = await startIsolatedServer({
  port: Number(process.env.DAST_PORT ?? 4390),
  dbPrefix: 'kb_dast',
  env: { AUTH_RATE_LIMIT_PER_MINUTE: String(limits.authPerMinute), RATE_LIMIT_PER_MINUTE: String(limits.apiPerMinute), TRUST_PROXY: '1' },
});

let code = 1;
try {
  const dast = new Dast({ base: srv.base, limits, proxyHops: 1 });
  const report = { ...(await dast.runAll()), mode: srv.built ? 'built (apps/server/dist)' : 'sources (tsx)', webClient: srv.webSrc };
  const out = resolve(root, 'test-results/security/dast-report.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(summarize(report));
  console.log(`report: ${out}`);
  code = report.findings.length ? 1 : 0;
} catch (e) {
  console.error(e);
} finally {
  await srv.stop();
}
process.exit(code);
