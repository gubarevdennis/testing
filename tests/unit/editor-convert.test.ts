// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import { createSchemaExtensions } from '@kb/shared';
import { convertToCodeBlock, codeConversionLoss } from '../../apps/web/src/editor/convert';
import { posToAnchor, anchorToPos } from '../../apps/web/src/editor/selectionMemory';

let ed: Editor | null = null;
afterEach(() => {
  ed?.destroy();
  ed = null;
});

function make(content: object) {
  ed = new Editor({ element: document.createElement('div'), extensions: createSchemaExtensions(), content });
  return ed;
}

const para = (id: string, content: object[]) => ({ type: 'paragraph', attrs: { id }, content });

describe('block conversion keeps content (R-EDITOR-003, R-EDITOR-067, AT-64)', () => {
  it('AT-64: paragraph → H2 → paragraph keeps text, marks and the block id', () => {
    const e = make({ type: 'doc', content: [para('b1', [{ type: 'text', text: 'Текст ' }, { type: 'text', text: 'жирный', marks: [{ type: 'bold' }] }])] });
    e.commands.setTextSelection(3);
    e.chain().setHeading({ level: 2 }).run();
    expect(e.getJSON().content![0]).toMatchObject({ type: 'heading', attrs: { level: 2, id: 'b1' } });
    e.chain().setParagraph().run();
    const back = e.getJSON().content![0];
    expect(back).toMatchObject({ type: 'paragraph', attrs: { id: 'b1' } });
    expect(back.content).toEqual([{ type: 'text', text: 'Текст ' }, { type: 'text', text: 'жирный', marks: [{ type: 'bold' }] }]);
  });

  it('R-EDITOR-003: list, checklist, quote and callout conversions keep the text and the paragraph id', () => {
    const conversions: Array<(e: Editor) => boolean> = [
      (e) => e.chain().toggleBulletList().run(),
      (e) => e.chain().toggleOrderedList().run(),
      (e) => e.chain().toggleTaskList().run(),
      (e) => e.chain().toggleBlockquote().run(),
      (e) => e.chain().wrapIn('callout').run(),
      (e) => e.chain().toggleBulletList().run() && e.chain().toggleBulletList().run(), // and back to a paragraph
    ];
    for (const convert of conversions) {
      ed?.destroy();
      const e = make({ type: 'doc', content: [para('b1', [{ type: 'text', text: 'пункт' }])] });
      e.commands.setTextSelection(2);
      expect(convert(e)).toBe(true);
      expect(e.state.doc.textContent).toBe('пункт');
      expect(JSON.stringify(e.getJSON())).toContain('"id":"b1"');
    }
  });

  it('R-EDITOR-067: converting to code keeps mentions/formulas as text and asks before removing formatting', async () => {
    const e = make({
      type: 'doc',
      content: [para('b1', [{ type: 'text', text: 'Вызвать ' }, { type: 'mention', attrs: { id: 'u1', label: 'Иван' } }, { type: 'text', text: ' и ' }, { type: 'inlineMath', attrs: { latex: 'x^2' } }])],
    });
    e.commands.setTextSelection(3);
    expect(codeConversionLoss(e.state)).toEqual({ formatted: false, inlineNodes: 2 });
    let asked = 0;
    expect(await convertToCodeBlock(e, async () => (asked++, true))).toBe(true);
    expect(asked).toBe(0);
    expect(e.getJSON().content![0]).toMatchObject({ type: 'codeBlock', attrs: { id: 'b1' }, content: [{ type: 'text', text: 'Вызвать @Иван и x^2' }] });
  });

  it('R-EDITOR-067: declining the confirmation leaves formatted text unchanged', async () => {
    const doc = { type: 'doc', content: [para('b1', [{ type: 'text', text: 'ссылка', marks: [{ type: 'link', attrs: { href: 'https://e.com' } }] }])] };
    const e = make(doc);
    e.commands.setTextSelection(3);
    expect(await convertToCodeBlock(e, async (loss) => (expect(loss.formatted).toBe(true), false))).toBe(false);
    expect(e.getJSON().content![0].type).toBe('paragraph');
    expect(await convertToCodeBlock(e, async () => true)).toBe(true);
    expect(e.getJSON().content![0]).toMatchObject({ type: 'codeBlock', content: [{ type: 'text', text: 'ссылка' }] });
  });
});

describe('caret memory (R-EDITOR-001, R-EDITOR-037)', () => {
  it('R-EDITOR-037: caret is stored relative to the block id and survives edits before the block', () => {
    const e = make({ type: 'doc', content: [para('a', [{ type: 'text', text: 'первый' }]), para('b', [{ type: 'text', text: 'второй абзац' }])] });
    const posInB = e.state.doc.child(0).nodeSize + 1 + 6; // after "второй"
    const anchor = posToAnchor(e.state.doc, posInB)!;
    expect(anchor).toEqual({ blockId: 'b', offset: 6 });
    e.commands.insertContentAt(1, 'вставка ');
    const pos = anchorToPos(e.state.doc, anchor)!;
    expect(e.state.doc.textBetween(pos - 6, pos)).toBe('второй');
    expect(anchorToPos(e.state.doc, { blockId: 'нет', offset: 1 })).toBeNull();
    expect(anchorToPos(e.state.doc, { blockId: 'a', offset: 999 })).toBe(1 + e.state.doc.child(0).content.size);
  });
});
