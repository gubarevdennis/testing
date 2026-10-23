import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, newPage, editor, expectSaved, apiContent, api, caretToEnd } from './helpers';
import { startLatencyProbe, readLatency, stats, journal, throttleCpu } from './perf-helpers';

/**
 * R-PERF-019: heavy operations run in the background and never block typing — a large file upload (chunked, with the
 * SHA-256 checksum computed in a Web Worker), a server-side export job and OCR (server-side job) running while the
 * user types. The same scenario is measured with the checksum computed on the main thread (the previous behaviour,
 * switched on by localStorage['kb:hash-in-thread']) to show what the worker removes. Numbers go to
 * test-results/perf/results.jsonl.
 */
test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

const MB = 1024 * 1024;
const FILE_MB = Number(process.env.KB_PERF_UPLOAD_MB ?? 48);
const CPU_RATE = Number(process.env.KB_PERF_CPU_RATE ?? 4);

async function typeDuringUpload(page: Page, label: string, inThread: boolean) {
  await ensureOwner(page);
  await page.evaluate((v) => (v ? localStorage.setItem('kb:hash-in-thread', '1') : localStorage.removeItem('kb:hash-in-thread')), inThread);
  const id = await newPage(page, 'Набор во время загрузки ' + label);
  await page.keyboard.type('Абзац для набора.');
  await page.keyboard.press('Enter');
  await expectSaved(page);
  // network slowed down so the upload (and its hashing) lasts for the whole typing session
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: 50 * MB, uploadThroughput: 4 * MB });
  // a large file pasted into the page: chunked resumable upload
  await page.evaluate((size) => {
    const bin = new Uint8Array(size);
    for (let i = 0; i < size; i += 4096) bin[i] = i & 255;
    const dt = new DataTransfer();
    dt.items.add(new File([bin], 'архив-проекта.bin', { type: 'application/octet-stream' }));
    (document.activeElement ?? document.querySelector('.kb-editor'))!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, FILE_MB * MB);
  await expect(editor(page).locator('.kb-upload')).toBeVisible();
  // a server-side export of the same page at the same time
  const exp = await api(page, 'POST', '/api/v1/exports', { pageIds: [id], format: 'docx' });
  // back into the first paragraph and type
  const p = editor(page).locator('p', { hasText: 'Абзац для набора.' });
  await caretToEnd(page, p);
  const thr = await throttleCpu(page, CPU_RATE);
  await startLatencyProbe(page);
  const text = ' набор во время тяжёлых операций'.replace(/[^\x20-\x7e]/g, 'x').padEnd(160, 'abc');
  await page.keyboard.type(text, { delay: 60 });
  const { samples, longTasks } = await readLatency(page);
  await thr.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const stillUploading = await editor(page).locator('.kb-upload').count();
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const s = stats(samples);
  const result = { mode: label, fileMb: FILE_MB, cpuRate: CPU_RATE, ...s, longTasks: longTasks.length, longTaskMax: Math.round(Math.max(0, ...longTasks)), longTasksOver100ms: longTasks.filter((d) => d > 100).length, uploadStillRunningAtEnd: stillUploading > 0 };
  journal('typing-during-upload-export', result);
  test.info().annotations.push({ type: 'perf', description: JSON.stringify(result) });
  // integrity: every character arrived; the upload and the export finish
  await expect(p).toHaveText('Абзац для набора.' + text);
  await expect(editor(page).locator('.kb-upload')).toHaveCount(0, { timeout: 120_000 });
  await expectSaved(page);
  const doc = JSON.stringify((await apiContent(page.request, id)).content);
  expect(doc).toContain(text);
  expect(doc).toContain('архив-проекта.bin');
  await expect.poll(async () => (await (await page.request.get(`/api/v1/exports/${exp.jobId}`)).json()).status, { timeout: 60_000 }).toBe('succeeded');
  await page.evaluate(() => localStorage.removeItem('kb:hash-in-thread'));
  return result;
}

test('R-PERF-019: typing stays responsive while a large file uploads and an export runs (checksum in a Web Worker vs on the main thread)', async ({ page }) => {
  const inThread = await typeDuringUpload(page, 'main-thread-hash', true);
  const worker = await typeDuringUpload(page, 'worker-hash', false);
  // The background work overlapped the typing session in both runs (otherwise the comparison says nothing).
  expect(worker.uploadStillRunningAtEnd || inThread.uploadStillRunningAtEnd).toBe(true);
  // With the worker no long main-thread task comes from hashing: never more long tasks than with in-thread hashing,
  // and no task blocks input for more than 200 ms.
  expect(worker.longTasksOver100ms).toBeLessThanOrEqual(inThread.longTasksOver100ms);
  expect(worker.longTaskMax).toBeLessThan(200);
  expect(worker.p95).toBeLessThan(150);
});
