import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, Plus, MoreHorizontal, FileText, Lock, Users, Building2, Star, RotateCw, GripVertical, Table2 } from 'lucide-react';
import { get } from '../api/client';
import type { Space, TreeNode } from '../api/types';
import { useUi } from '../state/ui';
import { Menu, type MenuEntry } from '../components/ui/Menu';
import { Tooltip } from '../components/ui/Tooltip';
import { createPage, movePage, trashPage, duplicatePage, copyLink } from './treeActions';
import { MoveDialog } from '../components/MoveDialog';
import { IconPickerPopover } from '../components/IconPicker';
import { patch, ApiError } from '../api/client';
import { toast } from '../components/ui/Toast';
import { queryClient } from '../App';

const ROW_H = 32;
const INDENT = 14;

export type Row =
  | { kind: 'section'; key: string; id: string; label: string; collapsed: boolean; action?: () => void; actionLabel?: string }
  | { kind: 'space'; key: string; space: Space; expanded: boolean; depth: 0 }
  | { kind: 'node'; key: string; node: TreeNode; depth: number; expanded: boolean; parentKey: string | null }
  | { kind: 'loading'; key: string; depth: number }
  | { kind: 'error'; key: string; depth: number; retry: () => void; message: string }
  | { kind: 'empty'; key: string; depth: number; spaceId: string; parentId: string | null; canCreate: boolean }
  | { kind: 'more'; key: string; depth: number; spaceId: string; parentId: string | null };

interface Props {
  personal: Space | null;
  spaces: Space[];
  shared: TreeNode[];
  onNavigate?: () => void;
}

type ChildResult = { nodes: TreeNode[]; nextCursor: string | null };

