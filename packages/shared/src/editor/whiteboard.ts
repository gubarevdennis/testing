/**
 * «Доска» (whiteboard) block: scene format, validation, merge and a dependency-free SVG renderer (D-46).
 *
 * The board is edited in the browser with Excalidraw (loaded lazily, only when a board is opened). The scene is stored
 * in the node attribute `scene` as plain JSON — the elements of Excalidraw (shapes, sticky notes, arrows bound to
 * shapes, text, freehand, images) plus a map of image files to attachments. Everything that shows a board without the
 * editor — read mode, previews, HTML/PDF/DOCX/Markdown export, search, history compare — uses this module only: the
 * renderer below produces a crisp SVG tree that is turned into a string (server), a DOMOutputSpec (renderHTML) or React
 * elements (browser).
 *
 * Collaboration: the attribute is replaced as a whole, but writers merge element-wise before writing
 * (`reconcileElements`: per element the higher `version` wins, ties by lower `versionNonce` — Excalidraw's own rule),
 * and deleted elements stay as small tombstones so that a deletion is not undone by a concurrent writer.
 */
import { sanitizeHref } from './url.js';

export const WHITEBOARD_SCENE_VERSION = 1;
/** Hard limits of a stored scene (abuse protection; a real board stays far below). */
export const WHITEBOARD_MAX_ELEMENTS = 5000;
const MAX_TEXT = 20_000;
const MAX_POINTS = 20_000;
const MAX_TOMBSTONES = 1000;
const TOMBSTONE_TTL_MS = 30 * 24 * 3600 * 1000;

export type WhiteboardElement = Record<string, any> & { id: string; type: string };

export interface WhiteboardFile {
  attachmentId: string;
  mimeType?: string | null;
  /** Export-time only (data: URL inlined by the exporter); never stored. */
  src?: string | null;
}

export interface WhiteboardScene {
  v: number;
  elements: WhiteboardElement[];
  files?: Record<string, WhiteboardFile>;
}

export const WHITEBOARD_ELEMENT_TYPES = new Set(['rectangle', 'ellipse', 'diamond', 'arrow', 'line', 'freedraw', 'text', 'image', 'frame']);

/** Sticky note colours of the board toolbar (pastel, readable with dark text in both themes). */
export const STICKY_COLORS = [
  { id: 'yellow', label: 'Жёлтый', value: '#fff3a3' },
  { id: 'orange', label: 'Оранжевый', value: '#ffd8a8' },
  { id: 'pink', label: 'Розовый', value: '#ffd6e7' },
  { id: 'green', label: 'Зелёный', value: '#d3f9d8' },
  { id: 'blue', label: 'Голубой', value: '#d0ebff' },
  { id: 'purple', label: 'Сиреневый', value: '#e5dbff' },
] as const;

const COLOR = /^(#[0-9a-f]{3,8}|transparent|[a-z]{3,20}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\))$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[\w-]{1,64}$/;

export function safeColor(v: unknown, fallback: string): string {
  return typeof v === 'string' && COLOR.test(v.trim()) ? v.trim() : fallback;
}
const fin = (v: unknown, d = 0, max = 1e6) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-max, Math.min(max, v)) : d);

function isObj(v: unknown): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function cleanPoints(v: unknown): number[][] {
  if (!Array.isArray(v)) return [];
  const out: number[][] = [];
  for (const p of v.slice(0, MAX_POINTS)) if (Array.isArray(p) && p.length >= 2) out.push([fin(p[0]), fin(p[1])]);
  return out;
}

/**
 * Validates and cleans one element: known geometry/style fields get safe values (finite numbers, colours, sanitized
 * link, bounded text); other Excalidraw fields are kept as they are (the editor needs them). Returns null for unusable
 * input (unknown type, no id).
 */
