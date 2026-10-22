import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ellipsis, FileUp, Search, UserPlus, Users } from 'lucide-react';
import { get, patch, post, put, del } from '../api/client';
import { useMe } from '../state/session';
import { useSpaces } from '../hooks/data';
import { Dialog } from '../components/ui/Dialog';
import { Menu, type MenuEntry } from '../components/ui/Menu';
import { confirm } from '../components/ui/Confirm';
import { toast } from '../components/ui/Toast';
import { Avatar } from '../components/Avatar';
import { relTime, fullTime, LEVEL_LABEL } from '../lib/format';
import {
  type AdminUser,
  type AdminGroup,
  type DirectoryUser,
  Badge,
  CopyField,
  Empty,
  ErrorState,
  LoadingRows,
  Pager,
  ROLE_LABEL,
  SectionHeader,
  StatusBadge,
  UserPicker,
  copyText,
  downloadBlob,
  errMsg,
  roleOf,
  toCsv,
  toIso,
  toLocalInput,
  useDebounced,
  useGroups,
  useUserDetail,
  USER_STATUS,
} from './common';

const LIMIT = 50;

type DialogState =
  | { kind: 'create' }
  | { kind: 'import' }
  | { kind: 'edit'; user: AdminUser }
  | { kind: 'status'; user: AdminUser; status: 'suspended' | 'deactivated' }
  | { kind: 'transfer'; user: AdminUser }
  | { kind: 'link'; title: string; text: string; url: string }
  | null;

