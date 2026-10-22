import { describe, it, expect } from 'vitest';
import { explainError } from '../../apps/web/src/api/client';

/** R-UI-052: an error message answers what happened, whether the data was saved, what to do and how to retry. */
describe('error message template (R-UI-052, R-UI-009)', () => {
  it('R-UI-052: server failure on a change says it was not saved, how to retry and gives the request code', () => {
    const m = explainError(500, 'Внутренняя ошибка сервера', 'POST', 'corr-1');
    expect(m).toBe('Внутренняя ошибка сервера. Изменение не сохранено. Повторите попытку через несколько секунд; если ошибка повторяется — сообщите администратору. Код обращения: corr-1.');
  });

  it('R-UI-052: missing rights explain what to do; reads do not talk about saving', () => {
    expect(explainError(403, undefined, 'PUT')).toBe('Недостаточно прав для этого действия. Изменение не сохранено. Запросите доступ у владельца страницы или администратора.');
    expect(explainError(403, 'Нет доступа', 'GET')).toBe('Нет доступа. Запросите доступ у владельца страницы или администратора.');
  });

  it('R-UI-052: conflict, size and rate limits name the next step', () => {
    expect(explainError(409, undefined, 'PATCH')).toMatch(/другой пользователь\. Изменение не сохранено\. Обновите страницу/);
    expect(explainError(413, 'Превышен допустимый размер', 'POST')).toMatch(/Уменьшите размер файла/);
    expect(explainError(429, 'Слишком много запросов', 'POST')).toMatch(/Подождите минуту/);
  });

  it('does not repeat what the server message already says', () => {
    const db = 'База данных временно недоступна. Изменение не сохранено — повторите попытку через несколько секунд.';
    expect(explainError(503, db, 'POST')).toBe(db);
  });

  it('keeps validation, auth and not-found messages as they are (shown next to the field / page)', () => {
    expect(explainError(400, 'Название слишком длинное', 'POST')).toBe('Название слишком длинное');
    expect(explainError(401, 'Неверный пароль', 'POST')).toBe('Неверный пароль');
    expect(explainError(404, undefined, 'GET')).toBe('Объект не найден или удалён.');
    expect(explainError(418, undefined, 'GET')).toMatch(/^Запрос не выполнен \(код 418\)\. Повторите попытку/);
  });
});
