/**
 * RTF from the clipboard (R-CLIPBOARD-020, SC-06, UX13-02). Word, WordPad, Outlook and LibreOffice put RTF next to
 * (or instead of) HTML. Two uses:
 *  - an RTF-only clipboard is converted to simple HTML (headings H1–H6 from outline levels / heading styles, paragraphs,
 *    bold / italic / underline / strike / sub / sup, nested bullet and numbered lists, tables, hyperlinks, pictures),
 *    which then goes through the same allowlist sanitiser as any pasted HTML;
 *  - Word's HTML references pictures as local files (file:///…/clip_image001.png) the browser cannot read, but the RTF
 *    flavour embeds the same pictures (PNG / JPEG): they are taken from there, in document order.
 * Only what is needed for that is interpreted; everything else (fonts, colours, revision data, objects) is skipped.
 */

export interface RtfPicture {
  dataUri: string;
  width: number | null;
  height: number | null;
}

type Token = { t: '{' } | { t: '}' } | { t: 'w'; w: string; n: number | null } | { t: 's'; c: string } | { t: 'x'; s: string } | { t: 'h'; b: number };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  let text = '';
  const flush = () => {
    if (text) out.push({ t: 'x', s: text });
    text = '';
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '{' || c === '}') {
      flush();
      out.push({ t: c });
      i++;
    } else if (c === '\\') {
      const n = src[i + 1];
      if (n === undefined) break;
      if (/[a-zA-Z]/.test(n)) {
        flush();
        let j = i + 1;
        while (j < src.length && /[a-zA-Z]/.test(src[j])) j++;
        const w = src.slice(i + 1, j);
        let num: number | null = null;
        const m = /^-?\d+/.exec(src.slice(j, j + 12));
        if (m) {
          num = Number(m[0]);
          j += m[0].length;
        }
        if (src[j] === ' ') j++;
        out.push({ t: 'w', w, n: num });
        // binary data: skip N bytes
        if (w === 'bin' && num) j += num;
        i = j;
      } else if (n === "'") {
        flush();
        out.push({ t: 'h', b: parseInt(src.slice(i + 2, i + 4), 16) });
        i += 4;
      } else if (n === '\r' || n === '\n') {
        flush();
        out.push({ t: 'w', w: 'par', n: null });
        i += 2;
      } else {
        flush();
        out.push({ t: 's', c: n });
        i += 2;
      }
    } else if (c === '\r' || c === '\n') i++;
    else {
      text += c;
      i++;
    }
  }
  flush();
  return out;
}

const SKIP = new Set([
  'fonttbl', 'colortbl', 'info', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'themedata', 'colorschememapping', 'datastore', 'latentstyles', 'mmathPr',
  'header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf', 'footnote', 'annotation', 'object', 'nonshppict', 'pntext', 'pntxta', 'pntxtb', 'filetbl',
  'revtbl', 'pgdsctbl', 'bkmkstart', 'bkmkend', 'xe', 'tc', 'shpinst', 'sp', 'sn', 'sv', 'atnid', 'atnauthor', 'passwordhash', 'protusertbl', 'docvar', 'userprops', 'template',
]);

interface Char {
  b: boolean;
  i: boolean;
  u: boolean;
  s: boolean;
  sup: boolean;
  sub: boolean;
}
interface Para {
  style: number;
  outline: number | null;
  list: boolean;
  ilvl: number;
  intbl: boolean;
  align: string | null;
}
interface Group {
  char: Char;
  dest: 'text' | 'skip' | 'listtext' | 'fldinst' | 'fldrslt' | 'pict' | 'stylesheet' | 'style';
  uc: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function decoder(cp: number): TextDecoder | null {
  try {
    return new TextDecoder(cp === 65001 ? 'utf-8' : `windows-${cp}`);
  } catch {
    return null;
  }
}

function continuesTable(tokens: Token[], from: number) {
  for (let k = from; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.t === 'w' && (t.w === 'trowd' || t.w === 'intbl')) return true;
    if (t.t === 'w' && t.w === 'par') return false;
    if (t.t === 'x' && t.s.trim()) return false;
  }
  return false;
}

