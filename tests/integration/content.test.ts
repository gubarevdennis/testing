import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { startServer, setupOrg, expectStatus, type TestServer, type Api } from '../support/harness.js';
import { openClient, waitFor } from '../support/collab.js';

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer({}, { worker: true });
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => ts?.close());

async function textImage(lines: string[], width = 1100) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${60 + lines.length * 56}"><rect width="100%" height="100%" fill="#fff"/>${lines
    .map((l, i) => `<text x="30" y="${70 + i * 56}" font-family="DejaVu Sans" font-size="36" fill="#111">${l}</text>`)
    .join('')}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function upload(api: Api, pageId: string | null, name: string, data: Buffer, mime = 'application/octet-stream') {
  const fd = new FormData();
  if (pageId) fd.append('pageId', pageId);
  fd.append('file', new Blob([data], { type: mime }), name);
  return api.req('POST', '/api/v1/attachments', fd);
}

describe('attachments', () => {
  it('uploads an image, stores the original byte-exact with checksum, creates previews (A10, R-FILES)', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'С изображением' })).page;
    const img = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#88aadd' } }).jpeg().toBuffer();
    const r = await upload(org.owner, page.id, 'схема.jpg', img, 'image/jpeg');
    const a = r.attachments[0];
    expect(a.mime).toBe('image/jpeg');
    expect(a.width).toBe(3000);
    expect(a.sha256).toBe(createHash('sha256').update(img).digest('hex'));
    const orig = Buffer.from(await (await org.owner.raw('GET', a.contentUrl)).arrayBuffer());
    expect(orig.equals(img)).toBe(true);
    const thumb = await org.owner.raw('GET', a.contentUrl + '?variant=thumb');
    expect(thumb.headers.get('content-type')).toBe('image/webp');
    const tm = await sharp(Buffer.from(await thumb.arrayBuffer())).metadata();
    expect(Math.max(tm.width!, tm.height!)).toBe(512);
    // Range requests (resumable download / video seeking)
    const part = await org.owner.raw('GET', a.downloadUrl, undefined, { range: 'bytes=0-99' });
    expect(part.status).toBe(206);
    expect((await part.arrayBuffer()).byteLength).toBe(100);
    expect(part.headers.get('content-disposition')).toContain("filename*=UTF-8''%D1%81%D1%85%D0%B5%D0%BC%D0%B0.jpg");
  });

  it('rejects executables even with a fake extension and dangerous types (SC-19, SC-33)', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Файлы' })).page;
    await expectStatus(upload(org.owner, page.id, 'setup.exe', Buffer.from('MZ\x90\x00 fake')), 422);
    await expectStatus(upload(org.owner, page.id, 'report.pdf', Buffer.from('MZ\x90\x00 disguised executable')), 422);
    await expectStatus(upload(org.owner, page.id, 'run.sh', Buffer.from('#!/bin/sh\nrm -rf /')), 422);
    const ok = await upload(org.owner, page.id, 'notes.txt', Buffer.from('просто текст'));
    expect(ok.attachments[0].mime).toBe('text/plain');
  });

  it('sanitises SVG and serves user content in a sandbox (SC-12, SC-33)', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'SVG' })).page;
    const evil = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><rect width="10" height="10"/></svg>';
    const r = await upload(org.owner, page.id, 'evil.svg', Buffer.from(evil));
    const res = await org.owner.raw('GET', r.attachments[0].contentUrl);
    const body = await res.text();
    expect(body).not.toContain('script');
    expect(body).not.toContain('onload');
    expect(res.headers.get('content-security-policy')).toContain('sandbox');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('files of a private page are not accessible by direct link; revocation invalidates signed links (E2E-102, A14, V18-A17, V15-A08, ACL-164)', async () => {
    const u = await org.user('Владелец файла');
    const me = await u.get('/api/v1/auth/me');
    const p = (await u.post('/api/v1/pages', { spaceId: me.personalSpaceId, title: 'Личная с файлом' })).page;
    const a = (await upload(u, p.id, 'секрет.txt', Buffer.from('секрет'))).attachments[0];
    const other = await org.user('Чужой');
    await expectStatus(other.get(`/api/v1/attachments/${a.id}`), 404);
    expect((await other.raw('GET', a.downloadUrl)).status).toBe(404);
    expect((await other.raw('GET', a.contentUrl)).status).toBe(404);
    // Share, obtain a signed link, revoke: the link stops working.
    const g = (await u.put('/api/v1/grants', { resourceType: 'page', resourceId: p.id, subjectType: 'user', subjectId: other.id, level: 'view' })).grant;
    const link = await other.post(`/api/v1/attachments/${a.id}/link`);
    expect((await fetch(ts.url + link.url)).status).toBe(200);
    await u.del(`/api/v1/grants/${g.id}`);
    expect((await fetch(ts.url + link.url)).status).toBe(404);
  });

  it('respects download policy: viewers can see the page but cannot download when forbidden (A15, UX21-182)', async () => {
    const sp = (await org.owner.post('/api/v1/spaces', { name: 'Без скачивания', kind: 'project', visibility: 'open', orgLevel: 'view', policy: { allowDownload: false }, confirmWiden: true })).space;
    const p = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Чертежи' })).page;
    const a = (await upload(org.owner, p.id, 'drawing.txt', Buffer.from('data'))).attachments[0];
    const reader = await org.user('Смотрящий');
    await reader.get(`/api/v1/attachments/${a.id}`);
    expect((await reader.raw('GET', a.downloadUrl)).status).toBe(403);
  });

  it('resumable upload with chunk retry and checksum verification (UX23-220, A16)', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Большой файл' })).page;
    const data = Buffer.alloc(1_000_000, 7);
    data.write('kb-resumable', 0);
    const sha = createHash('sha256').update(data).digest('hex');
    const s = await org.owner.post('/api/v1/uploads', { pageId: page.id, filename: 'big.bin', size: data.length, sha256: sha });
    const chunk = 300_000;
    for (let off = 0; off < data.length; off += chunk) {
      const res = await fetch(`${ts.url}/api/v1/uploads/${s.uploadId}?offset=${off}`, { method: 'PUT', headers: { cookie: org.owner.cookieHeader(), 'x-csrf-token': org.owner.csrf!, 'content-type': 'application/octet-stream' }, body: data.subarray(off, off + chunk) });
      expect(res.status).toBe(200);
      if (off === 0) {
        // simulate a retry of the same chunk after a lost response
        const again = await fetch(`${ts.url}/api/v1/uploads/${s.uploadId}?offset=0`, { method: 'PUT', headers: { cookie: org.owner.cookieHeader(), 'x-csrf-token': org.owner.csrf!, 'content-type': 'application/octet-stream' }, body: data.subarray(0, chunk) });
        expect((await again.json()).received).toBe(chunk);
      }
    }
    // Not complete until all bytes arrived: the file is never shown as available early.
    const done = await org.owner.post(`/api/v1/uploads/${s.uploadId}/complete`);
    expect(done.attachment.sha256).toBe(sha);
    const list = await org.owner.get(`/api/v1/pages/${page.id}/attachments`);
    expect(list.attachments.map((x: any) => x.id)).toContain(done.attachment.id);
  });

  it('incomplete upload cannot be completed', async () => {
    const s = await org.owner.post('/api/v1/uploads', { pageId: null, filename: 'x.bin', size: 1000 });
    const e = await expectStatus(org.owner.post(`/api/v1/uploads/${s.uploadId}/complete`), 409);
    expect(e.error.code).toBe('incomplete');
  });

  it('replacing a file creates a new version; old version restorable', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Версии файла' })).page;
    const a = (await upload(org.owner, page.id, 'spec.txt', Buffer.from('v1'))).attachments[0];
    const fd = new FormData();
    fd.append('pageId', page.id);
    fd.append('replaceId', a.id);
    fd.append('file', new Blob([Buffer.from('v2')]), 'spec.txt');
    await org.owner.req('POST', '/api/v1/attachments', fd);
    let meta = (await org.owner.get(`/api/v1/attachments/${a.id}`)).attachment;
    expect(meta.version).toBe(2);
    expect(await (await org.owner.raw('GET', a.downloadUrl)).text()).toBe('v2');
    await org.owner.post(`/api/v1/attachments/${a.id}/versions/1/restore`);
    meta = (await org.owner.get(`/api/v1/attachments/${a.id}`)).attachment;
    expect(meta.version).toBe(3);
    expect(await (await org.owner.raw('GET', a.downloadUrl)).text()).toBe('v1');
  });

  it('large images get a deep-zoom tile pyramid (UX21-181, UX22-186)', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Чертёж' })).page;
    const big = await sharp({ create: { width: 6000, height: 3000, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const a = (await upload(org.owner, page.id, 'plan.png', big)).attachments[0];
    let tiles: any = null;
    for (let i = 0; i < 200 && !tiles; i++) {
      tiles = (await org.owner.get(`/api/v1/attachments/${a.id}`)).attachment.tiles;
      if (!tiles) await new Promise((r) => setTimeout(r, 100));
    }
    expect(tiles).toMatchObject({ width: 6000, height: 3000, tileSize: 512 });
    const t = await org.owner.raw('GET', `/api/v1/attachments/${a.id}/tiles/${tiles.levels}/0_0.png`);
    expect(t.status).toBe(200);
  });
});

