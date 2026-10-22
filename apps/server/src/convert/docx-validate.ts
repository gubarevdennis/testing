/**
 * Structural Open XML (ECMA-376 / ISO 29500) validation of a WordprocessingML package (R-EXPORT-006, R-EXPORT-022).
 *
 * Microsoft Word refuses or "repairs" files that break package or schema rules LibreOffice tolerates, so every DOCX
 * we produce is checked against the rules Word enforces before it is handed out:
 *  - package: [Content_Types].xml covers every part, every internal relationship target exists, r:id/r:embed
 *    references resolve, all XML parts are well-formed;
 *  - schema order: w:pPr first in w:p, w:rPr first in w:r, w:tblPr → w:tblGrid → w:tr in w:tbl, w:tcPr first and
 *    a w:p last in every w:tc, w:sectPr last in w:body;
 *  - identifiers: unique wp:docPr ids, numbering instances and styles that are referenced exist, bookmarks paired.
 * Errors are returned (not thrown) so callers can decide; the exporter fails closed on any error.
 */
import yauzl from 'yauzl';

export interface XmlEl {
  name: string;
  attrs: Record<string, string>;
  children: XmlEl[];
}

/** Minimal non-validating XML parser that rejects malformed input (unbalanced tags, bad attributes, bad entities). */
export function parseXml(xml: string): XmlEl {
  let i = 0;
  const root: XmlEl = { name: '#root', attrs: {}, children: [] };
  const stack: XmlEl[] = [root];
  const fail = (m: string) => {
    throw new Error(`${m} at offset ${i}`);
  };
  const checkText = (t: string) => {
    const bad = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.exec(t);
    if (bad) fail('invalid entity reference');
    if (t.includes('<')) fail('unescaped "<"');
  };
  if (xml.charCodeAt(0) === 0xfeff) i = 1;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) {
      checkText(xml.slice(i));
      break;
    }
    checkText(xml.slice(i, lt));
    i = lt;
    if (xml.startsWith('<?', i)) {
      const e = xml.indexOf('?>', i);
      if (e < 0) fail('unterminated processing instruction');
      i = e + 2;
    } else if (xml.startsWith('<!--', i)) {
      const e = xml.indexOf('-->', i);
      if (e < 0) fail('unterminated comment');
      i = e + 3;
    } else if (xml.startsWith('<![CDATA[', i)) {
      const e = xml.indexOf(']]>', i);
      if (e < 0) fail('unterminated CDATA');
      i = e + 3;
    } else if (xml.startsWith('<!', i)) {
      const e = xml.indexOf('>', i);
      if (e < 0) fail('unterminated declaration');
      i = e + 1;
    } else if (xml.startsWith('</', i)) {
      const e = xml.indexOf('>', i);
      if (e < 0) fail('unterminated end tag');
      const name = xml.slice(i + 2, e).trim();
      const top = stack.pop();
      if (!top || top.name !== name) fail(`mismatched end tag </${name}> (open: <${top?.name}>)`);
      i = e + 1;
    } else {
      const m = /^<([A-Za-z_][\w.:-]*)/.exec(xml.slice(i, i + 200));
      if (!m) fail('invalid start tag');
      const el: XmlEl = { name: m![1], attrs: {}, children: [] };
      i += m![0].length;
      for (;;) {
        while (/\s/.test(xml[i] ?? '')) i++;
        if (xml.startsWith('/>', i)) {
          i += 2;
          stack[stack.length - 1].children.push(el);
          break;
        }
        if (xml[i] === '>') {
          i++;
          stack[stack.length - 1].children.push(el);
          stack.push(el);
          break;
        }
        const a = /^([A-Za-z_][\w.:-]*)\s*=\s*("([^"<]*)"|'([^'<]*)')/.exec(xml.slice(i, i + 100_000));
        if (!a) fail(`malformed attribute in <${el.name}>`);
        if (a![1] in el.attrs) fail(`duplicate attribute ${a![1]} in <${el.name}>`);
        const v = a![3] ?? a![4] ?? '';
        checkText(v);
        el.attrs[a![1]] = v;
        i += a![0].length;
      }
    }
  }
  if (stack.length !== 1) fail(`unclosed element <${stack[stack.length - 1].name}>`);
  const docEls = root.children;
  if (docEls.length !== 1) fail('document must have exactly one root element');
  return docEls[0];
}

