const rtf = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });

export function relTime(d: string | Date | null | undefined): string {
  if (!d) return '';
  const t = new Date(d).getTime();
  const diff = (t - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'только что';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: new Date(d).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

export function fullTime(d: string | Date | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fileSize(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  if (n < 1024) return `${n} Б`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} КБ`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} МБ`;
  return `${(n / 1024 ** 3).toFixed(2)} ГБ`;
}

export const LEVEL_LABEL: Record<string, string> = { none: 'Нет доступа', view: 'Просмотр', comment: 'Комментирование', edit: 'Редактирование', full: 'Полный доступ' };
export const STATUS_LABEL: Record<string, string> = { draft: 'Черновик', review: 'На согласовании', published: 'Опубликовано', archived: 'Архив' };
