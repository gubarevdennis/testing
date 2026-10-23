import {
  AlignmentType,
  Bookmark,
  BorderStyle,
  Document,
  ExternalHyperlink,
  FootnoteReferenceRun,
  HeadingLevel,
  ImageRun,
  InternalHyperlink,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type IRunOptions,
  type ParagraphChild,
} from 'docx';
import sharp from 'sharp';
import type { PMNode, PMMark, ConversionWarning } from '@kb/shared';

export interface DocxImage {
  data: Buffer;
  width: number;
  height: number;
  mime: string;
}

export interface DocxExportOptions {
  title: string;
  author?: string;
  description?: string;
  /** Absolute base URL for links to pages and files. */
  baseUrl: string;
  loadImage: (node: PMNode) => Promise<DocxImage | null>;
  pageTitle?: (pageId: string) => string | null;
  syncedContent?: (pageId: string, blockId: string) => PMNode | null;
  collectionRows?: (collectionId: string) => { title: string; rows: string[][] } | null;
}

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
const CALLOUT_FILL: Record<string, string> = { info: 'EAF1FB', tip: 'E8F6EE', important: 'F3ECFB', warning: 'FDF3E1', error: 'FBEAEA', example: 'EEF0F3', neutral: 'F3F5F7' };
const CALLOUT_ICON: Record<string, string> = { info: 'ℹ', tip: '💡', important: '❗', warning: '⚠', error: '⛔', example: '📝', neutral: '📌' };
const MAX_IMAGE_WIDTH = 620; // px at 96 dpi ≈ 16.4 cm, fits A4 with default margins

const colorHex = (c: string | null | undefined): string | undefined => {
  if (!c) return undefined;
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (m) return m[1].toUpperCase();
  const s = /^#?([0-9a-f]{3})$/i.exec(c.trim());
  return s ? s[1].split('').map((x) => x + x).join('').toUpperCase() : undefined;
};

