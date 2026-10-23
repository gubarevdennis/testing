/**
 * A real, standards-compliant OpenID Provider for SSO tests: panva/oidc-provider (certified OP implementation) with a
 * minimal login page («Тестовый IdP»). Free of vitest/playwright imports: used by tests/integration/oidc-sso.test.ts and
 * tests/e2e/sso-oidc.spec.ts.
 *
 * - authorization code flow with PKCE required (S256), state/nonce, RS256-signed ID tokens, UserInfo, JWKS, discovery,
 *   RP-initiated logout (end_session_endpoint);
 * - accounts are in memory and can be changed while running (e.g. groups);
 * - `tamper` rewrites the ID token in the token endpoint response — re-signed with the IdP's own key (expired, wrong
 *   audience/issuer/nonce) or with a foreign key (bad signature) — to prove the relying party rejects such tokens.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
// oidc-provider ships no type declarations.
import Provider from 'oidc-provider';
import { decodeJwt, decodeProtectedHeader, exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';

export interface IdpAccount {
  sub: string;
  email: string;
  password: string;
  name?: string;
  email_verified?: boolean;
  groups?: string[];
  department?: string;
}

export interface IdpClient {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
  post_logout_redirect_uris?: string[];
}

export type Tamper = (payload: Record<string, unknown>) => { payload: Record<string, unknown>; foreignKey?: boolean };

export interface TestIdp {
  issuer: string;
  port: number;
  accounts: Map<string, IdpAccount>;
  /** Set to rewrite the next ID tokens issued by the token endpoint; null = untouched. */
  tamper: Tamper | null;
  /** Number of successful logouts at the end_session endpoint. */
  logouts: number;
  /** Requests to the token endpoint (code exchanges). */
  tokenRequests: number;
  setClients(clients: IdpClient[]): Promise<void>;
  close(): Promise<void>;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function page(title: string, body: string) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title><meta name="viewport" content="width=device-width"></head>
