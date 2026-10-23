import '../../styles/panels.css';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { Trash2, X, Clock } from 'lucide-react';
import { post, put, del, ApiError } from '../../api/client';
import { Dialog } from '../ui/Dialog';
import { confirm } from '../ui/Confirm';
import { toast } from '../ui/Toast';
import { DirectoryPicker, SubjectIcon, dirEntryId, dirEntryName, errMsg, type DirEntry } from '../page/directory';
import { LEVEL_LABEL } from '../../lib/format';
import { useMe } from '../../state/session';

const GRANT_LEVELS = ['view', 'comment', 'edit', 'full'] as const;
const KINDS: Array<{ id: string; label: string; hint: string; adminOnly?: boolean }> = [
  { id: 'project', label: 'Проект', hint: 'Рабочее пространство команды или проекта' },
  { id: 'department', label: 'Подразделение', hint: 'Материалы отдела; доступ выдаётся отделу целиком' },
  { id: 'private', label: 'Закрытое', hint: 'Только по приглашению' },
  { id: 'org', label: 'Общекорпоративное', hint: 'Регламенты и новости для всей компании', adminOnly: true },
];
const VIS: Array<{ id: 'open' | 'closed' | 'private'; label: string; hint: string }> = [
  { id: 'private', label: 'Приватное', hint: 'видно только участникам' },
  { id: 'closed', label: 'Закрытое', hint: 'название видно всем, содержимое — по приглашению' },
  { id: 'open', label: 'Открытое', hint: 'все сотрудники могут просматривать' },
];