export function normalizeElement(raw: unknown): WhiteboardElement | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !ID.test(raw.id)) return null;
  if (raw.isDeleted === true) {
    // tombstone: only what reconciliation needs
    return { id: raw.id, type: typeof raw.type === 'string' ? raw.type.slice(0, 20) : 'rectangle', version: fin(raw.version, 1, 1e9), versionNonce: fin(raw.versionNonce, 0, 1e10), isDeleted: true, updated: fin(raw.updated, 0, 1e14) };
  }
  if (typeof raw.type !== 'string' || !WHITEBOARD_ELEMENT_TYPES.has(raw.type)) return null;
  const e: WhiteboardElement = { ...raw, id: raw.id, type: raw.type };
  e.x = fin(raw.x);
  e.y = fin(raw.y);
  e.width = Math.abs(fin(raw.width));
  e.height = Math.abs(fin(raw.height));
  e.angle = fin(raw.angle, 0, 100);
  e.strokeColor = safeColor(raw.strokeColor, '#1e1e1e');
  e.backgroundColor = safeColor(raw.backgroundColor, 'transparent');
  e.strokeWidth = Math.max(0, Math.min(50, fin(raw.strokeWidth, 2)));
  e.opacity = Math.max(0, Math.min(100, fin(raw.opacity, 100)));
  e.version = fin(raw.version, 1, 1e9);
  e.versionNonce = fin(raw.versionNonce, 0, 1e10);
  if (!['solid', 'dashed', 'dotted'].includes(raw.strokeStyle)) e.strokeStyle = 'solid';
  if (!['solid', 'hachure', 'cross-hatch', 'zigzag'].includes(raw.fillStyle)) e.fillStyle = 'solid';
  if (raw.link != null) e.link = sanitizeHref(raw.link);
  if (e.type === 'text') {
    e.text = typeof raw.text === 'string' ? raw.text.slice(0, MAX_TEXT) : '';
    if (typeof raw.originalText === 'string') e.originalText = raw.originalText.slice(0, MAX_TEXT);
    e.fontSize = Math.max(1, Math.min(500, fin(raw.fontSize, 20)));
    e.lineHeight = Math.max(0.5, Math.min(5, fin(raw.lineHeight, 1.25)));
    if (!['left', 'center', 'right'].includes(raw.textAlign)) e.textAlign = 'left';
    if (!['top', 'middle', 'bottom'].includes(raw.verticalAlign)) e.verticalAlign = 'top';
  }
  if (e.type === 'arrow' || e.type === 'line' || e.type === 'freedraw') e.points = cleanPoints(raw.points);
  if (e.type === 'frame' && raw.name != null) e.name = String(raw.name).slice(0, 200);
  if (e.type === 'image' && (typeof raw.fileId !== 'string' || !ID.test(raw.fileId))) e.fileId = null;
  return e;
}

/** Validates a stored/received scene. Never throws; unusable input becomes an empty scene. */
export function normalizeScene(raw: unknown): WhiteboardScene {
  const src = typeof raw === 'string' ? safeParse(raw) : raw;
  if (!isObj(src)) return { v: WHITEBOARD_SCENE_VERSION, elements: [] };
  const elements: WhiteboardElement[] = [];
  const seen = new Set<string>();
  for (const r of Array.isArray(src.elements) ? src.elements.slice(0, WHITEBOARD_MAX_ELEMENTS + MAX_TOMBSTONES) : []) {
    const e = normalizeElement(r);
    if (e && !seen.has(e.id)) {
      seen.add(e.id);
      elements.push(e);
    }
  }
  const files: Record<string, WhiteboardFile> = {};
  if (isObj(src.files))
    for (const [k, f] of Object.entries(src.files)) {
      if (!ID.test(k) || !isObj(f) || typeof f.attachmentId !== 'string' || !UUID.test(f.attachmentId)) continue;
      files[k] = { attachmentId: f.attachmentId, mimeType: typeof f.mimeType === 'string' && /^image\/[\w.+-]+$/.test(f.mimeType) ? f.mimeType : null };
    }
  return { v: WHITEBOARD_SCENE_VERSION, elements, files };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Visible (not deleted) elements in z-order. */
export function liveElements(scene: WhiteboardScene | null | undefined): WhiteboardElement[] {
  return (scene?.elements ?? []).filter((e) => !e.isDeleted);
}

/**
 * Prepares a scene for storage: tombstones reduced to their identity (oldest dropped past a limit, expired ones after
 * 30 days), files limited to those used by image elements.
 */
export function compactScene(scene: WhiteboardScene, now = Date.now()): WhiteboardScene {
  const n = normalizeScene(scene);
  const live = n.elements.filter((e) => !e.isDeleted);
  const dead = n.elements
    .filter((e) => e.isDeleted && (!e.updated || now - e.updated < TOMBSTONE_TTL_MS))
    .sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0))
    .slice(0, MAX_TOMBSTONES);
  const used = new Set(live.filter((e) => e.type === 'image' && e.fileId).map((e) => e.fileId as string));
  const files: Record<string, WhiteboardFile> = {};
  for (const [k, f] of Object.entries(n.files ?? {})) if (used.has(k)) files[k] = { attachmentId: f.attachmentId, ...(f.mimeType ? { mimeType: f.mimeType } : {}) };
  return { v: WHITEBOARD_SCENE_VERSION, elements: [...live.slice(0, WHITEBOARD_MAX_ELEMENTS), ...dead], files };
}

