import '../../styles/panels.css';
import { useEffect, useRef, useState } from 'react';
import { Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api, get, post, uuid } from '../../api/client';
import type { PageDto } from '../../api/types';
import { Dialog } from '../ui/Dialog';
import { toast } from '../ui/Toast';
import { fileSize } from '../../lib/format';
import { errMsg } from './directory';

type FormatId = 'md' | 'mdzip' | 'docx' | 'pdf' | 'html';
const FORMATS: Array<{ id: FormatId; server: 'md' | 'docx' | 'pdf' | 'html'; label: string; hint: string }> = [
  { id: 'md', server: 'md', label: 'Markdown', hint: 'Текст .md — для Git, вики, редакторов' },
  { id: 'mdzip', server: 'md', label: 'Markdown + файлы', hint: 'ZIP: страницы, вложения, отчёт и контрольные суммы' },
  { id: 'docx', server: 'docx', label: 'Word (DOCX)', hint: 'Для правки в Word / LibreOffice' },
  { id: 'pdf', server: 'pdf', label: 'PDF', hint: 'Для печати и отправки' },
  { id: 'html', server: 'html', label: 'HTML', hint: 'Одна веб-страница' },
];

interface Warning {
  code?: string;
  message: string;
}
type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; jobId?: string; stage?: string }
  | { kind: 'done'; warnings: Warning[]; filename?: string; size?: number; jobId?: string; sha256?: string }
  | { kind: 'error'; message: string }
  | { kind: 'cancelled' };

