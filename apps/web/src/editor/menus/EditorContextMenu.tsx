import { useEffect, useRef } from 'react';
import type { Editor } from '@tiptap/core';
import { NodeSelection, type EditorState } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import type { Node as PMNode } from '@tiptap/pm/model';
import {
  Scissors, Copy, ClipboardPaste, Type, Bold, Italic, Underline, Strikethrough, Code, RemoveFormatting, Repeat2, Palette, Link2, MessageSquarePlus, ArrowUpToLine, ArrowDownToLine,
  ArrowLeftToLine, ArrowRightToLine, Rows3, Columns3, TableCellsMerge, TableCellsSplit, Maximize2, ExternalLink, Download, Image as ImageIcon,
} from 'lucide-react';
import { openContextMenu } from '../../components/ui/ContextMenu';
import { touchedRecently, type MenuEntry } from '../../components/ui/Menu';
import { toast } from '../../components/ui/Toast';
import { openViewer, collectImages } from '../../components/ImageViewer';
import { blockActionItems } from './BlockHandle';
import { turnIntoItems } from './BubbleToolbar';
import { blockRangeKey } from '../extensions/blockOps';
import { copyWithFeedback } from '../clipboard/copy';
import { TEXT_COLORS, HIGHLIGHTS } from '../palette';

type Block = { pos: number; node: PMNode };

/** The movable block (a child of the page or of a column — the same blocks the drag handle offers) around `pos`. */
export function movableBlockAt(state: EditorState, pos: number): Block | null {
  const doc = state.doc;
  const movableParent = (n: PMNode) => n.type.name === 'doc' || n.type.name === 'column';
  const $p = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  // an atom (image, embed…) reported by posAtCoords().inside: the position right before it
  const after = $p.nodeAfter;
  if (after && after.isBlock && movableParent($p.parent)) return { pos, node: after };
  for (let d = $p.depth; d >= 1; d--) if (movableParent($p.node(d - 1))) return { pos: $p.before(d), node: $p.node(d) };
  return null;
}

/** Is the point inside an element the browser's own menu belongs to (fields, embedded frames)? */
function nativeTarget(t: HTMLElement) {
  return !!t.closest('input, textarea, select, iframe, video, audio, [data-native-context-menu]');
}

async function pasteFromClipboard(editor: Editor, plain: boolean) {
  editor.view.focus();
  try {
    if (!plain && navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        if (it.types.includes('text/html')) {
          const html = await (await it.getType('text/html')).text();
          if (editor.view.pasteHTML(html)) return;
        }
      }
      for (const it of items) {
        if (it.types.includes('text/plain')) {
          editor.view.pasteText(await (await it.getType('text/plain')).text());
          return;
        }
      }
      return;
    }
    editor.view.pasteText(await navigator.clipboard.readText());
  } catch {
    toast.info(`Браузер не дал доступ к буферу обмена — нажмите ${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'}${plain ? 'Shift+' : ''}V`);
  }
}

/** Runs the browser's cut/copy on the editor selection (the editor serialises it like Ctrl+C / Ctrl+X). */
function clipboardCommand(editor: Editor, cmd: 'copy' | 'cut') {
  editor.view.focus();
  let ok = false;
  try {
    ok = document.execCommand(cmd);
  } catch {
    ok = false;
  }
  if (!ok) toast.info(`Используйте ${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'}${cmd === 'copy' ? 'C' : 'X'}`);
}

