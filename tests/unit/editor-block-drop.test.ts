// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { createSchemaExtensions } from '@kb/shared';
import { dragSource, dropTransaction, insideEnd, moveOutTransaction, planDrop } from '../../apps/web/src/editor/blockDrop';
import { withBlockRange } from '../../apps/web/src/editor/extensions/blockOps';

let ed: Editor | null = null;
afterEach(() => {
  ed?.destroy();
  ed = null;
});

const p = (id: string, text = id) => ({ type: 'paragraph', attrs: { id }, content: [{ type: 'text', text }] });
const columns = (...cols: object[][]) => ({ type: 'columns', attrs: { id: 'cols' }, content: cols.map((c) => ({ type: 'column', content: c })) });
const callout = (id: string, ...content: object[]) => ({ type: 'callout', attrs: { id }, content });
const list = (id: string) => ({
  type: 'bulletList',
  attrs: { id },
  content: [{ type: 'listItem', content: [p(id + '-1'), { type: 'bulletList', content: [{ type: 'listItem', content: [p(id + '-1-1')] }] }] }],
});
const table = (id: string) => ({ type: 'table', attrs: { id }, content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [p(id + '-c')] }] }] });
const image = (id: string) => ({ type: 'image', attrs: { id, src: '/api/v1/attachments/a1/content', attachmentId: 'a1' } });

function make(content: object[]) {
  ed = new Editor({ element: document.createElement('div'), extensions: createSchemaExtensions(), content: { type: 'doc', content } });
  return ed;
}

/** Position of the block with the given id. */
function at(e: Editor, id: string) {
  let pos = -1;
  e.state.doc.descendants((n, p) => {
    if (pos < 0 && n.attrs.id === id) pos = p;
  });
  if (pos < 0) throw new Error('no block ' + id);
  return pos;
}
const size = (e: Editor, id: string) => e.state.doc.nodeAt(at(e, id))!.nodeSize;
const src = (e: Editor, id: string) => ({ from: at(e, id), to: at(e, id) + size(e, id) });
const ids = (e: Editor) => (e.getJSON().content ?? []).map((n: any) => n.attrs?.id ?? n.type);
const colIds = (e: Editor) => (e.getJSON().content ?? []).find((n: any) => n.type === 'columns')?.content?.map((c: any) => c.content.map((b: any) => b.attrs?.id)) ?? null;

function drop(e: Editor, source: { from: number; to: number }, pos: number, side: 'before' | 'after' | 'inside' = 'before', copy = false) {
  const plan = planDrop(e.state, source, pos, side, pos);
  const tr = dropTransaction(e.state, source, plan, copy);
  if (tr) e.view.dispatch(tr);
  return plan;
}

