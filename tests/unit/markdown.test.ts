import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { markdownToDoc, docToMarkdown, docToPlainText, collectBlocks, getKbSchema, type PMNode } from '@kb/shared';

const schema = getKbSchema();
const valid = (doc: PMNode) => {
  const node = schema.nodeFromJSON(doc);
  node.check();
  return node;
};

/** Removes ids to compare structure. */
function strip(n: any): any {
  if (Array.isArray(n)) return n.map(strip);
  if (n && typeof n === 'object') {
    const o: any = {};
    for (const [k, v] of Object.entries(n)) {
      if (k === 'id') continue;
      o[k] = strip(v);
    }
    return o;
  }
  return n;
}

describe('markdown import', () => {
  it('parses GFM structure into valid document', () => {
    const md = `---
title: Регламент освещения
tags: [knx, свет]
---

## Цель

Текст с **жирным**, *курсивом*, ~~зачёркнутым~~, \`кодом\` и [ссылкой](https://example.com).

- пункт 1
  - вложенный
- пункт 2

1. первый
2. второй

- [x] сделано
- [ ] не сделано

> цитата

| A | B |
|:--|--:|
| 1 | 2 |

\`\`\`ts
const a = 1;
\`\`\`

\`\`\`mermaid
graph TD; A-->B
\`\`\`

---

$$
E=mc^2
$$
`;
    const r = markdownToDoc(md);
    expect(r.title).toBe('Регламент освещения');
    expect(r.frontMatter?.tags).toEqual(['knx', 'свет']);
    valid(r.doc);
    const types = r.doc.content!.map((n) => n.type);
    expect(types).toEqual(['heading', 'paragraph', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'table', 'codeBlock', 'mermaid', 'horizontalRule', 'blockMath']);
    const table = r.doc.content![6];
    expect(table.content![0].content![0].type).toBe('tableHeader');
    expect(table.content![0].content![1].attrs!.align).toBe('right');
    expect(r.doc.content![4].content![0].attrs!.checked).toBe(true);
    // every block has a unique id
    const ids = collectBlocks(r.doc).map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('takes leading H1 as title', () => {
    const r = markdownToDoc('# Заголовок\n\nтело');
    expect(r.title).toBe('Заголовок');
    expect(r.doc.content![0].type).toBe('paragraph');
  });

  it('converts GitHub alerts into callouts', () => {
    const r = markdownToDoc('> [!WARNING]\n> Осторожно: высокое напряжение\n> ещё строка');
    const c = r.doc.content![0];
    expect(c.type).toBe('callout');
    expect(c.attrs!.variant).toBe('warning');
    expect(docToPlainText(c)).toContain('Осторожно');
    valid(r.doc);
  });

  it('converts <details> to toggle with nested markdown', () => {
    const r = markdownToDoc('<details>\n<summary>Подробнее **важно**</summary>\n\n- a\n- b\n\n</details>\n\nпосле');
    const d = r.doc.content![0];
    expect(d.type).toBe('details');
    expect(d.content![1].content![0].type).toBe('bulletList');
    expect(r.doc.content![1].type).toBe('paragraph');
    valid(r.doc);
  });

  it('lifts images out of paragraphs and reports missing assets', () => {
    const r = markdownToDoc('Текст ![схема](assets/s.png "Подпись") после', {
      resolveAsset: (h) => (h === 'assets/s.png' ? { attachmentId: 'a1', src: '/api/v1/attachments/a1/content' } : null),
    });
    expect(r.doc.content!.map((n) => n.type)).toEqual(['paragraph', 'image', 'paragraph']);
    expect(r.doc.content![1].attrs!.caption).toBe('Подпись');
    const r2 = markdownToDoc('![x](missing.png)', { resolveAsset: () => null });
    expect(r2.warnings.some((w) => w.code === 'image-missing')).toBe(true);
    expect(docToPlainText(r2.doc)).toContain('изображение');
  });

  it('removes unsafe links but keeps text', () => {
    const r = markdownToDoc('[клик](javascript:alert(1))');
    expect(docToPlainText(r.doc)).toBe('клик');
    expect(JSON.stringify(r.doc)).not.toContain('javascript');
    expect(r.warnings.some((w) => w.code === 'link-unsafe')).toBe(true);
  });

  it('keeps inline html formatting (underline, mark, sub/sup, color)', () => {
    const r = markdownToDoc('a <u>подч</u> <mark>фон</mark> H<sub>2</sub>O x<sup>2</sup> <span style="color:#d00">красный</span>');
    const marks = r.doc.content![0].content!.flatMap((n) => (n.marks ?? []).map((m) => m.type));
    expect(marks).toEqual(expect.arrayContaining(['underline', 'highlight', 'subscript', 'superscript', 'textStyle']));
    valid(r.doc);
  });

  it('converts footnotes without losing text', () => {
    const r = markdownToDoc('Текст[^1].\n\n[^1]: Пояснение.');
    const txt = docToPlainText(r.doc);
    expect(txt).toContain('Пояснение');
    expect(r.warnings.some((w) => w.code === 'footnotes')).toBe(true);
  });
});

describe('markdown export', () => {
  const doc: PMNode = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Раздел' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'жирный', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' и ' },
          { type: 'text', text: 'ссылка', marks: [{ type: 'link', attrs: { href: 'https://kb.local/x' } }, { type: 'italic' }] },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'подчёркнутый', marks: [{ type: 'underline' }] },
        ],
      },
      {
        type: 'callout',
        attrs: { variant: 'tip', icon: '🔥' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Совет дня' }] }],
      },
      {
        type: 'columns',
        content: [
          { type: 'column', attrs: { width: 2 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'левая' }] }] },
          { type: 'column', attrs: { width: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'правая' }] }] },
        ],
      },
      {
        type: 'details',
        attrs: { open: false, level: 0 },
        content: [
          { type: 'detailsSummary', content: [{ type: 'text', text: 'Свернуть' }] },
          { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'внутри' }] }] },
        ],
      },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', attrs: { colspan: 2, rowspan: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Объединено' }] }] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
              { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }] },
            ],
          },
        ],
      },
      { type: 'toc' },
      { type: 'pageLink', attrs: { pageId: '11111111-1111-1111-1111-111111111111', title: 'Связанная', child: true } },
    ],
  };

  it('writes readable markdown and reports degradations', () => {
    const { markdown, warnings } = docToMarkdown(doc);
    expect(markdown).toContain('## Раздел');
    expect(markdown).toContain('**жирный**');
    expect(markdown).toContain('[*ссылка*](https://kb.local/x)');
    expect(markdown).toContain('<u>подчёркнутый</u>');
    expect(markdown).toContain('> \\[!TIP]');
    expect(markdown).toContain('<details>');
    expect(markdown).toContain('<table>');
    expect(markdown).toContain('colspan="2"');
    expect(warnings.map((w) => w.code)).toContain('table-html');
  });

  it('round-trips through import with structure preserved', () => {
    const { markdown } = docToMarkdown(doc);
    const back = markdownToDoc(markdown, {
      htmlToNodes: (html) =>
        html.includes('<table')
          ? [
              {
                type: 'table',
                content: [
                  { type: 'tableRow', content: [{ type: 'tableHeader', attrs: { colspan: 2, rowspan: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Объединено' }] }] }] },
                  {
                    type: 'tableRow',
                    content: [
                      { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
                      { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }] },
                    ],
                  },
                ],
              },
            ]
          : [],
    });
    valid(back.doc);
    expect(back.doc.content!.map((n) => n.type)).toEqual(['heading', 'paragraph', 'callout', 'columns', 'details', 'table', 'toc', 'pageLink']);
    expect(back.doc.content![2].attrs).toMatchObject({ variant: 'tip', icon: '🔥' });
    expect(back.doc.content![3].content![0].attrs!.width).toBe(2);
    expect(back.doc.content![7].attrs).toMatchObject({ pageId: '11111111-1111-1111-1111-111111111111', child: true, title: 'Связанная' });
    expect(docToPlainText(back.doc)).toBe(docToPlainText(doc));
    // second round trip is stable
    expect(docToMarkdown(back.doc).markdown).toBe(docToMarkdown(doc).markdown);
  });

  it('clean mode omits kb markers', () => {
    const { markdown } = docToMarkdown(doc, { markers: false });
    expect(markdown).not.toContain('<!--kb');
  });
});

describe('markdown property: text is never lost', () => {
  const word = fc.stringMatching(/^[a-zA-Zа-яА-ЯёЁ0-9]{1,8}$/);
  const inlineNode = fc.record({
    text: word,
    marks: fc.subarray(['bold', 'italic', 'strike', 'underline', 'code'] as const, { maxLength: 2 }),
  });
  const para = fc.array(inlineNode, { minLength: 1, maxLength: 5 }).map((parts) => ({
    type: 'paragraph',
    content: parts.flatMap((p, i) => [
      ...(i ? [{ type: 'text', text: ' ' }] : []),
      { type: 'text', text: p.text, ...(p.marks.length ? { marks: (p.marks.includes('code') ? ['code'] : p.marks).map((t) => ({ type: t })) } : {}) },
    ]),
  }));
  const blockArb = fc.oneof(
    para,
    fc.tuple(fc.integer({ min: 1, max: 6 }), word).map(([level, t]) => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text: t }] })),
    fc.array(word, { minLength: 1, maxLength: 4 }).map((items) => ({
      type: 'bulletList',
      content: items.map((t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })),
    })),
    fc.array(fc.array(word, { minLength: 2, maxLength: 2 }), { minLength: 1, maxLength: 3 }).map((rows) => ({
      type: 'table',
      content: rows.map((r, ri) => ({
        type: 'tableRow',
        content: r.map((t) => ({ type: ri === 0 ? 'tableHeader' : 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })),
      })),
    })),
  );

  it('docToMarkdown -> markdownToDoc preserves plain text and block types', () => {
    fc.assert(
      fc.property(fc.array(blockArb, { minLength: 1, maxLength: 6 }), (blocks) => {
        // Avoid a leading H1 being interpreted as title.
        const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'start' }] }, ...blocks] } as PMNode;
        const { markdown } = docToMarkdown(doc);
        const back = markdownToDoc(markdown);
        valid(back.doc);
        expect(docToPlainText(back.doc)).toBe(docToPlainText(doc));
        expect(strip(back.doc.content!.map((b) => b.type))).toEqual(doc.content!.map((b) => b.type));
      }),
      { numRuns: 200 },
    );
  });
});
