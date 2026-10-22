import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import yaml from 'js-yaml';
import { startServer, setupOrg, type TestServer } from '../support/harness.js';
import { openClient } from '../support/collab.js';
import { REPO_ROOT } from '../support/process-server.js';

// Observability for OPS P0 (R-OPS-003, R-OPS-022): distributed tracing exported over OTLP, the metrics behind the
// new alerts (WebSocket reconnects, import failure rate, OCR latency) and the consistency of the alert rules.

let collector: Server;
let received: Array<{ headers: Record<string, unknown>; body: any }> = [];
let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  collector = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (req.url === '/v1/traces') received.push({ headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
  });
  await new Promise<void>((r) => collector.listen(0, '127.0.0.1', r));
  const port = (collector.address() as { port: number }).port;
  ts = await startServer({ tracing: { endpoint: `http://127.0.0.1:${port}`, serviceName: 'kb-test', headers: 'x-collector-token=s3cr3t' } }, { worker: true });
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => {
  await ts?.close();
  await new Promise((r) => collector?.close(r));
});

const spans = () => received.flatMap((r) => r.body.resourceSpans.flatMap((rs: any) => rs.scopeSpans.flatMap((ss: any) => ss.spans.map((s: any) => ({ ...s, resource: rs.resource })))));
const attr = (s: any, k: string) => {
  const v = s.attributes.find((a: any) => a.key === k)?.value;
  return v ? (v.stringValue ?? v.intValue ?? v.boolValue ?? v.doubleValue) : undefined;
};
const metric = async (name: string) => {
  const text = await (await fetch(ts.url + '/metrics')).text();
  return text.split('\n').filter((l) => l.startsWith(name));
};

