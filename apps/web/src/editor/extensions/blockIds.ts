import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import { BLOCK_TYPES, newId } from '@kb/shared';

const TYPES = new Set<string>(BLOCK_TYPES);

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
          tr.setMeta('addToHistory', false);
          return tr;
        },
      }),
    ];
  },
});
