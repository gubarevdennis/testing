import yazl from 'yazl';
import { createHash } from 'node:crypto';
import { docToMarkdown, walk, findBlock, whiteboardAttachmentIds, whiteboardSvgString, normalizeScene, type PMNode, type ConversionWarning, type WhiteboardScene } from '@kb/shared';
import type { Services } from '../app.js';
import { accessForPages, type AuthUser } from '../acl/engine.js';
import { blobKey } from '../storage/blob-store.js';
import { docToDocx } from '../convert/docx-export.js';
import { validateDocx } from '../convert/docx-validate.js';
import { docToHtml } from '../convert/html.js';
import { redactInaccessibleRefs } from '../routes/acl-extra.js';

export type ExportFormat = 'md' | 'docx' | 'html' | 'pdf';

/** Raised inside an export when the user cancelled the background job (R-EXPORT-022). */
export class ExportCancelledError extends Error {
  constructor() {
    super('Экспорт отменён пользователем');
  }
}

export interface ExportOptions {
  includeChildren: boolean;
  singleFile?: boolean;
  /** 'merged' (default): one document for the branch; 'files': a ZIP with one file per page in the tree layout. */
  layout?: 'merged' | 'files';
  /** Polled between pages; returning true aborts the export with ExportCancelledError. */
  isCancelled?: () => Promise<boolean>;
}

/** Fails closed when a produced DOCX breaks Open XML package/schema rules Word enforces (integrity check). */
/**
 * A page title as literal Markdown heading text: raw HTML (`<img onerror=…>`), entities and link syntax in a title
 * must not become markup in the reader's Markdown viewer (DAST finding: titles were written verbatim).
 */
export function mdTitle(title: string): string {
  return title.replace(/[\r\n]+/g, ' ').replace(/[\\<>&[\]]/g, '\\$&');
}

async function checkDocx(buf: Buffer, title: string) {
  const v = await validateDocx(buf);
  if (!v.ok) throw Object.assign(new Error(`Файл DOCX «${title}» не прошёл проверку целостности: ${v.errors.slice(0, 3).join('; ')}`), { status: 500 });
  return v;
}

export interface ExportPage {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  spaceId: string;
  content: PMNode;
  canDownload: boolean;
  properties: Record<string, unknown>;
  status: string;
  updatedAt: Date | null;
  author: string | null;
}

/** Loads pages for export with the same rules as reading: live or published version, ACL per page. */
export async function loadExportPages(s: Services, user: AuthUser, rootIds: string[], includeChildren: boolean): Promise<{ pages: ExportPage[]; skipped: number }> {
  let ids = rootIds;
  if (includeChildren)
    ids = (await s.db.query(`select a.page_id from page_ancestors a join pages p on p.id = a.page_id where a.ancestor_id = any($1::uuid[]) and p.deleted_at is null order by a.depth`, [rootIds])).rows.map((r) => r.page_id);
  ids = [...new Set(ids)];
  const acc = await accessForPages(s.db, user, ids);
  const allowed = ids.filter((id) => acc.get(id)?.actions.view && acc.get(id)?.actions.export && !acc.get(id)?.deleted);
  const rows = allowed.length
    ? (await s.db.query(`select p.*, u.name as author from pages p left join users u on u.id = p.created_by where p.id = any($1::uuid[])`, [allowed])).rows
    : [];
  const pages: ExportPage[] = [];
  for (const id of allowed) {
    const p = rows.find((r) => r.id === id)!;
    const a = acc.get(id)!;
    let content: PMNode;
    let title = p.title;
    if (a.policy.publishingMode === 'publish' && !a.actions.edit) {
      if (!p.published_revision_id) continue;
      const rev = (await s.db.query('select content, title from page_revisions where id = $1', [p.published_revision_id])).rows[0];
      content = rev.content;
      title = rev.title;
    } else content = (await s.hub.snapshot(id)).json;
    content = await redactInaccessibleRefs(s.db, user, content); // titles of linked pages the exporter cannot open (AT-79)
    pages.push({ id, title, icon: p.icon, parentId: p.parent_id, spaceId: p.space_id, content, canDownload: a.actions.download, properties: p.properties, status: p.status, updatedAt: p.content_updated_at, author: p.author });
  }
  return { pages, skipped: ids.length - pages.length };
}

