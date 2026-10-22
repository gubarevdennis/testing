import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import { ReactRenderer } from '@tiptap/react';
import { computePosition, flip, shift, offset, autoUpdate } from '@floating-ui/dom';
import { FileText, Plus, User } from 'lucide-react';
import { createElement, createRef } from 'react';
import { SuggestionList, type SuggestionItem, type SuggestionListHandle } from '../menus/SuggestionList';
import { SLASH_COMMANDS, filterCommands, type CommandContext } from '../commands';
import { get } from '../../api/client';
import { searchEmoji } from '../../lib/emoji';

type Item = SuggestionItem & { run(editor: Editor, range: Range): void };

/** Renders a suggestion popup next to the caret with floating-ui (flips at viewport edges, works on mobile). */
function popupRenderer(label: string, empty?: string, hideEmpty = false) {
  return () => {
    let renderer: ReactRenderer<SuggestionListHandle, any> | null = null;
    let el: HTMLDivElement | null = null;
    let cleanup: (() => void) | null = null;
    const listRef = createRef<SuggestionListHandle>();
    const place = (clientRect: (() => DOMRect | null) | null | undefined) => {
      if (!el || !clientRect) return;
      const virtual = { getBoundingClientRect: () => clientRect() ?? new DOMRect() };
      cleanup?.();
      cleanup = autoUpdate(virtual as any, el, () => {
        computePosition(virtual as any, el!, { placement: 'bottom-start', strategy: 'fixed', middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })] }).then(({ x, y }) => {
          if (el) Object.assign(el.style, { left: `${x}px`, top: `${y}px` });
        });
      });
    };
    const props = (p: any) => ({ ref: listRef, items: p.items, label, empty, loading: p.loading, onSelect: (it: Item) => p.command(it) });
    return {
      onStart: (p: any) => {
        el = document.createElement('div');
        el.className = 'suggestion-popup';
        el.style.position = 'fixed';
        el.style.zIndex = 'var(--z-popover)';
        document.body.append(el);
        renderer = new ReactRenderer(SuggestionList as any, { props: props(p), editor: p.editor });
        el.append(renderer.element);
        el.style.display = hideEmpty && !p.items.length ? 'none' : '';
        place(p.clientRect);
      },
      onUpdate: (p: any) => {
        renderer?.updateProps(props(p));
        if (el) el.style.display = hideEmpty && !p.items.length ? 'none' : '';
        place(p.clientRect);
      },
      onKeyDown: (p: any) => {
        if (el?.style.display === 'none') return false;
        if (p.event.key === 'Escape') {
          cleanup?.();
          el?.remove();
          return true;
        }
        return listRef.current?.onKeyDown(p.event) ?? false;
      },
      onExit: () => {
        cleanup?.();
        renderer?.destroy();
        el?.remove();
        el = null;
      },
    };
  };
}

function suggestionExt(name: string, opts: Omit<SuggestionOptions<Item>, 'editor'>) {
  return Extension.create({
    name,
    addProseMirrorPlugins() {
      return [Suggestion<Item>({ editor: this.editor, ...opts })];
    },
  });
}

export function slashExtension(ctx: () => CommandContext) {
  return suggestionExt('slashMenu', {
    char: '/',
    pluginKey: new PluginKey('slashMenu'),
    allowSpaces: false,
    startOfLine: false,
    allow: ({ state, range }) => {
      const $from = state.doc.resolve(range.from);
      if ($from.parent.type.spec.code) return false;
      const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset);
      return !before || /\s/.test(before); // not inside URLs or paths like "a/b"
    },
    items: ({ query }) =>
      filterCommands(SLASH_COMMANDS, query)
        .slice(0, 40)
        .map((c) => ({ id: c.id, title: c.title, hint: c.hint, group: query ? undefined : c.group, icon: c.icon, shortcut: c.shortcut, run: (e: Editor, r: Range) => c.run(e, r, ctx()) })),
    command: ({ editor, range, props }) => props.run(editor, range),
    render: popupRenderer('Вставить блок', 'Нет подходящих блоков'),
  });
}

