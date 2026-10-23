import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, setupOrg, expectStatus, type TestServer } from '../support/harness.js';
import { openClient } from '../support/collab.js';
import { verifyAuditChain } from '../../apps/server/src/services/audit.js';

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer({}, { worker: true });
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => ts?.close());

const blocksText = (doc: any) => (doc.content ?? []).map((b: any) => (b.content ?? []).map((t: any) => t.text ?? '').join(''));
async function content(pageId: string) {
  return (await org.owner.get(`/api/v1/pages/${pageId}/content`)).content;
}
async function revisions(pageId: string) {
  return (await org.owner.get(`/api/v1/pages/${pageId}/revisions?limit=200`)).revisions as any[];
}
async function auditRows() {
  return (await ts.db.query('select id, action, details, hash from audit_events order by id')).rows;
}

/** A page with two paragraphs typed through the real collaboration channel, plus properties. */
async function pageWithText(title: string, paras: string[]) {
  const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title })).page;
  const c = await openClient(ts.url, org.owner, page.id);
  c.insert(0, 0, paras[0]);
  for (const p of paras.slice(1)) c.appendParagraph(p);
  await c.waitSaved();
  return { page, c };
}

describe('version comparison and restore (R-HISTORY-013, V16-S11, QA26-15, R-HISTORY-002)', () => {
  it('compares text AND properties of two versions; restore with a precise preview creates new versions and keeps later ones and the audit', async () => {
    const { page, c } = await pageWithText('Регламент отпусков', ['Отпуск 28 дней', 'Заявление за две недели']);
    await org.owner.patch(`/api/v1/pages/${page.id}`, { icon: '📄', tags: ['кадры', 'отпуск'], properties: { Отдел: 'HR', Срок: '2026' } });
    const v1 = (await org.owner.post(`/api/v1/pages/${page.id}/revisions`, { label: 'Утверждённая' })).revision;

    // Later edits: text, icon, tags, a custom property and the owner.
    c.deleteText(0, 7, 2);
    c.insert(0, 7, '31');
    c.appendParagraph('Новый пункт о переносе');
    await c.waitSaved();
    const deputy = await org.user('Пётр Заместитель');
    await org.owner.patch(`/api/v1/pages/${page.id}`, { icon: '🏖️', tags: ['кадры', 'льготы'], properties: { Отдел: 'Персонал', Срок: null } });
    await ts.db.query('update pages set owner_id = $2 where id = $1', [page.id, deputy.user.id]);
    const v2 = (await org.owner.post(`/api/v1/pages/${page.id}/revisions`, { label: 'После правок' })).revision;

    // Compare v1 with v2: word-level text diff + property diff with readable owner names.
    const d = await org.owner.get(`/api/v1/pages/${page.id}/revisions/${v1.id}/diff?against=${v2.id}`);
    expect(d.propsTracked).toBe(true);
    const changed = d.blocks.find((b: any) => b.status === 'changed');
    expect(changed.parts.some((p: any) => p.removed && p.value.includes('28'))).toBe(true);
    expect(changed.parts.some((p: any) => p.added && p.value.includes('31'))).toBe(true);
    expect(d.blocks.some((b: any) => b.status === 'added' && b.after === 'Новый пункт о переносе')).toBe(true);
    const byField = Object.fromEntries(d.props.map((p: any) => [p.field, p]));
    expect(byField.icon).toMatchObject({ before: '📄', after: '🏖️' });
    expect(byField.tags.items).toEqual(expect.arrayContaining([{ key: 'льготы', before: null, after: 'льготы', status: 'added' }, { key: 'отпуск', before: 'отпуск', after: null, status: 'removed' }]));
    expect(byField.properties.items).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'Отдел', before: 'HR', after: 'Персонал', status: 'changed' }), expect.objectContaining({ key: 'Срок', status: 'removed' })]));
    expect(byField.ownerId).toMatchObject({ beforeLabel: 'Анна Владелец', afterLabel: 'Пётр Заместитель' });
    // ...and against the current state (the same properties, nothing else changed meanwhile).
    const dc = await org.owner.get(`/api/v1/pages/${page.id}/revisions/${v1.id}/diff?against=current`);
    expect(dc.props.map((p: any) => p.field).sort()).toEqual(['icon', 'ownerId', 'properties', 'tags']);

    // Preview: exact consequences, nothing changes.
    const auditBefore = await auditRows();
    const revsBefore = await revisions(page.id);
    const pv = (await org.owner.post(`/api/v1/pages/${page.id}/revisions/${v1.id}/restore`, { restoreProps: true, dryRun: true })).preview;
    expect(pv.content).toMatchObject({ removed: 1, changed: 1 });
    expect(pv.changedBlocks.some((b: any) => b.status === 'removed' && b.before === 'Новый пункт о переносе')).toBe(true);
    expect(pv.props.map((p: any) => p.field).sort()).toEqual(['icon', 'ownerId', 'properties', 'tags']);
    expect(pv.laterRevisions).toBeGreaterThanOrEqual(1);
    expect(pv.newRevisionNumber).toBe(pv.preRestoreNumber + 1);
    expect(pv.editors).toEqual([]); // only the owner's own client is connected
    expect(pv.aclUnchanged).toBe(true);
    expect((await revisions(page.id)).length).toBe(revsBefore.length);
    expect((await org.owner.get(`/api/v1/pages/${page.id}`)).page.icon).toBe('🏖️');
    // (edit journal entries of the earlier typing may land asynchronously; nothing restore-related is written)
    expect((await auditRows()).slice(auditBefore.length).filter((a) => !['page.edit', 'page.view'].includes(a.action))).toEqual([]);
    // Without restoreProps the property differences are listed as "not restored".
    const pv2 = (await org.owner.post(`/api/v1/pages/${page.id}/revisions/${v1.id}/restore`, { dryRun: true })).preview;
    expect(pv2.props).toEqual([]);
    expect(pv2.propsNotRestored.length).toBe(4);

    // Restore: pre-restore + restore versions; v2 and everything after v1 stay as they were.
    const v2Content = (await org.owner.get(`/api/v1/pages/${page.id}/revisions/${v2.id}`)).revision.content;
    const r = await org.owner.post(`/api/v1/pages/${page.id}/revisions/${v1.id}/restore`, { restoreProps: true });
    expect(r.preRestore.number).toBe(pv.preRestoreNumber);
    expect(r.revision.number).toBe(pv.newRevisionNumber);
    expect(r.restoredProps.sort()).toEqual(['icon', 'ownerId', 'properties', 'tags']);
    await c.waitFor(() => c.text() === 'Отпуск 28 дней\nЗаявление за две недели');
    expect(blocksText(await content(page.id))).toEqual(['Отпуск 28 дней', 'Заявление за две недели']);
    const p = (await org.owner.get(`/api/v1/pages/${page.id}`)).page;
    expect(p).toMatchObject({ icon: '📄', tags: ['кадры', 'отпуск'], properties: { Отдел: 'HR', Срок: '2026' }, owner: { name: 'Анна Владелец' } });
    const after = await revisions(page.id);
    expect(after.length).toBe(revsBefore.length + 2);
    for (const old of revsBefore) expect(after.find((x) => x.id === old.id)).toMatchObject({ number: old.number, kind: old.kind });
    expect((await org.owner.get(`/api/v1/pages/${page.id}/revisions/${v2.id}`)).revision.content).toEqual(v2Content);
    expect(after.find((x) => x.number === r.revision.number)).toMatchObject({ kind: 'restore', restored_from: v1.id });
    // The pre-restore version holds exactly what was there before: the restore itself can be undone.
    const undo = await org.owner.get(`/api/v1/pages/${page.id}/revisions/${r.preRestore.id}/diff?against=${v2.id}`);
    expect(undo.stats).toEqual({ added: 0, removed: 0, changed: 0 });
    expect(undo.props).toEqual([]);

    // Audit: only appended, existing rows untouched, hash chain intact.
    const auditAfter = await auditRows();
    expect(auditAfter.slice(0, auditBefore.length)).toEqual(auditBefore);
    expect(auditAfter.slice(auditBefore.length).map((a) => a.action)).toContain('page.revision_restore');
    expect((await verifyAuditChain(ts.db)).ok).toBe(true);
    c.close();
  });

  it('restores one block as a new version (preview first), keeping concurrent edits of other blocks and later versions', async () => {
    const { page, c } = await pageWithText('Инструкция', ['Шаг один', 'Шаг два', 'Шаг три']);
    const v1 = (await org.owner.post(`/api/v1/pages/${page.id}/revisions`, { label: 'Исходная' })).revision;
    const blockIds = (await content(page.id)).content.map((b: any) => b.attrs.id);
    c.deleteText(1, 0, 8);
    c.insert(1, 0, 'Шаг два — испорчен');
    c.removeBlock(2);
    await c.waitSaved();
    const v2 = (await org.owner.post(`/api/v1/pages/${page.id}/revisions`, { label: 'Испорченная' })).revision;

    // A second editor is connected and keeps typing in another block while the restore happens.
    const editor = await org.user('Соавтор Инструкции', { pageGrants: [{ pageId: page.id, level: 'edit' }] });
    const c2 = await openClient(ts.url, editor, page.id);
    const pv = (await org.owner.post(`/api/v1/pages/${page.id}/revisions/${v1.id}/restore-block`, { blockId: blockIds[1], dryRun: true })).preview;
    expect(pv).toMatchObject({ mode: 'replace', current: 'Шаг два — испорчен', restored: 'Шаг два', revisionNumber: v1.number, editors: ['Соавтор Инструкции'] });
    expect(pv.parts.some((x: any) => x.removed)).toBe(true);
    const pvDeleted = (await org.owner.post(`/api/v1/pages/${page.id}/revisions/${v1.id}/restore-block`, { blockId: blockIds[2], dryRun: true })).preview;
    expect(pvDeleted).toMatchObject({ mode: 'insert', current: null, restored: 'Шаг три' });
    const countBefore = (await revisions(page.id)).length;

    c2.insert(0, 0, 'Важно: ');
    const rb = await org.owner.post(`/api/v1/pages/${page.id}/revisions/${v1.id}/restore-block`, { blockId: blockIds[1] });
    await c2.waitSaved();
    const rb2 = await org.owner.post(`/api/v1/pages/${page.id}/revisions/${v1.id}/restore-block`, { blockId: blockIds[2] });
    expect(rb).toMatchObject({ ok: true, mode: 'replaced' });
    expect(rb2).toMatchObject({ ok: true, mode: 'inserted' });
    expect(rb.revision.number).toBe(rb.preRestore.number + 1);
    expect(blocksText(await content(page.id))).toEqual(['Важно: Шаг один', 'Шаг два', 'Шаг три']);
    await c2.waitFor(() => c2.text() === 'Важно: Шаг один\nШаг два\nШаг три');
    const revs = await revisions(page.id);
    expect(revs.length).toBe(countBefore + 4);
    expect(revs.find((x) => x.id === v2.id)).toBeTruthy();
    expect(revs.filter((x) => x.kind === 'restore').map((x) => x.label)).toContain(`Восстановлен блок из версии ${v1.number}`);
    const ev = (await org.owner.get(`/api/v1/pages/${page.id}/events?limit=20`)).events.find((e: any) => e.type === 'restored-block');
    expect(ev.data).toMatchObject({ mode: 'inserted', revisionNumber: v1.number, newRevision: rb2.revision.number });

    // A reader cannot restore; an outsider does not even learn the page exists.
    const reader = await org.user('Читатель Инструкции', { pageGrants: [{ pageId: page.id, level: 'view' }] });
    await expectStatus(reader.post(`/api/v1/pages/${page.id}/revisions/${v1.id}/restore-block`, { blockId: blockIds[1] }), 403);
    await expectStatus(reader.post(`/api/v1/pages/${page.id}/revisions/${v1.id}/restore`, { dryRun: true }), 403);
    c.close();
    c2.close();
  });

  it('QA26-15: after deletion the history stays readable and restore says why it waits; after archive and restore from trash it works; retention keeps restore points', async () => {
    const { page, c } = await pageWithText('Удаляемый документ', ['Первая редакция']);
    c.close();
    const v1 = (await org.owner.post(`/api/v1/pages/${page.id}/revisions`, { label: 'Первая' })).revision;
    const c2 = await openClient(ts.url, org.owner, page.id);
    c2.insert(0, 0, 'Вторая. ');
    await c2.waitSaved();
    c2.close();
    await ts.srv.services.hub.flushPage(page.id);

    await org.owner.del(`/api/v1/pages/${page.id}`);
    expect((await revisions(page.id)).find((r) => r.id === v1.id)).toBeTruthy();
    const refused = await expectStatus(org.owner.post(`/api/v1/pages/${page.id}/revisions/${v1.id}/restore`, {}), 409);
    expect(refused.error?.code ?? refused.code).toBe('page_deleted');
    await expectStatus(org.owner.post(`/api/v1/pages/${page.id}/revisions/${v1.id}/restore-block`, { blockId: 'x' }), 409);

    await org.owner.post(`/api/v1/pages/${page.id}/restore`, {});
    await org.owner.post(`/api/v1/pages/${page.id}/archive`, { archived: true });
    const r = await org.owner.post(`/api/v1/pages/${page.id}/revisions/${v1.id}/restore`, {});
    expect(blocksText(await content(page.id))).toEqual(['Первая редакция']);
    expect((await org.owner.get(`/api/v1/pages/${page.id}`)).page.status).toBe('archived'); // workflow status is not rolled back

    // Retention thins old automatic versions only: the restored version, the restore and the pre-restore point stay.
    await ts.db.query(`update page_revisions set created_at = now() - interval '5000 days' where page_id = $1`, [page.id]);
    await ts.srv.worker.maintenance();
    const left = await revisions(page.id);
    for (const id of [v1.id, r.revision.id, r.preRestore.id]) expect(left.find((x) => x.id === id)).toBeTruthy();
  });
});

