import { Node, mergeAttributes } from '@tiptap/core';

/** Mermaid diagram stored as editable source text; preview is rendered client-side in a sandbox. */
export const Mermaid = Node.create({
  name: 'mermaid',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  draggable: true,
  parseHTML() {
    return [
      { tag: 'pre[data-type="mermaid"]', preserveWhitespace: 'full' },
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        priority: 60,
        getAttrs: (el) => ((el as HTMLElement).querySelector('code.language-mermaid') ? {} : false),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['pre', mergeAttributes(HTMLAttributes, { 'data-type': 'mermaid', class: 'kb-mermaid' }), ['code', { class: 'language-mermaid' }, 0]];
  },
});

/** Auto-generated table of contents built from headings of the page. */
export const TableOfContentsBlock = Node.create({
  name: 'toc',
  group: 'block',
  atom: true,
  draggable: true,
  parseHTML() {
    return [{ tag: 'div[data-type="toc"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'toc', class: 'kb-toc' })];
  },
});

/** Live embed of a block from another page (single canonical source). Access is checked when resolving. */
export const SyncedBlock = Node.create({
  name: 'syncedBlock',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { sourcePageId: { default: null }, sourceBlockId: { default: null } };
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-type="synced-block"]',
        getAttrs: (el) => ({
          sourcePageId: (el as HTMLElement).getAttribute('data-source-page'),
          sourceBlockId: (el as HTMLElement).getAttribute('data-source-block'),
        }),
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'synced-block',
        'data-source-page': node.attrs.sourcePageId ?? '',
        'data-source-block': node.attrs.sourceBlockId ?? '',
        class: 'kb-synced',
      }),
    ];
  },
});

/** Inline view of a structured collection (knowledge registry). Data lives in the collection, not in this document. */
export const CollectionView = Node.create({
  name: 'collectionView',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { collectionId: { default: null }, viewId: { default: null } };
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-type="collection"]',
        getAttrs: (el) => ({
          collectionId: (el as HTMLElement).getAttribute('data-collection-id'),
          viewId: (el as HTMLElement).getAttribute('data-view-id'),
        }),
      },
    ];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'collection',
        'data-collection-id': node.attrs.collectionId ?? '',
        'data-view-id': node.attrs.viewId ?? '',
        class: 'kb-collection',
      }),
    ];
  },
});
