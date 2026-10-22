import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';

export interface SuggestionItem {
  id: string;
  title: string;
  hint?: string;
  group?: string;
  icon?: ReactNode;
  shortcut?: string;
}

export interface SuggestionListHandle {
  onKeyDown(e: KeyboardEvent): boolean;
}

interface Props {
  items: SuggestionItem[];
  loading?: boolean;
  empty?: string;
  label: string;
  onSelect(item: SuggestionItem): void;
}

/** Keyboard-driven popup list used by "/", "@" and "[[" menus. */
export const SuggestionList = forwardRef<SuggestionListHandle, Props>(function SuggestionList({ items, loading, empty, label, onSelect }, ref) {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => setActive(0), [items]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  useImperativeHandle(ref, () => ({
    onKeyDown(e) {
      if (e.key === 'ArrowDown') {
        setActive((a) => (items.length ? (a + 1) % items.length : 0));
        return true;
      }
      if (e.key === 'ArrowUp') {
        setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0));
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (items[active]) {
          onSelect(items[active]);
          return true;
        }
        return false;
      }
      return false;
    },
  }));
  let lastGroup: string | undefined;
  return (
    <div className="menu suggestion-menu" role="listbox" aria-label={label} ref={listRef}>
      {items.map((it, i) => {
        const header = it.group && it.group !== lastGroup ? it.group : null;
        lastGroup = it.group;
        return (
          <div key={it.id}>
            {header && <div className="menu-label">{header}</div>}
            <button
              type="button"
              data-index={i}
              role="option"
              aria-selected={i === active}
              className="menu-item"
              data-active={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(it)}
            >
              {it.icon && <span className="menu-icon suggestion-icon">{it.icon}</span>}
              <span className="col" style={{ gap: 0, minWidth: 0 }}>
                <span className="ellipsis">{it.title}</span>
                {it.hint && <span className="small muted ellipsis">{it.hint}</span>}
              </span>
              {it.shortcut && <span className="menu-hint">{it.shortcut}</span>}
            </button>
          </div>
        );
      })}
      {loading && !items.length && <div className="menu-label">Поиск…</div>}
      {!loading && !items.length && <div className="menu-label">{empty ?? 'Ничего не найдено'}</div>}
    </div>
  );
});
