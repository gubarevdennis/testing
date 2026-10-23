import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Download, Upload } from 'lucide-react';
import { ApiError, api, get, post, upload } from '../api/client';
import { Dialog } from '../components/ui/Dialog';
import { toast } from '../components/ui/Toast';
import { useInFlight } from '../hooks/useInFlight';
import { fileSize, fullTime, relTime } from '../lib/format';
import { Badge, Empty, ErrorState, LoadingRows, SectionHeader, downloadBlob, errMsg, num } from './common';

interface ArchiveJob {
  id: string;
  type: 'archive-export' | 'archive-restore';
  status: string;
  progress: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  counts: Record<string, number> | null;
  created_by_name: string | null;
}

interface Analysis {
  ok: boolean;
  manifest: { createdAt?: string; organization?: { name?: string }; formatVersion?: number; counts?: Record<string, number>; includes?: Record<string, boolean> } & Record<string, unknown>;
  checksumErrors: string[];
  missingFiles: string[];
  conflicts: { pages: number; spaces: number; attachments: number };
  users: Array<{ email: string; name: string; match: 'existing' | 'unresolved' }>;
  warnings: string[];
}

interface RestoreResult {
  restore: { remapped: boolean; unresolvedUsers: unknown[]; restoredGrants: number; droppedGrants: number; pages: number; attachments: number } | null;
  verification: { ok: boolean; problems: string[]; checked: Record<string, number> } | null;
  repeated?: boolean;
}

const STATUS: Record<string, { label: string; color: string }> = {
  queued: { label: 'В очереди', color: '' },
  running: { label: 'Выполняется', color: 'blue' },
  succeeded: { label: 'Готово', color: 'green' },
  failed: { label: 'Ошибка', color: 'red' },
  cancelled: { label: 'Отменено', color: '' },
  awaiting_confirmation: { label: 'Ждёт подтверждения', color: 'amber' },
};

const COUNT_LABEL: Record<string, string> = {
  spaces: 'Пространства',
  pages: 'Страницы',
  blocks: 'Блоки',
  attachments: 'Файлы',
  attachmentVersions: 'Версии файлов',
  bytes: 'Объём',
  users: 'Пользователи',
  groups: 'Группы',
  grants: 'Права доступа',
  revisions: 'Версии',
  links: 'Ссылки',
  collections: 'Коллекции',
  comments: 'Комментарии',
};

const STAGE: Record<string, string> = { metadata: 'метаданные', files: 'файлы', pages: 'страницы' };

