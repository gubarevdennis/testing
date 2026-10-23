import { create } from 'zustand';
import { syncThemeColor } from '../theme/appearance';

/** UI preferences persisted locally (and mirrored to the server profile where useful). */
function load<T>(key: string, def: T): T {
  try {
    const v = localStorage.getItem('kb:' + key);
    return v ? (JSON.parse(v) as T) : def;
  } catch {
    return def;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem('kb:' + key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

interface UiState {
  theme: 'system' | 'light' | 'dark';
  sidebarWidth: number;
  sidebarOpen: boolean;
  mobileSidebar: boolean;
  expanded: Record<string, boolean>;
  collapsedSections: Record<string, boolean>;
  rightPanel: null | 'toc' | 'comments' | 'history' | 'info' | 'files';
  hintsDisabled: boolean;
  seenHints: Record<string, boolean>;
  setTheme(t: UiState['theme']): void;
  setSidebarWidth(w: number): void;
  setSidebarOpen(o: boolean): void;
  setMobileSidebar(o: boolean): void;
  toggleExpanded(id: string, value?: boolean): void;
  toggleSection(id: string): void;
  setRightPanel(p: UiState['rightPanel']): void;
  markHint(id: string): void;
  setHintsDisabled(v: boolean): void;
  resetSidebar(): void;
}

export const useUi = create<UiState>((set, get) => ({
  theme: load('theme', 'system'),
  sidebarWidth: load('sidebarWidth', 280),
  sidebarOpen: load('sidebarOpen', true),
  mobileSidebar: false,
  expanded: load('expanded', {}),
  collapsedSections: load('collapsedSections', {}),
  rightPanel: load('rightPanel', null),
  hintsDisabled: load('hintsDisabled', false),
  seenHints: load('seenHints', {}),
  setTheme: (theme) => {
    save('theme', theme);
    applyTheme(theme);
    set({ theme });
  },
  setSidebarWidth: (w) => {
    const sidebarWidth = Math.max(240, Math.min(420, Math.round(w)));
    save('sidebarWidth', sidebarWidth);
    set({ sidebarWidth });
  },
  setSidebarOpen: (sidebarOpen) => {
    save('sidebarOpen', sidebarOpen);
    set({ sidebarOpen });
  },
  setMobileSidebar: (mobileSidebar) => set({ mobileSidebar }),
  toggleExpanded: (id, value) => {
    const expanded = { ...get().expanded, [id]: value ?? !get().expanded[id] };
    if (!expanded[id]) delete expanded[id];
    save('expanded', expanded);
    set({ expanded });
  },
  toggleSection: (id) => {
    const collapsedSections = { ...get().collapsedSections, [id]: !get().collapsedSections[id] };
    save('collapsedSections', collapsedSections);
    set({ collapsedSections });
  },
  setRightPanel: (rightPanel) => {
    save('rightPanel', rightPanel);
    set({ rightPanel });
  },
  markHint: (id) => {
    const seenHints = { ...get().seenHints, [id]: true };
    save('seenHints', seenHints);
    set({ seenHints });
  },
  setHintsDisabled: (hintsDisabled) => {
    save('hintsDisabled', hintsDisabled);
    set({ hintsDisabled });
  },
  resetSidebar: () => {
    save('sidebarWidth', 280);
    save('collapsedSections', {});
    save('sidebarOpen', true);
    set({ sidebarWidth: 280, collapsedSections: {}, sidebarOpen: true });
  },
}));

export function applyTheme(theme: 'system' | 'light' | 'dark') {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  syncThemeColor();
}

/** True when the theme was chosen on this device (otherwise the profile's choice from another device applies). */
export function hasLocalTheme(): boolean {
  try {
    return localStorage.getItem('kb:theme') !== null;
  } catch {
    return false;
  }
}
