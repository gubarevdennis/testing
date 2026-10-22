import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, RotateCcw, AlertTriangle, RefreshCw, Search, FileText, Info, FolderOpen } from 'lucide-react';
import { get, post, del, ApiError } from '../api/client';
import { toast } from '../components/ui/Toast';
import { confirm } from '../components/ui/Confirm';
import { relTime, fullTime } from '../lib/format';
import { useMe } from '../state/session';

interface TrashPageItem {
  id: string;
  title: string;
  icon: string | null;
  space_id: string;
  space_name: string;
  deleted_at: string;
  deleted_by_name: string | null;
  children: number;
  purgeAt: string;
  path?: string[];
}
interface TrashSpaceItem {
  id: string;
  name: string;
  icon: string | null;
  deleted_at: string;
  deleted_by_name: string | null;
  purgeAt?: string;
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="alert error" role="alert">
      <AlertTriangle size={16} className="alert-icon" />
      <div className="grow">{error instanceof ApiError ? error.message : 'Не удалось загрузить корзину'}</div>
      <button className="btn sm" onClick={onRetry}>
        <RefreshCw size={14} /> Повторить
      </button>
    </div>
  );
}

export default function TrashPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const trash = useQuery({ queryKey: ['trash'], queryFn: ({ signal }) => get<{ retentionDays: number; pages: TrashPageItem[] }>('/api/v1/trash', signal) });
  const trashSpaces = useQuery({
    queryKey: ['trash-spaces'],
    queryFn: ({ signal }) => get<{ retentionDays?: number; spaces: TrashSpaceItem[] }>('/api/v1/trash/spaces', signal).catch((e) => (e instanceof ApiError && e.status === 403 ? { spaces: [] as TrashSpaceItem[] } : Promise.reject(e))),
  });
  const [filter, setFilter] = useState('');
  const [space, setSpace] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const retention = trash.data?.retentionDays ?? 90;

  const spacesInTrash = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of trash.data?.pages ?? []) m.set(p.space_id, p.space_name);
    return [...m.entries()];
  }, [trash.data]);
  const pages = (trash.data?.pages ?? []).filter((p) => (!space || p.space_id === space) && (!filter || (p.title || 'Без названия').toLowerCase().includes(filter.toLowerCase())));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['trash'] });
    qc.invalidateQueries({ queryKey: ['trash-spaces'] });
    qc.invalidateQueries({ queryKey: ['tree'] });
    qc.invalidateQueries({ queryKey: ['spaces'] });
    qc.invalidateQueries({ queryKey: ['recent'] });
    qc.invalidateQueries({ queryKey: ['favorites'] });
  };

  const restore = async (p: TrashPageItem) => {
    setBusy(p.id);
    try {
      await post(`/api/v1/pages/${p.id}/restore`);
      qc.invalidateQueries({ queryKey: ['page', p.id] });
      refresh();
      toast.success(`«${p.title || 'Без названия'}» восстановлена в «${p.space_name}»`, { label: 'Открыть', run: () => navigate(`/p/${p.id}`) });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Не удалось восстановить');
    } finally {
      setBusy(null);
    }
  };

  const purge = async (p: TrashPageItem) => {
    const name = (p.title || 'Без названия').trim();
    const ok = await confirm({
      title: 'Удалить навсегда?',
      danger: true,
      confirmLabel: 'Удалить навсегда',
      typeToConfirm: name,
      body: (
        <p>
          Страница «{name}»{p.children > 0 ? ` и вложенные страницы (${p.children})` : ''} будут удалены без возможности восстановления вместе с историей версий и вложениями.
        </p>
      ),
    });
    if (!ok) return;
    setBusy(p.id);
    try {
      await del(`/api/v1/trash/${p.id}`, { confirm: true });
      refresh();
      toast.success('Удалено навсегда');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Не удалось удалить');
    } finally {
      setBusy(null);
    }
  };

  const restoreSpace = async (s: TrashSpaceItem) => {
    setBusy(s.id);
    try {
      await post(`/api/v1/spaces/${s.id}/restore`);
      refresh();
      toast.success(`Пространство «${s.name}» восстановлено`, { label: 'Открыть', run: () => navigate(`/s/${s.id}`) });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Не удалось восстановить пространство');
    } finally {
      setBusy(null);
    }
  };

  const me = useMe();
  const isAdmin = me.user.orgRole === 'owner' || me.user.orgRole === 'admin';
  const purgeSpace = async (s: TrashSpaceItem) => {
    const ok = await confirm({
      title: 'Удалить пространство навсегда?',
      danger: true,
      confirmLabel: 'Удалить навсегда',
      typeToConfirm: s.name.trim(),
      body: <p>Пространство «{s.name}», все его страницы, история версий и вложения будут удалены без возможности восстановления.</p>,
    });
    if (!ok) return;
    setBusy(s.id);
    try {
      const r = await del<{ purged: number }>(`/api/v1/trash/spaces/${s.id}`, { confirm: true });
      refresh();
      toast.success(`Пространство удалено навсегда${r?.purged ? ` (страниц: ${r.purged})` : ''}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? (e.status === 403 && !e.message ? 'Удаление запрещено (юридическое удержание или недостаточно прав)' : e.message) : 'Не удалось удалить пространство');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page-container trash-page">
      <h1 className="page-heading">Корзина</h1>
      <p className="page-sub">Удалённые страницы можно восстановить вместе с вложенными страницами, вложениями и правами.</p>

      <div className="alert" style={{ marginBottom: 16 }}>
        <Info size={16} className="alert-icon" />
        <div>Страницы хранятся в корзине {retention} дней, затем удаляются автоматически. Окончательное удаление раньше срока доступно при полном доступе к странице.</div>
      </div>

      {(trashSpaces.data?.spaces.length ?? 0) > 0 && (
        <section className="trash-section" aria-label="Удалённые пространства">
          <h2 className="trash-h2">Пространства</h2>
          <ul className="trash-list">
            {trashSpaces.data!.spaces.map((s) => (
              <li key={s.id} className="trash-item">
                <span className="trash-icon" aria-hidden>
                  {s.icon || <FolderOpen size={16} />}
                </span>
                <div className="grow trash-main">
                  <div className="ellipsis trash-title">{s.name}</div>
                  <div className="small muted trash-meta">
                    <span title={fullTime(s.deleted_at)}>
                      Удалено {relTime(s.deleted_at)}
                      {s.deleted_by_name ? ` · ${s.deleted_by_name}` : ''}
                    </span>
                    {s.purgeAt && <span title={fullTime(s.purgeAt)}>Удалится {relTime(s.purgeAt)}</span>}
                  </div>
                </div>
                <div className="trash-actions">
                  <button className="btn sm" onClick={() => restoreSpace(s)} disabled={busy === s.id} aria-busy={busy === s.id}>
                    <RotateCcw size={14} /> Восстановить
                  </button>
                  {isAdmin && (
                    <button className="btn sm danger" onClick={() => purgeSpace(s)} disabled={busy === s.id} aria-label={`Удалить навсегда пространство «${s.name}»`}>
                      <Trash2 size={14} /> <span className="trash-purge-label">Удалить навсегда</span>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="trash-section" aria-label="Удалённые страницы">
        {(trashSpaces.data?.spaces.length ?? 0) > 0 && <h2 className="trash-h2">Страницы</h2>}
        <div className="trash-toolbar">
          <div className="trash-search">
            <Search size={15} className="muted" aria-hidden />
            <input className="input" placeholder="Найти в корзине" aria-label="Найти в корзине" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          {spacesInTrash.length > 1 && (
            <select className="select trash-space-filter" aria-label="Пространство" value={space} onChange={(e) => setSpace(e.target.value)}>
              <option value="">Все пространства</option>
              {spacesInTrash.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </div>

        {trash.isLoading ? (
          <div className="col" aria-busy="true" aria-label="Загрузка">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 56 }} />
            ))}
          </div>
        ) : trash.isError ? (
          <ErrorState error={trash.error} onRetry={() => trash.refetch()} />
        ) : !trash.data?.pages.length ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Trash2 size={32} />
            </div>
            <h3>Корзина пуста</h3>
            <p>Удалённые страницы будут храниться здесь {retention} дней.</p>
          </div>
        ) : !pages.length ? (
          <div className="empty-state compact">
            <p>Ничего не найдено.</p>
          </div>
        ) : (
          <ul className="trash-list">
            {pages.map((p) => (
              <li key={p.id} className="trash-item">
                <span className="trash-icon" aria-hidden>
                  {p.icon || <FileText size={16} />}
                </span>
                <div className="grow trash-main">
                  <div className="row" style={{ gap: 6, minWidth: 0 }}>
                    <span className="ellipsis trash-title">{p.title || 'Без названия'}</span>
                    {p.children > 0 && <span className="badge">+{p.children} вложенных</span>}
                  </div>
                  <div className="small muted trash-meta">
                    <span>
                      Из{' '}
                      <Link to={`/s/${p.space_id}`} className="trash-origin">
                        {p.space_name}
                      </Link>
                      {(p.path ?? []).map((c, i) => (
                        <span key={i}>
                          {' › '}
                          {c}
                        </span>
                      ))}
                    </span>
                    <span title={fullTime(p.deleted_at)}>
                      Удалено {relTime(p.deleted_at)}
                      {p.deleted_by_name ? ` · ${p.deleted_by_name}` : ''}
                    </span>
                    <span title={fullTime(p.purgeAt)}>Удалится {relTime(p.purgeAt)}</span>
                  </div>
                </div>
                <div className="trash-actions">
                  <button className="btn sm" onClick={() => restore(p)} disabled={busy === p.id} aria-busy={busy === p.id}>
                    <RotateCcw size={14} /> Восстановить
                  </button>
                  <button className="btn sm danger" onClick={() => purge(p)} disabled={busy === p.id} aria-label={`Удалить навсегда «${p.title || 'Без названия'}»`}>
                    <Trash2 size={14} /> <span className="trash-purge-label">Удалить навсегда</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
