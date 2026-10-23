import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, setupOrg, expectStatus, type TestServer, type Api } from '../support/harness.js';

/**
 * Copying an attachment to another page (pasted / moved images and files, R-CLIPBOARD-018/024, R-EDITOR-076, D-32):
 * the copy belongs to the target page and follows its rights; taking a file elsewhere needs the download right on the
 * source and the edit right on the target.
 */
let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP8z4AATAxkCAEAJ9cBD8JfOs4AAAAASUVORK5CYII=', 'base64');

beforeAll(async () => {
  ts = await startServer();
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => ts?.close());

async function upload(api: Api, pageId: string, name: string, data: Buffer, mime: string) {
  const fd = new FormData();
  fd.append('pageId', pageId);
  fd.append('file', new Blob([data], { type: mime }), name);
  return (await api.req('POST', '/api/v1/attachments', fd)).attachments[0];
}
const page = async (title: string) => (await org.owner.post('/api/v1/pages', { spaceId: org.personalSpaceId, parentId: null, title, requestId: crypto.randomUUID() })).page;
const grant = (pageId: string, userId: string, level: string, canDownload?: boolean) =>
  org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: pageId, subjectType: 'user', subjectId: userId, level, ...(canDownload === undefined ? {} : { canDownload }) });

describe('POST /api/v1/attachments/:id/copy', () => {
  it('copies to the target page: new attachment of that page, same bytes; same page → no copy', async () => {
    const a = await page('Источник');
    const b = await page('Цель');
    const att = await upload(org.owner, a.id, 'схема.png', PNG, 'image/png');
    const r = await org.owner.post(`/api/v1/attachments/${att.id}/copy`, { pageId: b.id });
    expect(r.copied).toBe(true);
    expect(r.attachment).toMatchObject({ pageId: b.id, sha256: att.sha256, filename: 'схема.png', mime: 'image/png' });
    expect(r.attachment.id).not.toBe(att.id);
    const same = await org.owner.post(`/api/v1/attachments/${att.id}/copy`, { pageId: a.id });
    expect(same).toMatchObject({ copied: false, attachment: { id: att.id } });
    // readers of the target page see the copy, not the source
    const reader = await org.user('Читатель цели');
    await grant(b.id, reader.id, 'view');
    const got = await reader.get(`/api/v1/attachments/${r.attachment.id}`);
    expect(got.attachment.pageId).toBe(b.id);
    await expectStatus(reader.get(`/api/v1/attachments/${att.id}`), 404);
  });

  it('needs the download right on the source and the edit right on the target', async () => {
    const a = await page('Секретный источник');
    const b = await page('Открытая цель');
    const att = await upload(org.owner, a.id, 'план.png', PNG, 'image/png');
    const viewer = await org.user('Без скачивания');
    await grant(a.id, viewer.id, 'view', false);
    await grant(b.id, viewer.id, 'edit');
    await expectStatus(viewer.post(`/api/v1/attachments/${att.id}/copy`, { pageId: b.id }), 403);
    const editorOnSource = await org.user('Только чтение цели');
    await grant(a.id, editorOnSource.id, 'edit');
    await grant(b.id, editorOnSource.id, 'view');
    await expectStatus(editorOnSource.post(`/api/v1/attachments/${att.id}/copy`, { pageId: b.id }), 403);
    const stranger = await org.user('Посторонний');
    await grant(b.id, stranger.id, 'edit');
    await expectStatus(stranger.post(`/api/v1/attachments/${att.id}/copy`, { pageId: b.id }), 404);
    // nothing was created on the target by the refused attempts
    const list = await org.owner.get(`/api/v1/pages/${b.id}/attachments`);
    expect(list.attachments ?? []).toHaveLength(0);
  });
});
