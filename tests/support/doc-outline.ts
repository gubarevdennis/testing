/**
 * Structure of an editor document as comparable lines (clipboard fidelity tests, UX13-02 "сравнение структуры"):
 * headings with level, list items with their nesting path, tables as cell texts, quotes, code, images with caption,
 * links with target. Formatting details (bold, colours) are checked separately.
 */
type N = { type: string; attrs?: Record<string, any>; content?: N[]; text?: string; marks?: Array<{ type: string; attrs?: Record<string, any> }> };

const text = (n: N): string => (n.text ?? '') + (n.content ?? []).map(text).join(n.type === 'tableRow' ? '|' : '');
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

export function outline(doc: N): string[] {
  const out: string[] = [];
  const links = (n: N) => {
    if (n.text && n.marks) for (const m of n.marks) if (m.type === 'link') out.push(`link ${norm(n.text)} -> ${m.attrs?.href}`);
    (n.content ?? []).forEach(links);
  };
  const block = (n: N, path: string) => {
    switch (n.type) {
      case 'heading':
        out.push(`${path}h${n.attrs?.level} ${norm(text(n))}`);
        return;
      case 'paragraph':
        if (norm(text(n))) out.push(`${path}p ${norm(text(n))}`);
        return;
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        for (const li of n.content ?? []) {
          const [first, ...rest] = li.content ?? [];
          const tag = n.type === 'orderedList' ? 'ol' : 'ul';
          out.push(`${path}${tag}>li ${first ? norm(text(first)) : ''}`);
          rest.forEach((c) => block(c, `${path}${tag}>li>`));
        }
        return;
      case 'table':
        out.push(`${path}table ` + (n.content ?? []).map((r) => '[' + (r.content ?? []).map((c) => norm(text(c))).join('|') + ']').join(''));
        return;
      case 'blockquote':
        (n.content ?? []).forEach((c) => block(c, path + 'quote>'));
        return;
      case 'codeBlock':
        out.push(`${path}code ${norm(text(n))}`);
        return;
      case 'image':
        out.push(`${path}img${n.attrs?.caption ? ' caption=' + norm(n.attrs.caption) : ''}${n.attrs?.alt ? ' alt=' + norm(n.attrs.alt) : ''}`);
        return;
      default:
        (n.content ?? []).forEach((c) => block(c, path + n.type + '>'));
    }
  };
  (doc.content ?? []).forEach((c) => block(c, ''));
  links(doc);
  return out;
}
