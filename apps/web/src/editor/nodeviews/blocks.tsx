import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Lock, Ban, Download, ExternalLink, FileArchive, FileSpreadsheet, FileImage, File as FileIcon, FileVideo, Copy, Check, Eye, Code2, Columns2, ArrowUpRight, Database, Trash2 } from 'lucide-react';
import { CALLOUT_VARIANTS, CALLOUT_DEFAULT_ICONS, extractHeadings, sanitizeHref } from '@kb/shared';
import { usePageRef } from '../../lib/pageRefs';
import { fileSize } from '../../lib/format';
import { Menu } from '../../components/ui/Menu';
import { IconPickerPopover } from '../../components/IconPicker';
import { get } from '../../api/client';
import { toast } from '../../components/ui/Toast';
import { DocPreviewInline } from './DocPreviewInline';

const CALLOUT_LABEL: Record<string, string> = { info: 'Информация', tip: 'Совет', important: 'Важно', warning: 'Предупреждение', error: 'Ошибка / запрет', example: 'Пример', neutral: 'Заметка' };

export function CalloutView({ node, updateAttributes, editor }: NodeViewProps) {
  const variant = node.attrs.variant as keyof typeof CALLOUT_DEFAULT_ICONS;
  const icon = node.attrs.icon ?? CALLOUT_DEFAULT_ICONS[variant] ?? 'ℹ️';
  const btn = useRef<HTMLButtonElement | null>(null);
  const [picker, setPicker] = useState<HTMLElement | null>(null);
  return (
    <NodeViewWrapper className={`kb-callout v-${variant}`} data-variant={variant}>
      <div className="kb-callout-icon" contentEditable={false}>
        {editor.isEditable ? (
          <Menu
            label="Вид блока"
            items={[
              ...CALLOUT_VARIANTS.map((v) => ({ id: v, label: CALLOUT_LABEL[v], icon: <span>{CALLOUT_DEFAULT_ICONS[v]}</span>, checked: v === variant, onSelect: () => updateAttributes({ variant: v, icon: null }) })),
              { separator: true },
              { id: 'icon', label: 'Свой значок…', onSelect: () => setTimeout(() => setPicker(btn.current), 0) },
            ]}
            trigger={({ ref, props }) => (
              <button
                ref={(el) => {
                  btn.current = el;
                  ref(el);
                }}
                className="kb-callout-icon-btn"
                aria-label="Изменить вид выделенного блока"
                {...props}
              >
                {icon}
              </button>
            )}
          />
        ) : (
          <span aria-hidden>{icon}</span>
        )}
        {picker && <IconPickerPopover anchor={picker} onPick={(e) => (updateAttributes({ icon: e }), setPicker(null))} onRemove={() => (updateAttributes({ icon: null }), setPicker(null))} onClose={() => setPicker(null)} />}
      </div>
      <NodeViewContent className="kb-callout-content" />
    </NodeViewWrapper>
  );
}

