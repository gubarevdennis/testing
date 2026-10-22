import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { useUi } from '../state/ui';

const HINTS = [
  { id: 'slash', route: /^\/p\//, title: 'Команды через «/»', text: 'Нажмите «/» в пустой строке, чтобы вставить заголовок, таблицу, изображение, колонки и другие блоки.' },
  { id: 'drag', route: /^\/p\//, title: 'Перемещение блоков', text: 'Наведите на блок — слева появятся «+» и ручка ⋮⋮. Тяните за ручку, чтобы переместить блок, или нажмите на неё для меню действий.' },
  { id: 'tree', route: /^\/$/, title: 'Структура базы знаний', text: 'Наведите на раздел в боковой панели и нажмите «+», чтобы создать вложенную страницу. Перетаскивайте страницы, чтобы изменить структуру.' },
];

/** One-time unobtrusive hints; each can be dismissed, all can be disabled (Справка). */
export function OnboardingHints() {
  const { seenHints, markHint, hintsDisabled, setHintsDisabled } = useUi();
  const location = useLocation();
  const [hint, setHint] = useState<(typeof HINTS)[number] | null>(null);
  useEffect(() => {
    if (hintsDisabled) return setHint(null);
    const h = HINTS.find((x) => !seenHints[x.id] && x.route.test(location.pathname));
    const t = setTimeout(() => setHint(h ?? null), 1200);
    return () => clearTimeout(t);
  }, [location.pathname, seenHints, hintsDisabled]);
  if (!hint) return null;
  return (
    <div className="onboarding-hint" role="note" aria-label={hint.title}>
      <div className="row">
        <b className="grow">{hint.title}</b>
        <button className="icon-btn sm" aria-label="Закрыть подсказку" onClick={() => markHint(hint.id)}>
          <X size={14} />
        </button>
      </div>
      <p className="small">{hint.text}</p>
      <div className="row">
        <button className="btn sm primary" onClick={() => markHint(hint.id)}>
          Понятно
        </button>
        <button className="btn sm ghost" onClick={() => setHintsDisabled(true)}>
          Не показывать подсказки
        </button>
      </div>
    </div>
  );
}
