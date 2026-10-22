/** HTTP client for the server API: CSRF header, uniform errors, network failure detection. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: any,
    public correlationId?: string,
  ) {
    super(message);
  }
  get isNetwork() {
    return this.status === 0;
  }
}

function csrf(): string | null {
  const m = /(?:^|;\s*)kb_csrf=([^;]+)/.exec(document.cookie);
  return m ? decodeURIComponent(m[1]) : null;
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export async function api<T = any>(method: string, path: string, body?: unknown, opts: { signal?: AbortSignal; raw?: boolean; headers?: Record<string, string> } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (method !== 'GET') {
    const t = csrf();
    if (t) headers['x-csrf-token'] = t;
  }
  let payload: BodyInit | undefined;
  if (body instanceof FormData || body instanceof Blob) payload = body;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: payload, credentials: 'same-origin', signal: opts.signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'Нет связи с сервером. Проверьте подключение — изменения в документах сохраняются на устройстве.');
  }
  if (opts.raw) {
    if (!res.ok) throw await toError(res);
    return res as unknown as T;
  }
  if (!res.ok) {
    const err = await toError(res);
    if (res.status === 401 && onUnauthorized && !path.startsWith('/api/v1/auth/login')) onUnauthorized();
    throw err;
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  return (ct.includes('json') ? res.json() : res.text()) as Promise<T>;
}

async function toError(res: Response): Promise<ApiError> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* not json */
  }
  const msg = body?.error?.message ?? (res.status >= 500 ? 'Сервер временно недоступен. Повторите попытку.' : `Ошибка ${res.status}`);
  return new ApiError(res.status, body?.error?.code ?? 'http_' + res.status, msg, body?.error?.details, body?.correlationId);
}

export const get = <T = any>(p: string, signal?: AbortSignal) => api<T>('GET', p, undefined, { signal });
export const post = <T = any>(p: string, b?: unknown) => api<T>('POST', p, b ?? {});
export const put = <T = any>(p: string, b?: unknown) => api<T>('PUT', p, b ?? {});
export const patch = <T = any>(p: string, b?: unknown) => api<T>('PATCH', p, b ?? {});
export const del = <T = any>(p: string, b?: unknown) => api<T>('DELETE', p, b);

export function uuid(): string {
  return crypto.randomUUID();
}

/** Upload with progress (fetch has no upload progress). */
export function upload<T = any>(path: string, form: FormData, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    const t = csrf();
    if (t) xhr.setRequestHeader('x-csrf-token', t);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new ApiError(xhr.status, body?.error?.code ?? 'http_' + xhr.status, body?.error?.message ?? 'Не удалось загрузить файл', body?.error?.details));
    };
    xhr.onerror = () => reject(new ApiError(0, 'network', 'Нет связи с сервером — загрузку можно повторить'));
    xhr.onabort = () => reject(new DOMException('aborted', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}
