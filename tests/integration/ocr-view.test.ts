import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sharp from 'sharp';
import { startServer, setupOrg, expectStatus, type TestServer } from '../support/harness.js';

let ts: TestServer;
let org: Awaited<ReturnType<typeof setupOrg>>;

beforeAll(async () => {
  ts = await startServer();
  org = await setupOrg(ts);
}, 120_000);
afterAll(async () => ts?.close());

describe('OCR view: original, confidence, corrections, provenance (SC-22)', () => {
  it('shows the machine result with word confidence, who corrected it and when, earlier attempts; corrections can be reset; a failed OCR keeps the image', async () => {
    const page = (await org.owner.post('/api/v1/pages', { spaceId: org.generalSpaceId, title: 'Скан' })).page;
    const png = await sharp({ create: { width: 300, height: 120, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const fd = new FormData();
    fd.append('pageId', page.id);
    fd.append('file', new Blob([png], { type: 'image/png' }), 'скан.png');
    const a = (await org.owner.req('POST', '/api/v1/attachments', fd)).attachments[0];
    // A first attempt failed, a second one succeeded (as the OCR worker records them).
    const orgId = (await ts.db.query('select org_id from pages where id = $1', [page.id])).rows[0].org_id;
    await ts.db.query(`delete from ocr_results where attachment_id = $1`, [a.id]);
    await ts.db.query(`insert into ocr_results (org_id, attachment_id, version, status, error, created_at) values ($1, $2, 1, 'error', 'таймаут распознавания', now() - interval '1 hour')`, [orgId, a.id]);
    const failed = await org.owner.get(`/api/v1/attachments/${a.id}/ocr`);
    expect(failed.ocr).toMatchObject({ status: 'error', error: 'таймаут распознавания' });
    const orig = await org.owner.raw('GET', failed.ocr.originalUrl);
    expect(Buffer.from(await orig.arrayBuffer()).equals(png)).toBe(true); // the image is untouched by the failure

    await ts.db.query(`insert into ocr_results (org_id, attachment_id, version, status, text, confidence, words, languages) values ($1, $2, 1, 'done', 'Счёт № 12З', 64, $3, 'rus+eng')`, [
      orgId,
      a.id,
      JSON.stringify([
        { text: 'Счёт', confidence: 91, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } },
        { text: '№', confidence: 88, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } },
        { text: '12З', confidence: 31, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } },
      ]),
    ]);
    const r = (await org.owner.get(`/api/v1/attachments/${a.id}/ocr`)).ocr;
    expect(r).toMatchObject({ status: 'done', text: 'Счёт № 12З', confidence: 64, languages: 'rus+eng', version: 1, imageVersion: 1, stale: false, correctedText: null, canEdit: true });
    expect(r.engine).toMatch(/Tesseract/);
    expect(r.words.filter((w: any) => w.confidence < 60).map((w: any) => w.text)).toEqual(['12З']);
    expect(r.history.map((h: any) => h.status)).toEqual(['done', 'error']);

    await org.owner.patch(`/api/v1/attachments/${a.id}/ocr`, { correctedText: 'Счёт № 123' });
    const c = (await org.owner.get(`/api/v1/attachments/${a.id}/ocr`)).ocr;
    expect(c).toMatchObject({ text: 'Счёт № 12З', correctedText: 'Счёт № 123', correctedBy: 'Анна Владелец' });
    expect(c.correctedAt).toBeTruthy();
    // reset: back to the machine result, provenance cleared, the machine text itself never overwritten
    await org.owner.patch(`/api/v1/attachments/${a.id}/ocr`, { correctedText: null });
    const reset = (await org.owner.get(`/api/v1/attachments/${a.id}/ocr`)).ocr;
    expect(reset).toMatchObject({ text: 'Счёт № 12З', correctedText: null, correctedBy: null, correctedAt: null });
    const actions = (await ts.db.query(`select action from audit_events where target_id = $1 and action like 'ocr.%' order by id`, [a.id])).rows.map((x) => x.action);
    expect(actions).toEqual(['ocr.correct', 'ocr.correction_reset']);

    // A reader sees the provenance but cannot correct.
    const reader = await org.user('Читатель Скана', { pageGrants: [{ pageId: page.id, level: 'view' }] });
    expect((await reader.get(`/api/v1/attachments/${a.id}/ocr`)).ocr.canEdit).toBe(false);
    await expectStatus(reader.patch(`/api/v1/attachments/${a.id}/ocr`, { correctedText: 'x' }), 403);

    // Replacing the file marks the old recognition as stale.
    const fd2 = new FormData();
    fd2.append('pageId', page.id);
    fd2.append('replaceId', a.id);
    fd2.append('file', new Blob([await sharp({ create: { width: 200, height: 100, channels: 3, background: '#eeeeee' } }).png().toBuffer()], { type: 'image/png' }), 'скан.png');
    await org.owner.req('POST', '/api/v1/attachments', fd2);
    await ts.db.query(`delete from ocr_results where attachment_id = $1 and version = 2`, [a.id]);
    expect((await org.owner.get(`/api/v1/attachments/${a.id}/ocr`)).ocr).toMatchObject({ version: 1, imageVersion: 2, stale: true });
  });
});
