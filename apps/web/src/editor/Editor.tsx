import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { useNavigate } from 'react-router-dom';
import type { Editor as TEditor } from '@tiptap/core';
import * as Y from 'yjs';
import { ChevronDown, ChevronUp, X, Download } from 'lucide-react';
import { TITLE_NAME, CONTENT_SCHEMA_VERSION, colorForUser, type PresenceUser } from '@kb/shared';
import { loadMarkdown } from '../lib/markdown';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import { openCollab, useSyncState, type CollabSession } from '../sync/collab';
import { clientExtensions } from './clientExtensions';
import { BubbleToolbar } from './menus/BubbleToolbar';
import { BlockHandle, TouchBlockActions } from './menus/BlockHandle';
import { TableToolbar } from './menus/TableToolbar';
import { PasteOptionsMenu } from './menus/PasteOptionsMenu';
import { startUploads, resumeUploads } from './extensions/uploads';
import { findKey } from './extensions/find';
import { ImageViewer } from '../components/ImageViewer';
import { Dialog } from '../components/ui/Dialog';
import { toast } from '../components/ui/Toast';
import { post } from '../api/client';
import { PagePicker } from './PagePicker';
import { ImageUrlDialog } from './ImageUrlDialog';
import { moveBlocksToPage } from './moveToPage';
import { blockRangeKey } from './extensions/blockOps';
import type { CommandContext } from './commands';
import type { ConflictInfo } from './extensions/conflictGuard';
import { BlockConflictHost, DocConflictDialog, useConflicts } from './ConflictDialog';
import { copyWithFeedback, useCopyPageCommands } from './clipboard/copy';
import { useSelectionMemory } from './selectionMemory';

export interface EditorHandle {
  editor: TEditor | null;
  session: CollabSession | null;
}

interface Props {
  pageId: string;
  spaceId: string;
  generation: string | null;
  canEdit: boolean;
  user: { id: string; name: string };
  autoFocusTitle?: boolean;
  /** A just-created page left empty: Esc in the empty title cancels its creation (no "Без названия" garbage). */
  onDiscardDraft?(): void;
  onReady?(h: EditorHandle): void;
  onPresence?(users: PresenceUser[]): void;
  onAccess?(canEdit: boolean, reason?: string): void;
  onTitle?(title: string): void;
  onComment?(info: { quote: string; blockId: string | null; from: number; to: number }): void;
  onCommentClick?(threadId: string): void;
  scrollToBlock?: string | null;
  wide?: boolean;
}

/** Applies a new title to the shared Y.Text with a minimal diff, so concurrent edits of the title merge. */
function setYTitle(t: Y.Text, next: string) {
  const cur = t.toString();
  if (cur === next) return;
  let s = 0;
  while (s < cur.length && s < next.length && cur[s] === next[s]) s++;
  let ec = cur.length;
  let en = next.length;
  while (ec > s && en > s && cur[ec - 1] === next[en - 1]) {
    ec--;
    en--;
  }
  t.doc!.transact(() => {
    if (ec > s) t.delete(s, ec - s);
    if (en > s) t.insert(s, next.slice(s, en));
  });
}