async function unzipAll(buf: Buffer): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    const out = new Map<string, Buffer>();
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(new Error('not a ZIP package'));
      zip.on('entry', (e: yauzl.Entry) => {
        if (/\/$/.test(e.fileName)) return zip.readEntry();
        zip.openReadStream(e, (e2, rs) => {
          if (e2 || !rs) return reject(e2 ?? new Error('unreadable entry'));
          const c: Buffer[] = [];
          rs.on('data', (d) => c.push(d));
          rs.on('end', () => {
            out.set(e.fileName, Buffer.concat(c));
            zip.readEntry();
          });
          rs.on('error', reject);
        });
      });
      zip.on('end', () => resolve(out));
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}

function* all(el: XmlEl): Generator<XmlEl> {
  yield el;
  for (const c of el.children) yield* all(c);
}

const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');
function resolvePath(base: string, target: string) {
  const segs = (target.startsWith('/') ? target.slice(1) : base + target).split('/');
  const out: string[] = [];
  for (const s of segs) {
    if (s === '..') out.pop();
    else if (s !== '.' && s !== '') out.push(s);
  }
  return out.join('/');
}

export interface DocxValidation {
  ok: boolean;
  errors: string[];
  /** Tolerated by Word (no repair prompt) but worth knowing, e.g. a style referenced without a definition. */
  warnings: string[];
  parts: number;
  stats: { paragraphs: number; tables: number; images: number; numberedParagraphs: number; headings: number; hyperlinks: number; footnotes: number; tocFields: number };
}

