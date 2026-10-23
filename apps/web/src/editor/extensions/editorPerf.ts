import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

interface Desc {
  node?: PMNode;
}

/**
 * Keeps the editor view's top-level node descriptions pointing at the current document's node objects (PERF-D1).
 *
 * prosemirror-view reuses a rendered block when the new node is *equal* to the old one but keeps the old node object.
 * When the Yjs binding rebuilds the document (initial render, reconnect, remote changes) every block becomes "equal but
 * not identical", and from then on each keystroke deep-compares every block of the page in `matchesNode` (≈ 7 ms per
 * key on 5 000 blocks). After each update the equal nodes are swapped in, so the next comparison is an identity check.
 */
export function refreshDescs(view: EditorView) {
  const docView = (view as unknown as { docView?: { children?: Desc[] } }).docView;
  const children = docView?.children;
  if (!children) return;
  const doc = view.state.doc;
  let j = 0;
  for (const d of children) {
    if (!d.node) continue; // decoration widgets
    if (j >= doc.childCount) return;
    const n = doc.child(j++);
    if (d.node !== n && d.node.eq(n)) d.node = n;
  }
}

export const ViewIdentity = Extension.create({
  name: 'kbViewIdentity',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('kbViewIdentity'),
        view(view) {
          refreshDescs(view);
          return {
            update(v, prev) {
              if (v.state.doc !== prev.doc) refreshDescs(v);
            },
          };
        },
      }),
    ];
  },
});
