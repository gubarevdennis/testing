import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Fragment, Slice, type Node as PMNode, type Schema } from '@tiptap/pm/model';
import { ySyncPluginKey } from '@tiptap/y-tiptap';

/**
 * Paste options (R-CLIPBOARD-009): after a formatted paste the user can switch between
 *  - «Сохранить форматирование» — the sanitised formatting of the source (default),
 *  - «Объединить» — keep the structure (paragraphs, lists, tables, links, bold/italic) but take the page's styles:
 *    headings become paragraphs, colours, highlights, fonts and sizes are dropped,
 *  - «Только текст» — plain text paragraphs.
 * The pasted range is tracked in plugin state (mapped through later changes) and replaced in one step.
 */
export type PasteMode = 'keep' | 'merge' | 'text';

export interface PasteOptionsState {
  from: number;
  to: number;
  mode: PasteMode;
  /** The pasted content as inserted (formatted). */
  original: Slice;
  text: string;
}

export const pasteOptionsKey = new PluginKey<PasteOptionsState | null>('kbPasteOptions');
const SET = 'kbPasteOptionsSet';

/** SmartPaste records the clipboard flavours of the paste that is about to be applied by ProseMirror. */
let incoming: { html: boolean; text: string } | null = null;
export function notePaste(info: { html: boolean; text: string } | null) {
  incoming = info;
}

const MERGE_MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'link', 'code', 'subscript', 'superscript']);

/** «Объединить»: page styles, source structure. */
export function mergeFormatting(fragment: Fragment, schema: Schema): Fragment {
  const nodes: PMNode[] = [];
  fragment.forEach((node) => {
    if (node.isText) {
      nodes.push(node.mark(node.marks.filter((m) => MERGE_MARKS.has(m.type.name))));
      return;
    }
    const content = mergeFormatting(node.content, schema);
    if (node.type.name === 'heading') {
      nodes.push(schema.nodes.paragraph.create({ id: node.attrs.id ?? null }, content));
      return;
    }
    const attrs = { ...node.attrs };
    if ('textAlign' in attrs) attrs.textAlign = null;
    if (node.type.name === 'paragraph' && 'variant' in attrs) attrs.variant = null;
    nodes.push(node.type.create(attrs, content, node.marks));
  });
  return Fragment.from(nodes);
}

/** «Только текст»: one paragraph per line. */
export function textParagraphs(text: string, schema: Schema): Fragment {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  return Fragment.from(lines.map((l) => schema.nodes.paragraph.create(null, l ? schema.text(l) : undefined)));
}

export function pasteSlice(st: PasteOptionsState, mode: PasteMode, schema: Schema): Slice {
  if (mode === 'keep') return st.original;
  if (mode === 'merge') return new Slice(mergeFormatting(st.original.content, schema), st.original.openStart, st.original.openEnd);
  const inline = st.original.openStart > 0 && st.original.content.childCount === 1 && !st.text.includes('\n');
  return inline ? new Slice(Fragment.from(schema.text(st.text || ' ')), 0, 0) : new Slice(textParagraphs(st.text, schema), 1, 1);
}

/** Replaces the last paste with the chosen variant. */
export function applyPasteMode(editor: Editor, mode: PasteMode): boolean {
  const st = pasteOptionsKey.getState(editor.state);
  if (!st || st.mode === mode) return false;
  const slice = pasteSlice(st, mode, editor.schema);
  const tr = editor.state.tr.replaceRange(st.from, st.to, slice);
  const to = tr.mapping.map(st.to, 1);
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(to, tr.doc.content.size)), -1));
  tr.setMeta(SET, { ...st, to, mode });
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return true;
}

export function closePasteOptions(editor: Editor) {
  if (pasteOptionsKey.getState(editor.state)) editor.view.dispatch(editor.state.tr.setMeta(SET, null));
}

function isPaste(tr: Transaction) {
  return tr.getMeta('paste') === true || tr.getMeta('uiEvent') === 'paste';
}

export const PasteOptions = Extension.create({
  name: 'kbPasteOptions',
  priority: 1001, // Esc closes the offer before BlockOps turns Esc into block selection
  addKeyboardShortcuts() {
    return {
      Escape: () => {
        if (!pasteOptionsKey.getState(this.editor.state)) return false;
        closePasteOptions(this.editor);
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin<PasteOptionsState | null>({
        key: pasteOptionsKey,
        state: {
          init: () => null,
          apply(tr, value, old: EditorState, next: EditorState) {
            const set = tr.getMeta(SET);
            if (set !== undefined) return set;
            if (isPaste(tr) && tr.docChanged) {
              const info = incoming;
              incoming = null;
              if (!info?.html) return null;
              const from = tr.mapping.map(old.selection.from, -1);
              const to = next.selection.to;
              if (to <= from) return null;
              return { from, to, mode: 'keep', original: next.doc.slice(from, to), text: info.text || next.doc.textBetween(from, to, '\n') };
            }
            if (!value) return null;
            if (tr.getMeta(ySyncPluginKey)?.isChangeOrigin || tr.getMeta('appendedTransaction')) {
              const from = tr.mapping.map(value.from, -1);
              const to = tr.mapping.map(value.to, 1);
              return to > from ? { ...value, from, to } : null;
            }
            // the user continued working: the offer disappears
            if (tr.docChanged || tr.selectionSet) return null;
            return value;
          },
        },
      }),
    ];
  },
});
