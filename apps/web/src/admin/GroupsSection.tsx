import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FolderTree, Pencil, Plus, Search, Trash, Users } from 'lucide-react';
import { get, patch, post, put, del } from '../api/client';
import { Dialog } from '../components/ui/Dialog';
import { confirm } from '../components/ui/Confirm';
import { toast } from '../components/ui/Toast';
import { Avatar } from '../components/Avatar';
import { relTime, fullTime } from '../lib/format';
import { type AdminGroup, type DirectoryUser, Badge, Empty, ErrorState, LoadingRows, SectionHeader, StatusBadge, UserPicker, errMsg, toIso, useGroups } from './common';

interface Member {
  id: string;
  name: string;
  email: string;
  kind: string;
  status: string;
  role: 'member' | 'manager';
  expires_at: string | null;
  added_at: string;
}

export function GroupsSection() {
  const groups = useGroups();
  const qc = useQueryClient();
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ group: AdminGroup | null; kind: 'department' | 'group'; parentId?: string | null } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const all = groups.data?.groups ?? [];
  const current = all.find((g) => g.id === selected) ?? null;
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'groups'] });

  const { roots, children } = useMemo(() => {
    const depts = all.filter((g) => g.kind === 'department');
    const ids = new Set(depts.map((d) => d.id));
    const children = new Map<string, AdminGroup[]>();
    const roots: AdminGroup[] = [];
    for (const d of depts) {
      if (d.parent_id && ids.has(d.parent_id)) children.set(d.parent_id, [...(children.get(d.parent_id) ?? []), d]);
      else roots.push(d);
    }
    return { roots, children };
  }, [all]);
  const plain = all.filter((g) => g.kind === 'group');
  const f = filter.trim().toLowerCase();
  const matches = (g: AdminGroup): boolean => !f || g.name.toLowerCase().includes(f) || (children.get(g.id) ?? []).some(matches);

  const remove = async (g: AdminGroup) => {
    const ok = await confirm({
      title: `Удалить «${g.name}»?`,
      body: (
        <>
          <p>Пользователи и страницы не удаляются. Участники ({g.members}) будут исключены, все права, выданные {g.kind === 'department' ? 'отделу' : 'группе'}, — отозваны и записаны в журнал аудита.</p>
          {(children.get(g.id) ?? []).length > 0 && <p className="field-error">Сначала перенесите или удалите вложенные подразделения.</p>}
        </>
      ),
      confirmLabel: 'Удалить',
      danger: true,
      typeToConfirm: g.members > 0 ? g.name : undefined,
    });
    if (!ok) return;
    try {
      await del(`/api/v1/admin/groups/${g.id}`);
      toast.success('Удалено');
      if (selected === g.id) setSelected(null);
      refresh();
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const renderDept = (g: AdminGroup, depth: number): ReactNode => {
    if (!matches(g)) return null;
    const kids = children.get(g.id) ?? [];
    const open = !collapsed[g.id] || !!f;
    return (
      <li key={g.id}>
        <div className={'admin-tree-row' + (selected === g.id ? ' active' : '')} style={{ paddingLeft: 4 + depth * 16 }}>
          {kids.length ? (
            <button className="icon-btn sm" aria-label={open ? 'Свернуть' : 'Развернуть'} aria-expanded={open} onClick={() => setCollapsed((c) => ({ ...c, [g.id]: open }))}>
              <ChevronRight size={14} className={'chev' + (open ? ' open' : '')} />
            </button>
          ) : (
            <span className="admin-tree-spacer" />
          )}
          <button className="admin-tree-btn" onClick={() => setSelected(g.id)} aria-current={selected === g.id}>
            <span className="ellipsis grow">{g.name}</span>
            <span className="muted small">{g.members}</span>
          </button>
        </div>
        {kids.length > 0 && open && <ul>{kids.map((k) => renderDept(k, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <section>
      <SectionHeader
        title="Группы и отделы"
        sub="Отделы образуют иерархию: права отдела распространяются на вложенные подразделения. Группы — произвольные команды."
        actions={
          <>
            <button className="btn" onClick={() => setEdit({ group: null, kind: 'group' })}>
              <Plus size={15} /> Группа
            </button>
            <button className="btn primary" onClick={() => setEdit({ group: null, kind: 'department' })}>
              <Plus size={15} /> Отдел
            </button>
          </>
        }
      />
      {groups.isLoading ? (
        <LoadingRows rows={6} />
      ) : groups.isError ? (
        <ErrorState error={groups.error} onRetry={() => groups.refetch()} />
      ) : !all.length ? (
        <Empty icon={<FolderTree size={32} />} title="Нет отделов и групп">
          Создайте структуру организации: права, выданные отделу, автоматически применяются к новым сотрудникам.
        </Empty>
      ) : (
        <div className={'admin-split' + (current ? ' has-detail' : '')}>
          <div className="admin-split-list card">
            <div className="admin-search">
              <Search size={15} className="admin-search-icon" aria-hidden />
              <input className="input" type="search" placeholder="Найти" aria-label="Поиск групп" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
            <div className="admin-tree-head muted small">Отделы</div>
            {roots.length ? <ul className="admin-tree">{roots.map((r) => renderDept(r, 0))}</ul> : <p className="muted small">Нет отделов</p>}
            <div className="admin-tree-head muted small">Группы</div>
            {plain.length ? (
              <ul className="admin-tree">
                {plain
                  .filter((g) => !f || g.name.toLowerCase().includes(f))
                  .map((g) => (
                    <li key={g.id}>
                      <div className={'admin-tree-row' + (selected === g.id ? ' active' : '')} style={{ paddingLeft: 4 }}>
                        <span className="admin-tree-spacer" />
                        <button className="admin-tree-btn" onClick={() => setSelected(g.id)} aria-current={selected === g.id}>
                          <span className="ellipsis grow">{g.name}</span>
                          <span className="muted small">{g.members}</span>
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="muted small">Нет групп</p>
            )}
          </div>
          <div className="admin-split-detail">
            {current ? (
              <GroupDetail
                group={current}
                parentName={all.find((g) => g.id === current.parent_id)?.name ?? null}
                onBack={() => setSelected(null)}
                onEdit={() => setEdit({ group: current, kind: current.kind })}
                onAddChild={() => setEdit({ group: null, kind: 'department', parentId: current.id })}
                onDelete={() => remove(current)}
                onChanged={refresh}
              />
            ) : (
              <div className="card">
                <Empty icon={<Users size={28} />} title="Выберите отдел или группу">
                  Здесь появятся участники и настройки.
                </Empty>
              </div>
            )}
          </div>
        </div>
      )}
      {edit && (
        <GroupDialog
          group={edit.group}
          kind={edit.kind}
          initialParent={edit.parentId ?? null}
          all={all}
          onClose={() => setEdit(null)}
          onSaved={(id) => {
            refresh();
            if (id) setSelected(id);
          }}
        />
      )}
    </section>
  );
}

function descendants(all: AdminGroup[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const g of all) if (g.parent_id && out.has(g.parent_id) && !out.has(g.id)) {
      out.add(g.id);
      grew = true;
    }
  }
  return out;
}

function GroupDialog({ group, kind, initialParent, all, onClose, onSaved }: { group: AdminGroup | null; kind: 'department' | 'group'; initialParent: string | null; all: AdminGroup[]; onClose: () => void; onSaved: (id?: string) => void }) {
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [parentId, setParentId] = useState(group?.parent_id ?? initialParent ?? '');
  const [manager, setManager] = useState<DirectoryUser | null>(group?.manager_id ? { id: group.manager_id, name: group.manager_name ?? '—', email: '' } : null);
  const [error, setError] = useState<string | null>(null);
  const excluded = group ? descendants(all, group.id) : new Set<string>();
  const parents = all.filter((g) => g.kind === 'department' && !excluded.has(g.id));
  const m = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), description, parentId: kind === 'department' ? parentId || null : undefined, managerId: manager?.id ?? null };
      if (group) {
        await patch(`/api/v1/admin/groups/${group.id}`, body);
        return group.id;
      }
      const r = await post<{ group: { id: string } }>('/api/v1/admin/groups', { ...body, kind });
      return r.group.id;
    },
    onSuccess: (id) => {
      toast.success(group ? 'Сохранено' : kind === 'department' ? 'Отдел создан' : 'Группа создана');
      onSaved(id);
      onClose();
    },
    onError: (e) => setError(errMsg(e)),
  });
  const dirty = name !== (group?.name ?? '') || description !== (group?.description ?? '');
  return (
    <Dialog
      open
      persistent={dirty}
      title={group ? `Изменить «${group.name}»` : kind === 'department' ? 'Новый отдел' : 'Новая группа'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={!name.trim() || m.isPending} aria-busy={m.isPending} onClick={() => m.mutate()}>
            {m.isPending && <span className="spinner" />} {group ? 'Сохранить' : 'Создать'}
          </button>
        </>
      }
    >
      <form
        className="col"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) m.mutate();
        }}
      >
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="field">
          <label htmlFor="g-name">Название</label>
          <input id="g-name" className="input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="g-desc">Описание</label>
          <textarea id="g-desc" className="textarea" rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {kind === 'department' && (
          <div className="field">
            <label htmlFor="g-parent">Входит в отдел</label>
            <select id="g-parent" className="select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— верхний уровень —</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="field-hint">Руководители и права вышестоящего отдела распространяются на вложенные.</div>
          </div>
        )}
        <div className="field">
          <label htmlFor="g-manager">Руководитель</label>
          <UserPicker id="g-manager" value={manager} onChange={setManager} />
          <div className="field-hint">Руководитель может управлять составом {kind === 'department' ? 'отдела' : 'группы'}.</div>
        </div>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

function GroupDetail({ group, parentName, onBack, onEdit, onAddChild, onDelete, onChanged }: { group: AdminGroup; parentName: string | null; onBack: () => void; onEdit: () => void; onAddChild: () => void; onDelete: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const members = useQuery({ queryKey: ['admin', 'group-members', group.id], queryFn: () => get<{ members: Member[] }>(`/api/v1/admin/groups/${group.id}/members`) });
  const [pick, setPick] = useState<DirectoryUser | null>(null);
  const [role, setRole] = useState<'member' | 'manager'>('member');
  const [expires, setExpires] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reload = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'group-members', group.id] });
    qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    onChanged();
  };
  const add = useMutation({
    mutationFn: () => put(`/api/v1/admin/groups/${group.id}/members/${pick!.id}`, { role, expiresAt: toIso(expires) }),
    onSuccess: () => {
      toast.success(`${pick?.name} добавлен(а)`);
      setPick(null);
      setExpires('');
      setRole('member');
      setError(null);
      reload();
    },
    onError: (e) => setError(errMsg(e)),
  });
  const removeMember = async (m: Member) => {
    if (!(await confirm({ title: 'Исключить участника?', body: `${m.name} потеряет доступы, полученные через «${group.name}».`, confirmLabel: 'Исключить', danger: true }))) return;
    try {
      await del(`/api/v1/admin/groups/${group.id}/members/${m.id}`);
      toast.success('Участник исключён');
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const setMemberRole = async (m: Member, r: 'member' | 'manager') => {
    try {
      await put(`/api/v1/admin/groups/${group.id}/members/${m.id}`, { role: r, expiresAt: m.expires_at });
      reload();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };
  const list = members.data?.members ?? [];
  return (
    <div className="card col" style={{ gap: 14 }}>
      <div className="row admin-detail-head">
        <button className="btn sm ghost admin-back" onClick={onBack}>
          ← Назад
        </button>
        <div className="grow" style={{ minWidth: 0 }}>
          <h3 className="admin-detail-title">{group.name}</h3>
          <div className="muted small">
            {group.kind === 'department' ? 'Отдел' : 'Группа'}
            {parentName ? ` · входит в «${parentName}»` : ''}
            {group.manager_name ? ` · руководитель: ${group.manager_name}` : ''}
          </div>
        </div>
        <div className="admin-actions">
          {group.kind === 'department' && (
            <button className="btn sm" onClick={onAddChild}>
              <Plus size={14} /> Подотдел
            </button>
          )}
          <button className="btn sm" onClick={onEdit}>
            <Pencil size={14} /> Изменить
          </button>
          <button className="btn sm danger" onClick={onDelete}>
            <Trash size={14} /> Удалить
          </button>
        </div>
      </div>
      {group.description && <p className="small">{group.description}</p>}

      <form
        className="admin-add-member"
        onSubmit={(e) => {
          e.preventDefault();
          if (pick) add.mutate();
        }}
      >
        <div className="field grow">
          <label htmlFor="gm-user">Добавить участника</label>
          <UserPicker id="gm-user" value={pick} onChange={setPick} excludeIds={list.map((m) => m.id)} />
        </div>
        <div className="field">
          <label htmlFor="gm-role">Роль</label>
          <select id="gm-role" className="select" value={role} onChange={(e) => setRole(e.target.value as 'member' | 'manager')}>
            <option value="member">Участник</option>
            <option value="manager">Руководитель</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="gm-exp">До (необязательно)</label>
          <input id="gm-exp" className="input" type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </div>
        <button className="btn primary" type="submit" disabled={!pick || add.isPending} aria-busy={add.isPending}>
          {add.isPending && <span className="spinner" />} Добавить
        </button>
      </form>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}

      {members.isLoading ? (
        <LoadingRows />
      ) : members.isError ? (
        <ErrorState error={members.error} onRetry={() => members.refetch()} />
      ) : !list.length ? (
        <Empty title="Нет участников">Добавьте сотрудников, чтобы они получили доступы {group.kind === 'department' ? 'отдела' : 'группы'}.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="table admin-table">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Роль</th>
                <th>Срок</th>
                <th>Добавлен</th>
                <th aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="row admin-user-cell">
                      <Avatar name={m.name} id={m.id} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="ellipsis">
                          {m.name} {m.kind === 'guest' && <Badge color="purple">Гость</Badge>} {m.status !== 'active' && <StatusBadge status={m.status} />}
                        </div>
                        <div className="muted small ellipsis">{m.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <select className="select admin-inline-select" aria-label={`Роль ${m.name}`} value={m.role} onChange={(e) => setMemberRole(m, e.target.value as 'member' | 'manager')}>
                      <option value="member">Участник</option>
                      <option value="manager">Руководитель</option>
                    </select>
                  </td>
                  <td className="small" title={fullTime(m.expires_at)}>
                    {m.expires_at ? <Badge color={new Date(m.expires_at) <= new Date() ? 'red' : 'amber'}>до {new Date(m.expires_at).toLocaleDateString('ru-RU')}</Badge> : <span className="muted">бессрочно</span>}
                  </td>
                  <td className="small muted" title={fullTime(m.added_at)}>
                    {relTime(m.added_at)}
                  </td>
                  <td className="admin-cell-actions">
                    <button className="icon-btn" aria-label={`Исключить ${m.name}`} title="Исключить" onClick={() => removeMember(m)}>
                      <Trash size={15} />
                    </button>
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
