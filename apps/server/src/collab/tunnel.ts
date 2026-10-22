import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

const POLL_WAIT_MS = 25_000;
/** A tunnel nobody polls for this long is considered gone (the client closed the tab or lost the network). */
const IDLE_CLOSE_MS = 60_000;

/**
 * Server end of the HTTP fallback channel (see packages/shared/src/collab-http.ts). It behaves like the `ws`
 * socket the collaboration hub expects — `send`, `close`, `ping`, `terminate`, `readyState`, 'message'/'close'/'pong'
 * events — so the hub applies exactly the same access checks, validation and ACK-after-commit rules to it.
 */
export class HttpTunnel extends EventEmitter {
  readonly id = randomUUID();
  readyState = 1;
  /** Server → client frames not yet confirmed by the client (a poll response may be lost in transit). */
  private outbox: Array<{ seq: number; buf: Buffer }> = [];
  private nextSeq = 1;
  private closed: { code: number; reason?: string } | null = null;
  private waiter: { resolve: (v: PollResult) => void } | null = null;
  private waitTimer: NodeJS.Timeout | null = null;
  lastSeen = Date.now();
  polling = false;

  constructor(
    readonly userId: string,
    readonly sessionId: string | null,
  ) {
    super();
  }

  /** Called by the hub (server → client frame). */
  send(data: Uint8Array | Buffer) {
    if (this.readyState !== 1) return;
    this.outbox.push({ seq: this.nextSeq++, buf: Buffer.from(data) });
    this.wake();
  }

  close(code = 1000, reason?: string) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.closed = { code, reason };
    this.wake();
    this.emit('close', code, Buffer.from(reason ?? ''));
  }

  terminate() {
    this.close(1006, 'terminated');
  }

  /** Heartbeat from the hub: the tunnel is alive while the client keeps polling. */
  ping() {
    if (this.polling || Date.now() - this.lastSeen < IDLE_CLOSE_MS) setImmediate(() => this.emit('pong'));
  }

  /** Client → server frames, delivered in order. */
  deliver(frames: Uint8Array[]) {
    this.lastSeen = Date.now();
    if (this.readyState !== 1) return false;
    for (const f of frames) this.emit('message', Buffer.from(f), true);
    return true;
  }

  /**
   * Long poll. `after` confirms every frame up to that sequence number (received by the client); the rest is
   * returned again, so a lost response loses nothing. Resolves at once when frames are waiting.
   */
  poll(after: number, waitMs = POLL_WAIT_MS): Promise<PollResult> {
    this.lastSeen = Date.now();
    this.outbox = this.outbox.filter((f) => f.seq > after);
    if (this.waiter) this.resolveWaiter(false); // only one poller at a time
    if (this.outbox.length || this.closed) return Promise.resolve(this.result(true));
    this.polling = true;
    return new Promise((resolve) => {
      this.waiter = { resolve };
      this.waitTimer = setTimeout(() => this.resolveWaiter(true), waitMs);
    });
  }

  /** Ends a pending poll (client went away); frames stay queued for the next poll. */
  cancelPoll() {
    this.resolveWaiter(false);
  }

  idle(now = Date.now()) {
    return !this.polling && now - this.lastSeen > IDLE_CLOSE_MS;
  }

  private result(withFrames: boolean): PollResult {
    if (!withFrames) return { frames: [], last: 0, closed: null };
    const frames = this.outbox.map((f) => f.buf.toString('base64'));
    const last = this.outbox.length ? this.outbox[this.outbox.length - 1].seq : 0;
    return { frames, last, closed: this.closed };
  }

  private wake() {
    if (this.waiter) this.resolveWaiter(true);
  }

  private resolveWaiter(withFrames: boolean) {
    const w = this.waiter;
    this.waiter = null;
    if (this.waitTimer) clearTimeout(this.waitTimer);
    this.waitTimer = null;
    this.polling = false;
    this.lastSeen = Date.now();
    w?.resolve(this.result(withFrames));
  }
}

export interface PollResult {
  frames: string[];
  /** sequence number of the last frame in `frames` (the client confirms it with the next poll) */
  last: number;
  closed: { code: number; reason?: string } | null;
}

/** Open HTTP tunnels of this instance; idle ones are closed so the hub releases their connections. */
export class TunnelRegistry {
  private tunnels = new Map<string, HttpTunnel>();
  private sweeper: NodeJS.Timeout;

  constructor() {
    this.sweeper = setInterval(() => this.sweep(), 10_000);
    this.sweeper.unref?.();
  }

  create(userId: string, sessionId: string | null) {
    const mine = [...this.tunnels.values()].filter((t) => t.userId === userId);
    // a runaway client must not exhaust the server: the oldest tunnels of the user are closed
    if (mine.length >= 50) mine.slice(0, mine.length - 49).forEach((t) => t.close(1008, 'too many tunnels'));
    const t = new HttpTunnel(userId, sessionId);
    this.tunnels.set(t.id, t);
    t.once('close', () => setTimeout(() => this.tunnels.delete(t.id), 30_000).unref?.());
    return t;
  }

  get(id: string, userId: string) {
    const t = this.tunnels.get(id);
    return t && t.userId === userId ? t : null;
  }

  sweep(now = Date.now()) {
    for (const t of this.tunnels.values()) if (t.readyState === 1 && t.idle(now)) t.close(1001, 'idle');
  }

  closeAll() {
    clearInterval(this.sweeper);
    for (const t of this.tunnels.values()) t.close(4503, 'server restart');
    this.tunnels.clear();
  }
}
