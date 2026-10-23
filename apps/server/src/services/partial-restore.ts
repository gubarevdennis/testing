/**
 * Page- and space-level restore from a backup (R-BACKUP-015).
 *
 * The backup is first restored into a SEPARATE database (scripts/backup/restore.sh --create --target-db …, or a
 * PITR instance). This module compares the chosen pages of that source database with the live installation
 * (impact preview) and, on apply, brings them back WITHOUT overwriting anything:
 *  - a page that still exists (also in the trash) gets the backup state as a new version in its history
 *    (kind "restore"); the user reviews the diff in the history panel and restores that version if wanted;
 *  - a page that no longer exists (purged) is recreated with a new id under a container page
 *    «Восстановлено из резервной копии …» in its space (or under its original parent, when that still exists),
 *    together with its attachments (reattached in the live store, or copied from the restored object directory).
 * Everything is applied in one transaction and audited.
 */
import type pg from 'pg';
import * as Y from 'yjs';
import { randomUUID } from 'node:crypto';
import { walk, keyBetween, docToPlainText, migrateContent, CONTENT_SCHEMA_VERSION, type PMNode } from '@kb/shared';
import type { Tx } from '../db/pool.js';
import { jsonToUpdate, updateToJson, ydocToJson, titleOf } from '../collab/ydoc.js';
import { createRevision, diffDocs } from './revisions.js';
import { insertAncestors } from './pages.js';
import { audit } from './audit.js';
import { blobKey, type BlobStore } from '../storage/blob-store.js';

export interface PartialRestoreScope {
  pageIds?: string[];
  spaceId?: string;
  /** With pageIds: include the whole subtree of each page (as it was in the backup). */
  includeChildren?: boolean;
}

export type PageRestoreStatus = 'unchanged' | 'changed' | 'deleted-in-live' | 'missing-in-live';

export interface PageRestorePlan {
  pageId: string;
  title: string;
  liveTitle: string | null;
  status: PageRestoreStatus;
  diff: { added: number; removed: number; changed: number; moved: number } | null;
  attachments: { total: number; missingInLive: number };
}

export interface PartialRestorePreview {
  source: { schema: string | null; backupTime: string | null };
  pages: PageRestorePlan[];
  summary: Record<PageRestoreStatus, number>;
}

/** Document of a page in the SOURCE database: snapshot + journal (unflushed acknowledged edits included). */
async function sourceDoc(src: pg.Pool | pg.PoolClient, pageId: string): Promise<{ json: PMNode; title: string } | null> {
  const st = (await src.query('select d.snapshot, d.snapshot_seq, d.content, p.content_schema_version from doc_state d left join pages p on p.id = d.page_id where d.page_id = $1', [pageId])).rows[0];
  if (!st) return null;
  const doc = new Y.Doc({ gc: true });
  if (st.snapshot) Y.applyUpdate(doc, st.snapshot);
  const ups = (await src.query('select update from doc_updates where page_id = $1 and seq > $2 order by seq', [pageId, st.snapshot_seq])).rows;
  for (const u of ups) Y.applyUpdate(doc, u.update);
  const raw = st.snapshot || ups.length ? ydocToJson(doc) : (st.content as PMNode);
  // a backup of an older release holds content of an older schema: brought up to the current one (D-28)
  const json = migrateContent(raw, Math.min(Number(st.content_schema_version ?? 1), CONTENT_SCHEMA_VERSION)).doc;
  return { json, title: titleOf(doc) };
}

async function scopePages(src: pg.Pool | pg.PoolClient, scope: PartialRestoreScope): Promise<any[]> {
  // Tree order (parents first): by the number of ancestors.
  if (scope.spaceId)
    return (await src.query(`select p.*, (select count(*) from page_ancestors a where a.page_id = p.id) as depth from pages p where p.space_id = $1 and p.deleted_at is null order by depth, p.created_at`, [scope.spaceId])).rows;
  const ids = scope.pageIds ?? [];
  if (!ids.length) return [];
  if (scope.includeChildren)
    return (await src.query(`select p.* from page_ancestors a join pages p on p.id = a.page_id where a.ancestor_id = any($1::uuid[]) and p.deleted_at is null order by a.depth, p.created_at`, [ids])).rows;
  return (await src.query('select * from pages where id = any($1::uuid[])', [ids])).rows;
}

const attachmentIds = (doc: PMNode) => {
  const out = new Set<string>();
  walk(doc, (n) => {
    if (typeof n.attrs?.attachmentId === 'string' && /^[0-9a-f-]{36}$/.test(n.attrs.attachmentId)) out.add(n.attrs.attachmentId);
  });
  return [...out];
};