function fileIcon(mime: string | null, name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (/^image\//.test(mime ?? '')) return <FileImage size={20} />;
  if (/^video\//.test(mime ?? '')) return <FileVideo size={20} />;
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return <FileSpreadsheet size={20} />;
  if (['zip', '7z', 'rar', 'gz', 'tar'].includes(ext)) return <FileArchive size={20} />;
  if (['doc', 'docx', 'pdf', 'txt', 'md', 'rtf', 'odt'].includes(ext)) return <FileText size={20} />;
  return <FileIcon size={20} />;
}

export function FileView({ node, selected, editor, updateAttributes }: NodeViewProps) {
  const a = node.attrs;
  const ext = (a.name as string).split('.').pop()?.toUpperCase() ?? '';
  const previewable = /^(application\/pdf|image\/|text\/plain|video\/|audio\/)/.test(a.mime ?? '');
  const [preview, setPreview] = useState(false);
  return (
    <NodeViewWrapper className={`kb-file view-${a.view}${selected ? ' is-selected' : ''}`} data-drag-handle="">
      <div className="kb-file-row" contentEditable={false}>
        <span className="kb-file-icon">{fileIcon(a.mime, a.name)}</span>
        <span className="kb-file-meta">
          <span className="kb-file-name ellipsis" title={a.name}>
            {a.name || 'Файл'}
          </span>
          <span className="small muted">
            {ext && ext.length <= 5 ? ext + ' · ' : ''}
            {a.size != null ? fileSize(a.size) : ''}
          </span>
        </span>
        <span className="kb-file-actions">
          {previewable && a.attachmentId && (
            <button className="icon-btn sm" aria-label="Предпросмотр" title="Предпросмотр" onClick={() => setPreview(!preview)} aria-pressed={preview}>
              <Eye size={15} />
            </button>
          )}
          {a.attachmentId && (
            <a className="icon-btn sm" href={`/api/v1/attachments/${a.attachmentId}/content`} target="_blank" rel="noopener" aria-label="Открыть" title="Открыть">
              <ExternalLink size={15} />
            </a>
          )}
          {a.attachmentId && (
            <a className="icon-btn sm" href={`/api/v1/attachments/${a.attachmentId}/download`} aria-label="Скачать" title="Скачать">
              <Download size={15} />
            </a>
          )}
          {editor.isEditable && (
            <Menu
              label="Вид"
              items={[
                { id: 'compact', label: 'Компактно', checked: a.view === 'compact', onSelect: () => updateAttributes({ view: 'compact' }) },
                { id: 'card', label: 'Карточкой', checked: a.view === 'card', onSelect: () => updateAttributes({ view: 'card' }) },
              ]}
              trigger={({ ref, props }) => (
                <button ref={ref} className="icon-btn sm" aria-label="Вид файла" {...props}>
                  <Columns2 size={15} />
                </button>
              )}
            />
          )}
        </span>
      </div>
      {preview && a.attachmentId && (
        <div className="kb-file-preview" contentEditable={false}>
          {/^video\//.test(a.mime) ? (
            <video src={`/api/v1/attachments/${a.attachmentId}/content`} controls preload="metadata" />
          ) : /^audio\//.test(a.mime) ? (
            <audio src={`/api/v1/attachments/${a.attachmentId}/content`} controls preload="metadata" />
          ) : (
            <iframe title={a.name} src={`/api/v1/attachments/${a.attachmentId}/content`} sandbox="allow-same-origin" />
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}

/** Embedded video or external link. Only allow-listed providers get an iframe; everything else is a safe link card. */
const PROVIDERS: Array<{ re: RegExp; embed: (m: RegExpMatchArray) => string }> = [
  { re: /^https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w-]{6,})/, embed: (m) => `https://www.youtube-nocookie.com/embed/${m[1]}` },
  { re: /^https?:\/\/youtu\.be\/([\w-]{6,})/, embed: (m) => `https://www.youtube-nocookie.com/embed/${m[1]}` },
  { re: /^https?:\/\/rutube\.ru\/video\/([\w]+)/, embed: (m) => `https://rutube.ru/play/embed/${m[1]}` },
  { re: /^https?:\/\/vk\.com\/video(-?\d+)_(\d+)/, embed: (m) => `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}` },
];

export function EmbedView({ node, selected }: NodeViewProps) {
  const a = node.attrs;
  const url = sanitizeHref(a.url);
  if (a.attachmentId)
    return (
      <NodeViewWrapper className={'kb-embed' + (selected ? ' is-selected' : '')} data-drag-handle="">
        <video src={`/api/v1/attachments/${a.attachmentId}/content`} controls preload="metadata" contentEditable={false} />
      </NodeViewWrapper>
    );
  const provider = url ? PROVIDERS.map((p) => [p, url.match(p.re)] as const).find(([, m]) => m) : null;
  return (
    <NodeViewWrapper className={'kb-embed' + (selected ? ' is-selected' : '')} data-drag-handle="">
      {provider ? (
        <div className="kb-embed-frame" contentEditable={false}>
          <iframe src={provider[0].embed(provider[1]!)} title={a.title || 'Видео'} allow="encrypted-media; picture-in-picture; fullscreen" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" referrerPolicy="strict-origin-when-cross-origin" loading="lazy" />
        </div>
      ) : (
        <a className="kb-link-card" href={url ?? '#'} target="_blank" rel="noopener noreferrer nofollow" contentEditable={false}>
          <ExternalLink size={16} />
          <span className="ellipsis">{a.title || url || 'Ссылка'}</span>
        </a>
      )}
    </NodeViewWrapper>
  );
}

function RefLabel({ pageId, fallback }: { pageId: string | null; fallback: string }) {
  const ref = usePageRef(pageId);
  const r = ref.data;
  if (!pageId) return <span className="muted">Страница не выбрана</span>;
  if (r?.status === 'forbidden' || r?.status === 'missing')
    return (
      <span className="kb-ref-restricted">
        <Lock size={13} /> Нет доступа к странице
      </span>
    );
  if (r?.status === 'deleted')
    return (
      <span className="kb-ref-deleted">
        <Ban size={13} /> {r.title || fallback} (удалена)
      </span>
    );
  return (
    <>
      <span className="kb-ref-icon">{r?.icon ?? <FileText size={15} />}</span>
      <span className="kb-ref-title">{r?.title || fallback || 'Без названия'}</span>
    </>
  );
}

export function PageLinkView({ node, selected }: NodeViewProps) {
  return (
    <NodeViewWrapper className={'kb-page-link' + (selected ? ' is-selected' : '')} data-drag-handle="">
      <Link to={'/p/' + node.attrs.pageId} contentEditable={false} draggable={false} className="kb-page-link-a">
        <RefLabel pageId={node.attrs.pageId} fallback={node.attrs.title} />
        {!node.attrs.child && <ArrowUpRight size={13} className="muted" />}
      </Link>
    </NodeViewWrapper>
  );
}

export function PageMentionView({ node, selected }: NodeViewProps) {
  const navigate = useNavigate();
  const href = '/p/' + node.attrs.pageId + (node.attrs.blockId ? '?block=' + node.attrs.blockId : '');
  return (
    <NodeViewWrapper as="span" className={'kb-page-mention' + (selected ? ' is-selected' : '')}>
      <a
        href={href}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) return;
          e.preventDefault();
          navigate(href);
        }}
        draggable={false}
      >
        <RefLabel pageId={node.attrs.pageId} fallback={node.attrs.title} />
      </a>
    </NodeViewWrapper>
  );
}