/** "@" — mention a colleague (notifies them) or link a page. */
export function mentionExtension() {
  return suggestionExt('mentionMenu', {
    char: '@',
    pluginKey: new PluginKey('mentionMenu'),
    allowSpaces: true,
    items: async ({ query }) => {
      const q = query.trim();
      const [dir, pages] = await Promise.all([
        get<{ users: any[] }>(`/api/v1/directory?q=${encodeURIComponent(q)}&limit=6`).catch(() => ({ users: [] })),
        q ? get<{ suggestions: any[] }>(`/api/v1/search/suggest?q=${encodeURIComponent(q)}`).catch(() => ({ suggestions: [] })) : Promise.resolve({ suggestions: [] }),
      ]);
      return [
        ...dir.users.map((u) => ({ id: 'u' + u.id, title: u.name, hint: u.title || u.email, group: 'Сотрудники', icon: createElement(User, { size: 15 }), run: (e: Editor, r: Range) => e.chain().focus().deleteRange(r).insertContent([{ type: 'mention', attrs: { id: u.id, label: u.name } }, { type: 'text', text: ' ' }]).run() })),
        ...pages.suggestions.slice(0, 6).map((p) => ({ id: 'p' + p.pageId, title: p.title || 'Без названия', group: 'Страницы', icon: p.icon ?? createElement(FileText, { size: 15 }), run: (e: Editor, r: Range) => e.chain().focus().deleteRange(r).insertContent([{ type: 'pageMention', attrs: { pageId: p.pageId, title: p.title } }, { type: 'text', text: ' ' }]).run() })),
      ];
    },
    command: ({ editor, range, props }) => props.run(editor, range),
    render: popupRenderer('Упомянуть', 'Никого не найдено'),
  });
}

/** "[[" — link to a page, or create a new child page with the typed title. */
export function pageLinkExtension(createChild: (title: string) => Promise<{ id: string; title: string } | null>) {
  return suggestionExt('pageLinkMenu', {
    char: '[[',
    pluginKey: new PluginKey('pageLinkMenu'),
    allowSpaces: true,
    items: async ({ query }) => {
      const q = query.replace(/\]+$/, '').trim();
      const r = q ? await get<{ suggestions: any[] }>(`/api/v1/search/suggest?q=${encodeURIComponent(q)}`).catch(() => ({ suggestions: [] })) : await get<{ pages: any[] }>('/api/v1/me/recent').then((x) => ({ suggestions: x.pages.slice(0, 8).map((p) => ({ pageId: p.id, title: p.title, icon: p.icon })) })).catch(() => ({ suggestions: [] }));
      const items: Item[] = r.suggestions.slice(0, 8).map((p) => ({
        id: p.pageId,
        title: p.title || 'Без названия',
        icon: p.icon ?? createElement(FileText, { size: 15 }),
        run: (e: Editor, rg: Range) => e.chain().focus().deleteRange(rg).insertContent([{ type: 'pageMention', attrs: { pageId: p.pageId, title: p.title } }, { type: 'text', text: ' ' }]).run(),
      }));
      if (q)
        items.push({
          id: 'new',
          title: `Создать вложенную страницу «${q}»`,
          icon: createElement(Plus, { size: 15 }),
          run: async (e: Editor, rg: Range) => {
            e.chain().focus().deleteRange(rg).run();
            const p = await createChild(q);
            if (p) e.chain().focus().insertContent([{ type: 'pageMention', attrs: { pageId: p.id, title: p.title } }, { type: 'text', text: ' ' }]).run();
          },
        });
      return items;
    },
    command: ({ editor, range, props }) => props.run(editor, range),
    render: popupRenderer('Ссылка на страницу', 'Страницы не найдены'),
  });
}

/** ":smile" — emoji picker inline. */
export function emojiExtension() {
  return suggestionExt('emojiMenu', {
    char: ':',
    pluginKey: new PluginKey('emojiMenu'),
    allow: ({ state, range }) => {
      const $from = state.doc.resolve(range.from);
      const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset);
      return !$from.parent.type.spec.code && (!before || /\s/.test(before));
    },
    items: ({ query }) =>
      query.length < 1
        ? []
        : searchEmoji(query)
            .slice(0, 8)
            .map((e) => ({ id: e.e, title: e.k.split(' ')[0], icon: e.e, run: (ed: Editor, r: Range) => ed.chain().focus().deleteRange(r).insertContent(e.e).run() })),
    command: ({ editor, range, props }) => props.run(editor, range),
    render: popupRenderer('Эмодзи', undefined, true),
  });
}