/** Wins `b` over `a` (same id)? Excalidraw's rule: higher version; on a tie the lower versionNonce. */
function newer(a: WhiteboardElement, b: WhiteboardElement): boolean {
  const va = a.version ?? 0;
  const vb = b.version ?? 0;
  if (vb !== va) return vb > va;
  return (b.versionNonce ?? 0) < (a.versionNonce ?? 0);
}

/**
 * Element-level merge of two versions of a board (local editor state vs. the stored attribute written by someone
 * else). Order: the local z-order, elements only known remotely inserted after their remote predecessor.
 */
export function reconcileElements(local: WhiteboardElement[], remote: WhiteboardElement[]): WhiteboardElement[] {
  const byId = new Map<string, WhiteboardElement>();
  for (const e of local) byId.set(e.id, e);
  for (const r of remote) {
    const l = byId.get(r.id);
    if (!l || newer(l, r)) byId.set(r.id, r);
  }
  const order = local.map((e) => e.id);
  const pos = new Set(order);
  let prev: string | null = null;
  for (const r of remote) {
    if (!pos.has(r.id)) {
      const at = prev ? order.indexOf(prev) + 1 : 0;
      order.splice(at, 0, r.id);
      pos.add(r.id);
    }
    prev = r.id;
  }
  return order.map((id) => byId.get(id)!);
}

/** Merges two scenes (elements reconciled, files united). */
export function mergeScenes(local: WhiteboardScene, remote: WhiteboardScene | null | undefined): WhiteboardScene {
  if (!remote) return local;
  return { v: WHITEBOARD_SCENE_VERSION, elements: reconcileElements(local.elements, remote.elements), files: { ...(remote.files ?? {}), ...(local.files ?? {}) } };
}

/** Text written on a board (stickies, shapes, free text, frame names) in reading order: search, plain text, history. */
export function whiteboardText(scene: WhiteboardScene | null | undefined): string {
  const els = liveElements(scene);
  const parts = els
    .filter((e) => (e.type === 'text' && (e.originalText || e.text)) || (e.type === 'frame' && e.name))
    .map((e) => ({ y: fin(e.y), x: fin(e.x), t: String(e.type === 'text' ? e.originalText || e.text : e.name).replace(/\s+/g, ' ').trim() }))
    .filter((p) => p.t)
    .sort((a, b) => (Math.abs(a.y - b.y) > 20 ? a.y - b.y : a.x - b.x));
  return parts.map((p) => p.t).join(' · ');
}

/** Attachments shown on a board (images). */
export function whiteboardAttachmentIds(scene: WhiteboardScene | null | undefined): string[] {
  if (!scene?.files) return [];
  const used = new Set(liveElements(scene).filter((e) => e.type === 'image' && e.fileId).map((e) => e.fileId));
  return [...new Set(Object.entries(scene.files).filter(([k]) => used.has(k)).map(([, f]) => f.attachmentId))];
}

/** Content fingerprint of a board (for "changed?" checks): visible elements' ids and versions. */
export function whiteboardFingerprint(scene: WhiteboardScene | null | undefined): string {
  return liveElements(scene)
    .map((e) => `${e.id}:${e.version ?? 0}`)
    .join(',');
}

// ------------------------------------------------------------------------------------------------ SVG rendering

/** Minimal SVG tree: rendered to a string (server), a ProseMirror DOMOutputSpec (renderHTML) or React elements. */
export interface SvgNode {
  t: string;
  a?: Record<string, string | number>;
  c?: Array<SvgNode | string>;
}

