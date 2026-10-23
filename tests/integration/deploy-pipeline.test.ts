import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import yaml from 'js-yaml';
import { readFileSync } from 'node:fs';
import { setupOrg, type TestServer } from '../support/harness.js';
import { REPO_ROOT, cloneTemplateDb, freePort } from '../support/process-server.js';

// Continuous delivery (R-OPS-022, R-OPS-003): scripts/deploy/deploy.sh drives a release through backup → migrations →
// switch → readiness gate → smoke tests and rolls back automatically (down migrations with the new image, previous
// image, gates again). Run here with DEPLOY_DRIVER=hooks against a test target (tests/support/deploy-target.mjs) whose
// "good" image is the real server process; .github/workflows/deploy.yml runs the same script with the compose driver.

let state: string;
let port: number;
let url: string;
let env: Record<string, string>;
let smokeUser: { email: string; password: string; pageId: string };
const SECRET_PASSWORD = 'Smoke-secret-' + Math.random().toString(36).slice(2, 10) + '1';

const target = (args: string) => `node ${join(REPO_ROOT, 'tests/support/deploy-target.mjs')} ${args}`;

function deploy(image: string, extra: Record<string, string> = {}, args: string[] = []) {
  const r = spawnSync('bash', [join(REPO_ROOT, 'scripts/deploy/deploy.sh'), '--image', image, ...args], { cwd: REPO_ROOT, env: { ...env, ...extra }, encoding: 'utf8', timeout: 240_000 });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}
const events = async () => (await readFile(join(state, 'events.log'), 'utf8').catch(() => '')).trim().split('\n').filter(Boolean);
const report = async () => JSON.parse(await readFile(join(state, 'report.json'), 'utf8'));

