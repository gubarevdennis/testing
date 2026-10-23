import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, setupOrg, ApiError, type TestServer, type Api } from '../support/harness.js';
import { openClient, waitFor } from '../support/collab.js';
import { checkConsistency } from '../../apps/server/src/services/consistency.js';

/**
 * Server-side coordination on top of the CRDT (R-COLLAB-031, R-COLLAB-024): operations that a text merge cannot
 * decide — collection columns and cells, page moves and deletion, attachment versions, access changes — are
 * serialised by the server in transactions with predictable outcomes. Every request is fired concurrently.
 */
let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer();
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => ts?.close());

const settle = async <T>(ps: Array<Promise<T>>) => (await Promise.allSettled(ps)).map((r) => (r.status === 'fulfilled' ? { ok: true as const, value: r.value } : { ok: false as const, status: (r.reason as ApiError).status, code: (r.reason as ApiError).body?.error?.code }));

async function upload(api: Api, pageId: string, name: string, data: string, replaceId?: string) {
  const fd = new FormData();
  fd.append('pageId', pageId);
  if (replaceId) fd.append('replaceId', replaceId);
  fd.append('file', new Blob([Buffer.from(data)], { type: 'text/plain' }), name);
  return (await api.req('POST', '/api/v1/attachments', fd)).attachments[0];
}

