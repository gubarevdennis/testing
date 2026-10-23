import '../../styles/panels.css';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, ArrowLeft, Save, RotateCcw, GitCompare, Eye, Undo2 } from 'lucide-react';
import { get, post } from '../../api/client';
import { Dialog } from '../ui/Dialog';
import { confirm } from '../ui/Confirm';
import { toast } from '../ui/Toast';
import { Tooltip } from '../ui/Tooltip';
import { DocPreview, type DocNode } from '../DocPreview';
import { relTime, fullTime } from '../../lib/format';
import { errMsg } from './directory';
import { undoPropertyChange } from '../../lib/undoChange';

interface Revision {
  id: string;
  number: number;
  kind: string;
  label: string | null;
  title: string;
  created_at: string;
  summary: { added?: number; removed?: number; changed?: number } | null;
  authors: string[] | null;
  author_names: string[] | null;
  created_by: string | null;
  created_by_name: string | null;
  restored_from: string | null;
  published: boolean;
}

interface BlockDiff {
  id: string;
  type: string;
  status: 'added' | 'removed' | 'changed' | 'moved' | 'same';
  before?: string;
  after?: string;
  parts?: Array<{ value: string; added?: boolean; removed?: boolean }>;
}
interface PropChange {
  field: string;
  before: unknown;
  after: unknown;
  beforeLabel?: string;
  afterLabel?: string;
  items?: Array<{ key: string; before: unknown; after: unknown; status: 'added' | 'removed' | 'changed' }>;
}
interface DiffResponse {
  from: { number: number } | null;
  to: { number?: number; label?: string };
  title: { before: string | null; after: string };
  props?: PropChange[];
  propsTracked?: boolean;
  blocks: BlockDiff[];
  stats: { added: number; removed: number; changed: number };
}
interface RestorePreview {
  revision: { number: number; createdAt: string };
  content: { added: number; removed: number; changed: number; moved: number };
  changedBlocks: Array<{ id: string; type: string; status: string; before?: string; after?: string }>;
  title: { from: string; to: string } | null;
  props: PropChange[];
  propsNotRestored: PropChange[];
  propsTracked: boolean;
  laterRevisions: number;
  preRestoreNumber: number;
  newRevisionNumber: number;
  editors: string[];
}

interface PageEvent {
  id: string;
  type: string;
  data: Record<string, any> | null;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
}

const KIND_LABEL: Record<string, { label: string; cls: string }> = {
  auto: { label: 'Автосохранение', cls: '' },
  manual: { label: 'Сохранено вручную', cls: 'blue' },
  restore: { label: 'Восстановление', cls: 'purple' },
  'pre-restore': { label: 'Перед восстановлением', cls: '' },
  publish: { label: 'Публикация', cls: 'green' },
  import: { label: 'Импорт', cls: 'amber' },
  create: { label: 'Создание', cls: '' },
  migration: { label: 'Миграция', cls: '' },
};

const BLOCK_TYPE: Record<string, string> = {
  paragraph: 'Абзац',
  heading: 'Заголовок',
  listItem: 'Пункт списка',
  taskItem: 'Задача',
  codeBlock: 'Код',
  blockquote: 'Цитата',
  callout: 'Выноска',
  table: 'Таблица',
  tableRow: 'Строка таблицы',
  image: 'Изображение',
};

type View = 'preview' | 'diff';
type Against = 'current' | 'previous';