<body style="font-family:sans-serif;max-width:360px;margin:40px auto"><h1>${esc(title)}</h1>${body}</body></html>`;
}

async function readForm(req: IncomingMessage): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
}

export async function startIdp(opts: { port: number; clients: IdpClient[]; accounts: IdpAccount[]; host?: string }): Promise<TestIdp> {
  const host = opts.host ?? '127.0.0.1';
  const issuer = `http://${host}:${opts.port}`;
  const { privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk: JWK = { ...(await exportJWK(privateKey)), kid: 'kb-test-idp-1', alg: 'RS256', use: 'sig' };
  const foreign = (await generateKeyPair('RS256', { extractable: true })).privateKey;

  const accounts = new Map(opts.accounts.map((a) => [a.sub, a]));
  const state: TestIdp = {
    issuer,
    port: opts.port,
    accounts,
    tamper: null,
    logouts: 0,
    tokenRequests: 0,
    setClients: async () => undefined,
    close: async () => undefined,
  };

  const build = (clients: IdpClient[]) => {
    const configuration: Record<string, any> = {
      clients: clients.map((c) => ({ ...c, grant_types: ['authorization_code'], response_types: ['code'], token_endpoint_auth_method: 'client_secret_basic' })),
      jwks: { keys: [jwk as any] },
      cookies: { keys: ['kb-test-idp-cookie-key'] },
      pkce: { required: () => true },
      ttl: { Interaction: 600, Grant: 3600, Session: 3600, AccessToken: 600, IdToken: 600 },
      claims: { openid: ['sub'], email: ['email', 'email_verified'], profile: ['name'], groups: ['groups', 'department'] },
      scopes: ['openid', 'email', 'profile', 'groups', 'offline_access'],
      features: {
        devInteractions: { enabled: false },
        rpInitiatedLogout: {
          enabled: true,
          logoutSource: async (ctx: any, form: string) => {
            ctx.body = page('Выход из тестового IdP', `${form}<p>Завершить сеанс в IdP?</p><button type="submit" form="op.logoutForm" value="yes" name="logout">Выйти из IdP</button>`);
          },
          postLogoutSuccessSource: async (ctx: any) => {
            ctx.body = page('Вы вышли из тестового IdP', '<p>Сеанс завершён.</p>');
          },
        },
      },
      interactions: { url: (_ctx: unknown, interaction: { uid: string }) => `/interaction/${interaction.uid}` },
      findAccount: async (_ctx: unknown, sub: string) => {
        const a = accounts.get(sub);
        if (!a) return undefined;
        return {
          accountId: sub,
          claims: async () => ({
            sub,
            email: a.email,
            email_verified: a.email_verified ?? true,
            name: a.name ?? a.email,
            ...(a.groups ? { groups: a.groups } : {}),
            ...(a.department ? { department: a.department } : {}),
          }),
        };
      },
      renderError: async (ctx: any, out: unknown) => {
        ctx.type = 'html';
        ctx.body = page('Ошибка IdP', `<pre>${esc(JSON.stringify(out))}</pre>`);
      },
    };
    const p: any = new (Provider as any)(issuer, configuration);
    p.on('end_session.success', () => (state.logouts += 1));
    return p;
  };
  let provider: any = build(opts.clients);
  state.setClients = async (clients) => {
    provider = build(clients);
  };

  const sign = async (payload: Record<string, unknown>, useForeign: boolean) =>
    new SignJWT(payload as any).setProtectedHeader({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' }).sign(useForeign ? foreign : privateKey);

  const interaction = async (req: IncomingMessage, res: ServerResponse) => {
    const details = await provider.interactionDetails(req, res);
    const url = new URL(req.url!, issuer);
    const finish = async (accountId: string) => {
      const grant = new provider.Grant({ accountId, clientId: String(details.params.client_id) });
      grant.addOIDCScope(String(details.params.scope));
      const missing = (details.prompt.details as any)?.missingOIDCClaims as string[] | undefined;
      if (missing?.length) grant.addOIDCClaims(missing);
      const grantId = await grant.save();
      await provider.interactionFinished(req, res, { login: { accountId }, consent: { grantId } }, { mergeWithLastSubmission: false });
    };
    if (req.method === 'POST' && url.pathname.endsWith('/abort')) {
      return provider.interactionFinished(req, res, { error: 'access_denied', error_description: 'Пользователь отменил вход' }, { mergeWithLastSubmission: false });
    }
    if (req.method === 'POST') {
      const form = await readForm(req);
      const a = [...accounts.values()].find((x) => x.email.toLowerCase() === String(form.email ?? '').toLowerCase());
      if (!a || a.password !== form.password) {
        res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(loginForm(details.uid, 'Неверный логин или пароль'));
      }
      return finish(a.sub);
    }
    // Already signed in at the IdP (only consent is missing): grant it without asking.
    if (details.prompt.name === 'consent' && details.session?.accountId) return finish(details.session.accountId);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(loginForm(details.uid));
  };

  const loginForm = (uid: string, error?: string) =>
    page(
      'Тестовый IdP — вход',
      `${error ? `<p role="alert">${esc(error)}</p>` : ''}<form method="post" action="/interaction/${uid}">
<label for="idp-email">Корпоративная почта</label><br><input id="idp-email" name="email" type="email" autocomplete="username"><br>
<label for="idp-password">Пароль IdP</label><br><input id="idp-password" name="password" type="password"><br>
<button type="submit">Войти в IdP</button></form>
<form method="post" action="/interaction/${uid}/abort"><button type="submit">Отмена</button></form>`,
    );

  const server: Server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    if (path.startsWith('/interaction/')) {
      interaction(req, res).catch((e) => {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(String((e as Error).message));
      });
      return;
    }
    if (path === '/token' && req.method === 'POST') {
      state.tokenRequests += 1;
      const tamper = state.tamper;
      if (tamper) {
        // Capture the provider's JSON response and replace the ID token before it leaves.
        const end = res.end.bind(res) as (...a: any[]) => ServerResponse;
        const chunks: Buffer[] = [];
        const write = res.write.bind(res);
        res.write = ((c: any) => (chunks.push(Buffer.from(c)), true)) as any;
        res.end = ((c?: any, ...rest: any[]) => {
          if (c && typeof c !== 'function') chunks.push(Buffer.from(c));
          const body = Buffer.concat(chunks).toString('utf8');
          void (async () => {
            let out = body;
            try {
              const json = JSON.parse(body);
              if (json.id_token) {
                decodeProtectedHeader(json.id_token);
                const t = tamper(decodeJwt(json.id_token) as Record<string, unknown>);
                json.id_token = await sign(t.payload, !!t.foreignKey);
                out = JSON.stringify(json);
              }
            } catch {
              /* not JSON: pass through */
            }
            res.write = write;
            if (!res.headersSent) res.setHeader('content-length', Buffer.byteLength(out));
            end(out, ...rest.filter((x) => typeof x !== 'function'));
          })();
          return res;
        }) as any;
      }
    }
    provider.callback()(req, res);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, host, () => resolve());
  });
  state.close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    });
  return state;
}
