import { createHash } from "node:crypto";
import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadBucketCommand } from '@aws-sdk/client-s3';
import { blobKey, type BlobStore, type PutResult } from './blob-store.js';

/** S3-compatible store (MinIO, Ceph, AWS). Enable bucket versioning + object lock on the bucket for ransomware protection. */
export class S3BlobStore implements BlobStore {
  readonly kind = 's3';
  private client: S3Client;
  constructor(
    private cfg: { endpoint?: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean },
    private tmpRoot: string,
  ) {
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }
  tmpDir() {
    return this.tmpRoot;
  }
  async putFile(tmpPath: string): Promise<PutResult> {
    const h = createHash('sha256');
    for await (const c of createReadStream(tmpPath)) h.update(c as Buffer);
    const sha256 = h.digest('hex');
    const size = (await stat(tmpPath)).size;
    const key = blobKey(sha256);
    if (!(await this.exists(key))) {
      await this.client.send(
        new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: createReadStream(tmpPath), ContentLength: size, ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64') }),
      );
    }
    await rm(tmpPath, { force: true });
    return { sha256, size, key };
  }
  async putBuffer(buf: Buffer): Promise<PutResult> {
    const sha256 = createHash('sha256').update(buf).digest('hex');
    const key = blobKey(sha256);
    if (!(await this.exists(key))) await this.client.send(new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: buf, ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64') }));
    return { sha256, size: buf.length, key };
  }
  async putDerived(key: string, buf: Buffer) {
    await this.client.send(new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: buf }));
  }
  async read(key: string, range?: { start: number; end: number }) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key, Range: range ? `bytes=${range.start}-${range.end}` : undefined }));
    return r.Body as Readable;
  }
  async readBuffer(key: string) {
    const chunks: Buffer[] = [];
    for await (const c of await this.read(key)) chunks.push(c as Buffer);
    return Buffer.concat(chunks);
  }
  async exists(key: string) {
    return (await this.size(key)) !== null;
  }
  async size(key: string) {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
      return r.ContentLength ?? 0;
    } catch {
      return null;
    }
  }
  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }
  async hash(key: string) {
    const h = createHash('sha256');
    for await (const c of await this.read(key)) h.update(c as Buffer);
    return h.digest('hex');
  }
  async *list(prefix: string): AsyncIterable<string> {
    let token: string | undefined;
    do {
      const r = await this.client.send(new ListObjectsV2Command({ Bucket: this.cfg.bucket, Prefix: prefix, ContinuationToken: token }));
      for (const o of r.Contents ?? []) if (o.Key) yield o.Key;
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
  }
  async healthCheck() {
    await this.client.send(new HeadBucketCommand({ Bucket: this.cfg.bucket }));
  }
}

