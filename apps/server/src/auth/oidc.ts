import * as client from 'openid-client';

/**
 * OpenID Connect relying party (authorization code + PKCE S256 + state + nonce). Works with Keycloak, ADFS, Azure AD,
 * Authentik and any standards-compliant OP; verified end-to-end against panva/oidc-provider
 * (tests/integration/oidc-sso.test.ts, tests/e2e/sso-oidc.spec.ts).
 *
 * - Discovery is lazy and retried: the application starts (and password login works) while the IdP is down; the SSO
 *   button then reports "IdP unavailable" instead of the whole server failing to boot.
 * - ID token: issuer, audience, expiry/iat (30 s tolerance), nonce and — with non-repudiation checks — the JWS
 *   signature against the IdP JWKS are verified by openid-client; claims from the UserInfo endpoint are merged
 *   (strict OPs put email/groups only there), with the UserInfo `sub` required to match the ID token.
 */
export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Where the IdP returns the browser after RP-initiated logout (default: PUBLIC_URL + "/"). */
  postLogoutRedirectUri?: string;
  scopes?: string;
  /** Claim with group names (OIDC_GROUPS_CLAIM, e.g. "groups"); null = group mapping disabled. */
  groupsClaim?: string | null;
  /** Claim with the department name (OIDC_DEPARTMENT_CLAIM, e.g. "department"); null = disabled. */
  departmentClaim?: string | null;
  /** Plain-http issuer (development/test only; refused in production by config.ts). */
  allowInsecure?: boolean;
}

export class OidcError extends Error {
  constructor(
    public readonly code: 'idp_unavailable' | 'idp_error' | 'state_mismatch' | 'token_invalid',
    message: string,
  ) {
    super(message);
  }
}

export interface OidcStart {
  url: string;
  state: string;
  verifier: string;
  nonce: string;
}

export interface OidcResult {
  claims: Record<string, unknown> & { sub: string };
  idToken: string;
}

export function createOidc(cfg: OidcConfig) {
  let pending: Promise<client.Configuration> | null = null;
  const configuration = () => {
    pending ??= client
      .discovery(new URL(cfg.issuer), cfg.clientId, { client_secret: cfg.clientSecret, [client.clockTolerance]: 30 } as Partial<client.ClientMetadata>, undefined, {
        execute: [...(cfg.allowInsecure ? [client.allowInsecureRequests] : []), client.enableNonRepudiationChecks],
        timeout: 10,
      })
      .catch((e) => {
        pending = null; // retry discovery on the next attempt
        throw new OidcError('idp_unavailable', `OIDC discovery failed: ${(e as Error).message}`);
      });
    return pending;
  };

  return {
    async start(): Promise<OidcStart> {
      const config = await configuration();
      const verifier = client.randomPKCECodeVerifier();
      const challenge = await client.calculatePKCECodeChallenge(verifier);
      const state = client.randomState();
      const nonce = client.randomNonce();
      const url = client.buildAuthorizationUrl(config, {
        redirect_uri: cfg.redirectUri,
        scope: cfg.scopes ?? 'openid email profile',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        nonce,
      });
      return { url: url.href, state, verifier, nonce };
    },

    async callback(currentUrl: URL, saved: { state?: unknown; verifier?: unknown; nonce?: unknown }): Promise<OidcResult> {
      const config = await configuration();
      const err = currentUrl.searchParams.get('error');
      if (err) throw new OidcError('idp_error', `IdP returned ${err}: ${currentUrl.searchParams.get('error_description') ?? ''}`.trim());
      if (typeof saved.state !== 'string' || typeof saved.verifier !== 'string' || typeof saved.nonce !== 'string' || currentUrl.searchParams.get('state') !== saved.state)
        throw new OidcError('state_mismatch', 'state does not match the login started in this browser');
      let tokens: Awaited<ReturnType<typeof client.authorizationCodeGrant>>;
      try {
        tokens = await client.authorizationCodeGrant(config, currentUrl, { pkceCodeVerifier: saved.verifier, expectedState: saved.state, expectedNonce: saved.nonce, idTokenExpected: true });
      } catch (e) {
        const m = (e as Error).message;
        if (e instanceof TypeError && /fetch failed|ECONNREFUSED|timeout/i.test(m + String((e as any).cause ?? ''))) throw new OidcError('idp_unavailable', m);
        throw new OidcError('token_invalid', m);
      }
      const claims = tokens.claims();
      if (!claims || !tokens.id_token) throw new OidcError('token_invalid', 'no ID token');
      // OIDC Core 3.1.3.7 (10): a token "issued" in the future (beyond clock tolerance) is not accepted.
      if (typeof claims.iat === 'number' && claims.iat > Date.now() / 1000 + 60) throw new OidcError('token_invalid', 'ID token iat is in the future');
      let merged: Record<string, unknown> = { ...claims };
      if (config.serverMetadata().userinfo_endpoint) {
        try {
          const info = await client.fetchUserInfo(config, tokens.access_token, claims.sub);
          // ID token claims win for identity (sub/iss/aud); profile claims are taken from UserInfo when absent.
          merged = { ...info, ...claims };
        } catch (e) {
          throw new OidcError('token_invalid', `UserInfo failed: ${(e as Error).message}`);
        }
      }
      return { claims: merged as OidcResult['claims'], idToken: tokens.id_token };
    },

    /** RP-initiated logout URL (null when the IdP has no end_session_endpoint or is unreachable). */
    async logoutUrl(idToken: string | null): Promise<string | null> {
      try {
        const config = await configuration();
        if (!config.serverMetadata().end_session_endpoint) return null;
        const params: Record<string, string> = { client_id: cfg.clientId };
        if (idToken) params.id_token_hint = idToken;
        if (cfg.postLogoutRedirectUri) params.post_logout_redirect_uri = cfg.postLogoutRedirectUri;
        return client.buildEndSessionUrl(config, params).href;
      } catch {
        return null;
      }
    },
  };
}

export type Oidc = ReturnType<typeof createOidc>;

/** Group names from a claim that may be an array, a single string or a comma-separated string. */
export function claimList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map((x) => x.trim()).filter(Boolean);
  return [];
}
