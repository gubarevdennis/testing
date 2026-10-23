import { Check, CloudOff, Loader2, AlertTriangle, Eye, HardDrive } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSyncState, type SyncInfo } from '../../sync/collab';
import { Tooltip } from '../ui/Tooltip';
import { fullTime } from '../../lib/format';
import { useUploadState } from '../../lib/uploadState';

type View = { icon: 'check' | 'spin' | 'disk' | 'offline' | 'eye' | 'alert'; text: string; cls: string; transport: string };

function viewOf(pageId: string): View | null {
  const i = useSyncState.getState().pages[pageId];
  if (!i) return null;
  const transport = i.transport ?? 'ws';
  const hasPending = i.status === 'local' && i.pending > 0;
  const map: Record<SyncInfo['status'], Omit<View, 'transport'>> = {
    saved: { icon: 'check', text: 'Сохранено', cls: 'ok' },
    syncing: { icon: 'spin', text: 'Сохранение…', cls: 'busy' },
    local: { icon: navigator.onLine ? 'disk' : 'offline', text: hasPending ? 'Сохранено на устройстве' : 'Нет связи', cls: 'warn' },
    connecting: { icon: 'spin', text: 'Подключение…', cls: 'busy' },
    readonly: { icon: 'eye', text: 'Только чтение', cls: 'muted' },
    error: { icon: 'alert', text: 'Ошибка сохранения', cls: 'err' },
  };
  const v = { ...map[i.status], transport };
  // R-MEDIA-006: a file still uploading into the page is not saved yet
  if (i.status === 'saved' && (useUploadState.getState().active[pageId] ?? 0) > 0) Object.assign(v, { icon: 'spin', text: 'Загрузка файлов…', cls: 'busy' });
  return v;
}

/**
 * Honest save indicator: "Сохранено" appears only after the server confirmed a durable commit of every local change.
 *
 * The status flips "Сохранение…" ↔ "Сохранено" on every keystroke. It is updated directly in the DOM, not through a React
 * render: every React commit while the editor has focus makes React save and restore the selection of the focused
 * contenteditable, walking the text of the whole document (≈ 4 ms per keystroke on 5 000 blocks, PERF-D1).
 */
export function SyncStatus({ pageId }: { pageId: string }) {
  const textRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    let last = '';
    const apply = () => {
      const text = textRef.current;
      const el = text?.parentElement;
      if (!text || !el) return;
      const v = viewOf(pageId);
      const key = v ? `${v.icon}|${v.text}|${v.cls}|${v.transport}` : '';
      if (key === last) return;
      last = key;
      el.hidden = !v;
      if (!v) return;
      el.className = 'sync-status ' + v.cls;
      el.dataset.transport = v.transport;
      el.querySelectorAll<HTMLElement>('[data-icon]').forEach((i) => (i.hidden = i.dataset.icon !== v.icon));
      text.textContent = v.text;
    };
    apply();
    const offSync = useSyncState.subscribe(apply);
    const offUpload = useUploadState.subscribe(apply);
    window.addEventListener('online', apply);
    window.addEventListener('offline', apply);
    return () => {
      offSync();
      offUpload();
      window.removeEventListener('online', apply);
      window.removeEventListener('offline', apply);
    };
  }, [pageId]);
  return (
    <Tooltip label={<SyncTip pageId={pageId} />}>
      <span className="sync-status" role="status" aria-live="polite" tabIndex={0} hidden>
        <span className="sync-icon" data-icon="check" hidden><Check size={14} /></span>
        <span className="sync-icon" data-icon="spin" hidden><Loader2 size={14} className="spin" /></span>
        <span className="sync-icon" data-icon="disk" hidden><HardDrive size={14} /></span>
        <span className="sync-icon" data-icon="offline" hidden><CloudOff size={14} /></span>
        <span className="sync-icon" data-icon="eye" hidden><Eye size={14} /></span>
        <span className="sync-icon" data-icon="alert" hidden><AlertTriangle size={14} /></span>
        <span className="sync-text" ref={textRef} />
      </span>
    </Tooltip>
  );
}

/** Tooltip text with live counters; rendered only while the tooltip is open. */
function SyncTip({ pageId }: { pageId: string }) {
  const info = useSyncState((s) => s.pages[pageId]);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 10_000);
    return () => clearInterval(t);
  }, []);
  if (!info) return null;
  const { status, pending, oldestPendingMs, lastSavedAt } = info;
  const ageMin = oldestPendingMs ? Math.round(oldestPendingMs / 60000) : 0;
  const tips: Record<SyncInfo['status'], string> = {
    saved: lastSavedAt ? `Все изменения сохранены на сервере · ${fullTime(new Date(lastSavedAt))}` : 'Все изменения сохранены на сервере',
    syncing: `Отправляется изменений: ${pending}`,
    local: pending ? `Изменений ждут отправки: ${pending}${ageMin ? `, самое раннее — ${ageMin} мин назад` : ''}. Они хранятся в этом браузере и будут отправлены автоматически при подключении.` : 'Соединение с сервером восстанавливается',
    connecting: 'Подключение к серверу',
    readonly: 'У вас нет прав на редактирование этой страницы',
    error: info.message ?? 'Изменения не приняты сервером',
  };
  const tip = tips[status];
  return <>{info.transport === 'http' && (status === 'saved' || status === 'syncing') ? `${tip}. Резервный канал HTTPS: WebSocket недоступен в этой сети` : tip}</>;
}