export interface WhiteboardRender {
  tree: SvgNode;
  width: number;
  height: number;
}

export interface RenderOptions {
  /** Image URL of a file (default: in-app attachment content URL, or the export-time data: URL). */
  imageHref?: (file: WhiteboardFile, fileId: string) => string | null;
  /** Prefix of ids inside the SVG (several boards on one page must not share pattern ids). */
  idPrefix?: string;
  /** Padding around the content, px. */
  padding?: number;
  /** Accessible title. */
  title?: string;
}

const FONT_STACKS: Record<number, string> = {
  1: 'Excalifont, Virgil, "Segoe Print", "Comic Sans MS", cursive',
  2: 'Helvetica, Arial, "Liberation Sans", sans-serif',
  3: '"Cascadia Code", "JetBrains Mono", Consolas, "DejaVu Sans Mono", monospace',
  4: '"Liberation Sans", Arial, Helvetica, sans-serif',
  5: 'Excalifont, Virgil, "Segoe Print", "Comic Sans MS", cursive',
  6: 'Nunito, Inter, "Segoe UI", Roboto, Arial, sans-serif',
  7: '"Lilita One", Impact, Arial, sans-serif',
  8: '"Comic Shanns", "Comic Sans MS", "Cascadia Code", monospace',
};
export const fontStack = (family: unknown) => FONT_STACKS[Number(family)] ?? FONT_STACKS[2];

const r2 = (n: number) => Math.round(n * 100) / 100;

type Pt = [number, number];

function rotate([x, y]: Pt, [cx, cy]: Pt, angle: number): Pt {
  if (!angle) return [x, y];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
}

function arrowheadSize(e: WhiteboardElement) {
  return 14 + e.strokeWidth * 3;
}

/** Axis-aligned bounds of an element (rotation, stroke and arrowheads included). */
function elementBounds(e: WhiteboardElement): [number, number, number, number] {
  const pts: Pt[] = [];
  const linear = e.type === 'arrow' || e.type === 'line' || e.type === 'freedraw';
  if (linear && e.points?.length) for (const p of e.points as number[][]) pts.push([e.x + p[0], e.y + p[1]]);
  else pts.push([e.x, e.y], [e.x + e.width, e.y], [e.x + e.width, e.y + e.height], [e.x, e.y + e.height]);
  const c: Pt = [e.x + e.width / 2, e.y + e.height / 2];
  const rp = pts.map((p) => rotate(p, c, e.angle));
  const pad = e.strokeWidth * (e.type === 'freedraw' ? 2 : 1) + (e.type === 'arrow' ? arrowheadSize(e) * 0.6 : 0) + (e.type === 'frame' ? 0 : 1);
  const top = e.type === 'frame' ? 24 : 0; // frame title above the frame
  return [Math.min(...rp.map((p) => p[0])) - pad, Math.min(...rp.map((p) => p[1])) - pad - top, Math.max(...rp.map((p) => p[0])) + pad, Math.max(...rp.map((p) => p[1])) + pad];
}

export function sceneBounds(scene: WhiteboardScene | null | undefined): { x: number; y: number; width: number; height: number } | null {
  const els = liveElements(scene);
  if (!els.length) return null;
  let [x1, y1, x2, y2] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const e of els) {
    const [a, b, c, d] = elementBounds(e);
    x1 = Math.min(x1, a);
    y1 = Math.min(y1, b);
    x2 = Math.max(x2, c);
    y2 = Math.max(y2, d);
  }
  return { x: x1, y: y1, width: Math.max(1, x2 - x1), height: Math.max(1, y2 - y1) };
}

function cornerRadius(e: WhiteboardElement) {
  if (!e.roundness) return 0;
  const size = Math.min(e.width, e.height);
  if (e.roundness.type === 3) {
    const fixed = typeof e.roundness.value === 'number' ? e.roundness.value : 32;
    return size <= fixed / 0.25 ? size * 0.25 : fixed;
  }
  return size * 0.25;
}

