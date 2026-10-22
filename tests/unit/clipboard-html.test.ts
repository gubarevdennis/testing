// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { cleanPastedHtml, convertWordLists, cleanCopiedDom, filterStyle, dataUriToFile, toHex } from '../../apps/web/src/editor/clipboard/html';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const WORD = `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><style>p.MsoNormal{font-family:Calibri}</style></head><body lang=RU>
<!--StartFragment-->
<h1 style='margin-top:12pt;font-family:"Calibri Light"'>Регламент<o:p></o:p></h1>
<p class=MsoNormal><span style='font-size:11pt;font-family:Calibri;color:black'>Обычный <b>жирный</b> текст</span><o:p></o:p></p>
<p class=MsoListParagraphCxSpFirst style='text-indent:-18pt;mso-list:l0 level1 lfo1'><![if !supportLists]><span style='font-family:Symbol'><span style='mso-list:Ignore'>·<span style='font:7pt "Times New Roman"'>&nbsp;&nbsp; </span></span></span><![endif]>Пункт один<o:p></o:p></p>
<p class=MsoListParagraphCxSpMiddle style='margin-left:72pt;mso-list:l0 level2 lfo1'><![if !supportLists]><span style='font-family:"Courier New"'><span style='mso-list:Ignore'>o<span>&nbsp;&nbsp;</span></span></span><![endif]>Подпункт<o:p></o:p></p>
<p class=MsoListParagraphCxSpLast style='mso-list:l0 level1 lfo1'><![if !supportLists]><span><span style='mso-list:Ignore'>·<span>&nbsp;</span></span></span><![endif]>Пункт два<o:p></o:p></p>
<p class=MsoNormal>Между списками</p>
<p class=MsoListParagraph style='mso-list:l1 level1 lfo2'><![if !supportLists]><span><span style='mso-list:Ignore'>1.<span>&nbsp;</span></span></span><![endif]>Шаг первый</p>
<p class=MsoListParagraph style='mso-list:l1 level1 lfo2'><![if !supportLists]><span><span style='mso-list:Ignore'>2.<span>&nbsp;</span></span></span><![endif]>Шаг второй</p>
<!--[if gte vml 1]><v:shape><v:imagedata src="file:///C:/Users/x/AppData/Local/Temp/msohtmlclip1/01/clip_image001.png"/></v:shape><![endif]--><![if !vml]><img width=200 height=100 src="file:///C:/Users/x/AppData/Local/Temp/msohtmlclip1/01/clip_image002.png"><![endif]>
<table class=MsoTableGrid border=1><tr><td width=300 valign=top style='border:solid windowtext 1pt'><p class=MsoNormal>Ячейка</p></td></tr></table>
<!--EndFragment--></body></html>`;

describe('paste sanitizer (R-CLIPBOARD-009, R-CLIPBOARD-010, R-CLIPBOARD-022)', () => {
  it('R-CLIPBOARD-022: removes scripts, event handlers, iframes and arbitrary inline styles', () => {
    const r = cleanPastedHtml(
      `<p onclick="alert(1)" style="font-family:Comic Sans MS;font-size:15pt;color:#123456;margin:4px">Текст <span style="color:#b4372b;font-weight:700">красный</span></p>` +
        `<script>alert(2)</script><iframe srcdoc="evil"></iframe><a href="javascript:alert(3)">ссылка</a><a href="https://example.com/x" target="_blank" ping="https://t">ok</a>`,
    );
    expect(r.html).not.toMatch(/script|onclick|iframe|javascript|Comic|15pt|#123456|margin|ping|target/i);
    expect(r.html).toContain('color: #b4372b');
    expect(r.html).toContain('font-weight: bold');
    expect(r.html).toContain('href="https://example.com/x"');
    expect(r.html).toContain('>ссылка<');
  });

  it('R-CLIPBOARD-010: Word HTML loses Office junk but keeps headings, text, tables (no lost cells)', () => {
    const r = cleanPastedHtml(WORD);
    expect(r.html).not.toMatch(/o:p|mso-|Calibri|MsoNormal|font-size|<style|v:shape/i);
    expect(r.html).toMatch(/<h1>Регламент<\/h1>/);
    expect(r.html).toContain('Обычный <b>жирный</b> текст');
    expect(r.html).toMatch(/<td[^>]*><p>Ячейка<\/p><\/td>/);
  });

  it('R-CLIPBOARD-009: Google Docs bold wrapper with font-weight:normal does not make everything bold', () => {
    const r = cleanPastedHtml(`<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr"><span style="font-size:11pt;font-family:Arial;font-weight:700;vertical-align:baseline">Жирное</span><span style="font-style:italic"> курсив</span></p></b>`);
    expect(r.html).not.toMatch(/<b\b/);
    expect(r.html).toContain('<span style="font-weight: bold">Жирное</span>');
    expect(r.html).toContain('font-style: italic');
  });

  it('keeps own palette colours given as rgb(), own fonts and sizes; drops foreign ones', () => {
    expect(toHex('rgb(180, 55, 43)')).toBe('#b4372b');
    expect(filterStyle('color: rgb(180, 55, 43); font-size: 18px; font-family: Calibri', 'span')).toBe('color: #b4372b; font-size: 18px');
    expect(filterStyle('background-color:#FFF3B0;font-size:11pt', 'mark')).toBe('background-color: #fff3b0');
    expect(filterStyle('text-align:center;vertical-align:middle', 'td')).toBe('text-align: center; vertical-align: middle');
    expect(filterStyle('text-align:center', 'span')).toBe('');
  });
});

