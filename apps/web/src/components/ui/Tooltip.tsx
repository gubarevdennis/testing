import { cloneElement, useState, type ReactElement, type ReactNode } from 'react';
import { useFloating, autoUpdate, offset, flip, shift, useHover, useFocus, useDismiss, useRole, useInteractions, FloatingPortal, safePolygon } from '@floating-ui/react';
import { useUi } from '../../state/ui';

/**
 * Tooltip shown on hover (after a short delay) and on keyboard focus; flips near viewport edges.
 * Never steals focus and never covers the trigger.
 */
export function Tooltip({ label, shortcut, children, placement = 'bottom', delay = 450 }: { label: ReactNode; shortcut?: string; children: ReactElement; placement?: 'top' | 'bottom' | 'left' | 'right'; delay?: number }) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({ open, onOpenChange: setOpen, placement, whileElementsMounted: autoUpdate, middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })] });
  const hover = useHover(context, { delay: { open: delay, close: 0 }, move: false, handleClose: safePolygon() });
  const focus = useFocus(context, { visibleOnly: true });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);
  if (!label) return children;
  const child = children as ReactElement<any>;
  return (
    <>
      {cloneElement(child, getReferenceProps({ ref: refs.setReference, ...child.props }))}
      {open && (
        <FloatingPortal>
          <div ref={refs.setFloating} style={floatingStyles} className="tooltip" {...getFloatingProps()}>
            {label}
            {shortcut && <kbd>{formatShortcut(shortcut)}</kbd>}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** "Mod+K" -> "⌘K" on macOS, "Ctrl+K" elsewhere. */
export function formatShortcut(s: string) {
  if (isMac) return s.replace(/Mod\+/g, '⌘').replace(/Shift\+/g, '⇧').replace(/Alt\+/g, '⌥').replace(/Ctrl\+/g, '⌃');
  return s.replace(/Mod\+/g, 'Ctrl+');
}

export function useHintsEnabled() {
  return !useUi((s) => s.hintsDisabled);
}