function dash(e: WhiteboardElement): Record<string, string | number> {
  if (e.strokeStyle === 'dashed') return { 'stroke-dasharray': `${8 + e.strokeWidth} ${8 + e.strokeWidth}` };
  if (e.strokeStyle === 'dotted') return { 'stroke-dasharray': `1.5 ${6 + e.strokeWidth}`, 'stroke-linecap': 'round' };
  return {};
}

/** Smooth path through points (Catmull-Rom → cubic Bézier), like Excalidraw's curved arrows/lines. */
function curvePath(pts: Pt[]): string {
  if (pts.length < 3) return 'M' + pts.map((p) => `${r2(p[0])} ${r2(p[1])}`).join(' L');
  let d = `M${r2(pts[0][0])} ${r2(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${r2(c1[0])} ${r2(c1[1])} ${r2(c2[0])} ${r2(c2[1])} ${r2(p2[0])} ${r2(p2[1])}`;
  }
  return d;
}

function arrowhead(kind: string, tip: Pt, from: Pt, e: WhiteboardElement, segLen: number): SvgNode | null {
  const stroke = e.strokeColor;
  const size = Math.min(arrowheadSize(e), Math.max(6, segLen * 0.5));
  const ang = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const at = (len: number, da: number): Pt => [tip[0] - len * Math.cos(ang + da), tip[1] - len * Math.sin(ang + da)];
  const P = (p: Pt) => `${r2(p[0])},${r2(p[1])}`;
  const sw = e.strokeWidth;
  switch (kind) {
    case 'arrow': {
      const a = at(size, 0.42);
      const b = at(size, -0.42);
      return { t: 'polyline', a: { points: `${P(a)} ${P(tip)} ${P(b)}`, fill: 'none', stroke, 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } };
    }
    case 'triangle':
    case 'triangle_outline': {
      const a = at(size, 0.45);
      const b = at(size, -0.45);
      return { t: 'polygon', a: { points: `${P(a)} ${P(tip)} ${P(b)}`, fill: kind === 'triangle' ? stroke : 'none', stroke, 'stroke-width': sw, 'stroke-linejoin': 'round' } };
    }
    case 'diamond':
    case 'diamond_outline': {
      const s = size * 0.7;
      const m = at(s / 2, 0);
      const back = at(s, 0);
      const l: Pt = [m[0] - (s / 3) * Math.sin(ang), m[1] + (s / 3) * Math.cos(ang)];
      const rr: Pt = [m[0] + (s / 3) * Math.sin(ang), m[1] - (s / 3) * Math.cos(ang)];
      return { t: 'polygon', a: { points: `${P(tip)} ${P(l)} ${P(back)} ${P(rr)}`, fill: kind === 'diamond' ? stroke : 'none', stroke, 'stroke-width': sw, 'stroke-linejoin': 'round' } };
    }
    case 'dot':
    case 'circle':
    case 'circle_outline': {
      const rad = Math.max(3, size * 0.28);
      const c = at(rad, 0);
      return { t: 'circle', a: { cx: r2(c[0]), cy: r2(c[1]), r: r2(rad), fill: kind === 'circle_outline' ? 'none' : stroke, stroke, 'stroke-width': sw } };
    }
    case 'bar': {
      const h = size * 0.5;
      const a: Pt = [tip[0] - h * Math.sin(ang), tip[1] + h * Math.cos(ang)];
      const b: Pt = [tip[0] + h * Math.sin(ang), tip[1] - h * Math.cos(ang)];
      return { t: 'line', a: { x1: r2(a[0]), y1: r2(a[1]), x2: r2(b[0]), y2: r2(b[1]), stroke, 'stroke-width': sw, 'stroke-linecap': 'round' } };
    }
    default:
      return null;
  }
}

function fillOf(e: WhiteboardElement, patterns: Map<string, SvgNode>, prefix: string): string {
  const bg = e.backgroundColor;
  if (!bg || bg === 'transparent') return 'none';
  if (e.fillStyle === 'solid') return bg;
  const key = `${e.fillStyle}|${bg}`;
  let p = patterns.get(key);
  if (!p) {
    const id = `${prefix}p${patterns.size}`;
    const lines: SvgNode[] = [{ t: 'line', a: { x1: 0, y1: 0, x2: 0, y2: 8, stroke: bg, 'stroke-width': 2 } }];
    if (e.fillStyle === 'cross-hatch') lines.push({ t: 'line', a: { x1: 0, y1: 4, x2: 8, y2: 4, stroke: bg, 'stroke-width': 2 } });
    p = { t: 'pattern', a: { id, patternUnits: 'userSpaceOnUse', width: 8, height: 8, patternTransform: 'rotate(-41)' }, c: lines };
    patterns.set(key, p);
  }
  return `url(#${p.a!.id})`;
}

