// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Editor } from '@tiptap/core';
import { createSchemaExtensions } from '@kb/shared';
import { cleanPastedHtml, PASTE_TOKEN, unwrapRedirect } from '../../apps/web/src/editor/clipboard/html';
import { parseRtf, substituteWordImages } from '../../apps/web/src/editor/clipboard/rtf';
import { outline } from '../support/doc-outline';

/**
 * Paste fidelity on realistic clipboard fixtures (tests/fixtures/clipboard): Word 365 (HTML + RTF of the same copy),
 * Google Docs, Outlook mail, a web article. The sanitised HTML is parsed by the editor schema exactly like a paste;
 * the resulting structure is compared line by line (R-CLIPBOARD-020, SC-06, UX13-02).
 */
const fx = (name: string) => readFileSync(join(__dirname, '../fixtures/clipboard', name), 'utf8');

let ed: Editor | null = null;
afterEach(() => {
  ed?.destroy();
  ed = null;
});

function pasteStructure(html: string) {
  const res = cleanPastedHtml(html, { origin: 'https://kb.corp' });
  ed = new Editor({ element: document.createElement('div'), extensions: createSchemaExtensions() });
  // the editor's own clipboard parsing and insertion (as for Ctrl+V into an empty page)
  ed.view.pasteHTML(res.html);
  const json = ed.getJSON() as any;
  return { res, json, lines: outline(json), html: res.html };
}

const WORD_EXPECTED = [
  'h1 Регламент приёмки товара',
  'h2 1. Общие положения',
  'h3 1.1. Область применения',
  'h4 1.1.1. Термины',
  'h5 Примечание к терминам',
  'p Документ описывает порядок приёмки и сроки хранения, см. регламент.',
  'ul>li Проверить документы',
  'ul>li>ul>li Накладная ТОРГ-12',
  'ul>li>ul>li>ul>li Подпись кладовщика',
  'ul>li Пересчитать товар',
  'ol>li Разгрузить машину',
  'ol>li Разместить на стеллаже',
  'table [Артикул|Количество][A-100|42]',
];

describe('Word 365 (R-CLIPBOARD-020, UX13-02)', () => {
  it('HTML: five heading levels, three-level list, numbered list, table, link without trackers, quote; no Office junk', () => {
    const { res, lines, html } = pasteStructure(fx('word365-reglament.html'));
    expect(lines.slice(0, WORD_EXPECTED.length)).toEqual(WORD_EXPECTED);
    expect(lines).toContain('quote>p Принятый товар считается переданным на ответственное хранение.');
    expect(lines).toContain('p Конец фрагмента.');
    expect(lines).toContain('link регламент -> https://example.com/reglament');
    // the picture is a local file the browser cannot read: reported, not inserted as a broken image
    expect(res.droppedImages).toBe(1);
    expect(html).not.toMatch(/mso-|MsoNormal|Calibri|file:|o:p|v:shape|lang=|_Toc/i);
    expect(res.wordListItems).toBe(6);
  });

  it('HTML + RTF of the same copy: the picture is taken from the RTF, stays in place with its caption', () => {
    const sub = substituteWordImages(fx('word365-reglament.html'), fx('word365-reglament.rtf'));
    expect(sub.replaced).toBe(1);
    const { res, json, lines } = pasteStructure(sub.html);
    expect(res.droppedImages).toBe(0);
    expect(res.images).toHaveLength(1);
    expect(res.images[0].dataUri).toMatch(/^data:image\/png;base64,iVBORw0KGgo/);
    expect(lines).toContain('img caption=Рисунок 1. Схема зоны приёмки');
    // the caption paragraph is not duplicated as text
    expect(lines.filter((l) => l.includes('Рисунок 1'))).toHaveLength(1);
    const img = (json.content as any[]).find((n) => n.type === 'image');
    expect(img.attrs.src).toMatch(PASTE_TOKEN);
  });

  it('RTF only: the same structure as the HTML flavour (headings from outline levels, lists by level, table, link, picture)', () => {
    const rtf = parseRtf(fx('word365-reglament.rtf'));
    expect(rtf.pictures).toHaveLength(1);
    expect(rtf.droppedPictures).toBe(0); // the WMF fallback (\nonshppict) is skipped, not counted
    const { lines, res } = pasteStructure(rtf.html);
    expect(lines.slice(0, WORD_EXPECTED.length)).toEqual(WORD_EXPECTED);
    expect(lines).toContain('img caption=Рисунок 1. Схема зоны приёмки');
    expect(lines).toContain('p Конец фрагмента.');
    expect(lines).toContain('link регламент -> https://example.com/reglament');
    expect(res.html).toMatch(/<b>порядок<\/b>|<strong>порядок<\/strong>/);
    expect(res.html).toMatch(/<i>сроки<\/i>|<em>сроки<\/em>/);
  });

  it('RTF details: \\uN with fallback, \\\'hh in the ANSI code page, escaped braces, bold toggles', () => {
    const r = parseRtf("{\\rtf1\\ansi\\ansicpg1251{\\fonttbl{\\f0 Arial;}}\\pard \\'cf\\'f0\\'e8\\'e2\\'e5\\'f2, \\u1084?\\u1080?\\u1088?! \\{x\\} {\\b \\'e6\\'e8\\'f0\\b0 \\'ed\\'ee}\\par}");
    expect(r.html).toBe('<p>Привет, мир! {x} <b>жир</b>но</p>');
  });
});

