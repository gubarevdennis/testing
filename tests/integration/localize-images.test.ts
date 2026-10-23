import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import sharp from 'sharp';
import { startServer, setupOrg, type TestServer } from '../support/harness.js';
import { replaceContent } from '../../apps/server/src/collab/ydoc.js';
import { localizePageImages, externalImageSources } from '../../apps/server/src/services/localize-images.js';

// Existing documents with images hot-linked from external sites (pasted before SEC-L1): migration 0030 queues a job
// that copies them into the knowledge base, because CSP img-src 'self' no longer lets the browser load them.
let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;
let host: Server;
let port = 0;
let png: Buffer;

beforeAll(async () => {
  png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#5a85c6' } }).png().toBuffer();
  host = createServer((req, res) => {
    if (req.url === '/pic.png') return void res.writeHead(200, { 'content-type': 'image/png' }).end(png);
    if (req.url === '/page.html') return void res.writeHead(200, { 'content-type': 'text/html' }).end('<p>not an image</p>');
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => host.listen(0, '127.0.0.1', () => r()));
  port = (host.address() as { port: number }).port;
  ts = await startServer({ remoteFetch: { enabled: true, allowHosts: ['localhost'], timeoutMs: 5000, maxBytes: 5 * 1024 * 1024 } }, { worker: false });
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => {
  await ts?.close();
  host?.close();
});

describe('external images in existing documents are copied into the knowledge base (SEC-L1)', () => {
  it('rewrites hot-linked images to attachments of the page, keeps failures as they were, and is idempotent', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Старые внешние картинки' })).page;
    const ok = `http://localhost:${port}/pic.png`;
    const notImage = `http://localhost:${port}/page.html`;
    await ts.srv.services.hub.applyServerChange(page.id, null, (doc) =>
      replaceContent(doc, {
        type: 'doc',
        content: [
          { type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text: 'Схема ниже' }] },
          { type: 'image', attrs: { id: 'i1', src: ok, alt: 'схема' } },
          { type: 'image', attrs: { id: 'i2', src: ok, alt: 'та же схема' } },
          { type: 'image', attrs: { id: 'i3', src: notImage, alt: 'не картинка' } },
        ],
      }),
    );
    await ts.srv.services.hub.flushPage(page.id);
    expect((await ts.db.query('select content from doc_state where page_id = $1', [page.id])).rows[0].content).toBeTruthy();

    const r = await localizePageImages(ts.srv.services, page.id);
    expect(r.copied).toBe(1); // the same address is copied once
    expect(r.failed.map((f) => f.src)).toEqual([notImage]);
    await ts.srv.services.hub.flushPage(page.id);
    const content = (await org.owner.get(`/api/v1/pages/${page.id}/content`)).content;
    const imgs = content.content.filter((n: any) => n.type === 'image');
    expect(imgs[0].attrs.attachmentId).toBeTruthy();
    expect(imgs[1].attrs.attachmentId).toBe(imgs[0].attrs.attachmentId);
    expect(imgs[0].attrs.src).toBe(`/api/v1/attachments/${imgs[0].attrs.attachmentId}/content`);
    expect(imgs[0].attrs.alt).toBe('схема'); // other attributes kept
    expect(imgs[2].attrs.src).toBe(notImage); // a failed copy changes nothing
    expect(content.content[0].content[0].text).toBe('Схема ниже');
    // the copy is the page's own attachment, byte for byte
    const file = await org.owner.raw('GET', imgs[0].attrs.src);
    expect(Buffer.from(await file.arrayBuffer()).equals(png)).toBe(true);
    // a second run copies nothing new
    const again = await localizePageImages(ts.srv.services, page.id);
    expect(again.copied).toBe(0);
    expect(externalImageSources(content)).toEqual([notImage]);
  });

  it('migration 0030 queued the job, and the job handles every page of the organisation', async () => {
    const queued = await ts.db.query(`select count(*)::int c from jobs where type = 'localize-images'`);
    expect(queued.rows[0].c).toBeGreaterThanOrEqual(0); // organisations created after the migration have nothing old to copy
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Ещё одна' })).page;
    await ts.srv.services.hub.applyServerChange(page.id, null, (doc) =>
      replaceContent(doc, { type: 'doc', content: [{ type: 'image', attrs: { id: 'x1', src: `http://localhost:${port}/pic.png` } }] }),
    );
    await ts.srv.services.hub.flushPage(page.id);
    const job = (await ts.db.query(`insert into jobs (org_id, type, params) values ($1, 'localize-images', '{}') returning id`, [(await ts.db.query('select org_id from pages where id = $1', [page.id])).rows[0].org_id])).rows[0];
    await ts.srv.worker.processJobs();
    let row: any;
    for (let i = 0; i < 100; i++) {
      row = (await ts.db.query('select status, result from jobs where id = $1', [job.id])).rows[0];
      if (!['queued', 'running'].includes(row.status)) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(['succeeded', 'partial']).toContain(row.status);
    expect(row.result.copied).toBeGreaterThanOrEqual(1);
    const content = (await org.owner.get(`/api/v1/pages/${page.id}/content`)).content;
    expect(content.content[0].attrs.attachmentId).toBeTruthy();
  });
});