function textNode(e: WhiteboardElement): SvgNode {
  const lines = String(e.text ?? '').split('\n');
  const fs = e.fontSize;
  const lh = fs * (e.lineHeight || 1.25);
  const anchor = e.textAlign === 'center' ? 'middle' : e.textAlign === 'right' ? 'end' : 'start';
  const x = e.textAlign === 'center' ? e.x + e.width / 2 : e.textAlign === 'right' ? e.x + e.width : e.x;
  return {
    t: 'text',
    a: { x: r2(x), y: r2(e.y), 'font-family': fontStack(e.fontFamily), 'font-size': r2(fs), fill: e.strokeColor, 'text-anchor': anchor, 'xml:space': 'preserve' },
    c: lines.map((line, i) => ({ t: 'tspan', a: { x: r2(x), y: r2(e.y + i * lh + lh / 2 + fs * 0.35) }, c: [line || ' '] })),
  };
}

function elementNode(e: WhiteboardElement, ctx: { patterns: Map<string, SvgNode>; prefix: string; files: Record<string, WhiteboardFile>; imageHref: NonNullable<RenderOptions['imageHref']> }): SvgNode | null {
  const stroke = e.strokeColor;
  const sw = e.strokeWidth;
  const strokeAttrs: Record<string, string | number> = stroke === 'transparent' || !sw ? { stroke: 'none' } : { stroke, 'stroke-width': sw, ...dash(e) };
  let node: SvgNode | null = null;
  switch (e.type) {
    case 'rectangle': {
      const rx = cornerRadius(e);
      node = { t: 'rect', a: { x: r2(e.x), y: r2(e.y), width: r2(e.width), height: r2(e.height), ...(rx ? { rx: r2(rx), ry: r2(rx) } : {}), fill: fillOf(e, ctx.patterns, ctx.prefix), ...strokeAttrs, 'stroke-linejoin': 'round' } };
      break;
    }
    case 'ellipse':
      node = { t: 'ellipse', a: { cx: r2(e.x + e.width / 2), cy: r2(e.y + e.height / 2), rx: r2(e.width / 2), ry: r2(e.height / 2), fill: fillOf(e, ctx.patterns, ctx.prefix), ...strokeAttrs } };
      break;
    case 'diamond': {
      const { x, y, width: w, height: h } = e;
      node = { t: 'polygon', a: { points: `${r2(x + w / 2)},${r2(y)} ${r2(x + w)},${r2(y + h / 2)} ${r2(x + w / 2)},${r2(y + h)} ${r2(x)},${r2(y + h / 2)}`, fill: fillOf(e, ctx.patterns, ctx.prefix), ...strokeAttrs, 'stroke-linejoin': 'round' } };
      break;
    }
    case 'line':
    case 'arrow': {
      const pts: Pt[] = (e.points as number[][]).map((p) => [e.x + p[0], e.y + p[1]]);
      if (pts.length < 2) return null;
      const curved = !!e.roundness && !e.elbowed;
      const d = curved ? curvePath(pts) : 'M' + pts.map((p) => `${r2(p[0])} ${r2(p[1])}`).join(' L');
      const closed = e.type === 'line' && pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1;
      const kids: SvgNode[] = [{ t: 'path', a: { d: d + (closed ? ' Z' : ''), fill: closed ? fillOf(e, ctx.patterns, ctx.prefix) : 'none', ...strokeAttrs, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } }];
      if (e.type === 'arrow') {
        const n = pts.length;
        const segEnd = Math.hypot(pts[n - 1][0] - pts[n - 2][0], pts[n - 1][1] - pts[n - 2][1]);
        const segStart = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
        const end = e.endArrowhead === undefined ? 'arrow' : e.endArrowhead;
        if (end) {
          const h = arrowhead(String(end), pts[n - 1], pts[n - 2], e, segEnd);
          if (h) kids.push(h);
        }
        if (e.startArrowhead) {
          const h = arrowhead(String(e.startArrowhead), pts[0], pts[1], e, segStart);
          if (h) kids.push(h);
        }
      }
      node = kids.length === 1 ? kids[0] : { t: 'g', c: kids };
      break;
    }
    case 'freedraw': {
      const pts: Pt[] = (e.points as number[][]).map((p) => [e.x + p[0], e.y + p[1]]);
      if (!pts.length) return null;
      if (pts.length === 1) {
        node = { t: 'circle', a: { cx: r2(pts[0][0]), cy: r2(pts[0][1]), r: r2(Math.max(1, sw * 1.6)), fill: stroke } };
        break;
      }
      node = { t: 'path', a: { d: curvePath(pts.length > 400 ? pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1) : pts), fill: 'none', stroke, 'stroke-width': r2(Math.max(1, sw * 3)), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } };
      break;
    }
    case 'text':
      if (!String(e.text ?? '').trim()) return null;
      node = textNode(e);
      break;
    case 'image': {
      const f = e.fileId ? ctx.files[e.fileId] : null;
      const href = f ? ctx.imageHref(f, e.fileId) : null;
      if (!href) {
        node = { t: 'rect', a: { x: r2(e.x), y: r2(e.y), width: r2(e.width), height: r2(e.height), fill: '#f1f3f5', stroke: '#ced4da', 'stroke-dasharray': '6 6' } };
        break;
      }
      const scale = Array.isArray(e.scale) ? e.scale : [1, 1];
      const flip: Record<string, string> = scale[0] === -1 || scale[1] === -1 ? { transform: `translate(${r2(scale[0] === -1 ? 2 * e.x + e.width : 0)} ${r2(scale[1] === -1 ? 2 * e.y + e.height : 0)}) scale(${scale[0] === -1 ? -1 : 1} ${scale[1] === -1 ? -1 : 1})` } : {};
      node = { t: 'image', a: { x: r2(e.x), y: r2(e.y), width: r2(e.width), height: r2(e.height), href, preserveAspectRatio: 'none', 'data-wb-image': '1', ...flip } };
      break;
    }
    case 'frame':
      node = {
        t: 'g',
        c: [
          { t: 'rect', a: { x: r2(e.x), y: r2(e.y), width: r2(e.width), height: r2(e.height), rx: 8, ry: 8, fill: 'none', stroke: '#bbb', 'stroke-width': 1 } },
          ...(e.name ? [{ t: 'text', a: { x: r2(e.x), y: r2(e.y - 8), 'font-family': fontStack(2), 'font-size': 14, fill: '#868e96' }, c: [String(e.name)] } as SvgNode] : []),
        ],
      };
      break;
    default:
      return null;
  }
  const attrs: Record<string, string | number> = {};
  if (e.angle) attrs.transform = `rotate(${r2((e.angle * 180) / Math.PI)} ${r2(e.x + e.width / 2)} ${r2(e.y + e.height / 2)})`;
  if (e.opacity < 100) attrs.opacity = r2(e.opacity / 100);
  if (!node || !Object.keys(attrs).length) return node;
  return { t: 'g', a: attrs, c: [node] };
}

