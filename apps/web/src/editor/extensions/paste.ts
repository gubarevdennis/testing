import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Slice, Fragment, DOMSerializer } from '@tiptap/pm/model';
import { looksLikeTsv, parseTsv, rowsToTable, sanitizeHref, tableToRows, rowsToTsv, type PMNode } from '@kb/shared';
import { markdownNow } from '../../lib/markdown';
import { cleanPastedHtml, cleanCopiedDom, dataUriToFile } from '../clipboard/html';
import { startUploads } from './uploads';
import { toast } from '../../components/ui/Toast';

const MD_HINTS = [/^#{1,6}\s/m, /^\s*[-*+]\s+\S/m, /^\s*\d+[.)]\s+\S/m, /^```/m, /^\s*>\s/m, /^\|.+\|\s*$/m, /\*\*[^*\n]+\*\*/, /\[[^\]\n]+\]\([^)\s]+\)/, /^\s*[-*]\s\[[ xX]\]\s/m];

/** Text that is probably Markdown (at least two distinct markers, or one structural marker over several lines). */
export function looksLikeMarkdown(text: string) {
  const hits = MD_HINTS.filter((r) => r.test(text)).length;
  return hits >= 2 || (hits === 1 && text.split('\n').length >= 3 && /^(#{1,6}\s|```|\|)/m.test(text));
}

/**
 * Clipboard handling:
 *  - spreadsheet ranges (TSV text without HTML) become tables; Excel/Sheets HTML tables are parsed by the schema;
 *  - Markdown text becomes formatted blocks (headings, lists, tables, code);
 *  - Ctrl/Cmd+Shift+V pastes plain text;
 *  - a bare URL over selected text becomes a link;
 *  - every pasted HTML goes through an allowlist sanitiser (clipboard/html.ts): Word lists become lists, foreign
 *    inline styles are dropped, embedded images are uploaded as attachments (R-CLIPBOARD-009/010/020/022);
 *  - copying writes portable HTML (absolute URLs, no comment anchors) and a table range as TSV text (R-CLIPBOARD-006/017).
 */
export const SmartPaste = Extension.create({
  name: 'smartPaste',
  priority: 900,
  addProseMirrorPlugins() {
    const editor = this.editor;
    let plain = false;
    return [
      new Plugin({
        key: new PluginKey('smartPaste'),
        props: {
          transformPastedHTML(html) {
            return cleanPastedHtml(html, { origin: location.origin }).html;
          },
          clipboardSerializer: portableSerializer(editor.schema),
          clipboardTextSerializer(slice) {
            // A table (cell range) is copied as TSV so it lands cell by cell in Excel / Google Sheets.
            const first = slice.content.firstChild;
            if (slice.content.childCount === 1 && first?.type.name === 'table') return rowsToTsv(tableToRows(first.toJSON() as PMNode));
            return '';
          },
          handleKeyDown(_view, e) {
            plain = (e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'v' || e.key === 'V' || e.key === 'м' || e.key === 'М');
            return false;
          },
          handlePaste(view, event) {
            const cd = event.clipboardData;
            if (!cd || !view.editable) return false;
            const text = cd.getData('text/plain');
            const html = cd.getData('text/html');
            const { $from } = view.state.selection;
            if ($from.parent.type.spec.code) return false; // code block / mermaid: browser default (plain)
            if (plain) {
              plain = false;
              if (!text) return false;
              const paras = text.replace(/\r\n?/g, '\n').split(/\n{2,}|\n/);
              const nodes = paras.map((p) => view.state.schema.nodes.paragraph.create(null, p ? view.state.schema.text(p) : undefined));
              view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.from(nodes), 1, 1)).scrollIntoView());
              return true;
            }
            // URL over a text selection → link
            const url = text.trim();
            if (!view.state.selection.empty && /^(https?:\/\/|mailto:)\S+$/i.test(url) && sanitizeHref(url)) {
              editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
              return true;
            }
            if (html && !/^\s*<meta[^>]*>\s*<(span|div)[^>]*white-space:\s*pre/i.test(html)) {
              // A single image copied from a web page / app (files + trivial HTML) is uploaded by the Uploads plugin.
              if (cd.files?.length && !/<table|<p|<h\d|<li/i.test(html)) return false;
              const res = cleanPastedHtml(html, { origin: location.origin });
              if (!res.images.length && !res.droppedImages) return false; // schema parser on the sanitised HTML (transformPastedHTML)
              view.pasteHTML(res.html); // no event: our handlers do not see this paste again
              const files = res.images.map((im, i) => dataUriToFile(im.dataUri, im.alt || `Изображение ${i + 1}`));
              const pageId = (editor.storage as unknown as { kbPage?: { pageId?: string } }).kbPage?.pageId;
              if (files.length && pageId) startUploads(editor, files, view.state.selection.from, pageId);
              if (res.droppedImages)
                toast.info(`Изображений, которые не удалось перенести из буфера: ${res.droppedImages}. Скопируйте их отдельно (как изображение) или перетащите файлы.`);
              return true;
            }
            if (text && looksLikeTsv(text) && !$from.node(-1)?.type.name.startsWith('table')) {
              const rows = parseTsv(text);
              const table = view.state.schema.nodeFromJSON(rowsToTable(rows, rows.length > 1));
              view.dispatch(view.state.tr.replaceSelectionWith(table).scrollIntoView());
              return true;
            }
            const md = markdownNow();
            if (text && md && looksLikeMarkdown(text)) {
              try {
                const { doc } = md.markdownToDoc(text);
                const node = view.state.schema.nodeFromJSON(doc);
                view.dispatch(view.state.tr.replaceSelection(new Slice(node.content, 0, 0)).scrollIntoView());
                return true;
              } catch {
                return false;
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});

/** Clipboard HTML = the schema's own markup made portable (cleanCopiedDom). */
function portableSerializer(schema: import('@tiptap/pm/model').Schema): DOMSerializer {
  const base = DOMSerializer.fromSchema(schema);
  const ser = new DOMSerializer(base.nodes, base.marks);
  const serializeFragment = ser.serializeFragment.bind(ser);
  ser.serializeFragment = ((fragment, options, target) => {
    const out = serializeFragment(fragment, options, target);
    cleanCopiedDom(out as unknown as ParentNode, location.origin);
    return out;
  }) as DOMSerializer['serializeFragment'];
  return ser;
}