describe('undo of property changes (R-HISTORY-002)', () => {
  it('icon, tags and properties changes are undoable exactly; a later change by someone else is never overwritten', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Свойства с отменой' })).page;
    const a = await org.owner.patch(`/api/v1/pages/${page.id}`, { icon: '⭐', tags: ['#Важное', 'важное', ' план  2026 '] });
    expect(a.page.tags).toEqual(['Важное', 'план 2026']);
    expect(a.undoEventId).toBeTruthy();
    const u = await org.owner.post(`/api/v1/pages/${page.id}/events/${a.undoEventId}/undo`, {});
    expect(u.page).toMatchObject({ icon: null, tags: [] });
    await expectStatus(org.owner.post(`/api/v1/pages/${page.id}/events/${a.undoEventId}/undo`, {}), 409); // already undone
    // The undo is itself undoable (redo).
    const redo = await org.owner.post(`/api/v1/pages/${page.id}/events/${u.undoEventId}/undo`, {});
    expect(redo.page).toMatchObject({ icon: '⭐', tags: ['Важное', 'план 2026'] });

    const b = await org.owner.patch(`/api/v1/pages/${page.id}`, { properties: { Статус: 'черновик' }, reviewDueAt: '2026-12-01' });
    const editor = await org.user('Правит свойства', { pageGrants: [{ pageId: page.id, level: 'edit' }] });
    await editor.patch(`/api/v1/pages/${page.id}`, { properties: { Статус: 'готово' } });
    const blocked = await expectStatus(org.owner.post(`/api/v1/pages/${page.id}/events/${b.undoEventId}/undo`, {}), 409);
    expect(JSON.stringify(blocked)).toContain('properties');
    expect((await org.owner.get(`/api/v1/pages/${page.id}`)).page.properties).toEqual({ Статус: 'готово' });

    const t = await org.owner.patch(`/api/v1/pages/${page.id}`, { title: 'Новое имя' });
    await org.owner.post(`/api/v1/pages/${page.id}/events/${t.undoEventId}/undo`, {});
    expect((await org.owner.get(`/api/v1/pages/${page.id}`)).page.title).toBe('Свойства с отменой');
    const rd = await org.owner.patch(`/api/v1/pages/${page.id}`, { reviewDueAt: '2027-01-15' });
    await org.owner.post(`/api/v1/pages/${page.id}/events/${rd.undoEventId}/undo`, {});
    expect(String((await org.owner.get(`/api/v1/pages/${page.id}`)).page.reviewDueAt)).toMatch(/2026-1[12]-/);
    const reader = await org.user('Только смотрит свойства', { pageGrants: [{ pageId: page.id, level: 'view' }] });
    await expectStatus(reader.post(`/api/v1/pages/${page.id}/events/${t.undoEventId}/undo`, {}), 403);
  });
});