/** Renders a board as an SVG tree sized to its content (null for an empty board). */
export function renderWhiteboard(scene: WhiteboardScene | null | undefined, opts: RenderOptions = {}): WhiteboardRender | null {
  const s = scene ? normalizeScene(scene) : null;
  const bounds = sceneBounds(s);
  if (!s || !bounds) return null;
  const pad = opts.padding ?? 16;
  const prefix = 'wb' + String(opts.idPrefix ?? '').replace(/[^\w-]/g, '').slice(0, 40) + '-';
  const files = s.files ?? {};
  // export-time `src` (data: URL inlined by the exporter) is carried over from the raw scene
  const rawFiles = (scene as WhiteboardScene).files ?? {};
  const imageHref =
    opts.imageHref ??
    ((f: WhiteboardFile, id: string) => {
      const src = rawFiles[id]?.src;
      if (typeof src === 'string' && (/^data:image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml);base64,[a-z0-9+/=]+$/i.test(src) || /^https?:\/\/[^\s"<>]+$/i.test(src))) return src;
      return `/api/v1/attachments/${f.attachmentId}/content`;
    });
  const ctx = { patterns: new Map<string, SvgNode>(), prefix, files, imageHref };
  const body: SvgNode[] = [];
  for (const e of liveElements(s)) {
    const n = elementNode(e, ctx);
    if (n) body.push(n);
  }
  const width = Math.ceil(bounds.width + pad * 2);
  const height = Math.ceil(bounds.height + pad * 2);
  const vb = `${r2(bounds.x - pad)} ${r2(bounds.y - pad)} ${width} ${height}`;
  const children: SvgNode[] = [];
  if (opts.title) children.push({ t: 'title', c: [opts.title] });
  if (ctx.patterns.size) children.push({ t: 'defs', c: [...ctx.patterns.values()] });
  children.push(...body);
  return {
    width,
    height,
    tree: { t: 'svg', a: { xmlns: 'http://www.w3.org/2000/svg', viewBox: vb, width, height, role: 'img', 'aria-label': opts.title ?? 'Доска', class: 'kb-wb-svg' }, c: children },
  };
}

const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => escText(s).replace(/"/g, '&quot;');
const ATTR_NAME = /^[a-zA-Z_:][\w:.-]*$/;

/** Serialises an SVG tree (attribute values and text escaped; attribute names checked). */
export function svgToString(n: SvgNode | string): string {
  if (typeof n === 'string') return escText(n);
  const attrs = Object.entries(n.a ?? {})
    .filter(([k]) => ATTR_NAME.test(k))
    .map(([k, v]) => ` ${k}="${escAttr(String(v))}"`)
    .join('');
  const kids = (n.c ?? []).map(svgToString).join('');
  return kids ? `<${n.t}${attrs}>${kids}</${n.t}>` : `<${n.t}${attrs}/>`;
}

/** Standalone SVG document of a board (export «SVG», files of Markdown/DOCX exports). */
export function whiteboardSvgString(scene: WhiteboardScene | null | undefined, opts: RenderOptions & { background?: string | null } = {}): string | null {
  const r = renderWhiteboard(scene, opts);
  if (!r) return null;
  if (opts.background) {
    const [x, y, w, h] = String(r.tree.a!.viewBox).split(' ').map(Number);
    r.tree.c!.unshift({ t: 'rect', a: { x, y, width: w, height: h, fill: safeColor(opts.background, '#ffffff') } });
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + svgToString(r.tree);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** ProseMirror DOMOutputSpec of an SVG tree (namespaced: children inherit the SVG namespace). */
export function svgToDomSpec(n: SvgNode | string, root = true): any {
  if (typeof n === 'string') return n;
  const attrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(n.a ?? {})) if (ATTR_NAME.test(k) && k !== 'xmlns' && !k.includes(':')) attrs[k] = String(v);
  return [root ? `${SVG_NS} ${n.t}` : n.t, attrs, ...(n.c ?? []).map((c) => svgToDomSpec(c, false))];
}

/** Script-capable link on a board element (javascript:, vbscript:, data:) — rejected by the server like other unsafe URLs. */
export function isDangerousWhiteboardLink(link: unknown): boolean {
  if (typeof link !== 'string') return false;
  const u = link.replace(/[\u0000-\u001F\u007F\s]/g, '').toLowerCase();
  // eslint-disable-next-line no-script-url -- detector
  return u.startsWith('javascript:') || u.startsWith('vbscript:') || u.startsWith('data:');
}

/** Removes unusable element links of a scene (imports, restores). */
export function sanitizeWhiteboardLinks(scene: unknown): { scene: unknown; changed: number } {
  if (!isObj(scene) || !Array.isArray(scene.elements)) return { scene, changed: 0 };
  let changed = 0;
  const elements = scene.elements.map((e: unknown) => {
    if (!isObj(e) || e.link == null || e.link === '') return e;
    const safe = sanitizeHref(e.link);
    if (safe === e.link) return e;
    changed++;
    return { ...e, link: safe };
  });
  return changed ? { scene: { ...scene, elements }, changed } : { scene, changed: 0 };
}
