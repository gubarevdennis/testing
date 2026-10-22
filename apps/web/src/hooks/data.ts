import { useQuery } from '@tanstack/react-query';
import { get, ApiError } from '../api/client';
import { metaGet, metaSet } from '../sync/idb';
import { useSession } from '../state/session';
import type { Space, TreeNode, PageDto, Crumb } from '../api/types';

export function useSpaces() {
  return useQuery({ queryKey: ['spaces'], queryFn: () => get<{ spaces: Space[]; shared: TreeNode[] }>('/api/v1/spaces') });
}

export function useChildren(spaceId: string, parentId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['tree', spaceId, parentId ?? 'root'],
    queryFn: () => get<{ nodes: TreeNode[]; nextCursor: string | null }>(`/api/v1/spaces/${spaceId}/tree${parentId ? `?parentId=${parentId}` : ''}`),
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Page metadata. The last successful response is kept in IndexedDB so that a page opened before can be
 * reopened without network (its document replica and queued changes live in IndexedDB too).
 */
export function usePage(id: string | undefined) {
  return useQuery({
    queryKey: ['page', id],
    queryFn: async () => {
      const cacheKey = `page:${useSession.getState().me?.user.id ?? 'anon'}:${id}`;
      try {
        const r = await get<{ page: PageDto; breadcrumbs: Crumb[] }>(`/api/v1/pages/${id}`);
        void metaSet(cacheKey, r).catch(() => undefined);
        return r;
      } catch (e) {
        if (e instanceof ApiError && e.isNetwork) {
          const cached = await metaGet<{ page: PageDto; breadcrumbs: Crumb[] }>(cacheKey).catch(() => undefined);
          if (cached) return { ...cached, offline: true as const };
        }
        throw e;
      }
    },
    enabled: !!id,
    staleTime: 10_000,
  });
}

export function useFavorites() {
  return useQuery({ queryKey: ['favorites'], queryFn: () => get<{ pages: Array<{ id: string; title: string; icon: string | null; space_id: string }> }>('/api/v1/me/favorites') });
}

export function useRecent() {
  return useQuery({ queryKey: ['recent'], queryFn: () => get<{ pages: Array<{ id: string; title: string; icon: string | null; space_id: string; viewed_at: string }> }>('/api/v1/me/recent') });
}

export function useNotifications() {
  return useQuery({ queryKey: ['notifications'], queryFn: () => get<{ notifications: any[]; unread: number }>('/api/v1/notifications'), refetchInterval: 120_000 });
}
