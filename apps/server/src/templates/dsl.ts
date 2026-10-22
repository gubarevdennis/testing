/** Small DSL to author template documents as canonical JSON (ids are assigned on page creation). */
import type { PMNode, PMMark } from '@kb/shared';

type Inline = string | PMNode;

const mk = (type: string, marks?: PMMark[]) => (text: string): PMNode => ({ type: 'text', text, ...(marks ? { marks } : {}) });
export const b = (text: string) => mk('text', [{ type: 'bold' }])(text);
export const i = (text: string) => mk('text', [{ type: 'italic' }])(text);
export const code = (text: string) => mk('text', [{ type: 'code' }])(text);
export const link = (text: string, href: string) => mk('text', [{ type: 'link', attrs: { href } }])(text);
export const mark = (text: string, color = '#FFF3B0') => mk('text', [{ type: 'highlight', attrs: { color } }])(text);
export const colored = (text: string, color: string) => mk('text', [{ type: 'textStyle', attrs: { color, fontFamily: null, fontSize: null } }])(text);

function inl(parts: Inline[]): PMNode[] {
  return parts.filter((x) => x !== '').map((x) => (typeof x === 'string' ? { type: 'text', text: x } : x));
}

export const p = (...parts: Inline[]): PMNode => ({ type: 'paragraph', ...(parts.length ? { content: inl(parts) } : {}) });
export const lead = (...parts: Inline[]): PMNode => ({ type: 'paragraph', attrs: { variant: 'lead' }, content: inl(parts) });
export const h1 = (t: string): PMNode => ({ type: 'heading', attrs: { level: 1 }, content: inl([t]) });
export const h2 = (t: string): PMNode => ({ type: 'heading', attrs: { level: 2 }, content: inl([t]) });
export const h3 = (t: string): PMNode => ({ type: 'heading', attrs: { level: 3 }, content: inl([t]) });
export const hr = (): PMNode => ({ type: 'horizontalRule' });
export const toc = (): PMNode => ({ type: 'toc' });
export const quote = (...blocks: PMNode[]): PMNode => ({ type: 'blockquote', content: blocks });

const item = (x: Inline | PMNode[]): PMNode => ({ type: 'listItem', content: Array.isArray(x) ? x : [p(x)] });
/** Bullet list; an item may be a string, inline node, or an array of blocks (for nesting). */
export const ul = (...items: Array<Inline | PMNode[]>): PMNode => ({ type: 'bulletList', content: items.map(item) });
export const ol = (...items: Array<Inline | PMNode[]>): PMNode => ({ type: 'orderedList', attrs: { start: 1 }, content: items.map(item) });
export const todo = (...items: Array<[boolean, Inline]>): PMNode => ({ type: 'taskList', content: items.map(([checked, t]) => ({ type: 'taskItem', attrs: { checked }, content: [p(t)] })) });

export const callout = (variant: 'info' | 'tip' | 'important' | 'warning' | 'error' | 'example' | 'neutral', ...blocks: Array<PMNode | string>): PMNode => ({
  type: 'callout',
  attrs: { variant, icon: null },
  content: blocks.map((x) => (typeof x === 'string' ? p(x) : x)),
});

export const toggle = (summary: string, ...blocks: PMNode[]): PMNode => ({
  type: 'details',
  attrs: { open: false, level: 0 },
  content: [
    { type: 'detailsSummary', content: inl([summary]) },
    { type: 'detailsContent', content: blocks.length ? blocks : [p()] },
  ],
});

export const codeBlock = (language: string, text: string): PMNode => ({ type: 'codeBlock', attrs: { language }, content: [{ type: 'text', text }] });
export const mermaid = (text: string): PMNode => ({ type: 'mermaid', content: [{ type: 'text', text }] });
export const math = (latex: string): PMNode => ({ type: 'blockMath', attrs: { latex } });

/** Table: first row is a header row by default. Cells may be strings or arrays of blocks. */
export const table = (rows: Array<Array<string | PMNode[]>>, opts: { header?: boolean; align?: Array<string | null> } = {}): PMNode => ({
  type: 'table',
  content: rows.map((r, ri) => ({
    type: 'tableRow',
    content: r.map((c, ci) => ({
      type: (opts.header ?? true) && ri === 0 ? 'tableHeader' : 'tableCell',
      attrs: { colspan: 1, rowspan: 1, colwidth: null, align: opts.align?.[ci] ?? null, valign: null, background: null },
      content: Array.isArray(c) ? c : [p(c)],
    })),
  })),
});

export const columns = (...cols: PMNode[][]): PMNode => ({ type: 'columns', content: cols.map((c) => ({ type: 'column', attrs: { width: null }, content: c.length ? c : [p()] })) });

/** Illustrative image bundled with the web app (no attachment needed). */
export const image = (src: string, alt: string, caption = ''): PMNode => ({ type: 'image', attrs: { src, alt, caption, attachmentId: null, width: null, align: 'center', title: null, naturalWidth: null, naturalHeight: null } });

export const doc = (...blocks: PMNode[]): PMNode => ({ type: 'doc', content: blocks });

export interface TemplateDef {
  key: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  properties?: Record<string, unknown>;
  requiredProperties?: string[];
  content: PMNode;
}
