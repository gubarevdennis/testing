import { useEffect } from 'react';
import { resolveAppearance, type OrgAppearance, type UserAppearance } from '@kb/shared';
import { allPresetsCss, presetCss, PRESETS } from './presets';

/**
 * Applies the effective appearance (organisation preset + the user's overrides) to <html>:
 * data-preset / data-font / data-size attributes, the stylesheet of all presets, the browser theme colour — and caches
 * it in localStorage so that public/theme-boot.js applies the same look before the first paint of the next load.
 */
export const APPEARANCE_CACHE_KEY = 'kb:appearance';

export interface CachedAppearance extends OrgAppearance {
  /** CSS of the active preset only (the boot script injects it before the application bundle loads). */
  css: string;
}

let installed = false;
/** Stylesheet with every preset (≈15 KB), so switching presets in settings is instant. */
export function installPresetStyles() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const el = document.createElement('style');
  el.id = 'kb-presets';
  el.textContent = allPresetsCss();
  document.head.appendChild(el);
}

function isDark(): boolean {
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t === 'dark';
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Browser chrome colour (mobile address bar) follows the page background. */
export function syncThemeColor() {
  const preset = PRESETS[(document.documentElement.getAttribute('data-preset') as OrgAppearance['preset']) ?? 'notion'] ?? PRESETS.notion;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', (isDark() ? preset.dark : preset.light).bg);
}

export function applyAppearance(a: OrgAppearance) {
  const root = document.documentElement;
  installPresetStyles();
  root.setAttribute('data-preset', a.preset);
  if (a.font === 'preset') root.removeAttribute('data-font');
  else root.setAttribute('data-font', a.font);
  if (a.fontSize === 'default') root.removeAttribute('data-size');
  else root.setAttribute('data-size', a.fontSize);
  // the pre-paint copy is no longer needed once the full stylesheet is in place
  document.getElementById('kb-preset-boot')?.remove();
  syncThemeColor();
  try {
    const cached: CachedAppearance = { ...a, css: presetCss(PRESETS[a.preset]) };
    localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify(cached));
  } catch {
    /* storage unavailable: the next load starts with the default preset */
  }
}

/** Keeps <html> in sync with the organisation default and the signed-in user's overrides. */
export function useAppearance(org: Partial<OrgAppearance> | null | undefined, user: UserAppearance | null | undefined) {
  const a = resolveAppearance(org, user);
  useEffect(() => {
    applyAppearance(a);
  }, [a.preset, a.font, a.fontSize]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => syncThemeColor();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
}
