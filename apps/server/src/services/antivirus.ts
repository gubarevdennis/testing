/**
 * Antivirus (ClamAV clamd, INSTREAM over TCP) for every file entering the system: attachments, imports (and assets
 * inside ZIP/DOCX), archive restores, images copied from URLs (R-SECURITY-002, R-SECURITY-007).
 *
 * Fail closed: when CLAMAV_HOST is configured, a file is accepted only after clamd answered "stream: OK". A refused
 * connection, a timeout, a dropped connection or any other reply (e.g. "INSTREAM size limit exceeded. ERROR") rejects
 * the file with a clear message (HTTP 503 `av_unavailable` / 413 `av_limit`) and is counted in
 * kb_antivirus_scans_total{result="error"}; kb_antivirus_up (clamd PING on every scrape) drives the alert
 * KbAntivirusDown in deploy/monitoring/prometheus-alerts.yml.
 */
import { createConnection } from 'node:net';
import { createReadStream } from 'node:fs';
import { AppError } from '../lib/errors.js';
import type { Metrics } from '../observability/metrics.js';
import type { Logger } from 'pino';

export class ScannerError extends Error {
  constructor(
    message: string,
    /** clamd refused the stream because it exceeds its StreamMaxLength. */
    public readonly sizeLimit = false,
  ) {
    super(message);
  }
}

function hostPort(host: string): { host: string; port: number } {
  const i = host.lastIndexOf(':');
  if (i > 0 && /^\d+$/.test(host.slice(i + 1))) return { host: host.slice(0, i).replace(/^\[|\]$/g, ''), port: Number(host.slice(i + 1)) };
  return { host, port: 3310 };
}

/**
 * Streams a file to clamd. Resolves with the signature name when infected, null when clean; rejects with ScannerError
 * on anything else (never treats an unexpected answer as clean).
 */
export function clamdScan(path: string, host: string, timeoutMs = 60_000): Promise<string | null> {
  const { host: h, port } = hostPort(host);
  return new Promise((resolve, reject) => {
    let reply = '';
    let settled = false;
    const finish = (err: Error | null, value: string | null = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.destroy();
      rs?.destroy();
      if (err) reject(err);
      else resolve(value);
    };
    const interpret = () => {
      // clamd terminates z-commands with NUL; strip it (PostgreSQL jsonb/text cannot store \u0000).
      const r = reply.replace(/\0/g, '').trim();
      if (/^stream: OK$/.test(r)) return finish(null, null);
      const found = /^stream: (.+) FOUND$/.exec(r);
      if (found) return finish(null, found[1].trim() || 'FOUND');
      if (/size limit exceeded/i.test(r)) return finish(new ScannerError(`clamd: ${r}`, true));
      return finish(new ScannerError(r ? `clamd: ${r}` : 'clamd closed the connection without a verdict'));
    };
    const timer = setTimeout(() => finish(new ScannerError(`clamd did not answer within ${timeoutMs} ms`)), timeoutMs);
    let rs: ReturnType<typeof createReadStream> | null = null;
    const sock = createConnection({ host: h, port });
    sock.on('data', (d) => {
      reply += d.toString();
      // A verdict ends with NUL; clamd may close right after (or keep reading if we are still sending).
      if (reply.includes('\0')) interpret();
    });
    sock.on('end', interpret);
    sock.on('close', () => (reply ? interpret() : finish(new ScannerError('clamd closed the connection without a verdict'))));
    // EPIPE/ECONNRESET after clamd already answered (e.g. size limit) — the reply decides.
    sock.on('error', (e) => (reply ? interpret() : finish(new ScannerError(`clamd unreachable (${(e as NodeJS.ErrnoException).code ?? e.message})`))));
    sock.on('connect', () => {
      sock.write('zINSTREAM\0');
      rs = createReadStream(path, { highWaterMark: 64 * 1024 });
      rs.on('data', (chunk) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE((chunk as Buffer).length);
        sock.write(len);
        if (!sock.write(chunk)) {
          rs!.pause();
          sock.once('drain', () => rs!.resume());
        }
      });
      rs.on('end', () => sock.write(Buffer.from([0, 0, 0, 0])));
      rs.on('error', (e) => finish(e));
    });
  });
}

/** clamd PING → PONG (used by the kb_antivirus_up gauge). */
export function clamdPing(host: string, timeoutMs = 2000): Promise<boolean> {
  const { host: h, port } = hostPort(host);
  return new Promise((resolve) => {
    let reply = '';
    const sock = createConnection({ host: h, port });
    const done = (ok: boolean) => {
      clearTimeout(timer);
      sock.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    sock.on('connect', () => sock.write('zPING\0'));
    sock.on('data', (d) => {
      reply += d.toString();
      if (reply.includes('\0')) done(reply.replace(/\0/g, '').trim() === 'PONG');
    });
    sock.on('error', () => done(false));
    sock.on('close', () => done(reply.replace(/\0/g, '').trim() === 'PONG'));
  });
}

export interface AvContext {
  cfg: { clamavHost: string | null; clamavTimeoutMs?: number };
  metrics?: Metrics;
  log?: Pick<Logger, 'error' | 'warn'>;
}

/**
 * Scans a file when an antivirus is configured. Returns the signature name for an infected file, null when clean or
 * when no scanner is configured. Throws AppError 503 `av_unavailable` (or 413 `av_limit`) when the scanner is
 * configured but cannot give a verdict — the caller must not accept the file.
 */
export async function scanFile(s: AvContext, path: string, filename: string): Promise<string | null> {
  const host = s.cfg.clamavHost;
  if (!host) return null;
  try {
    const found = await clamdScan(path, host, s.cfg.clamavTimeoutMs ?? 60_000);
    s.metrics?.antivirusScans.labels(found ? 'infected' : 'clean').inc();
    if (found) s.log?.warn({ filename, found }, 'file rejected by antivirus');
    return found;
  } catch (e) {
    s.metrics?.antivirusScans.labels('error').inc();
    s.log?.error({ err: e, filename }, 'antivirus scan failed');
    if (e instanceof ScannerError && e.sizeLimit)
      throw new AppError(413, 'av_limit', `Файл «${filename}» слишком велик для антивирусной проверки и не принят. Обратитесь к администратору (лимит StreamMaxLength clamd).`);
    throw new AppError(503, 'av_unavailable', `Антивирусная проверка недоступна — файл «${filename}» не принят. Повторите позже.`);
  }
}