export async function docToDocx(doc: PMNode, opts: DocxExportOptions): Promise<{ buffer: Buffer; warnings: ConversionWarning[] }> {
  const warnings: ConversionWarning[] = [];
  const warn = (code: string, message: string) => {
    if (!warnings.some((w) => w.code === code)) warnings.push({ code, message });
  };
  let listInstance = 0;
  // Footnotes become Word footnotes (numbered by Word in reference order); inline images ImageRuns in their line.
  const footnotes: Record<number, { children: Paragraph[] }> = {};
  let footnoteNo = 0;
  const inlineImages = new Map<PMNode, ImageRun | null>();
  const pending: PMNode[] = [];
  const collectInline = (n: PMNode) => {
    if (n.type === 'inlineImage') pending.push(n);
    n.content?.forEach(collectInline);
  };
  collectInline(doc);
  await Promise.all(pending.map(async (n) => inlineImages.set(n, await imageRun(n, MAX_IMAGE_WIDTH))));

  async function imageRun(n: PMNode, maxWidth: number): Promise<ImageRun | null> {
    const img = await opts.loadImage(n).catch(() => null);
    if (!img) return null;
    const { width, height } = img;
    let data = img.data;
    let type: 'png' | 'jpg' | 'gif' = img.mime === 'image/jpeg' ? 'jpg' : img.mime === 'image/gif' ? 'gif' : 'png';
    if (!['image/png', 'image/jpeg', 'image/gif'].includes(img.mime)) {
      data = await sharp(data).png().toBuffer();
      type = 'png';
    }
    const target = Math.min(n.attrs?.width ?? width, maxWidth, width || maxWidth);
    const scale = width ? target / width : 1;
    return new ImageRun({ type, data, transformation: { width: Math.round((width || 400) * scale), height: Math.round((height || 300) * scale) }, altText: { name: n.attrs?.alt || 'image', description: n.attrs?.alt || '', title: n.attrs?.caption || n.attrs?.title || '' } } as any);
  }

  function runs(nodes: PMNode[] | undefined, base: IRunOptions = {}): ParagraphChild[] {
    const out: ParagraphChild[] = [];
    for (const n of nodes ?? []) {
      if (n.type === 'hardBreak') {
        out.push(new TextRun({ ...base, break: 1 }));
        continue;
      }
      if (n.type === 'mention') {
        out.push(new TextRun({ ...base, text: '@' + (n.attrs?.label ?? ''), color: '5A85C6' }));
        continue;
      }
      if (n.type === 'inlineMath') {
        warn('math', 'Формулы экспортированы как текст LaTeX');
        out.push(new TextRun({ ...base, text: n.attrs?.latex ?? '', italics: true, font: 'Cambria Math' }));
        continue;
      }
      if (n.type === 'footnote') {
        footnoteNo++;
        footnotes[footnoteNo] = { children: [new Paragraph({ children: runs(n.content) })] };
        out.push(new FootnoteReferenceRun(footnoteNo));
        continue;
      }
      if (n.type === 'inlineImage') {
        const run = inlineImages.get(n);
        if (run) out.push(run);
        else {
          warn('image-missing', 'Некоторые изображения недоступны и заменены текстовыми ссылками');
          out.push(new TextRun({ ...base, text: `[изображение: ${n.attrs?.alt || 'без описания'}]`, italics: true }));
        }
        continue;
      }
      if (n.type === 'pageMention') {
        out.push(new ExternalHyperlink({ link: `${opts.baseUrl}/p/${n.attrs?.pageId}${n.attrs?.blockId ? '#' + n.attrs.blockId : ''}`, children: [new TextRun({ ...base, text: opts.pageTitle?.(n.attrs?.pageId) ?? n.attrs?.title ?? 'Страница', style: 'Hyperlink' })] }));
        continue;
      }
      if (n.type !== 'text') continue;
      const o: any = { ...base, text: n.text ?? '' };
      let href: string | null = null;
      for (const m of (n.marks ?? []) as PMMark[]) {
        switch (m.type) {
          case 'bold':
            o.bold = true;
            break;
          case 'italic':
            o.italics = true;
            break;
          case 'underline':
            o.underline = {};
            break;
          case 'strike':
            o.strike = true;
            break;
          case 'code':
            o.font = 'Consolas';
            o.shading = { type: ShadingType.CLEAR, fill: 'F3F5F7', color: 'auto' };
            break;
          case 'subscript':
            o.subScript = true;
            break;
          case 'superscript':
            o.superScript = true;
            break;
          case 'highlight':
            o.shading = { type: ShadingType.CLEAR, fill: colorHex(m.attrs?.color) ?? 'FFF3B0', color: 'auto' };
            break;
          case 'textStyle':
            if (colorHex(m.attrs?.color)) o.color = colorHex(m.attrs?.color);
            if (m.attrs?.fontSize) o.size = Math.round(parseFloat(m.attrs.fontSize) * 1.5);
            if (m.attrs?.fontFamily) o.font = String(m.attrs.fontFamily).split(',')[0].replace(/"/g, '').trim();
            break;
          case 'link':
            href = m.attrs?.href ?? null;
            break;
        }
      }
      if (href?.startsWith('#') && href.length > 1) {
        // In-document anchor (block id) → Word bookmark link, not an external relationship (R-IMPORT-026).
        out.push(new InternalHyperlink({ anchor: bookmarkName(href.slice(1)), children: [new TextRun({ ...o, style: 'Hyperlink' })] }));
      } else if (href) {
        const link = href.startsWith('/') ? opts.baseUrl + href : href;
        out.push(new ExternalHyperlink({ link, children: [new TextRun({ ...o, style: 'Hyperlink' })] }));
      } else out.push(new TextRun(o));
    }
    return out;
  }

  const align = (a: string | null | undefined) =>
    a === 'center' ? AlignmentType.CENTER : a === 'right' ? AlignmentType.RIGHT : a === 'justify' ? AlignmentType.JUSTIFIED : undefined;

  async function blocks(nodes: PMNode[] | undefined, ctx: { indent?: number } = {}): Promise<Array<Paragraph | Table | TableOfContents>> {
    const out: Array<Paragraph | Table | TableOfContents> = [];
    for (const n of nodes ?? []) out.push(...(await block(n, ctx)));
    return out;
  }

  async function list(n: PMNode, ordered: boolean, level: number, instance: number, task: boolean): Promise<Array<Paragraph | Table | TableOfContents>> {
    const out: Array<Paragraph | Table | TableOfContents> = [];
    for (const item of n.content ?? []) {
      const [first, ...rest] = item.content ?? [];
      const prefix = task ? [new TextRun({ text: item.attrs?.checked ? '☑ ' : '☐ ' })] : [];
      out.push(
        new Paragraph({
          children: [...prefix, ...runs(first?.content)],
          ...(task ? { indent: { left: 360 * (level + 1) } } : { numbering: { reference: ordered ? 'kb-numbers' : 'kb-bullets', level: Math.min(level, 8), instance } }),
        }),
      );
      for (const child of rest) {
        if (child.type === 'bulletList' || child.type === 'orderedList' || child.type === 'taskList')
          out.push(...(await list(child, child.type === 'orderedList', level + 1, child.type === 'orderedList' ? ++listInstance : instance, child.type === 'taskList')));
        else out.push(...(await block(child, { indent: level + 1 })));
      }
    }
    return out;
  }

  async function block(n: PMNode, ctx: { indent?: number } = {}): Promise<Array<Paragraph | Table | TableOfContents>> {
    const indent = ctx.indent ? { left: 360 * ctx.indent } : undefined;
    switch (n.type) {
      case 'paragraph':
        return [new Paragraph({ children: runs(n.content, n.attrs?.variant === 'lead' ? { size: 26, color: '68717D' } : {}), alignment: align(n.attrs?.textAlign), indent })];
      case 'heading': {
        // Every heading carries a bookmark named after its block id: anchors and the TOC keep working in Word.
        const children = n.attrs?.id ? [new Bookmark({ id: bookmarkName(n.attrs.id), children: runs(n.content) })] : runs(n.content);
        return [new Paragraph({ heading: HEADINGS[Math.min(6, Math.max(1, n.attrs?.level ?? 1)) - 1], children, alignment: align(n.attrs?.textAlign) })];
      }
      case 'blockquote': {
        const out: Array<Paragraph | Table | TableOfContents> = [];
        for (const c of n.content ?? []) {
          if (c.type === 'paragraph' || c.type === 'heading')
            // Word's "Quote" style keeps the quote semantic for Word users and for re-import (R-EXPORT-012).
            out.push(new Paragraph({ style: 'Quote', children: runs(c.content, { italics: true, color: '4A5260' }), indent: { left: 567 }, border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'C9CFD8', space: 8 } } }));
          else out.push(...(await block(c, { indent: (ctx.indent ?? 0) + 1 })));
        }
        return out;
      }
      case 'codeBlock':
      case 'mermaid': {
        const text = (n.content ?? []).map((t) => t.text ?? '').join('');
        const out: Paragraph[] = [];
        if (n.type === 'mermaid') {
          warn('mermaid', 'Диаграммы Mermaid экспортированы как исходный текст (редактируемый источник сохранён)');
          out.push(new Paragraph({ children: [new TextRun({ text: 'Диаграмма (Mermaid):', bold: true, color: '68717D', size: 18 })] }));
        }
        const lines = text.split('\n');
        out.push(
          new Paragraph({
            style: 'Code',
            children: lines.flatMap((l, idx) => [new TextRun({ text: l, font: 'Consolas', size: 19, ...(idx ? { break: 1 } : {}) })]),
            shading: { type: ShadingType.CLEAR, fill: 'F3F5F7', color: 'auto' },
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'E5E8ED', space: 4 }, bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E8ED', space: 4 }, left: { style: BorderStyle.SINGLE, size: 4, color: 'E5E8ED', space: 4 }, right: { style: BorderStyle.SINGLE, size: 4, color: 'E5E8ED', space: 4 } },
            indent,
          }),
        );
        return out;
      }
      case 'blockMath':
        warn('math', 'Формулы экспортированы как текст LaTeX');
        return [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: n.attrs?.latex ?? '', italics: true, font: 'Cambria Math' })] })];
      case 'horizontalRule':
        return [new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E5E8ED', space: 1 } } })];
      case 'bulletList':
        return list(n, false, ctx.indent ?? 0, ++listInstance, false);
      case 'orderedList':
        return list(n, true, ctx.indent ?? 0, ++listInstance, false);
      case 'taskList':
        return list(n, false, ctx.indent ?? 0, ++listInstance, true);
      case 'toc':
        return [new TableOfContents('Оглавление', { hyperlink: true, headingStyleRange: '1-4' })];
      case 'table':
        return [await tableBlock(n)];
      case 'callout': {
        const v = n.attrs?.variant ?? 'info';
        const inner = await blocks(n.content);
        return [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    shading: { type: ShadingType.CLEAR, fill: CALLOUT_FILL[v] ?? 'F3F5F7', color: 'auto' },
                    margins: { top: 120, bottom: 120, left: 160, right: 160 },
                    borders: noBorders(),
                    children: [new Paragraph({ children: [new TextRun({ text: (n.attrs?.icon ?? CALLOUT_ICON[v] ?? '') + ' ', bold: true })] }), ...(inner as Paragraph[])],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({ children: [] }),
        ];
      }
      case 'details': {
        const summary = (n.content ?? []).find((c) => c.type === 'detailsSummary');
        const content = (n.content ?? []).find((c) => c.type === 'detailsContent');
        warn('toggle', 'Раскрывающиеся блоки экспортированы в развёрнутом виде');
        return [new Paragraph({ children: [new TextRun({ text: '▸ ' }), ...runs(summary?.content, { bold: true })], heading: n.attrs?.level ? HEADINGS[Math.min(6, n.attrs.level) - 1] : undefined }), ...(await blocks(content?.content, { indent: (ctx.indent ?? 0) + 1 }))];
      }
      case 'columns': {
        const cols = n.content ?? [];
        const total = cols.reduce((a, c) => a + (c.attrs?.width ?? 1), 0);
        return [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: none(), bottom: none(), left: none(), right: none(), insideHorizontal: none(), insideVertical: none() },
            rows: [
              new TableRow({
                children: await Promise.all(
                  cols.map(async (c) => new TableCell({ borders: noBorders(), width: { size: Math.round(((c.attrs?.width ?? 1) / total) * 100), type: WidthType.PERCENTAGE }, margins: { left: 80, right: 80 }, children: ensureParagraph(await blocks(c.content)) })),
                ),
              }),
            ],
          }),
        ];
      }
      case 'image': {
        const run = await imageRun(n, MAX_IMAGE_WIDTH);
        if (!run) {
          warn('image-missing', 'Некоторые изображения недоступны и заменены текстовыми ссылками');
          return [new Paragraph({ children: [new TextRun({ text: `[изображение: ${n.attrs?.alt || n.attrs?.caption || 'без описания'}]`, italics: true })] })];
        }
        const out: Paragraph[] = [
          new Paragraph({
            alignment: n.attrs?.align === 'left' ? AlignmentType.LEFT : n.attrs?.align === 'right' ? AlignmentType.RIGHT : AlignmentType.CENTER,
            children: [run],
          }),
        ];
        // Word's built-in "caption" style: Word lists it in the table of figures and re-import maps it back (R-IMPORT-027).
        if (n.attrs?.caption) out.push(new Paragraph({ style: 'Caption', alignment: AlignmentType.CENTER, children: [new TextRun({ text: n.attrs.caption })] }));
        return out;
      }
      case 'fileBlock':
        return [new Paragraph({ children: [new ExternalHyperlink({ link: n.attrs?.attachmentId ? `${opts.baseUrl}/api/v1/attachments/${n.attrs.attachmentId}/download` : n.attrs?.href ?? opts.baseUrl, children: [new TextRun({ text: '📎 ' + (n.attrs?.name || 'файл'), style: 'Hyperlink' })] })] })];
      case 'embed':
        return [new Paragraph({ children: [new ExternalHyperlink({ link: n.attrs?.url || opts.baseUrl, children: [new TextRun({ text: (n.attrs?.kind === 'video' ? '🎬 ' : '🔗 ') + (n.attrs?.title || n.attrs?.url || 'медиа'), style: 'Hyperlink' })] })] })];
      case 'pageLink':
        return [new Paragraph({ children: [new ExternalHyperlink({ link: `${opts.baseUrl}/p/${n.attrs?.pageId}`, children: [new TextRun({ text: '📄 ' + (opts.pageTitle?.(n.attrs?.pageId) ?? n.attrs?.title ?? 'Страница'), style: 'Hyperlink' })] })] })];
      case 'syncedBlock': {
        const c = n.attrs?.sourcePageId ? opts.syncedContent?.(n.attrs.sourcePageId, n.attrs.sourceBlockId) : null;
        if (c) return block(c, ctx);
        warn('synced', 'Синхронизированные блоки без доступа экспортированы ссылкой на источник');
        return [new Paragraph({ children: [new ExternalHyperlink({ link: `${opts.baseUrl}/p/${n.attrs?.sourcePageId}`, children: [new TextRun({ text: '🔁 Синхронизированный блок', style: 'Hyperlink' })] })] })];
      }
      case 'collectionView': {
        const data = n.attrs?.collectionId ? opts.collectionRows?.(n.attrs.collectionId) : null;
        if (!data) {
          warn('collection', 'Коллекции без данных экспортированы ссылкой');
          return [new Paragraph({ children: [new TextRun({ text: '🗂 Коллекция' })] })];
        }
        return [new Paragraph({ children: [new TextRun({ text: data.title, bold: true })] }), simpleTable(data.rows)];
      }
      default:
        if (n.content) return blocks(n.content, ctx);
        return [];
    }
  }

  async function tableBlock(n: PMNode): Promise<Table> {
    const rows = n.content ?? [];
    const out: TableRow[] = [];
    for (const [ri, r] of rows.entries()) {
      const cells: TableCell[] = [];
      for (const c of r.content ?? []) {
        const header = c.type === 'tableHeader';
        const children: Array<Paragraph | Table> = [];
        for (const b of c.content ?? []) {
          if (b.type === 'paragraph') children.push(new Paragraph({ alignment: align(c.attrs?.align ?? b.attrs?.textAlign), children: runs(b.content, header ? { bold: true } : {}) }));
          else children.push(...ensureParagraph(await block(b)));
        }
        cells.push(
          new TableCell({
            columnSpan: (c.attrs?.colspan ?? 1) > 1 ? c.attrs!.colspan : undefined,
            rowSpan: (c.attrs?.rowspan ?? 1) > 1 ? c.attrs!.rowspan : undefined,
            verticalAlign: c.attrs?.valign === 'middle' ? VerticalAlign.CENTER : c.attrs?.valign === 'bottom' ? VerticalAlign.BOTTOM : VerticalAlign.TOP,
            shading: header ? { type: ShadingType.CLEAR, fill: 'F3F5F7', color: 'auto' } : c.attrs?.background ? { type: ShadingType.CLEAR, fill: colorHex(c.attrs.background) ?? 'FFFFFF', color: 'auto' } : undefined,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: children.length ? children : [new Paragraph({ children: [] })],
          }),
        );
      }
      out.push(new TableRow({ children: cells, tableHeader: ri === 0 && (r.content ?? []).every((c) => c.type === 'tableHeader') }));
    }
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: out });
  }

  function simpleTable(rows: string[][]): Table {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: rows.map((r, ri) => new TableRow({ children: r.map((c) => new TableCell({ shading: ri === 0 ? { type: ShadingType.CLEAR, fill: 'F3F5F7', color: 'auto' } : undefined, children: [new Paragraph({ children: [new TextRun({ text: c, bold: ri === 0 })] })] })) })),
    });
  }

  const body = await blocks(doc.content);
  const numberingLevels = (format: (typeof LevelFormat)[keyof typeof LevelFormat], textFor: (l: number) => string) =>
    Array.from({ length: 9 }, (_, l) => ({ level: l, format, text: textFor(l), alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360 * (l + 1), hanging: 260 } } } }));
  const d = new Document({
    title: opts.title,
    creator: opts.author ?? 'База знаний',
    description: opts.description ?? '',
    features: { updateFields: true },
    footnotes,
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 } } },
      characterStyles: [{ id: 'Hyperlink', name: 'Hyperlink', basedOn: 'DefaultParagraphFont', run: { color: '2F5FA8', underline: {} } }],
      paragraphStyles: [
        { id: 'Code', name: 'Code', basedOn: 'Normal', run: { font: 'Consolas', size: 19 }, paragraph: { spacing: { before: 60, after: 60 } } },
        { id: 'Quote', name: 'Quote', basedOn: 'Normal', run: { italics: true, color: '4A5260' }, paragraph: { indent: { left: 567 } } },
        { id: 'Caption', name: 'caption', basedOn: 'Normal', next: 'Normal', run: { italics: true, size: 18, color: '68717D' }, paragraph: { spacing: { after: 120 } } },
      ],
    },
    numbering: {
      config: [
        { reference: 'kb-bullets', levels: numberingLevels(LevelFormat.BULLET, (l) => ['•', '◦', '▪'][l % 3]) },
        { reference: 'kb-numbers', levels: numberingLevels(LevelFormat.DECIMAL, (l) => Array.from({ length: l + 1 }, (_, k) => `%${k + 1}`).join('.') + '.') },
      ],
    },
    sections: [{ properties: {}, children: [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(opts.title || 'Без названия')] }), ...body] }],
  });
  const buffer = await Packer.toBuffer(d);
  return { buffer, warnings };
}

/** Word bookmark names: ≤ 40 chars, letters/digits/underscore; a leading underscore hides them from the UI. */
export function bookmarkName(blockId: string): string {
  return ('_kb' + String(blockId).replace(/[^A-Za-z0-9]/g, '')).slice(0, 40);
}

function none() {
  return { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
}
function noBorders() {
  return { top: none(), bottom: none(), left: none(), right: none() };
}
function ensureParagraph(list: Array<Paragraph | Table | TableOfContents>): Array<Paragraph | Table> {
  const out = list.filter((x) => !(x instanceof TableOfContents)) as Array<Paragraph | Table>;
  return out.length ? out : [new Paragraph({ children: [] })];
}
