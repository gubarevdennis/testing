import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as Y from 'yjs';
import { createHash } from 'node:crypto';
import { writeFile, rm } from 'node:fs/promises';
import { startServer, setupOrg, expectStatus, type TestServer } from '../support/harness.js';
import { openClient, waitFor } from '../support/collab.js';
import { verifyBlobs } from '../../apps/server/src/services/integrity.js';

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer();
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => ts?.close());

async function newPage(title: string) {
  return (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title })).page.id as string;
}

async function putChunk(uploadId: string, offset: number, data: Buffer) {
  const res = await fetch(`${ts.url}/api/v1/uploads/${uploadId}?offset=${offset}`, {
    method: 'PUT',
    headers: { cookie: org.owner.cookieHeader(), 'x-csrf-token': org.owner.csrf!, 'content-type': 'application/octet-stream' },
    body: data,
  });
  expect(res.status).toBe(200);
}

async function uploadSmall(pageId: string, name: string, data: Buffer) {
  const fd = new FormData();
  fd.append('pageId', pageId);
  fd.append('file', new Blob([data]), name);
  return (await org.owner.req('POST', '/api/v1/attachments', fd)).attachments[0];
}

describe('upload checksum computed by the client (R-FILES-004, R-FILES-011)', () => {
  it('R-FILES-011: a streamed upload is completed only when the client checksum matches the received bytes', async () => {
    const pageId = await newPage('Контрольная сумма');
    const data = Buffer.alloc(600_000, 3);
    data.write('kb-checksum', 10);
    const sha = createHash('sha256').update(data).digest('hex');

    // Wrong checksum (bytes changed in transit): the file never becomes available.
    const bad = await org.owner.post('/api/v1/uploads', { pageId, filename: 'bad.bin', size: data.length });
    await putChunk(bad.uploadId, 0, data);
    const e = await expectStatus(org.owner.post(`/api/v1/uploads/${bad.uploadId}/complete`, { sha256: createHash('sha256').update('другое').digest('hex') }), 422);
    expect(e.error.code).toBe('checksum_mismatch');
    const listed = await org.owner.get(`/api/v1/pages/${pageId}/attachments`);
    expect(listed.attachments).toHaveLength(0);

    // Correct checksum sent at completion (computed while streaming, not known at start).
    const good = await org.owner.post('/api/v1/uploads', { pageId, filename: 'good.bin', size: data.length });
    await putChunk(good.uploadId, 0, data.subarray(0, 300_000));
    await putChunk(good.uploadId, 300_000, data.subarray(300_000));
    const done = await org.owner.post(`/api/v1/uploads/${good.uploadId}/complete`, { sha256: sha });
    expect(done.attachment.sha256).toBe(sha);
  });

  it('R-FILES-004: a checksum different from the one declared at start is refused', async () => {
    const data = Buffer.from('объявленная сумма');
    const sha = createHash('sha256').update(data).digest('hex');
    const s = await org.owner.post('/api/v1/uploads', { pageId: null, filename: 'x.txt', size: data.length, sha256: sha });
    await putChunk(s.uploadId, 0, data);
    await expectStatus(org.owner.post(`/api/v1/uploads/${s.uploadId}/complete`, { sha256: 'a'.repeat(64) }), 400);
    expect((await org.owner.post(`/api/v1/uploads/${s.uploadId}/complete`, { sha256: sha })).attachment.sha256).toBe(sha);
  });
});

describe('periodic integrity verification of stored files (R-FILES-007)', () => {
  it('R-FILES-007: a corrupted or missing stored file is detected, audited and shown to administrators', async () => {
    const pageId = await newPage('Целостность');
    const a1 = await uploadSmall(pageId, 'целый.txt', Buffer.from('исходные данные 1'));
    const a2 = await uploadSmall(pageId, 'испорченный.txt', Buffer.from('исходные данные 2'));
    const a3 = await uploadSmall(pageId, 'пропавший.txt', Buffer.from('исходные данные 3'));
    const store = ts.srv.services.store as any;
    const key = async (sha: string) => (await ts.db.query('select storage_key from blobs where sha256 = $1', [sha])).rows[0].storage_key as string;
    await writeFile(store.path(await key(a2.sha256)), 'подменённое содержимое');
    await rm(store.path(await key(a3.sha256)));

    const r = await verifyBlobs(ts.db, ts.srv.services.store, { limit: 10_000, minAgeHours: 0 });
    expect(r.checked).toBeGreaterThanOrEqual(3);
    const failed = new Map(r.failed.map((f) => [f.sha256, f.status]));
    expect(failed.get(a1.sha256)).toBeUndefined();
    expect(failed.get(a2.sha256)).toBe('corrupt');
    expect(failed.get(a3.sha256)).toBe('missing');
    const rows = (await ts.db.query('select sha256, verify_status from blobs where sha256 = any($1)', [[a1.sha256, a2.sha256, a3.sha256]])).rows;
    expect(Object.fromEntries(rows.map((x) => [x.sha256, x.verify_status]))).toEqual({ [a1.sha256]: 'ok', [a2.sha256]: 'corrupt', [a3.sha256]: 'missing' });

    const audits = (await ts.db.query(`select details from audit_events where action = 'blob.integrity_failed'`)).rows.map((x) => x.details.sha256);
    expect(audits).toEqual(expect.arrayContaining([a2.sha256, a3.sha256]));
    // A repeated run does not duplicate the audit record for an unchanged state.
    await verifyBlobs(ts.db, ts.srv.services.store, { limit: 10_000, minAgeHours: 0 });
    expect((await ts.db.query(`select count(*)::int c from audit_events where action = 'blob.integrity_failed'`)).rows[0].c).toBe(audits.length);

    const health = await org.owner.get('/api/v1/admin/health');
    expect(health.integrity.problems).toBe(2);
    expect(health.warnings.join(' ')).toMatch(/целостности: 2/);
  });
});

describe('server-side document validation (R-EDITOR-043)', () => {
  it('R-EDITOR-043: an update with a script-capable link (javascript:) is rejected and the document stays clean', async () => {
    const pageId = await newPage('Опасные ссылки');
    const c = await openClient(ts.url, org.owner, pageId);
    c.insert(0, 0, 'безопасно');
    await c.waitSaved();
    const p = new Y.XmlElement('paragraph');
    const t = new Y.XmlText();
    t.insert(0, 'ссылка', { link: { href: 'javascript:alert(1)', target: null, rel: null, class: null } });
    p.insert(0, [t]);
    c.doc.getXmlFragment('default').push([p]);
    c.provider.flush();
    await waitFor(() => c.fatal.includes('invalid_update'), 5000, 'nack');
    const content = await org.owner.get(`/api/v1/pages/${pageId}/content`);
    expect(JSON.stringify(content.content)).not.toContain('javascript:');
    c.close();
  });
});
