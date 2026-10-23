import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { useFloating, autoUpdate, offset, flip, shift, size, useDismiss, useRole, useInteractions, useListNavigation, FloatingPortal, FloatingFocusManager } from '@floating-ui/react';
import { MenuItems, returnFocus, tidyEntries, type MenuEntry } from './Menu';
import { useFloatingMotion } from './motion';

interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  items: MenuEntry[];
  label: string;
  /** Opened from the keyboard (Shift+F10 / the Menu key): the first item gets focus. */
  keyboard: boolean;
  /** Where focus goes back to when the menu closes without an action that moves it. */
  returnTo: HTMLElement | null;
  onClose?: () => void;
  seq: number;
}

const useCtx = create<ContextMenuState>(() => ({ open: false, x: 0, y: 0, items: [], label: '', keyboard: false, returnTo: null, seq: 0 }));

export interface OpenContextMenuOptions {
  label?: string;
  /** Opened from the keyboard: focus the first item. */
  keyboard?: boolean;
  onClose?: () => void;
}

/**
 * Opens the context menu at a point (usually the pointer of a `contextmenu` event). Keyboard accessible (arrows,
 * Home/End, Enter, Esc), stays inside the viewport, appears with the same soft motion as other menus.
 */
export function openContextMenu(at: { x: number; y: number } | MouseEvent | React.MouseEvent, items: MenuEntry[], opts: OpenContextMenuOptions = {}) {
  const list = tidyEntries(items);
  if (!list.length) return;
  const x = 'clientX' in at ? at.clientX : at.x;
  const y = 'clientY' in at ? at.clientY : at.y;
  const prev = useCtx.getState();
  const active = document.activeElement;
  const next = {
    open: true,
    x,
    y,
    items: list,
    label: opts.label ?? 'Контекстное меню',
    keyboard: !!opts.keyboard,
    returnTo: active instanceof HTMLElement && active !== document.body && !active.closest('.context-menu') ? active : prev.open ? prev.returnTo : null,
    onClose: opts.onClose,
  };
  if (!prev.open) {
    useCtx.setState({ ...next, seq: prev.seq + 1 });
    return;
  }
  // already open (e.g. the Menu key pressed twice): close, then open at the new point — never slide across the screen
  useCtx.setState({ open: false });
  prev.onClose?.();
  requestAnimationFrame(() => useCtx.setState({ ...next, seq: useCtx.getState().seq + 1 }));
}

export function closeContextMenu() {
  const s = useCtx.getState();
  if (!s.open) return;
  useCtx.setState({ open: false });
  s.onClose?.();
}

/** A point for keyboard-opened context menus: the bottom-left corner of the element (or the caret). */
export function pointFor(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + Math.min(24, r.width / 2), y: r.bottom - Math.min(4, r.height / 2) };
}

/** Rendered once by the app shell. */
export function ContextMenuHost() {
  const st = useCtx();
  const [active, setActive] = useState<number | null>(null);
  const listRef = useRef<Array<HTMLElement | null>>([]);
  const point = useMemo(() => ({ x: st.x, y: st.y }), [st.x, st.y]);
  const setOpen = (o: boolean) => {
    if (o) return;
    returnFocus(refs.floating.current, useCtx.getState().returnTo);
    closeContextMenu();
  };
  const { refs, floatingStyles, context, isPositioned, placement } = useFloating({
    open: st.open,
    onOpenChange: setOpen,
    placement: 'right-start',
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset({ mainAxis: 2, alignmentAxis: 2 }),
      flip({ padding: 8, fallbackPlacements: ['left-start', 'right-end', 'left-end'] }),
      shift({ padding: 8, crossAxis: true }),
      size({ padding: 8, apply: ({ availableHeight, elements }) => { Object.assign(elements.floating.style, { maxHeight: `${Math.max(160, availableHeight)}px` }); } }),
    ],
  });
  useLayoutEffect(() => {
    refs.setPositionReference({
      getBoundingClientRect: () => ({ x: point.x, y: point.y, left: point.x, top: point.y, right: point.x, bottom: point.y, width: 0, height: 0 }),
    });
  }, [point, refs]);
  useEffect(() => setActive(st.keyboard ? 0 : null), [st.seq, st.keyboard]);
  const motion = useFloatingMotion(st.open, isPositioned, placement, { scale: 0.98, distance: 2 });
  const dismiss = useDismiss(context, { outsidePressEvent: 'mousedown' });
  const role = useRole(context, { role: 'menu' });
  const nav = useListNavigation(context, { listRef, activeIndex: active, onNavigate: setActive, loop: true, focusItemOnOpen: st.keyboard });
  const { getFloatingProps, getItemProps } = useInteractions([dismiss, role, nav]);
  useEffect(() => {
    if (!st.open) return;
    // the page scrolled or the window lost focus: a menu at a stale point would act on the wrong thing
    const close = () => setOpen(false);
    const onScroll = (e: Event) => !refs.floating.current?.contains(e.target as Node) && close();
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.open, st.seq]);
  if (!motion.isMounted) return null;
  return (
    <FloatingPortal>
      <FloatingFocusManager context={context} modal={false} initialFocus={st.keyboard ? 0 : refs.floating} returnFocus={false}>
        <div
          ref={refs.setFloating}
          className="menu context-menu"
          style={{ ...floatingStyles, ...motion.styles }}
          tabIndex={-1}
          {...getFloatingProps({
            onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
          })}
          {...motion.props}
          aria-label={st.label}
        >
          <MenuItems list={st.items} active={active} listRef={listRef} getItemProps={getItemProps} onClose={() => setOpen(false)} />
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  );
}