function formatItems(editor: Editor): MenuEntry[] {
  const c = () => editor.chain().focus();
  return [
    { id: 'bold', label: 'Жирный', icon: <Bold size={15} />, shortcut: 'Mod+B', checked: editor.isActive('bold'), onSelect: () => c().toggleBold().run() },
    { id: 'italic', label: 'Курсив', icon: <Italic size={15} />, shortcut: 'Mod+I', checked: editor.isActive('italic'), onSelect: () => c().toggleItalic().run() },
    { id: 'underline', label: 'Подчёркнутый', icon: <Underline size={15} />, shortcut: 'Mod+U', checked: editor.isActive('underline'), onSelect: () => c().toggleUnderline().run() },
    { id: 'strike', label: 'Зачёркнутый', icon: <Strikethrough size={15} />, shortcut: 'Mod+Shift+S', checked: editor.isActive('strike'), onSelect: () => c().toggleStrike().run() },
    { id: 'code', label: 'Код', icon: <Code size={15} />, shortcut: 'Mod+E', checked: editor.isActive('code'), onSelect: () => c().toggleCode().run() },
    { separator: true },
    { id: 'clear', label: 'Очистить форматирование', icon: <RemoveFormatting size={15} />, onSelect: () => c().unsetAllMarks().run() },
  ];
}

function colorItems(editor: Editor): MenuEntry[] {
  const c = () => editor.chain().focus();
  return [
    { label: 'Цвет текста', header: true },
    { id: 'c-default', label: 'По умолчанию', icon: <span className="swatch-text">A</span>, onSelect: () => c().unsetColor().run() },
    ...TEXT_COLORS.map((col) => ({ id: 'c-' + col.id, label: col.label, icon: <span className="swatch-text" style={{ color: col.value }}>A</span>, onSelect: () => c().setColor(col.value).run() })),
    { label: 'Выделение фоном', header: true },
    { id: 'h-none', label: 'Без фона', icon: <span className="swatch-bg" />, onSelect: () => c().unsetHighlight().run() },
    ...HIGHLIGHTS.map((h) => ({ id: 'h-' + h.id, label: h.label, icon: <span className="swatch-bg" style={{ background: h.value }} />, onSelect: () => c().setHighlight({ color: h.value }).run() })),
  ];
}

function blockLinkItem(editor: Editor, pageId: string, block: Block | null): MenuEntry {
  return {
    id: 'link',
    label: 'Копировать ссылку на блок',
    icon: <Link2 size={15} />,
    onSelect: () => {
      const id = block?.node.attrs?.id ?? null;
      void copyWithFeedback({ text: `${location.origin}/p/${pageId}${id ? '?block=' + id : ''}` }, 'Ссылка на блок скопирована');
    },
  };
}

function tableItems(editor: Editor): MenuEntry[] {
  const c = () => editor.chain().focus();
  const can = editor.can();
  return [
    { label: 'Таблица', header: true },
    { id: 't-row-above', label: 'Вставить строку выше', icon: <ArrowUpToLine size={15} />, onSelect: () => c().addRowBefore().run() },
    { id: 't-row-below', label: 'Вставить строку ниже', icon: <ArrowDownToLine size={15} />, onSelect: () => c().addRowAfter().run() },
    { id: 't-col-left', label: 'Вставить столбец слева', icon: <ArrowLeftToLine size={15} />, onSelect: () => c().addColumnBefore().run() },
    { id: 't-col-right', label: 'Вставить столбец справа', icon: <ArrowRightToLine size={15} />, onSelect: () => c().addColumnAfter().run() },
    ...(can.mergeCells() ? [{ id: 't-merge', label: 'Объединить ячейки', icon: <TableCellsMerge size={15} />, onSelect: () => c().mergeCells().run() }] : []),
    ...(can.splitCell() ? [{ id: 't-split', label: 'Разделить ячейку', icon: <TableCellsSplit size={15} />, onSelect: () => c().splitCell().run() }] : []),
    { id: 't-del-row', label: 'Удалить строку', icon: <Rows3 size={15} />, danger: true, onSelect: () => c().deleteRow().run() },
    { id: 't-del-col', label: 'Удалить столбец', icon: <Columns3 size={15} />, danger: true, onSelect: () => c().deleteColumn().run() },
    { separator: true },
  ];
}

