import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent as RKeyboardEvent } from 'react';
import { useFloating, autoUpdate, offset, flip, shift, size, useClick, useDismiss, useRole, useInteractions, FloatingPortal, FloatingFocusManager, useListNavigation, type Placement } from '@floating-ui/react';
import { ChevronRight } from 'lucide-react';
import { formatShortcut } from './Tooltip';

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

interface MenuProps {
  trigger: (props: { ref: (el: HTMLElement | null) => void; open: boolean; props: Record<string, unknown> }) => ReactNode;
  items: MenuEntry[] | (() => MenuEntry[]);
  placement?: Placement;
  label?: string;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Accessible dropdown menu: keyboard navigation (arrows, Home/End, Enter, Esc), nested submenus,
 * stays inside the viewport (flip/shift/size with internal scroll) and returns focus to the trigger.
 */
export function Menu({ trigger, items, placement = 'bottom-start', label, onOpenChange }: MenuProps) {
  const [open, setOpenState] = useState(false);
  const setOpen = (o: boolean) => {
    setOpenState(o);
    onOpenChange?.(o);
  };
  const [active, setActive] = useState<number | null>(null);
  const listRef = useRef<Array<HTMLElement | null>>([]);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      flip({ padding: 8, fallbackAxisSideDirection: 'end' }),
      shift({ padding: 8 }),
      size({ padding: 8, apply: ({ availableHeight, elements }) => Object.assign(elements.floating.style, { maxHeight: `${Math.max(160, availableHeight)}px` }) }),
    ],
  });
  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'menu' });
  const nav = useListNavigation(context, { listRef, activeIndex: active, onNavigate: setActive, loop: true });
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([click, dismiss, role, nav]);
  const list = open ? (typeof items === 'function' ? items() : items) : [];
  let idx = -1;
  return (
    <>
      {trigger({ ref: refs.setReference, open, props: getReferenceProps({ 'aria-label': label }) })}
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false} initialFocus={-1} returnFocus>
            <div ref={refs.setFloating} style={floatingStyles} className="menu" {...getFloatingProps()} aria-label={label}>
              {list.map((e, i) => {
                if ('separator' in e) return <div key={'s' + i} className="menu-sep" role="separator" />;
                if ('header' in e) return <div key={'h' + i} className="menu-label">{e.label}</div>;
                if (!isItem(e)) return null;
                idx++;
                const myIdx = idx;
                if (e.children?.length)
                  return (
                    <SubMenu key={e.id} item={e} onClose={() => setOpen(false)} itemRef={(el) => (listRef.current[myIdx] = el)} itemProps={getItemProps()} active={active === myIdx} />
                  );
                return (
                  <button
                    key={e.id}
                    ref={(el) => (listRef.current[myIdx] = el)}
                    role={e.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
                    aria-checked={e.checked}
                    className={'menu-item' + (e.danger ? ' danger' : '')}
                    data-active={active === myIdx}
                    disabled={e.disabled}
                    title={e.disabled ? e.disabledReason : undefined}
                    {...getItemProps({
                      onClick() {
                        if (e.disabled) return;
                        setOpen(false);
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
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}

function SubMenu({ item, onClose, itemRef, itemProps, active }: { item: MenuItemDef; onClose: () => void; itemRef: (el: HTMLElement | null) => void; itemProps: Record<string, unknown>; active: boolean }) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles } = useFloating({ open, placement: 'right-start', whileElementsMounted: autoUpdate, middleware: [offset(2), flip({ padding: 8 }), shift({ padding: 8 })] });
  const closeTimer = useRef<number | null>(null);
  useEffect(() => () => void (closeTimer.current && clearTimeout(closeTimer.current)), []);
  const onKey = (ev: RKeyboardEvent) => {
    if (ev.key === 'ArrowRight' || ev.key === 'Enter') {
      ev.preventDefault();
      setOpen(true);
      setTimeout(() => (refs.floating.current?.querySelector('button') as HTMLElement | null)?.focus(), 0);
    }
  };
  return (
    <div onMouseEnter={() => (closeTimer.current && clearTimeout(closeTimer.current), setOpen(true))} onMouseLeave={() => (closeTimer.current = window.setTimeout(() => setOpen(false), 160))}>
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
      {open && (
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          className="menu"
          role="menu"
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
              (refs.reference.current as HTMLElement | null)?.focus();
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const btns = [...(refs.floating.current?.querySelectorAll('button') ?? [])] as HTMLElement[];
              const i = btns.indexOf(document.activeElement as HTMLElement);
              btns[(i + (e.key === 'ArrowDown' ? 1 : btns.length - 1)) % btns.length]?.focus();
            }
          }}
        >
          {(item.children ?? []).map((c, i) =>
            'separator' in c ? (
              <div key={i} className="menu-sep" />
            ) : 'header' in c ? (
              <div key={i} className="menu-label">{c.label}</div>
            ) : (
              <button
                key={c.id}
                role={c.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
                aria-checked={c.checked}
                className={'menu-item' + (c.danger ? ' danger' : '')}
                disabled={c.disabled}
                onClick={() => {
                  onClose();
                  c.onSelect?.();
                }}
              >
                {c.icon !== undefined && <span className="menu-icon">{c.icon}</span>}
                <span className="ellipsis">{c.label}</span>
                {c.checked && <span className="menu-hint">✓</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** Context menu at pointer position (right click / long press). */
export function useContextMenu() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  return { pos, open: (x: number, y: number) => setPos({ x, y }), close: () => setPos(null) };
}
