import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { ySyncPluginKey, relativePositionToAbsolutePosition, isMisresolvedTextPosition } from '@tiptap/y-tiptap';

/** Marks the selection correction (other plugins treat it like the remote change it belongs to). */
export const STABLE_SELECTION_META = 'kbStableSelection';

/**
 * Keeps the local caret/selection anchored to the text it was in while colleagues edit (R-EDITOR-022, R-EDITOR-001).
 *
 * Found by tests/e2e/editor-p0-core.spec.ts: @tiptap/y-tiptap 3.0.x "recovers" a selection endpoint whenever the text
 * of its paragraph changed in a remote update (isMisresolvedAfterStructuralChange treats any text change as a
 * structural move) and falls back to the old offset inside the block. A colleague typing before the caret in the same
 * paragraph therefore made the caret/selection stay at the same offset — i.e. jump relative to the text — and the next
 * keystroke went to the wrong place. This plugin re-resolves the Yjs relative positions captured before the remote
 * transaction (exact, item based) and only defers to the library when the text item itself was deleted.
 */
export const StableSelection = Extension.create({
  name: 'kbStableSelection',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('kbStableSelection'),
        appendTransaction(trs, _old, state) {
          const remote = trs.find((t) => t.getMeta(ySyncPluginKey)?.isChangeOrigin);
          if (!remote || remote.getMeta(ySyncPluginKey)?.isUndoRedoOperation || !(state.selection instanceof TextSelection)) return null;
          const sync = ySyncPluginKey.getState(state);
          const binding = sync?.binding;
          const rel = binding?.beforeTransactionSelection;
          if (!binding || !rel || rel.type !== 'text' || !rel.anchor || !rel.head) return null;
          const anchor = relativePositionToAbsolutePosition(binding.doc, binding.type, rel.anchor, binding.mapping);
          const head = relativePositionToAbsolutePosition(binding.doc, binding.type, rel.head, binding.mapping);
          if (anchor === null || head === null) return null;
          if (isMisresolvedTextPosition(binding.doc, rel.anchor, anchor) || isMisresolvedTextPosition(binding.doc, rel.head, head)) return null;
          const size = state.doc.content.size;
          if (anchor > size || head > size) return null;
          const sel = state.selection;
          if (sel.anchor === anchor && sel.head === head) return null;
          try {
            const next = TextSelection.between(state.doc.resolve(anchor), state.doc.resolve(head));
            // a remote change must not become part of the local undo history
            return state.tr.setSelection(next).setMeta('addToHistory', false).setMeta(STABLE_SELECTION_META, true);
          } catch {
            return null;
          }
        },
      }),
    ];
  },
});
