import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

interface FindState {
  query: string;
  matches: Array<{ from: number; to: number }>;
  index: number;
  deco: DecorationSet;
}

export const findKey = new PluginKey<FindState>('kbFind');

function search(doc: PMNode, query: string) {
  const out: Array<{ from: number; to: number }> = [];
  if (!query) return out;
  const q = query.toLocaleLowerCase('ru');
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    // concatenate text of the block keeping a position map (inline atoms count as one char)
    let text = '';
    const map: number[] = [];
    node.forEach((child, offset) => {
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) map.push(pos + 1 + offset + i);
        text += child.text;
      } else {
        map.push(pos + 1 + offset);
        text += '￼';
      }
    });
    const low = text.toLocaleLowerCase('ru');
    let i = low.indexOf(q);
    while (i >= 0 && out.length < 5000) {
      out.push({ from: map[i], to: map[i + q.length - 1] + 1 });
      i = low.indexOf(q, i + q.length);
    }
    return false;
  });
  return out;
}

function decorations(doc: PMNode, matches: Array<{ from: number; to: number }>, index: number) {
  return DecorationSet.create(
    doc,
    matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === index ? 'kb-find-match current' : 'kb-find-match' })),
  );
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    findInPage: {
      setFindQuery: (q: string) => ReturnType;
      findStep: (dir: 1 | -1) => ReturnType;
    };
  }
}

/** Find in page (Ctrl/Cmd+F): highlights all matches, Enter/Shift+Enter cycles through them. */
export const FindInPage = Extension.create({
  name: 'findInPage',
  addCommands() {
    return {
      setFindQuery:
        (q) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(findKey, { query: q });
          return true;
        },
      findStep:
        (dir) =>
        ({ state, tr, dispatch, view }) => {
          const st = findKey.getState(state);
          if (!st || !st.matches.length) return false;
          const index = (st.index + dir + st.matches.length) % st.matches.length;
          if (dispatch) {
            const m = st.matches[index];
            tr.setMeta(findKey, { index });
            tr.setSelection(TextSelection.create(tr.doc, m.from, m.to));
            setTimeout(() => view.domAtPos(m.from).node.parentElement?.scrollIntoView({ block: 'center' }), 0);
          }
          return true;
        },
    };
  },
  addKeyboardShortcuts() {
    return {
      'Mod-f': () => {
        window.dispatchEvent(new CustomEvent('kb:find-open'));
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: (): FindState => ({ query: '', matches: [], index: 0, deco: DecorationSet.empty }),
          apply(tr, prev): FindState {
            const meta = tr.getMeta(findKey) as { query?: string; index?: number } | undefined;
            if (!meta && !tr.docChanged) return prev;
            const query = meta?.query ?? prev.query;
            const matches = meta?.query !== undefined || tr.docChanged ? search(tr.doc, query) : prev.matches;
            const index = meta?.index ?? (meta?.query !== undefined ? 0 : Math.min(prev.index, Math.max(0, matches.length - 1)));
            return { query, matches, index, deco: decorations(tr.doc, matches, index) };
          },
        },
        props: {
          decorations(state) {
            return findKey.getState(state)?.deco;
          },
        },
      }),
    ];
  },
});
