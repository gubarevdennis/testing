import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Editor } from '@tiptap/core';
import { fileSize } from '../../lib/format';
import { subscribeUpload, getUploadItem, cancelUpload, retryUpload, hasLocalUpload } from '../extensions/uploads';

/**
 * Body of an image/file block whose file is still being uploaded (R-MEDIA-006/008, UX13-03): local preview, progress,
 * errors with "Повторить". The block itself stays in the document whatever happens to the upload.
 */
export function UploadPlaceholder({ editor, uploadId, name, kind }: { editor: Editor; uploadId: string; name: string; kind: 'image' | 'file' }) {
  // The item is mutated in place: the snapshot is a string of the fields shown, so every change re-renders.
  useSyncExternalStore(
    (cb) => subscribeUpload(uploadId, cb),
    () => {
      const i = getUploadItem(uploadId);
      return i ? `${i.state}|${i.progress}|${i.error ?? ''}` : '';
    },
  );
  const item = getUploadItem(uploadId);
  const state = item?.state;
  const progress = item?.progress ?? 0;
  const [local, setLocal] = useState<boolean | null>(null);
  useEffect(() => {
    if (item) return;
    let alive = true;
    void hasLocalUpload(uploadId).then((v) => alive && setLocal(v));
    return () => {
      alive = false;
    };
  }, [item, uploadId]);
  const editable = editor.isEditable;
  const status = item
    ? state === 'error'
      ? `Не удалось загрузить: ${item.error ?? 'ошибка'}. Блок сохранён — можно повторить.`
      : state === 'waiting'
        ? 'Ожидание сети — загрузка продолжится автоматически'
        : `Загрузка… ${Math.round(progress * 100)}%`
    : local
      ? 'Возобновление загрузки…'
      : local === false
        ? 'Файл ещё загружается с устройства автора'
        : 'Загрузка…';
  return (
    <div className={'kb-upload' + (kind === 'image' ? ' is-image' : '') + (state === 'error' ? ' error' : '')} contentEditable={false} data-upload-id={uploadId}>
      {item?.preview && <img src={item.preview} alt={name} />}
      <div className="kb-upload-info">
        <div className="kb-upload-name">
          {item ? `${item.file.name || 'Файл'} · ${fileSize(item.file.size)}` : name || (kind === 'image' ? 'Изображение' : 'Файл')}
        </div>
        <div className="kb-upload-status" role="status">
          {status}
        </div>
        {item && state !== 'error' && (
          <div className="progress" aria-hidden>
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </div>
      {editable && (item || local === false) && (
        <div className="kb-upload-actions">
          {state === 'error' && (
            <button className="btn sm" onClick={() => retryUpload(editor, uploadId)}>
              Повторить
            </button>
          )}
          <button className="btn sm ghost" onClick={() => cancelUpload(editor, uploadId)}>
            {item && state !== 'error' ? 'Отменить' : 'Убрать'}
          </button>
        </div>
      )}
    </div>
  );
}
