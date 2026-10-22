import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Remembers the scroll position of a scroll container per history entry and restores it on Back/Forward.
 * New navigations (links) start at the top. Content may render late (editor sync), so restoring retries briefly.
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
    const saved = Number(sessionStorage.getItem(key) ?? NaN);
    if (navType === 'POP' && Number.isFinite(saved)) {
      const restore = () => {
        el.scrollTop = saved;
        if (Math.abs(el.scrollTop - saved) > 2 && tries++ < 30) timer = setTimeout(restore, 100);
      };
      restore();
    }
    const onScroll = () => {
      try {
        sessionStorage.setItem(key, String(el.scrollTop));
      } catch {
        /* storage full or unavailable */
      }
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      el.removeEventListener('scroll', onScroll);
    };
  }, [location.key, navType]);
  return ref;
}