function imageItems(editor: Editor, block: Block): MenuEntry[] {
  const src: string = block.node.attrs.src ?? '';
  return [
    { label: 'Изображение', header: true },
    {
      id: 'img-view',
      label: 'Открыть в просмотрщике',
      icon: <Maximize2 size={15} />,
      onSelect: () => {
        const images = collectImages(editor);
        openViewer(images, Math.max(0, images.findIndex((i) => i.pos === block.pos)));
      },
    },
    ...(src ? [{ id: 'img-tab', label: 'Открыть в новой вкладке', icon: <ExternalLink size={15} />, onSelect: () => void window.open(src, '_blank', 'noopener') }] : []),
    ...(src
      ? [
          {
            id: 'img-copy',
            label: 'Копировать изображение',
            icon: <ImageIcon size={15} />,
            onSelect: async () => {
              try {
                const blob = await (await fetch(src, { credentials: 'same-origin' })).blob();
                // browsers accept image/png for the clipboard; other formats are offered as a link
                if (blob.type !== 'image/png') throw new Error('format');
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                toast.success('Изображение скопировано');
              } catch {
                await copyWithFeedback({ text: new URL(src, location.href).href }, 'Ссылка на изображение скопирована');
              }
            },
          },
          {
            id: 'img-download',
            label: 'Скачать',
            icon: <Download size={15} />,
            onSelect: () => {
              const a = document.createElement('a');
              a.href = src + (src.includes('?') ? '&' : '?') + 'download=1';
              a.download = block.node.attrs.alt || '';
              a.rel = 'noopener';
              document.body.append(a);
              a.click();
              a.remove();
            },
          },
        ]
      : []),
    { separator: true },
  ];
}

const SHIFT_HINT: MenuEntry = { label: 'Shift + правый клик — меню браузера', header: true };

/**
 * Right-click menu of the editor (Notion-like): on a text selection — cut / copy / paste, formatting, turn into,
 * colour, link, comment; on a block — the block actions of the drag handle (turn into, colour, duplicate, move,
 * copy link, comment, delete); on images and tables their own actions first. Fields inside the document and
 * Shift + right click keep the browser's menu; touch long-press keeps native text selection.
 */
