import { Check, CloudOff, Loader2, AlertTriangle, Eye, HardDrive } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSyncState, type SyncInfo } from '../../sync/collab';
import { Tooltip } from '../ui/Tooltip';
import { fullTime } from '../../lib/format';
import { useUploadState } from '../../lib/uploadState';

/**
 * Honest save indicator: "Сохранено" appears only after the server confirmed a durable commit of every local change.
 */
export function SyncStatus({ pageId }: { pageId: string }) {
  // Subscribe to what the indicator shows, not to the counters: the counters change on every keystroke and a
  // re-render here runs synchronously inside the editor transaction (it used to cost several ms per character).
  const key = useSyncState((s) => {
    const i = s.pages[pageId];
    return i ? `${i.status}|${i.transport ?? 'ws'}|${i.status === 'local' && i.pending ? 1 : 0}` : '';
  });
  const status = key ? (key.split('|')[0] as SyncInfo['status']) : null;
  const transport = key ? key.split('|')[1] : 'ws';
  const hasPending = key.endsWith('|1');
  // R-MEDIA-006: a file still uploading into the page is not saved yet
  const uploading = useUploadState((s) => s.active[pageId] ?? 0);
  if (!status) return null;
  const map = {
    saved: { icon: <Check size={14} />, text: 'Сохранено', cls: 'ok' },
    syncing: { icon: <Loader2 size={14} className="spin" />, text: 'Сохранение…', cls: 'busy' },
    local: { icon: navigator.onLine ? <HardDrive size={14} /> : <CloudOff size={14} />, text: hasPending ? 'Сохранено на устройстве' : 'Нет связи', cls: 'warn' },
    connecting: { icon: <Loader2 size={14} className="spin" />, text: 'Подключение…', cls: 'busy' },
    readonly: { icon: <Eye size={14} />, text: 'Только чтение', cls: 'muted' },
    error: { icon: <AlertTriangle size={14} />, text: 'Ошибка сохранения', cls: 'err' },
  }[status];
  if (status === 'saved' && uploading > 0) Object.assign(map, { icon: <Loader2 size={14} className="spin" />, text: 'Загрузка файлов…', cls: 'busy' });
  return (
    <Tooltip label={<SyncTip pageId={pageId} />}>
      <span className={'sync-status ' + map.cls} data-transport={transport} role="status" aria-live="polite" tabIndex={0}>
        {map.icon}
        <span className="sync-text">{map.text}</span>
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
