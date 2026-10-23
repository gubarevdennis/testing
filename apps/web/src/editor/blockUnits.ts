/**
 * Block units — what the hover handle, the block selection (handle click, Shift+click, Esc, arrows, drag-select) and
 * drag-and-drop treat as one block, the way Notion does (D-41):
 *
 *  - every child of the page, a column, a toggle's body, a callout or a quote;
 *  - the first child of a callout / quote is the container's own line: hovering it targets the callout / quote;
 *  - a list with two or more items is not a unit itself — its items are (a one-item list is one unit: the list);
 *  - inside a list item, the first paragraph is the item's own line; nested lists follow the same rules.
 *
 * Pure ProseMirror logic (no DOM), shared by menus/blockHover.ts, extensions/blockOps.ts and blockDrop.ts.
 */
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';

export const LISTS = new Set(['bulletList', 'orderedList', 'taskList']);
export const ITEMS = new Set(['listItem', 'taskItem']);
/** Parents whose children are movable blocks (same set as blockDrop's CONTAINERS). */
const CONTAINER_TYPES = new Set(['doc', 'column', 'callout', 'blockquote', 'detailsContent']);
/** Containers whose first child is the container's own line (not a separate unit). */
const OWN_FIRST_LINE = new Set(['callout', 'blockquote']);

export interface Unit {
  pos: number;
  node: PMNode;
}

/** A child block as units: a list with ≥2 items contributes its items, anything else itself. */
function expand(child: PMNode, pos: number, out: Unit[]) {
  if (LISTS.has(child.type.name) && child.childCount >= 2) {
    child.forEach((item, off) => out.push({ pos: pos + 1 + off, node: item }));
  } else out.push({ pos, node: child });
}

function childrenFrom(node: PMNode, contentStart: number, fromIndex: number, out: Unit[]) {
  node.forEach((child, off, i) => {
    if (i >= fromIndex) expand(child, contentStart + off, out);
  });
}

/** Whether a toggle shows its content (persisted `open`). */
export function detailsOpen(node: PMNode) {
  return node.attrs.open !== false;
}

/**
 * Units nested directly inside `node` (at `pos`; -1 for the document): the doc's blocks, a callout's further lines,
 * a toggle's open body, the blocks of every column of a column set, a list item's nested blocks.
 */
export function childUnits(node: PMNode, pos: number): Unit[] {
  const out: Unit[] = [];
  const name = node.type.name;
  const start = pos + 1;
  if (name === 'doc' || name === 'column' || name === 'detailsContent') childrenFrom(node, start, 0, out);
  else if (OWN_FIRST_LINE.has(name) || ITEMS.has(name)) childrenFrom(node, start, 1, out);
  else if (name === 'details') {
    if (!detailsOpen(node)) return out;
    node.forEach((child, off) => {
      if (child.type.name === 'detailsContent') childrenFrom(child, start + off + 1, 0, out);
    });
  } else if (name === 'columns') {
    node.forEach((col, off) => childrenFrom(col, start + off + 1, 0, out));
  } else if (LISTS.has(name) && node.childCount === 1) {
    // a one-item list is one unit: what is nested in its item are its sub-units
    return childUnits(node.child(0), start);
  }
  return out;
}

/** All units in document order (pre-order: a unit, then the units nested in it). */
export function allUnits(doc: PMNode): Unit[] {
  const out: Unit[] = [];
  const walk = (units: Unit[]) => {
    for (const u of units) {
      out.push(u);
      walk(childUnits(u.node, u.pos));
    }
  };
  walk(childUnits(doc, -1));
  return out;
}

/** The innermost unit containing a position (the block the caret / pointer is in), or null. */
export function unitAt($pos: ResolvedPos): (Unit & { depth: number }) | null {
  for (let d = $pos.depth; d >= 1; d--) {
    const node = $pos.node(d);
    const parent = $pos.node(d - 1);
    const pn = parent.type.name;
    const index = $pos.index(d - 1);
    let unit = false;
    if (ITEMS.has(node.type.name)) unit = parent.childCount >= 2;
    else if (LISTS.has(node.type.name) && node.childCount >= 2) unit = false;
    else if (CONTAINER_TYPES.has(pn)) unit = !(OWN_FIRST_LINE.has(pn) && index === 0);
    else if (ITEMS.has(pn)) unit = index > 0;
    if (unit) return { pos: $pos.before(d), node, depth: d };
  }
  return null;
}

/** Whether `node`'s children are sibling units (a block range may span them). */
function siblingParent(node: PMNode) {
  const n = node.type.name;
  return CONTAINER_TYPES.has(n) || (LISTS.has(n) && node.childCount >= 2);
}

/**
 * The sibling blocks spanning two blocks / ranges (Shift+click on another handle, a text drag across blocks): at the
 * deepest level where both lie under the same container (blocks in different columns → the whole column set).
 */
export function rangeBetween(doc: PMNode, a: { from: number; to: number }, b: { from: number; to: number }): { from: number; to: number } {
  const from = Math.min(a.from, b.from);
  const to = Math.max(a.to, b.to);
  const $from = doc.resolve(from);
  const $to = doc.resolve(to);
  let d = $from.sharedDepth(to);
  while (d > 0 && !siblingParent($from.node(d))) d--;
  return { from: d < $from.depth ? $from.before(d + 1) : from, to: d < $to.depth ? $to.after(d + 1) : to };
}

/** A range covering every item of a list means the list itself (moving / deleting all items moves / deletes the list). */
export function expandWholeList(doc: PMNode, r: { from: number; to: number }): { from: number; to: number } {
  const $f = doc.resolve(r.from);
  const parent = $f.parent;
  if ($f.depth > 0 && LISTS.has(parent.type.name) && $f.index() === 0 && doc.resolve(r.to).index($f.depth) >= parent.childCount && r.to === $f.end()) {
    return { from: $f.before(), to: $f.after() };
  }
  return r;
}