describe('distributed tracing (R-OPS-003, R-OPS-022)', () => {
  it('HTTP requests and background jobs are OpenTelemetry spans: W3C traceparent is continued and returned, jobs join the trace of the request that created them, spans reach the OTLP collector (R-OPS-003, R-OPS-022)', async () => {
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const parent = '00f067aa0ba902b7';
    const r = await org.owner.raw('GET', '/api/v1/spaces', undefined, { traceparent: `00-${traceId}-${parent}-01` });
    expect(r.status).toBe(200);
    const tp = r.headers.get('traceparent')!;
    expect(tp).toMatch(new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`));
    const serverSpanId = tp.split('-')[2];
    expect(serverSpanId).not.toBe(parent);
    // Without an incoming context a new trace starts; errors are marked on the span.
    const bad = await org.owner.raw('GET', '/api/v1/pages/00000000-0000-4000-8000-000000000000');
    expect(bad.status).toBe(404);
    const badTrace = bad.headers.get('traceparent')!.split('-')[1];
    expect(badTrace).not.toBe(traceId);
    // A background job (import analysis) continues the trace of the request that queued it.
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.from('# Трассировка\n\nтекст')]), 'trace.md');
    const imp = await org.owner.raw('POST', '/api/v1/imports', fd, { traceparent: `00-${traceId}-${parent}-01` });
    const { jobId } = await imp.json();
    for (let i = 0; i < 100; i++) {
      const j = await org.owner.get(`/api/v1/imports/${jobId}`);
      if (!['queued', 'running'].includes(j.status)) break;
      await new Promise((res) => setTimeout(res, 100));
    }
    await new Promise((res) => setTimeout(res, 200));
    await ts.srv.services.tracer.flush();
    const all = spans();
    expect(received[0].headers['x-collector-token']).toBe('s3cr3t');
    const resource = all[0].resource.attributes.find((a: any) => a.key === 'service.name').value.stringValue;
    expect(resource).toBe('kb-test');
    const server = all.find((s) => s.spanId === serverSpanId);
    expect(server).toBeTruthy();
    expect(server.traceId).toBe(traceId);
    expect(server.parentSpanId).toBe(parent);
    expect(server.kind).toBe(2);
    expect(server.name).toBe('GET /api/v1/spaces');
    expect(attr(server, 'http.response.status_code')).toBe('200');
    expect(attr(server, 'enduser.id')).toBe(org.owner.user.id);
    expect(BigInt(server.endTimeUnixNano)).toBeGreaterThan(BigInt(server.startTimeUnixNano));
    const notFound = all.find((s) => s.traceId === badTrace);
    expect(attr(notFound, 'http.response.status_code')).toBe('404');
    const job = all.find((s) => s.name === 'job import-analyze' && attr(s, 'kb.job.id') === jobId);
    expect(job, JSON.stringify(all.map((s) => s.name))).toBeTruthy();
    expect(job.traceId).toBe(traceId);
    expect(job.kind).toBe(5);
    expect(ts.srv.services.tracer.dropped).toBe(0);
  });
});

describe('metrics behind the new alerts (R-OPS-003)', () => {
  it('WebSocket reconnects, import results by format and OCR latency are exported (R-OPS-003)', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Метрики' })).page;
    const value = async (name: string) => Number((await metric(name))[0]?.split(' ').pop() ?? 0);
    const before = await value('kb_collab_reconnects_total');
    const c1 = await openClient(ts.url, org.owner, page.id);
    c1.close();
    await new Promise((r) => setTimeout(r, 200));
    const c2 = await openClient(ts.url, org.owner, page.id); // same session, same page, right after a disconnect
    c2.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(await value('kb_collab_reconnects_total')).toBe(before + 1);
    // Import results by format: a broken DOCX is an error, a Markdown file is ok.
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(50, 1)])]), 'сломан.docx');
    fd.append('file', new Blob([Buffer.from('# ok')]), 'ok.md');
    const { jobId } = await org.owner.req('POST', '/api/v1/imports', fd);
    for (let i = 0; i < 100; i++) {
      if (!['queued', 'running'].includes((await org.owner.get(`/api/v1/imports/${jobId}`)).status)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(await metric('kb_import_files_total{format="docx",status="error"}')).toHaveLength(1);
    expect(await metric('kb_import_files_total{format="md",status="ok"}')).toHaveLength(1);
    // OCR latency: an uploaded image is recognised by the worker and timed.
    const fd2 = new FormData();
    fd2.append('pageId', page.id);
    fd2.append('file', new Blob([await sharp({ create: { width: 160, height: 60, channels: 3, background: '#ffffff' } }).png().toBuffer()], { type: 'image/png' }), 'blank.png');
    const att = (await org.owner.req('POST', '/api/v1/attachments', fd2)).attachments[0];
    for (let i = 0; i < 600; i++) {
      const o = (await org.owner.get(`/api/v1/attachments/${att.id}/ocr`)).ocr;
      if (o && ['done', 'partial', 'error'].includes(o.status)) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    const count = (await metric('kb_ocr_duration_seconds_count')).reduce((n, l) => n + Number(l.split(' ').pop()), 0);
    expect(count).toBeGreaterThanOrEqual(1);
  }, 180_000);

  it('every alert rule uses metrics the application or the backup scripts export and links to an existing runbook with an owner (R-OPS-003, R-OPS-022)', async () => {
    const rules = yaml.load(readFileSync(join(REPO_ROOT, 'deploy/monitoring/prometheus-alerts.yml'), 'utf8')) as any;
    const exported = new Set((await (await fetch(ts.url + '/metrics')).text()).split('\n').filter((l) => l.startsWith('# TYPE ')).map((l) => l.split(' ')[2]));
    // Written by scripts/backup/* as node_exporter textfile metrics.
    const scripts = readFileSync(join(REPO_ROOT, 'scripts/backup/lib.sh'), 'utf8') + readFileSync(join(REPO_ROOT, 'scripts/backup/backup.sh'), 'utf8') + readFileSync(join(REPO_ROOT, 'scripts/backup/verify-backup.sh'), 'utf8') + readFileSync(join(REPO_ROOT, 'scripts/backup/wal-archive.sh'), 'utf8');
    const ops = readFileSync(join(REPO_ROOT, 'docs/OPERATIONS.md'), 'utf8');
    let n = 0;
    for (const g of rules.groups)
      for (const r of g.rules) {
        n++;
        expect(r.labels.owner, r.alert).toMatch(/^(ops|dba|dev)$/);
        const anchor = /docs\/OPERATIONS\.md#([\w-]+)/.exec(r.annotations.runbook)?.[1];
        const ok = anchor ? ops.includes(`<a id="${anchor}"></a>`) : existsSync(join(REPO_ROOT, String(r.annotations.runbook).split('#')[0]));
        expect(ok, `${r.alert}: runbook ${r.annotations.runbook}`).toBe(true);
        for (const m of String(r.expr).match(/\bkb_[a-z0-9_]+/g) ?? []) {
          const base = m.replace(/_(bucket|count|sum)$/, '');
          expect(exported.has(base) || exported.has(m) || scripts.includes(m), `${r.alert}: metric ${m}`).toBe(true);
        }
      }
    expect(n).toBeGreaterThanOrEqual(32);
    for (const a of ['KbCollabReconnectStorm', 'KbImportFailureRateHigh', 'KbOcrSlow', 'KbOcrFailing']) expect(rules.groups.flatMap((g: any) => g.rules.map((r: any) => r.alert))).toContain(a);
  });
});
