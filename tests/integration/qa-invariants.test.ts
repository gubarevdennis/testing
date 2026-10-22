import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, setupOrg, type TestServer } from '../support/harness.js';
import { openClient, waitFor, type TestClient } from '../support/collab.js';
import { pairwise, missingPairs, caseName, docLines, orderViolation, countViolations } from '../support/pairwise.js';

/**
 * Pairwise matrix over the server-observable axes (role × network × concurrency × content × history × size) with the
 * product invariants checked after every case (QA26-30, QA26-31):
 *   I1 nothing acknowledged disappears and nothing is duplicated;
 *   I2 order/hierarchy of existing blocks is preserved;
 *   I3 rights never widen: changes of readers/commenters never reach the server, and their client never says "saved";
 *   I4 every editing replica converges to the server copy;
 *   I5 history: saved versions stay listed, a restore brings back exactly the saved content.
 */
let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer();
  org = await setupOrg(ts);
});
afterAll(async () => ts?.close());

const AXES = {
  role: ['owner', 'editor', 'commenter', 'viewer'],
  network: ['ws', 'http-fallback', 'offline-reconnect'],
  concurrency: [1, 2],
  content: ['plain', 'unicode', 'long-line'],
  history: ['fresh', 'with-version', 'restored'],
  size: ['small', 'large'],
} as const;

const CONTENT = {
  plain: 'обычный текст абзаца',
  unicode: 'эмодзи 👩‍💻 🇷🇺, иврит שלום, ё й, é (e + U+0301), китайский 中文',
  'long-line': Array.from({ length: 300 }, (_, i) => `слово${i}`).join(' '),
} as const;

const CASES = pairwise(AXES);

async function contentLines(pageId: string) {
  return docLines((await org.owner.get(`/api/v1/pages/${pageId}/content`)).content);
}

describe('pairwise matrix with product invariants (QA26-30, QA26-31)', () => {
  it('QA26-30: the generated matrix covers every pair of server-side axes', () => {
    expect(missingPairs(AXES, CASES)).toEqual([]);
    expect(CASES.length).toBeLessThan(30);
  });

  for (const [idx, c] of CASES.entries()) {
    it(`QA26-31 case ${idx + 1}/${CASES.length}: ${caseName(c)}`, async () => {
      const tag = `c${idx}`;
      const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: `Матрица ${tag}` })).page.id as string;
      const blocks = c.size === 'small' ? 3 : 500;
      const seeds = Array.from({ length: blocks }, (_, i) => `S${i}-${tag}`);

      // seed through the collaborative channel
      const seeder = await openClient(ts.url, org.owner, page);
      seeder.doc.transact(() => seeds.forEach((s) => seeder.appendParagraph(s)));
      await seeder.waitSaved(30_000);

      // history
      let revisionId: string | null = null;
      if (c.history !== 'fresh') revisionId = (await org.owner.post(`/api/v1/pages/${page}/revisions`, { label: 'до правок ' + tag })).revision.id;
      if (c.history === 'restored') {
        seeder.appendParagraph(`TEMP-${tag}`);
        await seeder.waitSaved();
        await org.owner.post(`/api/v1/pages/${page}/revisions/${revisionId}/restore`, {});
        await waitFor(() => !seeder.text().includes(`TEMP-${tag}`), 10_000, 'restore reaches the open replica');
      }
      seeder.close();

      // the actor
      const level = c.role === 'editor' ? 'edit' : c.role === 'commenter' ? 'comment' : c.role === 'viewer' ? 'view' : null;
      const api = level ? await org.user(`${c.role}-${tag}`, { pageGrants: [{ pageId: page, level }] }) : org.owner;
      const canEdit = c.role === 'owner' || c.role === 'editor';
      const actor: TestClient = await openClient(ts.url, api, page, { connect: c.network !== 'offline-reconnect', wsBlocked: c.network === 'http-fallback' });
      const mine = [`⟦${tag}-a⟧`, `⟦${tag}-b⟧`];
      if (c.network === 'offline-reconnect') {
        // edits made before the connection exists are applied to the empty local replica: append only
        actor.appendParagraph(`${mine[0]} ${CONTENT[c.content]}`);
        actor.appendParagraph(`${mine[1]}`);
        await actor.provider.connect();
        await waitFor(() => actor.provider.synced || actor.fatal.length > 0, 15_000, 'synced after reconnect');
      } else {
        await waitFor(() => actor.text().includes(seeds[seeds.length - 1]), 10_000, 'actor sees the document');
        actor.insert(0, 0, mine[0] + ' ');
        actor.appendParagraph(`${mine[1]} ${CONTENT[c.content]}`);
      }

      // a concurrent editor
      let other: TestClient | null = null;
      const theirs = [`⟦${tag}-o1⟧`, `⟦${tag}-o2⟧`];
      if (c.concurrency === 2) {
        other = await openClient(ts.url, org.owner, page);
        other.insert(Math.min(1, blocks - 1), 0, theirs[0]);
        other.appendParagraph(theirs[1]);
        await other.waitSaved(15_000);
      }

      if (canEdit) await actor.waitSaved(30_000);
      else await waitFor(() => actor.provider.status === 'readonly' || actor.provider.status === 'error', 10_000, 'reader status');

      const lines = await contentLines(page);
      const text = lines.join('\n');
      // I1: acknowledged changes present exactly once (own + concurrent)
      expect(countViolations(text, [...(canEdit ? mine : []), ...(other ? theirs : [])]), 'I1 lost/duplicated').toEqual([]);
      // I2: the existing blocks keep their order; a restore removed the temporary block
      expect(orderViolation(lines, seeds), 'I2 order').toBeNull();
      if (c.history === 'restored') expect(text).not.toContain(`TEMP-${tag}`);
      // I3: rights never widen and a rejected change is never shown as saved
      if (!canEdit) {
        for (const m of mine) expect(text, 'I3 reader change reached the server').not.toContain(m);
        expect(actor.provider.status).not.toBe('saved');
      }
      // I4: editing replicas converge to the server copy
      for (const cl of [canEdit ? actor : null, other]) if (cl) await waitFor(() => cl.text() === text, 10_000, 'replica converges to server copy');
      // I5: history survives
      if (revisionId) {
        const revs = await org.owner.get(`/api/v1/pages/${page}/revisions`);
        expect(JSON.stringify(revs)).toContain(revisionId);
      }
      actor.close();
      other?.close();
    }, 120_000);
  }
});
