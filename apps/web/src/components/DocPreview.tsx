import { Fragment, type ReactNode } from 'react';

/** Minimal ProseMirror JSON node shape (as stored by the server). */
export interface DocNode {
  type: string;
  attrs?: Record<string, any>;
  content?: DocNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, any> }>;
}

const CALLOUT_ICON: Record<string, string> = { info: 'ℹ️', tip: '💡', important: '❗', warning: '⚠️', error: '⛔', example: '📝', neutral: '💬' };

/** Only safe link targets are rendered as links (no javascript:, data: etc.). */
function safeHref(href: unknown): string | null {
  if (typeof href !== 'string') return null;
  const h = href.trim();
  if (/^(https?:|mailto:|tel:)/i.test(h) || h.startsWith('/') || h.startsWith('#')) return h;
  return null;
}
function safeSrc(src: unknown): string | null {
  if (typeof src !== 'string') return null;
  const s = src.trim();
  if (/^https?:\/\//i.test(s) || (s.startsWith('/') && !s.startsWith('//'))) return s;
  return null;
}

function plainText(n: DocNode): string {
  if (n.type === 'text') return n.text ?? '';
  return (n.content ?? []).map(plainText).join('');
}

function renderText(n: DocNode, key: number): ReactNode {
  let el: ReactNode = n.text ?? '';
  for (const m of n.marks ?? []) {
    switch (m.type) {
      case 'bold':
        el = <strong>{el}</strong>;
        break;
      case 'italic':
        el = <em>{el}</em>;
        break;
      case 'underline':
        el = <u>{el}</u>;
        break;
      case 'strike':
        el = <s>{el}</s>;
        break;
      case 'code':
        el = <code>{el}</code>;
        break;
      case 'highlight':
        el = <mark className="dp-mark">{el}</mark>;
        break;
      case 'subscript':
        el = <sub>{el}</sub>;
        break;
      case 'superscript':
        el = <sup>{el}</sup>;
        break;
      case 'link': {
        const href = safeHref(m.attrs?.href);
        if (href) el = <a href={href} target="_blank" rel="noopener noreferrer">{el}</a>;
        break;
      }
      default:
        break;
    }
  }
  return <Fragment key={key}>{el}</Fragment>;
}

function kids(n: DocNode, ctx: Ctx): ReactNode {
  return (n.content ?? []).map((c, i) => renderNode(c, i, ctx));
}

interface Ctx {
  headings: Array<{ level: number; text: string }>;
}

function renderNode(n: DocNode, key: number, ctx: Ctx): ReactNode {
  const a = n.attrs ?? {};
  switch (n.type) {
    case 'doc':
      return <Fragment key={key}>{kids(n, ctx)}</Fragment>;
    case 'text':
      return renderText(n, key);
    case 'hardBreak':
      return <br key={key} />;
    case 'paragraph':
      return (
        <p key={key} className={a.variant === 'lead' ? 'dp-lead' : undefined} style={a.textAlign && a.textAlign !== 'left' ? { textAlign: a.textAlign } : undefined}>
          {kids(n, ctx)}
        </p>
      );
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(a.level) || 2));
      const Tag = `h${level}` as 'h1';
      return <Tag key={key}>{kids(n, ctx)}</Tag>;
    }
    case 'bulletList':
      return <ul key={key}>{kids(n, ctx)}</ul>;
    case 'orderedList':
      return (
        <ol key={key} start={a.start ?? 1}>
          {kids(n, ctx)}
        </ol>
      );
    case 'listItem':
      return <li key={key}>{kids(n, ctx)}</li>;
    case 'taskList':
      return (
        <ul key={key} className="dp-tasks">
          {kids(n, ctx)}
        </ul>
      );
    case 'taskItem':
      return (
        <li key={key} className="dp-task">
          <input type="checkbox" checked={!!a.checked} readOnly disabled aria-label={a.checked ? 'Выполнено' : 'Не выполнено'} />
          <div>{kids(n, ctx)}</div>
        </li>
      );
    case 'blockquote':
      return <blockquote key={key}>{kids(n, ctx)}</blockquote>;
    case 'callout':
      return (
        <div key={key} className={'dp-callout ' + (a.variant ?? 'info')}>
          <span className="dp-callout-icon" aria-hidden>
            {a.icon || CALLOUT_ICON[a.variant] || 'ℹ️'}
          </span>
          <div className="dp-callout-body">{kids(n, ctx)}</div>
        </div>
      );
    case 'details': {
      const summary = n.content?.find((c) => c.type === 'detailsSummary');
      const body = n.content?.find((c) => c.type === 'detailsContent');
      return (
        <details key={key} className="dp-details" open={!!a.open}>
          <summary>{summary ? kids(summary, ctx) : 'Подробнее'}</summary>
          <div>{body ? kids(body, ctx) : null}</div>
        </details>
      );
    }
    case 'codeBlock':
      return (
        <pre key={key} className="dp-code" data-language={a.language || undefined}>
          <code>{plainText(n)}</code>
        </pre>
      );
    case 'mermaid':
      return (
        <figure key={key} className="dp-placeholder">
          <figcaption>Диаграмма</figcaption>
          <pre className="dp-code">
            <code>{plainText(n)}</code>
          </pre>
        </figure>
      );
    case 'blockMath':
    case 'inlineMath':
      return (
        <code key={key} className="dp-math">
          {a.latex ?? plainText(n)}
        </code>
      );
    case 'horizontalRule':
      return <hr key={key} />;
    case 'table':
      return (
        <div key={key} className="dp-table-wrap">
          <table className="dp-table">
            <tbody>{kids(n, ctx)}</tbody>
          </table>
        </div>
      );
    case 'tableRow':
      return <tr key={key}>{kids(n, ctx)}</tr>;
    case 'tableHeader':
    case 'tableCell': {
      const Tag = n.type === 'tableHeader' ? 'th' : 'td';
      return (
        <Tag key={key} colSpan={a.colspan > 1 ? a.colspan : undefined} rowSpan={a.rowspan > 1 ? a.rowspan : undefined} style={a.align ? { textAlign: a.align } : undefined}>
          {kids(n, ctx)}
        </Tag>
      );
    }
    case 'columns':
      return (
        <div key={key} className="dp-columns">
          {kids(n, ctx)}
        </div>
      );
    case 'column':
      return <div key={key}>{kids(n, ctx)}</div>;
    case 'image': {
      const src = safeSrc(a.src);
      return (
        <figure key={key} className="dp-figure">
          {src ? <img src={src} alt={a.alt ?? ''} loading="lazy" /> : <div className="dp-placeholder">🖼 {a.alt || 'Изображение'}</div>}
          {a.caption ? <figcaption>{a.caption}</figcaption> : null}
        </figure>
      );
    }
    case 'fileBlock':
      return (
        <div key={key} className="dp-placeholder">
          📎 {a.name || 'Файл'}
        </div>
      );
    case 'embed': {
      const href = safeHref(a.url ?? a.src);
      return (
        <div key={key} className="dp-placeholder">
          🔗 {href ? <a href={href} target="_blank" rel="noopener noreferrer">{href}</a> : 'Встроенный контент'}
        </div>
      );
    }
    case 'toc':
      return (
        <nav key={key} className="dp-toc" aria-label="Оглавление">
          <div className="dp-toc-title">Оглавление</div>
          <ul>
            {ctx.headings.map((h, i) => (
              <li key={i} style={{ paddingLeft: (h.level - 1) * 12 }}>
                {h.text}
              </li>
            ))}
          </ul>
        </nav>
      );
    case 'pageLink':
    case 'pageMention':
      return (
        <span key={key} className="dp-chip">
          📄 {a.title || a.label || 'Страница'}
        </span>
      );
    case 'mention':
      return (
        <span key={key} className="dp-chip">
          @{a.label || a.name || 'пользователь'}
        </span>
      );
    case 'collectionView':
      return (
        <div key={key} className="dp-placeholder">
          🗂 Коллекция
        </div>
      );
    case 'syncedBlock':
      return (
        <div key={key} className="dp-synced">
          {kids(n, ctx)}
        </div>
      );
    default:
      return n.content ? <Fragment key={key}>{kids(n, ctx)}</Fragment> : null;
  }
}

function collectHeadings(n: DocNode, out: Ctx['headings']) {
  if (n.type === 'heading') out.push({ level: Number(n.attrs?.level) || 2, text: plainText(n) });
  else for (const c of n.content ?? []) collectHeadings(c, out);
  return out;
}

/** Read-only renderer of a ProseMirror JSON document (templates, previews). Never injects HTML. */
export function DocPreview({ doc, className }: { doc: DocNode | null | undefined; className?: string }) {
  if (!doc || !doc.content?.length) return <div className="muted small">Документ пуст</div>;
  const ctx: Ctx = { headings: collectHeadings(doc, []) };
  return <div className={'doc-preview' + (className ? ' ' + className : '')}>{renderNode(doc, 0, ctx)}</div>;
}

export default DocPreview;
