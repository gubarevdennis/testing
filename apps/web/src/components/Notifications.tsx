import { useState, type ReactNode } from 'react';
import { useFloating, autoUpdate, offset, flip, shift, size, useClick, useDismiss, useInteractions, FloatingPortal, FloatingFocusManager } from '@floating-ui/react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useNotifications } from '../hooks/data';
import { post } from '../api/client';
import { relTime } from '../lib/format';
import { useFloatingMotion } from './ui/motion';

const TEXT: Record<string, (n: any) => string> = {
  mention: (n) => `${n.data.from} упомянул(а) вас: «${n.data.excerpt ?? ''}»`,
  comment_reply: (n) => `${n.data.from} ответил(а) в обсуждении: «${n.data.excerpt ?? ''}»`,
  review_requested: (n) => `${n.data.from} просит согласовать страницу`,
  review_approved: (n) => `${n.data.by} согласовал(а) страницу`,
  review_rejected: (n) => `${n.data.by} вернул(а) страницу на доработку${n.data.comment ? ': ' + n.data.comment : ''}`,
  access_request: (n) => `${n.data.from} запрашивает доступ (${n.data.level})${n.data.reason ? ': ' + n.data.reason : ''}`,
};

export function NotificationsPopover({ trigger }: { trigger: (ref: (el: HTMLElement | null) => void, props: Record<string, unknown>) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data } = useNotifications();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { refs, floatingStyles, context, isPositioned, placement } = useFloating({ open, onOpenChange: setOpen, placement: 'right-start', strategy: 'fixed', whileElementsMounted: autoUpdate, middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 }), size({ padding: 8, apply: ({ availableHeight, elements }) => { Object.assign(elements.floating.style, { maxHeight: `${Math.min(520, availableHeight)}px` }); } })] });
  const { getReferenceProps, getFloatingProps } = useInteractions([useClick(context), useDismiss(context)]);
  const motion = useFloatingMotion(open, isPositioned, placement);
  const markAll = async () => {
    await post('/api/v1/notifications/read', {});
    qc.invalidateQueries({ queryKey: ['notifications'] });
  };
  return (
    <>
      {trigger(refs.setReference, getReferenceProps({ 'aria-label': 'Входящие уведомления' }))}
      {motion.isMounted && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div ref={refs.setFloating} style={{ ...floatingStyles, ...motion.styles, width: 360, overflowY: 'auto' }} className="popover" {...getFloatingProps()} {...motion.props}>
              <div className="row" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <b className="grow">Входящие</b>
                {!!data?.unread && (
                  <button className="btn sm ghost" onClick={markAll}>
                    Прочитать все
                  </button>
                )}
              </div>
              {!data?.notifications.length ? (
                <div className="empty-state">
                  <div className="empty-icon">📭</div>
                  <h3>Нет уведомлений</h3>
                  <p className="small">Здесь появятся упоминания, ответы и запросы на согласование.</p>
                </div>
              ) : (
                data.notifications.map((n) => (
                  <button
                    key={n.id}
                    className={'notif-item' + (n.read_at ? '' : ' unread')}
                    onClick={async () => {
                      setOpen(false);
                      await post('/api/v1/notifications/read', { ids: [n.id] });
                      qc.invalidateQueries({ queryKey: ['notifications'] });
                      if (n.page_id) navigate('/p/' + n.page_id + (n.data?.threadId ? '?thread=' + n.data.threadId : ''));
                    }}
                  >
                    <span className="small">{(TEXT[n.type] ?? (() => n.type))(n)}</span>
                    <span className="small muted">
                      {n.page_title ? `«${n.page_title}» · ` : ''}
                      {relTime(n.created_at)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}
