import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, FileText, FileSpreadsheet, FileArchive, X, AlertTriangle, CheckCircle2, XCircle, RefreshCw, ArrowLeft, Info, FileCode } from 'lucide-react';
import { get, post, upload, uuid, ApiError } from '../api/client';
import type { Space } from '../api/types';
import { useSpaces, useChildren } from '../hooks/data';
import { useMe } from '../state/session';
import { toast } from '../components/ui/Toast';
import { fileSize } from '../lib/format';

// ------------------------------------------------------------------ server shapes

interface Warning {
  code: string;
  message: string;
  blockId?: string;
}
interface FileReport {
  file: string;
  status: 'ok' | 'warning' | 'error';
  pages: number;
  warnings: Warning[];
  error?: string;
}
interface SheetPreview {
  name: string;
  columns: Array<{ name: string; type: ColType; options?: string[]; invalid: number }>;
  rows: string[][];
  totalRows: number;
}
interface PlanSummary {
  kind: 'documents' | 'tabular';
  files: FileReport[];
  pages: Array<{ tempId: string; parentTempId: string | null; title: string; sourceFile: string; stats: { blocks: number; tables: number; images: number; chars: number }; assets: number }>;
  assets: number;
  tabular: { file: string; encoding?: string; delimiter?: string; sheets: SheetPreview[] } | null;
}
interface CommitResult {
  pages: Array<{ id: string; title?: string }>;
  rootPageId: string | null;
  inserted?: number;
  updated?: number;
  repeated?: boolean;
}
interface ImportJob {
  id: string;
  status: 'queued' | 'running' | 'awaiting_confirmation' | 'succeeded' | 'failed' | 'cancelled' | 'partial';
  progress: { stage?: string; files?: number } | null;
  error: string | null;
  preview: PlanSummary | null;
  result: CommitResult | null;
  rejected: Array<{ filename: string; size: number; error?: string }>;
}
interface DryRun {
  rows: number;
  inserts: number;
  updates: number;
  duplicatesInFile: number;
  invalid: Array<{ row: number; column: string; value: string }>;
  invalidCount: number;
  types: ColType[];
  header: string[];
  /** Preview of the selected sheet/range (first 100 rows). */
  preview?: SheetPreview;
}

type ColType = 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'url' | 'email';
type Encoding = 'auto' | 'utf-8' | 'windows-1251';
type Delimiter = 'auto' | ',' | ';' | '\t';

const COL_TYPES: Array<[ColType, string]> = [
  ['text', 'Текст'],
  ['number', 'Число'],
  ['date', 'Дата'],
  ['checkbox', 'Флажок'],
  ['select', 'Список'],
  ['url', 'Ссылка'],
  ['email', 'E-mail'],
];
const EXTS = ['docx', 'md', 'markdown', 'zip', 'csv', 'tsv', 'xlsx', 'html', 'htm', 'txt'];
const ACCEPT = EXTS.map((e) => '.' + e).join(',');
const ext = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';
const isTabularName = (name: string) => ['csv', 'tsv', 'xlsx'].includes(ext(name));

function FileIcon({ name }: { name: string }) {
  const e = ext(name);
  if (e === 'csv' || e === 'xlsx' || e === 'tsv') return <FileSpreadsheet size={18} />;
  if (e === 'zip') return <FileArchive size={18} />;
  if (e === 'html' || e === 'htm') return <FileCode size={18} />;
  return <FileText size={18} />;
}

const spaceLabel = (s: Space) => (s.isPersonal ? 'Личное пространство' : s.name);

