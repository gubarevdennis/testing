import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { ClipboardPaste, X } from 'lucide-react';
import { pasteOptionsKey, applyPasteMode, closePasteOptions, type PasteMode } from '../extensions/pasteOptions';

const MODES: Array<{ mode: PasteMode; label: string; hint: string }> = [
  { mode: 'keep', label: 'Сохранить форматирование', hint: 'Как в источнике (очищено от лишних стилей)' },
  { mode: 'merge', label: 'Объединить', hint: 'Структура и выделение из источника, оформление — как на странице' },
  { mode: 'text', label: 'Только текст', hint: 'Без форматирования (также Ctrl+Shift+V)' },
];

/** Floating chip after a formatted paste with the three paste variants (R-CLIPBOARD-009). */
export function PasteOptionsMenu({ editor }: { editor: Editor }) {
  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const s = pasteOptionsKey.getState(e.state);
      return s ? { to: s.to, mode: s.mode } : null;
    },
  });
  if (!st) return null;
  let pos: { left: number; top: number } | null = null;
  try {
    const c = editor.view.coordsAtPos(Math.min(st.to, editor.state.doc.content.size));
    pos = { left: c.left, top: c.bottom + 6 };
  } catch {
    pos = null;
  }
  if (!pos) return null;
  return (
    <div className="paste-options" role="toolbar" aria-label="Параметры вставки" style={{ position: 'fixed', left: Math.max(8, Math.min(pos.left, window.innerWidth - 420)), top: Math.min(pos.top, window.innerHeight - 48) }} onMouseDown={(e) => e.preventDefault()}>
      <ClipboardPaste size={15} aria-hidden className="muted" />
      {MODES.map((m) => (
        <button key={m.mode} className="btn ghost sm" aria-pressed={st.mode === m.mode} title={m.hint} onClick={() => applyPasteMode(editor, m.mode)}>
          {m.label}
        </button>
      ))}
      <button className="icon-btn sm" aria-label="Закрыть параметры вставки" onClick={() => closePasteOptions(editor)}>
        <X size={14} />
      </button>
    </div>
  );
}
