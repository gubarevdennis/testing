import { Extension, InputRule, type Editor } from '@tiptap/core';
import { NodeSelection, TextSelection, type EditorState } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';

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

export function blockAt(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos);
  return node ? { node, pos } : null;
}

export function moveBlock(editor: Editor, dir: -1 | 1, at?: number): boolean {
  const { state } = editor;
  const b = at != null ? blockAt(editor, at) : currentBlock(state);
  if (!b) return false;
  const $pos = state.doc.resolve(b.pos);
  const index = $pos.index();
  const parent = $pos.parent;
  const target = index + dir;
  if (target < 0 || target >= parent.childCount) return false;
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
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

export function duplicateBlock(editor: Editor, at?: number): boolean {
  const b = at != null ? blockAt(editor, at) : currentBlock(editor.state);
  if (!b) return false;
  const copy = stripIds(b.node);
  const end = b.pos + b.node.nodeSize;
  const tr = editor.state.tr.insert(end, copy);
  tr.setSelection(TextSelection.near(tr.doc.resolve(end + 1)));
  editor.view.dispatch(tr.scrollIntoView());
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
  editor.view.dispatch(editor.state.tr.delete(b.pos, b.pos + b.node.nodeSize).scrollIntoView());
  return true;
}

export function selectBlock(editor: Editor, at?: number): boolean {
  const b = at != null ? blockAt(editor, at) : currentBlock(editor.state);
  if (!b) return false;
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, b.pos)));
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
 * Keyboard shortcuts and Markdown shortcuts beyond StarterKit:
 *  "> " → toggle block, "\" " → quote (as agreed in spec v2.0), Mod+D duplicate, Alt+Shift+↑/↓ move block, Esc select block.
 */
export const BlockOps = Extension.create({
  name: 'blockOps',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      'Mod-d': () => duplicateBlock(this.editor),
      'Alt-Shift-ArrowUp': () => moveBlock(this.editor, -1),
      'Alt-Shift-ArrowDown': () => moveBlock(this.editor, 1),
      Escape: () => {
        if (this.editor.state.selection instanceof NodeSelection) return false;
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
