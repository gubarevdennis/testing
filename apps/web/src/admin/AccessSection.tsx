import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X, ShieldCheck, Grid3x3, Siren, Globe2, UserMinus, Search } from 'lucide-react';
import { get, post, del } from '../api/client';
import { useMe } from '../state/session';
import { confirm } from '../components/ui/Confirm';
import { toast } from '../components/ui/Toast';
import { useInFlight } from '../hooks/useInFlight';
import { LEVEL_LABEL, fullTime } from '../lib/format';
import { Badge, Empty, ErrorState, LoadingRows, SectionHeader, UserPicker, errMsg, roleOf, useDebounced, type DirectoryUser, type AdminUser } from './common';

const ACTION_LABEL: Record<string, string> = {
  view: 'Просмотр',
  comment: 'Комментирование',
  edit: 'Редактирование',
  create: 'Создание подстраниц',
  manage_structure: 'Перемещение и структура',
  publish: 'Публикация',
  share: 'Управление доступом',
  export: 'Экспорт',
  download: 'Скачивание вложений',
  view_history: 'История версий',
  restore: 'Восстановление',
  delete: 'Удаление',
  manage_space: 'Управление пространством',
};
const VIA: Record<string, string> = { space: 'права пространства', 'inherited-page': 'унаследовано от родительской страницы', group: 'через группу', org: 'для всей организации', direct: 'выдано напрямую' };
const SHORT: Record<string, string> = { none: '—', view: 'Просм.', comment: 'Комм.', edit: 'Ред.', full: 'Полный' };

/** Accepts a page link (…/p/<id>) or a bare id. */
function pageIdFrom(text: string): string | null {
  return /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(text)?.[1] ?? null;
}

interface ExplainPage {
  user: { id: string; name: string; active: boolean; kind: string; status: string };
  page: { id: string; title: string; inheritPermissions: boolean };
  level: string;
  actions: Record<string, boolean>;
  explanation: string[];
  sources: Array<{ via: string; level: string; resourceType: string; subject: { name: string }; expiresAt: string | null }>;
  denies: Array<{ via: string; subject: { name: string } }>;
  inheritanceChain: Array<{ id: string; title: string; inherits: boolean; depth: number }>;
}
interface ExplainSpaces {
  user: { id: string; name: string; active: boolean };
  spaces: Array<{ id: string; name: string; level: string; explanation: string[] }>;
}

