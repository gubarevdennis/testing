import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ensureOwner, editor, expectSaved, apiContent, api } from './helpers';
import { specToDocx, unzipEntries, type DocSpec } from '../support/doc-corpus';
import { validateDocx } from '../../apps/server/src/convert/docx-validate';

// Browser round trips for IMPORT/EXPORT P0: DOCX/MD import → edit in the editor → export from the page menu;
// background export cancellation; archive restore into a chosen target.

test.describe.configure({ mode: 'serial' });

const SPEC: DocSpec = {
  title: 'Регламент E2E',
  blocks: [
    { kind: 'h', level: 1, text: 'Назначение' },
    { kind: 'p', runs: [{ text: 'Документ описывает ' }, { text: 'порядок', bold: true }, { text: ' работ, см. ' }, { text: 'портал', href: 'https://example.com/portal' }, { text: '.' }] },
    { kind: 'list', ordered: true, items: [{ text: 'Подготовка', level: 0 }, { text: 'Проверка стойки', level: 1 }, { text: 'Замер питания', level: 2 }, { text: 'Запуск', level: 0 }] },
    { kind: 'table', rows: [['Узел', 'Адрес'], ['web', '10.0.0.1']] },
    { kind: 'table', mergeFirstRow: true, rows: [['Сводка', ''], ['Итого', '2']] },
    { kind: 'code', lines: ['systemctl restart kb', 'journalctl -u kb'] },
    { kind: 'image', alt: 'Схема стойки', caption: 'Рисунок 1 — Стойка', color: '#5A85C6' },
  ],
};

