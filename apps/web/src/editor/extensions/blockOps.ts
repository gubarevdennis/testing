import { Extension, InputRule, type Editor } from '@tiptap/core';
import { NodeSelection, TextSelection, Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { ySyncPluginKey, yUndoPluginKey } from '@tiptap/y-tiptap';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { isInTable } from '@tiptap/pm/tables';
import { moveTableRow, moveTableColumn } from '../tableOps';
import { CONTAINERS, moveOutTransaction } from '../blockDrop';

/** Finds the top-most block (direct child of the doc or of a container like column/callout) around the selection. */
export function currentBlock(state: EditorState): { node: PMNode; pos: number; depth: number } | null {
  const { $from } = state.selection;
  if (state.selection instanceof NodeSelection && state.selection.node.isBlock) return { node: state.selection.node, pos: state.selection.from, depth: $from.depth + 1 };
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    const parent = $from.node(d - 1);
    if (node.isBlock && (parent.type.name === 'doc' || ['column', 'callout', 'blockquote', 'detailsContent', 'tableCell', 'tableHeader'].includes(parent.type.name))) {
      // list items move together with their list only when the list is the direct child
      if (['listItem', 'taskItem'].includes(node.type.name)) continue;
      return { node, pos: $from.before(d), depth: d };
    }
  }
  return null;
}

/**
 * Dispatches a structural change as its own Undo step (R-HISTORY-017): the Yjs undo manager merges changes made within
 * 500 ms, so two quick moves — or typing right before a move — would otherwise be undone together.
 */
export function dispatchAtomic(editor: Editor, tr: Transaction) {
  const um = yUndoPluginKey.getState(editor.state)?.undoManager;
  um?.stopCapturing();
  editor.view.dispatch(tr);
  um?.stopCapturing();
}

export function blockAt(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos);
  return node ? { node, pos } : null;
}

export function moveBlock(editor: Editor, dir: -1 | 1, at?: number): boolean {
  const { state } = editor;
  if (at == null && blockRangeKey.getState(state)) return moveBlockRange(editor, dir);
  const b = at != null ? blockAt(editor, at) : currentBlock(state);
  if (!b) return false;
  const $pos = state.doc.resolve(b.pos);
  const index = $pos.index();
  const parent = $pos.parent;
  const target = index + dir;
  if (target < 0 || target >= parent.childCount) {
    // first/last block of a column, callout, quote or toggle: leaves the container (keyboard alternative to dragging out)
    const tr = parent.type.name !== 'doc' ? moveOutTransaction(state, { from: b.pos, to: b.pos + b.node.nodeSize }, dir) : null;
    if (!tr) return false;
    dispatchAtomic(editor, tr);
    return true;
  }
  const sibling = parent.child(target);
  const tr = state.tr;
  const offset = state.selection.from - b.pos;
  let newPos: number;
  if (dir === -1) {
    newPos = b.pos - sibling.nodeSize;
    tr.delete(b.pos, b.pos + b.node.nodeSize).insert(newPos, b.node);
  } else {
    const after = b.pos + b.node.nodeSize;
    tr.delete(after, after + sibling.nodeSize).insert(b.pos, sibling);
    newPos = b.pos + sibling.nodeSize;
  }
  if (b.node.isAtom || state.selection instanceof NodeSelection) tr.setSelection(NodeSelection.create(tr.doc, newPos));
  else tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(newPos + Math.max(1, offset), tr.doc.content.size))));
  dispatchAtomic(editor, tr.scrollIntoView());
  return true;
}

export function duplicateBlock(editor: Editor, at?: number): boolean {
  const b = at != null ? blockAt(editor, at) : currentBlock(editor.state);
  if (!b) return false;
  const copy = stripIds(b.node);
  const end = b.pos + b.node.nodeSize;
  const tr = editor.state.tr.insert(end, copy);
  tr.setSelection(TextSelection.near(tr.doc.resolve(end + 1)));
  dispatchAtomic(editor, tr.scrollIntoView());
  return true;
}

/** Copies a node without block ids (new ids are assigned by ClientBlockIds). */
export function stripIds(node: PMNode): PMNode {
  const json = node.toJSON();
  const walk = (n: any) => {
    if (n.attrs && 'id' in n.attrs) n.attrs = { ...n.attrs, id: null };
    n.content?.forEach(walk);
  };
  walk(json);
  return node.type.schema.nodeFromJSON(json);
}

export function deleteBlock(editor: Editor, at?: number): boolean {
  const b = at != null ? blockAt(editor, at) : currentBlock(editor.state);
  if (!b) return false;
  dispatchAtomic(editor, editor.state.tr.delete(b.pos, b.pos + b.node.nodeSize).scrollIntoView());
  return true;
}