/** «Проверить доступ»: user + document → can / cannot, actions, sources and the inheritance chain, without impersonation (R-ADMIN-018). */
function CheckAccess() {
  const [user, setUser] = useState<DirectoryUser | null>(null);
  const [pageText, setPageText] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const dq = useDebounced(pageText, 200);
  const pageId = pageIdFrom(pageText);
  const suggest = useQuery({
    queryKey: ['admin-access-suggest', dq],
    queryFn: () => get<{ suggestions: Array<{ pageId: string; title: string }> }>(`/api/v1/search/suggest?q=${encodeURIComponent(dq)}`),
    enabled: !!dq.trim() && !pageIdFrom(dq) && suggestOpen,
  });
  const res = useQuery({
    queryKey: ['admin-access-explain', user?.id, pageId],
    queryFn: () => get<ExplainPage | ExplainSpaces>(`/api/v1/access/explain?userId=${user!.id}${pageId ? `&pageId=${pageId}` : ''}`),
    enabled: !!user,
  });
  return (
    <div className="col" style={{ gap: 12 }}>
      <p className="muted small">Проверка выполняется на сервере по тем же правилам, что и доступ сотрудника, — без входа под его учётной записью. Названия документов, недоступных вам, скрыты.</p>
      <div className="admin-two">
        <div className="field">
          <label htmlFor="check-user">Сотрудник</label>
          <UserPicker id="check-user" value={user} onChange={setUser} />
        </div>
        <div className="field" style={{ position: 'relative' }}>
          <label htmlFor="check-page">Документ (ссылка, ID или название)</label>
          <input
            id="check-page"
            className="input"
            placeholder="https://…/p/… или начните вводить название"
            value={pageText}
            autoComplete="off"
            onFocus={() => setSuggestOpen(true)}
            onChange={(e) => {
              setPageText(e.target.value);
              setSuggestOpen(true);
            }}
          />
          {suggestOpen && !!suggest.data?.suggestions.length && !pageId && (
            <div className="admin-picker-list" role="listbox" aria-label="Документы">
              {suggest.data.suggestions.slice(0, 8).map((s) => (
                <button
                  key={s.pageId}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="pick-item"
                  onClick={() => {
                    setPageText(`${s.title || 'Без названия'} — ${s.pageId}`);
                    setSuggestOpen(false);
                  }}
                >
                  <span className="grow ellipsis">{s.title || 'Без названия'}</span>
                </button>
              ))}
            </div>
          )}
          <div className="field-hint">Без документа — уровни сотрудника во всех пространствах.</div>
        </div>
      </div>
      {!user ? (
        <Empty icon={<ShieldCheck size={32} />} title="Выберите сотрудника">
          и документ, чтобы увидеть, может ли он его открыть и почему.
        </Empty>
      ) : res.isLoading ? (
        <LoadingRows rows={4} />
      ) : res.isError ? (
        <ErrorState error={res.error} onRetry={() => res.refetch()} />
      ) : res.data && 'page' in res.data ? (
        <ExplainPageView r={res.data} />
      ) : res.data ? (
        <div className="table-wrap">
          <table className="table admin-table" aria-label="Доступ к пространствам">
            <thead>
              <tr>
                <th>Пространство</th>
                <th>Уровень</th>
                <th>Почему</th>
              </tr>
            </thead>
            <tbody>
              {(res.data as ExplainSpaces).spaces.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.level === 'none' ? <span className="muted">Нет доступа</span> : <Badge color="blue">{LEVEL_LABEL[s.level]}</Badge>}</td>
                  <td className="small muted">{s.explanation.join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function ExplainPageView({ r }: { r: ExplainPage }) {
  const can = r.level !== 'none';
  return (
    <div className="card col access-check-result" style={{ gap: 10, padding: 16 }} aria-live="polite">
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <b>{r.user.name}</b>
        <span>{can ? 'может открыть' : 'не может открыть'}</span>
        <b>«{r.page.title || 'Без названия'}»</b>
        <Badge color={can ? 'green' : 'red'}>{can ? LEVEL_LABEL[r.level] : 'Нет доступа'}</Badge>
        {!r.user.active && <Badge color="red">учётная запись неактивна</Badge>}
      </div>
      <div className="table-wrap">
        <table className="table admin-table" aria-label="Действия">
          <thead>
            <tr>
              <th>Действие</th>
              <th>Результат</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(r.actions).map(([a, ok]) => (
              <tr key={a}>
                <td>{ACTION_LABEL[a] ?? a}</td>
                <td>{ok ? <span className="row" style={{ gap: 4, color: 'var(--success, green)' }}><Check size={14} /> может</span> : <span className="row muted" style={{ gap: 4 }}><X size={14} /> не может</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.explanation.length > 0 && (
        <div>
          <b className="small">Объяснение</b>
          <ul className="admin-list">{r.explanation.map((l, i) => <li key={i}>{l}</li>)}</ul>
        </div>
      )}
      {r.sources.length > 0 && (
        <div>
          <b className="small">Источники доступа</b>
          <ul className="admin-list">
            {r.sources.map((s, i) => (
              <li key={i}>
                {s.subject?.name} — {LEVEL_LABEL[s.level] ?? s.level}, {VIA[s.via] ?? s.via}
                {s.expiresAt ? `, до ${fullTime(s.expiresAt)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      {r.denies.length > 0 && (
        <div>
          <b className="small">Запреты (имеют приоритет)</b>
          <ul className="admin-list">{r.denies.map((s, i) => <li key={i}>{s.subject?.name} — {VIA[s.via] ?? s.via}</li>)}</ul>
        </div>
      )}
      {r.inheritanceChain.length > 0 && (
        <div className="small">
          <b>Цепочка наследования:</b>{' '}
          {r.inheritanceChain
            .slice()
            .sort((a, b) => b.depth - a.depth)
            .map((c) => `${c.title || 'Без названия'}${c.inherits ? '' : ' (не наследует)'}`)
            .join(' → ')}
        </div>
      )}
    </div>
  );
}

interface Matrix {
  total: number;
  users: Array<{ id: string; name: string; kind: string; status: string }>;
  spaces: Array<{ id: string; name: string; icon: string | null; managers: string[] }>;
  cells: Record<string, Record<string, { level: string; source: string; expiresAt: string | null; conflict: boolean }>>;
}

/** Users × spaces effective access (R-ADMIN-010): level, source, expiry, conflicts, managers. Personal spaces are not shown. */
function AccessMatrix() {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const m = useQuery({ queryKey: ['admin-access-matrix', dq], queryFn: () => get<Matrix>(`/api/v1/admin/access-matrix?limit=200&q=${encodeURIComponent(dq)}`) });
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="admin-toolbar">
        <div className="admin-search grow">
          <Search size={15} className="admin-search-icon" aria-hidden />
          <input className="input" type="search" placeholder="Фильтр по имени сотрудника" aria-label="Фильтр по имени" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {m.isLoading ? (
        <LoadingRows rows={6} />
      ) : m.isError ? (
        <ErrorState error={m.error} onRetry={() => m.refetch()} />
      ) : !m.data!.users.length ? (
        <Empty title="Никого не найдено" />
      ) : (
        <>
          <p className="small muted">
            Показано сотрудников: {m.data!.users.length} из {m.data!.total}. Наведите на ячейку, чтобы увидеть источник и срок; <span className="access-conflict-legend">красная рамка</span> — запрет рядом с разрешением (конфликт). Личные пространства не показываются.
          </p>
          <div className="table-wrap access-matrix-wrap">
            <table className="table admin-table access-matrix" aria-label="Матрица доступа">
              <thead>
                <tr>
                  <th scope="col">Сотрудник</th>
                  {m.data!.spaces.map((s) => (
                    <th scope="col" key={s.id} title={s.managers.length ? `Руководители: ${s.managers.join(', ')}` : 'Нет руководителя с полным доступом'}>
                      {s.icon ? `${s.icon} ` : ''}
                      {s.name}
                    </th>
                  ))}
                </tr>
                <tr className="small muted">
                  <th scope="row">Руководители</th>
                  {m.data!.spaces.map((s) => (
                    <td key={s.id} className="small muted">
                      {s.managers.join(', ') || '—'}
                    </td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.data!.users.map((u) => (
                  <tr key={u.id}>
                    <th scope="row" style={{ fontWeight: 500 }}>
                      {u.name} {u.kind === 'guest' && <Badge color="amber">гость</Badge>}
                    </th>
                    {m.data!.spaces.map((s) => {
                      const c = m.data!.cells[u.id]?.[s.id];
                      if (!c) return <td key={s.id} className="muted" aria-label="Нет доступа">—</td>;
                      const title = `${LEVEL_LABEL[c.level]}${c.source ? ` · ${c.source}` : ''}${c.expiresAt ? ` · до ${fullTime(c.expiresAt)}` : ''}`;
                      return (
                        <td key={s.id} title={title} className={c.conflict ? 'access-conflict' : undefined} aria-label={title}>
                          {SHORT[c.level]}
                          {c.expiresAt ? ' ⏳' : ''}
                          {c.conflict ? ' ⚠' : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

interface Emergency {
  id: string;
  page_id: string;
  title: string;
  requested_by: string;
  requested_by_name: string;
  decided_by_name: string | null;
  reason: string;
  duration_hours: number;
  status: 'pending' | 'approved' | 'rejected' | 'revoked';
  created_at: string;
  decided_at: string | null;
}
const EM_STATUS: Record<string, { label: string; color: string }> = { pending: { label: 'Ожидает утверждения', color: 'amber' }, approved: { label: 'Утверждён', color: 'green' }, rejected: { label: 'Отклонён', color: 'red' }, revoked: { label: 'Отозван', color: '' } };

/** Two-person emergency access with reason, time limit and audit (R-ACL-056). */
function EmergencyAccess({ canAct }: { canAct: boolean }) {
  const me = useMe();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['admin-emergency'], queryFn: () => get<{ requests: Emergency[] }>('/api/v1/admin/emergency-access') });
  const [pageText, setPageText] = useState('');
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState(4);
  const [busy, setBusy] = useState(false);
  const pageId = pageIdFrom(pageText);
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-emergency'] });
  const request = async () => {
    setBusy(true);
    try {
      await post('/api/v1/admin/emergency-access', { pageId, reason: reason.trim(), durationHours: hours });
      toast.success('Запрос отправлен — его должен утвердить другой администратор');
      setPageText('');
      setReason('');
      refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  // one decision / revocation at a time: a second click while the first is in flight would hit an already decided
  // request and report «not found» after the success (QA-A5)
  const once = useInFlight();
  const [acting, setActing] = useState<string | null>(null);
  const act = (r: Emergency, fn: () => Promise<void>) =>
    once(async () => {
      setActing(r.id);
      try {
        await fn();
      } catch (e) {
        toast.error(errMsg(e));
      } finally {
        setActing(null);
      }
    });
  const decide = (r: Emergency, approve: boolean) =>
    act(r, async () => {
      if (!(await confirm({ title: approve ? 'Утвердить экстренный доступ?' : 'Отклонить запрос?', body: approve ? `${r.requested_by_name} получит доступ только для чтения на ${r.duration_hours} ч. Владелец материала получит уведомление; действие попадёт в журнал аудита.` : 'Запрос будет отклонён и записан в журнал аудита.', confirmLabel: approve ? 'Утвердить' : 'Отклонить', danger: !approve }))) return;
      await post(`/api/v1/admin/emergency-access/${r.id}/decide`, { approve });
      toast.success(approve ? 'Экстренный доступ утверждён' : 'Запрос отклонён');
      await refresh();
    });
  const revoke = (r: Emergency) =>
    act(r, async () => {
      await post(`/api/v1/admin/emergency-access/${r.id}/revoke`, {});
      toast.success('Экстренный доступ отозван');
      await refresh();
    });
  return (
    <div className="col" style={{ gap: 12 }}>
      <p className="muted small">
        Роль администратора не открывает личные и закрытые материалы. Экстренный доступ — только для чтения, на ограниченный срок, с основанием и утверждением вторым администратором; владелец материала уведомляется, все шаги записываются в журнал аудита.
      </p>
      {canAct && (
        <fieldset className="admin-fieldset">
          <legend className="field-label">Запросить экстренный доступ</legend>
          <div className="field">
            <label htmlFor="em-page">Документ (ссылка или ID)</label>
            <input id="em-page" className="input" value={pageText} onChange={(e) => setPageText(e.target.value)} aria-invalid={!!pageText && !pageId} />
          </div>
          <div className="field">
            <label htmlFor="em-reason">Основание (не менее 20 символов)</label>
            <textarea id="em-reason" className="textarea" rows={2} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="field" style={{ maxWidth: 240 }}>
            <label htmlFor="em-hours">Срок</label>
            <select id="em-hours" className="select" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {[1, 4, 8, 24, 72].map((h) => (
                <option key={h} value={h}>
                  {h} ч
                </option>
              ))}
            </select>
          </div>
          <div>
            <button className="btn primary" disabled={!pageId || reason.trim().length < 20 || busy} aria-busy={busy} onClick={request}>
              Отправить запрос
            </button>
          </div>
        </fieldset>
      )}
      {list.isLoading ? (
        <LoadingRows rows={3} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data!.requests.length ? (
        <Empty icon={<Siren size={32} />} title="Запросов экстренного доступа не было" />
      ) : (
        <div className="table-wrap">
          <table className="table admin-table" aria-label="Запросы экстренного доступа">
            <thead>
              <tr>
                <th>Когда</th>
                <th>Кто</th>
                <th>Документ</th>
                <th>Основание</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data!.requests.map((r) => (
                <tr key={r.id}>
                  <td className="small">{fullTime(r.created_at)}</td>
                  <td>{r.requested_by_name}</td>
                  <td>{r.title || 'Без названия'}</td>
                  <td className="small">
                    {r.reason} <span className="muted">({r.duration_hours} ч)</span>
                  </td>
                  <td>
                    <Badge color={EM_STATUS[r.status].color}>{EM_STATUS[r.status].label}</Badge>
                    {r.decided_by_name && <div className="small muted">{r.decided_by_name}</div>}
                  </td>
                  <td className="admin-cell-actions">
                    {canAct && r.status === 'pending' && r.requested_by !== me.user.id && (
                      <>
                        <button className="btn sm primary" disabled={acting === r.id} onClick={() => decide(r, true)}>
                          Утвердить
                        </button>{' '}
                        <button className="btn sm" disabled={acting === r.id} onClick={() => decide(r, false)}>
                          Отклонить
                        </button>
                      </>
                    )}
                    {canAct && r.status === 'pending' && r.requested_by === me.user.id && <span className="small muted">ждёт другого администратора</span>}
                    {canAct && r.status === 'approved' && (
                      <button className="btn sm" disabled={acting === r.id} aria-busy={acting === r.id} onClick={() => revoke(r)}>
                        {acting === r.id && <span className="spinner" />} Отозвать
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface OrgLink {
  id: string;
  pageId: string;
  createdByName: string | null;
  createdAt: string;
  expiresAt: string | null;
  hasPassword: boolean;
  allowDownload: boolean;
  accessCount: number;
}

function PublicLinksAdmin({ canAct }: { canAct: boolean }) {
  const me = useMe();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-share-links'], queryFn: () => get<{ links: OrgLink[] }>('/api/v1/admin/share-links') });
  const revoke = async (l: OrgLink) => {
    if (!(await confirm({ title: 'Отозвать публичную ссылку?', body: 'Ссылка перестанет открываться немедленно.', confirmLabel: 'Отозвать', danger: true }))) return;
    try {
      await del(`/api/v1/share-links/${l.id}`);
      toast.success('Ссылка отозвана');
      qc.invalidateQueries({ queryKey: ['admin-share-links'] });
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  return (
    <div className="col" style={{ gap: 12 }}>
      <p className="muted small">
        Публичные ссылки {me.org.settings.publicLinksEnabled ? 'разрешены' : 'запрещены'} политикой организации (Настройки организации). Отключение политики сразу останавливает все существующие ссылки.
      </p>
      {q.isLoading ? (
        <LoadingRows rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data!.links.length ? (
        <Empty icon={<Globe2 size={32} />} title="Активных публичных ссылок нет" />
      ) : (
        <div className="table-wrap">
          <table className="table admin-table" aria-label="Публичные ссылки">
            <thead>
              <tr>
                <th>Документ</th>
                <th>Создал</th>
                <th>Срок</th>
                <th>Параметры</th>
                <th>Просмотры</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data!.links.map((l) => (
                <tr key={l.id}>
                  <td className="small">{l.pageId}</td>
                  <td>{l.createdByName}</td>
                  <td className="small">{l.expiresAt ? fullTime(l.expiresAt) : 'бессрочно'}</td>
                  <td className="small">
                    {l.hasPassword ? 'пароль' : 'без пароля'}, {l.allowDownload ? 'скачивание' : 'без скачивания'}
                  </td>
                  <td>{l.accessCount}</td>
                  <td className="admin-cell-actions">
                    {canAct && (
                      <button className="btn sm danger" onClick={() => revoke(l)}>
                        Отозвать
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Policy for personal materials of departing employees (R-ADMIN-016). */
function Offboarding() {
  const users = useQuery({ queryKey: ['admin-offboard-users'], queryFn: async () => [...(await get<{ users: AdminUser[] }>('/api/v1/admin/users?status=deactivated&limit=500')).users, ...(await get<{ users: AdminUser[] }>('/api/v1/admin/users?status=suspended&limit=500')).users] });
  const [userId, setUserId] = useState('');
  const [mode, setMode] = useState<'archive' | 'transfer_shared'>('archive');
  const [successor, setSuccessor] = useState<DirectoryUser | null>(null);
  const [preview, setPreview] = useState<{ pages: number; shared: number; private: number; transferred: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const body = (dryRun: boolean) => ({ mode, successorId: mode === 'transfer_shared' ? successor?.id : undefined, dryRun });
  const run = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const r = await post<{ pages: number; shared: number; private: number; transferred: number }>(`/api/v1/admin/users/${userId}/offboard-personal`, body(dryRun));
      if (dryRun) setPreview(r);
      else {
        toast.success(`Готово: личное пространство архивировано${r.transferred ? `, передано документов: ${r.transferred}` : ''}`);
        setPreview(null);
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="col" style={{ gap: 12 }}>
      <p className="muted small">
        Для приостановленных и отключённых сотрудников. Частные заметки никому не раскрываются: передаются только документы, которыми сотрудник уже поделился с коллегами; остальное архивируется в закрытом личном пространстве. В журнал аудита попадают только количества, без названий.
      </p>
      <div className="admin-two">
        <div className="field">
          <label htmlFor="off-user">Сотрудник</label>
          <select id="off-user" className="select" value={userId} onChange={(e) => (setUserId(e.target.value), setPreview(null))}>
            <option value="">— выберите —</option>
            {(users.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.status === 'deactivated' ? 'отключён' : 'приостановлен'})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="off-mode">Политика</label>
          <select id="off-mode" className="select" value={mode} onChange={(e) => (setMode(e.target.value as typeof mode), setPreview(null))}>
            <option value="archive">Архивировать личные материалы</option>
            <option value="transfer_shared">Передать преемнику документы, которыми он делился</option>
          </select>
        </div>
      </div>
      {mode === 'transfer_shared' && (
        <div className="field">
          <label htmlFor="off-successor">Преемник</label>
          <UserPicker id="off-successor" value={successor} onChange={setSuccessor} />
        </div>
      )}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn" disabled={!userId || busy || (mode === 'transfer_shared' && !successor)} onClick={() => run(true)}>
          Предпросмотр
        </button>
        <button className="btn primary" disabled={!preview || busy} onClick={() => run(false)}>
          Применить
        </button>
      </div>
      {preview && (
        <div className="card admin-preview" style={{ padding: 12 }} role="status">
          Страниц в личном пространстве: {preview.pages}; уже доступны коллегам: {preview.shared}; только личные: {preview.private}.{' '}
          {mode === 'transfer_shared' ? `Преемнику будет передано: ${preview.transferred}.` : 'Все останутся закрытыми и будут архивированы.'}
        </div>
      )}
    </div>
  );
}

type Tab = 'check' | 'matrix' | 'emergency' | 'links' | 'offboarding';

export function AccessSection() {
  const me = useMe();
  const r = roleOf(me.user.orgRole);
  const tabs: Array<{ id: Tab; label: string; icon: JSX.Element; show: boolean }> = [
    { id: 'check', label: 'Проверить доступ', icon: <ShieldCheck size={14} />, show: true },
    { id: 'matrix', label: 'Матрица доступа', icon: <Grid3x3 size={14} />, show: true },
    { id: 'emergency', label: 'Экстренный доступ', icon: <Siren size={14} />, show: r.isAdmin || r.canAudit },
    { id: 'links', label: 'Публичные ссылки', icon: <Globe2 size={14} />, show: r.isAdmin || r.canAudit },
    { id: 'offboarding', label: 'Увольнение: личные материалы', icon: <UserMinus size={14} />, show: r.canPeople },
  ];
  const visible = tabs.filter((t) => t.show);
  const [tab, setTab] = useState<Tab>('check');
  return (
    <section>
      <SectionHeader title="Доступ" sub="Эффективные права сотрудников, проверка доступа к документу, экстренный доступ и публичные ссылки." />
      <div className="tabs" role="tablist" aria-label="Разделы доступа" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        {visible.map((t) => (
          <button key={t.id} role="tab" className="tab row" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'check' && <CheckAccess />}
        {tab === 'matrix' && <AccessMatrix />}
        {tab === 'emergency' && <EmergencyAccess canAct={r.isAdmin} />}
        {tab === 'links' && <PublicLinksAdmin canAct={r.isAdmin} />}
        {tab === 'offboarding' && r.canPeople && <Offboarding />}
      </div>
    </section>
  );
}
