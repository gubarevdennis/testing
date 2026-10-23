import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile, readFile, stat, appendFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { REPO_ROOT } from '../support/process-server.js';

// Rule 3-2-1 copy to a second medium (R-BACKUP-012, R-BACKUP-003, R-BACKUP-006): scripts/backup/offsite-sync.sh is add-only,
// refuses to ship plaintext, verifies every copy at the destination and never overwrites a file that differs.

const run = promisify(execFile);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
let dir = '';

async function offsite(repo: string, target: string, env: Record<string, string> = {}) {
  try {
    const r = await run('bash', [join(REPO_ROOT, 'scripts/backup/offsite-sync.sh'), '--target', target], { env: { ...process.env, BACKUP_DIR: repo, ...env } });
    return { code: 0, out: r.stdout, err: r.stderr };
  } catch (e: any) {
    return { code: e.code as number, out: String(e.stdout), err: String(e.stderr) };
  }
}

/** A repository shaped like backup.sh + basebackup.sh + wal-archive.sh output (contents are opaque to the copy). */
async function fakeRepo(root: string, encrypted: boolean) {
  const sfx = encrypted ? '.enc' : '';
  const b = join(root, 'kb-20261023T021500Z');
  await mkdir(b, { recursive: true });
  await writeFile(join(b, `db.dump${sfx}`), randomBytes(5000));
  await writeFile(join(b, 'manifest.json'), '{}');
  await writeFile(join(b, 'objects.list'), '');
  await run('bash', ['-c', `cd ${b} && sha256sum db.dump${sfx} manifest.json objects.list > SHA256SUMS`]);
  const obj = randomBytes(3000);
  const h = sha(obj);
  await mkdir(join(root, 'objects', h.slice(0, 2)), { recursive: true });
  await writeFile(join(root, 'objects', h.slice(0, 2), h + sfx), obj);
  await writeFile(join(root, 'objects', 'index.log'), `${h} 3000 blobs/${h.slice(0, 2)}/${h.slice(2, 4)}/${h}\n`);
  await mkdir(join(root, 'wal'), { recursive: true });
  await writeFile(join(root, 'wal', `000000010000000000000003${sfx}`), randomBytes(4000));
  await writeFile(join(root, 'wal', '000000010000000000000003.sha256'), 'x');
  await writeFile(join(root, 'wal', '000000010000000000000004.part.123'), 'in progress');
  await mkdir(join(root, 'kb-20261023T031500Z.partial'), { recursive: true });
  await writeFile(join(root, 'kb-20261023T031500Z.partial', 'db.dump.enc'), 'partial');
  return { backup: b, objectKey: join('objects', h.slice(0, 2), h + sfx) };
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kb-offsite-'));
});
afterAll(async () => {
  await run('chmod', ['-R', 'u+w', dir]).catch(() => undefined);
  await rm(dir, { recursive: true, force: true });
});

describe('offsite copy to a second medium (R-BACKUP-012)', () => {
  it('refuses to ship unencrypted backups off the site (R-BACKUP-012, R-BACKUP-006)', async () => {
    const repo = join(dir, 'plain');
    await fakeRepo(repo, false);
    const r = await offsite(repo, join(dir, 'plain-target'), { WAL_ARCHIVE_DIR: join(repo, 'wal') });
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/unencrypted data would leave the site/);
    expect(existsSync(join(dir, 'plain-target', 'kb-20261023T021500Z'))).toBe(false);
  });

  it('copies add-only and read-only, verifies SHA256SUMS at the destination, survives deletion at the source and detects tampering (R-BACKUP-012, R-BACKUP-003)', async () => {
    const repo = join(dir, 'enc');
    const target = join(dir, 'target');
    const { objectKey } = await fakeRepo(repo, true);
    const first = await offsite(repo, target, { WAL_ARCHIVE_DIR: join(repo, 'wal'), BACKUP_METRICS_FILE: join(dir, 'm', 'kb_backup.prom') });
    expect(first.code, first.err).toBe(0);
    expect(JSON.parse(first.out.trim().split('\n').pop()!).copied).toBe(7);
    expect(await readFile(join(target, objectKey))).toEqual(await readFile(join(repo, objectKey)));
    expect((await stat(join(target, objectKey))).mode & 0o222).toBe(0); // read-only at the destination
    expect(existsSync(join(target, 'wal', '000000010000000000000004.part.123'))).toBe(false); // in-progress files never shipped
    expect(existsSync(join(target, 'kb-20261023T031500Z.partial'))).toBe(false);
    expect(await readFile(join(dir, 'm', 'kb_backup-offsite.prom'), 'utf8')).toMatch(/^kb_backup_offsite_last_success_timestamp_seconds \d+$/m);
    expect(await readFile(join(target, '.offsite', 'sync.log'), 'utf8')).toMatch(/verifiedBackups=1/);

    // Second run: nothing new to copy. Deleting the local repository (ransomware, operator error) does not propagate.
    expect(JSON.parse((await offsite(repo, target)).out.trim().split('\n').pop()!).copied).toBe(0);
    await rm(join(repo, 'kb-20261023T021500Z'), { recursive: true });
    expect((await offsite(repo, target)).code).toBe(0);
    expect(existsSync(join(target, 'kb-20261023T021500Z', 'SHA256SUMS'))).toBe(true);

    // A local file whose size differs from the copy (damage or tampering on either side) stops the sync; the copy is kept.
    const before = await readFile(join(target, objectKey));
    await chmod(join(repo, objectKey), 0o644);
    await appendFile(join(repo, objectKey), 'tampered');
    const t = await offsite(repo, target);
    expect(t.code).toBe(1);
    expect(t.err).toMatch(/INTEGRITY/);
    expect(await readFile(join(target, objectKey))).toEqual(before);

    // index.log is append-only: a destination copy that is not a prefix of the local one is refused.
    await rm(join(repo, objectKey));
    await writeFile(join(repo, 'objects', 'index.log'), 'rewritten history\n');
    const ix = await offsite(repo, target);
    expect(ix.code).toBe(1);
    expect(ix.err).toMatch(/not a prefix/);
  });
});
