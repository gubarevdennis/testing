import { useMemo, useState } from 'react';
import { create } from 'zustand';
import { Dialog } from '../components/ui/Dialog';
import { formatShortcut } from '../components/ui/Tooltip';
import { useUi } from '../state/ui';

export const useHelp = create<{ isOpen: boolean; open(): void; close(): void }>((set) => ({ isOpen: false, open: () => set({ isOpen: true }), close: () => set({ isOpen: false }) }));

export const SHORTCUTS: Array<{ group: string; keys: string; action: string }> = [
  { group: 'Навигация', keys: 'Mod+K', action: 'Быстрый переход и поиск' },
  { group: 'Навигация', keys: 'Mod+\\', action: 'Показать или скрыть боковую панель' },
  { group: 'Навигация', keys: '?', action: 'Справка и горячие клавиши (F1)' },
  { group: 'Навигация', keys: 'Alt+Shift+↑/↓', action: 'Переместить страницу в дереве среди соседних' },
  { group: 'Навигация', keys: 'F2', action: 'Переименовать страницу в дереве' },
  { group: 'Редактор', keys: '/', action: 'Меню вставки блоков (поиск по-русски и по-английски)' },
  { group: 'Редактор', keys: '@', action: 'Упомянуть сотрудника или страницу' },
  { group: 'Редактор', keys: '[[', action: 'Ссылка на страницу (или создать вложенную)' },
  { group: 'Редактор', keys: 'Mod+B', action: 'Жирный' },
  { group: 'Редактор', keys: 'Mod+I', action: 'Курсив' },
  { group: 'Редактор', keys: 'Mod+U', action: 'Подчёркнутый' },
  { group: 'Редактор', keys: 'Mod+Shift+S', action: 'Зачёркнутый' },
  { group: 'Редактор', keys: 'Mod+E', action: 'Код в строке' },
  { group: 'Редактор', keys: 'Mod+K', action: 'Ссылка на выделенный текст' },
  { group: 'Редактор', keys: 'Mod+Z', action: 'Отменить своё последнее действие' },
  { group: 'Редактор', keys: 'Mod+Shift+Z', action: 'Повторить (также Ctrl+Y)' },
  { group: 'Редактор', keys: 'Mod+Shift+V', action: 'Вставить без форматирования' },
  { group: 'Редактор', keys: 'Mod+F', action: 'Поиск по странице' },
  { group: 'Редактор', keys: 'Mod+Shift+M', action: 'Комментарий к выделению' },
  { group: 'Редактор', keys: 'Mod+Alt+1…3', action: 'Заголовок 1–3' },
  { group: 'Редактор', keys: 'Mod+Shift+8', action: 'Маркированный список' },
  { group: 'Редактор', keys: 'Mod+Shift+7', action: 'Нумерованный список' },
  { group: 'Редактор', keys: 'Mod+Shift+9', action: 'Чек-лист' },
  { group: 'Редактор', keys: 'Tab / Shift+Tab', action: 'Вложенность списка или переход по ячейкам таблицы' },
  { group: 'Редактор', keys: 'Alt+Shift+↑/↓', action: 'Переместить блок вверх/вниз' },
  { group: 'Редактор', keys: 'Alt+Shift+↑/↓/←/→', action: 'В таблице — переместить строку или столбец' },
  { group: 'Редактор', keys: 'Mod+D', action: 'Дублировать блок' },
  { group: 'Редактор', keys: 'Esc', action: 'Выделить текущий блок / закрыть меню' },
  // R-EDITOR-065, R-EDITOR-034: the rules below are covered by tests/e2e/editor-p0-core.spec.ts ("key matrix…")
  { group: 'Клавиши в тексте и списках', keys: 'Enter', action: 'Новый абзац; в списке — следующий пункт того же уровня' },
  { group: 'Клавиши в тексте и списках', keys: 'Shift+Enter', action: 'Перенос строки внутри абзаца' },
  { group: 'Клавиши в тексте и списках', keys: 'Enter', action: 'Enter на пустом пункте списка — выход на уровень выше, с верхнего уровня — из списка в обычный абзац' },
  { group: 'Клавиши в тексте и списках', keys: 'Tab / Shift+Tab', action: 'Вложить пункт списка в предыдущий / вынести на уровень выше' },
  { group: 'Клавиши в тексте и списках', keys: 'Backspace', action: 'В начале пункта списка — пункт выносится из списка; в начале заголовка или цитаты — становится обычным абзацем; в начале абзаца — объединяется с предыдущим блоком; на пустом блоке — блок удаляется' },
  { group: 'Клавиши в тексте и списках', keys: 'Delete', action: 'В конце блока — объединение со следующим блоком' },
  { group: 'Клавиши в тексте и списках', keys: 'Mod+A', action: 'Выделить текст текущего блока, повторное нажатие — всю статью' },
  { group: 'Клавиши в тексте и списках', keys: 'Esc, Shift+↑/↓', action: 'Выделить блок, затем расширить выделение на соседние блоки' },
  { group: 'Markdown', keys: '# ␣', action: 'Заголовок 1 (## — 2 … ###### — 6)' },
  { group: 'Markdown', keys: '- ␣ или * ␣', action: 'Маркированный список' },
  { group: 'Markdown', keys: '1. ␣', action: 'Нумерованный список' },
  { group: 'Markdown', keys: '[] ␣', action: 'Чек-лист' },
  { group: 'Markdown', keys: '> ␣', action: 'Раскрывающийся блок (toggle)' },
  { group: 'Markdown', keys: '" ␣', action: 'Цитата' },
  { group: 'Markdown', keys: '---', action: 'Разделитель' },
  { group: 'Markdown', keys: '```', action: 'Блок кода' },
  { group: 'Markdown', keys: '**текст**', action: 'Жирный (*текст* — курсив, `текст` — код)' },
  { group: 'Изображения', keys: 'Колесо мыши', action: 'Масштаб относительно указателя' },
  { group: 'Изображения', keys: '+ / − / 0 / 1', action: 'Увеличить / уменьшить / вписать / 100%' },
  { group: 'Изображения', keys: '← / →', action: 'Предыдущее / следующее изображение' },
];

