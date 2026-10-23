import { test, expect, type Page } from '@playwright/test';
import { ensureOwner, newPage, editor, expectSaved, api, apiContent, caretIn } from './helpers';

async function openHistory(page: Page) {
  await page.locator('.page-header-bar').getByRole('button', { name: 'Действия со страницей' }).click();
  await page.getByRole('menuitem', { name: 'История версий' }).click();
  return page.getByRole('complementary', { name: 'Боковая панель' });
}

async function saveVersion(page: Page, panel: ReturnType<Page['getByRole']>, label: string) {
  await panel.getByRole('button', { name: /Сохранить версию/ }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('textbox').first().fill(label);
  await dlg.getByRole('button', { name: /Сохранить/ }).click();
  await expect(panel.getByText(label)).toBeVisible();
}

test('R-HISTORY-013, V16-S11: compare shows text and property changes highlighted; restore shows an exact preview and brings back properties as a new version', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Сравнение свойств');
  await page.keyboard.type('Срок хранения 3 года');
  await expectSaved(page);
  await api(page, 'PATCH', `/api/v1/pages/${id}`, { icon: '📁', tags: ['архив'], properties: { Отдел: 'Бухгалтерия' } });
  const panel = await openHistory(page);
  await saveVersion(page, panel, 'Исходная редакция');

  await caretIn(page, 'Срок хранения 3 года');
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('5 лет');
  await expectSaved(page);
  await api(page, 'PATCH', `/api/v1/pages/${id}`, { icon: '🗄️', tags: ['архив', 'финансы'], properties: { Отдел: 'Финансы' } });

  await panel.getByText('Исходная редакция').click();
  await panel.getByRole('tab', { name: /Сравнить с текущей/ }).click();
  const props = panel.getByTestId('props-diff');
  await expect(props.locator('[data-field="icon"] del')).toHaveText('📁');
  await expect(props.locator('[data-field="icon"] ins')).toHaveText('🗄️');
  await expect(props.locator('[data-field="tags"] ins')).toHaveText('#финансы');
  await expect(props.locator('[data-field="properties"]')).toContainText('Отдел:');
  await expect(props.locator('[data-field="properties"] del')).toHaveText('Бухгалтерия');
  await expect(props.locator('[data-field="properties"] ins')).toHaveText('Финансы');
  await expect(panel.locator('.diff-block.changed del.diff-del').filter({ hasText: '3' }).first()).toBeVisible();
  await expect(panel.locator('.diff-block.changed ins.diff-ins').filter({ hasText: '5' }).first()).toBeVisible();

  const revsBefore = (await (await page.request.get(`/api/v1/pages/${id}/revisions?limit=200`)).json()).revisions.length;
  await panel.getByRole('button', { name: /Восстановить эту версию/ }).click();
  const dlg = page.getByTestId('restore-preview');
  await expect(dlg).toContainText('изменится 1');
  await expect(dlg).toContainText(/Более поздние версии \(\d+\) останутся в истории/);
  await expect(dlg).toContainText('Не меняются: Значок, Теги, Свойства');
  await page.getByRole('checkbox', { name: /Вернуть и свойства страницы/ }).check();
  await expect(dlg.getByTestId('props-diff').locator('[data-field="icon"] ins')).toHaveText('📁');
  await page.getByRole('dialog').getByRole('button', { name: 'Восстановить', exact: true }).click();
  await expect(page.locator('.toast').filter({ hasText: /восстановлена как версия \d+\. Прежнее состояние сохранено как версия \d+/ })).toBeVisible();
  await expect(editor(page)).toContainText('Срок хранения 3 года', { timeout: 15_000 });
  const pageDto = (await (await page.request.get(`/api/v1/pages/${id}`)).json()).page;
  expect(pageDto).toMatchObject({ icon: '📁', tags: ['архив'], properties: { Отдел: 'Бухгалтерия' } });
  const revs = (await (await page.request.get(`/api/v1/pages/${id}/revisions?limit=200`)).json()).revisions;
  expect(revs.length).toBe(revsBefore + 2); // pre-restore + restore; nothing deleted
  expect(revs.map((r: any) => r.label)).toContain('Исходная редакция');
});

