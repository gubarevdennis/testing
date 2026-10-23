/**
 * Markdown dialects of other knowledge bases → the Markdown our converter reads (GitHub alerts for callouts, <details> for
 * toggles, links/images with angle-bracket destinations). Pure text transformations; fenced code is never touched.
 *
 *  - Notion «Markdown & CSV»: `<aside>💡 …</aside>` callouts (icon kept), database row properties after the title;
 *  - Obsidian: `[[Note|alias]]`, `[[Note#Heading]]`, `![[image.png|300]]`, `![[Note]]`, `> [!type] Title` callouts of every
 *    Obsidian type (foldable too), `==highlight==`, `%%comments%%`, `^block-ids`;
 *  - Outline / Docusaurus / VuePress: `:::info … :::` notices;
 *  - Yandex Wiki (YFM): `{% note warning "Title" %} … {% endnote %}`, `{% cut "Title" %} … {% endcut %}`;
 *  - MkDocs: `!!! note "Title"` admonitions (`???` collapsible → toggle);
 *  - BookStack: `<p class="callout warning">…</p>`.
 */
import type { CalloutVariant } from '@kb/shared';
import { calloutVariant, escapeHtml, type DetectedSource } from './common.js';

const ALERT: Record<CalloutVariant, string> = { info: 'NOTE', tip: 'TIP', important: 'IMPORTANT', warning: 'WARNING', error: 'CAUTION', example: 'EXAMPLE', neutral: 'QUOTE' };

export interface DialectStats {
  callouts: number;
  toggles: number;
  wikiLinks: number;
  embeds: number;
}

const FILE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif|heic|tiff?|pdf|docx?|xlsx?|pptx?|csv|zip|mp4|mov|webm|mp3|wav|ogg|txt|odt|rtf)$/i;
// eslint-disable-next-line security/detect-unsafe-regex -- leading emoji cluster, bounded
const ICON_LINE = /^((?:\p{Extended_Pictographic})(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*([\s\S]*)$/u;

function quote(lines: string[]): string[] {
  return lines.map((l) => (l.trim() ? '> ' + l : '>'));
}

function callout(variant: CalloutVariant, body: string[], opts: { icon?: string | null; title?: string | null } = {}): string[] {
  const out: string[] = [];
  if (opts.icon) out.push(`<!--kb:${JSON.stringify({ t: 'callout', icon: opts.icon })}-->`);
  const inner = [...(opts.title ? [`**${opts.title.replace(/\*/g, '\\*')}**`, ''] : []), ...trimBlank(body)];
  out.push(`> [!${ALERT[variant]}]`, ...quote(inner.length ? inner : ['']), '');
  return out;
}

function toggle(summary: string, body: string[]): string[] {
  return [`<details>`, `<summary>${escapeHtml(summary || 'Подробнее')}</summary>`, '', ...trimBlank(body), '', `</details>`, ''];
}

function trimBlank(lines: string[]): string[] {
  const a = [...lines];
  while (a.length && !a[0].trim()) a.shift();
  while (a.length && !a[a.length - 1].trim()) a.pop();
  return a;
}

/** Inline transformations outside code spans. */
function inline(line: string, source: DetectedSource, stats: DialectStats): string {
  // split by code spans; transform only the text parts
  return line
    .split(/(`+[^`]*`+)/)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      let s = part;
      // ![[file.png|300]] / ![[Note]] / ![[Note#Heading]]
      s = s.replace(/!\[\[([^\]|#\n]+)(#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/g, (_m, target: string, head: string | undefined, alias: string | undefined) => {
        const t = target.trim();
        if (FILE_EXT.test(t)) {
          stats.embeds++;
          const alt = alias && !/^\d+(x\d+)?$/.test(alias.trim()) ? alias.trim() : t.replace(/\.[^.]+$/, '');
          return `![${alt.replace(/[[\]]/g, '')}](<kbasset:${t}>)`;
        }
        stats.wikiLinks++;
        return `[${(alias ?? t).replace(/[[\]]/g, '')}](<kbwiki:${t}${head ?? ''}>)`;
      });
      // [[Note]] / [[Note|alias]] / [[Note#Heading|alias]] / [[#Heading]]
      s = s.replace(/\[\[([^\]|\n]*?)(#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/g, (_m, target: string, head: string | undefined, alias: string | undefined) => {
        stats.wikiLinks++;
        const t = target.trim();
        const label = (alias ?? (t || (head ?? '').slice(1))).replace(/[[\]]/g, '');
        if (!t && head) return `[${label}](#${encodeURIComponent(head.slice(1).trim())})`;
        return `[${label}](<kbwiki:${t}${head ?? ''}>)`;
      });
      if (source === 'obsidian' || source === 'generic' || source === 'outline') s = s.replace(/==([^=\s](?:[^=\n]*[^=\s])?)==/g, '<mark>$1</mark>');
      if (source === 'obsidian') s = s.replace(/%%[^%\n]*%%/g, '').replace(/\s\^[A-Za-z0-9-]{2,}\s*$/, '');
      return s;
    })
    .join('');
}

