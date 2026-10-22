import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Star, MoreHorizontal, MessageSquare, History, Info, Share2, Link2, Copy, FolderInput, Trash2, Download, Lock, Unlock, MoveHorizontal, ChevronRight, RotateCcw, FileText, Printer, LayoutTemplate } from 'lucide-react';
import type { Editor } from '@tiptap/core';
import type { PresenceUser } from '@kb/shared';
import { usePage } from '../hooks/data';
import { useMe } from '../state/session';
import { useUi } from '../state/ui';
import { get, patch, post, put, del, ApiError } from '../api/client';
import { PageEditor, EditorSkeleton, type EditorHandle } from '../editor/Editor';
import { SyncStatus } from '../components/page/SyncStatus';
import { Presence } from '../components/page/Presence';
import { Menu } from '../components/ui/Menu';
import { Tooltip } from '../components/ui/Tooltip';
import { IconPickerPopover } from '../components/IconPicker';
import { MoveDialog } from '../components/MoveDialog';
import { toast } from '../components/ui/Toast';
import { duplicatePage, trashPage, copyLink } from '../layout/treeActions';
import { DocPreview } from '../components/DocPreview';
import { relTime, fullTime } from '../lib/format';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useScrollRestore } from '../hooks/useScrollRestore';
import type { PageDto, Crumb } from '../api/types';

const HistoryPanel = lazy(() => import('../components/page/HistoryPanel').then((m) => ({ default: m.HistoryPanel })));
const CommentsPanel = lazy(() => import('../components/page/CommentsPanel').then((m) => ({ default: m.CommentsPanel })));
const PageInfoPanel = lazy(() => import('../components/page/PageInfoPanel').then((m) => ({ default: m.PageInfoPanel })));
const ShareDialog = lazy(() => import('../components/page/ShareDialog').then((m) => ({ default: m.ShareDialog })));
const ExportDialog = lazy(() => import('../components/page/ExportDialog').then((m) => ({ default: m.ExportDialog })));
const PublishBar = lazy(() => import('../components/page/PublishBar').then((m) => ({ default: m.PublishBar })));

export default function PageView() {
  const { pageId } = useParams();
  const page = usePage(pageId);
  const [params] = useSearchParams();
  const location = useLocation();
  if (page.isLoading)
    return (
      <div className="page-root">
        <div className="page-header-bar" />
        <EditorSkeleton />
      </div>
    );
  if (page.isError || !page.data) return <PageError error={page.error} pageId={pageId!} retry={() => page.refetch()} />;
  const block = params.get('block') ?? (location.hash ? decodeURIComponent(location.hash.slice(1)) : null);
  return <PageLoaded key={page.data.page.id} page={page.data.page} crumbs={page.data.breadcrumbs} block={block} justCreated={!!(location.state as any)?.justCreated} />;
}

