import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent as RKeyboardEvent, type MutableRefObject } from 'react';
import { useFloating, autoUpdate, offset, flip, shift, size, useClick, useDismiss, useRole, useInteractions, FloatingPortal, FloatingFocusManager, useListNavigation, type Placement } from '@floating-ui/react';
import { ChevronRight } from 'lucide-react';
import { formatShortcut } from './Tooltip';
import { useFloatingMotion } from './motion';

export interface MenuItemDef {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onSelect?: () => void;
  children?: MenuEntry[];
  checked?: boolean;
}
export type MenuEntry = MenuItemDef | { separator: true } | { label: string; header: true };

const isItem = (e: MenuEntry): e is MenuItemDef => 'id' in e;

/** Drops separators at the start, the end and next to each other (items filtered by permissions leave them behind). */
export function tidyEntries(list: MenuEntry[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const e of list) {
    if ('separator' in e && (!out.length || 'separator' in out[out.length - 1])) continue;
    out.push(e);
  }
  while (out.length && 'separator' in out[out.length - 1]) out.pop();
  return out;
}

interface MenuProps {
  trigger: (props: { ref: (el: HTMLElement | null) => void; open: boolean; props: Record<string, unknown> }) => ReactNode;
  items: MenuEntry[] | (() => MenuEntry[]);
  placement?: Placement;
  label?: string;
  onOpenChange?: (open: boolean) => void;
}

export const MENU_MIDDLEWARE = [
  offset(4),
  flip({ padding: 8, fallbackAxisSideDirection: 'end' }),
  shift({ padding: 8 }),
  size({ padding: 8, apply: ({ availableHeight, elements }) => { Object.assign(elements.floating.style, { maxHeight: `${Math.max(160, availableHeight)}px` }); } }),
];

/**
 * Accessible dropdown menu: keyboard navigation (arrows, Home/End, Enter, Esc), nested submenus,
 * stays inside the viewport (flip/shift/size with internal scroll) and returns focus to the trigger.
 * Invisible until positioned, then opens with a short fade/scale from the trigger side (and closes the same way).
 */
export function Menu({ trigger, items, placement = 'bottom-start', label, onOpenChange }: MenuProps) {
  const [open, setOpenState] = useState(false);
  const setOpen = (o: boolean) => {
    // focus goes back to the trigger at once, not when the faded-out menu unmounts: actions that move focus elsewhere
    // (rename field, the editor) run right after and must keep it
    if (!o) returnFocus(refs.floating.current, refs.domReference.current);
    setOpenState(o);
    onOpenChange?.(o);
  };
  const [active, setActive] = useState<number | null>(null);
  const listRef = useRef<Array<HTMLElement | null>>([]);
  const { refs, floatingStyles, context, isPositioned, placement: finalPlacement } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    // fixed to the viewport (the page itself never scrolls, scroll containers do); top/left instead of a transform:
    // a transformed menu would become the containing block of its fixed submenus
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: MENU_MIDDLEWARE,
  });
  const motion = useFloatingMotion(open, isPositioned, finalPlacement);
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'menu' });
  const nav = useListNavigation(context, { listRef, activeIndex: active, onNavigate: setActive, loop: true });
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([click, dismiss, role, nav]);
  // the items stay rendered while the menu fades out
  const lastList = useRef<MenuEntry[]>([]);
  if (open) lastList.current = tidyEntries(typeof items === 'function' ? items() : items);
  return (
    <>
      {trigger({ ref: refs.setReference, open, props: getReferenceProps({ 'aria-label': label }) })}
      {motion.isMounted && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false} initialFocus={-1} returnFocus={false}>
            <div ref={refs.setFloating} style={{ ...floatingStyles, ...motion.styles }} className="menu" {...getFloatingProps()} {...motion.props} aria-label={label}>
              <MenuItems list={lastList.current} active={active} listRef={listRef} getItemProps={getItemProps} onClose={() => setOpen(false)} />
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}

/** Returns focus to `to` when it is inside the closing surface (or nowhere): a click elsewhere keeps its own focus. */
export function returnFocus(floating: HTMLElement | null, to: Element | null | undefined) {
  const a = document.activeElement;
  if (!(to instanceof HTMLElement) || !to.isConnected) return;
  if (!a || a === document.body || (floating && floating.contains(a))) to.focus({ preventScroll: true });
}

