import '../../styles/panels.css';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Check, RotateCcw, MoreHorizontal, MessageSquare, AtSign } from 'lucide-react';
import { get, post, patch, del } from '../../api/client';
import { Menu } from '../ui/Menu';
import { confirm } from '../ui/Confirm';
import { toast } from '../ui/Toast';
import { Tooltip, formatShortcut } from '../ui/Tooltip';
import { Avatar } from '../Avatar';
import { relTime, fullTime } from '../../lib/format';
import { useDirectorySearch, errMsg, type DirUser } from './directory';

interface CommentDto {
  id: string;
  parentId: string | null;
  author: { id: string; name: string };
  text: string;
  deleted: boolean;
  createdAt: string;
  updatedAt: string | null;
  mine: boolean;
}
interface Thread {
  id: string;
  blockId: string | null;
  quote: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  comments: CommentDto[];
}

type Filter = 'open' | 'resolved' | 'all';

/** Unsent replies survive collapsing a thread or closing the panel (per browser tab). */
const replyDrafts = new Map<string, string>();

export function CommentsPanel({
  pageId,
  canComment,
  activeThreadId,
  draft,
  onDraftDone,
  onFocusThread,
  onClose,
}: {
  pageId: string;
  canComment: boolean;
  activeThreadId: string | null;
  draft: { quote: string; blockId: string | null } | null;
  onDraftDone(threadId: string | null): void;
  onFocusThread(threadId: string): void;
  onClose(): void;
}) {
  const [filter, setFilter] = useState<Filter>('open');
  const [replyOpen, setReplyOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['comments', pageId],
    queryFn: ({ signal }) => get<{ threads: Thread[] }>(`/api/v1/pages/${pageId}/comments`, signal),
  });
  const { refetch } = q;
  useEffect(() => {
    const on = () => void refetch();
    window.addEventListener('kb:comments-changed', on);
    return () => window.removeEventListener('kb:comments-changed', on);
  }, [refetch]);

  const threads = q.data?.threads ?? [];
  const openCount = threads.filter((t) => !t.resolvedAt).length;
  const resolvedCount = threads.length - openCount;
  const visible = threads.filter((t) => (filter === 'all' ? true : filter === 'open' ? !t.resolvedAt : !!t.resolvedAt));

  // Make sure the active thread is visible, then scroll it into view.
  const refs = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    if (!activeThreadId) return;
    const t = threads.find((x) => x.id === activeThreadId);
    if (t && filter !== 'all' && (filter === 'open') === !!t.resolvedAt) setFilter('all');
    const el = refs.current.get(activeThreadId);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId, q.data]);

  const act = async (fn: () => Promise<unknown>, okMsg?: string) => {
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
      await refetch();
      return true;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    }
  };

  return (
    <aside className="kb-panel" aria-label="Комментарии">
      <div className="kb-panel-header">
        <div className="kb-panel-title">Комментарии</div>
        <button className="icon-btn" aria-label="Закрыть комментарии" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="tabs kb-panel-tabs" role="tablist" aria-label="Фильтр обсуждений">
        <button className="tab" role="tab" aria-selected={filter === 'open'} onClick={() => setFilter('open')}>
          Открытые{openCount ? ` · ${openCount}` : ''}
        </button>
        <button className="tab" role="tab" aria-selected={filter === 'resolved'} onClick={() => setFilter('resolved')}>
          Решённые{resolvedCount ? ` · ${resolvedCount}` : ''}
        </button>
        <button className="tab" role="tab" aria-selected={filter === 'all'} onClick={() => setFilter('all')}>
          Все
        </button>
      </div>
      <div className="kb-panel-body">
        {draft && canComment && (
          <div className="cm-draft">
            {draft.quote && <div className="cm-quote">{draft.quote}</div>}
            <Composer
              autoFocus
              placeholder="Новый комментарий… @ — упомянуть"
              submitLabel="Комментировать"
              onCancel={() => onDraftDone(null)}
              onSubmit={async (text, mentions) => {
                const r = await post<{ comment: { id: string; threadId: string } }>(`/api/v1/pages/${pageId}/comments`, { text, mentions, quote: draft.quote || null, blockId: draft.blockId });
                setFilter((f) => (f === 'resolved' ? 'open' : f));
                await refetch();
                onDraftDone(r.comment.threadId);
              }}
            />
          </div>
        )}
        {!canComment && <div className="alert" style={{ marginBottom: 12 }}>У вас нет права комментировать эту страницу — обсуждения доступны только для чтения.</div>}
        {q.isLoading && <div className="kb-center"><span className="spinner" /></div>}
        {q.isError && (
          <div className="kb-center col" style={{ gap: 8 }}>
            <span className="kb-error">{errMsg(q.error, 'Не удалось загрузить комментарии')}</span>
            <button className="btn sm" onClick={() => refetch()}>Повторить</button>
          </div>
        )}
        {!q.isLoading && !q.isError && !visible.length && !draft && (
          <div className="empty-state">
            <MessageSquare size={28} />
            <h3>{filter === 'resolved' ? 'Нет решённых обсуждений' : filter === 'open' && threads.length ? 'Все обсуждения решены' : 'Комментариев пока нет'}</h3>
            {canComment && filter !== 'resolved' && <p>Выделите текст на странице и нажмите «Комментировать».</p>}
          </div>
        )}
        {visible.map((t) => (
          <ThreadCard
            key={t.id}
            t={t}
            pageId={pageId}
            canComment={canComment}
            active={t.id === activeThreadId}
            replyOpen={replyOpen === t.id || t.id === activeThreadId}
            setRef={(el) => (el ? refs.current.set(t.id, el) : refs.current.delete(t.id))}
            onFocus={() => onFocusThread(t.id)}
            onReplyOpen={() => setReplyOpen(t.id)}
            act={act}
            refetch={refetch}
          />
        ))}
      </div>
    </aside>
  );
}

