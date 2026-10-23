import { test, expect } from '@playwright/test';
import { ensureOwner, newPage, editor, expectSaved, createUser, login_, api, apiContent, caretIn } from './helpers';

/**
 * ROUTE-02 — the author's route end to end: personal draft → offline editing → synchronisation → move into a department
 * with a preview of who will see it → approval → publication → an update and a rollback to the published version.
 */
test.setTimeout(180_000);

test('ROUTE-02: draft → offline → sync → move to a department with visibility preview → approval → publication → update and rollback', async ({ page, browser }) => {
  await ensureOwner(page);
  const tag = Math.floor(Math.random() * 1e6);
  const boris = await createUser(page.request, `Борис Согласующий ${tag}`);
  const vera = await createUser(page.request, `Вера Читатель ${tag}`);
  const deptName = `Отдел кадров ${tag}`;
  const dept = (
    await api(page, 'POST', '/api/v1/spaces', {
      name: deptName,
      kind: 'department',
      visibility: 'closed',
      orgLevel: null,
      users: [
        { userId: boris.id, level: 'full' },
        { userId: vera.id, level: 'view' },
      ],
      policy: { publishingMode: 'publish', requireApproval: true },
    })
  ).space;

  // 1. personal draft
  const id = await newPage(page, `Регламент отпусков ${tag}`);
  await page.keyboard.type('Черновик автора.');
  await expectSaved(page);
  expect((await (await page.request.get(`/api/v1/pages/${id}`)).json()).page.space.kind).toBe('personal');

  // 2. offline editing with an honest status, 3. synchronisation after reconnect
  await page.context().setOffline(true);
  await caretIn(page, 'Черновик автора.');
  await page.keyboard.press('End');
  await page.keyboard.type(' Правка без сети.');
  await expect(page.getByText('Сохранено на устройстве')).toBeVisible({ timeout: 10_000 });
  await page.context().setOffline(false);
  await expectSaved(page);
  expect(JSON.stringify((await apiContent(page.request, id)).content)).toContain('Черновик автора. Правка без сети.');

  // 4. move into the department: the confirmation shows exactly who gains access
  await page.locator('.page-header-bar').getByRole('button', { name: 'Действия со страницей' }).click();
  await page.getByRole('menuitem', { name: 'Переместить в…' }).click();
  const move = page.getByRole('dialog', { name: /Переместить/ });
  await move.getByRole('button', { name: new RegExp(deptName) }).click();
  await move.getByRole('button', { name: 'Переместить сюда' }).click();
  const audience = page.getByRole('dialog', { name: 'Изменится круг доступа' });
  await expect(audience).toContainText(deptName);
  await expect(audience).toContainText(`Борис Согласующий ${tag}`);
  await expect(audience).toContainText(`Вера Читатель ${tag}`);
  await audience.getByRole('button', { name: 'Переместить' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'перемещена' })).toBeVisible();
  await expect.poll(async () => (await (await page.request.get(`/api/v1/pages/${id}`)).json()).page.spaceId).toBe(dept.id);
  // before publication the reader does not see the content
  const ctxV = await browser.newContext();
  const pv = await ctxV.newPage();
  await pv.goto('/p/' + id);
  await login_(pv, vera.email, vera.password);
  await expect(pv.getByRole('navigation', { name: 'Навигация' })).toBeVisible({ timeout: 15_000 });
  const before = await (await pv.request.get(`/api/v1/pages/${id}/content`)).json();
  expect(before, JSON.stringify(before)).toMatchObject({ mode: 'published', published: false });

  // 5. approval request
  await page.reload();
  const bar = page.getByRole('region', { name: 'Публикация' });
  await bar.getByRole('button', { name: 'Отправить на согласование' }).click();
  const submit = page.getByRole('dialog', { name: 'Отправить на согласование' });
  await submit.getByRole('textbox', { name: /Сообщение/ }).fill('Прошу согласовать новую редакцию');
  await submit.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(bar).toContainText('Прошу согласовать новую редакцию');

  // 6. the approver approves → published
  const ctxB = await browser.newContext();
  const pb = await ctxB.newPage();
  await pb.goto('/p/' + id);
  await login_(pb, boris.email, boris.password);
  const barB = pb.getByRole('region', { name: 'Публикация' });
  await barB.getByRole('button', { name: 'Согласовать' }).click();
  await pb.getByRole('dialog', { name: 'Согласовать и опубликовать' }).getByRole('button', { name: 'Согласовать', exact: true }).click();
  await expect(pb.locator('.toast').filter({ hasText: 'Согласовано и опубликовано' })).toBeVisible();
  await expect.poll(async () => (await (await pv.request.get(`/api/v1/pages/${id}/content`)).json()).published).toBe(true);
  const published = await (await pv.request.get(`/api/v1/pages/${id}/content`)).json();
  expect(JSON.stringify(published.content)).toContain('Черновик автора. Правка без сети.');

  // 7. update: the author edits; readers keep seeing the published version
  await page.reload();
  await caretIn(page, 'Правка без сети.');
  await page.keyboard.press('End');
  await page.keyboard.type(' Неудачная правка.');
  await expectSaved(page);
  expect(JSON.stringify((await (await pv.request.get(`/api/v1/pages/${id}/content`)).json()).content)).not.toContain('Неудачная правка');

  // 8. rollback to the published version from the history, as a new version
  await page.locator('.page-header-bar').getByRole('button', { name: 'Действия со страницей' }).click();
  await page.getByRole('menuitem', { name: 'История версий' }).click();
  const panel = page.getByRole('complementary', { name: 'Боковая панель' });
  await panel.locator('.rev-item').filter({ has: page.locator('.badge.green', { hasText: 'Опубликована' }) }).first().click();
  await panel.getByRole('button', { name: /Восстановить эту версию/ }).click();
  await expect(page.getByTestId('restore-preview')).toContainText('изменится 1');
  await page.getByRole('dialog').getByRole('button', { name: 'Восстановить', exact: true }).click();
  await expect(editor(page)).not.toContainText('Неудачная правка', { timeout: 15_000 });
  await expectSaved(page);
  const revs = (await (await page.request.get(`/api/v1/pages/${id}/revisions?limit=50`)).json()).revisions;
  expect(revs[0].kind).toBe('restore');
  expect(revs.some((r: any) => r.kind === 'pre-restore')).toBe(true); // the failed edit is still in the history
  expect(JSON.stringify((await apiContent(page.request, id)).content)).not.toContain('Неудачная правка');
  await ctxV.close();
  await ctxB.close();
});
