import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createConnection, createServer, type Server, type Socket } from 'node:net';
import JSZip from 'jszip';
import { startServer, setupOrg, expectStatus, type Api, type TestServer } from '../support/harness.js';
import { clamdPing } from '../../apps/server/src/services/antivirus.js';

/**
 * SEC-L3 / R-SECURITY-007: antivirus against a REAL ClamAV daemon (clamd with the official signature database).
 * Needs KB_TEST_CLAMAV_HOST=host:port of a running clamd (e.g. `clamd` with `TCPSocket 3310`, see docs/SECURITY.md);
 * without it the suite is skipped and says so. The EICAR test string is assembled at runtime so this file itself is
 * not flagged by scanners.
 *
 * "Daemon down" is reproduced with a TCP relay in front of the real clamd: the relay is closed (connection refused) or
 * made to swallow traffic (hung daemon) — the real daemon keeps running for other suites.
 */
const REAL = process.env.KB_TEST_CLAMAV_HOST ?? '';
const EICAR = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS', '-TEST-FILE!$H+H*'].join('');

/** TCP relay to the real clamd; mode 'pass' forwards, 'hang' accepts and never answers; close() = daemon gone. */
async function relay(target: string) {
  const [host, port] = target.split(':');
  let mode: 'pass' | 'hang' = 'pass';
  const open = new Set<Socket>();
  let server: Server | null = null;
  let listenPort = 0;
  const start = () =>
    new Promise<void>((resolve) => {
      server = createServer((client) => {
        open.add(client);
        client.on('close', () => open.delete(client));
        client.on('error', () => undefined);
        if (mode === 'hang') return; // read nothing, answer nothing
        const up = createConnection({ host, port: Number(port) });
        up.on('error', () => client.destroy());
        client.on('error', () => up.destroy());
        client.pipe(up).pipe(client);
      });
      server.listen(listenPort, '127.0.0.1', () => {
        listenPort = (server!.address() as { port: number }).port;
        resolve();
      });
    });
  await start();
  return {
    get host() {
      return `127.0.0.1:${listenPort}`;
    },
    setMode(m: 'pass' | 'hang') {
      mode = m;
    },
    async stop() {
      for (const s of open) s.destroy();
      await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
      server = null;
    },
    start,
  };
}

