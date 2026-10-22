import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import sharp from 'sharp';
import { startServer, setupOrg, expectStatus, Api, type TestServer } from '../support/harness.js';
import { openClient, waitFor } from '../support/collab.js';
import { isBlockedAddress, fetchRemote, RemoteFetchError } from '../../apps/server/src/services/remote-fetch.js';

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

// A local "remote" image server: reachable as http://localhost:<port> (allow-listed host) and as
// http://127.0.0.1:<port> (a loopback address that the SSRF guard must refuse).
let img: http.Server;
let imgPort = 0;
const imgHits: string[] = [];
let png: Buffer;

beforeAll(async () => {
  png = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#3366aa' } }).png().toBuffer();
  img = http.createServer((req, res) => {
    imgHits.push(req.url ?? '');
    if (req.url?.startsWith('/redirect-internal')) {
      res.writeHead(302, { location: `http://127.0.0.1:${imgPort}/pic.png` });
      return res.end();
    }
    if (req.url?.startsWith('/redirect-metadata')) {
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
      return res.end();
    }
    if (req.url?.startsWith('/page.html')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<html></html>');
    }
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': png.length });
    res.end(png);
  });
  await new Promise<void>((r) => img.listen(0, () => r()));
  imgPort = (img.address() as { port: number }).port;
  ts = await startServer({ remoteFetch: { enabled: true, allowHosts: ['localhost'], timeoutMs: 5000, maxBytes: 5 * 1024 * 1024 } }, { worker: true });
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => {
  await ts?.close();
  await new Promise((r) => img?.close(r));
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const group = async (name: string, kind: 'department' | 'group' = 'group') => (await org.owner.post('/api/v1/admin/groups', { name, kind })).group.id as string;
const statusOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return 200;
  } catch (e: any) {
    return e.status as number;
  }
};

// ------------------------------------------------------------------------------------------------------------------
describe('role × permission matrix (R-ACL-013, R-AUDIT-002)', () => {
  type Perm = 'view' | 'create' | 'edit' | 'comment' | 'publish' | 'delete' | 'manage_members' | 'export' | 'audit';
  const PERMS: Perm[] = ['view', 'create', 'edit', 'comment', 'publish', 'delete', 'manage_members', 'export', 'audit'];
  // Roles of the specification mapped to the model: space grants for content roles, organisation roles for system roles.
  const MATRIX: Record<string, Record<Perm, boolean>> = {
    владелец: { view: true, create: true, edit: true, comment: true, publish: true, delete: true, manage_members: true, export: true, audit: true },
    редактор: { view: true, create: true, edit: true, comment: true, publish: true, delete: true, manage_members: false, export: true, audit: false },
    автор: { view: true, create: true, edit: true, comment: true, publish: false, delete: true, manage_members: false, export: true, audit: false },
    читатель: { view: true, create: false, edit: false, comment: false, publish: false, delete: false, manage_members: false, export: true, audit: false },
    // The administrator role manages the system, never content (no hidden access); the auditor reads the log only.
    сисадмин: { view: false, create: false, edit: false, comment: false, publish: false, delete: false, manage_members: false, export: false, audit: true },
    аудитор: { view: false, create: false, edit: false, comment: false, publish: false, delete: false, manage_members: false, export: false, audit: true },
  };

  it('R-ACL-013: every role × permission cell of the matrix is enforced by the API (table-driven)', async () => {
    const sp = (await org.owner.post('/api/v1/spaces', { name: 'Матрица ролей', kind: 'project', visibility: 'private' })).space;
    const users: Record<string, Api & { id: string }> = {
      владелец: await org.user('Роль Владелец'),
      редактор: await org.user('Роль Редактор'),
      автор: await org.user('Роль Автор'),
      читатель: await org.user('Роль Читатель'),
      сисадмин: await org.user('Роль Сисадмин', { orgRole: 'admin' }),
      аудитор: await org.user('Роль Аудитор', { orgRole: 'auditor' }),
    };
    const grant = (u: string, level: string, extra: Record<string, unknown> = {}) => org.owner.put('/api/v1/grants', { resourceType: 'space', resourceId: sp.id, subjectType: 'user', subjectId: users[u].id, level, ...extra });
    await grant('владелец', 'full');
    await grant('редактор', 'edit');
    await grant('автор', 'edit', { canPublish: false });
    await grant('читатель', 'view');
    const page = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Регламент для матрицы' })).page;
    const target = await org.user('Получатель доступа');

    const results: string[] = [];
    for (const [role, api] of Object.entries(users)) {
      const victim = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, parentId: page.id, title: 'Удаляемая ' + role })).page;
      const actions: Record<Perm, () => Promise<unknown>> = {
        view: () => api.get(`/api/v1/pages/${page.id}`),
        create: () => api.post('/api/v1/pages', { spaceId: sp.id, parentId: page.id, title: 'Создано: ' + role }),
        edit: () => api.patch(`/api/v1/pages/${page.id}`, { title: 'Регламент для матрицы' }),
        comment: () => api.post(`/api/v1/pages/${page.id}/comments`, { text: 'Комментарий ' + role }),
        publish: () => api.post(`/api/v1/pages/${page.id}/publish`, {}),
        delete: () => api.del(`/api/v1/pages/${victim.id}`),
        manage_members: () => api.put('/api/v1/grants', { resourceType: 'page', resourceId: page.id, subjectType: 'user', subjectId: target.id, level: 'view' }),
        export: () => api.raw('GET', `/api/v1/pages/${page.id}/export?format=md`).then((r) => (r.ok ? r : Promise.reject({ status: r.status }))),
        audit: () => api.get(`/api/v1/audit?targetId=${page.id}`),
      };
      for (const perm of PERMS) {
        const st = await statusOf(actions[perm]());
        const allowed = st < 300;
        if (allowed !== MATRIX[role][perm]) results.push(`${role} × ${perm}: expected ${MATRIX[role][perm] ? 'allow' : 'deny'}, got HTTP ${st}`);
        if (!allowed) expect([403, 404]).toContain(st); // denial never leaks as another error
      }
    }
    expect(results).toEqual([]);
  });

  it('R-AUDIT-002: combinatorial parent / child / group inheritance matches an independent oracle, and every grant is audited', async () => {
    const g = await group('Комбинаторная группа');
    const u = await org.user('Комбинаторный сотрудник', { groupIds: [g] });
    const SPACE = ['none', 'view', 'edit'] as const;
    const PARENT = ['-', 'none', 'comment'] as const; // '-' = no grant, 'none' = explicit deny for the user
    const INHERIT = [true, false] as const;
    const CHILD = ['-', 'view'] as const;
    const rank: Record<string, number> = { none: 0, view: 1, comment: 2, edit: 3, full: 4 };
    const mismatches: string[] = [];
    let grantsMade = 0;
    for (const sl of SPACE) {
      const sp = (await org.owner.post('/api/v1/spaces', { name: 'Комбинации ' + sl, kind: 'project', visibility: 'private' })).space;
      if (sl !== 'none') {
        await org.owner.put('/api/v1/grants', { resourceType: 'space', resourceId: sp.id, subjectType: 'group', subjectId: g, level: sl });
        grantsMade++;
      }
      for (const pl of PARENT)
        for (const inh of INHERIT)
          for (const cl of CHILD) {
            const parent = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: `P ${pl}` })).page;
            const child = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, parentId: parent.id, title: `C ${inh} ${cl}` })).page;
            if (pl !== '-') {
              await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: parent.id, subjectType: 'user', subjectId: u.id, level: pl });
              grantsMade++;
            }
            if (cl !== '-') {
              await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: child.id, subjectType: 'user', subjectId: u.id, level: cl });
              grantsMade++;
            }
            if (!inh) await ts.db.query('update pages set inherit_permissions = false where id = $1', [child.id]);
            // Oracle: applicable = child's own grant (+ parent's and the space's when inheriting); a deny wins.
            const applicable = [cl, ...(inh ? [pl, sl === 'none' ? '-' : sl] : [])].filter((x) => x !== '-');
            const expected = applicable.includes('none') ? 'none' : applicable.reduce((m, x) => (rank[x] > rank[m] ? x : m), 'none');
            let actual = 'none';
            try {
              actual = (await u.get(`/api/v1/pages/${child.id}`)).page.access.level;
            } catch (e: any) {
              expect(e.status).toBe(404);
            }
            if (actual !== expected) mismatches.push(`space=${sl} parent=${pl} inherit=${inh} child=${cl}: expected ${expected}, got ${actual}`);
          }
    }
    expect(mismatches).toEqual([]);
    // Invitations (user creation) and every grant are in the audit log.
    const created = (await org.owner.get(`/api/v1/audit?action=user.create&targetId=${u.id}`)).events;
    expect(created.length).toBe(1);
    const grantEvents = (await ts.db.query(`select count(*)::int c from audit_events where action = 'grant.create' and details->>'subjectId' in ($1, $2)`, [u.id, g])).rows[0].c;
    expect(grantEvents).toBe(grantsMade);
  });
});

