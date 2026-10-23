/**
 * Footnote helpers on plain document JSON (no schema / DOM): building a note's content from arbitrary converted content
 * and the schema migration 1 → 2 that turns the legacy «Сноски» representation into real footnotes (D-36).
 */
import type { PMNode, PMMark } from './json.js';
import { inlineText } from './json.js';

const TEXTBLOCK = new Set(['paragraph', 'heading', 'codeBlock', 'detailsSummary', 'mermaid']);

function inlineToNote(n: PMNode, out: PMNode[]) {
  switch (n.type) {
    case 'text':
      if (n.text) {
        const marks = (n.marks ?? []).filter((m) => m.type !== 'comment');
        out.push(marks.length ? { type: 'text', text: n.text, marks } : { type: 'text', text: n.text });
      }
      return;
    case 'hardBreak':
      out.push({ type: 'hardBreak' });
      return;
    case 'pageMention': {
      const href = `/p/${n.attrs?.pageId ?? ''}${n.attrs?.blockId ? '#' + n.attrs.blockId : ''}`;
      out.push({ type: 'text', text: n.attrs?.title || 'Страница', marks: [{ type: 'link', attrs: { href } }] });
      return;
    }
    case 'inlineMath':
      if (n.attrs?.latex) out.push({ type: 'text', text: n.attrs.latex, marks: [{ type: 'code' }] });
      return;
    case 'footnote': // a note inside a note is flattened into the text
      (n.content ?? []).forEach((c) => inlineToNote(c, out));
      return;
    default: {
      const t = inlineText(n);
      if (t) out.push({ type: 'text', text: t });
    }
  }
}

/**
 * Content of a footnote node — `(text | hardBreak)*` — from converted content: inline nodes are kept (mentions, formulas,
 * pictures become text), blocks are joined with line breaks. Marks are kept except comment anchors. Nothing textual is lost.
 */
export function toFootnoteContent(nodes: PMNode[]): PMNode[] {
  const out: PMNode[] = [];
  const block = (b: PMNode) => {
    if (b.type === 'text' || !(b.content || TEXTBLOCK.has(b.type))) return inlineToNote(b, out);
    if (TEXTBLOCK.has(b.type)) {
      if (out.length) out.push({ type: 'hardBreak' });
      (b.content ?? []).forEach((c) => inlineToNote(c, out));
      return;
    }
    if (b.type === 'image' || b.type === 'fileBlock') {
      const t = b.attrs?.alt || b.attrs?.caption || b.attrs?.name;
      if (t) {
        if (out.length) out.push({ type: 'hardBreak' });
        out.push({ type: 'text', text: String(t) });
      }
      return;
    }
    (b.content ?? []).forEach(block);
  };
  nodes.forEach(block);
  // merge adjacent texts with equal marks, trim breaks at the edges
  const merged: PMNode[] = [];
  const sameMarks = (a?: PMMark[], b?: PMMark[]) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  for (const n of out) {
    const prev = merged[merged.length - 1];
    if (prev && prev.type === 'text' && n.type === 'text' && sameMarks(prev.marks, n.marks)) prev.text = (prev.text ?? '') + n.text;
    else merged.push({ ...n });
  }
  while (merged[0]?.type === 'hardBreak') merged.shift();
  while (merged[merged.length - 1]?.type === 'hardBreak') merged.pop();
  if (merged[0]?.type === 'text') merged[0].text = merged[0].text!.replace(/^\s+/, '');
  const last = merged[merged.length - 1];
  if (last?.type === 'text') last.text = last.text!.replace(/\s+$/, '');
  return merged.filter((n) => n.type !== 'text' || n.text);
}

const SECTION_TITLES = new Set(['сноски', 'концевые сноски', 'примечания', 'footnotes', 'notes']);
const MARKER = /\[(\d{1,4})\]/g;
const ONLY_MARKERS = /^(?:\s*\[\d{1,4}\]\s*)+$/;

const textOf = (n: PMNode) => inlineText(n).trim();
const isSup = (n: PMNode) => n.type === 'text' && !!n.marks?.some((m) => m.type === 'superscript');

/**
 * Migration 1 → 2: documents imported before footnotes existed carry them as superscript «[n]» in the text plus a level-3
 * heading «Сноски» followed by a numbered list at the very end (DOCX and Markdown importers of version 1). When — and only
 * when — that structure is unambiguous (exactly one such section, numbered from 1, every number referenced, no other
 * superscript markers, nothing but other appendix blocks after it), the references become footnote nodes carrying the
 * text of their note and the section is removed. Anything else is left untouched: no guessing on user-written content.
 */
export function migrateLegacyFootnotes(doc: PMNode): PMNode {
  const blocks = doc.content ?? [];
  const sections = blocks
    .map((b, i) => ({ b, i }))
    .filter(({ b, i }) => b.type === 'heading' && SECTION_TITLES.has(textOf(b).toLowerCase()) && blocks[i + 1]?.type === 'orderedList');
  if (sections.length !== 1) return doc;
  const { i: hIdx } = sections[0];
  const list = blocks[hIdx + 1];
  if ((list.attrs?.start ?? 1) !== 1) return doc;
  // only appendix-like blocks (the collapsed header/footer block of a DOCX import, empty paragraphs) may follow
  if (blocks.slice(hIdx + 2).some((b) => !(b.type === 'details' || (b.type === 'paragraph' && !textOf(b))))) return doc;
  const notes = (list.content ?? []).map((item) => toFootnoteContent(item.content ?? []));
  if (!notes.length) return doc;
  // collect superscript markers in the body
  const used = new Set<number>();
  let foreign = false;
  const scan = (n: PMNode) => {
    if (isSup(n)) {
      if (ONLY_MARKERS.test(n.text ?? '')) for (const m of (n.text ?? '').matchAll(MARKER)) used.add(Number(m[1]));
      else if (/\[\d+\]/.test(n.text ?? '')) foreign = true;
    }
    n.content?.forEach(scan);
  };
  blocks.slice(0, hIdx).forEach(scan);
  if (foreign || used.size !== notes.length || [...used].some((k) => k < 1 || k > notes.length)) return doc;
  const replaceInline = (nodes: PMNode[]): PMNode[] => {
    const out: PMNode[] = [];
    for (const n of nodes) {
      if (isSup(n) && ONLY_MARKERS.test(n.text ?? '')) {
        for (const m of (n.text ?? '').matchAll(MARKER)) {
          const content = structuredClone(notes[Number(m[1]) - 1]);
          out.push(content.length ? { type: 'footnote', content } : { type: 'footnote' });
        }
        continue;
      }
      out.push(n.content ? { ...n, content: replaceInline(n.content) } : n);
    }
    return out;
  };
  const body = replaceInline(blocks.slice(0, hIdx));
  const rest = blocks.slice(hIdx + 2);
  return { ...doc, content: [...body, ...rest].length ? [...body, ...rest] : [{ type: 'paragraph' }] };
}