export function slugify(s: string): string {
  const t = s
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return t || 'Без названия';
}

interface AssetRef {
  attachmentId: string;
  sha: string;
  path: string;
  mime: string;
  size: number;
  filename: string;
}

/** Collects attachment files referenced by pages (only where download is allowed). */
async function collectAssets(s: Services, user: AuthUser, pages: ExportPage[], prefix: (p: ExportPage) => string): Promise<{ assets: Map<string, AssetRef>; warnings: ConversionWarning[] }> {
  const assets = new Map<string, AssetRef>();
  const warnings: ConversionWarning[] = [];
  const used = new Set<string>();
  for (const p of pages) {
    const ids: string[] = [];
    walk(p.content, (n) => {
      if (n.attrs?.attachmentId) ids.push(n.attrs.attachmentId);
      if (n.type === 'whiteboard') ids.push(...whiteboardAttachmentIds(n.attrs?.scene));
    });
    if (!ids.length) continue;
    if (!p.canDownload) {
      warnings.push({ code: 'download-forbidden', message: `«${p.title}»: файлы не включены — скачивание запрещено политикой` });
      continue;
    }
    const rows = (
      await s.db.query(`select a.id, a.page_id, a.filename, v.blob_sha256, v.mime, v.size from attachments a join attachment_versions v on v.attachment_id = a.id and v.version = a.current_version where a.id = any($1::uuid[]) and a.deleted_at is null`, [ids])
    ).rows;
    // Files owned by other pages are included only if the user may download them there too.
    const foreign = [...new Set(rows.filter((r) => r.page_id && !pages.some((x) => x.id === r.page_id)).map((r) => r.page_id as string))];
    const foreignAcc = foreign.length ? await accessForPages(s.db, user, foreign) : new Map();
    for (const r of rows) {
      if (assets.has(r.id)) continue;
      if (r.page_id && foreign.includes(r.page_id) && !foreignAcc.get(r.page_id)?.actions.download) continue;
      const name = slugify(r.filename);
      let path = `${prefix(p)}assets/${name}`;
      for (let k = 2; used.has(path); k++) path = `${prefix(p)}assets/${name.replace(/(\.[^.]+)?$/, `-${k}$1`)}`;
      used.add(path);
      assets.set(r.id, { attachmentId: r.id, sha: r.blob_sha256, path, mime: r.mime, size: Number(r.size), filename: r.filename });
    }
    for (const id of ids) if (!assets.has(id)) warnings.push({ code: 'asset-missing', message: `«${p.title}»: вложение ${id} недоступно или удалено` });
  }
  return { assets, warnings };
}

export interface ExportResult {
  buffer: Buffer;
  filename: string;
  mime: string;
  warnings: ConversionWarning[];
  report: Record<string, unknown>;
  /** Pages whose content is in the file (re-checked when a stored export is downloaded later). */
  pageIds?: string[];
}

function resolvers(s: Services, pages: ExportPage[]) {
  const byId = new Map(pages.map((p) => [p.id, p]));
  return {
    pageTitle: (id: string) => byId.get(id)?.title ?? null,
    syncedContent: (pageId: string, blockId: string) => {
      const p = byId.get(pageId);
      return p ? findBlock(p.content, blockId)?.node ?? null : null;
    },
  };
}

/**
 * A board's scene with its pictures embedded (data: URLs of the attachments included in the export), so the SVG/PNG
 * of the board is self-contained. Pictures that are not exported stay as absolute links to this instance.
 */
