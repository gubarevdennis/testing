import * as client from 'openid-client';

/** OpenID Connect (authorization code + PKCE + state). Works with Keycloak, ADFS, Azure AD, Authentik, etc. */
export async function createOidc(cfg: { issuer: string; clientId: string; clientSecret: string; redirectUri: string }, opts: { allowInsecure?: boolean } = {}) {
  const config = await client.discovery(new URL(cfg.issuer), cfg.clientId, cfg.clientSecret, undefined, opts.allowInsecure ? { execute: [client.allowInsecureRequests] } : undefined);
  return {
    async start() {
      const verifier = client.randomPKCECodeVerifier();
      const challenge = await client.calculatePKCECodeChallenge(verifier);
      const state = client.randomState();
      const url = client.buildAuthorizationUrl(config, { redirect_uri: cfg.redirectUri, scope: 'openid email profile', code_challenge: challenge, code_challenge_method: 'S256', state });
      return { url: url.href, state, verifier };
    },
    async callback(currentUrl: URL, state: string, verifier: string) {
      const tokens = await client.authorizationCodeGrant(config, currentUrl, { pkceCodeVerifier: verifier, expectedState: state });
      const claims = tokens.claims();
      if (!claims) throw new Error('no id_token claims');
      return claims as Record<string, unknown> & { sub: string };
    },
  };
}