test('R-HISTORY-013: one block is restored from a version after a preview, as a new version', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Восстановление блока');
  await page.keyboard.type('Пункт первый');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Пункт второй');
  await expectSaved(page);
  const panel = await openHistory(page);
  await saveVersion(page, panel, 'До порчи');
  await caretIn(page, 'Пункт второй');
  await page.keyboard.press('End');
  await page.keyboard.type(' испорчен');
  await caretIn(page, 'Пункт первый');
  await page.keyboard.press('End');
  await page.keyboard.type(' и дополнен');
  await expectSaved(page);

  await panel.getByText('До порчи').click();
  await panel.getByRole('tab', { name: /Сравнить с текущей/ }).click();
  const block = panel.locator('.diff-block.changed').filter({ hasText: 'испорчен' });
  await block.hover();
  await block.getByRole('button', { name: 'Восстановить блок' }).click();
  const pv = page.getByTestId('restore-block-preview');
  await expect(pv.locator('del.diff-del')).toContainText('испорчен');
  await expect(pv).toContainText('Остальной текст не меняется');
  await page.getByRole('dialog').getByRole('button', { name: 'Заменить блок' }).click();
  await expect(page.locator('.toast').filter({ hasText: /Блок заменён содержимым из версии — новая версия \d+/ })).toBeVisible();
  await expect.poll(async () => JSON.stringify((await apiContent(page.request, id)).content)).not.toContain('испорчен');
  const c = JSON.stringify((await apiContent(page.request, id)).content);
  expect(c).toContain('Пункт первый и дополнен'); // the other block keeps its later edit
  await expect(editor(page)).not.toContainText('испорчен');
  const revs = (await (await page.request.get(`/api/v1/pages/${id}/revisions?limit=50`)).json()).revisions;
  expect(revs[0]).toMatchObject({ kind: 'restore', label: expect.stringContaining('Восстановлен блок из версии') });
  expect(revs[1].kind).toBe('pre-restore');
});

test('R-HISTORY-002: a property change (icon, tag) offers «Отменить» right away; tags are editable and searchable', async ({ page }) => {
  await ensureOwner(page);
  const id = await newPage(page, 'Отмена свойств');
  await page.keyboard.type('Текст страницы про отпуск');
  await expectSaved(page);
  await page.locator('.page-header-bar').getByRole('button', { name: 'Действия со страницей' }).click();
  await page.getByRole('menuitem', { name: 'Сведения о странице' }).click();
  const tags = page.getByTestId('page-tags');
  await page.getByRole('textbox', { name: 'Новый тег' }).fill('Кадры');
  await page.getByRole('textbox', { name: 'Новый тег' }).press('Enter');
  await expect(tags).toContainText('#Кадры');
  const t = page.locator('.toast').filter({ hasText: 'Тег «Кадры» добавлен' });
  await t.getByRole('button', { name: 'Отменить' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Изменение отменено' })).toBeVisible();
  await expect(tags).not.toContainText('#Кадры');
  await page.getByRole('textbox', { name: 'Новый тег' }).fill('Льготы');
  await page.getByRole('textbox', { name: 'Новый тег' }).press('Enter');
  await expect(tags).toContainText('#Льготы');
  // the tag link searches by tag
  await tags.getByRole('link', { name: '#Льготы' }).click();
  await expect(page.getByTestId('search-tag-filter')).toContainText('#Льготы');
  await expect(async () => {
    await page.reload();
    await expect(page.locator('main').getByRole('link', { name: /Отмена свойств/ }).first()).toBeVisible({ timeout: 2000 });
    await expect(page.locator('main').getByText('В тегах').first()).toBeVisible();
  }).toPass({ timeout: 30_000 });
  const tagsNow = (await (await page.request.get(`/api/v1/pages/${id}`)).json()).page.tags;
  expect(tagsNow).toEqual(['Льготы']);
});