export function HistoryPanel({ pageId, canEdit, onClose }: { pageId: string; canEdit: boolean; onClose(): void }) {
  const [tab, setTab] = useState<'versions' | 'events'>('versions');
  const [selected, setSelected] = useState<Revision | null>(null);
  const [view, setView] = useState<View>('preview');
  const [kind, setKind] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const qc = useQueryClient();

  const revs = useInfiniteQuery({
    queryKey: ['revisions', pageId, kind],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam, signal }) =>
      get<{ revisions: Revision[]; nextCursor: number | null }>(`/api/v1/pages/${pageId}/revisions?limit=40${pageParam ? '&before=' + pageParam : ''}${kind ? '&kind=' + kind : ''}`, signal),
    getNextPageParam: (last) => last.nextCursor,
    enabled: tab === 'versions',
  });
  const list = useMemo(() => revs.data?.pages.flatMap((p) => p.revisions) ?? [], [revs.data]);
  // A revision requested from elsewhere (e.g. the "page restored" notification) is opened once it is listed.
  useEffect(() => {
    let wanted: string | null = null;
    try {
      wanted = sessionStorage.getItem('kb:history-select');
    } catch {
      /* storage unavailable */
    }
    const r = wanted ? list.find((x) => x.id === wanted) : undefined;
    if (r) {
      setTab('versions');
      setSelected(r);
      try {
        sessionStorage.removeItem('kb:history-select');
      } catch {
        /* storage unavailable */
      }
    }
  }, [list]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['revisions', pageId] });
    qc.invalidateQueries({ queryKey: ['page-events', pageId] });
    qc.invalidateQueries({ queryKey: ['revision-diff', pageId] });
    qc.invalidateQueries({ queryKey: ['page', pageId] });
  };

  const [restoring, setRestoring] = useState<Revision | null>(null);
  const restore = (r: Revision) => setRestoring(r);

  const wide = tab === 'versions' && !!selected;

  return (
    <aside className={'kb-panel' + (wide ? ' wide' : '')} aria-label="История страницы">
      <div className="kb-panel-header">
        {selected && (
          <button className="icon-btn kb-only-mobile" aria-label="К списку версий" onClick={() => setSelected(null)}>
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="kb-panel-title">История</div>
        {canEdit && tab === 'versions' && (
          <button className="btn sm" onClick={() => setSaveOpen(true)}>
            <Save size={14} /> Сохранить версию
          </button>
        )}
        <button className="icon-btn" aria-label="Закрыть историю" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="tabs kb-panel-tabs" role="tablist">
        <button className="tab" role="tab" aria-selected={tab === 'versions'} onClick={() => setTab('versions')}>
          Версии
        </button>
        <button className="tab" role="tab" aria-selected={tab === 'events'} onClick={() => setTab('events')}>
          Журнал изменений
        </button>
      </div>

      {tab === 'events' ? (
        <EventsList pageId={pageId} canEdit={canEdit} onRestored={refresh} />
      ) : (
        <div className={'kb-panel-split' + (selected ? ' has-detail' : '')}>
          <div className="kb-panel-list" style={selected ? undefined : { width: '100%', borderRight: 'none' }}>
            <div className="kb-panel-toolbar">
              <label className="sr-only" htmlFor="rev-kind">
                Тип версий
              </label>
              <select id="rev-kind" className="select" style={{ height: 30, fontSize: 'var(--fs-sm)' }} value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">Все версии</option>
                <option value="manual">Сохранённые вручную</option>
                <option value="publish">Публикации</option>
                <option value="restore">Восстановления</option>
                <option value="auto">Автосохранения</option>
              </select>
            </div>
            {revs.isLoading && <div className="kb-center"><span className="spinner" /></div>}
            {revs.isError && (
              <div className="kb-center col" style={{ gap: 8 }}>
                <span className="kb-error">{errMsg(revs.error, 'Не удалось загрузить историю')}</span>
                <button className="btn sm" onClick={() => revs.refetch()}>Повторить</button>
              </div>
            )}
            {!revs.isLoading && !revs.isError && !list.length && (
              <div className="empty-state">
                <h3>Версий пока нет</h3>
                <p>Версии создаются автоматически во время редактирования. Важное состояние можно сохранить вручную.</p>
              </div>
            )}
            {list.map((r) => (
              <RevisionItem key={r.id} r={r} current={selected?.id === r.id} onClick={() => setSelected(r)} />
            ))}
            {revs.hasNextPage && (
              <div className="kb-center">
                <button className="btn sm" onClick={() => revs.fetchNextPage()} disabled={revs.isFetchingNextPage}>
                  {revs.isFetchingNextPage ? <span className="spinner" /> : null} Показать ещё
                </button>
              </div>
            )}
          </div>
          {selected && (
            <div className="kb-panel-detail">
              <RevisionDetail
                key={selected.id}
                pageId={pageId}
                rev={selected}
                view={view}
                setView={setView}
                canEdit={canEdit}
                onRestore={() => restore(selected)}
                onBlockRestored={refresh}
                onClose={() => setSelected(null)}
              />
            </div>
          )}
        </div>
      )}
      <SaveVersionDialog open={saveOpen} pageId={pageId} onClose={() => setSaveOpen(false)} onSaved={refresh} />
      {restoring && <RestoreDialog pageId={pageId} rev={restoring} onClose={() => setRestoring(null)} onDone={refresh} />}
    </aside>
  );
}

function RevisionItem({ r, current, onClick }: { r: Revision; current: boolean; onClick(): void }) {
  const k = KIND_LABEL[r.kind] ?? { label: r.kind, cls: '' };
  const authors = r.author_names?.filter(Boolean).length ? r.author_names!.join(', ') : r.created_by_name ?? 'Система';
  const s = r.summary ?? {};
  return (
    <button className="rev-item" aria-current={current} onClick={onClick}>
      <span className="rev-item-top">
        <span className="rev-item-title">{r.label || `Версия ${r.number}`}</span>
        <span className={'badge ' + k.cls}>{k.label}</span>
        {r.published && <span className="badge green">Опубликована</span>}
      </span>
      <span className="kb-meta ellipsis" title={fullTime(r.created_at)}>
        №{r.number} · {relTime(r.created_at)} · {authors}
      </span>
      {(s.added || s.removed || s.changed) ? (
        <span className="rev-stats" aria-label={`Добавлено блоков: ${s.added ?? 0}, удалено: ${s.removed ?? 0}, изменено: ${s.changed ?? 0}`}>
          {!!s.added && <span className="add">+{s.added}</span>}
          {!!s.removed && <span className="del">−{s.removed}</span>}
          {!!s.changed && <span className="chg">~{s.changed}</span>}
        </span>
      ) : null}
    </button>
  );
}

function RevisionDetail({
  pageId,
  rev,
  view,
  setView,
  canEdit,
  onRestore,
  onBlockRestored,
  onClose,
}: {
  pageId: string;
  rev: Revision;
  view: View;
  setView(v: View): void;
  canEdit: boolean;
  onRestore(): void;
  onBlockRestored(): void;
  onClose(): void;
}) {
  const [against, setAgainst] = useState<Against>('current');
  const content = useQuery({
    queryKey: ['revision', pageId, rev.id],
    queryFn: ({ signal }) => get<{ revision: { content: DocNode; title: string } }>(`/api/v1/pages/${pageId}/revisions/${rev.id}`, signal),
    enabled: view === 'preview',
    staleTime: Infinity,
  });
  const diff = useQuery({
    queryKey: ['revision-diff', pageId, rev.id, against],
    queryFn: ({ signal }) => get<DiffResponse>(`/api/v1/pages/${pageId}/revisions/${rev.id}/diff?against=${against}`, signal),
    enabled: view === 'diff',
  });

  return (
    <>
      <div className="rev-detail-head">
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <div className="grow" style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }} className="ellipsis">
              {rev.label || `Версия ${rev.number}`}
            </div>
            <div className="kb-meta">{fullTime(rev.created_at)}</div>
          </div>
          <button className="icon-btn" aria-label="Закрыть просмотр версии" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <div className="tabs" role="tablist" style={{ borderBottom: 'none' }}>
            <button className="tab" role="tab" aria-selected={view === 'preview'} onClick={() => setView('preview')}>
              <Eye size={14} /> Просмотр
            </button>
            <button className="tab" role="tab" aria-selected={view === 'diff'} onClick={() => setView('diff')}>
              <GitCompare size={14} /> Сравнить с текущей
            </button>
          </div>
          <span className="spacer grow" />
          {canEdit && (
            <button className="btn sm primary" onClick={onRestore}>
              <RotateCcw size={14} /> Восстановить эту версию
            </button>
          )}
        </div>
      </div>
      <div className="rev-detail-body">
        {view === 'preview' ? (
          content.isLoading ? (
            <div className="kb-center"><span className="spinner" /></div>
          ) : content.isError ? (
            <div className="kb-error">{errMsg(content.error, 'Не удалось загрузить версию')}</div>
          ) : (
            <>
              <h2 style={{ fontSize: 22, margin: '4px 0 12px' }}>{content.data?.revision.title || 'Без названия'}</h2>
              <DocPreview doc={content.data?.revision.content} className="rev-preview" />
            </>
          )
        ) : (
          <>
            <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <label className="small muted" htmlFor="diff-against">
                Сравнить
              </label>
              <select id="diff-against" className="select" style={{ height: 28, width: 'auto', fontSize: 'var(--fs-sm)' }} value={against} onChange={(e) => setAgainst(e.target.value as Against)}>
                <option value="current">эту версию с текущей</option>
                <option value="previous">с предыдущей версией</option>
              </select>
              <div className="diff-legend">
                <span className="l-add">добавлено</span>
                <span className="l-del">удалено</span>
                <span className="l-chg">изменено</span>
                <span className="l-mov">перемещено</span>
              </div>
            </div>
            {diff.isLoading ? (
              <div className="kb-center"><span className="spinner" /></div>
            ) : diff.isError ? (
              <div className="kb-error">{errMsg(diff.error, 'Не удалось сравнить версии')}</div>
            ) : diff.data ? (
              <DiffView pageId={pageId} rev={rev} diff={diff.data} against={against} canEdit={canEdit} onBlockRestored={onBlockRestored} />
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

function DiffView({ pageId, rev, diff, against, canEdit, onBlockRestored }: { pageId: string; rev: Revision; diff: DiffResponse; against: Against; canEdit: boolean; onBlockRestored(): void }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const { stats, blocks, title } = diff;
  const fromLabel = against === 'current' ? `Версия ${rev.number}` : diff.from ? `Версия ${diff.from.number}` : 'Пустая страница';
  const toLabel = against === 'current' ? 'текущая версия' : `версия ${rev.number}`;
  // Which blocks exist in the selected revision (only those can be restored from it).
  const restorable = (b: BlockDiff) => (against === 'current' ? b.status === 'removed' || b.status === 'changed' : b.status === 'added' || b.status === 'changed');

  const restoreBlock = async (b: BlockDiff) => {
    setBusy(b.id);
    try {
      // Exact preview first: what the block is now and what it will become (R-HISTORY-002).
      const { preview: pv } = await post<{ preview: { mode: 'replace' | 'insert'; current: string | null; restored: string; parts: BlockDiff['parts'] | null; editors: string[] } }>(
        `/api/v1/pages/${pageId}/revisions/${rev.id}/restore-block`,
        { blockId: b.id, dryRun: true },
      );
      const ok = await confirm({
        title: pv.mode === 'insert' ? `Вернуть удалённый блок из версии ${rev.number}?` : `Заменить блок содержимым из версии ${rev.number}?`,
        body: (
          <div className="col" style={{ gap: 8 }} data-testid="restore-block-preview">
            {pv.mode === 'insert' ? (
              <p>Блока сейчас нет в документе — он будет вставлен на прежнее место.</p>
            ) : (
              <div className="diff-block changed">
                <span className="diff-tag">Сейчас → станет</span>
                {pv.parts?.length ? pv.parts.map((p, i) => (p.added ? <ins key={i} className="diff-ins">{p.value}</ins> : p.removed ? <del key={i} className="diff-del">{p.value}</del> : <span key={i}>{p.value}</span>)) : <>{pv.restored || <span className="muted">(пустой блок)</span>}</>}
              </div>
            )}
            {pv.mode === 'insert' && <div className="diff-block added">{pv.restored || <span className="muted">(пустой блок)</span>}</div>}
            <p className="muted">Остальной текст не меняется. Текущее состояние сохранится отдельной версией, результат — новой версией; более поздние версии остаются в истории.</p>
            {!!pv.editors.length && <p className="muted">Сейчас страницу редактируют: {pv.editors.join(', ')}. Их правки в других блоках сохранятся.</p>}
          </div>
        ),
        confirmLabel: pv.mode === 'insert' ? 'Вернуть блок' : 'Заменить блок',
      });
      if (!ok) return;
      const r = await post<{ mode: string; revision: { number: number }; preRestore: { number: number } }>(`/api/v1/pages/${pageId}/revisions/${rev.id}/restore-block`, { blockId: b.id });
      toast.success(`${r.mode === 'inserted' ? 'Блок возвращён в документ' : 'Блок заменён содержимым из версии'} — новая версия ${r.revision.number}, прежнее состояние сохранено как версия ${r.preRestore.number}.`);
      onBlockRestored();
    } catch (e) {
      toast.error(errMsg(e, 'Не удалось восстановить блок'));
    } finally {
      setBusy(null);
    }
  };

  // Group runs of unchanged blocks so the changes stay visible.
  const groups: Array<{ kind: 'block'; b: BlockDiff } | { kind: 'same'; items: BlockDiff[]; start: number }> = [];
  blocks.forEach((b, i) => {
    if (b.status === 'same') {
      const last = groups[groups.length - 1];
      if (last && last.kind === 'same') last.items.push(b);
      else groups.push({ kind: 'same', items: [b], start: i });
    } else groups.push({ kind: 'block', b });
  });

  const changes = stats.added + stats.removed + stats.changed + blocks.filter((b) => b.status === 'moved').length;

  return (
    <div>
      <p className="kb-meta" style={{ marginBottom: 8 }}>
        {fromLabel} → {toLabel}: добавлено {stats.added}, удалено {stats.removed}, изменено {stats.changed}
        {blocks.some((b) => b.status === 'moved') ? `, перемещено ${blocks.filter((b) => b.status === 'moved').length}` : ''}.
      </p>
      {title.before !== null && title.before !== title.after && (
        <div className="diff-block changed">
          <span className="diff-tag">Название</span>
          <del className="diff-del">{title.before}</del> <ins className="diff-ins">{title.after}</ins>
        </div>
      )}
      <PropsDiff props={diff.props ?? []} tracked={diff.propsTracked !== false} />
      {!changes && title.before === title.after && <div className="alert success">Различий в содержимом нет.</div>}
      {groups.map((g, gi) => {
        if (g.kind === 'same') {
          const show = expanded.has(g.start) || g.items.length <= 2;
          if (show) return g.items.map((b) => <DiffBlock key={b.id} b={b} />);
          return (
            <button key={'s' + g.start} className="diff-collapsed" onClick={() => setExpanded(new Set(expanded).add(g.start))}>
              … без изменений: {g.items.length} {plural(g.items.length, 'блок', 'блока', 'блоков')} — показать
            </button>
          );
        }
        const b = g.b;
        return (
          <DiffBlock
            key={b.id + gi}
            b={b}
            action={
              canEdit && b.id && restorable(b) ? (
                <Tooltip label={`Вернуть этот блок из версии ${rev.number} в текущий документ`}>
                  <button className="btn sm" disabled={busy === b.id} onClick={() => restoreBlock(b)}>
                    {busy === b.id ? <span className="spinner" /> : <Undo2 size={13} />} Восстановить блок
                  </button>
                </Tooltip>
              ) : null
            }
          />
        );
      })}
    </div>
  );
}

function DiffBlock({ b, action }: { b: BlockDiff; action?: ReactNode }) {
  const tag = BLOCK_TYPE[b.type] ?? b.type;
  const statusLabel = { added: 'добавлено', removed: 'удалено', changed: 'изменено', moved: 'перемещено', same: '' }[b.status];
  let body: ReactNode;
  if (b.status === 'changed' && b.parts)
    body = b.parts.map((p, i) => (p.added ? <ins key={i} className="diff-ins">{p.value}</ins> : p.removed ? <del key={i} className="diff-del">{p.value}</del> : <span key={i}>{p.value}</span>));
  else if (b.status === 'changed') body = <>{b.after || <span className="muted">(форматирование или вложенное содержимое изменено)</span>}</>;
  else if (b.status === 'removed') body = b.before || <span className="muted">(пустой блок)</span>;
  else body = b.after || <span className="muted">(пустой блок)</span>;
  return (
    <div className={'diff-block ' + b.status}>
      {b.status !== 'same' && (
        <span className="diff-tag">
          {tag} · {statusLabel}
        </span>
      )}
      {body}
      {action && <div className="diff-actions">{action}</div>}
    </div>
  );
}

const PROP_LABEL: Record<string, string> = {
  title: 'Название',
  icon: 'Значок',
  cover: 'Обложка',
  status: 'Статус',
  ownerId: 'Владелец',
  tags: 'Теги',
  properties: 'Свойства',
  locked: 'Защита от изменений',
  wide: 'Широкая страница',
  reviewDueAt: 'Дата пересмотра',
};
const STATUS_LABEL: Record<string, string> = { draft: 'Черновик', review: 'На согласовании', published: 'Опубликована', archived: 'В архиве' };

function propValue(field: string, v: unknown, label?: string): string {
  if (label) return label;
  if (v === null || v === undefined || v === '') return '—';
  if (field === 'status') return STATUS_LABEL[String(v)] ?? String(v);
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  if (field === 'cover') return 'обложка задана';
  if (Array.isArray(v)) return v.join(', ') || '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Property differences between two versions, highlighted like text changes (V16-S11). */
export function PropsDiff({ props, tracked }: { props: PropChange[]; tracked: boolean }) {
  if (!tracked)
    return <p className="kb-meta" data-testid="props-untracked">Свойства страницы для этой версии не сохранялись (версия создана до учёта свойств) — сравнивается только название и содержимое.</p>;
  if (!props.length) return null;
  return (
    <div className="diff-props" data-testid="props-diff">
      {props.map((c) => (
        <div key={c.field} className="diff-block changed" data-field={c.field}>
          <span className="diff-tag">{PROP_LABEL[c.field] ?? c.field} · изменено</span>
          {c.items?.length ? (
            <ul className="diff-prop-items">
              {c.items.map((it) => (
                <li key={it.key} className={it.status}>
                  {c.field === 'tags' ? (
                    it.status === 'added' ? <ins className="diff-ins">#{it.key}</ins> : <del className="diff-del">#{it.key}</del>
                  ) : (
                    <>
                      <b>{it.key}:</b> {it.status !== 'added' && <del className="diff-del">{propValue('', it.before)}</del>} {it.status !== 'removed' && <ins className="diff-ins">{propValue('', it.after)}</ins>}
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <>
              <del className="diff-del">{propValue(c.field, c.before, c.beforeLabel)}</del> <ins className="diff-ins">{propValue(c.field, c.after, c.afterLabel)}</ins>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Restore of a whole version with an exact preview (R-HISTORY-002): what changes in the text, which properties come
 * back (optional), which do not, how many later versions stay, who is editing right now. Nothing is destroyed.
 */
function RestoreDialog({ pageId, rev, onClose, onDone }: { pageId: string; rev: Revision; onClose(): void; onDone(): void }) {
  const [withProps, setWithProps] = useState(false);
  const [busy, setBusy] = useState(false);
  const pv = useQuery({
    queryKey: ['restore-preview', pageId, rev.id, withProps],
    queryFn: () => post<{ preview: RestorePreview }>(`/api/v1/pages/${pageId}/revisions/${rev.id}/restore`, { restoreTitle: true, restoreProps: withProps, dryRun: true }).then((r) => r.preview),
    staleTime: 0,
  });
  const run = async () => {
    setBusy(true);
    try {
      const res = await post<{ revision: { number: number }; preRestore: { number: number }; restoredProps: string[]; skippedProps: string[] }>(`/api/v1/pages/${pageId}/revisions/${rev.id}/restore`, { restoreTitle: true, restoreProps: withProps });
      toast.success(
        `Версия ${rev.number} восстановлена как версия ${res.revision.number}. Прежнее состояние сохранено как версия ${res.preRestore.number}.` +
          (res.skippedProps?.length ? ' Владелец не возвращён: этого сотрудника больше нет в организации.' : ''),
      );
      onDone();
      onClose();
    } catch (e) {
      toast.error(errMsg(e, 'Не удалось восстановить версию'));
    } finally {
      setBusy(false);
    }
  };
  const p = pv.data;
  const nothing = p && !p.content.added && !p.content.removed && !p.content.changed && !p.content.moved && !p.title && !p.props.length;
  return (
    <Dialog
      open
      size="wide"
      title={`Восстановить версию ${rev.number}?`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" onClick={run} disabled={busy || !p || pv.isFetching} aria-busy={busy}>
            {busy && <span className="spinner" />} Восстановить
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 10 }} data-testid="restore-preview">
        <p>Содержимое страницы станет таким, как в версии от {fullTime(rev.created_at)}.</p>
        {pv.isLoading && <div className="kb-center"><span className="spinner" /></div>}
        {pv.isError && (
          <div className="alert error">
            {errMsg(pv.error, 'Не удалось подготовить предпросмотр')}{' '}
            <button className="btn sm" onClick={() => pv.refetch()}>Повторить</button>
          </div>
        )}
        {p && (
          <>
            <div className="restore-summary">
              <b>Что изменится в тексте:</b>{' '}
              {nothing ? 'ничего — текущее состояние совпадает с этой версией.' : `добавится блоков ${p.content.added}, удалится ${p.content.removed}, изменится ${p.content.changed}${p.content.moved ? `, переместится ${p.content.moved}` : ''}.`}
            </div>
            {!!p.changedBlocks.length && (
              <div className="restore-blocks">
                {p.changedBlocks.map((b) => (
                  <div key={b.id + b.status} className={'diff-block ' + (b.status === 'added' ? 'added' : b.status === 'removed' ? 'removed' : b.status)}>
                    <span className="diff-tag">
                      {BLOCK_TYPE[b.type] ?? b.type} · {b.status === 'added' ? 'вернётся' : b.status === 'removed' ? 'будет удалён' : b.status === 'moved' ? 'переместится' : 'изменится'}
                    </span>
                    {b.status === 'changed' ? (
                      <>
                        <del className="diff-del">{b.before}</del> <ins className="diff-ins">{b.after}</ins>
                      </>
                    ) : (
                      (b.status === 'removed' ? b.before : b.after) || <span className="muted">(пустой блок)</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {p.title && (
              <div className="diff-block changed">
                <span className="diff-tag">Название</span>
                <del className="diff-del">{p.title.from || 'Без названия'}</del> <ins className="diff-ins">{p.title.to || 'Без названия'}</ins>
              </div>
            )}
            {p.propsTracked ? (
              <label className="row" style={{ gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={withProps} onChange={(e) => setWithProps(e.target.checked)} /> Вернуть и свойства страницы (значок, обложка, владелец, теги, поля)
              </label>
            ) : (
              <p className="kb-meta">Свойства для этой версии не сохранялись — вернётся только содержимое и название.</p>
            )}
            {withProps && <PropsDiff props={p.props} tracked />}
            {!!p.propsNotRestored.length && (
              <p className="kb-meta">
                Не меняются: {p.propsNotRestored.map((c) => PROP_LABEL[c.field] ?? c.field).join(', ')}
                {p.propsNotRestored.some((c) => c.field === 'status' || c.field === 'locked') ? ' (статус и защита — это состояние процесса, а не содержимое)' : ''}.
              </p>
            )}
            <p className="muted">
              Ничего не потеряется: текущее состояние сохранится как версия {p.preRestoreNumber}, результат — как версия {p.newRevisionNumber}. Более поздние версии ({p.laterRevisions}) останутся в истории. Права доступа не меняются.
            </p>
            {!!p.editors.length && <p className="alert warning">Сейчас страницу редактируют: {p.editors.join(', ')}. Их новые правки будут объединены с восстановленным текстом.</p>}
          </>
        )}
      </div>
    </Dialog>
  );
}

function SaveVersionDialog({ open, pageId, onClose, onSaved }: { open: boolean; pageId: string; onClose(): void; onSaved(): void }) {
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await post<{ revision: { number: number } }>(`/api/v1/pages/${pageId}/revisions`, { label: label.trim() || undefined });
      toast.success(`Версия ${r.revision?.number ?? ''} сохранена`);
      setLabel('');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errMsg(e, 'Не удалось сохранить версию'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      title="Сохранить версию"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" onClick={save} disabled={busy} aria-busy={busy}>
            {busy && <span className="spinner" />} Сохранить
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="rev-label">Название версии (необязательно)</label>
        <input
          id="rev-label"
          className="input"
          maxLength={200}
          value={label}
          placeholder="Например: «Перед согласованием с юристами»"
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !busy && save()}
        />
        <span className="field-hint">Именованные версии легко найти в истории и восстановить.</span>
      </div>
    </Dialog>
  );
}

const EVENT_LABEL: Record<string, string> = {
  created: 'создал(а) страницу',
  edit: 'редактировал(а) текст',
  'restored-journal': 'восстановил(а) состояние из журнала',
  renamed: 'переименовал(а) страницу',
  updated: 'изменил(а) параметры страницы',
  moved: 'переместил(а) страницу',
  trashed: 'удалил(а) в корзину',
  restored: 'восстановил(а) из корзины',
  'restored-revision': 'восстановил(а) версию',
  'restored-block': 'восстановил(а) блок из версии',
  published: 'опубликовал(а)',
  unpublished: 'снял(а) с публикации',
  'review-requested': 'отправил(а) на согласование',
  'review-approved': 'согласовал(а)',
  'review-rejected': 'вернул(а) на доработку',
  archived: 'перенёс(ла) в архив',
  unarchived: 'вернул(а) из архива',
  properties: 'изменил(а) свойства',
  'bulk-edit': 'массово изменил(а) свойства',
  'collection-fields-removed': 'удалил(а) поля коллекции',
};

const FIELD_LABEL: Record<string, string> = { title: 'название', icon: 'значок', cover: 'обложку', wide: 'ширину', locked: 'защиту', reviewDueAt: 'срок проверки', ownerId: 'владельца', properties: 'свойства', tags: 'теги' };

function eventDetail(e: PageEvent): string | null {
  const d = e.data ?? {};
  switch (e.type) {
    case 'renamed':
      return d.from !== undefined ? `«${d.from || 'Без названия'}» → «${d.to || 'Без названия'}»` : null;
    case 'edit': {
      const parts = [d.added ? `+${d.added}` : '', d.removed ? `−${d.removed}` : '', d.changed ? `~${d.changed}` : ''].filter(Boolean);
      return parts.length ? `Блоки: ${parts.join(' ')}` : null;
    }
    case 'updated':
      return Array.isArray(d.fields) ? (d.source === 'undo' ? 'Отменено: ' : d.source === 'restore' ? 'Возвращено из версии: ' : 'Изменено: ') + d.fields.map((f: string) => FIELD_LABEL[f] ?? f).join(', ') + (d.undoneBy ? ' (отменено)' : '') : null;
    case 'restored-revision':
      return d.revisionNumber ? `Версия ${d.revisionNumber} → новая версия ${d.newRevision}; прежнее состояние — версия ${d.preRestoreRevision}` : null;
    case 'restored-journal':
      return d.seq ? `Состояние на операцию №${d.seq} → новая версия ${d.newRevision}; прежнее состояние — версия ${d.preRestoreRevision}` : null;
    case 'restored-block':
      return d.revisionNumber ? `Из версии ${d.revisionNumber} (${d.mode === 'inserted' ? 'вставлен' : 'заменён'})` : null;
    case 'published':
      return d.revision ? `Версия ${d.revision}${d.label ? ` — ${d.label}` : ''}` : null;
    case 'review-approved':
    case 'review-rejected':
      return d.comment ? `«${d.comment}»` : null;
    case 'trashed':
      return d.count > 1 ? `Вместе с подстраницами: ${d.count}` : null;
    default:
      return null;
  }
}

/**
 * Restores the document to the state right after a journal operation (R-HISTORY-026). The server rebuilds it from
 * the durable journal; the current state is kept as a "pre-restore" version, so this is reversible.
 */
async function restoreJournalStep(pageId: string, e: PageEvent, onDone: () => void) {
  const seq = Number(e.data?.seq);
  let stats: { added: number; removed: number; changed: number } | null = null;
  try {
    stats = (await get<{ stats: { added: number; removed: number; changed: number } }>(`/api/v1/pages/${pageId}/journal/${seq}`)).stats;
  } catch (err) {
    toast.error(errMsg(err, 'Не удалось восстановить состояние из журнала'));
    return;
  }
  const ok = await confirm({
    title: 'Восстановить состояние на этот момент?',
    body: (
      <div className="col" style={{ gap: 8 }}>
        <p>
          Документ станет таким, каким был сразу после правки {e.actor_name ? `пользователя ${e.actor_name}` : ''} от {fullTime(e.created_at)} (операция №{seq}).
        </p>
        {stats && (
          <p className="muted">
            Отличия от текущего состояния: добавлено блоков {stats.added}, удалено {stats.removed}, изменено {stats.changed}.
          </p>
        )}
        <p className="muted">Текущее состояние сначала сохранится отдельной версией — восстановление можно отменить. Права доступа не меняются.</p>
      </div>
    ),
    confirmLabel: 'Восстановить',
  });
  if (!ok) return;
  try {
    const res = await post<{ revision: { number: number }; preRestore: { number: number } }>(`/api/v1/pages/${pageId}/journal/${seq}/restore`, { restoreTitle: true });
    toast.success(`Состояние восстановлено как версия ${res.revision.number}. Прежнее состояние сохранено как версия ${res.preRestore.number}.`);
    onDone();
  } catch (err) {
    toast.error(errMsg(err, 'Не удалось восстановить состояние из журнала'));
  }
}

function EventsList({ pageId, canEdit, onRestored }: { pageId: string; canEdit: boolean; onRestored(): void }) {
  const q = useInfiniteQuery({
    queryKey: ['page-events', pageId],
    initialPageParam: null as string | number | null,
    queryFn: ({ pageParam, signal }) => get<{ events: PageEvent[]; nextCursor: string | number | null }>(`/api/v1/pages/${pageId}/events?limit=50${pageParam ? '&before=' + pageParam : ''}`, signal),
    getNextPageParam: (last) => last.nextCursor,
  });
  const events = q.data?.pages.flatMap((p) => p.events) ?? [];
  return (
    <div className="kb-panel-body">
      {q.isLoading && <div className="kb-center"><span className="spinner" /></div>}
      {q.isError && <div className="kb-error">{errMsg(q.error, 'Не удалось загрузить журнал')}</div>}
      {!q.isLoading && !q.isError && !events.length && <div className="empty-state">Событий пока нет</div>}
      {events.map((e) => {
        const det = eventDetail(e);
        return (
          <div className="event-item" key={e.id}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div>
                <b>{e.actor_name ?? 'Система'}</b> {EVENT_LABEL[e.type] ?? e.type}
              </div>
              {det && <div className="kb-meta">{det}</div>}
              {canEdit && e.type === 'updated' && e.data?.after && !e.data?.undoneBy && (
                <button className="btn ghost sm event-restore" onClick={() => void undoPropertyChange(pageId, e.id, onRestored)}>
                  <Undo2 size={13} /> Отменить это изменение
                </button>
              )}
              {canEdit && e.type === 'edit' && Number(e.data?.seq) > 0 && (
                <button className="btn ghost sm event-restore" onClick={() => void restoreJournalStep(pageId, e, onRestored)}>
                  <RotateCcw size={13} /> Восстановить состояние на этот момент
                </button>
              )}
            </div>
            <span className="kb-meta" title={fullTime(e.created_at)} style={{ whiteSpace: 'nowrap' }}>
              {relTime(e.created_at)}
            </span>
          </div>
        );
      })}
      {q.hasNextPage && (
        <div className="kb-center">
          <button className="btn sm" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
            Показать ещё
          </button>
        </div>
      )}
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
