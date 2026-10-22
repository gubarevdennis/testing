/**
 * Fallback transport for the collaboration protocol when WebSocket is unavailable (corporate proxies that
 * block the Upgrade, broken intermediaries). It mimics the small part of the WebSocket interface that
 * CollabProvider uses and carries exactly the same binary frames over plain HTTPS:
 *
 *   POST   /api/v1/collab/:pageId/tunnel        → { id }            opens a server-side session (same checks as WS)
 *   POST   /api/v1/collab/tunnel/:id/send        { frames: b64[] }   client → server frames, in order
 *   GET    /api/v1/collab/tunnel/:id/poll        → { frames, closed } long poll for server → client frames
 *   DELETE /api/v1/collab/tunnel/:id                                  closes the session
 *
 * The durability contract is unchanged: ACK frames still arrive only after the server committed the operation.
 */
export interface HttpTunnelOptions {
  /** Extra request headers (browser: CSRF token; Node: cookie + CSRF). */
  headers?: () => Record<string, string>;
  fetch?: typeof fetch;
}

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

export function toBase64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

export class HttpTunnelSocket {
  readyState = CONNECTING;
  binaryType = 'arraybuffer';
  /** Bytes queued for sending (backpressure, like WebSocket.bufferedAmount). */
  bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: ArrayBuffer }) => void) | null = null;
  onclose: ((ev: { code: number; reason?: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  private id: string | null = null;
  private queue: Uint8Array[] = [];
  private sending = false;
  private abort = new AbortController();
  private base: string;

  /** `url` is the WebSocket URL of the page channel (ws(s)://host/api/v1/collab/:pageId). */
  constructor(
    url: string,
    private o: HttpTunnelOptions = {},
  ) {
    const u = new URL(url.replace(/^ws/, 'http'));
    this.base = u.origin;
    void this.open(u.pathname);
  }

  private f() {
    return this.o.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private headers(json = false): Record<string, string> {
    return { ...(this.o.headers?.() ?? {}), ...(json ? { 'content-type': 'application/json' } : {}) };
  }

  private async open(path: string) {
    try {
      const r = await this.f()(this.base + path + '/tunnel', { method: 'POST', headers: this.headers(true), body: '{}', credentials: 'same-origin', signal: this.abort.signal });
      if (!r.ok) return this.fail(r.status === 401 ? 4401 : r.status === 404 ? 4404 : r.status === 403 ? 4403 : 1006, 'http ' + r.status);
      const { id } = (await r.json()) as { id: string };
      if (this.readyState !== CONNECTING) {
        void this.f()(`${this.base}/api/v1/collab/tunnel/${id}`, { method: 'DELETE', headers: this.headers(), credentials: 'same-origin' }).catch(() => undefined);
        return;
      }
      this.id = id;
      this.readyState = OPEN;
      this.onopen?.();
      void this.poll();
      void this.pump();
    } catch {
      this.fail(1006, 'network');
    }
  }

  send(data: Uint8Array) {
    if (this.readyState !== OPEN) return;
    const copy = new Uint8Array(data);
    this.queue.push(copy);
    this.bufferedAmount += copy.byteLength;
    void this.pump();
  }

  /** Sends queued frames strictly in order (one request at a time). */
  private async pump() {
    if (this.sending || !this.id) return;
    this.sending = true;
    try {
      // collect the frames of a burst (keystroke batches, cursor updates) into one request
      await new Promise((r) => setTimeout(r, 25));
      while (this.queue.length && this.readyState === OPEN) {
        const frames = this.queue.splice(0, 64);
        const bytes = frames.reduce((n, f) => n + f.byteLength, 0);
        let r: Response;
        try {
          r = await this.f()(`${this.base}/api/v1/collab/tunnel/${this.id}/send`, { method: 'POST', headers: this.headers(true), body: JSON.stringify({ frames: frames.map(toBase64) }), credentials: 'same-origin', signal: this.abort.signal });
        } catch {
          this.fail(1006, 'network');
          return;
        }
        this.bufferedAmount = Math.max(0, this.bufferedAmount - bytes);
        if (!r.ok) {
          this.fail(r.status === 401 ? 4401 : 1006, 'send ' + r.status);
          return;
        }
      }
    } finally {
      this.sending = false;
    }
  }

  private async poll() {
    let after = 0;
    while (this.readyState === OPEN && this.id) {
      let body: { frames: string[]; last: number; closed: { code: number; reason?: string } | null };
      try {
        // `after` confirms received frames; anything the server sent after it is delivered again (lost responses)
        const r = await this.f()(`${this.base}/api/v1/collab/tunnel/${this.id}/poll?after=${after}`, { headers: this.headers(), credentials: 'same-origin', signal: this.abort.signal });
        if (!r.ok) return this.fail(r.status === 401 ? 4401 : 1006, 'poll ' + r.status);
        body = await r.json();
      } catch {
        return this.fail(1006, 'network');
      }
      const first = body.last - body.frames.length + 1;
      for (let i = 0; i < body.frames.length; i++) {
        if (this.readyState !== OPEN) return;
        if (first + i <= after) continue; // already delivered
        const u8 = fromBase64(body.frames[i]);
        this.onmessage?.({ data: u8.buffer as ArrayBuffer });
      }
      if (body.frames.length) after = Math.max(after, body.last);
      if (body.closed) return this.fail(body.closed.code, body.closed.reason);
    }
  }

  close(code = 1000) {
    if (this.readyState === CLOSED) return;
    const id = this.id;
    this.readyState = CLOSED;
    this.abort.abort();
    if (id) void this.f()(`${this.base}/api/v1/collab/tunnel/${id}`, { method: 'DELETE', headers: this.headers(), credentials: 'same-origin' }).catch(() => undefined);
    this.onclose?.({ code });
  }

  private fail(code: number, reason?: string) {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    this.abort.abort();
    this.onerror?.();
    this.onclose?.({ code, reason });
  }
}
