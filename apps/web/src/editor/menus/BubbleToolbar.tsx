import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import { useEffect, useRef, useState, useReducer } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, Code, Link2, Baseline, ChevronDown, AlignLeft, AlignCenter, AlignRight, AlignJustify, MessageSquarePlus, Subscript, Superscript, RemoveFormatting, Type, Heading1, Heading2, Heading3, List, ListOrdered, ListChecks, Quote, Code2, Info, Check, X, ExternalLink, Unlink, MoreHorizontal, Sigma,
} from 'lucide-react';
import { Tooltip } from '../../components/ui/Tooltip';
import { Menu } from '../../components/ui/Menu';
import { TEXT_COLORS, HIGHLIGHTS } from '../palette';
import { FONT_SIZES, FONT_FAMILIES, sanitizeHref } from '@kb/shared';

function useEditorTick(editor: Editor) {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    editor.on('transaction', force);
    return () => {
      editor.off('transaction', force);
    };
  }, [editor]);
}

export function blockTypeLabel(editor: Editor) {
  if (editor.isActive('heading', { level: 1 })) return 'Заголовок 1';
  if (editor.isActive('heading', { level: 2 })) return 'Заголовок 2';
  if (editor.isActive('heading', { level: 3 })) return 'Заголовок 3';
  if (editor.isActive('bulletList')) return 'Список';
  if (editor.isActive('orderedList')) return 'Нумерация';
  if (editor.isActive('taskList')) return 'Чек-лист';
  if (editor.isActive('blockquote')) return 'Цитата';
  if (editor.isActive('codeBlock')) return 'Код';
  return 'Текст';
}

export function turnIntoItems(editor: Editor) {
  const c = () => editor.chain().focus();
  return [
    { id: 'p', label: 'Текст', icon: <Type size={15} />, onSelect: () => c().clearNodes().setParagraph().run() },
    { id: 'h1', label: 'Заголовок 1', icon: <Heading1 size={15} />, shortcut: 'Mod+Alt+1', onSelect: () => c().setHeading({ level: 1 }).run() },
    { id: 'h2', label: 'Заголовок 2', icon: <Heading2 size={15} />, shortcut: 'Mod+Alt+2', onSelect: () => c().setHeading({ level: 2 }).run() },
    { id: 'h3', label: 'Заголовок 3', icon: <Heading3 size={15} />, shortcut: 'Mod+Alt+3', onSelect: () => c().setHeading({ level: 3 }).run() },
    { id: 'ul', label: 'Маркированный список', icon: <List size={15} />, shortcut: 'Mod+Shift+8', onSelect: () => c().toggleBulletList().run() },
    { id: 'ol', label: 'Нумерованный список', icon: <ListOrdered size={15} />, shortcut: 'Mod+Shift+7', onSelect: () => c().toggleOrderedList().run() },
    { id: 'todo', label: 'Чек-лист', icon: <ListChecks size={15} />, shortcut: 'Mod+Shift+9', onSelect: () => c().toggleTaskList().run() },
    { id: 'quote', label: 'Цитата', icon: <Quote size={15} />, onSelect: () => c().toggleBlockquote().run() },
    { id: 'code', label: 'Блок кода', icon: <Code2 size={15} />, onSelect: () => c().toggleCodeBlock().run() },
    { id: 'callout', label: 'Выделенный блок', icon: <Info size={15} />, onSelect: () => c().wrapIn('callout', { variant: 'info' }).run() },
  ];
}