async function importFile(page: Page, name: string, data: Buffer) {
  await page.goto('/import');
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: data });
  await page.getByRole('button', { name: /Загрузить и проверить/ }).click();
  await expect(page.getByRole('region', { name: 'Будут созданы страницы' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Импортировать', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Импорт завершён' })).toBeVisible({ timeout: 30_000 });
  await page.locator('.imp-file a').first().click();
  await page.waitForURL(/\/p\/[0-9a-f-]{36}/);
  return page.url().split('/p/')[1].split(/[?#]/)[0];
}

async function exportFromMenu(page: Page, format: RegExp) {
  await page.getByRole('button', { name: 'Действия со страницей', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Экспорт…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Экспорт' });
  await dialog.getByRole('radio', { name: format }).click();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Экспортировать' }).click();
  const d = await download;
  const file = readFileSync((await d.path())!);
  const ready = dialog.getByText(/Файл готов/);
  await expect(ready).toBeVisible();
  // The dialog names the saved file (blob downloads in headless Chromium report no suggested name).
  const name = /Файл готов: (.+?)( \(|\.$)/.exec((await ready.textContent()) ?? '')?.[1] ?? d.suggestedFilename();
  await expect(dialog.getByText(/SHA-256: [0-9a-f]{64}/)).toBeVisible(); // integrity checksum shown to the user
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).last().click();
  return { file, name };
}

test('DOCX import → edit in the editor → DOCX and Markdown export from the page menu keep the structure and the edit (E225, SC-13, R-EXPORT-006, R-EXPORT-012)', async ({ page }) => {
  await ensureOwner(page);
  const id = await importFile(page, 'регламент.docx', await specToDocx(SPEC));
  await expect(page.getByLabel('Название страницы')).toHaveValue('Регламент E2E');
  await expect(editor(page).locator('h1', { hasText: 'Назначение' })).toBeVisible();
  await expect(editor(page).getByLabel('Подпись к изображению')).toHaveValue('Рисунок 1 — Стойка');
  await expect(editor(page).locator('img[alt="Схема стойки"]')).toBeVisible();
  // Edit like a user.
  // Click at the very start of the paragraph (its middle is a link), then go to its end.
  await editor(page).locator('p', { hasText: 'Документ описывает' }).click({ position: { x: 3, y: 8 } });
  await page.keyboard.press('End');
  await page.keyboard.type(' Правка из браузера.');
  await expectSaved(page);
  expect(JSON.stringify((await apiContent(page.request, id)).content)).toContain('Правка из браузера.');

  const docx = await exportFromMenu(page, /Word \(DOCX\)/);
  expect(docx.name).toMatch(/\.docx$/);
  const v = await validateDocx(docx.file);
  expect(v.errors).toEqual([]);
  expect(v.stats.tables).toBe(2);
  expect(v.stats.images).toBe(1);
  expect(v.stats.numberedParagraphs).toBe(4);
  const xml = (await unzipEntries(docx.file)).get('word/document.xml')!.toString('utf8');
  expect(xml).toContain('Правка из браузера.');
  expect(xml).toContain('w:val="Caption"');

  const md = await exportFromMenu(page, /^Markdown Текст/);
  const text = md.name.endsWith('.zip') ? [...(await unzipEntries(md.file)).entries()].filter(([k]) => k.endsWith('.md')).map(([, v]) => v.toString('utf8')).join('\n') : md.file.toString('utf8');
  expect(text).toContain('# Регламент E2E');
  expect(text).toContain('Правка из браузера.');
  expect(text).toMatch(/1\. Подготовка\n\s+1\. Проверка стойки\n\s+1\. Замер питания/);
  expect(text).toMatch(/\| \*\*Узел\*\* +\| \*\*Адрес\*\*/);
  expect(text).toContain('```');

  // The exported DOCX imports back with the same blocks (round trip through the browser import).
  const back = await importFile(page, 'регламент-экспорт.docx', docx.file);
  const types = (c: any) => c.content.map((b: any) => b.type).filter((t: string) => t !== 'toc');
  expect(types((await apiContent(page.request, back)).content)).toEqual(types((await apiContent(page.request, id)).content));
});

test('Markdown file import → edit → Markdown export round trip (E225, R-EXPORT-012)', async ({ page }) => {
  await ensureOwner(page);
  const src = '# Заметка E2E\n\nТекст с **жирным**, *курсивом* и `кодом`.\n\n- [x] сделано\n- [ ] не сделано\n\n| A | B |\n|---|---|\n| 1 | 2 |\n';
  const id = await importFile(page, 'заметка.md', Buffer.from(src, 'utf8'));
  await editor(page).locator('p', { hasText: 'Текст с' }).click({ position: { x: 3, y: 8 } });
  await page.keyboard.press('End');
  await page.keyboard.type(' Дополнено.');
  await expectSaved(page);
  const md = await exportFromMenu(page, /^Markdown Текст/);
  const out = md.file.toString('utf8');
  expect(out).toContain('Текст с **жирным**, *курсивом* и `кодом`. Дополнено.');
  expect(out).toContain('- [x] сделано');
  expect(out).toContain('| A | B |');
  expect((await apiContent(page.request, id)).content.content.map((b: any) => b.type)).toEqual(['paragraph', 'taskList', 'table']);
});

test('background export of a branch can be cancelled from the dialog; separate-files ZIP option (R-EXPORT-022)', async ({ page }) => {
  await ensureOwner(page);
  const spaces = await (await page.request.get('/api/v1/spaces')).json();
  const spaceId = spaces.spaces.find((s: any) => s.kind === 'org').id;
  const root = (await api(page, 'POST', '/api/v1/pages', { spaceId, title: 'Большой раздел E2E' })).page;
  for (let i = 0; i < 40; i++) await api(page, 'POST', '/api/v1/pages', { spaceId, parentId: root.id, title: `Подраздел ${i + 1}` });
  await page.goto(`/p/${root.id}`);
  await page.getByRole('button', { name: 'Действия со страницей', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Экспорт…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Экспорт' });
  await dialog.getByRole('radio', { name: /^PDF/ }).click();
  await dialog.getByRole('radio', { name: 'Страницу со всеми подстраницами' }).check();
  await dialog.getByRole('radio', { name: /Отдельными файлами \(ZIP/ }).check();
  await dialog.getByRole('button', { name: 'Экспортировать' }).click();
  await dialog.getByRole('button', { name: 'Отменить экспорт' }).click();
  await expect(dialog.getByText('Экспорт отменён. Файл не создан.')).toBeVisible({ timeout: 30_000 });
  const jobs = await (await page.request.get('/api/v1/jobs')).json();
  const job = jobs.jobs.find((j: any) => j.type === 'export');
  expect(job.status).toBe('cancelled');
});

test('archive restore dialog: the administrator chooses a new isolated space as the target (R-ARCHIVE-006, R-ARCHIVE-016)', async ({ page }) => {
  await ensureOwner(page);
  const spaces = await (await page.request.get('/api/v1/spaces')).json();
  const spaceId = spaces.spaces.find((s: any) => s.kind === 'org').id;
  await api(page, 'POST', '/api/v1/pages', { spaceId, title: 'Страница для архива E2E' });
  const { jobId } = await api(page, 'POST', '/api/v1/admin/archives', { password: 'Owner-password-1', confirm: true });
  await expect.poll(async () => (await (await page.request.get(`/api/v1/admin/archives/${jobId}`)).json()).status, { timeout: 60_000 }).toBe('succeeded');
  const zip = await (await page.request.get(`/api/v1/admin/archives/${jobId}/download`)).body();
  const csrf = (await page.context().storageState()).cookies.find((c) => c.name === 'kb_csrf')?.value ?? '';
  const up = await page.request.post('/api/v1/admin/archives/restore', { multipart: { file: { name: 'archive.zip', mimeType: 'application/zip', buffer: zip } }, headers: { 'x-csrf-token': csrf } });
  expect(up.ok(), await up.text()).toBeTruthy();
  await page.goto('/admin/archives');
  await page.getByRole('button', { name: 'Продолжить' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: /В новое изолированное пространство/ }).check();
  await dialog.getByLabel('Название нового пространства').fill('Проверка архива E2E');
  await dialog.getByLabel('Ваш пароль').fill('Owner-password-1');
  await dialog.getByRole('checkbox', { name: /подтверждаю восстановление/ }).check();
  await dialog.getByRole('button', { name: 'Восстановить' }).click();
  await expect(dialog.getByRole('button', { name: 'Готово' })).toBeVisible({ timeout: 60_000 });
  const after = await (await page.request.get('/api/v1/spaces')).json();
  const restored = after.spaces.find((s: any) => s.name === 'Проверка архива E2E');
  expect(restored).toBeTruthy();
  // Each archived space is a top-level folder page of the new space; the archived pages are inside it.
  const tree = await (await page.request.get(`/api/v1/spaces/${restored.id}/tree`)).json();
  const folder = tree.nodes.find((n: any) => n.title === 'Общее');
  expect(folder).toBeTruthy();
  const inner = await (await page.request.get(`/api/v1/spaces/${restored.id}/tree?parentId=${folder.id}`)).json();
  expect(inner.nodes.map((n: any) => n.title)).toContain('Страница для архива E2E');
});
