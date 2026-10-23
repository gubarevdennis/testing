import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { lowlight } from '@kb/shared';

/**
 * Syntax highlighting of code blocks, incremental (PERF-D1). The stock lowlight plugin of Tiptap walks the old and the
 * new document on every transaction (two full traversals per keystroke anywhere in the page) and re-highlights every
 * code block when one of them changes. Here only code blocks inside the changed ranges are re-highlighted, and the
 * highlighting of a block is cached per (immutable) node, so a remote change replacing the document reuses it.
 */
export const codeHighlightKey = new PluginKey<DecorationSet>('kbCodeHighlight');

interface Span {
  from: number;
  to: number;
  cls: string;
}
const cache = new WeakMap<PMNode, Span[]>();

type HNode = { type: string; value?: string; children?: HNode[]; properties?: { className?: string[] } };

function flatten(nodes: HNode[], cls: string[], out: Array<{ text: string; cls: string[] }>) {
  for (const n of nodes) {
    const c = n.properties?.className ? [...cls, ...n.properties.className] : cls;
    if (n.children) flatten(n.children, c, out);
    else out.push({ text: n.value ?? '', cls: c });
  }
}

function spansOf(node: PMNode): Span[] {
  const hit = cache.get(node);
  if (hit) return hit;
  const text = node.textContent;
  const lang = node.attrs.language as string | null;
  let tree: { children: HNode[] };
  try {
    tree = (lang && lowlight.registered(lang) ? lowlight.highlight(lang, text) : lowlight.highlightAuto(text)) as unknown as { children: HNode[] };
  } catch {
    tree = { children: [] };
  }
  const flat: Array<{ text: string; cls: string[] }> = [];
  flatten(tree.children, [], flat);
  const spans: Span[] = [];
  let at = 0;
  for (const f of flat) {
    if (f.cls.length && f.text.length) spans.push({ from: at, to: at + f.text.length, cls: f.cls.join(' ') });
    at += f.text.length;
  }
  cache.set(node, spans);
  return spans;
}

const decorationsOf = (node: PMNode, pos: number) => spansOf(node).map((s) => Decoration.inline(pos + 1 + s.from, pos + 1 + s.to, { class: s.cls }));

function full(doc: PMNode, name: string): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((n, pos) => {
    if (n.type.name === name) {
      decos.push(...decorationsOf(n, pos));
      return false;
    }
    return !n.isTextblock;
  });
  return DecorationSet.create(doc, decos);
}

/** Changed ranges of a transaction in the coordinates of its final document. */
export function changedRanges(tr: Transaction): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const maps = tr.mapping.maps;
  maps.forEach((map, i) => {
    const push = (f: number, t: number) => {
      for (let j = i + 1; j < maps.length; j++) {
        f = maps[j].map(f, -1);
        t = maps[j].map(t, 1);
      }
      out.push([Math.min(f, t), Math.max(f, t)]);
    };
    let any = false;
    map.forEach((_a, _b, newStart, newEnd) => {
      any = true;
      push(newStart, newEnd);
    });
    // attribute steps (language change) have an empty map
    const pos = (tr.steps[i] as unknown as { pos?: number }).pos;
    if (!any && typeof pos === 'number') push(pos, pos + 1);
  });
  return out;
}

export function codeHighlightPlugin(name = 'codeBlock') {
  return new Plugin<DecorationSet>({
    key: codeHighlightKey,
    state: {
      init: (_c, state) => full(state.doc, name),
      apply(tr, set) {
        if (!tr.docChanged) return set;
        const doc = tr.doc;
        const ranges = changedRanges(tr);
        // a remote change replaces the whole document: rebuild (cheap: highlighting is cached per node)
        if (ranges.some(([f, t]) => t - f > doc.content.size / 2)) return full(doc, name);
        let next = set.map(tr.mapping, doc);
        const seen = new Set<number>();
        for (const [f, t] of ranges) {
          const from = Math.max(0, Math.min(f, doc.content.size));
          const to = Math.max(from, Math.min(t, doc.content.size));
          doc.nodesBetween(from, to, (n, pos) => {
            if (n.type.name === name) {
              if (!seen.has(pos)) {
                seen.add(pos);
                next = next.remove(next.find(pos, pos + n.nodeSize)).add(doc, decorationsOf(n, pos));
              }
              return false;
            }
            return !n.isTextblock;
          });
        }
        return next;
      },
    },
    props: {
      decorations: (state) => codeHighlightKey.getState(state),
    },
  });
}
