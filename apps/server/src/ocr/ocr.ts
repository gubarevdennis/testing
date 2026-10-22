import { mkdir, copyFile, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import sharp from 'sharp';
import type { Logger } from 'pino';

const require = createRequire(import.meta.url);

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}
export interface OcrOutput {
  text: string;
  confidence: number;
  words: OcrWord[];
  width: number;
  height: number;
}

const CYR_TO_LAT: Record<string, string> = { А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X', У: 'Y', а: 'a', с: 'c', е: 'e', о: 'o', р: 'p', х: 'x', у: 'y', к: 'k', м: 'm', т: 't', в: 'b', н: 'h' };
const LAT_TO_CYR: Record<string, string> = Object.fromEntries(Object.entries(CYR_TO_LAT).filter(([c]) => c === c.toUpperCase() || 'асеорху'.includes(c)).map(([c, l]) => [l, c]));

/**
 * Fixes Latin/Cyrillic look-alike confusion typical for mixed RU/EN screenshots:
 *  - codes and article numbers (contain digits) are Latin: "АВС-1234" → "ABC-1234";
 *  - a word mixing scripts is converted to its majority script.
 */
export function fixHomoglyphs(word: string): string {
  const cyr = (word.match(/[А-Яа-яЁё]/g) ?? []).length;
  const lat = (word.match(/[A-Za-z]/g) ?? []).length;
  if (/\d/.test(word) && cyr > 0 && [...word].every((ch) => !/[А-Яа-яЁё]/.test(ch) || CYR_TO_LAT[ch])) return [...word].map((ch) => CYR_TO_LAT[ch] ?? ch).join('');
  if (cyr > 0 && lat > 0) {
    if (lat >= cyr && [...word].every((ch) => !/[А-Яа-яЁё]/.test(ch) || CYR_TO_LAT[ch])) return [...word].map((ch) => CYR_TO_LAT[ch] ?? ch).join('');
    if (cyr > lat && [...word].every((ch) => !/[A-Za-z]/.test(ch) || LAT_TO_CYR[ch])) return [...word].map((ch) => LAT_TO_CYR[ch] ?? ch).join('');
  }
  return word;
}

let workerPromise: Promise<any> | null = null;

/** Local language data (rus + eng) shipped with npm packages — no external OCR service, works offline. */
async function tessdataDir(configured: string): Promise<string> {
  const dir = resolve(configured || join(process.env.KB_DATA_DIR ?? '.data', 'tessdata'));
  await mkdir(dir, { recursive: true });
  for (const lang of ['rus', 'eng']) {
    const target = join(dir, `${lang}.traineddata.gz`);
    try {
      await access(target);
    } catch {
      const pkg = dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`));
      await copyFile(join(pkg, '4.0.0_best_int', `${lang}.traineddata.gz`), target);
    }
  }
  return dir;
}

async function getWorker(cfgDir: string, log?: Logger) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const langPath = await tessdataDir(cfgDir);
      const w = await createWorker(['rus', 'eng'], 1, { langPath, cachePath: langPath, gzip: true, logger: () => undefined, errorHandler: (e: unknown) => log?.warn({ e }, 'tesseract') });
      return w;
    })();
    workerPromise.catch(() => (workerPromise = null));
  }
  return workerPromise;
}

export async function terminateOcr() {
  if (workerPromise) {
    const w = await workerPromise.catch(() => null);
    workerPromise = null;
    await w?.terminate();
  }
}

/**
 * Recognises text on an image. Preprocessing: EXIF orientation, optional user rotation and region,
 * greyscale + normalisation, upscaling of small screenshots (improves accuracy on UI text).
 */
export async function recognize(image: Buffer, opts: { tessdataDir: string; rotation?: number; region?: { x: number; y: number; width: number; height: number } | null; log?: Logger; timeoutMs?: number }): Promise<OcrOutput> {
  let img = sharp(image, { limitInputPixels: 400_000_000 }).rotate();
  if (opts.rotation) img = sharp(await img.toBuffer()).rotate(opts.rotation);
  let buf = await img.toBuffer();
  if (opts.region) {
    const m = await sharp(buf).metadata();
    const r = opts.region;
    const left = Math.max(0, Math.min(Math.round(r.x), (m.width ?? 1) - 1));
    const top = Math.max(0, Math.min(Math.round(r.y), (m.height ?? 1) - 1));
    buf = await sharp(buf).extract({ left, top, width: Math.max(1, Math.min(Math.round(r.width), (m.width ?? 1) - left)), height: Math.max(1, Math.min(Math.round(r.height), (m.height ?? 1) - top)) }).toBuffer();
  }
  const meta = await sharp(buf).metadata();
  const scale = (meta.width ?? 0) < 1600 ? 2 : 1;
  const prepared = await sharp(buf)
    .resize({ width: Math.round((meta.width ?? 1) * scale), kernel: 'lanczos3' })
    .flatten({ background: '#ffffff' })
    .grayscale()
    .normalize()
    .png()
    .toBuffer();
  const worker = await getWorker(opts.tessdataDir, opts.log);
  const job = worker.recognize(prepared, {}, { text: true, blocks: true });
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Превышено время распознавания')), opts.timeoutMs ?? 120_000));
  const res: any = await Promise.race([job, timeout]);
  const words: OcrWord[] = [];
  for (const b of res.data.blocks ?? [])
    for (const p of b.paragraphs ?? [])
      for (const l of p.lines ?? [])
        for (const w of l.words ?? [])
          words.push({
            text: fixHomoglyphs(w.text),
            confidence: Math.round(w.confidence),
            bbox: { x0: Math.round(w.bbox.x0 / scale), y0: Math.round(w.bbox.y0 / scale), x1: Math.round(w.bbox.x1 / scale), y1: Math.round(w.bbox.y1 / scale) },
          });
  const text = String(res.data.text ?? '')
    .split(/(\s+)/)
    .map((t) => (/\s/.test(t) ? t : fixHomoglyphs(t)))
    .join('')
    .trim();
  return { text, confidence: Math.round(res.data.confidence ?? 0), words, width: meta.width ?? 0, height: meta.height ?? 0 };
}
