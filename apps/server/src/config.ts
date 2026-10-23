import { resolve } from 'node:path';
import { loadSecretFiles } from './lib/secret-files.js';

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
  sessionIdleHours: number;
  cookieSecure: boolean;
  maxUploadBytes: number;
  maxImportBytes: number;
  webDist: string | null;
  workerEnabled: boolean;
  workerConcurrency: number;
  ocrEnabled: boolean;
  tessdataDir: string;
  chromiumPath: string | null;
  oidc: {
    issuer: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    postLogoutRedirectUri?: string;
    scopes?: string;
    groupsClaim?: string | null;
    departmentClaim?: string | null;
    allowInsecure?: boolean;
  } | null;
  logLevel: string;
  retention: { trashDays: number; journalDays: number; revisionDays: number };
  /** Stored files re-hashed per maintenance run (hourly). */
  integrityBatch: number;
  rateLimitPerMinute: number;
  authRateLimitPerMinute: number;
  /** Uploads (attachments, imports, archives, images by URL) per minute per session/address, shared by all instances. */
  uploadRateLimitPerMinute: number;
  /** Which X-Forwarded-For hops to trust for the client address (rate limits, audit IP): false | hop count | address list. */
  trustProxy: boolean | number | string;
  clamavHost: string | null;
  /** clamd verdict deadline per file (CLAMAV_TIMEOUT_MS); a scan that does not finish in time rejects the file (fail closed). */
  clamavTimeoutMs: number;
  /** Server-side fetching of remote images (import): SSRF-guarded; private addresses are refused unless the host is allow-listed (R-SECURITY-008). */
  remoteFetch: { enabled: boolean; allowHosts: string[]; timeoutMs: number; maxBytes: number };
  /** Pending migrations on a database with data require a full backup this fresh (minutes); null = not enforced (R-OPS-001, R-OPS-004). */
  migrationBackupMaxAgeMinutes: number | null;
  /** OpenTelemetry trace export (OTLP/HTTP); endpoint null = trace ids for logs only (R-OPS-003). */
  tracing: { endpoint: string | null; serviceName: string; headers: string };
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  // <VAR>_FILE (Docker/Kubernetes secrets, Vault Agent templates, systemd credentials) → <VAR>; see lib/secret-files.ts.
  loadSecretFiles(process.env);
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
    sessionIdleHours: int('SESSION_IDLE_HOURS', 12),
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
      ? {
          issuer: env('OIDC_ISSUER'),
          clientId: env('OIDC_CLIENT_ID'),
          clientSecret: env('OIDC_CLIENT_SECRET'),
          redirectUri: env('OIDC_REDIRECT_URI', env('PUBLIC_URL', 'http://localhost:8080') + '/api/v1/auth/oidc/callback'),
          postLogoutRedirectUri: env('OIDC_POST_LOGOUT_REDIRECT_URI', env('PUBLIC_URL', 'http://localhost:8080') + '/'),
          scopes: env('OIDC_SCOPES', 'openid email profile'),
          groupsClaim: process.env.OIDC_GROUPS_CLAIM || null,
          departmentClaim: process.env.OIDC_DEPARTMENT_CLAIM || null,
          allowInsecure: bool('OIDC_ALLOW_INSECURE_HTTP', false),
        }
      : null,
    logLevel: env('LOG_LEVEL', nodeEnv === 'test' ? 'warn' : 'info'),
    integrityBatch: int('INTEGRITY_BATCH', 500),
    retention: { trashDays: int('RETENTION_TRASH_DAYS', 90), journalDays: int('RETENTION_JOURNAL_DAYS', 90), revisionDays: int('RETENTION_REVISION_DAYS', 365) },
    rateLimitPerMinute: int('RATE_LIMIT_PER_MINUTE', 600),
    authRateLimitPerMinute: int('AUTH_RATE_LIMIT_PER_MINUTE', 30),
    uploadRateLimitPerMinute: int('UPLOAD_RATE_LIMIT_PER_MINUTE', 120),
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    clamavHost: process.env.CLAMAV_HOST || null,
    clamavTimeoutMs: int('CLAMAV_TIMEOUT_MS', 60_000),
    remoteFetch: {
      enabled: bool('REMOTE_FETCH_ENABLED', true),
      allowHosts: (process.env.REMOTE_FETCH_ALLOW_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
      timeoutMs: int('REMOTE_FETCH_TIMEOUT_MS', 10_000),
      maxBytes: int('REMOTE_FETCH_MAX_MB', 20) * 1024 * 1024,
    },
    // "Any migration only with a backup": enforced by default in production, opt-in elsewhere.
    migrationBackupMaxAgeMinutes: bool('MIGRATION_REQUIRE_BACKUP', nodeEnv === 'production') ? int('MIGRATION_BACKUP_MAX_AGE_MIN', 180) : null,
    tracing: { endpoint: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.replace(/\/v1\/traces\/?$/, '') || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || null, serviceName: env('OTEL_SERVICE_NAME', 'kb'), headers: env('OTEL_EXPORTER_OTLP_HEADERS', '') },
  };
  if (cfg.env === 'production' && cfg.secretKey.length < 32) throw new Error('SECRET_KEY must be at least 32 characters in production');
  if (cfg.env === 'production' && (/change[_-]?me|example|placeholder|insecure|secret[_-]?key/i.test(cfg.secretKey) || new Set(cfg.secretKey).size < 10))
    throw new Error('SECRET_KEY looks like a placeholder; generate one with `openssl rand -base64 48`');
  if (cfg.env === 'production' && cfg.oidc && (cfg.oidc.allowInsecure || !cfg.oidc.issuer.startsWith('https://'))) throw new Error('OIDC_ISSUER must be https:// in production (OIDC_ALLOW_INSECURE_HTTP is for development only)');
  return { ...cfg, ...overrides };
}

/**
 * TRUST_PROXY: unset/"false" — the socket address is the client (direct exposure; X-Forwarded-For is ignored, so it
 * cannot be spoofed to dodge per-IP rate limits or forge audit IPs); a number — that many reverse proxies in front
 * (deploy: 1, nginx appends the real address); otherwise a list of proxy addresses/CIDRs ("10.0.0.5,loopback").
 * "true" (trust every hop) is accepted only for compatibility and is unsafe: the client controls the address.
 */
export function parseTrustProxy(raw: string | undefined): boolean | number | string {
  const v = (raw ?? '').trim();
  if (!v || v === 'false' || v === '0') return false;
  if (v === 'true') return true;
  if (/^\d+$/.test(v)) return Number(v);
  return v;
}
