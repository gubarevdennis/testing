/**
 * Shared helpers of the source-specific importers (Notion, Confluence, Teamly, Google Docs, Obsidian, Evernote, Outline,
 * BookStack, YouTrack, Yandex Wiki): source names, title/icon clean-up, callout variants, link sentinels.
 *
 * Every importer turns its format into the canonical HTML / Markdown that the shared ingest pipeline already understands
 * (D-38): `div[data-type=callout]`, `details`, `ul[data-type=taskList]`, `div[data-type=columns]`, `div[data-type=toc]`,
 * `div[data-type=page-link]`, `div[data-type=embed]`, `div[data-type=file]`, `div[data-type=block-math]`… — so the
 * normalisation, URL safety and schema validation stay in one place.
 */
import type { CalloutVariant } from '@kb/shared';

export const IMPORT_SOURCES = ['auto', 'notion', 'confluence', 'teamly', 'google', 'obsidian', 'evernote', 'outline', 'bookstack', 'youtrack', 'yandex', 'generic'] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];
/** Detected kind of a package (more precise than the user's choice: Notion has two export formats). */
export type DetectedSource = Exclude<ImportSource, 'auto'> | 'notion-html' | 'kb';

export const SOURCE_LABELS: Record<DetectedSource, string> = {
  notion: 'Notion (Markdown и CSV)',
  'notion-html': 'Notion (HTML)',
  confluence: 'Confluence',
  teamly: 'Teamly',
  google: 'Google Документы',
  obsidian: 'Obsidian',
  evernote: 'Evernote',
  outline: 'Outline',
  bookstack: 'BookStack',
  youtrack: 'YouTrack',
  yandex: 'Яндекс Вики',
  generic: 'Папки с документами',
  kb: 'Экспорт базы знаний',
};

/** Notion appends a 32-hex block id to every exported file and folder name ("Page Title 0123…cdef.md"). */
const NOTION_ID = /(?:^|[\s_-])([0-9a-f]{32})(?=$|\.[a-z0-9]+$|_all\.csv$)/i;
export function notionIdOf(name: string): string | null {
  const m = NOTION_ID.exec(name);
  return m ? m[1].toLowerCase() : null;
}
/** Notion ids in links: "…-0123…cdef", "…?p=0123…" or the dashed UUID form. */
export function notionIdInHref(href: string): string | null {
  const plain = /([0-9a-f]{32})(?![0-9a-f])/i.exec(href);
  if (plain) return plain[1].toLowerCase();
  const dashed = /([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})/i.exec(href);
  return dashed ? dashed.slice(1).join('').toLowerCase() : null;
}

/** File name → page title: extension, Notion id and Confluence page id removed, underscores → spaces. */
export function titleFromName(name: string): string {
  let t = name.replace(/\.(md|markdown|html?|docx|txt|csv|enex)$/i, '');
  t = t.replace(/_all$/i, '');
  t = t.replace(/[\s_-]+[0-9a-f]{32}$/i, '');
  t = t.replace(/_\d{4,}$/, ''); // Confluence "Page-Title_123456"
  t = t.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return t || 'Без названия';
}

// eslint-disable-next-line security/detect-unsafe-regex -- one emoji cluster at the start, bounded
const LEADING_EMOJI = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍(?:\p{Extended_Pictographic})|\p{Emoji_Modifier})*(?:️)?)\s+(\S[\s\S]*)$/u;

/** "🚀 Запуск" → icon 🚀 + title "Запуск" (Notion, Teamly and many wikis keep the page icon in the title). */
export function splitTitleIcon(title: string): { title: string; icon: string | null } {
  const m = LEADING_EMOJI.exec(title.trim());
  return m ? { icon: m[1], title: m[2].trim() } : { title: title.trim(), icon: null };
}

const KEYWORDS: Array<[RegExp, CalloutVariant]> = [
  [/^(важно|important|обязательно|key)\b/i, 'important'],
  [/^(внимание|предупреждение|осторожно|warning|caution|attention|warn)\b/i, 'warning'],
  [/^(опасно|ошибка|запрещено|нельзя|danger|error|failure|fail|bug|запрет)\b/i, 'error'],
  [/^(совет|подсказка|лайфхак|tip|hint|success|check|done|готово|успех)\b/i, 'tip'],
  [/^(пример|example)\b/i, 'example'],
  [/^(инфо|информация|примечание|заметка|к сведению|справка|note|info|information|abstract|summary|todo|question|faq)\b/i, 'info'],
  [/^(цитата|quote|cite)\b/i, 'neutral'],
];
const ICON_VARIANT: Array<[RegExp, CalloutVariant]> = [
  [/^(ℹ️?|🛈|📘|🔵|💬|❔|❓)/u, 'info'],
  [/^(⚠️?|🟡|🟠|🔶|🚧)/u, 'warning'],
  [/^(❗|‼️?|❕|🔴|📣|📢)/u, 'important'],
  [/^(⛔|🚫|❌|🛑|🔥|☠️?)/u, 'error'],
  [/^(💡|✅|✔️?|🟢|👍|⭐)/u, 'tip'],
  [/^(📝|✏️?|🧪|📋)/u, 'example'],
  [/^(📌|📎|🗒️?|📄)/u, 'neutral'],
];

