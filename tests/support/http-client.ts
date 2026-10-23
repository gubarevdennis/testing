/** Minimal HTTP client for API tests: cookie jar, CSRF header, JSON. Free of vitest imports (used by scripts/security/dast.ts). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: any,
  ) {
    super(`HTTP ${status}: ${JSON.stringify(body)?.slice(0, 500)}`);
  }
}

/** Minimal HTTP client with a cookie jar and CSRF header handling. */
export class Api {
  cookies = new Map<string, string>();
  csrf: string | null = null;
  user: any = null;
  constructor(public base: string) {}

  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async raw(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { ...headers };
    if (this.cookies.size) h.cookie = this.cookieHeader();
    if (this.csrf && method !== 'GET') h['x-csrf-token'] = this.csrf;
    let payload: any = undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      h['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(this.base + path, { method, headers: h, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      const k = kv.slice(0, i);
      const v = kv.slice(i + 1);
      if (!v || /expires=Thu, 01 Jan 1970/i.test(c)) this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
    return res;
  }

  async req<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.raw(method, path, body);
    const text = await res.text();
    let data: any = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* not json */
    }
    if (!res.ok) throw new ApiError(res.status, data);
    return data as T;
  }

  get = <T = any>(p: string) => this.req<T>('GET', p);
  post = <T = any>(p: string, b?: unknown) => this.req<T>('POST', p, b ?? {});
  put = <T = any>(p: string, b?: unknown) => this.req<T>('PUT', p, b ?? {});
  patch = <T = any>(p: string, b?: unknown) => this.req<T>('PATCH', p, b ?? {});
  del = <T = any>(p: string, b?: unknown) => this.req<T>('DELETE', p, b);

  async login(email: string, password: string, totp?: string) {
    const r = await this.post('/api/v1/auth/login', { email, password, totp });
    if (r.csrfToken) this.csrf = r.csrfToken;
    this.user = r.user;
    return r;
  }
}
