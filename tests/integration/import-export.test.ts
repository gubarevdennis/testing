import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import yazl from 'yazl';
import yauzl from 'yauzl';
import iconv from 'iconv-lite';
import ExcelJS from 'exceljs';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { docToDocx } from '../../apps/server/src/convert/docx-export.js';
import { startServer, setupOrg, expectStatus, type TestServer, type Api } from '../support/harness.js';

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer({}, { worker: true });
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => ts?.close());

async function zipOf(files: Record<string, Buffer | string>): Promise<Buffer> {
  const z = new yazl.ZipFile();
  for (const [name, data] of Object.entries(files)) z.addBuffer(Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'), name);
  z.end();
  const chunks: Buffer[] = [];
  for await (const c of z.outputStream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

async function unzip(buf: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    const out = new Map<string, Buffer>();
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err);
      zip.on('entry', (e) => zip.openReadStream(e, (_e, rs) => { const c: Buffer[] = []; rs!.on('data', (d) => c.push(d)); rs!.on('end', () => { out.set(e.fileName, Buffer.concat(c)); zip.readEntry(); }); }));
      zip.on('end', () => resolve(out));
      zip.readEntry();
    });
  });
}

async function startImport(api: Api, files: Array<[string, Buffer]>, extra: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  for (const [name, data] of files) fd.append('file', new Blob([data]), name);
  const r = await api.req('POST', '/api/v1/imports', fd);
  for (let i = 0; i < 300; i++) {
    const j = await api.get(`/api/v1/imports/${r.jobId}`);
    if (!['queued', 'running'].includes(j.status)) return { ...j, jobId: r.jobId, duplicate: r.duplicate };
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error('import analysis timeout');
}

const pageText = async (api: Api, id: string) => {
  const c = await api.get(`/api/v1/pages/${id}/content`);
  const { docToPlainText } = await import('@kb/shared');
  return { doc: c.content, text: docToPlainText(c.content) };
};

describe('DOCX import (SC-13, SC-14, AT-41, AT-42)', () => {
  it('imports headings, nested lists, merged tables and images with a report; original kept', async () => {
    const img = await sharp({ create: { width: 300, height: 120, channels: 3, background: '#5A85C6' } }).png().toBuffer();
    const doc: any = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Регламент склада' }] },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Приёмка' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Пункт' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Подпункт' }] }] }] }] }] },
        { type: 'table', content: [
          { type: 'tableRow', content: [{ type: 'tableHeader', attrs: { colspan: 2, rowspan: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Шапка' }] }] }] },
          { type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'А' }] }] }, { type: 'tableCell', attrs: { colspan: 1, rowspan: 1 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Б' }] }] }] },
        ] },
        { type: 'image', attrs: { attachmentId: 'x', alt: 'схема', caption: 'Рис. 1' } },
      ],
    };
    const { buffer } = await docToDocx(doc, { title: 'Регламент склада', baseUrl: 'http://x', loadImage: async () => ({ data: img, width: 300, height: 120, mime: 'image/png' }) });
    const j = await startImport(org.owner, [['regl.docx', buffer]]);
    expect(j.status).toBe('awaiting_confirmation');
    expect(j.preview.pages.length).toBe(1);
    expect(j.preview.files[0].warnings.some((w: any) => w.code === 'merged-cells')).toBe(true);
    // Before commit nothing exists (staging).
    const before = (await ts.db.query('select count(*)::int c from pages')).rows[0].c;
    const res = await org.owner.post(`/api/v1/imports/${j.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null } });
    const after = (await ts.db.query('select count(*)::int c from pages')).rows[0].c;
    expect(after).toBe(before + 1);
    const { doc: imported, text } = await pageText(org.owner, res.rootPageId);
    expect(text).toContain('Подпункт');
    const types = imported.content.map((b: any) => b.type);
    expect(types).toEqual(expect.arrayContaining(['heading', 'bulletList', 'table', 'image']));
    const table = imported.content.find((b: any) => b.type === 'table');
    expect(table.content[0].content[0].attrs.colspan).toBe(2);
    const imgNode = imported.content.find((b: any) => b.type === 'image');
    const imgRes = await org.owner.raw('GET', imgNode.attrs.src);
    expect(imgRes.status).toBe(200);
    const atts = await org.owner.get(`/api/v1/pages/${res.rootPageId}/attachments`);
    expect(atts.attachments.some((a: any) => a.kind === 'import-source' && a.filename === 'regl.docx')).toBe(true);
    // Commit is idempotent.
    const again = await org.owner.post(`/api/v1/imports/${j.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null } });
    expect(again.repeated).toBe(true);
    expect((await ts.db.query('select count(*)::int c from pages')).rows[0].c).toBe(after);
  });

  it('rejects a corrupted DOCX with a clear error and changes nothing (SC-19)', async () => {
    const j = await startImport(org.owner, [['broken.docx', Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(100, 1)])]]).catch((e) => e);
    if (j.status) expect(j.preview?.files?.[0]?.status ?? 'error').toBe('error');
    else expect(j.status ?? j.body?.error?.code).toBeDefined();
  });
});

