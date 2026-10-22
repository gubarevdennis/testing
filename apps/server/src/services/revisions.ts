import { collectBlocks, docToPlainText, type PMNode } from '@kb/shared';
import { diffWordsWithSpace } from 'diff';
import type { Queryable } from '../db/pool.js';

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

export async function createRevision(
  q: Queryable,
  args: { pageId: string; kind: RevisionKind; title: string; state: Uint8Array; content: PMNode; seqUpto: number; authors: string[]; createdBy: string | null; label?: string | null; restoredFrom?: string | null },
) {
  const prev = await q.query('select number, content from page_revisions where page_id = $1 order by number desc limit 1', [args.pageId]);
  const number = (prev.rows[0]?.number ?? 0) + 1;
  const summary = summarize(prev.rows[0]?.content ?? null, args.content);
  const r = await q.query(
    `insert into page_revisions (page_id, number, kind, label, title, state, content, seq_upto, authors, summary, created_by, restored_from)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id, number, created_at`,
    [args.pageId, number, args.kind, args.label ?? null, args.title, Buffer.from(args.state), args.content, args.seqUpto, args.authors, summary, args.createdBy, args.restoredFrom ?? null],
  );
  return r.rows[0] as { id: string; number: number; created_at: Date };
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
