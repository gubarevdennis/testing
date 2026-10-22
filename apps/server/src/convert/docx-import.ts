import mammoth from 'mammoth';
import yauzl from 'yauzl';
import { htmlToDoc } from './html.js';
import type { PMNode } from '@kb/shared';
import type { ConversionWarning } from '@kb/shared';

export type StoreImage = (buf: Buffer, filename: string, mime: string, alt: string) => Promise<{ attachmentId: string; src: string }>;

/** Word style names -> semantic blocks. Real headings become headings (not bold text). */
const STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Subtitle'] => p.lead:fresh",
  "p[style-name='heading 1'] => h1:fresh",
  "p[style-name='heading 2'] => h2:fresh",
  "p[style-name='heading 3'] => h3:fresh",
  "p[style-name='heading 4'] => h4:fresh",
  "p[style-name='heading 5'] => h5:fresh",
  "p[style-name='heading 6'] => h6:fresh",
  "p[style-name='Заголовок 1'] => h1:fresh",
  "p[style-name='Заголовок 2'] => h2:fresh",
  "p[style-name='Заголовок 3'] => h3:fresh",
  "p[style-name='Заголовок 4'] => h4:fresh",
  "p[style-name='Quote'] => blockquote > p:fresh",
  "p[style-name='Intense Quote'] => blockquote > p:fresh",
  "p[style-name='Цитата'] => blockquote > p:fresh",
  "p[style-name='Code'] => pre > code:separator('\\n')",
  "p[style-name='HTML Preformatted'] => pre > code:separator('\\n')",
  "p[style-name='Source Code'] => pre > code:separator('\\n')",
  "r[style-name='Code Char'] => code",
  "r[style-name='Source Code Char'] => code",
  'u => u',
  'strike => s',
  'comment-reference => sup',
];

