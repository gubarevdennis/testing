import type { AppearancePreset } from '@kb/shared';

/**
 * Visual presets (item 7): every preset defines the complete set of semantic tokens for the light and the dark theme,
 * plus radii, shadows and its interface font. Values here are the single source: the stylesheet injected at start
 * (presetCss), the pre-paint boot cache (public/theme-boot.js) and the automated contrast check
 * (tests/unit/theme-contrast.test.ts, D-19) all read them. «Классический» repeats tokens.css exactly.
 */

export type TokenName =
  | 'bg' | 'surface' | 'surface-2' | 'surface-3' | 'surface-hover' | 'surface-active'
  | 'text' | 'text-2' | 'text-3' | 'border' | 'border-strong' | 'border-input'
  | 'accent' | 'accent-strong' | 'accent-soft' | 'accent-contrast' | 'focus'
  | 'success' | 'success-soft' | 'warning' | 'warning-soft' | 'danger' | 'danger-soft' | 'info-soft' | 'purple' | 'purple-soft'
  | 'overlay' | 'shadow-1' | 'shadow-2' | 'shadow-3'
  | 'c-gray' | 'hl-gray' | 'c-brown' | 'hl-brown' | 'c-orange' | 'hl-orange' | 'c-yellow' | 'hl-yellow' | 'c-green' | 'hl-green'
  | 'c-blue' | 'hl-blue' | 'c-purple' | 'hl-purple' | 'c-pink' | 'hl-pink' | 'c-red' | 'hl-red' | 'c-teal' | 'hl-teal';

export type Tokens = Record<TokenName, string>;

export interface Preset {
  id: AppearancePreset;
  label: string;
  description: string;
  light: Tokens;
  dark: Tokens;
  /** Radii: --r-sm, --r-md, --r-lg, --r-xl. */
  radius: [number, number, number, number];
  /** Interface font (and the default font of page content). */
  font: string;
}

export const FONT_STACKS = {
  inter: "'Inter Variable', Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  system: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Display', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  serif: "Lyon-Text, Georgia, 'PT Serif', ui-serif, 'Times New Roman', serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'DejaVu Sans Mono', monospace",
} as const;

/** Base size of page content for «Мелкий/Обычный/Крупный». */
export const CONTENT_SIZES = { small: 14, default: 16, large: 18 } as const;

// ------------------------------------------------------------------------------------------------- classic (tokens.css)

const CLASSIC_LIGHT: Tokens = {
  bg: '#f8f9fb', surface: '#ffffff', 'surface-2': '#f3f5f7', 'surface-3': '#eceff3', 'surface-hover': '#eef1f5', 'surface-active': '#e6eaf0',
  text: '#24272d', 'text-2': '#68717d', 'text-3': '#858d98', border: '#e5e8ed', 'border-strong': '#d3d8df', 'border-input': '#858e9b',
  accent: '#5a85c6', 'accent-strong': '#3f6aab', 'accent-soft': '#e8eff9', 'accent-contrast': '#ffffff', focus: '#3f6aab',
  success: '#2a7a50', 'success-soft': '#e6f4ec', warning: '#8a5a00', 'warning-soft': '#fdf3e1', danger: '#c0392b', 'danger-soft': '#fbeaea', 'info-soft': '#eaf1fb',
  purple: '#7a52b3', 'purple-soft': '#f3ecfb', overlay: 'rgba(23, 26, 31, 0.36)',
  'shadow-1': '0 1px 2px rgba(23, 26, 31, 0.06), 0 1px 1px rgba(23, 26, 31, 0.04)',
  'shadow-2': '0 6px 16px rgba(23, 26, 31, 0.1), 0 1px 3px rgba(23, 26, 31, 0.08)',
  'shadow-3': '0 16px 40px rgba(23, 26, 31, 0.16), 0 2px 6px rgba(23, 26, 31, 0.08)',
  'c-gray': '#6b7280', 'hl-gray': '#eceef1', 'c-brown': '#8b5e3c', 'hl-brown': '#f3ebe4', 'c-orange': '#9c470b', 'hl-orange': '#fdebdc',
  'c-yellow': '#735b00', 'hl-yellow': '#fff3b0', 'c-green': '#2f7d4f', 'hl-green': '#e2f3e8', 'c-blue': '#2f5fa8', 'hl-blue': '#e3edfb',
  'c-purple': '#6e48a8', 'hl-purple': '#efe7fa', 'c-pink': '#a83a73', 'hl-pink': '#fae6f0', 'c-red': '#b4372b', 'hl-red': '#fbe4e1', 'c-teal': '#23766f', 'hl-teal': '#def3f1',
};