// ------------------------------------------------------------------------------------------------------------------
describe('public links (R-PUBLISH-009, E2E-109, R-ACL-021)', () => {
  const enable = (on: boolean) => org.owner.patch('/api/v1/admin/settings', { publicLinksEnabled: on });
  const anon = () => new Api(ts.url);

  it('E2E-109: creating a public link is rejected while the organisation policy forbids it (default)', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Без публичных ссылок' })).page;
    const body = await expectStatus(org.owner.post(`/api/v1/pages/${page.id}/share-links`, { acknowledged: true }), 403);
    expect(body.error.message).toMatch(/отключены политикой/);
    expect((await ts.db.query('select count(*)::int c from share_links where page_id = $1', [page.id])).rows[0].c).toBe(0);
  });

  it('R-PUBLISH-009: link works anonymously with noindex, honours password, expiry, download control, and stops after revoke', async () => {
    await enable(true);
    try {
      const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Публичная инструкция' })).page;
      const { replaceContent } = await import('../../apps/server/src/collab/ydoc.js');
      const fd = new FormData();
      fd.append('pageId', page.id);
      fd.append('file', new Blob([Buffer.from('секретный прайс')], { type: 'text/plain' }), 'price.txt');
      const att = (await org.owner.req('POST', '/api/v1/attachments', fd)).attachments[0];
      await ts.srv.services.hub.applyServerChange(page.id, null, (doc) =>
        replaceContent(doc, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Текст для внешних партнёров' }] }, { type: 'fileBlock', attrs: { attachmentId: att.id, name: 'price.txt' } }] }),
      );
      // The acknowledgement that downloaded copies cannot be revoked is mandatory.
      await expectStatus(org.owner.post(`/api/v1/pages/${page.id}/share-links`, {}), 400);
      // A reader (no share right) cannot create links.
      const reader = await org.user('Читатель без шаринга');
      await expectStatus(reader.post(`/api/v1/pages/${page.id}/share-links`, { acknowledged: true }), 403);

      const created = await org.owner.post(`/api/v1/pages/${page.id}/share-links`, { acknowledged: true, expiresAt: new Date(Date.now() + 86400_000).toISOString() });
      expect(created.link).toMatchObject({ allowDownload: false, allowIndex: false, hasPassword: false });
      const a = anon();
      const res = await a.raw('GET', created.path);
      expect(res.status).toBe(200);
      expect(res.headers.get('x-robots-tag')).toMatch(/noindex/);
      const html = await res.text();
      expect(html).toContain('Текст для внешних партнёров');
      expect(html).toContain('<meta name="robots" content="noindex');
      expect(html).not.toContain('/api/v1/attachments/');
      // Download is off: the file is not served.
      expect((await a.raw('GET', `${created.path}/files/${att.id}?download=1`)).status).toBe(403);
      // An authenticated API session does not grant anything extra on the anonymous page.
      expect((await a.raw('GET', `/api/v1/pages/${page.id}`)).status).toBe(401);

      // Download allowed on a second link.
      const dl = await org.owner.post(`/api/v1/pages/${page.id}/share-links`, { acknowledged: true, allowDownload: true });
      const file = await a.raw('GET', `${dl.path}/files/${att.id}?download=1`);
      expect(file.status).toBe(200);
      expect(await file.text()).toBe('секретный прайс');

      // Password protection: content only after the right password; wrong attempts are audited.
      const pw = await org.owner.post(`/api/v1/pages/${page.id}/share-links`, { acknowledged: true, password: 'пароль-123' });
      const locked = await (await a.raw('GET', pw.path)).text();
      expect(locked).toContain('защищён паролем');
      expect(locked).not.toContain('Текст для внешних партнёров');
      const bad = await a.raw('POST', pw.path, undefined, { 'content-type': 'application/x-www-form-urlencoded' }).catch(() => null);
      expect(bad?.status).toBe(401);
      const ok = await fetch(ts.url + pw.path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'password=' + encodeURIComponent('пароль-123'), redirect: 'manual' });
      expect(ok.status).toBe(303);
      const cookie = ok.headers.getSetCookie()[0].split(';')[0];
      const opened = await fetch(ts.url + pw.path, { headers: { cookie } });
      expect(await opened.text()).toContain('Текст для внешних партнёров');
      const failed = (await org.owner.get(`/api/v1/audit?action=share_link.password_failed&targetId=${page.id}`)).events;
      expect(failed.length).toBeGreaterThan(0);

      // Expiry is enforced by the server.
      await ts.db.query(`update share_links set expires_at = now() - interval '1 second' where id = $1`, [dl.link.id]);
      expect((await a.raw('GET', dl.path)).status).toBe(404);
      expect((await a.raw('GET', `${dl.path}/files/${att.id}?download=1`)).status).toBe(404);

      // Revocation works immediately.
      await org.owner.del(`/api/v1/share-links/${created.link.id}`);
      expect((await a.raw('GET', created.path)).status).toBe(404);
      const log = (await org.owner.get(`/api/v1/audit?action=share_link.&targetId=${page.id}`)).events.map((e: any) => e.action);
      expect(log).toEqual(expect.arrayContaining(['share_link.create', 'share_link.revoke', 'share_link.view']));

      // Turning the organisation policy off disables links that already exist.
      const live = await org.owner.post(`/api/v1/pages/${page.id}/share-links`, { acknowledged: true });
      expect((await a.raw('GET', live.path)).status).toBe(200);
      await enable(false);
      expect((await a.raw('GET', live.path)).status).toBe(404);
    } finally {
      await enable(false);
    }
  });

  it('R-PUBLISH-009: a link stops when its creator loses the right to share; children only when included; foreign pages never', async () => {
    await enable(true);
    try {
      const sp = (await org.owner.post('/api/v1/spaces', { name: 'Публичный раздел', kind: 'project', visibility: 'private' })).space;
      const mgr = await org.user('Менеджер ссылок');
      await org.owner.put('/api/v1/grants', { resourceType: 'space', resourceId: sp.id, subjectType: 'user', subjectId: mgr.id, level: 'full' });
      const root = (await mgr.post('/api/v1/pages', { spaceId: sp.id, title: 'Корень раздела' })).page;
      const child = (await mgr.post('/api/v1/pages', { spaceId: sp.id, parentId: root.id, title: 'Подраздел' })).page;
      const other = (await mgr.post('/api/v1/pages', { spaceId: sp.id, title: 'Чужая ветка' })).page;
      const only = await mgr.post(`/api/v1/pages/${root.id}/share-links`, { acknowledged: true });
      const tree = await mgr.post(`/api/v1/pages/${root.id}/share-links`, { acknowledged: true, includeChildren: true });
      const a = new Api(ts.url);
      expect((await a.raw('GET', `${only.path}/p/${child.id}`)).status).toBe(404);
      expect((await a.raw('GET', `${tree.path}/p/${child.id}`)).status).toBe(200);
      expect(await (await a.raw('GET', tree.path)).text()).toContain(`/p/${child.id}`);
      expect((await a.raw('GET', `${tree.path}/p/${other.id}`)).status).toBe(404);
      // The creator loses full access → all links created by them stop working.
      const g = (await org.owner.get(`/api/v1/spaces/${sp.id}/access`)).grants.find((x: any) => x.subject_id === mgr.id);
      await org.owner.del(`/api/v1/grants/${g.id}`);
      expect((await a.raw('GET', tree.path)).status).toBe(404);
    } finally {
      await enable(false);
    }
  });
});

