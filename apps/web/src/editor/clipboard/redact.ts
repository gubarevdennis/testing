/**
 * Copying never reveals what the reader may not see (AT-79): documents keep a snapshot of the title of every
 * page they link to, and a reader may not have access to the linked page. Before anything goes to the clipboard
 * the titles of inaccessible (or unresolved) linked pages are replaced. The lookup is registered by the page
 * reference resolver (lib/pageRefs.ts); without it (unit tests) nothing is redacted.
 */
import type { PMNode } from '@kb/shared';

export const HIDDEN_PAGE_TITLE = 'Страница недоступна';

type Lookup = (pageId: string) => 'visible' | 'hidden';
let lookup: Lookup | null = null;
let prefetch: ((ids: string[]) => Promise<void>) | null = null;

export function setCopyRefLookup(fn: Lookup, pre: (ids: string[]) => Promise<void>) {
  lookup = fn;
  prefetch = pre;
}

export const isHiddenRef = (pageId: string | null | undefined) => !!lookup && !!pageId && lookup(pageId) === 'hidden';

/** Replaces titles of hidden linked pages inside serialized clipboard HTML. */
export function redactDomRefs(root: ParentNode) {
  if (!lookup) return;
  root.querySelectorAll('[data-page-id]').forEach((el) => {
    if (!isHiddenRef(el.getAttribute('data-page-id'))) return;
    const a = el.tagName === 'A' ? el : el.querySelector('a');
    if (a) a.textContent = HIDDEN_PAGE_TITLE;
    else el.textContent = HIDDEN_PAGE_TITLE;
  });
}

function refIds(json: PMNode, out = new Set<string>()) {
  if ((json.type === 'pageMention' || json.type === 'pageLink') && json.attrs?.pageId) out.add(String(json.attrs.pageId));
  json.content?.forEach((c) => refIds(c, out));
  return out;
}

/** Resolves access to every linked page of a fragment, then returns a copy with hidden titles replaced. */
export async function redactJson(json: PMNode): Promise<PMNode> {
  if (!lookup) return json;
  const ids = [...refIds(json)];
  if (ids.length && prefetch) await prefetch(ids).catch(() => undefined);
  const clone = structuredClone(json);
  const walk = (n: PMNode) => {
    if ((n.type === 'pageMention' || n.type === 'pageLink') && isHiddenRef(n.attrs?.pageId)) n.attrs = { ...n.attrs, title: HIDDEN_PAGE_TITLE };
    n.content?.forEach(walk);
  };
  walk(clone);
  return clone;
}
