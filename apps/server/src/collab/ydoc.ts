import * as Y from 'yjs';
import { prosemirrorJSONToYDoc, yXmlFragmentToProsemirrorJSON, updateYFragment } from '@tiptap/y-tiptap';
import { getKbSchema, ensureBlockIds, type PMNode } from '@kb/shared';

/** Name of the XmlFragment holding the document (Tiptap Collaboration default). */
export const FRAGMENT = 'default';

export function jsonToYDoc(json: PMNode): Y.Doc {
  const schema = getKbSchema();
  const doc = ensureBlockIds(structuredClone(json));
  // Validate against the canonical schema before it becomes durable state.
  schema.nodeFromJSON(doc).check();
  return prosemirrorJSONToYDoc(schema, doc, FRAGMENT);
}

/** Name of the Y.Text holding the page title (collaboratively edited, merged like content). */
export const TITLE = 'title';

export function jsonToUpdate(json: PMNode, title?: string): Uint8Array {
  const doc = jsonToYDoc(json);
  if (title) doc.getText(TITLE).insert(0, title);
  return Y.encodeStateAsUpdate(doc);
}

export function titleOf(doc: Y.Doc): string {
  return doc.getText(TITLE).toString();
}

/** Replaces the title text with a minimal diff (common prefix/suffix kept so concurrent edits merge). */
export function setTitle(doc: Y.Doc, next: string) {
  const t = doc.getText(TITLE);
  const cur = t.toString();
  if (cur === next) return;
  let start = 0;
  while (start < cur.length && start < next.length && cur[start] === next[start]) start++;
  let endCur = cur.length;
  let endNext = next.length;
  while (endCur > start && endNext > start && cur[endCur - 1] === next[endNext - 1]) {
    endCur--;
    endNext--;
  }
  doc.transact(() => {
    if (endCur > start) t.delete(start, endCur - start);
    if (endNext > start) t.insert(start, next.slice(start, endNext));
  });
}

export function ydocToJson(doc: Y.Doc): PMNode {
  const json = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(FRAGMENT)) as PMNode;
  if (!json.content || json.content.length === 0) return { type: 'doc', content: [{ type: 'paragraph' }] };
  return json;
}

export function updateToJson(update: Uint8Array): PMNode {
  const d = new Y.Doc();
  Y.applyUpdate(d, update);
  return ydocToJson(d);
}

/**
 * Replaces the content of a live Y.Doc with `json` using a minimal structural diff (used by version restore
 * and import-into-existing). Concurrent remote insertions are preserved by the CRDT merge.
 */
export function replaceContent(doc: Y.Doc, json: PMNode, origin: unknown = 'server-replace') {
  const schema = getKbSchema();
  const node = schema.nodeFromJSON(ensureBlockIds(structuredClone(json)));
  node.check();
  const fragment = doc.getXmlFragment(FRAGMENT);
  doc.transact(() => {
    updateYFragment(doc, fragment, node, { mapping: new Map(), isOMark: new Map() } as any);
  }, origin);
}

/** Validates that a document state decodes to a schema-valid ProseMirror document. */
export function validateDoc(doc: Y.Doc): { ok: true; json: PMNode } | { ok: false; error: string } {
  try {
    const json = ydocToJson(doc);
    getKbSchema().nodeFromJSON(json).check();
    return { ok: true, json };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
