/**
 * Block drag-and-drop model (R-EDITOR-069/075/076): what is dragged, where it may go, and the single transaction that
 * performs the drop. Pure ProseMirror logic (unit-tested); the pointer/overlay controller is menus/blockDrag.ts.
 *
 *  - Movable units are blocks whose parent is a container: the page, a column, a callout, a quote, a toggle's body.
 *    Lists, tables, images, callouts and column sets move as whole blocks (nested lists, table cells, captions inside).
 *  - Three kinds of target: before a block, after it, inside a container block (callout, quote, toggle: appended at the
 *    end of its content). A target inside the dragged range, column sets inside a column and anything the schema does
 *    not allow are invalid and carry a human-readable reason.
 *  - A drop is one transaction (one Undo step): the blocks keep their node ids and order; a copy (Alt/Ctrl held) gets
 *    new ids. A column or another container that would become empty keeps an empty paragraph.
 */
import { Fragment, type Node as PMNode, type ResolvedPos } from '@tiptap/pm/model';
import { NodeSelection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import { stripIds, withBlockRange } from './extensions/blockOps';

export const CONTAINERS = new Set(['doc', 'column', 'callout', 'blockquote', 'detailsContent']);

export interface DragSource {
  from: number;
  to: number;
}

export type DropSide = 'before' | 'after' | 'inside';

export interface DropPlan {
  /** Insertion position in the current document. */
  pos: number;
  side: DropSide;
  /** Block the indicator line is drawn at (before/after) or the container block that receives the blocks (inside). */
  blockPos: number;
  /** Position of the container node that will hold the blocks (null: the page itself). */
  containerPos: number | null;
  valid: boolean;
  /** Dropping here changes nothing (right where the blocks already are). */
  noop: boolean;
  reason?: string;
}

const LABEL: Record<string, string> = { column: 'колонку', callout: 'выноску', blockquote: 'цитату', detailsContent: 'раскрывающийся блок', doc: 'страницу' };

/** Where "inside" puts the blocks: the end of a callout / quote / toggle body; null for other blocks. */
export function insideEnd(node: PMNode, pos: number): number | null {
  const name = node.type.name;
  if (name === 'callout' || name === 'blockquote') return pos + node.nodeSize - 1;
  if (name === 'details') {
    let at: number | null = null;
    node.forEach((child, offset) => {
      if (child.type.name === 'detailsContent') at = pos + 1 + offset + child.nodeSize - 1;
    });
    return at;
  }
  return null;
}

/** The innermost movable block around a resolved position (its parent is a container), or null. */
export function movableAt($pos: ResolvedPos): { pos: number; node: PMNode; depth: number } | null {
  for (let d = $pos.depth; d >= 1; d--) {
    if (CONTAINERS.has($pos.node(d - 1).type.name)) return { pos: $pos.before(d), node: $pos.node(d), depth: d };
  }
  return null;
}

/**
 * What a drag from the handle of the block at `pos` moves: the multi-block selection (Esc, Shift+↑/↓) or a selected
 * block that contains it (Esc on a block inside a column selects the column set), several blocks covered by a text
 * selection, or the block itself.
 */
export function dragSource(state: EditorState, pos: number, range: DragSource | null): DragSource | null {
  const node = state.doc.nodeAt(pos);
  if (!node) return null;
  if (range && pos >= range.from && pos < range.to) return range;
  const sel = state.selection;
  if (sel instanceof NodeSelection && sel.node.isBlock && sel.from <= pos && pos < sel.to) return { from: sel.from, to: sel.to };
  const self = { from: pos, to: pos + node.nodeSize };
  if (!sel.empty && sel.from < self.to && sel.to > self.from) {
    const depth = state.doc.resolve(pos).depth; // depth of the container
    const $f = sel.$from;
    const $t = sel.$to;
    if ($f.depth > depth && $t.depth > depth && $f.node(depth) === $t.node(depth) && $f.node(depth) === state.doc.resolve(pos).parent) {
      const from = $f.before(depth + 1);
      const to = $t.after(depth + 1);
      if (to - from > node.nodeSize) return { from, to };
    }
  }
  return self;
}

function containsColumns(content: Fragment) {
  let found = false;
  content.descendants((n) => {
    if (n.type.name === 'columns') found = true;
    return !found;
  });
  return found;
}

/** Validates dropping `source` at `pos` (side as shown to the user). */
export function planDrop(state: EditorState, source: DragSource, pos: number, side: DropSide, blockPos: number): DropPlan {
  const doc = state.doc;
  const $ins = doc.resolve(pos);
  const $src = doc.resolve(source.from);
  const containerPos = $ins.depth > 0 ? $ins.before($ins.depth) : null;
  const plan: DropPlan = { pos, side, blockPos, containerPos, valid: true, noop: false };
  if (pos >= source.from && pos <= source.to) {
    if ($ins.depth === $src.depth && $ins.parent === $src.parent) return { ...plan, noop: true };
    return { ...plan, valid: false, reason: 'Нельзя переместить блок внутрь самого себя' };
  }
  const content = doc.slice(source.from, source.to).content;
  const parent = $ins.parent;
  if (!CONTAINERS.has(parent.type.name)) return { ...plan, valid: false, reason: 'Сюда блоки не помещаются' };
  let inColumn = false;
  for (let d = $ins.depth; d > 0; d--) if ($ins.node(d).type.name === 'column') inColumn = true;
  if (inColumn && containsColumns(content)) return { ...plan, valid: false, reason: 'Колонки нельзя вложить в колонку' };
  if (!parent.canReplace($ins.index(), $ins.index(), content)) return { ...plan, valid: false, reason: `Этот блок нельзя поместить в ${LABEL[parent.type.name] ?? 'этот блок'}` };
  return plan;
}

/** Copies blocks for an Alt/Ctrl-drag: same content, fresh ids (assigned by ClientBlockIds). */
function copyOf(content: Fragment): Fragment {
  const out: PMNode[] = [];
  content.forEach((n) => out.push(stripIds(n)));
  return Fragment.fromArray(out);
}

/**
 * The drop as one transaction. Returns null for an invalid or no-op plan. The moved (or copied) blocks are selected
 * afterwards: a single block as a node selection, several as a block range.
 */
export function dropTransaction(state: EditorState, source: DragSource, plan: DropPlan, copy: boolean): Transaction | null {
  if (!plan.valid || (plan.noop && !copy)) return null;
  const slice = state.doc.slice(source.from, source.to);
  if (slice.openStart || slice.openEnd) return null;
  const content = copy ? copyOf(slice.content) : slice.content;
  const size = content.size;
  const tr = state.tr;
  tr.insert(plan.pos, content);
  let from = plan.pos;
  if (!copy) {
    const shift = plan.pos <= source.from ? size : 0;
    const $s = tr.doc.resolve(source.from + shift);
    const parent = $s.parent;
    const all = $s.index() === 0 && tr.doc.resolve(source.to + shift).index($s.depth) === parent.childCount;
    // a column / callout / quote must keep at least one block
    if (all && parent.type.name !== 'doc' && !parent.type.contentMatch.validEnd) tr.replaceWith(source.from + shift, source.to + shift, state.schema.nodes.paragraph.create());
    else tr.delete(source.from + shift, source.to + shift);
    from = tr.mapping.slice(1).map(plan.pos, -1);
  }
  const to = from + size;
  const first = tr.doc.nodeAt(from);
  if (first && first.nodeSize === size && NodeSelection.isSelectable(first)) tr.setSelection(NodeSelection.create(tr.doc, from));
  else if (size > 0) withBlockRange(tr, from, to);
  else tr.setSelection(TextSelection.near(tr.doc.resolve(from)));
  return tr.setMeta('kbBlockDrop', { copy }).setMeta('uiEvent', 'drop').scrollIntoView();
}

/**
 * Keyboard alternative for moving out of a container (Alt+Shift+↑ on the first / ↓ on the last block of a column,
 * callout, quote or toggle): the block goes right before / after the container.
 */
export function moveOutTransaction(state: EditorState, source: DragSource, dir: -1 | 1): Transaction | null {
  const $pos = state.doc.resolve(source.from);
  let d = $pos.depth;
  if (d === 0) return null;
  while (d > 0 && !CONTAINERS.has($pos.node(d - 1).type.name)) d--;
  if (d === 0) return null;
  const outerPos = $pos.before(d);
  const pos = dir === -1 ? outerPos : outerPos + $pos.node(d).nodeSize;
  const plan = planDrop(state, source, pos, dir === -1 ? 'before' : 'after', outerPos);
  return dropTransaction(state, source, plan, false);
}