function ThreadCard({
  t,
  pageId,
  canComment,
  active,
  replyOpen,
  setRef,
  onFocus,
  onReplyOpen,
  act,
  refetch,
}: {
  t: Thread;
  pageId: string;
  canComment: boolean;
  active: boolean;
  replyOpen: boolean;
  setRef(el: HTMLElement | null): void;
  onFocus(): void;
  onReplyOpen(): void;
  act(fn: () => Promise<unknown>, ok?: string): Promise<boolean>;
  refetch(): Promise<unknown>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const resolved = !!t.resolvedAt;
  const shown = t.comments;
  return (
    <section
      ref={setRef}
      className={'cm-thread' + (active ? ' active' : '') + (resolved ? ' resolved' : '')}
      aria-label={'Обсуждение' + (t.quote ? `: ${t.quote.slice(0, 60)}` : '')}
      aria-current={active || undefined}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, textarea, input, a')) return;
        onFocus();
      }}
    >
      <div className="row" style={{ alignItems: 'flex-start', gap: 6 }}>
        <div className="grow" style={{ minWidth: 0 }}>
          {t.quote ? <div className="cm-quote" title={t.quote}>{t.quote}</div> : <div className="kb-meta" style={{ marginBottom: 6 }}>Комментарий к странице</div>}
        </div>
        {canComment && (
          <Tooltip label={resolved ? 'Открыть заново' : 'Отметить как решённое'}>
            <button
              className="icon-btn sm"
              aria-label={resolved ? 'Открыть обсуждение заново' : 'Отметить обсуждение решённым'}
              onClick={() => act(() => post(`/api/v1/comments/threads/${t.id}/${resolved ? 'reopen' : 'resolve'}`), resolved ? 'Обсуждение открыто заново' : 'Обсуждение решено')}
            >
              {resolved ? <RotateCcw size={14} /> : <Check size={14} />}
            </button>
          </Tooltip>
        )}
      </div>
      {resolved && (
        <div className="kb-meta" style={{ marginBottom: 4 }}>
          Решено{t.resolvedBy ? `: ${t.resolvedBy}` : ''} · {relTime(t.resolvedAt)}
        </div>
      )}
      {shown.map((c) => (
        <div className="cm-comment" key={c.id}>
          <Avatar name={c.author.name} id={c.author.id} />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="cm-head">
              <span className="cm-author">{c.author.name}</span>
              <span className="kb-meta" title={fullTime(c.createdAt)}>
                {relTime(c.createdAt)}
                {c.updatedAt && !c.deleted && new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime() > 1000 && ' · изменено'}
              </span>
              <span className="spacer grow" />
              {c.mine && !c.deleted && canComment && editing !== c.id && (
                <Menu
                  label="Действия с комментарием"
                  placement="bottom-end"
                  trigger={({ ref, props }) => (
                    <button ref={ref} className="icon-btn sm" {...props}>
                      <MoreHorizontal size={14} />
                    </button>
                  )}
                  items={[
                    { id: 'edit', label: 'Изменить', onSelect: () => setEditing(c.id) },
                    {
                      id: 'del',
                      label: 'Удалить',
                      danger: true,
                      onSelect: async () => {
                        const ok = await confirm({ title: 'Удалить комментарий?', body: 'Комментарий исчезнет из обсуждения. Ответы других участников сохранятся.', confirmLabel: 'Удалить', danger: true });
                        if (ok) act(() => del('/api/v1/comments/' + c.id), 'Комментарий удалён');
                      },
                    },
                  ]}
                />
              )}
            </div>
            {c.deleted ? (
              <div className="cm-deleted">Комментарий удалён</div>
            ) : editing === c.id ? (
              <Composer
                initial={c.text}
                autoFocus
                submitLabel="Сохранить"
                onCancel={() => setEditing(null)}
                onSubmit={async (text) => {
                  await patch('/api/v1/comments/' + c.id, { text });
                  setEditing(null);
                  await refetch();
                }}
              />
            ) : (
              <div className="cm-text">{renderText(c.text)}</div>
            )}
          </div>
        </div>
      ))}
      {canComment &&
        (replyOpen ? (
          <Composer
            draftKey={t.id}
            placeholder={resolved ? 'Ответ откроет обсуждение заново…' : 'Ответить… @ — упомянуть'}
            submitLabel="Ответить"
            autoFocus={active}
            onSubmit={async (text, mentions) => {
              await post(`/api/v1/pages/${pageId}/comments`, { threadId: t.id, text, mentions });
              await refetch();
            }}
          />
        ) : (
          <button
            className="btn sm ghost"
            style={{ marginTop: 4 }}
            onClick={() => {
              onReplyOpen();
              onFocus();
            }}
          >
            Ответить
          </button>
        ))}
    </section>
  );
}

