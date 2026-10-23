#!/usr/bin/env node
// Demo data for a local evaluation (docker compose): organisation, a department with its private space, several
// employees and a set of articles imported through the real import pipeline. Idempotent: if the organisation already
// exists, nothing is changed. Usage: KB_URL=http://app:8080 node scripts/demo/seed-demo.mjs
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.KB_URL ?? 'http://localhost:8080').replace(/\/$/, '');
const PASSWORD = process.env.KB_DEMO_PASSWORD ?? 'Demo-password-2026';
const ADMIN = { email: 'admin@demo.local', name: 'Анна Администратор' };
const USERS = [
  { email: 'elena@demo.local', name: 'Елена Кладовщик', dept: true },
  { email: 'boris@demo.local', name: 'Борис Логист', dept: true },
  { email: 'petr@demo.local', name: 'Пётр Бухгалтер', dept: false },
];
const here = dirname(fileURLToPath(import.meta.url));

class Client {
  cookies = new Map();
  csrf = '';
  async req(method, path, body, { form = false, ok = true } = {}) {
    const headers = { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') };
    if (this.csrf) headers['x-csrf-token'] = this.csrf;
    let payload;
    if (form) payload = body;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const r = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' });
    for (const c of r.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      this.cookies.set(kv.slice(0, i), kv.slice(i + 1));
      if (kv.startsWith('kb_csrf=')) this.csrf = kv.slice(8);
    }
    const text = await r.text();
    const json = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
    if (ok && !r.ok) throw new Error(`${method} ${path} → ${r.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`);
    return { status: r.status, body: json };
  }
}

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(BASE + '/readyz');
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('server did not become ready at ' + BASE);
}

async function importMarkdown(c, spaceId, parentId, filename, markdown) {
  const fd = new FormData();
  fd.append('file', new Blob([markdown], { type: 'text/markdown' }), filename);
  const { body: up } = await c.req('POST', '/api/v1/imports', fd, { form: true });
  for (let i = 0; i < 120; i++) {
    const { body: j } = await c.req('GET', `/api/v1/imports/${up.jobId}`);
    if (j.status === 'awaiting_confirmation') break;
    if (['failed', 'cancelled'].includes(j.status)) throw new Error(`import of ${filename} ${j.status}: ${JSON.stringify(j.error ?? j.report ?? '')}`);
    await new Promise((r) => setTimeout(r, 500));
  }
  const { body: res } = await c.req('POST', `/api/v1/imports/${up.jobId}/commit`, { target: { spaceId, parentId } });
  return res.rootPageId ?? res.pages?.[0]?.id;
}

await waitForServer();
const admin = new Client();
const setup = await admin.req('POST', '/api/v1/setup', { orgName: 'ООО «Демо-Склад»', ownerEmail: ADMIN.email, ownerName: ADMIN.name, password: PASSWORD }, { ok: false });
if (setup.status === 409) {
  console.log('Демо-данные уже созданы — ничего не меняю.');
  process.exit(0);
}
if (setup.status >= 300) throw new Error('setup failed: ' + JSON.stringify(setup.body));
if (setup.body?.csrfToken) admin.csrf = setup.body.csrfToken;

const spaces = (await admin.req('GET', '/api/v1/spaces')).body.spaces;
const orgSpace = spaces.find((s) => s.kind === 'org');
const dept = (await admin.req('POST', '/api/v1/admin/groups', { name: 'Отдел склада', kind: 'department' })).body.group;
const warehouse = (await admin.req('POST', '/api/v1/spaces', { name: 'Склад', kind: 'department', visibility: 'private', groups: [{ groupId: dept.id, level: 'edit' }] })).body.space;

for (const u of USERS) {
  const created = (await admin.req('POST', '/api/v1/admin/users', { email: u.email, name: u.name, kind: 'employee', invite: true, groupIds: u.dept ? [dept.id] : [] })).body;
  const token = created.inviteUrl.split('/invite/')[1];
  await new Client().req('POST', '/api/v1/auth/invite/accept', { token, password: PASSWORD });
}

const content = join(here, 'content');
const files = (await readdir(content)).filter((f) => f.endsWith('.md')).sort();
for (const f of files) {
  const md = await readFile(join(content, f), 'utf8');
  const target = f.startsWith('warehouse-') ? warehouse.id : orgSpace.id;
  await importMarkdown(admin, target, null, f.replace(/^(warehouse|org)-\d+-/, ''), md);
  console.log('  импортировано:', f);
}

console.log(`
Демо готово: ${process.env.KB_PUBLIC_URL ?? BASE}
  Администратор:      ${ADMIN.email} / ${PASSWORD}
${USERS.map((u) => `  ${u.name.padEnd(19)} ${u.email} / ${PASSWORD}`).join('\n')}
Елена и Борис — сотрудники отдела склада (пространство «Склад»), Пётр — из другого отдела и «Склад» не видит.`);
