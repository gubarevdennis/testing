import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import type { Editor } from '@tiptap/core';
import { X, ZoomIn, ZoomOut, Maximize, ChevronLeft, ChevronRight, Download, ExternalLink, RotateCw } from 'lucide-react';
import { get } from '../api/client';
import { Tooltip } from './ui/Tooltip';

export interface ViewerImage {
  pos: number;
  attachmentId: string | null;
  src: string;
  alt: string;
  caption: string;
  naturalWidth: number | null;
  naturalHeight: number | null;
}

const useViewer = create<{ images: ViewerImage[]; index: number; open: boolean }>(() => ({ images: [], index: 0, open: false }));

export function openViewer(images: ViewerImage[], index: number) {
  useViewer.setState({ images, index, open: true });
}

export function collectImages(editor: Editor): ViewerImage[] {
  const out: ViewerImage[] = [];
  editor.state.doc.descendants((n, pos) => {
    if (n.type.name === 'image') out.push({ pos, attachmentId: n.attrs.attachmentId, src: n.attrs.src, alt: n.attrs.alt, caption: n.attrs.caption, naturalWidth: n.attrs.naturalWidth, naturalHeight: n.attrs.naturalHeight });
  });
  return out;
}

interface Tiles {
  levels: number;
  width: number;
  height: number;
  tileSize: number;
  format: string;
}

/** Zoom limits (R-MEDIA-021): 10–800 %; very large images may be fitted below 10 %. */
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;

export interface ViewState {
  scale: number;
  x: number;
  y: number;
}

/**
 * Keeps the image inside the viewer (R-MEDIA-018): an image smaller than the viewport is centred on that axis,
 * a larger one cannot be dragged away from the edges. Rotated images are not constrained.
 */
export function clampView(t: ViewState, nat: { w: number; h: number } | null, stage: { w: number; h: number }, rotation = 0): ViewState {
  if (!nat || rotation % 360 !== 0 || !stage.w || !stage.h) return t;
  const axis = (pos: number, size: number, view: number) => (size <= view ? (view - size) / 2 : Math.min(0, Math.max(view - size, pos)));
  return { scale: t.scale, x: axis(t.x, nat.w * t.scale, stage.w), y: axis(t.y, nat.h * t.scale, stage.h) };
}

/**
 * Full-screen image viewer: wheel/pinch zoom anchored at the pointer, drag to pan, double click/tap to zoom,
 * keyboard control, previous/next. Very large images are rendered from deep-zoom tiles so they never have to be
 * decoded in full by the browser.
 */
export function ImageViewer() {
  const { images, index, open } = useViewer();
  const img = images[index];
  if (!open || !img) return null;
  return createPortal(<ViewerInner key={img.pos + ':' + index} img={img} index={index} total={images.length} />, document.body);
}

