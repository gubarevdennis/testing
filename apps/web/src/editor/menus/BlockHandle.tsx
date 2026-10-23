import DragHandle from '@tiptap/extension-drag-handle-react';
import type { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { useRef, useState } from 'react';
import { GripVertical, Plus, Copy, Trash2, Link2, ArrowUp, ArrowDown, MessageSquarePlus, FileDown, Repeat2, Palette, ClipboardCopy, FileInput } from 'lucide-react';
import { loadMarkdown } from '../../lib/markdown';
import { Menu } from '../../components/ui/Menu';
import { Tooltip } from '../../components/ui/Tooltip';
import { duplicateBlock, deleteBlock, moveBlock, blockRangeKey } from '../extensions/blockOps';
import { turnIntoItems } from './BubbleToolbar';
import { TEXT_COLORS } from '../palette';
import { copyWithFeedback, copyBlocks } from '../clipboard/copy';
import { sectionRange } from '../clipboard/section';

// Must be a stable object: DragHandle re-registers its plugin (re-initialising every plugin view) when it changes.
const POSITION = { placement: 'left-start' as const, strategy: 'absolute' as const };

/** Block controls on hover: "+" inserts a block below (opens the "/" menu), the grip drags or opens block actions. */
export function BlockHandle({ editor, pageId, onComment, onMoveToPage }: { editor: Editor; pageId: string; onComment(blockId: string | null): void; onMoveToPage?(pos: number): void }) {
  const current = useRef<{ pos: number; node: any } | null>(null);
  const [, setTick] = useState(0);
  const selectCurrent = () => {
    const c = current.current;
    if (!c) return false;
    try {
      editor.chain().setNodeSelection(c.pos).run();
      return true;
    } catch {
      return false;
    }
  };
  const textInside = () => {
    const c = current.current;
    if (!c) return;
    editor
      .chain()
      .setTextSelection({ from: c.pos + 1, to: c.pos + c.node.nodeSize - 1 })
      .run();
  };
  const addBelow = () => {
    const c = current.current;
    if (!c) return;
    const end = c.pos + c.node.nodeSize;
    const empty = c.node.isTextblock && c.node.content.size === 0;
    if (empty) {
      editor.chain().focus().setTextSelection(c.pos + 1).insertContent('/').run();
      return;
    }
    const tr = editor.state.tr.insert(end, editor.schema.nodes.paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, end + 1));
    editor.view.dispatch(tr);
    editor.chain().focus().insertContent('/').run();
  };
  const blockId = () => current.current?.node.attrs?.id ?? null;
  const items = () => {
    const c = current.current;
    const isText = !!c?.node.isTextblock || ['bulletList', 'orderedList', 'taskList', 'blockquote'].includes(c?.node.type.name);
    return [
      ...(isText
        ? [
            {
              id: 'turn',
              label: 'Превратить в',
              icon: <Repeat2 size={15} />,
              children: turnIntoItems(editor).map((i) => ({ ...i, onSelect: () => (textInside(), i.onSelect()) })),
            },
            {
              id: 'color',
              label: 'Цвет текста',
              icon: <Palette size={15} />,
              children: [
                { id: 'none', label: 'По умолчанию', onSelect: () => (textInside(), editor.chain().focus().unsetColor().run()) },
                ...TEXT_COLORS.map((col) => ({ id: col.id, label: col.label, icon: <span className="swatch-text" style={{ color: col.value }}>A</span>, onSelect: () => (textInside(), editor.chain().focus().setColor(col.value).run()) })),
              ],
            },
            { separator: true as const },
          ]
        : []),
      { id: 'dup', label: 'Дублировать', icon: <Copy size={15} />, shortcut: 'Mod+D', onSelect: () => c && duplicateBlock(editor, c.pos) },
      { id: 'up', label: 'Переместить вверх', icon: <ArrowUp size={15} />, shortcut: 'Alt+Shift+↑', onSelect: () => c && moveBlock(editor, -1, c.pos) },
      { id: 'down', label: 'Переместить вниз', icon: <ArrowDown size={15} />, shortcut: 'Alt+Shift+↓', onSelect: () => c && moveBlock(editor, 1, c.pos) },
      ...(onMoveToPage ? [{ id: 'move-page', label: 'Переместить на страницу…', icon: <FileInput size={15} />, onSelect: () => c && onMoveToPage(c.pos) }] : []),
      { separator: true as const },
      // R-CLIPBOARD-001: a block / a heading's section with formatting (text/html + text/plain)
      { id: 'copy', label: 'Копировать блок', icon: <ClipboardCopy size={15} />, onSelect: () => c && void copyBlocks(editor, c.pos, c.pos + c.node.nodeSize, 'Блок скопирован') },
      ...(c?.node.type.name === 'heading'
        ? [
            {
              id: 'copy-section',
              label: 'Копировать раздел',
              icon: <ClipboardCopy size={15} />,
              onSelect: () => {
                const r = c && sectionRange(editor.state.doc, c.pos);
                if (r) void copyBlocks(editor, r.from, r.to, 'Раздел скопирован');
              },
            },
          ]
        : []),
      {
        id: 'link',
        label: 'Копировать ссылку на блок',
        icon: <Link2 size={15} />,
        onSelect: () => {
          const id = blockId();
          void copyWithFeedback({ text: `${location.origin}/p/${pageId}${id ? '?block=' + id : ''}` }, 'Ссылка на блок скопирована');
        },
      },
      {
        id: 'md',
        label: 'Копировать как Markdown',
        icon: <FileDown size={15} />,
        onSelect: async () => {
          if (!c) return;
          const { docToMarkdown } = await loadMarkdown();
          const { markdown } = docToMarkdown({ type: 'doc', content: [c.node.toJSON()] } as any, { markers: false });
          await copyWithFeedback({ text: markdown }, 'Скопировано в формате Markdown');
        },
      },
      { id: 'comment', label: 'Комментировать', icon: <MessageSquarePlus size={15} />, onSelect: () => (isText ? textInside() : selectCurrent(), onComment(blockId())) },
      { separator: true as const },
      { id: 'del', label: 'Удалить', icon: <Trash2 size={15} />, shortcut: 'Del', danger: true, onSelect: () => c && deleteBlock(editor, c.pos) },
    ];
  };
  if (!editor.isEditable) return null;
  return (
    <DragHandle
      editor={editor}
      className="block-handle"
      onNodeChange={({ node, pos }) => {
        current.current = node ? { node, pos } : null;
        setTick((x) => x + 1);
      }}
      computePositionConfig={POSITION}
    >
      <div className="block-handle-inner">
        <Tooltip label="Добавить блок ниже">
          <button className="icon-btn sm" aria-label="Добавить блок ниже" onClick={addBelow} onMouseDown={(e) => e.preventDefault()}>
            <Plus size={16} />
          </button>
        </Tooltip>
        <Menu
          label="Действия с блоком"
          items={items()}
          placement="left-start"
          // with several blocks selected (Esc, Shift+↑/↓) the selection is kept: «Переместить на страницу…» moves them all
          onOpenChange={(o) => o && !blockRangeKey.getState(editor.state) && selectCurrent()}
          trigger={({ ref, props }) => (
            <button ref={ref} className="icon-btn sm block-grip" aria-label="Перетащите или нажмите для действий" {...props} onMouseDown={(e) => e.stopPropagation()}>
              <GripVertical size={16} />
            </button>
          )}
        />
      </div>
    </DragHandle>
  );
}

export { NodeSelection };
