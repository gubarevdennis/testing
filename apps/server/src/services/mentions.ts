import type { Queryable } from '../db/pool.js';
import { BLOCK_TYPES, inlineText, type PMNode } from '@kb/shared';
import { accessForPages } from '../acl/engine.js';
import { toAuthUser } from '../auth/sessions.js';

const BLOCKS = new Set<string>(BLOCK_TYPES);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** At most this many notifications per person per document save: pasting a list of 50 mentions is not 50 pings. */
const MAX_PER_USER = 3;

export interface DocMention {
  userId: string;
  /** Id of the innermost block containing the mention (the link of the notification scrolls to it). */
  blockId: string;
  /** Text of that block, for the notification excerpt. */
  text: string;
}

/** People mentioned in a document («@Имя»), each with the block it is in. */
export function extractMentions(doc: PMNode | null | undefined): DocMention[] {
  const out: DocMention[] = [];
  const seen = new Set<string>();
  const visit = (n: PMNode, block: PMNode | null) => {
    const here = BLOCKS.has(n.type) && typeof n.attrs?.id === 'string' && n.attrs.id ? n : block;
    if (n.type === 'mention') {
      const userId = String(n.attrs?.id ?? '');
      const blockId = here ? String(here.attrs!.id) : '';
      const key = userId + '|' + blockId;
      if (UUID.test(userId) && blockId && !seen.has(key)) {
        seen.add(key);
        out.push({ userId, blockId, text: here ? inlineText(here).trim() : '' });
      }
      return;
    }
    for (const c of n.content ?? []) visit(c, here);
  };
  if (doc) visit(doc, null);
  return out;
}

export function hasMention(doc: PMNode | null | undefined): boolean {
  let found = false;
  const visit = (n: PMNode) => {
    if (found) return;
    if (n.type === 'mention') found = true;
    else for (const c of n.content ?? []) visit(c);
  };
  if (doc) visit(doc);
  return found;
}

/**
 * Records the people mentioned in a page and notifies each new mention once (item 29): an inbox notification with a
 * link to the exact block. Nobody is notified about a page they cannot open, about their own mention, or again for a
 * mention already recorded (edits, restores and re-saves do not re-notify). Idempotent: safe to run at least once
 * per save from the outbox. Returns the ids of people who got a notification.
 */
export async function syncPageMentions(q: Queryable, pageId: string, actorIds: string[]): Promise<string[]> {
  const page = (await q.query(`select p.id, p.org_id, p.title, p.deleted_at, d.content from pages p left join doc_state d on d.page_id = p.id where p.id = $1`, [pageId])).rows[0];
  if (!page || page.deleted_at || !page.content) return [];
  const mentions = extractMentions(page.content);
  if (!mentions.length) return [];
  const known = (await q.query(`select user_id, block_id from page_mentions where page_id = $1`, [pageId])).rows as Array<{ user_id: string; block_id: string }>;
  const keys = new Set(known.map((r) => r.user_id + '|' + r.block_id));
  const preexisting = new Set(known.filter((r) => r.block_id === '*').map((r) => r.user_id));
  const fresh = mentions.filter((m) => !keys.has(m.userId + '|' + m.blockId));
  if (!fresh.length) return [];

  const ids = [...new Set(fresh.map((m) => m.userId))];
  const users = new Map((await q.query(`select * from users where id = any($1::uuid[]) and org_id = $2`, [ids, page.org_id])).rows.map((u) => [u.id as string, u]));
  const actors = actorIds.length ? (await q.query(`select id, name from users where id = any($1::uuid[])`, [actorIds])).rows : [];
  const notified: string[] = [];
  const perUser = new Map<string, number>();
  for (const m of fresh) {
    const u = users.get(m.userId);
    if (!u) continue; // a person of another organisation (pasted content) is not recorded
    // the author of the mention: the editor of this save other than the mentioned person (the last one if several)
    const actor = [...actors].reverse().find((a) => a.id !== m.userId) ?? null;
    const ins = await q.query(`insert into page_mentions (page_id, user_id, block_id, mentioned_by) values ($1, $2, $3, $4) on conflict do nothing returning 1`, [pageId, m.userId, m.blockId, actor?.id ?? null]);
    if (!ins.rowCount) continue; // recorded concurrently by another worker
    if (preexisting.has(m.userId)) continue; // mentioned before the upgrade: never notified, so not now either
    if (!actor || u.status !== 'active') continue; // self-mention, server-side change, inactive account
    if ((perUser.get(m.userId) ?? 0) >= MAX_PER_USER) continue;
    const acc = (await accessForPages(q, toAuthUser(u), [pageId])).get(pageId);
    if (!acc?.actions.view || acc.deleted) continue; // no leak of the page (or its text) through notifications
    await q.query(`insert into notifications (user_id, type, page_id, data) values ($1, 'page_mention', $2, $3)`, [m.userId, pageId, { from: actor.name, fromId: actor.id, blockId: m.blockId, excerpt: m.text.slice(0, 200) }]);
    perUser.set(m.userId, (perUser.get(m.userId) ?? 0) + 1);
    if (!notified.includes(m.userId)) notified.push(m.userId);
  }
  return notified;
}