const CLASSIC_DARK: Tokens = {
  bg: '#17191d', surface: '#1d2025', 'surface-2': '#23272d', 'surface-3': '#2a2f36', 'surface-hover': '#262a31', 'surface-active': '#2e333b',
  text: '#e7e9ec', 'text-2': '#a5adb8', 'text-3': '#7d8591', border: '#2f343b', 'border-strong': '#3c424a', 'border-input': '#6b7380',
  accent: '#6f97d6', 'accent-strong': '#8db0e6', 'accent-soft': '#24324a', 'accent-contrast': '#0f1520', focus: '#8db0e6',
  success: '#5dbb8a', 'success-soft': '#1d3428', warning: '#e2ad4c', 'warning-soft': '#3a2f19', danger: '#ef7b6f', 'danger-soft': '#3d2220', 'info-soft': '#1f2c40',
  purple: '#b597e6', 'purple-soft': '#2f2640', overlay: 'rgba(0, 0, 0, 0.55)',
  'shadow-1': '0 1px 2px rgba(0, 0, 0, 0.4)', 'shadow-2': '0 6px 16px rgba(0, 0, 0, 0.45)', 'shadow-3': '0 16px 40px rgba(0, 0, 0, 0.55)',
  'c-gray': '#a3aab4', 'hl-gray': '#33373d', 'c-brown': '#c99b78', 'hl-brown': '#3b3029', 'c-orange': '#f0a067', 'hl-orange': '#44301f',
  'c-yellow': '#e9c84d', 'hl-yellow': '#474019', 'c-green': '#6cc493', 'hl-green': '#1f3a2a', 'c-blue': '#86aef0', 'hl-blue': '#22324d',
  'c-purple': '#b99bea', 'hl-purple': '#352a4a', 'c-pink': '#ec8fbf', 'hl-pink': '#45253a', 'c-red': '#f08a7f', 'hl-red': '#4a2522', 'c-teal': '#6fcfc5', 'hl-teal': '#1c3c39',
};

// ------------------------------------------------------------------------------------------------- notion

/** Notion: warm neutral greys, white page, deep near-black dark theme (#191919), small radii, system font. */
const NOTION_LIGHT: Tokens = {
  ...CLASSIC_LIGHT,
  bg: '#ffffff', surface: '#ffffff', 'surface-2': '#f7f7f5', 'surface-3': '#efefed', 'surface-hover': '#f0f0ee', 'surface-active': '#e8e8e6',
  text: '#37352f', 'text-2': '#6f6e69', 'text-3': '#9b9a97', border: '#e9e9e7', 'border-strong': '#dcdcd9', 'border-input': '#8d8c88',
  accent: '#2383e2', 'accent-strong': '#0b6bcb', 'accent-soft': '#e7f1fb', 'accent-contrast': '#ffffff', focus: '#2383e2',
  success: '#2f7a51', 'success-soft': '#edf3ec', warning: '#8a5a00', 'warning-soft': '#fbf3db', danger: '#c4372f', 'danger-soft': '#fdebec', 'info-soft': '#e7f3f8',
  purple: '#7a4fb0', 'purple-soft': '#f6f3f9', overlay: 'rgba(15, 15, 15, 0.4)',
  'shadow-1': '0 0 0 1px rgba(15, 15, 15, 0.05), 0 1px 2px rgba(15, 15, 15, 0.1)',
  'shadow-2': '0 0 0 1px rgba(15, 15, 15, 0.05), 0 3px 6px rgba(15, 15, 15, 0.1), 0 9px 24px rgba(15, 15, 15, 0.2)',
  'shadow-3': '0 0 0 1px rgba(15, 15, 15, 0.05), 0 5px 10px rgba(15, 15, 15, 0.1), 0 15px 40px rgba(15, 15, 15, 0.2)',
  'hl-gray': '#f1f1ef', 'hl-brown': '#f4eeee', 'hl-orange': '#fbecdd', 'hl-yellow': '#fbf3db', 'hl-green': '#edf3ec', 'hl-blue': '#e7f3f8',
  'hl-purple': '#f6f3f9', 'hl-pink': '#faf1f5', 'hl-red': '#fdebec', 'hl-teal': '#e6f3f1',
};