export function PageEditor(p: Props) {
  const [session, setSession] = useState<CollabSession | null>(null);
  const [fatal, setFatal] = useState<{ code: string; message: string } | null>(null);
  const [serverCanEdit, setServerCanEdit] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  // bumped after «accept the server version»: the document is reopened from a fresh local replica
  const [epoch, setEpoch] = useState(0);
  const [conflictOpen, setConflictOpen] = useState(true);
  const cbs = useRef(p);
  cbs.current = p;
  useEffect(() => {
    let synced: () => void = () => undefined;
    const firstSync = new Promise<void>((r) => (synced = r));
    let lastStorageWarning = 0;
    const s = openCollab(p.pageId, p.generation, p.user.id, {
      onSynced: () => synced(),
      onAccess: (canEdit, _level, reason) => {
        setServerCanEdit(canEdit);
        cbs.current.onAccess?.(canEdit, reason);
      },
      onPresence: (u) => cbs.current.onPresence?.(u),
      onFatal: (code, message) => {
        setConflictOpen(true);
        setFatal({ code, message });
      },
      // one warning per episode, not one per keystroke batch
      onStorageError: (message) => {
        if (Date.now() - lastStorageWarning < 30_000) return;
        lastStorageWarning = Date.now();
        toast.error(message);
      },
    });
    setSession(s);
    setReady(false);
    let alive = true;
    // Mount the editor only on real content: the local replica, then the server state (or offline after a short wait).
    // An editor started on an empty document would let normalising plugins write placeholder blocks into the CRDT.
    s.localReady
      .then(() => Promise.race([firstSync, new Promise((r) => setTimeout(r, navigator.onLine ? 4000 : 300))]))
      .then(() => alive && setReady(true));
    return () => {
      alive = false;
      s.destroy();
      setSession(null);
    };
  }, [p.pageId, p.generation, epoch]);
  if (!session || !ready) return <EditorSkeleton />;
  // Non-mergeable rejection of this device's changes: comparison dialog with three choices (R-COLLAB-036).
  const docConflict = !!fatal && DOC_CONFLICT_CODES.includes(fatal.code);
  return (
    <>
      {docConflict && conflictOpen && (
        <DocConflictDialog
          pageId={p.pageId}
          code={fatal!.code}
          message={fatal!.message}
          localDoc={() => yXmlFragmentToProsemirrorJSON(session.doc.getXmlFragment('default')) as Record<string, any>}
          localTitle={() => session.doc.getText(TITLE_NAME).toString()}
          localMarkdown={async () => (await loadMarkdown()).docToMarkdown(yXmlFragmentToProsemirrorJSON(session.doc.getXmlFragment('default')) as any, { markers: true }).markdown}
          schemaVersion={CONTENT_SCHEMA_VERSION}
          download={() => downloadLocalCopy(session)}
          acceptServer={async () => {
            await session.provider.discardUnsynced();
            await session.local.clearData().catch(() => undefined);
            // an editor of an outdated document format must be replaced by the current application
            if (fatal?.code === 'schema_outdated') return location.reload();
            setFatal(null);
            setServerCanEdit(null);
            setEpoch((e) => e + 1);
          }}
          onClose={() => setConflictOpen(false)}
        />
      )}
      {docConflict && !conflictOpen && (
        <div className="alert warning editor-conflicts" role="status" data-testid="doc-conflict-reminder">
          Конфликт не разрешён: ваши изменения на этом устройстве не приняты сервером.{' '}
          <button className="btn sm" onClick={() => setConflictOpen(true)}>
            Разрешить
          </button>
        </div>
      )}
      <LocalCopyGuard pageId={p.pageId} session={session} fatal={fatal} lostEdit={serverCanEdit === false} />
      <EditorInner key={session.pageId + (p.generation ?? '')} {...p} session={session} canEdit={p.canEdit && serverCanEdit !== false && !fatal} />
    </>
  );
}

/** Server refusals that are a conflict between this device's version and the server's (not a lost right). */
const DOC_CONFLICT_CODES = ['invalid_update', 'too_large', 'deleted', 'schema_outdated'];

export function EditorSkeleton() {
  return (
    <div className="editor-skeleton" aria-busy="true" aria-label="Загрузка документа">
      <div className="skeleton" style={{ height: 40, width: '55%' }} />
      <div className="skeleton" style={{ height: 14, width: '92%' }} />
      <div className="skeleton" style={{ height: 14, width: '86%' }} />
      <div className="skeleton" style={{ height: 14, width: '74%' }} />
    </div>
  );
}

/**
 * Whenever local work cannot reach the server (rejected change, page removed, edit right lost, local storage failure)
 * the user gets an explicit way to keep it. Never claims "nothing unsaved" while operations are queued.
 */
function LocalCopyGuard({ pageId, session, fatal, lostEdit }: { pageId: string; session: CollabSession; fatal: { code: string; message: string } | null; lostEdit: boolean }) {
  // derived values only: the counters change on every keystroke, the guard's output almost never (PERF-D1)
  const key = useSyncState((s) => {
    const i = s.pages[pageId];
    return i ? `${i.status === 'error' ? 1 : 0}|${(lostEdit || i.status === 'error') && i.pending > 0 ? 1 : 0}|${i.message ?? ''}` : '';
  });
  const [isError, hasPending, ...msg] = key.split('|');
  const sync = key ? { status: isError === '1' ? ('error' as const) : null, message: msg.join('|') || undefined } : null;
  const pending = hasPending === '1' ? 1 : 0;
  if (fatal) return <FatalBanner fatal={fatal} session={session} />;
  if ((lostEdit || sync?.status === 'error') && pending > 0)
    return <FatalBanner fatal={{ code: lostEdit ? 'forbidden' : 'error', message: sync?.message ?? (lostEdit ? 'Права на редактирование отозваны: часть изменений не отправлена на сервер.' : 'Изменения не удалось сохранить на сервере.') }} session={session} />;
  return null;
}

