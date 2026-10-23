import '../../styles/panels.css';
import { useEffect, useRef, useState } from 'react';
import { Users, Building2, LayoutGrid } from 'lucide-react';
import { get, ApiError } from '../../api/client';
import { Avatar } from '../Avatar';

export interface DirUser {
  id: string;
  name: string;
  email: string;
  kind: 'employee' | 'guest';
  title: string | null;
}
export interface DirGroup {
  id: string;
  name: string;
  kind: string;
  members: number;
}
/** A space as a grant subject: its members («участники пространства X», R-ACL-036). */
export interface DirSpace {
  id: string;
  name: string;
  kind: string;
  icon: string | null;
}
export type DirEntry = { type: 'user'; user: DirUser } | { type: 'group'; group: DirGroup } | { type: 'space'; space: DirSpace };

export const dirEntryId = (e: DirEntry) => (e.type === 'user' ? e.user.id : e.type === 'group' ? e.group.id : e.space.id);
export const dirEntryName = (e: DirEntry) => (e.type === 'user' ? e.user.name : e.type === 'group' ? e.group.name : `Участники пространства «${e.space.name}»`);

/** Debounced people/groups search via /api/v1/directory. */
export function useDirectorySearch(q: string, enabled = true, limit = 8, spaces = false) {
  const [data, setData] = useState<{ users: DirUser[]; groups: DirGroup[]; spaces?: DirSpace[] }>({ users: [], groups: [], spaces: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      get<{ users: DirUser[]; groups: DirGroup[]; spaces?: DirSpace[] }>(`/api/v1/directory?q=${encodeURIComponent(q.trim())}&limit=${limit}${spaces ? '&spaces=1' : ''}`, ctrl.signal)
        .then((r) => {
          setData(r);
          setError(null);
        })
        .catch((e) => {
          if ((e as Error).name === 'AbortError') return;
          setError(e instanceof ApiError ? e.message : 'Не удалось выполнить поиск');
        })
        .finally(() => setLoading(false));
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, enabled, limit, spaces]);
  return { ...data, loading, error };
}

/** Text input with a dropdown of people (and optionally groups) from the directory. */
export function DirectoryPicker({
  onPick,
  includeGroups = true,
  includeSpaces = false,
  placeholder = 'Имя, e-mail или группа',
  excludeIds = [],
  autoFocus,
  id,
}: {
  onPick(e: DirEntry): void;
  includeGroups?: boolean;
  /** Also offer spaces («участники пространства»). */
  includeSpaces?: boolean;
  placeholder?: string;
  excludeIds?: string[];
  autoFocus?: boolean;
  id?: string;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const res = useDirectorySearch(q, open, 8, includeSpaces);
  const items: DirEntry[] = [
    ...res.users.filter((u) => !excludeIds.includes(u.id)).map((user) => ({ type: 'user' as const, user })),
    ...(includeGroups ? res.groups.filter((g) => !excludeIds.includes(g.id)).map((group) => ({ type: 'group' as const, group })) : []),
    ...(includeSpaces ? (res.spaces ?? []).filter((x) => !excludeIds.includes(x.id)).map((space) => ({ type: 'space' as const, space })) : []),
  ];
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  useEffect(() => setActive(0), [q]);
  const pick = (e: DirEntry) => {
    onPick(e);
    setQ('');
    setOpen(false);
  };
  return (
    <div className="share-search" ref={wrap}>
      <input
        id={id}
        className="input"
        value={q}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && items[active]) {
            e.preventDefault();
            pick(items[active]);
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {open && (
        <div className="share-results" role="listbox">
          {res.error && <div className="kb-error" style={{ padding: 8 }}>{res.error}</div>}
          {!res.error && !items.length && <div className="muted small" style={{ padding: 8 }}>{res.loading ? 'Поиск…' : 'Никого не найдено'}</div>}
          {items.map((it, i) => (
            <button
              type="button"
              key={it.type + dirEntryId(it)}
              role="option"
              aria-selected={i === active}
              className="pick-item"
              style={i === active ? { background: 'var(--surface-hover)' } : undefined}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(it)}
            >
              {it.type === 'user' ? (
                <>
                  <Avatar name={it.user.name} id={it.user.id} />
                  <span className="grow ellipsis">
                    {it.user.name} <span className="muted small">{it.user.email}</span>
                  </span>
                  {it.user.kind === 'guest' && <span className="badge amber">гость</span>}
                </>
              ) : it.type === 'group' ? (
                <>
                  <span className="share-subject-icon">
                    <Users size={14} />
                  </span>
                  <span className="grow ellipsis">{it.group.name}</span>
                  <span className="muted small">{it.group.members} чел.</span>
                </>
              ) : (
                <>
                  <span className="share-subject-icon">
                    <LayoutGrid size={14} />
                  </span>
                  <span className="grow ellipsis">{dirEntryName(it)}</span>
                  <span className="muted small">пространство</span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SubjectIcon({ type, id, name }: { type: string; id: string | null; name: string }) {
  if (type === 'user' && id) return <Avatar name={name} id={id} />;
  return <span className="share-subject-icon">{type === 'org' ? <Building2 size={14} /> : type === 'space' ? <LayoutGrid size={14} /> : <Users size={14} />}</span>;
}

export function errMsg(e: unknown, fallback = 'Не удалось выполнить действие'): string {
  return e instanceof ApiError ? e.message : fallback;
}
