import { useEffect, useState } from 'react';
import { FileText, ChevronLeft } from 'lucide-react';
import { Dialog } from '../components/ui/Dialog';
import { get } from '../api/client';
import { collectBlocks } from '@kb/shared';

interface Picked {
  id: string;
  title: string;
}

/** Picks a page (and optionally one of its blocks) by search, recent pages, or a pasted link. */
export function PagePicker({ title, withBlocks, onClose, onPick }: { title: string; withBlocks?: boolean; onClose(): void; onPick(p: Picked, blockId: string | null): void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Array<{ pageId: string; title: string; icon: string | null }>>([]);
  const [page, setPage] = useState<Picked | null>(null);
  const [blocks, setBlocks] = useState<Array<{ id: string; type: string; text: string }> | null>(null);
  useEffect(() => {
    const link = /\/p\/([0-9a-f-]{36})(?:\?block=([\w-]+)|#([\w-]+))?/.exec(q);
    if (link) {
      return void get<any>(`/api/v1/pages/${link[1]}`)
        .then((r) => {
          const p = { id: r.page.id, title: r.page.title };
          if (!withBlocks || link[2] || link[3]) onPick(p, link[2] ?? link[3] ?? null);
          else setPage(p);
        })
        .catch(() => setResults([]));
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      (q.trim()
        ? get<{ suggestions: any[] }>(`/api/v1/search/suggest?q=${encodeURIComponent(q)}`, ctrl.signal).then((r) => r.suggestions)
        : get<{ pages: any[] }>('/api/v1/me/recent', ctrl.signal).then((r) => r.pages.map((p) => ({ pageId: p.id, title: p.title, icon: p.icon })))
      )
        .then(setResults)
        .catch(() => undefined);
    }, 150);
    return () => (clearTimeout(t), ctrl.abort());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  useEffect(() => {
    if (!page || !withBlocks) return;
    setBlocks(null);
    get<{ content: any }>(`/api/v1/pages/${page.id}/content`)
      .then((r) => setBlocks(r.content ? collectBlocks(r.content).filter((b) => !b.parentId).map((b) => ({ id: b.id, type: b.type, text: b.text || docTextFallback(b.type) })) : []))
      .catch(() => setBlocks([]));
  }, [page, withBlocks]);
  return (
    <Dialog open onClose={onClose} title={title} size="wide">
      {!page ? (
        <div className="col" style={{ gap: 10 }}>
          <input className="input" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название страницы или вставьте ссылку" aria-label="Поиск страницы" />
          <div className="pick-list" role="listbox">
            {results.map((r) => (
              <button key={r.pageId} className="pick-item" role="option" aria-selected={false} onClick={() => (withBlocks ? setPage({ id: r.pageId, title: r.title }) : onPick({ id: r.pageId, title: r.title }, null))}>
                <span className="tree-icon">{r.icon ?? <FileText size={15} />}</span>
                <span className="ellipsis">{r.title || 'Без названия'}</span>
              </button>
            ))}
            {!results.length && <div className="muted small" style={{ padding: 8 }}>{q ? 'Ничего не найдено' : 'Нет недавних страниц'}</div>}
          </div>
        </div>
      ) : (
        <div className="col" style={{ gap: 10 }}>
          <div className="row">
            <button className="btn ghost sm" onClick={() => setPage(null)}>
              <ChevronLeft size={14} /> Назад
            </button>
            <b className="ellipsis">{page.title || 'Без названия'}</b>
          </div>
          <span className="small muted">Выберите блок — его содержимое будет показываться здесь и обновляться автоматически.</span>
          <div className="pick-list">
            {blocks === null && <div className="skeleton" style={{ height: 60 }} />}
            {blocks?.map((b) => (
              <button key={b.id} className="pick-item" onClick={() => onPick(page, b.id)}>
                <span className="badge">{TYPE_LABEL[b.type] ?? 'Текст'}</span>
                <span className="ellipsis">{b.text || '—'}</span>
              </button>
            ))}
            {blocks && !blocks.length && <div className="muted small">На странице нет блоков</div>}
          </div>
        </div>
      )}
    </Dialog>
  );
}

const TYPE_LABEL: Record<string, string> = { paragraph: 'Текст', heading: 'Заголовок', bulletList: 'Список', orderedList: 'Список', taskList: 'Чек-лист', blockquote: 'Цитата', codeBlock: 'Код', image: 'Изображение', table: 'Таблица', callout: 'Выделенный блок', columns: 'Колонки', fileBlock: 'Файл', mermaid: 'Схема', toc: 'Оглавление', details: 'Раскрывающийся блок' };
function docTextFallback(type: string) {
  return TYPE_LABEL[type] ?? '';
}
