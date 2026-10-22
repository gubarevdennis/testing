/**
 * The Markdown converter (remark + YAML) is large and only needed for paste/copy/export helpers,
 * so it is loaded on demand and kept out of the editor's critical path.
 */
type MarkdownModule = typeof import('@kb/shared/markdown');

let mod: MarkdownModule | null = null;
let loading: Promise<MarkdownModule> | null = null;

export function loadMarkdown(): Promise<MarkdownModule> {
  loading ??= import('@kb/shared/markdown').then((m) => (mod = m));
  return loading;
}

/** Synchronous access for event handlers that cannot wait (paste); null until loaded. */
export function markdownNow(): MarkdownModule | null {
  return mod;
}
