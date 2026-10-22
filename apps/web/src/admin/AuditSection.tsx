import { Fragment, useState } from 'react';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { ChevronRight, Download, ScrollText, ShieldCheck } from 'lucide-react';
import { get } from '../api/client';
import { fullTime } from '../lib/format';
import { type DirectoryUser, Badge, Empty, ErrorState, LoadingRows, SectionHeader, UserPicker, downloadBlob, errMsg, num, toCsv, toIso } from './common';

interface AuditEvent {
  id: number | string;
  at: string;
  actor_id: string | null;
  actor_name: string | null;
  ip: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  outcome: string;
  correlation_id: string | null;
  details: unknown;
}

const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Вход',
  'auth.logout': 'Выход',
  'auth.password_change': 'Смена пароля',
  'auth.mfa_enable': 'Включение 2FA',
  'auth.mfa_disable': 'Отключение 2FA',
  'user.create': 'Создание пользователя',
  'user.update': 'Изменение пользователя',
  'user.suspend': 'Приостановка пользователя',
  'user.deactivate': 'Деактивация пользователя',
  'user.reactivate': 'Восстановление пользователя',
  'user.revoke_sessions': 'Отзыв сеансов',
  'user.password_reset': 'Сброс пароля',
  'user.invite_resend': 'Повторное приглашение',
  'user.invite_revoke': 'Отзыв приглашения',
  'user.invite_accept': 'Принятие приглашения',
  'user.transfer_ownership': 'Передача владения',
  'group.create': 'Создание группы',
  'group.update': 'Изменение группы',
  'group.delete': 'Удаление группы',
  'group.member.add': 'Добавление в группу',
  'group.member.remove': 'Исключение из группы',
  'org.settings_update': 'Изменение настроек организации',
  'archive.export_request': 'Запрос архива',
  'archive.download': 'Скачивание архива',
  'archive.restore': 'Восстановление из архива',
  'archive.restore_analyze': 'Проверка архива',
  'archive.denied': 'Отказ: архив',
  'api_token.create': 'Создание API-токена',
};

const ACTION_PREFIXES = [
  ['', 'Все действия'],
  ['auth.', 'Вход и безопасность'],
  ['user.', 'Пользователи'],
  ['group.', 'Группы'],
  ['grant.', 'Права доступа'],
  ['page.', 'Страницы'],
  ['space.', 'Пространства'],
  ['org.', 'Организация'],
  ['archive.', 'Архивы'],
  ['export', 'Экспорт'],
] as const;

interface Filters {
  action: string;
  actionCustom: string;
  targetType: string;
  targetId: string;
  actor: DirectoryUser | null;
  from: string;
  to: string;
}
const EMPTY: Filters = { action: '', actionCustom: '', targetType: '', targetId: '', actor: null, from: '', to: '' };

