import { Node, mergeAttributes } from '@tiptap/core';

/** Multi-column layout: 2..4 columns with adjustable relative widths. Stacks vertically on narrow screens. */
export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,4}',
  defining: true,
  isolating: true,
  draggable: true,
  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'columns', class: 'kb-columns' }), 0];
  },
});

export const Column = Node.create({
  name: 'column',
  content: 'block+',
  isolating: true,
  defining: true,
  addAttributes() {
    return {
      width: {
        default: null,
        parseHTML: (el) => {
          const w = parseFloat(el.getAttribute('data-width') ?? '');
          return Number.isFinite(w) && w > 0 ? w : null;
        },
        renderHTML: (a) => (a.width ? { 'data-width': String(a.width), style: `flex-grow:${a.width}` } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'column', class: 'kb-column' }), 0];
  },
});