const ARTICLES = [
  { title: 'Как создать страницу', text: 'Наведите курсор на раздел в боковой панели и нажмите «+» — страница появится внутри раздела, курсор сразу будет в заголовке. Права доступа наследуются автоматически.' },
  { title: 'Как переместить страницу', text: 'Перетащите строку в дереве: линия показывает место «перед/после», подсветка — «внутрь». Esc отменяет перетаскивание, «Отменить» в уведомлении возвращает страницу. Без мыши: меню «•••» → «Переместить в…».' },
  { title: 'Как работают права', text: 'Доступ задаётся на уровне пространств и групп. Новые страницы наследуют права. Исключения — в окне «Поделиться». Перед расширением аудитории система показывает, кто получит доступ.' },
  { title: 'Сохранение и работа без сети', text: 'Изменения сохраняются автоматически. «Сохранено» появляется только после подтверждения сервером. Без сети правки остаются на устройстве и отправляются при подключении.' },
  { title: 'История и восстановление', text: 'Меню «•••» → «История»: версии, сравнение и восстановление (создаёт новую версию, прежняя история сохраняется). Удалённые страницы — в «Корзине» 90 дней.' },
  { title: 'Таблицы', text: 'Вставьте диапазон из Excel или используйте «/таблица». «+» на краях добавляют строки и столбцы, выделение ячеек позволяет выровнять, объединить и окрасить их.' },
  { title: 'Изображения и схемы', text: 'Вставьте скриншот из буфера или перетащите файл. Нажмите на изображение для полноэкранного просмотра: колесо — масштаб, перетаскивание — перемещение, двойной щелчок — увеличение.' },
  { title: 'Импорт и экспорт', text: 'Импорт DOCX, Markdown (в т. ч. ZIP), CSV и XLSX с предпросмотром. Экспорт страницы — меню «•••» → «Экспорт»: Markdown, DOCX, PDF, HTML.' },
];

export function HelpCenter() {
  const { isOpen, close } = useHelp();
  const [q, setQ] = useState('');
  const { hintsDisabled, setHintsDisabled } = useUi();
  const t = q.trim().toLowerCase();
  const shortcuts = useMemo(() => SHORTCUTS.filter((s) => !t || s.action.toLowerCase().includes(t) || s.keys.toLowerCase().includes(t)), [t]);
  const articles = ARTICLES.filter((a) => !t || a.title.toLowerCase().includes(t) || a.text.toLowerCase().includes(t));
  const groups = [...new Set(shortcuts.map((s) => s.group))];
  return (
    <Dialog open={isOpen} onClose={close} title="Справка" size="wide">
      <div className="col" style={{ gap: 16 }}>
        <input className="input" placeholder="Поиск по действиям и справке…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск по справке" />
        {articles.length > 0 && (
          <div className="help-articles">
            {articles.map((a) => (
              <details key={a.title} className="help-article">
                <summary>{a.title}</summary>
                <p>{a.text}</p>
              </details>
            ))}
          </div>
        )}
        {groups.map((g) => (
          <div key={g}>
            <h3 className="help-group">{g}</h3>
            <table className="table">
              <tbody>
                {shortcuts
                  .filter((s) => s.group === g)
                  .map((s) => (
                    <tr key={s.keys + s.action}>
                      <td style={{ width: 200 }}>
                        <kbd>{formatShortcut(s.keys)}</kbd>
                      </td>
                      <td>{s.action}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
        <label className="checkbox">
          <input type="checkbox" checked={!hintsDisabled} onChange={(e) => setHintsDisabled(!e.target.checked)} /> Показывать подсказки для новичков
        </label>
      </div>
    </Dialog>
  );
}
