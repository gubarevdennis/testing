import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { ReplaceStep, AddMarkStep, RemoveMarkStep } from '@tiptap/pm/transform';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import { BLOCK_TYPES, newId } from '@kb/shared';

const TYPES = new Set<string>(BLOCK_TYPES);

/**
 * True when no step of the transaction can create, copy or remove a block: text typed or deleted inside one textblock,
 * marks added or removed. Such transactions (every keystroke) skip the whole-document id scan (PERF-D1).
 */
export function inlineOnly(tr: Transaction): boolean {
  return tr.steps.every((step, i) => {
    if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) return true;
    if (!(step instanceof ReplaceStep)) return false;
    const { from, to, slice } = step as unknown as { from: number; to: number; slice: import('@tiptap/pm/model').Slice };
    if (slice.openStart || slice.openEnd) return false;
    let inline = true;
    slice.content.forEach((n) => (inline &&= n.isInline));
    if (!inline) return false;
    const doc = tr.docs[i];
    const $from = doc.resolve(from);
    return $from.parent.isTextblock && (from === to || $from.sameParent(doc.resolve(to)));
  });
}

/**
 * Keeps a stable unique `id` on every block (anchors, comments, block history, block links).
 * Runs only for local transactions: remote changes already carry ids assigned by their author.
 */
export const ClientBlockIds = Extension.create({
  name: 'clientBlockIds',
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey('clientBlockIds'),
        appendTransaction(trs, _old, state) {
          if (!editor.isEditable || !trs.some((t) => t.docChanged) || trs.every((t) => t.getMeta(ySyncPluginKey)?.isChangeOrigin)) return null;
          if (trs.every((t) => !t.docChanged || t.getMeta(ySyncPluginKey)?.isChangeOrigin || inlineOnly(t))) return null;
          const seen = new Set<string>();
          let tr = state.tr;
          let changed = false;
          state.doc.descendants((node, pos) => {
            if (!TYPES.has(node.type.name)) return;
            const id = node.attrs.id as string | null;
            if (!id || seen.has(id)) {
              const fresh = newId();
              tr = tr.setNodeAttribute(pos, 'id', fresh);
              seen.add(fresh);
              changed = true;
            } else seen.add(id);
          });
          if (!changed) return null;
          // Part of the same undo step as the change that created the blocks: excluding it from history made the
          // Yjs undo manager skip the whole change (Ctrl+Z could not undo paste, Enter or table insert).
          return tr;
        },
      }),
    ];
  },
});
