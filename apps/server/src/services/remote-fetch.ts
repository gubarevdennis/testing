import { BlockList, isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';

/**
 * SSRF-guarded fetch of user supplied URLs (remote images referenced by imported documents, R-SECURITY-008).
 *
 * * only http/https, no credentials in the URL;
 * * the host name is resolved once and EVERY resolved address must be public — loopback, private, link-local
 *   (cloud metadata 169.254.169.254), CGNAT, multicast, reserved and IPv4-mapped/NAT64 forms of those are refused;
 * * the connection is pinned to the checked address (no second DNS lookup → no DNS rebinding);
 * * redirects are followed manually (max 3) and every hop is checked again;
 * * size and time limits; the response must have the expected content type.
 */

export class RemoteFetchError extends Error {
  constructor(
    public code: 'bad_url' | 'blocked_address' | 'too_large' | 'timeout' | 'bad_status' | 'bad_type' | 'too_many_redirects' | 'network',
    message: string,
  ) {
    super(message);
  }
}

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
  ['100::', 64],
] as const)
  blocked.addSubnet(net, prefix, 'ipv6');

/** True when the address must never be contacted by the server on behalf of a user. */
export function isBlockedAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return blocked.check(ip, 'ipv4');
  if (v !== 6) return true;
  const lower = ip.toLowerCase();
  // IPv4-mapped (::ffff:a.b.c.d / ::ffff:7f00:1), IPv4-compatible and NAT64 (64:ff9b::/96) forms carry an IPv4 address.
  const embedded = /^(?:::ffff:|::|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/.exec(lower)?.[1];
  if (embedded) return isBlockedAddress(embedded);
  const hex = /^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex) {
    const a = parseInt(hex[1], 16);
    const b = parseInt(hex[2], 16);
    return isBlockedAddress(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`);
  }
  return blocked.check(ip, 'ipv6');
}

export interface RemoteFetchOptions {
  timeoutMs: number;
  maxBytes: number;
  /** Host names exempt from the private-address check (administrator allow-list, e.g. an intranet image server). */
  allowHosts?: string[];
  /** Content type the response must have (e.g. /^image\//). */
  accept?: RegExp;
  maxRedirects?: number;
}

export interface RemoteFetchResult {
  data: Buffer;
  contentType: string;
  finalUrl: string;
  address: string;
}

/** Validates a URL and resolves its host to a single pinned, allowed address. */
export async function resolveTarget(raw: string, allowHosts: string[] = []): Promise<{ url: URL; address: string; family: 4 | 6 }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RemoteFetchError('bad_url', 'Некорректный адрес');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new RemoteFetchError('bad_url', 'Разрешены только адреса http и https');
  if (url.username || url.password) throw new RemoteFetchError('bad_url', 'Адрес с учётными данными запрещён');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const allowed = allowHosts.includes(host);
  let addrs: Array<{ address: string; family: number }>;
  if (isIP(host)) addrs = [{ address: host, family: isIP(host) }];
  else {
    try {
      addrs = await lookup(host, { all: true, verbatim: true });
    } catch {
      throw new RemoteFetchError('network', `Не удалось разрешить имя ${host}`);
    }
  }
  if (!addrs.length) throw new RemoteFetchError('network', `Не удалось разрешить имя ${host}`);
  // Every address must be allowed: otherwise a name with one public and one internal record could be used to reach the internal one.
  if (!allowed && addrs.some((a) => isBlockedAddress(a.address))) throw new RemoteFetchError('blocked_address', `Адрес ${host} относится к внутренней сети и запрещён`);
  return { url, address: addrs[0].address, family: addrs[0].family === 6 ? 6 : 4 };
}

function once(target: { url: URL; address: string; family: 4 | 6 }, opts: RemoteFetchOptions): Promise<{ status: number; location?: string; contentType: string; data: Buffer }> {
  return new Promise((resolve, reject) => {
    const mod = target.url.protocol === 'https:' ? https : http;
    const req = mod.request(
      target.url,
      {
        method: 'GET',
        headers: { 'user-agent': 'kb-remote-fetch/1', accept: '*/*' },
        // Pin the connection to the address that passed the check (no second resolution).
        // (Node's happy-eyeballs connect asks for `all` addresses; answer in both callback shapes.)
        lookup: (_host: string, o: { all?: boolean }, cb: (err: Error | null, address: string | Array<{ address: string; family: number }>, family?: number) => void) =>
          o?.all ? cb(null, [{ address: target.address, family: target.family }]) : cb(null, target.address, target.family),
        timeout: opts.timeoutMs,
      } as http.RequestOptions,
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location, contentType: '', data: Buffer.alloc(0) });
        }
        const declared = Number(res.headers['content-length'] ?? 0);
        if (declared > opts.maxBytes) {
          res.destroy();
          return reject(new RemoteFetchError('too_large', 'Файл по ссылке слишком большой'));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > opts.maxBytes) {
            res.destroy();
            reject(new RemoteFetchError('too_large', 'Файл по ссылке слишком большой'));
          } else chunks.push(c);
        });
        res.on('end', () => resolve({ status, contentType: String(res.headers['content-type'] ?? ''), data: Buffer.concat(chunks) }));
        res.on('error', (e) => reject(new RemoteFetchError('network', e.message)));
      },
    );
    req.on('timeout', () => req.destroy(new RemoteFetchError('timeout', 'Превышено время ожидания')));
    req.on('error', (e) => reject(e instanceof RemoteFetchError ? e : new RemoteFetchError('network', e.message)));
    req.end();
  });
}

export async function fetchRemote(raw: string, opts: RemoteFetchOptions): Promise<RemoteFetchResult> {
  let current = raw;
  const max = opts.maxRedirects ?? 3;
  for (let hop = 0; hop <= max; hop++) {
    const target = await resolveTarget(current, opts.allowHosts);
    const r = await once(target, opts);
    if (r.status >= 300 && r.status < 400) {
      if (!r.location) throw new RemoteFetchError('bad_status', `HTTP ${r.status} без адреса перенаправления`);
      current = new URL(r.location, target.url).toString();
      continue;
    }
    if (r.status !== 200) throw new RemoteFetchError('bad_status', `HTTP ${r.status}`);
    if (opts.accept && !opts.accept.test(r.contentType)) throw new RemoteFetchError('bad_type', `Неожиданный тип содержимого: ${r.contentType || 'не указан'}`);
    return { data: r.data, contentType: r.contentType, finalUrl: target.url.toString(), address: target.address };
  }
  throw new RemoteFetchError('too_many_redirects', 'Слишком много перенаправлений');
}