/** Shown when the server rejected changes or the page became unavailable: local work can always be saved. */
/** Saves the local replica (including unsent changes) as Markdown on the device. */
export async function downloadLocalCopy(session: CollabSession) {
  const { docToMarkdown } = await loadMarkdown();
  const json = yXmlFragmentToProsemirrorJSON(session.doc.getXmlFragment('default'));
  const title = session.doc.getText(TITLE_NAME).toString() || 'Страница';
  const { markdown } = docToMarkdown(json as any, { markers: true, frontMatter: { title } });
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${title.replace(/[\\/:*?"<>|]+/g, '_')} (локальная копия).md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function FatalBanner({ fatal, session }: { fatal: { code: string; message: string }; session: CollabSession }) {
  const download = () => downloadLocalCopy(session);
  const unsent = session.provider.pendingCount();
  return (
    <div className="alert error editor-fatal" role="alert">
      <div className="col" style={{ gap: 6 }}>
        <b>{fatal.message}</b>
        <span className="small">{unsent ? `На этом устройстве остаются неотправленные изменения (${unsent}). Сохраните локальную копию, чтобы ничего не потерять.` : 'Вы можете сохранить текущее содержимое на устройство.'}</span>
        <div>
          <button className="btn sm" onClick={download}>
            <Download size={14} /> Скачать локальную копию (Markdown)
          </button>
        </div>
      </div>
    </div>
  );
}

function EditorInner(p: Props & { session: CollabSession }) {
  const { session } = p;
  const ytitle = session.doc.getText(TITLE_NAME);
  const [title, setTitle] = useState(() => ytitle.toString());
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pick, setPick] = useState<null | 'link' | 'synced'>(null);
  const [moveRange, setMoveRange] = useState<{ from: number; to: number } | null>(null);
  const navigate = useNavigate();
  const [embed, setEmbed] = useState(false);
  const [imageUrl, setImageUrl] = useState(false);
  const [math, setMath] = useState<{ kind: 'inline' | 'block'; pos: number; latex: string } | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [flash, setFlash] = useState<{ top: number; left: number; width: number; height: number; id: string } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const user = useMemo(() => ({ name: p.user.name, color: colorForUser(p.user.id) }), [p.user]);

  useEffect(() => {
    const on = () => {
      const t = ytitle.toString();
      setTitle(t);
      p.onTitle?.(t);
    };
    ytitle.observe(on);
    on();
    return () => ytitle.unobserve(on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytitle]);

  const createChildPage = useCallback(
    async (t: string) => {
      try {
        const r = await post<{ page: { id: string; title: string } }>('/api/v1/pages', { spaceId: p.spaceId, parentId: p.pageId, title: t, requestId: crypto.randomUUID() });
        return { id: r.page.id, title: r.page.title };
      } catch (e) {
        toast.error((e as Error).message);
        return null;
      }
    },
    [p.spaceId, p.pageId],
  );

  useEffect(() => {
    // warm up the Markdown converter in the background (Markdown paste, copy as Markdown)
    const t = setTimeout(() => void loadMarkdown(), 1500);
    return () => clearTimeout(t);
  }, []);

  // Concurrent edit vs delete: keep the user's version on the server and offer to put it back.
  const onConflictRef = useRef<(c: ConflictInfo) => void>(() => undefined);
  onConflictRef.current = (c) => {
    void (async () => {
      let saved: { id: string } | null = null;
      try {
        saved = await post<{ id: string }>(`/api/v1/pages/${p.pageId}/conflicts`, c);
      } catch {
        /* offline: the dialog still lets the user restore locally */
      }
      // Never hidden: a comparison dialog with «keep both / accept server / keep mine» (R-COLLAB-036).
      useConflicts.getState().push({ key: crypto.randomUUID(), pageId: p.pageId, info: c, savedId: saved?.id ?? null, at: Date.now() });
    })();
  };

  const ctxRef = useRef<CommandContext>(null as any);
  const editor = useEditor(
    {
      extensions: clientExtensions({
        doc: session.doc,
        provider: session.provider,
        user,
        pageId: p.pageId,
        commandContext: () => ctxRef.current,
        createChildPage,
        onMathClick: (kind, pos, latex) => setMath({ kind, pos, latex }),
        onConflict: (c) => onConflictRef.current(c),
      }),
      editable: p.canEdit,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: { class: 'kb-editor', spellcheck: 'true', 'aria-label': 'Содержимое страницы', role: 'textbox', 'aria-multiline': 'true' },
        handleClickOn: (_view, _pos, _node, _nodePos, event) => {
          const thread = (event.target as HTMLElement).closest?.('[data-comment-thread]')?.getAttribute('data-comment-thread');
          if (thread) p.onCommentClick?.(thread);
          return false;
        },
      },
    },
    [session],
  );

  const editorRef = useRef<TEditor | null>(null);
  editorRef.current = editor;

  ctxRef.current = {
    pickFiles: (accept) => {
      if (!fileInput.current) return;
      fileInput.current.accept = accept;
      fileInput.current.click();
    },
    createChildPage: async () => {
      const r = await createChildPage('');
      if (r && editor) editor.chain().focus().insertContent({ type: 'pageLink', attrs: { pageId: r.id, title: '', child: true } }).run();
    },
    pickPage: () => setPick('link'),
    embedUrl: () => setEmbed(true),
    insertCollection: async () => {
      try {
        // the collection container page is created as a child of this page
        const r = await post<{ collection: { id: string } }>('/api/v1/collections', { spaceId: p.spaceId, parentId: p.pageId, name: 'Новый реестр', requestId: crypto.randomUUID() });
        editor?.chain().focus().insertContent({ type: 'collectionView', attrs: { collectionId: r.collection.id } }).run();
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    insertSyncedBlock: () => setPick('synced'),
    imageFromUrl: () => setImageUrl(true),
  };

  useEffect(() => {
    editor?.setEditable(p.canEdit);
  }, [editor, p.canEdit]);

  useEffect(() => {
    if (editor) {
      (editor.storage as any).kbPage = { pageId: p.pageId };
      // diagnostics hook for support and browser tests (enable with localStorage['kb:debug'] = '1')
      if (import.meta.env.DEV || localStorage.getItem('kb:debug') === '1') Object.assign(window as any, { __kbEditor: editor, __kbDoc: session.doc });
      p.onReady?.({ editor, session });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, session]);

  // Uploads interrupted by a closed tab/reload continue from the file kept in this browser (UX13-03, R-MEDIA-006).
  useEffect(() => {
    if (editor && p.canEdit) void resumeUploads(editor, p.pageId);
  }, [editor, p.canEdit, p.pageId]);

  // Caret of this page is restored on Back/Forward/reload; page-level copy commands from the page menu.
  useSelectionMemory(editor, p.pageId, !p.scrollToBlock && !p.autoFocusTitle);
  const currentTitle = useCallback(() => ytitle.toString(), [ytitle]);
  useCopyPageCommands(editor, currentTitle);

  // Focus: a just-created page focuses its title; otherwise keep the scroll position.
  useEffect(() => {
    if (p.autoFocusTitle && p.canEdit) setTimeout(() => titleRef.current?.focus(), 30);
  }, [p.autoFocusTitle, p.canEdit]);

  // Scroll to a block (?block=id) once content is present.
  useEffect(() => {
    if (!p.scrollToBlock || !editor) return;
    let tries = 0;
    const t = setInterval(() => {
      const el = document.getElementById(p.scrollToBlock!) ?? editor.view.dom.querySelector(`[data-block-id="${CSS.escape(p.scrollToBlock!)}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center' });
        // highlight as an overlay: ProseMirror owns the node's DOM and would drop an added class
        const wrap = wrapRef.current;
        if (wrap) {
          const r = el.getBoundingClientRect();
          const w = wrap.getBoundingClientRect();
          setFlash({ top: r.top - w.top, left: r.left - w.left, width: r.width, height: r.height, id: p.scrollToBlock! });
          setTimeout(() => setFlash(null), 2400);
        }
        clearInterval(t);
      } else if (++tries > 40) clearInterval(t);
    }, 100);
    return () => clearInterval(t);
  }, [p.scrollToBlock, editor]);

  useEffect(() => {
    const onFind = () => setFindOpen(true);
    const onCopyMd = async () => {
      if (!editor) return;
      const { docToMarkdown } = await loadMarkdown();
      const { from, to, empty } = editor.state.selection;
      const json = empty ? editor.getJSON() : { type: 'doc', content: editor.state.doc.slice(from, to).content.toJSON() ?? [] };
      const { markdown } = docToMarkdown(json as any, { markers: false });
      await copyWithFeedback({ text: markdown }, 'Скопировано в формате Markdown');
    };
    const onComment = () => requestComment();
    window.addEventListener('kb:find-open', onFind);
    window.addEventListener('kb:copy-markdown', onCopyMd);
    window.addEventListener('kb:comment', onComment);
    return () => {
      window.removeEventListener('kb:find-open', onFind);
      window.removeEventListener('kb:copy-markdown', onCopyMd);
      window.removeEventListener('kb:comment', onComment);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const requestComment = (blockIdOverride?: string | null) => {
    if (!editor) return;
    const { from, to, $from } = editor.state.selection;
    const quote = editor.state.doc.textBetween(from, to, ' ').slice(0, 2000);
    let blockId: string | null = blockIdOverride ?? null;
    for (let d = $from.depth; d > 0 && !blockId; d--) blockId = $from.node(d).attrs.id ?? null;
    p.onComment?.({ quote, blockId, from, to });
  };

  const onTitleChange = (v: string) => {
    const clean = v.replace(/\n/g, ' ').slice(0, 500);
    setTitle(clean);
    setYTitle(ytitle, clean);
  };

  const autosize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = '0px';
    el.style.height = el.scrollHeight + 'px';
  };
  useEffect(() => autosize(titleRef.current), [title]);

  return (
    <div ref={wrapRef} className={'editor-wrap' + (p.wide ? ' wide' : '')}>
      {flash && <div className="kb-flash-overlay" data-block={flash.id} style={{ top: flash.top - 4, left: flash.left - 6, width: flash.width + 12, height: flash.height + 8 }} aria-hidden />}
      {findOpen && editor && <FindBar editor={editor} onClose={() => setFindOpen(false)} />}
      <BlockConflictHost pageId={p.pageId} editor={editor} />
      <textarea
        ref={titleRef}
        className="page-title-input"
        value={title}
        placeholder="Без названия"
        aria-label="Название страницы"
        readOnly={!p.canEdit}
        rows={1}
        maxLength={500}
        onChange={(e) => onTitleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || (e.key === 'ArrowDown' && e.currentTarget.selectionStart === e.currentTarget.value.length)) {
            e.preventDefault();
            if (!editor) return;
            // focus synchronously (the focus command is deferred to the next frame and would drop fast keystrokes)
            editor.view.focus();
            editor.commands.setTextSelection(1);
          } else if (e.key === 'Escape' && p.onDiscardDraft && !e.currentTarget.value.trim() && (!editor || editor.isEmpty)) {
            e.preventDefault();
            p.onDiscardDraft();
          }
        }}
      />
      {editor && (
        <>
          <EditorContent editor={editor} className="editor-content" />
          {p.canEdit && (
            <div
              className="editor-tail"
              aria-hidden
              onMouseDown={(e) => {
                // Clicking below the last block continues writing there (instead of an always-present trailing paragraph).
                e.preventDefault();
                const doc = editor.state.doc;
                const last = doc.lastChild;
                if (last && last.type.name === 'paragraph' && last.content.size === 0) editor.chain().focus('end').run();
                else editor.chain().insertContentAt(doc.content.size, { type: 'paragraph' }).focus('end').run();
              }}
            />
          )}
          {p.canEdit && <BubbleToolbar editor={editor} onComment={() => requestComment()} />}
          {p.canEdit && <TableToolbar editor={editor} />}
          {p.canEdit && <PasteOptionsMenu editor={editor} />}
          {p.canEdit && (
            <BlockHandle
              editor={editor}
              pageId={p.pageId}
              onComment={(id) => requestComment(id)}
              onMoveToPage={(pos) => {
                // several selected blocks (Esc, Shift+↑/↓) move together; otherwise the block under the handle
                const range = blockRangeKey.getState(editor.state);
                const node = editor.state.doc.nodeAt(pos);
                if (range && pos >= range.from && pos < range.to) setMoveRange(range);
                else if (node) setMoveRange({ from: pos, to: pos + node.nodeSize });
              }}
              onDropToPage={(range, target) => {
                // dropped on a page in the sidebar tree: same safe transfer as «Переместить на страницу…»
                void moveBlocksToPage(editor, range.from, range.to, target.pageId, p.user.id).then((r) => {
                  if (r.ok) toast.success(`Перенесено на страницу «${target.title || 'Без названия'}»`, { label: 'Открыть', run: () => navigate('/p/' + target.pageId) });
                  else toast.error(r.message);
                });
              }}
            />
          )}
          {!p.canEdit && <ReadOnlyCommentButton editor={editor} onComment={() => requestComment()} />}
          {p.canEdit && <TouchInsertButton editor={editor} />}
          {p.canEdit && (
            <TouchBlockActions
              editor={editor}
              pageId={p.pageId}
              onComment={(id) => requestComment(id)}
              onMoveToPage={(pos) => {
                const node = editor.state.doc.nodeAt(pos);
                if (node) setMoveRange({ from: pos, to: pos + node.nodeSize });
              }}
            />
          )}
        </>
      )}
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (editor && files.length) startUploads(editor, files, editor.state.selection.from, p.pageId);
        }}
      />
      <ImageViewer />
      {pick && (
        <PagePicker
          title={pick === 'link' ? 'Ссылка на страницу' : 'Синхронизированный блок'}
          withBlocks={pick === 'synced'}
          onClose={() => setPick(null)}
          onPick={(page, blockId) => {
            if (pick === 'link') editor?.chain().focus().insertContent({ type: 'pageLink', attrs: { pageId: page.id, title: page.title } }).run();
            else editor?.chain().focus().insertContent({ type: 'syncedBlock', attrs: { sourcePageId: page.id, sourceBlockId: blockId } }).run();
            setPick(null);
          }}
        />
      )}
      {moveRange && editor && (
        <PagePicker
          title="Переместить на страницу"
          onClose={() => setMoveRange(null)}
          onPick={async (target) => {
            const range = moveRange;
            setMoveRange(null);
            if (target.id === p.pageId) return;
            const r = await moveBlocksToPage(editor, range.from, range.to, target.id, p.user.id);
            if (r.ok) toast.success(`Перенесено на страницу «${target.title || 'Без названия'}»`, { label: 'Открыть', run: () => navigate('/p/' + target.id) });
            else toast.error(r.message);
          }}
        />
      )}
      {imageUrl && editor && (
        <ImageUrlDialog
          pageId={p.pageId}
          onClose={() => setImageUrl(false)}
          onInsert={(a, alt) => {
            setImageUrl(false);
            editor
              .chain()
              .focus()
              .insertContent({ type: 'image', attrs: { src: a.contentUrl, attachmentId: a.id, alt, naturalWidth: a.width, naturalHeight: a.height, width: a.width && a.width > 720 ? null : a.width } })
              .run();
          }}
        />
      )}
      {embed && <EmbedDialog onClose={() => setEmbed(false)} onInsert={(url) => (editor?.chain().focus().insertContent({ type: 'embed', attrs: { url, kind: /youtu|rutube|vk\.com\/video/.test(url) ? 'video' : 'link' } }).run(), setEmbed(false))} />}
      {math && (
        <MathDialog
          latex={math.latex}
          onClose={() => setMath(null)}
          onSave={(latex) => {
            if (!editor) return;
            const node = editor.state.doc.nodeAt(math.pos);
            if (node) editor.view.dispatch(editor.state.tr.setNodeMarkup(math.pos, undefined, { ...node.attrs, latex }));
            setMath(null);
          }}
        />
      )}
    </div>
  );
}

/** Readers with comment rights can still comment on a selection. */
function ReadOnlyCommentButton({ editor, onComment }: { editor: TEditor; onComment(): void }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const on = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty) return setPos(null);
      const a = editor.view.coordsAtPos(from);
      const b = editor.view.coordsAtPos(to);
      setPos({ x: (a.left + b.right) / 2, y: Math.min(a.top, b.top) - 40 });
    };
    editor.on('selectionUpdate', on);
    return () => {
      editor.off('selectionUpdate', on);
    };
  }, [editor]);
  if (!pos) return null;
  return (
    <button className="btn sm readonly-comment" style={{ position: 'fixed', left: pos.x, top: pos.y, transform: 'translateX(-50%)' }} onMouseDown={(e) => e.preventDefault()} onClick={onComment}>
      Комментировать
    </button>
  );
}

function FindBar({ editor, onClose }: { editor: TEditor; onClose(): void }) {
  const [q, setQ] = useState('');
  const [, force] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    const on = () => force((x) => x + 1);
    editor.on('transaction', on);
    return () => {
      editor.off('transaction', on);
      editor.commands.setFindQuery('');
    };
  }, [editor]);
  const st = findKey.getState(editor.state);
  return (
    <div className="find-bar" role="search">
      <input
        ref={input}
        className="input"
        value={q}
        placeholder="Найти на странице"
        aria-label="Найти на странице"
        onChange={(e) => {
          setQ(e.target.value);
          editor.commands.setFindQuery(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            editor.commands.findStep(e.shiftKey ? -1 : 1);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            editor.commands.focus();
          }
        }}
      />
      <span className="small muted find-count" aria-live="polite">
        {q ? (st?.matches.length ? `${st.index + 1} из ${st.matches.length}` : 'Нет совпадений') : ''}
      </span>
      <button className="icon-btn sm" aria-label="Предыдущее" onClick={() => editor.commands.findStep(-1)}>
        <ChevronUp size={15} />
      </button>
      <button className="icon-btn sm" aria-label="Следующее" onClick={() => editor.commands.findStep(1)}>
        <ChevronDown size={15} />
      </button>
      <button className="icon-btn sm" aria-label="Закрыть поиск" onClick={onClose}>
        <X size={15} />
      </button>
    </div>
  );
}

function EmbedDialog({ onClose, onInsert }: { onClose(): void; onInsert(url: string): void }) {
  const [url, setUrl] = useState('');
  const valid = /^https?:\/\/\S+\.\S+/.test(url.trim());
  return (
    <Dialog
      open
      onClose={onClose}
      title="Видео или ссылка"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={!valid} onClick={() => onInsert(url.trim())}>
            Вставить
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="embed-url">Адрес</label>
        <input id="embed-url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://rutube.ru/video/… или любая ссылка" onKeyDown={(e) => e.key === 'Enter' && valid && onInsert(url.trim())} />
        <span className="field-hint">YouTube, RuTube и VK Видео встраиваются как плеер, остальные адреса — как карточка ссылки.</span>
      </div>
    </Dialog>
  );
}

function MathDialog({ latex, onClose, onSave }: { latex: string; onClose(): void; onSave(l: string): void }) {
  const [v, setV] = useState(latex);
  const [html, setHtml] = useState('');
  useEffect(() => {
    import('katex').then((k) => {
      try {
        setHtml(k.default.renderToString(v || '\;', { throwOnError: true, displayMode: true }));
      } catch (e) {
        setHtml(`<span class="field-error">${String((e as Error).message).replace(/[<>&]/g, '')}</span>`);
      }
    });
  }, [v]);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Формула"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" onClick={() => onSave(v)}>
            Готово
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 10 }}>
        <textarea className="textarea" style={{ fontFamily: 'var(--font-mono)' }} value={v} onChange={(e) => setV(e.target.value)} aria-label="Формула LaTeX" autoFocus />
        <div className="math-preview" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </Dialog>
  );
}

/** Touch devices have no hover handles: a floating "+" opens the block menu at the cursor. */
function TouchInsertButton({ editor }: { editor: TEditor }) {
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  if (!coarse) return null;
  return (
    <button
      className="touch-insert"
      aria-label="Вставить блок"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        const { $from } = editor.state.selection;
        const empty = $from.parent.isTextblock && $from.parent.content.size === 0;
        const chain = editor.chain().focus();
        if (!empty) chain.insertContentAt($from.after(), { type: 'paragraph' }).setTextSelection($from.after() + 1);
        chain.insertContent('/').run();
      }}
    >
      +
    </button>
  );
}
