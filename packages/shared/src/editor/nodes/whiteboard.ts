import { Node, mergeAttributes } from '@tiptap/core';
import { normalizeScene, renderWhiteboard, svgToDomSpec, whiteboardText, type WhiteboardScene } from '../whiteboard.js';

/**
 * «Доска» — a whiteboard (sticky notes, shapes, connectors, freehand, images) stored as a scene in the `scene`
 * attribute (D-46). HTML carries the scene (`data-scene`, for copy/paste and re-import) and a rendered SVG, so HTML/PDF
 * exports, the clipboard and any HTML consumer show the board without the editor.
 */
export const Whiteboard = Node.create({
  name: 'whiteboard',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      scene: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-scene');
          return raw ? normalizeScene(raw) : null;
        },
        renderHTML: (a: Record<string, any>) => (a.scene ? { 'data-scene': JSON.stringify(stripExportFields(a.scene)) } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'figure[data-type="whiteboard"]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const scene = node.attrs.scene as WhiteboardScene | null;
    const text = whiteboardText(scene);
    const r = renderWhiteboard(scene, { idPrefix: node.attrs.id ?? '', title: text ? `Доска: ${text.slice(0, 500)}` : 'Доска' });
    const attrs = mergeAttributes(HTMLAttributes, { 'data-type': 'whiteboard', class: 'kb-whiteboard' });
    if (!r) return ['figure', attrs, ['figcaption', {}, 'Доска (пустая)']];
    return ['figure', attrs, svgToDomSpec(r.tree)];
  },
});

/** The scene without export-time fields (inlined image data). */
function stripExportFields(scene: WhiteboardScene): WhiteboardScene {
  if (!scene.files) return scene;
  const files: WhiteboardScene['files'] = {};
  for (const [k, f] of Object.entries(scene.files)) files[k] = { attachmentId: f.attachmentId, ...(f.mimeType ? { mimeType: f.mimeType } : {}) };
  return { ...scene, files };
}
