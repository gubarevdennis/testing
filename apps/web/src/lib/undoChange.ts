import { post } from '../api/client';
import { toast } from '../components/ui/Toast';
import { errMsg } from '../components/page/directory';

/**
 * Undo of a page property change (title, icon, cover, width, tags, properties…) — R-HISTORY-002. The server applies it
 * only to fields nobody changed since, and explains otherwise; the undo itself is journaled and can be undone again.
 */
export async function undoPropertyChange(pageId: string, eventId: string, onDone?: () => void) {
  try {
    await post(`/api/v1/pages/${pageId}/events/${eventId}/undo`, {});
    toast.success('Изменение отменено');
    onDone?.();
  } catch (err) {
    toast.error(errMsg(err, 'Не удалось отменить изменение'));
  }
}
