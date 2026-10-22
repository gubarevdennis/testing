import { Check, CloudOff, Loader2, AlertTriangle, Eye, HardDrive } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSyncState } from '../../sync/collab';
import { Tooltip } from '../ui/Tooltip';
import { fullTime } from '../../lib/format';

/**
 * Honest save indicator: "Сохранено" appears only after the server confirmed a durable commit of every local change.
 */
export function SyncStatus({ pageId }: { pageId: string }) {
  const info = useSyncState((s) => s.pages[pageId]);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 10_000);
    return () => clearInterval(t);
  }, []);
  if (!info) return null;
  const { status, pending, oldestPendingMs, lastSavedAt } = info;
  const ageMin = oldestPendingMs ? Math.round(oldestPendingMs / 60000) : 0;
  const map = {
    saved: { icon: <Check size={14} />, text: 'Сохранено', cls: 'ok', tip: lastSavedAt ? `Все изменения сохранены на сервере · ${fullTime(new Date(lastSavedAt))}` : 'Все изменения сохранены на сервере' },
    syncing: { icon: <Loader2 size={14} className="spin" />, text: 'Сохранение…', cls: 'busy', tip: `Отправляется изменений: ${pending}` },
    local: {
      icon: navigator.onLine ? <HardDrive size={14} /> : <CloudOff size={14} />,
      text: pending ? 'Сохранено на устройстве' : 'Нет связи',
      cls: 'warn',
      tip: pending ? `Изменений ждут отправки: ${pending}${ageMin ? `, самое раннее — ${ageMin} мин назад` : ''}. Они хранятся в этом браузере и будут отправлены автоматически при подключении.` : 'Соединение с сервером восстанавливается',
    },
    connecting: { icon: <Loader2 size={14} className="spin" />, text: 'Подключение…', cls: 'busy', tip: 'Подключение к серверу' },
    readonly: { icon: <Eye size={14} />, text: 'Только чтение', cls: 'muted', tip: 'У вас нет прав на редактирование этой страницы' },
    error: { icon: <AlertTriangle size={14} />, text: 'Ошибка сохранения', cls: 'err', tip: info.message ?? 'Изменения не приняты сервером' },
  }[status];
  return (
    <Tooltip label={map.tip}>
      <span className={'sync-status ' + map.cls} role="status" aria-live="polite" tabIndex={0}>
        {map.icon}
        <span className="sync-text">{map.text}</span>
      </span>
    </Tooltip>
  );
}