describe('block drag-and-drop model (R-EDITOR-069/075/076)', () => {
  it('moves a block before / after another one, keeping its id and content; one transaction', () => {
    const e = make([p('a'), p('b'), p('c')]);
    const s = src(e, 'c');
    const plan = planDrop(e.state, s, at(e, 'a'), 'before', at(e, 'a'));
    expect(plan).toMatchObject({ valid: true, noop: false });
    const tr = dropTransaction(e.state, s, plan, false)!;
    expect(tr.steps.length).toBeLessThanOrEqual(2);
    e.view.dispatch(tr);
    expect(ids(e)).toEqual(['c', 'a', 'b']);
    // the moved block is selected
    expect(e.state.selection).toBeInstanceOf(NodeSelection);
    expect((e.state.selection as NodeSelection).node.attrs.id).toBe('c');
    drop(e, src(e, 'c'), at(e, 'b') + size(e, 'b'), 'after');
    expect(ids(e)).toEqual(['a', 'b', 'c']);
  });

  it('dropping right where the blocks are is a no-op; into itself is invalid with a reason', () => {
    const e = make([p('a'), callout('k', p('k1'), p('k2')), p('c')]);
    const s = src(e, 'k');
    expect(planDrop(e.state, s, s.from, 'before', s.from).noop).toBe(true);
    expect(planDrop(e.state, s, s.to, 'after', s.from).noop).toBe(true);
    const inside = planDrop(e.state, s, at(e, 'k2'), 'before', at(e, 'k2'));
    expect(inside.valid).toBe(false);
    expect(inside.reason).toMatch(/внутрь самого себя/);
    expect(dropTransaction(e.state, s, inside, false)).toBeNull();
  });

  it('several selected blocks move together in order (block range or text selection over blocks)', () => {
    const e = make([p('a'), p('b'), p('c'), p('d')]);
    const range = { from: at(e, 'b'), to: at(e, 'c') + size(e, 'c') };
    // the multi-block selection (Esc, Shift+↓) is what the handle of any of its blocks drags
    expect(withBlockRange(e.state.tr, range.from, range.to).getMeta('kbSetBlockRange')).toEqual(range);
    const s = dragSource(e.state, at(e, 'c'), range)!;
    expect(s).toEqual(range);
    drop(e, s, e.state.doc.content.size, 'after');
    expect(ids(e)).toEqual(['a', 'd', 'b', 'c']);
    // a text selection from inside "a" to inside "d" (order a, d, b, c): the handle of "d" drags both blocks
    e.commands.setTextSelection({ from: at(e, 'a') + 2, to: at(e, 'd') + 2 });
    expect(dragSource(e.state, at(e, 'd'), null)).toEqual({ from: at(e, 'a'), to: at(e, 'd') + size(e, 'd') });
    // a handle outside the selection drags only its own block
    expect(dragSource(e.state, at(e, 'b'), null)).toEqual(src(e, 'b'));
  });

  it('between columns, out of a column, into a column; a column never becomes empty', () => {
    const e = make([p('top'), columns([p('l1'), p('l2')], [p('r1')])]);
    drop(e, src(e, 'l2'), at(e, 'r1'), 'before');
    expect(colIds(e)).toEqual([['l1'], ['l2', 'r1']]);
    // the last block of the left column moves out: an empty paragraph keeps the column
    drop(e, src(e, 'l1'), at(e, 'top'), 'before');
    expect(ids(e)[0]).toBe('l1');
    const left = colIds(e)![0];
    expect(left).toHaveLength(1);
    expect(left[0]).not.toBe('l1');
    // into a column from the page
    drop(e, src(e, 'top'), at(e, 'r1') + size(e, 'r1'), 'after');
    expect(colIds(e)![1]).toEqual(['l2', 'r1', 'top']);
    e.state.doc.check();
  });

  it('column sets cannot go into a column; schema-invalid targets explain why', () => {
    const e = make([p('a'), columns([p('l1')], [p('r1')]), callout('k', p('k1'))]);
    const s = src(e, 'cols');
    const plan = planDrop(e.state, s, at(e, 'k1'), 'before', at(e, 'k1'));
    expect(plan.valid).toBe(true); // a column set inside a callout is allowed by the schema
    const intoOwn = planDrop(e.state, s, at(e, 'r1'), 'before', at(e, 'r1'));
    expect(intoOwn.valid).toBe(false);
    const e2 = make([columns([p('l1')], [p('r1')]), columns([p('x1')], [p('y1')])]);
    let second = -1;
    e2.state.doc.forEach((n, off, i) => i === 1 && (second = off));
    const s2 = { from: second, to: second + e2.state.doc.child(1).nodeSize };
    const bad = planDrop(e2.state, s2, at(e2, 'r1'), 'before', at(e2, 'r1'));
    expect(bad.valid).toBe(false);
    expect(bad.reason).toMatch(/Колонки нельзя вложить в колонку/);
  });

  it('inside a callout / quote / toggle: appended at the end of its content', () => {
    const e = make([p('a'), callout('k', p('k1')), { type: 'blockquote', attrs: { id: 'q' }, content: [p('q1')] }]);
    const k = e.state.doc.nodeAt(at(e, 'k'))!;
    const end = insideEnd(k, at(e, 'k'))!;
    drop(e, src(e, 'a'), end, 'inside');
    const json = e.getJSON().content!;
    expect(json[0].attrs!.id).toBe('k');
    expect(json[0].content!.map((b: any) => b.attrs.id)).toEqual(['k1', 'a']);
    const q = e.state.doc.nodeAt(at(e, 'q'))!;
    drop(e, src(e, 'k1'), insideEnd(q, at(e, 'q'))!, 'inside');
    expect(e.getJSON().content![1].content!.map((b: any) => b.attrs.id)).toEqual(['q1', 'k1']);
  });

  it('images, tables and nested lists move whole with ids and attributes', () => {
    const e = make([p('a'), image('img'), table('t'), list('l'), p('z')]);
    drop(e, src(e, 'l'), at(e, 'a'), 'before');
    drop(e, src(e, 't'), at(e, 'a'), 'before');
    drop(e, src(e, 'img'), at(e, 'z') + size(e, 'z'), 'after');
    expect(ids(e)).toEqual(['l', 't', 'a', 'z', 'img']);
    const json = JSON.stringify(e.getJSON());
    expect(json).toContain('"attachmentId":"a1"');
    expect(json).toContain('"id":"l-1-1"');
    expect(json).toContain('"id":"t-c"');
  });

  it('Alt/Ctrl-drag copies: source stays, the copy has no ids (fresh ids are assigned by the editor)', () => {
    const e = make([p('a'), p('b')]);
    drop(e, src(e, 'a'), e.state.doc.content.size, 'after', true);
    const json = e.getJSON().content!;
    expect(json.map((n: any) => n.content[0].text)).toEqual(['a', 'b', 'a']);
    expect(json[0].attrs!.id).toBe('a');
    expect(json[2].attrs!.id).not.toBe('a');
  });

  it('keyboard: Alt+Shift+↑ on the first block of a column / callout leaves the container', () => {
    const e = make([p('a'), callout('k', p('k1'), p('k2')), columns([p('l1')], [p('r1'), p('r2')])]);
    e.view.dispatch(moveOutTransaction(e.state, src(e, 'k1'), -1)!);
    expect(ids(e)).toEqual(['a', 'k1', 'k', 'cols']);
    e.view.dispatch(moveOutTransaction(e.state, src(e, 'r2'), 1)!);
    expect(ids(e)).toEqual(['a', 'k1', 'k', 'cols', 'r2']);
    expect(moveOutTransaction(e.state, src(e, 'a'), -1)).toBeNull();
  });
});
