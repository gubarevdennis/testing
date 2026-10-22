/**
 * Remembers the caret/selection of each page (per browser tab) and restores it after the editor mounts on
 * Back/Forward or reload (R-EDITOR-001, R-EDITOR-037). Positions are stored relative to stable block ids, so
 * edits made meanwhile by others (or before the block) do not move the restored caret into another block.
 * The scroll position of the page is restored separately by hooks/useScrollRestore.ts.
 */
import { useEffect } from 'react';
import { useNavigationType } from 'react-router-dom';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';

export interface BlockAnchor {
  blockId: string;
  offset: number;
}
export interface SavedSelection {
  anchor: BlockAnchor;
  head: BlockAnchor;
}

/** Position → (nearest textblock with an id, offset inside it). */
export function posToAnchor(doc: PMNode, pos: number): BlockAnchor | null {
  const $p = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  for (let d = $p.depth; d > 0; d--) {
    const n = $p.node(d);
    if (n.attrs.id && n.isTextblock) return { blockId: n.attrs.id, offset: $p.pos - $p.start(d) };
  }
  for (let d = $p.depth; d > 0; d--) {
    const n = $p.node(d);
    if (n.attrs.id) return { blockId: n.attrs.id, offset: $p.pos - $p.start(d) };
  }
  return null;
}

/** (block id, offset) → position, clamped into the block; null when the block no longer exists. */
export function anchorToPos(doc: PMNode, a: BlockAnchor): number | null {
  let found: number | null = null;
  doc.descendants((n, pos) => {
    if (found !== null) return false;
    if (n.attrs.id === a.blockId) {
      found = pos + 1 + Math.max(0, Math.min(a.offset, n.content.size));
      return false;
    }
    return true;
  });
  return found;
}

const key = (pageId: string) => 'kb:sel:' + pageId;

export function loadSelection(pageId: string): SavedSelection | null {
  try {
    const raw = sessionStorage.getItem(key(pageId));
    return raw ? (JSON.parse(raw) as SavedSelection) : null;
  } catch {
    return null;
  }
}

function saveSelection(pageId: string, sel: SavedSelection) {
  try {
    sessionStorage.setItem(key(pageId), JSON.stringify(sel));
  } catch {
    /* storage unavailable */
  }
}

/** Restores the saved selection of the page (when allowed) and keeps saving it while the user works. */
export function useSelectionMemory(editor: Editor | null, pageId: string, restoreAllowed: boolean) {
  const navType = useNavigationType();
  useEffect(() => {
    if (!editor) return;
    if (restoreAllowed && navType === 'POP' && editor.isEditable) {
      const saved = loadSelection(pageId);
      const doc = editor.state.doc;
      const from = saved && anchorToPos(doc, saved.anchor);
      const to = saved && anchorToPos(doc, saved.head);
      if (from != null && to != null) {
        try {
          editor.chain().setTextSelection({ from, to }).focus(undefined, { scrollIntoView: false }).run();
        } catch {
          /* position became invalid */
        }
      }
    }
    let t: ReturnType<typeof setTimeout> | null = null;
    const on = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        const { anchor, head } = editor.state.selection;
        const a = posToAnchor(editor.state.doc, anchor);
        const h = posToAnchor(editor.state.doc, head);
        if (a && h) saveSelection(pageId, { anchor: a, head: h });
      }, 250);
    };
    editor.on('selectionUpdate', on);
    return () => {
      if (t) clearTimeout(t);
      editor.off('selectionUpdate', on);
    };
    // restore only once per mounted editor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, pageId]);
}