export function EditorContextMenu({
  editor,
  pageId,
  canComment,
  onComment,
  onMoveToPage,
}: {
  editor: Editor;
  pageId: string;
  canComment: boolean;
  onComment(blockId: string | null): void;
  onMoveToPage?(pos: number): void;
}) {
  const props = useRef({ pageId, canComment, onComment, onMoveToPage });
  props.current = { pageId, canComment, onComment, onMoveToPage };
  useEffect(() => {
    const dom = editor.view.dom as HTMLElement;
    let fromKeyboard = false;
    const onContext = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || e.defaultPrevented || (e.shiftKey && !fromKeyboard) || nativeTarget(t) || touchedRecently(800) || editor.isDestroyed) return;
      const { pageId: pid, canComment: mayComment, onComment: comment, onMoveToPage: moveToPage } = props.current;
      const view = editor.view;
      const hit = view.posAtCoords({ left: e.clientX, top: e.clientY });
      if (!hit) return;
      const state = editor.state;
      const sel = state.selection;
      const editable = editor.isEditable;
      const inSelection = !sel.empty && !(sel instanceof NodeSelection) && hit.pos >= sel.from && hit.pos <= sel.to;
      const inRange = (() => {
        const r = blockRangeKey.getState(state);
        return !!r && hit.pos >= r.from && hit.pos <= r.to;
      })();
      const block = movableBlockAt(state, hit.inside >= 0 ? hit.inside : hit.pos);
      const inTable = !!t.closest('td, th');
      let items: MenuEntry[];
      if (inSelection && !inRange && !(sel instanceof CellSelection)) {
        const textBlock = movableBlockAt(state, sel.from);
        items = editable
          ? [
              { id: 'cut', label: 'Вырезать', icon: <Scissors size={15} />, shortcut: 'Mod+X', onSelect: () => clipboardCommand(editor, 'cut') },
              { id: 'copy', label: 'Копировать', icon: <Copy size={15} />, shortcut: 'Mod+C', onSelect: () => clipboardCommand(editor, 'copy') },
              { id: 'paste', label: 'Вставить', icon: <ClipboardPaste size={15} />, shortcut: 'Mod+V', onSelect: () => void pasteFromClipboard(editor, false) },
              { id: 'paste-text', label: 'Вставить как текст', icon: <Type size={15} />, shortcut: 'Mod+Shift+V', onSelect: () => void pasteFromClipboard(editor, true) },
              { separator: true },
              { id: 'format', label: 'Форматирование', icon: <Bold size={15} />, children: formatItems(editor) },
              { id: 'turn', label: 'Превратить в', icon: <Repeat2 size={15} />, children: turnIntoItems(editor) },
              { id: 'color', label: 'Цвет', icon: <Palette size={15} />, children: colorItems(editor) },
              {
                id: 'link-edit',
                label: 'Ссылка',
                icon: <Link2 size={15} />,
                shortcut: 'Mod+K',
                onSelect: () => {
                  editor.view.focus();
                  // the selection toolbar opens its link field (it reappears with the editor focus)
                  setTimeout(() => window.dispatchEvent(new Event('kb:link-open')), 30);
                },
              },
              { id: 'comment', label: 'Комментировать', icon: <MessageSquarePlus size={15} />, shortcut: 'Mod+Shift+M', onSelect: () => (editor.view.focus(), comment(null)) },
              { separator: true },
              blockLinkItem(editor, pid, textBlock),
              SHIFT_HINT,
            ]
          : [
              { id: 'copy', label: 'Копировать', icon: <Copy size={15} />, shortcut: 'Mod+C', onSelect: () => clipboardCommand(editor, 'copy') },
              ...(mayComment ? [{ id: 'comment', label: 'Комментировать', icon: <MessageSquarePlus size={15} />, onSelect: () => (editor.view.focus(), comment(null)) }] : []),
              { separator: true },
              blockLinkItem(editor, pid, textBlock),
              SHIFT_HINT,
            ];
      } else if (!block) {
        return;
      } else if (!editable) {
        items = [blockLinkItem(editor, pid, block), SHIFT_HINT];
      } else {
        // the clicked block is selected (highlighted) like with the drag handle; a selected block range is kept
        if (inTable && !(sel instanceof CellSelection)) {
          editor.chain().setTextSelection(hit.pos).run();
        } else if (!inRange && !(sel instanceof CellSelection)) {
          try {
            editor.chain().setNodeSelection(block.pos).run();
          } catch {
            /* not selectable as a node: keep the caret */
          }
        }
        const pre = block.node.type.name === 'image' ? imageItems(editor, block) : inTable || block.node.type.name === 'table' ? tableItems(editor) : [];
        const actions = blockActionItems(editor, block, pid, (id) => comment(id), moveToPage);
        items = [...pre, ...(pre.length ? [{ label: 'Блок', header: true } as MenuEntry] : []), ...actions, SHIFT_HINT];
      }
      e.preventDefault();
      const keyboard = fromKeyboard;
      fromKeyboard = false;
      openContextMenu(e, items, { label: inSelection ? 'Действия с выделенным текстом' : 'Действия с блоком', keyboard });
    };
    // Menu key / Shift+F10 inside the editor: the menu opens at the caret
    const onKey = (e: KeyboardEvent) => {
      if (!(e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey))) return;
      const { from } = editor.state.selection;
      const at = editor.view.coordsAtPos(from);
      e.preventDefault();
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: at.left + 1, clientY: (at.top + at.bottom) / 2 });
      const target = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null) ?? dom;
      fromKeyboard = true;
      (dom.contains(target) ? target : dom).dispatchEvent(ev);
      fromKeyboard = false;
    };
    dom.addEventListener('contextmenu', onContext);
    dom.addEventListener('keydown', onKey);
    return () => {
      dom.removeEventListener('contextmenu', onContext);
      dom.removeEventListener('keydown', onKey);
    };
  }, [editor]);
  return null;
}

