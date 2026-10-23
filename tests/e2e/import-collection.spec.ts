import { test, expect } from '@playwright/test';
import { ensureOwner, api } from './helpers';

test('R-COLLECTION-003: import into an existing collection in «replace» mode — dry run lists the rows to remove, import waits for an explicit confirmation, removed rows go to the trash', async ({ page }) => {
  await ensureOwner(page);
  const spaces = await (await page.request.get('/api/v1/spaces')).json();
  const general = spaces.spaces.find((s: any) => s.kind === 'org');
  const name = 'Склад ' + Math.floor(Math.random() * 1e6);
  const created = await api(page, 'POST', '/api/v1/collections', { spaceId: general.id, name, schema: [{ id: 'qty', name: 'Остаток', type: 'number' }] });
  const collId = created.collection.id;
  for (const [title, qty] of [['A1', 1], ['A2', 2], ['A3', 3]] as const) await api(page, 'POST', `/api/v1/collections/${collId}/rows`, { title, values: { qty } });

  await page.goto('/import');
  await page.locator('input[type=file]').setInputFiles({ name: 'склад.csv', mimeType: 'text/csv', buffer: Buffer.from('Код;Остаток\nA1;10\nA4;40\n', 'utf8') });
  await page.getByLabel('Пространство').selectOption(general.id);
  await page.getByRole('button', { name: /Загрузить и проверить/ }).click();
  await page.locator('#imp-as').selectOption('collection', { timeout: 30_000 });
  await page.locator('#imp-coll').selectOption({ label: `В существующую: ${name}` });
  await page.locator('#imp-coll-mode').selectOption('replace');
  await page.getByRole('button', { name: /Пробный прогон/ }).click();
  const removes = page.getByTestId('replace-removes');
  await expect(page.getByText(/Будет добавлено: 1, обновлено: 1, будет удалено в корзину: 2/)).toBeVisible();
  await expect(removes).toContainText('A2, A3');
  const importBtn = page.getByRole('button', { name: 'Импортировать', exact: true });
  await expect(importBtn).toBeDisabled(); // nothing is removed without an explicit confirmation
  await removes.getByRole('checkbox').check();
  await importBtn.click();
  await expect(page.getByRole('status').filter({ hasText: 'Импорт завершён' })).toContainText('перемещено в корзину: 2', { timeout: 30_000 });
  const rows = await (await page.request.post(`/api/v1/collections/${collId}/query`, { data: { sorts: [{ fieldId: 'title', dir: 'asc' }] }, headers: { 'x-csrf-token': (await page.context().storageState()).cookies.find((c) => c.name === 'kb_csrf')?.value ?? '' } })).json();
  expect(rows.rows.map((r: any) => r.title)).toEqual(['A1', 'A4']);
  const trash = await (await page.request.get('/api/v1/trash')).json();
  expect(JSON.stringify(trash)).toContain('A2');
});
