import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { selectTopLevelBlocks } from '../extensions/blockOps';

/**
 * Lasso (rubber-band) selection of blocks with the mouse: dragging from the empty margin beside the text draws a
 * rectangle, and the blocks it touches become one block range — the same selection as Esc + Shift+↑/↓, so moving by
 * the ⋮⋮ handle, the block menu, copy/cut and Delete apply to all of them. Esc cancels. Mouse only: on touch the
 * margin scrolls the page.
 */
export function LassoSelect({ editor, scope }: { editor: Editor; scope: () => HTMLElement | null }) {
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const drag = useRef<{ x: number; y: number; started: boolean } | null>(null);

  useEffect(() => {
    const root = scope();
    if (!root) return;
    const blocks = () => Array.from(editor.view.dom.children) as HTMLElement[];
    const update = (x: number, y: number) => {
      const d = drag.current!;
      const top = Math.min(d.y, y);
      const bottom = Math.max(d.y, y);
      setRect({ x: Math.min(d.x, x), y: top, w: Math.abs(x - d.x), h: bottom - top });
      let first = -1;
      let last = -1;
      blocks().forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.height && r.bottom >= top && r.top <= bottom) {
          if (first < 0) first = i;
          last = i;
        }
      });
      if (first >= 0) selectTopLevelBlocks(editor, first, last);
    };
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.started && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
      d.started = true;
      e.preventDefault();
      // autoscroll near the edges of the scroll container
      const sr = root.getBoundingClientRect();
      if (e.clientY > sr.bottom - 40) root.scrollTop += 16;
      else if (e.clientY < sr.top + 40) root.scrollTop -= 16;
      update(e.clientX, e.clientY);
    };
    const end = () => {
      drag.current = null;
      setRect(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && end();
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.pointerType !== 'mouse' || !editor.isEditable) return;
      const t = e.target as HTMLElement;
      // only from empty space: not from text, controls, the title, menus or the block handle
      if (editor.view.dom.contains(t) || t.closest('button, a, input, textarea, select, [role="menu"], [role="dialog"], .block-handle, .kb-node-toolbar, .page-title-input, .page-header-bar, .kb-footnotes')) return;
      const er = editor.view.dom.getBoundingClientRect();
      if (e.clientY < er.top - 8 || e.clientY > er.bottom + 40) return; // beside the document, not above the title
      drag.current = { x: e.clientX, y: e.clientY, started: false };
      e.preventDefault(); // no native text selection while drawing
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', end);
      window.addEventListener('keydown', onKey, true);
    };
    root.addEventListener('pointerdown', onDown);
    return () => {
      root.removeEventListener('pointerdown', onDown);
      end();
    };
  }, [editor, scope]);

  if (!rect || rect.h < 2) return null;
  return <div className="kb-lasso" style={{ left: rect.x, top: rect.y, width: Math.max(rect.w, 2), height: rect.h }} aria-hidden />;
}
