import { useState } from 'react';
import { Dialog } from '../components/ui/Dialog';
import { post } from '../api/client';
import type { AttachmentDto } from '../lib/uploads';

/**
 * «Изображение по ссылке» (R-MEDIA-009): instant preview of the address, then the server copies the image through the
 * SSRF guard and stores it as an attachment (the page does not depend on the external site).
 */
export function ImageUrlDialog({ pageId, onClose, onInsert }: { pageId: string; onClose(): void; onInsert(a: AttachmentDto, alt: string): void }) {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<'idle' | 'ok' | 'error'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = url.trim();
  const valid = /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(trimmed);
  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ attachment: AttachmentDto }>('/api/v1/attachments/from-url', { url: trimmed, pageId });
      let alt = 'Изображение';
      try {
        alt = decodeURIComponent(new URL(trimmed).pathname.split('/').pop() ?? '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ').trim() || alt;
      } catch {
        /* default alt */
      }
      onInsert(r.attachment, alt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Изображение по ссылке"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" disabled={!valid || busy} onClick={submit}>
            {busy ? 'Загрузка…' : 'Вставить'}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="image-url">Адрес изображения</label>
        <input
          id="image-url"
          className="input"
          value={url}
          autoFocus
          placeholder="https://example.ru/schema.png"
          onChange={(e) => {
            setUrl(e.target.value);
            setPreview('idle');
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          aria-invalid={!!error || (url !== '' && !valid)}
          aria-describedby="image-url-hint"
        />
        <span id="image-url-hint" className={error ? 'field-error' : 'field-hint'} role={error ? 'alert' : undefined}>
          {error ?? (url && !valid ? 'Введите адрес, начинающийся с http:// или https://' : 'Изображение будет скопировано в базу знаний — страница не зависит от внешнего сайта.')}
        </span>
      </div>
      {valid && (
        <div className="image-url-preview" aria-live="polite">
          {preview === 'error' ? (
            <span className="small muted">Предпросмотр недоступен — сервер проверит ссылку при вставке</span>
          ) : (
            <img src={trimmed} alt="Предпросмотр" referrerPolicy="no-referrer" onLoad={() => setPreview('ok')} onError={() => setPreview('error')} style={{ maxWidth: '100%', maxHeight: 240 }} />
          )}
        </div>
      )}
    </Dialog>
  );
}