export function selectBlock(editor: Editor, at?: number): boolean {
  const b = at != null ? blockAt(editor, at) : currentBlock(editor.state);
  if (!b) return false;
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, b.pos)));
  return true;
}

/** Selects the movable block around the selected one (column set around a column's block, callout around its block…). */
export function selectParentBlock(editor: Editor): boolean {
  const { state } = editor;
  const $pos = state.selection.$from;
  let d = $pos.depth;
  if (d === 0) return false;
  // the container itself, or the block around it when it cannot move alone (a column → its column set)
  while (d > 0 && !CONTAINERS.has($pos.node(d - 1).type.name)) d--;
  if (d === 0) return false;
  editor.view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, $pos.before(d))));
  return true;
}

function exitDocumentEnd(editor: Editor, onlyAtBottomEdge: boolean): boolean {
  const { state, view } = editor;
  const last = state.doc.lastChild;
  if (!editor.isEditable || !last || (last.type.name === 'paragraph' && last.childCount === 0)) {
    if (!onlyAtBottomEdge && last) {
      editor.commands.setTextSelection(state.doc.content.size - 1);
      return true;
    }
    return false;
  }
  if (last.isTextblock) return false;
  const lastStart = state.doc.content.size - last.nodeSize;
  if (state.selection.from < lastStart) {
    if (onlyAtBottomEdge) return false;
  } else if (onlyAtBottomEdge && !view.endOfTextblock('down')) return false;
  const end = state.doc.content.size;
  const tr = state.tr.insert(end, state.schema.nodes.paragraph.create());
  tr.setSelection(TextSelection.create(tr.doc, end + 1));
  view.dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Multi-block selection (R-EDITOR-068, UX21-186): Esc selects the current block, Shift+↑/↓ then extends the selection
 * by whole sibling blocks. The range is kept in plugin state (block boundaries, mapped through changes) and shown as a
 * text selection over the blocks; Backspace/Delete remove the blocks entirely, Alt+Shift+↑/↓ moves them together.
 */
export const blockRangeKey = new PluginKey<{ from: number; to: number } | null>('kbBlockRange');
const SET_RANGE = 'kbSetBlockRange';

function rangeSelection(state: EditorState, from: number, to: number) {
  const first = state.doc.nodeAt(from);
  const $to = state.doc.resolve(to);
  const last = $to.nodeBefore;
  const a = first?.isTextblock ? from + 1 : from;
  const b = last?.isTextblock ? to - 1 : to;
  return TextSelection.create(state.doc, a, b);
}

/** Selects whole sibling blocks [from, to) as a block range (shown and handled like Esc + Shift+↑/↓). */
export function withBlockRange(tr: Transaction, from: number, to: number): Transaction {
  return tr.setSelection(rangeSelection({ doc: tr.doc } as EditorState, from, to)).setMeta(SET_RANGE, { from, to });
}

function setBlockRange(editor: Editor, from: number, to: number) {
  const tr = editor.state.tr.setSelection(rangeSelection(editor.state, from, to)).setMeta(SET_RANGE, { from, to });
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

/** Selects the top-level blocks with indexes first..last (inclusive) as a block range, without scrolling (lasso). */
export function selectTopLevelBlocks(editor: Editor, first: number, last: number): boolean {
  const doc = editor.state.doc;
  if (!doc.childCount) return false;
  const a = Math.max(0, Math.min(first, last));
  const b = Math.min(doc.childCount - 1, Math.max(first, last));
  let from = 0;
  for (let i = 0; i < a; i++) from += doc.child(i).nodeSize;
  let to = from;
  for (let i = a; i <= b; i++) to += doc.child(i).nodeSize;
  const cur = blockRangeKey.getState(editor.state);
  if (cur && cur.from === from && cur.to === to) return true;
  editor.view.dispatch(editor.state.tr.setSelection(rangeSelection(editor.state, from, to)).setMeta(SET_RANGE, { from, to }));
  return true;
}

/** Extends the block selection by one sibling block up or down. */
export function extendBlockSelection(editor: Editor, dir: -1 | 1): boolean {
  const { state } = editor;
  let range = blockRangeKey.getState(state);
  if (!range) {
    if (!(state.selection instanceof NodeSelection) || !state.selection.node.isBlock) return false;
    range = { from: state.selection.from, to: state.selection.to };
  }
  const $from = state.doc.resolve(range.from);
  const parent = $from.parent;
  const startIndex = $from.index();
  const endIndex = state.doc.resolve(range.to).index($from.depth); // exclusive
  if (dir === 1) {
    if (endIndex >= parent.childCount) return true;
    return setBlockRange(editor, range.from, range.to + parent.child(endIndex).nodeSize);
  }
  if (startIndex <= 0) return true;
  return setBlockRange(editor, range.from - parent.child(startIndex - 1).nodeSize, range.to);
}

function deleteBlockRange(editor: Editor): boolean {
  const range = blockRangeKey.getState(editor.state);
  if (!range) return false;
  const tr = editor.state.tr.delete(range.from, range.to);
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(range.from, tr.doc.content.size))));
  dispatchAtomic(editor, tr.scrollIntoView());
  return true;
}