describe('transactional coordination over the CRDT (R-COLLAB-031, R-COLLAB-024)', () => {
  it('collection columns: two concurrent schema changes → exactly one wins, the other gets version_conflict; a cell write to a column deleted meanwhile is refused, never silently stored', async () => {
    const created = await org.owner.post('/api/v1/collections', { spaceId: org.generalSpaceId, name: 'Договоры', schema: [{ id: 'sum', name: 'Сумма', type: 'number' }, { id: 'note', name: 'Примечание', type: 'text' }] });
    const col = created.collection;
    const bob = await org.user('Борис Колонки', { pageGrants: [{ pageId: created.pageId, level: 'edit' }] });
    const row = (await org.owner.post(`/api/v1/collections/${col.id}/rows`, { title: 'Договор 1', values: { sum: 10, note: 'а' } })).row;
    const v = (await org.owner.get(`/api/v1/collections/${col.id}`)).collection.version;
    const res = await settle([
      org.owner.patch(`/api/v1/collections/${col.id}`, { schema: [{ id: 'sum', name: 'Сумма, ₽', type: 'number' }, { id: 'note', name: 'Примечание', type: 'text' }], expectedVersion: v }),
      bob.patch(`/api/v1/collections/${col.id}`, { schema: [{ id: 'sum', name: 'Сумма', type: 'number' }], expectedVersion: v }),
    ]);
    expect(res.filter((r) => r.ok)).toHaveLength(1);
    expect(res.find((r) => !r.ok)).toMatchObject({ status: 409, code: 'version_conflict' });

    // Column removal vs a cell edit of that column: the cell write after the removal is refused with a reason.
    const v2 = (await org.owner.get(`/api/v1/collections/${col.id}`)).collection.version;
    await org.owner.patch(`/api/v1/collections/${col.id}`, { schema: [{ id: 'sum', name: 'Сумма', type: 'number' }], expectedVersion: v2 });
    const cell = await settle([bob.patch(`/api/v1/collections/${col.id}/rows/${row.id}`, { values: { note: 'б' } })]);
    expect(cell[0]).toMatchObject({ ok: false, status: 400 });
    // the removed column's data is kept (restorable), the refused write did not change it
    expect((await ts.db.query('select properties from pages where id = $1', [row.id])).rows[0].properties.note).toBe('а');

    // Two people edit the same cell with the value they saw: the second gets cell_conflict with the current value.
    const both = await settle([
      org.owner.patch(`/api/v1/collections/${col.id}/rows/${row.id}`, { values: { sum: 20 }, expected: { sum: 10 } }),
      bob.patch(`/api/v1/collections/${col.id}/rows/${row.id}`, { values: { sum: 30 }, expected: { sum: 10 } }),
    ]);
    expect(both.filter((r) => r.ok)).toHaveLength(1);
    expect(both.find((r) => !r.ok)).toMatchObject({ status: 409, code: 'cell_conflict' });
  });

  it('page structure: concurrent moves never create a cycle; delete vs move and delete vs edit have one predictable outcome', async () => {
    const mk = async (title: string, parentId?: string) => (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title, parentId })).page.id as string;
    const a = await mk('A');
    const b = await mk('B');
    // A under B and B under A at the same time: one succeeds, the other is refused — never a cycle.
    const moves = await settle([org.owner.post(`/api/v1/pages/${a}/move`, { targetParentId: b }), org.owner.post(`/api/v1/pages/${b}/move`, { targetParentId: a })]);
    expect(moves.filter((r) => r.ok)).toHaveLength(1);
    expect(moves.find((r) => !r.ok)!.status).toBeGreaterThanOrEqual(400);

    // Deleting a parent while a child is created under it: either the child is created first (and trashed with
    // the parent) or creation is refused — no orphan.
    const parent = await mk('Родитель');
    const [del, child] = await settle([org.owner.del(`/api/v1/pages/${parent}`), org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, parentId: parent, title: 'Ребёнок' })]);
    expect(del.ok).toBe(true);
    if (child.ok) expect((await ts.db.query('select deleted_at from pages where id = $1', [(child.value as any).page.id])).rows[0].deleted_at).not.toBeNull();
    else expect(child.status).toBe(404);

    // Editing a page that is being deleted: the edit is refused with "deleted", kept on the device.
    const doomed = await mk('Удаляемая при правке');
    const c = await openClient(ts.url, org.owner, doomed);
    c.provider.disconnect();
    c.insert(0, 0, 'правка');
    await org.owner.del(`/api/v1/pages/${doomed}`);
    c.provider.reconnectNow();
    await waitFor(() => c.fatal.length > 0, 10_000, 'refused');
    expect(c.fatal[0]).toMatch(/deleted|not_found/);
    expect(c.provider.unsyncedUpdates().length).toBeGreaterThan(0);
    c.close();

    const report = await checkConsistency(ts.db);
    expect(report.ok).toBe(true);
  });

  it('attachment: two concurrent new versions of the same file are both kept, numbered in commit order; the current one is the last committed', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Общий файл' })).page;
    const bob = await org.user('Борис Файлы', { pageGrants: [{ pageId: page.id, level: 'edit' }] });
    const a = await upload(org.owner, page.id, 'план.txt', 'версия 1');
    const res = await settle([upload(org.owner, page.id, 'план.txt', 'правка Анны', a.id), upload(bob, page.id, 'план.txt', 'правка Бориса', a.id)]);
    expect(res.every((r) => r.ok)).toBe(true);
    const meta = (await org.owner.get(`/api/v1/attachments/${a.id}`)).attachment;
    expect(meta.version).toBe(3);
    expect(meta.versions.map((v: any) => v.version)).toEqual([3, 2, 1]);
    const texts = await Promise.all([1, 2, 3].map(async (n) => (await org.owner.raw('GET', `/api/v1/attachments/${a.id}/download?v=${n}`)).text()));
    expect(texts[0]).toBe('версия 1');
    expect(new Set(texts.slice(1))).toEqual(new Set(['правка Анны', 'правка Бориса']));
    expect(await (await org.owner.raw('GET', `/api/v1/attachments/${a.id}/download`)).text()).toBe(texts[2]);
    // A reader cannot add a version; an access change during the upload is respected.
    const reader = await org.user('Читатель Файла', { pageGrants: [{ pageId: page.id, level: 'view' }] });
    await expect(upload(reader, page.id, 'план.txt', 'чужая', a.id)).rejects.toMatchObject({ status: 403 });
  });

  it('access change during a session: a revoked editor is switched to read-only at once and its later operations are refused', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.personalSpaceId, title: 'Права в сессии' })).page;
    const eve = await org.user('Ева Редактор', { pageGrants: [{ pageId: page.id, level: 'edit' }] });
    const c = await openClient(ts.url, eve, page.id);
    expect(c.provider.canEdit).toBe(true);
    const g = (await ts.db.query(`select id from grants where resource_id = $1 and subject_id = $2 and revoked_at is null`, [page.id, eve.user.id])).rows[0];
    await org.owner.del(`/api/v1/grants/${g.id}`);
    await waitFor(() => !c.provider.canEdit || c.fatal.length > 0, 10_000, 'edit revoked');
    c.insert(0, 0, 'после отзыва');
    c.provider.flush();
    await new Promise((r) => setTimeout(r, 300));
    expect(JSON.stringify((await org.owner.get(`/api/v1/pages/${page.id}/content`)).content)).not.toContain('после отзыва');
    c.close();
  });
});