/** All tree sections in one virtualised list (thousands of nodes stay smooth, keyboard navigation spans sections). */
export function SidebarTree({ personal, spaces, shared, onNavigate }: Props) {
  const { expanded, toggleExpanded, collapsedSections, toggleSection } = useUi();
  const navigate = useNavigate();
  const { pageId: currentPage } = useParams();
  const teamSpaces = spaces.filter((s) => !s.isPersonal && s.member);
  const discoverable = spaces.filter((s) => !s.isPersonal && !s.member);

  // Which child lists are needed: roots of expanded spaces + expanded nodes.
  const wanted = useMemo(() => {
    const keys: Array<{ spaceId: string; parentId: string | null }> = [];
    if (personal && !collapsedSections.personal) keys.push({ spaceId: personal.id, parentId: null });
    if (!collapsedSections.spaces) for (const s of teamSpaces) if (expanded['space:' + s.id]) keys.push({ spaceId: s.id, parentId: null });
    for (const id of Object.keys(expanded)) if (!id.startsWith('space:') && expanded[id]) keys.push({ spaceId: '', parentId: id });
    return keys;
  }, [personal, teamSpaces, expanded, collapsedSections]);

  // Node -> space map to know where expanded nodes live.
  const nodeSpace = useRef(new Map<string, string>());
  shared.forEach((n) => nodeSpace.current.set(n.id, n.spaceId));
  // Expanded nodes whose space is not known yet (their parent is still loading) are resolved on a later render.
  const resolved = wanted.map((w) => ({ spaceId: w.spaceId || nodeSpace.current.get(w.parentId!) || '', parentId: w.parentId })).filter((w) => w.spaceId);
  const queries = useQueries({
    queries: resolved.map((w) => ({
      queryKey: ['tree', w.spaceId, w.parentId ?? 'root'],
      queryFn: () => get<ChildResult>(`/api/v1/spaces/${w.spaceId}/tree${w.parentId ? `?parentId=${w.parentId}` : ''}`),
      staleTime: 30_000,
    })),
  });
  const childMap = new Map<string, { data?: ChildResult; isLoading: boolean; error: unknown; refetch: () => void }>();
  queries.forEach((q, i) => {
    const w = resolved[i];
    childMap.set(`${w.spaceId}:${w.parentId ?? 'root'}`, { data: q.data, isLoading: q.isLoading, error: q.error, refetch: q.refetch });
    q.data?.nodes.forEach((n) => nodeSpace.current.set(n.id, n.spaceId));
  });


  const rows = useMemo(() => {
    const out: Row[] = [];
    const pushChildren = (spaceId: string, parentId: string | null, depth: number, canCreate: boolean) => {
      const res = childMap.get(`${spaceId}:${parentId ?? 'root'}`);
      if (!res || res.isLoading) {
        out.push({ kind: 'loading', key: `l:${spaceId}:${parentId}`, depth });
        return;
      }
      if (res.error) {
        out.push({ kind: 'error', key: `e:${spaceId}:${parentId}`, depth, retry: res.refetch, message: res.error instanceof ApiError ? res.error.message : 'Ошибка загрузки' });
        return;
      }
      const nodes = res.data?.nodes ?? [];
      if (!nodes.length && depth <= 1) out.push({ kind: 'empty', key: `n:${spaceId}:${parentId}`, depth, spaceId, parentId, canCreate });
      for (const n of nodes) pushNode(n, depth, parentId);
      if (res.data?.nextCursor) out.push({ kind: 'more', key: `m:${spaceId}:${parentId}`, depth, spaceId, parentId });
    };
    const pushNode = (n: TreeNode, depth: number, parentKey: string | null) => {
      const isOpen = !!expanded[n.id] && n.hasChildren;
      out.push({ kind: 'node', key: 'p:' + n.id, node: n, depth, expanded: isOpen, parentKey });
      if (isOpen) pushChildren(n.spaceId, n.id, depth + 1, n.canCreate);
    };
    if (personal) {
      out.push({ kind: 'section', key: 's:personal', id: 'personal', label: 'Моё пространство', collapsed: !!collapsedSections.personal });
      if (!collapsedSections.personal) pushChildren(personal.id, null, 1, true);
    }
    if (teamSpaces.length || discoverable.length) {
      out.push({ kind: 'section', key: 's:spaces', id: 'spaces', label: 'Пространства', collapsed: !!collapsedSections.spaces });
      if (!collapsedSections.spaces)
        for (const s of teamSpaces) {
          const open = !!expanded['space:' + s.id];
          out.push({ kind: 'space', key: 'sp:' + s.id, space: s, expanded: open, depth: 0 });
          if (open) pushChildren(s.id, null, 1, !!s.actions.create);
        }
    }
    if (shared.length) {
      out.push({ kind: 'section', key: 's:shared', id: 'shared', label: 'Доступные мне', collapsed: !!collapsedSections.shared });
      if (!collapsedSections.shared) for (const n of shared) pushNode(n, 1, null);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personal, teamSpaces, shared, expanded, collapsedSections, queries.map((q) => q.dataUpdatedAt + ':' + q.status).join(',')]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 12 });

  // ---------------- keyboard navigation (roving tabindex)
  const [focusIdx, setFocusIdx] = useState(0);
  const focusRow = useCallback(
    (i: number) => {
      const idx = Math.max(0, Math.min(rows.length - 1, i));
      setFocusIdx(idx);
      virtualizer.scrollToIndex(idx, { align: 'auto' });
      requestAnimationFrame(() => (scrollRef.current?.querySelector(`[data-index="${idx}"] .tree-row-main`) as HTMLElement | null)?.focus());
    },
    [rows.length, virtualizer],
  );
  const toggleRow = (r: Row, value?: boolean) => {
    if (r.kind === 'node' && r.node.hasChildren) toggleExpanded(r.node.id, value);
    if (r.kind === 'space') toggleExpanded('space:' + r.space.id, value);
    if (r.kind === 'section') toggleSection(r.id);
  };
  const onKeyDown = (e: RKeyboardEvent, i: number) => {
    const r = rows[i];
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusRow(i + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusRow(i - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusRow(0);
        break;
      case 'End':
        e.preventDefault();
        focusRow(rows.length - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if ((r.kind === 'node' && r.node.hasChildren && !r.expanded) || (r.kind === 'space' && !r.expanded) || (r.kind === 'section' && r.collapsed)) toggleRow(r, true);
        else focusRow(i + 1);
        break;
      case 'ArrowLeft': {
        e.preventDefault();
        if ((r.kind === 'node' && r.expanded) || (r.kind === 'space' && r.expanded)) toggleRow(r, false);
        else if (r.kind === 'node') {
          // go to parent row
          for (let j = i - 1; j >= 0; j--) {
            const p = rows[j];
            if ((p.kind === 'node' && p.depth < r.depth) || p.kind === 'space' || p.kind === 'section') {
              focusRow(j);
              break;
            }
          }
        }
        break;
      }
      case 'Enter':
        e.preventDefault();
        if (r.kind === 'node') {
          navigate('/p/' + r.node.id);
          onNavigate?.();
        } else if (r.kind === 'space') navigate('/s/' + r.space.id);
        else toggleRow(r);
        break;
      case ' ':
        e.preventDefault();
        toggleRow(r);
        break;
      case 'F2':
        if (r.kind === 'node' && r.node.canEdit) setRenaming(r.node.id);
        break;
    }
    if (e.altKey && e.shiftKey && r.kind === 'node' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      // Keyboard alternative to drag-and-drop: reorder among siblings.
      e.preventDefault();
      const siblings = rows.filter((x): x is Extract<Row, { kind: 'node' }> => x.kind === 'node' && x.depth === r.depth && x.parentKey === r.parentKey);
      const k = siblings.findIndex((x) => x.node.id === r.node.id);
      const target = siblings[k + (e.key === 'ArrowUp' ? -1 : 1)];
      if (target) void movePage(r.node.id, r.node.title, e.key === 'ArrowUp' ? { targetParentId: r.parentKey, targetSpaceId: r.node.spaceId, beforeId: target.node.id } : { targetParentId: r.parentKey, targetSpaceId: r.node.spaceId, afterId: target.node.id }, { silent: true });
    }
  };

  // ---------------- drag and drop
  const [drag, setDrag] = useState<{ node: TreeNode; x: number; y: number; target: { index: number; zone: 'before' | 'after' | 'inside'; valid: boolean } | null } | null>(null);
  const dragRef = useRef<{ node: TreeNode; startX: number; startY: number; started: boolean; pointerId: number; descendants: Set<string> } | null>(null);
  const hoverTimer = useRef<{ key: string; t: number } | null>(null);
  const autoScroll = useRef<number | null>(null);

  const descendantsOf = (index: number): Set<string> => {
    const r = rows[index];
    const set = new Set<string>();
    if (r.kind !== 'node') return set;
    for (let j = index + 1; j < rows.length; j++) {
      const x = rows[j];
      if (x.kind !== 'node' && x.kind !== 'loading' && x.kind !== 'empty' && x.kind !== 'more' && x.kind !== 'error') break;
      if ('depth' in x && x.depth <= r.depth) break;
      if (x.kind === 'node') set.add(x.node.id);
    }
    return set;
  };

  const onRowPointerDown = (e: RPointerEvent, index: number, fromHandle: boolean) => {
    const r = rows[index];
    if (r.kind !== 'node' || !r.node.canEdit || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.tree-actions, .tree-chevron, input')) return;
    const touch = e.pointerType !== 'mouse';
    if (touch && !fromHandle) return; // on touch, dragging starts only from the handle (scrolling stays natural)
    dragRef.current = { node: r.node, startX: e.clientX, startY: e.clientY, started: false, pointerId: e.pointerId, descendants: descendantsOf(index) };
  };

  useEffect(() => {
    const computeTarget = (x: number, y: number) => {
      const el = scrollRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (x < rect.left - 40 || x > rect.right + 40) return null;
      const offsetY = y - rect.top + el.scrollTop;
      const index = Math.floor(offsetY / ROW_H);
      const r = rows[index];
      if (!r) return null;
      const within = (offsetY - index * ROW_H) / ROW_H;
      const d = dragRef.current!;
      if (r.kind === 'space') return { index, zone: 'inside' as const, valid: !!r.space.actions.create };
      if (r.kind === 'section') return null;
      if (r.kind !== 'node') return null;
      const zone = within < 0.28 ? 'before' : within > 0.72 ? 'after' : 'inside';
      const invalid = r.node.id === d.node.id || d.descendants.has(r.node.id) || (zone === 'inside' && !r.node.canCreate);
      return { index, zone: zone as 'before' | 'after' | 'inside', valid: !invalid };
    };
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      if (!d.started) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return;
        d.started = true;
        document.body.classList.add('dragging-tree');
      }
      e.preventDefault();
      const target = computeTarget(e.clientX, e.clientY);
      setDrag({ node: d.node, x: e.clientX, y: e.clientY, target });
      // auto-expand a collapsed node after hovering "inside" for a moment
      if (target?.zone === 'inside' && target.valid) {
        const r = rows[target.index];
        const key = r.kind === 'node' ? r.node.id : r.kind === 'space' ? 'space:' + r.space.id : '';
        if (hoverTimer.current?.key !== key) hoverTimer.current = { key, t: Date.now() };
        else if (Date.now() - hoverTimer.current.t > 650) {
          if (r.kind === 'node' && r.node.hasChildren && !r.expanded) toggleExpanded(r.node.id, true);
          if (r.kind === 'space' && !r.expanded) toggleExpanded('space:' + r.space.id, true);
          hoverTimer.current = { key: '', t: Date.now() };
        }
      } else hoverTimer.current = null;
      // auto-scroll near the edges
      const el = scrollRef.current!;
      const rect = el.getBoundingClientRect();
      const edge = 48;
      const speed = e.clientY < rect.top + edge ? -Math.ceil((rect.top + edge - e.clientY) / 4) : e.clientY > rect.bottom - edge ? Math.ceil((e.clientY - (rect.bottom - edge)) / 4) : 0;
      if (autoScroll.current) cancelAnimationFrame(autoScroll.current);
      if (speed) {
        const step = () => {
          el.scrollTop += speed;
          autoScroll.current = requestAnimationFrame(step);
        };
        autoScroll.current = requestAnimationFrame(step);
      }
    };
    const finish = async (commit: boolean) => {
      const d = dragRef.current;
      dragRef.current = null;
      if (autoScroll.current) cancelAnimationFrame(autoScroll.current);
      document.body.classList.remove('dragging-tree');
      const state = drag;
      setDrag(null);
      if (!d?.started || !commit || !state?.target?.valid) return;
      const r = rows[state.target.index];
      let target: Parameters<typeof movePage>[2] | null = null;
      if (r.kind === 'space') target = { targetSpaceId: r.space.id, targetParentId: null, position: 'end' };
      else if (r.kind === 'node') {
        if (state.target.zone === 'inside') target = { targetSpaceId: r.node.spaceId, targetParentId: r.node.id, position: 'end' };
        else target = { targetSpaceId: r.node.spaceId, targetParentId: r.node.parentId, [state.target.zone === 'before' ? 'beforeId' : 'afterId']: r.node.id };
      }
      if (target) {
        const ok = await movePage(d.node.id, d.node.title, target);
        if (ok && state.target.zone === 'inside' && r.kind === 'node') toggleExpanded(r.node.id, true);
      }
    };
    const onUp = (e: PointerEvent) => dragRef.current && e.pointerId === dragRef.current.pointerId && void finish(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dragRef.current?.started) {
        e.preventDefault();
        void finish(false);
      }
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', () => void finish(false));
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [rows, drag, toggleExpanded]);

  // ---------------- rename / move dialog / icon
  const [renaming, setRenaming] = useState<string | null>(null);
  const [moving, setMoving] = useState<TreeNode | null>(null);
  const [iconFor, setIconFor] = useState<{ node: TreeNode; anchor: HTMLElement } | null>(null);

  const openPage = (id: string) => {
    navigate('/p/' + id);
    onNavigate?.();
  };

  const newChild = async (spaceId: string, parentId: string | null) => {
    try {
      const p = await createPage(spaceId, parentId);
      navigate('/p/' + p.id, { state: { justCreated: true } });
      onNavigate?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Не удалось создать страницу');
    }
  };

  const nodeMenu = (n: TreeNode, rowEl: HTMLElement | null): MenuEntry[] => [
    { id: 'new', label: 'Новая вложенная страница', icon: <Plus size={15} />, disabled: !n.canCreate, onSelect: () => void newChild(n.spaceId, n.id) },
    { id: 'rename', label: 'Переименовать', icon: <FileText size={15} />, shortcut: 'F2', disabled: !n.canEdit, onSelect: () => setRenaming(n.id) },
    { id: 'icon', label: 'Изменить иконку', icon: <span>😀</span>, disabled: !n.canEdit, onSelect: () => rowEl && setIconFor({ node: n, anchor: rowEl }) },
    { separator: true },
    { id: 'move', label: 'Переместить в…', icon: <ChevronRight size={15} />, disabled: !n.canEdit, onSelect: () => setMoving(n) },
    { id: 'dup', label: 'Дублировать', icon: <FileText size={15} />, onSelect: () => void duplicatePage(n.id).then((p) => openPage(p.id)) },
    { id: 'link', label: 'Копировать ссылку', icon: <FileText size={15} />, onSelect: () => void copyLink(n.id) },
    { id: 'fav', label: 'В избранное', icon: <Star size={15} />, onSelect: () => void import('../api/client').then(({ put }) => put(`/api/v1/pages/${n.id}/favorite`)).then(() => queryClient.invalidateQueries({ queryKey: ['favorites'] })) },
    { separator: true },
    { id: 'trash', label: 'Удалить в корзину', icon: <span>🗑</span>, danger: true, disabled: !n.canEdit, onSelect: () => void trashPage(n.id, n.title, () => currentPage === n.id && navigate('/')) },
  ];

  const spaceMenu = (s: Space): MenuEntry[] => [
    { id: 'new', label: 'Новая страница', icon: <Plus size={15} />, disabled: !s.actions.create, onSelect: () => void newChild(s.id, null) },
    { id: 'open', label: 'Обзор пространства', icon: <Building2 size={15} />, onSelect: () => navigate('/s/' + s.id) },
    { id: 'settings', label: 'Настройки и участники', icon: <Users size={15} />, disabled: !s.actions.manage_space, onSelect: () => navigate('/s/' + s.id + '?tab=settings') },
  ];

  return (
    <>
      <div ref={scrollRef} className="tree-scroll" role="tree" aria-label="Страницы">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const r = rows[vi.index];
            const style = { position: 'absolute' as const, top: 0, left: 0, right: 0, height: ROW_H, transform: `translateY(${vi.start}px)` };
            const tabIndex = vi.index === focusIdx ? 0 : -1;
            const isDropInside = drag?.target?.index === vi.index && drag.target.zone === 'inside';
            const invalidHere = drag?.target?.index === vi.index && !drag.target.valid;
            return (
              <div key={r.key} data-index={vi.index} style={style} className={'tree-row-wrap' + (isDropInside && !invalidHere ? ' drop-inside' : '') + (invalidHere ? ' drop-invalid' : '')}>
                <TreeRow
                  row={r}
                  tabIndex={tabIndex}
                  active={r.kind === 'node' && r.node.id === currentPage}
                  renaming={r.kind === 'node' && renaming === r.node.id}
                  dragging={r.kind === 'node' && drag?.node.id === r.node.id}
                  onFocus={() => setFocusIdx(vi.index)}
                  onKeyDown={(e) => onKeyDown(e, vi.index)}
                  onToggle={() => toggleRow(r)}
                  onOpen={(id) => openPage(id)}
                  onOpenSpace={(id) => {
                    navigate('/s/' + id);
                    onNavigate?.();
                  }}
                  onNew={(spaceId, parentId) => void newChild(spaceId, parentId)}
                  onPointerDown={(e, handle) => onRowPointerDown(e, vi.index, handle)}
                  nodeMenu={nodeMenu}
                  spaceMenu={spaceMenu}
                  onRenameDone={() => setRenaming(null)}
                />
              </div>
            );
          })}
          {drag?.target && drag.target.valid && drag.target.zone !== 'inside' && (
            <div
              className="tree-drop-line"
              style={{
                top: drag.target.index * ROW_H + (drag.target.zone === 'after' ? ROW_H : 0) - 1,
                left: 8 + ((rows[drag.target.index] as any).depth ?? 0) * INDENT + 20,
              }}
            />
          )}
        </div>
      </div>
      {drag && (
        <div className="tree-drag-ghost" style={{ left: drag.x + 12, top: drag.y + 8 }} aria-hidden>
          <span>{drag.node.icon ?? '📄'}</span> {drag.node.title || 'Без названия'}
          {drag.target && !drag.target.valid && <span className="ghost-invalid"> — сюда нельзя</span>}
        </div>
      )}
      <div className="sr-only" aria-live="assertive">
        {drag?.target ? (drag.target.valid ? `Цель: ${drag.target.zone === 'inside' ? 'внутрь' : drag.target.zone === 'before' ? 'перед' : 'после'}` : 'Недопустимая цель') : ''}
      </div>
      {moving && <MoveDialog node={moving} onClose={() => setMoving(null)} />}
      {iconFor && (
        <IconPickerPopover
          anchor={iconFor.anchor}
          onClose={() => setIconFor(null)}
          onPick={async (icon) => {
            setIconFor(null);
            await patch(`/api/v1/pages/${iconFor.node.id}`, { icon }).catch((e) => toast.error(e.message));
            queryClient.invalidateQueries({ queryKey: ['tree', iconFor.node.spaceId] });
            queryClient.invalidateQueries({ queryKey: ['page', iconFor.node.id] });
          }}
        />
      )}
    </>
  );
}