export const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** yyyy-mm-dd (local) → end of that day as ISO. */
export function endOfDay(d: string): string | null {
  if (!d) return null;
  const dt = new Date(d + 'T23:59:59');
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}
/** yyyy-mm-dd (local) → start of that day as ISO. */
export function startOfDay(d: string): string | null {
  if (!d) return null;
  const dt = new Date(d + 'T00:00:00');
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}
export function inDays(n: number): string {
  const d = new Date(Date.now() + n * 86400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Quick choices for the end of temporary access. */
export function ExpiryPresets({ value, onChange }: { value: string; onChange(v: string): void }) {
  const presets: Array<[string, string]> = [
    ['1 день', inDays(1)],
    ['7 дней', inDays(7)],
    ['30 дней', inDays(30)],
  ];
  return (
    <div className="row" role="group" aria-label="Быстрый выбор срока" style={{ gap: 4, flexWrap: 'wrap' }}>
      {presets.map(([l, v]) => (
        <button key={l} type="button" className={'btn sm' + (value === v ? ' primary' : '')} aria-pressed={value === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
      <button type="button" className={'btn sm' + (!value ? ' primary' : '')} aria-pressed={!value} onClick={() => onChange('')}>
        Бессрочно
      </button>
    </div>
  );
}

const entryId = dirEntryId;
const entryName = dirEntryName;

/** Creating a space from the interface: type, visibility, organisation-wide level and initial members (R-SPACE-001, R-SPACE-010, R-ADMIN-020). */
export function CreateSpaceDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isAdmin = me.user.orgRole === 'owner' || me.user.orgRole === 'admin';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState('project');
  const [visibility, setVisibility] = useState<'open' | 'closed' | 'private'>('private');
  const [orgLevel, setOrgLevel] = useState<string>('none');
  const [members, setMembers] = useState<Array<{ entry: DirEntry; level: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reset = () => {
    setName('');
    setDescription('');
    setKind('project');
    setVisibility('private');
    setOrgLevel('none');
    setMembers([]);
    setError(null);
  };
  const submit = async () => {
    if (!name.trim()) return setError('Укажите название пространства');
    setBusy(true);
    setError(null);
    try {
      const effectiveOrg = visibility === 'open' ? (orgLevel === 'none' ? 'view' : orgLevel) : orgLevel;
      const r = await post<{ space: { id: string } }>('/api/v1/spaces', {
        name: name.trim(),
        description,
        kind,
        visibility,
        orgLevel: effectiveOrg === 'none' ? null : effectiveOrg,
        groups: members.filter((m) => m.entry.type === 'group').map((m) => ({ groupId: entryId(m.entry), level: m.level })),
        users: members.filter((m) => m.entry.type === 'user').map((m) => ({ userId: entryId(m.entry), level: m.level })),
      });
      qc.invalidateQueries({ queryKey: ['spaces'] });
      toast.success(`Пространство «${name.trim()}» создано`);
      reset();
      onClose();
      navigate('/s/' + r.space.id);
    } catch (e) {
      setError(errMsg(e, 'Не удалось создать пространство'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="wide"
      title="Новое пространство"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" onClick={submit} disabled={busy} aria-busy={busy}>
            {busy && <span className="spinner" />} Создать пространство
          </button>
        </>
      }
    >
      <form
        className="col"
        style={{ gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="field">
          <label htmlFor="ns-name">Название</label>
          <input id="ns-name" className="input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} aria-invalid={!!error && !name.trim()} />
        </div>
        <div className="field">
          <label htmlFor="ns-desc">Описание</label>
          <textarea id="ns-desc" className="textarea" rows={2} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="field grow">
            <label htmlFor="ns-kind">Тип</label>
            <select id="ns-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.filter((k) => !k.adminOnly || isAdmin).map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label} — {k.hint}
                </option>
              ))}
            </select>
          </div>
          <div className="field grow">
            <label htmlFor="ns-vis">Видимость</label>
            <select id="ns-vis" className="select" value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>
              {VIS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} — {v.hint}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="ns-org">Все сотрудники организации</label>
          <select id="ns-org" className="select" value={visibility === 'open' && orgLevel === 'none' ? 'view' : orgLevel} onChange={(e) => setOrgLevel(e.target.value)}>
            {visibility !== 'open' && <option value="none">Нет доступа (только участники)</option>}
            {(['view', 'comment', 'edit'] as const).map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
          {(visibility === 'open' || orgLevel !== 'none') && <div className="field-hint">Пространство и все его страницы увидят все сотрудники (гости — нет).</div>}
        </div>
        <div className="field">
          <span className="field-label">Участники: сотрудники, группы и отделы</span>
          <div className="share-add">
            <DirectoryPicker
              placeholder="Добавить сотрудника, группу или отдел"
              excludeIds={members.map((m) => entryId(m.entry))}
              onPick={(e) => setMembers((cur) => [...cur, { entry: e, level: e.type === 'group' ? 'view' : 'edit' }])}
            />
          </div>
          {members.length > 0 && (
            <ul className="space-grants" aria-label="Участники нового пространства">
              {members.map((m, i) => (
                <li key={entryId(m.entry)} className="space-grant">
                  <SubjectIcon type={m.entry.type} id={entryId(m.entry)} name={entryName(m.entry)} />
                  <span className="grow ellipsis">{entryName(m.entry)}</span>
                  <select className="select" aria-label={`Уровень: ${entryName(m.entry)}`} value={m.level} onChange={(e) => setMembers((cur) => cur.map((x, j) => (j === i ? { ...x, level: e.target.value } : x)))}>
                    {GRANT_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {LEVEL_LABEL[l]}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="icon-btn" aria-label={`Убрать: ${entryName(m.entry)}`} onClick={() => setMembers((cur) => cur.filter((_, j) => j !== i))}>
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="field-hint">Вы получите полный доступ и сможете изменить состав участников на вкладке «Участники».</div>
        </div>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export interface SpaceGrant {
  id: string;
  subject_type: 'user' | 'group' | 'org' | 'space';
  subject_id: string | null;
  level: string;
  user_name: string | null;
  user_email: string | null;
  user_kind: string | null;
  group_name: string | null;
  group_kind: string | null;
  /** Name of the space whose members are the subject (subject_type 'space'). */
  space_name?: string | null;
  expires_at?: string | null;
  starts_at?: string | null;
  reason?: string | null;
}

/** Adding / changing / removing space members and groups (R-ADMIN-020, ROUTE-03, ROUTE-04). */
export function SpaceMembersEditor({ spaceId, spaceName, grants, myLevel, onChanged }: { spaceId: string; spaceName: string; grants: SpaceGrant[]; myLevel: string; onChanged(): void }) {
  const me = useMe();
  const [picked, setPicked] = useState<DirEntry[]>([]);
  const [level, setLevel] = useState('view');
  const [expiry, setExpiry] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  // Audience preview: who would newly get access to the space (same rules as the server's ACL engine).
  const previews = useQueries({
    queries: picked.map((p) => ({
      queryKey: ['space-access-preview', spaceId, p.type, entryId(p), level],
      queryFn: () => post<{ addedCount: number; added: Array<{ name: string }> }>(`/api/v1/spaces/${spaceId}/access/preview`, { subjectType: p.type, subjectId: entryId(p), level }),
      staleTime: 15_000,
      retry: false,
    })),
  });
  const previewLoading = previews.some((x) => x.isLoading);
  const previewNames = [...new Set(previews.flatMap((x) => x.data?.added.map((a) => a.name) ?? []))];
  const previewCount = previews.reduce((n, x) => n + (x.data?.addedCount ?? 0), 0);

  const putGrant = async (body: Record<string, unknown>) => {
    const full = { resourceType: 'space', resourceId: spaceId, timeZone: timeZone(), ...body };
    try {
      await put('/api/v1/grants', full);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'audience_change') {
        const ok = await confirm({ title: 'Открыть пространство всей организации?', body: <p>Пространство «{spaceName}» и все его страницы станут доступны всем сотрудникам организации.</p>, confirmLabel: 'Открыть всем' });
        if (!ok) return false;
        await put('/api/v1/grants', { ...full, confirmWiden: true });
        return true;
      }
      throw e;
    }
  };

  const add = async () => {
    setBusy(true);
    const failed: DirEntry[] = [];
    for (const p of picked) {
      try {
        await putGrant({ subjectType: p.type, subjectId: entryId(p), level, expiresAt: endOfDay(expiry), reason: reason.trim() || null });
      } catch (e) {
        failed.push(p);
        toast.error(`${entryName(p)}: ${errMsg(e)}`);
      }
    }
    setBusy(false);
    if (failed.length < picked.length) {
      toast.success('Участники добавлены');
      setExpiry('');
      setReason('');
    }
    setPicked(failed);
    onChanged();
  };

  const change = async (g: SpaceGrant, l: string) => {
    if (g.subject_type === 'user' && g.subject_id === me.user.id && l !== 'full') {
      const ok = await confirm({ title: 'Понизить собственный доступ?', body: 'Вы можете потерять возможность управлять пространством.', confirmLabel: 'Понизить', danger: true });
      if (!ok) return;
    }
    try {
      if (await putGrant({ subjectType: g.subject_type, subjectId: g.subject_id, level: l, expiresAt: g.expires_at && new Date(g.expires_at) > new Date() ? g.expires_at : null, reason: g.reason ?? null })) toast.success('Доступ изменён');
    } catch (e) {
      toast.error(errMsg(e, 'Не удалось изменить доступ'));
    }
    onChanged();
  };

  const remove = async (g: SpaceGrant, label: string) => {
    const ok = await confirm({ title: `Убрать из пространства: ${label}?`, body: 'Разрешение будет отозвано. Открытые документы участника перейдут в режим чтения или закроются.', confirmLabel: 'Убрать', danger: true });
    if (!ok) return;
    try {
      await del('/api/v1/grants/' + g.id);
      toast.success('Доступ отозван');
    } catch (e) {
      toast.error(errMsg(e, 'Не удалось отозвать доступ'));
    }
    onChanged();
  };

  const label = (g: SpaceGrant) =>
    g.subject_type === 'org' ? 'Все сотрудники организации' : g.subject_type === 'group' ? g.group_name ?? 'Группа' : g.subject_type === 'space' ? `Участники пространства «${g.space_name ?? '—'}»` : g.user_name ?? 'Пользователь';
  const allowed = (l: string) => myLevel === 'full' || GRANT_LEVELS.indexOf(l as (typeof GRANT_LEVELS)[number]) <= GRANT_LEVELS.indexOf(myLevel as (typeof GRANT_LEVELS)[number]);

  return (
    <div className="col" style={{ gap: 12 }}>
      <fieldset className="space-fieldset">
        <legend className="field-label">Добавить участников</legend>
        {picked.length > 0 && (
          <div className="share-chips">
            {picked.map((p) => (
              <span className="share-chip" key={entryId(p)}>
                {entryName(p)}
                <button aria-label="Убрать" onClick={() => setPicked(picked.filter((x) => x !== p))}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="share-add">
          <DirectoryPicker includeSpaces placeholder="Сотрудник, группа или отдел" excludeIds={[spaceId, ...picked.map(entryId)]} onPick={(e) => setPicked((cur) => [...cur, e])} />
          <label className="sr-only" htmlFor="space-add-level">
            Уровень доступа
          </label>
          <select id="space-add-level" className="select" value={level} onChange={(e) => setLevel(e.target.value)}>
            {GRANT_LEVELS.map((l) => (
              <option key={l} value={l} disabled={!allowed(l)}>
                {LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="small muted">Срок:</span>
          <ExpiryPresets value={expiry} onChange={setExpiry} />
          <input type="date" className="input" style={{ width: 150 }} aria-label="Доступ до" value={expiry} min={inDays(0)} onChange={(e) => setExpiry(e.target.value)} />
        </div>
        <input className="input" placeholder="Основание (необязательно), например: «участник проекта до сдачи»" aria-label="Основание доступа" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        {picked.length > 0 && (
          <div className="small muted" aria-live="polite" data-testid="space-access-preview" title={previewNames.join(', ')}>
            {previewLoading
              ? 'Считаем, кто получит доступ…'
              : previewCount > 0
                ? `Доступ получат ${previewCount} чел.: ${previewNames.slice(0, 8).join(', ')}${previewNames.length > 8 ? ' и другие' : ''}`
                : 'Новых людей с доступом не появится.'}
          </div>
        )}
        <div>
          <button className="btn primary" disabled={!picked.length || busy} aria-busy={busy} onClick={add}>
            {busy && <span className="spinner" />} Добавить в пространство
          </button>
        </div>
      </fieldset>
      <ul className="space-grants" aria-label="Участники пространства">
        {grants.map((g) => (
          <li key={g.id} className="space-grant">
            <SubjectIcon type={g.subject_type} id={g.subject_id} name={label(g)} />
            <span className="grow col" style={{ gap: 0, minWidth: 0 }}>
              <span className="ellipsis">
                {label(g)}
                {g.subject_type === 'user' && g.subject_id === me.user.id && <span className="muted"> (вы)</span>}
                {g.user_kind === 'guest' && <span className="badge amber" style={{ marginLeft: 6 }}>гость</span>}
              </span>
              <span className="small muted ellipsis">
                {g.subject_type === 'user' ? g.user_email : g.subject_type === 'group' ? (g.group_kind === 'department' ? 'Отдел' : 'Группа') : g.subject_type === 'space' ? 'Все участники другого пространства' : 'Кроме гостей'}
                {g.expires_at && (
                  <>
                    {' '}
                    · <Clock size={11} /> до {new Date(g.expires_at).toLocaleDateString('ru-RU')}
                  </>
                )}
                {g.reason && <> · {g.reason}</>}
              </span>
            </span>
            <select className="select" aria-label={`Уровень доступа: ${label(g)}`} value={g.level} onChange={(e) => change(g, e.target.value)}>
              {GRANT_LEVELS.map((l) => (
                <option key={l} value={l} disabled={!allowed(l)}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
              <option value="none">Запрет доступа</option>
            </select>
            <button className="icon-btn" aria-label={`Убрать доступ: ${label(g)}`} onClick={() => remove(g, label(g))}>
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
