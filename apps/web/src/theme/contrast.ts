import { TEXT_COLORS } from '@kb/shared';
import type { Preset, TokenName, Tokens } from './presets';

/** WCAG 2.1 relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Text: 4.5:1 (WCAG 1.4.3 AA); boundaries of controls and focus indicators: 3:1 (1.4.11). */
const TEXT = 4.5;
const UI = 3;

const SURFACES: TokenName[] = ['bg', 'surface', 'surface-2', 'surface-3', 'surface-hover', 'surface-active'];
const PALETTE = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red', 'teal'] as const;

/**
 * Token pairs that the interface actually renders together (foreground, background, minimum ratio). Decorative
 * --text-3 (placeholders, disabled) and --border/--border-strong (dividers) are intentionally not checked (D-19), nor
 * is a coloured text on a highlight the author chose for it (a document choice; body text on every highlight is).
 */
export const CONTRAST_PAIRS: Array<[TokenName, TokenName, number]> = [
  ...SURFACES.map((s) => ['text', s, TEXT] as [TokenName, TokenName, number]),
  ...(['bg', 'surface', 'surface-2'] as TokenName[]).map((s) => ['text-2', s, TEXT] as [TokenName, TokenName, number]),
  ['accent-strong', 'bg', TEXT],
  ['accent-strong', 'surface', TEXT],
  ['accent-strong', 'surface-2', TEXT],
  ['accent-strong', 'accent-soft', TEXT],
  ['accent-contrast', 'accent-strong', TEXT],
  ['text', 'accent-soft', TEXT],
  ['text', 'info-soft', TEXT],
  ['border-input', 'surface', UI],
  ['border-input', 'bg', UI],
  ['focus', 'bg', UI],
  ['focus', 'surface', UI],
  ['focus', 'surface-2', UI],
  ['success', 'surface', TEXT],
  ['success', 'success-soft', TEXT],
  ['warning', 'surface', TEXT],
  ['warning', 'warning-soft', TEXT],
  ['danger', 'surface', TEXT],
  ['danger', 'danger-soft', TEXT],
  ['purple', 'surface', TEXT],
  ['purple', 'purple-soft', TEXT],
  ['text', 'success-soft', TEXT],
  ['text', 'warning-soft', TEXT],
  ['text', 'danger-soft', TEXT],
  ...PALETTE.flatMap((c) => [
    [`c-${c}`, 'bg', TEXT],
    [`c-${c}`, 'surface', TEXT],
    ['text', `hl-${c}`, TEXT],
  ] as Array<[TokenName, TokenName, number]>),
];

export interface ContrastFailure {
  preset: string;
  mode: 'light' | 'dark';
  fg: string;
  bg: string;
  ratio: number;
  min: number;
}

function check(preset: string, mode: 'light' | 'dark', t: Tokens): ContrastFailure[] {
  const out: ContrastFailure[] = [];
  const test = (fg: string, bg: string, fgVal: string, bgVal: string, min: number) => {
    const ratio = contrastRatio(fgVal, bgVal);
    if (ratio < min) out.push({ preset, mode, fg, bg, ratio: Math.round(ratio * 100) / 100, min });
  };
  for (const [fg, bg, min] of CONTRAST_PAIRS) test(fg, bg, t[fg], t[bg], min);
  // In the light theme documents show their stored text colours (shared palette) as is: check them on the preset too.
  if (mode === 'light')
    for (const c of TEXT_COLORS) {
      test(`stored ${c.id}`, 'bg', c.value, t.bg, TEXT);
      test(`stored ${c.id}`, 'surface', c.value, t.surface, TEXT);
    }
  return out;
}

/** Every checked pair of a preset in both themes that falls below its WCAG AA minimum. */
export function presetContrastFailures(p: Preset): ContrastFailure[] {
  return [...check(p.id, 'light', p.light), ...check(p.id, 'dark', p.dark)];
}