/** Moves the selected blocks past the neighbouring sibling, keeping their order and ids. */
export function moveBlockRange(editor: Editor, dir: -1 | 1): boolean {
  const { state } = editor;
  const range = blockRangeKey.getState(state);
  if (!range) return false;
  const $from = state.doc.resolve(range.from);
  const parent = $from.parent;
  const startIndex = $from.index();
  const endIndex = state.doc.resolve(range.to).index($from.depth);
  const slice = state.doc.slice(range.from, range.to);
  const tr = state.tr;
  let from: number;
  if (dir === -1) {
    if (startIndex <= 0) return true;
    const size = parent.child(startIndex - 1).nodeSize;
    tr.delete(range.from, range.to).insert(range.from - size, slice.content);
    from = range.from - size;
  } else {
    if (endIndex >= parent.childCount) return true;
    const size = parent.child(endIndex).nodeSize;
    tr.delete(range.from, range.to).insert(range.from + size, slice.content);
    from = range.from + size;
  }
  const to = from + (range.to - range.from);
  tr.setSelection(rangeSelection({ doc: tr.doc } as EditorState, from, to)).setMeta(SET_RANGE, { from, to });
  dispatchAtomic(editor, tr.scrollIntoView());
  return true;
}

/**
 * Backspace at the very start of a heading turns it into a paragraph (text kept), at the start of a quote it takes the
 * paragraph out of the quote; only the next Backspace merges with the previous block (R-EDITOR-065, R-EDITOR-034).
 */
function resetTypeAtStart(editor: Editor): boolean {
  const { selection } = editor.state;
  if (!selection.empty || !(selection instanceof TextSelection)) return false;
  const { $from } = selection;
  if ($from.parentOffset !== 0) return false;
  // right after a Markdown shortcut ("## ") Backspace undoes the shortcut (Tiptap's undoInputRule) instead
  if (editor.state.plugins.some((p) => (p.spec as { isInputRules?: boolean }).isInputRules && p.getState(editor.state))) return false;
  if ($from.parent.type.name === 'heading') return editor.commands.setParagraph();
  if ($from.depth >= 2 && $from.node(-1).type.name === 'blockquote' && $from.index(-1) === 0) return editor.commands.lift('blockquote');
  return false;
}

/** Keyboard resize of a selected image (R-EDITOR-052): ±10 % of the text width, 80 px at least, never wider than the text. */
export function resizeSelectedImage(editor: Editor, dir: -1 | 1): boolean {
  const sel = editor.state.selection;
  if (sel instanceof NodeSelection && sel.node.type.name === 'inlineImage') {
    // a picture in a line of text: ±25 % of its size, 12 px at least (R-MEDIA-012)
    const container = editor.view.dom.clientWidth || 720;
    const cur = (sel.node.attrs.width as number | null) ?? Math.min((sel.node.attrs.naturalWidth as number | null) ?? 48, container);
    const next = Math.max(12, Math.min(container, Math.round(cur * (dir > 0 ? 1.25 : 0.8))));
    if (next === cur) return true;
    const tr = editor.state.tr.setNodeMarkup(sel.from, undefined, { ...sel.node.attrs, width: next });
    tr.setSelection(NodeSelection.create(tr.doc, sel.from));
    dispatchAtomic(editor, tr);
    return true;
  }
  if (!(sel instanceof NodeSelection) || sel.node.type.name !== 'image' || sel.node.attrs.align === 'full') return false;
  const container = editor.view.dom.clientWidth || 720;
  const natural = sel.node.attrs.naturalWidth as number | null;
  const cur = (sel.node.attrs.width as number | null) ?? Math.min(natural ?? container, container);
  const next = Math.max(80, Math.min(container, Math.round(cur + dir * container * 0.1)));
  if (next === cur) return true;
  const tr = editor.state.tr.setNodeMarkup(sel.from, undefined, { ...sel.node.attrs, width: next });
  tr.setSelection(NodeSelection.create(tr.doc, sel.from));
  dispatchAtomic(editor, tr);
  return true;
}

function inTableNoRange(editor: Editor) {
  return isInTable(editor.state) && !blockRangeKey.getState(editor.state);
}

/** Ctrl/Cmd+A selects the text of the current block first, the whole article on the second press (R-EDITOR-068). */
function selectAllStepwise(editor: Editor): boolean {
  const { state } = editor;
  const sel = state.selection;
  if (!(sel instanceof TextSelection)) return false;
  const { $from, $to } = sel;
  if (!$from.sameParent($to) || !$from.parent.isTextblock || $from.parent.type.spec.code) return false;
  const start = $from.start();
  const end = $from.end();
  if (end === start || (sel.from === start && sel.to === end)) return false; // second press → default "select all"
  editor.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, start, end)));
  return true;
}

