import sharp from 'sharp';
import { fileTypeFromFile } from 'file-type';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { createReadStream } from 'node:fs';
import { extname } from 'node:path';
import type { Queryable } from '../db/pool.js';
import type { BlobStore } from '../storage/blob-store.js';
import { blobKey } from '../storage/blob-store.js';
import { unprocessable } from '../lib/errors.js';

/** Executables and scripts are refused (SC-33). Archives and documents are fine. */
const BLOCKED_EXT = new Set(['.exe', '.dll', '.com', '.bat', '.cmd', '.msi', '.msp', '.scr', '.pif', '.cpl', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.ps1', '.psm1', '.hta', '.jar', '.app', '.dmg', '.pkg', '.deb', '.rpm', '.sh', '.run', '.apk', '.lnk', '.reg', '.gadget']);
const BLOCKED_MIME = new Set(['application/x-msdownload', 'application/x-dosexec', 'application/x-executable', 'application/x-elf', 'application/x-mach-binary', 'application/vnd.microsoft.portable-executable', 'application/x-sharedlib']);

export const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif', 'image/heic', 'image/heif', 'image/tiff', 'image/bmp']);
/** Formats rendered inline in the browser (others are always downloaded). */
const INLINE_SAFE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml', 'application/pdf', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'text/plain']);

const EXT_MIME: Record<string, string> = {
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.dwg': 'image/vnd.dwg',
  '.dxf': 'image/vnd.dxf',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
};

export function safeFilename(name: string): string {
  const base = name.replace(/[\\/]/g, '_').replace(/[\u0000-\u001F\u007F]/g, '').replace(/^\.+/, '').trim();
  return (base || 'file').slice(0, 255);
}

export interface InspectResult {
  mime: string;
  width: number | null;
  height: number | null;
  kind: 'image' | 'video' | 'file';
}

/** Detects the real type by content (not by the client-provided MIME) and rejects dangerous files. */
export async function inspectFile(path: string, filename: string, declaredMime?: string | null): Promise<InspectResult> {
  const ext = extname(filename).toLowerCase();
  if (BLOCKED_EXT.has(ext)) throw unprocessable('blocked_type', `Файлы типа ${ext} запрещены политикой безопасности`);
  const ft = await fileTypeFromFile(path);
  let mime = ft?.mime ?? EXT_MIME[ext] ?? (declaredMime && !declaredMime.includes('octet') ? declaredMime : 'application/octet-stream');
  if (BLOCKED_MIME.has(mime)) throw unprocessable('blocked_type', 'Исполняемые файлы запрещены политикой безопасности');
  // Executable signatures hidden behind innocent extensions.
  const head = Buffer.alloc(4);
  const fh = await import('node:fs/promises').then((m) => m.open(path, 'r'));
  await fh.read(head, 0, 4, 0);
  await fh.close();
  if (head.subarray(0, 2).toString('latin1') === 'MZ' || head.toString('latin1') === '\x7fELF' || head.readUInt32BE(0) === 0xcffaedfe || head.readUInt32BE(0) === 0xfeedfacf)
    throw unprocessable('blocked_type', 'Обнаружен исполняемый файл — загрузка запрещена');
  if (ext === '.svg' || mime === 'image/svg+xml' || (mime === 'application/xml' && ext === '.svg')) mime = 'image/svg+xml';
  if (ft && EXT_MIME[ext] && ft.mime === 'application/zip' && ['.docx', '.xlsx', '.pptx'].includes(ext)) mime = EXT_MIME[ext];
  let width: number | null = null;
  let height: number | null = null;
  let kind: InspectResult['kind'] = 'file';
  if (IMAGE_MIME.has(mime)) {
    try {
      const meta = await sharp(path, { limitInputPixels: 1_000_000_000 }).metadata();
      const rotated = (meta.orientation ?? 1) >= 5;
      width = (rotated ? meta.height : meta.width) ?? null;
      height = (rotated ? meta.width : meta.height) ?? null;
      kind = 'image';
    } catch {
      if (mime !== 'image/svg+xml') throw unprocessable('corrupt_image', 'Файл изображения повреждён или имеет неподдерживаемый формат');
      kind = 'image';
    }
  } else if (mime.startsWith('video/')) kind = 'video';
  return { mime, width, height, kind };
}

/** Removes scripts, event handlers and external references from SVG before storing it. */
export async function sanitizeSvgFile(path: string) {
  const { Window } = await import('happy-dom');
  const DOMPurify = (await import('dompurify')).default;
  const win = new Window();
  const purify = DOMPurify(win as unknown as Window & typeof globalThis);
  const src = await readFile(path, 'utf8');
  const clean = purify.sanitize(src, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['script', 'foreignObject'], FORBID_ATTR: ['onload', 'onerror', 'onclick'] });
  await writeFile(path, clean.includes('<svg') ? clean : '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await win.happyDOM.close();
}

/** Optional ClamAV scan (clamd INSTREAM). Returns null when clean or scanning is not configured. */
export async function scanForViruses(path: string, host: string | null): Promise<string | null> {
  if (!host) return null;
  const [h, p] = host.split(':');
  return new Promise((resolve, reject) => {
    const sock = createConnection({ host: h, port: Number(p ?? 3310) });
    let reply = '';
    sock.on('data', (d) => (reply += d.toString()));
    sock.on('end', () => resolve(/FOUND/.test(reply) ? reply.replace(/^stream: /, '').trim() : null));
    sock.on('error', reject);
    sock.write('zINSTREAM\0');
    const rs = createReadStream(path, { highWaterMark: 64 * 1024 });
    rs.on('data', (chunk) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE((chunk as Buffer).length);
      sock.write(len);
      sock.write(chunk);
    });
    rs.on('end', () => sock.write(Buffer.from([0, 0, 0, 0])));
    rs.on('error', reject);
  });
}

export function isInlineSafe(mime: string) {
  return INLINE_SAFE.has(mime);
}

export interface StoredAttachment {
  id: string;
  version: number;
  filename: string;
  mime: string;
  size: number;
  sha256: string;
  width: number | null;
  height: number | null;
  kind: string;
}

/** Registers a stored temp file as a blob + attachment version (inside the caller's transaction). */
export async function registerBlob(q: Queryable, store: BlobStore, tmpPath: string, info: InspectResult): Promise<{ sha256: string; size: number }> {
  const put = await store.putFile(tmpPath);
  await q.query(`insert into blobs (sha256, size, mime, storage_key, verified_at) values ($1, $2, $3, $4, now()) on conflict (sha256) do nothing`, [put.sha256, put.size, info.mime, put.key]);
  return { sha256: put.sha256, size: put.size };
}

export async function createAttachment(
  q: Queryable,
  args: { orgId: string; pageId: string | null; userId: string; filename: string; sha256: string; size: number; info: InspectResult; kind?: string },
): Promise<StoredAttachment> {
  const kind = args.kind ?? (args.info.kind === 'image' ? 'image' : args.info.kind === 'video' ? 'video' : 'file');
  const a = (await q.query(`insert into attachments (org_id, page_id, kind, filename, created_by) values ($1, $2, $3, $4, $5) returning id`, [args.orgId, args.pageId, kind, args.filename, args.userId])).rows[0];
  await q.query(
    `insert into attachment_versions (attachment_id, version, blob_sha256, size, mime, filename, width, height, created_by) values ($1, 1, $2, $3, $4, $5, $6, $7, $8)`,
    [a.id, args.sha256, args.size, args.info.mime, args.filename, args.info.width, args.info.height, args.userId],
  );
  return { id: a.id, version: 1, filename: args.filename, mime: args.info.mime, size: args.size, sha256: args.sha256, width: args.info.width, height: args.info.height, kind };
}

export const derivedKey = (sha: string, kind: string) => `derived/${sha.slice(0, 2)}/${sha}/${kind}`;

/** Thumbnail (max 512) and preview (max 2048) in WebP with EXIF orientation applied. The original is never altered. */
export async function makeImageDerivatives(q: Queryable, store: BlobStore, sha: string, mime: string) {
  if (!IMAGE_MIME.has(mime) || mime === 'image/svg+xml') return;
  const src = await store.readBuffer(blobKey(sha));
  for (const [kind, size] of [['thumb', 512], ['preview', 2048]] as const) {
    try {
      const out = await sharp(src, { limitInputPixels: 1_000_000_000 })
        .rotate()
        .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: kind === 'thumb' ? 75 : 85 })
        .toBuffer({ resolveWithObject: true });
      await store.putDerived(derivedKey(sha, kind), out.data);
      await q.query(`insert into blob_derivatives (blob_sha256, kind, storage_key, meta) values ($1, $2, $3, $4) on conflict (blob_sha256, kind) do update set storage_key = excluded.storage_key, meta = excluded.meta`, [
        sha,
        kind,
        derivedKey(sha, kind),
        { width: out.info.width, height: out.info.height, mime: 'image/webp' },
      ]);
    } catch {
      /* derivative failure must not block the upload; original stays available */
    }
  }
}

