import * as Y from 'yjs';
import { walk, FRAGMENT_NAME, type PMNode } from '@kb/shared';
import type { Services } from '../app.js';
import { fetchRemote, RemoteFetchError } from './remote-fetch.js';
import { storeBuffer } from './importer.js';
import { createAttachment } from './attachments.js';

const IMAGE_NODES = new Set(['image', 'inlineImage']);
const isExternal = (src: unknown) => typeof src === 'string' && /^https?:\/\//i.test(src);

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

/** External image addresses referenced by a document (images not yet stored in the knowledge base). */
export function externalImageSources(doc: PMNode | null): string[] {
  const out = new Set<string>();
  if (doc)
    walk(doc, (n) => {
      if (IMAGE_NODES.has(n.type) && !n.attrs?.attachmentId && isExternal(n.attrs?.src)) out.add(String(n.attrs!.src));
    });
  return [...out];
}

function rewrite(el: Y.XmlFragment | Y.XmlElement, copies: Map<string, { id: string; url: string }>) {
  for (const child of el.toArray()) {
    if (!(child instanceof Y.XmlElement)) continue;
    if (IMAGE_NODES.has(child.nodeName) && !child.getAttribute('attachmentId')) {
      const c = copies.get(String(child.getAttribute('src') ?? ''));
      if (c) {
        child.setAttribute('src', c.url);
        child.setAttribute('attachmentId', c.id);
      }
    }
    rewrite(child, copies);
  }
}

/**
 * Copies the external images of one page into the knowledge base (as attachments of that page, owned by the page's
 * author) and points the document at the copies through the collaboration hub, so open editors receive the change.
 * Images that cannot be fetched (site down, internal address, not an image) keep their address and are reported.
 */
export async function localizePageImages(s: Services, pageId: string): Promise<{ copied: number; failed: Array<{ src: string; reason: string }> }> {
  const page = (await s.db.query(`select p.org_id, p.created_by, d.content from pages p join doc_state d on d.page_id = p.id where p.id = $1 and p.deleted_at is null`, [pageId])).rows[0];
  const failed: Array<{ src: string; reason: string }> = [];
  if (!page) return { copied: 0, failed };
  const sources = externalImageSources(page.content);
  if (!sources.length) return { copied: 0, failed };
  if (!s.cfg.remoteFetch?.enabled) return { copied: 0, failed: sources.map((src) => ({ src, reason: 'копирование внешних изображений отключено' })) };
  const copies = new Map<string, { id: string; url: string }>();
  for (const src of sources) {
    try {
      const r = await fetchRemote(src, { timeoutMs: s.cfg.remoteFetch.timeoutMs, maxBytes: Math.min(s.cfg.remoteFetch.maxBytes, s.cfg.maxUploadBytes), allowHosts: s.cfg.remoteFetch.allowHosts, accept: /^image\//i });
      const st = await storeBuffer(s, r.data, fileNameOf(r.finalUrl, r.contentType));
      if (st.info.kind !== 'image') throw new RemoteFetchError('bad_type', 'содержимое по ссылке не является изображением');
      const a = await createAttachment(s.db, { orgId: page.org_id, pageId, userId: page.created_by, filename: st.filename, sha256: st.sha, size: st.size, info: st.info });
      copies.set(src, { id: a.id, url: `/api/v1/attachments/${a.id}/content` });
    } catch (e) {
      failed.push({ src, reason: (e as Error).message });
    }
  }
  if (copies.size) await s.hub.applyServerChange(pageId, null, (doc) => rewrite(doc.getXmlFragment(FRAGMENT_NAME), copies), `localize-images:${pageId}:${[...copies.values()].map((c) => c.id).join(',')}`);
  return { copied: copies.size, failed };
}

/** All pages of an organisation that still reference external images. */
export async function pagesWithExternalImages(s: Services, orgId: string): Promise<string[]> {
  const r = await s.db.query(
    `select p.id from pages p join doc_state d on d.page_id = p.id
      where p.org_id = $1 and p.deleted_at is null and d.content::text ~ '"src": *"https?://'`,
    [orgId],
  );
  return r.rows.map((x) => x.id as string);
}
