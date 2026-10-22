import yauzl from 'yauzl';
import { writeFile, rm } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { randomUUID } from 'node:crypto';
import { markdownToDoc, rowsToTable, walk, ensureBlockIds, docToPlainText, type PMNode, type ConversionWarning } from '@kb/shared';
import type { Services } from '../app.js';
import type { Tx } from '../db/pool.js';
import { blobKey } from '../storage/blob-store.js';
import { inspectFile, registerBlob, makeImageDerivatives, sanitizeSvgFile, safeFilename, type InspectResult } from './attachments.js';
import { docxToDoc } from '../convert/docx-import.js';
import { htmlToDoc, htmlToNodes } from '../convert/html.js';
import { parseCsv, parseXlsx, sheetPreview, normalizeDate, normalizeNumber, inferTypes, type Sheet } from '../convert/tabular.js';
import { createPage } from './pages.js';
import { requirePage, requireSpace, type AuthUser } from '../acl/engine.js';
import { audit, type AuditActor } from './audit.js';
import { unprocessable } from '../lib/errors.js';
import { replaceContent, ydocToJson } from '../collab/ydoc.js';

export const ZIP_LIMITS = { maxEntries: 20_000, maxTotalBytes: 4 * 1024 ** 3, maxEntryBytes: 1024 ** 3, maxRatio: 200 };

/**
 * Safe ZIP reading: refuses path traversal (zip-slip), absolute paths, encrypted entries, symlinks and
 * decompression bombs (total size, per-entry size, compression ratio) before extracting anything.
 */
