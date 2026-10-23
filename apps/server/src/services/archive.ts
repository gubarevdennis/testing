/**
 * Portable organisation archive ("kb-archive", format v1).
 *
 * Human readable: spaces/<space>/<page tree>.md with assets next to them, collections as CSV.
 * Machine exact: metadata/*.json + metadata/content/<pageId>.json (canonical document) + metadata/versions/.
 * Integrity: checksums.sha256 over every file; restore verifies checksums before touching the database.
 */
import yazl from 'yazl';
import { createHash, randomUUID } from 'node:crypto';
import Papa from 'papaparse';
import { docToMarkdown, collectBlocks, walk, migrateContent, keyBetween, CONTENT_SCHEMA_VERSION, type PMNode } from '@kb/shared';
import type { Services } from '../app.js';
import type { Tx } from '../db/pool.js';
import { blobKey } from '../storage/blob-store.js';
import { pagePaths, relative, slugify, type ExportPage } from './exporter.js';
import { readZipSafe, assertBufferClean } from './importer.js';
import { jsonToUpdate, updateToJson } from '../collab/ydoc.js';
import { insertAncestors } from './pages.js';
import { audit, type AuditActor } from './audit.js';
import { unprocessable } from '../lib/errors.js';
import { docToPlainText, countWords } from '@kb/shared';

export const ARCHIVE_FORMAT = 'kb-archive';
export const ARCHIVE_VERSION = 1;

