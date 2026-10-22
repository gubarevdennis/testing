import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { Search, FileText, Clock, Plus, Home, Trash2, LayoutTemplate, Upload, HelpCircle, Settings } from 'lucide-react';
import { get } from '../api/client';
import { useRecent } from '../hooks/data';
import { useHelp } from '../help/HelpCenter';

export const useQuickSwitcher = create<{ isOpen: boolean; open(): void; close(): void }>((set) => ({ isOpen: false, open: () => set({ isOpen: true }), close: () => set({ isOpen: false }) }));

interface Item {
  id: string;
  label: string;
  icon: React.ReactNode;
  hint?: string;
  run(): void;
}

/** Ctrl/Cmd+K: jump to pages (typo/layout tolerant), recent pages, and commands; fully keyboard driven. */
export function QuickSwitcher() {
  const { isOpen, close } = useQuickSwitcher();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const recent = useRecent();
  const inputRef = useRef<HTMLInputElement>(null);
  const commands: Item[] = useMemo(
    () => [
      { id: 'c-search', label: 'Расширенный поиск', icon: <Search size={15} />, run: () => navigate('/search' + (q ? '?q=' + encodeURIComponent(q) : '')) },
      { id: 'c-home', label: 'Главная', icon: <Home size={15} />, run: () => navigate('/') },
      { id: 'c-templates', label: 'Шаблоны', icon: <LayoutTemplate size={15} />, run: () => navigate('/templates') },
      { id: 'c-import', label: 'Импорт документов', icon: <Upload size={15} />, run: () => navigate('/import') },
      { id: 'c-trash', label: 'Корзина', icon: <Trash2 size={15} />, run: () => navigate('/trash') },
      { id: 'c-settings', label: 'Настройки', icon: <Settings size={15} />, run: () => navigate('/settings') },
      { id: 'c-help', label: 'Справка и горячие клавиши', icon: <HelpCircle size={15} />, hint: '?', run: () => useHelp.getState().open() },
    ],
    [navigate, q],
  );
  useEffect(() => {
    if (!isOpen) return;
    setQ('');
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      if (!q.trim()) {
        setItems([
          ...(recent.data?.pages ?? []).slice(0, 8).map((p) => ({ id: p.id, label: p.title || 'Без названия', icon: p.icon ?? <Clock size={15} />, hint: 'недавно', run: () => navigate('/p/' + p.id) })),
          ...commands,
        ]);
        return;
      }
      try {
        const r = await get(`/api/v1/search/suggest?q=${encodeURIComponent(q)}`, ctrl.signal);
        const cmd = commands.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));
        setItems([
          ...r.suggestions.map((s: any) => ({ id: s.pageId, label: s.title || 'Без названия', icon: s.icon ?? <FileText size={15} />, run: () => navigate('/p/' + s.pageId) })),
          { id: 'full', label: `Искать «${q}» во всех материалах`, icon: <Search size={15} />, hint: 'Enter', run: () => navigate('/search?q=' + encodeURIComponent(q)) },
          ...cmd,
        ]);
        setActive(0);
      } catch {
        /* aborted or offline */
      }
    }, 120);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, isOpen, recent.data, commands, navigate]);
  if (!isOpen) return null;
  const run = (i: Item) => {
    close();
    i.run();
  };
  return createPortal(
    <div className="dialog-backdrop switcher-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="switcher" role="dialog" aria-modal="true" aria-label="Быстрый переход">
        <div className="switcher-input">
          <Search size={18} className="muted" />
          <input
            ref={inputRef}
            value={q}
            placeholder="Найти страницу или команду…"
            aria-label="Найти страницу или команду"
            aria-controls="switcher-list"
            aria-activedescendant={items[active] ? 'sw-' + items[active].id : undefined}
            role="combobox"
            aria-expanded
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter' && items[active]) {
                e.preventDefault();
                run(items[active]);
              } else if (e.key === 'Escape') close();
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="switcher-list" id="switcher-list" role="listbox">
          {items.map((i, k) => (
            <button key={i.id} id={'sw-' + i.id} role="option" aria-selected={k === active} className={'switcher-item' + (k === active ? ' active' : '')} onMouseMove={() => setActive(k)} onClick={() => run(i)}>
              <span className="switcher-icon">{i.icon}</span>
              <span className="ellipsis grow">{i.label}</span>
              {i.hint && <span className="muted small">{i.hint}</span>}
            </button>
          ))}
          {!items.length && <div className="muted small" style={{ padding: 16 }}>Ничего не найдено</div>}
        </div>
        <div className="switcher-footer small muted">
          <span><kbd>↑</kbd> <kbd>↓</kbd> выбрать</span>
          <span><kbd>Enter</kbd> открыть</span>
          <span className="row" style={{ gap: 4 }}><Plus size={12} /> Подсказка: опечатки и неверная раскладка учитываются</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
