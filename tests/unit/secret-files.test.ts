import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadSecretFiles, SECRET_ENV_VARS, SecretFileError } from '../../apps/server/src/lib/secret-files.js';

// Secrets-manager integration (R-OPS-003, R-OPS-022): <VAR>_FILE for every secret variable of the server and of the
// backup scripts; values never appear in error messages.

let dir: string;
const secret = 'kHq9-very-secret-value-Zx81-' + Math.random().toString(36).slice(2);
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'kb-secrets-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function file(name: string, content: string) {
  const p = join(dir, name);
  writeFileSync(p, content, { mode: 0o400 });
  return p;
}

describe('server: <VAR>_FILE (R-OPS-003, R-OPS-022)', () => {
  it('every secret variable can come from a file; one trailing newline (Vault Agent template, echo) is dropped (R-OPS-003)', () => {
    for (const name of SECRET_ENV_VARS) {
      const env: NodeJS.ProcessEnv = { [`${name}_FILE`]: file(`${name}.txt`, secret + '\n') };
      expect(loadSecretFiles(env)).toEqual([name]);
      expect(env[name]).toBe(secret);
    }
    const crlf: NodeJS.ProcessEnv = { SECRET_KEY_FILE: file('crlf', secret + '\r\n') };
    loadSecretFiles(crlf);
    expect(crlf.SECRET_KEY).toBe(secret);
    // inner whitespace and a second newline are part of the value (no silent trimming of real content)
    const two: NodeJS.ProcessEnv = { OTEL_EXPORTER_OTLP_HEADERS_FILE: file('two', 'a=b\n\n') };
    loadSecretFiles(two);
    expect(two.OTEL_EXPORTER_OTLP_HEADERS).toBe('a=b\n');
  });

  it('is idempotent (loadConfig may run more than once) but refuses two different sources (R-OPS-022)', () => {
    const env: NodeJS.ProcessEnv = { SECRET_KEY_FILE: file('idem', secret) };
    loadSecretFiles(env);
    expect(() => loadSecretFiles(env)).not.toThrow();
    const both: NodeJS.ProcessEnv = { SECRET_KEY: 'other-value-0123456789-0123456789', SECRET_KEY_FILE: file('both', secret) };
    expect(() => loadSecretFiles(both)).toThrow(/both SECRET_KEY and SECRET_KEY_FILE/);
  });

  it('missing, empty or oversized files fail loudly, and the message never contains the secret (R-OPS-022)', () => {
    const errs: string[] = [];
    for (const env of [{ SECRET_KEY_FILE: join(dir, 'nope') }, { SECRET_KEY_FILE: file('empty', '\n') }, { SECRET_KEY_FILE: file('big', secret.repeat(5000)) }, { SECRET_KEY: 'x'.repeat(40), SECRET_KEY_FILE: file('conflict', secret) }] as NodeJS.ProcessEnv[]) {
      try {
        loadSecretFiles(env);
        errs.push('no error');
      } catch (e) {
        expect(e).toBeInstanceOf(SecretFileError);
        errs.push((e as Error).message);
      }
    }
    expect(errs).toHaveLength(4);
    expect(errs[0]).toMatch(/SECRET_KEY_FILE: cannot read .*nope \(ENOENT\)/);
    expect(errs[1]).toMatch(/is empty/);
    expect(errs[2]).toMatch(/larger than/);
    for (const m of errs) expect(m).not.toContain(secret);
  });

  it('variables that are not secrets are not touched by *_FILE (BACKUP_METRICS_FILE etc. keep their meaning)', () => {
    const env: NodeJS.ProcessEnv = { LOG_LEVEL_FILE: file('lvl', 'debug'), BACKUP_METRICS: 'x' };
    expect(loadSecretFiles(env)).toEqual([]);
    expect(env.LOG_LEVEL).toBeUndefined();
  });
});

describe('backup scripts: file_env in scripts/backup/lib.sh (R-OPS-003)', () => {
  const run = (env: Record<string, string>, script: string) => {
    try {
      return { code: 0, out: execFileSync('bash', ['-c', `source scripts/backup/lib.sh; ${script}`], { env: { PATH: process.env.PATH!, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
    } catch (e: any) {
      return { code: e.status as number, out: String(e.stdout) + String(e.stderr) };
    }
  };
  it('DATABASE_URL_FILE / BACKUP_DATABASE_URL_FILE / AWS_SECRET_ACCESS_KEY_FILE / KB_BACKUP_PASSPHRASE_FILE are resolved and exported', () => {
    const url = `postgres://kb_backup:${secret}@db:5432/kb`;
    const r = run({ BACKUP_DATABASE_URL_FILE: file('bdb', url + '\n'), AWS_SECRET_ACCESS_KEY_FILE: file('aws', secret), KB_BACKUP_PASSPHRASE_FILE: file('pp', secret) }, 'bash -c \'[[ "$BACKUP_DATABASE_URL" == postgres://kb_backup:* && "$AWS_SECRET_ACCESS_KEY" == "$KB_BACKUP_PASSPHRASE" ]] && echo exported\'; redact_url "$BACKUP_DATABASE_URL"');
    expect(r.code).toBe(0);
    expect(r.out).toContain('exported');
    expect(r.out).toContain('postgres://kb_backup:***@db:5432/kb');
    expect(r.out).not.toContain(secret);
  });
  it('an unreadable file or two different sources stop the script without printing the value', () => {
    const missing = run({ DATABASE_URL_FILE: join(dir, 'absent') }, 'echo unreachable');
    expect(missing.code).not.toBe(0);
    expect(missing.out).toMatch(/DATABASE_URL_FILE: cannot read/);
    const both = run({ DATABASE_URL: 'postgres://a', DATABASE_URL_FILE: file('both2', secret) }, 'echo unreachable');
    expect(both.code).not.toBe(0);
    expect(both.out).toMatch(/both DATABASE_URL and DATABASE_URL_FILE/);
    expect(both.out + missing.out).not.toContain(secret);
    expect(both.out + missing.out).not.toContain('unreachable');
  });
});