// ------------------------------------------------------------------------------------------------------------------
describe('emergency access and offboarding (R-ACL-056, R-ADMIN-016)', () => {
  it('R-ACL-056: emergency access needs a second administrator, a reason and a time limit; read-only; owner notified; audited', async () => {
    const author = await org.user('Автор личных заметок');
    const me = await author.get('/api/v1/auth/me');
    const note = (await author.post('/api/v1/pages', { spaceId: me.personalSpaceId, title: 'Личные заметки о проекте' })).page;
    const admin1 = await org.user('Админ инициатор', { orgRole: 'admin' });
    const admin2 = await org.user('Админ утверждающий', { orgRole: 'admin' });
    // The administrator role alone never opens personal content.
    await expectStatus(admin1.get(`/api/v1/pages/${note.id}`), 404);
    // A short reason is refused; regular employees cannot request.
    await expectStatus(admin1.post('/api/v1/admin/emergency-access', { pageId: note.id, reason: 'надо', durationHours: 4 }), 400);
    await expectStatus(author.post('/api/v1/admin/emergency-access', { pageId: note.id, reason: 'Расследование инцидента ИБ-2026-17 по запросу службы безопасности', durationHours: 4 }), 403);
    const { request } = await admin1.post('/api/v1/admin/emergency-access', { pageId: note.id, reason: 'Расследование инцидента ИБ-2026-17 по запросу службы безопасности', durationHours: 4 });
    expect(request.status).toBe('pending');
    await expectStatus(admin1.get(`/api/v1/pages/${note.id}`), 404); // nothing before approval
    await expectStatus(admin1.post(`/api/v1/admin/emergency-access/${request.id}/decide`, { approve: true }), 403); // no self-approval
    const decided = await admin2.post(`/api/v1/admin/emergency-access/${request.id}/decide`, { approve: true });
    expect(decided.request.status).toBe('approved');
    const opened = await admin1.get(`/api/v1/pages/${note.id}`);
    expect(opened.page.access.level).toBe('view');
    expect(opened.page.access.actions).toMatchObject({ edit: false, export: false, download: false, share: false });
    expect((await admin1.raw('GET', `/api/v1/pages/${note.id}/export?format=md`)).status).toBe(403);
    const g = (await ts.db.query('select expires_at, reason from grants where id = $1', [decided.request.grant_id])).rows[0];
    expect(new Date(g.expires_at).getTime() - Date.now()).toBeLessThanOrEqual(4 * 3600_000 + 5000);
    expect(g.reason).toContain('Экстренный доступ');
    const notes = await author.get('/api/v1/notifications');
    expect(JSON.stringify(notes)).toContain('emergency_access_granted');
    const log = (await org.owner.get(`/api/v1/audit?action=emergency_access.&targetId=${note.id}`)).events.map((e: any) => e.action);
    expect(log).toEqual(expect.arrayContaining(['emergency_access.request', 'emergency_access.approve']));
    await admin2.post(`/api/v1/admin/emergency-access/${request.id}/revoke`);
    await expectStatus(admin1.get(`/api/v1/pages/${note.id}`), 404);
  });

  it('R-ADMIN-016: offboarding hands over only already-shared personal documents; private notes stay private; counts-only audit', async () => {
    const leaver = await org.user('Увольняющийся сотрудник');
    const colleague = await org.user('Коллега увольняющегося');
    const successor = await org.user('Преемник');
    const me = await leaver.get('/api/v1/auth/me');
    const priv = (await leaver.post('/api/v1/pages', { spaceId: me.personalSpaceId, title: 'Совсем личное' })).page;
    const shared = (await leaver.post('/api/v1/pages', { spaceId: me.personalSpaceId, title: 'Черновик отчёта для коллеги' })).page;
    await leaver.put('/api/v1/grants', { resourceType: 'page', resourceId: shared.id, subjectType: 'user', subjectId: colleague.id, level: 'comment' });
    // Not possible while the account is active.
    await expectStatus(org.owner.post(`/api/v1/admin/users/${leaver.id}/offboard-personal`, { mode: 'archive' }), 400);
    await org.owner.post(`/api/v1/admin/users/${leaver.id}/status`, { status: 'deactivated', reason: 'увольнение' });
    const dry = await org.owner.post(`/api/v1/admin/users/${leaver.id}/offboard-personal`, { mode: 'transfer_shared', successorId: successor.id, dryRun: true });
    expect(dry).toEqual({ pages: 2, shared: 1, private: 1, transferred: 1 });
    await expectStatus(successor.get(`/api/v1/pages/${shared.id}`), 404); // dry run changes nothing
    await org.owner.post(`/api/v1/admin/users/${leaver.id}/offboard-personal`, { mode: 'transfer_shared', successorId: successor.id });
    expect((await successor.get(`/api/v1/pages/${shared.id}`)).page.access.level).toBe('full');
    await expectStatus(successor.get(`/api/v1/pages/${priv.id}`), 404);
    await expectStatus(org.owner.get(`/api/v1/pages/${priv.id}`), 404);
    const ev = (await org.owner.get(`/api/v1/audit?action=user.offboard_personal&targetId=${leaver.id}`)).events[0];
    expect(ev.details).toMatchObject({ mode: 'transfer_shared', pages: 2, shared: 1, private: 1 });
    expect(JSON.stringify(ev)).not.toContain('Совсем личное');
    expect((await ts.db.query('select archived_at from spaces where id = $1', [me.personalSpaceId])).rows[0].archived_at).not.toBeNull();
  });
});

