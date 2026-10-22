import { Node, Mark, mergeAttributes } from '@tiptap/core';

/** Block-level link to another page (child page or related page). Title is cached for export only; UI resolves the live title by id. */
export const PageLink = Node.create({
  name: 'pageLink',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      pageId: { default: null },
      title: { default: '' },
      child: { default: false },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-type="page-link"]',
        getAttrs: (el) => {
          const e = el as HTMLElement;
          return { pageId: e.getAttribute('data-page-id'), title: e.textContent?.trim() ?? '', child: e.getAttribute('data-child') === 'true' };
        },
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    const a = node.attrs;
    return [
      'div',
      { 'data-type': 'page-link', 'data-page-id': a.pageId ?? '', 'data-child': String(!!a.child), class: 'kb-page-link', ...(HTMLAttributes.id ? { id: HTMLAttributes.id } : {}) },
      ['a', { href: `/p/${a.pageId}` }, a.title || 'Страница'],
    ];
  },
});

/** Inline reference to a page or a block of a page ([[link]]). */
export const PageMention = Node.create({
  name: 'pageMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      pageId: { default: null },
      blockId: { default: null },
      title: { default: '' },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'a[data-type="page-mention"]',
        getAttrs: (el) => {
          const e = el as HTMLElement;
          return { pageId: e.getAttribute('data-page-id'), blockId: e.getAttribute('data-block-id'), title: e.textContent?.trim() ?? '' };
        },
      },
    ];
  },
  renderHTML({ node }) {
    const a = node.attrs;
    const href = `/p/${a.pageId}${a.blockId ? '#' + a.blockId : ''}`;
    const attrs: Record<string, string> = { 'data-type': 'page-mention', 'data-page-id': a.pageId ?? '', href, class: 'kb-page-mention' };
    if (a.blockId) attrs['data-block-id'] = a.blockId;
    return ['a', attrs, a.title || 'Страница'];
  },
  renderText({ node }) {
    return node.attrs.title || 'Страница';
  },
});

/** Mention of a person (@). */
export const UserMention = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { id: { default: null }, label: { default: '' } };
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-type="mention"]',
        getAttrs: (el) => {
          const e = el as HTMLElement;
          return { id: e.getAttribute('data-id'), label: e.getAttribute('data-label') ?? e.textContent?.replace(/^@/, '') ?? '' };
        },
      },
    ];
  },
  renderHTML({ node }) {
    return ['span', { 'data-type': 'mention', 'data-id': node.attrs.id ?? '', 'data-label': node.attrs.label, class: 'kb-mention' }, '@' + node.attrs.label];
  },
  renderText({ node }) {
    return '@' + node.attrs.label;
  },
});

/** Anchors a comment thread to a text range. Several threads may overlap. */
export const CommentMark = Mark.create({
  name: 'comment',
  excludes: '',
  inclusive: false,
  addAttributes() {
    return { threadId: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'span[data-comment-thread]', getAttrs: (el) => ({ threadId: (el as HTMLElement).getAttribute('data-comment-thread') }) }];
  },
  renderHTML({ HTMLAttributes, mark }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-comment-thread': mark.attrs.threadId, class: 'kb-comment-anchor' }), 0];
  },
});
