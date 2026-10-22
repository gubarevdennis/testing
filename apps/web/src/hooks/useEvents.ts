import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useNetwork } from './useNetwork';
import { toast } from '../components/ui/Toast';

/**
 * Subscribes to the per-user event stream and refreshes cached data. Only ids are pushed by the server;
 * data is re-fetched through access-checked endpoints.
 */
export function useServerEvents(enabled: boolean) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  // navigate changes identity on every navigation: keep it in a ref so the event socket is not reconnected
  const nav = useRef(navigate);
  nav.current = navigate;
  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer: number | null = null;
    let closed = false;
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/api/v1/events`);
      ws.onopen = () => {
        retry = 0;
        useNetwork.getState().set({ serverReachable: true });
        // Catch up on anything missed while disconnected.
        qc.invalidateQueries({ queryKey: ['tree'] });
        qc.invalidateQueries({ queryKey: ['spaces'] });
      };
      ws.onmessage = (ev) => {
        let e: any;
        try {
          e = JSON.parse(ev.data);
        } catch {
          return;
        }
        switch (e.type) {
          case 'tree-changed':
            qc.invalidateQueries({ queryKey: ['tree', e.spaceId] });
            break;
          case 'shared-changed':
          case 'access-changed':
            qc.invalidateQueries({ queryKey: ['spaces'] });
            qc.invalidateQueries({ queryKey: ['tree'] });
            qc.invalidateQueries({ queryKey: ['page'] });
            qc.invalidateQueries({ queryKey: ['access'] });
            break;
          case 'page-changed':
            qc.invalidateQueries({ queryKey: ['page', e.pageId] });
            if (e.fields?.includes('rows') || e.fields?.includes('collection')) qc.invalidateQueries({ queryKey: ['collection'] });
            break;
          case 'page-restored': {
            // Someone restored a version/journal state of a page this user can see (R-HISTORY-014): say so, and link
            // to the automatically saved state from before the restore where their own work is kept.
            qc.invalidateQueries({ queryKey: ['revisions', e.pageId] });
            qc.invalidateQueries({ queryKey: ['page-events', e.pageId] });
            const onPage = location.pathname === '/p/' + e.pageId;
            const msg = `${e.actorName} восстановил(а) ${onPage ? 'эту страницу' : 'страницу'}: ${e.label}. Состояние до восстановления сохранено как версия ${e.preRestoreNumber}.`;
            toast.info(
              msg,
              e.preRestoreRevisionId
                ? {
                    label: `Открыть версию ${e.preRestoreNumber}`,
                    run: () => {
                      try {
                        sessionStorage.setItem('kb:history-select', e.preRestoreRevisionId);
                      } catch {
                        /* storage unavailable */
                      }
                      if (!onPage) nav.current('/p/' + e.pageId);
                      setTimeout(() => window.dispatchEvent(new CustomEvent('kb:open-history', { detail: { revisionId: e.preRestoreRevisionId } })), onPage ? 0 : 400);
                    },
                  }
                : undefined,
            );
            break;
          }
          case 'comments-changed':
            qc.invalidateQueries({ queryKey: ['comments', e.pageId] });
            window.dispatchEvent(new CustomEvent('kb:comments-changed', { detail: { pageId: e.pageId } }));
            break;
          case 'notification':
            qc.invalidateQueries({ queryKey: ['notifications'] });
            break;
          case 'session-ended':
            toast.error('Сеанс завершён администратором или истёк. Войдите снова.');
            setTimeout(() => location.reload(), 1500);
            break;
        }
      };
      ws.onclose = () => {
        if (closed) return;
        useNetwork.getState().set({ serverReachable: false });
        const base = Math.min(30_000, 500 * 2 ** retry++);
        timer = window.setTimeout(connect, base / 2 + Math.random() * (base / 2));
      };
    };
    connect();
    const ping = window.setInterval(() => ws?.readyState === 1 && ws.send('ping'), 25_000);
    const online = () => {
      if (ws && ws.readyState === 1) return;
      if (timer) clearTimeout(timer);
      retry = 0;
      connect();
    };
    window.addEventListener('online', online);
    return () => {
      closed = true;
      clearInterval(ping);
      if (timer) clearTimeout(timer);
      window.removeEventListener('online', online);
      ws?.close();
    };
  }, [enabled, qc]);
}
