/**
 * Table operations beyond @tiptap/extension-table (R-TABLE-003): moving rows/columns and sorting by a column.
 * Pure editor commands (unit-tested headless in tests/unit/editor-table-ops.test.ts). Each operation is one
 * transaction (one undo step) that rebuilds the table from the existing cell nodes, so cell content, attributes
 * (width, alignment, fill) and block ids are kept; header cells stay where the header is (row 0 / column 0).
 * Tables with merged cells are refused: a move or sort would tear merged areas apart.
 */
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { TextSelection, type EditorState } from '@tiptap/pm/state';
import { selectedRect, TableMap, isInTable } from '@tiptap/pm/tables';

export type TableOpResult = 'ok' | 'not-in-table' | 'merged' | 'edge';

interface Ctx {
  table: PMNode;
  pos: number; // position before the table node
  rows: PMNode[][]; // cells by row
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function context(state: EditorState): Ctx | null {
  if (!isInTable(state)) return null;
  const rect = selectedRect(state);
  const table = rect.table;
  const rows: PMNode[][] = [];
  table.forEach((row) => {
    const cells: PMNode[] = [];
    row.forEach((c) => cells.push(c));
    rows.push(cells);
  });
  return { table, pos: rect.tableStart - 1, rows, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
}

function hasMerged(rows: PMNode[][]) {
  return rows.some((r) => r.some((c) => (c.attrs.colspan ?? 1) > 1 || (c.attrs.rowspan ?? 1) > 1));
}

/** Rebuilds the table from a grid of cells; the node type (header/cell) of each position is kept. */
function rebuild(editor: Editor, c: Ctx, grid: PMNode[][], caret: { row: number; col: number }) {
  const rowType = c.table.child(0).type;
  const newRows = grid.map((cells, r) =>
    rowType.create(
      c.table.child(r).attrs,
      cells.map((cell, col) => {
        const typeHere = c.rows[r][col].type;
        return cell.type === typeHere ? cell : typeHere.create(cell.attrs, cell.content, cell.marks);
      }),
    ),
  );
  const table = c.table.type.create(c.table.attrs, newRows, c.table.marks);
  const tr = editor.state.tr.replaceWith(c.pos, c.pos + c.table.nodeSize, table);
  const map = TableMap.get(table);
  const cellPos = c.pos + 1 + map.map[caret.row * map.width + caret.col];
  tr.setSelection(TextSelection.near(tr.doc.resolve(cellPos + 1)));
  editor.view.dispatch(tr.scrollIntoView());
}

/** Moves the selected rows one row up (-1) or down (1). */
export function moveTableRow(editor: Editor, dir: -1 | 1): TableOpResult {
  const c = context(editor.state);
  if (!c) return 'not-in-table';
  if (hasMerged(c.rows)) return 'merged';
  const { top, bottom } = c;
  if ((dir === -1 && top === 0) || (dir === 1 && bottom >= c.rows.length)) return 'edge';
  const grid = c.rows.slice();
  const block = grid.splice(top, bottom - top);
  grid.splice(top + dir, 0, ...block);
  rebuild(editor, c, grid, { row: top + dir, col: c.left });
  return 'ok';
}

/** Moves the selected columns one column left (-1) or right (1). */
export function moveTableColumn(editor: Editor, dir: -1 | 1): TableOpResult {
  const c = context(editor.state);
  if (!c) return 'not-in-table';
  if (hasMerged(c.rows)) return 'merged';
  const { left, right } = c;
  const width = c.rows[0].length;
  if ((dir === -1 && left === 0) || (dir === 1 && right >= width)) return 'edge';
  const grid = c.rows.map((r) => {
    const cells = r.slice();
    const block = cells.splice(left, right - left);
    cells.splice(left + dir, 0, ...block);
    return cells;
  });
  rebuild(editor, c, grid, { row: c.top, col: left + dir });
  return 'ok';
}

const NUM = /^[-+−]?\d[\d\s ]*([.,]\d+)?\s*%?$/;
function sortKey(cell: PMNode): { empty: boolean; num: number | null; text: string } {
  const text = cell.textContent.trim();
  if (!text) return { empty: true, num: null, text };
  const num = NUM.test(text) ? Number(text.replace(/[\s %]/g, '').replace('−', '-').replace(',', '.')) : null;
  return { empty: false, num: num != null && Number.isFinite(num) ? num : null, text };
}

/** Compares cell values: numbers numerically, otherwise text in Russian collation (numeric-aware); empty cells last. */
export function compareCells(a: PMNode, b: PMNode): number {
  const x = sortKey(a);
  const y = sortKey(b);
  if (x.empty || y.empty) return x.empty === y.empty ? 0 : x.empty ? 1 : -1;
  if (x.num != null && y.num != null) return x.num - y.num;
  return x.text.localeCompare(y.text, 'ru', { numeric: true, sensitivity: 'base' });
}

/** Sorts the body rows by the column of the caret; a header row stays on top. Stable. */
export function sortTableByColumn(editor: Editor, order: 'asc' | 'desc'): TableOpResult {
  const c = context(editor.state);
  if (!c) return 'not-in-table';
  if (hasMerged(c.rows)) return 'merged';
  const col = c.left;
  const headerRow = c.rows[0].every((cell) => cell.type.name === 'tableHeader') ? 1 : 0;
  const body = c.rows.slice(headerRow).map((cells, i) => ({ cells, i }));
  body.sort((p, q) => {
    const a = p.cells[col];
    const b = q.cells[col];
    const ea = !a.textContent.trim();
    const eb = !b.textContent.trim();
    if (ea || eb) return ea === eb ? p.i - q.i : ea ? 1 : -1; // empty cells last in both directions
    const r = compareCells(a, b);
    return (order === 'asc' ? r : -r) || p.i - q.i;
  });
  const grid = [...c.rows.slice(0, headerRow), ...body.map((b) => b.cells)];
  rebuild(editor, c, grid, { row: headerRow, col });
  return 'ok';
}

export const TABLE_OP_ERRORS: Record<Exclude<TableOpResult, 'ok'>, string> = {
  'not-in-table': 'Поставьте курсор в таблицу',
  merged: 'В таблице есть объединённые ячейки — сначала разделите их',
  edge: '',
};
