import { useEffect, useState } from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { get } from '../api/client';
import type { TreeNode } from '../api/types';
import { useSpaces } from '../hooks/data';
import { movePage } from '../layout/treeActions';

/** Keyboard-friendly alternative to drag-and-drop: pick a destination by search or by browsing spaces. */
export function MoveDialog({ node, onClose }: { node: Pick<TreeNode, 'id' | 'title' | 'spaceId'>; onClose(): void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Array<{ pageId: string; title: string; icon: string | null; spaceId: string }>>([]);
  const [browse, setBrowse] = useState<{ spaceId: string; parentId: string | null; path: string[] } | null>(null);
  const [children, setChildren] = useState<TreeNode[]>([]);
  const [busy, setBusy] = useState(false);
  const spaces = useSpaces();
  useEffect(() => {
    if (!q.trim()) return setResults([]);
    const t = setTimeout(() => get(`/api/v1/search/suggest?q=${encodeURIComponent(q)}`).then((r) => setResults(r.suggestions.filter((s: any) => s.pageId !== node.id))), 150);
    return () => clearTimeout(t);
  }, [q, node.id]);
  useEffect(() => {
    if (!browse) return;
    get(`/api/v1/spaces/${browse.spaceId}/tree${browse.parentId ? '?parentId=' + browse.parentId : ''}`).then((r) => setChildren(r.nodes.filter((n: TreeNode) => n.id !== node.id)));
  }, [browse, node.id]);
  const go = async (target: Parameters<typeof movePage>[2]) => {
    setBusy(true);
    const ok = await movePage(node.id, node.title, target);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Dialog open title={`Переместить «${node.title || 'Без названия'}»`} onClose={onClose} size="wide">
      <div className="col" style={{ gap: 12 }}>
        <input className="input" placeholder="Найти страницу назначения…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск страницы назначения" autoFocus />
        {q ? (
          <div className="pick-list" role="listbox" aria-label="Результаты">
            {results.map((r) => (
              <button key={r.pageId} className="pick-item" role="option" aria-selected={false} disabled={busy} onClick={() => go({ targetSpaceId: r.spaceId, targetParentId: r.pageId, position: 'end' })}>
                <span>{r.icon ?? <FileText size={15} />}</span>
                <span className="ellipsis">{r.title || 'Без названия'}</span>
                <span className="muted small">внутрь</span>
              </button>
            ))}
            {!results.length && <div className="muted small" style={{ padding: 8 }}>Ничего не найдено</div>}
          </div>
        ) : browse ? (
          <div className="col">
            <div className="row small muted">
              <button className="btn ghost sm" onClick={() => setBrowse(null)}>Пространства</button>
              {browse.path.map((p, i) => (
                <span key={i} className="row">
                  <ChevronRight size={12} /> {p}
                </span>
              ))}
            </div>
            <button className="btn" disabled={busy} onClick={() => go({ targetSpaceId: browse.spaceId, targetParentId: browse.parentId, position: 'end' })}>
              Переместить сюда
            </button>
            <div className="pick-list">
              {children.map((c) => (
                <div key={c.id} className="pick-item">
                  <span>{c.icon ?? <FileText size={15} />}</span>
                  <span className="ellipsis grow">{c.title || 'Без названия'}</span>
                  <button className="btn sm" disabled={busy || !c.canCreate} onClick={() => go({ targetSpaceId: c.spaceId, targetParentId: c.id, position: 'end' })}>
                    Внутрь
                  </button>
                  <button className="btn sm ghost" onClick={() => setBrowse({ spaceId: c.spaceId, parentId: c.id, path: [...browse.path, c.title || 'Без названия'] })} aria-label={`Открыть «${c.title}»`}>
                    <ChevronRight size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="pick-list">
            {(spaces.data?.spaces ?? [])
              .filter((s) => s.member && s.actions.create)
              .map((s) => (
                <button key={s.id} className="pick-item" onClick={() => setBrowse({ spaceId: s.id, parentId: null, path: [s.name] })}>
                  <span>{s.icon ?? '🗂'}</span>
                  <span className="ellipsis grow">{s.name}</span>
                  <ChevronRight size={14} />
                </button>
              ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
