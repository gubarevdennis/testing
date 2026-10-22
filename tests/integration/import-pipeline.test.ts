import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:net';
import yazl from 'yazl';
import ExcelJS from 'exceljs';
import { startServer, setupOrg, OWNER, type TestServer, type Api } from '../support/harness.js';

// Import pipeline hardening: antivirus quarantine for imports and archive restores (fail closed), per-stage
// job log, originals of every format kept with the imported page, XLSX range selection with a 100-row preview.

/** Test-only signature: the fake clamd below reports any stream containing it (no real malware in the repo). */
const SIGNATURE = ['KB', 'TEST', 'MALWARE', 'SIGNATURE', '7f3a'].join('-');

/** Minimal clamd speaking the INSTREAM protocol (same as apps/server/src/services/attachments.ts scanForViruses). */
async function fakeClamd(): Promise<{ server: Server; host: string; scans: number[] }> {
  const scans: number[] = [];
  const server = createServer((sock) => {
    let buf = Buffer.alloc(0);
    let body = Buffer.alloc(0);
    let headerSeen = false;
    sock.on('data', (d: Buffer) => {
      buf = Buffer.concat([buf, d]);
      if (!headerSeen) {
        const i = buf.indexOf(0);
        if (i < 0) return;
        buf = buf.subarray(i + 1); // "zINSTREAM\0"
        headerSeen = true;
      }
      while (buf.length >= 4) {
        const len = buf.readUInt32BE(0);
        if (len === 0) {
          scans.push(body.length);
          sock.end(body.includes(SIGNATURE) ? 'stream: Kb.Test.Signature FOUND\0' : 'stream: OK\0');
          buf = Buffer.alloc(0);
          return;
        }
        if (buf.length < 4 + len) return;
        body = Buffer.concat([body, buf.subarray(4, 4 + len)]);
        buf = buf.subarray(4 + len);
      }
    });
    sock.on('error', () => undefined);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return { server, host: `127.0.0.1:${(server.address() as { port: number }).port}`, scans };
}

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;
let clamd: Awaited<ReturnType<typeof fakeClamd>>;

async function zipOf(files: Record<string, Buffer | string>): Promise<Buffer> {
  const z = new yazl.ZipFile();
  for (const [name, data] of Object.entries(files)) z.addBuffer(Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'), name);
  z.end();
  const chunks: Buffer[] = [];
  for await (const c of z.outputStream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

async function upload(api: Api, files: Array<[string, Buffer]>) {
  const fd = new FormData();
  for (const [name, data] of files) fd.append('file', new Blob([data]), name);
  return api.raw('POST', '/api/v1/imports', fd);
}

async function startImport(api: Api, files: Array<[string, Buffer]>) {
  const res = await upload(api, files);
  const r = await res.json();
  if (!res.ok) throw Object.assign(new Error('upload failed'), { status: res.status, body: r });
  for (let i = 0; i < 300; i++) {
    const j = await api.get(`/api/v1/imports/${r.jobId}`);
    if (!['queued', 'running'].includes(j.status)) return { ...j, jobId: r.jobId };
    await new Promise((x) => setTimeout(x, 100));
  }
  throw new Error('import analysis timeout');
}

async function waitJob(api: Api, path: string) {
  for (let i = 0; i < 600; i++) {
    const j = await api.get(path);
    if (!['queued', 'running'].includes(j.status)) return j;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('job timeout');
}

const cfg = () => ts.srv.services.cfg as { clamavHost: string | null };

beforeAll(async () => {
  clamd = await fakeClamd();
  ts = await startServer({ clamavHost: clamd.host }, { worker: true });
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => {
  await ts?.close();
  clamd?.server.close();
});

describe('antivirus quarantine for imports and archive restore (R-IMPORT-032, R-ARCHIVE-016, SC-33)', () => {
  it('an infected file is rejected at upload, nothing is stored, and the rejection is audited (R-IMPORT-032, D-09)', async () => {
    const infected = Buffer.from(`# Заметка\n\n${SIGNATURE}\n`);
    const blobsBefore = (await ts.db.query('select count(*)::int c from blobs')).rows[0].c;
    const res = await upload(org.owner, [['заражённый.md', infected]]);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.message).toMatch(/антивирус/i);
    expect((await ts.db.query('select count(*)::int c from blobs')).rows[0].c).toBe(blobsBefore);
    const audit = (await ts.db.query(`select outcome, details from audit_events where action = 'import.rejected' order by id desc limit 1`)).rows[0];
    expect(audit.outcome).toBe('denied');
    expect(audit.details.reason).toBe('malware');
  });

  it('an infected asset inside a ZIP is found after extraction; a clean file in the same upload is still imported (R-IMPORT-032, R-IMPORT-006)', async () => {
    const zip = await zipOf({ 'doc/index.md': '# Пакет\n\n![схема](img/scheme.png)\n', 'doc/img/scheme.png': Buffer.from(`PNG-ish ${SIGNATURE}`) });
    expect(zip.includes(SIGNATURE)).toBe(false); // compressed: only visible after extraction
    const j = await startImport(org.owner, [['пакет.zip', zip], ['чистый.md', Buffer.from('# Чистый\n\nтекст')]]);
    const bad = j.preview.files.find((f: any) => f.file === 'пакет.zip');
    const good = j.preview.files.find((f: any) => f.file === 'чистый.md');
    expect(bad.status).toBe('error');
    expect(bad.error).toMatch(/антивирус/i);
    expect(good.status).toBe('ok');
    expect(j.preview.pages.map((p: any) => p.title)).toEqual(['Чистый']);
  });

  it('fails closed when the scanner is unreachable (R-IMPORT-032)', async () => {
    const saved = cfg().clamavHost;
    cfg().clamavHost = '127.0.0.1:1';
    try {
      const res = await upload(org.owner, [['note.md', Buffer.from('# x')]]);
      expect(res.status).toBe(422);
      expect((await res.json()).error.message).toMatch(/Антивирусная проверка недоступна/);
    } finally {
      cfg().clamavHost = saved;
    }
  });

  it('archive restore: each attachment is scanned; an infected one blocks the restore (R-ARCHIVE-016, R-ARCHIVE-006)', async () => {
    // The file entered before the signature was known (scanner off), then the archive is restored later.
    const saved = cfg().clamavHost;
    cfg().clamavHost = null;
    const pageId = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'С вложением' })).page.id;
    const fd = new FormData();
    fd.append('pageId', pageId);
    fd.append('file', new Blob([Buffer.from(`данные ${SIGNATURE}`)]), 'старый.txt');
    await org.owner.req('POST', '/api/v1/attachments', fd);
    cfg().clamavHost = saved;
    const { jobId } = await org.owner.post('/api/v1/admin/archives', { password: OWNER.password, confirm: true });
    expect((await waitJob(org.owner, `/api/v1/admin/archives/${jobId}`)).status).toBe('succeeded');
    const zip = Buffer.from(await (await org.owner.raw('GET', `/api/v1/admin/archives/${jobId}/download`)).arrayBuffer());
    const rfd = new FormData();
    rfd.append('file', new Blob([zip]), 'archive.zip');
    const an = await org.owner.req('POST', '/api/v1/admin/archives/restore', rfd);
    expect(an.analysis.ok).toBe(false);
    expect(an.analysis.malware.length).toBe(1);
    expect(an.analysis.malware[0].path).toMatch(/старый\.txt$/);
    const commit = await org.owner.raw('POST', `/api/v1/admin/archives/restore/${an.jobId}/commit`, { password: OWNER.password, confirm: true });
    expect(commit.status).toBe(422);
  });
});

describe('import job stage log and kept originals (R-IMPORT-032, R-IMPORT-014, R-IMPORT-042, R-IMPORT-037)', () => {
  it('records every pipeline stage on the job: upload → scan → detect → parse → normalize → media → validate → preview → commit → index (R-IMPORT-032)', async () => {
    const j = await startImport(org.owner, [['этапы.md', Buffer.from('# Этапы\n\nтекст')]]);
    const names = (s: any[]) => s.map((x) => x.stage);
    expect(names(j.progress.stages)).toEqual(['upload', 'scan', 'analyze', 'detect', 'parse', 'normalize', 'media', 'validate', 'preview']);
    expect(j.progress.stages[1].scanner).toBe('clamav');
    await org.owner.post(`/api/v1/imports/${j.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null } });
    const after = await org.owner.get(`/api/v1/imports/${j.jobId}`);
    expect(names(after.progress.stages).slice(-2)).toEqual(['commit', 'index']);
    expect(after.progress.stage).toBe('done');
  });

  it('the original MD, ZIP and CSV files are attached to the imported page for the author (R-IMPORT-014, R-IMPORT-042, UX13-05)', async () => {
    const sources = async (pageId: string) => (await org.owner.get(`/api/v1/pages/${pageId}/attachments`)).attachments.filter((a: any) => a.kind === 'import-source').map((a: any) => a.filename);
    const md = await startImport(org.owner, [['исходник.md', Buffer.from('# Исходник\n\nтекст')]]);
    const mdRes = await org.owner.post(`/api/v1/imports/${md.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null } });
    expect(await sources(mdRes.rootPageId)).toEqual(['исходник.md']);

    const zip = await zipOf({ 'a.md': '# А\n\nтекст', 'b.md': '# Б\n\nтекст' });
    const z = await startImport(org.owner, [['набор.zip', zip]]);
    const zRes = await org.owner.post(`/api/v1/imports/${z.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null } });
    expect(await sources(zRes.rootPageId)).toEqual(['набор.zip']);

    const csv = await startImport(org.owner, [['таблица.csv', Buffer.from('a;b\n1;2\n')]]);
    const cRes = await org.owner.post(`/api/v1/imports/${csv.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null }, tabular: { as: 'table' } });
    expect(await sources(cRes.rootPageId)).toEqual(['таблица.csv']);
    // The original is downloadable byte for byte.
    const att = (await org.owner.get(`/api/v1/pages/${cRes.rootPageId}/attachments`)).attachments.find((a: any) => a.kind === 'import-source');
    expect(Buffer.from(await (await org.owner.raw('GET', `/api/v1/attachments/${att.id}/download`)).arrayBuffer()).toString()).toBe('a;b\n1;2\n');
  });
});

describe('XLSX range selection and 100-row preview (R-IMPORT-031, R-IMPORT-041, R-IMPORT-030, R-IMPORT-036)', () => {
  it('previews up to 100 rows and imports only the selected range (R-IMPORT-031, R-IMPORT-041, R-IMPORT-030, AT-49)', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Данные');
    ws.addRow(['Отчёт за октябрь']); // title row above the table
    ws.addRow([]);
    ws.addRow(['', 'Склад', 'Остаток', 'Примечание']);
    for (let i = 1; i <= 150; i++) ws.addRow(['', `С-${i}`, i * 10, i % 2 ? 'да' : '']);
    const j = await startImport(org.owner, [['склады.xlsx', Buffer.from(await wb.xlsx.writeBuffer())]]);
    expect(j.preview.tabular.sheets[0].rows.length).toBe(100); // 100-row preview
    expect(j.preview.tabular.sheets[0].totalRows).toBe(152);

    const dry = await org.owner.post(`/api/v1/imports/${j.jobId}/dry-run`, { sheet: 0, header: true, as: 'table', range: 'B3:C6' });
    expect(dry.header).toEqual(['Склад', 'Остаток']);
    expect(dry.rows).toBe(3);
    expect(dry.preview.rows).toEqual([
      ['С-1', '10'],
      ['С-2', '20'],
      ['С-3', '30'],
    ]);
    expect(dry.types).toEqual(['text', 'number']);

    const res = await org.owner.post(`/api/v1/imports/${j.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null }, tabular: { as: 'table', sheet: 0, header: true, range: 'B3:C6' } });
    const doc = (await org.owner.get(`/api/v1/pages/${res.rootPageId}/content`)).content;
    const table = doc.content.find((b: any) => b.type === 'table');
    const cells = table.content.map((r: any) => r.content.map((c: any) => (c.content?.[0]?.content ?? []).map((t: any) => t.text).join('')));
    expect(cells).toEqual([
      ['Склад', 'Остаток'],
      ['С-1', '10'],
      ['С-2', '20'],
      ['С-3', '30'],
    ]);
  });

  it('rejects a malformed or empty range with a clear error (R-IMPORT-031)', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Л').addRow(['a', 'b']);
    const j = await startImport(org.owner, [['мал.xlsx', Buffer.from(await wb.xlsx.writeBuffer())]]);
    expect((await org.owner.raw('POST', `/api/v1/imports/${j.jobId}/dry-run`, { sheet: 0, header: true, as: 'table', range: '1A:ZZ' })).status).toBe(400);
    const empty = await org.owner.raw('POST', `/api/v1/imports/${j.jobId}/dry-run`, { sheet: 0, header: true, as: 'table', range: 'A50:B60' });
    expect(empty.status).toBe(422);
    expect((await empty.json()).error.code).toBe('empty_range');
  });
});
