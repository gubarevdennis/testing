/**
 * Reference documents for import fidelity tests (R-IMPORT-019, R-IMPORT-007/025/027/034, SC-13).
 *
 * No Word-authored binaries are checked in, so the DOCX files are produced with the `docx` library the way Word
 * writes them: built-in style names ("heading 1", "caption", "Quote", "HTML Preformatted"), a real multi-level
 * numbering definition, footnotes, header/footer parts, bookmarks with internal hyperlinks and a TOC field.
 * Every document is described by a small spec, from which both the file (DOCX or Markdown) and the expected
 * text and structure are derived, so the accuracy metric compares against an independent reference.
 */
import {
  AlignmentType,
  Bookmark,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  ImageRun,
  InternalHyperlink,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import sharp from 'sharp';
import { diffChars } from 'diff';
import yauzl from 'yauzl';
import yazl from 'yazl';

export type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; sup?: boolean; sub?: boolean; code?: boolean; href?: string; footnote?: string };
export type Block =
  | { kind: 'h'; level: number; text: string; bookmark?: string }
  | { kind: 'p'; runs: Run[] }
  | { kind: 'list'; ordered: boolean; items: Array<{ text: string; level: number }> }
  | { kind: 'table'; rows: string[][]; mergeFirstRow?: boolean }
  | { kind: 'code'; lines: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'image'; alt: string; caption?: string; color: string }
  | { kind: 'internal-link'; text: string; anchor: string }
  | { kind: 'hr' };

export interface DocSpec {
  title: string;
  blocks: Block[];
  header?: string;
  footer?: string;
  toc?: boolean;
}

// ------------------------------------------------------------------------------------------------ DOCX writer

const NUMBERING = [
  { reference: 'word-numbers', levels: [0, 1, 2].map((l) => ({ level: l, format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][l], text: `%${l + 1}.`, alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } } } })) },
  { reference: 'word-bullets', levels: [0, 1, 2].map((l) => ({ level: l, format: LevelFormat.BULLET, text: ['•', 'o', '▪'][l], alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 * (l + 1), hanging: 360 } } } })) },
];

async function png(color: string) {
  return sharp({ create: { width: 160, height: 90, channels: 3, background: color } }).png().toBuffer();
}