describe('Google Docs, mail, web pages (R-CLIPBOARD-020, R-CLIPBOARD-024, SC-06)', () => {
  it('Google Docs: H1–H6, bold / italic from styles, nested lists written as sibling lists, table, redirect links unwrapped', () => {
    const { lines, json, html } = pasteStructure(fx('gdocs-reglament.html'));
    expect(lines.slice(0, 13)).toEqual([
      'h1 Инструкция кладовщика',
      'h2 Смена',
      'h3 Начало смены',
      'h4 Проверка оборудования',
      'h5 Сканеры',
      'h6 Зарядка',
      'p Перед началом смены обязательно прочитайте инструкцию по охране труда полностью.',
      'ul>li Получить сканер',
      'ul>li>ul>li Проверить заряд',
      'ul>li>ul>li>ul>li Не меньше 80 %',
      'ul>li Открыть смену в WMS',
      'ol>li Принять задания',
      'ol>li Распечатать этикетки',
    ]);
    expect(lines).toContain('table [Зона|Ответственный][Приёмка|Старший смены]');
    expect(lines).toContain('link инструкцию по охране труда -> https://example.com/safety');
    expect(lines.some((l) => l.startsWith('img'))).toBe(true);
    const marks = JSON.stringify(json);
    expect(marks).toContain('"type":"bold"');
    expect(marks).toContain('"type":"italic"');
    // the whole-document <b style="font-weight:normal"> wrapper of Google Docs does not make everything bold
    const p = (json.content as any[]).find((n) => n.type === 'paragraph' && JSON.stringify(n).includes('Перед началом'));
    expect(p.content[0].marks ?? []).toEqual([]);
    expect(html).not.toMatch(/docs-internal-guid|font-family|white-space|google\.com\/url/);
  });

  it('Outlook mail: paragraphs, list, table, quoted message, tracking parameters and pixels removed, cid: logo reported', () => {
    const { lines, res, html } = pasteStructure(fx('outlook-mail.html'));
    expect(lines).toEqual(
      expect.arrayContaining([
        'p Коллеги, добрый день!',
        'p С понедельника меняется график отгрузки. Подробности — в новости на портале.',
        'ul>li Отгрузка до 18:00',
        'ul>li Самовывоз — по записи',
        'table [День|Окно][Пн–Пт|09:00–18:00]',
        'quote>p Исходное письмо: просим подтвердить окна отгрузки.',
        'link новости на портале -> https://portal.example.ru/news/42?id=42',
      ]),
    );
    expect(res.droppedImages).toBe(1); // cid: inline logo of the mail
    expect(html).not.toMatch(/open\.gif|utm_|mc_cid|EmailStyle|WordSection/);
  });

  it('web article: headings, figure with caption, nested numbered list, quote, code with language, table; navigation, scripts, buttons, counters removed', () => {
    const { lines, json, html } = pasteStructure(fx('browser-article.html'));
    expect(lines).toEqual([
      'h1 Как ускорить приёмку',
      'p Пять приёмов, которые сокращают время разгрузки.',
      'h2 Подготовка',
      'p Согласуйте окно разгрузки и проверьте документы заранее — см. чек-лист.',
      'img caption=Рампа после модернизации alt=Разгрузочная рампа',
      'h3 Оборудование',
      'ol>li Сканеры',
      'ol>li>ol>li Беспроводные',
      'ol>li>ol>li Кольцевые',
      'ol>li Весы',
      'quote>p Хорошая приёмка начинается с хорошего плана.',
      'quote>p Руководитель склада',
      'code {"status": "ok"}',
      'table [Метрика|До|После][Время разгрузки|45 мин|28 мин]',
      'link чек-лист -> https://blog.example.com/docs?ref=feed',
    ]);
    expect((json.content as any[]).find((n) => n.type === 'codeBlock').attrs.language).toBe('json');
    expect(html).not.toMatch(/Главная|Поделиться|track\(|google-analytics|srcset|loading=/);
  });

  it('redirect wrappers are unwrapped only for http(s) targets', () => {
    expect(unwrapRedirect('https://www.google.com/url?q=https://example.com/a%3Fb%3D1&sa=D')).toBe('https://example.com/a?b=1');
    expect(unwrapRedirect('https://www.google.com/url?q=javascript:alert(1)')).toBe('https://www.google.com/url?q=javascript:alert(1)');
    expect(unwrapRedirect('https://example.com/url?q=https://x.y')).toBe('https://example.com/url?q=https://x.y');
  });
});
