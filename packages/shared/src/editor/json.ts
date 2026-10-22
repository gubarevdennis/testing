/** Plain ProseMirror JSON helpers (no schema / DOM dependency). */
export interface PMMark {
  type: string;
  attrs?: Record<string, any>;
}
export interface PMNode {
  type: string;
  attrs?: Record<string, any>;
  content?: PMNode[];
  marks?: PMMark[];
  text?: string;
}

import { BLOCK_TYPES } from './extensions.js';
import { newId } from './ids.js';

const BLOCK_SET = new Set<string>(BLOCK_TYPES);

export function emptyDoc(): PMNode {
  return { type: 'doc', content: [{ type: 'paragraph', attrs: { id: newId() } }] };
}

export function walk(node: PMNode, fn: (n: PMNode, parent: PMNode | null, index: number) => void | false, parent: PMNode | null = null, index = 0): void {
  if (fn(node, parent, index) === false) return;
  node.content?.forEach((c, i) => walk(c, fn, node, i));
}

/** Assigns ids to blocks lacking one and regenerates duplicated ids. Mutates and returns the doc. */
export function ensureBlockIds(doc: PMNode, seen: Set<string> = new Set()): PMNode {
  walk(doc, (n) => {
    if (!BLOCK_SET.has(n.type)) return;
    n.attrs = n.attrs ?? {};
    const id = n.attrs.id;
    if (!id || typeof id !== 'string' || seen.has(id)) n.attrs.id = newId();
    seen.add(n.attrs.id);
  });
  return doc;
}

export function inlineText(node: PMNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'mention') return '@' + (node.attrs?.label ?? '');
  if (node.type === 'pageMention') return node.attrs?.title ?? '';
  if (node.type === 'inlineMath') return node.attrs?.latex ?? '';
  return (node.content ?? []).map(inlineText).join('');
}

const TEXTBLOCKS = new Set(['paragraph', 'heading', 'codeBlock', 'mermaid', 'detailsSummary']);

/** Plain text of a document; blocks separated by newlines, table cells by tabs. Used for search, diff and "copy as text". */
export function docToPlainText(doc: PMNode): string {
  const out: string[] = [];
  const visit = (n: PMNode) => {
    if (TEXTBLOCKS.has(n.type)) {
      out.push(inlineText(n));
      return;
    }
    switch (n.type) {
      case 'table':
        for (const row of n.content ?? []) {
          out.push((row.content ?? []).map((cell) => cellText(cell)).join('\t'));
        }
        return;
      case 'image':
        if (n.attrs?.alt || n.attrs?.caption) out.push([n.attrs?.alt, n.attrs?.caption].filter(Boolean).join(' — '));
        return;
      case 'fileBlock':
        out.push(n.attrs?.name ?? '');
        return;
      case 'pageLink':
        out.push(n.attrs?.title ?? '');
        return;
      case 'blockMath':
        out.push(n.attrs?.latex ?? '');
        return;
      case 'embed':
        out.push(n.attrs?.title || n.attrs?.url || '');
        return;
    }
    n.content?.forEach(visit);
  };
  visit(doc);
  return out.filter((s) => s !== '').join('\n');
}

export function cellText(cell: PMNode): string {
  const parts: string[] = [];
  walk(cell, (n) => {
    if (TEXTBLOCKS.has(n.type)) {
      parts.push(inlineText(n));
      return false;
    }
  });
  return parts.join(' ').replace(/\t/g, ' ');
}

export interface BlockInfo {
  id: string;
  type: string;
  text: string;
  /** JSON fingerprint of the block without its children blocks, used for change detection. */
  hash: string;
  parentId: string | null;
  index: number;
}

function fingerprint(n: PMNode): string {
  const { content, ...rest } = n;
  const own = TEXTBLOCKS.has(n.type) ? JSON.stringify(n.content ?? []) : '';
  return JSON.stringify(rest) + own;
}

/** Flat list of blocks with ids, in document order. */
export function collectBlocks(doc: PMNode): BlockInfo[] {
  const list: BlockInfo[] = [];
  const visit = (n: PMNode, parentId: string | null) => {
    (n.content ?? []).forEach((c, index) => {
      const id = c.attrs?.id;
      if (id && BLOCK_SET.has(c.type)) {
        list.push({ id, type: c.type, text: TEXTBLOCKS.has(c.type) ? inlineText(c) : c.type === 'table' ? docToPlainText(c) : '', hash: fingerprint(c), parentId, index });
        visit(c, id);
      } else visit(c, parentId);
    });
  };
  visit(doc, null);
  return list;
}

export function findBlock(doc: PMNode, id: string): { node: PMNode; parent: PMNode; index: number } | null {
  let found: { node: PMNode; parent: PMNode; index: number } | null = null;
  walk(doc, (n, parent, index) => {
    if (found) return false;
    if (parent && n.attrs?.id === id) found = { node: n, parent, index };
  });
  return found;
}

