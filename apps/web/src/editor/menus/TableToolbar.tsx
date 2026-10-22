import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/core';
import { CellSelection } from '@tiptap/pm/tables';
import { findParentNode } from '@tiptap/core';
import { useCallback } from 'react';
import { useEditorState } from '@tiptap/react';
import {
  ArrowUpToLine, ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, Trash2, TableCellsMerge, TableCellsSplit, PaintBucket, AlignLeft, AlignCenter, AlignRight, MoreHorizontal, Copy, Rows3, Columns3, Heading, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, ArrowDownAZ, ArrowDownZA,
} from 'lucide-react';
import { tableToRows, rowsToTsv } from '@kb/shared';
import { loadMarkdown } from '../../lib/markdown';
import { Tooltip } from '../../components/ui/Tooltip';
import { Menu } from '../../components/ui/Menu';
import { HIGHLIGHTS } from '../palette';
import { copyWithFeedback, fragmentHtml } from '../clipboard/copy';
import { moveTableRow, moveTableColumn, sortTableByColumn, TABLE_OP_ERRORS, type TableOpResult } from '../tableOps';
import { toast } from '../../components/ui/Toast';

function report(r: TableOpResult, editor: Editor) {
  if (r !== 'ok' && TABLE_OP_ERRORS[r]) toast.error(TABLE_OP_ERRORS[r]);
  // the menu returns focus to its button on close: give it back to the table so Alt+Shift+arrows keep working
  setTimeout(() => editor.view.focus(), 30);
}

const inTable = (e: Editor) => e.isActive('table');
const TABLE_OPTIONS = { placement: 'top-start' as const, offset: 6, flip: true, shift: { padding: 8 } };
const tableShouldShow = ({ editor: e }: { editor: Editor }) => e.isEditable && inTable(e);

const NOT_IN_TABLE = { multi: false, canSplit: false };

function tableNode(editor: Editor) {
  return findParentNode((n) => n.type.name === 'table')(editor.state.selection);
}

/** Contextual toolbar above a table: rows/columns, merging, cell colours and alignment, copy to Excel. */
export function TableToolbar({ editor }: { editor: Editor }) {
  // outside a table the toolbar is hidden: skip the (document-wide) command dry run on every keystroke
  const st = useEditorState({ editor, selector: ({ editor: e }) => (inTable(e) ? { multi: e.state.selection instanceof CellSelection, canSplit: e.can().splitCell() } : NOT_IN_TABLE) });
  const c = () => editor.chain().focus();
  const b = (label: string, icon: React.ReactNode, run: () => void, disabled = false) => (
    <Tooltip label={label}>
      <button className="icon-btn sm" aria-label={label} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={run}>
        {icon}
      </button>
    </Tooltip>
  );
  const copy = async (kind: 'tsv' | 'md') => {
    const t = tableNode(editor);
    if (!t) return;
    const json = t.node.toJSON();
    if (kind === 'tsv') {
      // TSV for spreadsheets + HTML table for Word/mail (R-CLIPBOARD-006, R-CLIPBOARD-017)
      await copyWithFeedback({ text: rowsToTsv(tableToRows(json)), html: fragmentHtml(editor, { type: 'doc', content: [json] }) }, 'Таблица скопирована — вставьте в Excel или Word');
      return;
    }
    const { docToMarkdown } = await loadMarkdown();
    await copyWithFeedback({ text: docToMarkdown({ type: 'doc', content: [json] } as any, { markers: false }).markdown }, 'Скопировано в формате Markdown');
  };
  const multi = st.multi;
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="kbTableMenu"
      shouldShow={tableShouldShow}
      getReferencedVirtualElement={useCallback(() => {
        const t = tableNode(editor);
        if (!t) return null;
        const dom = editor.view.nodeDOM(t.pos) as HTMLElement | null;
        const el = dom?.closest('.tableWrapper') ?? dom;
        return el ? { getBoundingClientRect: () => el.getBoundingClientRect(), getClientRects: () => el.getClientRects() } : null;
      }, [editor])}
      options={TABLE_OPTIONS}
      className="table-toolbar"
    >
      <div className="row" style={{ gap: 1 }} role="toolbar" aria-label="Таблица">
        {b('Строка выше', <ArrowUpToLine size={15} />, () => c().addRowBefore().run())}
        {b('Строка ниже', <ArrowDownToLine size={15} />, () => c().addRowAfter().run())}
        {b('Столбец слева', <ArrowLeftToLine size={15} />, () => c().addColumnBefore().run())}
        {b('Столбец справа', <ArrowRightToLine size={15} />, () => c().addColumnAfter().run())}
        <span className="toolbar-sep" />
        {b('Объединить ячейки', <TableCellsMerge size={15} />, () => c().mergeCells().run(), !multi)}
        {b('Разделить ячейку', <TableCellsSplit size={15} />, () => c().splitCell().run(), !st.canSplit)}
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
            { id: 'mrup', label: 'Переместить строку вверх', icon: <ArrowUp size={15} />, shortcut: 'Alt+Shift+↑', onSelect: () => report(moveTableRow(editor, -1), editor) },
            { id: 'mrdown', label: 'Переместить строку вниз', icon: <ArrowDown size={15} />, shortcut: 'Alt+Shift+↓', onSelect: () => report(moveTableRow(editor, 1), editor) },
            { id: 'mcleft', label: 'Переместить столбец влево', icon: <ArrowLeft size={15} />, shortcut: 'Alt+Shift+←', onSelect: () => report(moveTableColumn(editor, -1), editor) },
            { id: 'mcright', label: 'Переместить столбец вправо', icon: <ArrowRight size={15} />, shortcut: 'Alt+Shift+→', onSelect: () => report(moveTableColumn(editor, 1), editor) },
            { id: 'sasc', label: 'Сортировать по возрастанию', icon: <ArrowDownAZ size={15} />, onSelect: () => report(sortTableByColumn(editor, 'asc'), editor) },
            { id: 'sdesc', label: 'Сортировать по убыванию', icon: <ArrowDownZA size={15} />, onSelect: () => report(sortTableByColumn(editor, 'desc'), editor) },
            { separator: true },
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
