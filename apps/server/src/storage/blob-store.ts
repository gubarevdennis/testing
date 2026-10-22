import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, rename, rm, stat, readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import type { Config } from '../config.js';

export interface PutResult {
  sha256: string;
  size: number;
  key: string;
}

/** Object storage for originals and derivatives. Objects are immutable and content-addressed (sha256). */
export interface BlobStore {
  readonly kind: string;
  tmpDir(): string;
  /** Moves a fully written temp file into the store (verifies its hash). */
  putFile(tmpPath: string): Promise<PutResult>;
  putBuffer(buf: Buffer): Promise<PutResult>;
  /** Writes a derived object under an explicit key (thumbnails, tiles). */
  putDerived(key: string, buf: Buffer): Promise<void>;
  read(key: string, range?: { start: number; end: number }): Promise<Readable>;
  readBuffer(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  size(key: string): Promise<number | null>;
  remove(key: string): Promise<void>;
  /** Recomputes sha256 of a stored object. */
  hash(key: string): Promise<string>;
  list(prefix: string): AsyncIterable<string>;
  healthCheck(): Promise<void>;
}

export const blobKey = (sha256: string) => `blobs/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}`;

export function hashingStream() {
  const h = createHash('sha256');
  let size = 0;
  const t = new Transform({
    transform(chunk, _enc, cb) {
      h.update(chunk);
      size += chunk.length;
      cb(null, chunk);
    },
  });
  return { stream: t, digest: () => ({ sha256: h.digest('hex'), size }) };
}

export class FsBlobStore implements BlobStore {
  readonly kind = 'fs';
  constructor(private root: string) {}

  tmpDir() {
    return join(this.root, 'tmp');
  }

  private path(key: string) {
    if (key.includes('..') || key.startsWith('/')) throw new Error('invalid key');
    return join(this.root, key);
  }

  async init() {
    await mkdir(this.tmpDir(), { recursive: true });
    await mkdir(join(this.root, 'blobs'), { recursive: true });
  }

  async putFile(tmpPath: string): Promise<PutResult> {
    const h = createHash('sha256');
    let size = 0;
    for await (const chunk of createReadStream(tmpPath)) {
      h.update(chunk as Buffer);
      size += (chunk as Buffer).length;
    }
    const sha256 = h.digest('hex');
    const key = blobKey(sha256);
    const dest = this.path(key);
    await mkdir(dirname(dest), { recursive: true });
    if (await this.exists(key)) {
      await rm(tmpPath, { force: true });
    } else {
      const fh = await open(tmpPath, 'r+');
      await fh.sync(); // durable before it becomes visible
      await fh.close();
      await rename(tmpPath, dest);
      await fsyncDir(dirname(dest));
    }
    return { sha256, size, key };
  }

  async putBuffer(buf: Buffer): Promise<PutResult> {
    const tmp = join(this.tmpDir(), randomUUID());
    await mkdir(this.tmpDir(), { recursive: true });
    await writeFile(tmp, buf);
    return this.putFile(tmp);
  }

  async putDerived(key: string, buf: Buffer) {
    const dest = this.path(key);
    await mkdir(dirname(dest), { recursive: true });
    const tmp = dest + '.' + randomUUID() + '.tmp';
    await writeFile(tmp, buf);
    await rename(tmp, dest);
  }

  async read(key: string, range?: { start: number; end: number }) {
    return createReadStream(this.path(key), range ? { start: range.start, end: range.end } : undefined);
  }

  async readBuffer(key: string) {
    return readFile(this.path(key));
  }

  async exists(key: string) {
    try {
      await stat(this.path(key));
      return true;
    } catch {
      return false;
    }
  }

  async size(key: string) {
    try {
      return (await stat(this.path(key))).size;
    } catch {
      return null;
    }
  }

  async remove(key: string) {
    await rm(this.path(key), { force: true, recursive: true });
  }

  async hash(key: string) {
    const h = createHash('sha256');
    for await (const c of createReadStream(this.path(key))) h.update(c as Buffer);
    return h.digest('hex');
  }

  async *list(prefix: string): AsyncIterable<string> {
    const base = this.path(prefix);
    const walk = async function* (dir: string, rel: string): AsyncIterable<string> {
      let entries: import('node:fs').Dirent[];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.isDirectory()) yield* walk(join(dir, e.name), rel + e.name + '/');
        else yield rel + e.name;
      }
    };
    yield* walk(base, prefix.endsWith('/') ? prefix : prefix + '/');
  }

  async healthCheck() {
    const probe = join(this.tmpDir(), '.health-' + randomUUID());
    await writeFile(probe, 'ok');
    await rm(probe);
  }
}

async function fsyncDir(dir: string) {
  try {
    const fh = await open(dir, 'r');
    await fh.sync();
    await fh.close();
  } catch {
    /* not supported on all platforms */
  }
}

export async function createBlobStore(cfg: Config): Promise<BlobStore> {
  if (cfg.storage.driver === 's3') {
    const { S3BlobStore } = await import('./s3-store.js');
    const s = new S3BlobStore(cfg.storage.s3!, cfg.storage.root);
    await mkdir(s.tmpDir(), { recursive: true });
    return s;
  }
  const s = new FsBlobStore(cfg.storage.root);
  await s.init();
  return s;
}

/** Stream helper: writes an incoming stream to a temp file while hashing; enforces a size limit. */
export async function streamToTemp(store: BlobStore, src: Readable, maxBytes: number): Promise<{ path: string; sha256: string; size: number }> {
  await mkdir(store.tmpDir(), { recursive: true });
  const path = join(store.tmpDir(), randomUUID());
  const h = createHash('sha256');
  let size = 0;
  const limiter = new Transform({
    transform(chunk, _e, cb) {
      size += chunk.length;
      if (size > maxBytes) return cb(Object.assign(new Error('Файл превышает допустимый размер'), { code: 'TOO_LARGE' }));
      h.update(chunk);
      cb(null, chunk);
    },
  });
  try {
    await pipeline(src, limiter, createWriteStream(path));
  } catch (e) {
    await rm(path, { force: true });
    throw e;
  }
  return { path, sha256: h.digest('hex'), size };
}
