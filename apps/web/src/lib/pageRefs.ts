import { useQuery } from '@tanstack/react-query';
import { post } from '../api/client';
import { setCopyRefLookup } from '../editor/clipboard/redact';

export interface PageRef {
  status: 'ok' | 'missing' | 'forbidden' | 'deleted';
  title?: string;
  icon?: string | null;
  spaceId?: string;
}

let queue = new Map<string, Array<(r: PageRef) => void>>();
/** Last known access status of linked pages (used to keep inaccessible titles out of the clipboard, AT-79). */
const known = new Map<string, PageRef>();
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
          for (const [k, cbs] of batch) {
            const ref = r.pages[k] ?? { status: 'missing' };
            known.set(k, ref);
            cbs.forEach((cb) => cb(ref));
          }
        } catch {
          for (const [, cbs] of batch) cbs.forEach((cb) => cb({ status: 'ok' }));
        }
      }, 25);
  });
}

export function usePageRef(id: string | null | undefined) {
  return useQuery({ queryKey: ['pageRef', id], queryFn: () => resolve(id!), enabled: !!id, staleTime: 60_000 });
}

setCopyRefLookup(
  (id) => (known.get(id)?.status === 'ok' || known.get(id)?.status === 'deleted' ? 'visible' : 'hidden'),
  async (ids) => void (await Promise.all(ids.filter((id) => !known.has(id)).map((id) => resolve(id)))),
);
