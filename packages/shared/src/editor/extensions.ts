import { Extension, type AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { TextStyle, Color, FontFamily, FontSize } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Details, DetailsSummary, DetailsContent } from '@tiptap/extension-details';
import { InlineMath, BlockMath } from '@tiptap/extension-mathematics';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';
import { Callout } from './nodes/callout.js';
import { Columns, Column } from './nodes/columns.js';
import { ImageBlock, InlineImage, FileBlock, Embed } from './nodes/media.js';
import { Footnote } from './nodes/footnote.js';
import { PageLink, PageMention, UserMention, CommentMark } from './nodes/links.js';
import { Mermaid, TableOfContentsBlock, SyncedBlock, CollectionView } from './nodes/special.js';
import { sanitizeHref } from './url.js';

export { CONTENT_SCHEMA_VERSION } from './version.js';

/** Block node types that carry a stable `id` attribute (anchors, comments, history, block links). */
export const BLOCK_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'horizontalRule',
  'table',
  'details',
  'callout',
  'columns',
  'column',
  'image',
  'fileBlock',
  'embed',
  'pageLink',
  'mermaid',
  'toc',
  'syncedBlock',
  'collectionView',
  'blockMath',
] as const;

export const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32] as const;
export const FONT_FAMILIES = {
  sans: 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  serif: '"PT Serif", Georgia, "Times New Roman", serif',
  mono: '"JetBrains Mono", "Fira Code", Consolas, "Courier New", monospace',
} as const;

const cellAttrs = {
  align: {
    default: null,
    parseHTML: (el: HTMLElement) => {
      const v = el.getAttribute('data-align') || el.style?.textAlign || el.getAttribute('align');
      return v && ['left', 'center', 'right', 'justify'].includes(v) ? v : null;
    },
    renderHTML: (a: Record<string, any>) => (a.align ? { 'data-align': a.align, style: `text-align:${a.align}` } : {}),
  },
  valign: {
    default: null,
    parseHTML: (el: HTMLElement) => {
      const v = el.getAttribute('data-valign') || el.style?.verticalAlign || el.getAttribute('valign');
      return v && ['top', 'middle', 'bottom'].includes(v) ? v : null;
    },
    renderHTML: (a: Record<string, any>) => (a.valign ? { 'data-valign': a.valign, style: `vertical-align:${a.valign}` } : {}),
  },
  background: {
    default: null,
    parseHTML: (el: HTMLElement) => el.getAttribute('data-background'),
    renderHTML: (a: Record<string, any>) => (a.background ? { 'data-background': a.background } : {}),
  },
};

const KbTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttrs };
  },
});
const KbTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellAttrs };
  },
});

/** Toggle block; `level` > 0 renders the summary as a heading ("toggle heading"). */
const KbDetails = Details.extend({
  draggable: true,
  addAttributes() {
    return {
      ...this.parent?.(),
      level: {
        default: 0,
        parseHTML: (el: HTMLElement) => Number(el.getAttribute('data-level') ?? 0) || 0,
        renderHTML: (a: Record<string, any>) => (a.level ? { 'data-level': String(a.level) } : {}),
      },
    };
  },
});

/** Stable block ids. Implemented here (not via UniqueID) so that ids are also enforced server-side on import/restore. */
export const BlockIdAttribute = Extension.create({
  name: 'blockId',
  addGlobalAttributes() {
    return [
      {
        types: [...BLOCK_TYPES],
        attributes: {
          id: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el: HTMLElement) => el.getAttribute('data-block-id') || null,
            renderHTML: (a: Record<string, any>) => (a.id ? { 'data-block-id': a.id, id: a.id } : {}),
          },
        },
      },
      {
        types: ['paragraph'],
        attributes: {
          variant: {
            default: null,
            parseHTML: (el: HTMLElement) => (el.getAttribute('data-variant') === 'lead' ? 'lead' : null),
            renderHTML: (a: Record<string, any>) => (a.variant ? { 'data-variant': a.variant, class: 'kb-lead' } : {}),
          },
        },
      },
    ];
  },
});

export const lowlight = createLowlight(common);

export interface SchemaExtensionOptions {
  /** Client passes extra plugins (collaboration, drag handle...) separately; schema must stay identical. */
  placeholder?: boolean;
}

/** Extensions defining the canonical document schema, shared by browser and server. */
export function createSchemaExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      undoRedo: false, // history is provided by the collaboration undo manager (own operations only)
      codeBlock: false,
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        isAllowedUri: (url: string) => sanitizeHref(url) !== null,
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null },
      },
      dropcursor: false,
      gapcursor: false,
      trailingNode: false,
    }),
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
    Table.configure({ resizable: true, allowTableNodeSelection: true }),
    TableRow,
    KbTableHeader,
    KbTableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    Subscript,
    Superscript,
    KbDetails.configure({ persist: true }),
    DetailsSummary,
    DetailsContent,
    InlineMath,
    BlockMath,
    Callout,
    Columns,
    Column,
    ImageBlock,
    InlineImage,
    Footnote,
    FileBlock,
    Embed,
    PageLink,
    PageMention,
    UserMention,
    CommentMark,
    Mermaid,
    TableOfContentsBlock,
    SyncedBlock,
    CollectionView,
    BlockIdAttribute,
  ];
}
