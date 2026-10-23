import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { ySyncPluginKey } from '@tiptap/y-tiptap';

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

interface Binding {
  syncedDoc: PMNode | null;
  _prosemirrorChanged(doc: PMNode, plan?: unknown): void;
  __kbFast?: boolean;
}

/**
 * The Yjs binding (y-tiptap 3.0) pushes the editor document into Yjs on *every* view update — also for transactions that
 * did not change the document (selection moves, plugin metadata such as its own follow-up transaction after each
 * keystroke). Each push diffs every top-level block against the Yjs fragment and converts the selection to relative
 * positions twice (linear in the position): roughly half of the per-keystroke cost on large pages. A push of the very
 * document object that was synced last is a no-op (it can change nothing in Yjs, and a position migration plan never
 * targets the synced document), so it is skipped.
 */
export function skipRedundantYSync(view: EditorView) {
  const binding = (ySyncPluginKey.getState(view.state) as { binding?: Binding } | undefined)?.binding;
  if (!binding || binding.__kbFast) return;
  const orig = binding._prosemirrorChanged;
  binding._prosemirrorChanged = function (this: Binding, doc: PMNode, plan?: unknown) {
    if (doc === this.syncedDoc) return;
    return orig.call(this, doc, plan);
  };
  binding.__kbFast = true;
}

/** Editor performance guards (PERF-D1): see refreshDescs and skipRedundantYSync. */
export const EditorPerf = Extension.create({
  name: 'kbEditorPerf',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('kbEditorPerf'),
        view(view) {
          skipRedundantYSync(view);
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