describe('Word lists (AT-44, UX13-02, R-CLIPBOARD-020)', () => {
  it('AT-44: Word list paragraphs become nested bullet and numbered lists', () => {
    const r = cleanPastedHtml(WORD);
    expect(r.wordListItems).toBe(5);
    const d = new DOMParser().parseFromString(r.html, 'text/html');
    const ul = d.querySelector('ul')!;
    expect(ul).not.toBeNull();
    expect([...ul.children].map((li) => li.querySelector(':scope > p')?.textContent?.trim())).toEqual(['Пункт один', 'Пункт два']);
    expect(ul.querySelector('li > ul > li')?.textContent?.trim()).toBe('Подпункт');
    const ol = d.querySelector('ol')!;
    expect([...ol.children].map((li) => li.textContent?.trim())).toEqual(['Шаг первый', 'Шаг второй']);
    // markers are removed, the text between lists stays a paragraph
    expect(r.html).not.toMatch(/·|>o</);
    expect(d.body.textContent).toContain('Между списками');
  });

  it('converts lists inside containers and keeps non-list paragraphs in place', () => {
    const d = new DOMParser().parseFromString(
      `<div><p>до</p><p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">a)</span>альфа</p><p style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">b)</span>бета</p><p>после</p></div>`,
      'text/html',
    );
    expect(convertWordLists(d.body)).toBe(2);
    expect(d.body.innerHTML).toBe('<div><p>до</p><ol><li><p>альфа</p></li><li><p>бета</p></li></ol><p>после</p></div>');
  });
});

describe('images in pasted HTML (R-CLIPBOARD-020, SC-06)', () => {
  it('SC-06: embedded images are extracted for upload, local Word file paths are reported, tracking pixels dropped', () => {
    const r = cleanPastedHtml(`<p>Схема:</p><figure><img src="${PNG}" alt="схема"><figcaption>Рис</figcaption></figure><img src="https://t.example/p.gif" width="1" height="1">` + WORD);
    expect(r.images).toEqual([{ dataUri: PNG, alt: 'схема' }]);
    expect(r.droppedImages).toBe(1);
    expect(r.html).not.toMatch(/data:image|file:|p\.gif/);
    const f = dataUriToFile(PNG, 'вставка');
    expect(f.type).toBe('image/png');
    expect(f.name).toBe('вставка.png');
    expect(f.size).toBeGreaterThan(60);
  });

  it('turns absolute links and images of this instance back into in-app URLs', () => {
    const r = cleanPastedHtml(`<a href="https://kb.corp/p/123">стр</a><img src="https://kb.corp/api/v1/attachments/1/content" data-attachment-id="1">`, { origin: 'https://kb.corp' });
    expect(r.html).toContain('href="/p/123"');
    expect(r.html).toContain('src="/api/v1/attachments/1/content"');
    expect(r.html).toContain('data-attachment-id="1"');
  });
});

describe('copied HTML (R-CLIPBOARD-004, R-CLIPBOARD-018)', () => {
  it('R-CLIPBOARD-018: makes URLs absolute and removes comment anchors and DOM ids, keeps block structure attributes', () => {
    const d = new DOMParser().parseFromString(
      `<h2 id="b1" data-block-id="b1">Заголовок</h2><p data-block-id="b2">Текст <span data-comment-thread="t1" class="kb-comment-anchor">с комментарием</span> <a href="/p/42">ссылка</a></p><figure data-align="center" class="kb-image"><img src="/api/v1/attachments/9/content" data-attachment-id="9" alt="x"></figure>`,
      'text/html',
    );
    cleanCopiedDom(d.body, 'https://kb.corp');
    const html = d.body.innerHTML;
    expect(html).not.toMatch(/data-comment-thread|kb-comment-anchor|\sid=/);
    expect(html).toContain('Текст с комментарием');
    expect(html).toContain('href="https://kb.corp/p/42"');
    expect(html).toContain('src="https://kb.corp/api/v1/attachments/9/content"');
    expect(html).toContain('data-block-id="b1"');
    expect(html).toContain('data-attachment-id="9"');
  });
});
