import { createServer, connect, type Server, type Socket } from 'node:net';

/**
 * Fault-injecting TCP proxy for resilience tests (R-QA-005, R-QA-021, R-QA-034, QA26-20). It sits between a client
 * and the server (or between the server and PostgreSQL) and reproduces what a real network does, at the TCP level,
 * so every layer above (WebSocket, HTTP, the pg driver, application timeouts) reacts as in production:
 *
 * - `latency(ms, jitter)` — one-way delay per direction (RTT ≈ 2 × ms), byte order preserved (TCP).
 * - `loss(p, rtoMs)` — packet loss as TCP shows it to applications: a lost segment is retransmitted after the RTO and
 *   everything behind it waits (head-of-line blocking); nothing is reordered or lost for good.
 * - `outage()` / `restore()` — the link goes dark: no FIN, no RST, bytes in flight are held (TCP retransmits them if
 *   the link comes back in time); new connection attempts get no answer (SYN dropped) and fail after `synTimeoutMs`
 *   like a real connect timeout; connections that stay dark longer than `tcpGiveUpMs` are reset (kernel gives up).
 * - `reset()` — every connection is torn down with RST (server crash, NAT reboot, proxy restart).
 * - `switchNetwork(localAddress)` — Wi-Fi → LTE: existing connections become black holes for good (the old interface
 *   is gone; neither side is told), new connections leave from a different source address (the server sees a new
 *   client IP).
 * - `refuse(on)` — connection refused (nothing listening, e.g. instance down behind a load balancer).
 */
export interface FaultProxyOptions {
  target: { host: string; port: number } | (() => { host: string; port: number } | null);
  listenHost?: string;
  port?: number;
  synTimeoutMs?: number;
  tcpGiveUpMs?: number;
}

interface Pipe {
  client: Socket;
  upstream: Socket | null;
  dead: boolean; // black hole after a network switch
  brokenInOutage?: boolean; // one end closed while the link was dark: the other end learns it (RST) on restore
  heldSince: number | null;
  queues: { up: Promise<void>; down: Promise<void> };
  held: { up: Buffer[]; down: Buffer[] };
  upstreamLocal?: string;
}

export class FaultProxy {
  private server!: Server;
  private pipes = new Set<Pipe>();
  private latencyMs = 0;
  private jitterMs = 0;
  private lossP = 0;
  private rtoMs = 300;
  private dark = false;
  private refusing = false;
  private localAddress: string | undefined;
  private giveUpTimer: NodeJS.Timeout | null = null;
  port = 0;
  host: string;
  /** Upstream source addresses used so far (what the server saw as the client address). */
  readonly sourceAddresses: string[] = [];
  readonly stats = { accepted: 0, refused: 0, synTimeouts: 0, resets: 0, bytesUp: 0, bytesDown: 0, retransmits: 0 };

  constructor(private opts: FaultProxyOptions) {
    this.host = opts.listenHost ?? '127.0.0.1';
  }

  get url() {
    return `http://${this.host}:${this.port}`;
  }

