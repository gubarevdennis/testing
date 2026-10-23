/**
 * Markdown (CommonMark + GFM) <-> canonical document JSON.
 *
 * Export is semantic and human-readable; constructs that GFM cannot express are written as
 * readable fallbacks (GitHub alerts for callouts, <details> for toggles, HTML tables for merged cells)
 * plus invisible `<!--kb:...-->` markers that let our importer restore exact semantics.
 * Every lossy step is reported through `warnings` — nothing is dropped silently.
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMath from 'remark-math';
import remarkStringify from 'remark-stringify';
import YAML from 'yaml';
import type { PMNode, PMMark } from './json.js';
import { ensureBlockIds, hasMergedCells, walk } from './json.js';
import { sanitizeHref } from './url.js';
import { newId } from './ids.js';
import { type CalloutVariant } from './nodes/callout.js';
import { toFootnoteContent } from './footnotes.js';

export interface ConversionWarning {
  code: string;
  message: string;
  blockId?: string;
}

// ---------------------------------------------------------------------------------------------
// Export: document JSON -> Markdown
// ---------------------------------------------------------------------------------------------

export interface ToMarkdownOptions {
  /** Map attachment id -> href written into the file (e.g. "assets/scheme.png"). */
  assetHref?: (attachmentId: string, node: PMNode) => string | null;
  /** Map page id (+ optional block id) -> href (e.g. "../standards/lighting.md#block"). */
  pageHref?: (pageId: string, blockId?: string | null) => string;
  /** Render a collection view as a table (rows), when available. */
  collectionRows?: (collectionId: string) => { title: string; rows: string[][] } | null;
  /** Resolve synced block content to embed it as readable copy. */
  syncedContent?: (pageId: string, blockId: string) => PMNode | null;
  /** YAML front matter to write first. */
  frontMatter?: Record<string, unknown> | null;
  /** Write `<!--kb:...-->` markers (default true). Disable for "clean" clipboard Markdown. */
  markers?: boolean;
}

const ALERT_BY_VARIANT: Record<CalloutVariant, string> = {
  info: 'NOTE',
  tip: 'TIP',
  important: 'IMPORTANT',
  warning: 'WARNING',
  error: 'CAUTION',
  example: 'EXAMPLE',
  neutral: 'QUOTE',
};
const VARIANT_BY_ALERT: Record<string, CalloutVariant> = Object.fromEntries(
  Object.entries(ALERT_BY_VARIANT).map(([k, v]) => [v, k as CalloutVariant]),
) as Record<string, CalloutVariant>;

type Md = any; // mdast nodes (kept loose to avoid a hard dependency on @types/mdast)