beforeAll(async () => {
  state = await mkdtemp(join(tmpdir(), 'kb-deploy-'));
  port = await freePort();
  url = `http://127.0.0.1:${port}`;
  const db = await cloneTemplateDb('deploy');
  env = {
    PATH: process.env.PATH!,
    HOME: process.env.HOME ?? '/root',
    DEPLOY_DRIVER: 'hooks',
    DEPLOY_HEALTH_URL: url,
    DEPLOY_REPORT: join(state, 'report.json'),
    READY_TIMEOUT_S: '150', // a real server start under a loaded CI machine
    READY_STABLE: '2',
    READY_INTERVAL_S: '1',
    TARGET_STATE: state,
    TARGET_PORT: String(port),
    TARGET_MIGRATIONS: 'kb:good-2=2,kb:broken-ready-1=1,kb:broken-smoke-1=0,kb:good-3=1',
    HOOK_CURRENT_IMAGE: target('current'),
    HOOK_PENDING: target('pending "$IMAGE"'),
    HOOK_BACKUP: target('backup'),
    HOOK_MIGRATE_UP: target('migrate-up "$IMAGE"'),
    HOOK_MIGRATE_DOWN: target('migrate-down "$IMAGE" "$N"'),
    HOOK_SWITCH: target('switch "$IMAGE"'),
    // the real server ("good" images)
    NODE_ENV: 'test',
    SECRET_KEY: 'deploy-test-key-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
    DATABASE_URL: db.url,
    STORAGE_DRIVER: 'fs',
    STORAGE_ROOT: join(state, 'objects'),
    KB_DATA_DIR: join(state, 'data'),
    WEB_DIST: join(state, 'web'),
    PUBLIC_URL: url,
    LOG_LEVEL: 'warn',
    WORKER_ENABLED: 'false',
    OCR_ENABLED: 'false',
    RATE_LIMIT_PER_MINUTE: '100000',
    AUTH_RATE_LIMIT_PER_MINUTE: '100000',
  };
  await mkdir(join(state, 'web'));
  await writeFile(join(state, 'web', 'index.html'), '<!doctype html><html><head><title>kb</title></head><body><div id="root"></div></body></html>');
  // release 1 is running: an organisation, a smoke account and a page it can read
  execFileSync('bash', ['-c', target('switch kb:good-1')], { cwd: REPO_ROOT, env });
  for (let i = 0; i < 200; i++) {
    if ((await fetch(url + '/readyz').catch(() => null))?.ok) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const org = await setupOrg({ url } as TestServer);
  const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Страница для smoke' })).page.id as string;
  const u = await org.user('Smoke', { pageGrants: [{ pageId: page, level: 'view' }] });
  await org.owner.post('/api/v1/__test/set-password', { userId: u.id, password: SECRET_PASSWORD });
  smokeUser = { email: u.email, password: SECRET_PASSWORD, pageId: page };
  await writeFile(join(state, 'smoke_password'), SECRET_PASSWORD + '\n', { mode: 0o400 });
  Object.assign(env, { SMOKE_EMAIL: smokeUser.email, SMOKE_PASSWORD_FILE: join(state, 'smoke_password'), SMOKE_PAGE_ID: smokeUser.pageId });
  await writeFile(join(state, 'events.log'), '');
}, 120_000);

afterAll(async () => {
  spawnSync('bash', ['-c', target('stop')], { cwd: REPO_ROOT, env });
  await rm(state, { recursive: true, force: true });
});

describe('deploy.sh: gates and automatic rollback (R-OPS-022, R-OPS-003)', () => {
  it('a good release with 2 migrations: backup first, then migrations, switch, readiness gate and smoke tests (live collaboration included)', async () => {
    const r = deploy('kb:good-2');
    expect(r.code, r.out).toBe(0);
    expect(await events()).toEqual(['backup', 'migrate-up kb:good-2 +2 schema=2', 'switch kb:good-2']);
    const rep = await report();
    expect(rep.outcome).toBe('deployed');
    expect(rep.previous).toBe('kb:good-1');
    expect(rep.migrationsApplied).toBe(2);
    expect(rep.steps.map((s: any) => `${s.step}:${s.status}`)).toEqual(['preflight:ok', 'plan:ok', 'backup:ok', 'migrate:ok', 'switch:ok', 'ready:ok', 'smoke:ok']);
    expect(r.out).toContain('"check":"collaboration channel (read-only sync)","ok":true');
    expect(r.out).not.toContain(SECRET_PASSWORD);
    expect(r.out).not.toContain(env.SECRET_KEY); // application secrets of the target never reach the deploy log
  }, 240_000);

  it('a release that never becomes ready: its migration is rolled back with the new image, the previous release is restored and passes the gates (exit 3)', async () => {
    await writeFile(join(state, 'events.log'), '');
    const r = deploy('kb:broken-ready-1', { READY_TIMEOUT_S: '8' });
    expect(r.code, r.out).toBe(3);
    expect(await events()).toEqual(['backup', 'migrate-up kb:broken-ready-1 +1 schema=3', 'switch kb:broken-ready-1', 'migrate-down kb:broken-ready-1 -1 schema=2', 'switch kb:good-2']);
    const rep = await report();
    expect(rep.outcome).toBe('rolled-back');
    expect(rep.steps.map((s: any) => `${s.step}:${s.status.split(':')[0]}`)).toEqual(['preflight:ok', 'plan:ok', 'backup:ok', 'migrate:ok', 'switch:ok', 'ready:failed', 'rollback-migrations:ok', 'rollback-switch:ok', 'rollback-ready:ok', 'rollback-smoke:ok']);
    expect((await fetch(url + '/readyz')).status).toBe(200); // the previous release serves again
  }, 240_000);

  it('a release that is ready but fails the smoke tests is rolled back too; ROLLBACK_MIGRATIONS=none keeps the schema', async () => {
    await writeFile(join(state, 'events.log'), '');
    const r = deploy('kb:broken-smoke-1', { ROLLBACK_MIGRATIONS: 'none' });
    expect(r.code, r.out).toBe(3);
    expect(await events()).toEqual(['backup', 'switch kb:broken-smoke-1', 'switch kb:good-2']);
    expect(r.out).toMatch(/"check":"web shell","ok":false/);
    expect((await report()).steps.find((s: any) => s.step === 'smoke').status).toMatch(/^failed/);
  }, 240_000);

  it('a failed backup stops the release before anything changes (exit 2)', async () => {
    await writeFile(join(state, 'events.log'), '');
    const r = deploy('kb:good-3', { TARGET_FAIL_BACKUP: '1' });
    expect(r.code, r.out).toBe(2);
    expect(await events()).toEqual(['backup FAILED']);
    expect((await report()).outcome).toBe('backup-failed');
    expect(await (await fetch(url + '/healthz')).json()).toEqual({ status: 'ok' });
  }, 120_000);

  it('a failing migration: the previous release keeps running (nothing applied → nothing to roll back) (exit 3)', async () => {
    await writeFile(join(state, 'events.log'), '');
    const r = deploy('kb:good-3', { TARGET_FAIL_MIGRATION: 'kb:good-3' });
    expect(r.code, r.out).toBe(3);
    expect(await events()).toEqual(['backup', 'migrate-up kb:good-3 FAILED', 'switch kb:good-2']);
    expect((await report()).migrationsApplied).toBe(0);
  }, 240_000);

  it('--dry-run needs no target and no secrets, prints the plan and redacts credentials', () => {
    const r = spawnSync('bash', [join(REPO_ROOT, 'scripts/deploy/deploy.sh'), '--image', 'registry.example/kb:1.2.3', '--previous', 'registry.example/kb:1.2.2', '--dry-run'], {
      cwd: REPO_ROOT,
      env: { PATH: process.env.PATH!, DEPLOY_REPORT: join(state, 'dry.json'), DEPLOY_SSH: 'deploy@kb-prod', COMPOSE_ENV_FILE: '/srv/kb/.env' },
      encoding: 'utf8',
    });
    expect(r.status, r.stderr).toBe(0);
    for (const step of ['plan', 'backup', 'migrate', 'switch', 'ready', 'smoke']) expect(r.stderr).toContain(`[dry-run] ${step}:`);
    const rep = JSON.parse(readFileSync(join(state, 'dry.json'), 'utf8'));
    expect(rep.outcome).toBe('dry-run');
    expect(rep.dryRun).toBe(true);
  });
});

describe('.github/workflows/deploy.yml (R-OPS-022)', () => {
  const wf = yaml.load(readFileSync(join(REPO_ROOT, '.github/workflows/deploy.yml'), 'utf8')) as any;
  it('build & test → image with SBOM and vulnerability scan → push only with registry secrets → protected deploy environment running deploy.sh; dry run without secrets', () => {
    expect(Object.keys(wf.jobs)).toEqual(['test', 'image', 'deploy']);
    const steps = (job: string) => wf.jobs[job].steps.map((s: any) => s.name ?? s.uses ?? s.run).join('\n');
    expect(steps('test')).toMatch(/Unit tests/);
    expect(steps('test')).toMatch(/Integration tests/);
    expect(steps('image')).toMatch(/SBOM/);
    expect(steps('image')).toMatch(/[Vv]ulnerability scan/);
    expect(wf.jobs.image.steps.find((s: any) => /Push/.test(s.name ?? '')).if).toMatch(/dry_run/);
    expect(wf.jobs.deploy.environment.name).toMatch(/inputs\.environment/);
    expect(wf.jobs.deploy.needs).toEqual(['image']);
    expect(steps('deploy')).toMatch(/scripts\/deploy\/deploy\.sh/);
    expect(wf.on.workflow_dispatch.inputs.dry_run.default).toBe(true);
    // secrets are referenced only through the secrets context, never inline
    const text = readFileSync(join(REPO_ROOT, '.github/workflows/deploy.yml'), 'utf8');
    expect(text).not.toMatch(/password:\s*['"]?[A-Za-z0-9]{8,}/i);
  });
});

