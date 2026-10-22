import { useMemo, useState } from 'react';
import { useFloating, autoUpdate, offset, flip, shift, FloatingPortal, useDismiss, useInteractions } from '@floating-ui/react';
import { EMOJI } from '../lib/emoji';

/** Emoji/icon picker with Russian and English keyword search, recent icons and removal. */
export function IconPicker({ onPick, onRemove }: { onPick(icon: string): void; onRemove?: () => void }) {
  const [q, setQ] = useState('');
  const recent: string[] = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('kb:recentIcons') ?? '[]');
    } catch {
      return [];
    }
  }, []);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? EMOJI.filter((e) => e.k.includes(t)).slice(0, 240) : EMOJI.slice(0, 240);
  }, [q]);
  const pick = (e: string) => {
    try {
      localStorage.setItem('kb:recentIcons', JSON.stringify([e, ...recent.filter((x) => x !== e)].slice(0, 16)));
    } catch {
      /* ignore */
    }
    onPick(e);
  };
  return (
    <div className="icon-picker">
      <div className="row" style={{ padding: 8, gap: 6 }}>
        <input className="input" placeholder="Поиск: документ, склад, star…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Поиск иконки" />
        {onRemove && (
          <button className="btn sm" onClick={onRemove}>
            Убрать
          </button>
        )}
      </div>
      {!q && recent.length > 0 && (
        <>
          <div className="menu-label">Недавние</div>
          <div className="emoji-grid">
            {recent.map((e) => (
              <button key={'r' + e} className="emoji-btn" onClick={() => pick(e)} aria-label={e}>
                {e}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="emoji-grid" role="listbox" aria-label="Иконки">
        {list.map((e) => (
          <button key={e.e} className="emoji-btn" role="option" aria-selected={false} aria-label={e.k.split(' ')[0]} title={e.k.split(' ').slice(0, 3).join(', ')} onClick={() => pick(e.e)}>
            {e.e}
          </button>
        ))}
        {!list.length && <div className="muted small" style={{ padding: 8 }}>Ничего не найдено</div>}
      </div>
    </div>
  );
}

export function IconPickerPopover({ anchor, onPick, onClose, onRemove }: { anchor: HTMLElement; onPick(icon: string): void; onClose(): void; onRemove?: () => void }) {
  const { refs, floatingStyles, context } = useFloating({ open: true, onOpenChange: (o) => !o && onClose(), elements: { reference: anchor }, placement: 'bottom-start', whileElementsMounted: autoUpdate, middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })] });
  const dismiss = useDismiss(context);
  const { getFloatingProps } = useInteractions([dismiss]);
  return (
    <FloatingPortal>
      <div ref={refs.setFloating} style={floatingStyles} className="popover" {...getFloatingProps()}>
        <IconPicker onPick={onPick} onRemove={onRemove} />
      </div>
    </FloatingPortal>
  );
}
