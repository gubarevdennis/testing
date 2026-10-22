import { resolve } from 'node:path';

function env(name: string, def?: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (def === undefined) throw new Error(`Missing required environment variable ${name}`);
    return def;
  }
  return v;
}
const int = (name: string, def: number) => Number.parseInt(env(name, String(def)), 10);
const bool = (name: string, def: boolean) => ['1', 'true', 'yes', 'on'].includes(env(name, String(def)).toLowerCase());

export interface Config {
  env: 'development' | 'test' | 'production';
  port: number;
  host: string;
  publicUrl: string;
  databaseUrl: string;
  dbPoolSize: number;
  storage: { driver: 'fs' | 's3'; root: string; s3?: { endpoint?: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean } };
  secretKey: string;
  sessionTtlHours: number;
  cookieSecure: boolean;
  maxUploadBytes: number;
  maxImportBytes: number;
  webDist: string | null;
  workerEnabled: boolean;
  workerConcurrency: number;
  ocrEnabled: boolean;
  tessdataDir: string;
  chromiumPath: string | null;
  oidc: { issuer: string; clientId: string; clientSecret: string; redirectUri: string } | null;
  logLevel: string;
  retention: { trashDays: number; journalDays: number; revisionDays: number };
  /** Stored files re-hashed per maintenance run (hourly). */
  integrityBatch: number;
  rateLimitPerMinute: number;
  authRateLimitPerMinute: number;
  clamavHost: string | null;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const nodeEnv = env('NODE_ENV', 'development') as Config['env'];
  const dataDir = resolve(env('KB_DATA_DIR', '.data'));
  const cfg: Config = {
    env: nodeEnv,
    port: int('PORT', 8080),
    host: env('HOST', '0.0.0.0'),
    publicUrl: env('PUBLIC_URL', 'http://localhost:8080'),
    databaseUrl: env('DATABASE_URL', 'postgres://kb:kb@localhost:5432/kb'),
    dbPoolSize: int('DB_POOL_SIZE', 20),
    storage:
      env('STORAGE_DRIVER', 'fs') === 's3'
        ? {
            driver: 's3',
            root: resolve(dataDir, 'tmp'),
            s3: {
              endpoint: process.env.S3_ENDPOINT,
              region: env('S3_REGION', 'us-east-1'),
              bucket: env('S3_BUCKET'),
              accessKeyId: env('S3_ACCESS_KEY_ID'),
              secretAccessKey: env('S3_SECRET_ACCESS_KEY'),
              forcePathStyle: bool('S3_FORCE_PATH_STYLE', true),
            },
          }
        : { driver: 'fs', root: resolve(env('STORAGE_ROOT', resolve(dataDir, 'objects'))) },
    secretKey: env('SECRET_KEY', nodeEnv === 'production' ? undefined : 'dev-insecure-secret-change-me-0123456789'),
    sessionTtlHours: int('SESSION_TTL_HOURS', 24 * 14),
    cookieSecure: bool('COOKIE_SECURE', nodeEnv === 'production'),
    maxUploadBytes: int('MAX_UPLOAD_MB', 512) * 1024 * 1024,
    maxImportBytes: int('MAX_IMPORT_MB', 1024) * 1024 * 1024,
    webDist: process.env.WEB_DIST ? resolve(process.env.WEB_DIST) : null,
    workerEnabled: bool('WORKER_ENABLED', true),
    workerConcurrency: int('WORKER_CONCURRENCY', 2),
    ocrEnabled: bool('OCR_ENABLED', true),
    tessdataDir: env('TESSDATA_DIR', ''),
    chromiumPath: process.env.CHROMIUM_PATH || null,
    oidc: process.env.OIDC_ISSUER
      ? { issuer: env('OIDC_ISSUER'), clientId: env('OIDC_CLIENT_ID'), clientSecret: env('OIDC_CLIENT_SECRET'), redirectUri: env('OIDC_REDIRECT_URI', env('PUBLIC_URL', 'http://localhost:8080') + '/api/v1/auth/oidc/callback') }
      : null,
    logLevel: env('LOG_LEVEL', nodeEnv === 'test' ? 'warn' : 'info'),
    integrityBatch: int('INTEGRITY_BATCH', 500),
    retention: { trashDays: int('RETENTION_TRASH_DAYS', 90), journalDays: int('RETENTION_JOURNAL_DAYS', 90), revisionDays: int('RETENTION_REVISION_DAYS', 365) },
    rateLimitPerMinute: int('RATE_LIMIT_PER_MINUTE', 600),
    authRateLimitPerMinute: int('AUTH_RATE_LIMIT_PER_MINUTE', 30),
    clamavHost: process.env.CLAMAV_HOST || null,
  };
  if (cfg.env === 'production' && cfg.secretKey.length < 32) throw new Error('SECRET_KEY must be at least 32 characters in production');
  return { ...cfg, ...overrides };
}