/** The items of a menu (shared by the dropdown and the context menu). */
export function MenuItems({
  list,
  active,
  listRef,
  getItemProps,
  onClose,
}: {
  list: MenuEntry[];
  active: number | null;
  listRef: MutableRefObject<Array<HTMLElement | null>>;
  getItemProps: (p?: Record<string, unknown>) => Record<string, unknown>;
  onClose(): void;
}) {
  let idx = -1;
  return (
    <>
      {list.map((e, i) => {
        if ('separator' in e) return <div key={'s' + i} className="menu-sep" role="separator" />;
        if ('header' in e) return <div key={'h' + i} className="menu-label">{e.label}</div>;
        if (!isItem(e)) return null;
        idx++;
        const myIdx = idx;
        if (e.children?.length)
          return <SubMenu key={e.id} item={e} onClose={onClose} itemRef={(el) => (listRef.current[myIdx] = el)} itemProps={getItemProps()} active={active === myIdx} />;
        return (
          <button
            key={e.id}
            ref={(el) => (listRef.current[myIdx] = el)}
            role={e.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={e.checked}
            className={'menu-item' + (e.danger ? ' danger' : '')}
            data-active={active === myIdx}
            data-id={e.id}
            disabled={e.disabled}
            title={e.disabled ? (e.disabledReason ?? e.hint ?? 'Действие сейчас недоступно') : undefined}
            {...getItemProps({
              onClick() {
                if (e.disabled) return;
                onClose();
                e.onSelect?.();
              },
            })}
          >
            {e.icon !== undefined && <span className="menu-icon">{e.icon}</span>}
            <span className="ellipsis">{e.label}</span>
            {e.checked && <span className="menu-hint">✓</span>}
            {(e.shortcut || e.hint) && <span className="menu-hint">{e.shortcut ? formatShortcut(e.shortcut) : e.hint}</span>}
          </button>
        );
      })}
    </>
  );
}

let lastTouch = 0;
if (typeof window !== 'undefined') window.addEventListener('touchstart', () => (lastTouch = Date.now()), { capture: true, passive: true });
/** The last touch was within `ms`: mouse/context events right after it are synthesized by the browser. */
export const touchedRecently = (ms = 1000) => Date.now() - lastTouch < ms;
/** A hover is a mouse hover: not a touch, and not the mouse events a browser synthesizes right after a tap. */
function hoverOpens(e: React.PointerEvent) {
  return e.pointerType === 'mouse' && !touchedRecently() && !matchMedia('(hover: none)').matches;
}

function SubMenu({ item, onClose, itemRef, itemProps, active }: { item: MenuItemDef; onClose: () => void; itemRef: (el: HTMLElement | null) => void; itemProps: Record<string, unknown>; active: boolean }) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, isPositioned, placement } = useFloating({
    open,
    placement: 'right-start',
    // relative to the window, not to the scrolling parent menu: flip/shift keep it on screen next to the sidebar (QA-D8)
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(2),
      flip({ padding: 8, fallbackPlacements: ['left-start', 'bottom-start', 'top-start'] }),
      shift({ padding: 8, crossAxis: true }),
      size({ padding: 8, apply: ({ availableHeight, elements }) => { Object.assign(elements.floating.style, { maxHeight: `${Math.max(160, availableHeight)}px` }); } }),
    ],
  });
  const motion = useFloatingMotion(open, isPositioned, placement, { scale: 0.98 });
  const closeTimer = useRef<number | null>(null);
  useEffect(() => () => void (closeTimer.current && clearTimeout(closeTimer.current)), []);
  const focusFirst = () => {
    // focus once the submenu exists and is placed (focusing a node at (0, 0) would scroll the menu)
    let n = 0;
    const tick = () => {
      const b = refs.floating.current?.querySelector('button:not(:disabled)') as HTMLElement | null;
      if (b) b.focus({ preventScroll: true });
      else if (n++ < 10) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const onKey = (ev: RKeyboardEvent) => {
    if (ev.key === 'ArrowRight' || ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      setOpen(true);
      focusFirst();
    }
  };
  return (
    <div
      // hover opens submenus for a real mouse only: after a tap the browser emits compatibility mouse events, which would
      // open a submenu over the item being tapped
      onPointerEnter={(e) => hoverOpens(e) && (closeTimer.current && clearTimeout(closeTimer.current), setOpen(true))}
      onPointerLeave={(e) => hoverOpens(e) && (closeTimer.current = window.setTimeout(() => setOpen(false), 160))}
    >
      <button
        ref={(el) => {
          itemRef(el);
          refs.setReference(el);
        }}
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        className="menu-item"
        data-active={active || open}
        data-id={item.id}
        {...itemProps}
        onKeyDown={onKey}
        onClick={() => setOpen(!open)}
      >
        {item.icon !== undefined && <span className="menu-icon">{item.icon}</span>}
        <span className="ellipsis">{item.label}</span>
        <span className="menu-hint">
          <ChevronRight size={14} />
        </span>
      </button>
      {motion.isMounted && (
        <div
          ref={refs.setFloating}
          style={{ ...floatingStyles, ...motion.styles }}
          className="menu"
          role="menu"
          aria-label={typeof item.label === 'string' ? item.label : undefined}
          {...motion.props}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
              (refs.reference.current as HTMLElement | null)?.focus();
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              e.stopPropagation();
              const btns = [...(refs.floating.current?.querySelectorAll('button:not(:disabled)') ?? [])] as HTMLElement[];
              const i = btns.indexOf(document.activeElement as HTMLElement);
              btns[(i + (e.key === 'ArrowDown' ? 1 : btns.length - 1)) % btns.length]?.focus();
            }
          }}
        >
          {tidyEntries(item.children ?? []).map((c, i) =>
            'separator' in c ? (
              <div key={i} className="menu-sep" role="separator" />
            ) : 'header' in c ? (
              <div key={i} className="menu-label">{c.label}</div>
            ) : (
              <button
                key={c.id}
                role={c.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
                aria-checked={c.checked}
                className={'menu-item' + (c.danger ? ' danger' : '')}
                data-id={c.id}
                disabled={c.disabled}
                onClick={() => {
                  onClose();
                  c.onSelect?.();
                }}
              >
                {c.icon !== undefined && <span className="menu-icon">{c.icon}</span>}
                <span className="ellipsis">{c.label}</span>
                {c.checked && <span className="menu-hint">✓</span>}
                {c.shortcut && <span className="menu-hint">{formatShortcut(c.shortcut)}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
