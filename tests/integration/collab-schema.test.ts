import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { CONTENT_SCHEMA_VERSION, SCHEMA_MIGRATIONS, type PMNode, type SchemaMigration } from '@kb/shared';
import { startServer, setupOrg, type TestServer } from '../support/harness.js';
import { openClient, waitFor } from '../support/collab.js';
import { overrideSchemaRegistry } from '../../apps/server/src/collab/schema-registry.js';
import { replaceContent, ydocToJson, jsonToUpdate } from '../../apps/server/src/collab/ydoc.js';

/**
 * Conflicts around a change of the document schema (R-COLLAB-009, R-COLLAB-037). A future release is simulated with
 * a migration from the shipped schema (BASE = CONTENT_SCHEMA_VERSION) to BASE + 1 appended to the real registry, which (a) lowers level-1 headings to level 2 (attribute change in place) and (b) turns
 * paragraphs starting with "!! " into a warning callout (structural change: the paragraph is replaced).
 */
const BASE = CONTENT_SCHEMA_VERSION;
const NEXT = BASE + 1;
const future = (...extra: SchemaMigration[]) => ({ version: NEXT + extra.length, migrations: [...SCHEMA_MIGRATIONS, toV2, ...extra] });
const toV2: SchemaMigration = {
  from: BASE,
  to: NEXT,
  description: 'H1 → H2; «!! текст» → предупреждение',
  migrate: (d) => ({
    ...d,
    content: (d.content ?? []).map((n): PMNode => {
      if (n.type === 'heading' && n.attrs?.level === 1) return { ...n, attrs: { ...n.attrs, level: 2 } };
      const text = n.type === 'paragraph' ? (n.content ?? []).map((t) => t.text ?? '').join('') : '';
      if (text.startsWith('!! ')) {
        const inner = structuredClone(n);
        inner.content = inner.content!.map((t, i) => (i === 0 ? { ...t, text: (t.text ?? '').slice(3) } : t));
        return { type: 'callout', attrs: { id: 'c-' + n.attrs?.id, variant: 'warning' }, content: [inner] };
      }
      return n;
    }),
  }),
};
const identity = (from: number): SchemaMigration => ({ from, to: from + 1, description: `формат ${from + 1}`, migrate: (d) => d });

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;
let restoreRegistry: (() => void) | null = null;

beforeAll(async () => {
  ts = await startServer();
  org = await setupOrg(ts);
}, 120_000);
afterEach(() => {
  restoreRegistry?.();
  restoreRegistry = null;
});
afterAll(async () => ts?.close());

const text = (n: PMNode): string => (n.text ?? '') + (n.content ?? []).map(text).join('');

async function seedPage(title: string) {
  const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title })).page;
  await ts.srv.services.hub.applyServerChange(page.id, null, (doc) =>
    replaceContent(doc, {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { id: 'h', level: 1 }, content: [{ type: 'text', text: 'Порядок работ' }] },
        { type: 'paragraph', attrs: { id: 'w' }, content: [{ type: 'text', text: '!! Отключите питание' }] },
        { type: 'paragraph', attrs: { id: 'p' }, content: [{ type: 'text', text: 'Обычный шаг' }] },
      ],
    }),
  );
  await ts.srv.services.hub.flushPage(page.id);
  return page.id as string;
}
const content = async (id: string) => (await org.owner.get(`/api/v1/pages/${id}/content`)).content as PMNode;

