import { post, del, ApiError, uuid } from '../api/client';
import { queryClient } from '../App';
import { toast } from '../components/ui/Toast';
import { confirm } from '../components/ui/Confirm';
import { useUi } from '../state/ui';

const LEVEL: Record<string, string> = { view: 'просмотр', comment: 'комментирование', edit: 'редактирование', full: 'полный доступ', none: 'нет доступа' };

function invalidateTree(spaceId?: string) {
  queryClient.invalidateQueries({ queryKey: spaceId ? ['tree', spaceId] : ['tree'] });
  queryClient.invalidateQueries({ queryKey: ['spaces'] });
}

/** Creates a page immediately (no wizard) and returns its id. Idempotent per click via requestId. */
const inFlight = new Map<string, Promise<any>>();

export async function createPage(spaceId: string, parentId: string | null, opts: { title?: string; templateId?: string; afterId?: string } = {}) {
  // A double click on "+" must not create two pages: the same request is reused while it is in flight.
  const key = [spaceId, parentId, opts.templateId, opts.afterId].join('|');
  const existing = inFlight.get(key);
  if (existing) return (await existing).page as { id: string; spaceId: string; title: string };
  const req = post('/api/v1/pages', { spaceId, parentId, title: opts.title ?? '', templateId: opts.templateId, afterId: opts.afterId, requestId: uuid() });
  inFlight.set(key, req);
  let r: any;
  try {
    r = await req;
  } finally {
    inFlight.delete(key);
  }
  if (parentId) useUi.getState().toggleExpanded(parentId, true);
  useUi.getState().toggleExpanded('space:' + spaceId, true);
  invalidateTree(spaceId);
  return r.page as { id: string; spaceId: string; title: string };
}

export interface MoveTarget {
  targetSpaceId?: string | null;
  targetParentId?: string | null;
  beforeId?: string | null;
  afterId?: string | null;
  position?: 'start' | 'end';
}

/**
 * Moves a page. If the audience would widen, the user sees exactly who gains access and must confirm.
 * Success shows an Undo action that restores the previous position and rights.
 */
export async function movePage(pageId: string, title: string, target: MoveTarget, opts: { silent?: boolean } = {}): Promise<boolean> {
  const send = (confirmAudienceChange: boolean) => post(`/api/v1/pages/${pageId}/move`, { ...target, confirmAudienceChange });
  let r: any;
  try {
    r = await send(false);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'audience_change') {
      const d = e.details;
      const gained = (d?.audience?.gained ?? []) as Array<{ name: string; from: string; to: string }>;
      const lost = (d?.audience?.lost ?? []) as Array<{ name: string; from: string; to: string }>;
      const ok = await confirm({
        title: 'Изменится круг доступа',
        confirmLabel: 'Переместить',
        body: (
          <div className="col" style={{ gap: 8 }}>
            <p>
              Страница «{title}»{d?.descendants ? ` и вложенные страницы (${d.descendants})` : ''}{d?.attachments ? `, вложения (${d.attachments})` : ''} станут доступны новым участникам:
            </p>
            {gained.length > 0 && (
              <ul className="audience-list">
                {gained.map((g, i) => (
                  <li key={i}>
                    <b>{g.name}</b> — {LEVEL[g.from] ?? g.from} → {LEVEL[g.to] ?? g.to}
                  </li>
                ))}
              </ul>
            )}
            {lost.length > 0 && (
              <>
                <p className="muted">Потеряют доступ:</p>
                <ul className="audience-list">
                  {lost.map((g, i) => (
                    <li key={i}>
                      {g.name} — {LEVEL[g.from] ?? g.from} → {LEVEL[g.to] ?? g.to}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ),
      });
      if (!ok) return false;
      r = await send(true);
    } else {
      toast.error(e instanceof ApiError ? e.message : 'Не удалось переместить страницу');
      return false;
    }
  }
  invalidateTree();
  queryClient.invalidateQueries({ queryKey: ['page', pageId] });
  if (!opts.silent)
    toast.success(`«${title || 'Без названия'}» перемещена`, {
      label: 'Отменить',
      run: async () => {
        await post(`/api/v1/pages/${pageId}/move`, r.undo).catch((e) => toast.error(e.message));
        invalidateTree();
      },
    });
  return true;
}

export async function trashPage(pageId: string, title: string, onDone?: () => void) {
  try {
    const r = await del(`/api/v1/pages/${pageId}`);
    invalidateTree();
    queryClient.invalidateQueries({ queryKey: ['page', pageId] });
    onDone?.();
    toast.info(`«${title || 'Без названия'}»${r.count > 1 ? ` и вложенные (${r.count - 1})` : ''} перемещены в корзину`, {
      label: 'Восстановить',
      run: async () => {
        await post(`/api/v1/pages/${pageId}/restore`);
        invalidateTree();
        queryClient.invalidateQueries({ queryKey: ['page', pageId] });
      },
    });
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : 'Не удалось удалить');
  }
}

export async function duplicatePage(pageId: string) {
  const r = await post(`/api/v1/pages/${pageId}/duplicate`, { includeChildren: true, requestId: uuid() });
  invalidateTree();
  toast.success('Копия создана');
  return r.page as { id: string };
}

export async function copyLink(pageId: string, blockId?: string) {
  const url = `${location.origin}/p/${pageId}${blockId ? '?block=' + blockId : ''}`;
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Ссылка скопирована');
  } catch {
    // Clipboard API refused (permissions / insecure context): show the link for manual copy.
    await confirm({ title: 'Скопируйте ссылку', confirmLabel: 'Готово', body: <input className="input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} autoFocus /> });
  }
}
