import { describe, it, expect } from 'vitest';
import { migrateContent, sanitizeDocUrls, findUnsafeUrls, safeImageSrc, isDangerousUrl, SchemaVersionError, CONTENT_SCHEMA_VERSION, getKbSchema, type PMNode, type SchemaMigration } from '@kb/shared';

const p = (text: string, marks?: PMNode['marks']): PMNode => ({ type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] });

describe('document schema versions (R-EDITOR-023, R-EDITOR-043)', () => {
  it('R-EDITOR-023: current documents pass unchanged; older ones are migrated step by step', () => {
    const doc: PMNode = { type: 'doc', content: [p('текст')] };
    expect(migrateContent(doc, CONTENT_SCHEMA_VERSION)).toEqual({ doc, version: CONTENT_SCHEMA_VERSION, applied: [] });
    // Hypothetical future schema: v1 → v2 renames "lead" paragraphs, v2 → v3 adds a default attribute.
    const migrations: SchemaMigration[] = [
      { from: 2, to: 3, description: 'callout icon', migrate: (d) => ({ ...d, content: d.content!.map((n) => (n.type === 'callout' ? { ...n, attrs: { ...n.attrs, icon: n.attrs?.icon ?? null } } : n)) }) },
      { from: 1, to: 2, description: 'lead → paragraph variant', migrate: (d) => ({ ...d, content: d.content!.map((n) => (n.type === 'lead' ? { ...n, type: 'paragraph', attrs: { variant: 'lead' } } : n)) }) },
    ];
    const old: PMNode = { type: 'doc', content: [{ type: 'lead', content: [{ type: 'text', text: 'Вводный' }] }, { type: 'callout', attrs: { variant: 'info' }, content: [p('x')] }] };
    const r = migrateContent(old, 1, { to: 3, migrations });
    expect(r.version).toBe(3);
    expect(r.applied).toEqual(['lead → paragraph variant', 'callout icon']);
    expect(r.doc.content![0]).toMatchObject({ type: 'paragraph', attrs: { variant: 'lead' } });
    expect(r.doc.content![1].attrs).toEqual({ variant: 'info', icon: null });
    expect(old.content![0].type).toBe('lead'); // input not mutated
  });

  it('R-EDITOR-023: refuses newer schemas and gaps in the migration chain', () => {
    const doc: PMNode = { type: 'doc', content: [p('x')] };
    expect(() => migrateContent(doc, CONTENT_SCHEMA_VERSION + 1)).toThrow(SchemaVersionError);
    expect(() => migrateContent(doc, 1, { to: 3, migrations: [{ from: 1, to: 2, description: 'a', migrate: (d) => d }] })).toThrow(/2 → 3/);
    expect(() => migrateContent(doc, 0)).toThrow(/Некорректная/);
  });

  it('R-EDITOR-043: dangerous URLs are detected; unusable ones are cleaned without losing text', () => {
    const doc: PMNode = {
      type: 'doc',
      content: [
        p('плохая', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]),
        p('хорошая', [{ type: 'link', attrs: { href: 'https://example.com/x' } }, { type: 'bold' }]),
        { type: 'image', attrs: { src: 'file:///C:/tmp/clip.png', attachmentId: null, alt: 'a' } },
        { type: 'image', attrs: { src: 'blob:https://kb/1', attachmentId: 'att-1', alt: 'b' } },
        { type: 'image', attrs: { src: 'data:text/html;base64,PHNjcmlwdD4=', attachmentId: null, alt: 'c' } },
        { type: 'embed', attrs: { url: 'vbscript:x', kind: 'link' } },
      ],
    };
    expect(findUnsafeUrls(doc).map((u) => `${u.node}.${u.attr}`)).toEqual(['link.href', 'image.src', 'embed.url']);
    const { doc: clean, changed } = sanitizeDocUrls(doc);
    expect(changed).toBe(5);
    expect(findUnsafeUrls(clean)).toEqual([]);
    expect(clean.content![0].content![0]).toEqual({ type: 'text', text: 'плохая' });
    expect(clean.content![1].content![0].marks).toHaveLength(2);
    expect(clean.content![2].attrs!.src).toBeNull();
    expect(clean.content![3].attrs!.src).toBe('/api/v1/attachments/att-1/content');
    expect(clean.content![4].attrs!.src).toBeNull();
    expect(clean.content![5].attrs!.url).toBeNull();
    getKbSchema().nodeFromJSON({ type: 'doc', content: clean.content!.slice(0, 2) }).check();
  });

  it('image sources: http(s), in-app, relative assets and raster data URIs only', () => {
    expect(safeImageSrc('/api/v1/attachments/1/content')).toBe('/api/v1/attachments/1/content');
    expect(safeImageSrc('images/plan.png')).toBe('images/plan.png');
    expect(safeImageSrc('https://e.com/a.png')).toBe('https://e.com/a.png');
    expect(safeImageSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    for (const bad of ['file:///c:/x.png', 'cid:image001.png@01D', 'javascript:alert(1)', '//evil.com/x.png', 'data:image/svg+xml;base64,PHN2Zz4=']) expect(safeImageSrc(bad)).toBeNull();
    expect(isDangerousUrl(' JaVaScRiPt:alert(1)')).toBe(true);
    expect(isDangerousUrl('data:image/png;base64,AAAA', 'image')).toBe(false);
    expect(isDangerousUrl('data:image/png;base64,AAAA', 'href')).toBe(true);
  });
});