// ------------------------------------------------------------------------------------------------------------------
describe('sharing details (R-ACL-051, R-ACL-021, R-ACL-036, R-ACL-063)', () => {
  it('R-ACL-051: a personal page shared with anybody is marked «не полностью личная» (also its children); the mark disappears on revoke', async () => {
    const u = await org.user('Владелец личной страницы');
    const c = await org.user('Коллега-читатель');
    const me = await u.get('/api/v1/auth/me');
    const p = (await u.post('/api/v1/pages', { spaceId: me.personalSpaceId, title: 'Личная' })).page;
    const kid = (await u.post('/api/v1/pages', { spaceId: me.personalSpaceId, parentId: p.id, title: 'Вложенная личная' })).page;
    expect(p.personalShared).toBe(false);
    const g = (await u.put('/api/v1/grants', { resourceType: 'page', resourceId: p.id, subjectType: 'user', subjectId: c.id, level: 'view' })).grant;
    expect((await u.get(`/api/v1/pages/${p.id}`)).page.personalShared).toBe(true);
    expect((await u.get(`/api/v1/pages/${kid.id}`)).page.personalShared).toBe(true);
    expect(await u.get(`/api/v1/pages/${p.id}/exposure`)).toMatchObject({ personal: true, shared: true, people: 1 });
    await u.del(`/api/v1/grants/${g.id}`);
    expect((await u.get(`/api/v1/pages/${p.id}`)).page.personalShared).toBe(false);
    // Pages of shared spaces are never "personal".
    const gp = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Общая' })).page;
    expect(gp.personalShared).toBe(false);
  });

  it('R-ACL-021: «Только я» shows who loses access, requires confirmation and leaves only the author', async () => {
    const p = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Станет личной' })).page;
    const reader = await org.user('Читатель общей');
    expect((await reader.get(`/api/v1/pages/${p.id}`)).page.access.level).toBe('view');
    const pre = await expectStatus(org.owner.post(`/api/v1/pages/${p.id}/access/only-me`, {}), 409);
    expect(pre.error.code).toBe('audience_change');
    expect(pre.error.details.removedCount).toBeGreaterThan(0);
    expect(pre.error.details.removed.map((x: any) => x.name)).toContain('Читатель общей');
    await expectStatus(reader.post(`/api/v1/pages/${p.id}/access/only-me`, { confirm: true }), 403);
    await org.owner.post(`/api/v1/pages/${p.id}/access/only-me`, { confirm: true });
    await expectStatus(reader.get(`/api/v1/pages/${p.id}`), 404);
    const acc = await org.owner.get(`/api/v1/pages/${p.id}/access`);
    expect(acc.inheritPermissions).toBe(false);
    expect(acc.pageGrants.map((g: any) => [g.subject_id, g.level])).toEqual([[org.owner.user.id, 'full']]);
  });

  it('R-ACL-036 R-ACL-063: start, end, time zone, author and reason are stored; the granter is reminded once before expiry', async () => {
    const p = (await org.owner.post('/api/v1/pages', { spaceId: org.personalSpaceId, title: 'Временный доступ с поясом' })).page;
    const u = await org.user('Временный получатель');
    const startsAt = new Date(Date.now() - 60_000).toISOString();
    const expiresAt = new Date(Date.now() + 2 * 3600_000).toISOString();
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: p.id, subjectType: 'user', subjectId: u.id, level: 'edit', startsAt, expiresAt, timeZone: 'Asia/Yekaterinburg', reason: 'Подготовка квартального отчёта' });
    const g = (await org.owner.get(`/api/v1/pages/${p.id}/access`)).pageGrants.find((x: any) => x.subject_id === u.id);
    expect(g).toMatchObject({ time_zone: 'Asia/Yekaterinburg', reason: 'Подготовка квартального отчёта', granted_by: org.owner.user.id });
    expect(new Date(g.starts_at).toISOString()).toBe(startsAt);
    expect(new Date(g.expires_at).toISOString()).toBe(expiresAt);
    await expectStatus(org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: p.id, subjectType: 'user', subjectId: u.id, level: 'edit', timeZone: 'Europe/Moscow"; drop table x' }), 400);
    const r1 = await org.owner.post('/api/v1/admin/grants/remind-expiring');
    expect(r1.reminded).toBeGreaterThanOrEqual(1);
    const r2 = await org.owner.post('/api/v1/admin/grants/remind-expiring');
    expect(r2.reminded).toBe(0);
    const n = (await org.owner.get('/api/v1/notifications')).notifications ?? [];
    expect(JSON.stringify(n)).toContain('grant_expiring');
  });
});