interface RowProps {
  row: Row;
  tabIndex: number;
  active: boolean;
  renaming: boolean;
  dragging: boolean;
  onFocus(): void;
  onKeyDown(e: RKeyboardEvent): void;
  onToggle(): void;
  onOpen(id: string): void;
  onOpenSpace(id: string): void;
  onNew(spaceId: string, parentId: string | null): void;
  onPointerDown(e: RPointerEvent, fromHandle: boolean): void;
  nodeMenu(n: TreeNode, el: HTMLElement | null): MenuEntry[];
  spaceMenu(s: Space): MenuEntry[];
  onRenameDone(): void;
}

const TreeRow = memo(function TreeRow({ row: r, tabIndex, active, renaming, dragging, onFocus, onKeyDown, onToggle, onOpen, onOpenSpace, onNew, onPointerDown, nodeMenu, spaceMenu, onRenameDone }: RowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  if (r.kind === 'section')
    return (
      <div className="tree-section" role="treeitem" aria-level={1} aria-expanded={!r.collapsed} aria-selected={false}>
        <button className="tree-row-main tree-section-btn" tabIndex={tabIndex} onFocus={onFocus} onKeyDown={onKeyDown} onClick={onToggle}>
          <ChevronRight size={12} className={'chev' + (r.collapsed ? '' : ' open')} />
          <span>{r.label}</span>
        </button>
      </div>
    );
  if (r.kind === 'loading')
    return (
      <div className="tree-row placeholder" style={{ paddingLeft: 8 + r.depth * INDENT + 20 }} aria-busy>
        <div className="skeleton" style={{ height: 10, width: '55%' }} />
      </div>
    );
  if (r.kind === 'error')
    return (
      <div className="tree-row placeholder" style={{ paddingLeft: 8 + r.depth * INDENT + 20 }} role="alert">
        <span className="muted small ellipsis">Не удалось загрузить</span>
        <button className="icon-btn sm" onClick={r.retry} aria-label="Повторить загрузку">
          <RotateCw size={13} />
        </button>
      </div>
    );
  if (r.kind === 'empty')
    return (
      <div className="tree-row placeholder" style={{ paddingLeft: 8 + r.depth * INDENT + 20 }}>
        {r.canCreate ? (
          <button className="tree-empty-btn" onClick={() => onNew(r.spaceId, r.parentId)}>
            <Plus size={13} /> Создать первую страницу
          </button>
        ) : (
          <span className="muted small">Нет страниц</span>
        )}
      </div>
    );
  if (r.kind === 'more') return <div className="tree-row placeholder muted small" style={{ paddingLeft: 8 + r.depth * INDENT + 20 }}>Показаны первые 500 страниц — используйте поиск</div>;
  if (r.kind === 'space') {
    const s = r.space;
    return (
      <div ref={rowRef} className="tree-row space-row" role="treeitem" aria-level={1} aria-expanded={r.expanded} aria-selected={false} onPointerDown={(e) => onPointerDown(e, false)}>
        <button className="tree-chevron" tabIndex={-1} aria-label={r.expanded ? 'Свернуть' : 'Развернуть'} onClick={onToggle}>
          <ChevronRight size={14} className={'chev' + (r.expanded ? ' open' : '')} />
        </button>
        <span className="tree-icon">{s.icon ?? (s.visibility === 'open' ? <Building2 size={15} /> : <Lock size={14} />)}</span>
        <button className="tree-row-main tree-title" tabIndex={tabIndex} onFocus={onFocus} onKeyDown={onKeyDown} onClick={onToggle} onDoubleClick={() => onOpenSpace(s.id)} title={s.name}>
          {s.name}
        </button>
        <span className="tree-actions">
          {s.actions.create && (
            <Tooltip label="Новая страница в пространстве">
              <button className="icon-btn sm" tabIndex={-1} aria-label={`Новая страница в «${s.name}»`} onClick={() => onNew(s.id, null)}>
                <Plus size={14} />
              </button>
            </Tooltip>
          )}
          <Menu
            label={`Действия пространства «${s.name}»`}
            items={() => spaceMenu(s)}
            trigger={({ ref, props }) => (
              <button ref={ref} className="icon-btn sm" tabIndex={-1} aria-label="Действия" {...props}>
                <MoreHorizontal size={14} />
              </button>
            )}
          />
        </span>
      </div>
    );
  }
  const n = r.node;
  return (
    <div
      ref={rowRef}
      className={'tree-row' + (active ? ' active' : '') + (dragging ? ' dragging' : '')}
      role="treeitem"
      aria-level={r.depth + 1}
      aria-expanded={n.hasChildren ? r.expanded : undefined}
      aria-selected={active}
      style={{ paddingLeft: 4 + r.depth * INDENT }}
      onPointerDown={(e) => onPointerDown(e, false)}
      onContextMenu={(e) => {
        e.preventDefault();
        (rowRef.current?.querySelector('.tree-more') as HTMLElement | null)?.click();
      }}
    >
      {n.canEdit ? (
        <span className="tree-handle" aria-hidden onPointerDown={(e) => (e.stopPropagation(), onPointerDown(e, true))} title="Перетащите, чтобы переместить">
          <GripVertical size={12} />
        </span>
      ) : (
        <span aria-hidden />
      )}
      <button className={'tree-chevron' + (n.hasChildren ? '' : ' leaf')} tabIndex={-1} aria-hidden={!n.hasChildren} aria-label={r.expanded ? 'Свернуть' : 'Развернуть'} onClick={(e) => (e.stopPropagation(), n.hasChildren && onToggle())}>
        {n.hasChildren ? <ChevronRight size={14} className={'chev' + (r.expanded ? ' open' : '')} /> : <span className="dot" />}
      </button>
      <span className="tree-icon">{n.icon ?? (n.collectionId ? <Table2 size={15} /> : <FileText size={15} />)}</span>
      {renaming ? (
        <RenameInput node={n} onDone={onRenameDone} />
      ) : (
        <a
          className="tree-row-main tree-title"
          href={'/p/' + n.id}
          tabIndex={tabIndex}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.button === 1) return;
            e.preventDefault();
            onOpen(n.id);
          }}
          title={n.title || 'Без названия'}
          draggable={false}
        >
          {n.title || <span className="muted">Без названия</span>}
          {!n.inheritPermissions && <Lock size={11} className="tree-lock" aria-label="Особые права" />}
        </a>
      )}
      <span className="tree-actions">
        {n.canCreate && (
          <Tooltip label="Добавить вложенную страницу">
            <button className="icon-btn sm" tabIndex={-1} aria-label={`Добавить страницу внутрь «${n.title || 'Без названия'}»`} onClick={(e) => (e.stopPropagation(), onNew(n.spaceId, n.id))}>
              <Plus size={14} />
            </button>
          </Tooltip>
        )}
        <Menu
          label={`Действия со страницей «${n.title || 'Без названия'}»`}
          items={() => nodeMenu(n, rowRef.current)}
          trigger={({ ref, props }) => (
            <button ref={ref} className="icon-btn sm tree-more" tabIndex={-1} aria-label="Действия" {...props}>
              <MoreHorizontal size={14} />
            </button>
          )}
        />
      </span>
    </div>
  );
});

function RenameInput({ node, onDone }: { node: TreeNode; onDone(): void }) {
  const [value, setValue] = useState(node.title);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = async () => {
    onDone();
    if (value.trim() === node.title) return;
    try {
      await patch(`/api/v1/pages/${node.id}`, { title: value.trim() });
      queryClient.invalidateQueries({ queryKey: ['tree', node.spaceId] });
      queryClient.invalidateQueries({ queryKey: ['page', node.id] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Не удалось переименовать');
    }
  };
  return (
    <input
      ref={ref}
      className="tree-rename"
      value={value}
      aria-label="Новое название"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onDone();
        e.stopPropagation();
      }}
    />
  );
}
