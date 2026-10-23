import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Placement } from '@floating-ui/react';

/**
 * Motion for floating surfaces (menus, popovers, tooltips, suggestion lists, toolbars).
 *
 * A floating element must never be seen before floating-ui has placed it: on the first frame its coordinates are
 * (0, 0) or the previous position, which used to make every menu flash in the top-left corner and then jump next to
 * its button. The helpers below keep the element transparent until the position is known, then open it with a short
 * fade + scale from the side of the anchor (Notion-like, ~140 ms) and fade it out on close.
 */

export const MOTION = { open: 140, close: 100, tooltipOpen: 110, tooltipClose: 70 } as const;

const reduceQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
export const prefersReducedMotion = () => !!reduceQuery?.matches;

const SHIFT = 4;

/** Where the surface grows from: the edge that faces the anchor. */
export function originFor(placement: Placement): string {
  const [side, align] = placement.split('-') as [string, string | undefined];
  const cross = (axis: 'x' | 'y') => (align === 'start' ? (axis === 'x' ? 'left' : 'top') : align === 'end' ? (axis === 'x' ? 'right' : 'bottom') : 'center');
  if (side === 'bottom') return `${cross('x')} top`;
  if (side === 'top') return `${cross('x')} bottom`;
  if (side === 'right') return `left ${cross('y')}`;
  return `right ${cross('y')}`;
}

/** The small offset the surface slides in from (towards the anchor). */
function offsetFor(placement: Placement, distance = SHIFT): string {
  const side = placement.split('-')[0];
  if (side === 'bottom') return `translateY(-${distance}px)`;
  if (side === 'top') return `translateY(${distance}px)`;
  if (side === 'right') return `translateX(-${distance}px)`;
  return `translateX(${distance}px)`;
}

export interface FloatingMotionOptions {
  /** Open duration, ms. */
  duration?: number;
  /** Close duration, ms. */
  closeDuration?: number;
  /** Starting scale (1 = fade only). */
  scale?: number;
  /** Slide distance in px. */
  distance?: number;
}

type Phase = 'unmounted' | 'initial' | 'open' | 'close';

/**
 * Mount/unmount with an enter and exit transition for a floating-ui element.
 *
 * `isMounted` stays true while the exit transition runs. `styles` must be merged into the floating element's style
 * (after `floatingStyles`): until `isPositioned` the element is transparent and ignores the pointer, so the first
 * frames at (0, 0) are never visible.
 */
export function useFloatingMotion(open: boolean, isPositioned: boolean, placement: Placement, opts: FloatingMotionOptions = {}) {
  const reduce = prefersReducedMotion();
  const duration = reduce ? 0 : (opts.duration ?? MOTION.open);
  const closeDuration = reduce ? 0 : (opts.closeDuration ?? MOTION.close);
  const [phase, setPhase] = useState<Phase>(open ? 'initial' : 'unmounted');
  // the placement the element was shown with: on close floating-ui may already report another one
  const shownPlacement = useRef(placement);
  if (phase !== 'close') shownPlacement.current = placement;

  useLayoutEffect(() => {
    if (open) {
      setPhase((p) => (p === 'open' ? p : 'initial'));
      return;
    }
    setPhase((p) => (p === 'unmounted' ? p : closeDuration ? 'close' : 'unmounted'));
  }, [open, closeDuration]);

  useEffect(() => {
    if (phase === 'close') {
      const t = window.setTimeout(() => setPhase('unmounted'), closeDuration);
      return () => window.clearTimeout(t);
    }
    if (phase === 'initial' && open && isPositioned) {
      if (!duration) {
        setPhase('open');
        return;
      }
      // one frame with the start state painted at the final position, then transition to the open state
      const raf = requestAnimationFrame(() => setPhase('open'));
      return () => cancelAnimationFrame(raf);
    }
  }, [phase, open, isPositioned, duration, closeDuration]);

  const p = shownPlacement.current;
  const start = reduce ? 'none' : `${offsetFor(p, opts.distance)} scale(${opts.scale ?? 0.97})`;
  let styles: CSSProperties;
  if (phase === 'open') styles = { opacity: 1, transform: 'none', transformOrigin: originFor(p), transition: duration ? `opacity ${duration}ms var(--ease), transform ${duration}ms var(--ease)` : undefined };
  else if (phase === 'close') styles = { opacity: 0, transform: start, transformOrigin: originFor(p), transition: `opacity ${closeDuration}ms var(--ease), transform ${closeDuration}ms var(--ease)`, pointerEvents: 'none' };
  else styles = { opacity: 0, transform: start, transformOrigin: originFor(p), pointerEvents: isPositioned ? undefined : 'none' };
  // a closing surface is already gone for assistive technology (and for role queries): only its picture fades out
  const props = { 'data-status': phase, 'aria-hidden': phase === 'close' ? true : undefined } as const;
  return { isMounted: phase !== 'unmounted' || open, status: phase, styles, props };
}

/**
 * The same reveal for floating elements positioned outside React (tiptap BubbleMenu, suggestion popups): call
 * `hide()` when the element is shown but not yet placed, and `placed()` after each position update — the first one
 * fades the element in.
 */
export function revealController(getEl: () => HTMLElement | null) {
  let shown = false;
  return {
    hide() {
      const el = getEl();
      shown = false;
      if (!el) return;
      el.dataset.motion = 'pending';
    },
    placed() {
      const el = getEl();
      if (!el || shown) return;
      shown = true;
      // the class change is applied in the next frame so the transparent start state is painted at the new position
      requestAnimationFrame(() => {
        if (shown && el.dataset.motion === 'pending') el.dataset.motion = 'in';
      });
    },
    get shown() {
      return shown;
    },
  };
}
