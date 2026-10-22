import { useQuery } from '@tanstack/react-query';
import { post } from '../api/client';

export interface PageRef {
  status: 'ok' | 'missing' | 'forbidden' | 'deleted';
  title?: string;
  icon?: string | null;
  spaceId?: string;
}

let queue = new Map<string, Array<(r: PageRef) => void>>();
let timer: ReturnType<typeof setTimeout> | null = null;

/** Batches link resolution requests (titles, access) of all page links on screen into one request. */
function resolve(id: string): Promise<PageRef> {
  return new Promise((res) => {
    const list = queue.get(id) ?? [];
    list.push(res);
    queue.set(id, list);
    if (!timer)
      timer = setTimeout(async () => {
        const batch = queue;
        queue = new Map();
        timer = null;
        const ids = [...batch.keys()];
        try {
          const r = await post<{ pages: Record<string, PageRef> }>('/api/v1/pages/resolve', { ids });
          for (const [k, cbs] of batch) cbs.forEach((cb) => cb(r.pages[k] ?? { status: 'missing' }));
        } catch {
          for (const [, cbs] of batch) cbs.forEach((cb) => cb({ status: 'ok' }));
        }
      }, 25);
  });
}

export function usePageRef(id: string | null | undefined) {
  return useQuery({ queryKey: ['pageRef', id], queryFn: () => resolve(id!), enabled: !!id, staleTime: 60_000 });
}