function filenameFrom(res: Response, fallback: string) {
  const cd = res.headers.get('content-disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      /* ignore */
    }
  }
  return fallback;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function ExportDialog({ page, onClose }: { page: PageDto; onClose(): void }) {
  const allowed = !!page.access.actions.export;
  const canDownload = page.access.actions.download !== false;
  const [format, setFormat] = useState<FormatId>('md');
  const [children, setChildren] = useState(false);
  const [layout, setLayout] = useState<'merged' | 'files'>('merged');
  const [cancelling, setCancelling] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const fmt = FORMATS.find((f) => f.id === format)!;
  // Branches and archives are built in the background; a single page downloads right away.
  const background = children || format === 'mdzip';

  const runDirect = async () => {
    setPhase({ kind: 'running' });
    try {
      const res = await api<Response>('GET', `/api/v1/pages/${page.id}/export?format=${fmt.server}`, undefined, { raw: true });
      let warnings: Warning[] = [];
      const wh = res.headers.get('x-export-warnings');
      if (wh) {
        try {
          warnings = JSON.parse(decodeURIComponent(wh));
        } catch {
          /* ignore */
        }
      }
      const blob = await res.blob();
      const name = filenameFrom(res, `${page.title || 'export'}.${fmt.server}`);
      saveBlob(blob, name);
      if (!alive.current) return;
      setPhase({ kind: 'done', warnings, filename: name, size: blob.size, sha256: res.headers.get('x-content-sha256') ?? undefined });
      if (!warnings.length) toast.success('Экспорт готов: ' + name);
    } catch (e) {
      if (alive.current) setPhase({ kind: 'error', message: errMsg(e, 'Не удалось выполнить экспорт') });
    }
  };

  const runBackground = async () => {
    setPhase({ kind: 'running' });
    try {
      const { jobId } = await post<{ jobId: string }>('/api/v1/exports', { pageIds: [page.id], format: fmt.server, includeChildren: children, layout: children && fmt.server !== 'md' ? layout : 'merged', idempotencyKey: uuid() });
      setPhase({ kind: 'running', jobId });
      for (let i = 0; alive.current; i++) {
        await new Promise((r) => setTimeout(r, Math.min(4000, 800 + i * 300)));
        if (!alive.current) return;
        const j = await get<{ status: string; progress: any; error: string | null; report: { warnings?: Warning[] } | null; file: { filename: string; size: number; sha256?: string } | null }>(`/api/v1/exports/${jobId}`);
        if (j.status === 'succeeded' || j.status === 'partial') {
          setPhase({ kind: 'done', warnings: j.report?.warnings ?? [], filename: j.file?.filename, size: j.file?.size, jobId, sha256: j.file?.sha256 });
          download(jobId);
          return;
        }
        if (j.status === 'cancelled') {
          setPhase({ kind: 'cancelled' });
          return;
        }
        if (j.status === 'failed') {
          setPhase({ kind: 'error', message: j.error ?? 'Экспорт не выполнен' });
          return;
        }
        setPhase({ kind: 'running', jobId, stage: j.progress?.stage });
      }
    } catch (e) {
      if (alive.current) setPhase({ kind: 'error', message: errMsg(e, 'Не удалось запустить экспорт') });
    }
  };

  const download = (jobId: string) => {
    const a = document.createElement('a');
    a.href = `/api/v1/exports/${jobId}/download`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const running = phase.kind === 'running';

  /** Stops a background export on the server (R-EXPORT-022); the file is not produced or stored. */
  const cancelJob = async (jobId: string) => {
    setCancelling(true);
    try {
      const r = await post<{ status: string }>(`/api/v1/exports/${jobId}/cancel`);
      if (alive.current && r.status === 'cancelled') setPhase({ kind: 'cancelled' });
    } catch (e) {
      toast.error(errMsg(e, 'Не удалось отменить экспорт'));
    } finally {
      if (alive.current) setCancelling(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Экспорт"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {phase.kind === 'done' ? 'Закрыть' : 'Отмена'}
          </button>
          {phase.kind === 'done' && phase.jobId ? (
            <button className="btn primary" onClick={() => download(phase.jobId!)}>
              <Download size={14} /> Скачать снова
            </button>
          ) : (
            <button className="btn primary" disabled={!allowed || running} aria-busy={running} onClick={() => (background ? runBackground() : runDirect())}>
              {running ? <span className="spinner" /> : <Download size={14} />} Экспортировать
            </button>
          )}
        </>
      }
    >
      {!allowed ? (
        <div className="alert warning">
          <AlertTriangle size={16} className="alert-icon" />
          <div>
            Экспорт этой страницы недоступен.{' '}
            {page.access.policy && !page.access.policy.allowExport
              ? `Политика пространства «${page.space.name}» запрещает экспорт.`
              : 'Ваш уровень доступа или ограничения, установленные владельцем, не позволяют экспортировать. Обратитесь к владельцу страницы.'}
          </div>
        </div>
      ) : (
        <div className="col" style={{ gap: 14 }}>
          <div>
            <div className="field-label" id="exp-format-label" style={{ marginBottom: 6 }}>
              Формат
            </div>
            <div className="exp-options" role="radiogroup" aria-labelledby="exp-format-label">
              {FORMATS.map((f) => (
                <button key={f.id} type="button" role="radio" aria-checked={format === f.id} className="exp-option" disabled={running} onClick={() => setFormat(f.id)}>
                  <b>{f.label}</b>
                  <span>{f.hint}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="col" style={{ gap: 6 }} role="radiogroup" aria-label="Что экспортировать">
            <div className="field-label">Что экспортировать</div>
            <label className="checkbox">
              <input type="radio" name="exp-scope" checked={!children} disabled={running} onChange={() => setChildren(false)} /> Только эту страницу
            </label>
            <label className="checkbox">
              <input type="radio" name="exp-scope" checked={children} disabled={running} onChange={() => setChildren(true)} /> Страницу со всеми подстраницами
            </label>
            {children && <span className="field-hint">Подстраницы, к которым у вас нет доступа или право экспорта, будут пропущены — это отразится в отчёте.</span>}
          </div>
          {children && fmt.server !== 'md' && (
            <div className="col" style={{ gap: 6 }} role="radiogroup" aria-label="Как упаковать подстраницы">
              <div className="field-label">Как упаковать</div>
              <label className="checkbox">
                <input type="radio" name="exp-layout" checked={layout === 'merged'} disabled={running} onChange={() => setLayout('merged')} /> Одним документом{fmt.server === 'docx' ? ' с оглавлением' : ''}
              </label>
              <label className="checkbox">
                <input type="radio" name="exp-layout" checked={layout === 'files'} disabled={running} onChange={() => setLayout('files')} /> Отдельными файлами (ZIP с отчётом и контрольными суммами)
              </label>
            </div>
          )}
          {(format === 'md' || format === 'mdzip') && (
            <div className="field-hint">
              {format === 'md' ? 'Если на странице есть вложения или выбраны подстраницы, файл будет упакован в ZIP вместе с ними.' : 'Архив содержит Markdown-файлы, вложения, отчёт об экспорте и контрольные суммы. Страница без вложений и подстраниц выгружается одним .md-файлом.'}
            </div>
          )}
          {!canDownload && <div className="alert warning">Скачивание файлов запрещено — вложения в экспорт не попадут.</div>}

          {phase.kind === 'running' && (
            <div className="alert" aria-live="polite">
              <span className="spinner alert-icon" />
              <div style={{ minWidth: 0 }}>
                {phase.jobId ? `Готовим файл в фоне${phase.stage === 'render' ? ' — формируем документ' : ''}… Окно можно не закрывать: файл скачается автоматически.` : 'Готовим файл…'}
                {phase.jobId && (
                  <div style={{ marginTop: 6 }}>
                    <button className="btn sm" disabled={cancelling} aria-busy={cancelling} onClick={() => cancelJob(phase.jobId!)}>
                      Отменить экспорт
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {phase.kind === 'cancelled' && (
            <div className="alert" role="status">
              <div>Экспорт отменён. Файл не создан.</div>
            </div>
          )}
          {phase.kind === 'error' && (
            <div className="alert error" role="alert">
              <AlertTriangle size={16} className="alert-icon" />
              <div>
                {phase.message}
                {!background && (
                  <div style={{ marginTop: 6 }}>
                    <button className="btn sm" onClick={runBackground}>
                      Попробовать в фоне
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {phase.kind === 'done' && (
            <div className={'alert ' + (phase.warnings.length ? 'warning' : 'success')} aria-live="polite">
              {phase.warnings.length ? <AlertTriangle size={16} className="alert-icon" /> : <CheckCircle2 size={16} className="alert-icon" />}
              <div style={{ minWidth: 0 }}>
                <div>
                  Файл готов{phase.filename ? `: ${phase.filename}` : ''}
                  {phase.size ? ` (${fileSize(phase.size)})` : ''}.
                </div>
                {phase.sha256 && (
                  <div className="field-hint" style={{ overflowWrap: 'anywhere' }} title="Контрольная сумма файла для проверки целостности">
                    SHA-256: {phase.sha256}
                  </div>
                )}
                {phase.warnings.length > 0 && (
                  <>
                    <div style={{ marginTop: 4 }}>При экспорте часть содержимого упрощена или пропущена:</div>
                    <ul className="exp-warnings">
                      {phase.warnings.map((w, i) => (
                        <li key={i}>{w.message}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
