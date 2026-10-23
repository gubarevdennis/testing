import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, setupOrg, expectStatus, type TestServer, type Api } from '../support/harness.js';

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer({}, { worker: true });
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => ts?.close());

async function startImport(api: Api, name: string, csv: string) {
  const fd = new FormData();
  fd.append('file', new Blob([Buffer.from(csv, 'utf8')]), name);
  const r = await api.req('POST', '/api/v1/imports', fd);
  for (let i = 0; i < 300; i++) {
    const j = await api.get(`/api/v1/imports/${r.jobId}`);
    if (!['queued', 'running'].includes(j.status)) return { ...j, jobId: r.jobId };
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error('import analysis timeout');
}
const target = () => ({ spaceId: org.generalSpaceId, parentId: null });
async function rows(collectionId: string) {
  const r = await org.owner.post(`/api/v1/collections/${collectionId}/query`, { sorts: [{ fieldId: 'title', dir: 'asc' }] });
  return r.rows as Array<{ id: string; title: string; values: Record<string, unknown> }>;
}

describe('collection import modes (R-COLLECTION-003)', () => {
  it('new table, append rows, update by key and replace — each with a dry run; replace needs confirmation and moves missing rows to the trash; repeated imports never create hidden duplicates', async () => {
    const csv1 = 'Код;Название;Остаток\nA1;Болт;10\nA2;Гайка;20\nA3;Шайба;30\n';
    // 1) new table
    const j1 = await startImport(org.owner, 'склад.csv', csv1);
    const created = await org.owner.post(`/api/v1/imports/${j1.jobId}/commit`, { target: target(), tabular: { as: 'collection', keyColumn: 0, title: 'Склад' } });
    const collId = (await ts.db.query('select id from collections where page_id = $1', [created.rootPageId])).rows[0].id;
    expect((await rows(collId)).map((r) => r.title)).toEqual(['A1', 'A2', 'A3']);

    // 2) append: adds every row (a deliberate choice, shown by the dry run)
    const j2 = await startImport(org.owner, 'приход.csv', 'Код;Название;Остаток\nA4;Винт;5\n');
    expect(await org.owner.post(`/api/v1/imports/${j2.jobId}/dry-run`, { as: 'collection', collectionId: collId, collectionMode: 'append', keyColumn: 0 })).toMatchObject({ rows: 1, inserts: 1, updates: 0, removes: 0 });
    await org.owner.post(`/api/v1/imports/${j2.jobId}/commit`, { target: target(), tabular: { as: 'collection', collectionId: collId, collectionMode: 'append', keyColumn: 0 } });
    expect((await rows(collId)).map((r) => r.title)).toEqual(['A1', 'A2', 'A3', 'A4']);

    // 3) update by key: a key repeated in the file updates ONE row (last value wins), no hidden duplicate
    const j3 = await startImport(org.owner, 'инвентаризация.csv', 'Код;Название;Остаток\nA1;Болт;11\nA5;Дюбель;7\nA5;Дюбель;8\n');
    const d3 = await org.owner.post(`/api/v1/imports/${j3.jobId}/dry-run`, { as: 'collection', collectionId: collId, collectionMode: 'upsert', keyColumn: 0 });
    expect(d3).toMatchObject({ rows: 3, updates: 1, inserts: 1, duplicatesInFile: 1, removes: 0 });
    await org.owner.post(`/api/v1/imports/${j3.jobId}/commit`, { target: target(), tabular: { as: 'collection', collectionId: collId, collectionMode: 'upsert', keyColumn: 0 } });
    let all = await rows(collId);
    expect(all.map((r) => r.title)).toEqual(['A1', 'A2', 'A3', 'A4', 'A5']);
    const stockField = (await ts.db.query('select schema from collections where id = $1', [collId])).rows[0].schema.find((f: any) => f.name === 'Остаток').id;
    expect(all.find((r) => r.title === 'A1')!.values[stockField]).toBe(11);
    expect(all.find((r) => r.title === 'A5')!.values[stockField]).toBe(8);

    // 4) replace: the dry run lists what will be removed; without confirmation nothing happens
    const csv4 = 'Код;Название;Остаток\nA1;Болт;12\nA2;Гайка;21\nA6;Анкер;3\n';
    const j4 = await startImport(org.owner, 'склад-полный.csv', csv4);
    const d4 = await org.owner.post(`/api/v1/imports/${j4.jobId}/dry-run`, { as: 'collection', collectionId: collId, collectionMode: 'replace', keyColumn: 0 });
    expect(d4).toMatchObject({ rows: 3, updates: 2, inserts: 1, removes: 3 });
    expect(d4.removeSample.sort()).toEqual(['A3', 'A4', 'A5']);
    const refused = await expectStatus(org.owner.post(`/api/v1/imports/${j4.jobId}/commit`, { target: target(), tabular: { as: 'collection', collectionId: collId, collectionMode: 'replace', keyColumn: 0 } }), 422);
    expect(JSON.stringify(refused)).toContain('replace_not_confirmed');
    expect((await rows(collId)).length).toBe(5);
    const done = await org.owner.post(`/api/v1/imports/${j4.jobId}/commit`, { target: target(), tabular: { as: 'collection', collectionId: collId, collectionMode: 'replace', keyColumn: 0, confirmReplace: true } });
    expect(done).toMatchObject({ inserted: 1, updated: 2, removed: 3 });
    all = await rows(collId);
    expect(all.map((r) => r.title)).toEqual(['A1', 'A2', 'A6']);
    // removed rows are in the trash, restorable
    const trashed = (await ts.db.query(`select title from pages where collection_id = $1 and deleted_at is not null order by title`, [collId])).rows.map((r) => r.title);
    expect(trashed).toEqual(['A3', 'A4', 'A5']);

    // 5) the same replace again: nothing new, nothing removed, no duplicates
    const j5 = await startImport(org.owner, 'склад-полный.csv', csv4);
    expect(await org.owner.post(`/api/v1/imports/${j5.jobId}/dry-run`, { as: 'collection', collectionId: collId, collectionMode: 'replace', keyColumn: 0 })).toMatchObject({ updates: 3, inserts: 0, removes: 0 });
    await org.owner.post(`/api/v1/imports/${j5.jobId}/commit`, { target: target(), tabular: { as: 'collection', collectionId: collId, collectionMode: 'replace', keyColumn: 0, confirmReplace: true } });
    expect((await rows(collId)).map((r) => r.title)).toEqual(['A1', 'A2', 'A6']);
  });
});
