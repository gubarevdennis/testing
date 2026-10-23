import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FilePlus2, FileText, AlertTriangle, RefreshCw, Upload, LayoutTemplate, Users, Settings, Lock, Globe, EyeOff, ChevronRight, Archive, Trash2, Building2, User, UsersRound } from 'lucide-react';
import { get, patch, del, ApiError } from '../api/client';
import { useChildren } from '../hooks/data';
import { createPage } from '../layout/treeActions';
import { toast } from '../components/ui/Toast';
import { confirm } from '../components/ui/Confirm';
import { IconPickerPopover } from '../components/IconPicker';
import { LEVEL_LABEL, STATUS_LABEL, relTime } from '../lib/format';
import { SpaceMembersEditor, type SpaceGrant } from '../components/space/SpaceAccess';

type Policy = { publishingMode: 'live' | 'publish'; requireApproval: boolean; allowExport: boolean; allowDownload: boolean; allowGuests: boolean };
interface SpaceDetail {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  kind: string;
  visibility: 'open' | 'closed' | 'private';
  archived_at: string | null;
  created_at: string;
  policy: Policy;
  level: string;
  actions: Record<string, boolean>;
  stats: { pages: number };
}
interface Grant {
  id: string;
  subject_type: 'user' | 'group' | 'org' | 'space';
  subject_id: string | null;
  level: string;
  user_name: string | null;
  user_email: string | null;
  user_kind: string | null;
  group_name: string | null;
  group_kind: string | null;
  space_name?: string | null;
  expires_at?: string | null;
}

const VISIBILITY: Record<string, { label: string; hint: string; icon: JSX.Element }> = {
  open: { label: 'Открытое', hint: 'Видно всем сотрудникам', icon: <Globe size={12} /> },
  closed: { label: 'Закрытое', hint: 'Название видно, содержимое — по приглашению', icon: <Lock size={12} /> },
  private: { label: 'Приватное', hint: 'Видно только участникам', icon: <EyeOff size={12} /> },
};
const KIND: Record<string, string> = { org: 'Организация', department: 'Отдел', project: 'Проект', private: 'Частное', personal: 'Личное', archive: 'Архив' };

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="alert error" role="alert">
      <AlertTriangle size={16} className="alert-icon" />
      <div className="grow">{error instanceof ApiError ? error.message : 'Не удалось загрузить данные'}</div>
      <button className="btn sm" onClick={onRetry}>
        <RefreshCw size={14} /> Повторить
      </button>
    </div>
  );
}

function Toggle({ id, label, hint, checked, onChange, disabled }: { id: string; label: string; hint?: string; checked: boolean; onChange(v: boolean): void; disabled?: boolean }) {
  return (
    <div className="space-toggle">
      <div className="grow">
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        {hint && <div className="field-hint">{hint}</div>}
      </div>
      <span className="switch">
        <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span />
      </span>
    </div>
  );
}