/**
 * Deep-zoom tile pyramid for large images (engineering drawings), generated by libvips in streaming mode
 * (no full decode into memory). Layout: derived/<sha>/tiles/<level>/<col>_<row>.<ext>, 512 px, no overlap.
 */
export async function makeTiles(q: Queryable, store: BlobStore, sha: string, mime: string): Promise<{ levels: number; width: number; height: number; tileSize: number; format: string } | null> {
  const { mkdtemp, readdir } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const work = await mkdtemp(join(tmpdir(), 'kb-tiles-'));
  try {
    const srcPath = join(work, 'src');
    await writeFile(srcPath, await store.readBuffer(blobKey(sha)));
    const meta = await sharp(srcPath, { limitInputPixels: 2_000_000_000 }).metadata();
    const rotated = (meta.orientation ?? 1) >= 5;
    const width = (rotated ? meta.height : meta.width) ?? 0;
    const height = (rotated ? meta.width : meta.height) ?? 0;
    if (Math.max(width, height) <= 4096) return null;
    const tileSize = 512;
    const format = mime === 'image/png' || meta.hasAlpha ? 'png' : 'jpeg';
    await sharp(srcPath, { limitInputPixels: 2_000_000_000, sequentialRead: true })
      .rotate()
      .toFormat(format, format === 'png' ? { compressionLevel: 6 } : { quality: 85 })
      .tile({ size: tileSize, overlap: 0, layout: 'dz', container: 'fs' })
      .toFile(join(work, 'out'));
    const filesDir = join(work, 'out_files');
    const levels = (await readdir(filesDir)).map(Number).filter((n) => Number.isFinite(n));
    for (const level of levels) {
      for (const f of await readdir(join(filesDir, String(level)))) {
        const ext = f.endsWith('.png') ? 'png' : 'jpg';
        const name = f.replace(/\.(jpeg|jpg|png)$/, '');
        await store.putDerived(`${derivedKey(sha, 'tiles')}/${level}/${name}.${ext}`, await readFile(join(filesDir, String(level), f)));
      }
    }
    const info = { levels: Math.max(...levels), width, height, tileSize, format };
    await q.query(`insert into blob_derivatives (blob_sha256, kind, storage_key, meta) values ($1, 'tiles', $2, $3) on conflict (blob_sha256, kind) do update set meta = excluded.meta`, [sha, derivedKey(sha, 'tiles'), info]);
    return info;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export async function removeTemp(path: string) {
  await rm(path, { force: true });
}
