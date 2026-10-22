import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { ySyncPluginKey } from '@tiptap/y-tiptap';

const WINDOW_MS = 10 * 60_000;

export interface ConflictInfo {
  blockId: string | null;
  block: Record<string, unknown>;
  afterBlockId: string | null;
  reason: 'deleted' | 'moved';
}

/**
 * Detects concurrent "edit vs delete" and "edit vs move": when a remote change removes a top-level block that this user
 * edited during the last minutes, the user's version of the block would vanish silently (CRDT merges drop edits inside
 * deleted nodes). A block move is a delete + insert of a copy, so a remote move of a block the user was editing arrives
 * as the same id at another place with the mover's (older) content. The guard keeps the latest local version of every
 * block the user touches and hands lost ones to `onConflict`.
 */
export const ConflictGuard = Extension.create<{ onConflict: (c: ConflictInfo) => void }>({
  name: 'conflictGuard',
  addOptions() {
    return { onConflict: () => undefined };
  },
  addProseMirrorPlugins() {
    const touched = new Map<string, { at: number; json: Record<string, unknown>; prev: string | null }>();
    const onConflict = () => this.options.onConflict;
    const record = (doc: PMNode, from: number, to: number) => {
      const lo = Math.max(0, Math.min(from, doc.content.size));
      const hi = Math.max(lo, Math.min(to, doc.content.size));
      let prev: string | null = null;
      doc.forEach((node, offset, index) => {
        const end = offset + node.nodeSize;
        if (end >= lo && offset <= hi && node.attrs.id) {
          touched.set(node.attrs.id, { at: Date.now(), json: node.toJSON(), prev: index > 0 ? (doc.child(index - 1).attrs.id ?? null) : prev });
        }
        prev = node.attrs.id ?? prev;
      });
    };
    return [
      new Plugin({
        key: new PluginKey('conflictGuard'),
        appendTransaction(trs, oldState, newState) {
          const remote = trs.some((t) => t.getMeta(ySyncPluginKey)?.isChangeOrigin && !t.getMeta(ySyncPluginKey)?.isUndoRedoOperation);
          const changed = trs.some((t) => t.docChanged);
          if (!changed) return null;
          if (!remote) {
            for (const tr of trs)
              tr.mapping.maps.forEach((map, i) => {
                map.forEach((_os, _oe, ns, ne) => {
                  // map the range forward to the final document
                  const rest = tr.mapping.slice(i + 1);
                  record(newState.doc, rest.map(ns, -1), rest.map(ne, 1));
                });
              });
            return null;
          }
          if (!touched.size) return null;
          const present = new Set<string>();
          newState.doc.forEach((n) => n.attrs.id && present.add(n.attrs.id));
          const now = Date.now();
          for (const [id, t] of touched) {
            if (now - t.at > WINDOW_MS) {
              touched.delete(id);
              continue;
            }
            const before = oldState.doc.content.size > 0 ? topWithPrev(oldState.doc, id) : null;
            if (!before) continue;
            if (!present.has(id)) {
              touched.delete(id);
              onConflict()({ blockId: id, block: t.json, afterBlockId: t.prev, reason: 'deleted' });
              continue;
            }
            const after = topWithPrev(newState.doc, id);
            // moved by someone else (new neighbour) and our text is gone with the old copy
            if (after && after.prev !== before.prev && after.node.textContent !== before.node.textContent && !after.node.eq(before.node)) {
              touched.delete(id);
              onConflict()({ blockId: id, block: before.node.toJSON(), afterBlockId: after.prev, reason: 'moved' });
            }
          }
          return null;
        },
      }),
    ];
  },
});

function topWithPrev(doc: PMNode, id: string): { node: PMNode; prev: string | null } | null {
  let found: { node: PMNode; prev: string | null } | null = null;
  let prev: string | null = null;
  doc.forEach((n) => {
    if (!found && n.attrs.id === id) found = { node: n, prev };
    prev = n.attrs.id ?? prev;
  });
  return found;
}