  async start(): Promise<this> {
    this.server = createServer((c) => this.accept(c));
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.opts.port ?? 0, this.host, () => resolve());
    });
    this.port = (this.server.address() as { port: number }).port;
    return this;
  }

  private target() {
    return typeof this.opts.target === 'function' ? this.opts.target() : this.opts.target;
  }

  private accept(client: Socket) {
    client.setNoDelay(true);
    if (this.refusing) {
      this.stats.refused++;
      client.resetAndDestroy();
      return;
    }
    this.stats.accepted++;
    const pipe: Pipe = { client, upstream: null, dead: false, heldSince: null, queues: { up: Promise.resolve(), down: Promise.resolve() }, held: { up: [], down: [] } };
    this.pipes.add(pipe);
    client.on('data', (d) => this.forward(pipe, 'up', d));
    const done = () => this.sideClosed(pipe, client);
    client.on('error', done);
    client.on('close', done);
    if (this.dark) {
      // SYN unanswered: the client's connect attempt times out
      pipe.heldSince = Date.now();
      setTimeout(() => {
        if (!pipe.upstream && this.pipes.has(pipe) && this.dark) {
          this.stats.synTimeouts++;
          this.close(pipe, true);
        }
      }, this.opts.synTimeoutMs ?? 20_000);
      return;
    }
    this.openUpstream(pipe);
  }

  private openUpstream(pipe: Pipe) {
    const t = this.target();
    if (!t) {
      this.stats.refused++;
      this.close(pipe, true);
      return;
    }
    const up = connect({ host: t.host, port: t.port, localAddress: this.localAddress });
    up.setNoDelay(true);
    pipe.upstream = up;
    up.on('connect', () => {
      pipe.upstreamLocal = up.localAddress;
      if (up.localAddress && !this.sourceAddresses.includes(up.localAddress)) this.sourceAddresses.push(up.localAddress);
    });
    up.on('data', (d) => this.forward(pipe, 'down', d));
    const done = () => this.sideClosed(pipe, up);
    up.on('error', done);
    up.on('close', done);
    // bytes the client sent while the connection attempt was held
    for (const d of pipe.held.up.splice(0)) this.forward(pipe, 'up', d);
  }

  private forward(pipe: Pipe, dir: 'up' | 'down', data: Buffer) {
    if (pipe.dead) return; // black hole: dropped silently, nobody is told
    if (this.dark || !pipe.upstream) {
      pipe.held[dir].push(data);
      pipe.heldSince ??= Date.now();
      return;
    }
    let delay = this.latencyMs + (this.jitterMs ? Math.random() * this.jitterMs : 0);
    if (this.lossP && Math.random() < this.lossP) {
      delay += this.rtoMs; // retransmission after the RTO, everything behind it waits
      this.stats.retransmits++;
    }
    const send = () => {
      if (pipe.dead || !this.pipes.has(pipe)) return;
      if (this.dark) {
        pipe.held[dir].push(data);
        pipe.heldSince ??= Date.now();
        return;
      }
      const dst = dir === 'up' ? pipe.upstream : pipe.client;
      if (!dst || dst.destroyed) return;
      dst.write(data);
      if (dir === 'up') this.stats.bytesUp += data.length;
      else this.stats.bytesDown += data.length;
    };
    if (!delay) {
      // keep order behind anything still delayed
      pipe.queues[dir] = pipe.queues[dir].then(send);
      return;
    }
    pipe.queues[dir] = pipe.queues[dir].then(() => new Promise<void>((r) => setTimeout(() => (send(), r()), delay)));
  }

  /** One end closed. Normally the other end is closed too; across a black hole the other end is never told. */
  private sideClosed(pipe: Pipe, side: Socket) {
    if (this.dark && !pipe.dead) {
      // the FIN/RST cannot cross the dark link; the peer finds out when the link is back
      side.destroy();
      pipe.brokenInOutage = true;
      return;
    }
    if (pipe.dead) {
      side.destroy();
      if (pipe.client.destroyed && (!pipe.upstream || pipe.upstream.destroyed)) this.pipes.delete(pipe);
      return;
    }
    this.close(pipe);
  }

  private close(pipe: Pipe, rst = false) {
    if (!this.pipes.delete(pipe)) return;
    if (rst) {
      pipe.client.resetAndDestroy();
      pipe.upstream?.resetAndDestroy();
    } else {
      pipe.client.destroy();
      pipe.upstream?.destroy();
    }
  }

  // ---------------------------------------------------------------- fault controls
  latency(ms: number, jitterMs = 0) {
    this.latencyMs = ms;
    this.jitterMs = jitterMs;
    return this;
  }

  loss(p: number, rtoMs = 300) {
    this.lossP = p;
    this.rtoMs = rtoMs;
    return this;
  }

  outage() {
    this.dark = true;
    const giveUp = this.opts.tcpGiveUpMs;
    if (giveUp) {
      this.giveUpTimer = setInterval(() => {
        for (const p of [...this.pipes]) if (p.heldSince && Date.now() - p.heldSince > giveUp) this.close(p, true);
      }, 500);
    }
    return this;
  }

  restore() {
    this.dark = false;
    if (this.giveUpTimer) clearInterval(this.giveUpTimer);
    this.giveUpTimer = null;
    for (const p of [...this.pipes]) {
      if (p.dead) continue;
      if (p.brokenInOutage) {
        this.close(p, true);
        continue;
      }
      p.heldSince = null;
      if (!p.upstream) {
        this.openUpstream(p);
        continue;
      }
      for (const d of p.held.up.splice(0)) this.forward(p, 'up', d);
      for (const d of p.held.down.splice(0)) this.forward(p, 'down', d);
    }
    return this;
  }

  reset() {
    for (const p of [...this.pipes]) {
      this.stats.resets++;
      this.close(p, true);
    }
    return this;
  }

  refuse(on: boolean) {
    this.refusing = on;
    return this;
  }

  switchNetwork(localAddress: string) {
    for (const p of this.pipes) p.dead = true;
    this.localAddress = localAddress;
    return this;
  }

  /** Live connections (not black-holed). */
  connections() {
    return [...this.pipes].filter((p) => !p.dead).length;
  }

  async stop() {
    if (this.giveUpTimer) clearInterval(this.giveUpTimer);
    for (const p of [...this.pipes]) this.close(p, true);
    await new Promise<void>((r) => this.server.close(() => r()));
  }
}
