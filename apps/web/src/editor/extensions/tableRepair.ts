import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { fixTables, fixTablesKey, TableMap } from '@tiptap/pm/tables';
import { ySyncPluginKey } from '@tiptap/y-tiptap';
import type { CollabProvider } from '@kb/shared';

/**
 * Deterministic repair of tables after concurrent structural edits (OPS-007).
 *
 * Found by tests/e2e/editor-p0-table.spec.ts: a row added by one person and a column added by another at the same time
 * merge (CRDT) into a ragged table — the new row lacks the new column's cell. prosemirror-tables repairs it in every
 * editor (fixTables in appendTransaction), but a repair appended to a *remote* change is never written to Yjs, so the
 * stored table stayed ragged while each browser showed its own private repair; and if every editor wrote its repair,
 * the cells would be added twice.
 *
 * Now: repairs appended to remote changes are suppressed (the editor shows exactly the shared state), and one elected
 * editor — the lowest Yjs client id among editors present on the page — writes the repair as a normal change that
 * everyone receives. Without other editors present, the local editor repairs.
 */
interface RepairState {
  remote: boolean;
}

const key = new PluginKey<RepairState>('kbTableRepair');
const AWARENESS_FIELD = 'kbCanEdit';

function hasBrokenTable(state: EditorState): boolean {
  let broken = false;
  state.doc.descendants((node) => {
    if (broken) return false;
    if (node.type.spec.tableRole === 'table') {
      if (TableMap.get(node).problems?.length) broken = true;
      return false;
    }
    return true;
  });
  return broken;
}

export const TableRepair = Extension.create<{ provider: CollabProvider | null }>({
  name: 'kbTableRepair',
  addOptions() {
    return { provider: null };
  },
  addProseMirrorPlugins() {
    const provider = this.options.provider;
    const editor = this.editor;
    const elected = () => {
      if (!provider) return true;
      const me = provider.doc.clientID;
      const ids = [me];
      provider.awareness.getStates().forEach((s, id) => {
        if (id !== me && (s as Record<string, unknown> | null)?.[AWARENESS_FIELD]) ids.push(id);
      });
      return Math.min(...ids) === me;
    };
    let timer: ReturnType<typeof setTimeout> | null = null;
    return [
      new Plugin<RepairState>({
        key,
        state: {
          init: () => ({ remote: false }),
          apply: (tr, prev) => (tr.docChanged ? { remote: !!tr.getMeta(ySyncPluginKey)?.isChangeOrigin } : prev),
        },
        // a table repair appended to a remote change would exist only in this browser: drop it
        filterTransaction: (tr, state) => !(tr.getMeta(fixTablesKey) && !tr.getMeta(key) && key.getState(state)?.remote),
        view(view) {
          const announce = () => provider?.awareness.setLocalStateField(AWARENESS_FIELD, editor.isEditable);
          announce();
          return {
            update(v) {
              if ((provider?.awareness.getLocalState() as Record<string, unknown> | null)?.[AWARENESS_FIELD] !== editor.isEditable) announce();
              if (!key.getState(v.state)?.remote || !editor.isEditable || !hasBrokenTable(v.state)) return;
              if (timer) clearTimeout(timer);
              // short delay: let presence of the other editors arrive after a reconnect before electing
              timer = setTimeout(() => {
                timer = null;
                if (view.isDestroyed || !editor.isEditable || !hasBrokenTable(view.state) || !elected()) return;
                const tr = fixTables(view.state);
                if (tr) view.dispatch(tr.setMeta(key, true).setMeta('addToHistory', false));
              }, 300);
            },
            destroy() {
              if (timer) clearTimeout(timer);
            },
          };
        },
      }),
    ];
  },
});
