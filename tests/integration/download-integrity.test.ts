import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { gzipSync, deflateSync } from 'node:zlib';
import { startServer, setupOrg, type TestServer } from '../support/harness.js';

// Byte-exact downloads (R-BACKUP-008, R-BACKUP-019, E-08): found by the disaster-recovery drill — files whose first bytes look
// like zlib/gzip were served with `Content-Encoding: gzip` but uncompressed bytes, so clients could not read them.

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer();
  org = await setupOrg(ts);
});
afterAll(async () => {
  await ts?.close();
});

describe('attachment downloads are byte-exact (R-BACKUP-008, R-BACKUP-019)', () => {
  it('gzip files, zlib-looking and random binary files download unchanged with and without Accept-Encoding, also by Range (R-BACKUP-008, R-BACKUP-019)', async () => {
    const o = org.owner;
    const page = (await o.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Файлы' })).page;
    const files: Array<[string, Buffer, string]> = [
      ['archive.gz', gzipSync(randomBytes(20_000)), 'application/gzip'],
      ['zlib.bin', deflateSync(randomBytes(20_000)), 'application/octet-stream'],
      ['looks-like-zlib.bin', Buffer.concat([Buffer.from([0x78, 0x9c]), randomBytes(20_000)]), 'application/octet-stream'],
      ['random.bin', randomBytes(20_000), 'application/octet-stream'],
      ['notes.txt', Buffer.from('текст '.repeat(5000)), 'text/plain'],
    ];
    for (const [name, bytes, type] of files) {
      const fd = new FormData();
      fd.append('pageId', page.id);
      fd.append('file', new Blob([bytes], { type }), name);
      const att = (await o.req('POST', '/api/v1/attachments', fd)).attachments[0];
      for (const enc of ['gzip, deflate, br', 'identity']) {
        const r = await o.raw('GET', `/api/v1/attachments/${att.id}/download`, undefined, { 'accept-encoding': enc });
        expect(r.status).toBe(200);
        expect(r.headers.get('content-encoding') ?? 'identity', name).toBe('identity');
        expect(sha(Buffer.from(await r.arrayBuffer())), `${name} (${enc})`).toBe(sha(bytes));
      }
      const part = await o.raw('GET', `/api/v1/attachments/${att.id}/download`, undefined, { range: 'bytes=0-99', 'accept-encoding': 'gzip' });
      expect(part.status).toBe(206);
      expect(Buffer.from(await part.arrayBuffer())).toEqual(bytes.subarray(0, 100));
    }
  });
});
