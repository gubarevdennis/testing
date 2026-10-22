import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Search, X, FileText, Image as ImageIcon, Paperclip, AlertTriangle, RefreshCw, SlidersHorizontal, ChevronRight } from 'lucide-react';
import { get, ApiError } from '../api/client';
import { useSpaces } from '../hooks/data';
import { useMe } from '../state/session';
import { relTime, fullTime, STATUS_LABEL } from '../lib/format';

interface SearchResult {
  pageId: string;
  title: string;
  icon: string | null;
  status: string;
  updatedAt: string | null;
  space: { id: string; name: string; icon: string | null } | null;
  path: string[];
  snippet: string | null;
  matchedIn: string[];
  ocrSnippet: string | null;
  blockId: string | null;
  publishedVersion: boolean;
}
interface SearchResponse {
  total: number;
  totalIsLowerBound: boolean;
  results: SearchResult[];
  variants: string[];
  didYouMean?: string | null;
}

const PAGE = 20;
const TYPES: Array<{ id: string; label: string }> = [
  { id: '', label: 'Всё' },
  { id: 'pages', label: 'Текст страниц' },
  { id: 'files', label: 'Вложения' },
  { id: 'images', label: 'Изображения (OCR)' },
];

/** Server snippets are plain text with <<…>> around matches; render them as React text (no HTML injection). */
function Highlighted({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = /<<([\s\S]*?)>>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<mark key={i++}>{m[1]}</mark>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function toIsoStart(d: string) {
  return d ? new Date(d + 'T00:00:00').toISOString() : '';
}
function toIsoEnd(d: string) {
  return d ? new Date(d + 'T23:59:59.999').toISOString() : '';
}

function AuthorFilter({ id, name, onChange }: { id: string; name: string; onChange(id: string, name: string): void }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const me = useMe();
  const dir = useQuery({
    queryKey: ['directory', text],
    queryFn: ({ signal }) => get<{ users: Array<{ id: string; name: string; email: string }> }>(`/api/v1/directory?limit=8&q=${encodeURIComponent(text)}`, signal),
    enabled: open && me.user.kind !== 'guest',
    staleTime: 60_000,
  });
  const users = dir.data?.users ?? [];
  if (id)
    return (
      <div className="field">
        <span className="field-label">Автор</span>
        <span className="search-chip">
          <span className="ellipsis">{name || 'Выбран'}</span>
          <button className="icon-btn sm" aria-label="Сбросить автора" onClick={() => onChange('', '')}>
            <X size={14} />
          </button>
        </span>
      </div>
    );
  return (
    <div className="field search-author">
      <label htmlFor="search-author">Автор</label>
      <input
        id="search-author"
        className="input"
        placeholder={me.user.kind === 'guest' ? 'Недоступно гостям' : 'Имя или e-mail'}
        disabled={me.user.kind === 'guest'}
        value={text}
        role="combobox"
        aria-expanded={open && users.length > 0}
        aria-controls="search-author-list"
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setText(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(users.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && users[active]) {
            e.preventDefault();
            onChange(users[active].id, users[active].name);
            setText('');
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && users.length > 0 && (
        <ul className="search-author-list popover" id="search-author-list" role="listbox">
          {users.map((u, i) => (
            <li key={u.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={'menu-item' + (i === active ? ' active' : '')}
                data-active={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(u.id, u.name);
                  setText('');
                  setOpen(false);
                }}
              >
                <span className="ellipsis">{u.name}</span>
                <span className="menu-hint ellipsis">{u.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const spaceId = params.get('space') ?? '';
  const authorId = params.get('author') ?? '';
  const authorName = params.get('authorName') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const status = params.get('status') ?? '';
  const type = params.get('type') ?? '';
  const [text, setText] = useState(q);
  const [showFilters, setShowFilters] = useState(() => !!(spaceId || authorId || from || to || status || type));
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const spaces = useSpaces();

  // URL → input (back/forward navigation)
  useEffect(() => setText((t) => (t.trim() === q ? t : q)), [q]);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  // input → URL (debounced)
  useEffect(() => {
    if (text.trim() === q) return;
    const t = setTimeout(() => update({ q: text.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (e.key === '/' && !(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const qs = useMemo(() => {
    const u = new URLSearchParams();
    u.set('q', q);
    if (spaceId) u.set('spaceId', spaceId);
    if (authorId) u.set('authorId', authorId);
    if (status) u.set('status', status);
    if (from) u.set('from', toIsoStart(from));
    if (to) u.set('to', toIsoEnd(to));
    if (type === 'images' || type === 'files') u.set('in', type);
    else if (type === 'pages') u.set('in', 'text');
    return u.toString();
  }, [q, spaceId, authorId, status, from, to, type]);

  const search = useInfiniteQuery({
    queryKey: ['search', qs],
    enabled: q.length > 0,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => get<SearchResponse>(`/api/v1/search?${qs}&limit=${PAGE}&offset=${pageParam}`, signal),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.results.length, 0);
      return loaded < last.total && last.results.length === PAGE ? loaded : undefined;
    },
    staleTime: 30_000,
  });

  const first = search.data?.pages[0];
  const all = useMemo(() => (search.data?.pages ?? []).flatMap((p) => p.results), [search.data]);
  const results = useMemo(
    () =>
      all,
    [all],
  );
  useEffect(() => setActive(-1), [qs, type]);

  const noResults = !!first && first.total === 0;
  const didYouMean = first?.didYouMean ?? null;
  const didYouMeanHref = (() => {
    if (!didYouMean) return '';
    const next = new URLSearchParams(params);
    next.set('q', didYouMean);
    return `/search?${next.toString()}`;
  })();

  const extraVariants = (first?.variants ?? []).filter((v) => v.toLowerCase() !== q.toLowerCase()).slice(0, 2);
  const filtersActive = !!(spaceId || authorId || from || to || status || type);
  const hrefFor = (r: SearchResult) => `/p/${r.pageId}${r.blockId ? `?block=${encodeURIComponent(r.blockId)}` : ''}`;

  const focusItem = (i: number) => {
    setActive(i);
    itemRefs.current[i]?.focus();
    itemRefs.current[i]?.scrollIntoView({ block: 'nearest' });
  };
  const onListKey = (e: KeyboardEvent) => {
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(Math.min(results.length - 1, active + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (active <= 0) {
        setActive(-1);
        inputRef.current?.focus();
      } else focusItem(active - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusItem(results.length - 1);
    }
  };

  const memberSpaces = (spaces.data?.spaces ?? []).filter((s) => s.member);

  return (
    <div className="page-container search-page">
      <h1 className="sr-only">Поиск</h1>
      <form
        className="search-bar"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: text.trim() });
          if (results.length) focusItem(0);
        }}
      >
        <Search size={18} className="muted" aria-hidden />
        <input
          ref={inputRef}
          className="search-input"
          type="search"
          value={text}
          autoFocus
          placeholder="Поиск по страницам, вложениям и тексту на изображениях"
          aria-label="Поисковый запрос"
          aria-describedby="search-hint"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && results.length) {
              e.preventDefault();
              focusItem(0);
            }
          }}
        />
        {text && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Очистить"
            onClick={() => {
              setText('');
              update({ q: '' });
              inputRef.current?.focus();
            }}
          >
            <X size={16} />
          </button>
        )}
        <button type="button" className={'icon-btn' + (showFilters ? ' active' : '')} aria-pressed={showFilters} aria-label="Фильтры" aria-controls="search-filters" onClick={() => setShowFilters((v) => !v)}>
          <SlidersHorizontal size={16} />
          {filtersActive && <span className="search-dot" aria-hidden />}
        </button>
      </form>
      <p id="search-hint" className="sr-only">
        Стрелка вниз — перейти к результатам, Enter — открыть, / — вернуться к поиску.
      </p>

      <div className="search-types" role="radiogroup" aria-label="Тип результатов">
        {TYPES.map((t) => (
          <button key={t.id} role="radio" aria-checked={type === t.id} className={'search-type' + (type === t.id ? ' on' : '')} onClick={() => update({ type: t.id })}>
            {t.label}
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="search-filters card" id="search-filters">
          <div className="field">
            <label htmlFor="sf-space">Пространство</label>
            <select id="sf-space" className="select" value={spaceId} onChange={(e) => update({ space: e.target.value })}>
              <option value="">Все пространства</option>
              {memberSpaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.isPersonal ? 'Личное пространство' : s.name}
                </option>
              ))}
            </select>
          </div>
          <AuthorFilter id={authorId} name={authorName} onChange={(id, name) => update({ author: id, authorName: name })} />
          <div className="field">
            <label htmlFor="sf-status">Статус</label>
            <select id="sf-status" className="select" value={status} onChange={(e) => update({ status: e.target.value })}>
              <option value="">Любой</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sf-from">Изменено с</label>
            <input id="sf-from" type="date" className="input" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="sf-to">по</label>
            <input id="sf-to" type="date" className="input" value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value })} />
          </div>
          {filtersActive && (
            <button className="btn ghost sm search-reset" onClick={() => update({ space: '', author: '', authorName: '', from: '', to: '', status: '', type: '' })}>
              Сбросить фильтры
            </button>
          )}
        </div>
      )}

      <div aria-live="polite" className="search-status small muted">
        {q && first && !noResults && (
          <>
            Найдено: {first.totalIsLowerBound ? 'более ' : ''}
            {first.total}
            {type && results.length !== all.length ? ` · показано ${results.length} подходящих по типу` : ''}
          </>
        )}
        {extraVariants.length > 0 && first && !noResults && (
          <span>
            {' '}
            · также искали: {extraVariants.map((v, i) => (
              <span key={v}>
                {i > 0 && ', '}«{v}»
              </span>
            ))}
          </span>
        )}
      </div>

      {!q ? (
        <div className="empty-state">
          <div className="empty-icon">🔎</div>
          <h3>Что ищем?</h3>
          <ul className="search-tips">
            <li>Ищется текст страниц, названия, свойства, вложения и текст на изображениях.</li>
            <li>
              Точная фраза — в кавычках: <kbd>"план эвакуации"</kbd>
            </li>
            <li>
              Исключить слово — минусом: <kbd>регламент -черновик</kbd>
            </li>
            <li>Ошибки раскладки и транслит исправляются автоматически.</li>
          </ul>
        </div>
      ) : search.isLoading ? (
        <ul className="search-results" aria-busy="true" aria-label="Загрузка результатов">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="search-result">
              <div className="skeleton" style={{ height: 18, width: '45%' }} />
              <div className="skeleton" style={{ height: 12, width: '30%', marginTop: 8 }} />
              <div className="skeleton" style={{ height: 14, width: '90%', marginTop: 8 }} />
            </li>
          ))}
        </ul>
      ) : search.isError ? (
        <div className="alert error" role="alert">
          <AlertTriangle size={16} className="alert-icon" />
          <div className="grow">{search.error instanceof ApiError ? search.error.message : 'Поиск временно недоступен'}</div>
          <button className="btn sm" onClick={() => search.refetch()}>
            <RefreshCw size={14} /> Повторить
          </button>
        </div>
      ) : noResults ? (
        <div className="empty-state">
          <div className="empty-icon">🤷</div>
          <h3>По запросу «{q}» ничего не найдено</h3>
          {didYouMean && (
            <div className="search-didyoumean">
              Возможно, вы имели в виду:{' '}
              <Link to={didYouMeanHref}>
                <b>{didYouMean}</b>
              </Link>
            </div>
          )}
          <ul className="search-tips">
            <li>Проверьте написание или используйте более общие слова.</li>
            {filtersActive && (
              <li>
                Включены фильтры —{' '}
                <button className="btn ghost sm" onClick={() => update({ space: '', author: '', authorName: '', from: '', to: '', status: '', type: '' })}>
                  сбросить фильтры
                </button>
              </li>
            )}
            <li>Страницы, к которым у вас нет доступа, не показываются.</li>
          </ul>
        </div>
      ) : (
        <>
          {results.length === 0 && (
            <div className="empty-state compact">
              <p>Среди загруженных результатов нет совпадений выбранного типа.</p>
              {search.hasNextPage && (
                <button className="btn sm" onClick={() => search.fetchNextPage()}>
                  Загрузить ещё
                </button>
              )}
            </div>
          )}
          <ul className="search-results" onKeyDown={onListKey} aria-label="Результаты поиска">
            {results.map((r, i) => (
              <li key={r.pageId} className={'search-result' + (i === active ? ' active' : '')}>
                <Link
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  to={hrefFor(r)}
                  className="search-result-link"
                  onFocus={() => setActive(i)}
                >
                  <div className="search-result-title">
                    <span className="search-result-icon" aria-hidden>
                      {r.icon || <FileText size={16} />}
                    </span>
                    <span className="ellipsis">{r.title || 'Без названия'}</span>
                  </div>
                  <div className="search-crumbs small muted">
                    {r.space && (
                      <span className="ellipsis">
                        {r.space.icon ? r.space.icon + ' ' : ''}
                        {r.space.name}
                      </span>
                    )}
                    {r.path.map((c, k) => (
                      <span key={k} className="row" style={{ gap: 2 }}>
                        <ChevronRight size={12} aria-hidden />
                        <span className="ellipsis">{c}</span>
                      </span>
                    ))}
                  </div>
                  {r.snippet && (
                    <p className="search-snippet">
                      <Highlighted text={r.snippet} />
                    </p>
                  )}
                  {r.ocrSnippet && (
                    <p className="search-snippet ocr">
                      <ImageIcon size={13} aria-hidden /> <Highlighted text={r.ocrSnippet} />
                    </p>
                  )}
                  <div className="row search-badges">
                    {r.matchedIn.includes('image') && (
                      <span className="badge purple">
                        <ImageIcon size={11} /> Найдено в изображении
                      </span>
                    )}
                    {r.matchedIn.includes('file') && (
                      <span className="badge blue">
                        <Paperclip size={11} /> Во вложении
                      </span>
                    )}
                    {r.matchedIn.includes('properties') && <span className="badge">В свойствах</span>}
                    {r.matchedIn.includes('fuzzy') && <span className="badge amber">Похожее название</span>}
                    {r.publishedVersion && <span className="badge green">Опубликованная версия</span>}
                    {r.status && r.status !== 'published' && <span className="badge">{STATUS_LABEL[r.status] ?? r.status}</span>}
                    {r.updatedAt && (
                      <span className="small muted" title={fullTime(r.updatedAt)}>
                        {relTime(r.updatedAt)}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {search.hasNextPage && (
            <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
              <button className="btn" onClick={() => search.fetchNextPage()} disabled={search.isFetchingNextPage} aria-busy={search.isFetchingNextPage}>
                {search.isFetchingNextPage && <span className="spinner" />} Показать ещё
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
