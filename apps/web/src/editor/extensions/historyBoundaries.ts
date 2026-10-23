import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";
import { ySyncPluginKey, yUndoPluginKey } from "@tiptap/y-tiptap";

/**
 * Undo steps follow user operations (R-HISTORY-017, SPEC «Группировать непрерывный набор текста, но не склеивать
 * несвязанные действия»). The Yjs undo manager merges every change made within 500 ms into one step, so formatting
 * right after typing, a block move, an image resize, a table operation or a block conversion were undone together with
 * the typing around them. Text entry (typing, deleting, Enter / Backspace between paragraphs) keeps merging; every
 * other local change — marks, attributes (image / column size, alignment), node types, block structure, tables — is
 * its own step: the capture is stopped right before the change reaches Yjs and right after it.
 */
const isMac = () =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const key = new PluginKey<{ structural: boolean }>("kbHistoryBoundaries");

/** Text entry: replace steps that stay inside text blocks and insert only text / inline nodes / plain paragraphs. */
export function isTextEntry(tr: Transaction): boolean {
  return tr.steps.every((step, i) => {
    if (!(step instanceof ReplaceStep)) return false;
    const { from, to, slice } = step as unknown as {
      from: number;
      to: number;
      slice: import("@tiptap/pm/model").Slice;
    };
    let plain = true;
    slice.content.forEach((n) => {
      if (!(n.isInline || (n.type.name === "paragraph" && slice.openStart > 0)))
        plain = false;
    });
    if (!plain) return false;
    const doc = tr.docs[i];
    return (
      doc.resolve(from).parent.isTextblock && doc.resolve(to).parent.isTextblock
    );
  });
}

export const HistoryBoundaries = Extension.create({
  name: "kbHistoryBoundaries",
  // before Collaboration (1000): this plugin's view update runs before the binding writes the change into Yjs
  priority: 1001,
  addProseMirrorPlugins() {
    const editor = this.editor;
    let after = false;
    return [
      new Plugin<{ structural: boolean }>({
        key,
        state: {
          init: () => ({ structural: false }),
          apply(tr, v) {
            // follow-up transactions of plugins (block ids after Enter, table repair) belong to the change they follow
            if (tr.getMeta("appendedTransaction")) return v;
            if (!tr.docChanged) return { structural: false };
            if (
              tr.getMeta(ySyncPluginKey)?.isChangeOrigin ||
              tr.getMeta("addToHistory") === false
            )
              return { structural: false };
            return { structural: !isTextEntry(tr) };
          },
        },
        view: (view) => {
          // Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y pressed while a control inside a block (image toolbar button…) has the
          // focus: the editor's undo, never the browser's own undo of the editable DOM (it removed whole blocks)
          const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            if (
              !t ||
              t === view.dom ||
              t.isContentEditable ||
              /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)
            )
              return;
            const mod = isMac() ? e.metaKey : e.ctrlKey;
            const k = e.key.toLowerCase();
            const undo = mod && !e.shiftKey && (k === "z" || k === "я");
            const redo =
              (mod && e.shiftKey && (k === "z" || k === "я")) ||
              (!isMac() && e.ctrlKey && (k === "y" || k === "н"));
            if (!undo && !redo) return;
            e.preventDefault();
            e.stopPropagation();
            view.focus();
            editor.commands[undo ? "undo" : "redo"]();
          };
          view.dom.addEventListener("keydown", onKey, true);
          return {
            destroy: () => view.dom.removeEventListener("keydown", onKey, true),
            update(view, prev) {
              if (view.state.doc === prev.doc) return;
              const um = yUndoPluginKey.getState(view.state)?.undoManager;
              if (!um) return;
              const structural = key.getState(view.state)?.structural;
              // the change after a structural one starts a new step; a structural one never joins the previous step
              if (after || structural) um.stopCapturing();
              after = !!structural;
            },
          };
        },
      }),
    ];
  },
});