function Counts({ counts }: { counts: Record<string, number> | null | undefined }) {
  if (!counts) return null;
  return (
    <dl className="admin-kv">
      {Object.entries(counts).map(([k, v]) => (
        <div key={k}>
          <dt>{COUNT_LABEL[k] ?? k}</dt>
          <dd>{k === 'bytes' ? fileSize(Number(v)) : num(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ArchivesSection() {
  const qc = useQueryClient();
  const [exportOpen, setExportOpen] = useState(false);
  const [restore, setRestore] = useState<{ jobId?: string } | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['admin', 'archives'],
    queryFn: () => get<{ archives: ArchiveJob[] }>('/api/v1/admin/archives'),
    refetchInterval: (query) => (query.state.data?.archives.some((a) => a.status === 'queued' || a.status === 'running') ? 3000 : false),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'archives'] });
  const [downloading, setDownloading] = useState<string | null>(null);

  const download = async (j: ArchiveJob) => {
    setDownloading(j.id);
    try {
      const res = await api<Response>('GET', `/api/v1/admin/archives/${j.id}/download`, undefined, { raw: true });
      const cd = res.headers.get('content-disposition') ?? '';
      const name = /filename="?([^"]+)"?/.exec(cd)?.[1] ?? `knowledge-archive-${j.id}.zip`;
      downloadBlob(name, await res.blob());
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setDownloading(null);
    }
  };

  const items = list.data?.archives ?? [];
  return (
    <section>
      <SectionHeader
        title="Резервные копии и архив"
        sub="Полный переносимый архив организации (страницы, файлы, версии, права) и восстановление из него. Операции требуют подтверждения паролем и записываются в журнал аудита."
        actions={
          <>
            <button className="btn" onClick={() => setRestore({})}>
              <Upload size={15} /> Восстановить из архива
            </button>
            <button className="btn primary" onClick={() => setExportOpen(true)}>
              <Archive size={15} /> Создать архив
            </button>
          </>
        }
      />
      {list.isLoading ? (
        <LoadingRows rows={4} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !items.length ? (
        <Empty icon={<Archive size={32} />} title="Архивов пока нет">
          Создайте архив организации, чтобы получить полную переносимую копию базы знаний.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="table admin-table">
            <thead>
              <tr>
                <th>Операция</th>
                <th>Статус</th>
                <th>Создана</th>
                <th>Состав</th>
                <th aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {items.map((j) => {
                const st = STATUS[j.status] ?? { label: j.status, color: '' };
                const expired = j.type === 'archive-export' && j.finished_at && Date.now() - new Date(j.finished_at).getTime() > 72 * 3600_000;
                return (
                  <tr key={j.id}>
                    <td>
                      <div>{j.type === 'archive-export' ? 'Экспорт архива' : 'Восстановление'}</div>
                      <div className="muted small">{j.created_by_name ?? ''}</div>
                    </td>
                    <td>
                      <Badge color={st.color}>{st.label}</Badge>
                      {j.status === 'running' && j.progress && (
                        <div className="muted small">
                          {STAGE[String(j.progress.stage)] ?? String(j.progress.stage ?? '')}
                          {j.progress.bytes ? ` · ${fileSize(Number(j.progress.bytes))}` : ''}
                        </div>
                      )}
                      {j.error && <div className="field-error admin-break">{j.error}</div>}
                    </td>
                    <td className="small admin-nowrap" title={fullTime(j.created_at)}>
                      {relTime(j.created_at)}
                      {j.finished_at && <div className="muted">завершена {relTime(j.finished_at)}</div>}
                    </td>
                    <td className="small">{j.counts ? `${num(j.counts.pages ?? 0)} стр. · ${num(j.counts.attachments ?? 0)} файлов` : <span className="muted">—</span>}</td>
                    <td className="admin-cell-actions">
                      {j.type === 'archive-export' && j.status === 'succeeded' && (
                        <button className="btn sm" disabled={!!expired || downloading === j.id} aria-busy={downloading === j.id} title={expired ? 'Срок хранения для скачивания (72 ч) истёк — сформируйте заново' : undefined} onClick={() => download(j)}>
                          {downloading === j.id ? <span className="spinner" /> : <Download size={14} />} Скачать
                        </button>
                      )}
                      {j.type === 'archive-restore' && j.status === 'awaiting_confirmation' && (
                        <button className="btn sm" onClick={() => setRestore({ jobId: j.id })}>
                          Продолжить
                        </button>
                      )}
                      {j.type === 'archive-restore' && (j.status === 'succeeded' || j.status === 'failed') && (
                        <button className="btn sm" onClick={() => setReport(j.id)}>
                          Отчёт
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {exportOpen && (
        <ExportDialog
          onClose={() => setExportOpen(false)}
          onCreated={() => {
            refresh();
            setExportOpen(false);
          }}
        />
      )}
      {restore && <RestoreDialog jobId={restore.jobId} onClose={() => setRestore(null)} onChanged={refresh} />}
      {report && <ReportDialog jobId={report} onClose={() => setReport(null)} />}
    </section>
  );
}

// ---------------------------------------------------------------- export

function ExportDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [opts, setOpts] = useState({ includeVersions: true, includeAcl: true, includeComments: true, includeAudit: false });
  const [password, setPassword] = useState('');
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<{ msg: string; field?: 'password' } | null>(null);
  const m = useMutation({
    mutationFn: () => post<{ jobId: string }>('/api/v1/admin/archives', { password, confirm: true, options: opts }),
    onSuccess: () => {
      toast.success('Архив формируется. Он появится в списке, когда будет готов.');
      onCreated();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'reauth_failed') {
        setError({ msg: 'Неверный пароль. Подтвердите операцию своим паролем.', field: 'password' });
        setPassword('');
      } else setError({ msg: errMsg(e) });
    },
  });
  // a second activation before react-query reports «pending» would start a second full export (QA-A1)
  const once = useInFlight();
  const submit = () => once(() => m.mutateAsync());
  const opt = (k: keyof typeof opts, label: string, hint?: string) => (
    <label className="checkbox admin-check-hint">
      <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts((o) => ({ ...o, [k]: e.target.checked }))} />
      <span>
        {label}
        {hint && <span className="muted small"> — {hint}</span>}
      </span>
    </label>
  );
  return (
    <Dialog
      open
      persistent
      title="Архив организации"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={!password || !ack || m.isPending} aria-busy={m.isPending} onClick={submit}>
            {m.isPending && <span className="spinner" />} Создать архив
          </button>
        </>
      }
    >
      <form
        className="col"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (password && ack) submit();
        }}
      >
        <div className="alert warning">Архив содержит все материалы организации, включая личные пространства сотрудников. Храните его в защищённом месте. Пароли, токены и ключи в архив не включаются.</div>
        {error && !error.field && (
          <div className="alert error" role="alert">
            {error.msg}
          </div>
        )}
        <fieldset className="admin-fieldset">
          <legend className="field-label">Состав</legend>
          <label className="checkbox admin-check-hint">
            <input type="checkbox" checked disabled /> <span>Страницы, пространства и файлы</span>
          </label>
          {opt('includeVersions', 'История версий')}
          {opt('includeAcl', 'Права доступа и оргструктура', 'группы, отделы, выданные доступы')}
          {opt('includeComments', 'Комментарии')}
          {opt('includeAudit', 'Журнал аудита')}
        </fieldset>
        <div className="field">
          <label htmlFor="ex-pass">Ваш пароль</label>
          <input id="ex-pass" className="input" type="password" autoComplete="current-password" value={password} aria-invalid={error?.field === 'password'} onChange={(e) => setPassword(e.target.value)} />
          {error?.field === 'password' ? <div className="field-error">{error.msg}</div> : <div className="field-hint">Повторный ввод пароля подтверждает операцию с повышенными правами.</div>}
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Я подтверждаю выгрузку всех данных организации
        </label>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- restore

function AnalysisReport({ a }: { a: Analysis }) {
  const unresolved = a.users.filter((u) => u.match === 'unresolved');
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className={'alert ' + (a.ok ? 'success' : 'error')} role="status">
        {a.ok ? 'Архив прошёл проверку целостности. Ниже — что будет восстановлено. Пока ничего не изменено.' : 'Архив повреждён — восстановление невозможно. Сформируйте архив заново.'}
      </div>
      <div className="muted small">
        {a.manifest.organization?.name && <>Организация: {a.manifest.organization.name}. </>}
        {a.manifest.createdAt && <>Создан: {fullTime(a.manifest.createdAt)}. </>}
        {a.manifest.formatVersion !== undefined && <>Формат: v{a.manifest.formatVersion}.</>}
      </div>
      <Counts counts={a.manifest.counts} />
      {(a.checksumErrors.length > 0 || a.missingFiles.length > 0) && (
        <div className="alert error">
          <div>
            {a.checksumErrors.length > 0 && <div>Ошибки контрольных сумм: {a.checksumErrors.slice(0, 10).join(', ')}{a.checksumErrors.length > 10 ? ` и ещё ${a.checksumErrors.length - 10}` : ''}</div>}
            {a.missingFiles.length > 0 && <div>Отсутствуют файлы: {a.missingFiles.slice(0, 10).join(', ')}{a.missingFiles.length > 10 ? ` и ещё ${a.missingFiles.length - 10}` : ''}</div>}
          </div>
        </div>
      )}
      {(a.conflicts.pages > 0 || a.conflicts.spaces > 0 || a.conflicts.attachments > 0) && (
        <div className="small">
          Совпадения с существующими объектами: пространств — {a.conflicts.spaces}, страниц — {a.conflicts.pages}, файлов — {a.conflicts.attachments}.
        </div>
      )}
      {a.warnings.map((w) => (
        <div key={w} className="alert warning">
          {w}
        </div>
      ))}
      {a.users.length > 0 && (
        <details>
          <summary className="small">
            Пользователи в архиве: {a.users.length} (найдено в системе: {a.users.length - unresolved.length}, не найдено: {unresolved.length})
          </summary>
          <ul className="admin-list small">
            {a.users.map((u) => (
              <li key={u.email}>
                {u.name} — {u.email} {u.match === 'existing' ? <Badge color="green">найден</Badge> : <Badge color="amber">будет создан неактивным</Badge>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function RestoreReport({ r }: { r: RestoreResult }) {
  return (
    <div className="col" style={{ gap: 12 }}>
      {r.verification && (
        <div className={'alert ' + (r.verification.ok ? 'success' : 'warning')} role="status">
          {r.verification.ok ? 'Восстановление завершено и проверено: количество, иерархия, файлы и права совпадают с архивом.' : 'Восстановление завершено, но проверка выявила расхождения:'}
        </div>
      )}
      {r.verification && !r.verification.ok && (
        <ul className="admin-list small">
          {r.verification.problems.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
      {r.restore && (
        <dl className="admin-kv">
          <div>
            <dt>Страниц</dt>
            <dd>{num(r.restore.pages)}</dd>
          </div>
          <div>
            <dt>Файлов</dt>
            <dd>{num(r.restore.attachments)}</dd>
          </div>
          <div>
            <dt>Прав восстановлено</dt>
            <dd>{num(r.restore.restoredGrants)}</dd>
          </div>
          <div>
            <dt>Прав пропущено</dt>
            <dd>{num(r.restore.droppedGrants)}</dd>
          </div>
          <div>
            <dt>Неразрешённых пользователей</dt>
            <dd>{num(r.restore.unresolvedUsers?.length ?? 0)}</dd>
          </div>
          <div>
            <dt>Новые идентификаторы</dt>
            <dd>{r.restore.remapped ? 'да' : 'нет'}</dd>
          </div>
        </dl>
      )}
      {r.verification?.checked && <Counts counts={r.verification.checked} />}
    </div>
  );
}

function RestoreDialog({ jobId: initialJob, onClose, onChanged }: { jobId?: string; onClose: () => void; onChanged: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [jobId, setJobId] = useState<string | undefined>(initialJob);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [password, setPassword] = useState('');
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<{ msg: string; field?: 'password' } | null>(null);
  // Restore target (R-ARCHIVE-006): merge into the organisation, a new isolated space, or an existing space.
  const [targetMode, setTargetMode] = useState<'merge' | 'new-space' | 'into-space'>('merge');
  const [targetName, setTargetName] = useState('');
  const [targetSpace, setTargetSpace] = useState('');
  const spacesQ = useQuery({ queryKey: ['spaces', 'restore-target'], queryFn: () => get<{ spaces: Array<{ id: string; name: string; kind: string }> }>('/api/v1/spaces'), enabled: targetMode === 'into-space' });
  const target = targetMode === 'merge' ? { mode: 'merge' } : targetMode === 'new-space' ? { mode: 'new-space', ...(targetName.trim() ? { name: targetName.trim() } : {}) } : { mode: 'into-space', spaceId: targetSpace };
  const existing = useQuery({
    queryKey: ['admin', 'archive', initialJob],
    queryFn: () => get<{ analysis: Analysis | null; status: string }>(`/api/v1/admin/archives/${initialJob}`),
    enabled: !!initialJob && !analysis,
  });
  const a = analysis ?? existing.data?.analysis ?? null;

  const doUpload = async () => {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await upload<{ jobId: string; analysis: Analysis }>('/api/v1/admin/archives/restore', fd, setProgress);
      setJobId(r.jobId);
      setAnalysis(r.analysis);
      onChanged();
    } catch (e) {
      setError({ msg: errMsg(e) });
    } finally {
      setProgress(null);
    }
  };
  const commit = useMutation({
    mutationFn: () => post<RestoreResult>(`/api/v1/admin/archives/restore/${jobId}/commit`, { password, confirm: true, target }),
    onSuccess: (r) => {
      setResult(r);
      setError(null);
      onChanged();
      toast.success('Восстановление завершено');
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'reauth_failed') {
        setError({ msg: 'Неверный пароль.', field: 'password' });
        setPassword('');
      } else setError({ msg: errMsg(e) });
      onChanged();
    },
  });
  const busy = progress !== null || commit.isPending;
  const onceCommit = useInFlight();

  let body;
  let footer;
  if (result) {
    body = <RestoreReport r={result} />;
    footer = (
      <button className="btn primary" onClick={onClose}>
        Готово
      </button>
    );
  } else if (jobId && (a || existing.isLoading || existing.isError)) {
    body = existing.isLoading && !a ? (
      <LoadingRows />
    ) : existing.isError && !a ? (
      <ErrorState error={existing.error} onRetry={() => existing.refetch()} />
    ) : a ? (
      <div className="col" style={{ gap: 14 }}>
        <AnalysisReport a={a} />
        {a.ok && (
          <div className="card col" style={{ gap: 12 }}>
            <div className="field-label">Подтверждение восстановления</div>
            <div className="col" style={{ gap: 6 }} role="radiogroup" aria-label="Куда восстановить">
              <div className="field-label">Куда восстановить</div>
              <label className="checkbox">
                <input type="radio" name="rs-target" checked={targetMode === 'merge'} onChange={() => setTargetMode('merge')} /> Объединить с организацией (пространства архива)
              </label>
              <label className="checkbox">
                <input type="radio" name="rs-target" checked={targetMode === 'new-space'} onChange={() => setTargetMode('new-space')} /> В новое изолированное пространство (видно только вам)
              </label>
              {targetMode === 'new-space' && (
                <input className="input" aria-label="Название нового пространства" placeholder="Восстановлено из архива" value={targetName} onChange={(e) => setTargetName(e.target.value)} />
              )}
              <label className="checkbox">
                <input type="radio" name="rs-target" checked={targetMode === 'into-space'} onChange={() => setTargetMode('into-space')} /> В существующее пространство
              </label>
              {targetMode === 'into-space' && (
                <select className="input" aria-label="Пространство для восстановления" value={targetSpace} onChange={(e) => setTargetSpace(e.target.value)}>
                  <option value="">Выберите пространство…</option>
                  {(spacesQ.data?.spaces ?? [])
                    .filter((x) => x.kind !== 'personal')
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
              )}
            </div>
            <p className="small muted">
              {targetMode === 'merge'
                ? 'Данные архива будут добавлены в текущую организацию одной транзакцией. Существующие страницы не перезаписываются; при совпадении идентификаторов объекты получат новые.'
                : 'Каждое пространство архива станет страницей верхнего уровня в выбранном пространстве. Все объекты получат новые идентификаторы, оригиналы не изменяются; права пространств архива не применяются.'}
            </p>
            {error && !error.field && (
              <div className="alert error" role="alert">
                {error.msg}
              </div>
            )}
            <div className="field">
              <label htmlFor="rs-pass">Ваш пароль</label>
              <input id="rs-pass" className="input" type="password" autoComplete="current-password" value={password} aria-invalid={error?.field === 'password'} onChange={(e) => setPassword(e.target.value)} />
              {error?.field === 'password' && <div className="field-error">{error.msg}</div>}
            </div>
            <label className="checkbox">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> Я проверил отчёт и подтверждаю восстановление
            </label>
          </div>
        )}
      </div>
    ) : null;
    footer = (
      <>
        <button className="btn" onClick={onClose} disabled={busy}>
          {a?.ok ? 'Отмена' : 'Закрыть'}
        </button>
        {a?.ok && (
          <button className="btn danger solid" disabled={!password || !ack || busy || (targetMode === 'into-space' && !targetSpace)} aria-busy={commit.isPending} onClick={() => onceCommit(() => commit.mutateAsync())}>
            {commit.isPending && <span className="spinner" />} Восстановить
          </button>
        )}
      </>
    );
  } else {
    body = (
      <div className="col" style={{ gap: 14 }}>
        <p className="small muted">Загрузите архив, созданный этой системой (.zip). Сначала будет выполнена проверка целостности и пробный прогон — данные не изменятся до вашего подтверждения.</p>
        {error && (
          <div className="alert error" role="alert">
            {error.msg}
          </div>
        )}
        <div className="field">
          <label htmlFor="rs-file">Файл архива</label>
          <input id="rs-file" type="file" accept=".zip,application/zip" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file && <div className="field-hint">{file.name} · {fileSize(file.size)}</div>}
        </div>
        {progress !== null && (
          <div className="col" style={{ gap: 4 }}>
            <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <span className="muted small">{progress < 1 ? `Загрузка ${Math.round(progress * 100)}%` : 'Проверка архива…'}</span>
          </div>
        )}
      </div>
    );
    footer = (
      <>
        <button className="btn" onClick={onClose} disabled={busy}>
          Отмена
        </button>
        <button className="btn primary" disabled={!file || busy} aria-busy={busy} onClick={doUpload}>
          {busy && <span className="spinner" />} Проверить архив
        </button>
      </>
    );
  }
  return (
    <Dialog open size="wide" persistent title={result ? 'Результат восстановления' : 'Восстановление из архива'} onClose={() => !busy && onClose()} footer={footer}>
      {body}
    </Dialog>
  );
}

function ReportDialog({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['admin', 'archive', jobId],
    queryFn: () => get<{ status: string; error: string | null; analysis: Analysis | null; restore: RestoreResult['restore']; verification: RestoreResult['verification'] }>(`/api/v1/admin/archives/${jobId}`),
  });
  return (
    <Dialog
      open
      size="wide"
      title="Отчёт о восстановлении"
      onClose={onClose}
      footer={
        <button className="btn primary" onClick={onClose}>
          Закрыть
        </button>
      }
    >
      {q.isLoading ? (
        <LoadingRows />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data ? (
        <div className="col" style={{ gap: 14 }}>
          {q.data.error && (
            <div className="alert error" role="alert">
              {q.data.error}
            </div>
          )}
          {(q.data.restore || q.data.verification) && <RestoreReport r={{ restore: q.data.restore, verification: q.data.verification }} />}
          {q.data.analysis && (
            <details>
              <summary className="small">Отчёт предварительной проверки</summary>
              <AnalysisReport a={q.data.analysis} />
            </details>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