async function readZipEntries(buf: Buffer, names: RegExp): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    const out = new Map<string, string>();
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(new Error('Файл DOCX повреждён (не является корректным ZIP-архивом)'));
      zip.on('entry', (e: yauzl.Entry) => {
        if (!names.test(e.fileName) || e.uncompressedSize > 200 * 1024 * 1024) return zip.readEntry();
        zip.openReadStream(e, (e2, rs) => {
          if (e2 || !rs) return reject(e2);
          const chunks: Buffer[] = [];
          rs.on('data', (c) => chunks.push(c));
          rs.on('end', () => {
            out.set(e.fileName, Buffer.concat(chunks).toString('utf8'));
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => resolve(out));
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}

/** Detects constructs that cannot be represented faithfully; reported instead of being lost silently. */
export async function inspectDocx(buf: Buffer): Promise<ConversionWarning[]> {
  const parts = await readZipEntries(buf, /^word\/(document|comments|footnotes|endnotes)\.xml$/);
  const doc = parts.get('word/document.xml');
  if (!doc) throw new Error('В файле нет основного документа word/document.xml — файл повреждён или не является DOCX');
  const w: ConversionWarning[] = [];
  const count = (re: RegExp) => (doc.match(re) ?? []).length;
  if (count(/<w:ins\b/g) + count(/<w:del\b/g)) w.push({ code: 'track-changes', message: `Обнаружены исправления (track changes): ${count(/<w:ins\b/g)} вставок, ${count(/<w:del\b/g)} удалений. Импортирован текст с принятыми вставками; исходный файл сохранён.` });
  if (/dgm:relIds|smartArt/i.test(doc)) w.push({ code: 'smartart', message: 'SmartArt не поддерживается как редактируемый блок: текст сохранён, графика — в исходном файле.' });
  if (count(/<wps:wsp\b/g) + count(/<v:shape\b/g)) w.push({ code: 'shapes', message: `Фигуры/надписи (${count(/<wps:wsp\b/g) + count(/<v:shape\b/g)}) преобразованы в текст, где это возможно; оформление фигур не переносится.` });
  if (count(/<wp:anchor\b/g)) w.push({ code: 'floating', message: `Плавающие объекты (${count(/<wp:anchor\b/g)}) размещены в потоке текста.` });
  if (count(/<w:fldSimple\b/g) + count(/<w:instrText\b/g)) w.push({ code: 'fields', message: 'Поля Word (оглавление, номера страниц, ссылки) импортированы как текущий текст результата.' });
  if (count(/<w:sectPr\b/g) > 1) w.push({ code: 'sections', message: 'Разрывы разделов и разные параметры страниц не переносятся.' });
  if (count(/<w:gridSpan\b/g) + count(/<w:vMerge\b/g)) w.push({ code: 'merged-cells', message: 'Таблицы содержат объединённые ячейки — структура объединений сохранена; проверьте результат в предпросмотре.' });
  const comments = parts.get('word/comments.xml');
  if (comments && /<w:comment\b/.test(comments)) w.push({ code: 'comments', message: `Комментарии Word (${(comments.match(/<w:comment\b/g) ?? []).length}) не переносятся в обсуждения; они доступны в исходном файле.` });
  const foot = parts.get('word/footnotes.xml');
  if (foot && (foot.match(/<w:footnote\b/g) ?? []).length > 2) w.push({ code: 'footnotes', message: 'Сноски преобразованы в нумерованный список в конце документа.' });
  if (/<w:headerReference\b|<w:footerReference\b/.test(doc)) w.push({ code: 'header-footer', message: 'Колонтитулы не импортируются в тело статьи (сохранены в исходном файле).' });
  if (/w:macro|vbaProject/i.test(doc)) w.push({ code: 'macros', message: 'Макросы проигнорированы и не исполнялись.' });
  return w;
}

export async function docxToDoc(buf: Buffer, storeImage: StoreImage): Promise<{ doc: PMNode; title: string | null; warnings: ConversionWarning[] }> {
  const warnings = await inspectDocx(buf);
  let imageNo = 0;
  const result = await mammoth.convertToHtml(
    { buffer: buf },
    {
      styleMap: STYLE_MAP,
      includeDefaultStyleMap: true,
      convertImage: mammoth.images.imgElement(async (image: any) => {
        imageNo++;
        const data: Buffer = await image.readAsBuffer();
        const mime = image.contentType || 'image/png';
        const ext = (mime.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('x-emf', 'emf').replace('x-wmf', 'wmf');
        if (/emf|wmf/.test(ext)) warnings.push({ code: 'vector-image', message: `Изображение №${imageNo} в формате ${ext.toUpperCase()} сохранено как файл; браузер может не отобразить его.` });
        const stored = await storeImage(data, `image-${imageNo}.${ext}`, mime, image.altText ?? '');
        return { src: stored.src, alt: image.altText ?? '', 'data-attachment-id': stored.attachmentId } as any;
      }),
    },
  );
  for (const m of result.messages) {
    if (m.type === 'warning' && /Unrecognised paragraph style|Unrecognised run style/.test(m.message)) {
      const style = /'([^']+)'/.exec(m.message)?.[1];
      if (!style || style === 'null') continue;
      if (!warnings.some((x) => x.code === 'style-' + style)) warnings.push({ code: 'style-' + style, message: `Стиль Word «${style}» импортирован как обычный текст.` });
    } else warnings.push({ code: 'mammoth', message: m.message });
  }
  // Mammoth writes footnotes as a trailing list with anchors — keep the text, drop the back-links.
  const html = result.value.replace(/<a href="#footnote-ref-\d+">↑<\/a>/g, '').replace(/<p class="lead">/g, '<p data-variant="lead">');
  const conv = htmlToDoc(html, {
    resolveImage: (src) => {
      if (src.startsWith('kbblob:')) return { src, attachmentId: src }; // staged import asset
      const m = /\/api\/v1\/attachments\/([0-9a-f-]{36})\/content/.exec(src);
      return m ? { src, attachmentId: m[1] } : null;
    },
  });
  warnings.push(...conv.warnings);
  let title: string | null = null;
  const first = conv.doc.content?.[0];
  if (first?.type === 'heading' && first.attrs?.level === 1) {
    title = (first.content ?? []).map((x) => x.text ?? '').join('').trim() || null;
    if (title) conv.doc.content = conv.doc.content!.slice(1);
    if (!conv.doc.content!.length) conv.doc.content = [{ type: 'paragraph' }];
  }
  return { doc: conv.doc, title, warnings };
}