export async function validateDocx(buf: Buffer): Promise<DocxValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats = { paragraphs: 0, tables: 0, images: 0, numberedParagraphs: 0, headings: 0, hyperlinks: 0, footnotes: 0, tocFields: 0 };
  let files: Map<string, Buffer>;
  try {
    files = await unzipAll(buf);
  } catch (e) {
    return { ok: false, errors: ['package: ' + (e as Error).message], warnings, parts: 0, stats };
  }
  const xml = new Map<string, XmlEl>();
  for (const [name, data] of files) {
    if (!/\.(xml|rels)$/i.test(name)) continue;
    try {
      xml.set(name, parseXml(data.toString('utf8')));
    } catch (e) {
      errors.push(`${name}: not well-formed XML (${(e as Error).message})`);
    }
  }
  const ct = xml.get('[Content_Types].xml');
  if (!ct) errors.push('package: [Content_Types].xml is missing');
  if (!files.has('_rels/.rels')) errors.push('package: _rels/.rels is missing');
  if (!files.has('word/document.xml')) errors.push('package: word/document.xml is missing');
  // Content types: every part needs a Default (by extension) or an Override.
  if (ct) {
    const defaults = new Set(ct.children.filter((c) => c.name === 'Default').map((c) => (c.attrs.Extension ?? '').toLowerCase()));
    const overrides = new Set(ct.children.filter((c) => c.name === 'Override').map((c) => (c.attrs.PartName ?? '').replace(/^\//, '')));
    for (const name of files.keys()) {
      if (name === '[Content_Types].xml') continue;
      const ext = name.split('.').pop()!.toLowerCase();
      if (!defaults.has(ext) && !overrides.has(name)) errors.push(`content types: no content type for part ${name}`);
    }
    for (const o of overrides) if (!files.has(o)) errors.push(`content types: override for missing part ${o}`);
    const main = ct.children.find((c) => c.name === 'Override' && c.attrs.PartName === '/word/document.xml');
    if (main && !/wordprocessingml\.document\.main\+xml$/.test(main.attrs.ContentType ?? '')) errors.push('content types: word/document.xml has a wrong content type');
  }
  // Relationships: internal targets exist; collect ids per source part.
  const relIds = new Map<string, Map<string, { target: string; external: boolean; type: string }>>();
  for (const [name, el] of xml) {
    if (!name.endsWith('.rels')) continue;
    const source = name.replace(/_rels\/([^/]+)\.rels$/, '$1');
    const base = dirOf(source === name ? '' : source);
    const ids = new Map<string, { target: string; external: boolean; type: string }>();
    for (const r of el.children.filter((c) => c.name === 'Relationship')) {
      const id = r.attrs.Id;
      if (!id) errors.push(`${name}: relationship without Id`);
      else if (ids.has(id)) errors.push(`${name}: duplicate relationship id ${id}`);
      const external = r.attrs.TargetMode === 'External';
      const target = external ? r.attrs.Target : resolvePath(name === '_rels/.rels' ? '' : base, r.attrs.Target ?? '');
      if (!external && !files.has(target)) errors.push(`${name}: relationship ${id} points to missing part ${target}`);
      if (external && !/^(https?:|mailto:|tel:|file:)/i.test(r.attrs.Target ?? '')) errors.push(`${name}: external relationship ${id} has an unsupported target`);
      ids.set(id, { target, external, type: r.attrs.Type ?? '' });
    }
    relIds.set(name === '_rels/.rels' ? '' : source, ids);
  }
  const officeDoc = [...(relIds.get('')?.values() ?? [])].find((r) => /officeDocument$/.test(r.type));
  if (!officeDoc) errors.push('package: _rels/.rels has no officeDocument relationship');

  // Styles and numbering definitions.
  const styles = xml.get('word/styles.xml');
  const styleIds = new Set(styles ? [...all(styles)].filter((e) => e.name === 'w:style').map((e) => e.attrs['w:styleId']) : []);
  const numbering = xml.get('word/numbering.xml');
  const numIds = new Set(numbering ? numbering.children.filter((e) => e.name === 'w:num').map((e) => e.attrs['w:numId']) : []);
  const abstractIds = new Set(numbering ? numbering.children.filter((e) => e.name === 'w:abstractNum').map((e) => e.attrs['w:abstractNumId']) : []);
  if (numbering) {
    const order = numbering.children.map((c) => c.name).filter((n) => n === 'w:abstractNum' || n === 'w:num');
    if (order.lastIndexOf('w:abstractNum') > order.indexOf('w:num') && order.includes('w:num')) errors.push('numbering.xml: w:abstractNum must precede w:num');
    for (const n of numbering.children.filter((e) => e.name === 'w:num')) {
      const a = n.children.find((c) => c.name === 'w:abstractNumId')?.attrs['w:val'];
      if (!a || !abstractIds.has(a)) errors.push(`numbering.xml: w:num ${n.attrs['w:numId']} references missing abstractNum ${a}`);
    }
  }

  // Story parts: document, headers, footers, footnotes, endnotes.
  const docIds = new Set<string>();
  const bookmarks = new Map<string, number>();
  for (const [name, root] of xml) {
    if (!/^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(name)) continue;
    const rels = relIds.get(name) ?? new Map();
    if (name === 'word/document.xml') {
      if (root.name !== 'w:document') errors.push('document.xml: root element must be w:document');
      const body = root.children.find((c) => c.name === 'w:body');
      if (!body) errors.push('document.xml: w:body is missing');
      else {
        const si = body.children.findIndex((c) => c.name === 'w:sectPr');
        if (si >= 0 && si !== body.children.length - 1) errors.push('document.xml: w:sectPr must be the last child of w:body');
      }
    }
    for (const el of all(root)) {
      for (const [k, v] of Object.entries(el.attrs))
        if ((k === 'r:id' || k === 'r:embed' || k === 'r:link' || k === 'r:pict') && !rels.has(v)) errors.push(`${name}: <${el.name} ${k}="${v}"> has no relationship`);
      switch (el.name) {
        case 'w:p': {
          stats.paragraphs++;
          const ip = el.children.findIndex((c) => c.name === 'w:pPr');
          if (ip > 0) errors.push(`${name}: w:pPr must be the first child of w:p`);
          const pPr = ip >= 0 ? el.children[ip] : null;
          const st = pPr?.children.find((c) => c.name === 'w:pStyle')?.attrs['w:val'];
          if (st && !styleIds.has(st)) warnings.push(`${name}: paragraph style "${st}" is not defined in styles.xml`);
          if (st && /^Heading\d$/.test(st)) stats.headings++;
          const num = pPr?.children.find((c) => c.name === 'w:numPr');
          if (num) {
            stats.numberedParagraphs++;
            const id = num.children.find((c) => c.name === 'w:numId')?.attrs['w:val'];
            if (id && id !== '0' && !numIds.has(id)) errors.push(`${name}: numbering instance ${id} is not defined in numbering.xml`);
          }
          break;
        }
        case 'w:r': {
          const ir = el.children.findIndex((c) => c.name === 'w:rPr');
          if (ir > 0) errors.push(`${name}: w:rPr must be the first child of w:r`);
          const st = ir >= 0 ? el.children[ir].children.find((c) => c.name === 'w:rStyle')?.attrs['w:val'] : undefined;
          if (st && !styleIds.has(st)) warnings.push(`${name}: character style "${st}" is not defined in styles.xml`);
          if (el.children.some((c) => c.name === 'w:footnoteReference')) stats.footnotes++;
          break;
        }
        case 'w:tbl': {
          stats.tables++;
          const names = el.children.map((c) => c.name);
          if (names[0] !== 'w:tblPr') errors.push(`${name}: w:tblPr must be the first child of w:tbl`);
          if (names[1] !== 'w:tblGrid') errors.push(`${name}: w:tblGrid must follow w:tblPr`);
          if (!names.includes('w:tr')) errors.push(`${name}: table without rows`);
          break;
        }
        case 'w:tr':
          if (!el.children.some((c) => c.name === 'w:tc' || c.name === 'w:sdt')) errors.push(`${name}: table row without cells`);
          break;
        case 'w:tc': {
          const ic = el.children.findIndex((c) => c.name === 'w:tcPr');
          if (ic > 0) errors.push(`${name}: w:tcPr must be the first child of w:tc`);
          const last = el.children[el.children.length - 1];
          if (!last || last.name !== 'w:p') errors.push(`${name}: a table cell must end with a paragraph`);
          break;
        }
        case 'wp:docPr': {
          stats.images++;
          const id = el.attrs.id;
          if (!id) errors.push(`${name}: wp:docPr without id`);
          else if (docIds.has(id)) errors.push(`${name}: duplicate drawing id ${id} (Word reports unreadable content)`);
          docIds.add(id);
          break;
        }
        case 'w:hyperlink':
          stats.hyperlinks++;
          if (!el.attrs['r:id'] && !el.attrs['w:anchor']) errors.push(`${name}: hyperlink without target`);
          break;
        case 'w:bookmarkStart':
          bookmarks.set(el.attrs['w:id'], (bookmarks.get(el.attrs['w:id']) ?? 0) + 1);
          break;
        case 'w:bookmarkEnd':
          bookmarks.set(el.attrs['w:id'], (bookmarks.get(el.attrs['w:id']) ?? 0) - 1);
          break;
        case 'w:instrText':
          break;
      }
    }
    const raw = files.get(name)!.toString('utf8');
    stats.tocFields += (raw.match(/<w:instrText[^>]*>\s*TOC\b/g) ?? []).length;
  }
  for (const [id, n] of bookmarks) if (n !== 0) errors.push(`bookmark ${id} is not paired (start/end)`);
  return { ok: errors.length === 0, errors: [...new Set(errors)].slice(0, 100), warnings: [...new Set(warnings)].slice(0, 100), parts: files.size, stats };
}
