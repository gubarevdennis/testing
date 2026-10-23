import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { AlignLeft, AlignCenter, AlignRight, Maximize2, Download, Trash2, Captions, Type as AltIcon, Replace, ScanText, StretchHorizontal, WrapText } from 'lucide-react';
import { TextSelection } from '@tiptap/pm/state';
import { Tooltip } from '../../components/ui/Tooltip';
import { openViewer, collectImages } from '../../components/ImageViewer';
import { uploadFile } from '../../lib/uploads';
import { toast } from '../../components/ui/Toast';
import { OcrDialog } from '../../components/OcrDialog';
import { UploadPlaceholder } from './UploadPlaceholder';
import { useImageResize } from './imageResize';

export function imageSrc(attrs: { src?: string | null; attachmentId?: string | null; naturalWidth?: number | null }, displayWidth: number) {
  if (attrs.attachmentId) {
    const big = (attrs.naturalWidth ?? 0) > 2048 || !attrs.naturalWidth;
    // the 2048 px preview is sharp enough for inline display up to ~1000 css px on 2x screens
    return `/api/v1/attachments/${attrs.attachmentId}/content${big && displayWidth <= 1024 ? '?variant=preview' : ''}`;
  }
  return attrs.src ?? '';
}

/** An image whose file is still uploading is a real block with a local preview (R-MEDIA-006/008). */
export function ImageView(props: NodeViewProps) {
  const { node, editor, selected } = props;
  if (node.attrs.uploadId && !node.attrs.attachmentId)
    return (
      <NodeViewWrapper as="figure" className={`kb-image-pending${selected ? ' is-selected' : ''}`} data-drag-handle="" data-block-id={node.attrs.id}>
        <UploadPlaceholder editor={editor} uploadId={node.attrs.uploadId} name={node.attrs.alt} kind="image" />
      </NodeViewWrapper>
    );
  return <LoadedImageView {...props} />;
}

