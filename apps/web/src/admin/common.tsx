import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Search, X } from 'lucide-react';
import { ApiError, get } from '../api/client';
import { toast } from '../components/ui/Toast';
import { Avatar } from '../components/Avatar';

// ---------------------------------------------------------------- types

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  kind: 'employee' | 'guest';
  org_role: string;
  status: 'active' | 'invited' | 'suspended' | 'deactivated' | string;
  title: string | null;
  created_at: string;
  last_login_at: string | null;
  access_expires_at: string | null;
  mfa_enabled: boolean;
  primary_group_id: string | null;
  manager_id: string | null;
  groups: Array<{ id: string; name: string; kind: string; role: string; expiresAt: string | null }>;
}

export interface AdminGroup {
  id: string;
  name: string;
  description: string;
  kind: 'department' | 'group';
  parent_id: string | null;
  manager_id: string | null;
  manager_name: string | null;
  members: number;
}

export interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  kind?: string;
  title?: string | null;
}

// ---------------------------------------------------------------- labels

export const ROLE_LABEL: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Администратор',
  people_admin: 'Администратор персонала',
  auditor: 'Аудитор',
  member: 'Сотрудник',
};

export const USER_STATUS: Record<string, { label: string; color: string }> = {
  active: { label: 'Активен', color: 'green' },
  invited: { label: 'Приглашён', color: 'blue' },
  suspended: { label: 'Приостановлен', color: 'amber' },
  deactivated: { label: 'Деактивирован', color: 'red' },
};

export function roleOf(orgRole: string) {
  const isAdmin = orgRole === 'owner' || orgRole === 'admin';
  return { isAdmin, isOwner: orgRole === 'owner', canPeople: isAdmin || orgRole === 'people_admin', canAudit: isAdmin || orgRole === 'auditor' };
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return 'Произошла ошибка. Повторите попытку.';
}

export const num = (v: unknown) => Number(v ?? 0).toLocaleString('ru-RU');

/** `<input type="datetime-local">` value ⇄ ISO string with offset. */
export function toIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export interface AdminUserDetail extends AdminUser {
  updated_at: string;
  primary_group_name: string | null;
  manager_name: string | null;
  owned_pages: number;
}

export function useUserDetail(id: string | null | undefined) {
  return useQuery({ queryKey: ['admin', 'user', id], queryFn: () => get<{ user: AdminUserDetail }>(`/api/v1/admin/users/${id}`), enabled: !!id });
}

export function useGroups(enabled = true) {
  return useQuery({ queryKey: ['admin', 'groups'], queryFn: () => get<{ groups: AdminGroup[] }>('/api/v1/admin/groups'), enabled });
}

export function downloadBlob(filename: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows: Array<Array<unknown>>): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Скопировано в буфер обмена');
  } catch {
    toast.error('Не удалось скопировать — выделите текст и скопируйте вручную');
  }
}

// ---------------------------------------------------------------- state views

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="col admin-loading" aria-busy="true" aria-label="Загрузка">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 18, width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="alert error" role="alert">
      <div className="grow">
        <b>Не удалось загрузить данные.</b> {errMsg(error)}
      </div>
      {onRetry && (
        <button className="btn sm" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {children && <div>{children}</div>}
    </div>
  );
}

export function Badge({ color, children }: { color?: string; children: ReactNode }) {
  return <span className={'badge' + (color ? ' ' + color : '')}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const s = USER_STATUS[status] ?? { label: status, color: '' };
  return <Badge color={s.color}>{s.label}</Badge>;
}

export function SectionHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="admin-section-head">
      <div className="grow">
        <h2 className="admin-section-title">{title}</h2>
        {sub && <p className="muted small">{sub}</p>}
      </div>
      {actions && <div className="admin-actions">{actions}</div>}
    </div>
  );
}

/** Read-only value with a copy button (invitation links, tokens). */
export function CopyField({ value, label, hint }: { value: string; label?: string; hint?: ReactNode }) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      <div className="admin-copy">
        <input id={id} className="input mono" value={value} readOnly onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="btn"
          onClick={async () => {
            await copyText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />} Копировать
        </button>
      </div>
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- user picker

/** Searches employees through /api/v1/directory. */
export function UserPicker({
  value,
  onChange,
  placeholder = 'Найти сотрудника по имени или email',
  excludeIds = [],
  id,
  disabled,
}: {
  value: DirectoryUser | null;
  onChange: (u: DirectoryUser | null) => void;
  placeholder?: string;
  excludeIds?: string[];
  id?: string;
  disabled?: boolean;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const dq = useDebounced(q, 200);
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const res = useQuery({
    queryKey: ['directory', dq],
    queryFn: () => get<{ users: DirectoryUser[] }>(`/api/v1/directory?limit=10&q=${encodeURIComponent(dq)}`),
    enabled: open && !value,
    staleTime: 30_000,
  });
  const items = (res.data?.users ?? []).filter((u) => !excludeIds.includes(u.id));
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  useEffect(() => setActive(0), [dq]);

  if (value) {
    return (
      <div className="admin-picked">
        <Avatar name={value.name} id={value.id} />
        <span className="grow ellipsis">
          {value.name} <span className="muted small">{value.email}</span>
        </span>
        {!disabled && (
          <button type="button" className="icon-btn sm" aria-label="Очистить выбор" onClick={() => onChange(null)}>
            <X size={14} />
          </button>
        )}
      </div>
    );
  }
  const pick = (u: DirectoryUser) => {
    onChange(u);
    setQ('');
    setOpen(false);
  };
  return (
    <div className="admin-picker" ref={wrap}>
      <div className="admin-search">
        <Search size={15} className="admin-search-icon" aria-hidden />
        <input
          id={id}
          className="input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={placeholder}
          value={q}
          disabled={disabled}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && open && items[active]) {
              e.preventDefault();
              pick(items[active]);
            } else if (e.key === 'Escape' && open) {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        />
      </div>
      {open && (
        <div className="admin-picker-list" role="listbox" id={listId}>
          {res.isLoading && <div className="muted small admin-picker-note">Поиск…</div>}
          {res.isError && <div className="field-error admin-picker-note">{errMsg(res.error)}</div>}
          {res.data && !items.length && <div className="muted small admin-picker-note">Никого не найдено</div>}
          {items.map((u, i) => (
            <button
              type="button"
              key={u.id}
              role="option"
              aria-selected={i === active}
              className={'pick-item' + (i === active ? ' active' : '')}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(u)}
            >
              <Avatar name={u.name} id={u.id} />
              <span className="grow ellipsis">
                {u.name} <span className="muted small">{u.email}</span>
              </span>
              {u.kind === 'guest' && <Badge>Гость</Badge>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Simple pager for offset-based lists. */
export function Pager({ offset, limit, total, onChange }: { offset: number; limit: number; total: number; onChange: (offset: number) => void }) {
  if (total <= limit && offset === 0) return null;
  const from = total ? offset + 1 : 0;
  const to = Math.min(offset + limit, total);
  return (
    <div className="row admin-pager">
      <span className="muted small grow">
        {from}–{to} из {num(total)}
      </span>
      <button className="btn sm" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
        Назад
      </button>
      <button className="btn sm" disabled={offset + limit >= total} onClick={() => onChange(offset + limit)}>
        Далее
      </button>
    </div>
  );
}
