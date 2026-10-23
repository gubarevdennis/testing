import { cloneElement, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { useFloating, autoUpdate, offset, flip, shift, useHover, useFocus, useDismiss, useRole, useInteractions, FloatingPortal, safePolygon } from '@floating-ui/react';
import { useUi } from '../../state/ui';
import { MOTION, useFloatingMotion } from './motion';

/** Tooltips are "warm" for a moment after one closes: moving along a toolbar shows the next one almost at once. */
let lastTooltipClose = 0;
const WARM_MS = 500;
const WARM_DELAY = 60;

/**
 * Tooltip shown on hover (after a short delay) and on keyboard focus; flips near viewport edges.
 * Never steals focus and never covers the trigger. Fades in once placed, fades out on close.
 */
export function Tooltip({ label, shortcut, children, placement = 'bottom', delay = 450 }: { label: ReactNode; shortcut?: string; children: ReactElement; placement?: 'top' | 'bottom' | 'left' | 'right'; delay?: number }) {
  const [open, setOpenState] = useState(false);
  const setOpen = (o: boolean) => {
    if (!o) lastTooltipClose = Date.now();
    setOpenState(o);
  };
  const { refs, floatingStyles, context, isPositioned, placement: finalPlacement } = useFloating({ open, onOpenChange: setOpen, placement, strategy: 'fixed', whileElementsMounted: autoUpdate, middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })] });
  const motion = useFloatingMotion(open, isPositioned, finalPlacement, { duration: MOTION.tooltipOpen, closeDuration: MOTION.tooltipClose, scale: 1, distance: 2 });
  // read by useHover when the pointer enters: a getter picks the warm delay at that moment, not at the last render
  const hoverDelay = useMemo(() => ({ get open() { return Date.now() - lastTooltipClose < WARM_MS ? Math.min(WARM_DELAY, delay) : delay; }, close: 0 }), [delay]);
  const hover = useHover(context, { delay: hoverDelay, move: false, handleClose: safePolygon() });
  const focus = useFocus(context, { visibleOnly: true });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);
  if (!label) return children;
  const child = children as ReactElement<any>;
  return (
    <>
      {cloneElement(child, getReferenceProps({ ref: refs.setReference, ...child.props }))}
      {motion.isMounted && (
        <FloatingPortal>
          <div ref={refs.setFloating} style={{ ...floatingStyles, ...motion.styles }} className="tooltip" {...getFloatingProps()} {...motion.props}>
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