function LoadedImageView({ node, updateAttributes, selected, editor, getPos, deleteNode }: NodeViewProps) {
  const a = node.attrs as { src: string | null; attachmentId: string | null; alt: string; caption: string; width: number | null; align: string; naturalWidth: number | null; naturalHeight: number | null };
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  const [showCaption, setShowCaption] = useState(!!a.caption);
  const [altOpen, setAltOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const figRef = useRef<HTMLElement>(null);
  const armed = useRef(false);
  useEffect(() => {
    if (!selected) armed.current = false;
  }, [selected]);
  const editable = editor.isEditable;
  const columnWidth = () => figRef.current?.closest('.ProseMirror')?.clientWidth ?? 760;
  const resize = useImageResize({
    editor,
    getPos: () => (typeof getPos === 'function' ? getPos() : undefined),
    measure: () => figRef.current?.querySelector('.kb-image-box') ?? null,
    ratio: a.naturalWidth && a.naturalHeight ? a.naturalHeight / a.naturalWidth : null,
    centered: a.align === 'center',
    min: 80,
    max: () => Math.min(columnWidth(), a.naturalWidth ? Math.max(a.naturalWidth, 80) * 4 : Infinity),
    container: columnWidth,
    natural: a.naturalWidth,
  });
  const width = resize.width ?? a.width;
  const ratio = a.naturalWidth && a.naturalHeight ? a.naturalHeight / a.naturalWidth : null;
  const src = imageSrc(a, width ?? 760) + (retry ? (imageSrc(a, 760).includes('?') ? '&' : '?') + 'r=' + retry : '');
  useEffect(() => setState('loading'), [a.attachmentId, a.src]);

  const open = () => {
    const images = collectImages(editor);
    const pos = typeof getPos === 'function' ? getPos() : -1;
    openViewer(images, Math.max(0, images.findIndex((i) => i.pos === pos)));
  };

  const replace = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f || !a.attachmentId) return;
      try {
        const pageId = (editor.storage as any).kbPage?.pageId ?? null;
        const r = await uploadFile(f, pageId, undefined, undefined, a.attachmentId);
        updateAttributes({ naturalWidth: r.width, naturalHeight: r.height, src: r.contentUrl });
        setRetry((x) => x + 1);
        toast.success('Изображение заменено — предыдущая версия сохранена в истории файла');
      } catch (e) {
        toast.error((e as Error).message);
      }
    };
    input.click();
  };

  /** Block → picture in a line of text (R-MEDIA-007): a paragraph holding the picture replaces the block; one Undo step. */
  const toInline = () => {
    const p = typeof getPos === 'function' ? getPos() : undefined;
    if (p == null) return;
    const { schema } = editor.state;
    const img = schema.nodes.inlineImage.create({ src: a.src, attachmentId: a.attachmentId, alt: a.alt, title: a.caption || null, width: a.width && a.width <= 200 ? a.width : 96, naturalWidth: a.naturalWidth, naturalHeight: a.naturalHeight });
    const tr = editor.state.tr.replaceWith(p, p + node.nodeSize, schema.nodes.paragraph.create(null, img));
    tr.setSelection(TextSelection.create(tr.doc, p + 1 + img.nodeSize));
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
  };

  const presets = [25, 50, 75, 100];
  return (
    <NodeViewWrapper as="figure" ref={figRef as any} className={`kb-image-block align-${a.align}${selected ? ' is-selected' : ''}${resize.resizing ? ' is-resizing' : ''}`} data-drag-handle="" data-block-id={node.attrs.id}>
      {selected && editable && (
        <div
          className="kb-node-toolbar"
          contentEditable={false}
          role="toolbar"
          aria-label="Изображение"
          // buttons do not take the focus from the document (Ctrl+Z right after a click must undo in the editor)
          onMouseDown={(e) => (e.target as HTMLElement).closest('button') && e.preventDefault()}
        >
          <Tooltip label="По левому краю">
            <button aria-label="По левому краю" className="icon-btn sm" aria-pressed={a.align === 'left'} onClick={() => updateAttributes({ align: 'left' })}>
              <AlignLeft size={15} />
            </button>
          </Tooltip>
          <Tooltip label="По центру">
            <button aria-label="По центру" className="icon-btn sm" aria-pressed={a.align === 'center'} onClick={() => updateAttributes({ align: 'center' })}>
              <AlignCenter size={15} />
            </button>
          </Tooltip>
          <Tooltip label="По правому краю">
            <button aria-label="По правому краю" className="icon-btn sm" aria-pressed={a.align === 'right'} onClick={() => updateAttributes({ align: 'right' })}>
              <AlignRight size={15} />
            </button>
          </Tooltip>
          <Tooltip label="На всю ширину">
            <button aria-label="На всю ширину" className="icon-btn sm" aria-pressed={a.align === 'full'} onClick={() => updateAttributes({ align: 'full', width: null })}>
              <StretchHorizontal size={15} />
            </button>
          </Tooltip>
          <span className="toolbar-sep" />
          {presets.map((p) => (
            <button
              key={p}
              className="btn ghost sm toolbar-text-btn"
              onClick={() => {
                const container = figRef.current?.closest('.ProseMirror')?.clientWidth ?? 760;
                updateAttributes({ width: p === 100 ? null : Math.round((container * p) / 100), align: a.align === 'full' ? 'center' : a.align });
              }}
            >
              {p}%
            </button>
          ))}
          <span className="toolbar-sep" />
          <Tooltip label="Подпись">
            <button aria-label="Подпись" className="icon-btn sm" aria-pressed={showCaption} onClick={() => (showCaption && a.caption ? updateAttributes({ caption: '' }) : null, setShowCaption(!showCaption))}>
              <Captions size={15} />
            </button>
          </Tooltip>
          <Tooltip label="Альтернативный текст">
            <button aria-label="Альтернативный текст" className="icon-btn sm" onClick={() => setAltOpen(!altOpen)} aria-pressed={altOpen}>
              <AltIcon size={15} />
            </button>
          </Tooltip>
          {a.attachmentId && (
            <Tooltip label="Распознанный текст (OCR)">
            <button aria-label="Распознанный текст (OCR)" className="icon-btn sm" onClick={() => setOcrOpen(true)}>
                <ScanText size={15} />
              </button>
            </Tooltip>
          )}
          {a.attachmentId && (
            <Tooltip label="Заменить">
            <button aria-label="Заменить" className="icon-btn sm" onClick={replace}>
                <Replace size={15} />
              </button>
            </Tooltip>
          )}
          <Tooltip label="Открыть на весь экран">
            <button aria-label="Открыть на весь экран" className="icon-btn sm" onClick={open}>
              <Maximize2 size={15} />
            </button>
          </Tooltip>
          {!node.attrs.uploadId && (
            <Tooltip label="В строку текста">
              <button aria-label="В строку текста" className="icon-btn sm" onClick={toInline}>
                <WrapText size={15} />
              </button>
            </Tooltip>
          )}
          {a.attachmentId && (
            <Tooltip label="Скачать оригинал">
            <a aria-label="Скачать оригинал" className="icon-btn sm" href={`/api/v1/attachments/${a.attachmentId}/download`} download>
                <Download size={15} />
              </a>
            </Tooltip>
          )}
          <Tooltip label="Удалить">
            <button aria-label="Удалить" className="icon-btn sm" onClick={() => deleteNode()}>
              <Trash2 size={15} />
            </button>
          </Tooltip>
        </div>
      )}
      <div className="kb-image-frame" style={{ width: a.align === 'full' ? '100%' : width ? `${width}px` : undefined, maxWidth: '100%' }}>
        <div className="kb-image-box" style={ratio && state !== 'ok' ? { aspectRatio: `${a.naturalWidth} / ${a.naturalHeight}` } : undefined}>
          {state === 'error' ? (
            <div className="kb-image-error" contentEditable={false}>
              <span>Не удалось загрузить изображение</span>
              <button className="btn sm" onClick={() => (setRetry((x) => x + 1), setState('loading'))}>
                Повторить
              </button>
            </div>
          ) : (
            <img
              src={src}
              alt={a.alt || ''}
              draggable={false}
              loading="lazy"
              decoding="async"
              width={a.naturalWidth ?? undefined}
              height={a.naturalHeight ?? undefined}
              className={state === 'loading' ? 'is-loading' : ''}
              onLoad={(e) => {
                setState('ok');
                const img = e.currentTarget;
                if (editable && !a.naturalWidth && img.naturalWidth && !a.attachmentId) updateAttributes({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
              }}
              onError={() => setState('error')}
              onDoubleClick={open}
              // R-MEDIA-015/019: readers open the viewer with one click; editors with a second click on the selected image
              onClick={() => {
                if (!editable || armed.current) open();
                else armed.current = true; // first click selects (toolbar, resize), the next one opens the viewer
              }}
            />
          )}
          {/* both sides and the four corners; proportional, the size is shown while dragging (R-MEDIA-012) */}
          {editable && a.align !== 'full' && resize.handles(['w', 'e', 'nw', 'ne', 'sw', 'se'])}
          {resize.badge}
        </div>
        {altOpen && editable && (
          <div className="kb-alt-edit" contentEditable={false}>
            <input className="input" placeholder="Опишите изображение для незрячих пользователей и поиска" defaultValue={a.alt} aria-label="Альтернативный текст" onBlur={(e) => updateAttributes({ alt: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), setAltOpen(false))} autoFocus />
          </div>
        )}
        {(showCaption || a.caption) &&
          (editable ? (
            <input
              className="kb-caption-input"
              placeholder="Подпись к изображению"
              aria-label="Подпись к изображению"
              defaultValue={a.caption}
              key={a.caption}
              onBlur={(e) => e.target.value !== a.caption && updateAttributes({ caption: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
                e.stopPropagation();
              }}
            />
          ) : (
            <figcaption>{a.caption}</figcaption>
          ))}
      </div>
      {ocrOpen && a.attachmentId && <OcrDialog attachmentId={a.attachmentId} onClose={() => setOcrOpen(false)} />}
    </NodeViewWrapper>
  );
}