function marker(data: Record<string, unknown>): Md {
  return { type: 'html', value: `<!--kb:${JSON.stringify(data).replace(/--/g, '\\u002d\\u002d')}-->` };
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MARK_ORDER = ['link', 'bold', 'italic', 'strike', 'underline', 'highlight', 'subscript', 'superscript', 'textStyle', 'code'];

export function docToMarkdown(doc: PMNode, opts: ToMarkdownOptions = {}): { markdown: string; warnings: ConversionWarning[] } {
  const warnings: ConversionWarning[] = [];
  const warnOnce = new Set<string>();
  const warn = (code: string, message: string, blockId?: string) => {
    const key = code + (blockId ?? '');
    if (warnOnce.has(key)) return;
    warnOnce.add(key);
    warnings.push({ code, message, blockId });
  };
  const useMarkers = opts.markers !== false;
  /** Footnote definitions in reference order ([^1], [^2] …), written after the body. */
  const footnoteDefs: Md[] = [];
  const pageHref = opts.pageHref ?? ((id: string, b?: string | null) => `/p/${id}${b ? '#' + b : ''}`);

  const markEq = (a: PMMark, b: PMMark) => a.type === b.type && JSON.stringify(a.attrs ?? {}) === JSON.stringify(b.attrs ?? {});

  function inlineLeaf(n: PMNode): Md[] {
    switch (n.type) {
      case 'text':
        return [{ type: 'text', value: n.text ?? '' }];
      case 'hardBreak':
        return [{ type: 'break' }];
      case 'inlineMath':
        return [{ type: 'inlineMath', value: n.attrs?.latex ?? '' }];
      case 'mention': {
        const out: Md[] = [{ type: 'text', value: '@' + (n.attrs?.label ?? '') }];
        if (useMarkers) out.push(marker({ t: 'mention', id: n.attrs?.id, label: n.attrs?.label }));
        return out;
      }
      case 'pageMention': {
        const out: Md[] = [
          { type: 'link', url: pageHref(n.attrs?.pageId, n.attrs?.blockId), children: [{ type: 'text', value: n.attrs?.title || 'Страница' }] },
        ];
        if (useMarkers) out.push(marker({ t: 'pageMention', pageId: n.attrs?.pageId, blockId: n.attrs?.blockId ?? undefined }));
        return out;
      }
      case 'footnote': {
        const id = String(footnoteDefs.length + 1);
        // reserve the number first: a footnote inside the note text (flattened on import) must not take it
        const def: Md = { type: 'footnoteDefinition', identifier: id, label: id, children: [] };
        footnoteDefs.push(def);
        def.children = [para(phrasing((n.content ?? []).map((c) => (c.type === 'hardBreak' ? { type: 'text', text: ' ' } : c))))];
        return [{ type: 'footnoteReference', identifier: id, label: id }];
      }
      case 'inlineImage': {
        const a = n.attrs ?? {};
        const href = (a.attachmentId && opts.assetHref?.(a.attachmentId, n)) || a.src || '';
        const out: Md[] = [{ type: 'image', url: href, alt: a.alt ?? '', title: a.title || null }];
        if (useMarkers) out.push(marker({ t: 'image', inline: true, width: a.width ?? undefined, valign: a.valign && a.valign !== 'baseline' ? a.valign : undefined, attachmentId: a.attachmentId ?? undefined }));
        return out;
      }
      default:
        warn('inline-unknown', `Неизвестный встроенный элемент «${n.type}» сохранён как текст`);
        return [{ type: 'text', value: '' }];
    }
  }

  /** Groups inline nodes by marks so adjacent nodes share one wrapper (no `**a****b**`). */
  function phrasing(nodes: PMNode[], order = MARK_ORDER): Md[] {
    if (!order.length) return nodes.flatMap(inlineLeaf);
    const [markType, ...rest] = order;
    const out: Md[] = [];
    let i = 0;
    while (i < nodes.length) {
      const m = (nodes[i].marks ?? []).find((x) => x.type === markType);
      if (!m) {
        let j = i;
        while (j < nodes.length && !(nodes[j].marks ?? []).some((x) => x.type === markType)) j++;
        out.push(...phrasing(nodes.slice(i, j), rest));
        i = j;
        continue;
      }
      let j = i;
      while (j < nodes.length && (nodes[j].marks ?? []).some((x) => markEq(x, m))) j++;
      const inner = nodes.slice(i, j);
      out.push(...wrap(m, inner, rest));
      i = j;
    }
    return out;
  }

  function wrap(m: PMMark, inner: PMNode[], rest: string[]): Md[] {
    const children = () => phrasing(inner, rest);
    switch (m.type) {
      case 'link': {
        let href = sanitizeHref(m.attrs?.href) ?? '';
        // Links to other pages go through pageHref too: in a ZIP export they become relative file links (SC-15).
        // eslint-disable-next-line security/detect-unsafe-regex -- bounded {36} and an anchored single tail, linear
        const internal = /^\/p\/([0-9a-f-]{36})(?:#(.+))?$/i.exec(href);
        if (internal && opts.pageHref) href = opts.pageHref(internal[1], internal[2] ?? null);
        return [{ type: 'link', url: href, title: m.attrs?.title ?? null, children: children() }];
      }
      case 'bold':
        return [{ type: 'strong', children: children() }];
      case 'italic':
        return [{ type: 'emphasis', children: children() }];
      case 'strike':
        return [{ type: 'delete', children: children() }];
      case 'code': {
        const text = inner.map((n) => n.text ?? '').join('');
        return [{ type: 'inlineCode', value: text }];
      }
      case 'underline':
        return [{ type: 'html', value: '<u>' }, ...children(), { type: 'html', value: '</u>' }];
      case 'highlight': {
        const color = m.attrs?.color;
        return [{ type: 'html', value: color ? `<mark style="background-color:${escapeHtml(color)}">` : '<mark>' }, ...children(), { type: 'html', value: '</mark>' }];
      }
      case 'subscript':
        return [{ type: 'html', value: '<sub>' }, ...children(), { type: 'html', value: '</sub>' }];
      case 'superscript':
        return [{ type: 'html', value: '<sup>' }, ...children(), { type: 'html', value: '</sup>' }];
      case 'textStyle': {
        const color = m.attrs?.color;
        if (m.attrs?.fontFamily || m.attrs?.fontSize) warn('font-dropped', 'Шрифт и размер текста не представимы в Markdown и не экспортированы (содержимое сохранено)');
        if (color) return [{ type: 'html', value: `<span style="color:${escapeHtml(color)}">` }, ...children(), { type: 'html', value: '</span>' }];
        return children();
      }
      default:
        return children();
    }
  }

  function inlineOf(n: PMNode): Md[] {
    return phrasing(n.content ?? []);
  }

  function para(children: Md[]): Md {
    return { type: 'paragraph', children };
  }

  function listItems(list: PMNode, task: boolean): Md[] {
    return (list.content ?? []).map((item) => ({
      type: 'listItem',
      spread: false,
      checked: task ? !!item.attrs?.checked : null,
      children: blocks(item.content ?? []),
    }));
  }

  function tableMd(n: PMNode): Md[] {
    const id = n.attrs?.id;
    const rows = n.content ?? [];
    const complex =
      hasMergedCells(n) ||
      rows.some((r) =>
        (r.content ?? []).some((c) => (c.content ?? []).length > 1 || (c.content ?? []).some((b) => b.type !== 'paragraph')),
      );
    if (complex) {
      warn('table-html', 'Таблица с объединёнными ячейками или блоками внутри ячеек сохранена как HTML-таблица (GFM не поддерживает такую структуру)', id);
      return [{ type: 'html', value: tableToHtml(n) }];
    }
    const firstRow = rows[0]?.content ?? [];
    const align = firstRow.map((c) => (['left', 'center', 'right'].includes(c.attrs?.align) ? c.attrs?.align : null));
    const cellAligns = rows.slice(1).some((r) => (r.content ?? []).some((c, i) => (c.attrs?.align ?? null) !== (align[i] ?? null) && c.attrs?.align));
    if (cellAligns || rows.some((r) => (r.content ?? []).some((c) => c.attrs?.valign || c.attrs?.background)))
      warn('table-cell-format', 'Выравнивание/фон отдельных ячеек упрощены до выравнивания столбцов в Markdown', id);
    const hasHeader = firstRow.every((c) => c.type === 'tableHeader');
    const toRow = (r: PMNode): Md => ({
      type: 'tableRow',
      children: (r.content ?? []).map((c) => ({ type: 'tableCell', children: (c.content ?? []).flatMap((p) => inlineOf(p)) })),
    });
    const mdRows = rows.map(toRow);
    if (!hasHeader) {
      // GFM requires a header row: write an empty one so data is not misinterpreted as header.
      mdRows.unshift({ type: 'tableRow', children: firstRow.map(() => ({ type: 'tableCell', children: [] })) });
      if (useMarkers) return [marker({ t: 'table', noHeader: true }), { type: 'table', align, children: mdRows }];
    }
    return [{ type: 'table', align, children: mdRows }];
  }

  function blocks(nodes: PMNode[]): Md[] {
    const out: Md[] = [];
    for (const n of nodes) out.push(...block(n));
    return out;
  }

  function block(n: PMNode): Md[] {
    const id = n.attrs?.id;
    switch (n.type) {
      case 'paragraph': {
        if (n.attrs?.textAlign && n.attrs.textAlign !== 'left') warn('align-dropped', 'Выравнивание абзацев не представимо в Markdown', id);
        return [para(inlineOf(n))];
      }
      case 'heading':
        return [{ type: 'heading', depth: Math.min(6, Math.max(1, n.attrs?.level ?? 1)), children: inlineOf(n) }];
      case 'blockquote':
        return [{ type: 'blockquote', children: blocks(n.content ?? []) }];
      case 'codeBlock':
        return [{ type: 'code', lang: n.attrs?.language || null, value: (n.content ?? []).map((t) => t.text ?? '').join('') }];
      case 'mermaid':
        return [{ type: 'code', lang: 'mermaid', value: (n.content ?? []).map((t) => t.text ?? '').join('') }];
      case 'blockMath':
        return [{ type: 'math', value: n.attrs?.latex ?? '' }];
      case 'horizontalRule':
        return [{ type: 'thematicBreak' }];
      case 'bulletList':
        return [{ type: 'list', ordered: false, spread: false, children: listItems(n, false) }];
      case 'orderedList':
        return [{ type: 'list', ordered: true, start: n.attrs?.start ?? 1, spread: false, children: listItems(n, false) }];
      case 'taskList':
        return [{ type: 'list', ordered: false, spread: false, children: listItems(n, true) }];
      case 'table':
        return tableMd(n);
      case 'callout': {
        const v = (n.attrs?.variant ?? 'info') as CalloutVariant;
        const inner = blocks(n.content ?? []);
        const head = { type: 'paragraph', children: [{ type: 'text', value: `[!${ALERT_BY_VARIANT[v] ?? 'NOTE'}]` }] };
        // Merge alert tag with the first paragraph (GitHub alert syntax) when possible.
        const children = inner.length && inner[0].type === 'paragraph' ? [{ ...inner[0], children: [{ type: 'text', value: `[!${ALERT_BY_VARIANT[v] ?? 'NOTE'}]` }, { type: 'break' }, ...inner[0].children] }, ...inner.slice(1)] : [head, ...inner];
        const out: Md[] = [];
        if (useMarkers && n.attrs?.icon) out.push(marker({ t: 'callout', icon: n.attrs.icon }));
        out.push({ type: 'blockquote', children });
        return out;
      }
      case 'details': {
        const summary = (n.content ?? []).find((c) => c.type === 'detailsSummary');
        const content = (n.content ?? []).find((c) => c.type === 'detailsContent');
        const summaryMd = unified().use(remarkStringify).stringify({ type: 'root', children: [para(summary ? inlineOf(summary) : [])] } as any).trim();
        const level = n.attrs?.level ? ` data-level="${n.attrs.level}"` : '';
        return [{ type: 'html', value: `<details${level}>\n<summary>${summaryMd}</summary>` }, ...blocks(content?.content ?? []), { type: 'html', value: '</details>' }];
      }
      case 'columns': {
        const out: Md[] = [];
        if (useMarkers) out.push({ type: 'html', value: '<!--kb:columns-->' });
        for (const col of n.content ?? []) {
          if (useMarkers) out.push({ type: 'html', value: `<!--kb:column${col.attrs?.width ? ' ' + JSON.stringify({ width: col.attrs.width }) : ''}-->` });
          out.push(...blocks(col.content ?? []));
        }
        if (useMarkers) out.push({ type: 'html', value: '<!--kb:/columns-->' });
        return out;
      }
      case 'image': {
        const a = n.attrs ?? {};
        const href = (a.attachmentId && opts.assetHref?.(a.attachmentId, n)) || a.src || '';
        const out: Md[] = [{ type: 'image', url: href, alt: a.alt ?? '', title: a.caption || null }];
        if (useMarkers) out.push(marker({ t: 'image', width: a.width ?? undefined, align: a.align !== 'center' ? a.align : undefined, attachmentId: a.attachmentId ?? undefined }));
        return [para(out)];
      }
      case 'fileBlock': {
        const a = n.attrs ?? {};
        const href = (a.attachmentId && opts.assetHref?.(a.attachmentId, n)) || a.href || '';
        const out: Md[] = [{ type: 'link', url: href, children: [{ type: 'text', value: '📎 ' + (a.name || 'файл') }] }];
        if (useMarkers) out.push(marker({ t: 'file', name: a.name, size: a.size ?? undefined, mime: a.mime ?? undefined, view: a.view !== 'compact' ? a.view : undefined, attachmentId: a.attachmentId ?? undefined }));
        return [para(out)];
      }
      case 'embed': {
        const a = n.attrs ?? {};
        const href = (a.attachmentId && opts.assetHref?.(a.attachmentId, n)) || a.url || '';
        const out: Md[] = [{ type: 'link', url: href, children: [{ type: 'text', value: (a.kind === 'video' ? '🎬 ' : '🔗 ') + (a.title || a.url || 'медиа') }] }];
        if (useMarkers) out.push(marker({ t: 'embed', kind: a.kind, title: a.title || undefined, attachmentId: a.attachmentId ?? undefined }));
        return [para(out)];
      }
      case 'pageLink': {
        const a = n.attrs ?? {};
        const out: Md[] = [{ type: 'link', url: a.pageId ? pageHref(a.pageId) : '', children: [{ type: 'text', value: '📄 ' + (a.title || 'Страница') }] }];
        if (useMarkers) out.push(marker({ t: 'pageLink', pageId: a.pageId, child: a.child || undefined }));
        return [para(out)];
      }
      case 'toc':
        if (!useMarkers) return [];
        return [{ type: 'html', value: '<!--kb:toc-->' }];
      case 'syncedBlock': {
        const a = n.attrs ?? {};
        const content = a.sourcePageId && a.sourceBlockId ? opts.syncedContent?.(a.sourcePageId, a.sourceBlockId) : null;
        const out: Md[] = [];
        if (useMarkers) out.push(marker({ t: 'synced', sourcePageId: a.sourcePageId, sourceBlockId: a.sourceBlockId }));
        if (content) out.push(...block(content));
        else {
          warn('synced-unresolved', 'Синхронизированный блок экспортирован ссылкой на источник (содержимое недоступно или вне экспорта)', id);
          out.push(para([{ type: 'link', url: a.sourcePageId ? pageHref(a.sourcePageId, a.sourceBlockId) : '', children: [{ type: 'text', value: '🔁 Синхронизированный блок' }] }]));
        }
        if (useMarkers) out.push({ type: 'html', value: '<!--kb:/synced-->' });
        return out;
      }
      case 'collectionView': {
        const a = n.attrs ?? {};
        const data = a.collectionId ? opts.collectionRows?.(a.collectionId) : null;
        const out: Md[] = [];
        if (useMarkers) out.push(marker({ t: 'collection', collectionId: a.collectionId, viewId: a.viewId ?? undefined }));
        if (data && data.rows.length) {
          out.push(para([{ type: 'strong', children: [{ type: 'text', value: data.title }] }]));
          out.push({
            type: 'table',
            align: [],
            children: data.rows.map((r) => ({ type: 'tableRow', children: r.map((c) => ({ type: 'tableCell', children: [{ type: 'text', value: c }] })) })),
          });
        } else {
          warn('collection-ref', 'Коллекция экспортирована ссылкой; данные коллекции — в отдельном CSV', id);
          out.push(para([{ type: 'text', value: '🗂 Коллекция' }]));
        }
        if (useMarkers) out.push({ type: 'html', value: '<!--kb:/collection-->' });
        return out;
      }
      default:
        warn('block-unknown', `Блок «${n.type}» экспортирован как текст`, id);
        return n.content ? blocks(n.content) : [];
    }
  }

  function tableToHtml(n: PMNode): string {
    const cellHtml = (c: PMNode) => {
      const tag = c.type === 'tableHeader' ? 'th' : 'td';
      const attrs: string[] = [];
      if ((c.attrs?.colspan ?? 1) > 1) attrs.push(`colspan="${c.attrs!.colspan}"`);
      if ((c.attrs?.rowspan ?? 1) > 1) attrs.push(`rowspan="${c.attrs!.rowspan}"`);
      const style: string[] = [];
      if (c.attrs?.align) style.push(`text-align:${c.attrs.align}`);
      if (c.attrs?.valign) style.push(`vertical-align:${c.attrs.valign}`);
      if (style.length) attrs.push(`style="${style.join(';')}"`);
      const inner = (c.content ?? [])
        .map((b) => {
          const md = unified().use(remarkGfm).use(remarkMath).use(remarkStringify).stringify({ type: 'root', children: block(b) } as any).trim();
          return escapeHtml(md).replace(/\n/g, '<br>');
        })
        .join('<br>');
      return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>${inner}</${tag}>`;
    };
    const rows = (n.content ?? []).map((r) => '<tr>' + (r.content ?? []).map(cellHtml).join('') + '</tr>').join('\n');
    return `<table>\n${rows}\n</table>`;
  }

  const children: Md[] = [];
  if (opts.frontMatter && Object.keys(opts.frontMatter).length) children.push({ type: 'yaml', value: YAML.stringify(opts.frontMatter).trim() });
  children.push(...blocks(doc.content ?? []));
  children.push(...footnoteDefs);

  walk(doc, (n) => {
    if (n.marks?.some((m) => m.type === 'comment')) warn('comments-dropped', 'Комментарии не входят в переносимое содержимое Markdown (хранятся в системе)');
  });

  const markdown = unified()
    .use(remarkGfm)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkMath)
    .use(remarkStringify, { bullet: '-', fences: true, rule: '-', emphasis: '*', strong: '*', listItemIndent: 'one', incrementListMarker: true })
    .stringify({ type: 'root', children } as any);
  return { markdown: markdown.replace(/\r\n?/g, '\n'), warnings };
}

// ---------------------------------------------------------------------------------------------
// Import: Markdown -> document JSON
// ---------------------------------------------------------------------------------------------

export interface FromMarkdownOptions {
  /** Resolve an image/file href (relative path in a ZIP or remote URL) to stored attachment info. */
  resolveAsset?: (href: string) => { attachmentId: string; src: string; name?: string; size?: number; mime?: string } | null;
  /** Resolve a link href (relative .md path) to an internal page id. */
  resolveLink?: (href: string) => { pageId: string; blockId?: string | null } | null;
  /** Convert raw HTML (tables, figures, unknown blocks) to document nodes. Absent => kept as code block with warning. */
  htmlToNodes?: (html: string) => PMNode[];
  /** A leading H1 becomes the title and leaves the body (files: default true). A paste keeps it in the content. */
  extractTitle?: boolean;
}

export interface FromMarkdownResult {
  doc: PMNode;
  frontMatter: Record<string, unknown> | null;
  title: string | null;
  warnings: ConversionWarning[];
}

const KB_MARKER = /^<!--kb:(.*)-->$/s;

/** Inline conversion result: an inline node, or a block lifted out of its paragraph (images carry their inline form). */
type Item = PMNode | { lift: PMNode; inline?: PMNode; force?: 'inline' | 'block' | null };

function parseMarker(value: string): Record<string, any> | string | null {
  const m = KB_MARKER.exec(value.trim());
  if (!m) return null;
  const body = m[1].trim();
  if (body.startsWith('{')) {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body; // e.g. "columns", "column {...}", "/columns", "toc"
}

export function markdownToDoc(markdown: string, opts: FromMarkdownOptions = {}): FromMarkdownResult {
  const warnings: ConversionWarning[] = [];
  const warn = (code: string, message: string) => {
    if (!warnings.some((w) => w.code === code && w.message === message)) warnings.push({ code, message });
  };
  const tree: Md = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml', 'toml']).use(remarkMath).parse(markdown.replace(/^﻿/, ''));

  let frontMatter: Record<string, unknown> | null = null;
  const definitions = new Map<string, { url: string; title: string | null }>();
  const footnotes = new Map<string, Md>();
  const collect = (n: Md) => {
    if (n.type === 'definition') definitions.set(String(n.identifier).toLowerCase(), { url: n.url, title: n.title ?? null });
    if (n.type === 'footnoteDefinition') footnotes.set(String(n.identifier).toLowerCase(), n);
    (n.children ?? []).forEach(collect);
  };
  collect(tree);
  const usedFootnotes = new Map<string, number>();
  const footnoteStack = new Set<string>();

  type Mk = PMMark;
  const pid = () => ({ id: newId() });

  function text(value: string, marks: Mk[]): PMNode[] {
    if (!value) return [];
    const n: PMNode = { type: 'text', text: value };
    if (marks.length) n.marks = marks.map((m) => ({ ...m }));
    return [n];
  }

  // eslint-disable-next-line security/detect-unsafe-regex -- one optional group over [^>], linear
  const INLINE_OPEN = /^<(u|ins|mark|sub|sup|span|s|del|strike|b|strong|i|em|code)(\s[^>]*)?>$/i;
  const INLINE_CLOSE = /^<\/(u|ins|mark|sub|sup|span|s|del|strike|b|strong|i|em|code)>$/i;

  function htmlTagToMark(tag: string, attrs: string): Mk | null {
    const t = tag.toLowerCase();
    const style = /style\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? '';
    // eslint-disable-next-line security/detect-non-literal-regexp -- `p` is a literal CSS property name at every call site
    const prop = (p: string) => new RegExp(`${p}\\s*:\\s*([^;]+)`, 'i').exec(style)?.[1]?.trim() ?? null;
    switch (t) {
      case 'u':
      case 'ins':
        return { type: 'underline' };
      case 'mark': {
        const c = prop('background-color') ?? prop('background');
        return c ? { type: 'highlight', attrs: { color: c } } : { type: 'highlight' };
      }
      case 'sub':
        return { type: 'subscript' };
      case 'sup':
        return { type: 'superscript' };
      case 's':
      case 'del':
      case 'strike':
        return { type: 'strike' };
      case 'b':
      case 'strong':
        return { type: 'bold' };
      case 'i':
      case 'em':
        return { type: 'italic' };
      case 'code':
        return { type: 'code' };
      case 'span': {
        const color = prop('color');
        return color ? { type: 'textStyle', attrs: { color, fontFamily: null, fontSize: null } } : { type: 'textStyle', attrs: { color: null, fontFamily: null, fontSize: null } };
      }
    }
    return null;
  }

  /**
   * Inline conversion. Returns inline nodes plus "block escapes" (files, page links, embeds; images that are not part of a
   * line of text) that must be lifted out of the paragraph. An image carries its inline form too: the paragraph decides
   * (`placeImages`) — in a line of text it is an inline image, alone it is a block image; our own marker forces either.
   */
  function inline(children: Md[], marks: Mk[]): Item[] {
    const out: Item[] = [];
    const stack: Mk[] = [];
    const cur = () => [...marks, ...stack];
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      const next = children[i + 1];
      const nextMarker = next?.type === 'html' ? parseMarker(next.value) : null;
      const consumeMarker = () => {
        if (nextMarker && typeof nextMarker === 'object') {
          i++;
          return nextMarker;
        }
        return null;
      };
      switch (c.type) {
        case 'text':
          out.push(...text(c.value, cur()));
          break;
        case 'emphasis':
          out.push(...inline(c.children, [...cur(), { type: 'italic' }]));
          break;
        case 'strong':
          out.push(...inline(c.children, [...cur(), { type: 'bold' }]));
          break;
        case 'delete':
          out.push(...inline(c.children, [...cur(), { type: 'strike' }]));
          break;
        case 'inlineCode':
          out.push(...text(c.value, [...cur(), { type: 'code' }]));
          break;
        case 'inlineMath':
          out.push({ type: 'inlineMath', attrs: { latex: c.value } });
          break;
        case 'break':
          out.push({ type: 'hardBreak' });
          break;
        case 'footnoteReference': {
          const idf = String(c.identifier).toLowerCase();
          const def = footnotes.get(idf);
          if (!def || footnoteStack.has(idf)) {
            out.push(...text(`[^${c.label ?? c.identifier}]`, cur()));
            break;
          }
          const seen = usedFootnotes.get(idf) ?? 0;
          usedFootnotes.set(idf, seen + 1);
          if (seen === 1) warn('footnote-repeated', 'Одна сноска упоминается в тексте несколько раз: текст сноски повторён у каждой ссылки');
          footnoteStack.add(idf);
          const content = toFootnoteContent(blocksFrom(def.children ?? []));
          footnoteStack.delete(idf);
          out.push(content.length ? { type: 'footnote', ...(cur().length ? { marks: cur().map((m) => ({ ...m })) } : {}), content } : { type: 'footnote' });
          break;
        }
        case 'linkReference':
        case 'link': {
          const def = c.type === 'linkReference' ? definitions.get(String(c.identifier).toLowerCase()) : null;
          const url: string = c.type === 'link' ? c.url : def?.url ?? '';
          const m = consumeMarker() as Record<string, any> | null;
          const label = (c.children ?? []).map((x: Md) => mdText(x)).join('');
          if (m?.t === 'pageMention' || m?.t === 'pageLink' || m?.t === 'file' || m?.t === 'embed') {
            const node = markerLinkNode(m, url, label);
            // Page mentions stay inline; link blocks/files/embeds are lifted out of the paragraph.
            out.push(m.t === 'pageMention' ? node : { lift: node });
            break;
          }
          const resolved = url ? opts.resolveLink?.(url) : null;
          if (resolved) {
            out.push(...inline(c.children, [...cur(), { type: 'link', attrs: { href: `/p/${resolved.pageId}${resolved.blockId ? '#' + resolved.blockId : ''}` } }]));
            break;
          }
          const asset = url && /^(?!https?:|mailto:|tel:|#|\/)/i.test(url) ? opts.resolveAsset?.(url) : null;
          if (asset) {
            out.push({ lift: { type: 'fileBlock', attrs: { ...pid(), attachmentId: asset.attachmentId, name: asset.name ?? label.replace(/^📎\s*/, ''), size: asset.size ?? null, mime: asset.mime ?? null, view: 'compact', href: null } } });
            break;
          }
          const href = sanitizeHref(url);
          if (url && !href) warn('link-unsafe', `Небезопасная ссылка удалена, текст сохранён: ${url.slice(0, 80)}`);
          if (url && href && /^(?!https?:|mailto:|tel:|#|\/)/i.test(url) && opts.resolveAsset) warn('link-unresolved', `Относительная ссылка не найдена в пакете и оставлена как есть: ${url.slice(0, 120)}`);
          out.push(...inline(c.children, href ? [...cur(), { type: 'link', attrs: { href, title: c.title ?? null } }] : cur()));
          break;
        }
        case 'imageReference':
        case 'image': {
          const def = c.type === 'imageReference' ? definitions.get(String(c.identifier).toLowerCase()) : null;
          const url: string = c.type === 'image' ? c.url : def?.url ?? '';
          const m = consumeMarker() as Record<string, any> | null;
          const asset = url ? opts.resolveAsset?.(url) : null;
          let src = asset?.src ?? null;
          if (!asset) {
            // http(s) pictures and pictures of this instance (our own exports, conflict copies) keep their source
            const safe = /^https?:/i.test(url) || /^\/api\/v1\/attachments\/[0-9a-f-]{36}\/content(?:$|\?)/i.test(url) ? sanitizeHref(url) : null;
            if (safe) src = safe;
            else warn('image-missing', `Изображение не найдено: ${url.slice(0, 120)} — вставлен текстовый заполнитель`);
          }
          if (!src) {
            out.push(...text(`[изображение: ${c.alt || url}]`, cur()));
            break;
          }
          const attachmentId = asset?.attachmentId ?? m?.attachmentId ?? null;
          out.push({
            lift: {
              type: 'image',
              attrs: {
                ...pid(),
                src,
                attachmentId,
                alt: c.alt ?? '',
                caption: c.title ?? '',
                title: null,
                width: m?.width ?? null,
                align: m?.align ?? 'center',
                naturalWidth: null,
                naturalHeight: null,
              },
            },
            inline: { type: 'inlineImage', attrs: { src, attachmentId, alt: c.alt ?? '', title: c.title || null, width: m?.width ?? null, valign: m?.valign ?? 'baseline', naturalWidth: null, naturalHeight: null } },
            force: m?.t === 'image' ? (m.inline ? 'inline' : 'block') : null,
          });
          break;
        }
        case 'html': {
          const v: string = c.value;
          const mk = parseMarker(v);
          if (mk && typeof mk === 'object' && mk.t === 'mention') {
            // "@Label" text was emitted just before: replace it.
            const prev = out[out.length - 1] as PMNode | undefined;
            const label = '@' + (mk.label ?? '');
            if (prev && 'type' in prev && prev.type === 'text' && prev.text?.endsWith(label)) {
              prev.text = prev.text.slice(0, -label.length);
              if (!prev.text) out.pop();
            }
            out.push({ type: 'mention', attrs: { id: mk.id ?? null, label: mk.label ?? '' } });
            break;
          }
          if (mk) break; // other markers apply to blocks
          const open = INLINE_OPEN.exec(v.trim());
          if (open) {
            const mark = htmlTagToMark(open[1], open[2] ?? '');
            if (mark) stack.push(mark);
            break;
          }
          const close = INLINE_CLOSE.exec(v.trim());
          if (close) {
            const want = htmlTagToMark(close[1], '')?.type;
            for (let k = stack.length - 1; k >= 0; k--)
              if (stack[k].type === want) {
                stack.splice(k, 1);
                break;
              }
            break;
          }
          if (/^<br\s*\/?>$/i.test(v.trim())) {
            out.push({ type: 'hardBreak' });
            break;
          }
          if (/^<!--[\s\S]*-->$/.test(v.trim())) break; // ordinary HTML comment
          // Unknown inline HTML: keep the visible text, never execute.
          const stripped = v.replace(/<[^>]*>/g, '');
          if (stripped) out.push(...text(stripped, cur()));
          warn('inline-html', 'Встроенный HTML упрощён до текста');
          break;
        }
        default: {
          const t = mdText(c);
          if (t) out.push(...text(t, cur()));
        }
      }
    }
    return mergeTextMarksCleanup(out);
  }

  function mergeTextMarksCleanup(nodes: Item[]): Item[] {
    // Normalise marks: textStyle without attributes is dropped; duplicates removed.
    for (const n of nodes) {
      if ('type' in n && n.marks) {
        const seen = new Set<string>();
        n.marks = n.marks.filter((m) => {
          if (m.type === 'textStyle' && !m.attrs?.color && !m.attrs?.fontFamily && !m.attrs?.fontSize) return false;
          const k = m.type + JSON.stringify(m.attrs ?? {});
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        if (!n.marks.length) delete n.marks;
      }
    }
    return nodes;
  }

  /** Images in a line of text (other text or several pictures in the same paragraph) stay inline; a lone picture is a block. */
  function placeImages(items: Item[]): Item[] {
    const pictures = items.filter((x) => 'lift' in x && x.inline).length;
    const hasText = items.some((x) => !('lift' in x) && x.type !== 'hardBreak' && (x.type !== 'text' || !!x.text?.trim()));
    return items.map((x) => {
      if (!('lift' in x) || !x.inline) return x;
      const asInline = x.force === 'inline' || (x.force !== 'block' && (hasText || pictures > 1));
      return asInline ? x.inline : x;
    });
  }

  function markerLinkNode(m: Record<string, any>, url: string, label: string): PMNode {
    switch (m.t) {
      case 'pageLink': {
        const r = url ? opts.resolveLink?.(url) : null;
        return { type: 'pageLink', attrs: { ...pid(), pageId: r?.pageId ?? m.pageId ?? null, title: label.replace(/^📄\s*/, ''), child: !!m.child } };
      }
      case 'pageMention': {
        const r = url ? opts.resolveLink?.(url) : null;
        return { type: 'pageMention', attrs: { pageId: r?.pageId ?? m.pageId ?? null, blockId: r?.blockId ?? m.blockId ?? null, title: label } };
      }
      case 'file': {
        const asset = url ? opts.resolveAsset?.(url) : null;
        if (!asset && url && !m.attachmentId) warn('file-missing', `Файл не найден в пакете: ${url.slice(0, 120)}`);
        return {
          type: 'fileBlock',
          attrs: { ...pid(), attachmentId: asset?.attachmentId ?? m.attachmentId ?? null, name: m.name ?? label.replace(/^📎\s*/, ''), size: asset?.size ?? m.size ?? null, mime: asset?.mime ?? m.mime ?? null, view: m.view ?? 'compact', href: asset ? null : sanitizeHref(url) },
        };
      }
      case 'embed': {
        const asset = url && !/^https?:/i.test(url) ? opts.resolveAsset?.(url) : null;
        return { type: 'embed', attrs: { ...pid(), url: asset ? null : sanitizeHref(url), kind: m.kind ?? 'link', attachmentId: asset?.attachmentId ?? m.attachmentId ?? null, title: m.title ?? label.replace(/^(🎬|🔗)\s*/, '') } };
      }
    }
    return { type: 'paragraph', attrs: pid(), content: [{ type: 'text', text: label }] };
  }

  /** Splits inline content into a sequence of paragraphs and lifted blocks (images, files). */
  function paragraphBlocks(children: Md[], wrapper: 'paragraph' | 'heading' = 'paragraph', attrs: Record<string, any> = {}): PMNode[] {
    const items = placeImages(inline(children, []));
    const out: PMNode[] = [];
    let buf: PMNode[] = [];
    const flush = (force = false) => {
      const trimmed = trimInline(buf);
      if (trimmed.length || force) out.push({ type: wrapper, attrs: { ...pid(), ...attrs }, ...(trimmed.length ? { content: trimmed } : {}) });
      buf = [];
    };
    for (const it of items) {
      if ('lift' in it) {
        flush();
        out.push(it.lift);
      } else buf.push(it);
    }
    flush(out.length === 0);
    return out;
  }

  function trimInline(nodes: PMNode[]): PMNode[] {
    const res = [...nodes];
    while (res.length && res[0].type === 'hardBreak') res.shift();
    while (res.length && res[res.length - 1].type === 'hardBreak') res.pop();
    return res;
  }

  function listItemNode(item: Md, task: boolean): PMNode {
    let content = blocksFrom(item.children ?? []);
    if (!content.length || content[0].type !== 'paragraph') content = [{ type: 'paragraph', attrs: pid() }, ...content];
    return { type: task ? 'taskItem' : 'listItem', attrs: task ? { ...pid(), checked: !!item.checked } : pid(), content };
  }

  function tableNode(t: Md, noHeader: boolean): PMNode {
    const align: Array<string | null> = t.align ?? [];
    const rows: Md[] = noHeader ? t.children.slice(1) : t.children;
    return {
      type: 'table',
      attrs: pid(),
      content: rows.map((r: Md, ri: number) => ({
        type: 'tableRow',
        content: r.children.map((cell: Md, ci: number) => {
          const inl = placeImages(inline(cell.children ?? [], []));
          const lifted = inl.filter((x) => 'lift' in x).map((x) => (x as { lift: PMNode }).lift);
          const inlineNodes = trimInline(inl.filter((x) => !('lift' in x)) as PMNode[]);
          return {
            type: !noHeader && ri === 0 ? 'tableHeader' : 'tableCell',
            attrs: { colspan: 1, rowspan: 1, colwidth: null, align: align[ci] ?? null, valign: null, background: null },
            content: [{ type: 'paragraph', attrs: pid(), ...(inlineNodes.length ? { content: inlineNodes } : {}) }, ...lifted],
          };
        }),
      })),
    };
  }

  function calloutFrom(bq: Md): PMNode | null {
    const first = bq.children?.[0];
    if (first?.type !== 'paragraph') return null;
    const t = first.children?.[0];
    if (t?.type !== 'text') return null;
    const m = /^\[!(\w+)\][ \t]*\n?/.exec(t.value);
    if (!m) return null;
    const variant = VARIANT_BY_ALERT[m[1].toUpperCase()];
    if (!variant) return null;
    const rest = t.value.slice(m[0].length);
    const firstChildren = [...(rest ? [{ ...t, value: rest }] : []), ...first.children.slice(1)];
    while (firstChildren[0]?.type === 'break') firstChildren.shift();
    const blocks = [...(firstChildren.length ? [{ ...first, children: firstChildren }] : []), ...bq.children.slice(1)];
    const content = blocksFrom(blocks);
    return { type: 'callout', attrs: { ...pid(), variant, icon: null }, content: content.length ? content : [{ type: 'paragraph', attrs: pid() }] };
  }

  function htmlBlock(value: string): PMNode[] {
    if (opts.htmlToNodes) {
      const nodes = opts.htmlToNodes(value);
      if (nodes.length) return nodes;
      return [];
    }
    warn('html-block', 'HTML-блок сохранён как исходный код (интерпретация HTML недоступна в этом контексте)');
    return [{ type: 'codeBlock', attrs: { ...pid(), language: 'html' }, content: [{ type: 'text', text: value }] }];
  }

  /** Converts a sequence of mdast block nodes, handling kb markers and <details> regions. */
  function blocksFrom(nodes: Md[]): PMNode[] {
    const out: PMNode[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.type === 'html') {
        const mk = parseMarker(n.value);
        if (mk === 'columns') {
          // gather until /columns
          const cols: { width: number | null; nodes: Md[] }[] = [];
          let j = i + 1;
          let depth = 0;
          for (; j < nodes.length; j++) {
            const x = nodes[j];
            const xm = x.type === 'html' ? parseMarker(x.value) : null;
            if (xm === 'columns') depth++;
            if (xm === '/columns') {
              if (depth === 0) break;
              depth--;
            }
            if (depth === 0 && typeof xm === 'string' && xm.startsWith('column') && xm !== 'columns') {
              let width: number | null = null;
              const json = xm.slice('column'.length).trim();
              if (json) {
                try {
                  width = JSON.parse(json).width ?? null;
                } catch {
                  /* ignore */
                }
              }
              cols.push({ width, nodes: [] });
              continue;
            }
            if (!cols.length) cols.push({ width: null, nodes: [] });
            cols[cols.length - 1].nodes.push(x);
          }
          const columns: Array<PMNode & { content: PMNode[] }> = cols.slice(0, 4).map((c) => {
            const content = blocksFrom(c.nodes);
            return { type: 'column', attrs: { ...pid(), width: c.width }, content: content.length ? content : [{ type: 'paragraph', attrs: pid() } as PMNode] };
          });
          if (cols.length > 4) {
            warn('columns-limit', 'Более 4 колонок: лишние колонки добавлены в последнюю');
            const extra = cols.slice(4).flatMap((c) => blocksFrom(c.nodes));
            columns[3].content.push(...extra);
          }
          if (columns.length >= 2) out.push({ type: 'columns', attrs: pid(), content: columns });
          else out.push(...columns.flatMap((c) => c.content));
          i = j;
          continue;
        }
        if (mk === 'toc') {
          out.push({ type: 'toc', attrs: pid() });
          continue;
        }
        if (mk && typeof mk === 'object' && (mk.t === 'synced' || mk.t === 'collection')) {
          const end = mk.t === 'synced' ? '/synced' : '/collection';
          let j = i + 1;
          while (j < nodes.length && !(nodes[j].type === 'html' && parseMarker(nodes[j].value) === end)) j++;
          if (mk.t === 'synced') out.push({ type: 'syncedBlock', attrs: { ...pid(), sourcePageId: mk.sourcePageId ?? null, sourceBlockId: mk.sourceBlockId ?? null } });
          else out.push({ type: 'collectionView', attrs: { ...pid(), collectionId: mk.collectionId ?? null, viewId: mk.viewId ?? null } });
          i = j;
          continue;
        }
        if (mk && typeof mk === 'object' && mk.t === 'table' && nodes[i + 1]?.type === 'table') {
          out.push(tableNode(nodes[i + 1], !!mk.noHeader));
          i++;
          continue;
        }
        if (mk && typeof mk === 'object' && mk.t === 'callout' && nodes[i + 1]?.type === 'blockquote') {
          const c = calloutFrom(nodes[i + 1]);
          if (c) {
            c.attrs!.icon = mk.icon ?? null;
            out.push(c);
            i++;
            continue;
          }
        }
        if (mk) continue;
        // `>\s*(…)?\s*$` was quadratic on "<details>" + many spaces + text (SAST/ReDoS finding): the leading \s* is inside the group now.
        // eslint-disable-next-line security/detect-unsafe-regex -- linear after the fix above (measured on 200k spaces)
        const det = /^<details(\s[^>]*)?>(?:\s*<summary>([\s\S]*?)<\/summary>)?\s*$/i.exec(n.value.trim());
        if (det) {
          let j = i + 1;
          let depth = 0;
          for (; j < nodes.length; j++) {
            const v = nodes[j].type === 'html' ? String(nodes[j].value).trim() : '';
            if (/^<details/i.test(v)) depth++;
            if (/^<\/details>$/i.test(v)) {
              if (depth === 0) break;
              depth--;
            }
          }
          const level = Number(/data-level="(\d)"/.exec(det[1] ?? '')?.[1] ?? 0);
          const summaryMd = (det[2] ?? '').trim();
          const summaryInline = summaryMd ? (markdownToDoc(summaryMd, opts).doc.content?.[0]?.content ?? []) : [];
          const inner = blocksFrom(nodes.slice(i + 1, j));
          out.push({
            type: 'details',
            attrs: { ...pid(), open: false, level },
            content: [
              { type: 'detailsSummary', ...(summaryInline.length ? { content: summaryInline } : {}) },
              { type: 'detailsContent', content: inner.length ? inner : [{ type: 'paragraph', attrs: pid() }] },
            ],
          });
          i = j;
          continue;
        }
        if (/^<\/details>$/i.test(n.value.trim())) continue;
        if (/^<!--[\s\S]*-->$/.test(n.value.trim())) continue;
        out.push(...htmlBlock(n.value));
        continue;
      }
      out.push(...blockFrom(n));
    }
    return out;
  }

  function blockFrom(n: Md): PMNode[] {
    switch (n.type) {
      case 'yaml':
        try {
          const v = YAML.parse(n.value);
          if (v && typeof v === 'object') frontMatter = v;
        } catch {
          warn('frontmatter-invalid', 'YAML front matter не распознан и сохранён как блок кода');
          return [{ type: 'codeBlock', attrs: { ...pid(), language: 'yaml' }, content: [{ type: 'text', text: n.value }] }];
        }
        return [];
      case 'toml':
        warn('frontmatter-toml', 'TOML front matter сохранён как блок кода');
        return [{ type: 'codeBlock', attrs: { ...pid(), language: 'toml' }, content: [{ type: 'text', text: n.value }] }];
      case 'heading':
        return paragraphBlocks(n.children, 'heading', { level: n.depth });
      case 'paragraph':
        return paragraphBlocks(n.children);
      case 'blockquote': {
        const c = calloutFrom(n);
        if (c) return [c];
        const content = blocksFrom(n.children ?? []);
        return [{ type: 'blockquote', attrs: pid(), content: content.length ? content : [{ type: 'paragraph', attrs: pid() }] }];
      }
      case 'list': {
        const task = (n.children ?? []).some((it: Md) => it.checked === true || it.checked === false);
        const items = (n.children ?? []).map((it: Md) => listItemNode(it, task));
        if (task) return [{ type: 'taskList', attrs: pid(), content: items }];
        if (n.ordered) return [{ type: 'orderedList', attrs: { ...pid(), start: n.start ?? 1, type: null }, content: items }];
        return [{ type: 'bulletList', attrs: pid(), content: items }];
      }
      case 'code': {
        const value: string = n.value ?? '';
        if ((n.lang ?? '').toLowerCase() === 'mermaid') return [{ type: 'mermaid', attrs: pid(), ...(value ? { content: [{ type: 'text', text: value }] } : {}) }];
        return [{ type: 'codeBlock', attrs: { ...pid(), language: n.lang ?? null }, ...(value ? { content: [{ type: 'text', text: value }] } : {}) }];
      }
      case 'math':
        return [{ type: 'blockMath', attrs: { ...pid(), latex: n.value ?? '' } }];
      case 'thematicBreak':
        return [{ type: 'horizontalRule', attrs: pid() }];
      case 'table':
        return [tableNode(n, false)];
      case 'definition':
      case 'footnoteDefinition':
        return [];
      default: {
        const t = mdText(n);
        warn('md-unknown', `Неизвестная конструкция Markdown «${n.type}» сохранена как текст`);
        return t ? [{ type: 'paragraph', attrs: pid(), content: [{ type: 'text', text: t }] }] : [];
      }
    }
  }

  let content = blocksFrom(tree.children ?? []);
  // Definitions nobody references are kept as text at the end (never dropped silently).
  const unused = [...footnotes.entries()].filter(([idf]) => !usedFootnotes.has(idf));
  if (unused.length) {
    warn('footnote-unused', `Сноски без ссылок в тексте (${unused.length}) сохранены абзацами в конце документа`);
    for (const [, def] of unused) {
      const inner = toFootnoteContent(blocksFrom(def.children ?? []));
      content.push({ type: 'paragraph', attrs: pid(), content: [{ type: 'text', text: `[^${def.label ?? def.identifier}] ` }, ...inner] });
    }
  }

  // Title: front matter title, else a leading H1 (which is then removed from the body).
  let title: string | null = null;
  const fm = frontMatter as Record<string, unknown> | null;
  const leadingH1 = content[0]?.type === 'heading' && content[0].attrs?.level === 1 ? (content[0].content ?? []).map((x) => x.text ?? '').join('').trim() : null;
  if (fm && typeof fm.title === 'string') {
    title = fm.title;
    // Our own exports repeat the title as H1 for human readers: drop it so round trips are stable.
    if (leadingH1 && leadingH1 === fm.title.trim() && opts.extractTitle !== false) content = content.slice(1);
  } else if (content[0]?.type === 'heading' && content[0].attrs?.level === 1) {
    title = (content[0].content ?? []).map((x) => x.text ?? '').join('').trim() || null;
    if (title && opts.extractTitle !== false) content = content.slice(1);
  }
  if (!content.length) content = [{ type: 'paragraph', attrs: pid() }];
  const doc = ensureBlockIds({ type: 'doc', content });
  return { doc, frontMatter, title, warnings };
}

function mdText(n: Md): string {
  if (n.value !== undefined && typeof n.value === 'string' && n.type !== 'html') return n.value;
  return (n.children ?? []).map(mdText).join('');
}