describe('OCR (SC-21..24, AT, §8)', () => {
  it('recognises Russian and English text on a screenshot, keeps original, result is searchable with origin marker (R-SEARCH-002, SC-23)', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Скриншот щита' })).page;
    const png = await textImage(['Регламент освещения KNX', 'Артикул ABC-1234', 'Distribution board']);
    const a = (await upload(org.owner, page.id, 'screen.png', png, 'image/png')).attachments[0];
    let ocr: any = null;
    for (let i = 0; i < 600; i++) {
      ocr = (await org.owner.get(`/api/v1/attachments/${a.id}/ocr`)).ocr;
      if (ocr && ['done', 'partial', 'error'].includes(ocr.status)) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(ocr.status).toBe('done');
    expect(ocr.text).toMatch(/Регламент/);
    expect(ocr.text).toMatch(/освещения/);
    expect(ocr.text).toMatch(/ABC-1234/);
    expect(ocr.text).toMatch(/Distribution/);
    expect(ocr.words.length).toBeGreaterThan(5);
    expect(ocr.confidence).toBeGreaterThan(60);
    // The original is intact.
    const orig = Buffer.from(await (await org.owner.raw('GET', a.contentUrl)).arrayBuffer());
    expect(orig.equals(png)).toBe(true);
    // Search finds a word that exists only on the image.
    let found: any = null;
    for (let i = 0; i < 50 && !found?.results?.length; i++) {
      found = await org.owner.get('/api/v1/search?q=' + encodeURIComponent('Distribution'));
      if (!found.results.length) await new Promise((r) => setTimeout(r, 100));
    }
    expect(found.results[0].pageId).toBe(page.id);
    expect(found.results[0].matchedIn).toContain('image');
    // Manual correction is stored separately and indexed.
    await org.owner.patch(`/api/v1/attachments/${a.id}/ocr`, { correctedText: ocr.text + '\nИсправлено вручную' });
    const after = (await org.owner.get(`/api/v1/attachments/${a.id}/ocr`)).ocr;
    expect(after.text).toBe(ocr.text);
    expect(after.correctedText).toContain('Исправлено вручную');
  }, 180_000);
});

