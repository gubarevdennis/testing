import { useMemo } from 'react';
import { generateHTML } from '@tiptap/core';
import DOMPurify from 'dompurify';
import { createSchemaExtensions, footnotesToEndnotes } from '@kb/shared';

let exts: ReturnType<typeof createSchemaExtensions> | null = null;

/** Static, sanitised rendering of a stored block or document (synced blocks, previews, published versions). */
export function DocPreviewInline({ node, className }: { node: any; className?: string }) {
  const html = useMemo(() => {
    exts ??= createSchemaExtensions();
    const doc = node.type === 'doc' ? node : { type: 'doc', content: [node] };
    try {
      const clean = DOMPurify.sanitize(generateHTML(doc, exts), { ADD_ATTR: ['data-type', 'data-variant', 'data-block-id', 'data-page-id', 'data-attachment-id', 'data-comment-thread', 'data-align'], FORBID_TAGS: ['style', 'script', 'iframe'] });
      if (!clean.includes('data-type="footnote"')) return clean;
      // footnotes read as numbered references with the notes after the content (R-EDITOR-038)
      const t = document.createElement('template');
      t.innerHTML = clean; // eslint-disable-line no-unsanitized/property -- sanitised by DOMPurify just above
      footnotesToEndnotes(t.content, { idPrefix: 'kb-pv-fn' });
      const div = document.createElement('div');
      div.append(t.content);
      return div.innerHTML;
    } catch {
      return '<p>Не удалось отобразить содержимое</p>';
    }
  }, [node]);
  return <div className={'kb-static ProseMirror ' + (className ?? '')} dangerouslySetInnerHTML={{ __html: html }} />;
}
