import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { Document, Packer, Paragraph } from 'docx';
import yazl from 'yazl';
import { startServer, setupOrg, expectStatus, type TestServer, type Api } from '../support/harness.js';
import { openClient, waitFor } from '../support/collab.js';

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer({}, { worker: true });
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => ts?.close());

async function newPage(title: string, parentId?: string) {
  return (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, parentId, title })).page.id as string;
}

async function lastSeq(pageId: string) {
  return Number((await ts.db.query('select last_seq from doc_state where page_id = $1', [pageId])).rows[0].last_seq);
}

async function searchUntil(api: Api, q: string, pred: (r: any) => boolean) {
  for (let i = 0; i < 80; i++) {
    const r = await api.get('/api/v1/search?q=' + encodeURIComponent(q));
    if (pred(r)) return r;
    await new Promise((res) => setTimeout(res, 100));
  }
  return api.get('/api/v1/search?q=' + encodeURIComponent(q));
}

describe('data consistency check (R-COLLAB-037)', () => {
  it('maintenance check reports tree and journal inconsistencies and exports kb_integrity_errors (R-COLLAB-037)', async () => {
    await newPage('Чистая страница');
    const clean = await ts.srv.worker.consistencyCheck();
    expect(clean.ok).toBe(true);
    expect((await ts.srv.services.metrics.integrityErrors.get()).values[0].value).toBe(0);

    // Damage a tree closure row and the journal counter of two separate pages.
    const a = await newPage('Повреждённое дерево');
    const b = await newPage('Повреждённый журнал');
    await ts.db.query('delete from page_ancestors where page_id = $1 and depth = 0', [a]);
    await ts.db.query('update doc_state set last_seq = last_seq + 3 where page_id = $1', [b]);
    const report = await ts.srv.worker.consistencyCheck();
    expect(report.ok).toBe(false);
    const kinds = Object.fromEntries(report.problems.map((p) => [p.kind, p.sample]));
    expect(kinds.tree_missing_self).toContain(a);
    expect(kinds.journal_gap).toContain(b);
    expect((await ts.srv.services.metrics.integrityErrors.get()).values[0].value).toBe(report.total);
    const api = await org.owner.get('/api/v1/admin/consistency');
    expect(api.report.total).toBe(report.total);
    // repair the fixtures so later tests see a consistent database
    await ts.db.query('insert into page_ancestors (page_id, ancestor_id, depth) values ($1, $1, 0)', [a]);
    await ts.db.query('update doc_state set last_seq = last_seq - 3 where page_id = $1', [b]);
    expect((await ts.srv.worker.consistencyCheck()).ok).toBe(true);
  });
});