export async function specToDocx(spec: DocSpec): Promise<Buffer> {
  const footnotes: Record<number, { children: Paragraph[] }> = {};
  let fn = 0;
  let listInstance = 0;
  const runs = (rs: Run[]) =>
    rs.flatMap((r) => {
      const opts = { text: r.text, bold: r.bold, italics: r.italic, underline: r.underline ? {} : undefined, strike: r.strike, superScript: r.sup, subScript: r.sub, ...(r.code ? { font: 'Consolas', style: 'HTMLCode' } : {}) };
      const out: Array<TextRun | ExternalHyperlink | FootnoteReferenceRun> = [r.href ? new ExternalHyperlink({ link: r.href, children: [new TextRun({ ...opts, style: 'Hyperlink' })] }) : new TextRun(opts)];
      if (r.footnote) {
        fn++;
        footnotes[fn] = { children: [new Paragraph(r.footnote)] };
        out.push(new FootnoteReferenceRun(fn));
      }
      return out;
    });
  const children: Array<Paragraph | Table | TableOfContents> = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(spec.title)] })];
  if (spec.toc) children.push(new TableOfContents('Оглавление', { hyperlink: true, headingStyleRange: '1-3' }));
  for (const b of spec.blocks) {
    switch (b.kind) {
      case 'h': {
        const heading = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][b.level - 1];
        children.push(new Paragraph({ heading, children: b.bookmark ? [new Bookmark({ id: b.bookmark, children: [new TextRun(b.text)] })] : [new TextRun(b.text)] }));
        break;
      }
      case 'p':
        children.push(new Paragraph({ children: runs(b.runs) }));
        break;
      case 'hr': // how Word draws a horizontal line: an empty paragraph with a bottom border
        children.push(new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'auto', space: 1 } } }));
        break;
      case 'internal-link':
        children.push(new Paragraph({ children: [new InternalHyperlink({ anchor: b.anchor, children: [new TextRun({ text: b.text, style: 'Hyperlink' })] })] }));
        break;
      case 'list': {
        const instance = ++listInstance;
        for (const it of b.items) children.push(new Paragraph({ text: it.text, numbering: { reference: b.ordered ? 'word-numbers' : 'word-bullets', level: it.level, instance } }));
        break;
      }
      case 'table':
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: b.rows.map(
              (r, ri) =>
                new TableRow({
                  children: (ri === 0 && b.mergeFirstRow ? [r[0]] : r).map(
                    (c) => new TableCell({ columnSpan: ri === 0 && b.mergeFirstRow ? b.rows[1].length : undefined, children: [new Paragraph({ children: [new TextRun({ text: c, bold: ri === 0 })] })] }),
                  ),
                }),
            ),
          }),
        );
        break;
      case 'code':
        for (const l of b.lines) children.push(new Paragraph({ style: 'HTMLPreformatted', children: [new TextRun({ text: l, font: 'Consolas' })] }));
        break;
      case 'quote':
        children.push(new Paragraph({ style: 'Quote', children: [new TextRun(b.text)] }));
        break;
      case 'image':
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: await png(b.color), transformation: { width: 160, height: 90 }, altText: { name: b.alt, description: b.alt, title: b.alt } } as any)] }));
        if (b.caption) children.push(new Paragraph({ style: 'Caption', children: [new TextRun(b.caption)] }));
        break;
    }
  }
  const doc = new Document({
    creator: 'Microsoft Office User',
    title: spec.title,
    features: { updateFields: !!spec.toc },
    styles: {
      paragraphStyles: [
        { id: 'Caption', name: 'caption', basedOn: 'Normal', next: 'Normal', run: { italics: true, size: 18, color: '44546A' } },
        { id: 'Quote', name: 'Quote', basedOn: 'Normal', run: { italics: true } },
        { id: 'HTMLPreformatted', name: 'HTML Preformatted', basedOn: 'Normal', run: { font: 'Courier New', size: 20 } },
      ],
      characterStyles: [{ id: 'HTMLCode', name: 'HTML Code', basedOn: 'DefaultParagraphFont', run: { font: 'Courier New' } }],
    },
    numbering: { config: NUMBERING },
    footnotes,
    sections: [
      {
        headers: spec.header ? { default: new Header({ children: [new Paragraph(spec.header)] }) } : undefined,
        footers: spec.footer ? { default: new Footer({ children: [new Paragraph(spec.footer)] }) } : undefined,
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

// -------------------------------------------------------------------------------------------- Markdown writer

export function specToMarkdown(spec: DocSpec): string {
  const notes: string[] = [];
  const inline = (rs: Run[]) =>
    rs
      .map((r) => {
        let t = r.code ? '`' + r.text + '`' : r.text;
        if (r.bold) t = `**${t}**`;
        if (r.italic) t = `*${t}*`;
        if (r.strike) t = `~~${t}~~`;
        if (r.sup) t = `<sup>${t}</sup>`;
        if (r.sub) t = `<sub>${t}</sub>`;
        if (r.underline) t = `<u>${t}</u>`;
        if (r.href) t = `[${t}](${r.href})`;
        if (r.footnote) {
          notes.push(r.footnote);
          t += `[^${notes.length}]`;
        }
        return t;
      })
      .join('');
  const out: string[] = [`# ${spec.title}`, ''];
  for (const b of spec.blocks) {
    switch (b.kind) {
      case 'h':
        out.push('#'.repeat(b.level) + ' ' + b.text, '');
        break;
      case 'p':
        out.push(inline(b.runs), '');
        break;
      case 'internal-link':
        out.push(`[${b.text}](#${b.anchor})`, '');
        break;
      case 'hr':
        out.push('---', '');
        break;
      case 'list': {
        const counters = [0, 0, 0];
        for (const it of b.items) {
          counters[it.level]++;
          for (let l = it.level + 1; l < 3; l++) counters[l] = 0;
          out.push('   '.repeat(it.level) + (b.ordered ? `${counters[it.level]}. ` : '- ') + it.text);
        }
        out.push('');
        break;
      }
      case 'table':
        out.push('| ' + b.rows[0].join(' | ') + ' |', '|' + b.rows[0].map(() => '---').join('|') + '|', ...b.rows.slice(1).map((r) => '| ' + r.join(' | ') + ' |'), '');
        break;
      case 'code':
        out.push('```', ...b.lines, '```', '');
        break;
      case 'quote':
        out.push('> ' + b.text, '');
        break;
      case 'image':
        break; // Markdown corpus documents are single files without assets
    }
  }
  notes.forEach((n, i) => out.push(`[^${i + 1}]: ${n}`));
  return out.join('\n') + '\n';
}

// ------------------------------------------------------------------------------- expectations from the spec

/** Text the imported page must contain, in document order (title excluded: it becomes the page title). */
export function expectedText(spec: DocSpec, format: 'docx' | 'md'): string {
  const parts: string[] = [];
  let n = 0;
  const notes: string[] = [];
  for (const b of spec.blocks) {
    switch (b.kind) {
      case 'h':
        parts.push(b.text);
        break;
      case 'p':
        parts.push(
          b.runs
            .map((r) => {
              if (!r.footnote) return r.text;
              notes.push(r.footnote);
              return `${r.text}[${++n}]`;
            })
            .join(''),
        );
        break;
      case 'internal-link':
        parts.push(b.text);
        break;
      case 'list':
        parts.push(...b.items.map((i) => i.text));
        break;
      case 'table':
        parts.push(...(b.mergeFirstRow && format === 'docx' ? [[b.rows[0][0]], ...b.rows.slice(1)] : b.rows).map((r) => r.join(' ')));
        break;
      case 'code':
        parts.push(b.lines.join('\n'));
        break;
      case 'quote':
        parts.push(b.text);
        break;
      case 'image':
        if (format === 'docx') parts.push([b.alt, b.caption].filter(Boolean).join(' — '));
        break;
    }
  }
  if (notes.length) parts.push('Сноски', ...notes);
  if (format === 'docx' && (spec.header || spec.footer)) parts.push('Колонтитулы исходного документа', ...[spec.header, spec.footer].filter((x): x is string => !!x));
  return parts.join('\n');
}

export interface StructureCounts {
  headings: number[];
  listItems: number[]; // per nesting depth 0..2
  orderedLists: number;
  tables: number;
  cells: number;
  codeBlocks: number;
  quotes: number;
  images: number;
  captions: number;
  links: number;
  footnotes: number;
  rules: number;
}

export function expectedStructure(spec: DocSpec, format: 'docx' | 'md'): StructureCounts {
  const c: StructureCounts = { headings: [0, 0, 0, 0, 0, 0], listItems: [0, 0, 0], orderedLists: 0, tables: 0, cells: 0, codeBlocks: 0, quotes: 0, images: 0, captions: 0, links: 0, footnotes: 0, rules: 0 };
  for (const b of spec.blocks) {
    if (b.kind === 'hr') c.rules++;
    if (b.kind === 'h') c.headings[b.level - 1]++;
    if (b.kind === 'list') {
      for (const i of b.items) c.listItems[i.level]++;
      // nested ordered sub-lists count separately
      if (b.ordered) c.orderedLists += 1 + b.items.filter((it, k) => k > 0 && it.level > b.items[k - 1].level).length;
    }
    if (b.kind === 'table') {
      c.tables++;
      c.cells += b.rows.reduce((n, r, ri) => n + (ri === 0 && b.mergeFirstRow && format === 'docx' ? 1 : r.length), 0);
    }
    if (b.kind === 'code') c.codeBlocks++;
    if (b.kind === 'quote') c.quotes++;
    if (b.kind === 'image' && format === 'docx') {
      c.images++;
      if (b.caption) c.captions++;
    }
    if (b.kind === 'p') for (const r of b.runs) {
      if (r.href) c.links++;
      if (r.footnote) c.footnotes++;
    }
    if (b.kind === 'internal-link') c.links++;
  }
  if (c.footnotes) c.headings[2]++; // «Сноски» section heading
  return c;
}

export function actualStructure(doc: any): StructureCounts {
  const c: StructureCounts = { headings: [0, 0, 0, 0, 0, 0], listItems: [0, 0, 0], orderedLists: 0, tables: 0, cells: 0, codeBlocks: 0, quotes: 0, images: 0, captions: 0, links: 0, footnotes: 0, rules: 0 };
  // list depth: count list ancestors
  const walkDepth = (n: any, listDepth: number, inNotes: boolean) => {
    const isList = n.type === 'bulletList' || n.type === 'orderedList';
    if (n.type === 'heading') c.headings[(n.attrs?.level ?? 1) - 1]++;
    if (n.type === 'orderedList' && !inNotes) c.orderedLists++;
    if (n.type === 'listItem' && !inNotes && listDepth - 1 < 3) c.listItems[listDepth - 1]++;
    if (n.type === 'table') c.tables++;
    if (n.type === 'tableCell' || n.type === 'tableHeader') c.cells++;
    if (n.type === 'codeBlock') c.codeBlocks++;
    if (n.type === 'blockquote') c.quotes++;
    if (n.type === 'horizontalRule') c.rules++;
    if (n.type === 'image') {
      c.images++;
      if (n.attrs?.caption) c.captions++;
    }
    if (n.type === 'text' && (n.marks ?? []).some((m: any) => m.type === 'link')) c.links++;
    if (n.type === 'text' && /\[\d+\]$/.test(n.text ?? '') && (n.marks ?? []).some((m: any) => m.type === 'superscript')) c.footnotes++;
    let notes = inNotes;
    for (const ch of n.content ?? []) {
      if (ch.type === 'heading' && (ch.content ?? []).map((t: any) => t.text).join('') === 'Сноски') notes = true;
      walkDepth(ch, listDepth + (isList ? 1 : 0), notes);
    }
  };
  walkDepth(doc, 0, false);
  return c;
}

/** Character accuracy: share of reference characters reproduced in order (whitespace-normalised), 0..1. */
export function charAccuracy(reference: string, actual: string): number {
  const norm = (t: string) => t.replace(/\s+/g, ' ').trim();
  const a = norm(reference);
  const b = norm(actual);
  if (!a.length) return b.length ? 0 : 1;
  let same = 0;
  let extra = 0;
  for (const part of diffChars(a, b)) {
    if (!part.added && !part.removed) same += part.value.length;
    else if (part.added) extra += part.value.length;
  }
  // Penalise both lost and spurious characters: accuracy = matched / max(len(ref), len(actual)).
  return same / Math.max(a.length, same + extra);
}

// ---------------------------------------------------------------------------------------------- the corpus

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const WORDS = 'склад приёмка поставщик накладная регламент сервер резервная копия восстановление журнал право доступ отдел инженер стойка кабель питание охлаждение мониторинг инцидент заявка согласование backup restore cluster node latency throughput деплой релиз версия'.split(' ');

function sentence(r: () => number, n = 8 + Math.floor(r() * 8)): string {
  const w = Array.from({ length: n }, () => WORDS[Math.floor(r() * WORDS.length)]);
  w[0] = w[0][0].toUpperCase() + w[0].slice(1);
  return w.join(' ') + (r() < 0.2 ? ' — «важно», № ' + Math.floor(r() * 1000) + '.' : '.');
}

/** Deterministic corpus: `n` documents mixing every supported construct. */
export function referenceCorpus(n = 6): DocSpec[] {
  const out: DocSpec[] = [];
  for (let d = 0; d < n; d++) {
    const r = rng(1000 + d);
    const blocks: Block[] = [];
    blocks.push({ kind: 'h', level: 1, text: `Раздел ${d + 1}: ${sentence(r, 3).slice(0, -1)}`, bookmark: `sec${d}` });
    blocks.push({ kind: 'p', runs: [{ text: sentence(r) + ' ' }, { text: 'жирный', bold: true }, { text: ' и ' }, { text: 'курсив', italic: true }, { text: ', ' }, { text: 'подчёркнутый', underline: true }, { text: ', ' }, { text: 'зачёркнутый', strike: true }, { text: ', H' }, { text: '2', sub: true }, { text: 'O, x' }, { text: '2', sup: true }, { text: '. ' + sentence(r) }] });
    blocks.push({ kind: 'p', runs: [{ text: 'Подробности на ' }, { text: 'сайте', href: `https://example.com/doc/${d}` }, { text: '; ' + sentence(r), footnote: `Примечание ${d}: ${sentence(r, 5)}` }] });
    blocks.push({ kind: 'h', level: 2, text: 'Порядок работ' });
    blocks.push({ kind: 'list', ordered: true, items: [{ text: sentence(r, 5), level: 0 }, { text: sentence(r, 5), level: 1 }, { text: sentence(r, 4), level: 2 }, { text: sentence(r, 4), level: 2 }, { text: sentence(r, 5), level: 0 }] });
    blocks.push({ kind: 'list', ordered: false, items: [{ text: sentence(r, 4), level: 0 }, { text: sentence(r, 4), level: 1 }, { text: sentence(r, 3), level: 2 }] });
    blocks.push({ kind: 'h', level: 3, text: 'Таблица параметров' });
    blocks.push({ kind: 'table', mergeFirstRow: d % 2 === 0, rows: [['Параметр', 'Значение', 'Ед.'], ['Мощность', String(100 + d), 'кВт'], ['Ток', String(16 + d), 'А'], ['Режим', 'резерв', '—']] });
    blocks.push({ kind: 'code', lines: [`server ${d} {`, '  listen 443 ssl;', '  root /var/www;', '}'] });
    blocks.push({ kind: 'quote', text: sentence(r) });
    blocks.push({ kind: 'hr' });
    blocks.push({ kind: 'image', alt: `Схема ${d + 1}`, caption: `Рисунок ${d + 1} — ${sentence(r, 3).slice(0, -1)}`, color: ['#5A85C6', '#C65A5A', '#5AC67A'][d % 3] });
    blocks.push({ kind: 'h', level: 2, text: 'Итоги' });
    blocks.push({ kind: 'p', runs: [{ text: sentence(r) + ' ' + sentence(r) + ' ' + sentence(r) }] });
    blocks.push({ kind: 'table', rows: [['Этап', 'Срок'], ['Подготовка', '1 день'], ['Перенос', '2 дня']] });
    blocks.push({ kind: 'internal-link', text: 'Вернуться к началу раздела', anchor: `sec${d}` });
    out.push({ title: `Эталон ${d + 1}`, blocks, header: `ООО «Тест» — документ ${d + 1}`, footer: 'Для внутреннего использования', toc: d % 2 === 1 });
  }
  return out;
}

// ------------------------------------------------------------------- constructs mammoth cannot map directly


export async function unzipEntries(buf: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    const out = new Map<string, Buffer>();
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err);
      zip.on('entry', (e) => {
        if (e.fileName.endsWith('/')) return zip.readEntry();
        zip.openReadStream(e, (_e, rs) => {
          const c: Buffer[] = [];
          rs!.on('data', (d) => c.push(d));
          rs!.on('end', () => {
            out.set(e.fileName, Buffer.concat(c));
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => resolve(out));
      zip.readEntry();
    });
  });
}

export async function zipEntries(files: Map<string, Buffer>): Promise<Buffer> {
  const z = new yazl.ZipFile();
  for (const [k, v] of files) z.addBuffer(v, k);
  z.end();
  const c: Buffer[] = [];
  for await (const x of z.outputStream) c.push(x as Buffer);
  return Buffer.concat(c);
}

/** A DOCX with tracked changes, a simple field, a VML text box, a SmartArt diagram, a floating image and a comment. */
export async function complexWordDocx(): Promise<Buffer> {
  const base = await specToDocx({ title: 'Сложные конструкции', blocks: [{ kind: 'p', runs: [{ text: 'Обычный абзац.' }] }, { kind: 'image', alt: 'Плавающий рисунок', color: '#888888' }] });
  const files = await unzipEntries(base);
  let doc = files.get('word/document.xml')!.toString();
  const extra =
    '<w:p><w:ins w:id="91" w:author="Автор" w:date="2026-01-01T00:00:00Z"><w:r><w:t>Вставленный правкой текст</w:t></w:r></w:ins><w:del w:id="92" w:author="Автор" w:date="2026-01-01T00:00:00Z"><w:r><w:delText>удалённый</w:delText></w:r></w:del></w:p>' +
    '<w:p><w:r><w:t xml:space="preserve">Дата документа: </w:t></w:r><w:fldSimple w:instr=" DATE \\@ &quot;dd.MM.yyyy&quot; "><w:r><w:t>22.10.2026</w:t></w:r></w:fldSimple></w:p>' +
    '<w:p><w:r><w:pict><v:shape id="s1" style="width:100pt;height:50pt"><v:textbox><w:txbxContent><w:p><w:r><w:t>Текст в надписи</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>' +
    '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="100" cy="100"/><wp:docPr id="77" name="Схема"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:relIds xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" r:dm="rIdDgm1" r:lo="rIdDgm1" r:qs="rIdDgm1" r:cs="rIdDgm1"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>' +
    '<w:p><w:commentRangeStart w:id="5"/><w:r><w:t>Комментируемый фрагмент</w:t></w:r><w:commentRangeEnd w:id="5"/><w:r><w:commentReference w:id="5"/></w:r></w:p>';
  // The image of the base document becomes floating (anchored) as Word does for "In front of text".
  doc = doc.replace(/<wp:inline\b[^>]*>([\s\S]*?)<\/wp:inline>/, (_m, inner: string) => `<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="1" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>${inner.replace(/<wp:effectExtent[^>]*\/>/, '<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>')}</wp:anchor>`);
  doc = doc.replace(/(<w:body>[\s\S]*?<\/w:p>)/, `$1${extra}`);
  if (!/xmlns:v=/.test(doc)) doc = doc.replace('<w:document ', '<w:document xmlns:v="urn:schemas-microsoft-com:vml" ');
  files.set('word/document.xml', Buffer.from(doc));
  files.set('word/diagrams/data1.xml', Buffer.from('<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><dgm:ptLst><dgm:pt modelId="1"><dgm:t><a:p><a:r><a:t>Заявка</a:t></a:r></a:p></dgm:t></dgm:pt><dgm:pt modelId="2"><dgm:t><a:p><a:r><a:t>Согласование</a:t></a:r></a:p></dgm:t></dgm:pt></dgm:ptLst></dgm:dataModel>'));
  files.set('word/comments.xml', Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="5" w:author="Рецензент" w:date="2026-01-01T00:00:00Z"><w:p><w:r><w:t>Проверить формулировку</w:t></w:r></w:p></w:comment></w:comments>'));
  const rels = files.get('word/_rels/document.xml.rels')!.toString();
  files.set('word/_rels/document.xml.rels', Buffer.from(rels.replace('</Relationships>', '<Relationship Id="rIdDgm1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData" Target="diagrams/data1.xml"/><Relationship Id="rIdCmt1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/></Relationships>')));
  const ct = files.get('[Content_Types].xml')!.toString();
  files.set('[Content_Types].xml', Buffer.from(ct.replace('</Types>', '<Override PartName="/word/diagrams/data1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml"/><Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/></Types>')));
  return zipEntries(files);
}