/** Hue-based variant of a background/accent colour ("#FFF3B0", "rgb(…)", Notion colour names). */
export function variantFromColor(color: string | null | undefined): CalloutVariant | null {
  if (!color) return null;
  const c = color.toLowerCase();
  const named: Record<string, CalloutVariant> = { yellow: 'warning', orange: 'warning', red: 'error', pink: 'important', purple: 'important', green: 'tip', teal: 'tip', blue: 'info', gray: 'neutral', grey: 'neutral', brown: 'neutral' };
  for (const [k, v] of Object.entries(named)) if (new RegExp(`(^|[^a-z])${k}`).test(c)) return v; // eslint-disable-line security/detect-non-literal-regexp -- literal colour names
  let r: number, g: number, b: number;
  const hex = /^#?([0-9a-f]{6})$/.exec(c.trim());
  const rgb = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(c);
  if (hex) [r, g, b] = [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
  else if (rgb) [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number);
  else return null;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min || (max - min) / max < 0.06) return max > 250 ? null : 'neutral'; // white = no box, greys = neutral
  let h = 0;
  if (max === r) h = ((g - b) / (max - min)) % 6;
  else if (max === g) h = (b - r) / (max - min) + 2;
  else h = (r - g) / (max - min) + 4;
  h = (h * 60 + 360) % 360;
  if (h < 18 || h >= 335) return 'error';
  if (h < 70) return 'warning';
  if (h < 170) return 'tip';
  if (h < 255) return 'info';
  return 'important';
}

/** Variant of a callout from its leading word («Внимание», «Важно», «Note»…), its icon or its colour. */
export function calloutVariant(opts: { text?: string | null; icon?: string | null; color?: string | null; kind?: string | null }): CalloutVariant {
  const kind = (opts.kind ?? '').toLowerCase();
  const byKind: Record<string, CalloutVariant> = {
    info: 'info', information: 'info', note: 'info', abstract: 'info', summary: 'info', tldr: 'info', todo: 'info', question: 'info', help: 'info', faq: 'info',
    tip: 'tip', hint: 'tip', success: 'tip', check: 'tip', done: 'tip',
    important: 'important', warning: 'warning', caution: 'warning', attention: 'warning', alert: 'warning',
    danger: 'error', error: 'error', failure: 'error', fail: 'error', missing: 'error', bug: 'error',
    example: 'example', quote: 'neutral', cite: 'neutral', neutral: 'neutral', panel: 'neutral',
  };
  if (byKind[kind]) return byKind[kind];
  const text = (opts.text ?? '').replace(/^[\s *_:«"]+/, '');
  for (const [re, v] of ICON_VARIANT) if (re.test(opts.icon ?? '') || re.test(text)) return v;
  for (const [re, v] of KEYWORDS) if (re.test(text)) return v;
  return variantFromColor(opts.color) ?? 'info';
}

/**
 * Links between documents of an import are resolved after every page is converted (by path, Notion id, Confluence id
 * or title). Until then they carry a sentinel in-app href that every sanitiser keeps: `/p/kbref:<encoded original>`.
 */
export const REF_PREFIX = '/p/kbref:';
export const refHref = (href: string) => REF_PREFIX + encodeURIComponent(href);
export const refPageId = (href: string) => 'kbref:' + encodeURIComponent(href);

/** A link that may point to another document of the package (relative path, wiki link, link of a known wiki). */
export function isPackageHref(href: string): boolean {
  const h = href.trim();
  if (!h || h.startsWith('#') || h.startsWith('mailto:') || h.startsWith('tel:') || h.startsWith('data:')) return false;
  if (/^(kbwiki|evernote):/i.test(h)) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return isKnownWikiUrl(h);
  if (h.startsWith('//')) return false;
  if (/^\/(api|p|s)\//.test(h)) return false; // in-app links of our own exports
  return true;
}

/** Absolute links to pages of the source system (resolved to the imported page when it is part of the import). */
export function isKnownWikiUrl(href: string): boolean {
  return /^https?:\/\/([a-z0-9-]+\.)*(notion\.so|notion\.site)\//i.test(href) || /^https?:\/\/[^/]+(\/wiki)?\/(display\/[^/]+\/|pages\/viewpage\.action\?|spaces\/[^/]+\/pages\/\d+)/i.test(href) || /^https?:\/\/([a-z0-9-]+\.)*teamly\.ru\//i.test(href) || /^evernote:/i.test(href);
}

export const decodeSafe = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** Anchor slug like GitHub/Obsidian/Outline produce ("Порядок работы" → "порядок-работы"). */
export function slugAnchor(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
