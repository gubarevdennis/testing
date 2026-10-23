import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState, type Selection } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { ySyncPluginKey, yUndoPluginKey, relativePositionToAbsolutePosition, isMisresolvedTextPosition } from '@tiptap/y-tiptap';

/** Marks the selection correction (other plugins treat it like the remote change it belongs to). */
export const STABLE_SELECTION_META = 'kbStableSelection';

function textblockCount(doc: PMNode) {
  let n = 0;
  doc.descendants((node) => {
    if (node.isTextblock) {
      n++;
      return false;
    }
    return true;
  });
  return n;
}

/**
 * A caret that stood at the end of a paragraph stays at its end when a colleague appends text there (QA-E1).
 *
 * @tiptap/y-tiptap 3.0 anchors a caret to the character before it (assoc −1), so text a colleague types at the very
 * end of the paragraph used to appear *after* the local caret. Someone who had pressed End / Ctrl+End to continue
 * after the paragraph then split the colleague's still-arriving sentence with Enter (a split moves the text after the
 * caret into the new paragraph, and the colleague's next keystrokes stay in the old one) or typed into the middle of
 * it. Conservative: only a collapsed caret at the end of a textblock whose text before the caret is unchanged, never
 * when the remote change joined blocks (then the text after the caret is the joined block, not an append), and never
 * while the user is typing there: two people typing at the same end then keep their own words together (each caret
 * stays before the other's text) instead of interleaving letter by letter.
 */
function keepAtTextblockEnd(oldState: EditorState, state: EditorState, sel: Selection): Selection | null {
  const old = oldState.selection;
  if (!(old instanceof TextSelection) || !old.empty || !(sel instanceof TextSelection) || !sel.empty) return null;
  const $old = old.$from;
  if (!$old.parent.isTextblock || $old.parentOffset !== $old.parent.content.size) return null;
  const $cur = sel.$from;
  const parent = $cur.parent;
  if (!parent.isTextblock || $cur.parentOffset === parent.content.size) return null;
  // the text before the caret is exactly the paragraph as it was: everything after the caret was appended
  if (parent.textBetween(0, $cur.parentOffset, '\n', '￼') !== $old.parent.textBetween(0, $old.parent.content.size, '\n', '￼')) return null;
  if (textblockCount(state.doc) < textblockCount(oldState.doc)) return null;
  return TextSelection.create(state.doc, $cur.end());
}

/**
 * After Redo the caret goes to the end of what was redone (QA-E6). The undo manager restores a selection stored as Yjs
 * relative positions, but Redo re-creates the content as new items, so positions that pointed into the undone text are
 * gone and the caret fell back to the start of the last block: the next Enter or keystroke then split or prefixed that
 * block instead of continuing after it. A range selection (e.g. redone formatting) is kept as restored.
 */
function redoCaret(oldState: EditorState, state: EditorState, apply: (s: Selection) => ReturnType<EditorState['tr']['setSelection']> | null) {
  const um = (yUndoPluginKey.getState(state) as { undoManager?: { redoing?: boolean } } | undefined)?.undoManager;
  if (!um?.redoing || !state.selection.empty) return null;
  const end = oldState.doc.content.findDiffEnd(state.doc.content);
  if (!end) return null;
  try {
    return apply(TextSelection.near(state.doc.resolve(Math.min(end.b, state.doc.content.size)), -1));
  } catch {
    return null;
  }
}

/** Local typing within this time counts as "typing there" for keepAtTextblockEnd. */
const TYPING_MS = 1500;

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
    let lastLocalEdit = 0;
    return [
      new Plugin({
        key: new PluginKey('kbStableSelection'),
        appendTransaction(trs, oldState, state) {
          const remote = trs.find((t) => t.getMeta(ySyncPluginKey)?.isChangeOrigin);
          if (!remote && trs.some((t) => t.docChanged && t.getMeta('addToHistory') !== false)) lastLocalEdit = Date.now();
          if (!remote || !(state.selection instanceof TextSelection)) return null;
          const apply = (next: Selection) => {
            const cur = state.selection;
            if (cur.anchor === next.anchor && cur.head === next.head) return null;
            // a remote change must not become part of the local undo history
            return state.tr.setSelection(next).setMeta('addToHistory', false).setMeta(STABLE_SELECTION_META, true);
          };
          if (remote.getMeta(ySyncPluginKey)?.isUndoRedoOperation) return redoCaret(oldState, state, apply);
          let next: Selection = state.selection;
          const sync = ySyncPluginKey.getState(state);
          const binding = sync?.binding;
          const rel = binding?.beforeTransactionSelection;
          if (binding && rel && rel.type === 'text' && rel.anchor && rel.head) {
            const anchor = relativePositionToAbsolutePosition(binding.doc, binding.type, rel.anchor, binding.mapping);
            const head = relativePositionToAbsolutePosition(binding.doc, binding.type, rel.head, binding.mapping);
            const size = state.doc.content.size;
            if (anchor !== null && head !== null && anchor <= size && head <= size && !isMisresolvedTextPosition(binding.doc, rel.anchor, anchor) && !isMisresolvedTextPosition(binding.doc, rel.head, head)) {
              try {
                next = TextSelection.between(state.doc.resolve(anchor), state.doc.resolve(head));
              } catch {
                next = state.selection;
              }
            }
          }
          return apply((Date.now() - lastLocalEdit > TYPING_MS ? keepAtTextblockEnd(oldState, state, next) : null) ?? next);
        },
      }),
    ];
  },
});