describe('search (§9, S01–S03, V16)', () => {
  it('finds by morphology, typo, wrong layout, applies ACL before results and jumps to block (R-SEARCH-004, R-SEARCH-005, R-SEARCH-006, R-SEARCH-011, R-SEARCH-014, E2E-101, ACL-163, V16-S03)', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Инструкция по монтажу светильников' })).page;
    const c = await openClient(ts.url, org.owner, page.id);
    c.insert(0, 0, 'Вводный абзац.');
    c.appendParagraph('Перед монтажом обесточьте линию и проверьте отсутствие напряжения.');
    await c.waitSaved();
    await ts.srv.services.hub.flushPage(page.id);
    const secret = (await org.owner.post('/api/v1/pages', { spaceId: org.personalSpaceId, title: 'Секретные светильники монтаж' })).page;
    void secret;
    const reader = await org.user('Ищущий');
    const until = async (q: string, api: Api = reader) => {
      for (let i = 0; i < 50; i++) {
        const r = await api.get('/api/v1/search?q=' + encodeURIComponent(q));
        if (r.results.length) return r;
        await new Promise((res) => setTimeout(res, 100));
      }
      return api.get('/api/v1/search?q=' + encodeURIComponent(q));
    };
    const morph = await until('светильник монтаж');
    expect(morph.results.map((r: any) => r.pageId)).toContain(page.id);
    expect(morph.results.every((r: any) => r.title !== 'Секретные светильники монтаж')).toBe(true); // S03: no leak
    const body = await until('напряжение');
    expect(body.results[0].pageId).toBe(page.id);
    expect(body.results[0].snippet).toContain('<<');
    const blocks = (await org.owner.get(`/api/v1/pages/${page.id}/content`)).content.content;
    expect(body.results[0].blockId).toBe(blocks[1].attrs.id); // S01: jump to the matching paragraph
    const typo = await until('Инструкцыя');
    expect(typo.results.map((r: any) => r.pageId)).toContain(page.id);
    const layout = await until('bycnherwbz'); // "инструкция" typed in EN layout
    expect(layout.results.map((r: any) => r.pageId)).toContain(page.id);
    const sug = await reader.get('/api/v1/search/suggest?q=' + encodeURIComponent('инстр'));
    expect(sug.suggestions.map((x: any) => x.pageId)).toContain(page.id);
    const ownerSearch = await until('Секретные', org.owner);
    expect(ownerSearch.results.length).toBe(1);
    const readerSecret = await reader.get('/api/v1/search?q=' + encodeURIComponent('Секретные'));
    expect(readerSecret.total).toBe(0);
    c.close();
  });

  it('space scope does not leak neighbouring spaces (S02, V16-S02)', async () => {
    const sp = (await org.owner.post('/api/v1/spaces', { name: 'Отдельное', kind: 'project', visibility: 'private' })).space;
    await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Уникальныйтермин в пространстве' });
    await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Уникальныйтермин в общем' });
    await new Promise((r) => setTimeout(r, 1500));
    const all = await org.owner.get('/api/v1/search?q=' + encodeURIComponent('Уникальныйтермин'));
    expect(all.total).toBe(2);
    const scoped = await org.owner.get(`/api/v1/search?spaceId=${sp.id}&q=` + encodeURIComponent('Уникальныйтермин'));
    expect(scoped.total).toBe(1);
  });
});

