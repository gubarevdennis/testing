import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { get } from '../api/client';
import { fileSize, fullTime, relTime } from '../lib/format';
import { Badge, ErrorState, LoadingRows, SectionHeader, num } from './common';

interface Health {
  services: { database: string; storage: string; collab: unknown };
  database: { size: string | number; pages: number; attachments: number; blob_bytes: string | number };
  searchIndexLag: { pending: number; oldest: string | null };
  jobs: Array<{ status: string; c: number }>;
  failedJobs: Array<{ id: string; type: string; error: string | null; finished_at: string | null }>;
  backups: Array<{ kind: string; status: string; location: string | null; size_bytes: string | number | null; finished_at: string | null; verified_at: string | null; verify_status: string | null }>;
  lastSuccessfulBackupAt: string | null;
  lastSuccessfulRestoreVerificationAt: string | null;
  warnings: string[];
}

const JOB_STATUS: Record<string, string> = { queued: 'В очереди', running: 'Выполняются', succeeded: 'Успешно', failed: 'Ошибка', cancelled: 'Отменены', awaiting_confirmation: 'Ждут подтверждения' };

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className={'admin-stat' + (tone ? ' ' + tone : '')}>
      <div className="muted small">{label}</div>
      <div className="admin-stat-value">{value}</div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}

export function HealthSection() {
  const q = useQuery({ queryKey: ['admin', 'health'], queryFn: () => get<Health>('/api/v1/admin/health'), refetchInterval: 60_000 });
  const h = q.data;
  return (
    <section>
      <SectionHeader
        title="Состояние системы"
        sub={h ? `Обновлено ${relTime(new Date(q.dataUpdatedAt))}` : 'Сервисы, индексация, фоновые задачи и резервные копии.'}
        actions={
          <button className="btn" onClick={() => q.refetch()} disabled={q.isFetching} aria-busy={q.isFetching}>
            <RefreshCw size={15} className={q.isFetching ? 'admin-spin' : undefined} /> Обновить
          </button>
        }
      />
      {q.isLoading ? (
        <LoadingRows rows={6} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : h ? (
        <div className="col" style={{ gap: 20 }}>
          {h.warnings.length ? (
            <div className="col" style={{ gap: 8 }}>
              {h.warnings.map((w) => (
                <div key={w} className="alert warning" role="alert">
                  {w}
                </div>
              ))}
            </div>
          ) : (
            <div className="alert success">Проблем не обнаружено.</div>
          )}
          <div className="admin-stats">
            <Stat label="База данных" value={h.services.database === 'ok' ? 'Работает' : h.services.database} tone={h.services.database === 'ok' ? 'ok' : 'bad'} sub={fileSize(Number(h.database.size))} />
            <Stat label="Файловое хранилище" value={h.services.storage === 'ok' ? 'Работает' : 'Ошибка'} tone={h.services.storage === 'ok' ? 'ok' : 'bad'} sub={h.services.storage === 'ok' ? fileSize(Number(h.database.blob_bytes)) : h.services.storage} />
            <Stat label="Поисковая индексация" value={h.searchIndexLag.pending ? `${num(h.searchIndexLag.pending)} в очереди` : 'Актуальна'} tone={h.searchIndexLag.pending > 1000 ? 'warn' : 'ok'} sub={h.searchIndexLag.oldest ? 'старейшее: ' + relTime(h.searchIndexLag.oldest) : undefined} />
            <Stat label="Страниц / файлов" value={`${num(h.database.pages)} / ${num(h.database.attachments)}`} />
            <Stat label="Последняя резервная копия" value={h.lastSuccessfulBackupAt ? relTime(h.lastSuccessfulBackupAt) : 'нет'} tone={h.lastSuccessfulBackupAt ? 'ok' : 'bad'} sub={h.lastSuccessfulBackupAt ? fullTime(h.lastSuccessfulBackupAt) : undefined} />
            <Stat label="Проверка восстановления" value={h.lastSuccessfulRestoreVerificationAt ? relTime(h.lastSuccessfulRestoreVerificationAt) : 'не проводилась'} tone={h.lastSuccessfulRestoreVerificationAt ? 'ok' : 'warn'} />
          </div>

          <div className="card">
            <h3 className="admin-card-title">Совместное редактирование</h3>
            <dl className="admin-kv">
              {h.services.collab && typeof h.services.collab === 'object' ? (
                Object.entries(h.services.collab as Record<string, unknown>).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                  </div>
                ))
              ) : (
                <div>
                  <dt>Состояние</dt>
                  <dd>{String(h.services.collab ?? '—')}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="card">
            <h3 className="admin-card-title">Фоновые задачи за 7 дней</h3>
            {h.jobs.length ? (
              <div className="admin-chips">
                {h.jobs.map((j) => (
                  <Badge key={j.status} color={j.status === 'failed' ? 'red' : j.status === 'succeeded' ? 'green' : j.status === 'running' ? 'blue' : undefined}>
                    {JOB_STATUS[j.status] ?? j.status}: {num(j.c)}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="muted small">Задач не было.</p>
            )}
            {h.failedJobs.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="table admin-table">
                  <thead>
                    <tr>
                      <th>Задача</th>
                      <th>Ошибка</th>
                      <th>Когда</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h.failedJobs.map((j) => (
                      <tr key={j.id}>
                        <td className="small">{j.type}</td>
                        <td className="small admin-break">{j.error ?? '—'}</td>
                        <td className="small muted admin-nowrap" title={fullTime(j.finished_at)}>
                          {relTime(j.finished_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="admin-card-title">Резервные копии</h3>
            {h.backups.length ? (
              <div className="table-wrap">
                <table className="table admin-table">
                  <thead>
                    <tr>
                      <th>Тип</th>
                      <th>Статус</th>
                      <th>Размер</th>
                      <th>Завершена</th>
                      <th>Проверка восстановления</th>
                      <th>Расположение</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h.backups.map((b, i) => (
                      <tr key={i}>
                        <td className="small">{b.kind}</td>
                        <td>
                          <Badge color={b.status === 'ok' ? 'green' : b.status === 'failed' ? 'red' : 'amber'}>{b.status}</Badge>
                        </td>
                        <td className="small">{b.size_bytes != null ? fileSize(Number(b.size_bytes)) : '—'}</td>
                        <td className="small admin-nowrap" title={fullTime(b.finished_at)}>
                          {b.finished_at ? relTime(b.finished_at) : '—'}
                        </td>
                        <td className="small">{b.verify_status ? <Badge color={b.verify_status === 'ok' ? 'green' : 'red'}>{b.verify_status}</Badge> : <span className="muted">—</span>} {b.verified_at && <span className="muted">{relTime(b.verified_at)}</span>}</td>
                        <td className="small mono muted admin-break">{b.location ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted small">Сведений о резервных копиях нет. Настройте регулярное резервное копирование по инструкции администратора.</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