async function boardWithImages(s: Services, scene: unknown, assets: Map<string, AssetRef>): Promise<WhiteboardScene> {
  const sc = normalizeScene(scene);
  const files: NonNullable<WhiteboardScene['files']> = {};
  for (const [k, f] of Object.entries(sc.files ?? {})) {
    const a = assets.get(f.attachmentId);
    let src = `${s.cfg.publicUrl}/api/v1/attachments/${f.attachmentId}/content`;
    if (a && /^image\//.test(a.mime)) src = `data:${a.mime};base64,${(await s.store.readBuffer(blobKey(a.sha))).toString('base64')}`;
    files[k] = { ...f, src };
  }
  return { ...sc, files };
}

/** Standalone SVG file of a board (white background: readable in any viewer and in Word). */
async function boardSvgFile(s: Services, n: PMNode, assets: Map<string, AssetRef>): Promise<string | null> {
  return whiteboardSvgString(await boardWithImages(s, n.attrs?.scene, assets), { idPrefix: n.attrs?.id ?? '', background: '#ffffff', title: 'Доска' });
}

/** Board → PNG for DOCX (2× density for print; logical size reported). */
async function boardPng(s: Services, n: PMNode, assets: Map<string, AssetRef>) {
  const svg = await boardSvgFile(s, n, assets);
  if (!svg) return null;
  const sharp = (await import('sharp')).default;
  const data = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
  const m = await sharp(data).metadata();
  return { data, width: Math.round((m.width ?? 800) / 2), height: Math.round((m.height ?? 600) / 2), mime: 'image/png' };
}

/** Single page or branch as one document in the requested format. Multiple pages: ZIP. */
export async function exportPages(s: Services, user: AuthUser, rootIds: string[], format: ExportFormat, opts: ExportOptions): Promise<ExportResult> {
  const out = await exportPagesInner(s, user, rootIds, format, opts);
  // Integrity: the checksum of the delivered file is part of the report (and of the download headers).
  out.report = { ...out.report, sha256: createHash('sha256').update(out.buffer).digest('hex'), bytes: out.buffer.length };
  return out;
}

async function exportPagesInner(s: Services, user: AuthUser, rootIds: string[], format: ExportFormat, opts: ExportOptions): Promise<ExportResult> {
  const cancelCheck = async () => {
    if (opts.isCancelled && (await opts.isCancelled())) throw new ExportCancelledError();
  };
  const { pages, skipped } = await loadExportPages(s, user, rootIds, opts.includeChildren);
  if (!pages.length) throw Object.assign(new Error('Нет страниц, доступных для экспорта'), { status: 403 });
  await cancelCheck();
  const warnings: ConversionWarning[] = [];
  if (skipped) warnings.push({ code: 'skipped', message: `Пропущено страниц без права экспорта или без опубликованной версии: ${skipped}` });
  const r = resolvers(s, pages);
  const root = pages[0];

  if (format === 'md') {
    // Tree layout: each page is a folder-relative .md; links between exported pages are relative.
    const paths = pagePaths(pages, '.md');
    const { assets, warnings: aw } = await collectAssets(s, user, pages, (p) => dirOf(paths.get(p.id)!));
    warnings.push(...aw);
    const files: Array<{ path: string; data: Buffer }> = [];
    let boards = 0;
    for (const p of pages) {
      await cancelCheck();
      const here = paths.get(p.id)!;
      // boards become SVG pictures next to the page (assets/board-<id>.svg); the scene stays in a marker for re-import
      const boardHref = new Map<string, string>();
      const boardNodes: PMNode[] = [];
      walk(p.content, (n) => {
        if (n.type === 'whiteboard') boardNodes.push(n);
      });
      for (const n of boardNodes) {
        const svg = await boardSvgFile(s, n, p.canDownload ? assets : new Map());
        if (!svg) continue;
        const path = `${dirOf(here)}assets/board-${slugify(String(n.attrs?.id ?? boards + 1))}.svg`;
        files.push({ path, data: Buffer.from(svg, 'utf8') });
        boardHref.set(String(n.attrs?.id), relative(here, path));
        boards++;
      }
      const md = docToMarkdown(p.content, {
        whiteboardHref: (n) => boardHref.get(String(n.attrs?.id)) ?? null,
        frontMatter: { title: p.title, id: p.id, ...(p.icon ? { icon: p.icon } : {}), status: p.status, updated: p.updatedAt?.toISOString?.() ?? null },
        assetHref: (aid) => (assets.has(aid) ? relative(here, assets.get(aid)!.path) : null),
        pageHref: (pid, bid) => (paths.has(pid) ? relative(here, paths.get(pid)!) + (bid ? '#' + bid : '') : `${s.cfg.publicUrl}/p/${pid}${bid ? '#' + bid : ''}`),
        syncedContent: r.syncedContent,
      });
      md.warnings.forEach((w) => warnings.push({ ...w, message: `«${p.title}»: ${w.message}` }));
      // Front matter stays first (for tools that read it), then the page title as H1 for human readers.
      const fm = /^---\n[\s\S]*?\n---\n/.exec(md.markdown)?.[0] ?? '';
      files.push({ path: here, data: Buffer.from(fm + (fm ? '\n' : '') + `# ${mdTitle(p.title)}\n\n` + md.markdown.slice(fm.length).replace(/^\n+/, ''), 'utf8') });
    }
    if (pages.length === 1 && !assets.size && !boards) return { buffer: files[0].data, filename: slugify(root.title) + '.md', mime: 'text/markdown; charset=utf-8', warnings, pageIds: pages.map((p) => p.id), report: { pages: 1, assets: 0 } };
    const zip = await buildZip(s, files, [...assets.values()], warnings, { title: root.title, pages: pages.length });
    return { buffer: zip, filename: slugify(root.title) + '.zip', mime: 'application/zip', warnings, pageIds: pages.map((p) => p.id), report: { pages: pages.length, assets: assets.size, boards } };
  }

  if (opts.layout === 'files' && pages.length > 1) {
    // Separate files: one document per page in the readable tree layout, plus report and checksums (ZIP).
    const ext = '.' + format;
    const paths = pagePaths(pages, ext);
    const files: Array<{ path: string; data: Buffer }> = [];
    const { assets } = await collectAssets(s, user, pages, () => '');
    for (const p of pages) {
      await cancelCheck();
      const one = await renderSingle(s, p.title, p.content, p.author, format, assets, r);
      warnings.push(...one.warnings.map((w) => ({ ...w, message: `«${p.title}»: ${w.message}` })));
      files.push({ path: paths.get(p.id)!, data: one.buffer });
    }
    const zip = await buildZip(s, files, [], warnings, { title: root.title, pages: pages.length });
    return { buffer: zip, filename: slugify(root.title) + '.zip', mime: 'application/zip', warnings, pageIds: pages.map((p) => p.id), report: { pages: pages.length, layout: 'files', files: files.length } };
  }

  if (format === 'docx') {
    const merged = mergeForSingleDocument(pages);
    // A branch exported as one Word document starts with a table of contents (headings carry bookmarks).
    if (pages.length > 1) merged.content = [{ type: 'toc' }, ...(merged.content ?? [])];
    const { assets } = await collectAssets(s, user, pages, () => '');
    await cancelCheck();
    const out = await docToDocx(merged, {
      title: root.title,
      author: root.author ?? undefined,
      baseUrl: s.cfg.publicUrl,
      pageTitle: r.pageTitle,
      syncedContent: r.syncedContent,
      loadImage: async (n) => {
        if (n.type === 'whiteboard') return boardPng(s, n, assets);
        const a = n.attrs?.attachmentId ? assets.get(n.attrs.attachmentId) : null;
        if (!a) return null;
        const sharp = (await import('sharp')).default;
        const data = await s.store.readBuffer(blobKey(a.sha));
        const m = await sharp(data).metadata().catch(() => ({ width: 400, height: 300 }) as any);
        return { data, width: m.width ?? 400, height: m.height ?? 300, mime: a.mime };
      },
    });
    warnings.push(...out.warnings);
    const v = await checkDocx(out.buffer, root.title);
    return { buffer: out.buffer, filename: slugify(root.title) + '.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', warnings, pageIds: pages.map((p) => p.id), report: { pages: pages.length, toc: pages.length > 1, validation: { ok: v.ok, parts: v.parts, stats: v.stats } } };
  }

  // HTML / PDF share the same rendering.
  const merged = mergeForSingleDocument(pages);
  const { assets } = await collectAssets(s, user, pages, () => '');
  await cancelCheck();
  const html = await standaloneHtml(s, root.title, merged, assets, { inlineImages: true });
  if (format === 'html') return { buffer: Buffer.from(html, 'utf8'), filename: slugify(root.title) + '.html', mime: 'text/html; charset=utf-8', warnings, pageIds: pages.map((p) => p.id), report: { pages: pages.length } };
  const pdf = await htmlToPdf(s, html, root.title);
  return { buffer: pdf, filename: slugify(root.title) + '.pdf', mime: 'application/pdf', warnings, pageIds: pages.map((p) => p.id), report: { pages: pages.length } };
}

/** One page as a standalone DOCX/HTML/PDF document (separate-files export). */
async function renderSingle(s: Services, title: string, content: PMNode, author: string | null, format: ExportFormat, assets: Map<string, AssetRef>, r: ReturnType<typeof resolvers>): Promise<{ buffer: Buffer; warnings: ConversionWarning[] }> {
  if (format === 'docx') {
    const out = await docToDocx(content, {
      title,
      author: author ?? undefined,
      baseUrl: s.cfg.publicUrl,
      pageTitle: r.pageTitle,
      syncedContent: r.syncedContent,
      loadImage: async (n) => {
        if (n.type === 'whiteboard') return boardPng(s, n, assets);
        const a = n.attrs?.attachmentId ? assets.get(n.attrs.attachmentId) : null;
        if (!a) return null;
        const sharp = (await import('sharp')).default;
        const data = await s.store.readBuffer(blobKey(a.sha));
        const m = await sharp(data).metadata().catch(() => ({ width: 400, height: 300 }) as any);
        return { data, width: m.width ?? 400, height: m.height ?? 300, mime: a.mime };
      },
    });
    await checkDocx(out.buffer, title);
    return out;
  }
  const html = await standaloneHtml(s, title, content, assets, { inlineImages: true });
  if (format === 'html') return { buffer: Buffer.from(html, 'utf8'), warnings: [] };
  if (format === 'pdf') return { buffer: await htmlToPdf(s, html, title), warnings: [] };
  const md = docToMarkdown(content, { syncedContent: r.syncedContent });
  return { buffer: Buffer.from(`# ${mdTitle(title)}\n\n` + md.markdown, 'utf8'), warnings: md.warnings };
}

/** Child pages are appended after their parent with a heading, producing one printable document. */
function mergeForSingleDocument(pages: ExportPage[]): PMNode {
  if (pages.length === 1) return pages[0].content;
  const out: PMNode[] = [...(pages[0].content.content ?? [])];
  for (const p of pages.slice(1)) {
    out.push({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: p.title || 'Без названия' }] });
    out.push(...(p.content.content ?? []));
  }
  return { type: 'doc', content: out };
}