function ViewerInner({ img, index, total }: { img: ViewerImage; index: number; total: number }) {
  const stage = useRef<HTMLDivElement>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(img.naturalWidth && img.naturalHeight ? { w: img.naturalWidth, h: img.naturalHeight } : null);
  const [t, setRawT] = useState<ViewState>({ scale: 1, x: 0, y: 0 });
  const minScale = useRef(MIN_SCALE);
  const openedAt = useRef(Date.now());
  const geom = useRef<{ nat: { w: number; h: number } | null; rotation: number }>({ nat: null, rotation: 0 });
  const setT = useCallback((u: ViewState | ((p: ViewState) => ViewState)) => {
    setRawT((p) => {
      const next = typeof u === 'function' ? u(p) : u;
      const el = stage.current;
      return clampView(next, geom.current.nat, { w: el?.clientWidth ?? 0, h: el?.clientHeight ?? 0 }, geom.current.rotation);
    });
  }, []);
  const [rotation, setRotation] = useState(0);
  geom.current = { nat, rotation };
  const [fitScale, setFitScale] = useState(1);
  const [tiles, setTiles] = useState<Tiles | null>(null);
  const [hiRes, setHiRes] = useState(false);
  const [error, setError] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number; cx: number; cy: number; x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const lastTap = useRef(0);
  const close = () => useViewer.setState({ open: false });
  const go = (d: number) => useViewer.setState((s) => ({ index: (s.index + d + s.images.length) % s.images.length }));

  const base = img.attachmentId ? `/api/v1/attachments/${img.attachmentId}/content` : img.src;
  const previewSrc = img.attachmentId ? base + '?variant=preview' : img.src;
  const big = nat ? Math.max(nat.w, nat.h) > 2048 : true;

  useEffect(() => {
    if (!img.attachmentId) return;
    get<{ attachment: { tiles: Tiles | null; width: number; height: number } }>(`/api/v1/attachments/${img.attachmentId}`)
      .then((r) => {
        if (r.attachment.tiles) setTiles(r.attachment.tiles);
        if (r.attachment.width && r.attachment.height) setNat((n) => n ?? { w: r.attachment.width, h: r.attachment.height });
      })
      .catch(() => undefined);
  }, [img.attachmentId]);

  const fit = useCallback(() => {
    const el = stage.current;
    if (!el || !nat) return;
    const rotated = rotation % 180 !== 0;
    const w = rotated ? nat.h : nat.w;
    const h = rotated ? nat.w : nat.h;
    const pad = window.innerWidth < 600 ? 8 : 48;
    const s = Math.min((el.clientWidth - pad * 2) / w, (el.clientHeight - pad * 2) / h, 1);
    setFitScale(s);
    minScale.current = Math.min(MIN_SCALE, s);
    setT({ scale: s, x: (el.clientWidth - nat.w * s) / 2, y: (el.clientHeight - nat.h * s) / 2 });
  }, [nat, rotation, setT]);
  useLayoutEffect(fit, [fit]);
  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setT((p) => {
      const scale = Math.max(minScale.current, Math.min(MAX_SCALE, p.scale * factor));
      const k = scale / p.scale;
      return { scale, x: cx - (cx - p.x) * k, y: cy - (cy - p.y) * k };
    });
  }, [setT]);
  const center = () => ({ x: (stage.current?.clientWidth ?? 0) / 2, y: (stage.current?.clientHeight ?? 0) / 2 });
  const setScaleAt = (scale: number, cx: number, cy: number) => setT((p) => ({ scale, x: cx - ((cx - p.x) * scale) / p.scale, y: cy - ((cy - p.y) * scale) / p.scale }));

  useEffect(() => {
    if (big && t.scale > (2048 / Math.max(nat?.w ?? 1, nat?.h ?? 1)) * 1.05 * devicePixelRatio && !tiles) setHiRes(true);
  }, [t.scale, big, tiles, nat]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    stage.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const c = center();
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' && total > 1) go(1);
      else if (e.key === 'ArrowLeft' && total > 1) go(-1);
      else if (e.key === '+' || e.key === '=') zoomAt(1.25, c.x, c.y);
      else if (e.key === '-' || e.key === '_') zoomAt(0.8, c.x, c.y);
      else if (e.key === '0') fit();
      else if (e.key === '1') setScaleAt(1, c.x, c.y);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, total]);

  // wheel must be non-passive to prevent page zoom on trackpad pinch (ctrlKey wheel)
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0022)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const r = stage.current!.getBoundingClientRect();
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: t.scale, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top, x: t.x, y: t.y };
      drag.current = null;
    } else drag.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const p = pinch.current;
      const r = stage.current!.getBoundingClientRect();
      const scale = Math.max(minScale.current, Math.min(MAX_SCALE, (p.scale * Math.hypot(a.x - b.x, a.y - b.y)) / p.dist));
      const cx = (a.x + b.x) / 2 - r.left;
      const cy = (a.y + b.y) / 2 - r.top;
      const k = scale / p.scale;
      setT({ scale, x: cx - (p.cx - p.x) * k, y: cy - (p.cy - p.y) * k });
    } else if (drag.current) {
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true;
      setT((p) => ({ ...p, x: drag.current!.tx + dx, y: drag.current!.ty + dy }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      const r = stage.current!.getBoundingClientRect();
      // click on the backdrop closes (not the second click of the double click that opened the viewer)
      if (e.target === stage.current && e.pointerType === 'mouse') return Date.now() - openedAt.current > 450 ? close() : undefined;
      const now = Date.now();
      if (now - lastTap.current < 320) {
        lastTap.current = 0;
        // double tap/click: toggle between "fit" and a close-up at the pointer
        if (t.scale > fitScale * 1.2) fit();
        else setScaleAt(Math.max(1, fitScale * 2.5), e.clientX - r.left, e.clientY - r.top);
      } else lastTap.current = now;
    }
  };

  const tileEls = useMemo(() => {
    if (!tiles || !nat || !img.attachmentId || !stage.current) return null;
    const dpr = window.devicePixelRatio || 1;
    const displayed = t.scale * dpr;
    if (displayed * Math.max(nat.w, nat.h) <= 2048) return null; // preview is enough
    const maxLevel = tiles.levels - 1;
    const down = Math.max(0, Math.floor(Math.log2(1 / Math.min(1, displayed))));
    const level = Math.max(0, maxLevel - down);
    const f = 2 ** (maxLevel - level); // natural px per level px
    const ts = tiles.tileSize;
    const vw = stage.current.clientWidth;
    const vh = stage.current.clientHeight;
    const x0 = Math.max(0, (-t.x / t.scale) / f);
    const y0 = Math.max(0, (-t.y / t.scale) / f);
    const x1 = Math.min(Math.ceil(nat.w / f), ((vw - t.x) / t.scale) / f);
    const y1 = Math.min(Math.ceil(nat.h / f), ((vh - t.y) / t.scale) / f);
    const out: JSX.Element[] = [];
    for (let row = Math.floor(y0 / ts); row * ts < y1; row++)
      for (let col = Math.floor(x0 / ts); col * ts < x1; col++) {
        const lw = Math.ceil(nat.w / f);
        const lh = Math.ceil(nat.h / f);
        const w = Math.min(ts, lw - col * ts);
        const h = Math.min(ts, lh - row * ts);
        if (w <= 0 || h <= 0) continue;
        out.push(
          <img
            key={`${level}-${col}-${row}`}
            className="viewer-tile"
            alt=""
            draggable={false}
            src={`/api/v1/attachments/${img.attachmentId}/tiles/${level}/${col}_${row}.${tiles.format === 'png' ? 'png' : 'jpeg'}`}
            style={{ left: col * ts * f, top: row * ts * f, width: w * f, height: h * f }}
          />,
        );
        if (out.length > 400) return out;
      }
    return out;
  }, [tiles, nat, t, img.attachmentId]);

  const pct = Math.round(t.scale * 100);
  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={img.alt || img.caption || 'Просмотр изображения'}>
      <div className="viewer-top">
        <span className="viewer-count">{total > 1 ? `${index + 1} / ${total}` : ''}</span>
        <div className="viewer-tools">
          <Tooltip label="Уменьшить" shortcut="−">
            <button className="icon-btn" onClick={() => zoomAt(0.8, center().x, center().y)} aria-label="Уменьшить">
              <ZoomOut size={18} />
            </button>
          </Tooltip>
          <button className="viewer-pct" onClick={() => setScaleAt(1, center().x, center().y)} title="Реальный размер (1)">
            {pct}%
          </button>
          <Tooltip label="Увеличить" shortcut="+">
            <button className="icon-btn" onClick={() => zoomAt(1.25, center().x, center().y)} aria-label="Увеличить">
              <ZoomIn size={18} />
            </button>
          </Tooltip>
          <Tooltip label="Вписать в экран" shortcut="0">
            <button className="icon-btn" onClick={fit} aria-label="Вписать в экран">
              <Maximize size={18} />
            </button>
          </Tooltip>
          <Tooltip label="Повернуть">
            <button className="icon-btn" onClick={() => setRotation((r) => (r + 90) % 360)} aria-label="Повернуть">
              <RotateCw size={18} />
            </button>
          </Tooltip>
          {img.attachmentId && (
            <>
              <Tooltip label="Открыть оригинал в новой вкладке">
                <a className="icon-btn" href={base} target="_blank" rel="noopener" aria-label="Открыть оригинал">
                  <ExternalLink size={18} />
                </a>
              </Tooltip>
              <Tooltip label="Скачать">
                <a className="icon-btn" href={`/api/v1/attachments/${img.attachmentId}/download`} aria-label="Скачать">
                  <Download size={18} />
                </a>
              </Tooltip>
            </>
          )}
          <Tooltip label="Закрыть" shortcut="Esc">
            <button className="icon-btn" onClick={close} aria-label="Закрыть">
              <X size={20} />
            </button>
          </Tooltip>
        </div>
      </div>
      <div ref={stage} className="viewer-stage" tabIndex={-1} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {error ? (
          <div className="viewer-error">Не удалось загрузить изображение</div>
        ) : (
          <div
            className="viewer-canvas"
            style={{
              width: nat?.w ?? undefined,
              height: nat?.h ?? undefined,
              transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale}) rotate(${rotation}deg)`,
              transformOrigin: rotation ? 'center' : '0 0',
              visibility: nat ? 'visible' : 'hidden',
            }}
          >
            <img
              className="viewer-img"
              src={big ? previewSrc : base}
              alt={img.alt}
              draggable={false}
              onLoad={(e) => !nat && setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              onError={() => setError(true)}
              style={{ imageRendering: t.scale > 2 ? 'pixelated' : undefined }}
            />
            {hiRes && !tiles && big && <img className="viewer-img hires" src={base} alt="" draggable={false} />}
            {tileEls}
          </div>
        )}
        {total > 1 && (
          <>
            <button className="viewer-nav prev" onClick={() => go(-1)} aria-label="Предыдущее изображение">
              <ChevronLeft size={26} />
            </button>
            <button className="viewer-nav next" onClick={() => go(1)} aria-label="Следующее изображение">
              <ChevronRight size={26} />
            </button>
          </>
        )}
      </div>
      {(img.caption || img.alt) && <div className="viewer-caption">{img.caption || img.alt}</div>}
    </div>
  );
}