describe('page model and search sources (R-PAGE-001, R-SEARCH-003)', () => {
  it('pages have a slug from the title that follows renames; tags and headings are searchable and reported as the match source', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Политика безопасности' })).page;
    expect(page.slug).toBe('politika-bezopasnosti');
    const renamed = await org.owner.patch(`/api/v1/pages/${page.id}`, { title: 'Щедрая Ёлка 2026!' });
    expect(renamed.page.slug).toBe('shchedraya-elka-2026');
    expect(renamed.page.id).toBe(page.id); // the id (and every link by id) never changes
    await org.owner.patch(`/api/v1/pages/${page.id}`, { tags: ['Конфиденциально', 'ИБ'] });
    const c = await openClient(ts.url, org.owner, page.id);
    c.insert(0, 0, 'Обычный абзац про пароли');
    await c.waitSaved();
    // The first paragraph becomes a heading (server path, as a paste or restore would do).
    const { replaceContent } = await import('../../apps/server/src/collab/ydoc.js');
    await ts.srv.services.hub.applyServerChange(page.id, null, (doc) =>
      replaceContent(doc, { type: 'doc', content: [{ type: 'heading', attrs: { id: 'h1', level: 2 }, content: [{ type: 'text', text: 'Двухфакторная аутентификация' }] }, { type: 'paragraph', attrs: { id: 'p1' }, content: [{ type: 'text', text: 'Текст раздела' }] }] }, 'test'),
    );
    await ts.srv.services.hub.flushPage(page.id);
    const until = async (q: string, pred: (r: any) => boolean) => {
      for (let i = 0; i < 100; i++) {
        const r = await org.owner.get('/api/v1/search?q=' + encodeURIComponent(q));
        if (pred(r)) return r;
        await new Promise((res) => setTimeout(res, 100));
      }
      throw new Error('search did not find ' + q);
    };
    const byTag = await until('конфиденциально', (r) => r.results.some((x: any) => x.pageId === page.id));
    expect(byTag.results.find((x: any) => x.pageId === page.id).matchedIn).toContain('tag');
    const byHeading = await until('двухфакторная', (r) => r.results.some((x: any) => x.pageId === page.id));
    expect(byHeading.results.find((x: any) => x.pageId === page.id).matchedIn).toEqual(expect.arrayContaining(['heading', 'text']));
    // tag filter
    const filtered = await org.owner.get('/api/v1/search?q=' + encodeURIComponent('текст') + '&tag=' + encodeURIComponent('иб'));
    expect(filtered.results.map((x: any) => x.pageId)).toEqual([page.id]);
    // Tags of a page are not searchable by people who cannot see it.
    const priv = (await org.owner.post('/api/v1/pages', { spaceId: org.personalSpaceId, title: 'Личное' })).page;
    await org.owner.patch(`/api/v1/pages/${priv.id}`, { tags: ['тайныйярлык'] });
    await until('тайныйярлык', (r) => r.results.length > 0);
    const other = await org.user('Ищет чужие теги');
    expect((await other.get('/api/v1/search?q=' + encodeURIComponent('тайныйярлык'))).total).toBe(0);
    c.close();
  });
});
