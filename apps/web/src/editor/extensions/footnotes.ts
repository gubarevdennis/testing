/**
 * Footnotes in the editor (R-EDITOR-038, D-36). The note text lives in the footnote node itself (shared schema); here:
 *  - the reference is a superscript number (CSS counter = document order, never stored, so numbering can't go stale);
 *  - selecting a reference (click, arrows, Enter on it) opens a popover with a small ProseMirror editor bound to the
 *    node's content (the classic ProseMirror footnote pattern): every keystroke is a step of the page's own transaction
 *    stream, so collaboration, Undo/Redo (Ctrl+Z inside the popover = the page's undo) and history work unchanged;
 *  - «Сноска» (/-menu, Ctrl+Alt+F like Word, toolbar) inserts a reference after the selection and opens it;
 *  - the notes list under the page (FootnotesList) and the «↓ к списку» / «↑ к тексту» links navigate both ways.
 */
import type { Editor } from '@tiptap/core';
import { EditorState, NodeSelection, TextSelection, type Transaction } from '@tiptap/pm/state';
import { EditorView, type NodeView } from '@tiptap/pm/view';
import { StepMap } from '@tiptap/pm/transform';
import { keymap } from '@tiptap/pm/keymap';
import { baseKeymap, toggleMark } from '@tiptap/pm/commands';
import type { Node as PMNode } from '@tiptap/pm/model';

export const FOOTNOTE_OPEN_EVENT = 'kb:footnote-focus';

/** Number of the footnote at `pos` (1-based, document order). */
export function footnoteNumberAt(doc: PMNode, pos: number): number {
  let n = 0;
  let found = 0;
  doc.descendants((node, p) => {
    if (found) return false;
    if (node.type.name === 'footnote') {
      n++;
      if (p === pos) found = n;
      return false;
    }
    return node.isBlock || node.inlineContent ? true : false;
  });
  return found || n + 1;
}

/** Footnotes of the document in reading order. */
export function listFootnotes(doc: PMNode): Array<{ pos: number; text: string; number: number }> {
  const out: Array<{ pos: number; text: string; number: number }> = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'footnote') {
      out.push({ pos, text: node.textBetween(0, node.content.size, ' ', (n) => (n.type.name === 'hardBreak' ? '\n' : '')), number: out.length + 1 });
      return false;
    }
    return true;
  });
  return out;
}

/** Inserts a footnote after the selection (or at the cursor) and opens it for typing. One Undo step. */
export function insertFootnote(editor: Editor): boolean {
  const { state } = editor;
  const type = state.schema.nodes.footnote;
  if (!type) return false;
  const { $to } = state.selection;
  if (!$to.parent.inlineContent || $to.parent.type.spec.code || !$to.parent.canReplaceWith($to.index(), $to.index(), type)) return false;
  const pos = state.selection.to;
  const tr = state.tr.insert(pos, type.create());
  tr.setSelection(NodeSelection.create(tr.doc, pos)).scrollIntoView();
  editor.view.dispatch(tr);
  editor.view.focus();
  return true;
}

/** Selects (and so opens) the footnote at `pos`, scrolling it into view. */
export function openFootnote(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== 'footnote') return;
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)).scrollIntoView());
  editor.view.focus();
  editor.view.nodeDOM(pos) instanceof HTMLElement && (editor.view.nodeDOM(pos) as HTMLElement).scrollIntoView({ block: 'center' });
}

/** Scrolls the notes list to the note of the footnote at `pos` and highlights it. */
export function revealNote(pos: number) {
  window.dispatchEvent(new CustomEvent(FOOTNOTE_OPEN_EVENT, { detail: { pos } }));
}

interface Props {
  editor: Editor;
  node: PMNode;
  getPos: () => number | undefined;
  view: EditorView;
}

