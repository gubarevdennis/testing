import type { Editor, Range } from '@tiptap/core';
import {
  Type, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6, List, ListOrdered, ListChecks, Quote, Code2, Minus, Table, Image, Paperclip, Info, Columns2, Columns3, ChevronRight, Sigma, Workflow, ListTree, FileText, Link2, Video, Pilcrow, AtSign, Smile, Copy, Database, Footprints,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { insertFootnote } from './extensions/footnotes';

export interface SlashCommand {
  id: string;
  title: string;
  hint?: string;
  group: string;
  keywords: string;
  icon: ReactNode;
  shortcut?: string;
  run(editor: Editor, range: Range, ctx: CommandContext): void;
}

export interface CommandContext {
  pickFiles(accept: string): void;
  createChildPage(): void;
  pickPage(): void;
  embedUrl(): void;
  insertCollection(): void;
  insertSyncedBlock(): void;
  imageFromUrl(): void;
}

const S = 16;
const del = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'text', group: 'Основные', title: 'Текст', keywords: 'text paragraph текст абзац обычный', icon: <Type size={S} />, run: (e, r) => del(e, r).setParagraph().run() },
  { id: 'h1', group: 'Основные', title: 'Заголовок 1', keywords: 'h1 heading title заголовок большой', shortcut: '#', icon: <Heading1 size={S} />, run: (e, r) => del(e, r).setHeading({ level: 1 }).run() },
  { id: 'h2', group: 'Основные', title: 'Заголовок 2', keywords: 'h2 heading subtitle заголовок средний', shortcut: '##', icon: <Heading2 size={S} />, run: (e, r) => del(e, r).setHeading({ level: 2 }).run() },
  { id: 'h3', group: 'Основные', title: 'Заголовок 3', keywords: 'h3 heading заголовок малый', shortcut: '###', icon: <Heading3 size={S} />, run: (e, r) => del(e, r).setHeading({ level: 3 }).run() },
  { id: 'h4', group: 'Основные', title: 'Заголовок 4', keywords: 'h4 heading заголовок четвёртого уровня', shortcut: '####', icon: <Heading4 size={S} />, run: (e, r) => del(e, r).setHeading({ level: 4 }).run() },
  { id: 'h5', group: 'Основные', title: 'Заголовок 5', keywords: 'h5 heading заголовок пятого уровня', shortcut: '#####', icon: <Heading5 size={S} />, run: (e, r) => del(e, r).setHeading({ level: 5 }).run() },
  { id: 'h6', group: 'Основные', title: 'Заголовок 6', keywords: 'h6 heading заголовок шестого уровня', shortcut: '######', icon: <Heading6 size={S} />, run: (e, r) => del(e, r).setHeading({ level: 6 }).run() },
  { id: 'lead', group: 'Основные', title: 'Вводный абзац', keywords: 'lead intro вводный лид крупный', icon: <Pilcrow size={S} />, run: (e, r) => del(e, r).setParagraph().updateAttributes('paragraph', { variant: 'lead' }).run() },
  { id: 'bullet', group: 'Списки', title: 'Маркированный список', keywords: 'bullet list ul список маркеры точки', shortcut: '-', icon: <List size={S} />, run: (e, r) => del(e, r).toggleBulletList().run() },
  { id: 'ordered', group: 'Списки', title: 'Нумерованный список', keywords: 'number ordered ol список нумерация', shortcut: '1.', icon: <ListOrdered size={S} />, run: (e, r) => del(e, r).toggleOrderedList().run() },
  { id: 'todo', group: 'Списки', title: 'Чек-лист', keywords: 'todo task checklist чеклист задачи галочки', shortcut: '[]', icon: <ListChecks size={S} />, run: (e, r) => del(e, r).toggleTaskList().run() },
  { id: 'toggle', group: 'Списки', title: 'Раскрывающийся блок', keywords: 'toggle details collapse раскрывающийся свернуть спойлер', shortcut: '>', icon: <ChevronRight size={S} />, run: (e, r) => del(e, r).setDetails().run() },
  { id: 'table', group: 'Блоки', title: 'Таблица', keywords: 'table grid таблица сетка', icon: <Table size={S} />, run: (e, r) => del(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: 'callout', group: 'Блоки', title: 'Выделенный блок', hint: 'Инфо, совет, предупреждение', keywords: 'callout note info warning tip выноска заметка предупреждение совет важно', shortcut: '!info', icon: <Info size={S} />, run: (e, r) => del(e, r).wrapIn('callout', { variant: 'info' }).run() },
  { id: 'quote', group: 'Блоки', title: 'Цитата', keywords: 'quote blockquote цитата', shortcut: '"', icon: <Quote size={S} />, run: (e, r) => del(e, r).toggleBlockquote().run() },
  { id: 'code', group: 'Блоки', title: 'Блок кода', keywords: 'code snippet код программа', shortcut: '```', icon: <Code2 size={S} />, run: (e, r) => del(e, r).toggleCodeBlock().run() },
  { id: 'divider', group: 'Блоки', title: 'Разделитель', keywords: 'divider hr line separator разделитель линия', shortcut: '---', icon: <Minus size={S} />, run: (e, r) => del(e, r).setHorizontalRule().run() },
  { id: 'cols2', group: 'Блоки', title: 'Две колонки', keywords: 'columns layout колонки столбцы две', icon: <Columns2 size={S} />, run: (e, r) => insertColumns(e, r, 2) },
  { id: 'cols3', group: 'Блоки', title: 'Три колонки', keywords: 'columns layout колонки столбцы три', icon: <Columns3 size={S} />, run: (e, r) => insertColumns(e, r, 3) },
  { id: 'image', group: 'Медиа', title: 'Изображение', hint: 'Загрузить или вставить из буфера', keywords: 'image picture photo screenshot изображение картинка фото скриншот', icon: <Image size={S} />, run: (e, r, c) => (del(e, r).run(), c.pickFiles('image/*')) },
  { id: 'image-url', group: 'Медиа', title: 'Изображение по ссылке', hint: 'Скопировать картинку с сайта', keywords: 'image url link picture изображение ссылка адрес картинка интернет', icon: <Link2 size={S} />, run: (e, r, c) => (del(e, r).run(), c.imageFromUrl()) },
  { id: 'file', group: 'Медиа', title: 'Файл', keywords: 'file attachment pdf docx файл вложение документ', icon: <Paperclip size={S} />, run: (e, r, c) => (del(e, r).run(), c.pickFiles('*/*')) },
  { id: 'video', group: 'Медиа', title: 'Видео или ссылка', keywords: 'video embed youtube rutube видео встроить ссылка', icon: <Video size={S} />, run: (e, r, c) => (del(e, r).run(), c.embedUrl()) },
  { id: 'subpage', group: 'Страницы', title: 'Вложенная страница', keywords: 'page subpage child страница вложенная подстраница', icon: <FileText size={S} />, run: (e, r, c) => (del(e, r).run(), c.createChildPage()) },
  { id: 'pagelink', group: 'Страницы', title: 'Ссылка на страницу', keywords: 'link page mention ссылка страница', shortcut: '[[', icon: <Link2 size={S} />, run: (e, r, c) => (del(e, r).run(), c.pickPage()) },
  { id: 'mention', group: 'Страницы', title: 'Упоминание', keywords: 'mention user person упоминание сотрудник', shortcut: '@', icon: <AtSign size={S} />, run: (e, r) => del(e, r).insertContent('@').run() },
  { id: 'toc', group: 'Страницы', title: 'Оглавление', keywords: 'toc contents оглавление содержание', icon: <ListTree size={S} />, run: (e, r) => del(e, r).insertContent({ type: 'toc' }).run() },
  { id: 'synced', group: 'Страницы', title: 'Синхронизированный блок', hint: 'Блок с другой страницы', keywords: 'synced block reuse синхронизированный повтор вставка блока', icon: <Copy size={S} />, run: (e, r, c) => (del(e, r).run(), c.insertSyncedBlock()) },
  { id: 'collection', group: 'Страницы', title: 'Реестр (база данных)', keywords: 'database collection registry реестр база таблица данных', icon: <Database size={S} />, run: (e, r, c) => (del(e, r).run(), c.insertCollection()) },
  { id: 'footnote', group: 'Дополнительно', title: 'Сноска', hint: 'Номер в тексте и примечание внизу', keywords: 'footnote note reference сноска примечание ссылка источник', shortcut: 'Ctrl+Alt+F', icon: <Footprints size={S} />, run: (e, r) => (del(e, r).run(), insertFootnote(e)) },
  { id: 'math', group: 'Дополнительно', title: 'Формула', keywords: 'math formula latex katex формула уравнение', icon: <Sigma size={S} />, run: (e, r) => del(e, r).insertContent({ type: 'blockMath', attrs: { latex: 'E = mc^2' } }).run() },
  { id: 'mermaid', group: 'Дополнительно', title: 'Схема (Mermaid)', keywords: 'diagram mermaid flowchart схема диаграмма процесс', icon: <Workflow size={S} />, run: (e, r) => del(e, r).insertContent({ type: 'mermaid', content: [{ type: 'text', text: 'flowchart LR\n  A[Начало] --> B{Условие}\n  B -- да --> C[Действие]\n  B -- нет --> D[Конец]' }] }).run() },
  { id: 'emoji', group: 'Дополнительно', title: 'Эмодзи', keywords: 'emoji smile эмодзи смайлик', shortcut: ':', icon: <Smile size={S} />, run: (e, r) => del(e, r).insertContent(':').run() },
];