let mermaidLoader: Promise<typeof import('mermaid').default> | null = null;
function loadMermaid() {
  mermaidLoader ??= import('mermaid').then((m) => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    m.default.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'neutral', fontFamily: 'Inter, sans-serif' });
    return m.default;
  });
  return mermaidLoader;
}

export function MermaidView({ node, editor, selected }: NodeViewProps) {
  const [svg, setSvg] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<'preview' | 'code'>(node.textContent ? 'preview' : 'code');
  const id = useMemo(() => 'mmd-' + Math.random().toString(36).slice(2), []);
  const code = node.textContent;
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!code.trim()) return setSvg('');
      try {
        const m = await loadMermaid();
        await m.parse(code);
        const r = await m.render(id, code);
        if (!cancelled) {
          setSvg(r.svg);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr((e as Error).message?.split('\n').slice(0, 3).join(' ') ?? 'Ошибка в схеме');
        document.getElementById('d' + id)?.remove();
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [code, id]);
  const editing = editor.isEditable && (mode === 'code' || selected);
  return (
    <NodeViewWrapper className={'kb-mermaid' + (selected ? ' is-selected' : '')}>
      <div className="kb-mermaid-bar" contentEditable={false}>
        <span className="small muted">Схема</span>
        <span className="grow" />
        {editor.isEditable && (
          <button className="btn ghost sm" onClick={() => setMode(mode === 'code' ? 'preview' : 'code')}>
            {mode === 'code' ? <Eye size={14} /> : <Code2 size={14} />} {mode === 'code' ? 'Скрыть код' : 'Код'}
          </button>
        )}
      </div>
      <pre className="kb-mermaid-code" style={{ display: editing ? undefined : 'none' }}>
        <NodeViewContent as={'code' as any} />
      </pre>
      {err && <div className="kb-mermaid-error" contentEditable={false} role="alert">{err}</div>}
      {/* mermaid output is generated with securityLevel 'strict' (no scripts, sanitised labels) */}
      {svg && <div className="kb-mermaid-svg" contentEditable={false} dangerouslySetInnerHTML={{ __html: svg }} />}
    </NodeViewWrapper>
  );
}

export function TocView({ editor, selected }: NodeViewProps) {
  const [headings, setHeadings] = useState(() => extractHeadings(editor.getJSON() as any));
  useEffect(() => {
    const on = () => setHeadings(extractHeadings(editor.getJSON() as any));
    editor.on('update', on);
    return () => {
      editor.off('update', on);
    };
  }, [editor]);
  return (
    <NodeViewWrapper className={'kb-toc' + (selected ? ' is-selected' : '')} data-drag-handle="">
      <nav contentEditable={false} aria-label="Оглавление">
        <div className="kb-toc-title">Содержание</div>
        {headings.length ? (
          headings.map((h) => (
            <a key={h.id} href={'#' + h.id} className={'kb-toc-item l' + h.level} onClick={(e) => (e.preventDefault(), document.getElementById(h.id!)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))}>
              {h.text || 'Без названия'}
            </a>
          ))
        ) : (
          <span className="muted small">Добавьте заголовки — оглавление соберётся автоматически</span>
        )}
      </nav>
    </NodeViewWrapper>
  );
}

