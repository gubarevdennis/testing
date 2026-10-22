import * as Y from 'yjs';
import type { Queryable } from '../db/pool.js';

export interface ConsistencyProblem {
  kind: string;
  description: string;
  count: number;
  sample: string[];
}

export interface ConsistencyReport {
  checkedAt: string;
  ok: boolean;
  total: number;
  problems: ConsistencyProblem[];
}

const SAMPLE = 20;

/**
 * Consistency check of the page tree and the document journal (R-COLLAB-037). Read-only: it reports, it never
 * "repairs" silently. Runs in the hourly maintenance; the total is exported as kb_integrity_errors.
 * (Stored-file hashes are verified separately, see services/integrity.ts.)
 */
export async function checkConsistency(q: Queryable, opts: { snapshotSample?: number } = {}): Promise<ConsistencyReport> {
  const problems: ConsistencyProblem[] = [];
  const add = async (kind: string, description: string, sql: string) => {
    const rows = (await q.query(sql)).rows as Array<{ id: string }>;
    if (rows.length) problems.push({ kind, description, count: rows.length, sample: rows.slice(0, SAMPLE).map((r) => String(r.id)) });
  };

  // ---- tree (closure table page_ancestors + parent_id)
  await add('tree_cycle', 'Цикл в дереве страниц (страница является предком своего предка)', `
    select distinct a.page_id as id from page_ancestors a
      join page_ancestors b on b.page_id = a.ancestor_id and b.ancestor_id = a.page_id
     where a.page_id <> a.ancestor_id`);
  await add('tree_missing_self', 'Нет собственной записи страницы в таблице предков', `
    select p.id from pages p where not exists (select 1 from page_ancestors a where a.page_id = p.id and a.ancestor_id = p.id and a.depth = 0)`);
  await add('tree_parent_mismatch', 'parent_id не совпадает с предком первого уровня', `
    select p.id from pages p
     where (p.parent_id is not null and not exists (select 1 from page_ancestors a where a.page_id = p.id and a.ancestor_id = p.parent_id and a.depth = 1))
        or (p.parent_id is null and exists (select 1 from page_ancestors a where a.page_id = p.id and a.depth > 0))`);
  await add('tree_space_mismatch', 'Дочерняя страница лежит в другом пространстве, чем родитель', `
    select c.id from pages c join pages p on p.id = c.parent_id where c.space_id <> p.space_id`);
  await add('tree_orphan', 'Живая страница под удалённым родителем (сирота в дереве)', `
    select c.id from pages c join pages p on p.id = c.parent_id where c.deleted_at is null and p.deleted_at is not null`);
  await add('tree_too_deep', 'Вложенность глубже 15 уровней', `
    select page_id as id from page_ancestors group by page_id having max(depth) + 1 > 15`);

  // ---- document journal
  await add('doc_state_missing', 'У страницы нет состояния документа', `
    select p.id from pages p where not exists (select 1 from doc_state s where s.page_id = p.id)`);
  await add('journal_ahead_of_state', 'Журнал содержит операции новее, чем отмечено в состоянии документа', `
    select s.page_id as id from doc_state s join lateral (select max(seq) m from doc_updates u where u.page_id = s.page_id) j on true where j.m > s.last_seq`);
  await add('journal_gap', 'В журнале после последнего снимка не хватает операций', `
    select s.page_id as id from doc_state s
      join lateral (select count(*)::bigint c from doc_updates u where u.page_id = s.page_id and u.seq > s.snapshot_seq) j on true
     where j.c <> s.last_seq - s.snapshot_seq`);
  await add('snapshot_ahead', 'Снимок новее последней операции', `select page_id as id from doc_state where snapshot_seq > last_seq`);

  // ---- snapshots decode (sampled: the most recently updated documents)
  const sample = opts.snapshotSample ?? 200;
  if (sample > 0) {
    const rows = (await q.query('select page_id, snapshot from doc_state where snapshot is not null order by updated_at desc limit $1', [sample])).rows;
    const bad: string[] = [];
    for (const r of rows) {
      try {
        Y.decodeUpdate(new Uint8Array(r.snapshot));
      } catch {
        bad.push(r.page_id);
      }
    }
    if (bad.length) problems.push({ kind: 'snapshot_corrupt', description: 'Снимок документа не декодируется', count: bad.length, sample: bad.slice(0, SAMPLE) });
  }

  const total = problems.reduce((n, p) => n + p.count, 0);
  return { checkedAt: new Date().toISOString(), ok: total === 0, total, problems };
}
