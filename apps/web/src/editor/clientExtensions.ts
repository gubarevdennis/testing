import type { AnyExtension, Editor } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { Placeholder, Dropcursor, Gapcursor, CharacterCount } from '@tiptap/extensions';
import type * as Y from 'yjs';
import { createSchemaExtensions, FRAGMENT_NAME } from '@kb/shared';
import type { CollabProvider } from '@kb/shared';
import { ImageView } from './nodeviews/ImageView';
import { InlineImageView } from './nodeviews/InlineImageView';
import { FootnoteView, insertFootnote } from './extensions/footnotes';
import { CalloutView, FileView, EmbedView, PageLinkView, PageMentionView, MermaidView, TocView, SyncedBlockView, CollectionBlockView, CodeBlockView } from './nodeviews/blocks';
import { ClientBlockIds } from './extensions/blockIds';
import { BlockOps } from './extensions/blockOps';
import { BlockDragDecorations } from './menus/blockDrag';
import { StableSelection } from './extensions/stableSelection';
import { EditorPerf } from './extensions/editorPerf';
import { HistoryBoundaries } from './extensions/historyBoundaries';
import { TableRepair } from './extensions/tableRepair';
import { Uploads } from './extensions/uploads';
import { SmartPaste } from './extensions/paste';
import { codeHighlightPlugin } from './extensions/codeHighlight';
import { PasteOptions } from './extensions/pasteOptions';
import { slashExtension, mentionExtension, pageLinkExtension, emojiExtension } from './extensions/suggest';
import { FindInPage } from './extensions/find';
import { ConflictGuard, type ConflictInfo } from './extensions/conflictGuard';
import type { CommandContext } from './commands';

const VIEWS: Record<string, any> = {
  image: ImageView,
  inlineImage: InlineImageView,
  callout: CalloutView,
  fileBlock: FileView,
  embed: EmbedView,
  pageLink: PageLinkView,
  pageMention: PageMentionView,
  mermaid: MermaidView,
  toc: TocView,
  syncedBlock: SyncedBlockView,
  collectionView: CollectionBlockView,
  codeBlock: CodeBlockView,
};

export interface ClientExtensionOptions {
  doc: Y.Doc;
  provider: CollabProvider | null;
  user: { name: string; color: string };
  pageId: string;
  commandContext: () => CommandContext;
  createChildPage: (title: string) => Promise<{ id: string; title: string } | null>;
  onMathClick: (kind: 'inline' | 'block', pos: number, latex: string) => void;
  onConflict: (c: ConflictInfo) => void;
}

/** Schema (shared with the server) + editing UI: node views, collaboration, menus, paste/upload handling. */
export function clientExtensions(o: ClientExtensionOptions): AnyExtension[] {
  const schema = createSchemaExtensions().map((ext: any) => {
    if (ext.name === 'inlineMath') return ext.configure({ onClick: (node: any, pos: number) => o.onMathClick('inline', pos, node.attrs.latex) });
    if (ext.name === 'blockMath') return ext.configure({ onClick: (node: any, pos: number) => o.onMathClick('block', pos, node.attrs.latex) });
    const view = VIEWS[ext.name];
    if (ext.name === 'footnote')
      // a plain ProseMirror node view with its own small editor for the note text (no React per reference)
      return ext.extend({
        addNodeView: () => (props: any) => new FootnoteView({ editor: props.editor, node: props.node, getPos: props.getPos, view: props.view }),
        addKeyboardShortcuts() {
          return { 'Mod-Alt-f': () => insertFootnote(this.editor), 'Mod-Alt-а': () => insertFootnote(this.editor) };
        },
      });
    if (ext.name === 'codeBlock')
      // the stock lowlight plugin walks the whole document twice per keystroke: incremental highlighting instead (PERF-D1)
      return ext.extend({
        addNodeView: () => ReactNodeViewRenderer(view),
        addProseMirrorPlugins() {
          const base = (this.parent?.() ?? []).filter((pl: any) => !String(pl.key).startsWith('lowlight$'));
          return [...base, codeHighlightPlugin(this.name)];
        },
      });
    if (!view) return ext;
    return ext.extend({ addNodeView: () => ReactNodeViewRenderer(view) });
  });
  const exts: AnyExtension[] = [
    ...schema,
    Collaboration.configure({ document: o.doc, field: FRAGMENT_NAME }),
    StableSelection,
    EditorPerf,
    HistoryBoundaries,
    TableRepair.configure({ provider: o.provider }),
    Placeholder.configure({
      includeChildren: true,
      placeholder: ({ node, editor, pos }) => {
        if (node.type.name === 'heading') return `Заголовок ${node.attrs.level}`;
        if (node.type.name === 'detailsSummary') return 'Заголовок раскрывающегося блока';
        if (node.type.name === 'paragraph') {
          // decorations are computed while the new state is being built, so editor.state may still be the previous one:
          // a position past its end must not throw (QA-D6, e.g. right after inserting columns)
          const doc = editor.state.doc;
          if (pos < 0 || pos > doc.content.size) return '';
          const $p = doc.resolve(pos);
          if ($p.depth === 0 && doc.childCount === 1) return 'Начните писать или нажмите «/» для вставки блока';
          return $p.depth === 0 ? 'Нажмите «/» для команд' : '';
        }
        return '';
      },
    }),
    Dropcursor.configure({ color: 'var(--accent)', width: 2 }),
    Gapcursor,
    CharacterCount,
    ClientBlockIds,
    BlockOps,
    BlockDragDecorations,
    Uploads.configure({ pageId: () => o.pageId }),
    SmartPaste,
    PasteOptions,
    FindInPage,
    ConflictGuard.configure({ onConflict: (c) => o.onConflict(c) }),
    slashExtension(o.commandContext),
    mentionExtension(),
    pageLinkExtension(o.createChildPage),
    emojiExtension(),
  ];
  if (o.provider) exts.push(CollaborationCaret.configure({ provider: o.provider, user: o.user, render: caret }));
  return exts;
}

function caret(user: { name: string; color: string }) {
  const el = document.createElement('span');
  el.className = 'collab-caret';
  el.style.borderColor = user.color;
  const label = document.createElement('span');
  label.className = 'collab-caret-label';
  label.style.background = user.color;
  label.textContent = user.name;
  el.append(label);
  return el;
}

export type { Editor };
