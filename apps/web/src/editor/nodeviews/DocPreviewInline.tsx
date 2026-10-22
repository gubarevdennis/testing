import { useMemo } from 'react';
import { generateHTML } from '@tiptap/core';
import DOMPurify from 'dompurify';
import { createSchemaExtensions } from '@kb/shared';

let exts: ReturnType<typeof createSchemaExtensions> | null = null;

/** Static, sanitised rendering of a stored block or document (synced blocks, previews, published versions). */
export function DocPreviewInline({ node, className }: { node: any; className?: string }) {
  const html = useMemo(() => {
    exts ??= createSchemaExtensions();
    const doc = node.type === 'doc' ? node : { type: 'doc', content: [node] };
    try {
      return DOMPurify.sanitize(generateHTML(doc, exts), { ADD_ATTR: ['data-type', 'data-variant', 'data-block-id', 'data-page-id', 'data-attachment-id', 'data-comment-thread', 'data-align'], FORBID_TAGS: ['style', 'script', 'iframe'] });
    } catch {
      return '<p>Не удалось отобразить содержимое</p>';
    }
  }, [node]);
  return <div className={'kb-static ProseMirror ' + (className ?? '')} dangerouslySetInnerHTML={{ __html: html }} />;
}