export function SyncedBlockView({ node, selected, editor, deleteNode }: NodeViewProps) {
  const { sourcePageId, sourceBlockId } = node.attrs;
  const ref = usePageRef(sourcePageId);
  const [content, setContent] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!sourcePageId) return;
    get<{ content: any }>(`/api/v1/pages/${sourcePageId}/content`)
      .then((r) => {
        const find = (n: any): any => (n.attrs?.id === sourceBlockId ? n : n.content?.map(find).find(Boolean));
        const block = sourceBlockId ? find(r.content) : r.content;
        if (!block) setError('Исходный блок удалён');
        else setContent(block);
      })
      .catch((e) => setError(e.status === 404 ? 'Нет доступа к исходному блоку' : e.message));
  }, [sourcePageId, sourceBlockId]);
  return (
    <NodeViewWrapper className={'kb-synced' + (selected ? ' is-selected' : '')} data-drag-handle="">
      <div className="kb-synced-bar" contentEditable={false}>
        <Copy size={13} /> <span className="small">Синхронизировано с</span>
        <Link to={`/p/${sourcePageId}${sourceBlockId ? '?block=' + sourceBlockId : ''}`} className="small ellipsis">
          {ref.data?.title || 'страницей'}
        </Link>
        <span className="grow" />
        {editor.isEditable && (
          <button className="icon-btn sm" onClick={() => deleteNode()} aria-label="Убрать блок">
            <Trash2 size={14} />
          </button>
        )}
      </div>
      <div contentEditable={false}>{error ? <div className="muted small">{error}</div> : content ? <DocPreviewInline node={content} /> : <div className="skeleton" style={{ height: 40 }} />}</div>
    </NodeViewWrapper>
  );
}

export function CollectionBlockView({ node, selected }: NodeViewProps) {
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!node.attrs.collectionId) return;
    get(`/api/v1/collections/${node.attrs.collectionId}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [node.attrs.collectionId]);
  return (
    <NodeViewWrapper className={'kb-collection-block' + (selected ? ' is-selected' : '')} data-drag-handle="">
      <div contentEditable={false}>
        <div className="row" style={{ marginBottom: 6 }}>
          <Database size={15} /> <b className="ellipsis">{data?.collection?.name ?? 'Реестр'}</b>
          <span className="grow" />
          {data?.collection?.pageId && (
            <Link className="btn sm ghost" to={'/p/' + data.collection.pageId}>
              Открыть
            </Link>
          )}
        </div>
        {error ? <div className="muted small">{error}</div> : !data ? <div className="skeleton" style={{ height: 60 }} /> : <CollectionMini collectionId={node.attrs.collectionId} fields={data.collection?.fields ?? []} />}
      </div>
    </NodeViewWrapper>
  );
}

function CollectionMini({ collectionId, fields }: { collectionId: string; fields: any[] }) {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    import('../../api/client').then(({ post }) =>
      post(`/api/v1/collections/${collectionId}/query`, { limit: 10 })
        .then((r: any) => setRows(r.rows ?? []))
        .catch(() => setRows([])),
    );
  }, [collectionId]);
  const shown = fields.slice(0, 5);
  if (!rows) return <div className="skeleton" style={{ height: 60 }} />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {shown.map((f) => (
              <th key={f.id}>{f.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              {shown.map((f) => (
                <td key={f.id} className="ellipsis" style={{ maxWidth: 220 }}>
                  {formatCell(r.values?.[f.id] ?? r.cells?.[f.id])}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={shown.length || 1} className="muted">
                Записей пока нет
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? '✓' : '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const LANGS = ['plaintext', 'bash', 'c', 'cpp', 'csharp', 'css', 'diff', 'go', 'html', 'java', 'javascript', 'json', 'kotlin', 'markdown', 'php', 'python', 'ruby', 'rust', 'sql', 'swift', 'typescript', 'xml', 'yaml', '1c'];

export function CodeBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  return (
    <NodeViewWrapper className="kb-code">
      <div className="kb-code-bar" contentEditable={false}>
        {editor.isEditable ? (
          <select ref={ref} className="kb-code-lang" value={node.attrs.language ?? 'plaintext'} onChange={(e) => updateAttributes({ language: e.target.value === 'plaintext' ? null : e.target.value })} aria-label="Язык кода">
            {LANGS.map((l) => (
              <option key={l} value={l}>
                {l === 'plaintext' ? 'Текст' : l}
              </option>
            ))}
          </select>
        ) : (
          <span className="small muted">{node.attrs.language ?? ''}</span>
        )}
        <button
          className="btn ghost sm"
          onClick={() =>
            navigator.clipboard
              .writeText(node.textContent)
              .then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500)))
              .catch(() => toast.error('Не удалось скопировать'))
          }
        >
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Скопировано' : 'Копировать'}
        </button>
      </div>
      <pre spellCheck={false}>
        <NodeViewContent as={'code' as any} />
      </pre>
    </NodeViewWrapper>
  );
}