export interface HeadingInfo {
  id: string;
  level: number;
  text: string;
}
export function extractHeadings(doc: PMNode): HeadingInfo[] {
  const h: HeadingInfo[] = [];
  walk(doc, (n) => {
    if (n.type === 'heading') h.push({ id: n.attrs?.id ?? '', level: n.attrs?.level ?? 1, text: inlineText(n) });
  });
  return h;
}

/** Ids of pages referenced by this document (links, mentions, page link blocks, synced blocks). */
export function extractPageRefs(doc: PMNode): string[] {
  const ids = new Set<string>();
  walk(doc, (n) => {
    if ((n.type === 'pageLink' || n.type === 'pageMention') && n.attrs?.pageId) ids.add(n.attrs.pageId);
    if (n.type === 'syncedBlock' && n.attrs?.sourcePageId) ids.add(n.attrs.sourcePageId);
    for (const m of n.marks ?? []) {
      if (m.type === 'link') {
        const match = /^\/p\/([0-9a-f-]{36})/i.exec(m.attrs?.href ?? '');
        if (match) ids.add(match[1]);
      }
    }
  });
  return [...ids];
}

export function extractAttachmentIds(doc: PMNode): string[] {
  const ids = new Set<string>();
  walk(doc, (n) => {
    if (n.attrs?.attachmentId) ids.add(n.attrs.attachmentId);
  });
  return [...ids];
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}]+/gu);
  return m ? m.length : 0;
}

/** Table → TSV (for clipboard text/plain and CSV export). Cells containing tabs/newlines are quoted like Excel does. */
export function tableToRows(table: PMNode): string[][] {
  const rows: string[][] = [];
  const spans: Array<{ row: number; col: number }> = [];
  (table.content ?? []).forEach((row, r) => {
    const cells: string[] = [];
    let col = 0;
    const take = () => {
      while (spans.some((s) => s.row === r && s.col === col)) {
        cells.push('');
        col++;
      }
    };
    for (const cell of row.content ?? []) {
      take();
      cells.push(cellTextMultiline(cell));
      const colspan = cell.attrs?.colspan ?? 1;
      const rowspan = cell.attrs?.rowspan ?? 1;
      for (let dr = 0; dr < rowspan; dr++)
        for (let dc = 0; dc < colspan; dc++) if (dr || dc) spans.push({ row: r + dr, col: col + dc });
      for (let dc = 1; dc < colspan; dc++) cells.push('');
      col += colspan;
    }
    take();
    rows.push(cells);
  });
  return rows;
}

function cellTextMultiline(cell: PMNode): string {
  const parts: string[] = [];
  walk(cell, (n) => {
    if (TEXTBLOCKS.has(n.type)) {
      parts.push(inlineText(n));
      return false;
    }
  });
  return parts.join('\n');
}

export function rowsToTsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => (/[\t\n"]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c)).join('\t')).join('\n');
}

export function hasMergedCells(table: PMNode): boolean {
  let merged = false;
  walk(table, (n) => {
    if ((n.type === 'tableCell' || n.type === 'tableHeader') && ((n.attrs?.colspan ?? 1) > 1 || (n.attrs?.rowspan ?? 1) > 1)) merged = true;
  });
  return merged;
}

/** Builds a table node from a 2D array of strings. */
export function rowsToTable(rows: string[][], headerRow = true): PMNode {
  const width = Math.max(1, ...rows.map((r) => r.length));
  return {
    type: 'table',
    attrs: { id: newId() },
    content: rows.map((r, ri) => ({
      type: 'tableRow',
      content: Array.from({ length: width }, (_, ci) => {
        const text = r[ci] ?? '';
        const lines = text.split(/\r?\n/);
        return {
          type: headerRow && ri === 0 ? 'tableHeader' : 'tableCell',
          attrs: { colspan: 1, rowspan: 1, colwidth: null },
          content: lines.map((line) => ({ type: 'paragraph', attrs: { id: newId() }, content: line ? [{ type: 'text', text: line }] : undefined })),
        };
      }),
    })),
  };
}

/** Parses TSV the way spreadsheets put it on the clipboard (quoted cells may contain tabs/newlines). */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let quoted = false;
  const src = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell === '') {
      quoted = true;
      i++;
      continue;
    }
    if (ch === '\t') {
      row.push(cell);
      cell = '';
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

/** Heuristic: does clipboard text look like a spreadsheet range (>=2 columns on most lines)? */
export function looksLikeTsv(text: string): boolean {
  if (!text.includes('\t')) return false;
  const rows = parseTsv(text);
  if (rows.length < 1) return false;
  const width = rows[0].length;
  return width >= 2 && rows.filter((r) => r.length === width).length >= Math.max(1, Math.ceil(rows.length * 0.8));
}
