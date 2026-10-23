import { useEffect, useMemo, useState } from 'react';
import { Copy, RefreshCw, RotateCcw } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { get, patch, post } from '../api/client';
import { toast } from './ui/Toast';
import { fullTime } from '../lib/format';

interface OcrWord {
  text: string;
  confidence: number;
}
interface Ocr {
  status: 'pending' | 'processing' | 'done' | 'partial' | 'error' | 'failed' | 'none';
  text: string | null;
  correctedText?: string | null;
  correctedBy?: string | null;
  correctedAt?: string | null;
  confidence?: number | null;
  words?: OcrWord[] | null;
  error?: string | null;
  canEdit?: boolean;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  imageVersion?: number;
  stale?: boolean;
  languages?: string;
  engine?: string;
  originalUrl?: string;
  history?: Array<{ id: string; status: string; confidence: number | null; version: number; createdAt: string; correctedAt: string | null; correctedBy: string | null }>;
}

const LOW = 60;

/**
 * Text recognised in an image (SC-22): the original image next to the machine result, its confidence (overall and per
 * word: uncertain words are highlighted), the user's corrections with author and time, and where the text came from
 * (engine, languages, image version, earlier attempts). A failed recognition never touches the image itself.
 */
export function OcrDialog({ attachmentId, onClose }: { attachmentId: string; onClose(): void }) {
  const [ocr, setOcr] = useState<Ocr | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'corrected' | 'machine'>('corrected');
  const load = () =>
    get<any>(`/api/v1/attachments/${attachmentId}/ocr`)
      .then((r) => {
        const o: Ocr = r.ocr ?? { status: 'none', text: null };
        setOcr(o);
        setText(o.correctedText ?? o.text ?? '');
      })
      .catch((e) => setOcr({ status: 'failed', text: null, error: e.message }));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentId]);
  useEffect(() => {
    if (ocr && (ocr.status === 'pending' || ocr.status === 'processing')) {
      const t = setTimeout(load, 2000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocr]);
  const dirty = !!ocr && text !== (ocr.correctedText ?? ocr.text ?? '');
  const save = async (value: string | null) => {
    setBusy(true);
    try {
      await patch(`/api/v1/attachments/${attachmentId}/ocr`, { correctedText: value });
      toast.success(value === null ? 'Исправления сброшены: в поиске снова распознанный текст' : 'Исправленный текст сохранён и учитывается в поиске');
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const rerun = async () => {
    try {
      await post(`/api/v1/attachments/${attachmentId}/ocr`);
      setOcr({ status: 'pending', text: null });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const ready = ocr?.status === 'done' || ocr?.status === 'partial';
  const lowWords = useMemo(() => (ocr?.words ?? []).filter((w) => w.confidence < LOW).length, [ocr]);
  const conf = ocr?.confidence != null ? Math.round(ocr.confidence) : null;
  return (
    <Dialog
      open
      onClose={onClose}
      dirty={dirty && !busy ? 'Исправления текста не сохранены. Закрыть без сохранения?' : false}
      title="Текст на изображении"
      size="xwide"
      footer={
        <>
          <button className="btn ghost" onClick={rerun} disabled={busy}>
            <RefreshCw size={14} /> Распознать заново
          </button>
          {ready && ocr?.correctedText != null && ocr.canEdit !== false && (
            <button className="btn ghost" onClick={() => void save(null)} disabled={busy}>
              <RotateCcw size={14} /> Вернуть распознанный текст
            </button>
          )}
          <span className="grow" />
          <button className="btn" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success('Скопировано'))} disabled={!text}>
            <Copy size={14} /> Копировать
          </button>
          {ocr?.canEdit !== false && (
            <button className="btn primary" onClick={() => void save(text)} disabled={busy || !ready || !dirty}>
              Сохранить исправления
            </button>
          )}
        </>
      }
    >
      <div className="ocr-layout" data-testid="ocr-dialog">
        <figure className="ocr-original">
          <img src={ocr?.originalUrl ?? `/api/v1/attachments/${attachmentId}/content?variant=original`} alt="Исходное изображение" />
          <figcaption className="kb-meta">Оригинал{ocr?.version ? `, версия файла ${ocr.version}` : ''} — изображение не изменяется при распознавании</figcaption>
        </figure>
        <div className="col" style={{ gap: 8, minWidth: 0 }}>
          {!ocr || ocr.status === 'pending' || ocr.status === 'processing' ? (
            <div className="row muted">
              <span className="spinner" /> Распознавание текста… Это может занять до минуты. Окно можно закрыть — работа продолжится.
            </div>
          ) : ocr.status === 'failed' || ocr.status === 'error' || ocr.status === 'none' ? (
            <div className="alert warning" role="status">
              {ocr.status === 'none' ? 'Текст на изображении ещё не распознавался.' : `Распознать текст не удалось: ${ocr.error ?? 'неизвестная ошибка'}.`} Изображение сохранено без изменений. Можно повторить распознавание.
            </div>
          ) : (
            <>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }} data-testid="ocr-quality">
                <span className={'badge ' + (conf !== null && conf < 70 ? 'amber' : 'green')}>Уверенность {conf ?? '—'}%</span>
                {lowWords > 0 && <span className="badge amber">Сомнительных слов: {lowWords}</span>}
                {ocr.correctedText != null ? <span className="badge blue">Исправлено вручную</span> : <span className="badge">Без исправлений</span>}
              </div>
              {(ocr.status === 'partial' || (conf !== null && conf < 70)) && <div className="alert warning">Качество распознавания низкое. Сверьте текст с оригиналом и исправьте — исправления учитываются в поиске.</div>}
              {ocr.stale && <div className="alert warning">Файл заменён новой версией ({ocr.imageVersion}); этот текст распознан по версии {ocr.version}. Распознайте заново.</div>}
              <div className="tabs" role="tablist">
                <button className="tab" role="tab" aria-selected={tab === 'corrected'} onClick={() => setTab('corrected')}>
                  Текст для поиска
                </button>
                <button className="tab" role="tab" aria-selected={tab === 'machine'} onClick={() => setTab('machine')}>
                  Распознано автоматически
                </button>
              </div>
              {tab === 'corrected' ? (
                <textarea className="textarea" style={{ minHeight: 240, fontFamily: 'var(--font-mono)', fontSize: 13 }} value={text} readOnly={ocr.canEdit === false} onChange={(e) => setText(e.target.value)} aria-label="Распознанный текст" />
              ) : (
                <div className="ocr-machine" aria-label="Распознано автоматически" data-testid="ocr-machine">
                  {ocr.words?.length
                    ? ocr.words.map((w, i) => (
                        <span key={i} className={w.confidence < LOW ? 'ocr-low' : undefined} title={`Уверенность ${Math.round(w.confidence)}%`}>
                          {w.text}{' '}
                        </span>
                      ))
                    : ocr.text}
                </div>
              )}
            </>
          )}
          {ocr && ocr.status !== 'none' && (
            <dl className="kb-kv ocr-provenance" data-testid="ocr-provenance" aria-label="Происхождение текста">
              <dt>Источник</dt>
              <dd>
                {ocr.engine ?? 'OCR'}
                {ocr.languages ? `, языки ${ocr.languages.replace('+', ', ')}` : ''}
              </dd>
              {ocr.createdAt && (
                <>
                  <dt>Распознано</dt>
                  <dd>{fullTime(ocr.createdAt)}</dd>
                </>
              )}
              <dt>Исправления</dt>
              <dd>{ocr.correctedText != null ? `${ocr.correctedBy ?? 'пользователь'}${ocr.correctedAt ? ', ' + fullTime(ocr.correctedAt) : ''}` : 'нет'}</dd>
              {(ocr.history?.length ?? 0) > 1 && (
                <>
                  <dt>Попытки</dt>
                  <dd>
                    {ocr.history!.length}: {ocr.history!.map((h) => `${fullTime(h.createdAt)} — ${h.status === 'done' || h.status === 'partial' ? `${Math.round(h.confidence ?? 0)}%` : h.status === 'error' ? 'ошибка' : 'в работе'}`).join('; ')}
                  </dd>
                </>
              )}
            </dl>
          )}
        </div>
      </div>
    </Dialog>
  );
}