export interface ArchiveOptions {
  includeVersions: boolean;
  includeAcl: boolean;
  includeComments: boolean;
  includeAudit: boolean;
}

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Builds the archive for the whole organisation (administrative operation, includes private pages). */
export async function buildOrgArchive(s: Services, orgId: string, opts: ArchiveOptions, progress?: (p: Record<string, unknown>) => Promise<void>): Promise<{ buffer: Buffer; manifest: any }> {
  const db = s.db;
  const files: Array<{ path: string; data: Buffer }> = [];
  const add = (path: string, data: Buffer | string) => files.push({ path: 'knowledge-export/' + path, data: Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8') });
  const org = (await db.query('select id, name, slug, settings, created_at from organizations where id = $1', [orgId])).rows[0];
  // A consistent snapshot of all metadata (repeatable read) even with concurrent edits (V18-A06).
  const client = await db.connect();
  let data: any;
  try {
    await client.query('begin isolation level repeatable read read only');
    const q = (sql: string, p: unknown[] = []) => client.query(sql, p).then((r) => r.rows);
    data = {
      spaces: await q(`select id, name, description, icon, kind, visibility, owner_user_id, settings, sort_key, created_at, archived_at from spaces where org_id = $1 and deleted_at is null order by sort_key collate "C"`, [orgId]),
      pages: await q(
        `select p.id, p.space_id, p.parent_id, p.sort_key, p.title, p.icon, p.cover, p.status, p.inherit_permissions, p.locked, p.wide, p.properties, p.collection_id, p.owner_id, p.created_by, p.created_at, p.updated_at, p.published_revision_id, p.review_due_at, d.content
           from pages p join doc_state d on d.page_id = p.id join spaces s on s.id = p.space_id where p.org_id = $1 and p.deleted_at is null and s.deleted_at is null`,
        [orgId],
      ),
      users: await q(`select id, email, name, kind, org_role, status, title, manager_id, primary_group_id, created_at from users where org_id = $1`, [orgId]),
      groups: await q(`select id, name, description, kind, parent_id, manager_id from groups where org_id = $1 and deleted_at is null`, [orgId]),
      members: await q(`select m.group_id, m.user_id, m.role, m.expires_at from group_members m join groups g on g.id = m.group_id where g.org_id = $1 and g.deleted_at is null`, [orgId]),
      grants: opts.includeAcl ? await q(`select id, resource_type, resource_id, subject_type, subject_id, level, can_export, can_download, can_share, can_publish, starts_at, expires_at, reason from grants where org_id = $1 and revoked_at is null`, [orgId]) : [],
      attachments: await q(
        `select a.id, a.page_id, a.kind, a.filename, a.current_version, v.version, v.blob_sha256, v.size, v.mime, v.filename as v_filename, v.width, v.height, v.created_at
           from attachments a join attachment_versions v on v.attachment_id = a.id where a.org_id = $1 and a.deleted_at is null and a.page_id is not null order by a.id, v.version`,
        [orgId],
      ),
      collections: await q(`select id, page_id, name, schema, views from collections where org_id = $1`, [orgId]),
      comments: opts.includeComments ? await q(`select c.id, c.page_id, c.thread_id, c.parent_id, c.block_id, c.quote, c.body_text, c.author_id, c.created_at, c.resolved_at from comments c where c.org_id = $1 and c.deleted_at is null`, [orgId]) : [],
      templates: await q(`select id, space_id, key, name, description, category, icon, default_title, content, properties, required_properties, builtin from templates where org_id = $1 and deleted_at is null and not builtin`, [orgId]),
      revisions: opts.includeVersions
        ? await q(`select r.id, r.page_id, r.number, r.kind, r.label, r.title, r.content, r.authors, r.created_by, r.created_at from page_revisions r join pages p on p.id = r.page_id where p.org_id = $1 and p.deleted_at is null order by r.page_id, r.number`, [orgId])
        : [],
      audit: opts.includeAudit ? await q(`select id, at, actor_id, actor_name, action, target_type, target_id, outcome, details, hash from audit_events where org_id = $1 order by id`, [orgId]) : [],
    };
    await client.query('commit');
  } finally {
    client.release();
  }
  await progress?.({ stage: 'metadata', pages: data.pages.length });
  const pageIds = new Set(data.pages.map((p: any) => p.id));
  data.pages = data.pages.filter((p: any) => !p.parent_id || pageIds.has(p.parent_id));
  // Files and comments only of the pages in the archive: those of trashed pages would have no place in it (their
  // metadata had no file path, and restoring such an archive failed with «В архиве нет файла undefined»).
  const kept = new Set(data.pages.map((p: any) => p.id));
  data.attachments = data.attachments.filter((a: any) => kept.has(a.page_id));
  data.comments = data.comments.filter((c: any) => kept.has(c.page_id));

  // Readable tree per space.
  const pathOf = new Map<string, string>();
  const spaceDir = new Map<string, string>();
  const usedSpaceNames = new Set<string>();
  for (const sp of data.spaces) {
    let name = slugify(sp.kind === 'personal' ? `Личное — ${data.users.find((u: any) => u.id === sp.owner_user_id)?.name ?? sp.id.slice(0, 8)}` : sp.name);
    for (let k = 2; usedSpaceNames.has(name.toLowerCase()); k++) name = `${slugify(sp.name)} (${k})`;
    usedSpaceNames.add(name.toLowerCase());
    spaceDir.set(sp.id, `spaces/${name}/`);
    const pages: ExportPage[] = data.pages.filter((p: any) => p.space_id === sp.id).sort((a: any, b: any) => (a.sort_key < b.sort_key ? -1 : 1)).map((p: any) => ({ id: p.id, title: p.title, icon: p.icon, parentId: p.parent_id, spaceId: p.space_id, content: p.content, canDownload: true, properties: p.properties, status: p.status, updatedAt: p.updated_at, author: null }));
    for (const [id, path] of pagePaths(pages, '.md', `spaces/${name}/`)) pathOf.set(id, path);
  }
  // Attachments: current version under assets/ next to the space; older versions under metadata/files-history.
  const assetPath = new Map<string, string>();
  const used = new Set<string>();
  const currentAtt = data.attachments.filter((a: any) => a.version === a.current_version);
  let bytes = 0;
  for (const a of currentAtt) {
    const page = data.pages.find((p: any) => p.id === a.page_id);
    if (!page) continue;
    const base = `${spaceDir.get(page.space_id)}assets/`;
    let p = base + slugify(a.filename);
    for (let k = 2; used.has(p.toLowerCase()); k++) p = base + slugify(a.filename).replace(/(\.[^.]+)?$/, `-${k}$1`);
    used.add(p.toLowerCase());
    assetPath.set(a.id, p);
    const buf = await s.store.readBuffer(blobKey(a.blob_sha256));
    if (sha(buf) !== a.blob_sha256) throw new Error(`Нарушена целостность файла ${a.filename} (sha256 не совпадает) — архивирование остановлено`);
    bytes += buf.length;
    add(p, buf);
  }
  const historyPath = new Map<string, string>();
  for (const a of data.attachments.filter((x: any) => x.version !== x.current_version)) {
    const p = `metadata/files-history/${a.id}/v${a.version}-${slugify(a.v_filename)}`;
    historyPath.set(`${a.id}:${a.version}`, p);
    add(p, await s.store.readBuffer(blobKey(a.blob_sha256)));
  }
  await progress?.({ stage: 'files', bytes });
  // Markdown pages and canonical JSON.
  const collectionsCsv = new Map<string, { title: string; rows: string[][] }>();
  for (const c of data.collections) {
    const rows = data.pages.filter((p: any) => p.collection_id === c.id);
    const header = ['Название', ...c.schema.map((f: any) => f.name)];
    collectionsCsv.set(c.id, { title: c.name, rows: [header, ...rows.map((r: any) => [r.title, ...c.schema.map((f: any) => fmtVal(r.properties?.[f.id]))])] });
    const csvName = `databases/${slugify(c.name)}-${c.id.slice(0, 8)}`;
    add(csvName + '.csv', '﻿' + Papa.unparse(collectionsCsv.get(c.id)!.rows, { delimiter: ';' }));
    add(csvName + '.schema.json', JSON.stringify({ id: c.id, name: c.name, schema: c.schema, views: c.views }, null, 2));
  }
  let blocks = 0;
  for (const p of data.pages) {
    const here = pathOf.get(p.id);
    if (!here) continue;
    blocks += collectBlocks(p.content).length;
    const md = docToMarkdown(p.content, {
      frontMatter: { title: p.title, id: p.id, ...(p.icon ? { icon: p.icon } : {}), status: p.status, created: p.created_at, updated: p.updated_at },
      assetHref: (aid) => (assetPath.has(aid) ? relative(here, assetPath.get(aid)!) : null),
      pageHref: (pid, bid) => (pathOf.has(pid) ? relative(here, pathOf.get(pid)!) + (bid ? '#' + bid : '') : `${s.cfg.publicUrl}/p/${pid}`),
      collectionRows: (cid) => collectionsCsv.get(cid) ?? null,
    });
    const fm = /^---\n[\s\S]*?\n---\n/.exec(md.markdown)?.[0] ?? '';
    add(here, fm + '\n# ' + p.title + '\n\n' + md.markdown.slice(fm.length).replace(/^\n+/, ''));
    add(`metadata/content/${p.id}.json`, JSON.stringify(p.content));
  }
  await progress?.({ stage: 'pages', pages: data.pages.length });
  if (opts.includeVersions) {
    const byPage = new Map<string, any[]>();
    for (const r of data.revisions) byPage.set(r.page_id, [...(byPage.get(r.page_id) ?? []), r]);
    for (const [pid, revs] of byPage) add(`metadata/versions/${pid}.json`, JSON.stringify(revs));
  }
  const links: Array<{ from: string; to: string }> = [];
  for (const p of data.pages) walk(p.content, (n) => {
    if ((n.type === 'pageLink' || n.type === 'pageMention') && n.attrs?.pageId) links.push({ from: p.id, to: n.attrs.pageId });
    for (const m of n.marks ?? []) {
      const id = /^\/p\/([0-9a-f-]{36})/.exec(m.attrs?.href ?? '')?.[1];
      if (m.type === 'link' && id) links.push({ from: p.id, to: id });
    }
  });
  const meta = {
    'metadata/organization.json': { id: org.id, name: org.name, slug: org.slug, createdAt: org.created_at, settings: { ...org.settings } },
    'metadata/spaces.json': data.spaces.map((sp: any) => ({ ...sp, path: spaceDir.get(sp.id) })),
    'metadata/pages.json': data.pages.map(({ content, ...p }: any) => ({ ...p, path: pathOf.get(p.id), blocks: collectBlocks(content).length, words: countWords(docToPlainText(content)) })),
    'metadata/users.json': data.users,
    'metadata/groups.json': { groups: data.groups, members: data.members },
    'metadata/permissions.json': data.grants,
    'metadata/attachments.json': data.attachments.map((a: any) => ({ ...a, path: a.version === a.current_version ? assetPath.get(a.id) : historyPath.get(`${a.id}:${a.version}`) })),
    'metadata/collections.json': data.collections,
    'metadata/links.json': links,
    'metadata/comments.json': data.comments,
    'metadata/templates.json': data.templates,
  };
  for (const [p, v] of Object.entries(meta)) add(p, JSON.stringify(v, null, 2));
  if (opts.includeAudit) add('metadata/audit.jsonl', data.audit.map((a: any) => JSON.stringify(a)).join('\n') + '\n');
  const manifest = {
    format: ARCHIVE_FORMAT,
    formatVersion: ARCHIVE_VERSION,
    contentSchemaVersion: CONTENT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    organization: { id: org.id, name: org.name },
    includes: opts,
    counts: {
      spaces: data.spaces.length,
      pages: data.pages.length,
      blocks,
      attachments: currentAtt.length,
      attachmentVersions: data.attachments.length,
      bytes,
      users: data.users.length,
      groups: data.groups.length,
      grants: data.grants.length,
      revisions: data.revisions.length,
      links: links.length,
      collections: data.collections.length,
      comments: data.comments.length,
    },
  };
  add('manifest.json', JSON.stringify(manifest, null, 2));
  add('README.md', readme(manifest));
  add('export-report.md', `# Отчёт об экспорте\n\nДата: ${manifest.createdAt}\n\n- Страниц: ${manifest.counts.pages}\n- Файлов: ${manifest.counts.attachments}\n- Версий: ${manifest.counts.revisions}\n- Прав доступа: ${manifest.counts.grants}\n\nСекреты (пароли, токены, ключи) в архив не включаются. Корзина в архив не входит.\n`);
  const sums = files.map((f) => `${sha(f.data)}  ${f.path.slice('knowledge-export/'.length)}`).join('\n') + '\n';
  add('checksums.sha256', sums);
  const zip = new yazl.ZipFile();
  for (const f of files) zip.addBuffer(f.data, f.path);
  zip.end();
  const chunks: Buffer[] = [];
  for await (const c of zip.outputStream) chunks.push(c as Buffer);
  return { buffer: Buffer.concat(chunks), manifest };
}

function fmtVal(v: unknown) {
  return v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'да' : 'нет') : String(v);
}

function readme(m: any) {
  return `# Архив базы знаний «${m.organization.name}»

Создан: ${m.createdAt}. Формат: ${m.format} v${m.formatVersion}.

## Как читать без приложения

- \`spaces/\` — пространства. Каждая страница — файл Markdown (UTF-8). Страница с дочерними — папка с \`index.md\`.
- Рядом лежат папки \`assets/\` с оригиналами изображений и файлов; ссылки в Markdown относительные и работают после распаковки.
- \`databases/\` — структурированные коллекции в CSV (разделитель «;», UTF-8) и их схемы.
- Откройте \`README.md\` любого раздела в редакторе Markdown (VS Code, Obsidian, Typora) или просто в текстовом редакторе.

## Объём

| Объект | Количество |
|---|---|
| Пространства | ${m.counts.spaces} |
| Страницы | ${m.counts.pages} |
| Блоки | ${m.counts.blocks} |
| Файлы | ${m.counts.attachments} |
| Версии | ${m.counts.revisions} |
| Права доступа | ${m.counts.grants} |
| Ссылки между страницами | ${m.counts.links} |

## Точное восстановление

\`metadata/\` содержит машиночитаемые данные: структуру дерева, исходный формат документов (\`content/*.json\`), права, группы, версии, связи и вложения.
Восстановление: Администрирование → Резервирование → «Восстановить из архива». Перед применением выполняется проверка контрольных сумм и пробный прогон с отчётом.

## Целостность

\`checksums.sha256\` — контрольные суммы SHA-256 всех файлов. Проверка: \`cd knowledge-export && sha256sum -c checksums.sha256\`.

## Ограничения

- Пароли, токены, ключи шифрования и сеансы не экспортируются.
- Комментарии и права доступа не представимы в Markdown и хранятся только в \`metadata/\`.
- Цвет и шрифт текста упрощены в Markdown; точные значения — в \`metadata/content/\`.
`;
}

// ------------------------------------------------------------------------------------------- restore

export interface ArchiveAnalysis {
  ok: boolean;
  manifest: any;
  checksumErrors: string[];
  missingFiles: string[];
  conflicts: { pages: number; spaces: number; attachments: number };
  users: Array<{ email: string; name: string; match: 'existing' | 'unresolved' }>;
  warnings: string[];
  /** Files rejected by the antivirus (each attachment of the archive is scanned when CLAMAV_HOST is set). */
  malware: Array<{ path: string; message: string }>;
}

export async function analyzeArchive(s: Services, orgId: string, buf: Buffer): Promise<{ analysis: ArchiveAnalysis; entries: Map<string, Buffer> }> {
  const raw = await readZipSafe(buf);
  const entries = new Map<string, Buffer>();
  for (const [k, v] of raw) entries.set(k.replace(/^knowledge-export\//, ''), v);
  const mf = entries.get('manifest.json');
  if (!mf) throw unprocessable('not_archive', 'В архиве нет manifest.json — это не архив базы знаний');
  const manifest = JSON.parse(mf.toString('utf8'));
  if (manifest.format !== ARCHIVE_FORMAT) throw unprocessable('not_archive', 'Неизвестный формат архива');
  if (manifest.formatVersion > ARCHIVE_VERSION) throw unprocessable('newer_format', `Архив создан более новой версией системы (формат ${manifest.formatVersion}); обновите приложение`);
  if ((manifest.contentSchemaVersion ?? 1) > CONTENT_SCHEMA_VERSION)
    throw unprocessable('newer_schema', `Документы архива созданы более новой версией схемы (${manifest.contentSchemaVersion}); обновите приложение`);
  const checksumErrors: string[] = [];
  const missingFiles: string[] = [];
  const sums = entries.get('checksums.sha256')?.toString('utf8') ?? '';
  if (!sums) checksumErrors.push('Нет файла контрольных сумм');
  for (const line of sums.split('\n').filter(Boolean)) {
    const [hash, ...rest] = line.split('  ');
    const path = rest.join('  ');
    const data = entries.get(path);
    if (!data) missingFiles.push(path);
    else if (sha(data) !== hash) checksumErrors.push(path);
  }
  const j = (p: string, d: unknown = []) => (entries.has(p) ? JSON.parse(entries.get(p)!.toString('utf8')) : d);
  const pages = j('metadata/pages.json') as any[];
  const spaces = j('metadata/spaces.json') as any[];
  const atts = j('metadata/attachments.json') as any[];
  const conflicts = {
    pages: pages.length ? Number((await s.db.query('select count(*)::int c from pages where id = any($1::uuid[])', [pages.map((p) => p.id)])).rows[0].c) : 0,
    spaces: spaces.length ? Number((await s.db.query('select count(*)::int c from spaces where id = any($1::uuid[])', [spaces.map((p) => p.id)])).rows[0].c) : 0,
    attachments: atts.length ? Number((await s.db.query('select count(*)::int c from attachments where id = any($1::uuid[])', [[...new Set(atts.map((a) => a.id))]])).rows[0].c) : 0,
  };
  const existing = new Set((await s.db.query('select lower(email) e from users where org_id = $1', [orgId])).rows.map((r) => r.e));
  const users = (j('metadata/users.json') as any[]).map((u) => ({ email: u.email, name: u.name, match: existing.has(String(u.email).toLowerCase()) ? ('existing' as const) : ('unresolved' as const) }));
  const malware: Array<{ path: string; message: string }> = [];
  if (s.cfg.clamavHost) {
    const paths = new Set<string>(atts.map((a) => a.path).filter((p: unknown): p is string => typeof p === 'string'));
    for (const path of paths) {
      const data = entries.get(path);
      if (!data) continue;
      try {
        await assertBufferClean(s, data, path);
      } catch (e: any) {
        malware.push({ path, message: e.message });
      }
    }
  }
  const warnings: string[] = [];
  if (malware.length) warnings.push(`Антивирус отклонил файлы архива (${malware.length}) — восстановление невозможно, пока они в архиве.`);
  if (conflicts.pages || conflicts.spaces) warnings.push('Часть идентификаторов уже существует — объекты будут восстановлены с новыми идентификаторами, внутренние ссылки будут переназначены.');
  if (users.some((u) => u.match === 'unresolved')) warnings.push('Пользователи, отсутствующие в системе, будут созданы как «неразрешённые идентичности» (приостановлены, без доступа) до сопоставления администратором.');
  return { analysis: { ok: !checksumErrors.length && !missingFiles.length && !malware.length, manifest, checksumErrors, missingFiles, conflicts, users, warnings, malware }, entries };
}

/**
 * Where an archive is restored (R-ARCHIVE-006, R-ARCHIVE-016):
 *  - merge: spaces of the archive are recreated in the organisation (ids remapped on conflict);
 *  - new-space: everything goes into ONE new private space (isolated contour) — each archived space becomes a
 *    top-level page of it; space-level grants are not applied (they would widen access), page grants are kept;
 *  - into-space: the same layout inside an existing space (merge into a chosen space).
 * In the single-space modes all ids are always fresh, so the originals are never touched or linked.
 */
export type RestoreTarget = { mode: 'merge' } | { mode: 'new-space'; name?: string } | { mode: 'into-space'; spaceId: string };

/** Restores an archive into the current organisation in ONE transaction; returns a verification report. */
export async function restoreArchive(s: Services, q: Tx, orgId: string, actor: AuditActor, entries: Map<string, Buffer>, analysis: ArchiveAnalysis, adminUserId: string, target: RestoreTarget = { mode: 'merge' }) {
  if (!analysis.ok) throw unprocessable('integrity', 'Архив не прошёл проверку целостности — восстановление запрещено');
  const single = target.mode !== 'merge';
  const j = (p: string, d: unknown = []) => (entries.has(p) ? JSON.parse(entries.get(p)!.toString('utf8')) : d);
  const spaces = j('metadata/spaces.json') as any[];
  const pages = j('metadata/pages.json') as any[];
  const users = j('metadata/users.json') as any[];
  const { groups, members } = j('metadata/groups.json', { groups: [], members: [] }) as any;
  const grants = j('metadata/permissions.json') as any[];
  const atts = j('metadata/attachments.json') as any[];
  const collections = j('metadata/collections.json') as any[];
  const remap = single || analysis.conflicts.pages > 0 || analysis.conflicts.spaces > 0 || analysis.conflicts.attachments > 0;
  const idMap = new Map<string, string>();
  const map = (id: string | null | undefined) => (id ? (idMap.get(id) ?? id) : null);
  const fresh = (id: string) => {
    if (!remap) return id;
    if (!idMap.has(id)) idMap.set(id, randomUUID());
    return idMap.get(id)!;
  };
  // Users: match by email; unresolved identities are created suspended (no access until mapped).
  const userMap = new Map<string, string>();
  const unresolved: string[] = [];
  for (const u of users) {
    const ex = (await q.query('select id from users where org_id = $1 and lower(email) = lower($2)', [orgId, u.email])).rows[0];
    if (ex) userMap.set(u.id, ex.id);
    else {
      const n = (await q.query(`insert into users (org_id, email, name, kind, org_role, status, title) values ($1, $2, $3, $4, 'member', 'suspended', $5) returning id`, [orgId, u.email, u.name + ' (неразрешённая)', u.kind, u.title])).rows[0];
      userMap.set(u.id, n.id);
      unresolved.push(u.email);
    }
  }
  const um = (id: string | null) => (id ? userMap.get(id) ?? null : null);
  // Groups by name (created if missing).
  const groupMap = new Map<string, string>();
  for (const g of groups) {
    const ex = (await q.query('select id from groups where org_id = $1 and lower(name) = lower($2) and kind = $3 and deleted_at is null', [orgId, g.name, g.kind])).rows[0];
    groupMap.set(g.id, ex?.id ?? (await q.query(`insert into groups (org_id, name, description, kind, created_by) values ($1, $2, $3, $4, $5) returning id`, [orgId, g.name, g.description ?? '', g.kind, adminUserId])).rows[0].id);
  }
  for (const g of groups) if (g.parent_id && groupMap.has(g.parent_id)) await q.query('update groups set parent_id = $2 where id = $1', [groupMap.get(g.id), groupMap.get(g.parent_id)]);
  for (const m of members) {
    const gid = groupMap.get(m.group_id);
    const uid = um(m.user_id);
    if (gid && uid) await q.query(`insert into group_members (group_id, user_id, role, expires_at) values ($1, $2, $3, $4) on conflict do nothing`, [gid, uid, m.role, m.expires_at]);
  }
  // Single-space modes: one target space; every archived space becomes a folder page at its top level.
  let targetSpaceId: string | null = null;
  const rootParent = new Map<string, string>(); // archived root page id -> new folder page id
  if (single) {
    if (target.mode === 'into-space') {
      const sp = (await q.query('select id from spaces where id = $1 and org_id = $2 and deleted_at is null', [target.spaceId, orgId])).rows[0];
      if (!sp) throw unprocessable('target_space', 'Пространство для восстановления не найдено');
      targetSpaceId = sp.id as string;
    } else {
      const last = (await q.query(`select sort_key from spaces where org_id = $1 and kind <> 'personal' order by sort_key collate "C" desc limit 1`, [orgId])).rows[0]?.sort_key ?? null;
      const name = (target.name?.trim() || `Восстановлено из архива ${String(analysis.manifest.createdAt ?? '').slice(0, 10)}`).slice(0, 200);
      targetSpaceId = (
        await q.query(
          `insert into spaces (org_id, name, description, icon, kind, visibility, owner_user_id, settings, sort_key, created_by) values ($1, $2, $3, '🗄', 'project', 'private', $4, '{}'::jsonb, $5, $4) returning id`,
          [orgId, name, `Изолированное восстановление архива «${analysis.manifest.organization?.name ?? ''}» от ${analysis.manifest.createdAt ?? ''}`, adminUserId, keyBetween(last, null)],
        )
      ).rows[0].id as string;
      await q.query(`insert into grants (org_id, resource_type, resource_id, subject_type, subject_id, level, reason, granted_by) values ($1, 'space', $2, 'user', $3, 'full', 'archive restore (isolated)', $3)`, [orgId, targetSpaceId, adminUserId]);
    }
    let folderKey: string | null = (await q.query(`select sort_key from pages where space_id = $1 and parent_id is null order by sort_key collate "C" desc limit 1`, [targetSpaceId])).rows[0]?.sort_key ?? null;
    for (const sp of spaces) {
      idMap.set(sp.id, targetSpaceId);
      folderKey = keyBetween(folderKey, null);
      const folderId = randomUUID();
      const owner = sp.kind === 'personal' ? users.find((u: any) => u.id === sp.owner_user_id)?.name : null;
      // Folder pages are ordinary archive pages from here on (inserted parents-first with the others).
      pages.unshift({ id: folderId, space_id: sp.id, parent_id: null, sort_key: folderKey, title: sp.kind === 'personal' ? `Личное — ${owner ?? sp.name}` : sp.name, icon: sp.icon ?? '📁', cover: null, status: 'draft', inherit_permissions: true, locked: false, wide: false, properties: {}, owner_id: null, created_by: null, created_at: new Date().toISOString(), review_due_at: null, __folder: true });
      for (const p of pages) if (!p.__folder && p.space_id === sp.id && !p.parent_id) rootParent.set(p.id, folderId);
    }
    for (const p of pages) if (rootParent.has(p.id)) p.parent_id = rootParent.get(p.id);
  }
  // Spaces (personal spaces of existing users merge into their existing personal space).
  for (const sp of single ? [] : spaces) {
    const owner = um(sp.owner_user_id);
    if (sp.kind === 'personal' && owner) {
      const ex = (await q.query(`select id from spaces where kind = 'personal' and owner_user_id = $1`, [owner])).rows[0];
      if (ex) {
        idMap.set(sp.id, ex.id);
        continue;
      }
    }
    const id = fresh(sp.id);
    await q.query(`insert into spaces (id, org_id, name, description, icon, kind, visibility, owner_user_id, settings, sort_key, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [id, orgId, sp.name, sp.description ?? '', sp.icon, sp.kind, sp.visibility, owner, sp.settings ?? {}, sp.sort_key ?? 'a0', adminUserId]);
    if (sp.kind === 'personal' && owner) await q.query(`insert into grants (org_id, resource_type, resource_id, subject_type, subject_id, level, reason) values ($1, 'space', $2, 'user', $3, 'full', 'personal space owner')`, [orgId, id, owner]);
  }
  // Pre-assign ids for pages, collections, attachments so content references can be rewritten before insert.
  for (const p of pages) fresh(p.id);
  for (const c of collections) fresh(c.id);
  for (const a of atts) fresh(a.id);
  // Blobs.
  for (const a of atts) {
    const data = entries.get(a.path);
    if (!data) throw unprocessable('missing_file', `В архиве нет файла ${a.path}`);
    if (sha(data) !== a.blob_sha256) throw unprocessable('integrity', `Контрольная сумма файла ${a.path} не совпадает`);
    const put = await s.store.putBuffer(data);
    await q.query(`insert into blobs (sha256, size, mime, storage_key, verified_at) values ($1, $2, $3, $4, now()) on conflict do nothing`, [put.sha256, put.size, a.mime, put.key]);
  }
  // Pages: parents first.
  const ordered: any[] = [];
  const seen = new Set<string>();
  const byId = new Map(pages.map((p) => [p.id, p]));
  const visit = (p: any) => {
    if (seen.has(p.id)) return;
    if (p.parent_id && byId.has(p.parent_id)) visit(byId.get(p.parent_id));
    seen.add(p.id);
    ordered.push(p);
  };
  pages.forEach(visit);
  const rewrite = (doc: PMNode): PMNode => {
    if (!remap) return doc;
    const d = structuredClone(doc);
    walk(d, (n) => {
      if (n.attrs) {
        const a = { ...n.attrs };
        for (const k of ['pageId', 'sourcePageId', 'attachmentId', 'collectionId']) if (a[k] && idMap.has(a[k])) a[k] = idMap.get(a[k]);
        if (a.src && typeof a.src === 'string') a.src = a.src.replace(/[0-9a-f-]{36}/g, (m: string) => idMap.get(m) ?? m);
        n.attrs = a;
      }
      for (const m of n.marks ?? []) if (m.type === 'link' && m.attrs?.href) m.attrs = { ...m.attrs, href: String(m.attrs.href).replace(/\/p\/([0-9a-f-]{36})/, (_x: string, id: string) => '/p/' + (idMap.get(id) ?? id)) };
    });
    return d;
  };
  // Documents of older schema versions are migrated step by step (packages/shared/src/editor/migrations.ts).
  const schemaVersion = Number(analysis.manifest.contentSchemaVersion ?? 1);
  const upgrade = (c: PMNode) => migrateContent(rewrite(c), schemaVersion).doc;
  for (const p of ordered) {
    const id = map(p.id)!;
    const content = upgrade(JSON.parse(entries.get(`metadata/content/${p.id}.json`)?.toString('utf8') ?? 'null') ?? { type: 'doc', content: [{ type: 'paragraph' }] });
    await q.query(
      `insert into pages (id, org_id, space_id, parent_id, sort_key, title, icon, cover, status, inherit_permissions, locked, wide, properties, owner_id, created_by, updated_by, created_at, review_due_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15, $16, $17)`,
      [id, orgId, map(p.space_id), map(p.parent_id), p.sort_key, p.title, p.icon, p.cover, p.status, p.inherit_permissions, p.locked, p.wide, p.properties ?? {}, um(p.owner_id), um(p.created_by), p.created_at, p.review_due_at],
    );
    await insertAncestors(q, id, map(p.parent_id));
    const update = jsonToUpdate(content, p.title);
    const normalized = updateToJson(update);
    await q.query(`insert into doc_updates (page_id, seq, update, user_id, op_id) values ($1, 1, $2, $3, $4)`, [id, Buffer.from(update), adminUserId, 'restore:' + id]);
    await q.query(`insert into doc_state (page_id, snapshot, snapshot_seq, last_seq, content, plain_text) values ($1, $2, 1, 1, $3, $4)`, [id, Buffer.from(update), normalized, docToPlainText(normalized)]);
    await q.query(`insert into outbox (topic, payload) values ('index-page', $1)`, [{ pageId: id }]);
    // Versions (if present): restored with original numbers; the archive state becomes the newest revision.
    const revs = (j(`metadata/versions/${p.id}.json`) as any[]) ?? [];
    let n = 0;
    for (const r of revs) {
      const rc = upgrade(r.content);
      await q.query(`insert into page_revisions (page_id, number, kind, label, title, state, content, seq_upto, authors, created_by, created_at) values ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10)`, [
        id,
        r.number,
        r.kind,
        r.label,
        r.title,
        Buffer.from(jsonToUpdate(rc, r.title)),
        rc,
        (r.authors ?? []).map((a: string) => um(a)).filter(Boolean),
        um(r.created_by),
        r.created_at,
      ]);
      n = Math.max(n, r.number);
      if (p.published_revision_id === r.id) await q.query('update pages set published_revision_id = (select id from page_revisions where page_id = $1 and number = $2) where id = $1', [id, r.number]);
    }
    await q.query(`insert into page_revisions (page_id, number, kind, label, title, state, content, seq_upto, authors, created_by) values ($1, $2, 'migration', 'Восстановлено из архива', $3, $4, $5, 1, $6, $7)`, [id, n + 1, p.title, Buffer.from(update), normalized, [adminUserId], adminUserId]);
  }
  // Collections and rows.
  for (const c of collections) {
    await q.query(`insert into collections (id, org_id, page_id, name, schema, views, created_by) values ($1, $2, $3, $4, $5, $6, $7)`, [map(c.id), orgId, map(c.page_id), c.name, JSON.stringify(c.schema), JSON.stringify(c.views), adminUserId]);
  }
  for (const p of pages) if (p.collection_id) await q.query('update pages set collection_id = $2 where id = $1', [map(p.id), map(p.collection_id)]);
  // Attachments and versions.
  const attById = new Map<string, any[]>();
  for (const a of atts) attById.set(a.id, [...(attById.get(a.id) ?? []), a]);
  for (const [aid, versions] of attById) {
    const cur = versions.find((v) => v.version === v.current_version) ?? versions[versions.length - 1];
    await q.query(`insert into attachments (id, org_id, page_id, kind, current_version, filename, created_by) values ($1, $2, $3, $4, $5, $6, $7)`, [map(aid), orgId, map(cur.page_id), cur.kind, cur.current_version, cur.filename, adminUserId]);
    for (const v of versions)
      await q.query(`insert into attachment_versions (attachment_id, version, blob_sha256, size, mime, filename, width, height, created_by, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [map(aid), v.version, v.blob_sha256, v.size, v.mime, v.v_filename ?? v.filename, v.width, v.height, adminUserId, v.created_at]);
  }
  // Grants (ACL). Grants to unknown subjects are reported, never widened.
  let restoredGrants = 0;
  const droppedGrants: any[] = [];
  for (const g of grants) {
    const subject = g.subject_type === 'user' ? um(g.subject_id) : g.subject_type === 'group' ? groupMap.get(g.subject_id) ?? null : null;
    // Isolated restore: space grants of the archive would open the target space to their audience — not applied.
    if ((g.subject_type !== 'org' && !subject) || (single && g.resource_type === 'space')) {
      droppedGrants.push(g);
      continue;
    }
    const resource = map(g.resource_id);
    const exists = await q.query(`select 1 from grants where resource_type = $1 and resource_id = $2 and subject_type = $3 and subject_id is not distinct from $4 and revoked_at is null`, [g.resource_type, resource, g.subject_type, subject]);
    if (exists.rowCount) continue;
    await q.query(
      `insert into grants (org_id, resource_type, resource_id, subject_type, subject_id, level, can_export, can_download, can_share, can_publish, starts_at, expires_at, reason, granted_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [orgId, g.resource_type, resource, g.subject_type, subject, g.level, g.can_export, g.can_download, g.can_share, g.can_publish, g.starts_at, g.expires_at, g.reason ?? 'restored from archive', adminUserId],
    );
    restoredGrants++;
  }
  await q.query(`insert into acl_epoch (org_id, epoch) values ($1, 1) on conflict (org_id) do update set epoch = acl_epoch.epoch + 1`, [orgId]);
  await audit(q, actor, { action: 'archive.restore', targetType: single ? 'space' : 'org', targetId: targetSpaceId ?? orgId, details: { manifest: analysis.manifest.counts, target: target.mode, remapped: remap, unresolvedUsers: unresolved.length, droppedGrants: droppedGrants.length } });
  const archivedPages = pages.filter((p) => !p.__folder).length;
  return {
    remapped: remap,
    idMap: Object.fromEntries(idMap),
    unresolvedUsers: unresolved,
    restoredGrants,
    droppedGrants: droppedGrants.length,
    pages: archivedPages,
    attachments: attById.size,
    target: { mode: target.mode, spaceId: targetSpaceId, folders: pages.length - archivedPages },
    /** New parent of each archived root page (single-space modes), for the post-restore verification. */
    rootParents: Object.fromEntries([...rootParent].map(([pid, folder]) => [map(pid)!, map(folder)!])),
  };
}

/** Post-restore verification: counts, tree, links, files (checksums) and ACL compared with the manifest. */
export async function verifyRestore(s: Services, entries: Map<string, Buffer>, idMap: Record<string, string>, rootParents: Record<string, string> = {}) {
  const j = (p: string) => JSON.parse(entries.get(p)!.toString('utf8'));
  const pages = j('metadata/pages.json') as any[];
  const atts = j('metadata/attachments.json') as any[];
  const grants = j('metadata/permissions.json') as any[];
  const m = (id: string) => idMap[id] ?? id;
  const problems: string[] = [];
  const dbPages = (await s.db.query('select id, parent_id, title from pages where id = any($1::uuid[])', [pages.map((p) => m(p.id))])).rows;
  if (dbPages.length !== pages.length) problems.push(`Страниц: ожидалось ${pages.length}, восстановлено ${dbPages.length}`);
  for (const p of pages) {
    const d = dbPages.find((x) => x.id === m(p.id));
    if (d && (d.parent_id ?? null) !== (p.parent_id ? m(p.parent_id) : rootParents[m(p.id)] ?? null)) problems.push(`Нарушена иерархия страницы «${p.title}»`);
    if (d && d.title !== p.title) problems.push(`Название не совпадает: «${p.title}»`);
  }
  let blocks = 0;
  for (const p of pages) {
    const st = (await s.db.query('select content from doc_state where page_id = $1', [m(p.id)])).rows[0];
    if (st) blocks += collectBlocks(st.content).length;
  }
  const manifest = j('manifest.json');
  if (blocks !== manifest.counts.blocks) problems.push(`Блоков: ожидалось ${manifest.counts.blocks}, восстановлено ${blocks}`);
  for (const a of atts) {
    const v = (await s.db.query('select blob_sha256 from attachment_versions where attachment_id = $1 and version = $2', [m(a.id), a.version])).rows[0];
    if (!v) problems.push(`Нет вложения ${a.filename} v${a.version}`);
    else {
      const actual = await s.store.hash(blobKey(v.blob_sha256));
      if (actual !== a.blob_sha256) problems.push(`Контрольная сумма файла ${a.filename} не совпадает`);
    }
  }
  const restoredGrantCount = grants.length ? (await s.db.query('select count(*)::int c from grants where revoked_at is null and resource_id = any($1::uuid[])', [grants.map((g) => m(g.resource_id))])).rows[0].c : 0;
  return { ok: problems.length === 0, problems, checked: { pages: pages.length, blocks, attachments: atts.length, grantsInArchive: grants.length, grantsInDb: restoredGrantCount } };
}

