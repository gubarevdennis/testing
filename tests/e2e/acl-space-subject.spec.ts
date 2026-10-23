import { test, expect } from '@playwright/test';
import { ensureOwner, newPage, createUser, login_, api } from './helpers';

/**
 * R-ACL-036 in the Share UI: a page is shared with «Участники пространства X»; the dialog previews the people who
 * gain access, the grant is listed under the space's name with its member count, members open the page, and a member
 * removed from X loses access at once.
 */
test('R-ACL-036: share a page with the members of a space — preview, grant, member opens it, leaving the space revokes it', async ({ page, browser }) => {
  await ensureOwner(page);
  const mira = await createUser(page.request, 'Мира Омегина');
  const X = (await api(page, 'POST', '/api/v1/spaces', { name: 'Проект Омега', kind: 'project', visibility: 'private' })).space;
  const membership = (await api(page, 'PUT', '/api/v1/grants', { resourceType: 'space', resourceId: X.id, subjectType: 'user', subjectId: mira.id, level: 'view' })).grant;
  const id = await newPage(page, 'Смета Омеги');

  await page.getByRole('button', { name: 'Поделиться' }).click();
  const dlg = page.getByRole('dialog', { name: /Доступ: Смета Омеги/ });
  await dlg.getByPlaceholder('Имя, e-mail или группа').fill('Омега');
  await dlg.getByRole('option', { name: /Участники пространства «Проект Омега»/ }).click();
  await expect(dlg.locator('.share-chip', { hasText: 'Участники пространства «Проект Омега»' })).toBeVisible();
  await dlg.locator('#share-level').selectOption('comment');
  await expect(dlg.getByText(/Доступ к странице впервые получат .*Мира Омегина/)).toBeVisible();
  await dlg.getByRole('button', { name: 'Выдать доступ' }).click();
  await expect(dlg.getByLabel('Уровень доступа: Участники пространства «Проект Омега»')).toHaveValue('comment');
  await expect(dlg.getByText(/Все, кто участвует в пространстве · сейчас 2 чел\./)).toBeVisible(); // Mira and the creator of X

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/p/' + id);
  await login_(p2, mira.email, mira.password);
  await expect(p2.getByLabel('Название страницы')).toHaveValue('Смета Омеги');

  // Mira leaves the space → the page is no longer available to her.
  await api(page, 'DELETE', `/api/v1/grants/${membership.id}`);
  await p2.reload();
  await expect(p2.getByText('Страница не найдена или у вас нет доступа')).toBeVisible();
  await ctx.close();
});