export async function previewPartialRestore(live: pg.Pool, src: pg.Pool, scope: PartialRestoreScope): Promise<PartialRestorePreview> {
  const rows = await scopePages(src, scope);
  const pages: PageRestorePlan[] = [];
  for (const p of rows) {
    const doc = await sourceDoc(src, p.id);
    if (!doc) continue;
    const l = (await live.query('select p.title, p.deleted_at, d.content from pages p left join doc_state d on d.page_id = p.id where p.id = $1', [p.id])).rows[0];
    const att = attachmentIds(doc.json);
    const liveAtt = att.length ? (await live.query('select id from attachments where id = any($1::uuid[]) and deleted_at is null and page_id is not null', [att])).rows.length : 0;
    let status: PageRestoreStatus;
    let diff: PageRestorePlan['diff'] = null;
    if (!l) status = 'missing-in-live';
    else {
      // The live side is compared with what readers see now (journal included), like the source side.
      const cur = (await sourceDoc(live, p.id))?.json ?? l.content;
      const d = diffDocs(cur, doc.json);
      const count = (s: string) => d.blocks.filter((b) => b.status === s).length;
      diff = { added: count('added'), removed: count('removed'), changed: count('changed'), moved: count('moved') };
      const same = !diff.added && !diff.removed && !diff.changed && !diff.moved && l.title === p.title;
      status = l.deleted_at ? 'deleted-in-live' : same ? 'unchanged' : 'changed';
    }
    pages.push({ pageId: p.id, title: p.title, liveTitle: l?.title ?? null, status, diff, attachments: { total: att.length, missingInLive: att.length - liveAtt } });
  }
  const summary = { unchanged: 0, changed: 0, 'deleted-in-live': 0, 'missing-in-live': 0 } as Record<PageRestoreStatus, number>;
  for (const p of pages) summary[p.status]++;
  const schema = (await src.query('select max(version) v from schema_migrations').catch(() => ({ rows: [{ v: null }] }))).rows[0].v ?? null;
  const backupTime = (await src.query(`select max(created_at) t from audit_events`).catch(() => ({ rows: [{ t: null }] }))).rows[0].t;
  return { source: { schema, backupTime: backupTime ? new Date(backupTime).toISOString() : null }, pages, summary };
}

export interface ApplyOptions {
  /** Live user on whose behalf the restore runs (versions/audit are attributed to them). */
  userId: string;
  label: string;
  /** Object store of the restored backup (restore.sh --target-storage) for attachments missing in the live store. */
  sourceStore?: BlobStore | null;
  liveStore: BlobStore;
}