function PagesTab({ space }: { space: SpaceDetail }) {
  const tree = useChildren(space.id, null);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const canCreate = space.actions.create && !space.archived_at;
  const newPage = async () => {
    setBusy(true);
    try {
      const p = await createPage(space.id, null);
      navigate(`/p/${p.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Не удалось создать страницу');
    } finally {
      setBusy(false);
    }
  };
  if (tree.isLoading)
    return (
      <div className="col" aria-busy="true" aria-label="Загрузка">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 40 }} />
        ))}
      </div>
    );
  if (tree.isError) return <ErrorState error={tree.error} onRetry={() => tree.refetch()} />;
  const nodes = tree.data?.nodes ?? [];
  if (!nodes.length)
    return (
      <div className="empty-state">
        <div className="empty-icon">📄</div>
        <h3>В пространстве пока нет страниц</h3>
        {canCreate ? (
          <>
            <p>Создайте первую страницу, выберите шаблон или импортируйте документы.</p>
            <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
              <button className="btn primary" onClick={newPage} disabled={busy}>
                <FilePlus2 size={16} /> Новая страница
              </button>
              <Link className="btn" to={`/templates?spaceId=${space.id}`}>
                <LayoutTemplate size={16} /> Шаблоны
              </Link>
              <Link className="btn" to={`/import?spaceId=${space.id}`}>
                <Upload size={16} /> Импорт
              </Link>
            </div>
          </>
        ) : (
          <p>Здесь появятся страницы, когда их опубликуют участники.</p>
        )}
      </div>
    );
  return (
    <ul className="space-pages">
      {nodes.map((n) => (
        <li key={n.id}>
          <Link to={`/p/${n.id}`} className="space-page-row">
            <span className="home-row-icon" aria-hidden>
              {n.icon || <FileText size={16} />}
            </span>
            <span className="ellipsis grow">{n.title || 'Без названия'}</span>
            {n.status && n.status !== 'published' && n.status !== 'draft' && <span className="badge">{STATUS_LABEL[n.status] ?? n.status}</span>}
            {!n.inheritPermissions && (
              <span className="muted" title="Особые права доступа">
                <Lock size={13} />
              </span>
            )}
            {n.hasChildren && <ChevronRight size={14} className="muted" aria-label="Есть вложенные страницы" />}
          </Link>
        </li>
      ))}
      {tree.data?.nextCursor && <li className="small muted" style={{ padding: 8 }}>Показаны не все страницы — остальные доступны в боковой панели.</li>}
    </ul>
  );
}

function AccessTab({ space }: { space: SpaceDetail }) {
  const access = useQuery({ queryKey: ['space-access', space.id], queryFn: ({ signal }) => get<{ level: string; actions: Record<string, boolean>; grants: Array<Grant & SpaceGrant> }>(`/api/v1/spaces/${space.id}/access`, signal) });
  if (access.isLoading)
    return (
      <div className="col" aria-busy="true" aria-label="Загрузка">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 40 }} />
        ))}
      </div>
    );
  if (access.isError) return <ErrorState error={access.error} onRetry={() => access.refetch()} />;
  const grants = access.data?.grants ?? [];
  const counts = grants.reduce<Record<string, number>>((m, g) => ((m[g.level] = (m[g.level] ?? 0) + 1), m), {});
  const full = access.data!.actions.share;
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        <span className="small muted">Ваш уровень:</span>
        <span className="badge blue">{LEVEL_LABEL[access.data!.level] ?? access.data!.level}</span>
        <span className="grow" />
        {Object.entries(counts).map(([lvl, n]) => (
          <span key={lvl} className="badge">
            {LEVEL_LABEL[lvl] ?? lvl}: {n}
          </span>
        ))}
      </div>
      {!full && <p className="small muted">Полный список участников видят руководители пространства.</p>}
      {full ? (
        <SpaceMembersEditor spaceId={space.id} spaceName={space.name} grants={grants} myLevel={access.data!.level} onChanged={() => access.refetch()} />
      ) : !grants.length ? (
        <div className="empty-state compact">
          <p>Нет явно выданных прав.</p>
        </div>
      ) : (
        <ul className="space-grants">
          {grants.map((g) => (
            <li key={g.id} className="space-grant">
              <span className="space-grant-icon" aria-hidden>
                {g.subject_type === 'org' ? <Building2 size={16} /> : g.subject_type === 'group' || g.subject_type === 'space' ? <UsersRound size={16} /> : <User size={16} />}
              </span>
              <span className="grow col" style={{ gap: 0, minWidth: 0 }}>
                <span className="ellipsis">{g.subject_type === 'org' ? 'Все сотрудники организации' : g.subject_type === 'group' ? g.group_name ?? 'Группа' : g.subject_type === 'space' ? `Участники пространства «${g.space_name ?? '—'}»` : g.user_name ?? 'Пользователь'}</span>
                {g.subject_type === 'user' && (
                  <span className="small muted ellipsis">
                    {g.user_email}
                    {g.user_kind === 'guest' ? ' · гость' : ''}
                  </span>
                )}
              </span>
              {g.expires_at && <span className="small muted">до {new Date(g.expires_at).toLocaleDateString('ru-RU')}</span>}
              <span className="badge">{LEVEL_LABEL[g.level] ?? g.level}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SettingsTab({ space, onSaved }: { space: SpaceDetail; onSaved(): void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const personal = space.kind === 'personal';
  const [name, setName] = useState(space.name);
  const [description, setDescription] = useState(space.description ?? '');
  const [icon, setIcon] = useState<string | null>(space.icon);
  const [visibility, setVisibility] = useState(space.visibility);
  const [policy, setPolicy] = useState<Policy>(space.policy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iconAnchor, setIconAnchor] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setName(space.name);
    setDescription(space.description ?? '');
    setIcon(space.icon);
    setVisibility(space.visibility);
    setPolicy(space.policy);
  }, [space]);
  const dirty = name !== space.name || description !== (space.description ?? '') || icon !== space.icon || visibility !== space.visibility || JSON.stringify(policy) !== JSON.stringify(space.policy);
  const setP = (k: keyof Policy, v: Policy[keyof Policy]) => setPolicy((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!name.trim()) {
      setError('Название не может быть пустым');
      return;
    }
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { name: name.trim(), description, icon, policy };
    if (!personal && visibility !== space.visibility) body.visibility = visibility;
    try {
      try {
        await patch(`/api/v1/spaces/${space.id}`, body);
      } catch (e) {
        if (e instanceof ApiError && e.code === 'audience_change') {
          const ok = await confirm({ title: 'Расширить доступ?', confirmLabel: 'Открыть пространство', body: <p>Пространство «{space.name}» и все его страницы станут доступны для просмотра всем сотрудникам организации.</p> });
          if (!ok) return;
          await patch(`/api/v1/spaces/${space.id}`, { ...body, confirmWiden: true });
        } else throw e;
      }
      toast.success('Настройки сохранены');
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async () => {
    const archive = !space.archived_at;
    if (archive) {
      const ok = await confirm({ title: 'Архивировать пространство?', confirmLabel: 'Архивировать', body: <p>Пространство станет доступно только для чтения. Архивацию можно отменить.</p> });
      if (!ok) return;
    }
    try {
      await patch(`/api/v1/spaces/${space.id}`, { archived: archive });
      toast.success(archive ? 'Пространство архивировано' : 'Пространство возвращено из архива');
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Не удалось изменить');
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Удалить пространство?',
      danger: true,
      confirmLabel: 'Удалить',
      typeToConfirm: space.name,
      body: <p>Пространство «{space.name}» и все страницы ({space.stats.pages}) переместятся в корзину. Восстановить его сможет руководитель пространства или администратор.</p>,
    });
    if (!ok) return;
    try {
      await del(`/api/v1/spaces/${space.id}`, { confirmName: space.name });
      qc.invalidateQueries({ queryKey: ['spaces'] });
      toast.success('Пространство перемещено в корзину', { label: 'Открыть корзину', run: () => navigate('/trash') });
      navigate('/');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Не удалось удалить');
    }
  };

  return (
    <form
      className="col space-settings"
      style={{ gap: 16 }}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="row" style={{ alignItems: 'flex-end', gap: 12 }}>
        <div className="field">
          <span className="field-label">Иконка</span>
          <button type="button" className="btn space-icon-btn" aria-label="Выбрать иконку" onClick={(e) => setIconAnchor(e.currentTarget)}>
            {icon || '📁'}
          </button>
        </div>
        <div className="field grow">
          <label htmlFor="sp-name">Название</label>
          <input id="sp-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} aria-invalid={!name.trim()} />
        </div>
      </div>
      {iconAnchor && <IconPickerPopover anchor={iconAnchor} onPick={(i) => (setIcon(i), setIconAnchor(null))} onRemove={() => (setIcon(null), setIconAnchor(null))} onClose={() => setIconAnchor(null)} />}
      <div className="field">
        <label htmlFor="sp-desc">Описание</label>
        <textarea id="sp-desc" className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
      </div>
      {!personal && (
        <div className="field">
          <label htmlFor="sp-vis">Видимость</label>
          <select id="sp-vis" className="select" value={visibility} onChange={(e) => setVisibility(e.target.value as SpaceDetail['visibility'])}>
            {Object.entries(VISIBILITY).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label} — {v.hint}
              </option>
            ))}
          </select>
        </div>
      )}
      <fieldset className="space-fieldset">
        <legend className="field-label">Публикация</legend>
        <div className="space-radio">
          <label className="checkbox">
            <input type="radio" name="pubmode" checked={policy.publishingMode === 'live'} onChange={() => setP('publishingMode', 'live')} />
            <span>
              <b>Сразу</b> <span className="muted small">— читатели видят текущую версию</span>
            </span>
          </label>
          <label className="checkbox">
            <input type="radio" name="pubmode" checked={policy.publishingMode === 'publish'} onChange={() => setP('publishingMode', 'publish')} />
            <span>
              <b>После публикации</b> <span className="muted small">— читатели видят только опубликованные версии</span>
            </span>
          </label>
        </div>
        <Toggle id="sp-approval" label="Согласование перед публикацией" hint="Публикация требует одобрения руководителя" checked={policy.requireApproval} disabled={policy.publishingMode !== 'publish'} onChange={(v) => setP('requireApproval', v)} />
      </fieldset>
      <fieldset className="space-fieldset">
        <legend className="field-label">Ограничения</legend>
        <Toggle id="sp-export" label="Разрешить экспорт" hint="DOCX, Markdown, PDF, HTML" checked={policy.allowExport} onChange={(v) => setP('allowExport', v)} />
        <Toggle id="sp-download" label="Разрешить скачивание вложений" checked={policy.allowDownload} onChange={(v) => setP('allowDownload', v)} />
        {!personal && <Toggle id="sp-guests" label="Разрешить доступ гостям" hint="Внешние пользователи с приглашением" checked={policy.allowGuests} onChange={(v) => setP('allowGuests', v)} />}
      </fieldset>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn"
          disabled={!dirty || busy}
          onClick={() => {
            setName(space.name);
            setDescription(space.description ?? '');
            setIcon(space.icon);
            setVisibility(space.visibility);
            setPolicy(space.policy);
            setError(null);
          }}
        >
          Сбросить
        </button>
        <button type="submit" className="btn primary" disabled={!dirty || busy} aria-busy={busy}>
          {busy && <span className="spinner" />} Сохранить
        </button>
      </div>
      {!personal && (
        <div className="space-danger card">
          <b>Опасная зона</b>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={toggleArchive}>
              <Archive size={15} /> {space.archived_at ? 'Вернуть из архива' : 'Архивировать'}
            </button>
            <button type="button" className="btn danger" onClick={remove}>
              <Trash2 size={15} /> Удалить пространство
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

export default function SpacePage() {
  const { spaceId = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['space', spaceId], queryFn: ({ signal }) => get<{ space: SpaceDetail }>(`/api/v1/spaces/${spaceId}`, signal), enabled: !!spaceId });
  const [params] = useSearchParams();
  const wanted = params.get('tab');
  const initialTab = wanted === 'access' || wanted === 'settings' ? wanted : 'pages';
  const [tab, setTab] = useState<'pages' | 'access' | 'settings'>(initialTab);
  const [busy, setBusy] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  // ?tab=… (e.g. «Настройки и участники» in the tree menu) selects the section; switching spaces resets it
  useEffect(() => setTab(initialTab), [spaceId, initialTab]);

  if (q.isLoading)
    return (
      <div className="page-container" aria-busy="true" aria-label="Загрузка">
        <div className="skeleton" style={{ height: 48, width: 48, borderRadius: 12, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 30, width: '40%', marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 16, width: '70%', marginBottom: 24 }} />
        <div className="col">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 40 }} />
          ))}
        </div>
      </div>
    );
  if (q.isError) {
    const e = q.error;
    const notFound = e instanceof ApiError && (e.status === 404 || e.status === 403);
    return (
      <div className="page-container">
        {notFound ? (
          <div className="empty-state">
            <div className="empty-icon">🔒</div>
            <h3>Пространство недоступно</h3>
            <p>Оно не существует, удалено или у вас нет доступа.</p>
            <Link className="btn" to="/">
              На главную
            </Link>
          </div>
        ) : (
          <ErrorState error={e} onRetry={() => q.refetch()} />
        )}
      </div>
    );
  }
  const space = q.data!.space;
  const personal = space.kind === 'personal';
  const canManage = !!space.actions.manage_space;
  const vis = VISIBILITY[space.visibility];
  const tabs: Array<{ id: typeof tab; label: string; icon: JSX.Element }> = [
    { id: 'pages', label: 'Страницы', icon: <FileText size={15} /> },
    ...(!personal ? [{ id: 'access' as const, label: 'Участники', icon: <Users size={15} /> }] : []),
    ...(canManage ? [{ id: 'settings' as const, label: 'Настройки', icon: <Settings size={15} /> }] : []),
  ];
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = tabs.findIndex((t) => t.id === tab);
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    setTab(n.id);
    tabsRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${n.id}"]`)?.focus();
  };

  const newPage = async () => {
    setBusy(true);
    try {
      const p = await createPage(space.id, null);
      navigate(`/p/${p.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Не удалось создать страницу');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-container space-page">
      <header className="space-head">
        <span className="space-head-icon" aria-hidden>
          {space.icon || (personal ? '🏠' : '📁')}
        </span>
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 className="page-heading">{personal ? 'Личное пространство' : space.name}</h1>
          <div className="row space-badges">
            {!personal && vis && (
              <span className="badge" title={vis.hint}>
                {vis.icon} {vis.label}
              </span>
            )}
            {KIND[space.kind] && <span className="badge">{KIND[space.kind]}</span>}
            <span className="badge blue">{LEVEL_LABEL[space.level] ?? space.level}</span>
            {space.policy?.publishingMode === 'publish' && <span className="badge purple">Публикация</span>}
            {space.archived_at && <span className="badge amber">В архиве с {relTime(space.archived_at)}</span>}
            <span className="small muted">Страниц: {space.stats.pages}</span>
          </div>
          {space.description && <p className="space-desc muted">{space.description}</p>}
        </div>
      </header>

      <div className="row space-actions">
        {space.actions.create && !space.archived_at && (
          <button className="btn primary" onClick={newPage} disabled={busy} aria-busy={busy}>
            <FilePlus2 size={16} /> Новая страница
          </button>
        )}
        {space.actions.create && !space.archived_at && (
          <>
            <Link className="btn" to={`/templates?spaceId=${space.id}`}>
              <LayoutTemplate size={16} /> Из шаблона
            </Link>
            <Link className="btn" to={`/import?spaceId=${space.id}`}>
              <Upload size={16} /> Импорт
            </Link>
          </>
        )}
      </div>

      {tabs.length > 1 && (
        <div className="tabs space-tabs" role="tablist" aria-label="Разделы пространства" ref={tabsRef} onKeyDown={onTabKey}>
          {tabs.map((t) => (
            <button key={t.id} data-tab={t.id} role="tab" className="tab row" aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} aria-controls={`space-panel-${t.id}`} onClick={() => setTab(t.id)}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      )}
      <div role="tabpanel" id={`space-panel-${tab}`} className="space-panel">
        {tab === 'pages' && <PagesTab space={space} />}
        {tab === 'access' && <AccessTab space={space} />}
        {tab === 'settings' && canManage && (
          <SettingsTab
            space={space}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ['space', space.id] });
              qc.invalidateQueries({ queryKey: ['spaces'] });
              qc.invalidateQueries({ queryKey: ['space-access', space.id] });
            }}
          />
        )}
      </div>
    </div>
  );
}
