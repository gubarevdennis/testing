import { collectBlocks, docToPlainText, CONTENT_SCHEMA_VERSION, type PMNode } from '@kb/shared';
import { diffWordsWithSpace } from 'diff';
import * as Y from 'yjs';
import type { Queryable } from '../db/pool.js';
import { notFound, unprocessable } from '../lib/errors.js';
import { ydocToJson, titleOf } from '../collab/ydoc.js';

export type RevisionKind = 'auto' | 'manual' | 'publish' | 'import' | 'restore' | 'pre-restore' | 'create' | 'migration';

export interface RevisionSummary {
  added: number;
  removed: number;
  changed: number;
  blocks?: { added: string[]; removed: string[]; changed: string[] };
}

export function summarize(before: PMNode | null, after: PMNode): RevisionSummary {
  const a = new Map((before ? collectBlocks(before) : []).map((b) => [b.id, b]));
  const b = new Map(collectBlocks(after).map((x) => [x.id, x]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  for (const [id, blk] of b) {
    const prev = a.get(id);
    if (!prev) added.push(id);
    else if (prev.hash !== blk.hash) changed.push(id);
  }
  for (const id of a.keys()) if (!b.has(id)) removed.push(id);
  return { added: added.length, removed: removed.length, changed: changed.length, blocks: { added: added.slice(0, 200), removed: removed.slice(0, 200), changed: changed.slice(0, 200) } };
}

/**
 * Page properties captured with every revision (V16-S11): versions are compared and restored by properties too,
 * not only by text. Access rights are deliberately NOT part of it — a restore never rolls ACLs back (ACL-173).
 */
export interface RevisionProps {
  title: string;
  icon: string | null;
  cover: unknown;
  status: string;
  ownerId: string | null;
  tags: string[];
  properties: Record<string, unknown>;
  locked: boolean;
  wide: boolean;
  reviewDueAt: string | null;
}

/** Fields of RevisionProps that a restore may bring back (status/locking are workflow state, not content). */
export const RESTORABLE_PROPS = ['icon', 'cover', 'ownerId', 'tags', 'properties', 'wide', 'reviewDueAt'] as const;

export async function currentProps(q: Queryable, pageId: string): Promise<RevisionProps | null> {
  const p = (await q.query(`select title, icon, cover, status, owner_id, tags, properties, locked, wide, to_char(review_due_at, 'YYYY-MM-DD') as review_due_at from pages where id = $1`, [pageId])).rows[0];
  if (!p) return null;
  return { title: p.title, icon: p.icon ?? null, cover: p.cover ?? null, status: p.status, ownerId: p.owner_id ?? null, tags: p.tags ?? [], properties: p.properties ?? {}, locked: !!p.locked, wide: !!p.wide, reviewDueAt: p.review_due_at ?? null };
}

export async function createRevision(
  q: Queryable,
  args: { pageId: string; kind: RevisionKind; title: string; state: Uint8Array; content: PMNode; seqUpto: number; authors: string[]; createdBy: string | null; label?: string | null; restoredFrom?: string | null },
) {
  const prev = await q.query('select number, content from page_revisions where page_id = $1 order by number desc limit 1', [args.pageId]);
  const number = (prev.rows[0]?.number ?? 0) + 1;
  const summary = summarize(prev.rows[0]?.content ?? null, args.content);
  const props = await currentProps(q, args.pageId);
  if (props) props.title = args.title;
  const schemaVersion = (await q.query('select content_schema_version from pages where id = $1', [args.pageId])).rows[0]?.content_schema_version ?? CONTENT_SCHEMA_VERSION;
  const r = await q.query(
    `insert into page_revisions (page_id, number, kind, label, title, state, content, seq_upto, authors, summary, created_by, restored_from, props, content_schema_version)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning id, number, created_at`,
    [args.pageId, number, args.kind, args.label ?? null, args.title, Buffer.from(args.state), args.content, args.seqUpto, args.authors, summary, args.createdBy, args.restoredFrom ?? null, props, schemaVersion],
  );
  return r.rows[0] as { id: string; number: number; created_at: Date };
}

export interface PropChange {
  field: keyof RevisionProps;
  before: unknown;
  after: unknown;
  /** Display values (owner names instead of ids), filled by the route. */
  beforeLabel?: string;
  afterLabel?: string;
  /** Per-key changes of custom properties / tags. */
  items?: Array<{ key: string; before: unknown; after: unknown; status: 'added' | 'removed' | 'changed' }>;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Property-level comparison of two revision snapshots. `null` snapshots (revisions older than the feature) compare only the title. */
export function diffProps(before: Partial<RevisionProps> | null, after: Partial<RevisionProps> | null): PropChange[] {
  if (!before || !after) return [];
  const out: PropChange[] = [];
  const fields: Array<keyof RevisionProps> = ['icon', 'cover', 'status', 'ownerId', 'tags', 'properties', 'locked', 'wide', 'reviewDueAt'];
  for (const f of fields) {
    if (same(before[f], after[f])) continue;
    const c: PropChange = { field: f, before: before[f] ?? null, after: after[f] ?? null };
    if (f === 'properties') {
      const a = (before.properties ?? {}) as Record<string, unknown>;
      const b = (after.properties ?? {}) as Record<string, unknown>;
      c.items = [...new Set([...Object.keys(a), ...Object.keys(b)])]
        .filter((k) => !same(a[k], b[k]))
        .map((k) => ({ key: k, before: a[k] ?? null, after: b[k] ?? null, status: !(k in a) ? 'added' : !(k in b) ? 'removed' : 'changed' }));
    }
    if (f === 'tags') {
      const a = new Set(before.tags ?? []);
      const b = new Set(after.tags ?? []);
      c.items = [...[...b].filter((t) => !a.has(t)).map((t) => ({ key: t, before: null, after: t, status: 'added' as const })), ...[...a].filter((t) => !b.has(t)).map((t) => ({ key: t, before: t, after: null, status: 'removed' as const }))];
    }
    out.push(c);
  }
  return out;
}

export interface BlockDiff {
  id: string;
  type: string;
  status: 'added' | 'removed' | 'changed' | 'moved' | 'same';
  before?: string;
  after?: string;
  /** Inline word diff for changed text blocks. */
  parts?: Array<{ value: string; added?: boolean; removed?: boolean }>;
}

/** Block-level diff with word-level detail for changed text blocks (version comparison UI). */
export function diffDocs(before: PMNode, after: PMNode): { blocks: BlockDiff[]; stats: RevisionSummary } {
  const a = collectBlocks(before);
  const b = collectBlocks(after);
  const aMap = new Map(a.map((x) => [x.id, x]));
  const bMap = new Map(b.map((x) => [x.id, x]));
  const out: BlockDiff[] = [];
  const aOrder = a.filter((x) => bMap.has(x.id)).map((x) => x.id);
  const bOrder = b.filter((x) => aMap.has(x.id)).map((x) => x.id);
  const moved = new Set(lcsMoved(aOrder, bOrder));
  // Walk the new document, inserting removed blocks after their previous neighbour.
  const removedAfter = new Map<string | null, BlockDiff[]>();
  let prevId: string | null = null;
  for (const x of a) {
    if (!bMap.has(x.id)) {
      const list = removedAfter.get(prevId) ?? [];
      list.push({ id: x.id, type: x.type, status: 'removed', before: x.text });
      removedAfter.set(prevId, list);
    } else prevId = x.id;
  }
  out.push(...(removedAfter.get(null) ?? []));
  for (const x of b) {
    const prev = aMap.get(x.id);
    if (!prev) out.push({ id: x.id, type: x.type, status: 'added', after: x.text });
    else if (prev.hash !== x.hash) {
      out.push({ id: x.id, type: x.type, status: 'changed', before: prev.text, after: x.text, parts: prev.text !== x.text ? diffWordsWithSpace(prev.text, x.text) : undefined });
    } else out.push({ id: x.id, type: x.type, status: moved.has(x.id) ? 'moved' : 'same', after: x.text });
    out.push(...(removedAfter.get(x.id) ?? []));
  }
  return {
    blocks: out,
    stats: {
      added: out.filter((d) => d.status === 'added').length,
      removed: out.filter((d) => d.status === 'removed').length,
      changed: out.filter((d) => d.status === 'changed').length,
    },
  };
}

/** Ids not part of the longest common subsequence of two orderings = moved blocks. */
function lcsMoved(a: string[], b: string[]): string[] {
  if (a.length * b.length > 4_000_000) return [];
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const keep = new Set<string>();
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      keep.add(a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return b.filter((id) => !keep.has(id));
}

export function textOf(doc: PMNode) {
  return docToPlainText(doc);
}

/**
 * Reconstructs the document right after journal operation `seq` (R-HISTORY-026). Preferably replays the journal
 * from the first operation; if older operations were compacted by retention, starts from the newest revision
 * whose state is exactly at a journal position and replays the rest. Refuses when the gap cannot be bridged.
 */
export async function stateAtSeq(q: Queryable, pageId: string, seq: number): Promise<{ content: PMNode; title: string; at: Date | null; authorName: string | null; base: string }> {
  const st = (await q.query('select last_seq from doc_state where page_id = $1', [pageId])).rows[0];
  if (!st || seq > Number(st.last_seq)) throw notFound('Такой операции в журнале нет');
  const op = (await q.query(`select u.created_at, us.name from doc_updates u left join users us on us.id = u.user_id where u.page_id = $1 and u.seq = $2`, [pageId, seq])).rows[0];
  const replay = async (fromSeq: number, doc: Y.Doc) => {
    const rows = (await q.query('select seq, update from doc_updates where page_id = $1 and seq > $2 and seq <= $3 order by seq', [pageId, fromSeq, seq])).rows;
    if (rows.length !== seq - fromSeq) return false;
    for (const r of rows) Y.applyUpdate(doc, new Uint8Array(r.update));
    return true;
  };
  const doc = new Y.Doc({ gc: false });
  let base = 'journal';
  if (!(await replay(0, doc))) {
    // Journal head was compacted: start from a revision state taken at a journal position not after `seq`.
    const revs = (await q.query(`select number, state, seq_upto from page_revisions where page_id = $1 and seq_upto <= $2 and kind in ('auto', 'manual', 'publish', 'create', 'import', 'pre-restore') order by seq_upto desc, number desc limit 5`, [pageId, seq])).rows;
    let ok = false;
    for (const r of revs) {
      const d = new Y.Doc({ gc: false });
      Y.applyUpdate(d, new Uint8Array(r.state));
      if (await replay(Number(r.seq_upto), d)) {
        Y.applyUpdate(doc, Y.encodeStateAsUpdate(d));
        base = `revision ${r.number}`;
        ok = true;
        break;
      }
    }
    if (!ok) throw unprocessable('journal_pruned', 'Журнал операций для этого момента уже сокращён по сроку хранения. Восстановите ближайшую сохранённую версию.');
  }
  return { content: ydocToJson(doc), title: titleOf(doc), at: op?.created_at ?? null, authorName: op?.name ?? null, base };
}
