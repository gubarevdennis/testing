import { Node, mergeAttributes } from '@tiptap/core';

export const CALLOUT_VARIANTS = ['info', 'tip', 'important', 'warning', 'error', 'example', 'neutral'] as const;
export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];

export const CALLOUT_DEFAULT_ICONS: Record<CalloutVariant, string> = {
  info: 'ℹ️',
  tip: '💡',
  important: '❗',
  warning: '⚠️',
  error: '⛔',
  example: '📝',
  neutral: '📌',
};

/** Coloured note block with an icon; may contain any blocks (paragraphs, lists, tables, images). */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  draggable: true,
  addAttributes() {
    return {
      variant: {
        default: 'info',
        parseHTML: (el) => {
          const v = el.getAttribute('data-variant');
          return (CALLOUT_VARIANTS as readonly string[]).includes(v ?? '') ? v : 'info';
        },
        renderHTML: (a) => ({ 'data-variant': a.variant }),
      },
      icon: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-icon'),
        renderHTML: (a) => (a.icon ? { 'data-icon': a.icon } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }, { tag: 'aside' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'callout', class: 'kb-callout' }), 0];
  },
});