export function AuditSection() {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const params = (before?: number | string | null) => {
    const p = new URLSearchParams({ limit: '100' });
    const action = applied.actionCustom.trim() || applied.action;
    if (action) p.set('action', action);
    if (applied.targetType.trim()) p.set('targetType', applied.targetType.trim());
    if (applied.targetId.trim()) p.set('targetId', applied.targetId.trim());
    if (applied.actor) p.set('actorId', applied.actor.id);
    const from = toIso(applied.from);
    const to = toIso(applied.to);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (before !== undefined && before !== null) p.set('before', String(before));
    return p.toString();
  };
  const q = useInfiniteQuery({
    queryKey: ['admin', 'audit', params()],
    queryFn: ({ pageParam }) => get<{ scope: string; events: AuditEvent[]; nextCursor: number | string | null }>('/api/v1/audit?' + params(pageParam)),
    initialPageParam: null as number | string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const verify = useMutation({ mutationFn: () => get<{ ok: boolean; brokenAt: number | null; checked: number }>('/api/v1/audit/verify') });
  const events = q.data?.pages.flatMap((p) => p.events) ?? [];
  const filtered = JSON.stringify(applied) !== JSON.stringify(EMPTY);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const exportCsv = () => {
    const rows = [['id', 'at', 'actor', 'actor_id', 'ip', 'action', 'target_type', 'target_id', 'outcome', 'correlation_id', 'details'], ...events.map((e) => [e.id, e.at, e.actor_name, e.actor_id, e.ip, e.action, e.target_type, e.target_id, e.outcome, e.correlation_id, e.details])];
    downloadBlob(`audit-${new Date().toISOString().slice(0, 10)}.csv`, new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  };

  return (
    <section>
      <SectionHeader
        title="Журнал аудита"
        sub="Неизменяемый журнал событий безопасности и администрирования. Записи связаны цепочкой хешей."
        actions={
          <>
            <button className="btn" disabled={!events.length} onClick={exportCsv}>
              <Download size={15} /> CSV
            </button>
            <button className="btn" disabled={verify.isPending} aria-busy={verify.isPending} onClick={() => verify.mutate()}>
              {verify.isPending ? <span className="spinner" /> : <ShieldCheck size={15} />} Проверить целостность
            </button>
          </>
        }
      />
      {verify.isError && (
        <div className="alert error admin-mb" role="alert">
          Проверка не выполнена: {errMsg(verify.error)}
        </div>
      )}
      {verify.data && (
        <div className={'alert admin-mb ' + (verify.data.ok ? 'success' : 'error')} role="status">
          {verify.data.ok ? (
            <span>
              Цепочка целостна: проверено записей — <b>{num(verify.data.checked)}</b>. Изменений и удалений не обнаружено.
            </span>
          ) : (
            <span>
              <b>Нарушена целостность журнала</b> на записи №{verify.data.brokenAt} (проверено {num(verify.data.checked)}). Запись или предшествующие ей могли быть изменены или удалены. Сообщите ответственному за безопасность.
            </span>
          )}
        </div>
      )}
      <form
        className="admin-filters card"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(draft);
        }}
      >
        <div className="field">
          <label htmlFor="af-action">Действие</label>
          <select id="af-action" className="select" value={draft.action} onChange={(e) => set('action', e.target.value)}>
            {ACTION_PREFIXES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="af-code">Код действия</label>
          <input id="af-code" className="input" placeholder="например, user.deactivate" value={draft.actionCustom} onChange={(e) => set('actionCustom', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="af-actor">Кто</label>
          <UserPicker id="af-actor" value={draft.actor} onChange={(u) => set('actor', u)} placeholder="Любой пользователь" />
        </div>
        <div className="field">
          <label htmlFor="af-tt">Тип объекта</label>
          <select id="af-tt" className="select" value={draft.targetType} onChange={(e) => set('targetType', e.target.value)}>
            <option value="">Любой</option>
            <option value="user">Пользователь</option>
            <option value="group">Группа</option>
            <option value="page">Страница</option>
            <option value="space">Пространство</option>
            <option value="org">Организация</option>
            <option value="job">Задача</option>
            <option value="attachment">Файл</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="af-tid">ID объекта</label>
          <input id="af-tid" className="input mono" value={draft.targetId} onChange={(e) => set('targetId', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="af-from">С</label>
          <input id="af-from" className="input" type="datetime-local" value={draft.from} onChange={(e) => set('from', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="af-to">По</label>
          <input id="af-to" className="input" type="datetime-local" value={draft.to} onChange={(e) => set('to', e.target.value)} />
        </div>
        <div className="admin-filters-actions">
          <button type="button" className="btn" onClick={() => {
            setDraft(EMPTY);
            setApplied(EMPTY);
          }}>
            Сбросить
          </button>
          <button type="submit" className="btn primary">
            Применить
          </button>
        </div>
      </form>

      {q.isLoading ? (
        <LoadingRows rows={8} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !events.length ? (
        <Empty icon={<ScrollText size={32} />} title={filtered ? 'Нет событий по заданным условиям' : 'Журнал пуст'}>
          {filtered ? 'Измените фильтры.' : undefined}
        </Empty>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table admin-table">
              <thead>
                <tr>
                  <th aria-label="Подробности" />
                  <th>Время</th>
                  <th>Кто</th>
                  <th>Действие</th>
                  <th>Объект</th>
                  <th>Результат</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => {
                  const key = String(e.id);
                  const isOpen = !!open[key];
                  return (
                    <Fragment key={key}>
                      <tr>
                        <td>
                          <button className="icon-btn sm" aria-expanded={isOpen} aria-label="Подробности" onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))}>
                            <ChevronRight size={14} className={'chev' + (isOpen ? ' open' : '')} />
                          </button>
                        </td>
                        <td className="small admin-nowrap">{fullTime(e.at)}</td>
                        <td className="small">{e.actor_name ?? <span className="muted">система</span>}</td>
                        <td className="small">
                          <div>{ACTION_LABEL[e.action] ?? e.action}</div>
                          {ACTION_LABEL[e.action] && <div className="muted mono admin-xs">{e.action}</div>}
                        </td>
                        <td className="small">
                          {e.target_type ? (
                            <>
                              <span>{e.target_type}</span> <span className="muted mono admin-xs">{e.target_id}</span>
                            </>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <Badge color={e.outcome === 'success' ? 'green' : e.outcome === 'denied' ? 'red' : 'amber'}>{e.outcome === 'success' ? 'успех' : e.outcome === 'denied' ? 'отказ' : e.outcome}</Badge>
                        </td>
                        <td className="small mono muted">{e.ip ?? ''}</td>
                      </tr>
                      {isOpen && (
                        <tr className="admin-details-row">
                          <td colSpan={7}>
                            <div className="small muted">
                              Запись №{e.id}
                              {e.correlation_id ? ` · correlation-id ${e.correlation_id}` : ''}
                              {e.actor_id ? ` · actor ${e.actor_id}` : ''}
                            </div>
                            <pre className="admin-pre">{JSON.stringify(e.details ?? {}, null, 2)}</pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="row admin-pager">
            <span className="muted small grow">Показано: {num(events.length)}</span>
            {q.hasNextPage && (
              <button className="btn sm" disabled={q.isFetchingNextPage} aria-busy={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
                {q.isFetchingNextPage && <span className="spinner" />} Загрузить ещё
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