describe('document schema change vs concurrent editing (R-COLLAB-009, R-COLLAB-037)', () => {
  it('migration on open keeps a pre-migration version; up-to-date editors merge; an offline editor of the old format gets an explicit conflict and loses nothing', async () => {
    const id = await seedPage('Миграция формата');
    // An editor of the current release (format 1) goes offline with an edit inside the paragraph that the
    // migration will restructure.
    const old = await openClient(ts.url, org.owner, id);
    await old.waitFor(() => old.text().includes('Обычный шаг'));
    old.provider.disconnect();
    old.insert(1, '!! Отключите питание'.length, ' и заземлите');
    old.provider.flush();
    expect(old.text()).toContain('!! Отключите питание и заземлите');

    // Another editor of format 1 is online while the migration happens.
    const online = await openClient(ts.url, org.owner, id);
    await online.waitFor(() => online.text().includes('Обычный шаг'));

    // The server is updated to format 2. The first editor of the new release opens the page: it is migrated first.
    restoreRegistry = overrideSchemaRegistry(future());
    const fresh = await openClient(ts.url, org.owner, id, { providerOptions: { schemaVersion: NEXT } });
    // the online old-format editor was disconnected before the migration reached it: its replica is untouched
    await waitFor(() => online.fatal.includes('schema_outdated'), 5000, 'online editor told');
    expect(online.text()).toContain('!! Отключите питание');
    online.close();
    const migrated = await content(id);
    expect(migrated.content!.map((n) => n.type)).toEqual(['heading', 'callout', 'paragraph']);
    expect(migrated.content![0].attrs!.level).toBe(2);
    expect(text(migrated.content![1])).toBe('Отключите питание');
    expect(Number((await ts.db.query('select content_schema_version v from pages where id = $1', [id])).rows[0].v)).toBe(NEXT);
    const revs = (await org.owner.get(`/api/v1/pages/${id}/revisions?limit=50`)).revisions;
    const migRev = revs.find((r: any) => r.kind === 'migration');
    const preRev = revs.find((r: any) => r.kind === 'pre-restore');
    expect(migRev).toMatchObject({ label: `Миграция формата документа ${BASE} → ${NEXT}` });
    expect(preRev).toMatchObject({ label: `Перед миграцией формата документа ${BASE} → ${NEXT}` });
    expect(preRev.number).toBeLessThan(migRev.number);
    const ev = (await org.owner.get(`/api/v1/pages/${id}/events?limit=20`)).events.find((e: any) => e.type === 'schema-migrated');
    expect(ev.data).toMatchObject({ from: BASE, to: NEXT, applied: [toV2.description] });
    // a second open does not migrate again
    expect(await ts.srv.services.hub.migrateSchema(id, null)).toBeNull();

    // The up-to-date editor keeps working; its edits merge normally.
    fresh.insert(2, 'Обычный шаг'.length, ' — уточнён');
    await fresh.waitSaved();

    // The old editor comes back: its operations are refused with an explicit, non-silent conflict.
    old.provider.reconnectNow();
    await waitFor(() => old.fatal.includes('schema_outdated'), 10_000, 'schema_outdated');
    expect(old.provider.status).toBe('error');
    const now = await content(id);
    expect(JSON.stringify(now)).not.toContain('заземлите'); // old-format edit not merged into the new format
    expect(JSON.stringify(now)).not.toContain('!! ');
    expect(JSON.stringify(now)).toContain('Обычный шаг — уточнён');
    expect(old.provider.pendingCount()).toBeGreaterThan(0); // still on the device
    expect(old.text()).toContain('и заземлите');

    // «Keep both»: the old-format local version is migrated by the server and saved as a separate page.
    const copy = await org.owner.post(`/api/v1/pages/${id}/conflict-copy`, { content: ydocToJson(old.doc), schemaVersion: BASE, markdown: old.text() });
    expect(copy.source).toBe('json');
    const copyDoc = await content(copy.page.id);
    expect(copyDoc.content!.map((n) => n.type)).toEqual(['heading', 'callout', 'paragraph']);
    expect(text(copyDoc.content![1])).toBe('Отключите питание и заземлите');
    expect(copyDoc.content![0].attrs!.level).toBe(2);

    // Restoring the pre-migration version brings the old content back in the NEW format.
    await org.owner.post(`/api/v1/pages/${id}/revisions/${preRev.id}/restore`, {});
    const restored = await content(id);
    expect(restored.content!.map((n) => n.type)).toEqual(['heading', 'callout', 'paragraph']);
    expect(restored.content![0].attrs!.level).toBe(2);
    expect(JSON.stringify(restored)).not.toContain('!! ');
    // ...and the journal restore of a moment before the migration as well
    const seq = Number(ev.data.seq) - 1;
    await org.owner.post(`/api/v1/pages/${id}/journal/${seq}/restore`, {});
    expect(JSON.stringify(await content(id))).not.toContain('!! ');
    old.close();
    fresh.close();
  });

  it('rolling update: an editor newer than the server keeps its operations and they are delivered once the server is updated; a broken migration chain leaves the page read-only and unchanged', async () => {
    const id = await seedPage('Новее сервера');
    const ahead = await openClient(ts.url, org.owner, id, { providerOptions: { schemaVersion: NEXT, schemaRetryMs: 300 } });
    ahead.insert(2, 0, 'Новый клиент: ');
    ahead.provider.flush();
    await waitFor(() => !!ahead.provider.pendingCount() && ahead.provider.status === 'error', 5000, 'schema_newer reported');
    expect(ahead.fatal).toEqual([]); // not fatal: nothing to resolve, only to wait
    expect(JSON.stringify(await content(id))).not.toContain('Новый клиент');

    // The server is updated (format 2) and the document migrated: the pending operation goes through.
    restoreRegistry = overrideSchemaRegistry(future());
    await ts.srv.services.hub.migrateSchema(id, null);
    await ahead.waitSaved(10_000);
    const c = await content(id);
    expect(JSON.stringify(c)).toContain('Новый клиент: Обычный шаг');
    expect(c.content![1].type).toBe('callout');
    ahead.close();

    // A release whose migration chain has a gap: the page is not touched and opens read-only.
    restoreRegistry();
    restoreRegistry = overrideSchemaRegistry({ version: NEXT + 2, migrations: [...SCHEMA_MIGRATIONS, toV2, identity(NEXT + 1)] });
    const before = JSON.stringify(await content(id));
    const ro = await openClient(ts.url, org.owner, id, { providerOptions: { schemaVersion: NEXT + 2 } });
    expect(ro.provider.canEdit).toBe(false);
    expect(JSON.stringify(await content(id))).toBe(before);
    expect(Number((await ts.db.query('select content_schema_version v from pages where id = $1', [id])).rows[0].v)).toBe(NEXT);
    ro.close();
  });
  it('real migration 1 → 2 (D-36): a page stored in format 1 with the legacy «Сноски» section opens with real footnotes; an editor of format 1 keeps its offline edit and gets an explicit conflict; «keep both» migrates its copy', async () => {
    expect(CONTENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(2);
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Старый формат со сносками' })).page;
    const id = page.id as string;
    const sup = (t: string): PMNode => ({ type: 'text', text: t, marks: [{ type: 'superscript' }] });
    const legacy: PMNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { id: 'a' }, content: [{ type: 'text', text: 'Норма освещённости' }, sup('[1]'), { type: 'text', text: ' и шум' }, sup('[2]')] },
        { type: 'paragraph', attrs: { id: 'b' }, content: [{ type: 'text', text: 'Второй абзац' }] },
        { type: 'heading', attrs: { id: 'h', level: 3 }, content: [{ type: 'text', text: 'Сноски' }] },
        {
          type: 'orderedList',
          attrs: { id: 'l', start: 1 },
          content: [
            { type: 'listItem', attrs: { id: 'i1' }, content: [{ type: 'paragraph', attrs: { id: 'n1' }, content: [{ type: 'text', text: 'СП 52.13330.2016', marks: [{ type: 'italic' }] }] }] },
            { type: 'listItem', attrs: { id: 'i2' }, content: [{ type: 'paragraph', attrs: { id: 'n2' }, content: [{ type: 'text', text: 'СН 2.2.4/2.1.8.562' }] }] },
          ],
        },
      ],
    };
    // the page is stored exactly as the previous release stored it: format 1 (written before the hub ever loads it)
    const update = Buffer.from(jsonToUpdate(legacy, 'Старый формат со сносками'));
    await ts.db.query('update doc_updates set update = $2 where page_id = $1 and seq = 1', [id, update]);
    await ts.db.query('update doc_state set snapshot = $2, content = $3 where page_id = $1', [id, update, legacy]);
    await ts.db.query('update page_revisions set state = $2, content = $3, content_schema_version = 1 where page_id = $1', [id, update, legacy]);
    await ts.db.query('update pages set content_schema_version = 1 where id = $1', [id]);

    // An editor of the previous release (format 1) — still allowed while the document is in format 1 — goes offline with an edit.
    const old = await openClient(ts.url, org.owner, id, { providerOptions: { schemaVersion: 1 } });
    // the server is already format 2: opening migrates first, and the format-1 editor is refused right away
    await waitFor(() => old.fatal.includes('schema_outdated') || old.provider.synced, 5000, 'old client answered');
    expect(old.fatal).toContain('schema_outdated');
    const migrated = await content(id);
    expect(Number((await ts.db.query('select content_schema_version v from pages where id = $1', [id])).rows[0].v)).toBe(CONTENT_SCHEMA_VERSION);
    const types = migrated.content!.map((n) => n.type);
    expect(types).toEqual(['paragraph', 'paragraph']); // «Сноски» section gone
    const notes = migrated.content![0].content!.filter((n) => n.type === 'footnote');
    expect(notes.map((n) => text(n))).toEqual(['СП 52.13330.2016', 'СН 2.2.4/2.1.8.562']);
    expect(notes[0].content![0].marks!.map((m) => m.type)).toEqual(['italic']);
    const revs = (await org.owner.get(`/api/v1/pages/${id}/revisions?limit=50`)).revisions;
    const pre = revs.find((r: any) => r.kind === 'pre-restore');
    expect(pre).toMatchObject({ label: 'Перед миграцией формата документа 1 → 2' });
    // the version before the migration keeps the legacy representation; restoring it brings it back migrated
    await org.owner.post(`/api/v1/pages/${id}/revisions/${pre.id}/restore`, {});
    const restored = await content(id);
    expect(restored.content!.map((n) => n.type)).toEqual(['paragraph', 'paragraph']);
    expect(restored.content![0].content!.filter((n) => n.type === 'footnote')).toHaveLength(2);

    // the format-1 editor's own local copy is kept and «keep both» stores it migrated
    const local = structuredClone(legacy);
    local.content![1].content![0].text = 'Второй абзац — правка офлайн';
    const copy = await org.owner.post(`/api/v1/pages/${id}/conflict-copy`, { content: local, schemaVersion: 1, markdown: 'x' });
    expect(copy.source).toBe('json');
    const copyDoc = await content(copy.page.id);
    expect(copyDoc.content!.map((n) => n.type)).toEqual(['paragraph', 'paragraph']);
    expect(text(copyDoc.content![1])).toBe('Второй абзац — правка офлайн');
    expect(copyDoc.content![0].content!.filter((n) => n.type === 'footnote')).toHaveLength(2);
    old.close();
  });
});
