/**
 * Versioning of the canonical document schema and URL safety of document content.
 *
 * Every stored document has a schema version (`pages.content_schema_version`, `contentSchemaVersion` in archives).
 * When the schema changes, CONTENT_SCHEMA_VERSION is bumped and a migration `from → from + 1` is added to
 * SCHEMA_MIGRATIONS; documents of older versions (archives, imports, stored content) are upgraded step by step.
 */
import type { PMNode, PMMark } from './json.js';
import { CONTENT_SCHEMA_VERSION } from './version.js';
import { sanitizeHref } from './url.js';
import { migrateLegacyFootnotes } from './footnotes.js';

export interface SchemaMigration {
  from: number;
  to: number;
  description: string;
  migrate(doc: PMNode): PMNode;
}

/**
 * Registered migrations in order. Version 1 is the initial schema.
 *  1 → 2 (D-36): footnote and inline image nodes added (new node types: version-1 documents stay valid); the legacy
 *        «Сноски» section that importers of version 1 produced is turned into real footnotes when unambiguous.
 */
export const SCHEMA_MIGRATIONS: SchemaMigration[] = [{ from: 1, to: 2, description: 'Сноски и изображения в строке', migrate: migrateLegacyFootnotes }];

export class SchemaVersionError extends Error {
  constructor(
    message: string,
    readonly code: 'newer_schema' | 'missing_migration' | 'invalid_version',
  ) {
    super(message);
  }
}

/** Upgrades a document from `fromVersion` to the current (or given) schema version. The input is not mutated. */
export function migrateContent(doc: PMNode, fromVersion: number, opts: { to?: number; migrations?: SchemaMigration[] } = {}): { doc: PMNode; version: number; applied: string[] } {
  const to = opts.to ?? CONTENT_SCHEMA_VERSION;
  const list = opts.migrations ?? SCHEMA_MIGRATIONS;
  if (!Number.isInteger(fromVersion) || fromVersion < 1) throw new SchemaVersionError(`Некорректная версия схемы документа: ${fromVersion}`, 'invalid_version');
  if (fromVersion > to) throw new SchemaVersionError(`Документ создан более новой версией схемы (${fromVersion} > ${to}); обновите приложение`, 'newer_schema');
  let version = fromVersion;
  let cur = structuredClone(doc);
  const applied: string[] = [];
  while (version < to) {
    const m = list.find((x) => x.from === version);
    if (!m || m.to !== version + 1) throw new SchemaVersionError(`Нет миграции схемы документа ${version} → ${version + 1}`, 'missing_migration');
    cur = m.migrate(cur);
    applied.push(m.description);
    version = m.to;
  }
  return { doc: cur, version, applied };
}

const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|avif|bmp);base64,[a-z0-9+/=\s]*$/i;

function normalize(raw: string) {
  return raw.trim().replace(/[\u0000-\u001F\u007F\s]/g, '').toLowerCase();
}

/** Script-capable URL (javascript:, vbscript:, data: other than a raster image). */
export function isDangerousUrl(raw: unknown, kind: 'href' | 'image' = 'href'): boolean {
  if (typeof raw !== 'string') return false;
  const u = normalize(raw);
  // eslint-disable-next-line no-script-url -- this is the detector that rejects script URLs
  if (u.startsWith('javascript:') || u.startsWith('vbscript:')) return true;
  if (u.startsWith('data:')) return !(kind === 'image' && DATA_IMAGE.test(raw.trim()));
  return false;
}

/** Returns a displayable image source or null (file:, blob:, cid:, javascript: and other schemes are refused). */
export function safeImageSrc(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const src = raw.trim();
  if (!src) return null;
  if (DATA_IMAGE.test(src)) return src;
  if (src.startsWith('/') && !src.startsWith('//')) return src;
  if (!src.startsWith('//') && /^(\.\.?\/)?[\w\-.%/]+$/.test(src) && !src.includes(':')) return src; // relative asset (Markdown import)
  try {
    const u = new URL(src);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function visit(n: PMNode, fn: (n: PMNode) => void) {
  fn(n);
  n.content?.forEach((c) => visit(c, fn));
}

/** Lists dangerous URLs in a document. Documents containing any are rejected by the server. */
export function findUnsafeUrls(doc: PMNode): Array<{ node: string; attr: string; value: string }> {
  const out: Array<{ node: string; attr: string; value: string }> = [];
  visit(doc, (n) => {
    for (const m of n.marks ?? []) if (m.type === 'link' && isDangerousUrl(m.attrs?.href)) out.push({ node: 'link', attr: 'href', value: String(m.attrs?.href) });
    const a = n.attrs ?? {};
    if ((n.type === 'image' || n.type === 'inlineImage') && isDangerousUrl(a.src, 'image')) out.push({ node: n.type, attr: 'src', value: String(a.src) });
    if (n.type === 'embed' && isDangerousUrl(a.url)) out.push({ node: 'embed', attr: 'url', value: String(a.url) });
    if (n.type === 'fileBlock' && isDangerousUrl(a.href)) out.push({ node: 'fileBlock', attr: 'href', value: String(a.href) });
  });
  return out;
}

/**
 * Cleans URLs of a document (imports, restores, pasted content): unsafe links are removed (text kept, safe links are left untouched), unusable image
 * sources are replaced by the attachment URL or cleared, embed/file URLs are sanitised. Returns a new document.
 */
export function sanitizeDocUrls(doc: PMNode): { doc: PMNode; changed: number } {
  const copy = structuredClone(doc);
  let changed = 0;
  visit(copy, (n) => {
    if (n.marks?.length) {
      const marks: PMMark[] = [];
      for (const m of n.marks) {
        if (m.type === 'link' && !sanitizeHref(m.attrs?.href)) {
          changed++;
          continue;
        }
        marks.push(m);
      }
      if (marks.length) n.marks = marks;
      else delete n.marks;
    }
    const a = n.attrs;
    if (!a) return;
    if ((n.type === 'image' || n.type === 'inlineImage') && a.src != null) {
      const src = safeImageSrc(a.src) ?? (a.attachmentId ? `/api/v1/attachments/${a.attachmentId}/content` : null);
      if (src !== a.src) {
        changed++;
        n.attrs = { ...a, src };
      }
    }
    if (n.type === 'embed' && a.url != null) {
      if (!sanitizeHref(a.url)) {
        changed++;
        n.attrs = { ...a, url: null };
      }
    }
    if (n.type === 'fileBlock' && a.href != null) {
      if (!sanitizeHref(a.href)) {
        changed++;
        n.attrs = { ...a, href: null };
      }
    }
  });
  return { doc: copy, changed };
}