describe('comments and mentions', () => {
  it('threads, replies, resolve/reopen, mention notifications only for those with access (R-COMMENTS-001)', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.personalSpaceId, title: 'Обсуждаемая' })).page;
    const colleague = await org.user('Коллега-комментатор');
    const outsider = await org.user('Посторонний-упомянутый');
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'user', subjectId: colleague.id, level: 'comment' });
    const t = await org.owner.post(`/api/v1/pages/${page.id}/comments`, { text: 'Проверьте раздел', quote: 'раздел', blockId: 'b1', mentions: [colleague.id, outsider.id] });
    const cn = await colleague.get('/api/v1/notifications');
    expect(cn.notifications.some((n: any) => n.type === 'mention')).toBe(true);
    const on = await outsider.get('/api/v1/notifications');
    expect(on.notifications.length).toBe(0);
    await colleague.post(`/api/v1/pages/${page.id}/comments`, { threadId: t.comment.threadId, text: 'Готово' });
    await colleague.post(`/api/v1/comments/threads/${t.comment.threadId}/resolve`);
    let th = (await org.owner.get(`/api/v1/pages/${page.id}/comments`)).threads[0];
    expect(th.comments.length).toBe(2);
    expect(th.resolvedAt).toBeTruthy();
    await org.owner.post(`/api/v1/comments/threads/${t.comment.threadId}/reopen`);
    th = (await org.owner.get(`/api/v1/pages/${page.id}/comments`)).threads[0];
    expect(th.resolvedAt).toBeNull();
    // viewer cannot comment
    const viewer = await org.user('Только просмотр');
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'user', subjectId: viewer.id, level: 'view' });
    await expectStatus(viewer.post(`/api/v1/pages/${page.id}/comments`, { text: 'нельзя' }), 403);
  });
});

describe('publishing workflow (§11, S05, ROUTE Автор)', () => {
  it('readers see the published revision while the draft evolves; approval required when configured (V16-S05, R-PUBLISH-006, R-PUBLISH-007)', async () => {
    const sp = (await org.owner.post('/api/v1/spaces', { name: 'Регламенты (публикация)', kind: 'org', visibility: 'open', orgLevel: 'view', policy: { publishingMode: 'publish', requireApproval: true } })).space;
    const author = await org.user('Автор регламента');
    await org.owner.put('/api/v1/grants', { resourceType: 'space', resourceId: sp.id, subjectType: 'user', subjectId: author.id, level: 'edit', canPublish: false });
    const page = (await author.post('/api/v1/pages', { spaceId: sp.id, title: 'Регламент пожарной безопасности' })).page;
    const c = await openClient(ts.url, author, page.id);
    c.insert(0, 0, 'Редакция 1');
    await c.waitSaved();
    const reader = await org.user('Читатель регламентов');
    let rc = await reader.get(`/api/v1/pages/${page.id}/content`);
    expect(rc).toMatchObject({ mode: 'published', published: false });
    await expectStatus(author.post(`/api/v1/pages/${page.id}/publish`), 403);
    const ap = await author.post(`/api/v1/pages/${page.id}/submit-review`, { message: 'Прошу согласовать' });
    expect((await org.owner.get('/api/v1/notifications')).notifications.some((n: any) => n.type === 'review_requested')).toBe(true);
    await org.owner.post(`/api/v1/pages/${page.id}/approvals/${ap.approval.id}/decide`, { decision: 'approve' });
    rc = await reader.get(`/api/v1/pages/${page.id}/content`);
    expect(rc.published).toBe(true);
    expect(rc.content.content[0].content[0].text).toBe('Редакция 1');
    // The author keeps editing: readers still see the published edition (S05).
    c.deleteText(0, 0, 10);
    c.insert(0, 0, 'Редакция 2 (черновик)');
    await c.waitSaved();
    rc = await reader.get(`/api/v1/pages/${page.id}/content`);
    expect(rc.content.content[0].content[0].text).toBe('Редакция 1');
    // Readers cannot open the live channel of a publish-mode space.
    const rcli = await openClient(ts.url, reader, page.id);
    await waitFor(() => rcli.provider.status === 'error');
    rcli.close();
    c.close();
  });
});