export async function applyPartialRestore(live: pg.Pool, src: pg.Pool, scope: PartialRestoreScope, opts: ApplyOptions, q: Tx) {
  const preview = await previewPartialRestore(live, src, scope);
  const user = (await q.query('select id, org_id, name from users where id = $1', [opts.userId])).rows[0];
  if (!user) throw new Error('user not found in the live database');
  const versions: Array<{ pageId: string; revision: number }> = [];
  const recreated: Array<{ sourceId: string; pageId: string; parentId: string | null }> = [];
  const attachments = { reattached: 0, copied: 0, missing: [] as string[] };
  const containers = new Map<string, string>(); // space id -> container page id
  const created = new Map<string, string>(); // source page id -> new page id

  const insertPage = async (p: { id: string; spaceId: string; parentId: string | null; title: string; icon: string | null; properties: any; status: string }, content: PMNode) => {
    const last = (await q.query(`select sort_key from pages where space_id = $1 and parent_id is not distinct from $2 order by sort_key collate "C" desc limit 1`, [p.spaceId, p.parentId])).rows[0]?.sort_key ?? null;
    await q.query(
      `insert into pages (id, org_id, space_id, parent_id, sort_key, title, icon, status, properties, owner_id, created_by, updated_by, content_schema_version) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $10, $11)`,
      [p.id, user.org_id, p.spaceId, p.parentId, keyBetween(last, null), p.title, p.icon, p.status, p.properties ?? {}, user.id, CONTENT_SCHEMA_VERSION],
    );
    await insertAncestors(q, p.id, p.parentId);
    const update = jsonToUpdate(content, p.title);
    const normalized = updateToJson(update);
    await q.query(`insert into doc_updates (page_id, seq, update, user_id, op_id) values ($1, 1, $2, $3, $4)`, [p.id, Buffer.from(update), user.id, 'backup-restore:' + p.id]);
    await q.query(`insert into doc_state (page_id, snapshot, snapshot_seq, last_seq, content, plain_text) values ($1, $2, 1, 1, $3, $4)`, [p.id, Buffer.from(update), normalized, docToPlainText(normalized)]);
    await createRevision(q, { pageId: p.id, kind: 'restore', label: opts.label, title: p.title, state: update, content: normalized, seqUpto: 1, authors: [user.id], createdBy: user.id });
    await q.query(`insert into outbox (topic, payload) values ('index-page', $1)`, [{ pageId: p.id }]);
  };

  const ensureAttachments = async (doc: PMNode, livePageId: string) => {
    for (const aid of attachmentIds(doc)) {
      const la = (await q.query('select id, page_id, deleted_at from attachments where id = $1', [aid])).rows[0];
      if (la && !la.deleted_at && la.page_id) continue;
      const versionsSrc = (await src.query('select * from attachment_versions where attachment_id = $1 order by version', [aid])).rows;
      const a = (await src.query('select * from attachments where id = $1', [aid])).rows[0];
      if (!a || !versionsSrc.length) {
        attachments.missing.push(aid);
        continue;
      }
      // Bytes: in the live store already (content addressed), or copied from the restored object directory.
      for (const v of versionsSrc) {
        if (await opts.liveStore.exists(blobKey(v.blob_sha256))) {
          await q.query(`insert into blobs (sha256, size, mime, storage_key) values ($1, $2, $3, $4) on conflict do nothing`, [v.blob_sha256, v.size, v.mime, blobKey(v.blob_sha256)]);
          continue;
        }
        if (!opts.sourceStore) {
          attachments.missing.push(aid);
          continue;
        }
        const data = await opts.sourceStore.readBuffer(blobKey(v.blob_sha256));
        const put = await opts.liveStore.putBuffer(data);
        if (put.sha256 !== v.blob_sha256) throw new Error(`checksum mismatch for attachment ${aid} v${v.version}`);
        await q.query(`insert into blobs (sha256, size, mime, storage_key, verified_at) values ($1, $2, $3, $4, now()) on conflict do nothing`, [put.sha256, put.size, v.mime, put.key]);
        attachments.copied++;
      }
      if (la) await q.query('update attachments set deleted_at = null, page_id = $2 where id = $1', [aid, livePageId]);
      else {
        await q.query(`insert into attachments (id, org_id, page_id, kind, current_version, filename, created_by) values ($1, $2, $3, $4, $5, $6, $7)`, [aid, user.org_id, livePageId, a.kind, a.current_version, a.filename, user.id]);
        for (const v of versionsSrc)
          await q.query(`insert into attachment_versions (attachment_id, version, blob_sha256, size, mime, filename, width, height, created_by, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) on conflict do nothing`, [aid, v.version, v.blob_sha256, v.size, v.mime, v.filename, v.width, v.height, user.id, v.created_at]);
      }
      attachments.reattached++;
    }
  };

  // Parents before children (the scope query returns them in tree order).
  for (const plan of preview.pages) {
    if (plan.status === 'unchanged') continue;
    const sp = (await src.query('select * from pages where id = $1', [plan.pageId])).rows[0];
    const doc = (await sourceDoc(src, plan.pageId))!;
    if (plan.status === 'changed' || plan.status === 'deleted-in-live') {
      const st = (await q.query('select last_seq from doc_state where page_id = $1', [plan.pageId])).rows[0];
      const rev = await createRevision(q, { pageId: plan.pageId, kind: 'restore', label: opts.label, title: sp.title, state: jsonToUpdate(doc.json, sp.title), content: doc.json, seqUpto: Number(st?.last_seq ?? 0), authors: [], createdBy: user.id });
      await ensureAttachments(doc.json, plan.pageId);
      versions.push({ pageId: plan.pageId, revision: rev.number });
      continue;
    }
    // missing-in-live: recreate (new id) in the original space.
    const space = (await q.query('select id from spaces where id = $1 and deleted_at is null', [sp.space_id])).rows[0];
    if (!space) {
      attachments.missing.push(...attachmentIds(doc.json));
      continue;
    }
    let parentId: string | null = sp.parent_id ? (created.get(sp.parent_id) ?? null) : null;
    if (!parentId && sp.parent_id) {
      const lp = (await q.query('select id from pages where id = $1 and deleted_at is null', [sp.parent_id])).rows[0];
      parentId = lp?.id ?? null;
    }
    if (!parentId) {
      if (!containers.has(sp.space_id)) {
        const cid = randomUUID();
        await insertPage({ id: cid, spaceId: sp.space_id, parentId: null, title: `Восстановлено из резервной копии (${opts.label})`, icon: '🗄', properties: {}, status: 'draft' }, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Страницы, восстановленные из резервной копии: ${opts.label}.` }] }] });
        containers.set(sp.space_id, cid);
      }
      parentId = containers.get(sp.space_id)!;
    }
    const id = randomUUID();
    await insertPage({ id, spaceId: sp.space_id, parentId, title: sp.title, icon: sp.icon, properties: sp.properties, status: sp.status }, doc.json);
    await ensureAttachments(doc.json, id);
    created.set(plan.pageId, id);
    recreated.push({ sourceId: plan.pageId, pageId: id, parentId });
  }
  await audit(q, { userId: user.id, name: user.name, orgId: user.org_id }, { action: 'backup.partial_restore', targetType: scope.spaceId ? 'space' : 'page', targetId: scope.spaceId ?? scope.pageIds?.[0] ?? null, details: { label: opts.label, summary: preview.summary, versions: versions.length, recreated: recreated.length, attachments: { reattached: attachments.reattached, copied: attachments.copied, missing: attachments.missing.length } } });
  return { preview, versions, recreated, attachments };
}
