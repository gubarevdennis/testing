/**
 * Safe block type conversion (R-EDITOR-003, R-EDITOR-067). Text block conversions (paragraph ↔ heading ↔ list …)
 * keep text, marks and the block id (Tiptap setNode copies attributes). Converting to a code block is the one
 * lossy case: code allows neither marks nor inline nodes, so mentions/page links/formulas are first replaced by
 * their text and the user is asked to confirm when formatting, links or comment anchors would be removed.
 */
import type { Editor } from '@tiptap/core';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';

export interface CodeConversionLoss {
  /** Text with marks (bold, links, colours, comment anchors…) */
  formatted: boolean;
  /** Inline nodes that will be replaced by their text (mentions, page links, formulas). */
  inlineNodes: number;
}

function atomText(n: PMNode): string {
  switch (n.type.name) {
    case 'mention':
      return '@' + (n.attrs.label ?? '');
    case 'pageMention':
      return n.attrs.title || 'Страница';
    case 'inlineMath':
      return n.attrs.latex ?? '';
    case 'hardBreak':
      return '\n';
    default:
      return n.textContent;
  }
}

/** Textblocks touched by the selection. */
function textblocks(doc: PMNode, from: number, to: number) {
  const out: Array<{ node: PMNode; pos: number }> = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock) {
      out.push({ node, pos });
      return false;
    }
    return true;
  });
  if (!out.length) {
    const $f = doc.resolve(from);
    if ($f.parent.isTextblock) out.push({ node: $f.parent, pos: $f.before() });
  }
  return out;
}

export function codeConversionLoss(state: EditorState, from = state.selection.from, to = state.selection.to): CodeConversionLoss {
  const res: CodeConversionLoss = { formatted: false, inlineNodes: 0 };
  for (const { node } of textblocks(state.doc, from, to)) {
    if (node.type.spec.code) continue;
    node.forEach((child) => {
      if (child.isText && child.marks.length) res.formatted = true;
      if (!child.isText) res.inlineNodes++;
    });
  }
  return res;
}

/** Replaces inline atom nodes in the text blocks touched by [from, to] with plain text (so converting to code keeps the text). */
export function inlineNodesToText(tr: Transaction, from: number, to: number): Transaction {
  const repl: Array<{ pos: number; size: number; text: string }> = [];
  for (const { node, pos } of textblocks(tr.doc, from, to)) {
    if (node.type.spec.code) continue;
    node.forEach((child, offset) => {
      if (!child.isText) repl.push({ pos: pos + 1 + offset, size: child.nodeSize, text: atomText(child) });
    });
  }
  for (const r of repl.sort((a, b) => b.pos - a.pos)) {
    if (r.text) tr.replaceWith(r.pos, r.pos + r.size, tr.doc.type.schema.text(r.text));
    else tr.delete(r.pos, r.pos + r.size);
  }
  return tr;
}

/**
 * Converts the selected blocks into code. `confirmLoss` is asked only when formatting would be removed; returns
 * false when the user declined (nothing changes).
 */
export async function convertToCodeBlock(editor: Editor, confirmLoss: (loss: CodeConversionLoss) => Promise<boolean>): Promise<boolean> {
  const { from, to } = editor.state.selection;
  if (editor.isActive('codeBlock')) return editor.chain().focus().toggleCodeBlock().run();
  const loss = codeConversionLoss(editor.state, from, to);
  if (loss.formatted && !(await confirmLoss(loss))) return false;
  if (loss.inlineNodes) {
    const tr = inlineNodesToText(editor.state.tr, from, to);
    editor.view.dispatch(tr);
  }
  return editor.chain().focus().toggleCodeBlock().run();
}