/**
 * Keyboard shortcuts and Markdown shortcuts beyond StarterKit:
 *  "> " → toggle block, "\" " → quote (as agreed in spec v2.0), Mod+D duplicate, Alt+Shift+↑/↓ move block, Esc select block.
 */
export const BlockOps = Extension.create({
  name: 'blockOps',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      'Mod-d': () => duplicateBlock(this.editor),
      'Mod-a': () => selectAllStepwise(this.editor),
      'Shift-ArrowDown': () => extendBlockSelection(this.editor, 1),
      'Shift-ArrowUp': () => extendBlockSelection(this.editor, -1),
      Backspace: () => deleteBlockRange(this.editor) || resetTypeAtStart(this.editor),
      Delete: () => deleteBlockRange(this.editor),
      // inside a table the same keys move rows/columns (R-TABLE-003); the table itself moves via the block menu
      'Alt-Shift-ArrowUp': () => (inTableNoRange(this.editor) ? (moveTableRow(this.editor, -1), true) : moveBlock(this.editor, -1)),
      'Alt-Shift-ArrowDown': () => (inTableNoRange(this.editor) ? (moveTableRow(this.editor, 1), true) : moveBlock(this.editor, 1)),
      'Alt-Shift-ArrowLeft': () => resizeSelectedImage(this.editor, -1) || (inTableNoRange(this.editor) && (moveTableColumn(this.editor, -1), true)),
      'Alt-Shift-ArrowRight': () => resizeSelectedImage(this.editor, 1) || (inTableNoRange(this.editor) && (moveTableColumn(this.editor, 1), true)),
      Escape: () => {
        const sel = this.editor.state.selection;
        // a selected block inside a column / callout / quote: Esc again selects the enclosing block (to move it whole)
        if (sel instanceof NodeSelection) return selectParentBlock(this.editor);
        return selectBlock(this.editor);
      },
      // Leaving the last block of the document (table, image, callout…) by keyboard creates a paragraph below it.
      ArrowDown: () => exitDocumentEnd(this.editor, true),
      'Mod-End': () => exitDocumentEnd(this.editor, false),
      'Mod-k': () => {
        window.dispatchEvent(new CustomEvent('kb:link-open'));
        return true;
      },
      'Mod-Shift-m': () => {
        window.dispatchEvent(new CustomEvent('kb:comment'));
        return true;
      },
      'Mod-Alt-0': () => this.editor.chain().focus().setParagraph().run(),
      'Mod-Shift-c': () => {
        window.dispatchEvent(new CustomEvent('kb:copy-markdown'));
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin<{ from: number; to: number } | null>({
        key: blockRangeKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const set = tr.getMeta(SET_RANGE);
            if (set !== undefined) return set;
            if (!value) return null;
            // remote changes keep the block selection (mapped); any local edit or selection change ends it
            if (tr.getMeta('kbStableSelection') && !tr.docChanged) return value;
            if (tr.getMeta(ySyncPluginKey)?.isChangeOrigin) {
              const from = tr.mapping.map(value.from, 1);
              const to = tr.mapping.map(value.to, -1);
              return to > from ? { from, to } : null;
            }
            if (tr.selectionSet || tr.docChanged) return null;
            return value;
          },
        },
        props: {
          attributes: (state): Record<string, string> => (blockRangeKey.getState(state) ? { 'data-block-range': 'true' } : {}),
          decorations(state) {
            const r = blockRangeKey.getState(state);
            if (!r) return null;
            const decos: Decoration[] = [];
            const $from = state.doc.resolve(r.from);
            let pos = r.from;
            for (let i = $from.index(); pos < r.to && i < $from.parent.childCount; i++) {
              const n = $from.parent.child(i);
              decos.push(Decoration.node(pos, pos + n.nodeSize, { class: 'kb-block-in-range' }));
              pos += n.nodeSize;
            }
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
  addInputRules() {
    const editor = this.editor;
    return [
      new InputRule({
        find: /^>\s$/,
        handler: ({ range, chain }) => {
          if (!editor.schema.nodes.details) return null;
          chain().deleteRange(range).setDetails().run();
        },
      }),
      new InputRule({
        find: /^["«“]\s$/,
        handler: ({ range, chain }) => {
          chain().deleteRange(range).toggleBlockquote().run();
        },
      }),
      new InputRule({
        find: /^!(info|tip|warning|important|error|note)\s$/,
        handler: ({ range, chain, match }) => {
          const v = match[1] === 'note' ? 'info' : match[1];
          chain().deleteRange(range).wrapIn('callout', { variant: v }).run();
        },
      }),
    ];
  },
});