const NOTION_DARK: Tokens = {
  ...CLASSIC_DARK,
  bg: '#191919', surface: '#202020', 'surface-2': '#202020', 'surface-3': '#2c2c2c', 'surface-hover': '#2a2a2a', 'surface-active': '#323232',
  text: '#e8e8e6', 'text-2': '#a3a3a1', 'text-3': '#7d7d7b', border: '#2f2f2f', 'border-strong': '#3e3e3e', 'border-input': '#727270',
  accent: '#2383e2', 'accent-strong': '#62a8ee', 'accent-soft': '#1b2d40', 'accent-contrast': '#0c1622', focus: '#62a8ee',
  success: '#5fb98a', 'success-soft': '#1e3328', warning: '#e0ad52', 'warning-soft': '#3a2f1a', danger: '#ef7d72', 'danger-soft': '#3d2321', 'info-soft': '#162d3d',
  purple: '#b998e6', 'purple-soft': '#2f2640', overlay: 'rgba(0, 0, 0, 0.6)',
  'shadow-1': '0 0 0 1px rgba(255, 255, 255, 0.06), 0 1px 2px rgba(0, 0, 0, 0.5)',
  'shadow-2': '0 0 0 1px rgba(255, 255, 255, 0.07), 0 3px 6px rgba(0, 0, 0, 0.4), 0 9px 24px rgba(0, 0, 0, 0.5)',
  'shadow-3': '0 0 0 1px rgba(255, 255, 255, 0.07), 0 5px 10px rgba(0, 0, 0, 0.4), 0 15px 40px rgba(0, 0, 0, 0.6)',
  'c-gray': '#a5a5a3', 'hl-gray': '#2f2f2f', 'c-brown': '#c99b7f', 'hl-brown': '#3a2c26', 'c-orange': '#e9a06a', 'hl-orange': '#43301f',
  'c-yellow': '#e3c25a', 'hl-yellow': '#403720', 'c-green': '#6cbf8e', 'hl-green': '#1f3529', 'c-blue': '#6fb2ea', 'hl-blue': '#16304a',
  'c-purple': '#bb9ce8', 'hl-purple': '#33283f', 'c-pink': '#e793bd', 'hl-pink': '#40252f', 'c-red': '#ef8a80', 'hl-red': '#432422', 'c-teal': '#6ccbc0', 'hl-teal': '#173633',
};

// ------------------------------------------------------------------------------------------------- chatgpt

/** ChatGPT: neutral greys, generous radii, near-black text, green accent; dark #212121 with #171717 sidebar. */
const CHATGPT_LIGHT: Tokens = {
  ...NOTION_LIGHT,
  bg: '#ffffff', surface: '#ffffff', 'surface-2': '#f9f9f9', 'surface-3': '#ececec', 'surface-hover': '#f3f3f3', 'surface-active': '#e8e8e8',
  text: '#0d0d0d', 'text-2': '#5d5d5d', 'text-3': '#8f8f8f', border: '#e5e5e5', 'border-strong': '#d4d4d4', 'border-input': '#8a8a8a',
  accent: '#10a37f', 'accent-strong': '#0b7a5f', 'accent-soft': '#e3f4ee', 'accent-contrast': '#ffffff', focus: '#0b7a5f',
  'info-soft': '#eef5f3', overlay: 'rgba(0, 0, 0, 0.4)',
  'shadow-1': '0 1px 2px rgba(0, 0, 0, 0.06)',
  'shadow-2': '0 4px 16px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06)',
  'shadow-3': '0 12px 40px rgba(0, 0, 0, 0.14), 0 2px 6px rgba(0, 0, 0, 0.06)',
  'hl-gray': '#efefef',
};

const CHATGPT_DARK: Tokens = {
  ...NOTION_DARK,
  bg: '#212121', surface: '#2a2a2a', 'surface-2': '#171717', 'surface-3': '#333333', 'surface-hover': '#303030', 'surface-active': '#3a3a3a',
  text: '#ececec', 'text-2': '#b4b4b4', 'text-3': '#8a8a8a', border: '#383838', 'border-strong': '#474747', 'border-input': '#7e7e7e',
  accent: '#10a37f', 'accent-strong': '#3cc69c', 'accent-soft': '#173a30', 'accent-contrast': '#04140f', focus: '#3cc69c',
  'info-soft': '#1d2f2a', overlay: 'rgba(0, 0, 0, 0.6)',
  'hl-gray': '#363636',
};

