import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { FOOTNOTE_OPEN_EVENT, listFootnotes, openFootnote } from './extensions/footnotes';

/**
 * The notes of the page under its text (R-EDITOR-038): number, text, «↑» back to the reference. A click on a note opens
 * it at its reference for editing. Recomputed after a pause in typing (never per keystroke, D-34), only when the notes
 * actually changed.
 */
export function FootnotesList({ editor }: { editor: Editor }) {
  const [notes, setNotes] = useState(() => listFootnotes(editor.state.doc));
  const [flash, setFlash] = useState<number | null>(null);
  const sig = useRef('');
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const recompute = () => {
      t = null;
      if (editor.isDestroyed) return;
      const next = listFootnotes(editor.state.doc);
      const s = next.map((n) => n.pos + ':' + n.text).join('\u0001');
      if (s === sig.current) return;
      sig.current = s;
      setNotes(next);
    };
    const onUpdate = () => {
      if (t) clearTimeout(t);
      t = setTimeout(recompute, 400);
    };
    editor.on('update', onUpdate);
    recompute();
    return () => {
      editor.off('update', onUpdate);
      if (t) clearTimeout(t);
    };
  }, [editor]);

  useEffect(() => {
    const onReveal = (e: Event) => {
      const pos = (e as CustomEvent<{ pos: number }>).detail.pos;
      const fresh = listFootnotes(editor.state.doc);
      setNotes(fresh);
      const idx = fresh.findIndex((n) => n.pos === pos);
      if (idx < 0) return;
      setFlash(idx);
      setTimeout(() => setFlash(null), 1600);
      requestAnimationFrame(() => {
        const li = listRef.current?.children[idx] as HTMLElement | undefined;
        li?.scrollIntoView({ block: 'center' });
        li?.querySelector<HTMLElement>('.kb-fn-text')?.focus();
      });
    };
    window.addEventListener(FOOTNOTE_OPEN_EVENT, onReveal);
    return () => window.removeEventListener(FOOTNOTE_OPEN_EVENT, onReveal);
  }, [editor]);

  if (!notes.length) return null;
  return (
    <section className="kb-footnotes-list" aria-label="Сноски" data-testid="footnotes-list">
      <h2 className="kb-footnotes-title">Сноски</h2>
      <ol ref={listRef}>
        {notes.map((n, i) => (
          <li key={n.pos} id={`kb-note-${n.number}`} className={flash === i ? 'is-flash' : undefined}>
            <button type="button" className="kb-fn-text" onClick={() => openFootnote(editor, n.pos)} aria-label={`Сноска ${n.number}: открыть у ссылки в тексте`}>
              {n.text || <span className="muted">Пустая сноска</span>}
            </button>{' '}
            <button type="button" className="kb-fn-back icon-btn sm" onClick={() => openFootnote(editor, n.pos)} aria-label={`Вернуться к ссылке на сноску ${n.number}`} title="К ссылке в тексте">
              ↑
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
