import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import fstatic from '@fastify/static';
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
import { CollabHub } from './collab/hub.js';
import { createMetrics, type Metrics } from './observability/metrics.js';
import type { BlobStore } from './storage/blob-store.js';
import type { AuditActor } from './services/audit.js';
import { safeEqual } from './lib/crypto.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
    session: SessionInfo | null;
    correlationId: string;
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

export async function buildApp(base: Omit<Services, 'hub' | 'bus' | 'metrics'> & { metrics?: Metrics }): Promise<{ app: FastifyInstance; services: Services }> {
  const metrics = base.metrics ?? createMetrics();
  const bus = new EventBus(base.db, base.log);
  await bus.start();
  const hub = new CollabHub(base.db, base.log, bus, metrics);
  const services: Services = { ...base, metrics, bus, hub };

  const app = Fastify({
    loggerInstance: base.log as any,
    trustProxy: true,
    bodyLimit: 20 * 1024 * 1024,
    genReqId: (req) => (req.headers['x-correlation-id'] as string)?.slice(0, 64) || randomUUID(),
    disableRequestLogging: base.cfg.env === 'test',
  });

  app.decorateRequest('user', null);
  app.decorateRequest('session', null);
  app.decorateRequest('correlationId', '');

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        fontSrc: ["'self'", 'data:'],
        frameSrc: ["'none'"],
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
  await app.register(rateLimit, {
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
    if (auth?.startsWith('Bearer ')) {
      const user = await lookupApiToken(base.db, auth.slice(7).trim());
      if (!user) throw unauthorized('Недействительный токен API');
      req.user = user;
      return;
    }
    const token = req.cookies[SESSION_COOKIE];
    if (token) {
      const s = await lookupSession(base.db, token);
      if (s) {
        req.user = s.user;
        req.session = s.session;
      }
    }
    if (!SAFE_METHODS.has(req.method) && req.session && !req.url.startsWith('/api/v1/auth/login')) {
      const header = req.headers['x-csrf-token'];
      if (typeof header !== 'string' || !safeEqual(header, req.session.csrfToken)) throw forbidden('Проверка CSRF не пройдена — обновите страницу');
    }
    // Pending MFA: only MFA endpoints are allowed.
    if (req.session && !req.session.mfaPassed && !req.url.startsWith('/api/v1/auth/')) throw unauthorized('Требуется подтверждение второго фактора');
  });

  app.addHook('onResponse', async (req, reply) => {
    const route = req.routeOptions?.url ?? 'unknown';
    metrics.httpDuration.labels(req.method, route, String(reply.statusCode)).observe(reply.elapsedTime / 1000);
  });

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof AppError) {
      if (err.status >= 500) req.log.error({ err }, err.message);
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details }, correlationId: req.correlationId });
    }
    if (err instanceof ZodError) return reply.status(400).send({ error: { code: 'validation_error', message: 'Некорректные данные запроса', details: err.issues }, correlationId: req.correlationId });
    if (err.statusCode === 429) return reply.status(429).send({ error: { code: 'rate_limited', message: 'Слишком много запросов' }, correlationId: req.correlationId });
    if (err.code === 'FST_REQ_FILE_TOO_LARGE' || err.code === 'FST_ERR_CTP_BODY_TOO_LARGE')
      return reply.status(413).send({ error: { code: 'too_large', message: 'Превышен допустимый размер' }, correlationId: req.correlationId });
    if (err.validation || err.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' || err.code === 'FST_ERR_CTP_EMPTY_JSON_BODY' || err.statusCode === 400)
      return reply.status(400).send({ error: { code: 'bad_request', message: err.message }, correlationId: req.correlationId });
    if (err.code === '22P02') return reply.status(400).send({ error: { code: 'bad_request', message: 'Некорректный идентификатор' }, correlationId: req.correlationId });
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send({ error: { code: 'internal', message: 'Внутренняя ошибка сервера. Данные не изменены, если операция не была подтверждена.' }, correlationId: req.correlationId });
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.status(404).send({ error: { code: 'not_found', message: 'Не найдено' }, correlationId: req.correlationId });
    if (services.cfg.webDist && existsSync(join(services.cfg.webDist, 'index.html'))) return reply.type('text/html').sendFile('index.html', services.cfg.webDist);
    return reply.status(404).send('Not found');
  });

  const routes = await import('./routes/index.js');
  await routes.registerRoutes(app, services);

  if (base.cfg.webDist && existsSync(base.cfg.webDist)) {
    await app.register(fstatic, {
      root: base.cfg.webDist,
      wildcard: false,
      setHeaders: (res: any, path: string) => {
        if (path.includes('/assets/')) res.setHeader('cache-control', 'public, max-age=31536000, immutable');
        else res.setHeader('cache-control', 'no-cache');
      },
    });
  }

  app.addHook('onClose', async () => {
    await hub.shutdown();
    await bus.stop();
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
