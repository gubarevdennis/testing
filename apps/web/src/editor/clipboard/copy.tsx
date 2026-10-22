/**
 * Copy commands with honest feedback (R-CLIPBOARD-002/008, SC-10): a success toast only after the clipboard
 * write succeeded; when the browser refuses access, an error and a dialog with selectable text for Ctrl+C.
 */
import { useEffect } from 'react';
import type { Editor } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import { docToPlainText, type PMNode } from '@kb/shared';
import { toast } from '../../components/ui/Toast';
import { confirm } from '../../components/ui/Confirm';
import { loadMarkdown } from '../../lib/markdown';
import { cleanCopiedDom } from './html';
import { redactJson } from './redact';

export interface ClipboardPayload {
  text: string;
  html?: string;
}

/** Writes text/plain (+ text/html when given). Throws when the Clipboard API is unavailable or denied. */
export async function writeClipboard(data: ClipboardPayload): Promise<void> {
  const cb = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
  if (!cb) throw new Error('Clipboard API недоступен');
  if (data.html && typeof ClipboardItem !== 'undefined' && cb.write) {
    await cb.write([new ClipboardItem({ 'text/html': new Blob([data.html], { type: 'text/html' }), 'text/plain': new Blob([data.text], { type: 'text/plain' }) })]);
    return;
  }
  await cb.writeText(data.text);
}

/** Copies and reports the result; on refusal offers the text for manual copying. Returns true on success. */
export async function copyWithFeedback(data: ClipboardPayload, success: string): Promise<boolean> {
  try {
    await writeClipboard(data);
    toast.success(success);
    return true;
  } catch {
    toast.error('Браузер запретил доступ к буферу обмена — скопируйте вручную');
    await confirm({
      title: 'Скопируйте вручную',
      confirmLabel: 'Готово',
      body: (
        <div className="col" style={{ gap: 6 }}>
          <span className="small muted">Текст выделен — нажмите Ctrl+C (⌘+C на Mac).</span>
          <textarea className="textarea copy-fallback" readOnly rows={8} defaultValue={data.text} autoFocus onFocus={(e) => e.currentTarget.select()} aria-label="Текст для копирования" />
        </div>
      ),
    });
    return false;
  }
}

/** Clipboard-ready HTML of a document fragment: same markup as Ctrl+C, portable URLs, no comment anchors. */
export function fragmentHtml(editor: Editor, json: PMNode): string {
  const node = editor.schema.nodeFromJSON(json);
  const div = document.createElement('div');
  div.append(DOMSerializer.fromSchema(editor.schema).serializeFragment(node.content));
  cleanCopiedDom(div, location.origin);
  return div.innerHTML;
}

/** Copies a range of whole blocks with formatting (text/html) and as text (text/plain) — block/section copy. */
export async function copyBlocks(editor: Editor, from: number, to: number, success: string): Promise<boolean> {
  const json = await redactJson({ type: 'doc', content: editor.state.doc.slice(from, to).content.toJSON() ?? [] } as PMNode);
  return copyWithFeedback({ text: docToPlainText(json), html: fragmentHtml(editor, json) }, success);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export type CopyPageFormat = 'html' | 'text' | 'markdown';

/** Copies the whole page: with formatting (HTML + plain text), as plain text, or as Markdown. */
export async function copyPage(editor: Editor, title: string, format: CopyPageFormat): Promise<boolean> {
  const json = await redactJson(editor.getJSON() as PMNode);
  const text = (title ? title + '\n\n' : '') + docToPlainText(json);
  if (format === 'text') return copyWithFeedback({ text }, 'Текст страницы скопирован');
  if (format === 'markdown') {
    const { docToMarkdown } = await loadMarkdown();
    const { markdown } = docToMarkdown(json as never, { markers: false });
    return copyWithFeedback({ text: (title ? `# ${title}\n\n` : '') + markdown }, 'Страница скопирована в формате Markdown');
  }
  const html = (title ? `<h1>${esc(title)}</h1>` : '') + fragmentHtml(editor, json);
  return copyWithFeedback({ text, html }, 'Страница скопирована с форматированием');
}

/** Handles page-level copy commands from the page menu ("kb:copy-page" events with detail.format). */
export function useCopyPageCommands(editor: Editor | null, title: () => string) {
  useEffect(() => {
    if (!editor) return;
    const on = (e: Event) => {
      const format = ((e as CustomEvent).detail?.format ?? 'html') as CopyPageFormat;
      void copyPage(editor, title(), format);
    };
    window.addEventListener('kb:copy-page', on);
    return () => window.removeEventListener('kb:copy-page', on);
  }, [editor, title]);
}
