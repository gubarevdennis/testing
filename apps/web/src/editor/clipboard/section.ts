import type { Node as PMNode } from '@tiptap/pm/model';

/**
 * The section of a heading (R-CLIPBOARD-001): the heading and the following sibling blocks up to the next heading of
 * the same or a higher level (or the end of the container). `pos` is the position before the heading.
 * Returns null when `pos` is not a heading.
 */
export function sectionRange(doc: PMNode, pos: number): { from: number; to: number } | null {
  const heading = doc.nodeAt(pos);
  if (!heading || heading.type.name !== 'heading') return null;
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  const level = heading.attrs.level as number;
  let to = pos + heading.nodeSize;
  for (let i = $pos.index() + 1; i < parent.childCount; i++) {
    const n = parent.child(i);
    if (n.type.name === 'heading' && (n.attrs.level as number) <= level) break;
    to += n.nodeSize;
  }
  return { from: pos, to };
}