// ------------------------------------------------------------------------------------------------------------------
describe('effective access for administrators (R-ADMIN-010, V16-S15, R-ADMIN-018)', () => {
  it('R-ADMIN-010 V16-S15: users × spaces matrix shows level, source, expiry, conflicts and managers without personal spaces', async () => {
    const dept = await group('Отдел матрицы', 'department');
    const u = await org.user('Сотрудник матрицы', { groupIds: [dept] });
    const sp = (await org.owner.post('/api/v1/spaces', { name: 'Пространство матрицы', kind: 'department', visibility: 'private', groups: [{ groupId: dept, level: 'edit' }] })).space;
    const sp2 = (await org.owner.post('/api/v1/spaces', { name: 'Пространство с запретом', kind: 'project', visibility: 'private', groups: [{ groupId: dept, level: 'view' }] })).space;
    await org.owner.put('/api/v1/grants', { resourceType: 'space', resourceId: sp2.id, subjectType: 'user', subjectId: u.id, level: 'none' });
    const exp = new Date(Date.now() + 5 * 86400_000).toISOString();
    const sp3 = (await org.owner.post('/api/v1/spaces', { name: 'Временное пространство', kind: 'project', visibility: 'private' })).space;
    await org.owner.put('/api/v1/grants', { resourceType: 'space', resourceId: sp3.id, subjectType: 'user', subjectId: u.id, level: 'comment', expiresAt: exp });
    const people = await org.user('Кадровик', { orgRole: 'people_admin' });
    const m = await people.get(`/api/v1/admin/access-matrix?q=${encodeURIComponent('Сотрудник матрицы')}`);
    expect(m.users.map((x: any) => x.id)).toEqual([u.id]);
    expect(m.spaces.some((s: any) => s.kind === 'personal')).toBe(false);
    expect(m.cells[u.id][sp.id]).toMatchObject({ level: 'edit', conflict: false });
    expect(m.cells[u.id][sp.id].source).toContain('Отдел матрицы');
    expect(m.cells[u.id][sp2.id]).toMatchObject({ level: 'none', conflict: true });
    expect(m.cells[u.id][sp3.id]).toMatchObject({ level: 'comment', expiresAt: exp });
    expect(m.spaces.find((s: any) => s.id === sp.id).managers).toContain(OWNER_NAME());
    const plain = await org.user('Обычный сотрудник');
    await expectStatus(plain.get('/api/v1/admin/access-matrix'), 403);
  });

  it('R-ADMIN-018: «Проверить доступ» explains a decision without impersonation (no session is created for the user)', async () => {
    const u = await org.user('Проверяемый сотрудник');
    const p = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Проверка доступа' })).page;
    const before = (await ts.db.query('select count(*)::int c from sessions where user_id = $1', [u.id])).rows[0].c;
    const auditor = await org.user('Аудитор проверки', { orgRole: 'auditor' });
    const r = await auditor.get(`/api/v1/access/explain?userId=${u.id}&pageId=${p.id}`);
    expect(r.level).toBe('view');
    expect(r.actions.view).toBe(true);
    expect(r.actions.edit).toBe(false);
    expect(r.sources[0].via).toBe('space');
    expect((await ts.db.query('select count(*)::int c from sessions where user_id = $1', [u.id])).rows[0].c).toBe(before);
  });
});