/** Parses RTF into HTML and the embedded pictures (PNG / JPEG, in document order). */
export function parseRtf(rtf: string): { html: string; pictures: RtfPicture[]; droppedPictures: number } {
  const tokens = tokenize(rtf);
  let dec = decoder(1252);
  const styleLevel = new Map<number, number>(); // style number → heading level
  const captionStyles = new Set<number>();
  const pictures: RtfPicture[] = [];
  let droppedPictures = 0;

  // output model
  type Inline = string;
  const blocks: Array<{ kind: 'p'; para: Para; html: Inline; ordered: boolean; caption: boolean } | { kind: 'table'; rows: string[][] }> = [];
  let cur = '';
  let para: Para = { style: 0, outline: null, list: false, ilvl: 0, intbl: false, align: null };
  let listText = '';
  let fldinst = '';
  let fldHref: string | null = null;
  let hex = '';
  let pict: { kind: string | null; w: number | null; h: number | null; wg: number | null; hg: number | null } | null = null;
  let styleName = '';
  let styleNum = 0;
  let styleOutline: number | null = null;
  let row: string[] = [];
  let rows: string[][] = [];
  let cell = '';
  let pendingBytes: number[] = [];

  const stack: Group[] = [];
  let g: Group = { char: { b: false, i: false, u: false, s: false, sup: false, sub: false }, dest: 'text', uc: 1 };
  let skipChars = 0;

  const open = (c: Char) => (c.b ? '<b>' : '') + (c.i ? '<i>' : '') + (c.u ? '<u>' : '') + (c.s ? '<s>' : '') + (c.sup ? '<sup>' : '') + (c.sub ? '<sub>' : '');
  const close = (c: Char) => (c.sub ? '</sub>' : '') + (c.sup ? '</sup>' : '') + (c.s ? '</s>' : '') + (c.u ? '</u>' : '') + (c.i ? '</i>' : '') + (c.b ? '</b>' : '');

  const flushBytes = () => {
    if (!pendingBytes.length) return;
    const s = dec ? dec.decode(new Uint8Array(pendingBytes)) : String.fromCharCode(...pendingBytes);
    pendingBytes = [];
    emitText(s, true);
  };
  function emitText(s: string, decoded = false) {
    if (!decoded) flushBytes();
    if (!s) return;
    switch (g.dest) {
      case 'text':
      case 'fldrslt':
        cur += open(g.char) + esc(s) + close(g.char);
        break;
      case 'listtext':
        listText += s;
        break;
      case 'fldinst':
        fldinst += s;
        break;
      case 'stylesheet':
      case 'style':
        styleName += s;
        break;
      case 'pict':
        hex += s;
        break;
    }
  }

  const endPara = () => {
    flushBytes();
    if (para.intbl) {
      cell += (cell ? '<br>' : '') + cur;
      cur = '';
      return;
    }
    const level = para.outline != null && para.outline < 6 ? para.outline + 1 : styleLevel.get(para.style) ?? null;
    const ordered = /^\s*[([]?([0-9]{1,3}|[a-zа-я]|[ivxlcdm]{1,6})[.)\]]/i.test(listText);
    blocks.push({ kind: 'p', para: { ...para, outline: level != null ? level - 1 : null, list: para.list || !!listText.trim() }, html: cur, ordered, caption: captionStyles.has(para.style) });
    cur = '';
    listText = '';
  };

  for (let k = 0; k < tokens.length; k++) {
    const tk = tokens[k];
    if (tk.t === '{') {
      flushBytes();
      stack.push(g);
      g = { char: { ...g.char }, dest: g.dest === 'stylesheet' ? 'style' : g.dest, uc: g.uc };
      if (g.dest === 'style') {
        styleName = '';
        styleNum = 0;
        styleOutline = null;
      }
      continue;
    }
    if (tk.t === '}') {
      flushBytes();
      const ended = g;
      g = stack.pop() ?? g;
      if (ended.dest === 'style' && g.dest === 'stylesheet') {
        const m = /(?:heading|заголовок)\s*([1-6])/i.exec(styleName);
        const lvl = styleOutline != null && styleOutline < 6 ? styleOutline + 1 : m ? Number(m[1]) : null;
        if (lvl) styleLevel.set(styleNum, lvl);
        if (/^\s*(caption|название объекта)\s*;?\s*$/i.test(styleName.replace(/[^\p{L}\s;]/gu, ''))) captionStyles.add(styleNum);
      }
      if (ended.dest === 'pict' && g.dest !== 'pict' && pict) {
        const bytes = hex.replace(/[^0-9a-f]/gi, '');
        if (pict.kind && bytes.length > 16) {
          let bin = '';
          for (let x = 0; x + 1 < bytes.length; x += 2) bin += String.fromCharCode(parseInt(bytes.slice(x, x + 2), 16));
          const tw = (v: number | null) => (v ? Math.round(v / 15) : null); // twips → px
          const p: RtfPicture = { dataUri: `data:${pict.kind};base64,${btoa(bin)}`, width: tw(pict.wg) ?? pict.w, height: tw(pict.hg) ?? pict.h };
          pictures.push(p);
          if (g.dest === 'text' || g.dest === 'fldrslt') cur += `<img src="${p.dataUri}"${p.width ? ` width="${p.width}"` : ''}>`;
        } else droppedPictures++;
        pict = null;
        hex = '';
      }
      if (ended.dest === 'fldinst' && g.dest !== 'fldinst') {
        const m = /HYPERLINK\s+"([^"]+)"/i.exec(fldinst);
        fldHref = m ? m[1] : null;
        fldinst = '';
      }
      if (ended.dest === 'fldrslt' && g.dest !== 'fldrslt' && fldHref) {
        // wrap what the field result produced since it started
        const at = cur.lastIndexOf('\u0001');
        if (at >= 0) cur = cur.slice(0, at) + `<a href="${esc(fldHref)}">` + cur.slice(at + 1) + '</a>';
        fldHref = null;
      }
      continue;
    }
    if (g.dest === 'skip') continue;
    if (tk.t === 'h') {
      if (skipChars > 0) {
        skipChars--;
        continue;
      }
      if (g.dest === 'pict') continue;
      pendingBytes.push(tk.b);
      continue;
    }
    if (tk.t === 'x') {
      let s = tk.s;
      if (skipChars > 0) {
        const n = Math.min(skipChars, s.length);
        s = s.slice(n);
        skipChars -= n;
      }
      emitText(s);
      continue;
    }
    if (tk.t === 's') {
      if (tk.c === '*') {
        // ignorable destination: skip unless we know it
        const next = tokens[k + 1];
        if (next?.t === 'w' && (next.w === 'fldinst' || next.w === 'shppict' || next.w === 'listtext')) continue;
        g.dest = 'skip';
        continue;
      }
      if (tk.c === '~') emitText(' ');
      else if (tk.c === '_') emitText('‑');
      else if (tk.c === '-') continue;
      else if (tk.c === '\\' || tk.c === '{' || tk.c === '}') emitText(tk.c);
      continue;
    }
    // control word: text decoded so far belongs to the formatting before it
    flushBytes();
    const { w, n } = tk;
    if (SKIP.has(w)) {
      g.dest = 'skip';
      continue;
    }
    switch (w) {
      case 'ansicpg':
        dec = decoder(n ?? 1252) ?? dec;
        break;
      case 'stylesheet':
        g.dest = 'stylesheet';
        break;
      case 's':
        if (g.dest === 'style') styleNum = n ?? 0;
        else para.style = n ?? 0;
        break;
      case 'outlinelevel':
        if (g.dest === 'style') styleOutline = n;
        else para.outline = n;
        break;
      case 'pard':
        // Word repeats \pard inside the list marker group ({\listtext\pard\plain ·\tab}): not a new paragraph
        if (g.dest === 'text' || g.dest === 'fldrslt') para = { style: 0, outline: null, list: false, ilvl: 0, intbl: false, align: null };
        break;
      case 'intbl':
        para.intbl = true;
        break;
      case 'ls':
        para.list = true;
        break;
      case 'ilvl':
        para.ilvl = Math.max(0, Math.min(8, n ?? 0));
        break;
      case 'listtext':
        g.dest = 'listtext';
        break;
      case 'qc':
        para.align = 'center';
        break;
      case 'qr':
        para.align = 'right';
        break;
      case 'qj':
        para.align = 'justify';
        break;
      case 'par':
        if (g.dest === 'text' || g.dest === 'fldrslt') endPara();
        break;
      case 'line':
        if (g.dest === 'text' || g.dest === 'fldrslt') cur += '<br>';
        break;
      case 'tab':
        if (g.dest === 'listtext') listText += ' ';
        else emitText(' ');
        break;
      case 'cell':
      case 'nestcell':
        flushBytes();
        cell += (cell && cur ? '<br>' : '') + cur;
        cur = '';
        row.push(cell);
        cell = '';
        break;
      case 'row':
      case 'nestrow':
        if (row.length) rows.push(row);
        row = [];
        // the table goes on when another row starts before the next paragraph outside it
        if (continuesTable(tokens, k + 1)) break;
        blocks.push({ kind: 'table', rows });
        rows = [];
        break;
      case 'trowd':
        break;
      case 'b':
        g.char.b = n !== 0;
        break;
      case 'i':
        g.char.i = n !== 0;
        break;
      case 'ul':
        g.char.u = n !== 0;
        break;
      case 'ulnone':
        g.char.u = false;
        break;
      case 'strike':
        g.char.s = n !== 0;
        break;
      case 'super':
        g.char.sup = true;
        break;
      case 'sub':
        g.char.sub = true;
        break;
      case 'nosupersub':
        g.char.sup = g.char.sub = false;
        break;
      case 'plain':
        g.char = { b: false, i: false, u: false, s: false, sup: false, sub: false };
        break;
      case 'u': {
        flushBytes();
        let code = n ?? 0;
        if (code < 0) code += 65536;
        emitText(String.fromCharCode(code));
        skipChars = g.uc;
        break;
      }
      case 'uc':
        g.uc = n ?? 1;
        break;
      case 'field':
        break;
      case 'fldinst':
        g.dest = 'fldinst';
        fldinst = '';
        break;
      case 'fldrslt':
        g.dest = 'fldrslt';
        if (fldHref) cur += '\u0001';
        break;
      case 'shppict':
        break;
      case 'pict':
        g.dest = 'pict';
        pict = { kind: null, w: null, h: null, wg: null, hg: null };
        hex = '';
        break;
      case 'pngblip':
        if (pict) pict.kind = 'image/png';
        break;
      case 'jpegblip':
        if (pict) pict.kind = 'image/jpeg';
        break;
      case 'picw':
        if (pict) pict.w = n;
        break;
      case 'pich':
        if (pict) pict.h = n;
        break;
      case 'picwgoal':
        if (pict) pict.wg = n;
        break;
      case 'pichgoal':
        if (pict) pict.hg = n;
        break;
      case 'emoji':
        break;
    }
  }
  flushBytes();
  if (cur.trim()) endPara();
  if (rows.length || row.length) blocks.push({ kind: 'table', rows: row.length ? [...rows, row] : rows });

  // blocks → HTML (nested lists by level)
  let html = '';
  const lists: Array<{ tag: 'ul' | 'ol'; level: number }> = [];
  const closeLists = (to: number) => {
    while (lists.length > to) html += `</li></${lists.pop()!.tag}>`;
  };
  for (const b of blocks) {
    if (b.kind === 'table') {
      closeLists(0);
      html += '<table>' + b.rows.map((r) => '<tr>' + r.map((c) => `<td><p>${c}</p></td>`).join('') + '</tr>').join('') + '</table>';
      continue;
    }
    const content = b.html.replace(/\u0001/g, '');
    if (b.para.list) {
      const level = b.para.ilvl;
      const tag = b.ordered ? 'ol' : 'ul';
      while (lists.length && lists[lists.length - 1].level > level) html += `</li></${lists.pop()!.tag}>`;
      const top = lists[lists.length - 1];
      if (top && top.level === level) {
        if (top.tag !== tag) {
          html += `</li></${lists.pop()!.tag}><${tag}><li>`;
          lists.push({ tag, level });
        } else html += '</li><li>';
      } else {
        html += `<${tag}><li>`;
        lists.push({ tag, level });
      }
      html += `<p>${content}</p>`;
      continue;
    }
    closeLists(0);
    // a caption paragraph right after a picture: the picture's caption
    const lastImg = /<p>(<img [^>]+>)<\/p>$/.exec(html);
    if (b.caption && lastImg) {
      html = html.slice(0, -lastImg[0].length) + `<figure>${lastImg[1]}<figcaption>${content.replace(/<[^>]+>/g, '')}</figcaption></figure>`;
      continue;
    }
    const style = b.para.align ? ` style="text-align: ${b.para.align}"` : '';
    if (b.para.outline != null && b.para.outline < 6) html += `<h${b.para.outline + 1}${style}>${content}</h${b.para.outline + 1}>`;
    else html += `<p${style}>${content}</p>`;
  }
  closeLists(0);
  // runs were emitted piece by piece (every \uN): merge adjacent identical formatting
  for (let prev = ''; prev !== html; ) {
    prev = html;
    html = html.replace(/<\/(b|i|u|s|sup|sub)><\1>/g, '');
  }
  return { html, pictures, droppedPictures };
}

/** Word HTML images the browser cannot read (local files, VML) — in document order. */
const LOCAL_IMG = /<img\b[^>]*\bsrc\s*=\s*(["'])(file:[^"']*|[^"':]+\.(?:png|jpe?g|gif|emf|wmf))\1[^>]*>/gi;

/**
 * Replaces the local-file pictures of Word HTML by the pictures embedded in the RTF flavour of the same copy. Only
 * when the counts match (otherwise the order would be a guess): returns the HTML and the number replaced.
 */
export function substituteWordImages(html: string, rtf: string): { html: string; replaced: number } {
  const local = html.match(LOCAL_IMG) ?? [];
  if (!local.length || !rtf) return { html, replaced: 0 };
  const { pictures } = parseRtf(rtf);
  if (pictures.length !== local.length) return { html, replaced: 0 };
  let k = 0;
  const out = html.replace(LOCAL_IMG, (tag) => {
    const p = pictures[k++];
    return tag.replace(/\bsrc\s*=\s*(["'])[^"']*\1/i, `src="${p.dataUri}"`);
  });
  return { html: out, replaced: k };
}
