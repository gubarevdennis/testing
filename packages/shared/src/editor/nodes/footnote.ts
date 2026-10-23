import { Node } from '@tiptap/core';

/**
 * Footnote (R-EDITOR-038, D-36). The note lives inside its reference: an inline atom node whose content is the note text
 * (text with marks and line breaks). Consequences, all intended:
 *  - numbering is the document order of the nodes (CSS counter in the editor, computed by exporters) — never stored,
 *    so inserting, deleting, moving or concurrent editing can never leave numbers or notes out of sync;
 *  - copy / cut / paste / move to another page / duplicate carry the note with its reference; Undo restores both;
 *  - the note text is collaborative character by character (it is ordinary Yjs XML text inside the node).
 * HTML form: `<span data-type="footnote">note</span>`; exporters turn it into a numbered reference and a notes list
 * (packages/shared/src/editor/html-normalize.ts footnotesToEndnotes), importers recognise such lists back.
 */
export const Footnote = Node.create({
  name: 'footnote',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  content: '(text | hardBreak)*',
  parseHTML() {
    return [{ tag: 'span[data-type="footnote"]', priority: 70 }];
  },
  renderHTML() {
    return ['span', { 'data-type': 'footnote', class: 'kb-footnote' }, 0];
  },
});