function PageError({ error, pageId, retry }: { error: unknown; pageId: string; retry(): void }) {
  const [sent, setSent] = useState(false);
  const notFound = error instanceof ApiError && (error.status === 404 || error.status === 403);
  const offline = error instanceof ApiError && error.isNetwork;
  return (
    <div className="page-container narrow">
      <div className="empty-state">
        <div className="empty-icon">{offline ? '📡' : '🔒'}</div>
        <h3>{offline ? 'Нет связи с сервером' : notFound ? 'Страница не найдена или у вас нет доступа' : 'Не удалось открыть страницу'}</h3>
        <p>{offline ? 'Страница ещё не сохранялась на этом устройстве. Проверьте подключение.' : notFound ? 'Возможно, страница была удалена, перемещена или доступ к ней ограничен.' : (error as Error)?.message}</p>
        <div className="row">
          <button className="btn" onClick={retry}>
            Повторить
          </button>
          {notFound && (
            <button
              className="btn primary"
              disabled={sent}
              onClick={() =>
                post('/api/v1/access-requests', { resourceType: 'page', resourceId: pageId, level: 'view' })
                  .then(() => (setSent(true), toast.success('Запрос отправлен владельцу страницы')))
                  .catch((e) => toast.error(e.message))
              }
            >
              {sent ? 'Запрос отправлен' : 'Запросить доступ'}
            </button>
          )}
          <Link className="btn ghost" to="/">
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}

type Panel = 'comments' | 'history' | 'info' | null;

function PageLoaded({ page, crumbs, block, justCreated }: { page: PageDto; crumbs: Crumb[]; block: string | null; justCreated: boolean }) {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 860px)');
  const { rightPanel, setRightPanel } = useUi();
  const panel = (['comments', 'history', 'info'].includes(rightPanel as string) ? rightPanel : null) as Panel;
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [share, setShare] = useState(false);
  const [exp, setExp] = useState(false);
  const [move, setMove] = useState(false);
  const [iconAnchor, setIconAnchor] = useState<HTMLElement | null>(null);
  const [liveTitle, setLiveTitle] = useState(page.title);
  const [draft, setDraft] = useState<{ quote: string; blockId: string | null; from: number; to: number } | null>(null);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [accessLost, setAccessLost] = useState<string | null>(null);
  const handle = useRef<EditorHandle | null>(null);
  const scrollRef = useScrollRestore<HTMLDivElement>();
  const [wordCount, setWordCount] = useState(0);
  const a = page.access.actions;
  const canEdit = !!a.edit && (!page.locked || page.access.level === 'full') && !page.deletedAt;
  const canComment = !!a.comment;
  const published = page.readMode === 'published';
  const refresh = () => qc.invalidateQueries({ queryKey: ['page', page.id] });

  useEffect(() => {
    document.title = `${liveTitle || 'Без названия'} — База знаний`;
  }, [liveTitle]);
  useEffect(() => {
    // keep tree/breadcrumbs titles fresh while typing the title (server syncs it shortly after)
    const t = setTimeout(() => qc.invalidateQueries({ queryKey: ['tree', page.spaceId] }), 1500);
    return () => clearTimeout(t);
  }, [liveTitle, qc, page.spaceId]);

  // A page created by "+" and left completely empty is discarded (moved to the trash) when the author leaves it.
  const liveTitleRef = useRef(liveTitle);
  const emptyRef = useRef(false);
  liveTitleRef.current = liveTitle;
  useEffect(() => {
    if (!justCreated) return;
    return () => {
      if (emptyRef.current && !liveTitleRef.current.trim())
        void post(`/api/v1/pages/${page.id}/discard-if-empty`)
          .then((r: any) => r?.discarded && qc.invalidateQueries({ queryKey: ['tree', page.spaceId] }))
          .catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const open = () => setRightPanel('history');
    window.addEventListener('kb:open-history', open);
    return () => window.removeEventListener('kb:open-history', open);
  }, [setRightPanel]);

  const setPanel = (p: Panel) => setRightPanel(panel === p ? null : p);
  const patchPage = async (body: Record<string, unknown>, ok?: string) => {
    try {
      await patch(`/api/v1/pages/${page.id}`, body);
      refresh();
      qc.invalidateQueries({ queryKey: ['tree', page.spaceId] });
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const toggleFavorite = async () => {
    try {
      if (page.favorite) await del(`/api/v1/pages/${page.id}/favorite`);
      else await put(`/api/v1/pages/${page.id}/favorite`);
      refresh();
      qc.invalidateQueries({ queryKey: ['favorites'] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const onComment = useCallback(
    (d: { quote: string; blockId: string | null; from: number; to: number }) => {
      if (!canComment) return toast.info('У вас нет прав на комментирование этой страницы');
      setDraft(d);
      setRightPanel('comments');
    },
    [canComment, setRightPanel],
  );
  const onDraftDone = (threadId: string | null) => {
    const ed: Editor | null = handle.current?.editor ?? null;
    if (threadId && draft && ed && draft.to > draft.from && canEdit) {
      ed.chain().setTextSelection({ from: draft.from, to: draft.to }).setMark('comment', { threadId }).run();
    }
    if (threadId) setActiveThread(threadId);
    setDraft(null);
  };
  const focusThread = (threadId: string) => {
    setActiveThread(threadId);
    const el = document.querySelector(`[data-comment-thread="${CSS.escape(threadId)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const menuItems = [
    { id: 'fav', label: page.favorite ? 'Убрать из избранного' : 'Добавить в избранное', icon: <Star size={15} />, onSelect: toggleFavorite },
    { id: 'link', label: 'Копировать ссылку', icon: <Link2 size={15} />, onSelect: () => copyLink(page.id) },
    {
      id: 'copy-page',
      label: 'Копировать страницу',
      icon: <Copy size={15} />,
      // handled by the editor (editor/clipboard/copy.tsx, R-CLIPBOARD-002)
      children: (['html', 'text', 'markdown'] as const).map((format) => ({
        id: 'copy-' + format,
        label: format === 'html' ? 'С форматированием' : format === 'text' ? 'Как текст' : 'Как Markdown',
        onSelect: () => window.dispatchEvent(new CustomEvent('kb:copy-page', { detail: { format } })),
      })),
    },
    { separator: true as const },
    { id: 'history', label: 'История версий', icon: <History size={15} />, onSelect: () => setRightPanel('history') },
    { id: 'info', label: 'Сведения о странице', icon: <Info size={15} />, onSelect: () => setRightPanel('info') },
    { id: 'export', label: 'Экспорт…', icon: <Download size={15} />, disabled: !a.export, hint: a.export ? undefined : 'Запрещено политикой', onSelect: () => setExp(true) },
    { id: 'print', label: 'Печать', icon: <Printer size={15} />, onSelect: () => window.print() },
    { separator: true as const },
    { id: 'wide', label: 'Широкая страница', icon: <MoveHorizontal size={15} />, checked: page.wide, disabled: !canEdit, onSelect: () => patchPage({ wide: !page.wide }) },
    ...(page.access.level === 'full' ? [{ id: 'lock', label: page.locked ? 'Снять защиту от изменений' : 'Защитить от изменений', icon: page.locked ? <Unlock size={15} /> : <Lock size={15} />, onSelect: () => patchPage({ locked: !page.locked }, page.locked ? 'Защита снята' : 'Страница защищена — редактировать могут только владельцы доступа') }] : []),
    { id: 'template', label: 'Сохранить как шаблон', icon: <LayoutTemplate size={15} />, disabled: !canEdit, onSelect: () => saveAsTemplate(page.id, liveTitle) },
    { separator: true as const },
    { id: 'dup', label: 'Дублировать', icon: <Copy size={15} />, disabled: !a.create && !canEdit, onSelect: async () => { const p = await duplicatePage(page.id); if (p) navigate('/p/' + p.id); } },
    { id: 'move', label: 'Переместить в…', icon: <FolderInput size={15} />, disabled: !a.move, onSelect: () => setMove(true) },
    { id: 'delete', label: 'Удалить', icon: <Trash2 size={15} />, danger: true, disabled: !a.delete, onSelect: () => trashPage(page.id, liveTitle, () => navigate(page.parentId ? '/p/' + page.parentId : '/s/' + page.spaceId)) },
  ];

  return (
    <div className={'page-root' + (panel && !isMobile ? ' with-panel' : '')}>
      <div className="page-main">
        <header className="page-header-bar">
          <Breadcrumbs crumbs={crumbs} space={page.space} current={liveTitle} />
          <div className="page-header-actions">
            {!published && <SyncStatus pageId={page.id} />}
            <Presence users={presence} meId={me.user.id} />
            {!isMobile && page.updatedBy && (
              <Tooltip label={`Изменено ${fullTime(page.contentUpdatedAt ?? page.updatedAt)} · ${page.updatedBy.name}`}>
                <span className="small muted page-edited">{relTime(page.contentUpdatedAt ?? page.updatedAt)}</span>
              </Tooltip>
            )}
            <button className="btn sm" onClick={() => setShare(true)}>
              <Share2 size={14} /> <span className="hide-mobile">Поделиться</span>
            </button>
            <Tooltip label="Комментарии" shortcut="Mod+Shift+M">
              <button className="icon-btn" aria-label="Комментарии" aria-pressed={panel === 'comments'} onClick={() => setPanel('comments')}>
                <MessageSquare size={17} />
              </button>
            </Tooltip>
            <Tooltip label={page.favorite ? 'В избранном' : 'В избранное'}>
              <button className="icon-btn hide-mobile" aria-label="Избранное" aria-pressed={page.favorite} onClick={toggleFavorite}>
                <Star size={17} fill={page.favorite ? 'currentColor' : 'none'} />
              </button>
            </Tooltip>
            <Menu
              label="Действия со страницей"
              placement="bottom-end"
              items={menuItems}
              trigger={({ ref, props }) => (
                <button ref={ref} className="icon-btn" {...props}>
                  <MoreHorizontal size={18} />
                </button>
              )}
            />
          </div>
        </header>
        <div className="page-scroll" ref={scrollRef}>
          {page.deletedAt && (
            <div className="alert warning page-banner" role="alert">
              <span className="grow">Страница в корзине с {fullTime(page.deletedAt)}. Она доступна только для чтения.</span>
              {a.restore && (
                <button className="btn sm" onClick={() => post(`/api/v1/pages/${page.id}/restore`).then(() => (refresh(), qc.invalidateQueries({ queryKey: ['tree'] }), toast.success('Страница восстановлена'))).catch((e) => toast.error(e.message))}>
                  <RotateCcw size={14} /> Восстановить
                </button>
              )}
            </div>
          )}
          {page.locked && (
            <div className="alert page-banner">
              <Lock size={14} className="alert-icon" />
              <span>{page.access.level === 'full' ? 'Страница защищена от изменений. Вы можете редактировать её как владелец доступа.' : 'Страница защищена от изменений. Чтобы предложить правку, оставьте комментарий.'}</span>
            </div>
          )}
          {accessLost && (
            <div className="alert warning page-banner" role="alert">
              {accessLost}
            </div>
          )}
          <div className={'page-body' + (page.wide ? ' wide' : '')}>
            <div className="page-icon-row">
              {page.icon ? (
                <button className="page-icon" onClick={(e) => canEdit && setIconAnchor(e.currentTarget)} aria-label="Изменить значок" disabled={!canEdit}>
                  {page.icon}
                </button>
              ) : (
                canEdit && (
                  <button className="btn ghost sm page-add-icon" onClick={(e) => setIconAnchor(e.currentTarget)}>
                    <FileText size={14} /> Добавить значок
                  </button>
                )
              )}
              {iconAnchor && <IconPickerPopover anchor={iconAnchor} onClose={() => setIconAnchor(null)} onPick={(i) => (setIconAnchor(null), patchPage({ icon: i }))} onRemove={() => (setIconAnchor(null), patchPage({ icon: null }))} />}
            </div>
            <Suspense fallback={null}>
              <PublishBar page={page} onChanged={refresh} />
            </Suspense>
            {published ? (
              <PublishedView page={page} />
            ) : (
              <PageEditor
                pageId={page.id}
                spaceId={page.spaceId}
                generation={page.docGeneration}
                canEdit={canEdit}
                user={{ id: me.user.id, name: me.user.name }}
                autoFocusTitle={justCreated}
                wide={page.wide}
                scrollToBlock={block}
                onReady={(h) => {
                  handle.current = h;
                  const upd = () => {
                    setWordCount(h.editor?.storage.characterCount?.words?.() ?? 0);
                    emptyRef.current = !!h.editor?.isEmpty;
                  };
                  h.editor?.on('update', upd);
                  upd();
                }}
                onPresence={setPresence}
                onTitle={setLiveTitle}
                onAccess={(ce, reason) => {
                  if (!ce && canEdit) {
                    const pending = handle.current?.session?.provider.pendingCount() ?? 0;
                    const tail = pending ? ' Часть изменений не успела отправиться — сохраните локальную копию (кнопка ниже).' : ' Все ваши изменения сохранены на сервере.';
                    setAccessLost((reason === 'locked' ? 'Страница защищена от изменений — редактирование отключено.' : 'Ваши права изменились: страница открыта только для чтения.') + tail);
                  }
                  if (ce) setAccessLost(null);
                  refresh();
                }}
                onComment={onComment}
                onCommentClick={(t) => (setRightPanel('comments'), setActiveThread(t))}
              />
            )}
            <Backlinks pageId={page.id} />
          </div>
        </div>
      </div>
      {panel && (
        <aside className={'right-panel' + (isMobile ? ' sheet' : '')} aria-label="Боковая панель">
          <Suspense fallback={<div className="skeleton" style={{ margin: 16, height: 100 }} />}>
            {panel === 'comments' && <CommentsPanel pageId={page.id} canComment={canComment} activeThreadId={activeThread} draft={draft} onDraftDone={onDraftDone} onFocusThread={focusThread} onClose={() => (setRightPanel(null), setDraft(null))} />}
            {panel === 'history' && <HistoryPanel pageId={page.id} canEdit={canEdit} onClose={() => setRightPanel(null)} />}
            {panel === 'info' && <PageInfoPanel page={page} wordCount={wordCount} onClose={() => setRightPanel(null)} />}
          </Suspense>
        </aside>
      )}
      <Suspense fallback={null}>
        {share && <ShareDialog page={page} open={share} onClose={() => setShare(false)} />}
        {exp && <ExportDialog page={page} onClose={() => setExp(false)} />}
      </Suspense>
      {move && <MoveDialog node={{ id: page.id, title: liveTitle, spaceId: page.spaceId }} onClose={() => (setMove(false), refresh())} />}
    </div>
  );
}

async function saveAsTemplate(pageId: string, title: string) {
  try {
    await post('/api/v1/templates', { pageId, name: title || 'Шаблон', category: 'Мои шаблоны' });
    toast.success('Шаблон сохранён — он доступен в разделе «Шаблоны»');
  } catch (e) {
    toast.error((e as Error).message);
  }
}

function Breadcrumbs({ crumbs, space, current }: { crumbs: Crumb[]; space: PageDto['space']; current: string }) {
  const items = crumbs.filter((c) => c.id !== null || c.title);
  const collapsed = items.length > 3;
  const visible = collapsed ? [items[0], null, ...items.slice(-2)] : items;
  return (
    <nav className="breadcrumbs" aria-label="Путь к странице">
      <Link to={'/s/' + space.id} className="crumb">
        <span className="crumb-icon">{space.icon ?? '📁'}</span>
        <span className="ellipsis">{space.name}</span>
      </Link>
      {visible.slice(0, -1).map((c, i) =>
        c === null ? (
          <span key={'gap' + i} className="crumb-sep">
            <ChevronRight size={12} /> …
          </span>
        ) : (
          <span key={(c.id ?? 'h') + i} className="row" style={{ gap: 2, minWidth: 0 }}>
            <ChevronRight size={12} className="crumb-sep" />
            {c.hidden || !c.id ? (
              <span className="crumb muted" title="Нет доступа к родительской странице">
                <Lock size={11} /> скрыто
              </span>
            ) : (
              <Link to={'/p/' + c.id} className="crumb">
                {c.icon && <span className="crumb-icon">{c.icon}</span>}
                <span className="ellipsis">{c.title || 'Без названия'}</span>
              </Link>
            )}
          </span>
        ),
      )}
      <ChevronRight size={12} className="crumb-sep" />
      <span className="crumb current ellipsis" aria-current="page">
        {current || 'Без названия'}
      </span>
    </nav>
  );
}

function PublishedView({ page }: { page: PageDto }) {
  const q = useQuery({ queryKey: ['published', page.id, page.publishedRevisionId], queryFn: () => get<{ published: boolean; content: any; title: string; revision?: { number: number; createdAt: string } }>(`/api/v1/pages/${page.id}/content`) });
  if (q.isLoading) return <EditorSkeleton />;
  if (q.isError) return <div className="alert error">Не удалось загрузить опубликованную версию. {(q.error as Error).message}</div>;
  if (!q.data?.published)
    return (
      <div className="empty-state">
        <div className="empty-icon">📝</div>
        <h3>{page.title || 'Без названия'}</h3>
        <p>Страница ещё не опубликована. Она появится здесь после согласования.</p>
      </div>
    );
  return (
    <article className="published-view">
      <h1 className="page-title-static">{q.data.title || 'Без названия'}</h1>
      {q.data.revision && <div className="small muted">Опубликованная версия {q.data.revision.number} · {fullTime(q.data.revision.createdAt)}</div>}
      <DocPreview doc={q.data.content} />
    </article>
  );
}

function Backlinks({ pageId }: { pageId: string }) {
  const q = useQuery({ queryKey: ['backlinks', pageId], queryFn: () => get<{ backlinks: Array<{ id: string; title: string; icon: string | null }> }>(`/api/v1/pages/${pageId}/backlinks`), staleTime: 60_000 });
  const list = q.data?.backlinks ?? [];
  if (!list.length) return null;
  return (
    <section className="backlinks" aria-label="Ссылки на эту страницу">
      <div className="small muted">Ссылаются на эту страницу</div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {list.map((b) => (
          <Link key={b.id} to={'/p/' + b.id} className="backlink">
            <span>{b.icon ?? <FileText size={13} />}</span> {b.title || 'Без названия'}
          </Link>
        ))}
      </div>
    </section>
  );
}
