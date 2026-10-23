/**
 * Internal clipboard format (R-CLIPBOARD-018, SPEC §25.3): next to text/plain and text/html a copy carries the exact
 * blocks as editor JSON — node types, block ids and every attribute (column widths, image size and alignment, callout
 * icon, toggle state…), which HTML cannot represent. A paste prefers it over HTML and HTML over plain text.
 *
 * Nothing the reader may not see goes into it: titles of linked pages the reader cannot open are replaced (AT-79) and
 * comment anchors (threads of the source page) are dropped. On paste the data is treated as untrusted (any web page
 * can put this type on the clipboard): it must come from this instance, is rebuilt through the schema, and every URL is
 * sanitised like an import (sanitizeDocUrls).
 */
import { Slice, type Schema } from '@tiptap/pm/model';
import { sanitizeDocUrls, type PMNode } from '@kb/shared';
import { HIDDEN_PAGE_TITLE, isHiddenRef } from './redact';

export const KB_CLIPBOARD_TYPE = 'application/x-kb-blocks+json';

export interface InternalClip {
  v: 1;
  origin: string;
  pageId: string | null;
  slice: { content: PMNode[]; openStart: number; openEnd: number };
}

function clean(nodes: PMNode[]): PMNode[] {
  const walk = (n: PMNode): PMNode => {
    const out: PMNode = { ...n };
    if ((n.type === 'pageMention' || n.type === 'pageLink') && isHiddenRef(n.attrs?.pageId as string)) out.attrs = { ...n.attrs, title: HIDDEN_PAGE_TITLE };
    if (n.marks) {
      const marks = n.marks.filter((m) => m.type !== 'comment');
      if (marks.length) out.marks = marks;
      else delete out.marks;
    }
    if (n.content) out.content = n.content.map(walk);
    return out;
  };
  return nodes.map(walk);
}

/** Serialises a copied slice. */
export function serializeInternal(slice: Slice, pageId: string | null, origin = location.origin): string {
  const json = slice.toJSON() as { content?: PMNode[]; openStart?: number; openEnd?: number } | null;
  const clip: InternalClip = { v: 1, origin, pageId, slice: { content: clean(json?.content ?? []), openStart: json?.openStart ?? 0, openEnd: json?.openEnd ?? 0 } };
  return JSON.stringify(clip);
}

/** Parses clipboard data of the internal type; null when absent, foreign, malformed or not valid for the schema. */
export function parseInternal(data: string, schema: Schema, origin = location.origin): { slice: Slice; pageId: string | null; json: PMNode[] } | null {
  if (!data) return null;
  let clip: InternalClip;
  try {
    clip = JSON.parse(data);
  } catch {
    return null;
  }
  if (!clip || clip.v !== 1 || clip.origin !== origin || !Array.isArray(clip.slice?.content) || !clip.slice.content.length) return null;
  const openStart = Number(clip.slice.openStart) || 0;
  const openEnd = Number(clip.slice.openEnd) || 0;
  const { doc } = sanitizeDocUrls({ type: 'doc', content: clean(clip.slice.content) } as PMNode);
  try {
    const slice = Slice.fromJSON(schema, { content: doc.content, openStart, openEnd });
    // Slice.fromJSON does not check content expressions: every node must be valid
    slice.content.forEach((n) => n.check());
    return { slice, pageId: typeof clip.pageId === 'string' ? clip.pageId : null, json: doc.content ?? [] };
  } catch {
    return null;
  }
}

/** Attachment ids referenced by the given nodes. */
export function attachmentIdsOf(nodes: PMNode[]): string[] {
  const out = new Set<string>();
  const walk = (n: PMNode) => {
    if (typeof n.attrs?.attachmentId === 'string') out.add(n.attrs.attachmentId);
    n.content?.forEach(walk);
  };
  nodes.forEach(walk);
  return [...out];
}