// ------------------------------------------------------------------------------------------------- teamly

/** Teamly-like corporate KB: cool light-grey canvas, white cards, violet-blue brand accent, medium radii, Inter. */
const TEAMLY_LIGHT: Tokens = {
  ...CLASSIC_LIGHT,
  bg: '#f4f5f9', surface: '#ffffff', 'surface-2': '#eef0f6', 'surface-3': '#e6e8f0', 'surface-hover': '#eceef5', 'surface-active': '#e2e5ef',
  text: '#1d2130', 'text-2': '#5d6378', 'text-3': '#8a8fa3', border: '#e1e4ec', 'border-strong': '#cfd3df', 'border-input': '#848aa0',
  accent: '#6366f1', 'accent-strong': '#4f46e5', 'accent-soft': '#ecedfd', 'accent-contrast': '#ffffff', focus: '#4f46e5',
  'info-soft': '#eceffd',
  'shadow-1': '0 1px 2px rgba(29, 33, 48, 0.06), 0 1px 1px rgba(29, 33, 48, 0.04)',
  'shadow-2': '0 8px 20px rgba(29, 33, 48, 0.1), 0 1px 3px rgba(29, 33, 48, 0.08)',
  'shadow-3': '0 18px 44px rgba(29, 33, 48, 0.18), 0 2px 6px rgba(29, 33, 48, 0.08)',
};

const TEAMLY_DARK: Tokens = {
  ...CLASSIC_DARK,
  bg: '#13141b', surface: '#1b1c25', 'surface-2': '#1f2029', 'surface-3': '#282a35', 'surface-hover': '#24252f', 'surface-active': '#2c2e3a',
  text: '#e8e9f0', 'text-2': '#a6a9bb', 'text-3': '#7d8094', border: '#2c2e3a', 'border-strong': '#3a3c4a', 'border-input': '#6f7287',
  accent: '#818cf8', 'accent-strong': '#a5b0fb', 'accent-soft': '#272a4a', 'accent-contrast': '#10122a', focus: '#a5b0fb',
  'info-soft': '#20233d', 'purple-soft': '#2c2540',
};

// ------------------------------------------------------------------------------------------------- high contrast

/** High contrast: black on white / white on black, strong borders, AAA-level body text. */
const CONTRAST_LIGHT: Tokens = {
  ...CLASSIC_LIGHT,
  bg: '#ffffff', surface: '#ffffff', 'surface-2': '#f2f2f2', 'surface-3': '#e6e6e6', 'surface-hover': '#ebebeb', 'surface-active': '#dedede',
  text: '#000000', 'text-2': '#2b2b2b', 'text-3': '#555555', border: '#767676', 'border-strong': '#000000', 'border-input': '#000000',
  accent: '#0040c1', 'accent-strong': '#0036a3', 'accent-soft': '#dfe8ff', 'accent-contrast': '#ffffff', focus: '#000000',
  success: '#0a5c2f', 'success-soft': '#e3f3e9', warning: '#6b4300', 'warning-soft': '#fff1d6', danger: '#a10f0f', 'danger-soft': '#fde4e4', 'info-soft': '#e3ecff',
  purple: '#5a2d99', 'purple-soft': '#f0e8fb', overlay: 'rgba(0, 0, 0, 0.55)',
  'shadow-1': '0 0 0 1px #000000', 'shadow-2': '0 0 0 1px #000000, 0 4px 12px rgba(0, 0, 0, 0.25)', 'shadow-3': '0 0 0 2px #000000, 0 12px 32px rgba(0, 0, 0, 0.3)',
  'c-gray': '#4b5260', 'c-brown': '#6b4428', 'c-orange': '#7d3606', 'c-yellow': '#594600', 'c-green': '#1f5e39', 'c-blue': '#1f4685', 'c-purple': '#55348a', 'c-pink': '#87285a', 'c-red': '#8f2419', 'c-teal': '#155a54',
};

