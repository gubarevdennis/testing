import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import yazl from 'yazl';
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, TextRun } from 'docx';
import { startServer, setupOrg, type TestServer, type Api } from '../support/harness.js';

// A ZIP of folders with Word documents (e.g. an export from Teamly or a shared drive) becomes a page tree: every
// folder a section page, every .docx/.md/.txt/.html a page with real blocks (headings, lists, tables), other files
// attached to the page of their folder, legacy .doc reported (R-IMPORT-021).
let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;
beforeAll(async () => {
  ts = await startServer({}, { worker: true });
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => ts?.close());

async function docx(title: string, body: string): Promise<Buffer> {
  const d = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Порядок работы', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ children: [new TextRun({ text: body, bold: true })] }),
          new Paragraph({ text: 'первый шаг', bullet: { level: 0 } }),
          new Paragraph({ text: 'второй шаг', bullet: { level: 0 } }),
          new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph('Зона')] }), new TableCell({ children: [new Paragraph('Ответственный')] })] }), new TableRow({ children: [new TableCell({ children: [new Paragraph('A')] }), new TableCell({ children: [new Paragraph('Елена')] })] })] }),
        ],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(d));
}
async function zipOf(files: Record<string, Buffer | string>): Promise<Buffer> {
  const z = new yazl.ZipFile();
  for (const [name, data] of Object.entries(files)) z.addBuffer(Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'), name);
  z.end();
  const chunks: Buffer[] = [];
  for await (const c of z.outputStream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}
async function importZip(api: Api, name: string, data: Buffer) {
  const fd = new FormData();
  fd.append('file', new Blob([data]), name);
  const r = await (await api.raw('POST', '/api/v1/imports', fd)).json();
  let j: any;
  for (let i = 0; i < 300; i++) {
    j = await api.get(`/api/v1/imports/${r.jobId}`);
    if (!['queued', 'running'].includes(j.status)) break;
    await new Promise((x) => setTimeout(x, 100));
  }
  return { ...j, jobId: r.jobId };
}
const children = async (id: string) => (await org.owner.get(`/api/v1/pages/${id}/children`)).pages ?? (await org.owner.get(`/api/v1/pages/${id}/children`)).children;
const types = (doc: any): string[] => {
  const out: string[] = [];
  const walk = (n: any) => {
    out.push(n.type);
    n.content?.forEach(walk);
  };
  walk(doc);
  return out;
};

describe('ZIP with folders of Word documents → page hierarchy', () => {
  it('folders become section pages, .docx become pages with real blocks, other files are attached, .doc is reported', async () => {
    const zip = await zipOf({
      'Регламенты/1. Общее.docx': await docx('Общие правила', 'Важно'),
      'Регламенты/Склад/2. Инвентаризация.docx': await docx('Инвентаризация', 'График'),
      'Регламенты/Склад/1. Приёмка.docx': await docx('Приёмка товара', 'Проверка'),
      'Регламенты/Склад/Схема склада.pdf': Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'),
      'Регламенты/Склад/~$Приёмка.docx': Buffer.from('lock file'),
      'Регламенты/Архив/старый.doc': Buffer.from('legacy'),
      'Регламенты/Заметка.md': '# Заметка\n\nтекст',
    });
    const j = await importZip(org.owner, 'teamly-export.zip', zip);
    expect(j.status).toBe('awaiting_confirmation');
    const warnings = JSON.stringify(j);
    expect(warnings).toContain('старый.doc');
    const res = await org.owner.post(`/api/v1/imports/${j.jobId}/commit`, { target: { spaceId: org.generalSpaceId, parentId: null } });
    const roots: any[] = res.pages.filter((p: any) => !res.pages.some((q: any) => q.id === p.parentId));
    const titles = (await Promise.all(res.pages.map(async (p: any) => (await org.owner.get(`/api/v1/pages/${p.id}`)).page))).map((p: any) => ({ id: p.id, title: p.title, parentId: p.parentId }));
    const byTitle = (t: string) => titles.find((p) => p.title === t)!;
    expect(byTitle('Склад')).toBeTruthy();
    // documents keep their order (numeric prefixes) under their folder
    expect(byTitle('Приёмка товара').parentId).toBe(byTitle('Склад').id);
    expect(byTitle('Инвентаризация').parentId).toBe(byTitle('Склад').id);
    expect(byTitle('Общие правила').parentId).toBe(byTitle('Склад').parentId ?? null);
    expect(titles.some((p) => /~\$/.test(p.title))).toBe(false); // Word lock files are skipped
    expect(roots.length).toBeGreaterThanOrEqual(1);
    // real blocks, not plain text
    const doc = (await org.owner.get(`/api/v1/pages/${byTitle('Приёмка товара').id}/content`)).content;
    const t = types(doc);
    expect(t).toContain('heading');
    expect(t).toContain('bulletList');
    expect(t).toContain('table');
    expect(JSON.stringify(doc)).toContain('Елена');
    // the PDF is attached to the «Склад» section page
    const folderDoc = (await org.owner.get(`/api/v1/pages/${byTitle('Склад').id}/content`)).content;
    expect(types(folderDoc)).toContain('fileBlock');
    expect(JSON.stringify(folderDoc)).toContain('Схема склада.pdf');
    void children;
  }, 120_000);
});
