import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Remembers the scroll position of a scroll container per history entry and restores it on Back/Forward.
 * Opening a page again from the tree returns to where the reader was on that page (R-EDITOR-047); any other fresh
 * navigation (search, links, quick switcher) starts at the top (UX-131), as does a link to a block (?block=… / #anchor). Content may render late (editor sync), so restoring retries briefly.
 */
export function useScrollRestore<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const location = useLocation();
  const navType = useNavigationType();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const key = 'kb:scroll:' + location.key;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pathKey = 'kb:scroll:path:' + location.pathname;
    const read = (k: string) => {
      try {
        return Number(sessionStorage.getItem(k) ?? NaN);
      } catch {
        return NaN;
      }
    };
    const targeted = /[?&]block=/.test(location.search) || !!location.hash;
    const fromTree = !!(location.state as { kbRestoreScroll?: boolean } | null)?.kbRestoreScroll;
    const saved = navType === 'POP' ? read(key) : targeted || !fromTree ? NaN : read(pathKey);
    if (Number.isFinite(saved)) {
      const restore = () => {
        el.scrollTop = saved;
        if (Math.abs(el.scrollTop - saved) > 2 && tries++ < 30) timer = setTimeout(restore, 100);
      };
      restore();
    }
    const onScroll = () => {
      try {
        sessionStorage.setItem(key, String(el.scrollTop));
        sessionStorage.setItem(pathKey, String(el.scrollTop));
      } catch {
        /* storage full or unavailable */
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      el.removeEventListener('scroll', onScroll);
    };
  }, [location.key, location.pathname, location.search, location.hash, location.state, navType]);
  return ref;
}