describe('nesting limit (R-TREE-005, R-TREE-001)', () => {
  it('allows 15 levels and rejects a 16th on create, move, duplicate and import with a clear error (R-TREE-005, R-TREE-001)', async () => {
    const chain: string[] = [];
    for (let i = 1; i <= 15; i++) chain.push(await newPage('Уровень ' + i, chain[chain.length - 1]));
    const e = await expectStatus(org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, parentId: chain[14], title: 'Шестнадцатый' }), 422);
    expect(e.error.code).toBe('depth_limit');
    expect(e.error.message).toMatch(/15 уровней/);
    // A two-level branch fits under level 13 but not under level 14.
    const top = await newPage('Ветка');
    await newPage('Лист ветки', top);
    await org.owner.post(`/api/v1/pages/${top}/move`, { targetParentId: chain[12] });
    const mv = await expectStatus(org.owner.post(`/api/v1/pages/${top}/move`, { targetParentId: chain[13] }), 422);
    expect(mv.error.code).toBe('depth_limit');
    const dup = await expectStatus(org.owner.post(`/api/v1/pages/${chain[13]}/duplicate`, { includeChildren: true, targetParentId: chain[13] }), 422);
    expect(dup.error.code).toBe('depth_limit');
    // Import of a nested folder below level 14: rejected as a whole before anything is created.
    const z = new yazl.ZipFile();
    z.addBuffer(Buffer.from('# Глава\n\nтекст'), 'книга/часть/раздел/глава.md');
    z.addBuffer(Buffer.from('# Введение'), 'книга/введение.md');
    z.end();
    const chunks: Buffer[] = [];
    for await (const c of z.outputStream) chunks.push(c as Buffer);
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.concat(chunks)]), 'deep.zip');
    const started = await org.owner.req('POST', '/api/v1/imports', fd);
    let job: any;
    for (let i = 0; i < 300; i++) {
      job = await org.owner.get(`/api/v1/imports/${started.jobId}`);
      if (!['queued', 'running'].includes(job.status)) break;
      await new Promise((res) => setTimeout(res, 100));
    }
    expect(job.status).toBe('awaiting_confirmation');
    const pagesBefore = (await ts.db.query('select count(*)::int c from pages')).rows[0].c;
    const imp = await expectStatus(org.owner.post(`/api/v1/imports/${started.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: chain[13] } }), 422);
    expect(imp.error.code).toBe('depth_limit');
    expect((await ts.db.query('select count(*)::int c from pages')).rows[0].c).toBe(pagesBefore);
    // nothing partial was created by the failed duplicate
    const kids = await org.owner.get(`/api/v1/spaces/${org.generalSpaceId}/tree?parentId=${chain[13]}`);
    expect(kids.nodes.filter((n: any) => n.title.includes('(копия)'))).toHaveLength(0);
  });
});

describe('legal hold (R-HISTORY-015, R-HISTORY-028)', () => {
  it('only org admins set or release a hold; it is audited, shown on the page and blocks permanent deletion (R-HISTORY-015, R-HISTORY-028)', async () => {
    const pageId = await newPage('Договор под удержанием');
    const member = await org.user('Обычный сотрудник');
    await expectStatus(member.put('/api/v1/admin/legal-hold', { resourceType: 'page', resourceId: pageId, hold: true, reason: 'Судебный запрос' }), 403);
    await expectStatus(org.owner.put('/api/v1/admin/legal-hold', { resourceType: 'page', resourceId: pageId, hold: true, reason: '' }), 400);
    const r = await org.owner.put('/api/v1/admin/legal-hold', { resourceType: 'page', resourceId: pageId, hold: true, reason: 'Судебный запрос №12' });
    expect(r.legalHold).toBe(true);
    expect((await org.owner.get(`/api/v1/pages/${pageId}`)).page.legalHold).toBe(true);
    expect((await org.owner.get('/api/v1/admin/legal-holds')).pages.map((p: any) => p.id)).toContain(pageId);
    await org.owner.del(`/api/v1/pages/${pageId}`);
    await expectStatus(org.owner.del(`/api/v1/trash/${pageId}`, { confirm: true }), 403);
    const audit = await ts.db.query(`select action, details from audit_events where target_id = $1 and action like 'legal_hold.%' order by id`, [pageId]);
    expect(audit.rows.map((x) => x.action)).toEqual(['legal_hold.set']);
    expect(audit.rows[0].details.reason).toBe('Судебный запрос №12');
    await org.owner.put('/api/v1/admin/legal-hold', { resourceType: 'page', resourceId: pageId, hold: false, reason: 'Дело закрыто' });
    expect((await org.owner.del(`/api/v1/trash/${pageId}`, { confirm: true })).purged).toBe(1);
  });
});

describe('restore to a journal step (R-HISTORY-026, HIST-187)', () => {
  it('reconstructs the state after any journal operation and restores it as a new reversible revision (R-HISTORY-026, HIST-187, R-HISTORY-034)', async () => {
    const pageId = await newPage('Журнал');
    const c = await openClient(ts.url, org.owner, pageId);
    c.insert(0, 0, 'шаг один');
    await c.waitSaved();
    const s1 = await lastSeq(pageId);
    c.appendParagraph('шаг два');
    await c.waitSaved();
    c.deleteText(0, 0, 3);
    await c.waitSaved();
    const view = await org.owner.get(`/api/v1/pages/${pageId}/journal/${s1}`);
    expect(view.content.content.map((b: any) => (b.content ?? []).map((t: any) => t.text).join(''))).toEqual(['шаг один']);
    expect(view.base).toBe('journal');
    expect(view.stats.added + view.stats.changed).toBeGreaterThan(0);
    await expectStatus(org.owner.get(`/api/v1/pages/${pageId}/journal/${(await lastSeq(pageId)) + 50}`), 404);
    const reader = await org.user('Только читатель журнала');
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: pageId, subjectType: 'user', subjectId: reader.id, level: 'view' });
    await expectStatus(reader.post(`/api/v1/pages/${pageId}/journal/${s1}/restore`), 403);
    expect((await reader.get(`/api/v1/pages/${pageId}/journal/${s1}`)).seq).toBe(s1); // viewing history is allowed

    const before = (await org.owner.get(`/api/v1/pages/${pageId}/revisions`)).revisions.length;
    const r = await org.owner.post(`/api/v1/pages/${pageId}/journal/${s1}/restore`);
    expect(r.revision.number).toBeGreaterThan(r.preRestore.number);
    await waitFor(() => c.text() === 'шаг один', 5000, 'journal restore propagated');
    const revs = (await org.owner.get(`/api/v1/pages/${pageId}/revisions`)).revisions;
    expect(revs.length).toBe(before + 2);
    expect(revs[0].label).toMatch(new RegExp(`операцию №${s1}`));
    // reversible: the pre-restore revision brings the later state back
    await org.owner.post(`/api/v1/pages/${pageId}/revisions/${r.preRestore.id}/restore`);
    await waitFor(() => c.text() === ' один\nшаг два', 5000, 'restore undone');
    const ev = await org.owner.get(`/api/v1/pages/${pageId}/events?type=restored-journal`);
    expect(ev.events[0].data.seq).toBe(s1);
    c.close();
  });

  it('starts from a revision when the journal head was compacted and refuses an unreachable step (R-HISTORY-026)', async () => {
    const pageId = await newPage('Сжатый журнал');
    const c = await openClient(ts.url, org.owner, pageId);
    c.insert(0, 0, 'а');
    await c.waitSaved();
    const early = await lastSeq(pageId);
    c.insert(0, 1, 'б');
    await c.waitSaved();
    const rev = (await org.owner.post(`/api/v1/pages/${pageId}/revisions`, { label: 'опора' })).revision;
    c.insert(0, 2, 'в');
    await c.waitSaved();
    const target = await lastSeq(pageId);
    const upto = Number((await ts.db.query('select seq_upto from page_revisions where id = $1', [rev.id])).rows[0].seq_upto);
    // Simulate retention: journal rows before the revision are gone.
    await ts.db.query('delete from doc_updates where page_id = $1 and seq > 1 and seq <= $2', [pageId, upto]);
    const view = await org.owner.get(`/api/v1/pages/${pageId}/journal/${target}`);
    expect(view.base).toBe(`revision ${rev.number}`);
    expect(view.content.content[0].content[0].text).toBe('абв');
    const e = await expectStatus(org.owner.get(`/api/v1/pages/${pageId}/journal/${early}`), 422);
    expect(e.error.code).toBe('journal_pruned');
    c.close();
  });
});

describe('restore notifies co-editors (R-HISTORY-014, COLLAB-197)', () => {
  it('everyone else on the page gets a page-restored event with a link to the pre-restore version (R-HISTORY-014, COLLAB-197)', async () => {
    const pageId = await newPage('Общий документ');
    const colleague = await org.user('Коллега-редактор');
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: pageId, subjectType: 'user', subjectId: colleague.id, level: 'edit' });
    const outsider = await org.user('Посторонний наблюдатель');
    const me = await org.owner.get('/api/v1/auth/me');
    const hidden = (await org.owner.post('/api/v1/pages', { spaceId: me.personalSpaceId, title: 'Личное' })).page.id;
    const listen = (api: Api) => {
      const msgs: any[] = [];
      const ws = new WebSocket(ts.url.replace('http', 'ws') + '/api/v1/events', { headers: { cookie: api.cookieHeader() } });
      ws.on('message', (d: Buffer) => msgs.push(JSON.parse(d.toString())));
      return { msgs, ws, open: new Promise((r) => ws.on('open', r)) };
    };
    const col = listen(colleague);
    const own = listen(org.owner);
    const out = listen(outsider);
    await Promise.all([col.open, own.open, out.open]);
    const c = await openClient(ts.url, org.owner, pageId);
    c.insert(0, 0, 'первая редакция');
    await c.waitSaved();
    const v1 = (await org.owner.post(`/api/v1/pages/${pageId}/revisions`, { label: 'v1' })).revision;
    c.insert(0, 0, 'правка коллег: ');
    await c.waitSaved();
    const r = await org.owner.post(`/api/v1/pages/${pageId}/revisions/${v1.id}/restore`);
    await waitFor(() => col.msgs.some((m) => m.type === 'page-restored'), 5000, 'colleague notified');
    const m = col.msgs.find((x) => x.type === 'page-restored');
    expect(m).toMatchObject({ pageId, actorName: org.owner.user.name, preRestoreRevisionId: r.preRestore.id, preRestoreNumber: r.preRestore.number });
    expect(m.label).toMatch(/Восстановлена версия/);
    // the colleague's work is in the pre-restore revision
    const pre = await colleague.get(`/api/v1/pages/${pageId}/revisions/${r.preRestore.id}`);
    expect(JSON.stringify(pre.revision.content)).toContain('правка коллег');
    // the actor and people without access are not notified; a restore on a hidden page leaks nothing
    await org.owner.post(`/api/v1/pages/${hidden}/revisions`, {});
    const hrev = (await org.owner.get(`/api/v1/pages/${hidden}/revisions`)).revisions[0];
    await org.owner.post(`/api/v1/pages/${hidden}/revisions/${hrev.id}/restore`);
    await new Promise((res) => setTimeout(res, 300));
    expect(own.msgs.some((x) => x.type === 'page-restored')).toBe(false);
    expect(out.msgs.some((x) => x.type === 'page-restored' && x.pageId === hidden)).toBe(false);
    for (const l of [col, own, out]) l.ws.close();
    c.close();
  });
});

describe('search covers comments and attached documents (R-SEARCH-003, R-SEARCH-013)', () => {
  it('finds a page by comment text and by text inside an attached DOCX/TXT, respecting access (R-SEARCH-003, R-SEARCH-013)', async () => {
    const pageId = await newPage('Регламент без ключевых слов');
    await org.owner.post(`/api/v1/pages/${pageId}/comments`, { text: 'Уточнить термоусадочность упаковки у поставщика' });
    const byComment = await searchUntil(org.owner, 'термоусадочность', (r) => r.results.length > 0);
    expect(byComment.results[0].pageId).toBe(pageId);
    expect(byComment.results[0].matchedIn).toContain('comment');

    const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Паллетирование выполняется стрейч-плёнкой квазиуникум')] }] }));
    const upload = async (name: string, data: Buffer, mime: string) => {
      const fd = new FormData();
      fd.append('pageId', pageId);
      fd.append('file', new Blob([data], { type: mime }), name);
      return org.owner.req('POST', '/api/v1/attachments', fd);
    };
    await upload('инструкция.docx', Buffer.from(docx), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    await upload('заметки.txt', Buffer.from('Сверка остатков проводится ежеквартально гиперсверка'), 'text/plain');
    const byDocx = await searchUntil(org.owner, 'квазиуникум', (r) => r.results.length > 0);
    expect(byDocx.results[0].pageId).toBe(pageId);
    expect(byDocx.results[0].matchedIn).toContain('file');
    const byTxt = await searchUntil(org.owner, 'гиперсверка', (r) => r.results.length > 0);
    expect(byTxt.results[0].pageId).toBe(pageId);
    const filesOnly = await org.owner.get('/api/v1/search?in=files&q=' + encodeURIComponent('квазиуникум'));
    expect(filesOnly.results.map((x: any) => x.pageId)).toContain(pageId);

    // Access is applied to comment/file matches as well.
    const me = await org.owner.get('/api/v1/auth/me');
    const priv = (await org.owner.post('/api/v1/pages', { spaceId: me.personalSpaceId, title: 'Личные заметки' })).page.id;
    await org.owner.post(`/api/v1/pages/${priv}/comments`, { text: 'секретнаяметкакомментария' });
    await searchUntil(org.owner, 'секретнаяметкакомментария', (r) => r.results.length > 0);
    const other = await org.user('Ищет чужие комментарии');
    expect((await other.get('/api/v1/search?q=' + encodeURIComponent('секретнаяметкакомментария'))).total).toBe(0);
  });
});
