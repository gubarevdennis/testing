import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import fstatic from '@fastify/static';
import compress from '@fastify/compress';
import swagger from '@fastify/swagger';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type pg from 'pg';
import pino, { type Logger } from 'pino';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import type { Config } from './config.js';
import { AppError, unauthorized, forbidden } from './lib/errors.js';
import { lookupSession, lookupApiToken, type SessionInfo } from './auth/sessions.js';
import type { AuthUser } from './acl/engine.js';
import { EventBus } from './lib/events.js';
import { isConnectionError } from './db/pool.js';
import { createDenialLogger } from './services/denials.js';
import { CollabHub } from './collab/hub.js';
import { createMetrics, type Metrics } from './observability/metrics.js';
import { clamdPing } from './services/antivirus.js';
import { SharedRateLimiter, rateLimitStore } from './services/rate-limit.js';
import { Tracer, parseTraceparent, parseOtlpHeaders, type Span } from './observability/tracing.js';
import type { BlobStore } from './storage/blob-store.js';
import type { AuditActor } from './services/audit.js';
import { safeEqual } from './lib/crypto.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
    session: SessionInfo | null;
    correlationId: string;
    span: Span | null;
  }
  interface FastifyInstance {
    /** Rate-limit counters shared by all instances (services/rate-limit.ts, SEC-L4). */
    sharedLimiter: SharedRateLimiter;
  }
}

export interface Services {
  cfg: Config;
  db: pg.Pool;
  log: Logger;
  bus: EventBus;
  hub: CollabHub;
  metrics: Metrics;
  store: BlobStore;
  tracer: Tracer;
}

export const SESSION_COOKIE = 'kb_session';
export const CSRF_COOKIE = 'kb_csrf';

export function actorOf(req: FastifyRequest): AuditActor {
  return { userId: req.user?.id ?? null, name: req.user?.name ?? null, orgId: req.user?.orgId ?? null, sessionId: req.session?.id ?? null, ip: req.ip, correlationId: req.correlationId };
}