/** Readable relative paths: Space-less tree of folders; a page with children becomes "<title>/index.md". */
export function pagePaths(pages: ExportPage[], ext: string, base = ''): Map<string, string> {
  const ids = new Set(pages.map((p) => p.id));
  const children = new Map<string | null, ExportPage[]>();
  for (const p of pages) {
    const parent = p.parentId && ids.has(p.parentId) ? p.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), p]);
  }
  const out = new Map<string, string>();
  const walkTree = (parent: string | null, dir: string) => {
    const used = new Set<string>();
    for (const p of children.get(parent) ?? []) {
      let name = slugify(p.title);
      for (let k = 2; used.has(name.toLowerCase()); k++) name = `${slugify(p.title)} (${k})`;
      used.add(name.toLowerCase());
      if (children.get(p.id)?.length) {
        out.set(p.id, `${dir}${name}/index${ext}`);
        walkTree(p.id, `${dir}${name}/`);
      } else out.set(p.id, `${dir}${name}${ext}`);
    }
  };
  walkTree(null, base);
  return out;
}

export function dirOf(path: string) {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(0, i + 1) : '';
}

/** Relative link from one archive file to another, URL-encoded for Markdown. */
export function relative(from: string, to: string): string {
  const a = dirOf(from).split('/').filter(Boolean);
  const b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  const up = a.slice(i).map(() => '..');
  return [...up, ...b.slice(i)].map((seg) => encodeURIComponent(seg).replace(/%2F/g, '/')).join('/');
}