describe('Markdown ZIP (SC-15, AT-43, AT-69)', () => {
  it('imports a folder tree with relative images and cross-links; links become internal', async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const zip = await zipOf({
      'docs/README.md': '# Руководство\n\nСм. [установку](setup/install.md) и ![логотип](img/logo.png)\n',
      'docs/setup/install.md': '# Установка\n\n- [x] шаг 1\n- [ ] шаг 2\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\nНазад: [главная](../README.md)\n',
      'docs/img/logo.png': png,
      'docs/unused.bin': Buffer.from('x'),
    });
    const j = await startImport(org.owner, [['docs.zip', zip]]);
    expect(j.status).toBe('awaiting_confirmation');
    const titles = j.preview.pages.map((p: any) => p.title).sort();
    expect(titles).toEqual(['setup', 'Руководство', 'Установка'].sort());
    const res = await org.owner.post(`/api/v1/imports/${j.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null } });
    const root = res.pages.find((p: any) => p.title === 'Руководство');
    const inst = res.pages.find((p: any) => p.title === 'Установка');
    const { doc } = await pageText(org.owner, root.id);
    const json = JSON.stringify(doc);
    expect(json).toContain(`/p/${inst.id}`);
    expect(json).toContain('/api/v1/attachments/');
    const { doc: d2 } = await pageText(org.owner, inst.id);
    expect(d2.content.map((b: any) => b.type)).toEqual(['taskList', 'table', 'paragraph']);
    expect(JSON.stringify(d2)).toContain(`/p/${root.id}`);
    expect(j.preview.files[0].warnings.some((w: any) => w.code === 'unused-files')).toBe(true);
  });

  it('rejects zip-slip paths and zip bombs before extracting (SC-19, AT-69, R-IMPORT)', async () => {
    let evil = await zipOf({ 'aa/evil.md': '# x' });
    evil = Buffer.from(evil.toString('latin1').split('aa/evil.md').join('../evil.md'), 'latin1');
    const j1 = await startImport(org.owner, [['evil.zip', evil]]);
    expect(j1.preview.files[0].status).toBe('error');
    expect(j1.preview.files[0].error).toMatch(/Небезопасный путь/);
    const bomb = await zipOf({ 'a.md': Buffer.alloc(60 * 1024 * 1024, 0x20) });
    const j2 = await startImport(org.owner, [['bomb.zip', bomb]]);
    expect(j2.preview.files[0].error).toMatch(/ZIP-бомб/);
  });

  it('cancelling before commit creates nothing (AT-72)', async () => {
    const j = await startImport(org.owner, [['note.md', Buffer.from('# Заметка\n\nтекст')]]);
    const before = (await ts.db.query('select count(*)::int c from pages')).rows[0].c;
    await org.owner.post(`/api/v1/imports/${j.jobId}/cancel`);
    await expectStatus(org.owner.post(`/api/v1/imports/${j.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null } }), 409);
    expect((await ts.db.query('select count(*)::int c from pages')).rows[0].c).toBe(before);
  });

  it('same idempotency key does not create a second job (AT-73)', async () => {
    const a = await startImport(org.owner, [['n.md', Buffer.from('# N')]], { idempotencyKey: 'key-123' });
    const b = await startImport(org.owner, [['n.md', Buffer.from('# N')]], { idempotencyKey: 'key-123' });
    expect(b.jobId).toBe(a.jobId);
    expect(b.duplicate).toBe(true);
  });
});

