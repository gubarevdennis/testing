import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'normal' | 'wide' | 'xwide';
  /** When true, clicking the backdrop does not close (e.g. unsaved critical input). */
  persistent?: boolean;
  initialFocus?: string;
  describedBy?: string;
}

/** Modal dialog: focus trap, Esc to close, restores focus to the element that opened it. */
export function Dialog({ open, title, onClose, children, footer, size = 'normal', persistent, initialFocus }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const prevFocus = useRef<Element | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!open) return;
    if (!prevFocus.current || prevFocus.current === document.body) prevFocus.current = document.activeElement;
    const el = ref.current;
    const first = (initialFocus ? el?.querySelector(initialFocus) : el?.querySelector('input, textarea, select, button:not(.dialog-close), [tabindex]:not([tabindex="-1"])')) as HTMLElement | null;
    setTimeout(() => first?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
        if (!items.length) return;
        const firstEl = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const prev = prevFocus.current as HTMLElement | null;
      if (prev?.isConnected) prev.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // Capture the opener while rendering (before the commit): a dialog opened from a menu item renders in the same
  // commit that removes the menu, so by the time effects run the focused item is gone. Focus then returns to the
  // menu's trigger instead of being lost on <body>.
  if (open && !wasOpen.current) {
    const active = document.activeElement as HTMLElement | null;
    const menu = active?.closest('[role=menu]');
    prevFocus.current = (menu?.id ? document.querySelector(`[aria-controls="${CSS.escape(menu.id)}"]`) : null) ?? active;
  }
  wasOpen.current = open;
  if (!open) return null;
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => !persistent && e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={'dialog' + (size !== 'normal' ? ' ' + size : '')} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="dialog-header">
          <h2 className="dialog-title" id={titleId}>
            {title}
          </h2>
          <button className="icon-btn dialog-close" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
