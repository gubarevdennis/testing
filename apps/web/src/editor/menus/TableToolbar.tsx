import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/core';
import { CellSelection } from '@tiptap/pm/tables';
import { findParentNode } from '@tiptap/core';
import { useEffect, useReducer } from 'react';
import {
  ArrowUpToLine, ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, Trash2, TableCellsMerge, TableCellsSplit, PaintBucket, AlignLeft, AlignCenter, AlignRight, MoreHorizontal, Copy, Rows3, Columns3, Heading, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
} from 'lucide-react';
import { tableToRows, rowsToTsv, docToMarkdown } from '@kb/shared';
import { Tooltip } from '../../components/ui/Tooltip';
import { Menu } from '../../components/ui/Menu';
import { HIGHLIGHTS } from '../palette';
import { toast } from '../../components/ui/Toast';

const inTable = (e: Editor) => e.isActive('table');

function tableNode(editor: Editor) {
  return findParentNode((n) => n.type.name === 'table')(editor.state.selection);
}

/** Contextual toolbar above a table: rows/columns, merging, cell colours and alignment, copy to Excel. */
export function TableToolbar({ editor }: { editor: Editor }) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    editor.on('selectionUpdate', force);
    return () => {
      editor.off('selectionUpdate', force);
    };
  }, [editor]);
  const c = () => editor.chain().focus();
  const b = (label: string, icon: React.ReactNode, run: () => void, disabled = false) => (
    <Tooltip label={label}>
      <button className="icon-btn sm" aria-label={label} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={run}>
        {icon}
      </button>
    </Tooltip>
  );
  const copy = (kind: 'tsv' | 'md') => {
    const t = tableNode(editor);
    if (!t) return;
    const json = t.node.toJSON();
    const text = kind === 'tsv' ? rowsToTsv(tableToRows(json)) : docToMarkdown({ type: 'doc', content: [json] } as any, { markers: false }).markdown;
    navigator.clipboard.writeText(text).then(() => toast.success(kind === 'tsv' ? 'Таблица скопирована — вставьте в Excel' : 'Скопировано в формате Markdown'));
  };
  const multi = editor.state.selection instanceof CellSelection;
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="kbTableMenu"
      shouldShow={({ editor: e }) => e.isEditable && inTable(e)}
      getReferencedVirtualElement={() => {
        const t = tableNode(editor);
        if (!t) return null;
        const dom = editor.view.nodeDOM(t.pos) as HTMLElement | null;
        const el = dom?.closest('.tableWrapper') ?? dom;
        return el ? { getBoundingClientRect: () => el.getBoundingClientRect(), getClientRects: () => el.getClientRects() } : null;
      }}
      options={{ placement: 'top-start', offset: 6, flip: true, shift: { padding: 8 } }}
      className="table-toolbar"
    >
      <div className="row" style={{ gap: 1 }} role="toolbar" aria-label="Таблица">
        {b('Строка выше', <ArrowUpToLine size={15} />, () => c().addRowBefore().run())}
        {b('Строка ниже', <ArrowDownToLine size={15} />, () => c().addRowAfter().run())}
        {b('Столбец слева', <ArrowLeftToLine size={15} />, () => c().addColumnBefore().run())}
        {b('Столбец справа', <ArrowRightToLine size={15} />, () => c().addColumnAfter().run())}
        <span className="toolbar-sep" />
        {b('Объединить ячейки', <TableCellsMerge size={15} />, () => c().mergeCells().run(), !multi)}
        {b('Разделить ячейку', <TableCellsSplit size={15} />, () => c().splitCell().run(), !editor.can().splitCell())}
        <Menu
          label="Цвет ячейки"
          items={[
            { id: 'none', label: 'Без заливки', onSelect: () => c().setCellAttribute('background', null).run() },
            ...HIGHLIGHTS.map((h) => ({ id: h.id, label: h.label.replace(' фон', ''), icon: <span className="swatch-bg" style={{ background: h.value }} />, onSelect: () => c().setCellAttribute('background', h.value).run() })),
          ]}
          trigger={({ ref, props }) => (
            <Tooltip label="Заливка ячеек">
              <button ref={ref} className="icon-btn sm" onMouseDown={(e) => e.preventDefault()} {...props}>
                <PaintBucket size={15} />
              </button>
            </Tooltip>
          )}
        />
        <Menu
          label="Выравнивание"
          items={[
            { id: 'l', label: 'По левому краю', icon: <AlignLeft size={15} />, onSelect: () => c().setCellAttribute('align', 'left').run() },
            { id: 'c', label: 'По центру', icon: <AlignCenter size={15} />, onSelect: () => c().setCellAttribute('align', 'center').run() },
            { id: 'r', label: 'По правому краю', icon: <AlignRight size={15} />, onSelect: () => c().setCellAttribute('align', 'right').run() },
            { separator: true },
            { id: 't', label: 'По верху', icon: <AlignVerticalJustifyStart size={15} />, onSelect: () => c().setCellAttribute('valign', 'top').run() },
            { id: 'm', label: 'По середине', icon: <AlignVerticalJustifyCenter size={15} />, onSelect: () => c().setCellAttribute('valign', 'middle').run() },
            { id: 'b', label: 'По низу', icon: <AlignVerticalJustifyEnd size={15} />, onSelect: () => c().setCellAttribute('valign', 'bottom').run() },
          ]}
          trigger={({ ref, props }) => (
            <Tooltip label="Выравнивание в ячейках">
              <button ref={ref} className="icon-btn sm" onMouseDown={(e) => e.preventDefault()} {...props}>
                <AlignLeft size={15} />
              </button>
            </Tooltip>
          )}
        />
        <span className="toolbar-sep" />
        <Menu
          label="Таблица"
          items={[
            { id: 'hrow', label: 'Строка заголовков', icon: <Heading size={15} />, onSelect: () => c().toggleHeaderRow().run() },
            { id: 'hcol', label: 'Столбец заголовков', icon: <Heading size={15} />, onSelect: () => c().toggleHeaderColumn().run() },
            { separator: true },
            { id: 'drow', label: 'Удалить строку', icon: <Rows3 size={15} />, danger: true, onSelect: () => c().deleteRow().run() },
            { id: 'dcol', label: 'Удалить столбец', icon: <Columns3 size={15} />, danger: true, onSelect: () => c().deleteColumn().run() },
            { separator: true },
            { id: 'tsv', label: 'Копировать для Excel', icon: <Copy size={15} />, onSelect: () => copy('tsv') },
            { id: 'md', label: 'Копировать как Markdown', icon: <Copy size={15} />, onSelect: () => copy('md') },
            { separator: true },
            { id: 'del', label: 'Удалить таблицу', icon: <Trash2 size={15} />, danger: true, onSelect: () => c().deleteTable().run() },
          ]}
          trigger={({ ref, props }) => (
            <Tooltip label="Ещё">
              <button ref={ref} className="icon-btn sm" onMouseDown={(e) => e.preventDefault()} {...props}>
                <MoreHorizontal size={15} />
              </button>
            </Tooltip>
          )}
        />
      </div>
    </BubbleMenu>
  );
}