describe.skipIf(!REAL)('ClamAV — real clamd (SEC-L3, R-SECURITY-007)', () => {
  let ts: TestServer;
  let org: Awaited<ReturnType<typeof setupOrg>>;
  let px: Awaited<ReturnType<typeof relay>>;
  let pageId: string;

  const upload = (api: Api, name: string, data: Buffer, mime = 'application/octet-stream') => {
    const fd = new FormData();
    fd.append('pageId', pageId);
    fd.append('file', new Blob([data], { type: mime }), name);
    return api.req('POST', '/api/v1/attachments', fd);
  };
  const metric = async (name: string, labels = '') => {
    const text = await (await fetch(ts.url + '/metrics')).text();
    const line = text.split('\n').find((l) => l.startsWith(name + (labels ? `{${labels}}` : ' ')) || l.startsWith(name + `{${labels}`));
    return line ? Number(line.split(' ').pop()) : null;
  };

  beforeAll(async () => {
    expect(await clamdPing(REAL), `clamd at ${REAL} must answer PING`).toBe(true);
    px = await relay(REAL);
    ts = await startServer({ clamavHost: px.host, clamavTimeoutMs: 3000 });
    org = await setupOrg(ts);
    pageId = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Антивирус' })).page.id;
  });
  afterAll(async () => {
    await ts?.close();
    await px?.stop();
  });

  it('EICAR attachment is rejected by the real signature database and audited; a clean file is accepted byte-exact', async () => {
    const blobs = (await ts.db.query('select count(*)::int c from blobs')).rows[0].c;
    const body = await expectStatus(upload(org.owner, 'eicar.txt', Buffer.from(EICAR), 'text/plain'), 422);
    expect(JSON.stringify(body)).toMatch(/антивирус/i);
    // Nothing of the infected file is stored.
    expect((await ts.db.query('select count(*)::int c from blobs')).rows[0].c).toBe(blobs);
    const audit = (await ts.db.query(`select details from audit_events where action = 'attachment.rejected' order by id desc limit 1`)).rows[0];
    expect(String(audit.details.reason)).toMatch(/eicar/i); // e.g. "Win.Test.EICAR_HDB-1"

    // EICAR inside a ZIP: clamd unpacks the archive.
    const zip = await new JSZip().file('docs/readme.txt', 'привет').file('tools/eicar.com', EICAR).generateAsync({ type: 'nodebuffer' });
    await expectStatus(upload(org.owner, 'bundle.zip', zip, 'application/zip'), 422);

    const clean = Buffer.from('Обычный документ ' + 'x'.repeat(10_000));
    const ok = (await upload(org.owner, 'clean.txt', clean, 'text/plain')).attachments[0];
    const back = Buffer.from(await (await org.owner.raw('GET', ok.downloadUrl)).arrayBuffer());
    expect(back.equals(clean)).toBe(true);
    // A larger binary (several INSTREAM chunks) is scanned in full and accepted.
    const big = Buffer.alloc(3 * 1024 * 1024, 7);
    const okBig = (await upload(org.owner, 'data.bin', big)).attachments[0];
    expect(okBig.size).toBe(big.length);

    expect(await metric('kb_antivirus_scans_total', 'result="infected"')).toBeGreaterThanOrEqual(2);
    expect(await metric('kb_antivirus_scans_total', 'result="clean"')).toBeGreaterThanOrEqual(2);
    expect(await metric('kb_antivirus_up')).toBe(1);
  });

  it('EICAR in an import is quarantined (nothing registered), the import is refused with the antivirus message', async () => {
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.from(EICAR)]), 'заражённый.md');
    const res = await org.owner.raw('POST', '/api/v1/imports', fd);
    expect(res.status).toBe(422);
    expect((await res.json()).error.message).toMatch(/антивирус/i);
  });

  it('daemon down → fail closed: upload refused with a clear 503, nothing stored, kb_antivirus_up = 0 and error counter grows; recovers when clamd is back', async () => {
    const errorsBefore = (await metric('kb_antivirus_scans_total', 'result="error"')) ?? 0;
    const blobs = (await ts.db.query('select count(*)::int c from blobs')).rows[0].c;
    await px.stop(); // connection refused
    const body = await expectStatus(upload(org.owner, 'report.txt', Buffer.from('чистый текст'), 'text/plain'), 503);
    expect(body.error.code).toBe('av_unavailable');
    expect(body.error.message).toMatch(/Антивирусная проверка недоступна — файл «report.txt» не принят/);
    // Import and archive restore fail closed too.
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.from('# Заметка')]), 'note.md');
    const imp = await org.owner.raw('POST', '/api/v1/imports', fd);
    expect(imp.status).toBe(422);
    expect((await imp.json()).error.message).toMatch(/Антивирусная проверка недоступна/);
    expect((await ts.db.query('select count(*)::int c from blobs')).rows[0].c).toBe(blobs);
    expect(await metric('kb_antivirus_up')).toBe(0);
    expect(await metric('kb_antivirus_scans_total', 'result="error"')).toBeGreaterThanOrEqual(errorsBefore + 2);

    // Hung daemon (accepts, never answers): the CLAMAV_TIMEOUT_MS deadline rejects the file instead of hanging the request.
    await px.start();
    px.setMode('hang');
    const t0 = Date.now();
    await expectStatus(upload(org.owner, 'slow.txt', Buffer.from('ещё текст'), 'text/plain'), 503);
    expect(Date.now() - t0).toBeLessThan(10_000);

    // Back to normal.
    px.setMode('pass');
    const ok = (await upload(org.owner, 'after.txt', Buffer.from('после восстановления'), 'text/plain')).attachments[0];
    expect(ok.filename).toBe('after.txt');
    expect(await metric('kb_antivirus_up')).toBe(1);
  });
});
