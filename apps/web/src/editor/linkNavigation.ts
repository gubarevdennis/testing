/**
 * Following links inside the page text (editing and read-only): links to pages and blocks of this knowledge base open
 * in the app (no reload), a link to a block scrolls to it and highlights it, external links open in a new tab.
 * Ctrl/Cmd+click (and the middle button) opens any link in a new tab.
 *
 * The link mark is rendered by ProseMirror as a plain <a> inside a contenteditable element, where the browser follows
 * nothing on click (and the shared schema keeps openOnClick off so that the server-side HTML is unaffected) — the
 * editor plugin below does it. Node views (page mentions, page links) call followLink() from their own handlers.
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { sanitizeHref } from '@kb/shared';

export type LinkTarget =
  | { kind: 'internal'; path: string; pageId: string | null; blockId: string | null }
  | { kind: 'anchor'; blockId: string }
  | { kind: 'external'; url: string };

/** What a link points to, seen from the page at `here` (a location-like object). Null for unsafe/unknown targets. */
export function resolveLink(rawHref: string | null | undefined, here: { origin: string; pathname: string }): LinkTarget | null {
  const href = sanitizeHref(rawHref ?? '');
  if (!href) return null;
  if (href.startsWith('#')) {
    const id = safeDecode(href.slice(1));
    return id ? { kind: 'anchor', blockId: id } : null;
  }
  let u: URL;
  try {
    u = new URL(href, here.origin + here.pathname);
  } catch {
    return null;
  }
  if (u.origin !== here.origin || !/^https?:$/.test(u.protocol)) return { kind: 'external', url: u.toString() };
  // pages: /p/<uuid>[/slug][?block=<id>][#<id>]
  const page = /^\/p\/([0-9a-f-]{36})(?:\/|$)/i.exec(u.pathname);
  const blockId = u.searchParams.get('block') ?? (u.hash ? safeDecode(u.hash.slice(1)) : null);
  if (page && page[1] === /^\/p\/([0-9a-f-]{36})/i.exec(here.pathname)?.[1] && blockId && [...u.searchParams.keys()].every((k) => k === 'block')) {
    // the same page: just the block
    return { kind: 'anchor', blockId };
  }
  return { kind: 'internal', path: u.pathname + u.search + u.hash, pageId: page?.[1] ?? null, blockId: page ? blockId : null };
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s) || null;
  } catch {
    return null;
  }
}

/** True when the click asks for a new tab (Ctrl/Cmd, the middle button). */
export const wantsNewTab = (e: MouseEvent | React.MouseEvent) => e.ctrlKey || e.metaKey || e.button === 1;

export interface Navigator {
  /** In-app navigation (react-router). */
  navigate(to: string): void;
}

/** Event the editor listens to: scroll to a block of the open page and highlight it (repeated clicks repeat it). */
export const SCROLL_TO_BLOCK_EVENT = 'kb:scroll-to-block';

/** Follows a link for a click; returns true when it was handled (the caller prevents the default action). */
export function followLink(rawHref: string | null | undefined, e: MouseEvent | React.MouseEvent, nav: Navigator): boolean {
  const target = resolveLink(rawHref, location);
  if (!target) return false;
  if (target.kind === 'external') {
    window.open(target.url, '_blank', 'noopener,noreferrer');
    return true;
  }
  if (wantsNewTab(e)) {
    const path = target.kind === 'anchor' ? `${location.pathname}?block=${encodeURIComponent(target.blockId)}` : target.path;
    window.open(new URL(path, location.origin).toString(), '_blank', 'noopener');
    return true;
  }
  if (target.kind === 'anchor') {
    // the URL is updated too (Back returns; copying the address gives the block link)
    const path = `${location.pathname}?block=${encodeURIComponent(target.blockId)}`;
    if (location.pathname + location.search + location.hash !== path) nav.navigate(path);
    // the same address again (or #id → ?block=id): the editor scrolls on this event (it ignores a repeat within a moment)
    window.dispatchEvent(new CustomEvent(SCROLL_TO_BLOCK_EVENT, { detail: { blockId: target.blockId } }));
    return true;
  }
  nav.navigate(target.path);
  return true;
}

/** The <a> of a link mark under the event target (not links inside node view UI, which handle their own clicks). */
function markLink(view: EditorView, target: EventTarget | null): HTMLAnchorElement | null {
  const el = target instanceof Element ? target : null;
  const a = el?.closest('a[href]') as HTMLAnchorElement | null;
  if (!a || !view.dom.contains(a)) return null;
  const owner = a.parentElement?.closest('[data-node-view-content], [data-node-view-wrapper], [contenteditable="false"]');
  if (owner && owner !== view.dom && !owner.hasAttribute('data-node-view-content')) return null;
  return a;
}

export const LinkNavigation = Extension.create<{ navigate: (to: string) => void }>({
  name: 'kbLinkNavigation',
  addOptions() {
    return { navigate: (to: string) => window.location.assign(to) };
  },
  addProseMirrorPlugins() {
    const nav: Navigator = { navigate: (to) => this.options.navigate(to) };
    let down: { x: number; y: number } | null = null;
    return [
      new Plugin({
        key: new PluginKey('kbLinkNavigation'),
        props: {
          handleDOMEvents: {
            mousedown: (_view, e) => {
              down = { x: e.clientX, y: e.clientY };
              return false;
            },
            click: (view, e) => {
              if (e.button !== 0 || e.shiftKey || e.altKey) return false;
              const a = markLink(view, e.target);
              if (!a) return false;
              // selecting text by dragging over a link is not a click on it
              const moved = down ? Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 4 : false;
              const sel = view.dom.ownerDocument.getSelection();
              if (moved || (sel && !sel.isCollapsed && a.contains(sel.anchorNode) && view.editable)) return false;
              if (followLink(a.getAttribute('href'), e, nav)) {
                e.preventDefault();
                return true;
              }
              return false;
            },
            auxclick: (view, e) => {
              if (e.button !== 1) return false;
              const a = markLink(view, e.target);
              if (!a || !followLink(a.getAttribute('href'), e, nav)) return false;
              e.preventDefault();
              return true;
            },
          },
        },
      }),
    ];
  },
});