const OWNER_NAME = () => org.owner.user.name as string;

// ------------------------------------------------------------------------------------------------------------------
describe('move preview (R-SPACE-007, R-ACL-068) and concurrent move + edit (E2E-106)', () => {
  it('R-SPACE-007 R-ACL-068: preview lists target path, public links and guests losing access; a move that cuts guests off needs confirmation', async () => {
    await org.owner.patch('/api/v1/admin/settings', { publicLinksEnabled: true });
    try {
      const guestSp = (await org.owner.post('/api/v1/spaces', { name: 'Проект с подрядчиком', kind: 'project', visibility: 'private', policy: { allowGuests: true } })).space;
      const closed = (await org.owner.post('/api/v1/spaces', { name: 'Внутренний архив', kind: 'project', visibility: 'private' })).space;
      const parent = (await org.owner.post('/api/v1/pages', { spaceId: closed.id, title: 'Папка архива' })).page;
      const p = (await org.owner.post('/api/v1/pages', { spaceId: guestSp.id, title: 'ТЗ для подрядчика' })).page;
      await org.user('Гость-подрядчик переноса', { kind: 'guest', accessExpiresAt: new Date(Date.now() + 86400_000).toISOString(), pageGrants: [{ pageId: p.id, level: 'view' }] });
      await org.owner.post(`/api/v1/pages/${p.id}/share-links`, { acknowledged: true });
      const prev = await org.owner.post(`/api/v1/pages/${p.id}/move-preview`, { targetSpaceId: closed.id, targetParentId: parent.id });
      expect(prev.impact.toPath).toEqual(['Внутренний архив', 'Папка архива']);
      expect(prev.impact.fromPath).toEqual(['Проект с подрядчиком']);
      expect(prev.impact.publicLinks).toBe(1);
      expect(prev.impact.guests).toEqual([expect.objectContaining({ name: 'Гость-подрядчик переноса', losesAccess: true })]);
      expect(prev.requiresConfirmation).toBe(true);
      const c = await expectStatus(org.owner.post(`/api/v1/pages/${p.id}/move`, { targetSpaceId: closed.id, targetParentId: parent.id }), 409);
      expect(c.error.details.impact.guests.length).toBe(1);
      const moved = await org.owner.post(`/api/v1/pages/${p.id}/move`, { targetSpaceId: closed.id, targetParentId: parent.id, confirmAudienceChange: true });
      expect(moved.page.spaceId).toBe(closed.id);
    } finally {
      await org.owner.patch('/api/v1/admin/settings', { publicLinksEnabled: false });
    }
  });

  it('E2E-106: moving a page while it is being edited re-evaluates rights for the open editor; later edits are not saved', async () => {
    const editors = await group('Редакторы до переноса');
    const u = await org.user('Редактор при переносе', { groupIds: [editors] });
    const a = (await org.owner.post('/api/v1/spaces', { name: 'Рабочее пространство', kind: 'project', visibility: 'private', groups: [{ groupId: editors, level: 'edit' }] })).space;
    const b = (await org.owner.post('/api/v1/spaces', { name: 'Пространство только чтения', kind: 'project', visibility: 'private', groups: [{ groupId: editors, level: 'view' }] })).space;
    const page = (await org.owner.post('/api/v1/pages', { spaceId: a.id, title: 'Редактируется и переносится' })).page;
    const c = await openClient(ts.url, u, page.id);
    expect(c.provider.canEdit).toBe(true);
    c.appendParagraph('правка до переноса');
    // Edit and move concurrently.
    const move = org.owner.post(`/api/v1/pages/${page.id}/move`, { targetSpaceId: b.id, targetParentId: null, confirmAudienceChange: true });
    c.appendParagraph('правка во время переноса');
    await move;
    await waitFor(() => c.provider.canEdit === false, 5000, 'downgraded to read-only after the move');
    expect((await u.get(`/api/v1/pages/${page.id}`)).page.access.level).toBe('view');
    c.appendParagraph('правка после переноса');
    await sleep(500);
    const text = JSON.stringify((await org.owner.get(`/api/v1/pages/${page.id}/content`)).content);
    expect(text).toContain('правка до переноса');
    expect(text).not.toContain('правка после переноса');
    c.close();
  });
});

