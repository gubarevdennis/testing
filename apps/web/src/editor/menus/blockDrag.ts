/**
 * Pointer-driven drag-and-drop of blocks from the ⋮⋮ handle (R-EDITOR-069/075/076, QA26-09).
 *
 *  - the drag starts only after the pointer moved DRAG_THRESHOLD px with the button held (a click opens the block menu);
 *  - a semi-transparent preview of the dragged blocks follows the pointer; the dragged blocks are dimmed;
 *  - an insertion line shows the exact target: before / after a block, or inside a callout / quote / toggle; the receiving
 *    column or container is outlined; invalid targets show a red line and the reason, and dropping there does nothing;
 *  - near the top / bottom edge of the scrolling area the page scrolls (faster closer to the edge);
 *  - Alt (or Ctrl) held while dropping copies instead of moving; Esc cancels;
 *  - dropping on a page in the sidebar tree moves the blocks to that page (through moveBlocksToPage: never lost);
 *  - the drop is one transaction = one Undo step; typing before and after it stays in separate steps.
 */
import type { Editor } from '@tiptap/core';
import type { EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { CONTAINERS, dragSource, dropTransaction, insideEnd, movableAt, planDrop, type DragSource, type DropPlan } from '../blockDrop';
import { blockRangeKey, dispatchAtomic } from '../extensions/blockOps';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** Dims the dragged blocks (a decoration: class changes made directly on the DOM are redrawn away by the editor). */
const dragSourceKey = new PluginKey<DragSource | null>('kbDragSource');
export const BlockDragDecorations = Extension.create({
  name: 'kbBlockDragDecorations',
  addProseMirrorPlugins() {
    return [
      new Plugin<DragSource | null>({
        key: dragSourceKey,
        state: {
          init: () => null,
          apply: (tr, v) => {
            const m = tr.getMeta(dragSourceKey);
            if (m !== undefined) return m;
            return v && tr.docChanged ? { from: tr.mapping.map(v.from, 1), to: tr.mapping.map(v.to, -1) } : v;
          },
        },
        props: {
          decorations(state) {
            const r = dragSourceKey.getState(state);
            if (!r || r.to <= r.from) return null;
            const decos: Decoration[] = [];
            const $from = state.doc.resolve(r.from);
            let pos = r.from;
            for (let i = $from.index(); pos < r.to && i < $from.parent.childCount; i++) {
              const n = $from.parent.child(i);
              decos.push(Decoration.node(pos, pos + n.nodeSize, { class: 'kb-drag-source' }));
              pos += n.nodeSize;
            }
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});

export const DRAG_THRESHOLD = 5;
const EDGE = 56;
const MAX_SPEED = 22;

export interface PageDrop {
  pageId: string;
  title: string;
}

interface Options {
  editor: Editor;
  pageId: string;
  /** Called for a drop on another page in the sidebar tree. */
  onDropToPage(source: DragSource, target: PageDrop): void;
}

type Target = { kind: 'block'; plan: DropPlan } | { kind: 'page'; page: PageDrop; row: HTMLElement; valid: boolean; reason?: string } | null;

function scrollParent(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement;
}

function el(cls: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  document.body.append(d);
  return d;
}

/** Block target under a viewport point. */
export function blockTargetAt(view: EditorView, source: DragSource, x: number, y: number): DropPlan | null {
  const box = view.dom.getBoundingClientRect();
  const cx = Math.min(Math.max(x, box.left + 8), box.right - 8);
  const cy = Math.min(Math.max(y, box.top + 2), box.bottom - 2);
  const hit = view.posAtCoords({ left: cx, top: cy });
  if (!hit) return null;
  const doc = view.state.doc;
  let cand: { pos: number; node: PMNode } | null = null;
  // an atom block under the pointer (image, file, embed…) is a target itself
  if (hit.inside >= 0) {
    const n = doc.nodeAt(hit.inside);
    if (n?.isBlock && n.isAtom && CONTAINERS.has(doc.resolve(hit.inside).parent.type.name)) cand = { pos: hit.inside, node: n };
  }
  const $p = doc.resolve(Math.min(hit.pos, doc.content.size));
  if (!cand) cand = movableAt($p);
  if (!cand) {
    const n = $p.nodeAfter ?? $p.nodeBefore;
    if (!n) return null;
    cand = { pos: $p.nodeAfter ? $p.pos : $p.pos - n.nodeSize, node: n };
  }
  const dom = view.nodeDOM(cand.pos) as HTMLElement | null;
  if (!dom?.getBoundingClientRect) return null;
  const r = dom.getBoundingClientRect();
  const inside = insideEnd(cand.node, cand.pos);
  const rel = r.height ? (cy - r.top) / r.height : 0.5;
  let side: DropPlan['side'];
  if (inside != null) side = rel < 0.25 ? 'before' : rel > 0.75 ? 'after' : 'inside';
  else side = rel < 0.5 ? 'before' : 'after';
  const pos = side === 'before' ? cand.pos : side === 'after' ? cand.pos + cand.node.nodeSize : inside!;
  return planDrop(view.state, source, pos, side, cand.pos);
}

/** Starts tracking a possible drag from the handle; returns true when a drag actually started (to suppress the click). */
export function startBlockDrag(o: Options, down: PointerEvent, handlePos: number): { dragged: () => boolean } {
  const { editor } = o;
  const view = editor.view;
  const startX = down.clientX;
  const startY = down.clientY;
  let started = false;
  let source: DragSource | null = null;
  let target: Target = null;
  let copy = false;
  let last = { x: startX, y: startY };
  let raf = 0;
  let preview: HTMLDivElement | null = null;
  let line: HTMLDivElement | null = null;
  let box: HTMLDivElement | null = null;
  let label: HTMLDivElement | null = null;
  let pageRow: HTMLElement | null = null;
  const scroller = scrollParent(view.dom as HTMLElement);

  const begin = () => {
    source = dragSource(editor.state, handlePos, blockRangeKey.getState(editor.state) ?? null);
    if (!source) return false;
    started = true;
    document.body.classList.add('kb-block-dragging');
    // preview: the first blocks, semi-transparent
    preview = el('kb-drag-preview');
    let pos = source.from;
    let count = 0;
    while (pos < source.to) {
      const node = editor.state.doc.nodeAt(pos);
      if (!node) break;
      const dom = view.nodeDOM(pos) as HTMLElement | null;
      if (dom?.cloneNode) {
        if (count < 3) {
          const c = dom.cloneNode(true) as HTMLElement;
          c.removeAttribute('id');
          c.querySelectorAll('[id]').forEach((x) => x.removeAttribute('id'));
          preview.append(c);
        }
      }
      count++;
      pos += node.nodeSize;
    }
    const first = view.nodeDOM(source.from) as HTMLElement | null;
    preview.style.width = `${Math.min(first?.getBoundingClientRect().width ?? 480, 640)}px`;
    if (count > 1) {
      const badge = document.createElement('span');
      badge.className = 'kb-drag-count';
      badge.textContent = `${count} ${count < 5 ? 'блока' : 'блоков'}`;
      preview.append(badge);
    }
    view.dispatch(view.state.tr.setMeta(dragSourceKey, source).setMeta('addToHistory', false));
    line = el('kb-drop-line');
    box = el('kb-drop-container');
    label = el('kb-drop-label');
    line.hidden = box.hidden = label.hidden = true;
    return true;
  };

  const pageAt = (x: number, y: number): Target => {
    const hit = document.elementFromPoint(x, y) as HTMLElement | null;
    const row = hit?.closest?.('.tree-row') as HTMLElement | null;
    const link = row?.querySelector('a.tree-title') as HTMLAnchorElement | null;
    const m = link && /\/p\/([^/?#]+)/.exec(link.getAttribute('href') ?? '');
    if (!row || !m) return null;
    const page = { pageId: m[1], title: link!.textContent ?? '' };
    if (page.pageId === o.pageId) return { kind: 'page', page, row, valid: false, reason: 'Блок уже на этой странице' };
    if (!row.querySelector('.tree-handle')) return { kind: 'page', page, row, valid: false, reason: 'Нет права редактировать эту страницу' };
    return { kind: 'page', page, row, valid: true };
  };

  const render = () => {
    if (!line || !box || !label || !preview) return;
    preview.style.transform = `translate(${last.x + 14}px, ${last.y + 10}px)`;
    preview.classList.toggle('copy', copy);
    pageRow?.classList.remove('kb-block-drop-page', 'invalid');
    pageRow = null;
    line.hidden = box.hidden = label.hidden = true;
    if (!target) return;
    const show = (text: string | undefined, bad: boolean) => {
      if (!text) return;
      label!.hidden = false;
      label!.textContent = text;
      label!.classList.toggle('invalid', bad);
      label!.style.transform = `translate(${last.x + 14}px, ${last.y - 30}px)`;
    };
    if (target.kind === 'page') {
      pageRow = target.row;
      pageRow.classList.add('kb-block-drop-page');
      pageRow.classList.toggle('invalid', !target.valid);
      show(target.valid ? `${copy ? 'Скопировать' : 'Переместить'} на страницу «${target.page.title || 'Без названия'}»` : target.reason, !target.valid);
      return;
    }
    const plan = target.plan;
    if (plan.noop && !copy) return;
    const dom = view.nodeDOM(plan.blockPos) as HTMLElement | null;
    if (!dom?.getBoundingClientRect) return;
    const r = dom.getBoundingClientRect();
    line.hidden = false;
    line.dataset.side = plan.side;
    line.dataset.valid = String(plan.valid);
    line.classList.toggle('invalid', !plan.valid);
    let y = plan.side === 'before' ? r.top - 3 : r.bottom + 1;
    let left = r.left;
    let width = r.width;
    // receiving container: the column / callout / quote / toggle (or the block itself for "inside")
    const containerPos = plan.side === 'inside' ? plan.blockPos : plan.containerPos;
    let cdom = containerPos != null ? (view.nodeDOM(containerPos) as HTMLElement | null) : null;
    if (cdom && editor.state.doc.nodeAt(containerPos!)?.type.name === 'detailsContent') cdom = cdom.closest('[data-type="details"]') ?? cdom;
    if (cdom?.getBoundingClientRect) {
      const c = cdom.getBoundingClientRect();
      box.hidden = false;
      box.classList.toggle('invalid', !plan.valid);
      Object.assign(box.style, { left: `${c.left - 4}px`, top: `${c.top - 4}px`, width: `${c.width + 8}px`, height: `${c.height + 8}px` });
      if (plan.side === 'inside') {
        y = c.bottom - 6;
        left = c.left + 12;
        width = c.width - 24;
      }
    }
    Object.assign(line.style, { left: `${left}px`, top: `${y}px`, width: `${width}px` });
    if (!plan.valid) show(plan.reason, true);
    else if (copy) show('Копия', false);
  };

  const locate = () => {
    if (!source) return;
    // over the page's scrolling area (the editor and its margins): a block target; elsewhere: a page in the tree
    const s = scroller === document.scrollingElement ? (view.dom as HTMLElement).getBoundingClientRect() : scroller.getBoundingClientRect();
    if (last.x >= s.left && last.x <= s.right) {
      const plan = blockTargetAt(view, source, last.x, last.y);
      target = plan ? { kind: 'block', plan } : null;
    } else target = pageAt(last.x, last.y);
    render();
  };

  const tick = () => {
    raf = 0;
    if (!started) return;
    // autoscroll near the edges of the scrolling area
    const s = scroller === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
    let dy = 0;
    if (last.y < s.top + EDGE) dy = -Math.ceil(((s.top + EDGE - last.y) / EDGE) * MAX_SPEED);
    else if (last.y > s.bottom - EDGE) dy = Math.ceil(((last.y - (s.bottom - EDGE)) / EDGE) * MAX_SPEED);
    if (dy) {
      const before = scroller.scrollTop;
      scroller.scrollTop += Math.max(-MAX_SPEED, Math.min(MAX_SPEED, dy));
      if (scroller.scrollTop !== before) raf = requestAnimationFrame(tick);
    }
    locate();
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const onMove = (e: PointerEvent) => {
    last = { x: e.clientX, y: e.clientY };
    copy = e.altKey || e.ctrlKey;
    if (!started) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD) return;
      if (!begin()) return finish(false);
    }
    e.preventDefault();
    schedule();
  };
  const onKey = (e: KeyboardEvent) => {
    if (!started) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
      return;
    }
    if (e.key === 'Alt' || e.key === 'Control') {
      copy = e.type === 'keydown';
      e.preventDefault();
      render();
    }
  };
  const onUp = (e: PointerEvent) => {
    last = { x: e.clientX, y: e.clientY };
    copy = e.altKey || e.ctrlKey;
    if (started) locate();
    finish(true);
  };
  const cleanup = () => {
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onCancel, true);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    if (raf) cancelAnimationFrame(raf);
    [preview, line, box, label].forEach((x) => x?.remove());
    pageRow?.classList.remove('kb-block-drop-page', 'invalid');
    if (started && !editor.isDestroyed && dragSourceKey.getState(view.state)) view.dispatch(view.state.tr.setMeta(dragSourceKey, null).setMeta('addToHistory', false));
    document.body.classList.remove('kb-block-dragging');
  };
  const onCancel = () => finish(false);
  function finish(drop: boolean) {
    cleanup();
    if (!started || !drop || !source || !target || editor.isDestroyed) return;
    if (target.kind === 'page') {
      if (target.valid) o.onDropToPage(source, target.page);
      return;
    }
    const tr = dropTransaction(editor.state, source, target.plan, copy);
    if (!tr) return;
    // the drop is its own undo step: not merged with typing before or after it
    dispatchAtomic(editor, tr);
    view.focus();
  }

  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onCancel, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  return { dragged: () => started };
}