function insertColumns(editor: Editor, range: Range, n: number) {
  const col = () => ({ type: 'column', content: [{ type: 'paragraph' }] });
  editor.chain().focus().deleteRange(range).insertContent({ type: 'columns', content: Array.from({ length: n }, col) }).run();
}

/** Ranks commands by query: title prefix > word prefix > keyword substring. Supports wrong keyboard layout. */
export function filterCommands(list: SlashCommand[], query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const variants = [q, switchLayout(q)];
  const score = (c: SlashCommand) => {
    const t = c.title.toLowerCase();
    let best = 0;
    for (const v of variants) {
      if (t.startsWith(v)) best = Math.max(best, 100);
      else if (t.split(/\s+/).some((w) => w.startsWith(v))) best = Math.max(best, 80);
      else if (c.keywords.split(/\s+/).some((w) => w.startsWith(v))) best = Math.max(best, 60);
      else if (c.keywords.includes(v) || t.includes(v)) best = Math.max(best, 30);
    }
    return best;
  };
  return list
    .map((c) => [c, score(c)] as const)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);
}

const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU = 'йцукенгшщзхъфывапролджэячсмитьбюё';
export function switchLayout(s: string) {
  return [...s]
    .map((ch) => {
      const i = EN.indexOf(ch);
      if (i >= 0) return RU[i];
      const j = RU.indexOf(ch);
      return j >= 0 ? EN[j] : ch;
    })
    .join('');
}