// ------------------------------------------------------------------------------------------------------------------
describe('SSRF-guarded remote images (R-SECURITY-008, SC-33)', () => {
  it('SC-33 R-SECURITY-008: internal, loopback, link-local, mapped and reserved addresses are classified as blocked', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::a9fe:a9fe', 'not-an-ip'])
      expect(isBlockedAddress(ip), ip).toBe(true);
    for (const ip of ['93.184.216.34', '8.8.8.8', '2a00:1450:4010:c05::8b']) expect(isBlockedAddress(ip), ip).toBe(false);
  });

  it('SC-33 R-SECURITY-008: the fetcher refuses internal targets, unsafe schemes, credentials and redirects into the internal network', async () => {
    const opts = { timeoutMs: 3000, maxBytes: 1_000_000, accept: /^image\// };
    const code = async (url: string, o: Record<string, unknown> = {}) => {
      try {
        await fetchRemote(url, { ...opts, ...o });
        return 'ok';
      } catch (e) {
        return e instanceof RemoteFetchError ? e.code : String(e);
      }
    };
    const hitsBefore = imgHits.length;
    expect(await code(`http://127.0.0.1:${imgPort}/pic.png`)).toBe('blocked_address');
    expect(await code(`http://[::1]:${imgPort}/pic.png`)).toBe('blocked_address');
    expect(await code('http://169.254.169.254/latest/meta-data/')).toBe('blocked_address');
    expect(await code(`http://2130706433:${imgPort}/pic.png`)).toBe('blocked_address'); // decimal form of 127.0.0.1
    expect(await code('file:///etc/passwd')).toBe('bad_url');
    expect(await code('gopher://localhost/x')).toBe('bad_url');
    expect(await code(`http://user:pw@localhost:${imgPort}/pic.png`, { allowHosts: ['localhost'] })).toBe('bad_url');
    expect(imgHits.length).toBe(hitsBefore); // none of these reached the server
    // An allow-listed host works, but a redirect from it into the internal network is refused at the next hop.
    expect(await code(`http://localhost:${imgPort}/pic.png`, { allowHosts: ['localhost'] })).toBe('ok');
    expect(await code(`http://localhost:${imgPort}/redirect-internal`, { allowHosts: ['localhost'] })).toBe('blocked_address');
    expect(await code(`http://localhost:${imgPort}/redirect-metadata`, { allowHosts: ['localhost'] })).toBe('blocked_address');
    expect(await code(`http://localhost:${imgPort}/page.html`, { allowHosts: ['localhost'] })).toBe('bad_type');
    expect(await code(`http://localhost:${imgPort}/pic.png`, { allowHosts: ['localhost'], maxBytes: 10 })).toBe('too_large');
  });

  it('R-SECURITY-008: on import remote images are copied into the knowledge base; internal addresses are removed and reported', async () => {
    const md = `# Импорт с картинками\n\n![логотип](http://localhost:${imgPort}/logo.png)\n\n![внутренний](http://127.0.0.1:${imgPort}/secret.png)\n\n![метаданные](http://169.254.169.254/latest/meta-data/iam)\n`;
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.from(md)]), 'images.md');
    const hitsBefore = imgHits.filter((h) => h.includes('secret')).length;
    const r = await org.owner.req('POST', '/api/v1/imports', fd);
    let j: any;
    for (let i = 0; i < 300; i++) {
      j = await org.owner.get(`/api/v1/imports/${r.jobId}`);
      if (!['queued', 'running'].includes(j.status)) break;
      await sleep(100);
    }
    expect(j.status).toBe('awaiting_confirmation');
    const codes = j.preview.files[0].warnings.map((w: any) => w.code);
    expect(codes.filter((c: string) => c === 'remote-image-blocked').length).toBe(2);
    expect(imgHits.filter((h) => h.includes('secret')).length).toBe(hitsBefore);
    const res = await org.owner.post(`/api/v1/imports/${r.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null } });
    const content = (await org.owner.get(`/api/v1/pages/${res.rootPageId}/content`)).content;
    const json = JSON.stringify(content);
    expect(json).not.toContain('127.0.0.1');
    expect(json).not.toContain('169.254.169.254');
    expect(json).not.toContain(`localhost:${imgPort}`);
    const image = content.content.find((n: any) => n.type === 'image');
    expect(image.attrs.attachmentId).toMatch(/^[0-9a-f-]{36}$/);
    const atts = await org.owner.get(`/api/v1/pages/${res.rootPageId}/attachments`);
    expect(atts.attachments.some((a: any) => a.id === image.attrs.attachmentId)).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------------------------
describe('audit of reads and hidden resources (R-AUDIT-001, OPS-014)', () => {
  it('R-AUDIT-001 OPS-014: opening a document is audited (rate limited) and probing a hidden page is logged as access.not_found', async () => {
    const reader = await org.user('Читатель для аудита');
    const p = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Читаемая страница' })).page;
    const hidden = (await org.owner.post('/api/v1/pages', { spaceId: org.personalSpaceId, title: 'Скрытая страница' })).page;
    for (let i = 0; i < 3; i++) await reader.get(`/api/v1/pages/${p.id}`);
    await expectStatus(reader.get(`/api/v1/pages/${hidden.id}`), 404);
    let views: any[] = [];
    let probes: any[] = [];
    for (let i = 0; i < 50; i++) {
      views = (await org.owner.get(`/api/v1/audit?action=page.view&actorId=${reader.id}`)).events;
      probes = (await org.owner.get(`/api/v1/audit?action=access.not_found&actorId=${reader.id}`)).events;
      if (views.length && probes.length) break;
      await sleep(100);
    }
    expect(views.length).toBe(1);
    expect(views[0]).toMatchObject({ target_id: p.id, outcome: 'success' });
    expect(views[0].ip).toBeTruthy();
    expect(probes.length).toBe(1);
    expect(probes[0]).toMatchObject({ target_id: hidden.id, outcome: 'denied' });
  });
});

// ------------------------------------------------------------------------------------------------------------------
describe('content edits in the tamper-evident audit (OPS-014)', () => {
  it('OPS-014: a logical edit operation is written to the audit log with its author and change counts; the hash chain stays valid', async () => {
    const editor = await org.user('Редактор для аудита правок');
    const p = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Правки под аудитом' })).page;
    await org.owner.put('/api/v1/grants', { resourceType: 'page', resourceId: p.id, subjectType: 'user', subjectId: editor.id, level: 'edit' });
    const c = await openClient(ts.url, editor, p.id);
    c.appendParagraph('Первая правка');
    await c.waitSaved();
    await ts.srv.services.hub.flushPage(p.id);
    let ev: any[] = [];
    for (let i = 0; i < 50 && !ev.length; i++) {
      ev = (await org.owner.get(`/api/v1/audit?action=page.edit&targetId=${p.id}`)).events;
      if (!ev.length) await sleep(100);
    }
    c.close();
    expect(ev.length).toBe(1);
    expect(ev[0].actor_id).toBe(editor.id);
    expect(ev[0].details.added + ev[0].details.changed).toBeGreaterThan(0);
    expect((await org.owner.get('/api/v1/audit/verify')).ok).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------------------------
const SIGNATURE = ['KB', 'TEST', 'MALWARE', 'SIGNATURE', 'acl'].join('-');

/** Minimal clamd (INSTREAM) reporting any stream that contains SIGNATURE. */
async function fakeClamd() {
  const net = await import('node:net');
  const server = net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    let body = Buffer.alloc(0);
    let header = false;
    sock.on('data', (d: Buffer) => {
      buf = Buffer.concat([buf, d]);
      if (!header) {
        const i = buf.indexOf(0);
        if (i < 0) return;
        buf = buf.subarray(i + 1);
        header = true;
      }
      while (buf.length >= 4) {
        const len = buf.readUInt32BE(0);
        if (len === 0) {
          sock.end(body.includes(SIGNATURE) ? 'stream: Kb.Test.Signature FOUND\0' : 'stream: OK\0');
          return;
        }
        if (buf.length < 4 + len) return;
        body = Buffer.concat([body, buf.subarray(4, 4 + len)]);
        buf = buf.subarray(4 + len);
      }
    });
    sock.on('error', () => undefined);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return { server, host: `127.0.0.1:${(server.address() as { port: number }).port}` };
}

describe('malicious inputs (SC-33, R-SECURITY-002, R-SECURITY-007)', () => {
  const upload = (api: Api, pageId: string, name: string, data: Buffer, mime = 'application/octet-stream') => {
    const fd = new FormData();
    fd.append('pageId', pageId);
    fd.append('file', new Blob([data], { type: mime }), name);
    return api.req('POST', '/api/v1/attachments', fd);
  };

  it('SC-33 R-SECURITY-002: XSS in imported HTML/Markdown is neutralised, CSRF without token and path traversal in file names are refused', async () => {
    const html = `<html><head><title>Импорт с атакой</title><script>alert(1)</script></head><body><p onclick="alert(2)">Текст</p><img src="x" onerror="alert(3)"><a href="javascript:alert(4)">ссылка</a><iframe src="https://evil.example"></iframe><svg><script>alert(5)</script></svg><a href="data:text/html,<script>alert(6)</script>">data</a></body></html>`;
    const md = `# MD атака\n\n[клик](javascript:alert(7))\n\n<img src=x onerror=alert(8)>\n\n<script>alert(9)</script>\n`;
    const fd = new FormData();
    fd.append('file', new Blob([Buffer.from(html)]), 'attack.html');
    fd.append('file', new Blob([Buffer.from(md)]), 'attack.md');
    const r = await org.owner.req('POST', '/api/v1/imports', fd);
    for (let i = 0; i < 300; i++) {
      const j = await org.owner.get(`/api/v1/imports/${r.jobId}`);
      if (!['queued', 'running'].includes(j.status)) break;
      await sleep(100);
    }
    const res = await org.owner.post(`/api/v1/imports/${r.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null } });
    for (const p of res.pages) {
      const json = JSON.stringify((await org.owner.get(`/api/v1/pages/${p.id}/content`)).content);
      for (const bad of ['<script', 'onerror', 'onclick', 'javascript:', 'alert(', 'iframe', 'data:text/html']) expect(json, `${p.title}: ${bad}`).not.toContain(bad);
    }
    // CSRF: a cookie-authenticated mutation without the token is refused.
    const csrfLess = await fetch(ts.url + '/api/v1/pages', { method: 'POST', headers: { cookie: org.owner.cookieHeader(), 'content-type': 'application/json' }, body: JSON.stringify({ spaceId: org.generalSpaceId, title: 'CSRF' }) });
    expect(csrfLess.status).toBe(403);
    // Path traversal in a file name never reaches the storage path or the download name.
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Обход пути' })).page;
    const a = (await upload(org.owner, page.id, '../../../etc/passwd.txt', Buffer.from('root:x:0:0'), 'text/plain')).attachments[0];
    expect(a.filename).not.toContain('/');
    expect(a.filename).not.toContain('..');
    // User-supplied HTML is never rendered in the application origin.
    const h = (await upload(org.owner, page.id, 'page.html', Buffer.from('<script>alert(1)</script>'), 'text/html')).attachments[0];
    const served = await org.owner.raw('GET', h.contentUrl);
    expect(served.headers.get('content-security-policy')).toContain('sandbox');
    expect(served.headers.get('content-disposition')).toMatch(/^attachment/);
  });

  it('R-SECURITY-007: malicious fixtures are rejected — infected attachment and import (antivirus), disguised executables; originals of clean files are kept byte-exact', async () => {
    const clamd = await fakeClamd();
    const cfg = ts.srv.services.cfg;
    const saved = cfg.clamavHost;
    cfg.clamavHost = clamd.host;
    try {
      const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Вредоносные вложения' })).page;
      const blobs = (await ts.db.query('select count(*)::int c from blobs')).rows[0].c;
      await expectStatus(upload(org.owner, page.id, 'invoice.txt', Buffer.from(`счёт ${SIGNATURE}`), 'text/plain'), 422);
      const fd = new FormData();
      fd.append('file', new Blob([Buffer.from(`# Заметка\n\n${SIGNATURE}\n`)]), 'заражённый.md');
      const imp = await org.owner.raw('POST', '/api/v1/imports', fd);
      expect(imp.status).toBe(422);
      expect((await ts.db.query('select count(*)::int c from blobs')).rows[0].c).toBe(blobs);
      await expectStatus(upload(org.owner, page.id, 'report.pdf', Buffer.from('MZ\x90\x00 disguised executable')), 422);
      await expectStatus(upload(org.owner, page.id, 'photo.jpg', Buffer.from('\x7fELF\x02\x01\x01 elf binary')), 422);
      const clean = Buffer.from('чистый файл ' + 'x'.repeat(100));
      const ok = (await upload(org.owner, page.id, 'clean.txt', clean, 'text/plain')).attachments[0];
      const back = Buffer.from(await (await org.owner.raw('GET', ok.downloadUrl)).arrayBuffer());
      expect(back.equals(clean)).toBe(true);
      const rejected = (await ts.db.query(`select count(*)::int c from audit_events where action in ('attachment.rejected', 'import.rejected') and outcome = 'denied'`)).rows[0].c;
      expect(rejected).toBeGreaterThanOrEqual(2);
    } finally {
      cfg.clamavHost = saved;
      clamd.server.close();
    }
  });
});
