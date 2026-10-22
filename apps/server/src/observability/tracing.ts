/**
 * Distributed tracing (R-OPS-003, R-OPS-022): W3C Trace Context propagation and OpenTelemetry export (OTLP/HTTP JSON).
 *
 * Every HTTP request and background job is a span. An incoming `traceparent` header continues the caller's trace
 * (reverse proxy, another service, a browser with tracing), the response carries the server span's `traceparent`,
 * and the trace id is written into the request log next to the correlation id. When
 * OTEL_EXPORTER_OTLP_ENDPOINT is set, finished spans are batched to `<endpoint>/v1/traces` — any OpenTelemetry
 * Collector, Jaeger, Tempo or similar accepts this format. Without an endpoint ids are still generated for logs.
 * Export never blocks or fails requests: the buffer is bounded and send errors are only logged.
 */
import { randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Logger } from 'pino';

export interface SpanContext {
  traceId: string;
  spanId: string;
  sampled: boolean;
}

type AttrValue = string | number | boolean;

export interface Span extends SpanContext {
  parentSpanId: string | null;
  name: string;
  kind: 'server' | 'internal' | 'client' | 'consumer';
  setAttribute(key: string, value: AttrValue | null | undefined): void;
  recordError(err: unknown): void;
  end(status?: 'ok' | 'error'): void;
  traceparent(): string;
}

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

export function parseTraceparent(header: unknown): SpanContext | null {
  if (typeof header !== 'string') return null;
  const m = TRACEPARENT.exec(header.trim().toLowerCase());
  if (!m || /^0+$/.test(m[1]) || /^0+$/.test(m[2])) return null;
  return { traceId: m[1], spanId: m[2], sampled: (parseInt(m[3], 16) & 1) === 1 };
}

export function formatTraceparent(c: SpanContext): string {
  return `00-${c.traceId}-${c.spanId}-${c.sampled ? '01' : '00'}`;
}

const KIND: Record<Span['kind'], number> = { internal: 1, server: 2, client: 3, consumer: 5 };

interface Finished {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  kind: number;
  start: bigint;
  end: bigint;
  attributes: Record<string, AttrValue>;
  status: 'ok' | 'error' | 'unset';
  error?: string;
}

const nowNs = () => BigInt(Date.now()) * 1_000_000n + (process.hrtime.bigint() % 1_000_000n);

export interface TracerOptions {
  serviceName: string;
  serviceVersion?: string;
  /** Base URL of an OTLP/HTTP receiver (e.g. http://otel-collector:4318); null = do not export. */
  endpoint: string | null;
  headers?: Record<string, string>;
  log?: Logger;
  flushIntervalMs?: number;
  maxQueue?: number;
}

export class Tracer {
  private queue: Finished[] = [];
  private timer: NodeJS.Timeout | null = null;
  private sending: Promise<void> | null = null;
  readonly als = new AsyncLocalStorage<Span>();
  dropped = 0;
  exported = 0;

  constructor(private opts: TracerOptions) {
    if (opts.endpoint) {
      this.timer = setInterval(() => void this.flush(), opts.flushIntervalMs ?? 2000);
      this.timer.unref();
    }
  }

  get enabled() {
    return !!this.opts.endpoint;
  }

  /** The span of the current async context (request or job), if any. */
  current(): Span | undefined {
    return this.als.getStore();
  }