export async function readZipSafe(buf: Buffer, limits = ZIP_LIMITS): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true, validateEntrySizes: true, decodeStrings: true }, (err, zip) => {
      if (err || !zip) return reject(unprocessable('zip_corrupt', 'Архив повреждён или не является ZIP: ' + (err?.message ?? '')));
      if (zip.entryCount > limits.maxEntries) return reject(unprocessable('zip_too_many', `В архиве слишком много файлов (${zip.entryCount})`));
      const out = new Map<string, Buffer>();
      let total = 0;
      zip.on('entry', (e: yauzl.Entry) => {
        const name = e.fileName.replace(/\\/g, '/');
        if (name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').includes('..')) {
          zip.close();
          return reject(unprocessable('zip_traversal', `Небезопасный путь в архиве отклонён: ${name}`));
        }
        if ((e.generalPurposeBitFlag & 1) !== 0) {
          zip.close();
          return reject(unprocessable('zip_encrypted', 'Зашифрованные архивы не поддерживаются'));
        }
        const mode = (e.externalFileAttributes >>> 16) & 0o170000;
        if (mode === 0o120000) return zip.readEntry(); // symlink: skipped
        if (name.endsWith('/') || name.startsWith('__MACOSX/') || name.endsWith('.DS_Store')) return zip.readEntry();
        total += e.uncompressedSize;
        if (e.uncompressedSize > limits.maxEntryBytes || total > limits.maxTotalBytes || (e.compressedSize > 0 && e.uncompressedSize / e.compressedSize > limits.maxRatio && e.uncompressedSize > 10 * 1024 * 1024)) {
          zip.close();
          return reject(unprocessable('zip_bomb', 'Архив отклонён: подозрение на ZIP-бомбу (слишком большой размер после распаковки)'));
        }
        zip.openReadStream(e, (e2, rs) => {
          if (e2 || !rs) {
            zip.close();
            return reject(unprocessable('zip_corrupt', 'Не удалось прочитать файл в архиве: ' + name));
          }
          const chunks: Buffer[] = [];
          let size = 0;
          rs.on('data', (c: Buffer) => {
            size += c.length;
            if (size > limits.maxEntryBytes) rs.destroy(new Error('entry too large'));
            chunks.push(c);
          });
          rs.on('error', (er) => {
            zip.close();
            reject(unprocessable('zip_corrupt', 'Ошибка распаковки: ' + er.message));
          });
          rs.on('end', () => {
            out.set(name.normalize('NFC'), Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => resolve(out));
      zip.on('error', (er) =>
        reject(/invalid relative path|absolute path/i.test(er.message) ? unprocessable('zip_traversal', 'Небезопасный путь в архиве отклонён: ' + er.message) : unprocessable('zip_corrupt', 'Архив повреждён: ' + er.message)),
      );
      zip.readEntry();
    });
  });
}

/** Stores a buffer as a content-addressed blob (+ derivatives for images). Returns its descriptor. */
export async function storeBuffer(s: Services, buf: Buffer, filename: string): Promise<{ sha: string; info: InspectResult; size: number; filename: string }> {
  const tmp = join(s.store.tmpDir(), 'imp-' + randomUUID());
  await writeFile(tmp, buf);
  try {
    const info = await inspectFile(tmp, filename);
    if (info.mime === 'image/svg+xml') await sanitizeSvgFile(tmp);
    const blob = await registerBlob(s.db, s.store, tmp, info);
    if (info.kind === 'image') await makeImageDerivatives(s.db, s.store, blob.sha256, info.mime);
    return { sha: blob.sha256, info, size: blob.size, filename: safeFilename(filename) };
  } finally {
    await rm(tmp, { force: true });
  }
}

// ----------------------------------------------------------------------------------- plan model

export interface PlannedAsset {
  ref: string; // "kbblob:<n>"
  sha: string;
  filename: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  kind: string;
}

export interface PlannedPage {
  tempId: string;
  parentTempId: string | null;
  title: string;
  icon: string | null;
  content: PMNode;
  properties: Record<string, unknown>;
  assets: string[]; // refs
  sourceFile: string;
  stats: { blocks: number; tables: number; images: number; chars: number };
}

export interface FileReport {
  file: string;
  status: 'ok' | 'warning' | 'error';
  pages: number;
  warnings: ConversionWarning[];
  error?: string;
}

export interface ImportPlan {
  kind: 'documents' | 'tabular';
  pages: PlannedPage[];
  assets: Record<string, PlannedAsset>;
  sources: Array<{ filename: string; sha: string; mime: string; size: number }>;
  files: FileReport[];
  tabular?: { file: string; sheets: Array<ReturnType<typeof sheetPreview> & { sha?: string }>; encoding?: string; delimiter?: string; sourceSha: string };
}

export interface ImportTarget {
  spaceId: string;
  parentId: string | null;
  /** new: pages at target; update: replace content of an existing page (new revision); append: add to existing page. */
  mode: 'new' | 'update' | 'append';
  pageId?: string | null;
}

function stats(doc: PMNode) {
  let blocks = 0;
  let tables = 0;
  let images = 0;
  walk(doc, (n) => {
    if (n.attrs?.id) blocks++;
    if (n.type === 'table') tables++;
    if (n.type === 'image') images++;
  });
  return { blocks, tables, images, chars: docToPlainText(doc).length };
}

/** Converts uploaded files into a staged plan. Nothing visible is created; blobs are content-addressed and harmless. */
export async function analyzeImport(s: Services, files: Array<{ filename: string; data: Buffer }>, opts: { csv?: { encoding?: 'auto' | 'utf-8' | 'windows-1251'; delimiter?: 'auto' | ',' | ';' | '\t' } } = {}): Promise<ImportPlan> {
  const plan: ImportPlan = { kind: 'documents', pages: [], assets: {}, sources: [], files: [] };
  let assetNo = 0;
  const addAsset = async (buf: Buffer, filename: string): Promise<PlannedAsset> => {
    const st = await storeBuffer(s, buf, filename);
    const existing = Object.values(plan.assets).find((a) => a.sha === st.sha && a.filename === st.filename);
    if (existing) return existing;
    const ref = `kbblob:${++assetNo}`;
    const a: PlannedAsset = { ref, sha: st.sha, filename: st.filename, mime: st.info.mime, size: st.size, width: st.info.width, height: st.info.height, kind: st.info.kind === 'image' ? 'image' : st.info.kind === 'video' ? 'video' : 'file' };
    plan.assets[ref] = a;
    return a;
  };
  const addSource = async (filename: string, data: Buffer) => {
    const st = await storeBuffer(s, data, filename);
    plan.sources.push({ filename: st.filename, sha: st.sha, mime: st.info.mime, size: st.size });
  };

  for (const f of files) {
    const lower = f.filename.toLowerCase();
    const report: FileReport = { file: f.filename, status: 'ok', pages: 0, warnings: [] };
    try {
      if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.xlsx')) {
        if (files.length > 1) throw unprocessable('mixed', 'Табличные файлы импортируются по одному');
        const src = await storeBuffer(s, f.data, f.filename);
        plan.kind = 'tabular';
        if (lower.endsWith('.xlsx')) {
          const x = await parseXlsx(f.data);
          report.warnings.push(...x.warnings);
          plan.tabular = { file: f.filename, sheets: x.sheets.map((sh) => sheetPreview(sh)), sourceSha: src.sha };
        } else {
          const c = parseCsv(f.data, { encoding: opts.csv?.encoding, delimiter: lower.endsWith('.tsv') ? '\t' : opts.csv?.delimiter });
          report.warnings.push(...c.warnings);
          plan.tabular = { file: f.filename, sheets: [sheetPreview(c.sheet)], encoding: c.encoding, delimiter: c.delimiter, sourceSha: src.sha };
        }
      } else if (lower.endsWith('.docx')) {
        const res = await docxToDoc(f.data, async (buf, name) => {
          const a = await addAsset(buf, name);
          return { attachmentId: a.ref, src: a.ref };
        });
        await addSource(f.filename, f.data);
        report.warnings.push(...res.warnings);
        plan.pages.push(planPage(res.doc, res.title ?? stripExt(f.filename), null, f.filename));
      } else if (lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.txt')) {
        const text = f.data.toString('utf8');
        const res = lower.endsWith('.txt')
          ? { doc: textToDoc(text), title: null, frontMatter: null, warnings: [] as ConversionWarning[] }
          : markdownToDoc(text, { htmlToNodes, resolveAsset: () => null });
        report.warnings.push(...res.warnings);
        const p = planPage(res.doc, (res.frontMatter?.title as string) ?? res.title ?? stripExt(f.filename), null, f.filename);
        if (res.frontMatter) p.properties = frontMatterProps(res.frontMatter);
        if (res.frontMatter?.icon) p.icon = String(res.frontMatter.icon).slice(0, 16);
        plan.pages.push(p);
      } else if (lower.endsWith('.html') || lower.endsWith('.htm')) {
        const html = f.data.toString('utf8');
        const res = htmlToDoc(html);
        report.warnings.push(...res.warnings, { code: 'html-sanitized', message: 'HTML очищен: скрипты, стили и внешние ресурсы удалены' });
        const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
        plan.pages.push(planPage(res.doc, title || stripExt(f.filename), null, f.filename));
      } else if (lower.endsWith('.zip')) {
        const entries = await readZipSafe(f.data);
        if (entries.has('manifest.json') || entries.has('metadata/manifest.json')) {
          const m = JSON.parse((entries.get('manifest.json') ?? entries.get('metadata/manifest.json'))!.toString('utf8'));
          if (m.format === 'kb-archive') throw unprocessable('use_archive_restore', 'Это полный архив базы знаний — используйте «Восстановить из архива» в администрировании');
        }
        const before = plan.pages.length;
        await planMarkdownZip(entries, plan, addAsset, report, f.filename);
        report.pages = plan.pages.length - before;
      } else {
        throw unprocessable('unsupported', `Формат файла не поддерживается для импорта документов: ${f.filename}. Поддерживаются DOCX, MD, ZIP (Markdown), HTML, CSV, XLSX.`);
      }
      if (!report.pages) report.pages = plan.pages.filter((p) => p.sourceFile === f.filename).length;
      if (report.warnings.length) report.status = 'warning';
    } catch (e: any) {
      report.status = 'error';
      report.error = e?.message ?? String(e);
    }
    plan.files.push(report);
  }
  return plan;
}

function stripExt(n: string) {
  return n.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Импортированный документ';
}

function textToDoc(text: string): PMNode {
  const paras = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  return ensureBlockIds({ type: 'doc', content: paras.map((p) => ({ type: 'paragraph', ...(p.trim() ? { content: p.split('\n').flatMap((l, i) => [...(i ? [{ type: 'hardBreak' }] : []), ...(l ? [{ type: 'text', text: l }] : [])]) } : {}) })) });
}

function frontMatterProps(fm: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fm)) if (!['title', 'id', 'icon'].includes(k)) out[k] = typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
  return out;
}