export function requireUser(req: FastifyRequest): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new AppError(400, 'validation_error', 'Некорректные данные запроса', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return r.data;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function buildApp(base: Omit<Services, 'hub' | 'bus' | 'metrics' | 'tracer'> & { metrics?: Metrics; tracer?: Tracer }): Promise<{ app: FastifyInstance; services: Services }> {
  const metrics = base.metrics ?? createMetrics();
  const tracer = base.tracer ?? new Tracer({ serviceName: base.cfg.tracing?.serviceName ?? 'kb', endpoint: base.cfg.tracing?.endpoint ?? null, headers: parseOtlpHeaders(base.cfg.tracing?.headers), log: base.log });
  const bus = new EventBus(base.db, base.log);
  await bus.start();
  const hub = new CollabHub(base.db, base.log, bus, metrics);
  const services: Services = { ...base, metrics, bus, hub, tracer };
  metrics.setAntivirusProbe(async () => (base.cfg.clamavHost ? ((await clamdPing(base.cfg.clamavHost)) ? 1 : 0) : null));

  const app = Fastify({
    loggerInstance: base.log as any,
    // Never `true`: with every hop trusted the client picks its own address via X-Forwarded-For (DAST finding).
    trustProxy: typeof base.cfg.trustProxy === 'number' ? ((_addr: string, hop: number) => hop < (base.cfg.trustProxy as number)) : (base.cfg.trustProxy ?? false),
    maxParamLength: 2000,
    bodyLimit: 20 * 1024 * 1024,
    genReqId: (req) => (req.headers['x-correlation-id'] as string)?.slice(0, 64) || randomUUID(),
    disableRequestLogging: base.cfg.env === 'test',
  });

  app.decorateRequest('user', null);
  app.decorateRequest('session', null);
  app.decorateRequest('correlationId', '');
  app.decorateRequest('span', null);

  // Tracing first, so that rejected requests (401/403/429) are traced too (R-OPS-003).
  app.addHook('onRequest', async (req, reply) => {
    const span = tracer.startSpan(`${req.method} ${req.routeOptions?.url ?? 'unknown'}`, {
      parent: parseTraceparent(req.headers.traceparent),
      kind: 'server',
      attributes: { 'http.request.method': req.method, 'url.path': req.url.split('?')[0].slice(0, 300), 'http.route': req.routeOptions?.url ?? null, 'kb.correlation_id': String(req.id) },
    });
    req.span = span;
    tracer.als.enterWith(span);
    reply.header('traceparent', span.traceparent());
    req.log = req.log.child({ traceId: span.traceId, spanId: span.spanId });
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        // SEC-L1: no hot-linked pictures — pasted/imported images of other sites are copied to this server
        // (attachments/from-url, services/remote-fetch.ts); the browser never contacts another site for an image.
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'", 'data:'],
        // same-origin previews (PDF/video) and the allow-listed video providers rendered by the embed block
        frameSrc: ["'self'", 'https://www.youtube-nocookie.com', 'https://rutube.ru', 'https://vk.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        workerSrc: ["'self'", 'blob:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cookie);
  // Compression only for the client bundle and static documents (Lighthouse: 470 KB of JS went uncompressed).
  // JSON API responses are excluded: they mix secrets (CSRF token, content) with reflected input (BREACH).
  await app.register(compress, { global: true, threshold: 1024, encodings: ['br', 'gzip'], customTypes: /^(?:text\/(?:css|javascript|html)|application\/(?:javascript|wasm|manifest\+json)|image\/svg\+xml|font\/ttf)(?:;|$)/ });
  // SEC-L4: routes with `distributed: true` (sign-in, public-link passwords, uploads) count in PostgreSQL across instances.
  const sharedLimiter = new SharedRateLimiter(base.db, base.log);
  app.addHook('onClose', async () => sharedLimiter.stop());
  app.decorate('sharedLimiter', sharedLimiter);
  await app.register(rateLimit, {
    store: rateLimitStore(sharedLimiter) as any,
    max: base.cfg.rateLimitPerMinute,
    timeWindow: '1 minute',
    keyGenerator: (req) => (req.headers.cookie?.match(/kb_session=([^;]+)/)?.[1] ?? req.ip),
    errorResponseBuilder: (_req, ctx) => ({ statusCode: 429, error: { code: 'rate_limited', message: `Слишком много запросов. Повторите через ${Math.ceil(ctx.ttl / 1000)} с.` } }),
  });
  await app.register(multipart, { limits: { fileSize: base.cfg.maxUploadBytes, files: 50 } });
  await app.register(websocket, { options: { maxPayload: 16 * 1024 * 1024 } });

  // Authentication: session cookie or Bearer API token. CSRF: double submit token for cookie-authenticated mutations.
  app.addHook('onRequest', async (req, reply) => {
    req.correlationId = String(req.id);
    reply.header('x-correlation-id', req.correlationId);
    const auth = req.headers.authorization;
    // /metrics has its own bearer token (METRICS_TOKEN, checked in routes/health.ts); it is not an API token.
    if (auth?.startsWith('Bearer ') && req.url.split('?')[0] !== '/metrics') {
      const user = await lookupApiToken(base.db, auth.slice(7).trim());
      if (!user) throw unauthorized('Недействительный токен API');
      req.user = user;
      return;
    }
    const token = req.cookies[SESSION_COOKIE];
    if (token) {
      const s = await lookupSession(base.db, token, base.cfg.sessionIdleHours);
      if (s) {
        req.user = s.user;
        req.session = s.session;
      }
    }
    // Public-link pages (/pub/…) never use the session, so they need no CSRF token (their forms are anonymous).
    if (req.url.startsWith('/pub/')) return;
    if (!SAFE_METHODS.has(req.method) && req.session && !req.url.startsWith('/api/v1/auth/login')) {
      const header = req.headers['x-csrf-token'];
      if (typeof header !== 'string' || !safeEqual(header, req.session.csrfToken)) throw forbidden('Проверка CSRF не пройдена — обновите страницу');
    }
    // Pending MFA: only MFA endpoints are allowed.
    if (req.session && !req.session.mfaPassed && !req.url.startsWith('/api/v1/auth/')) throw unauthorized('Требуется подтверждение второго фактора');
  });

  // API responses carry personal/ACL-filtered data: never store them in shared or browser caches (ASVS 8.2.1, DAST
  // finding). Routes that set their own policy (attachments with ETag, public pages) keep it.
  app.addHook('onSend', async (req, reply, payload) => {
    if (req.url.startsWith('/api/') && !reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store');
    return payload;
  });

  app.addHook('onResponse', async (req, reply) => {
    const route = req.routeOptions?.url ?? 'unknown';
    metrics.httpDuration.labels(req.method, route, String(reply.statusCode)).observe(reply.elapsedTime / 1000);
    if (req.span) {
      req.span.setAttribute('http.response.status_code', reply.statusCode);
      if (req.user) req.span.setAttribute('enduser.id', req.user.id);
      req.span.end(reply.statusCode >= 500 ? 'error' : 'ok');
    }
  });

  const logDenial = createDenialLogger(base.db, base.log);
  app.setErrorHandler((err: any, req, reply) => {
    req.span?.recordError(err);
    if (err instanceof AppError) {
      if (err.status >= 500) req.log.error({ err }, err.message);
      if (err.status === 403) logDenial(req, err.message);
      if (err.status === 404 && req.user && req.url.startsWith('/api/')) logDenial(req, err.message, 'not_found');
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details }, correlationId: req.correlationId });
    }
    if (err instanceof ZodError) return reply.status(400).send({ error: { code: 'validation_error', message: 'Некорректные данные запроса', details: err.issues }, correlationId: req.correlationId });
    if (err.statusCode === 429) return reply.status(429).send({ error: { code: 'rate_limited', message: 'Слишком много запросов' }, correlationId: req.correlationId });
    if (err.code === 'FST_REQ_FILE_TOO_LARGE' || err.code === 'FST_ERR_CTP_BODY_TOO_LARGE')
      return reply.status(413).send({ error: { code: 'too_large', message: 'Превышен допустимый размер' }, correlationId: req.correlationId });
    if (err.validation || err.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' || err.code === 'FST_ERR_CTP_EMPTY_JSON_BODY' || err.statusCode === 400)
      return reply.status(400).send({ error: { code: 'bad_request', message: err.message }, correlationId: req.correlationId });
    if (err.code === '22P02') return reply.status(400).send({ error: { code: 'bad_request', message: 'Некорректный идентификатор' }, correlationId: req.correlationId });
    // Other PostgreSQL data exceptions caused by client input (NUL bytes, bad dates, numbers out of range, overlong
    // values): the request is wrong, not the server (DAST: these used to be 500).
    if (typeof err.code === 'string' && /^22(P05|021|001|003|007|008|023|01B)$/.test(err.code))
      return reply.status(400).send({ error: { code: 'bad_request', message: 'Некорректные данные запроса' }, correlationId: req.correlationId });
    if (isConnectionError(err)) {
      req.log.error({ err }, 'database unavailable');
      return reply
        .status(503)
        .header('retry-after', '5')
        .send({ error: { code: 'db_unavailable', message: 'База данных временно недоступна. Изменение не сохранено — повторите попытку через несколько секунд.' }, correlationId: req.correlationId });
    }
    // Client errors raised by plugins (e.g. @fastify/static refusing a traversal path with 403): keep the status,
    // never the plugin's message or stack (DAST: these used to be 500).
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500)
      return reply.status(err.statusCode).send({ error: { code: err.statusCode === 403 ? 'forbidden' : err.statusCode === 404 ? 'not_found' : 'bad_request', message: 'Запрос отклонён' }, correlationId: req.correlationId });
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send({ error: { code: 'internal', message: 'Внутренняя ошибка сервера. Данные не изменены, если операция не была подтверждена.' }, correlationId: req.correlationId });
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/assets/')) return reply.status(404).send({ error: { code: 'not_found', message: 'Не найдено' }, correlationId: req.correlationId });
    if (services.cfg.webDist && existsSync(join(services.cfg.webDist, 'index.html'))) return reply.type('text/html').sendFile('index.html', services.cfg.webDist);
    return reply.status(404).send('Not found');
  });

  // OpenAPI description generated from the registered routes (schemas are validated with zod inside handlers,
  // so operations are listed with paths, methods and parameters only).
  await app.register(swagger, {
    openapi: {
      info: { title: 'Корпоративная база знаний — API', version: '1' },
      components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE }, token: { type: 'http', scheme: 'bearer' } } },
      security: [{ session: [] }, { token: [] }],
    },
  });
  app.get('/api/v1/openapi.json', { schema: { hide: true } as any, config: { rateLimit: false } as any }, async () => app.swagger());

  const routes = await import('./routes/index.js');
  await routes.registerRoutes(app, services);

  if (base.cfg.webDist && existsSync(base.cfg.webDist)) {
    await app.register(fstatic, {
      root: base.cfg.webDist,
      wildcard: true, // serve files present on disk now (new releases without restart)
      setHeaders: (res: any, path: string) => {
        const set = (k: string, v: string) => (typeof res.setHeader === 'function' ? res.setHeader(k, v) : res.header(k, v));
        set('cache-control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  }

  app.addHook('onClose', async () => {
    await hub.shutdown();
    await bus.stop();
    await tracer.shutdown();
  });

  return { app, services };
}

export function createLogger(cfg: Config): Logger {
  return pino({
    level: cfg.logLevel,
    redact: { paths: ['req.headers.cookie', 'req.headers.authorization', 'password', '*.password', 'token', '*.token', 'mfaSecret'], censor: '[redacted]' },
    ...(cfg.env === 'development' ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
  });
}

export type Reply = FastifyReply;
