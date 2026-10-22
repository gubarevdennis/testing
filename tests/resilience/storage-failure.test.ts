import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomBytes, createHash } from 'node:crypto';
import { readdir, rename, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { startServer, setupOrg, type TestServer } from '../support/harness.js';

// Object storage fails while a file is uploaded (directory not writable, disk full, temp area broken):
// the request fails with a clean error, no database row points to a missing object, no temp file is left
// behind, and a retry after the storage recovers succeeds (SC-30, D-03, E-01, AT-60).

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;
let pageId: string;
let root: string;

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

async function counts() {
  return (
    await ts.db.query(`select
      (select count(*)::int from attachments) attachments,
      (select count(*)::int from attachment_versions) versions,
      (select count(*)::int from blobs) blobs,
      (select count(*)::int from audit_events where action in ('attachment.upload', 'attachment.version')) audit,
      (select count(*)::int from outbox) outbox`)
  ).rows[0];
}

async function tmpFiles() {
  try {
    return (await readdir(join(root, 'tmp'))).filter((f) => !f.startsWith('.health-'));
  } catch {
    return [];
  }
}

function upload(buf: Buffer, name: string) {
  const fd = new FormData();
  fd.append('pageId', pageId);
  fd.append('file', new Blob([buf], { type: 'application/octet-stream' }), name);
  return org.owner.raw('POST', '/api/v1/attachments', fd);
}

async function expectCleanFailure(res: Response, before: Awaited<ReturnType<typeof counts>>) {
  expect(res.status).toBeGreaterThanOrEqual(500);
  const body = await res.json();
  expect(body.error.code).toBeTruthy();
  expect(JSON.stringify(body)).not.toContain(root); // no internal paths leaked to the client
  expect(await counts()).toEqual(before); // nothing committed: no orphan rows, no audit entry for a failed upload
  expect(await tmpFiles()).toEqual([]); // temp data cleaned up
}

async function expectStored(res: Response, buf: Buffer) {
  expect(res.status).toBe(200);
  const att = (await res.json()).attachments[0];
  expect(att.sha256).toBe(sha(buf));
  const dl = await org.owner.raw('GET', `/api/v1/attachments/${att.id}/download`);
  expect(dl.status).toBe(200);
  expect(sha(Buffer.from(await dl.arrayBuffer()))).toBe(sha(buf));
  return att;
}

beforeAll(async () => {
  ts = await startServer();
  org = await setupOrg(ts);
  pageId = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Вложения при сбоях' })).page.id;
  root = ts.srv.cfg.storage.root;
});
afterAll(async () => ts?.close());

describe('object storage failure on upload (SC-30, D-03)', () => {
  it('blob area not writable → clean error, no orphan rows; retry after recovery stores the file (D-03, E-01)', async () => {
    const buf = Buffer.concat([Buffer.from('отчёт\n'), randomBytes(200_000)]);
    const before = await counts();
    // The object directory becomes unusable (as with a read-only mount): replace it with a plain file.
    await rename(join(root, 'blobs'), join(root, 'blobs.off'));
    await writeFile(join(root, 'blobs'), 'not a directory');
    try {
      await expectCleanFailure(await upload(buf, 'отчёт.bin'), before);
    } finally {
      await rm(join(root, 'blobs'));
      await rename(join(root, 'blobs.off'), join(root, 'blobs'));
    }
    await expectStored(await upload(buf, 'отчёт.bin'), buf);
    const after = await counts();
    expect(after.attachments).toBe(before.attachments + 1);
    expect(after.blobs).toBe(before.blobs + 1);
  });

  it('disk full while committing the object → clean error, resumable session marked failed; a new upload succeeds (D-03)', async () => {
    const buf = Buffer.concat([Buffer.from('большой файл\n'), randomBytes(300_000)]);
    const before = await counts();
    const spy = vi.spyOn(ts.srv.services.store, 'putFile').mockRejectedValueOnce(Object.assign(new Error(`ENOSPC: no space left on device, write '${root}/blobs/x'`), { code: 'ENOSPC' }));
    try {
      const s = await org.owner.post('/api/v1/uploads', { pageId, filename: 'том.bin', size: buf.length, sha256: sha(buf) });
      const chunk = await fetch(ts.url + `/api/v1/uploads/${s.uploadId}?offset=0`, {
        method: 'PUT',
        headers: { cookie: org.owner.cookieHeader(), 'x-csrf-token': org.owner.csrf!, 'content-type': 'application/octet-stream' },
        body: buf,
      });
      expect(chunk.status).toBe(200);
      const done = await org.owner.raw('POST', `/api/v1/uploads/${s.uploadId}/complete`, {});
      await expectCleanFailure(done, before);
      const session = await org.owner.get(`/api/v1/uploads/${s.uploadId}`);
      expect(session.status).toBe('failed');
    } finally {
      spy.mockRestore();
    }
    await expectStored(await upload(buf, 'том.bin'), buf);
  });

  it('temporary area unusable → readiness reports storage error, upload fails cleanly, both recover (R-OPS-006, D-03)', async () => {
    const buf = randomBytes(50_000);
    const before = await counts();
    await rm(join(root, 'tmp'), { recursive: true, force: true });
    await writeFile(join(root, 'tmp'), 'not a directory');
    try {
      const ready = await fetch(ts.url + '/readyz');
      expect(ready.status).toBe(503);
      expect((await ready.json()).checks.storage).toMatch(/^error/);
      const res = await upload(buf, 'x.bin');
      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(await counts()).toEqual(before);
    } finally {
      await rm(join(root, 'tmp'), { force: true });
      await mkdir(join(root, 'tmp'), { recursive: true });
    }
    expect((await fetch(ts.url + '/readyz')).status).toBe(200);
    await expectStored(await upload(buf, 'x.bin'), buf);
  });
});