function planPage(doc: PMNode, title: string, parentTempId: string | null, sourceFile: string): PlannedPage {
  const assets: string[] = [];
  walk(doc, (n) => {
    if (typeof n.attrs?.attachmentId === 'string' && n.attrs.attachmentId.startsWith('kbblob:')) assets.push(n.attrs.attachmentId);
  });
  return { tempId: randomUUID(), parentTempId, title: title.slice(0, 500), icon: null, content: doc, properties: {}, assets: [...new Set(assets)], sourceFile, stats: stats(doc) };
}

/** Markdown package: folders become pages, README/index.md is the folder page, relative links and assets are resolved. */
async function planMarkdownZip(entries: Map<string, Buffer>, plan: ImportPlan, addAsset: (b: Buffer, n: string) => Promise<PlannedAsset>, report: FileReport, zipName: string) {
  const mdFiles = [...entries.keys()].filter((k) => /\.(md|markdown)$/i.test(k)).sort();
  if (!mdFiles.length) throw unprocessable('zip_no_md', 'В архиве нет Markdown-файлов');
  // Strip a single common top folder.
  const tops = new Set(mdFiles.map((f) => f.split('/')[0]));
  const strip = tops.size === 1 && mdFiles.every((f) => f.includes('/')) ? [...tops][0] + '/' : '';
  const folderPage = new Map<string, PlannedPage>(); // folder path -> page
  const filePage = new Map<string, PlannedPage>();
  const isIndex = (f: string) => /(^|\/)(index|readme)\.(md|markdown)$/i.test(f);
  const ensureFolder = (dir: string): string | null => {
    if (!dir) return null;
    if (folderPage.has(dir)) return folderPage.get(dir)!.tempId;
    const parentDir = posix.dirname(dir) === '.' ? '' : posix.dirname(dir);
    const parent = ensureFolder(parentDir);
    const name = posix.basename(dir);
    const p = planPage({ type: 'doc', content: [{ type: 'paragraph' }] }, name, parent, zipName);
    folderPage.set(dir, p);
    plan.pages.push(p);
    return p.tempId;
  };
  // First pass: allocate pages so links can be resolved in any order.
  for (const f of mdFiles) {
    const rel = f.slice(strip.length);
    const dir = posix.dirname(rel) === '.' ? '' : posix.dirname(rel);
    if (isIndex(rel) && dir) {
      ensureFolder(dir);
      filePage.set(f, folderPage.get(dir)!);
    } else {
      const p = planPage({ type: 'doc', content: [{ type: 'paragraph' }] }, stripExt(posix.basename(rel)), ensureFolder(dir), zipName);
      plan.pages.push(p);
      filePage.set(f, p);
    }
  }
  const missing: string[] = [];
  for (const f of mdFiles) {
    const page = filePage.get(f)!;
    const base = posix.dirname(f);
    const resolvePath = (href: string) => {
      const clean = decodeURIComponent(href.split('#')[0].split('?')[0]);
      if (!clean || /^[a-z]+:/i.test(clean)) return null;
      const p = posix.normalize(posix.join(base === '.' ? '' : base, clean));
      if (p.startsWith('..')) return null;
      return p;
    };
    const assetsInFile: Array<{ href: string; path: string }> = [];
    // Pre-scan to upload assets (markdownToDoc is synchronous).
    const text = entries.get(f)!.toString('utf8').replace(/^﻿/, '');
    const hrefs = [...text.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map((m) => m[1]);
    for (const h of hrefs) {
      const p = resolvePath(h);
      if (p && entries.has(p) && !/\.(md|markdown)$/i.test(p)) assetsInFile.push({ href: h, path: p });
    }
    const resolved = new Map<string, PlannedAsset>();
    for (const a of assetsInFile) if (!resolved.has(a.path)) resolved.set(a.path, await addAsset(entries.get(a.path)!, posix.basename(a.path)));
    const res = markdownToDoc(text, {
      htmlToNodes,
      resolveAsset: (href) => {
        const p = resolvePath(href);
        const a = p ? resolved.get(p) : undefined;
        if (!a) {
          if (p && !entries.has(p)) missing.push(`${f}: ${href}`);
          return null;
        }
        return { attachmentId: a.ref, src: a.ref, name: a.filename, size: a.size, mime: a.mime };
      },
      resolveLink: (href) => {
        const p = resolvePath(href);
        if (!p) return null;
        const target = filePage.get(p) ?? filePage.get(p + '.md') ?? (folderPage.get(p.replace(/\/$/, '')) ?? null);
        if (!target) return null;
        const anchor = href.includes('#') ? href.split('#')[1] : null;
        return { pageId: 'kbtmp:' + target.tempId, blockId: anchor };
      },
    });
    report.warnings.push(...res.warnings.map((w) => ({ ...w, message: `${f}: ${w.message}` })));
    page.content = res.doc;
    if (res.frontMatter?.title || res.title) page.title = String(res.frontMatter?.title ?? res.title).slice(0, 500);
    if (res.frontMatter) page.properties = frontMatterProps(res.frontMatter);
    if (res.frontMatter?.icon) page.icon = String(res.frontMatter.icon).slice(0, 16);
    const fresh = planPage(page.content, page.title, page.parentTempId, zipName);
    page.assets = fresh.assets;
    page.stats = fresh.stats;
  }
  if (missing.length) report.warnings.push({ code: 'missing-files', message: `Не найдены в архиве (${missing.length}): ${missing.slice(0, 20).join('; ')}` });
  const unused = [...entries.keys()].filter((k) => !/\.(md|markdown)$/i.test(k) && !Object.values(plan.assets).some((a) => a.filename === posix.basename(k)));
  if (unused.length) report.warnings.push({ code: 'unused-files', message: `Файлы без ссылок из документов не импортированы (${unused.length}): ${unused.slice(0, 10).join(', ')}` });
}

// ----------------------------------------------------------------------------------- commit

function replaceRefs(doc: PMNode, pageIds: Map<string, string>, assetIds: Map<string, string>): PMNode {
  const d = structuredClone(doc);
  walk(d, (n) => {
    if (n.attrs) {
      if (typeof n.attrs.attachmentId === 'string' && assetIds.has(n.attrs.attachmentId)) {
        const id = assetIds.get(n.attrs.attachmentId)!;
        n.attrs = { ...n.attrs, attachmentId: id, ...(n.type === 'image' || n.attrs.src ? { src: `/api/v1/attachments/${id}/content` } : {}) };
      }
      if (typeof n.attrs.pageId === 'string' && n.attrs.pageId.startsWith('kbtmp:')) n.attrs = { ...n.attrs, pageId: pageIds.get(n.attrs.pageId.slice(6)) ?? null };
    }
    for (const m of n.marks ?? []) {
      if (m.type === 'link' && typeof m.attrs?.href === 'string' && m.attrs.href.startsWith('/p/kbtmp:')) {
        const [tmp, anchor] = m.attrs.href.slice('/p/kbtmp:'.length).split('#');
        m.attrs = { ...m.attrs, href: `/p/${pageIds.get(tmp) ?? ''}${anchor ? '#' + anchor : ''}` };
      }
    }
  });
  return d;
}

/**
 * Publishes a plan atomically: every page, attachment and link is created in ONE transaction.
 * If anything fails, nothing is visible (no half-imported pages).
 */
export async function commitDocuments(s: Services, q: Tx, user: AuthUser, actor: AuditActor, plan: ImportPlan, target: ImportTarget, jobId: string) {
  if (target.parentId) await requirePage(q, user, target.parentId, 'create');
  else await requireSpace(q, user, target.spaceId, 'create');
  const pageIds = new Map(plan.pages.map((p) => [p.tempId, randomUUID()]));
  const created: string[] = [];
  const ordered = topo(plan.pages);
  for (const p of ordered) {
    const pageId = pageIds.get(p.tempId)!;
    const assetIds = new Map<string, string>();
    // Attachments are created in a first step so the content can reference their final ids.
    for (const ref of p.assets) {
      const a = plan.assets[ref];
      if (!a) continue;
      const att = (await q.query(`insert into attachments (org_id, page_id, kind, filename, created_by) values ($1, null, $2, $3, $4) returning id`, [user.orgId, a.kind, a.filename, user.id])).rows[0];
      await q.query(`insert into attachment_versions (attachment_id, version, blob_sha256, size, mime, filename, width, height, created_by) values ($1, 1, $2, $3, $4, $5, $6, $7, $8)`, [att.id, a.sha, a.size, a.mime, a.filename, a.width, a.height, user.id]);
      assetIds.set(ref, att.id);
    }
    const content = replaceRefs(p.content, pageIds, assetIds);
    const parent = p.parentTempId ? pageIds.get(p.parentTempId)! : target.parentId;
    await createPage(q, user, actor, { id: pageId, spaceId: target.spaceId, parentId: parent, title: p.title, icon: p.icon, content, properties: p.properties, revisionKind: 'import' });
    if (assetIds.size) await q.query('update attachments set page_id = $2 where id = any($1::uuid[])', [[...assetIds.values()], pageId]);
    created.push(pageId);
  }
  // Original files are kept with the first created page for re-conversion and audit.
  const rootId = created[0];
  for (const src of plan.sources) {
    const att = (await q.query(`insert into attachments (org_id, page_id, kind, filename, created_by) values ($1, $2, 'import-source', $3, $4) returning id`, [user.orgId, rootId ?? null, src.filename, user.id])).rows[0];
    await q.query(`insert into attachment_versions (attachment_id, version, blob_sha256, size, mime, filename, created_by) values ($1, 1, $2, $3, $4, $5, $6)`, [att.id, src.sha, src.size, src.mime, src.filename, user.id]);
  }
  await audit(q, actor, { action: 'import.commit', targetType: 'job', targetId: jobId, details: { pages: created.length, files: plan.files.map((f) => ({ file: f.file, status: f.status })) } });
  return { pages: created.map((id) => ({ id, title: plan.pages.find((p) => pageIds.get(p.tempId) === id)!.title })), rootPageId: rootId ?? null };
}

function topo(pages: PlannedPage[]): PlannedPage[] {
  const out: PlannedPage[] = [];
  const done = new Set<string>();
  const byId = new Map(pages.map((p) => [p.tempId, p]));
  const visit = (p: PlannedPage) => {
    if (done.has(p.tempId)) return;
    if (p.parentTempId && byId.has(p.parentTempId)) visit(byId.get(p.parentTempId)!);
    done.add(p.tempId);
    out.push(p);
  };
  pages.forEach(visit);
  return out;
}

/** Imports one document into an existing page: replace (new revision, previous state saved) or append. */
export async function commitIntoPage(s: Services, user: AuthUser, actor: AuditActor, plan: ImportPlan, target: ImportTarget, jobId: string) {
  const pageId = target.pageId!;
  await requirePage(s.db, user, pageId, 'edit');
  const p = plan.pages[0];
  const assetIds = new Map<string, string>();
  const { tx } = await import('../db/pool.js');
  await tx(s.db, async (q) => {
    for (const ref of p.assets) {
      const a = plan.assets[ref];
      const att = (await q.query(`insert into attachments (org_id, page_id, kind, filename, created_by) values ($1, $2, $3, $4, $5) returning id`, [user.orgId, pageId, a.kind, a.filename, user.id])).rows[0];
      await q.query(`insert into attachment_versions (attachment_id, version, blob_sha256, size, mime, filename, width, height, created_by) values ($1, 1, $2, $3, $4, $5, $6, $7, $8)`, [att.id, a.sha, a.size, a.mime, a.filename, a.width, a.height, user.id]);
      assetIds.set(ref, att.id);
    }
  });
  const content = replaceRefs(p.content, new Map(), assetIds);
  if (target.mode === 'update') await s.hub.createRevisionNow(pageId, 'manual', user.id, 'Перед импортом');
  await s.hub.applyServerChange(pageId, user.id, (doc) => {
    if (target.mode === 'update') replaceContent(doc, content, 'import');
    else {
      const cur = ydocToJson(doc);
      replaceContent(doc, { type: 'doc', content: [...(cur.content ?? []), ...(content.content ?? [])] }, 'import');
    }
  });
  await s.hub.createRevisionNow(pageId, 'manual', user.id, 'Импорт: ' + p.sourceFile);
  const { auditStandalone } = await import('./audit.js');
  await auditStandalone(s.db, actor, { action: 'import.commit', targetType: 'page', targetId: pageId, details: { jobId, mode: target.mode, file: p.sourceFile } });
  return { pages: [{ id: pageId, title: p.title }], rootPageId: pageId };
}


// ----------------------------------------------------------------------------------- tabular

export interface TabularOptions {
  sheet: number;
  header: boolean;
  /** table: a table block (new page or appended to a page); collection: a typed collection (new, append, upsert). */
  as: 'table' | 'collection';
  collectionId?: string | null;
  collectionMode?: 'append' | 'upsert';
  keyColumn?: number | null;
  columnTypes?: Array<'text' | 'number' | 'date' | 'checkbox' | 'select' | 'url' | 'email'>;
  title?: string;
  encoding?: 'auto' | 'utf-8' | 'windows-1251';
  delimiter?: 'auto' | ',' | ';' | '\t';
}

export async function loadSheet(s: Services, plan: ImportPlan, opts: TabularOptions): Promise<Sheet> {
  const buf = await s.store.readBuffer(blobKey(plan.tabular!.sourceSha));
  if (plan.tabular!.file.toLowerCase().endsWith('.xlsx')) {
    const x = await parseXlsx(buf);
    const sh = x.sheets[opts.sheet];
    if (!sh) throw unprocessable('no_sheet', 'Лист не найден');
    return sh;
  }
  return parseCsv(buf, { encoding: opts.encoding ?? (plan.tabular!.encoding as any), delimiter: opts.delimiter ?? (plan.tabular!.delimiter as any) }).sheet;
}

function convertCell(v: string, type: string): { value: unknown; ok: boolean } {
  if (v === '' || v === undefined) return { value: null, ok: true };
  switch (type) {
    case 'number': {
      const n = normalizeNumber(v);
      return n === null ? { value: v, ok: false } : { value: n, ok: true };
    }
    case 'date': {
      const d = normalizeDate(v);
      return d === null ? { value: v, ok: false } : { value: d, ok: true };
    }
    case 'checkbox':
      return { value: /^(да|true|yes|1|✓|x)$/i.test(v.trim()), ok: true };
    default:
      return { value: v, ok: true };
  }
}

/** Dry run for collection import: which rows are new, which update existing rows (by key), which are invalid. */
export async function tabularDryRun(s: Services, plan: ImportPlan, opts: TabularOptions) {
  const sh = await loadSheet(s, plan, opts);
  const header = opts.header ? sh.rows[0] : sh.rows[0].map((_, i) => `Столбец ${i + 1}`);
  const data = opts.header ? sh.rows.slice(1) : sh.rows;
  const types = opts.columnTypes ?? inferTypes(data).map((t) => (t.type === 'select' ? 'select' : t.type) as any);
  const invalid: Array<{ row: number; column: string; value: string }> = [];
  for (const [ri, r] of data.entries())
    for (const [ci, v] of r.entries()) if (!convertCell(v, types[ci]).ok) invalid.push({ row: ri + (opts.header ? 2 : 1), column: header[ci], value: v });
  let updates = 0;
  let inserts = data.length;
  let duplicatesInFile = 0;
  if (opts.as === 'collection' && opts.collectionId && opts.collectionMode === 'upsert' && opts.keyColumn !== null && opts.keyColumn !== undefined) {
    const keys = data.map((r) => (r[opts.keyColumn!] ?? '').trim());
    duplicatesInFile = keys.length - new Set(keys).size;
    const existing = new Set((await s.db.query(`select title from pages where collection_id = $1 and deleted_at is null`, [opts.collectionId])).rows.map((r) => String(r.title).trim()));
    updates = keys.filter((k) => existing.has(k)).length;
    inserts = data.length - updates;
  }
  return { rows: data.length, inserts, updates, duplicatesInFile, invalid: invalid.slice(0, 200), invalidCount: invalid.length, types, header };
}

export async function commitTabular(s: Services, q: Tx, user: AuthUser, actor: AuditActor, plan: ImportPlan, target: ImportTarget, opts: TabularOptions, jobId: string) {
  const sh = await loadSheet(s, plan, opts);
  const header = opts.header ? sh.rows[0].map((h, i) => h || `Столбец ${i + 1}`) : sh.rows[0].map((_, i) => `Столбец ${i + 1}`);
  const data = opts.header ? sh.rows.slice(1) : sh.rows;
  const title = opts.title || stripExt(plan.tabular!.file);
  if (opts.as === 'table') {
    const table = rowsToTable([header, ...data], true);
    if (target.mode === 'append' && target.pageId) return { table, appendTo: target.pageId };
    if (target.parentId) await requirePage(q, user, target.parentId, 'create');
    const { page } = await createPage(q, user, actor, { spaceId: target.spaceId, parentId: target.parentId, title, content: { type: 'doc', content: [table] }, revisionKind: 'import' });
    await audit(q, actor, { action: 'import.commit', targetType: 'job', targetId: jobId, details: { kind: 'table', rows: data.length } });
    return { pages: [{ id: page.id, title }], rootPageId: page.id };
  }
  // Collection
  const types = opts.columnTypes ?? inferTypes(data).map((t) => t.type as any);
  const keyCol = opts.keyColumn ?? 0;
  let collectionId = opts.collectionId ?? null;
  let containerId: string;
  let schema: Array<{ id: string; name: string; type: string; options?: any[] }>;
  if (!collectionId) {
    schema = header.map((h, i) => ({ id: 'f' + i, name: h, type: types[i] === 'select' ? 'select' : types[i] ?? 'text', ...(types[i] === 'select' ? { options: [...new Set(data.map((r) => r[i]).filter(Boolean))].slice(0, 200).map((v, k) => ({ id: 'o' + k, name: v })) } : {}) }));
    schema.splice(keyCol, 1); // the key column becomes the row title
    if (target.parentId) await requirePage(q, user, target.parentId, 'create');
    const { page } = await createPage(q, user, actor, { spaceId: target.spaceId, parentId: target.parentId, title, icon: '🗂', revisionKind: 'import' });
    const c = (await q.query(`insert into collections (org_id, page_id, name, schema, views, created_by) values ($1, $2, $3, $4, $5, $6) returning id`, [user.orgId, page.id, title, JSON.stringify(schema), JSON.stringify([{ id: 'default', name: 'Таблица', type: 'table' }]), user.id])).rows[0];
    collectionId = c.id;
    containerId = page.id;
  } else {
    const c = (await q.query('select * from collections where id = $1 and org_id = $2', [collectionId, user.orgId])).rows[0];
    if (!c) throw unprocessable('no_collection', 'Коллекция не найдена');
    await requirePage(q, user, c.page_id, 'edit');
    containerId = c.page_id;
    schema = c.schema;
  }
  const spaceId = (await q.query('select space_id from pages where id = $1', [containerId])).rows[0].space_id;
  const fieldFor = (colName: string) => schema.find((f) => f.name.toLowerCase() === colName.toLowerCase());
  let inserted = 0;
  let updated = 0;
  const existing = new Map<string, string>();
  if (opts.collectionMode === 'upsert') for (const r of (await q.query(`select id, title from pages where collection_id = $1 and deleted_at is null`, [collectionId])).rows) existing.set(String(r.title).trim(), r.id);
  for (const r of data) {
    const props: Record<string, unknown> = {};
    header.forEach((h, i) => {
      if (i === keyCol) return;
      const f = fieldFor(h);
      if (!f) return;
      const conv = convertCell(r[i] ?? '', f.type);
      props[f.id] = conv.ok ? conv.value : r[i]; // incompatible values are kept as text, never dropped
    });
    const key = (r[keyCol] ?? '').trim();
    const ex = existing.get(key);
    if (ex) {
      await q.query(`update pages set properties = properties || $2::jsonb, version = version + 1, updated_at = now(), updated_by = $3 where id = $1`, [ex, JSON.stringify(props), user.id]);
      await q.query(`insert into page_events (org_id, page_id, actor_id, type, data) values ($1, $2, $3, 'properties', $4)`, [user.orgId, ex, user.id, { importJob: jobId, after: props }]);
      updated++;
    } else {
      await createPage(q, user, actor, { spaceId, parentId: containerId, title: key || 'Без названия', properties: props, collectionId, revisionKind: 'import' });
      inserted++;
    }
  }
  await audit(q, actor, { action: 'import.commit', targetType: 'collection', targetId: collectionId, details: { jobId, inserted, updated } });
  return { pages: [{ id: containerId, title }], rootPageId: containerId, collectionId, inserted, updated };
}
