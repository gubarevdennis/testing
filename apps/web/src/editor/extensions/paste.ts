import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Slice, Fragment } from '@tiptap/pm/model';
import { looksLikeTsv, parseTsv, rowsToTable, markdownToDoc, sanitizeHref } from '@kb/shared';

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
 *  - a bare URL over selected text becomes a link.
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
            if (html && !/^\s*<meta[^>]*>\s*<(span|div)[^>]*white-space:\s*pre/i.test(html)) return false; // rich HTML: schema parser + sanitizer
            if (text && looksLikeTsv(text) && !$from.node(-1)?.type.name.startsWith('table')) {
              const rows = parseTsv(text);
              const table = view.state.schema.nodeFromJSON(rowsToTable(rows, rows.length > 1));
              view.dispatch(view.state.tr.replaceSelectionWith(table).scrollIntoView());
              return true;
            }
            if (text && looksLikeMarkdown(text)) {
              try {
                const { doc } = markdownToDoc(text);
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
