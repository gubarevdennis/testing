/**
 * Resizing pictures by mouse/touch like Notion (R-MEDIA-012): handles on both sides and at the corners, the picture
 * keeps its proportions (only the width is stored, the height follows), the size is shown while dragging, the width
 * snaps to common sizes (¼, ⅓, ½, ⅔, ¾ of the column, the full column, the picture's own size; Alt turns snapping off),
 * Esc cancels. The new width is written in one transaction (one Undo step). Used by block and inline pictures; the
 * keyboard resize (Alt+Shift+←/→) is in extensions/blockOps.ts.
 */
import { useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { yUndoPluginKey } from '@tiptap/y-tiptap';

export type ResizeHandle = 'w' | 'e' | 'nw' | 'ne' | 'sw' | 'se';

export interface ResizeInput {
  handle: ResizeHandle;
  /** Pointer movement since the start. */
  dx: number;
  dy: number;
  startW: number;
  /** height / width of the picture, when known. */
  ratio: number | null;
  /** A centred picture grows on both sides: the side handle moves half as far as the width changes. */
  centered: boolean;
  min: number;
  max: number;
  /** Width of the text column (snap points). */
  container: number;
  natural: number | null;
  snap: boolean;
}

export const SNAP_FRACTIONS: Array<[number, string]> = [
  [0.25, '25%'],
  [1 / 3, '33%'],
  [0.5, '50%'],
  [2 / 3, '67%'],
  [0.75, '75%'],
  [1, '100%'],
];
const SNAP_PX = 8;

/** New width for a drag of a handle; `snapped` names the snap point it stuck to. Pure (unit-tested). */
export function resizeWidth(i: ResizeInput): { width: number; snapped: string | null } {
  const sx = i.handle.includes('w') ? -1 : 1;
  const sy = i.handle.startsWith('n') ? -1 : i.handle.startsWith('s') ? 1 : 0;
  const byX = i.dx * sx * (i.centered ? 2 : 1);
  // corners: the pointer's dominant direction decides (dragging down a corner makes the picture taller → wider)
  const byY = sy && i.ratio ? (i.dy * sy) / i.ratio : null;
  const dw = byY != null && Math.abs(byY) > Math.abs(byX) ? byY : byX;
  let width = Math.round(Math.max(i.min, Math.min(i.max, i.startW + dw)));
  let snapped: string | null = null;
  if (i.snap) {
    const points: Array<[number, string]> = SNAP_FRACTIONS.map(([f, label]) => [Math.round(i.container * f), label]);
    if (i.natural) points.push([Math.round(i.natural), 'исходный размер']);
    let best = SNAP_PX + 1;
    for (const [px, label] of points) {
      if (px < i.min || px > i.max) continue;
      const d = Math.abs(px - width);
      if (d <= SNAP_PX && d < best) {
        best = d;
        snapped = label;
        width = px;
      }
    }
  }
  return { width, snapped };
}

/** Sets the width of the picture at `pos` in one Undo step and keeps it selected. */
export function commitImageWidth(editor: Editor, pos: number, width: number) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.attrs.width === width) return;
  const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, width });
  tr.setSelection(NodeSelection.create(tr.doc, pos));
  const um = yUndoPluginKey.getState(editor.state)?.undoManager;
  um?.stopCapturing(); // not merged with typing just before…
  editor.view.dispatch(tr);
  um?.stopCapturing(); // …or after
}

interface Options {
  editor: Editor;
  getPos: () => number | undefined;
  /** The element whose width is the picture's current width. */
  measure: () => HTMLElement | null;
  ratio: number | null;
  centered: boolean;
  min: number;
  max: () => number;
  container: () => number;
  natural: number | null;
}

/** Drag state and handle elements for a picture node view. */
export function useImageResize(o: Options) {
  const [drag, setDrag] = useState<{ width: number; snapped: string | null } | null>(null);
  const live = useRef<{ width: number } | null>(null);
  const opts = useRef(o);
  opts.current = o;

  const start = (e: React.PointerEvent<HTMLElement>, handle: ResizeHandle) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault(); // keep the focus (and the caret/selection) in the document
    e.stopPropagation();
    const el = e.currentTarget;
    const o0 = opts.current;
    const startW = o0.measure()?.getBoundingClientRect().width ?? 200;
    const sx = e.clientX;
    const sy = e.clientY;
    const max = o0.max();
    const container = o0.container();
    el.setPointerCapture(e.pointerId);
    document.body.classList.add('kb-resizing');
    const move = (ev: PointerEvent) => {
      const r = resizeWidth({ handle, dx: ev.clientX - sx, dy: ev.clientY - sy, startW, ratio: o0.ratio, centered: o0.centered, min: o0.min, max, container, natural: o0.natural, snap: !ev.altKey });
      live.current = { width: r.width };
      setDrag(r);
    };
    const end = (commit: boolean) => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('lostpointercapture', up);
      window.removeEventListener('keydown', key, true);
      document.body.classList.remove('kb-resizing');
      const w = live.current?.width;
      live.current = null;
      setDrag(null);
      const pos = o0.getPos();
      if (commit && w != null && Math.abs(w - startW) >= 1 && pos != null && pos >= 0) commitImageWidth(o0.editor, pos, w);
    };
    const up = () => end(true);
    const cancel = () => end(false);
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopPropagation();
      end(false);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('lostpointercapture', up);
    window.addEventListener('keydown', key, true);
  };

  const handles = (list: ResizeHandle[], extraClass = '') =>
    list.map((h) => (
      <span
        key={h}
        className={`kb-resize ${h === 'w' ? 'left' : h === 'e' ? 'right' : 'corner ' + h}${extraClass}`}
        contentEditable={false}
        data-handle={h}
        onPointerDown={(e) => start(e, h)}
        aria-hidden
      />
    ));

  const badge = drag ? (
    <span className="kb-resize-badge" contentEditable={false}>
      {drag.width}
      {o.ratio ? ` × ${Math.round(drag.width * o.ratio)}` : ''} px{drag.snapped ? ` · ${drag.snapped}` : ''}
    </span>
  ) : null;

  return { width: drag?.width ?? null, handles, badge, resizing: !!drag };
}
