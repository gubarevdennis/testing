/**
 * Appearance settings shared by the client (theme presets, fonts) and the server (validation of organisation and
 * user settings, page covers in exports and public pages). The token values of every preset live in the web client
 * (apps/web/src/theme/presets.ts); here only the identifiers and the cover gallery.
 */

export const APPEARANCE_PRESETS = ['notion', 'chatgpt', 'teamly', 'classic', 'contrast'] as const;
export type AppearancePreset = (typeof APPEARANCE_PRESETS)[number];

/** Font of page content: `preset` = the font the preset defines. */
export const APPEARANCE_FONTS = ['preset', 'inter', 'system', 'serif', 'mono'] as const;
export type AppearanceFont = (typeof APPEARANCE_FONTS)[number];

export const APPEARANCE_SIZES = ['small', 'default', 'large'] as const;
export type AppearanceSize = (typeof APPEARANCE_SIZES)[number];

export const APPEARANCE_THEMES = ['system', 'light', 'dark'] as const;
export type AppearanceTheme = (typeof APPEARANCE_THEMES)[number];

export interface OrgAppearance {
  preset: AppearancePreset;
  font: AppearanceFont;
  fontSize: AppearanceSize;
}

/** A user's overrides; null (or absent) = as the organisation decided. */
export interface UserAppearance {
  preset?: AppearancePreset | null;
  font?: AppearanceFont | null;
  fontSize?: AppearanceSize | null;
}

export const DEFAULT_APPEARANCE: OrgAppearance = { preset: 'notion', font: 'preset', fontSize: 'default' };

/** Effective appearance: user overrides on top of the organisation default; unknown values fall back to defaults. */
export function resolveAppearance(org?: Partial<OrgAppearance> | null, user?: UserAppearance | null): OrgAppearance {
  const pick = <T extends string>(list: readonly T[], ...vals: Array<unknown>): T => (vals.find((v) => typeof v === 'string' && (list as readonly string[]).includes(v)) as T | undefined) ?? (list[0] as T);
  return {
    preset: pick(APPEARANCE_PRESETS, user?.preset, org?.preset, DEFAULT_APPEARANCE.preset),
    font: pick(APPEARANCE_FONTS, user?.font, org?.font, DEFAULT_APPEARANCE.font),
    fontSize: pick(APPEARANCE_SIZES, user?.fontSize, org?.fontSize, DEFAULT_APPEARANCE.fontSize),
  };
}

/**
 * Built-in page covers (gradients and solid colours), stored on a page as `cover.gallery`. The same CSS is used by the
 * editor, exports (HTML/PDF) and public pages, so a cover looks identical everywhere and needs no file.
 */
export const COVER_GALLERY: ReadonlyArray<{ id: string; label: string; css: string }> = [
  { id: 'gradient-dawn', label: 'Рассвет', css: 'linear-gradient(120deg, #f6d365 0%, #fda085 100%)' },
  { id: 'gradient-ocean', label: 'Океан', css: 'linear-gradient(120deg, #89f7fe 0%, #66a6ff 100%)' },
  { id: 'gradient-lavender', label: 'Лаванда', css: 'linear-gradient(120deg, #e0c3fc 0%, #8ec5fc 100%)' },
  { id: 'gradient-mint', label: 'Мята', css: 'linear-gradient(120deg, #d4fc79 0%, #96e6a1 100%)' },
  { id: 'gradient-peach', label: 'Персик', css: 'linear-gradient(120deg, #ffecd2 0%, #fcb69f 100%)' },
  { id: 'gradient-night', label: 'Ночь', css: 'linear-gradient(120deg, #30cfd0 0%, #330867 100%)' },
  { id: 'gradient-forest', label: 'Лес', css: 'linear-gradient(120deg, #0ba360 0%, #3cba92 100%)' },
  { id: 'gradient-graphite', label: 'Графит', css: 'linear-gradient(120deg, #434343 0%, #000000 100%)' },
  { id: 'solid-red', label: 'Красный', css: '#e16259' },
  { id: 'solid-yellow', label: 'Жёлтый', css: '#f5c451' },
  { id: 'solid-blue', label: 'Синий', css: '#4a7fd4' },
  { id: 'solid-green', label: 'Зелёный', css: '#4dab9a' },
  { id: 'solid-purple', label: 'Фиолетовый', css: '#9a6dd7' },
  { id: 'solid-beige', label: 'Бежевый', css: '#e9e5dc' },
];

export function coverGalleryCss(id: string | null | undefined): string | null {
  return COVER_GALLERY.find((c) => c.id === id)?.css ?? null;
}

export interface PageCover {
  attachmentId?: string | null;
  url?: string | null;
  gallery?: string | null;
  /** Vertical position of the image in percent (0 = top, 100 = bottom). */
  position?: number;
}

/** Telegram username without the «@» (5–32 letters, digits, underscore), or null when it is not one. */
export function normalizeTelegram(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0];
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(t) ? t : null;
}

/** Phone kept as typed (digits, spaces, brackets, dashes, leading +); `tel:` link value without formatting. */
export function phoneHref(v: string | null | undefined): string | null {
  if (!v) return null;
  const digits = v.replace(/[^\d+]/g, '');
  return /^\+?\d{5,16}$/.test(digits) ? digits : null;
}
