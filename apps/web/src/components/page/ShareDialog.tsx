import '../../styles/panels.css';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Trash2, X, HelpCircle, Clock, Lock, Globe2 } from 'lucide-react';
import { get, put, del, post, ApiError } from '../../api/client';
import type { PageDto } from '../../api/types';
import { Dialog } from '../ui/Dialog';
import { confirm } from '../ui/Confirm';
import { toast } from '../ui/Toast';
import { Tooltip } from '../ui/Tooltip';
import { LEVEL_LABEL, fullTime } from '../../lib/format';
import { useMe } from '../../state/session';
import { DirectoryPicker, SubjectIcon, errMsg, type DirEntry } from './directory';

interface Subject {
  name: string;
  email?: string;
  kind?: string;
  status?: string;
  members?: number;
}
interface AudienceEntry {
  subjectType: 'user' | 'group' | 'org';
  subjectId: string | null;
  level: string;
  via: string;
  grantId: string;
  expiresAt: string | null;
  subject: Subject;
}
interface PageGrant {
  id: string;
  subject_type: 'user' | 'group' | 'org';
  subject_id: string | null;
  level: string;
  expires_at: string | null;
  starts_at: string | null;
  reason: string | null;
  created_at: string;
  subject: Subject;
}
interface AccessResponse {
  my: { level: string; actions: Record<string, boolean>; sources: unknown[]; explanation: string[] };
  inheritPermissions: boolean;
  audience: AudienceEntry[];
  pageGrants: PageGrant[];
  publicLinks: Array<{ id: string; created_at: string; expires_at: string | null }>;
}

const RANK: Record<string, number> = { none: 0, view: 1, comment: 2, edit: 3, full: 4 };
const GRANT_LEVELS = ['view', 'comment', 'edit', 'full'] as const;
const VIA_LABEL: Record<string, string> = { space: 'из пространства', 'inherited-page': 'от родительской страницы', group: 'через группу', org: 'для всей организации', direct: 'выдан напрямую' };

/** Builds an end-of-day ISO timestamp (local time) from a yyyy-mm-dd input. */
function endOfDay(d: string): string | null {
  if (!d) return null;
  const dt = new Date(d + 'T23:59:59');
  return isNaN(dt.getTime()) ? null : dt.toISOString();
}

