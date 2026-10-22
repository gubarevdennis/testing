import { useQuery } from '@tanstack/react-query';
import { get } from '../api/client';
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

export function usePage(id: string | undefined) {
  return useQuery({
    queryKey: ['page', id],
    queryFn: () => get<{ page: PageDto; breadcrumbs: Crumb[] }>(`/api/v1/pages/${id}`),
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
