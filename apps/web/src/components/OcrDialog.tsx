import { useEffect, useState } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { get, patch, post } from '../api/client';
import { toast } from './ui/Toast';

interface Ocr {
  status: 'pending' | 'processing' | 'done' | 'partial' | 'error' | 'failed' | 'none';
  text: string | null;
  correctedText?: string | null;
  confidence?: number | null;
  error?: string | null;
  canEdit?: boolean;
}

/** Shows text recognised in an image (OCR), lets editors correct it (used for search) or re-run recognition. */
export function OcrDialog({ attachmentId, onClose }: { attachmentId: string; onClose(): void }) {
  const [ocr, setOcr] = useState<Ocr | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
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
  const save = async () => {
    setBusy(true);
    try {
      await patch(`/api/v1/attachments/${attachmentId}/ocr`, { correctedText: text });
      toast.success('Текст сохранён и будет учитываться в поиске');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const rerun = async () => {
    await post(`/api/v1/attachments/${attachmentId}/ocr`).catch((e) => toast.error(e.message));
    setOcr({ status: 'pending', text: null });
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Текст на изображении"
      size="wide"
      footer={
        <>
          <button className="btn ghost" onClick={rerun} disabled={busy}>
            <RefreshCw size={14} /> Распознать заново
          </button>
          <span className="grow" />
          <button className="btn" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success('Скопировано'))} disabled={!text}>
            <Copy size={14} /> Копировать
          </button>
          {ocr?.canEdit !== false && (
            <button className="btn primary" onClick={save} disabled={busy || !(ocr?.status === 'done' || ocr?.status === 'partial')}>
              Сохранить исправления
            </button>
          )}
        </>
      }
    >
      {!ocr || ocr.status === 'pending' || ocr.status === 'processing' ? (
        <div className="row muted">
          <span className="spinner" /> Распознавание текста… Это может занять до минуты.
        </div>
      ) : ocr.status === 'failed' || ocr.status === 'error' || ocr.status === 'none' ? (
        <div className="alert warning">{ocr.error ?? 'Текст не распознан.'}</div>
      ) : (
        <div className="col" style={{ gap: 8 }}>
          {(ocr.status === 'partial' || (ocr.confidence != null && ocr.confidence < 70)) && <div className="alert warning">Качество распознавания низкое ({Math.round(ocr.confidence ?? 0)}%). Проверьте и исправьте текст — исправления учитываются в поиске.</div>}
          <textarea className="textarea" style={{ minHeight: 260, fontFamily: 'var(--font-mono)', fontSize: 13 }} value={text} onChange={(e) => setText(e.target.value)} aria-label="Распознанный текст" />
        </div>
      )}
    </Dialog>
  );
}