/** Floating formatting toolbar for text selections. Hidden for node selections, tables cell ranges and code. */
export function BubbleToolbar({ editor, onComment }: { editor: Editor; onComment(): void }) {
  useEditorTick(editor);
  const [linkMode, setLinkMode] = useState(false);
  const [href, setHref] = useState('');
  const linkInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (linkMode) setTimeout(() => linkInput.current?.focus(), 0);
  }, [linkMode]);
  useEffect(() => {
    const open = () => {
      if (editor.state.selection.empty && !editor.isActive('link')) return;
      setHref(editor.getAttributes('link').href ?? '');
      setLinkMode(true);
    };
    window.addEventListener('kb:link-open', open);
    return () => window.removeEventListener('kb:link-open', open);
  }, [editor]);
  const btn = (label: string, icon: React.ReactNode, active: boolean, run: () => void, shortcut?: string) => (
    <Tooltip label={label} shortcut={shortcut}>
      <button className="icon-btn sm" aria-label={label} aria-pressed={active} onMouseDown={(e) => e.preventDefault()} onClick={run}>
        {icon}
      </button>
    </Tooltip>
  );
  const applyLink = () => {
    const url = href.trim();
    if (!url) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else {
      const full = /^[a-z]+:/i.test(url) || url.startsWith('/') || url.startsWith('#') ? url : 'https://' + url;
      if (!sanitizeHref(full)) return;
      editor.chain().focus().extendMarkRange('link').setLink({ href: full }).run();
    }
    setLinkMode(false);
  };
  const color = editor.getAttributes('textStyle').color as string | undefined;
  const hl = editor.getAttributes('highlight').color as string | undefined;
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="kbBubble"
      options={{ placement: 'top', offset: 8, flip: true, shift: { padding: 8 } }}
      shouldShow={({ editor: e, state, from, to }) => {
        if (!e.isEditable || from === to) return false;
        if (state.selection instanceof NodeSelection || state.selection instanceof CellSelection) return false;
        if (e.isActive('codeBlock') || e.isActive('mermaid')) return false;
        return state.doc.textBetween(from, to, ' ', '￼').trim().length > 0 || e.isActive('link');
      }}
      className="bubble-toolbar"
    >
      {linkMode ? (
        <div className="row bubble-link" style={{ gap: 4 }}>
          <input
            ref={linkInput}
            className="input"
            placeholder="Вставьте ссылку или адрес"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.preventDefault(), applyLink());
              if (e.key === 'Escape') (e.preventDefault(), setLinkMode(false), editor.commands.focus());
            }}
            aria-label="Адрес ссылки"
            aria-invalid={!!href.trim() && !sanitizeHref(/^[a-z]+:/i.test(href.trim()) ? href.trim() : 'https://' + href.trim())}
          />
          {btn('Применить', <Check size={15} />, false, applyLink)}
          {editor.isActive('link') && btn('Открыть ссылку', <ExternalLink size={15} />, false, () => window.open(editor.getAttributes('link').href, '_blank', 'noopener'))}
          {editor.isActive('link') && btn('Убрать ссылку', <Unlink size={15} />, false, () => (editor.chain().focus().extendMarkRange('link').unsetLink().run(), setLinkMode(false)))}
          {btn('Отмена', <X size={15} />, false, () => setLinkMode(false))}
        </div>
      ) : (
        <div className="row" style={{ gap: 1 }} role="toolbar" aria-label="Форматирование">
          <Menu
            label="Тип блока"
            items={turnIntoItems(editor)}
            trigger={({ ref, props }) => (
              <button ref={ref} className="btn ghost sm bubble-type" onMouseDown={(e) => e.preventDefault()} {...props}>
                {blockTypeLabel(editor)} <ChevronDown size={13} />
              </button>
            )}
          />
          <span className="toolbar-sep" />
          {btn('Жирный', <Bold size={15} />, editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), 'Mod+B')}
          {btn('Курсив', <Italic size={15} />, editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), 'Mod+I')}
          {btn('Подчёркнутый', <Underline size={15} />, editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), 'Mod+U')}
          {btn('Зачёркнутый', <Strikethrough size={15} />, editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), 'Mod+Shift+S')}
          {btn('Код', <Code size={15} />, editor.isActive('code'), () => editor.chain().focus().toggleCode().run(), 'Mod+E')}
          {btn('Ссылка', <Link2 size={15} />, editor.isActive('link'), () => (setHref(editor.getAttributes('link').href ?? ''), setLinkMode(true)), 'Mod+K')}
          <Menu
            label="Цвет"
            items={[
              { label: 'Цвет текста', header: true },
              { id: 'c-default', label: 'По умолчанию', icon: <span className="swatch-text">A</span>, checked: !color, onSelect: () => editor.chain().focus().unsetColor().run() },
              ...TEXT_COLORS.map((c) => ({ id: 'c-' + c.id, label: c.label, icon: <span className="swatch-text" style={{ color: c.value }}>A</span>, checked: color === c.value, onSelect: () => editor.chain().focus().setColor(c.value).run() })),
              { label: 'Выделение фоном', header: true },
              { id: 'h-none', label: 'Без фона', icon: <span className="swatch-bg" />, checked: !hl && !editor.isActive('highlight'), onSelect: () => editor.chain().focus().unsetHighlight().run() },
              ...HIGHLIGHTS.map((c) => ({ id: 'h-' + c.id, label: c.label, icon: <span className="swatch-bg" style={{ background: c.value }} />, checked: hl === c.value, onSelect: () => editor.chain().focus().setHighlight({ color: c.value }).run() })),
            ]}
            trigger={({ ref, props }) => (
              <Tooltip label="Цвет текста и фона">
                <button ref={ref} className="icon-btn sm" onMouseDown={(e) => e.preventDefault()} {...props}>
                  <Baseline size={15} style={{ color: color ?? undefined }} />
                </button>
              </Tooltip>
            )}
          />
          {btn('Комментарий', <MessageSquarePlus size={15} />, false, onComment, 'Mod+Shift+M')}
          <Menu
            label="Ещё"
            items={[
              { id: 'left', label: 'По левому краю', icon: <AlignLeft size={15} />, checked: editor.isActive({ textAlign: 'left' }), onSelect: () => editor.chain().focus().setTextAlign('left').run() },
              { id: 'center', label: 'По центру', icon: <AlignCenter size={15} />, checked: editor.isActive({ textAlign: 'center' }), onSelect: () => editor.chain().focus().setTextAlign('center').run() },
              { id: 'right', label: 'По правому краю', icon: <AlignRight size={15} />, checked: editor.isActive({ textAlign: 'right' }), onSelect: () => editor.chain().focus().setTextAlign('right').run() },
              { id: 'justify', label: 'По ширине', icon: <AlignJustify size={15} />, checked: editor.isActive({ textAlign: 'justify' }), onSelect: () => editor.chain().focus().setTextAlign('justify').run() },
              { separator: true },
              {
                id: 'size',
                label: 'Размер шрифта',
                children: [
                  { id: 'sz-default', label: 'По умолчанию', onSelect: () => editor.chain().focus().unsetFontSize().run() },
                  ...FONT_SIZES.map((s) => ({ id: 'sz' + s, label: `${s} px`, checked: editor.getAttributes('textStyle').fontSize === `${s}px`, onSelect: () => editor.chain().focus().setFontSize(`${s}px`).run() })),
                ],
              },
              {
                id: 'font',
                label: 'Шрифт',
                children: [
                  { id: 'f-default', label: 'Основной', onSelect: () => editor.chain().focus().unsetFontFamily().run() },
                  { id: 'f-serif', label: 'С засечками', onSelect: () => editor.chain().focus().setFontFamily(FONT_FAMILIES.serif).run() },
                  { id: 'f-mono', label: 'Моноширинный', onSelect: () => editor.chain().focus().setFontFamily(FONT_FAMILIES.mono).run() },
                ],
              },
              { separator: true },
              { id: 'sub', label: 'Нижний индекс', icon: <Subscript size={15} />, checked: editor.isActive('subscript'), onSelect: () => editor.chain().focus().toggleSubscript().run() },
              { id: 'sup', label: 'Верхний индекс', icon: <Superscript size={15} />, checked: editor.isActive('superscript'), onSelect: () => editor.chain().focus().toggleSuperscript().run() },
              {
                id: 'math',
                label: 'Формула из выделения',
                icon: <Sigma size={15} />,
                onSelect: () => {
                  const { from, to } = editor.state.selection;
                  const latex = editor.state.doc.textBetween(from, to);
                  editor.chain().focus().deleteRange({ from, to }).insertContent({ type: 'inlineMath', attrs: { latex } }).run();
                },
              },
              { separator: true },
              { id: 'clear', label: 'Очистить форматирование', icon: <RemoveFormatting size={15} />, onSelect: () => editor.chain().focus().unsetAllMarks().run() },
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
      )}
    </BubbleMenu>
  );
}