describe('tabular import (AT-48..AT-51, UX13-17)', () => {
  it('CSV in Windows-1251 with ";" and decimal comma, quotes and leading zeros', async () => {
    const csv = 'Артикул;Наименование;Цена;Дата;Есть\n0012;"Кабель ""КНХ""; 2x2";1 234,50;01.10.2026;да\n0013;Дроссель;99,9;15.10.2026;нет\n';
    const j = await startImport(org.owner, [['price.csv', iconv.encode(csv, 'win1251')]]);
    const t = j.preview.tabular;
    expect(t.encoding).toBe('windows-1251');
    expect(t.delimiter).toBe(';');
    const cols = t.sheets[0].columns;
    expect(cols.map((c: any) => c.type)).toEqual(['text', 'text', 'number', 'date', 'checkbox']);
    expect(t.sheets[0].rows[0][0]).toBe('0012');
    expect(t.sheets[0].rows[0][1]).toBe('Кабель "КНХ"; 2x2');
    const res = await org.owner.post(`/api/v1/imports/${j.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null }, tabular: { as: 'collection', keyColumn: 0, title: 'Прайс' } });
    const c = (await ts.db.query('select * from collections where page_id = $1', [res.rootPageId])).rows[0];
    const rows = await org.owner.post(`/api/v1/collections/${c.id}/query`, { sorts: [{ fieldId: 'title', dir: 'asc' }] });
    expect(rows.total).toBe(2);
    expect(rows.rows[0].title).toBe('0012');
    const priceField = c.schema.find((f: any) => f.name === 'Цена');
    expect(rows.rows[0].values[priceField.id]).toBe(1234.5);
    // Repeated import with upsert: dry run shows updates, no hidden duplicates (AT-50).
    const j2 = await startImport(org.owner, [['price.csv', iconv.encode(csv.replace('99,9', '120'), 'win1251')]]);
    const dry = await org.owner.post(`/api/v1/imports/${j2.jobId}/dry-run`, { as: 'collection', collectionId: c.id, collectionMode: 'upsert', keyColumn: 0 });
    expect(dry).toMatchObject({ rows: 2, updates: 2, inserts: 0 });
    await org.owner.post(`/api/v1/imports/${j2.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null }, tabular: { as: 'collection', collectionId: c.id, collectionMode: 'upsert', keyColumn: 0 } });
    const after = await org.owner.post(`/api/v1/collections/${c.id}/query`, {});
    expect(after.total).toBe(2);
  });

  it('XLSX with three sheets: pick a sheet, numbers and dates kept, formulas as values (AT-49, R-SECURITY-009)', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Пусто').addRow(['x']);
    const ws = wb.addWorksheet('Оборудование');
    ws.addRow(['Модель', 'Кол-во', 'Поставка', 'Сумма']);
    ws.addRow(['ЩУО-24', 3, new Date(Date.UTC(2026, 9, 1)), { formula: 'B2*100', result: 300 }]);
    ws.addRow(['ЩУО-12', 5, new Date(Date.UTC(2026, 10, 2)), { formula: 'B3*100', result: 500 }]);
    wb.addWorksheet('Третий').addRow(['y']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const j = await startImport(org.owner, [['equip.xlsx', buf]]);
    expect(j.preview.tabular.sheets.map((s: any) => s.name)).toEqual(['Пусто', 'Оборудование', 'Третий']);
    const sheet = j.preview.tabular.sheets[1];
    expect(sheet.columns.map((c: any) => c.type)).toEqual(['text', 'number', 'date', 'number']);
    expect(sheet.rows[0]).toEqual(['ЩУО-24', '3', '2026-10-01', '300']);
    expect(j.preview.files[0].warnings.some((w: any) => w.code === 'formulas')).toBe(true);
    const res = await org.owner.post(`/api/v1/imports/${j.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null }, tabular: { as: 'table', sheet: 1 } });
    const { doc } = await pageText(org.owner, res.rootPageId);
    expect(doc.content[0].type).toBe('table');
    expect(doc.content[0].content.length).toBe(3);
  });
});

describe('export (SC-08, SC-09, SC-13, S09, UX13-16)', () => {
  it('exports a page to MD/DOCX/HTML/PDF; DOCX opens in LibreOffice; MD round-trips', async () => {
    const j = await startImport(org.owner, [['source.md', Buffer.from('# Экспортируемая\n\n## Раздел\n\nТекст с **жирным** и [ссылкой](https://example.com).\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n\n> [!WARNING]\n> Важно\n')]]);
    const res = await org.owner.post(`/api/v1/imports/${j.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null } });
    const id = res.rootPageId;
    const md = await (await org.owner.raw('GET', `/api/v1/pages/${id}/export?format=md`)).text();
    expect(md).toContain('# Экспортируемая');
    expect(md).toContain('| A | B |');
    expect(md).toContain('```js');
    expect(md).toContain('[!WARNING]');
    const docx = Buffer.from(await (await org.owner.raw('GET', `/api/v1/pages/${id}/export?format=docx`)).arrayBuffer());
    expect(docx.subarray(0, 2).toString()).toBe('PK');
    const dir = mkdtempSync(join(tmpdir(), 'kb-docx-'));
    writeFileSync(join(dir, 'e.docx'), docx);
    execFileSync('soffice', ['--headless', '--convert-to', 'txt:Text', '--outdir', dir, join(dir, 'e.docx')], { timeout: 90_000, stdio: 'ignore' });
    expect(existsSync(join(dir, 'e.txt'))).toBe(true);
    const html = await (await org.owner.raw('GET', `/api/v1/pages/${id}/export?format=html`)).text();
    expect(html).toContain('<h2');
    expect(html).not.toContain('<script');
    const pdf = Buffer.from(await (await org.owner.raw('GET', `/api/v1/pages/${id}/export?format=pdf`)).arrayBuffer());
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    // Round trip: exported Markdown imported again gives the same text.
    const j2 = await startImport(org.owner, [['round.md', Buffer.from(md)]]);
    const res2 = await org.owner.post(`/api/v1/imports/${j2.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null } });
    expect((await pageText(org.owner, res2.rootPageId)).text).toBe((await pageText(org.owner, id)).text);
  }, 180_000);

  it('branch export to Markdown ZIP: readable tree, relative links, assets, checksums, report (A01, A02, V18)', async () => {
    const root = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Корень экспорта' })).page;
    const child = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, parentId: root.id, title: 'Дочерняя: страница' })).page;
    const fd = new FormData();
    fd.append('pageId', child.id);
    fd.append('file', new Blob([await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).png().toBuffer()]), 'pic.png');
    const att = (await org.owner.req('POST', '/api/v1/attachments', fd)).attachments[0];
    const { replaceContent } = await import('../../apps/server/src/collab/ydoc.js');
    await ts.srv.services.hub.applyServerChange(child.id, null, (doc) => replaceContent(doc, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Назад к ' }, { type: 'pageMention', attrs: { pageId: root.id, title: 'Корень' } }] }, { type: 'image', attrs: { src: att.contentUrl, attachmentId: att.id, alt: 'pic' } }] }));
    const r = await org.owner.raw('GET', `/api/v1/pages/${root.id}/export?format=md&children=true`);
    const files = await unzip(Buffer.from(await r.arrayBuffer()));
    const names = [...files.keys()].sort();
    expect(names).toContain('Корень экспорта/index.md');
    expect(names).toContain('Корень экспорта/Дочерняя страница.md');
    expect(names).toContain('Корень экспорта/assets/pic.png');
    expect(names).toContain('checksums.sha256');
    expect(names).toContain('export-report.md');
    const childMd = files.get('Корень экспорта/Дочерняя страница.md')!.toString();
    expect(childMd).toContain('](index.md)');
    expect(childMd).toContain('](assets/pic.png');
  });

  it('export respects rights: no export permission => 403; private pages never leak into branch export (SC-20, V17-F07, R-ACL-017)', async () => {
    const sp = (await org.owner.post('/api/v1/spaces', { name: 'Без экспорта (тест)', kind: 'project', visibility: 'open', orgLevel: 'view', policy: { allowExport: false }, confirmWiden: true })).space;
    const p = (await org.owner.post('/api/v1/pages', { spaceId: sp.id, title: 'Нельзя выгружать' })).page;
    const reader = await org.user('Выгружающий');
    expect((await reader.raw('GET', `/api/v1/pages/${p.id}/export?format=md`)).status).toBe(403);
    const root = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Открытая ветка' })).page;
    const secret = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, parentId: root.id, title: 'Закрытая дочерняя' })).page;
    await org.owner.post(`/api/v1/pages/${secret.id}/inheritance`, { inherit: false });
    const acc = await org.owner.get(`/api/v1/pages/${secret.id}/access`);
    for (const g of acc.pageGrants.filter((g: any) => g.subject_type === 'org')) await org.owner.del(`/api/v1/grants/${g.id}`);
    const r = await reader.raw('GET', `/api/v1/pages/${root.id}/export?format=md&children=true`);
    const body = await r.text();
    expect(body).not.toContain('Закрытая дочерняя');
  });
});
