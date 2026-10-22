#!/usr/bin/env node
// Verifies that every collaborative document in a (restored) database decodes:
//   - doc_state.snapshot + doc_updates (seq > snapshot_seq) apply cleanly to a fresh Y.Doc,
//   - no structs remain pending (a missing update in the journal would leave dangling dependencies),
//   - the journal is gap-free up to doc_state.last_seq,
//   - every page_revisions.state decodes.
// Usage: node scripts/backup/check-docs.mjs <postgres-url>   → prints a JSON report; exit 1 on any problem.
import pg from 'pg';
import * as Y from 'yjs';

const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) {
  console.error('usage: check-docs.mjs <postgres-url>');
  process.exit(2);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
const problems = [];
let docs = 0;
let updates = 0;
let revisions = 0;
try {
  const missing = await client.query('select p.id from pages p left join doc_state d on d.page_id = p.id where d.page_id is null');
  for (const r of missing.rows) problems.push({ pageId: r.id, problem: 'doc_state missing' });

  let after = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const batch = await client.query('select page_id, snapshot, snapshot_seq, last_seq from doc_state where page_id > $1 order by page_id limit 200', [after]);
    if (!batch.rows.length) break;
    for (const st of batch.rows) {
      after = st.page_id;
      docs++;
      try {
        const doc = new Y.Doc({ gc: true });
        if (st.snapshot) Y.applyUpdate(doc, st.snapshot);
        const ups = await client.query('select seq, update from doc_updates where page_id = $1 and seq > $2 order by seq', [st.page_id, st.snapshot_seq]);
        let expected = Number(st.snapshot_seq) + 1;
        for (const u of ups.rows) {
          if (Number(u.seq) !== expected) problems.push({ pageId: st.page_id, problem: `journal gap: expected seq ${expected}, found ${u.seq}` });
          expected = Number(u.seq) + 1;
          Y.applyUpdate(doc, u.update);
          updates++;
        }
        const last = ups.rows.length ? Number(ups.rows[ups.rows.length - 1].seq) : Number(st.snapshot_seq);
        if (last !== Number(st.last_seq)) problems.push({ pageId: st.page_id, problem: `last_seq ${st.last_seq} but journal ends at ${last}` });
        if (doc.store.pendingStructs !== null || doc.store.pendingDs !== null) problems.push({ pageId: st.page_id, problem: 'pending structs after replay (missing updates)' });
        doc.getXmlFragment('default').toJSON();
        doc.destroy();
      } catch (e) {
        problems.push({ pageId: st.page_id, problem: 'decode failed: ' + e.message });
      }
    }
  }

  let lastRev = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const batch = await client.query('select id, page_id, state from page_revisions where id > $1 order by id limit 200', [lastRev]);
    if (!batch.rows.length) break;
    for (const r of batch.rows) {
      lastRev = r.id;
      revisions++;
      try {
        const doc = new Y.Doc();
        Y.applyUpdate(doc, r.state);
        doc.destroy();
      } catch (e) {
        problems.push({ pageId: r.page_id, revisionId: r.id, problem: 'revision decode failed: ' + e.message });
      }
    }
  }
} finally {
  await client.end();
}
console.log(JSON.stringify({ ok: problems.length === 0, documents: docs, journalUpdates: updates, revisions, problems: problems.slice(0, 50) }));
process.exit(problems.length ? 1 : 0);
