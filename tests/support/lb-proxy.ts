import { createServer, connect, type Server, type Socket } from 'node:net';
import { createHash } from 'node:crypto';

/**
 * Minimal HTTP/WebSocket load balancer for multi-instance tests (R-QA-034, docs/ARCHITECTURE.md §10), modelled on
 * deploy/nginx.conf:
 *   - 'round-robin' — every request (or WebSocket) to the next healthy instance: the worst case, no affinity at all;
 *   - 'page-hash'   — requests under /api/v1/collab/<pageId>… go to an instance chosen by rendezvous hashing of the
 *                     page id among healthy instances (nginx `hash … consistent`), everything else round-robin.
 * Requests are routed one by one: keep-alive is turned into `Connection: close` (WebSocket upgrades excepted), so a
 * reused client connection cannot pin later requests to one instance. Instances are health-checked (/healthz every
 * 250 ms); a refused connection marks the instance down at once and the request goes to the next one
 * (proxy_next_upstream). When an instance dies its connections are closed, so clients reconnect through the
 * balancer to a survivor.
 */
export interface Backend {
  name: string;
  host: string;
  port: number;
  up: boolean;
}

export class LoadBalancer {
  private server!: Server;
  private rr = 0;
  private health: NodeJS.Timeout | null = null;
  private sockets = new Set<Socket>();
  port = 0;
  readonly routed: Record<string, number> = {};

  constructor(
    readonly backends: Backend[],
    private mode: 'round-robin' | 'page-hash' = 'round-robin',
  ) {}

  get url() {
    return `http://127.0.0.1:${this.port}`;
  }

  async start(): Promise<this> {
    this.server = createServer((c) => this.accept(c));
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', () => r()));
    this.port = (this.server.address() as { port: number }).port;
    this.health = setInterval(() => void this.checkHealth(), 250);
    return this;
  }

  private async checkHealth() {
    await Promise.all(
      this.backends.map(async (b) => {
        try {
          const r = await fetch(`http://${b.host}:${b.port}/healthz`, { signal: AbortSignal.timeout(1000) });
          b.up = r.ok;
        } catch {
          b.up = false;
        }
      }),
    );
  }

  private choose(path: string, exclude: Set<Backend>): Backend | null {
    const healthy = this.backends.filter((b) => b.up && !exclude.has(b));
    if (!healthy.length) return null;
    const page = this.mode === 'page-hash' ? /^\/api\/v1\/collab\/([0-9a-fA-F-]{36})/.exec(path)?.[1] : undefined;
    if (page) {
      // rendezvous hashing: the page stays on its instance while that instance is healthy
      let best = healthy[0];
      let bestScore = -1;
      for (const b of healthy) {
        const score = createHash('sha1').update(page + '|' + b.name).digest().readUInt32BE(0);
        if (score > bestScore) [best, bestScore] = [b, score];
      }
      return best;
    }
    return healthy[this.rr++ % healthy.length];
  }

  private accept(client: Socket) {
    this.sockets.add(client);
    client.on('close', () => this.sockets.delete(client));
    client.on('error', () => client.destroy());
    let head = Buffer.alloc(0);
    const onData = (d: Buffer) => {
      head = Buffer.concat([head, d]);
      const end = head.indexOf('\r\n\r\n');
      if (end < 0) {
        if (head.length > 64 * 1024) client.destroy();
        return;
      }
      client.off('data', onData);
      client.pause();
      const headers = head.subarray(0, end).toString('latin1');
      const rest = head.subarray(end + 4);
      const [requestLine, ...lines] = headers.split('\r\n');
      const path = requestLine.split(' ')[1] ?? '/';
      const upgrade = lines.some((l) => /^upgrade:/i.test(l));
      const outHeaders = upgrade ? lines : [...lines.filter((l) => !/^connection:/i.test(l) && !/^keep-alive:/i.test(l)), 'Connection: close'];
      const out = Buffer.concat([Buffer.from([requestLine, ...outHeaders].join('\r\n') + '\r\n\r\n', 'latin1'), rest]);
      this.dial(client, path, out, new Set());
    };
    client.on('data', onData);
  }

  private dial(client: Socket, path: string, first: Buffer, tried: Set<Backend>) {
    const b = this.choose(path, tried);
    if (!b) {
      client.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      return;
    }
    const up = connect({ host: b.host, port: b.port });
    this.sockets.add(up);
    let connected = false;
    up.on('connect', () => {
      connected = true;
      this.routed[b.name] = (this.routed[b.name] ?? 0) + 1;
      up.write(first);
      client.pipe(up);
      up.pipe(client);
      client.resume();
    });
    up.on('error', () => {
      if (!connected) {
        // proxy_next_upstream: refused → instance down, try the next one
        b.up = false;
        tried.add(b);
        this.dial(client, path, first, tried);
        return;
      }
      client.destroy();
    });
    up.on('close', () => {
      this.sockets.delete(up);
      if (connected) client.destroy();
    });
    client.on('close', () => up.destroy());
  }

  async stop() {
    if (this.health) clearInterval(this.health);
    for (const s of this.sockets) s.destroy();
    await new Promise<void>((r) => this.server.close(() => r()));
  }
}
