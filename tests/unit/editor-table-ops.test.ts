// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import { CellSelection } from '@tiptap/pm/tables';
import { createSchemaExtensions } from '@kb/shared';
import { moveTableRow, moveTableColumn, sortTableByColumn, compareCells } from '../../apps/web/src/editor/tableOps';

let ed: Editor | null = null;
afterEach(() => {
  ed?.destroy();
  ed = null;
});

const cell = (text: string, header = false, attrs: Record<string, unknown> = {}) => ({
  type: header ? 'tableHeader' : 'tableCell',
  attrs,
  content: [{ type: 'paragraph', attrs: { id: 'p-' + text }, content: text ? [{ type: 'text', text }] : undefined }],
});
const row = (...cells: object[]) => ({ type: 'tableRow', content: cells });

function make(rows: object[]) {
  ed = new Editor({ element: document.createElement('div'), extensions: createSchemaExtensions(), content: { type: 'doc', content: [{ type: 'table', attrs: { id: 't1' }, content: rows }] } });
  return ed;
}

/** Puts the caret into the cell with the given text. */
function caret(e: Editor, text: string) {
  let at = -1;
  e.state.doc.descendants((n, pos) => {
    if (at < 0 && n.isText && n.text === text) at = pos;
  });
  e.commands.setTextSelection(at + 1);
}

function grid(e: Editor): string[][] {
  const t = e.getJSON().content![0];
  return (t.content ?? []).map((r: any) => (r.content ?? []).map((c: any) => (c.type === 'tableHeader' ? '#' : '') + (c.content?.[0]?.content?.[0]?.text ?? '')));
}

const people = () => [row(cell('Имя', true), cell('Возраст', true)), row(cell('Борис'), cell('42')), row(cell('анна'), cell('7')), row(cell('Вера'), cell('')), row(cell('Ёлка'), cell('100'))];

describe('table operations (R-TABLE-003)', () => {
  it('moves a row up and down; header cells stay in the header row; ids are kept', () => {
    const e = make(people());
    caret(e, 'анна');
    expect(moveTableRow(e, -1)).toBe('ok');
    expect(grid(e).map((r) => r[0])).toEqual(['#Имя', 'анна', 'Борис', 'Вера', 'Ёлка']);
    // the caret follows the moved row
    expect(moveTableRow(e, 1)).toBe('ok');
    expect(grid(e).map((r) => r[0])).toEqual(['#Имя', 'Борис', 'анна', 'Вера', 'Ёлка']);
    caret(e, 'Борис');
    expect(moveTableRow(e, -1)).toBe('ok');
    // moved into the header position: the text moves, the header stays a header
    expect(grid(e)[0]).toEqual(['#Борис', '#42']);
    expect(grid(e)[1]).toEqual(['Имя', 'Возраст']);
    expect(JSON.stringify(e.getJSON())).toContain('"id":"p-Борис"');
    expect(moveTableRow(e, -1)).toBe('edge');
  });

  it('moves a column left and right with its cell attributes', () => {
    const e = make([row(cell('A', true), cell('B', true, { align: 'right', colwidth: [120] })), row(cell('a1'), cell('b1', false, { background: '#fff3bf' }))]);
    caret(e, 'b1');
    expect(moveTableColumn(e, -1)).toBe('ok');
    expect(grid(e)).toEqual([['#B', '#A'], ['b1', 'a1']]);
    const t = e.getJSON().content![0] as any;
    expect(t.content[0].content[0].attrs).toMatchObject({ align: 'right', colwidth: [120] });
    expect(t.content[1].content[0].attrs).toMatchObject({ background: '#fff3bf' });
    expect(moveTableColumn(e, -1)).toBe('edge');
    expect(moveTableColumn(e, 1)).toBe('ok');
    expect(grid(e)).toEqual([['#A', '#B'], ['a1', 'b1']]);
  });

  it('moves a selected range of rows together', () => {
    const e = make(people());
    let a = -1;
    let b = -1;
    e.state.doc.descendants((n, pos) => {
      if (n.type.name === 'tableCell' && n.textContent === 'Борис') a = pos;
      if (n.type.name === 'tableCell' && n.textContent === '7') b = pos;
    });
    e.view.dispatch(e.state.tr.setSelection(CellSelection.create(e.state.doc, a, b)));
    expect(moveTableRow(e, 1)).toBe('ok');
    expect(grid(e).map((r) => r[0])).toEqual(['#Имя', 'Вера', 'Борис', 'анна', 'Ёлка']);
  });

  it('sorts body rows by the caret column: numbers numerically, text in Russian order, empty cells last, header fixed', () => {
    const e = make(people());
    caret(e, '42');
    expect(sortTableByColumn(e, 'asc')).toBe('ok');
    expect(grid(e).map((r) => r[1])).toEqual(['#Возраст', '7', '42', '100', '']);
    expect(sortTableByColumn(e, 'desc')).toBe('ok');
    expect(grid(e).map((r) => r[1])).toEqual(['#Возраст', '100', '42', '7', '']);
    caret(e, 'Вера');
    expect(sortTableByColumn(e, 'asc')).toBe('ok');
    expect(grid(e).map((r) => r[0])).toEqual(['#Имя', 'анна', 'Борис', 'Вера', 'Ёлка']);
    // one transaction per operation (one undo step)
    expect(e.getJSON().content).toHaveLength(1);
  });

  it('refuses to move or sort a table with merged cells instead of tearing it apart', () => {
    const e = make([row(cell('A', false, { colspan: 2 })), row(cell('a'), cell('b'))]);
    caret(e, 'a');
    expect(moveTableRow(e, -1)).toBe('merged');
    expect(moveTableColumn(e, 1)).toBe('merged');
    expect(sortTableByColumn(e, 'asc')).toBe('merged');
    expect(grid(e)).toEqual([['A'], ['a', 'b']]);
  });

  it('compareCells: "1 000,5" > "999"; "Ж" < "Я"; "ё" sorts with "е"', () => {
    const e = make([row(cell('x'))]);
    const n = (t: string) => e.schema.nodes.tableCell.create(null, e.schema.nodes.paragraph.create(null, t ? e.schema.text(t) : undefined));
    expect(compareCells(n('1 000,5'), n('999'))).toBeGreaterThan(0);
    expect(compareCells(n('Ж'), n('Я'))).toBeLessThan(0);
    expect(compareCells(n('ёж'), n('ея'))).toBeLessThan(0);
    expect(compareCells(n(''), n('a'))).toBeGreaterThan(0);
  });
});
