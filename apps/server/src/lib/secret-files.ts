import { readFileSync, statSync } from 'node:fs';

/**
 * Secrets-manager integration (R-OPS-003, R-OPS-022): every secret environment variable can instead be given as
 * `<VAR>_FILE` = path of a file holding the value. This is the convention of Docker/Swarm secrets
 * (`/run/secrets/<name>`), Kubernetes secret volumes, Vault Agent / External Secrets / SOPS templates rendered to
 * tmpfs, and systemd `LoadCredential=` (`$CREDENTIALS_DIRECTORY/<name>`). The secret then never appears in the
 * process environment of the orchestrator, `docker inspect`, unit files or the shell history.
 *
 * Rules: one trailing newline is removed (templates and `echo` add one); an empty or oversized file, an unreadable
 * path, or both `<VAR>` and `<VAR>_FILE` set to different values are errors. Error messages name the variable and the
 * path, never the contents. The value is placed into `process.env[VAR]` so every consumer (config, /metrics token,
 * the CLI) sees one source of truth. Rotation: the file is read at start — restart the process after rotating
 * (Vault Agent `exec`/`command`, a Kubernetes rollout); sessions survive a restart.
 */
export const SECRET_ENV_VARS = [
  'SECRET_KEY',
  'DATABASE_URL',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'OIDC_CLIENT_SECRET',
  'METRICS_TOKEN',
  'OTEL_EXPORTER_OTLP_HEADERS',
] as const;

const MAX_SECRET_BYTES = 64 * 1024;

export class SecretFileError extends Error {}

/** Resolves `<VAR>_FILE` for the given secret names into `env[VAR]`. Returns the names that came from files. */
export function loadSecretFiles(env: NodeJS.ProcessEnv = process.env, names: readonly string[] = SECRET_ENV_VARS): string[] {
  const loaded: string[] = [];
  for (const name of names) {
    const path = env[`${name}_FILE`];
    if (path === undefined || path === '') continue;
    let size: number;
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- the path comes from the operator's own environment (<VAR>_FILE), never from a request
      size = statSync(path).size;
    } catch (e) {
      throw new SecretFileError(`${name}_FILE: cannot read ${path} (${(e as NodeJS.ErrnoException).code ?? 'error'})`);
    }
    if (size > MAX_SECRET_BYTES) throw new SecretFileError(`${name}_FILE: ${path} is larger than ${MAX_SECRET_BYTES} bytes — not a secret file?`);
    let value: string;
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- same operator-provided path as above
      value = readFileSync(path, 'utf8').replace(/\r?\n$/, '');
    } catch (e) {
      throw new SecretFileError(`${name}_FILE: cannot read ${path} (${(e as NodeJS.ErrnoException).code ?? 'error'})`);
    }
    if (!value) throw new SecretFileError(`${name}_FILE: ${path} is empty`);
    const direct = env[name];
    if (direct !== undefined && direct !== '' && direct !== value) throw new SecretFileError(`both ${name} and ${name}_FILE are set; use one of them`);
    env[name] = value;
    loaded.push(name);
  }
  return loaded;
}
