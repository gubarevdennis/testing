import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, setupOrg, expectStatus, type TestServer } from '../support/harness.js';

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer();
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => ts?.close());

describe('conflict copies (E-04, R-COLLAB-045, R-COLLAB-049)', () => {
  it('an editor stores the lost version of a block; it is listed and can be marked restored; readers cannot write', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.personalSpaceId, title: 'Конфликты' })).page;
    const block = { type: 'paragraph', attrs: { id: 'b1' }, content: [{ type: 'text', text: 'моя версия' }] };
    const r = await org.owner.post(`/api/v1/pages/${page.id}/conflicts`, { blockId: 'b1', block, reason: 'deleted', afterBlockId: null });
    expect(r.id).toBeTruthy();
    await expectStatus(org.owner.post(`/api/v1/pages/${page.id}/conflicts`, { blockId: 'x', block: { type: 'nope' }, reason: 'deleted' }), 400);
    const list = await org.owner.get(`/api/v1/pages/${page.id}/conflicts`);
    expect(list.conflicts[0]).toMatchObject({ blockId: 'b1', reason: 'deleted', resolution: null });
    expect(list.conflicts[0].block.content[0].text).toBe('моя версия');
    await org.owner.post(`/api/v1/pages/${page.id}/conflicts/${r.id}/resolve`, { resolution: 'restored' });
    expect((await org.owner.get(`/api/v1/pages/${page.id}/conflicts`)).conflicts[0].resolution).toBe('restored');
    const reader = await org.user('Читатель Конфликтов', { pageGrants: [{ pageId: page.id, level: 'view' }] });
    await expectStatus(reader.post(`/api/v1/pages/${page.id}/conflicts`, { blockId: 'b1', block, reason: 'deleted' }), 403);
    const outsider = await org.user('Посторонний');
    await expectStatus(outsider.get(`/api/v1/pages/${page.id}/conflicts`), 404);
  });
});