export function UsersSection() {
  const me = useMe();
  const { isAdmin } = roleOf(me.user.orgRole);
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('');
  const [role, setRole] = useState('');
  const [groupId, setGroupId] = useState('');
  const [offset, setOffset] = useState(0);
  const [dialog, setDialog] = useState<DialogState>(null);
  const dq = useDebounced(q.trim(), 300);
  useEffect(() => setOffset(0), [dq, status, kind, role, groupId]);
  const groups = useGroups();

  const params = new URLSearchParams({ q: dq, offset: String(offset), limit: String(LIMIT) });
  if (status) params.set('status', status);
  // «Гость» is a kind, not an org role; other values map to the server-side role filter.
  if (role === 'guest') params.set('kind', 'guest');
  else if (kind) params.set('kind', kind);
  if (role && role !== 'guest') params.set('role', role);
  if (groupId) params.set('groupId', groupId);
  const list = useQuery({
    queryKey: ['admin', 'users', params.toString()],
    queryFn: () => get<{ users: AdminUser[]; total: number | string }>('/api/v1/admin/users?' + params.toString()),
    placeholderData: keepPreviousData,
  });
  const users = list.data?.users ?? [];
  const total = Number(list.data?.total ?? 0);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    qc.invalidateQueries({ queryKey: ['admin', 'user'] });
    qc.invalidateQueries({ queryKey: ['admin', 'owned-pages'] });
    qc.invalidateQueries({ queryKey: ['admin', 'groups'] });
  };

  const action = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
      toast.success(success);
      refresh();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const menuFor = (u: AdminUser): MenuEntry[] => {
    const self = u.id === me.user.id;
    const items: MenuEntry[] = [
      { id: 'edit', label: 'Изменить профиль и роль', onSelect: () => setDialog({ kind: 'edit', user: u }) },
    ];
    if (u.kind === 'employee') items.push({ id: 'transfer', label: 'Перевести в другой отдел…', onSelect: () => setDialog({ kind: 'transfer', user: u }) });
    items.push({ separator: true });
    if (u.status === 'invited') {
      items.push({
        id: 'resend',
        label: 'Отправить приглашение повторно',
        onSelect: () =>
          post<{ inviteUrl: string }>(`/api/v1/admin/invitations/${u.id}/resend`)
            .then((r) => setDialog({ kind: 'link', title: 'Новое приглашение', text: `Предыдущие ссылки для ${u.email} отозваны. Передайте новую ссылку сотруднику — она действует 7 дней.`, url: r.inviteUrl }))
            .catch((e) => toast.error(errMsg(e))),
      });
      items.push({
        id: 'revoke-invite',
        label: 'Отозвать приглашение',
        danger: true,
        onSelect: async () => {
          if (await confirm({ title: 'Отозвать приглашение?', body: `Ссылка-приглашение для ${u.email} перестанет работать. Пользователь останется в списке со статусом «Приглашён».`, confirmLabel: 'Отозвать', danger: true }))
            action(() => post(`/api/v1/admin/invitations/${u.id}/revoke`), 'Приглашение отозвано');
        },
      });
    }
    if (u.status === 'active') {
      items.push({
        id: 'reset',
        label: 'Сбросить пароль',
        onSelect: async () => {
          if (!(await confirm({ title: 'Сбросить пароль?', body: `Все сеансы ${u.name} будут завершены. Вы получите одноразовую ссылку для установки нового пароля (действует 24 часа).`, confirmLabel: 'Сбросить пароль' }))) return;
          try {
            const r = await post<{ resetUrl: string }>(`/api/v1/admin/users/${u.id}/reset-password`);
            setDialog({ kind: 'link', title: 'Ссылка для сброса пароля', text: `Передайте ссылку ${u.name} по защищённому каналу. Ссылка одноразовая и действует 24 часа.`, url: r.resetUrl });
          } catch (e) {
            toast.error(errMsg(e));
          }
        },
      });
      items.push({
        id: 'sessions',
        label: 'Завершить все сеансы',
        onSelect: async () => {
          if (await confirm({ title: 'Завершить все сеансы?', body: `${u.name} будет выведен из системы на всех устройствах и должен будет войти заново.`, confirmLabel: 'Завершить сеансы', danger: true }))
            action(() => post(`/api/v1/admin/users/${u.id}/revoke-sessions`), 'Сеансы завершены');
        },
      });
      items.push({ separator: true });
      items.push({ id: 'suspend', label: 'Приостановить доступ…', disabled: self, disabledReason: 'Нельзя отключить себя', onSelect: () => setDialog({ kind: 'status', user: u, status: 'suspended' }) });
    }
    if (u.status === 'suspended' || u.status === 'deactivated') {
      items.push({
        id: 'reactivate',
        label: 'Восстановить доступ',
        onSelect: async () => {
          if (await confirm({ title: 'Восстановить доступ?', body: `${u.name} снова сможет входить в систему. Истёкшие временные доступы и приглашения автоматически не восстанавливаются.`, confirmLabel: 'Восстановить' }))
            action(() => post(`/api/v1/admin/users/${u.id}/status`, { status: 'active', reason: '' }), 'Доступ восстановлен');
        },
      });
    }
    if (u.status !== 'deactivated')
      items.push({ id: 'deactivate', label: 'Деактивировать (увольнение)…', danger: true, disabled: self, disabledReason: 'Нельзя отключить себя', onSelect: () => setDialog({ kind: 'status', user: u, status: 'deactivated' }) });
    return items;
  };

  const groupName = (id: string | null) => groups.data?.groups.find((g) => g.id === id)?.name;

  return (
    <section>
      <SectionHeader
        title="Пользователи"
        sub="Сотрудники и гости организации: роли, статусы, приглашения и сеансы."
        actions={
          <>
            <button className="btn" onClick={() => setDialog({ kind: 'import' })}>
              <FileUp size={15} /> Импорт CSV
            </button>
            <button className="btn primary" onClick={() => setDialog({ kind: 'create' })}>
              <UserPlus size={15} /> Добавить
            </button>
          </>
        }
      />
      <div className="admin-toolbar">
        <div className="admin-search grow">
          <Search size={15} className="admin-search-icon" aria-hidden />
          <input className="input" type="search" placeholder="Поиск по имени или email" aria-label="Поиск пользователей" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="select" aria-label="Статус" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Все статусы</option>
          {Object.entries(USER_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select className="select" aria-label="Тип" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Сотрудники и гости</option>
          <option value="employee">Только сотрудники</option>
          <option value="guest">Только гости</option>
        </select>
        <select className="select" aria-label="Роль" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Все роли</option>
          {Object.entries(ROLE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
          <option value="guest">Гость</option>
        </select>
        <select className="select" aria-label="Отдел или группа" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">Все отделы и группы</option>
          {(groups.data?.groups ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.kind === 'department' ? 'Отдел: ' : 'Группа: '}
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {list.isLoading ? (
        <LoadingRows rows={6} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !users.length ? (
        <Empty icon={<Users size={32} />} title={dq || status || kind || role || groupId ? 'Никого не найдено' : 'Пока нет пользователей'}>
          {dq || status || kind || role || groupId ? 'Измените условия поиска или сбросьте фильтры.' : 'Добавьте сотрудников вручную или импортируйте список из CSV.'}
        </Empty>
      ) : (
        <>
          <div className="table-wrap" aria-busy={list.isFetching}>
            <table className="table admin-table">
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Роль</th>
                  <th>Статус</th>
                  <th>Отделы и группы</th>
                  <th>Последний вход</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="row admin-user-cell">
                        <Avatar name={u.name} id={u.id} />
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="ellipsis">
                            {u.name} {u.id === me.user.id && <span className="muted small">(вы)</span>}
                          </div>
                          <div className="muted small ellipsis">
                            {u.email}
                            {u.title ? ' · ' + u.title : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {u.kind === 'guest' ? <Badge color="purple">Гость</Badge> : <span className="small">{ROLE_LABEL[u.org_role] ?? u.org_role}</span>}
                      {u.mfa_enabled && (
                        <div>
                          <Badge color="green">2FA</Badge>
                        </div>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={u.status} />
                      {u.access_expires_at && (
                        <div className="muted small" title={fullTime(u.access_expires_at)}>
                          {new Date(u.access_expires_at) <= new Date() ? 'доступ истёк ' : 'доступ до '}
                          {relTime(u.access_expires_at)}
                        </div>
                      )}
                    </td>
                    <td className="small">
                      {u.groups.length ? (
                        <div className="admin-chips">
                          {u.groups.map((g) => (
                            <span key={g.id} className={'admin-chip' + (g.id === u.primary_group_id ? ' primary' : '')} title={g.id === u.primary_group_id ? 'Основной отдел' : g.role === 'manager' ? 'Руководитель группы' : undefined}>
                              {g.name}
                              {g.role === 'manager' ? ' ★' : ''}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="small muted" title={fullTime(u.last_login_at)}>
                      {u.last_login_at ? relTime(u.last_login_at) : 'не входил'}
                    </td>
                    <td className="admin-cell-actions">
                      <Menu
                        label={`Действия с пользователем ${u.name}`}
                        items={() => menuFor(u)}
                        placement="bottom-end"
                        trigger={({ ref, props }) => (
                          <button ref={ref} className="icon-btn" aria-label={`Действия: ${u.name}`} {...props}>
                            <Ellipsis size={16} />
                          </button>
                        )}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager offset={offset} limit={LIMIT} total={total} onChange={setOffset} />
        </>
      )}

      {dialog?.kind === 'create' && <CreateUserDialog groups={groups.data?.groups ?? []} isAdmin={isAdmin} guestsEnabled={me.org.settings.guestsEnabled} onClose={() => setDialog(null)} onCreated={refresh} />}
      {dialog?.kind === 'import' && <ImportDialog onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog?.kind === 'edit' && <EditUserDialog user={dialog.user} groups={groups.data?.groups ?? []} isAdmin={isAdmin} isOwner={me.user.orgRole === 'owner'} onClose={() => setDialog(null)} onSaved={refresh} />}
      {dialog?.kind === 'status' && <StatusDialog user={dialog.user} status={dialog.status} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog?.kind === 'transfer' && <TransferDialog user={dialog.user} groups={groups.data?.groups ?? []} onClose={() => setDialog(null)} onDone={refresh} groupName={groupName} />}
      {dialog?.kind === 'link' && (
        <Dialog
          open
          title={dialog.title}
          onClose={() => setDialog(null)}
          footer={
            <button className="btn primary" onClick={() => setDialog(null)}>
              Готово
            </button>
          }
        >
          <div className="col" style={{ gap: 12 }}>
            <p>{dialog.text}</p>
            <CopyField value={dialog.url} label="Ссылка" />
          </div>
        </Dialog>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- create

function CreateUserDialog({ groups, isAdmin, guestsEnabled, onClose, onCreated }: { groups: AdminGroup[]; isAdmin: boolean; guestsEnabled: boolean; onClose: () => void; onCreated: () => void }) {
  const empty = { email: '', name: '', title: '', kind: 'employee' as 'employee' | 'guest', orgRole: 'member', mode: 'invite' as 'invite' | 'password', password: '', accessExpiresAt: '' };
  const [f, setF] = useState(empty);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [primary, setPrimary] = useState<string>('');
  const [manager, setManager] = useState<DirectoryUser | null>(null);
  const [groupFilter, setGroupFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ user: { name: string; email: string }; inviteUrl: string | null; effectiveSpaces: Array<{ spaceId: string; level: string }> } | null>(null);
  const spaces = useSpaces();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const guest = f.kind === 'guest';
  const visibleGroups = groups.filter((g) => !(guest && g.kind === 'department')).filter((g) => !groupFilter || g.name.toLowerCase().includes(groupFilter.toLowerCase()));
  const chosenDepts = groupIds.filter((id) => groups.find((g) => g.id === id)?.kind === 'department');
  useEffect(() => {
    if (primary && !chosenDepts.includes(primary)) setPrimary('');
    if (!primary && chosenDepts.length === 1) setPrimary(chosenDepts[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIds.join(',')]);
  useEffect(() => {
    if (guest) setGroupIds((ids) => ids.filter((id) => groups.find((g) => g.id === id)?.kind !== 'department'));
  }, [guest, groups]);

  const m = useMutation({
    mutationFn: () =>
      post('/api/v1/admin/users', {
        email: f.email.trim(),
        name: f.name.trim(),
        kind: f.kind,
        orgRole: !guest && isAdmin ? f.orgRole : undefined,
        title: f.title.trim() || null,
        groupIds,
        primaryGroupId: primary || null,
        managerId: manager?.id ?? null,
        accessExpiresAt: toIso(f.accessExpiresAt),
        invite: f.mode === 'invite',
        password: f.mode === 'password' ? f.password : undefined,
      }),
    onSuccess: (r) => {
      setResult(r);
      setError(null);
      onCreated();
    },
    onError: (e) => setError(errMsg(e)),
  });
  const invalid = !f.email.trim() || !f.name.trim() || (guest && !f.accessExpiresAt) || (f.mode === 'password' && !f.password);
  const spaceName = (id: string) => spaces.data?.spaces.find((s) => s.id === id)?.name ?? 'Пространство';

  if (result) {
    return (
      <Dialog
        open
        title="Пользователь создан"
        onClose={onClose}
        footer={
          <>
            <button
              className="btn"
              onClick={() => {
                setResult(null);
                setF(empty);
                setGroupIds([]);
                setManager(null);
              }}
            >
              Добавить ещё
            </button>
            <button className="btn primary" onClick={onClose}>
              Готово
            </button>
          </>
        }
      >
        <div className="col" style={{ gap: 14 }}>
          <div className="alert success">
            <div>
              <b>{result.user.name}</b> ({result.user.email}) добавлен в организацию.
            </div>
          </div>
          {result.inviteUrl ? <CopyField value={result.inviteUrl} label="Ссылка-приглашение" hint="Передайте ссылку сотруднику. Она действует 7 дней; по ней задаётся пароль." /> : <p className="muted">Пароль задан — пользователь может войти сразу.</p>}
          <div>
            <div className="field-label">Доступные пространства</div>
            {result.effectiveSpaces.length ? (
              <ul className="admin-list">
                {result.effectiveSpaces.map((s) => (
                  <li key={s.spaceId}>
                    {spaceName(s.spaceId)} — <span className="muted">{LEVEL_LABEL[s.level] ?? s.level}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Нет доступа ни к одному пространству. Добавьте пользователя в отдел или выдайте доступ к страницам.</p>
            )}
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      size="wide"
      persistent
      title="Новый пользователь"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={invalid || m.isPending} aria-busy={m.isPending} onClick={() => m.mutate()}>
            {m.isPending && <span className="spinner" />} Создать
          </button>
        </>
      }
    >
      <form
        className="col"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) m.mutate();
        }}
      >
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="admin-seg" role="radiogroup" aria-label="Тип учётной записи">
          <label className={!guest ? 'on' : ''}>
            <input type="radio" name="kind" checked={!guest} onChange={() => set('kind', 'employee')} /> Сотрудник
          </label>
          <label className={guest ? 'on' : ''} title={guestsEnabled ? undefined : 'Гостевой доступ отключён в настройках организации'}>
            <input type="radio" name="kind" checked={guest} disabled={!guestsEnabled} onChange={() => set('kind', 'guest')} /> Гость
          </label>
        </div>
        <div className="admin-form-grid">
          <div className="field">
            <label htmlFor="nu-name">Имя и фамилия *</label>
            <input id="nu-name" className="input" value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="nu-email">Email *</label>
            <input id="nu-email" className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="nu-title">Должность</label>
            <input id="nu-title" className="input" value={f.title} onChange={(e) => set('title', e.target.value)} />
          </div>
          {!guest ? (
            <div className="field">
              <label htmlFor="nu-role">Роль в организации</label>
              <select id="nu-role" className="select" value={f.orgRole} disabled={!isAdmin} onChange={(e) => set('orgRole', e.target.value)}>
                {['member', 'people_admin', 'auditor', 'admin'].map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              {!isAdmin && <div className="field-hint">Административные роли назначает администратор.</div>}
            </div>
          ) : (
            <div className="field">
              <label htmlFor="nu-exp">Доступ действует до *</label>
              <input id="nu-exp" className="input" type="datetime-local" value={f.accessExpiresAt} onChange={(e) => set('accessExpiresAt', e.target.value)} />
              <div className="field-hint">Для гостей срок доступа обязателен.</div>
            </div>
          )}
          <div className="field">
            <label htmlFor="nu-manager">Руководитель</label>
            <UserPicker id="nu-manager" value={manager} onChange={setManager} />
          </div>
          {!guest && (
            <div className="field">
              <label htmlFor="nu-exp2">Срок доступа (необязательно)</label>
              <input id="nu-exp2" className="input" type="datetime-local" value={f.accessExpiresAt} onChange={(e) => set('accessExpiresAt', e.target.value)} />
            </div>
          )}
        </div>
        <div className="field">
          <span className="field-label">{guest ? 'Группы' : 'Отделы и группы'}</span>
          {groups.length > 8 && <input className="input" placeholder="Фильтр" aria-label="Фильтр групп" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} />}
          <div className="admin-checklist">
            {visibleGroups.length ? (
              visibleGroups.map((g) => (
                <label key={g.id} className="checkbox">
                  <input type="checkbox" checked={groupIds.includes(g.id)} onChange={(e) => setGroupIds((ids) => (e.target.checked ? [...ids, g.id] : ids.filter((x) => x !== g.id)))} />
                  <span className="ellipsis">{g.name}</span>
                  <span className="muted small">{g.kind === 'department' ? 'отдел' : 'группа'}</span>
                </label>
              ))
            ) : (
              <span className="muted small">Нет подходящих групп</span>
            )}
          </div>
          {guest && <div className="field-hint">Гостей нельзя добавлять в отделы; выдайте им доступ к отдельным страницам.</div>}
        </div>
        {chosenDepts.length > 1 && (
          <div className="field">
            <label htmlFor="nu-primary">Основной отдел</label>
            <select id="nu-primary" className="select" value={primary} onChange={(e) => setPrimary(e.target.value)}>
              <option value="">Не указан</option>
              {chosenDepts.map((id) => (
                <option key={id} value={id}>
                  {groups.find((g) => g.id === id)?.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <fieldset className="admin-fieldset">
          <legend className="field-label">Вход в систему</legend>
          <label className="checkbox">
            <input type="radio" name="mode" checked={f.mode === 'invite'} onChange={() => set('mode', 'invite')} /> Создать ссылку-приглашение (сотрудник сам задаст пароль)
          </label>
          <label className="checkbox">
            <input type="radio" name="mode" checked={f.mode === 'password'} onChange={() => set('mode', 'password')} /> Задать пароль вручную
          </label>
          {f.mode === 'password' && <input className="input" type="password" aria-label="Пароль" autoComplete="new-password" value={f.password} onChange={(e) => set('password', e.target.value)} />}
        </fieldset>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- CSV import

interface PreviewRow {
  line: number;
  email: string;
  name: string;
  title: string | null;
  groupId: string | null;
  problems: string[];
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<{ preview: PreviewRow[]; valid: number } | null>(null);
  const [result, setResult] = useState<{ created: Array<{ id: string; email: string; inviteUrl: string }>; skipped: PreviewRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const groups = useGroups();
  const gname = (id: string | null) => (id ? groups.data?.groups.find((g) => g.id === id)?.name ?? '—' : '—');
  const check = useMutation({
    mutationFn: () => post<{ preview: PreviewRow[]; valid: number }>('/api/v1/admin/users/import', { csv, apply: false }),
    onSuccess: (r) => {
      setPreview(r);
      setError(null);
    },
    onError: (e) => setError(errMsg(e)),
  });
  const apply = useMutation({
    mutationFn: () => post<{ created: Array<{ id: string; email: string; inviteUrl: string }>; skipped: PreviewRow[] }>('/api/v1/admin/users/import', { csv, apply: true }),
    onSuccess: (r) => {
      setResult(r);
      setError(null);
      onDone();
    },
    onError: (e) => setError(errMsg(e)),
  });
  const busy = check.isPending || apply.isPending;

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      setError('Файл больше 2 МБ — разделите список на части');
      return;
    }
    setCsv(await file.text());
    setPreview(null);
  };

  let body;
  let footer;
  if (result) {
    body = (
      <div className="col" style={{ gap: 12 }}>
        <div className="alert success">
          Создано пользователей: <b>{result.created.length}</b>. Пропущено строк: <b>{result.skipped.length}</b>.
        </div>
        {result.created.length > 0 && (
          <>
            <p className="small muted">Ссылки-приглашения действуют 7 дней. Сохраните их сейчас — повторно их можно получить только через «Отправить приглашение повторно».</p>
            <div className="table-wrap">
              <table className="table admin-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Ссылка-приглашение</th>
                  </tr>
                </thead>
                <tbody>
                  {result.created.map((c) => (
                    <tr key={c.id}>
                      <td>{c.email}</td>
                      <td className="mono small admin-break">{c.inviteUrl}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {result.skipped.length > 0 && (
          <details>
            <summary>Пропущенные строки ({result.skipped.length})</summary>
            <ul className="admin-list small">
              {result.skipped.map((r) => (
                <li key={r.line}>
                  Строка {r.line}: {r.email || '—'} — {r.problems.join(', ')}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
    footer = (
      <>
        {result.created.length > 0 && (
          <>
            <button className="btn" onClick={() => copyText(result.created.map((c) => `${c.email}\t${c.inviteUrl}`).join('\n'))}>
              Копировать ссылки
            </button>
            <button className="btn" onClick={() => downloadBlob('invitations.csv', new Blob([toCsv([['email', 'invite_url'], ...result.created.map((c) => [c.email, c.inviteUrl])])], { type: 'text/csv;charset=utf-8' }))}>
              Скачать CSV
            </button>
          </>
        )}
        <button className="btn primary" onClick={onClose}>
          Готово
        </button>
      </>
    );
  } else if (preview) {
    const bad = preview.preview.length - preview.valid;
    body = (
      <div className="col" style={{ gap: 12 }}>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className={'alert ' + (bad ? 'warning' : 'success')}>
          Строк в файле: <b>{preview.preview.length}</b>, готовы к импорту: <b>{preview.valid}</b>
          {bad ? `, с ошибками: ${bad} (будут пропущены)` : ''}.
        </div>
        <div className="table-wrap admin-scroll-y">
          <table className="table admin-table">
            <thead>
              <tr>
                <th>Строка</th>
                <th>Email</th>
                <th>Имя</th>
                <th>Должность</th>
                <th>Отдел</th>
                <th>Проверка</th>
              </tr>
            </thead>
            <tbody>
              {preview.preview.map((r) => (
                <tr key={r.line} className={r.problems.length ? 'admin-row-bad' : undefined}>
                  <td className="muted">{r.line}</td>
                  <td>{r.email || '—'}</td>
                  <td>{r.name || '—'}</td>
                  <td>{r.title ?? '—'}</td>
                  <td>{gname(r.groupId)}</td>
                  <td>{r.problems.length ? <span className="field-error">{r.problems.join(', ')}</span> : <Badge color="green">OK</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
    footer = (
      <>
        <button className="btn" disabled={busy} onClick={() => setPreview(null)}>
          Назад к данным
        </button>
        <button
          className="btn primary"
          disabled={busy || !preview.valid}
          aria-busy={apply.isPending}
          onClick={async () => {
            if (await confirm({ title: 'Импортировать пользователей?', body: `Будет создано ${preview.valid} пользователей и ссылок-приглашений.`, confirmLabel: 'Импортировать' })) apply.mutate();
          }}
        >
          {apply.isPending && <span className="spinner" />} Импортировать ({preview.valid})
        </button>
      </>
    );
  } else {
    body = (
      <div className="col" style={{ gap: 12 }}>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <p className="small muted">
          Первая строка — заголовки. Поддерживаются столбцы <code>email</code>, <code>name</code> (или «ФИО»), <code>department</code> (или «отдел»), <code>title</code> (или «должность»). Разделитель определяется автоматически. Сначала будет показан предварительный просмотр — ничего не изменится до подтверждения.
        </p>
        <div className="field">
          <label htmlFor="csv-file">Файл CSV</label>
          <input id="csv-file" type="file" accept=".csv,text/csv,text/plain" onChange={(e) => readFile(e.target.files?.[0])} />
        </div>
        <div className="field">
          <label htmlFor="csv-text">или вставьте содержимое</label>
          <textarea id="csv-text" className="textarea mono" rows={8} placeholder={'email;name;department;title\nivanov@example.com;Иван Иванов;Бухгалтерия;Бухгалтер'} value={csv} onChange={(e) => setCsv(e.target.value)} />
        </div>
      </div>
    );
    footer = (
      <>
        <button className="btn" onClick={onClose}>
          Отмена
        </button>
        <button className="btn primary" disabled={!csv.trim() || busy} aria-busy={check.isPending} onClick={() => check.mutate()}>
          {check.isPending && <span className="spinner" />} Проверить
        </button>
      </>
    );
  }
  return (
    <Dialog open size="xwide" persistent={busy || !!csv} title="Импорт сотрудников из CSV" onClose={onClose} footer={footer}>
      {body}
    </Dialog>
  );
}

// ---------------------------------------------------------------- edit

function EditUserDialog({ user, groups, isAdmin, isOwner, onClose, onSaved }: { user: AdminUser; groups: AdminGroup[]; isAdmin: boolean; isOwner: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user.name);
  const [title, setTitle] = useState(user.title ?? '');
  const [orgRole, setOrgRole] = useState(user.org_role);
  const [primary, setPrimary] = useState(user.primary_group_id ?? '');
  const [expires, setExpires] = useState(toLocalInput(user.access_expires_at));
  const [manager, setManager] = useState<DirectoryUser | null>(null);
  const [managerChanged, setManagerChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detail = useUserDetail(user.id);
  const d = detail.data?.user;
  useEffect(() => {
    if (!managerChanged && d?.manager_id) setManager({ id: d.manager_id, name: d.manager_name ?? '—', email: '' });
  }, [d?.manager_id, d?.manager_name, managerChanged]);
  const depts = groups.filter((g) => g.kind === 'department');
  const roles = ['member', 'people_admin', 'auditor', 'admin', ...(isOwner || user.org_role === 'owner' ? ['owner'] : [])];

  const body = useMemo(() => {
    const b: Record<string, unknown> = {};
    if (name.trim() !== user.name) b.name = name.trim();
    if ((title.trim() || null) !== (user.title ?? null)) b.title = title.trim() || null;
    if (orgRole !== user.org_role) b.orgRole = orgRole;
    if ((primary || null) !== (user.primary_group_id ?? null)) b.primaryGroupId = primary || null;
    if (expires !== toLocalInput(user.access_expires_at)) b.accessExpiresAt = toIso(expires);
    if (managerChanged && (manager?.id ?? null) !== (user.manager_id ?? null)) b.managerId = manager?.id ?? null;
    return b;
  }, [name, title, orgRole, primary, expires, manager, managerChanged, user]);

  const m = useMutation({
    mutationFn: () => patch(`/api/v1/admin/users/${user.id}`, body),
    onSuccess: () => {
      toast.success('Изменения сохранены');
      onSaved();
      onClose();
    },
    onError: (e) => setError(errMsg(e)),
  });
  const save = async () => {
    if (body.orgRole && ['admin', 'owner'].includes(String(body.orgRole))) {
      const ok = await confirm({ title: 'Назначить административную роль?', body: `${user.name} получит роль «${ROLE_LABEL[String(body.orgRole)]}» с полным управлением организацией.`, confirmLabel: 'Назначить' });
      if (!ok) return;
    }
    m.mutate();
  };
  const dirty = Object.keys(body).length > 0;
  return (
    <Dialog
      open
      persistent={dirty}
      title={`Изменить: ${user.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={!dirty || !name.trim() || m.isPending} aria-busy={m.isPending} onClick={save}>
            {m.isPending && <span className="spinner" />} Сохранить
          </button>
        </>
      }
    >
      <form
        className="col"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) save();
        }}
      >
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="muted small">
          {user.email}
          {d && (
            <>
              {' · '}создан {relTime(d.created_at)}
              {d.primary_group_name ? ` · основной отдел: ${d.primary_group_name}` : ''}
              {` · владелец страниц: ${d.owned_pages}`}
            </>
          )}
        </div>
        {detail.isError && <div className="field-error">Не удалось загрузить сведения о руководителе: {errMsg(detail.error)}</div>}
        <div className="field">
          <label htmlFor="eu-name">Имя</label>
          <input id="eu-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="eu-title">Должность</label>
          <input id="eu-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {user.kind === 'employee' && (
          <div className="field">
            <label htmlFor="eu-role">Роль в организации</label>
            <select id="eu-role" className="select" value={orgRole} disabled={!isAdmin} onChange={(e) => setOrgRole(e.target.value)}>
              {roles.map((r) => (
                <option key={r} value={r} disabled={r === 'owner' && !isOwner}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            {!isAdmin && <div className="field-hint">Роли назначает администратор организации.</div>}
          </div>
        )}
        {user.kind === 'employee' && (
          <div className="field">
            <label htmlFor="eu-primary">Основной отдел</label>
            <select id="eu-primary" className="select" value={primary} onChange={(e) => setPrimary(e.target.value)}>
              <option value="">Не указан</option>
              {depts.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <div className="field-hint">Членство в отделах меняется через «Перевести в другой отдел».</div>
          </div>
        )}
        <div className="field">
          <label htmlFor="eu-manager">Руководитель</label>
          <UserPicker
            id="eu-manager"
            value={manager}
            excludeIds={[user.id]}
            onChange={(u) => {
              setManager(u);
              setManagerChanged(true);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="eu-exp">Доступ действует до</label>
          <input id="eu-exp" className="input" type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
          <div className="field-hint">{user.kind === 'guest' ? 'Для гостя срок обязателен.' : 'Оставьте пустым для бессрочного доступа.'}</div>
        </div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- suspend / deactivate

function StatusDialog({ user, status, onClose, onDone }: { user: AdminUser; status: 'suspended' | 'deactivated'; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [transferTo, setTransferTo] = useState<DirectoryUser | null>(null);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deactivate = status === 'deactivated';
  const owned = useQuery({
    queryKey: ['admin', 'owned-pages', user.id],
    queryFn: () => post<{ changes: unknown[]; ownedPages: number }>(`/api/v1/admin/users/${user.id}/transfer-preview`, { removeGroupIds: [], addGroupIds: [] }),
    enabled: deactivate,
  });
  const ownedPages = owned.data?.ownedPages;
  const m = useMutation({
    mutationFn: () => post(`/api/v1/admin/users/${user.id}/status`, { status, reason, transferTo: deactivate && transferTo ? transferTo.id : undefined }),
    onSuccess: () => {
      toast.success(deactivate ? 'Пользователь деактивирован' : 'Доступ приостановлен');
      onDone();
      onClose();
    },
    onError: (e) => setError(errMsg(e)),
  });
  return (
    <Dialog
      open
      persistent
      title={deactivate ? `Деактивировать ${user.name}?` : `Приостановить доступ ${user.name}?`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn danger solid" disabled={!ack || m.isPending} aria-busy={m.isPending} onClick={() => m.mutate()}>
            {m.isPending && <span className="spinner" />} {deactivate ? 'Деактивировать' : 'Приостановить'}
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="card admin-preview">
          <div className="field-label">Что произойдёт</div>
          <ul className="admin-list small">
            <li>Все активные сеансы и API-токены будут немедленно отозваны.</li>
            <li>Неиспользованные приглашения будут отозваны.</li>
            {deactivate && <li>Временные доступы пользователя будут отозваны.</li>}
            {deactivate && (
              <li>
                {owned.isLoading ? (
                  <span className="muted">Подсчёт документов во владении…</span>
                ) : owned.isError ? (
                  <span className="field-error">Не удалось подсчитать документы во владении: {errMsg(owned.error)}</span>
                ) : ownedPages === 0 ? (
                  <>Документов вне личного пространства во владении {user.name} нет — передавать нечего.</>
                ) : (
                  <>
                    Документы вне личного пространства во владении {user.name} (<b>{ownedPages ?? '?'}</b>):{' '}
                    {transferTo ? (
                      <>
                        перейдут во владение <b>{transferTo.name}</b>.
                      </>
                    ) : (
                      <b>останутся без передачи владельца.</b>
                    )}
                  </>
                )}
              </li>
            )}
            <li>Профиль, авторство и записи журнала аудита сохраняются.</li>
            {!deactivate && <li>Доступ можно восстановить позже одним действием.</li>}
          </ul>
          {user.groups.length > 0 && <div className="muted small">Состоит в: {user.groups.map((g) => g.name).join(', ')}</div>}
        </div>
        {deactivate && (
          <div className="field">
            <label htmlFor="st-transfer">Передать владение документами</label>
            <UserPicker id="st-transfer" value={transferTo} onChange={setTransferTo} excludeIds={[user.id]} placeholder={ownedPages ? 'Выберите нового владельца (рекомендуется)' : 'Выберите нового владельца'} />
            {!!ownedPages && !transferTo && <div className="field-hint">Рекомендуется назначить нового владельца для {ownedPages} стр.</div>}
          </div>
        )}
        <div className="field">
          <label htmlFor="st-reason">Причина (попадёт в журнал аудита)</label>
          <textarea id="st-reason" className="textarea" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Я понимаю последствия
        </label>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- department transfer with access diff

function TransferDialog({ user, groups, onClose, onDone, groupName }: { user: AdminUser; groups: AdminGroup[]; onClose: () => void; onDone: () => void; groupName: (id: string | null) => string | undefined }) {
  const current = user.groups.map((g) => g.id);
  const [remove, setRemove] = useState<string[]>([]);
  const [add, setAdd] = useState<string[]>([]);
  const [makePrimary, setMakePrimary] = useState(true);
  const [preview, setPreview] = useState<Array<{ spaceId: string; name: string; from: string; to: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setPreview(null), [remove.join(), add.join()]);
  const candidates = groups.filter((g) => !current.includes(g.id));
  const prev = useMutation({
    mutationFn: () => post<{ changes: Array<{ spaceId: string; name: string; from: string; to: string }>; ownedPages?: number }>(`/api/v1/admin/users/${user.id}/transfer-preview`, { removeGroupIds: remove, addGroupIds: add }),
    onSuccess: (r) => {
      setPreview(r.changes);
      setError(null);
    },
    onError: (e) => setError(errMsg(e)),
  });
  const firstDept = add.find((id) => groups.find((g) => g.id === id)?.kind === 'department');
  const apply = async () => {
    setBusy(true);
    setError(null);
    const done: string[] = [];
    try {
      for (const id of add) {
        await put(`/api/v1/admin/groups/${id}/members/${user.id}`, { role: 'member' });
        done.push('+' + groupName(id));
      }
      for (const id of remove) {
        await del(`/api/v1/admin/groups/${id}/members/${user.id}`);
        done.push('−' + groupName(id));
      }
      if (makePrimary && firstDept) await patch(`/api/v1/admin/users/${user.id}`, { primaryGroupId: firstDept });
      else if (user.primary_group_id && remove.includes(user.primary_group_id)) await patch(`/api/v1/admin/users/${user.id}`, { primaryGroupId: null });
      toast.success('Перевод выполнен');
      onDone();
      onClose();
    } catch (e) {
      setError(errMsg(e) + (done.length ? ` Уже применено: ${done.join(', ')}.` : ''));
      onDone();
    } finally {
      setBusy(false);
    }
  };
  const toggle = (list: string[], set: (v: string[]) => void, id: string, on: boolean) => set(on ? [...list, id] : list.filter((x) => x !== id));
  return (
    <Dialog
      open
      size="wide"
      persistent
      title={`Перевод: ${user.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn" disabled={(!add.length && !remove.length) || prev.isPending} aria-busy={prev.isPending} onClick={() => prev.mutate()}>
            {prev.isPending && <span className="spinner" />} Сравнить доступы
          </button>
          <button className="btn primary" disabled={!preview || busy} aria-busy={busy} onClick={apply}>
            {busy && <span className="spinner" />} Применить
          </button>
        </>
      }
    >
      <div className="col" style={{ gap: 14 }}>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="admin-two">
          <div className="field">
            <span className="field-label">Исключить из</span>
            <div className="admin-checklist">
              {user.groups.length ? (
                user.groups.map((g) => (
                  <label key={g.id} className="checkbox">
                    <input type="checkbox" checked={remove.includes(g.id)} onChange={(e) => toggle(remove, setRemove, g.id, e.target.checked)} />
                    <span className="ellipsis">{g.name}</span>
                  </label>
                ))
              ) : (
                <span className="muted small">Не состоит в группах</span>
              )}
            </div>
          </div>
          <div className="field">
            <span className="field-label">Добавить в</span>
            <div className="admin-checklist">
              {candidates.map((g) => (
                <label key={g.id} className="checkbox">
                  <input type="checkbox" checked={add.includes(g.id)} onChange={(e) => toggle(add, setAdd, g.id, e.target.checked)} />
                  <span className="ellipsis">{g.name}</span>
                  <span className="muted small">{g.kind === 'department' ? 'отдел' : 'группа'}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        {firstDept && (
          <label className="checkbox">
            <input type="checkbox" checked={makePrimary} onChange={(e) => setMakePrimary(e.target.checked)} /> Сделать «{groupName(firstDept)}» основным отделом
          </label>
        )}
        {preview && (
          <div>
            <div className="field-label">Изменение доступа к пространствам</div>
            {preview.length ? (
              <div className="table-wrap">
                <table className="table admin-table">
                  <thead>
                    <tr>
                      <th>Пространство</th>
                      <th>Было</th>
                      <th>Станет</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((c) => (
                      <tr key={c.spaceId}>
                        <td>{c.name ?? c.spaceId}</td>
                        <td>{LEVEL_LABEL[c.from] ?? c.from}</td>
                        <td>
                          <Badge color={c.to === 'none' ? 'red' : c.from === 'none' ? 'green' : 'amber'}>{LEVEL_LABEL[c.to] ?? c.to}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted small">Доступ к пространствам не изменится.</p>
            )}
          </div>
        )}
        {!preview && (add.length > 0 || remove.length > 0) && <p className="muted small">Нажмите «Сравнить доступы», чтобы увидеть потерянные и приобретённые доступы перед применением.</p>}
      </div>
    </Dialog>
  );
}