/** Converts the dialect constructs of `source` (and the common ones of every wiki) into our Markdown. */
export function preprocessMarkdown(text: string, source: DetectedSource): { text: string; stats: DialectStats } {
  const stats: DialectStats = { callouts: 0, toggles: 0, wikiLinks: 0, embeds: 0 };
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  return { text: convertBlock(lines, source, stats).join('\n'), stats };
}

function convertBlock(lines: string[], source: DetectedSource, stats: DialectStats): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  // Obsidian comments spanning lines
  let inComment = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (fence) {
      out.push(line);
      if (t.startsWith(fence) && t.replace(/[`~]/g, '') === '') fence = null;
      continue;
    }
    const f = /^(`{3,}|~{3,})/.exec(t);
    if (f) {
      fence = f[1];
      out.push(line);
      continue;
    }
    if (source === 'obsidian') {
      if (inComment) {
        if (t.includes('%%')) inComment = false;
        continue;
      }
      if (t === '%%' || (t.startsWith('%%') && !t.slice(2).includes('%%'))) {
        inComment = true;
        continue;
      }
    }
    // Notion callout: <aside> … </aside>
    if (/^<aside(\s[^>]*)?>/i.test(t)) {
      const body: string[] = [];
      let depth = 0;
      let j = i;
      let cur = t.replace(/^<aside(\s[^>]*)?>/i, '');
      for (;;) {
        const opens = (cur.match(/<aside\b/gi) ?? []).length;
        const closes = (cur.match(/<\/aside>/gi) ?? []).length;
        if (depth + opens - closes < 0) {
          const before = cur.replace(/<\/aside>\s*$/i, '');
          if (before.trim()) body.push(before);
          break;
        }
        depth += opens - closes;
        body.push(cur);
        j++;
        if (j >= lines.length) break;
        cur = lines[j];
      }
      i = j;
      const b = trimBlank(body);
      let icon: string | null = null;
      if (b.length) {
        const m = ICON_LINE.exec(b[0].trim());
        if (m) {
          icon = m[1];
          b[0] = m[2];
        }
      }
      const inner = convertBlock(trimBlank(b), source, stats);
      stats.callouts++;
      out.push(...callout(calloutVariant({ icon, text: inner.find((x) => x.trim()) ?? '' }), inner, { icon }));
      continue;
    }
    // GitHub / Obsidian callouts: > [!type]± Title
    const co = /^(\s*>\s*)\[!([\w-]+)\]([+-]?)[ \t]*(.*)$/.exec(line);
    if (co) {
      const prefix = co[1];
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && /^\s*>/.test(lines[j])) {
        body.push(lines[j].replace(/^\s*>\s?/, ''));
        j++;
      }
      i = j - 1;
      const variant = calloutVariant({ kind: co[2] });
      const title = co[4].trim();
      const canonical = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION', 'EXAMPLE', 'QUOTE'].includes(co[2].toUpperCase()) && !title && !co[3];
      const inner = convertBlock(body, source, stats);
      stats.callouts++;
      if (canonical) out.push(`${prefix}[!${co[2].toUpperCase()}]`, ...inner.map((l) => (l.trim() ? '> ' + l : '>')), '');
      else if (co[3] === '-') {
        // foldable, collapsed by default: a toggle keeps the behaviour, the colour is lost (reported as a toggle)
        stats.toggles++;
        out.push(...toggle(title || co[2], inner));
      } else out.push(...callout(variant, inner, { title: title || null }));
      continue;
    }
    // Outline / Docusaurus / VuePress containers
    const cont = /^:::+\s*([\w-]+)(?:\[([^\]]*)\])?\s*(.*)$/.exec(t);
    if (cont && !/^:::+\s*$/.test(t)) {
      const body: string[] = [];
      let j = i + 1;
      let depth = 0;
      for (; j < lines.length; j++) {
        const x = lines[j].trim();
        if (/^:::+\s*[\w-]+/.test(x)) depth++;
        else if (/^:::+\s*$/.test(x)) {
          if (depth === 0) break;
          depth--;
        }
        body.push(lines[j]);
      }
      i = j;
      const kind = cont[1].toLowerCase();
      const title = (cont[2] ?? cont[3] ?? '').trim();
      const inner = convertBlock(body, source, stats);
      if (kind === 'details' || kind === 'spoiler') {
        stats.toggles++;
        out.push(...toggle(title, inner));
      } else {
        stats.callouts++;
        out.push(...callout(calloutVariant({ kind, text: title }), inner, { title: title || null }));
      }
      continue;
    }
    // Yandex Wiki (YFM)
    const yNote = /^\{%\s*note\s+(\w+)\s*(?:"([^"]*)")?\s*%\}\s*$/.exec(t);
    const yCut = /^\{%\s*cut\s+"([^"]*)"\s*%\}\s*$/.exec(t);
    if (yNote || yCut) {
      const endRe = yNote ? /^\{%\s*endnote\s*%\}/ : /^\{%\s*endcut\s*%\}/;
      const openRe = yNote ? /^\{%\s*note\b/ : /^\{%\s*cut\b/;
      const body: string[] = [];
      let j = i + 1;
      let depth = 0;
      for (; j < lines.length; j++) {
        const x = lines[j].trim();
        if (openRe.test(x)) depth++;
        else if (endRe.test(x)) {
          if (depth === 0) break;
          depth--;
        }
        body.push(lines[j]);
      }
      i = j;
      const inner = convertBlock(body, source, stats);
      if (yNote) {
        stats.callouts++;
        out.push(...callout(calloutVariant({ kind: yNote[1] }), inner, { title: yNote[2]?.trim() || null }));
      } else {
        stats.toggles++;
        out.push(...toggle(yCut![1], inner));
      }
      continue;
    }
    // MkDocs admonitions
    const adm = /^(!!!|\?\?\?\+?)\s+([\w-]+)(?:\s+"([^"]*)")?\s*$/.exec(t);
    if (adm && !line.startsWith(' ')) {
      const body: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (lines[j].trim() && !/^( {4}|\t)/.test(lines[j])) break;
        body.push(lines[j].replace(/^( {4}|\t)/, ''));
      }
      i = j - 1;
      const inner = convertBlock(body, source, stats);
      if (adm[1].startsWith('???')) {
        stats.toggles++;
        out.push(...toggle(adm[3] ?? adm[2], inner));
      } else {
        stats.callouts++;
        out.push(...callout(calloutVariant({ kind: adm[2] }), inner, { title: adm[3]?.trim() || null }));
      }
      continue;
    }
    // BookStack callouts kept as HTML in its Markdown
    const bs = /^<p class="callout (info|success|warning|danger)">([\s\S]*)<\/p>\s*$/i.exec(t);
    if (bs) {
      stats.callouts++;
      out.push(...callout(calloutVariant({ kind: bs[1] }), [bs[2]]));
      continue;
    }
    out.push(inline(line, source, stats));
  }
  return out;
}

/**
 * Notion database rows repeat their properties right under the title ("Status: Done"). Those lines are the row's
 * properties (taken from the CSV), not its content: they are removed when their name is a column of the database.
 */
export function stripPropertyLines(text: string, columns: string[]): string {
  const cols = new Set(columns.map((c) => c.trim().toLowerCase()));
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i < lines.length && /^#\s/.test(lines[i])) i++;
  const start = i;
  let end = start;
  for (let j = start; j < lines.length; j++) {
    const l = lines[j].trim();
    if (!l) continue;
    const m = /^([^:\n]{1,100}):\s?(.*)$/.exec(l);
    if (m && cols.has(m[1].trim().toLowerCase())) {
      end = j + 1;
      continue;
    }
    break;
  }
  if (end === start) return text;
  return [...lines.slice(0, start), ...lines.slice(end)].join('\n');
}
