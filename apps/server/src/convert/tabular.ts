import Papa from 'papaparse';
import iconv from 'iconv-lite';
import ExcelJS from 'exceljs';
import type { ConversionWarning } from '@kb/shared';

export type Cell = string;
export interface Sheet {
  name: string;
  rows: Cell[][];
  formulas: number;
  merged: number;
}

export interface CsvOptions {
  encoding?: 'auto' | 'utf-8' | 'windows-1251';
  delimiter?: 'auto' | ',' | ';' | '\t';
}

/** Detects the encoding: strict UTF-8 first, otherwise Windows-1251 (common for Russian Excel exports). */
export function decodeText(buf: Buffer, encoding: CsvOptions['encoding'] = 'auto'): { text: string; encoding: string } {
  if (encoding === 'windows-1251') return { text: iconv.decode(buf, 'win1251'), encoding };
  const bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bom ? buf.subarray(3) : buf);
    return { text, encoding: 'utf-8' };
  } catch {
    if (encoding === 'utf-8') return { text: new TextDecoder('utf-8').decode(buf), encoding: 'utf-8' };
    return { text: iconv.decode(buf, 'win1251'), encoding: 'windows-1251' };
  }
}

export function parseCsv(buf: Buffer, opts: CsvOptions = {}): { sheet: Sheet; encoding: string; delimiter: string; warnings: ConversionWarning[] } {
  const { text, encoding } = decodeText(buf, opts.encoding);
  const res = Papa.parse<string[]>(text, { delimiter: opts.delimiter && opts.delimiter !== 'auto' ? opts.delimiter : '', skipEmptyLines: 'greedy', delimitersToGuess: [';', ',', '\t', '|'] });
  const warnings: ConversionWarning[] = res.errors.slice(0, 20).map((e) => ({ code: 'csv-' + e.code, message: `Строка ${(e.row ?? 0) + 1}: ${e.message}` }));
  const width = Math.max(0, ...res.data.map((r) => r.length));
  const rows = res.data.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
  return { sheet: { name: 'CSV', rows, formulas: 0, merged: 0 }, encoding, delimiter: res.meta.delimiter, warnings };
}

function cellToString(v: ExcelJS.CellValue, numFmt?: string): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const iso = v.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.replace('.000Z', 'Z');
  }
  if (typeof v === 'number') {
    if (numFmt && /%/.test(numFmt)) return String(Math.round(v * 10000) / 100) + '%';
    return String(v);
  }
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  if (typeof v === 'object') {
    if ('result' in v) return cellToString((v as any).result as ExcelJS.CellValue, numFmt);
    if ('richText' in v) return (v as any).richText.map((t: any) => t.text).join('');
    if ('text' in v && 'hyperlink' in v) return String((v as any).text);
    if ('error' in v) return String((v as any).error);
  }
  return String(v);
}

/** Reads all worksheets; formulas are imported as their computed values (never evaluated, macros ignored). */
export async function parseXlsx(buf: Buffer): Promise<{ sheets: Sheet[]; warnings: ConversionWarning[] }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as any);
  } catch (e) {
    throw new Error('Файл XLSX повреждён или имеет неподдерживаемый формат: ' + (e as Error).message);
  }
  const warnings: ConversionWarning[] = [];
  const sheets: Sheet[] = [];
  wb.eachSheet((ws) => {
    let formulas = 0;
    const rows: Cell[][] = [];
    const width = ws.columnCount;
    ws.eachRow({ includeEmpty: true }, (row, rowNo) => {
      const r: Cell[] = [];
      for (let c = 1; c <= width; c++) {
        const cell = row.getCell(c);
        if (cell.type === ExcelJS.ValueType.Formula) formulas++;
        r.push(cellToString(cell.value, cell.numFmt));
      }
      rows[rowNo - 1] = r;
    });
    const dense = Array.from(rows, (r) => r ?? Array.from({ length: width }, () => ''));
    while (dense.length && dense[dense.length - 1].every((c) => c === '')) dense.pop();
    const merged = Object.keys((ws as any)._merges ?? {}).length;
    if (formulas) warnings.push({ code: 'formulas', message: `Лист «${ws.name}»: ${formulas} формул импортированы как вычисленные значения (формулы не исполняются).` });
    if (merged) warnings.push({ code: 'merged', message: `Лист «${ws.name}»: объединённые ячейки (${merged}) импортированы как отдельные ячейки со значением в левой верхней.` });
    sheets.push({ name: ws.name, rows: dense, formulas, merged });
  });
  return { sheets, warnings };
}

export type ColumnType = 'text' | 'number' | 'date' | 'checkbox' | 'url' | 'email' | 'select';

const NUM = /^[-+]?(\d{1,3}([  ]\d{3})+|\d+)([.,]\d+)?$/;
const DATE_RU = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;

export function normalizeNumber(v: string): number | null {
  const t = v.trim();
  if (!NUM.test(t)) return null;
  if (/^0\d/.test(t.replace(/^[-+]/, '')) && !/[.,]/.test(t)) return null; // leading zeros = identifier, keep as text
  const n = Number(t.replace(/[  ]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function normalizeDate(v: string): string | null {
  const t = v.trim();
  if (DATE_ISO.test(t)) return t.slice(0, 10);
  const m = DATE_RU.exec(t);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

/** Infers column types from data (ignoring empty cells); ambiguous columns stay text. */
export function inferTypes(rows: Cell[][]): Array<{ type: ColumnType; options?: string[]; invalid: number }> {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const out: Array<{ type: ColumnType; options?: string[]; invalid: number }> = [];
  for (let c = 0; c < width; c++) {
    const vals = rows.map((r) => (r[c] ?? '').trim()).filter((v) => v !== '');
    if (!vals.length) {
      out.push({ type: 'text', invalid: 0 });
      continue;
    }
    const share = (pred: (v: string) => boolean) => vals.filter(pred).length / vals.length;
    const checks: Array<[ColumnType, (v: string) => boolean]> = [
      ['checkbox', (v) => /^(да|нет|true|false|yes|no|1|0|✓|✗|x)$/i.test(v)],
      ['number', (v) => normalizeNumber(v) !== null],
      ['date', (v) => normalizeDate(v) !== null],
      ['url', (v) => /^https?:\/\/\S+$/i.test(v)],
      ['email', (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)],
    ];
    let picked: { type: ColumnType; options?: string[]; invalid: number } = { type: 'text', invalid: 0 };
    for (const [type, pred] of checks) {
      if (type === 'checkbox' && new Set(vals.map((v) => v.toLowerCase())).size > 2) continue;
      const sh = share(pred);
      if (sh >= 0.95) {
        picked = { type, invalid: vals.length - vals.filter(pred).length };
        break;
      }
    }
    if (picked.type === 'text') {
      const distinct = new Set(vals);
      if (vals.length >= 8 && distinct.size <= Math.min(12, vals.length / 3)) picked = { type: 'select', options: [...distinct].slice(0, 50), invalid: 0 };
    }
    out.push(picked);
  }
  return out;
}

export function sheetPreview(sheet: Sheet, header = true) {
  const head = header ? sheet.rows[0] ?? [] : (sheet.rows[0] ?? []).map((_, i) => `Столбец ${i + 1}`);
  const data = header ? sheet.rows.slice(1) : sheet.rows;
  const types = inferTypes(data);
  return { name: sheet.name, columns: head.map((h, i) => ({ name: h || `Столбец ${i + 1}`, ...(types[i] ?? { type: 'text', invalid: 0 }) })), rows: data.slice(0, 100), totalRows: data.length };
}
