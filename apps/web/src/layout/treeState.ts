import { useEffect, useRef, type RefObject } from 'react';
import { usePage } from '../hooks/data';
import { useUi } from '../state/ui';

const SCROLL_KEY = 'kb:treeScroll';
const LAST_PAGE_KEY = 'kb:lastPage';

function readJson<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable or full */
  }
}

/**
 * Keeps the scroll position of the sidebar tree across reloads (R-TREE-019, R-TREE-023). Rows load lazily, so the
 * saved position is re-applied while the list grows until it can actually be reached. Applies when no page is open:
 * otherwise the open page is revealed (useRevealCurrentPage / SidebarTree).
 */
export function useTreeScrollMemory(ref: RefObject<HTMLElement | null>, rowCount: number, pageOpen = false) {
  // with a page open, the tree scrolls to that page instead (the saved position would fight it while rows load)
  const restored = useRef(pageOpen);
  const target = useRef<number | null>(readJson<number>(SCROLL_KEY));
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (!restored.current) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => writeJson(SCROLL_KEY, Math.round(el.scrollTop)), 150);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (t) clearTimeout(t);
      el.removeEventListener('scroll', onScroll);
    };
  }, [ref]);
  useEffect(() => {
    const el = ref.current;
    if (pageOpen) restored.current = true; // a page opened meanwhile: it is revealed instead
    if (!el || restored.current) return;
    const want = target.current;
    if (!want) {
      restored.current = true;
      return;
    }
    el.scrollTop = want;
    if (Math.abs(el.scrollTop - want) <= 2) restored.current = true;
    // give lazily loaded sections a moment, then stop trying (the user may have collapsed them)
    const stop = setTimeout(() => (restored.current = true), 3000);
    return () => clearTimeout(stop);
  }, [ref, rowCount, pageOpen]);
}

export interface LastPage {
  id: string;
  title: string;
  icon: string | null;
  at: number;
}

/** The page the user had open last (Home offers to continue there). */
export function lastPage(): LastPage | null {
  return readJson<LastPage>(LAST_PAGE_KEY);
}

/**
 * When a page is opened, its space and ancestors are expanded in the tree so the current page is visible
 * (R-TREE-013), and it is remembered as the last opened page (R-TREE-008).
 */
export function useRevealCurrentPage(pageId: string | undefined) {
  const page = usePage(pageId);
  const done = useRef<string | null>(null);
  const data = page.data;
  useEffect(() => {
    if (!data || done.current === data.page.id) return;
    done.current = data.page.id;
    const { toggleExpanded, expanded } = useUi.getState();
    if (!expanded['space:' + data.page.spaceId]) toggleExpanded('space:' + data.page.spaceId, true);
    for (const c of data.breadcrumbs) if (c.id && !c.hidden && !expanded[c.id]) toggleExpanded(c.id, true);
    if (!data.page.deletedAt) writeJson(LAST_PAGE_KEY, { id: data.page.id, title: data.page.title, icon: data.page.icon, at: Date.now() } satisfies LastPage);
  }, [data]);
}