async function buildZip(s: Services, files: Array<{ path: string; data: Buffer }>, assets: AssetRef[], warnings: ConversionWarning[], meta: { title: string; pages: number }): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  const sums: string[] = [];
  const add = (path: string, data: Buffer) => {
    zip.addBuffer(data, path, { mtime: new Date() });
    sums.push(`${createHash('sha256').update(data).digest('hex')}  ${path}`);
  };
  for (const f of files) add(f.path, f.data);
  for (const a of assets) add(a.path, await s.store.readBuffer(blobKey(a.sha)));
  const report = [`# Отчёт об экспорте`, '', `Документ: ${meta.title}`, `Дата: ${new Date().toISOString()}`, `Страниц: ${meta.pages}`, `Файлов: ${assets.length}`, '', '## Преобразования и ограничения', '', ...(warnings.length ? warnings.map((w) => `- ${w.message}`) : ['- Нет — всё содержимое представлено без упрощений.'])].join('\n');
  add('export-report.md', Buffer.from(report + '\n', 'utf8'));
  zip.addBuffer(Buffer.from(sums.join('\n') + '\n', 'utf8'), 'checksums.sha256');
  zip.end();
  const chunks: Buffer[] = [];
  for await (const c of zip.outputStream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

const PRINT_CSS = `
  :root { --text:#24272D; --muted:#68717D; --border:#E5E8ED; --accent:#5A85C6; --soft:#F3F5F7; }
  * { box-sizing: border-box; }
  body { font-family: Inter, "Segoe UI", Roboto, "DejaVu Sans", Arial, sans-serif; color: var(--text); line-height: 1.6; max-width: 820px; margin: 40px auto; padding: 0 24px; font-size: 15px; }
  h1,h2,h3,h4,h5,h6 { line-height: 1.25; margin: 1.4em 0 .5em; page-break-after: avoid; }
  h1.kb-title { font-size: 2em; margin-top: 0; }
  a { color: #2F5FA8; }
  p.kb-lead, p[data-variant="lead"] { font-size: 1.1em; color: var(--muted); }
  blockquote { margin: 1em 0; padding-left: 1em; border-left: 3px solid var(--border); color: #4A5260; }
  pre { background: var(--soft); border: 1px solid var(--border); border-radius: 8px; padding: 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-word; font-size: 13px; }
  code { font-family: "JetBrains Mono", Consolas, "DejaVu Sans Mono", monospace; background: var(--soft); padding: 0 3px; border-radius: 4px; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  td, th { border: 1px solid var(--border); padding: 6px 8px; vertical-align: top; overflow-wrap: anywhere; }
  th { background: var(--soft); text-align: left; }
  td p, th p { margin: 0; }
  figure.kb-image { margin: 1em 0; text-align: center; }
  figure.kb-image[data-align="left"] { text-align: left; } figure.kb-image[data-align="right"] { text-align: right; }
  figure img { max-width: 100%; height: auto; }
  figcaption { color: var(--muted); font-size: .9em; }
  img.kb-inline-image { max-width: 100%; height: auto; }
  figure.kb-whiteboard { margin: 1em 0; text-align: center; page-break-inside: avoid; }
  figure.kb-whiteboard svg { max-width: 100%; height: auto; }
  sup.kb-fn-ref a { text-decoration: none; } sup.kb-fn-ref { line-height: 0; }
  section.kb-footnotes { border-top: 1px solid var(--border); margin-top: 2em; padding-top: .5em; font-size: .9em; color: #4A5260; }
  section.kb-footnotes a.kb-fn-back { text-decoration: none; }
  .kb-callout { border-radius: 10px; padding: 12px 16px; margin: 1em 0; background: #EAF1FB; page-break-inside: avoid; }
  .kb-callout[data-variant="tip"] { background: #E8F6EE; } .kb-callout[data-variant="warning"] { background: #FDF3E1; }
  .kb-callout[data-variant="error"] { background: #FBEAEA; } .kb-callout[data-variant="important"] { background: #F3ECFB; }
  .kb-callout[data-variant="example"], .kb-callout[data-variant="neutral"] { background: var(--soft); }
  .kb-columns { display: flex; gap: 24px; } .kb-column { flex: 1 1 0; min-width: 0; }
  details { border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; margin: .5em 0; } details > summary { font-weight: 600; }
  ul[data-type="taskList"] { list-style: none; padding-left: 0; } ul[data-type="taskList"] li { display: flex; gap: 8px; }
  .kb-file a, .kb-page-link a { display: inline-block; padding: 6px 10px; border: 1px solid var(--border); border-radius: 8px; text-decoration: none; }
  hr { border: none; border-top: 1px solid var(--border); margin: 2em 0; }
  mark { background: #FFF3B0; }
  @media print { body { margin: 0; max-width: none; } a { color: inherit; } }
  @page { size: A4; margin: 18mm 16mm; }
`;

export async function standaloneHtml(s: Services, title: string, doc: PMNode, assets: Map<string, AssetRef>, opts: { inlineImages: boolean }): Promise<string> {
  const d = structuredClone(doc);
  if (opts.inlineImages) {
    const tasks: Promise<void>[] = [];
    walk(d, (n) => {
      if (n.type === 'image' || n.type === 'inlineImage') {
        const a = n.attrs?.attachmentId ? assets.get(n.attrs.attachmentId) : null;
        if (a)
          tasks.push(
            (async () => {
              n.attrs!.src = `data:${a.mime};base64,${(await s.store.readBuffer(blobKey(a.sha))).toString('base64')}`;
            })(),
          );
        else if (n.attrs?.src?.startsWith('/')) n.attrs.src = s.cfg.publicUrl + n.attrs.src;
      }
      if (n.type === 'fileBlock' && n.attrs?.attachmentId) n.attrs.href = `${s.cfg.publicUrl}/api/v1/attachments/${n.attrs.attachmentId}/download`;
      if (n.type === 'whiteboard' && n.attrs?.scene)
        tasks.push(
          (async () => {
            n.attrs!.scene = await boardWithImages(s, n.attrs!.scene, assets);
          })(),
        );
    });
    await Promise.all(tasks);
  }
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const body = docToHtml(d).replace(/href="\/p\//g, `href="${s.cfg.publicUrl}/p/`);
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body><h1 class="kb-title">${esc(title)}</h1>${body}</body></html>`;
}

let browserPromise: Promise<any> | null = null;

async function chromiumPath(configured: string | null): Promise<string | undefined> {
  if (configured) return configured;
  const { readdir } = await import('node:fs/promises');
  for (const base of ['/opt/pw-browsers', `${process.env.HOME}/.cache/ms-playwright`]) {
    try {
      const dirs = (await readdir(base)).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
      if (dirs[0]) return `${base}/${dirs[0]}/chrome-linux/chrome`;
    } catch {
      /* not installed there */
    }
  }
  return undefined;
}

/** Renders HTML to PDF with headless Chromium (works offline; A4, page numbers). */
export async function htmlToPdf(s: Services, html: string, title: string): Promise<Buffer> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import('playwright-core');
      return chromium.launch({ executablePath: await chromiumPath(s.cfg.chromiumPath), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    })();
    browserPromise.catch(() => (browserPromise = null));
  }
  const browser = await browserPromise;
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await ctx.newPage();
    await page.route('**/*', (route: any) => (route.request().url().startsWith('data:') ? route.continue() : route.abort()));
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:8px;color:#68717D;width:100%;padding:0 16mm;">${title.replace(/</g, '&lt;')}</div>`,
      footerTemplate: '<div style="font-size:8px;color:#68717D;width:100%;text-align:right;padding:0 16mm;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { top: '18mm', bottom: '16mm', left: '16mm', right: '16mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await ctx.close();
  }
}

export async function closePdfBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    browserPromise = null;
    await b?.close();
  }
}
