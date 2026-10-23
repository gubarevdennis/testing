import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useRef, useState } from 'react';
import { Maximize2, Download, Trash2, Type as AltIcon, Captions, SquareArrowDown, AlignVerticalJustifyCenter, AlignVerticalJustifyStart, Baseline } from 'lucide-react';
import { NodeSelection } from '@tiptap/pm/state';
import { Tooltip } from '../../components/ui/Tooltip';
import { openViewer, collectImages } from '../../components/ImageViewer';
import { imageSrc } from './ImageView';

const SIZES = [16, 24, 48, 96, 200];

/**
 * Picture inside a line of text (R-MEDIA-007, D-37): size (presets, drag handle, Alt+Shift+←/→), vertical alignment in the
 * line, alt text, caption (title), viewer (lightbox), download of the original (the stored file, never the thumbnail),
 * conversion to a block image. Uploading pictures show their name until the file is on the server.
 */
export function InlineImageView({ node, updateAttributes, selected, editor, getPos, deleteNode }: NodeViewProps) {
  const a = node.attrs as { src: string | null; attachmentId: string | null; alt: string; title: string | null; width: number | null; valign: string; naturalWidth: number | null; naturalHeight: number | null; uploadId: string | null };
  const [dragW, setDragW] = useState<number | null>(null);
  const [edit, setEdit] = useState<null | 'alt' | 'title'>(null);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const editable = editor.isEditable;
  const width = dragW ?? a.width;
  const pos = () => (typeof getPos === 'function' ? (getPos() ?? -1) : -1);

  if (a.uploadId && !a.attachmentId)
    return (
      <NodeViewWrapper as="span" className="kb-inline-image-wrap is-pending" data-type="inline-image">
        <span className="kb-inline-image-pending" aria-label={`Загрузка изображения ${a.alt || ''}`}>
          ⏳ {a.alt || 'Изображение'}
        </span>
      </NodeViewWrapper>
    );

  /** Attribute change that keeps the picture selected (its toolbar stays open). */
  const setAttrs = (attrs: Record<string, unknown>) => {
    const p = pos();
    if (p < 0) return updateAttributes(attrs);
    const tr = editor.state.tr.setNodeMarkup(p, undefined, { ...node.attrs, ...attrs });
    tr.setSelection(NodeSelection.create(tr.doc, p));
    editor.view.dispatch(tr);
  };

  const open = () => {
    const images = collectImages(editor);
    openViewer(images, Math.max(0, images.findIndex((i) => i.pos === pos())));
  };

  const toBlock = () => {
    const p = pos();
    if (p < 0) return;
    const { state } = editor;
    const $p = state.doc.resolve(p);
    const blockType = state.schema.nodes.image;
    const after = $p.after($p.depth);
    const attrs = { src: a.src, attachmentId: a.attachmentId, alt: a.alt, caption: a.title ?? '', width: a.width && a.width >= 80 ? a.width : null, align: 'center', naturalWidth: a.naturalWidth, naturalHeight: a.naturalHeight };
    // one transaction (one Undo step): the picture leaves the line and becomes a block right after its paragraph
    const tr = state.tr.insert(after, blockType.create(attrs)).delete(p, p + node.nodeSize);
    const imgPos = tr.mapping.map(after, -1);
    tr.setSelection(NodeSelection.create(tr.doc, Math.min(imgPos, tr.doc.content.size - 1)));
    editor.view.dispatch(tr.scrollIntoView());
  };

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = imgRef.current?.getBoundingClientRect().width ?? 48;
    const max = editor.view.dom.clientWidth || 720;
    const move = (ev: PointerEvent) => setDragW(Math.round(Math.max(12, Math.min(max, startW + ev.clientX - startX))));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDragW((w) => {
        if (w != null) setAttrs({ width: w });
        return null;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const valignCss = a.valign === 'middle' ? 'middle' : a.valign === 'top' ? 'text-top' : a.valign === 'bottom' ? 'text-bottom' : 'baseline';
  return (
    <NodeViewWrapper as="span" className={`kb-inline-image-wrap${selected ? ' is-selected' : ''}`} data-type="inline-image" style={{ verticalAlign: valignCss }}>
      {failed ? (
        <span className="kb-inline-image-error" title="Не удалось загрузить изображение">
          [{a.alt || 'изображение'}]
        </span>
      ) : (
        <img
          ref={imgRef}
          className="kb-inline-image"
          src={imageSrc(a, width ?? 200)}
          alt={a.alt || ''}
          title={a.title ?? undefined}
          draggable={false}
          style={{ width: width ? `${width}px` : undefined }}
          onError={() => setFailed(true)}
          onDoubleClick={open}
          onClick={() => {
            if (!editable) return open();
            // keyboard actions (Alt+Shift+←/→, Delete, Ctrl+Z) need the page's focus and the picture selected after a click
            // (after ProseMirror has read the focus change, which would otherwise put a text cursor at the old DOM selection)
            if (!editor.view.hasFocus()) editor.view.focus();
            setTimeout(() => {
              const p = pos();
              const sel = editor.state.selection;
              if (!editor.isDestroyed && p >= 0 && !(sel instanceof NodeSelection && sel.from === p)) editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, p)));
            }, 0);
          }}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (editable && !a.naturalWidth && img.naturalWidth && !a.attachmentId) updateAttributes({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
          }}
        />
      )}
      {editable && selected && <span className="kb-resize inline" contentEditable={false} onPointerDown={startResize} aria-hidden />}
      {dragW != null && <span className="kb-resize-badge">{dragW} px</span>}
      {selected && editable && (
        <span className="kb-node-toolbar kb-inline-toolbar" contentEditable={false} role="toolbar" aria-label="Изображение в строке" onMouseDown={(e) => (e.target as HTMLElement).closest('button') && e.preventDefault()}>
          {SIZES.map((s) => (
            <button key={s} className="btn ghost sm toolbar-text-btn" aria-pressed={a.width === s} onClick={() => setAttrs({ width: s })}>
              {s}
            </button>
          ))}
          <button className="btn ghost sm toolbar-text-btn" aria-pressed={!a.width} onClick={() => setAttrs({ width: null })} title="Исходный размер">
            1:1
          </button>
          <span className="toolbar-sep" />
          <Tooltip label="По базовой линии">
            <button aria-label="По базовой линии" className="icon-btn sm" aria-pressed={a.valign === 'baseline'} onClick={() => setAttrs({ valign: 'baseline' })}>
              <Baseline size={15} />
            </button>
          </Tooltip>
          <Tooltip label="По центру строки">
            <button aria-label="По центру строки" className="icon-btn sm" aria-pressed={a.valign === 'middle'} onClick={() => setAttrs({ valign: 'middle' })}>
              <AlignVerticalJustifyCenter size={15} />
            </button>
          </Tooltip>
          <Tooltip label="По верху строки">
            <button aria-label="По верху строки" className="icon-btn sm" aria-pressed={a.valign === 'top'} onClick={() => setAttrs({ valign: 'top' })}>
              <AlignVerticalJustifyStart size={15} />
            </button>
          </Tooltip>
          <span className="toolbar-sep" />
          <Tooltip label="Альтернативный текст">
            <button aria-label="Альтернативный текст" className="icon-btn sm" aria-pressed={edit === 'alt'} onClick={() => setEdit(edit === 'alt' ? null : 'alt')}>
              <AltIcon size={15} />
            </button>
          </Tooltip>
          <Tooltip label="Подпись">
            <button aria-label="Подпись" className="icon-btn sm" aria-pressed={edit === 'title'} onClick={() => setEdit(edit === 'title' ? null : 'title')}>
              <Captions size={15} />
            </button>
          </Tooltip>
          <Tooltip label="Открыть на весь экран">
            <button aria-label="Открыть на весь экран" className="icon-btn sm" onClick={open}>
              <Maximize2 size={15} />
            </button>
          </Tooltip>
          {a.attachmentId && (
            <Tooltip label="Скачать оригинал">
              <a aria-label="Скачать оригинал" className="icon-btn sm" href={`/api/v1/attachments/${a.attachmentId}/download`} download>
                <Download size={15} />
              </a>
            </Tooltip>
          )}
          <Tooltip label="Сделать блоком">
            <button aria-label="Сделать блоком" className="icon-btn sm" onClick={toBlock}>
              <SquareArrowDown size={15} />
            </button>
          </Tooltip>
          <Tooltip label="Удалить">
            <button aria-label="Удалить" className="icon-btn sm" onClick={() => deleteNode()}>
              <Trash2 size={15} />
            </button>
          </Tooltip>
          {edit && (
            <span className="kb-inline-image-edit">
              <input
                className="input"
                autoFocus
                aria-label={edit === 'alt' ? 'Альтернативный текст' : 'Подпись к изображению'}
                placeholder={edit === 'alt' ? 'Что изображено (для незрячих пользователей и поиска)' : 'Подпись (видна при наведении и в просмотре)'}
                defaultValue={edit === 'alt' ? a.alt : (a.title ?? '')}
                onBlur={(e) => setAttrs(edit === 'alt' ? { alt: e.target.value } : { title: e.target.value || null })}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    e.preventDefault();
                    e.currentTarget.blur();
                    setEdit(null);
                  }
                }}
              />
            </span>
          )}
        </span>
      )}
    </NodeViewWrapper>
  );
}