  startSpan(name: string, o: { parent?: SpanContext | null; kind?: Span['kind']; attributes?: Record<string, AttrValue | null | undefined> } = {}): Span {
    const parent = o.parent === undefined ? this.current() ?? null : o.parent;
    const traceId = parent?.traceId ?? randomBytes(16).toString('hex');
    const spanId = randomBytes(8).toString('hex');
    const sampled = parent?.sampled ?? true;
    const start = nowNs();
    const attributes: Record<string, AttrValue> = {};
    let ended = false;
    let error: string | undefined;
    const span: Span = {
      traceId,
      spanId,
      sampled,
      parentSpanId: parent?.spanId ?? null,
      name,
      kind: o.kind ?? 'internal',
      setAttribute: (k, v) => {
        if (v !== null && v !== undefined) attributes[k] = v;
      },
      recordError: (err) => {
        error = String((err as Error)?.message ?? err).slice(0, 500);
      },
      end: (status) => {
        if (ended) return;
        ended = true;
        if (!sampled || !this.opts.endpoint) return;
        if (this.queue.length >= (this.opts.maxQueue ?? 5000)) {
          this.dropped++;
          return;
        }
        this.queue.push({ traceId, spanId, parentSpanId: span.parentSpanId, name, kind: KIND[span.kind], start, end: nowNs(), attributes, status: status ?? (error ? 'error' : 'unset'), error });
        if (this.queue.length >= 512) void this.flush();
      },
      traceparent: () => formatTraceparent({ traceId, spanId, sampled }),
    };
    for (const [k, v] of Object.entries(o.attributes ?? {})) span.setAttribute(k, v);
    return span;
  }

  /** Runs `fn` inside a span (child of the current one); errors mark the span and are re-thrown. */
  async withSpan<T>(name: string, o: Parameters<Tracer['startSpan']>[1], fn: (span: Span) => Promise<T>): Promise<T> {
    const span = this.startSpan(name, o);
    try {
      const r = await this.als.run(span, () => fn(span));
      span.end(); // 'error' if fn recorded one, otherwise unset
      return r;
    } catch (e) {
      span.recordError(e);
      span.end('error');
      throw e;
    }
  }

  /** Sends buffered spans (OTLP/HTTP JSON). Resolves when the batch was sent or failed. */
  async flush(): Promise<void> {
    if (!this.opts.endpoint || !this.queue.length) return this.sending ?? undefined;
    if (this.sending) await this.sending;
    const batch = this.queue.splice(0, this.queue.length);
    if (!batch.length) return;
    const attr = (k: string, v: AttrValue) => ({ key: k, value: typeof v === 'number' ? (Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v }) : typeof v === 'boolean' ? { boolValue: v } : { stringValue: v } });
    const body = {
      resourceSpans: [
        {
          resource: { attributes: [attr('service.name', this.opts.serviceName), attr('service.version', this.opts.serviceVersion ?? '1.0.0'), attr('telemetry.sdk.name', 'kb-tracing'), attr('telemetry.sdk.language', 'nodejs')] },
          scopeSpans: [
            {
              scope: { name: 'kb', version: '1' },
              spans: batch.map((s) => ({
                traceId: s.traceId,
                spanId: s.spanId,
                ...(s.parentSpanId ? { parentSpanId: s.parentSpanId } : {}),
                name: s.name,
                kind: s.kind,
                startTimeUnixNano: String(s.start),
                endTimeUnixNano: String(s.end),
                attributes: Object.entries(s.attributes).map(([k, v]) => attr(k, v)),
                status: s.status === 'error' ? { code: 2, message: s.error ?? '' } : s.status === 'ok' ? { code: 1 } : {},
              })),
            },
          ],
        },
      ],
    };
    const url = this.opts.endpoint.replace(/\/+$/, '') + '/v1/traces';
    this.sending = fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(this.opts.headers ?? {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        this.exported += batch.length;
      })
      .catch((err) => {
        this.dropped += batch.length;
        this.opts.log?.warn({ err: String(err?.message ?? err), spans: batch.length }, 'trace export failed');
      })
      .finally(() => {
        this.sending = null;
      });
    return this.sending;
  }

  async shutdown() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.flush();
  }
}

/** OTEL_EXPORTER_OTLP_HEADERS ("k1=v1,k2=v2") as a header map. */
export function parseOtlpHeaders(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (raw ?? '').split(',')) {
    const i = part.indexOf('=');
    if (i > 0) out[decodeURIComponent(part.slice(0, i).trim())] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