const CONTRAST_DARK: Tokens = {
  ...CLASSIC_DARK,
  bg: '#000000', surface: '#0a0a0a', 'surface-2': '#111111', 'surface-3': '#1c1c1c', 'surface-hover': '#1a1a1a', 'surface-active': '#262626',
  text: '#ffffff', 'text-2': '#e3e3e3', 'text-3': '#b0b0b0', border: '#8c8c8c', 'border-strong': '#ffffff', 'border-input': '#ffffff',
  accent: '#7fb2ff', 'accent-strong': '#a9cbff', 'accent-soft': '#0f2547', 'accent-contrast': '#000000', focus: '#ffd400',
  success: '#7fe0a8', 'success-soft': '#0d2a1a', warning: '#ffcf66', 'warning-soft': '#2e2208', danger: '#ff9a90', 'danger-soft': '#33100d', 'info-soft': '#0f1f3a',
  purple: '#d2b8ff', 'purple-soft': '#241838', overlay: 'rgba(0, 0, 0, 0.75)',
  'shadow-1': '0 0 0 1px #ffffff', 'shadow-2': '0 0 0 1px #ffffff, 0 4px 12px rgba(0, 0, 0, 0.6)', 'shadow-3': '0 0 0 2px #ffffff, 0 12px 32px rgba(0, 0, 0, 0.7)',
  'c-gray': '#c9ced6', 'c-brown': '#e3bb9c', 'c-orange': '#ffbb88', 'c-yellow': '#ffe27a', 'c-green': '#8fe0b2', 'c-blue': '#a9c8ff', 'c-purple': '#d4bdff', 'c-pink': '#ffb0d6', 'c-red': '#ffaaa1', 'c-teal': '#8fe8de',
};

export const PRESETS: Record<AppearancePreset, Preset> = {
  notion: { id: 'notion', label: 'Как Notion', description: 'Белая страница, тёплые серые тона, глубокая тёмная тема', light: NOTION_LIGHT, dark: NOTION_DARK, radius: [4, 6, 8, 12], font: FONT_STACKS.system },
  chatgpt: { id: 'chatgpt', label: 'Как ChatGPT', description: 'Нейтральные серые, крупные скругления, зелёный акцент', light: CHATGPT_LIGHT, dark: CHATGPT_DARK, radius: [8, 12, 16, 24], font: FONT_STACKS.system },
  teamly: { id: 'teamly', label: 'Как Teamly', description: 'Светло-серый фон, белые карточки, сине-фиолетовый акцент', light: TEAMLY_LIGHT, dark: TEAMLY_DARK, radius: [6, 10, 14, 18], font: FONT_STACKS.inter },
  classic: { id: 'classic', label: 'Классический', description: 'Прежнее оформление базы знаний', light: CLASSIC_LIGHT, dark: CLASSIC_DARK, radius: [6, 8, 12, 16], font: FONT_STACKS.inter },
  contrast: { id: 'contrast', label: 'Высокий контраст', description: 'Чёрное на белом и белое на чёрном, чёткие границы', light: CONTRAST_LIGHT, dark: CONTRAST_DARK, radius: [4, 6, 8, 12], font: FONT_STACKS.inter },
};

export const PRESET_LIST: Preset[] = Object.values(PRESETS);

const decl = (t: Tokens) =>
  (Object.keys(t) as TokenName[])
    .map((k) => `--${k}:${t[k]};`)
    .join('');

/**
 * CSS of one preset. Selectors are one attribute more specific than those of tokens.css, so a preset wins over the
 * static tokens regardless of stylesheet order, and the dark rules (three parts) win over the light ones (two).
 */
export function presetCss(p: Preset): string {
  const sel = `:root[data-preset="${p.id}"]`;
  const common = `--r-sm:${p.radius[0]}px;--r-md:${p.radius[1]}px;--r-lg:${p.radius[2]}px;--r-xl:${p.radius[3]}px;--font:${p.font};`;
  return (
    `${sel}{color-scheme:light;${common}${decl(p.light)}}` +
    `@media (prefers-color-scheme: dark){${sel}:not([data-theme="light"]){color-scheme:dark;${decl(p.dark)}}}` +
    `${sel}[data-theme="dark"]{color-scheme:dark;${decl(p.dark)}}`
  );
}

export function allPresetsCss(): string {
  return PRESET_LIST.map(presetCss).join('\n');
}
