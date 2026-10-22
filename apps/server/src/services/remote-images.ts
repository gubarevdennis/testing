import { walk, type PMNode } from '@kb/shared';
import type { Services } from '../app.js';
import { fetchRemote, RemoteFetchError } from './remote-fetch.js';

interface PlanLike {
  pages: Array<{ content: PMNode; assets: string[]; sourceFile: string }>;
  files: Array<{ file: string; status: string; warnings: Array<{ code: string; message: string }> }>;
}

const MAX_IMAGES = 100;

function fileNameOf(url: string, contentType: string): string {
  let base = 'image';
  try {
    base = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'image');
  } catch {
    /* keep default */
  }
  base = base.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 80) || 'image';
  if (!/\.[a-z0-9]{2,5}$/i.test(base)) base += '.' + (contentType.split('/')[1]?.split(/[;+]/)[0] || 'img');
  return base;
}

/**
 * Remote images referenced by imported documents are copied into the knowledge base through the SSRF-guarded
 * fetcher (R-SECURITY-008). Images on internal addresses are removed (a visible placeholder remains) and
 * reported; other failures keep the external link and are reported as warnings.
 */
export async function copyRemoteImages(s: Services, plan: PlanLike, addAsset: (buf: Buffer, name: string) => Promise<{ ref: string; kind: string }>): Promise<void> {
  const nodes: Array<{ node: PMNode; page: PlanLike['pages'][number] }> = [];
  for (const page of plan.pages)
    walk(page.content, (n) => {
      if (n.type === 'image' && !n.attrs?.attachmentId && /^https?:\/\//i.test(String(n.attrs?.src ?? ''))) nodes.push({ node: n, page });
    });
  if (!nodes.length) return;
  const warn = (page: PlanLike['pages'][number], code: string, message: string) => {
    const r = plan.files.find((f) => f.file === page.sourceFile);
    if (!r) return;
    r.warnings.push({ code, message });
    if (r.status === 'ok') r.status = 'warning';
  };
  if (!s.cfg.remoteFetch?.enabled) {
    for (const { page } of nodes) warn(page, 'remote-image-external', 'Внешнее изображение оставлено ссылкой: копирование внешних изображений отключено');
    return;
  }
  const cache = new Map<string, Promise<{ ref: string } | RemoteFetchError>>();
  let n = 0;
  for (const { node, page } of nodes) {
    const src = String(node.attrs!.src);
    if (!cache.has(src)) {
      if (++n > MAX_IMAGES) {
        warn(page, 'remote-image-limit', `Внешнее изображение не скопировано (превышен лимит ${MAX_IMAGES}): ${src.slice(0, 100)}`);
        continue;
      }
      cache.set(
        src,
        (async () => {
          try {
            const r = await fetchRemote(src, { timeoutMs: s.cfg.remoteFetch.timeoutMs, maxBytes: s.cfg.remoteFetch.maxBytes, allowHosts: s.cfg.remoteFetch.allowHosts, accept: /^image\//i });
            const a = await addAsset(r.data, fileNameOf(r.finalUrl, r.contentType));
            if (a.kind !== 'image') return new RemoteFetchError('bad_type', 'Содержимое по ссылке не является изображением');
            return { ref: a.ref };
          } catch (e) {
            return e instanceof RemoteFetchError ? e : new RemoteFetchError('network', (e as Error).message);
          }
        })(),
      );
    }
    const res = await cache.get(src);
    if (!res) continue;
    if (res instanceof RemoteFetchError) {
      if (res.code === 'blocked_address' || res.code === 'bad_url') {
        // Never keep a reference to an internal address in the document.
        const alt = String(node.attrs?.alt ?? '');
        const id = node.attrs?.id;
        node.type = 'paragraph';
        node.attrs = id ? { id } : {};
        node.content = [{ type: 'text', text: `[изображение удалено: внутренний адрес${alt ? ` — ${alt}` : ''}]` }];
        warn(page, 'remote-image-blocked', `Изображение с внутреннего адреса удалено (защита от SSRF): ${src.slice(0, 100)}`);
      } else warn(page, 'remote-image-failed', `Внешнее изображение не скопировано (${res.message}), оставлено ссылкой: ${src.slice(0, 100)}`);
      continue;
    }
    node.attrs = { ...node.attrs, attachmentId: res.ref, src: res.ref };
    if (!page.assets.includes(res.ref)) page.assets.push(res.ref);
  }
}