/** Highlights "@Имя Фамилия" mentions inside plain comment text. */
function renderText(text: string): ReactNode {
  const re = /@[\p{Lu}][\p{L}-]*(?: [\p{Lu}][\p{L}-]*)?/gu;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(
      <span className="mention" key={m.index}>
        {m[0]}
      </span>,
    );
    last = m.index! + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

/**
 * Comment text box: Ctrl/⌘+Enter sends, "@" opens a people picker (mention ids are sent with the text).
 * On failure the text stays in the box.
 */
function Composer({
  initial = '',
  draftKey,
  placeholder,
  submitLabel,
  autoFocus,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  draftKey?: string;
  placeholder?: string;
  submitLabel: string;
  autoFocus?: boolean;
  onSubmit(text: string, mentions: string[]): Promise<void>;
  onCancel?(): void;
}) {
  const [text, setTextState] = useState(() => (draftKey ? replyDrafts.get(draftKey) ?? initial : initial));
  const [mentions, setMentions] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mq, setMq] = useState<{ start: number; query: string } | null>(null);
  const [mActive, setMActive] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null);
  const dir = useDirectorySearch(mq?.query ?? '', !!mq, 6);
  const people: DirUser[] = dir.users;

  const setText = (v: string) => {
    setTextState(v);
    if (draftKey) {
      if (v) replyDrafts.set(draftKey, v);
      else replyDrafts.delete(draftKey);
    }
  };

  const detectMention = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const at = before.lastIndexOf('@');
    if (at < 0 || (at > 0 && !/\s|\(/.test(before[at - 1]))) return setMq(null);
    const query = before.slice(at + 1);
    if (query.length > 30 || /[\n@]/.test(query) || /\s\s/.test(query)) return setMq(null);
    setMq({ start: at, query });
    setMActive(0);
  };

  const insertMention = (u: DirUser) => {
    if (!mq || !ta.current) return;
    const caret = ta.current.selectionStart;
    const next = text.slice(0, mq.start) + '@' + u.name + ' ' + text.slice(caret);
    setText(next);
    setMentions((m) => (m.some((x) => x.id === u.id) ? m : [...m, { id: u.id, name: u.name }]));
    setMq(null);
    const pos = mq.start + u.name.length + 2;
    requestAnimationFrame(() => {
      ta.current?.focus();
      ta.current?.setSelectionRange(pos, pos);
    });
  };

  const submit = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(
        value,
        mentions.filter((m) => value.includes('@' + m.name)).map((m) => m.id),
      );
      setText('');
      setMentions([]);
    } catch (e) {
      setError(errMsg(e, 'Не удалось отправить комментарий') + ' Текст сохранён — попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cm-composer" onClick={(e) => e.stopPropagation()}>
      <textarea
        ref={ta}
        className="textarea"
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        maxLength={20000}
        aria-label={placeholder ?? submitLabel}
        onChange={(e) => {
          setText(e.target.value);
          detectMention(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (mq && people.length) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setMActive((a) => Math.min(people.length - 1, a + 1));
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setMActive((a) => Math.max(0, a - 1));
              return;
            }
            if ((e.key === 'Enter' || e.key === 'Tab') && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              insertMention(people[mActive]);
              return;
            }
          }
          if (e.key === 'Escape') {
            if (mq) {
              e.stopPropagation();
              setMq(null);
            } else if (onCancel) {
              e.stopPropagation();
              onCancel();
            }
            return;
          }
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
        onBlur={() => setTimeout(() => setMq(null), 150)}
      />
      {mq && (
        <div className="cm-mentions" role="listbox" aria-label="Упомянуть сотрудника">
          {dir.loading && !people.length && <div className="muted small" style={{ padding: 6 }}>Поиск…</div>}
          {!dir.loading && !people.length && <div className="muted small" style={{ padding: 6 }}>{dir.error ?? 'Никого не найдено'}</div>}
          {people.map((u, i) => (
            <button
              key={u.id}
              type="button"
              role="option"
              aria-selected={i === mActive}
              data-active={i === mActive}
              className="pick-item"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertMention(u)}
            >
              <Avatar name={u.name} id={u.id} />
              <span className="grow ellipsis">{u.name}</span>
              <span className="muted small ellipsis">{u.title ?? u.email}</span>
            </button>
          ))}
        </div>
      )}
      {error && <div className="kb-error">{error}</div>}
      <div className="cm-composer-actions">
        <Tooltip label="Упомянуть сотрудника">
          <button
            type="button"
            className="icon-btn sm"
            aria-label="Упомянуть сотрудника"
            onClick={() => {
              const el = ta.current;
              if (!el) return;
              const pos = el.selectionStart;
              const pre = text.slice(0, pos);
              const ins = pre && !/\s$/.test(pre) ? ' @' : '@';
              const next = pre + ins + text.slice(pos);
              setText(next);
              const caret = pos + ins.length;
              requestAnimationFrame(() => {
                el.focus();
                el.setSelectionRange(caret, caret);
                detectMention(next, caret);
              });
            }}
          >
            <AtSign size={14} />
          </button>
        </Tooltip>
        <span className="kb-meta">{formatShortcut('Mod+Enter')} — отправить</span>
        <span className="spacer grow" />
        {onCancel && (
          <button type="button" className="btn sm" onClick={onCancel}>
            Отмена
          </button>
        )}
        <button type="button" className="btn sm primary" disabled={!text.trim() || busy} aria-busy={busy} onClick={submit}>
          {busy && <span className="spinner" />} {submitLabel}
        </button>
      </div>
    </div>
  );
}