export function ShareDialog({ page, open, onClose }: { page: PageDto; open: boolean; onClose(): void }) {
  const me = useMe();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['page-access', page.id],
    queryFn: ({ signal }) => get<AccessResponse>(`/api/v1/pages/${page.id}/access`, signal),
    enabled: open,
  });
  const data = q.data;
  const canManage = !!(data?.my.actions.share ?? page.access.actions.share);
  const myLevel = data?.my.level ?? page.access.level;

  const [picked, setPicked] = useState<DirEntry[]>([]);
  const [newLevel, setNewLevel] = useState<string>('view');
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['page-access', page.id] });
    qc.invalidateQueries({ predicate: (x) => x.queryKey.includes(page.id) && x.queryKey[0] !== 'page-access' });
  };

  /** PUT a grant; if the server asks to confirm widening to the whole organisation, explain and retry. */
  const putGrant = async (body: Record<string, unknown>): Promise<boolean> => {
    const full = { resourceType: 'page', resourceId: page.id, ...body };
    try {
      await put('/api/v1/grants', full);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'audience_change') {
        const currentUsers = new Set((data?.audience ?? []).filter((a) => a.level !== 'none').map((a) => a.subjectType + ':' + a.subjectId)).size;
        const ok = await confirm({
          title: 'Открыть доступ всей организации?',
          body: (
            <div className="col" style={{ gap: 8 }}>
              <p>
                Страницу «{page.title || 'Без названия'}» смогут {body.level === 'view' ? 'просматривать' : body.level === 'comment' ? 'просматривать и комментировать' : 'редактировать'} <b>все сотрудники организации</b>
                {page.inheritPermissions ? ', а также все её подстраницы, которые наследуют права' : ''}.
              </p>
              <p className="muted">Сейчас доступ есть у {currentUsers} {currentUsers === 1 ? 'получателя' : 'получателей'} (людей, групп или правил). Страница появится в поиске у всех сотрудников. Гости доступ не получат.</p>
            </div>
          ),
          confirmLabel: 'Открыть всем',
        });
        if (!ok) return false;
        await put('/api/v1/grants', { ...full, confirmWiden: true });
        return true;
      }
      throw e;
    }
  };

  const invite = async () => {
    if (!picked.length) return;
    setBusy(true);
    const failed: DirEntry[] = [];
    for (const p of picked) {
      try {
        await putGrant({ subjectType: p.type, subjectId: p.type === 'user' ? p.user.id : p.group.id, level: newLevel, expiresAt: endOfDay(expiry) });
      } catch (e) {
        failed.push(p);
        toast.error(`${p.type === 'user' ? p.user.name : p.group.name}: ${errMsg(e)}`);
      }
    }
    setBusy(false);
    setPicked(failed);
    if (failed.length < picked.length) {
      toast.success('Доступ выдан');
      setExpiry('');
    }
    refresh();
  };

  const changeGrant = async (g: PageGrant, level: string) => {
    if (level === g.level) return;
    if (g.subject_type === 'user' && g.subject_id === me.user.id && RANK[level] < RANK.full) {
      const ok = await confirm({ title: 'Понизить собственный доступ?', body: 'Вы можете потерять возможность управлять доступом к этой странице.', confirmLabel: 'Понизить', danger: true });
      if (!ok) return;
    }
    try {
      const keepExpiry = g.expires_at && new Date(g.expires_at) > new Date() ? g.expires_at : null;
      if (await putGrant({ subjectType: g.subject_type, subjectId: g.subject_id, level, expiresAt: keepExpiry })) toast.success('Доступ изменён');
    } catch (e) {
      toast.error(errMsg(e, 'Не удалось изменить доступ'));
    }
    refresh();
  };

  const removeGrant = async (g: PageGrant) => {
    const self = g.subject_type === 'user' && g.subject_id === me.user.id;
    const ok = await confirm({
      title: self ? 'Убрать свой доступ?' : `Убрать доступ: ${g.subject.name}?`,
      body: self
        ? 'Если других оснований для доступа нет, вы перестанете видеть эту страницу.'
        : 'Явное разрешение будет отозвано. Если у получателя есть доступ из пространства, группы или родительской страницы, он сохранится — проверьте раздел «Унаследованный доступ».',
      confirmLabel: 'Убрать',
      danger: true,
    });
    if (!ok) return;
    try {
      await del('/api/v1/grants/' + g.id);
      toast.success('Доступ отозван');
    } catch (e) {
      toast.error(errMsg(e, 'Не удалось отозвать доступ'));
    }
    refresh();
  };

  const toggleInherit = async (inherit: boolean) => {
    const ok = await confirm({
      title: inherit ? 'Снова наследовать права?' : 'Перестать наследовать права?',
      body: inherit ? (
        <div className="col" style={{ gap: 8 }}>
          <p>Страница снова получит все разрешения родительской страницы и пространства. Изменения прав выше по дереву будут применяться и к ней.</p>
          <p className="muted">Явные разрешения этой страницы сохранятся. Доступ может расшириться — проверьте список после включения.</p>
        </div>
      ) : (
        <div className="col" style={{ gap: 8 }}>
          <p>Текущие унаследованные разрешения будут скопированы на эту страницу как явные — никто не потеряет и не получит доступ прямо сейчас. Вы получите полный доступ.</p>
          <p className="muted">В дальнейшем изменения прав у родительской страницы и пространства перестанут влиять на эту страницу и её подстраницы.</p>
        </div>
      ),
      confirmLabel: inherit ? 'Наследовать' : 'Отключить наследование',
    });
    if (!ok) return;
    try {
      await post(`/api/v1/pages/${page.id}/inheritance`, { inherit });
      toast.success(inherit ? 'Наследование прав включено' : 'Наследование прав отключено');
    } catch (e) {
      toast.error(errMsg(e, 'Не удалось изменить наследование'));
    }
    refresh();
  };

  const explicitIds = new Set(data?.pageGrants.map((g) => g.id) ?? []);
  const inherited = (data?.audience ?? []).filter((a) => !explicitIds.has(a.grantId));
  const explicit = (data?.pageGrants ?? []).filter((g) => g.subject_type !== 'org').sort((a, b) => RANK[b.level] - RANK[a.level] || a.subject.name.localeCompare(b.subject.name, 'ru'));
  const orgEntries = (data?.audience ?? []).filter((a) => a.subjectType === 'org');
  const orgLevel = orgEntries.some((a) => a.level === 'none') ? 'none' : orgEntries.reduce((m, a) => (RANK[a.level] > RANK[m] ? a.level : m), 'none');
  const orgExplicit = data?.pageGrants.find((g) => g.subject_type === 'org') ?? null;
  const orgInherited = inherited.some((a) => a.subjectType === 'org' && a.level !== 'none');

  const setGeneral = async (level: string) => {
    try {
      if (level === 'none') {
        if (orgExplicit && !orgInherited) {
          await del('/api/v1/grants/' + orgExplicit.id);
        } else {
          const ok = await confirm({
            title: 'Закрыть доступ для организации?',
            body: 'Доступ всей организации унаследован от пространства или родительской страницы. Будет добавлен явный запрет для всех сотрудников — доступ сохранится только у тех, кому он выдан лично или через группу.',
            confirmLabel: 'Закрыть',
          });
          if (!ok) return;
          await putGrant({ subjectType: 'org', subjectId: null, level: 'none' });
        }
        toast.success('Доступ для всей организации закрыт');
      } else if (await putGrant({ subjectType: 'org', subjectId: null, level })) toast.success('Общий доступ изменён');
    } catch (e) {
      toast.error(errMsg(e, 'Не удалось изменить общий доступ'));
    }
    refresh();
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/p/${page.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Ссылка скопирована. Открыть её смогут только те, у кого есть доступ.');
    } catch {
      window.prompt('Скопируйте ссылку', url);
    }
  };

  const levelAllowed = (l: string) => myLevel === 'full' || RANK[l] <= RANK[myLevel];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="wide"
      title={`Доступ: ${page.title || 'Без названия'}`}
      footer={
        <>
          <button className="btn" onClick={copyLink}>
            <Link2 size={14} /> Скопировать ссылку
          </button>
          <span className="spacer grow" />
          <button className="btn primary" onClick={onClose}>
            Готово
          </button>
        </>
      }
    >
      {q.isLoading && <div className="kb-center"><span className="spinner" /></div>}
      {q.isError && (
        <div className="alert error">
          {errMsg(q.error, 'Не удалось загрузить сведения о доступе')}{' '}
          <button className="btn sm" onClick={() => q.refetch()}>Повторить</button>
        </div>
      )}
      {data && (
        <div className="col" style={{ gap: 4 }}>
          <div className="kb-meta">
            Ваш доступ: <b>{LEVEL_LABEL[data.my.level] ?? data.my.level}</b>
            {!canManage && ' — управлять доступом могут пользователи с полным доступом.'}
          </div>

          {canManage && me.user.kind !== 'guest' && (
            <>
              <div className="kb-section-title">Пригласить</div>
              {picked.length > 0 && (
                <div className="share-chips" style={{ marginBottom: 6 }}>
                  {picked.map((p) => (
                    <span className="share-chip" key={p.type + (p.type === 'user' ? p.user.id : p.group.id)}>
                      {p.type === 'user' ? p.user.name : p.group.name}
                      <button aria-label="Убрать" onClick={() => setPicked(picked.filter((x) => x !== p))}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="share-add">
                <DirectoryPicker
                  onPick={(e) => setPicked((cur) => [...cur.filter((x) => !(x.type === e.type && (x.type === 'user' ? x.user.id : x.group.id) === (e.type === 'user' ? e.user.id : e.group.id))), e])}
                  excludeIds={picked.map((p) => (p.type === 'user' ? p.user.id : p.group.id))}
                />
                <label className="sr-only" htmlFor="share-level">Уровень доступа</label>
                <select id="share-level" className="select" value={newLevel} onChange={(e) => setNewLevel(e.target.value)}>
                  {GRANT_LEVELS.map((l) => (
                    <option key={l} value={l} disabled={!levelAllowed(l)}>
                      {LEVEL_LABEL[l]}
                    </option>
                  ))}
                </select>
                <Tooltip label="Срок действия (необязательно): после этой даты доступ отключится автоматически">
                  <input type="date" className="input" style={{ width: 150 }} aria-label="Доступ до" value={expiry} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setExpiry(e.target.value)} />
                </Tooltip>
                <button className="btn primary" disabled={!picked.length || busy} aria-busy={busy} onClick={invite}>
                  {busy && <span className="spinner" />} Выдать доступ
                </button>
              </div>
              {picked.some((p) => p.type === 'user' && p.user.kind === 'guest') && newLevel === 'full' && <div className="field-error">Гостю нельзя выдать полный доступ.</div>}
            </>
          )}

          <div className="kb-section-title">Общий доступ</div>
          <div className="share-row">
            <span className="share-subject-icon">{orgLevel === 'none' ? <Lock size={14} /> : <Globe2 size={14} />}</span>
            <div className="grow">
              <div>{orgLevel === 'none' ? 'Только приглашённые' : 'Все сотрудники организации'}</div>
              <div className="kb-meta">
                {orgLevel === 'none' ? 'Страницу видят только люди и группы из списка ниже.' : `Уровень: ${LEVEL_LABEL[orgLevel]}${orgInherited && !orgExplicit ? ' (унаследовано)' : ''}`}
              </div>
            </div>
            {canManage && (
              <select className="select" aria-label="Общий доступ" value={orgLevel} onChange={(e) => setGeneral(e.target.value)}>
                <option value="none">Только приглашённые</option>
                {(['view', 'comment', 'edit'] as const).map((l) => (
                  <option key={l} value={l} disabled={!levelAllowed(l)}>
                    Все: {LEVEL_LABEL[l].toLowerCase()}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="kb-section-title">Доступ к этой странице ({explicit.length})</div>
          {!explicit.length && <div className="kb-meta">Явных разрешений нет — доступ определяется наследованием.</div>}
          {explicit.map((g) => (
            <div className="share-row" key={g.id}>
              <SubjectIcon type={g.subject_type} id={g.subject_id} name={g.subject.name} />
              <div className="grow">
                <div className="ellipsis">
                  {g.subject.name}
                  {g.subject_type === 'user' && g.subject_id === me.user.id && <span className="muted"> (вы)</span>}
                  {g.subject.kind === 'guest' && <span className="badge amber" style={{ marginLeft: 6 }}>гость</span>}
                </div>
                <div className="kb-meta ellipsis">
                  {g.subject_type === 'group' ? `Группа${g.subject.members !== undefined ? ` · ${g.subject.members} чел.` : ''}` : g.subject.email ?? ''}
                  {g.expires_at && (
                    <span title={fullTime(g.expires_at)}>
                      {' '}
                      · <Clock size={11} /> до {new Date(g.expires_at).toLocaleDateString('ru-RU')}
                    </span>
                  )}
                </div>
              </div>
              {canManage ? (
                <>
                  <select className="select" aria-label={`Уровень доступа: ${g.subject.name}`} value={g.level} onChange={(e) => changeGrant(g, e.target.value)}>
                    {GRANT_LEVELS.map((l) => (
                      <option key={l} value={l} disabled={!levelAllowed(l)}>
                        {LEVEL_LABEL[l]}
                      </option>
                    ))}
                    <option value="none">Запрет доступа</option>
                  </select>
                  <button className="icon-btn" aria-label={`Убрать доступ: ${g.subject.name}`} onClick={() => removeGrant(g)}>
                    <Trash2 size={15} />
                  </button>
                </>
              ) : (
                <span className={'badge' + (g.level === 'none' ? ' red' : '')}>{LEVEL_LABEL[g.level] ?? g.level}</span>
              )}
            </div>
          ))}

          <div className="kb-section-title">Наследование</div>
          <div className="share-inherit">
            {canManage && (
              <label className="switch" style={{ marginTop: 2 }}>
                <input type="checkbox" checked={data.inheritPermissions} aria-label="Наследовать права" onChange={(e) => toggleInherit(e.target.checked)} />
                <span />
              </label>
            )}
            <div>
              <div style={{ fontWeight: 500 }}>{data.inheritPermissions ? 'Права наследуются' : 'Наследование отключено'}</div>
              <div className="kb-meta">
                {data.inheritPermissions
                  ? `Все, у кого есть доступ к пространству «${page.space.name}» и родительским страницам, имеют доступ и сюда. Явные разрешения выше могут только добавлять права или запрещать доступ.`
                  : 'Доступ определяется только явными разрешениями этой страницы. Изменения прав выше по дереву сюда не попадают.'}
              </div>
            </div>
          </div>

          {inherited.length > 0 && (
            <>
              <div className="kb-section-title">Унаследованный доступ ({inherited.length})</div>
              <div className="audience-list" style={{ maxHeight: 260 }}>
                {inherited.map((a) => (
                  <div className="share-row" key={a.grantId}>
                    <SubjectIcon type={a.subjectType} id={a.subjectId} name={a.subject.name} />
                    <div className="grow">
                      <div className="ellipsis">{a.subject.name}</div>
                      <div className="kb-meta ellipsis">
                        {a.via === 'space' ? `из пространства «${page.space.name}»` : VIA_LABEL[a.via] ?? a.via}
                        {a.expiresAt && ` · до ${new Date(a.expiresAt).toLocaleDateString('ru-RU')}`}
                      </div>
                    </div>
                    <span className={'badge' + (a.level === 'none' ? ' red' : '')}>{a.level === 'none' ? 'Запрет' : LEVEL_LABEL[a.level] ?? a.level}</span>
                  </div>
                ))}
              </div>
              {canManage && data.inheritPermissions && <div className="field-hint">Чтобы изменить унаследованный доступ, измените права источника или отключите наследование.</div>}
            </>
          )}

          {data.publicLinks.length > 0 && (
            <div className="alert warning" style={{ marginTop: 12 }}>
              Есть активные публичные ссылки: {data.publicLinks.length}. По ним страницу могут открыть люди вне организации.
            </div>
          )}

          <div className="row" style={{ gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            {canManage && me.user.kind !== 'guest' && (
              <button className="btn sm ghost" onClick={() => setExplainOpen((v) => !v)} aria-expanded={explainOpen}>
                <HelpCircle size={14} /> Почему у пользователя есть доступ?
              </button>
            )}
            {!canManage && me.user.kind !== 'guest' && RANK[myLevel] < RANK.edit && (
              <button className="btn sm" onClick={() => setRequestOpen((v) => !v)} aria-expanded={requestOpen}>
                Запросить больше прав
              </button>
            )}
          </div>
          {explainOpen && <ExplainBox pageId={page.id} />}
          {requestOpen && <AccessRequest pageId={page.id} myLevel={myLevel} onDone={() => setRequestOpen(false)} />}
        </div>
      )}
    </Dialog>
  );
}

interface ExplainResponse {
  user: { id: string; name: string; active: boolean; kind: string };
  level: string;
  explanation: string[];
  sources: Array<{ via: string; level: string; resourceType: string; resourceTitle?: string; subject: Subject; expiresAt: string | null }>;
  denies: Array<{ via: string; level: string; subject: Subject }>;
  inheritanceChain: Array<{ id: string; title: string; inherits: boolean; depth: number }>;
}

function ExplainBox({ pageId }: { pageId: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['access-explain', pageId, userId],
    queryFn: ({ signal }) => get<ExplainResponse>(`/api/v1/access/explain?userId=${userId}&pageId=${pageId}`, signal),
    enabled: !!userId,
  });
  return (
    <div className="share-explain" style={{ marginTop: 8 }}>
      <div className="share-add">
        <DirectoryPicker includeGroups={false} placeholder="Выберите сотрудника" onPick={(e) => e.type === 'user' && setUserId(e.user.id)} autoFocus />
      </div>
      {q.isLoading && userId && <div className="kb-center"><span className="spinner" /></div>}
      {q.isError && <div className="kb-error" style={{ marginTop: 8 }}>{errMsg(q.error)}</div>}
      {q.data && (
        <div style={{ marginTop: 10 }}>
          <div>
            <b>{q.data.user.name}</b>: {LEVEL_LABEL[q.data.level] ?? q.data.level}
            {!q.data.user.active && <span className="badge red" style={{ marginLeft: 6 }}>неактивен</span>}
          </div>
          <ul>
            {q.data.explanation.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
          {q.data.sources.length > 0 && (
            <>
              <div className="kb-meta" style={{ marginTop: 6 }}>Источники:</div>
              <ul>
                {q.data.sources.map((s, i) => (
                  <li key={i}>
                    {s.subject?.name} — {LEVEL_LABEL[s.level] ?? s.level}, {VIA_LABEL[s.via] ?? s.via}
                    {s.resourceTitle ? ` («${s.resourceTitle}»)` : ''}
                    {s.expiresAt ? `, до ${new Date(s.expiresAt).toLocaleDateString('ru-RU')}` : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
          {q.data.denies.length > 0 && (
            <>
              <div className="kb-meta" style={{ marginTop: 6 }}>Запреты:</div>
              <ul>
                {q.data.denies.map((s, i) => (
                  <li key={i}>
                    {s.subject?.name} — {VIA_LABEL[s.via] ?? s.via}
                  </li>
                ))}
              </ul>
            </>
          )}
          {q.data.inheritanceChain.length > 1 && (
            <div className="kb-meta" style={{ marginTop: 6 }}>
              Цепочка наследования: {q.data.inheritanceChain.slice().sort((a, b) => b.depth - a.depth).map((c) => `${c.title || 'Без названия'}${c.inherits ? '' : ' (не наследует)'}`).join(' → ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AccessRequest({ pageId, myLevel, onDone }: { pageId: string; myLevel: string; onDone(): void }) {
  const options = (['view', 'comment', 'edit'] as const).filter((l) => RANK[l] > RANK[myLevel]);
  const [level, setLevel] = useState<string>(options[options.length - 1] ?? 'edit');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await post('/api/v1/access-requests', { resourceType: 'page', resourceId: pageId, level, reason: reason.trim() || undefined });
      toast.success('Запрос отправлен владельцам страницы');
      onDone();
    } catch (e) {
      toast.error(errMsg(e, 'Не удалось отправить запрос'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="share-explain col" style={{ gap: 8, marginTop: 8 }}>
      <div className="field">
        <label htmlFor="req-level">Нужный уровень</label>
        <select id="req-level" className="select" value={level} onChange={(e) => setLevel(e.target.value)}>
          {options.map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABEL[l]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="req-reason">Зачем нужен доступ (необязательно)</label>
        <textarea id="req-reason" className="textarea" rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div>
        <button className="btn primary sm" disabled={busy} onClick={send}>
          {busy && <span className="spinner" />} Отправить запрос
        </button>
      </div>
      <span className="kb-meta">Запрос получат сотрудники, которым выдан полный доступ к странице.</span>
    </div>
  );
}