/** The reference in the text + the popover editor of its note. */
export class FootnoteView implements NodeView {
  dom: HTMLElement;
  private ref: HTMLElement;
  private node: PMNode;
  private inner: EditorView | null = null;
  private popover: HTMLElement | null = null;
  private outer: EditorView;
  private getPos: () => number | undefined;
  private editor: Editor;

  constructor(p: Props) {
    this.node = p.node;
    this.outer = p.view;
    this.getPos = p.getPos;
    this.editor = p.editor;
    this.dom = document.createElement('span');
    this.dom.className = 'kb-footnote';
    this.dom.setAttribute('data-type', 'footnote');
    this.dom.contentEditable = 'false';
    this.ref = document.createElement('sup');
    this.ref.className = 'kb-footnote-ref';
    this.ref.setAttribute('role', 'button');
    this.ref.setAttribute('tabindex', '-1');
    this.ref.setAttribute('aria-haspopup', 'dialog');
    this.updateLabel();
    this.dom.append(this.ref);
    // a click on the reference opens the note (editors: ProseMirror selects the node first; a second click on an already
    // selected reference re-opens it; readers: toggles)
    this.ref.addEventListener('mousedown', (e) => {
      if (!this.outer.editable) {
        e.preventDefault();
        if (this.popover) this.close();
        else this.open();
        return;
      }
      setTimeout(() => {
        const sel = this.outer.state.selection;
        if (!this.popover && sel instanceof NodeSelection && sel.from === this.getPos()) this.open();
      }, 0);
    });
  }

  private updateLabel() {
    const text = this.node.textContent.trim();
    this.ref.setAttribute('aria-label', 'Сноска' + (text ? ': ' + text.slice(0, 200) : ' (пустая)'));
    this.ref.title = text.slice(0, 300) || 'Пустая сноска';
    this.dom.classList.toggle('is-empty', !text);
  }

  selectNode() {
    this.dom.classList.add('ProseMirror-selectednode');
    if (!this.popover) this.open();
  }

  deselectNode() {
    this.dom.classList.remove('ProseMirror-selectednode');
    if (this.popover && !this.inner?.hasFocus()) this.close();
  }