function LocationPicker({ spaceId, parentId, onChange, disabled }: { spaceId: string; parentId: string | null; onChange(spaceId: string, parentId: string | null): void; disabled?: boolean }) {
  const spaces = useSpaces();
  const eligible = (spaces.data?.spaces ?? []).filter((s) => s.member && !s.archived && s.actions?.create !== false);
  const children = useChildren(spaceId, null, !!spaceId);
  const nodes = (children.data?.nodes ?? []).filter((n) => n.canCreate);
  return (
    <div className="imp-location">
      <div className="field">
        <label htmlFor="imp-space">Пространство</label>
        {spaces.isLoading ? (
          <div className="skeleton" style={{ height: 34 }} />
        ) : spaces.isError ? (
          <div className="row">
            <span className="field-error grow">Не удалось загрузить пространства</span>
            <button className="btn sm" onClick={() => spaces.refetch()}>
              Повторить
            </button>
          </div>
        ) : (
          <select id="imp-space" className="select" value={spaceId} disabled={disabled} onChange={(e) => onChange(e.target.value, null)}>
            {!spaceId && <option value="">Выберите пространство</option>}
            {eligible.map((s) => (
              <option key={s.id} value={s.id}>
                {s.icon ? s.icon + ' ' : ''}
                {spaceLabel(s)}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="field">
        <label htmlFor="imp-parent">Куда поместить</label>
        <select id="imp-parent" className="select" value={parentId ?? ''} disabled={disabled || !spaceId || children.isLoading} onChange={(e) => onChange(spaceId, e.target.value || null)}>
          <option value="">В корень пространства</option>
          {parentId && !nodes.some((n) => n.id === parentId) && <option value={parentId}>Внутрь выбранной страницы</option>}
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>
              Внутрь «{n.title || 'Без названия'}»
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const STAGES = ['Файлы', 'Проверка', 'Готово'];

export default function ImportPage() {
  const me = useMe();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [files, setFiles] = useState<File[]>([]);
  const [spaceId, setSpaceId] = useState(params.get('spaceId') ?? me.personalSpaceId ?? '');
  const [parentId, setParentId] = useState<string | null>(params.get('parentId'));
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [encoding, setEncoding] = useState<Encoding>('auto');
  const [delimiter, setDelimiter] = useState<Delimiter>('auto');
  const [parsedWith, setParsedWith] = useState<{ encoding: Encoding; delimiter: Delimiter }>({ encoding: 'auto', delimiter: 'auto' });
  const [sheet, setSheet] = useState(0);
  // Optional A1-style range of the sheet (R-IMPORT-031): applied by "Применить диапазон" (dry run) before import.
  const [range, setRange] = useState('');
  const [header, setHeader] = useState(true);
  const [as, setAs] = useState<'table' | 'collection'>('table');
  // Repeated import into an existing collection (R-COLLECTION-003, AT-50): append rows or update them by a key column.
  const [collTarget, setCollTarget] = useState<string>('');
  const [collMode, setCollMode] = useState<'upsert' | 'append'>('upsert');
  const [keyColumn, setKeyColumn] = useState(0);
  const [colTypes, setColTypes] = useState<ColType[] | null>(null);
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [dryRun, setDryRun] = useState<DryRun | null>(null);
  const [dryBusy, setDryBusy] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<CommitResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const keyRef = useRef<string>(uuid());
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: spacesData } = useSpaces();

  useEffect(() => {
    if (!spaceId && spacesData) {
      const s = spacesData.spaces.find((x) => x.member && x.actions?.create && !x.archived);
      if (s) setSpaceId(s.id);
    }
  }, [spacesData, spaceId]);

  const collections = useQuery({
    queryKey: ['collections', spaceId],
    enabled: !!spaceId,
    queryFn: ({ signal }) => get<{ collections: Array<{ id: string; name: string; canEdit: boolean }> }>(`/api/v1/collections?spaceId=${spaceId}`, signal),
  });
  const job = useQuery({
    queryKey: ['import-job', jobId],
    enabled: !!jobId,
    queryFn: ({ signal }) => get<ImportJob>(`/api/v1/imports/${jobId}`, signal),
    refetchInterval: (q) => {
      const st = (q.state.data as ImportJob | undefined)?.status;
      return !st || st === 'queued' || st === 'running' ? 1000 : false;
    },
    retry: 3,
  });
  const j = job.data;
  const preview = j?.preview ?? null;
  const tab = preview?.tabular ?? null;
  const sheetPrev = (range.trim() && dryRun?.preview) || (tab?.sheets[sheet] ?? null);

  // Initialise per-plan state when a new analysis arrives.
  useEffect(() => {
    if (!preview) return;
    setSelected(null);
    setDryRun(null);
    if (preview.tabular) {
      const sh = preview.tabular.sheets[Math.min(sheet, preview.tabular.sheets.length - 1)];
      setColTypes(sh ? sh.columns.map((c) => c.type) : null);
      if (!title) setTitle(preview.tabular.file.replace(/\.[^.]+$/, ''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, !!preview]);

  const resetJob = () => {
    setJobId(null);
    setCommitted(null);
    setCommitError(null);
    setDryRun(null);
    setUploadError(null);
    keyRef.current = uuid();
  };

  const addFiles = (list: FileList | File[]) => {
    const arr = [...list];
    const bad = arr.filter((f) => !EXTS.includes(ext(f.name)));
    if (bad.length) toast.error(`Формат не поддерживается: ${bad.map((f) => f.name).join(', ')}`);
    const good = arr.filter((f) => EXTS.includes(ext(f.name)));
    if (!good.length) return;
    setFiles((cur) => {
      const names = new Set(cur.map((f) => f.name + f.size));
      return [...cur, ...good.filter((f) => !names.has(f.name + f.size))];
    });
    resetJob();
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const start = async (csvOverride?: { encoding: Encoding; delimiter: Delimiter }) => {
    if (!files.length || !spaceId) return;
    if (jobId) {
      // A new attempt after an existing job (failed / re-read with other options) needs a fresh idempotency key.
      if (j && j.status !== 'succeeded' && j.status !== 'cancelled' && j.status !== 'failed') post(`/api/v1/imports/${jobId}/cancel`).catch(() => undefined);
      keyRef.current = uuid();
    }
    const csv = csvOverride ?? { encoding, delimiter };
    const form = new FormData();
    form.append('idempotencyKey', keyRef.current);
    if (csv.encoding !== 'auto' || csv.delimiter !== 'auto') form.append('csv', JSON.stringify(csv));
    for (const f of files) form.append('file', f, f.name);
    const ac = new AbortController();
    abortRef.current = ac;
    setUploadError(null);
    setCommitted(null);
    setCommitError(null);
    setUploadProgress(0);
    setJobId(null);
    try {
      const r = await upload<{ jobId: string }>('/api/v1/imports', form, (f) => setUploadProgress(f), ac.signal);
      setParsedWith(csv);
      setJobId(r.jobId);
    } catch (e) {
      if ((e as Error).name === 'AbortError') setUploadError('Загрузка отменена. Выбранные файлы сохранены — можно начать заново.');
      else setUploadError(e instanceof ApiError ? e.message : 'Не удалось загрузить файлы');
    } finally {
      setUploadProgress(null);
      abortRef.current = null;
    }
  };

  const reparse = () => start({ encoding, delimiter });

  const cancel = async () => {
    if (abortRef.current) {
      abortRef.current.abort();
      return;
    }
    if (jobId) {
      try {
        await post(`/api/v1/imports/${jobId}/cancel`);
        toast.info('Импорт отменён — ничего не создано');
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : 'Не удалось отменить');
        return;
      }
    }
    resetJob();
  };

  const tabularOpts = () => ({
    sheet,
    header,
    as,
    ...(as === 'collection' ? { keyColumn, ...(collTarget ? { collectionId: collTarget, collectionMode: collMode } : {}) } : {}),
    title: title.trim() || undefined,
    range: range.trim() || undefined,
    columnTypes: colTypes ?? undefined,
    encoding: parsedWith.encoding !== encoding ? encoding : undefined,
    delimiter: parsedWith.delimiter !== delimiter ? delimiter : undefined,
  });

  const runDryRun = async () => {
    if (!jobId) return;
    setDryBusy(true);
    try {
      setDryRun(await post<DryRun>(`/api/v1/imports/${jobId}/dry-run`, tabularOpts()));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Не удалось выполнить проверку');
    } finally {
      setDryBusy(false);
    }
  };

  const commit = async () => {
    if (!jobId || !spaceId) return;
    setCommitBusy(true);
    setCommitError(null);
    try {
      const body: Record<string, unknown> = { target: { spaceId, parentId, mode: 'new' } };
      if (preview?.kind === 'tabular') body.tabular = tabularOpts();
      else if (selected && preview) body.pageTempIds = [...selected];
      const r = await post<CommitResult>(`/api/v1/imports/${jobId}/commit`, body);
      setCommitted(r);
      qc.invalidateQueries({ queryKey: ['tree', spaceId] });
      qc.invalidateQueries({ queryKey: ['spaces'] });
    } catch (e) {
      setCommitError(e instanceof ApiError ? e.message : 'Не удалось выполнить импорт');
    } finally {
      setCommitBusy(false);
    }
  };

  const startOver = () => {
    setFiles([]);
    resetJob();
  };

  // ---------- derived view state
  const uploading = uploadProgress !== null;
  const analyzing = !!jobId && (!j || j.status === 'queued' || j.status === 'running');
  const result = committed ?? (j?.status === 'succeeded' ? j.result : null);
  const stage = result ? 2 : jobId || uploading ? 1 : 0;
  const allPages = preview?.pages ?? [];
  const isSelected = (id: string) => !selected || selected.has(id);
  const toggle = (id: string) => {
    const next = new Set(selected ?? allPages.map((p) => p.tempId));
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next.size === allPages.length ? null : next);
  };
  const selectedCount = selected ? selected.size : allPages.length;
  const hasTabularFile = files.some((f) => isTabularName(f.name));
  const csvParamsChanged = parsedWith.encoding !== encoding || parsedWith.delimiter !== delimiter;
  const types = colTypes ?? sheetPrev?.columns.map((c) => c.type) ?? [];
  const previewHeader = sheetPrev ? (header ? sheetPrev.columns.map((c) => c.name) : sheetPrev.columns.map((_, i) => `Столбец ${i + 1}`)) : [];
  const previewRows = sheetPrev ? (header ? sheetPrev.rows : [sheetPrev.columns.map((c) => c.name), ...sheetPrev.rows]).slice(0, 100) : [];
  const reportCounts = useMemo(() => {
    const fs = preview?.files ?? [];
    return { ok: fs.filter((f) => f.status === 'ok').length, warn: fs.filter((f) => f.status === 'warning').length, err: fs.filter((f) => f.status === 'error').length + (j?.rejected.length ?? 0) };
  }, [preview, j]);

  return (
    <div className="page-container narrow imp-page">
      <h1 className="page-heading">Импорт</h1>
      <p className="page-sub">DOCX, Markdown (в том числе ZIP с изображениями), HTML, CSV и XLSX. До подтверждения ничего не публикуется.</p>

      <ol className="imp-steps" aria-label="Шаги импорта">
        {STAGES.map((s, i) => (
          <li key={s} className={i === stage ? 'current' : i < stage ? 'done' : ''} aria-current={i === stage ? 'step' : undefined}>
            <span className="imp-step-num">{i < stage ? '✓' : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      {/* ------------------------------------------------ step 1: files + destination */}
      {stage === 0 && (
        <div className="col" style={{ gap: 16 }}>
          <div
            className={'imp-drop' + (dragOver ? ' over' : '')}
            role="button"
            tabIndex={0}
            aria-describedby="imp-drop-hint"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <Upload size={28} aria-hidden />
            <b>Перетащите файлы сюда или нажмите, чтобы выбрать</b>
            <span className="small muted" id="imp-drop-hint">DOCX · MD · ZIP с Markdown · HTML · CSV · XLSX</span>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {files.length > 0 && (
            <ul className="imp-files" aria-label="Выбранные файлы">
              {files.map((f, i) => (
                <li key={f.name + f.size} className="imp-file">
                  <FileIcon name={f.name} />
                  <span className="ellipsis grow">{f.name}</span>
                  <span className="small muted">{fileSize(f.size)}</span>
                  <button
                    className="icon-btn sm"
                    aria-label={`Убрать ${f.name}`}
                    onClick={() => {
                      setFiles((cur) => cur.filter((_, k) => k !== i));
                      resetJob();
                    }}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {hasTabularFile && (
            <details className="imp-advanced">
              <summary>Параметры чтения CSV</summary>
              <div className="imp-opts">
                <div className="field">
                  <label htmlFor="imp-enc">Кодировка</label>
                  <select id="imp-enc" className="select" value={encoding} onChange={(e) => setEncoding(e.target.value as Encoding)}>
                    <option value="auto">Определить автоматически</option>
                    <option value="utf-8">UTF-8</option>
                    <option value="windows-1251">Windows-1251</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="imp-delim">Разделитель</label>
                  <select id="imp-delim" className="select" value={delimiter} onChange={(e) => setDelimiter(e.target.value as Delimiter)}>
                    <option value="auto">Определить автоматически</option>
                    <option value=",">Запятая ( , )</option>
                    <option value=";">Точка с запятой ( ; )</option>
                    <option value={'\t'}>Табуляция</option>
                  </select>
                </div>
              </div>
            </details>
          )}

          <div className="card col" style={{ gap: 12 }}>
            <b>Куда импортировать</b>
            <LocationPicker
              spaceId={spaceId}
              parentId={parentId}
              onChange={(s, p) => {
                setSpaceId(s);
                setParentId(p);
              }}
            />
          </div>

          {uploadError && (
            <div className="alert error" role="alert">
              <AlertTriangle size={16} className="alert-icon" />
              <div className="grow">{uploadError}</div>
            </div>
          )}

          <div className="row imp-footer">
            <span className="grow small muted">{files.length ? `Файлов: ${files.length}, ${fileSize(files.reduce((n, f) => n + f.size, 0))}` : 'Файлы не выбраны'}</span>
            <button className="btn primary" disabled={!files.length || !spaceId} onClick={() => start()}>
              <Upload size={16} /> {uploadError ? 'Повторить загрузку' : 'Загрузить и проверить'}
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ step 2: upload / analysis / review */}
      {stage === 1 && (
        <div className="col" style={{ gap: 16 }}>
          {uploading && (
            <div className="card col" aria-live="polite">
              <div className="row">
                <span className="grow">Загрузка файлов… {Math.round((uploadProgress ?? 0) * 100)}%</span>
                <button className="btn sm" onClick={cancel}>
                  Отменить
                </button>
              </div>
              <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((uploadProgress ?? 0) * 100)} aria-label="Загрузка">
                <div style={{ width: `${(uploadProgress ?? 0) * 100}%` }} />
              </div>
            </div>
          )}

          {!uploading && analyzing && !job.isError && (
            <div className="card col" aria-live="polite">
              <div className="row">
                <span className="spinner" />
                <span className="grow">{j?.status === 'running' ? 'Анализ файлов: преобразование и проверка содержимого…' : 'Задание в очереди…'}</span>
                <button className="btn sm" onClick={cancel}>
                  Отменить
                </button>
              </div>
              <div className="progress imp-indeterminate">
                <div />
              </div>
            </div>
          )}

          {job.isError && (
            <div className="alert error" role="alert">
              <AlertTriangle size={16} className="alert-icon" />
              <div className="grow">{job.error instanceof ApiError ? job.error.message : 'Не удалось получить статус импорта'}</div>
              <button className="btn sm" onClick={() => job.refetch()}>
                <RefreshCw size={14} /> Повторить
              </button>
            </div>
          )}

          {(j?.status === 'failed' || j?.status === 'cancelled') && (
            <div className="alert error" role="alert">
              <AlertTriangle size={16} className="alert-icon" />
              <div className="grow">{j.status === 'cancelled' ? 'Импорт отменён.' : `Анализ завершился ошибкой: ${j.error ?? 'неизвестная ошибка'}`}</div>
              <button className="btn sm" onClick={() => start()}>
                <RefreshCw size={14} /> Повторить
              </button>
              <button className="btn sm" onClick={resetJob}>
                Изменить выбор
              </button>
            </div>
          )}

          {j && preview && (j.status === 'awaiting_confirmation' || (j.status === 'succeeded' && !j.result)) && (
            <>
              <section className="card col" aria-label="Отчёт по файлам" style={{ gap: 10 }}>
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <b className="grow">Отчёт по файлам</b>
                  {reportCounts.ok > 0 && <span className="badge green">Готово: {reportCounts.ok}</span>}
                  {reportCounts.warn > 0 && <span className="badge amber">С предупреждениями: {reportCounts.warn}</span>}
                  {reportCounts.err > 0 && <span className="badge red">Ошибки: {reportCounts.err}</span>}
                </div>
                <ul className="imp-report">
                  {preview.files.map((f) => (
                    <li key={f.file}>
                      <details open={f.status !== 'ok' && f.warnings.length <= 5}>
                        <summary className="imp-report-row">
                          {f.status === 'ok' ? <CheckCircle2 size={16} className="ok" /> : f.status === 'warning' ? <AlertTriangle size={16} className="warn" /> : <XCircle size={16} className="err" />}
                          <span className="ellipsis grow">{f.file}</span>
                          <span className="small muted">{f.status === 'error' ? 'ошибка' : `страниц: ${f.pages}`}</span>
                        </summary>
                        {(f.error || f.warnings.length > 0) && (
                          <ul className="imp-warnings small">
                            {f.error && <li className="err">{f.error}</li>}
                            {f.warnings.map((w, i) => (
                              <li key={i}>
                                {w.message}
                                <span className="muted"> ({w.code})</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </details>
                    </li>
                  ))}
                  {j.rejected.map((r) => (
                    <li key={r.filename} className="imp-report-row">
                      <XCircle size={16} className="err" />
                      <span className="ellipsis grow">{r.filename}</span>
                      <span className="small err">{r.error ?? 'отклонён'}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {j.status === 'succeeded' && !j.result ? (
                <div className="alert error" role="alert">
                  <AlertTriangle size={16} className="alert-icon" />
                  <div className="grow">Ни один файл не удалось преобразовать. Исправьте файлы и повторите.</div>
                  <button className="btn sm" onClick={resetJob}>
                    <ArrowLeft size={14} /> Изменить выбор
                  </button>
                </div>
              ) : preview.kind === 'documents' ? (
                <section className="card col" aria-label="Будут созданы страницы" style={{ gap: 10 }}>
                  <div className="row">
                    <b className="grow">
                      Будут созданы страницы: {selectedCount} из {allPages.length}
                    </b>
                    {preview.assets > 0 && <span className="small muted">вложений: {preview.assets}</span>}
                  </div>
                  <ul className="imp-pages">
                    {allPages.map((p) => {
                      const depth = (() => {
                        let d = 0;
                        let cur = p.parentTempId;
                        while (cur && d < 6) {
                          d++;
                          cur = allPages.find((x) => x.tempId === cur)?.parentTempId ?? null;
                        }
                        return d;
                      })();
                      return (
                        <li key={p.tempId} style={{ paddingLeft: depth * 18 }}>
                          <label className="checkbox imp-page-row">
                            <input type="checkbox" checked={isSelected(p.tempId)} onChange={() => toggle(p.tempId)} />
                            <span className="ellipsis grow">{p.title || 'Без названия'}</span>
                            <span className="small muted imp-page-stats">
                              {p.stats.blocks} бл.{p.stats.tables ? ` · ${p.stats.tables} табл.` : ''}
                              {p.stats.images ? ` · ${p.stats.images} изобр.` : ''}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : (
                tab &&
                sheetPrev && (
                  <section className="card col" aria-label="Табличные данные" style={{ gap: 12 }}>
                    <b>
                      {tab.file} · строк: {sheetPrev.totalRows}
                    </b>
                    <div className="imp-opts">
                      {tab.sheets.length > 1 && (
                        <div className="field">
                          <label htmlFor="imp-sheet">Лист</label>
                          <select
                            id="imp-sheet"
                            className="select"
                            value={sheet}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              setSheet(n);
                              setColTypes(tab.sheets[n]?.columns.map((c) => c.type) ?? null);
                              setDryRun(null);
                            }}
                          >
                            {tab.sheets.map((s, i) => (
                              <option key={i} value={i}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="field">
                        <label htmlFor="imp-range">Диапазон</label>
                        <input
                          id="imp-range"
                          className="input"
                          placeholder="весь лист, или например B2:E40"
                          value={range}
                          aria-describedby="imp-range-hint"
                          onChange={(e) => {
                            setRange(e.target.value.toUpperCase());
                            setColTypes(null);
                            setDryRun(null);
                          }}
                        />
                        <span className="small muted" id="imp-range-hint">
                          {range.trim() && !dryRun ? 'Нажмите «Пробный прогон», чтобы применить диапазон' : 'Необязательно'}
                        </span>
                      </div>
                      {!tab.file.toLowerCase().endsWith('.xlsx') && (
                        <>
                          <div className="field">
                            <label htmlFor="imp-enc2">Кодировка</label>
                            <select id="imp-enc2" className="select" value={encoding} onChange={(e) => (setEncoding(e.target.value as Encoding), setDryRun(null))}>
                              <option value="auto">Авто{tab.encoding ? ` (${tab.encoding})` : ''}</option>
                              <option value="utf-8">UTF-8</option>
                              <option value="windows-1251">Windows-1251</option>
                            </select>
                          </div>
                          <div className="field">
                            <label htmlFor="imp-delim2">Разделитель</label>
                            <select id="imp-delim2" className="select" value={delimiter} onChange={(e) => (setDelimiter(e.target.value as Delimiter), setDryRun(null))}>
                              <option value="auto">Авто{tab.delimiter ? ` («${tab.delimiter === '\t' ? 'Tab' : tab.delimiter}»)` : ''}</option>
                              <option value=",">Запятая</option>
                              <option value=";">Точка с запятой</option>
                              <option value={'\t'}>Табуляция</option>
                            </select>
                          </div>
                        </>
                      )}
                      <div className="field">
                        <label htmlFor="imp-as">Создать</label>
                        <select id="imp-as" className="select" value={as} onChange={(e) => (setAs(e.target.value as 'table' | 'collection'), setDryRun(null))}>
                          <option value="table">Страницу с таблицей</option>
                          <option value="collection">Коллекцию (база данных)</option>
                        </select>
                      </div>
                      {as === 'collection' && (
                        <>
                          <div className="field">
                            <label htmlFor="imp-coll">Куда</label>
                            <select id="imp-coll" className="select" value={collTarget} onChange={(e) => (setCollTarget(e.target.value), setDryRun(null))}>
                              <option value="">Новая коллекция</option>
                              {(collections.data?.collections ?? [])
                                .filter((c) => c.canEdit)
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    В существующую: {c.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                          {collTarget && (
                            <div className="field">
                              <label htmlFor="imp-coll-mode">Режим</label>
                              <select id="imp-coll-mode" className="select" value={collMode} onChange={(e) => (setCollMode(e.target.value as 'upsert' | 'append'), setDryRun(null))}>
                                <option value="upsert">Обновить по ключу, новые добавить</option>
                                <option value="append">Только добавить строки</option>
                              </select>
                            </div>
                          )}
                          <div className="field">
                            <label htmlFor="imp-key">Ключевой столбец (название записи)</label>
                            <select id="imp-key" className="select" value={keyColumn} onChange={(e) => (setKeyColumn(Number(e.target.value)), setDryRun(null))}>
                              {previewHeader.map((h, i) => (
                                <option key={i} value={i}>
                                  {h || `Столбец ${i + 1}`}
                                </option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}
                      <div className="field">
                        <label htmlFor="imp-title">Название</label>
                        <input id="imp-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
                      </div>
                    </div>
                    <label className="checkbox">
                      <input type="checkbox" checked={header} onChange={(e) => (setHeader(e.target.checked), setDryRun(null))} />
                      Первая строка — заголовки столбцов
                    </label>
                    {csvParamsChanged && (
                      <div className="alert warning">
                        <Info size={16} className="alert-icon" />
                        <div className="grow">Параметры чтения изменены. Перечитайте файл, чтобы обновить предпросмотр.</div>
                        <button className="btn sm" onClick={reparse}>
                          Перечитать
                        </button>
                      </div>
                    )}
                    <div className="table-wrap imp-table">
                      <table className="table">
                        <thead>
                          <tr>
                            {previewHeader.map((h, i) => (
                              <th key={i}>
                                <div className="col" style={{ gap: 4 }}>
                                  <span className="ellipsis">{h}</span>
                                  <select
                                    className="select imp-type"
                                    aria-label={`Тип столбца ${h}`}
                                    value={types[i] ?? 'text'}
                                    onChange={(e) => {
                                      const next = [...types];
                                      next[i] = e.target.value as ColType;
                                      setColTypes(next);
                                      setDryRun(null);
                                    }}
                                  >
                                    {COL_TYPES.map(([v, l]) => (
                                      <option key={v} value={v}>
                                        {l}
                                      </option>
                                    ))}
                                  </select>
                                  {sheetPrev.columns[i]?.invalid > 0 && types[i] === sheetPrev.columns[i].type && <span className="badge amber">{sheetPrev.columns[i].invalid} не распознано</span>}
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((r, ri) => (
                            <tr key={ri}>
                              {previewHeader.map((_, ci) => (
                                <td key={ci} className="ellipsis">
                                  {r[ci] ?? ''}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {sheetPrev.totalRows > previewRows.length && <span className="small muted">Показаны первые {previewRows.length} строк из {sheetPrev.totalRows}.</span>}

                    <div className="row" style={{ flexWrap: 'wrap' }}>
                      <button className="btn" onClick={runDryRun} disabled={dryBusy} aria-busy={dryBusy}>
                        {dryBusy && <span className="spinner" />} Пробный прогон
                      </button>
                      <span className="small muted">{as === 'collection' && collTarget ? 'Обязательна перед импортом в существующую коллекцию: покажет, сколько записей добавится и обновится' : 'Проверка типов без создания данных'}</span>
                    </div>
                    {dryRun && (
                      <div className={'alert ' + (dryRun.invalidCount ? 'warning' : 'success')} aria-live="polite">
                        <div className="col grow" style={{ gap: 4 }}>
                          <span>
                            Строк: {dryRun.rows}. Будет добавлено: {dryRun.inserts}
                            {dryRun.updates ? `, обновлено: ${dryRun.updates}` : ''}
                            {dryRun.duplicatesInFile ? `, дубликатов в файле: ${dryRun.duplicatesInFile}` : ''}.
                          </span>
                          {dryRun.invalidCount > 0 ? (
                            <>
                              <span>Значений, не соответствующих типу: {dryRun.invalidCount} — они будут сохранены как текст.</span>
                              <details>
                                <summary className="small">Подробнее</summary>
                                <ul className="imp-warnings small">
                                  {dryRun.invalid.slice(0, 50).map((x, i) => (
                                    <li key={i}>
                                      Строка {x.row}, «{x.column}»: {x.value}
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            </>
                          ) : (
                            <span>Все значения соответствуют выбранным типам.</span>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                )
              )}

              {j.status === 'awaiting_confirmation' && (
                <>
                  <div className="card col" style={{ gap: 12 }}>
                    <b>Куда импортировать</b>
                    <LocationPicker
                      spaceId={spaceId}
                      parentId={parentId}
                      disabled={commitBusy}
                      onChange={(s, p) => {
                        setSpaceId(s);
                        setParentId(p);
                      }}
                    />
                  </div>
                  {commitError && (
                    <div className="alert error" role="alert">
                      <AlertTriangle size={16} className="alert-icon" />
                      <div className="grow">{commitError} Выбранные параметры сохранены — можно повторить.</div>
                    </div>
                  )}
                  <div className="row imp-footer">
                    <button className="btn" onClick={cancel} disabled={commitBusy}>
                      Отменить импорт
                    </button>
                    <span className="grow" />
                    <button className="btn primary" onClick={commit} disabled={commitBusy || !spaceId || (preview.kind === 'documents' && selectedCount === 0) || (preview.kind === 'tabular' && csvParamsChanged) || (preview.kind === 'tabular' && !!range.trim() && !dryRun) || (preview.kind === 'tabular' && as === 'collection' && !!collTarget && !dryRun)} aria-busy={commitBusy}>
                      {commitBusy && <span className="spinner" />} {commitError ? 'Повторить импорт' : 'Импортировать'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ------------------------------------------------ step 3: result */}
      {stage === 2 && result && (
        <div className="col" style={{ gap: 16 }}>
          <div className="alert success" role="status">
            <CheckCircle2 size={16} className="alert-icon" />
            <div className="grow">
              Импорт завершён{result.repeated ? ' (ранее)' : ''}. Создано страниц: {result.pages.length}
              {result.inserted !== undefined ? `, строк: ${result.inserted}` : ''}
              {result.updated ? `, обновлено: ${result.updated}` : ''}.
            </div>
          </div>
          <ul className="imp-files">
            {result.pages.slice(0, 100).map((p) => (
              <li key={p.id} className="imp-file">
                <FileText size={16} />
                <Link to={`/p/${p.id}`} className="ellipsis grow">
                  {p.title || 'Без названия'}
                </Link>
              </li>
            ))}
          </ul>
          {result.pages.length > 100 && <span className="small muted">…и ещё {result.pages.length - 100}</span>}
          <div className="row imp-footer" style={{ flexWrap: 'wrap' }}>
            <button className="btn" onClick={startOver}>
              Импортировать ещё
            </button>
            <span className="grow" />
            {spaceId && (
              <Link className="btn" to={`/s/${spaceId}`}>
                К пространству
              </Link>
            )}
            {result.rootPageId && (
              <Link className="btn primary" to={`/p/${result.rootPageId}`}>
                Открыть
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
