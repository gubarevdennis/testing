import type { AnyExtension, Editor } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { Placeholder, Dropcursor, Gapcursor, CharacterCount } from '@tiptap/extensions';
import type * as Y from 'yjs';
import { createSchemaExtensions, FRAGMENT_NAME } from '@kb/shared';
import type { CollabProvider } from '@kb/shared';
import { ImageView } from './nodeviews/ImageView';
import { CalloutView, FileView, EmbedView, PageLinkView, PageMentionView, MermaidView, TocView, SyncedBlockView, CollectionBlockView, CodeBlockView } from './nodeviews/blocks';
import { ClientBlockIds } from './extensions/blockIds';
import { BlockOps } from './extensions/blockOps';
import { Uploads } from './extensions/uploads';
import { SmartPaste } from './extensions/paste';
import { slashExtension, mentionExtension, pageLinkExtension, emojiExtension } from './extensions/suggest';
import { FindInPage } from './extensions/find';
import { ConflictGuard, type ConflictInfo } from './extensions/conflictGuard';
import type { CommandContext } from './commands';

const VIEWS: Record<string, any> = {
  image: ImageView,
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
    if (!view) return ext;
    return ext.extend({ addNodeView: () => ReactNodeViewRenderer(view) });
  });
  const exts: AnyExtension[] = [
    ...schema,
    Collaboration.configure({ document: o.doc, field: FRAGMENT_NAME }),
    Placeholder.configure({
      includeChildren: true,
      placeholder: ({ node, editor, pos }) => {
        if (node.type.name === 'heading') return `Заголовок ${node.attrs.level}`;
        if (node.type.name === 'detailsSummary') return 'Заголовок раскрывающегося блока';
        if (node.type.name === 'paragraph') {
          const $p = editor.state.doc.resolve(pos);
          if ($p.depth === 0 && editor.state.doc.childCount === 1) return 'Начните писать или нажмите «/» для вставки блока';
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
    Uploads.configure({ pageId: () => o.pageId }),
    SmartPaste,
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