  private open() {
    const pop = document.createElement('span');
    pop.className = 'kb-footnote-popover';
    pop.setAttribute('role', 'dialog');
    const pos = this.getPos();
    const number = pos == null ? '' : String(footnoteNumberAt(this.outer.state.doc, pos));
    pop.setAttribute('aria-label', `Сноска ${number}`);
    const head = document.createElement('span');
    head.className = 'kb-footnote-head';
    const title = document.createElement('span');
    title.textContent = `Сноска ${number}`;
    const toList = document.createElement('button');
    toList.type = 'button';
    toList.className = 'btn ghost sm';
    toList.textContent = '↓ К списку сносок';
    toList.addEventListener('mousedown', (e) => e.preventDefault());
    toList.addEventListener('click', () => {
      const p = this.getPos();
      if (p != null) revealNote(p);
    });
    head.append(title, toList);
    if (this.outer.editable) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn ghost sm';
      del.textContent = 'Удалить';
      del.setAttribute('aria-label', 'Удалить сноску');
      del.addEventListener('mousedown', (e) => e.preventDefault());
      del.addEventListener('click', () => {
        const p = this.getPos();
        if (p == null) return;
        this.close();
        this.outer.dispatch(this.outer.state.tr.delete(p, p + this.node.nodeSize).scrollIntoView());
        this.outer.focus();
      });
      head.append(del);
    }
    const body = document.createElement('span');
    body.className = 'kb-footnote-body';
    pop.append(head, body);
    this.dom.append(pop);
    this.popover = pop;
    const outerEditor = this.editor;
    const mark = (name: string) => {
      const t = this.outer.state.schema.marks[name];
      return t ? toggleMark(t) : () => false;
    };
    this.inner = new EditorView(body, {
      state: EditorState.create({
        doc: this.node,
        plugins: [
          keymap({
            'Mod-z': () => outerEditor.commands.undo(),
            'Mod-я': () => outerEditor.commands.undo(),
            'Mod-y': () => outerEditor.commands.redo(),
            'Shift-Mod-z': () => outerEditor.commands.redo(),
            'Mod-b': mark('bold'),
            'Mod-i': mark('italic'),
            'Mod-u': mark('underline'),
            Enter: (state, dispatch) => {
              const br = state.schema.nodes.hardBreak;
              if (dispatch && br) dispatch(state.tr.replaceSelectionWith(br.create()).scrollIntoView());
              return true;
            },
            'Shift-Enter': (state, dispatch) => {
              const br = state.schema.nodes.hardBreak;
              if (dispatch && br) dispatch(state.tr.replaceSelectionWith(br.create()).scrollIntoView());
              return true;
            },
            Escape: () => this.backToText(),
            'Mod-Enter': () => this.backToText(),
          }),
          keymap(baseKeymap),
        ],
      }),
      editable: () => this.outer.editable,
      dispatchTransaction: (tr) => this.dispatchInner(tr),
      attributes: { class: 'kb-footnote-editor', 'aria-label': `Текст сноски ${number}`, role: 'textbox' },
      handleDOMEvents: {
        mousedown: () => {
          // a click into the note while the page has the focus moves the focus into the note
          if (this.outer.hasFocus()) this.inner?.focus();
          return false;
        },
        blur: (_v, e) => {
          // the focus left the note (not to a button of the popover): it closes; the text stays where it was
          const next = (e as FocusEvent).relatedTarget as Node | null;
          if (next && this.dom.contains(next)) return false;
          setTimeout(() => {
            if (this.inner && !this.inner.hasFocus() && !this.outer.hasFocus()) this.close();
          }, 0);
          return false;
        },
      },
    });
    if (this.outer.editable)
      setTimeout(() => {
        if (!this.inner) return;
        this.inner.focus();
        this.inner.dispatch(this.inner.state.tr.setSelection(TextSelection.atEnd(this.inner.state.doc)));
      }, 0);
  }

  /** Esc / Ctrl+Enter in the note: caret right after the reference in the text. */
  private backToText(): boolean {
    const p = this.getPos();
    this.close();
    if (p == null) return true;
    const after = p + this.node.nodeSize;
    this.outer.dispatch(this.outer.state.tr.setSelection(TextSelection.create(this.outer.state.doc, after)));
    this.outer.focus();
    return true;
  }

  private close() {
    this.inner?.destroy();
    this.inner = null;
    this.popover?.remove();
    this.popover = null;
  }

  private dispatchInner(tr: Transaction) {
    if (!this.inner) return;
    const { state, transactions } = this.inner.state.applyTransaction(tr);
    this.inner.updateState(state);
    if (tr.getMeta('fromOutside')) return;
    const pos = this.getPos();
    if (pos == null) return;
    const outerTr = this.outer.state.tr;
    const offset = StepMap.offset(pos + 1);
    for (const t of transactions) for (const step of t.steps) {
      const mapped = step.map(offset);
      if (mapped) outerTr.step(mapped);
    }
    if (outerTr.docChanged) this.outer.dispatch(outerTr);
  }

  update(node: PMNode) {
    if (!node.sameMarkup(this.node)) return false;
    this.node = node;
    this.updateLabel();
    if (this.inner) {
      const state = this.inner.state;
      const start = node.content.findDiffStart(state.doc.content);
      if (start != null) {
        let { a: endA, b: endB } = node.content.findDiffEnd(state.doc.content)!;
        const overlap = start - Math.min(endA, endB);
        if (overlap > 0) {
          endA += overlap;
          endB += overlap;
        }
        this.inner.dispatch(state.tr.replace(start, endB, node.slice(start, endA)).setMeta('fromOutside', true));
      }
    }
    return true;
  }

  destroy() {
    this.close();
  }

  stopEvent(event: Event) {
    return !!this.popover && this.popover.contains(event.target as Node);
  }

  ignoreMutation() {
    return true;
  }
}
