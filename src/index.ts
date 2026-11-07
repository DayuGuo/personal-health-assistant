import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { StreamableHTTPTransport } from '@hono/mcp';
import { Hono } from 'hono';
import type { Env } from './env';
import { buildServer } from './server';
import { defaultHandler } from './auth/handler';
import { canonicalRequest, publicOrigin } from './lib/deployment';
import { allowedTokenClient, parseClientPolicy, registrationPolicy } from './auth/clients';
const mcp = new Hono<{ Bindings: Env }>();
mcp.all('/mcp', async (c) => {
  const ctx = c.executionCtx as ExecutionContext & {
    props?: { email?: string };
    auth?: { scope: string[]; clientId?: string };
  };
  if (
    !ctx.props?.email ||
    ctx.props.email.toLowerCase() !== c.env.OWNER_EMAIL.toLowerCase() ||
    !ctx.auth?.scope.includes('health:read') ||
    !(await allowedTokenClient(ctx.auth.clientId, c.env))
  )
    return c.text('Forbidden', 403);
  if (c.req.method === 'GET' || c.req.method === 'DELETE')
    return c.text('Stateless MCP supports POST', 405);
  if (c.req.method !== 'POST') return c.text('Method not allowed', 405);
  const env = { ...c.env, REQUEST_CACHE_META: [] };
  const server = buildServer(env),
    transport = new StreamableHTTPTransport();
  await server.connect(transport);
  return (await transport.handleRequest(c)) ?? c.body(null, 202);
});
let cached: { origin: string; policyRaw?: string; provider: OAuthProvider<Env> } | undefined;
export function providerFor(origin: string, policyRaw?: string): OAuthProvider<Env> {
  origin = publicOrigin(origin);
  const policy = parseClientPolicy(policyRaw);
  if (cached?.origin !== origin || cached.policyRaw !== policyRaw)
    cached = {
      origin,
      policyRaw,
      provider: new OAuthProvider<Env>({
        apiRoute: '/mcp',
        apiHandler: mcp,
        defaultHandler,
        authorizeEndpoint: '/authorize',
        tokenEndpoint: '/oauth/token',
        scopesSupported: ['health:read', 'offline_access'],
        resourceMetadata: { resource: origin + '/mcp', authorization_servers: [origin] },
        requiredScopes: ['health:read'],
        clientIdMetadataDocumentEnabled: true,
        ...(policy.some((p) => p.mode === 'registration')
          ? {
              clientRegistrationEndpoint: '/oauth/register',
              clientRegistrationCallback: ({ clientMetadata }) => {
                if (!registrationPolicy(policy, clientMetadata.redirect_uris))
                  return { description: 'Redirect URIs are not enabled by the owner.' };
                if (
                  typeof clientMetadata.scope === 'string' &&
                  clientMetadata.scope
                    .split(/\s+/)
                    .filter(Boolean)
                    .some((s) => !['health:read', 'offline_access'].includes(s))
                )
                  return { description: 'Unsupported scopes.' };
              },
            }
          : {}),
        accessTokenTTL: 3600,
        refreshTokenTTL: 90 * 86400,
        refreshTokenIdleTTL: 90 * 86400,
      }),
    };
  return cached.provider;
}
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let provider: OAuthProvider<Env>;
    try {
      provider = providerFor(env.PUBLIC_ORIGIN, env.MCP_CLIENT_POLICY);
    } catch {
      return new Response('Check PUBLIC_ORIGIN and MCP_CLIENT_POLICY before connecting.', {
        status: 503,
      });
    }
    // Provider discovery uses Request.url too. Normalize it to the configured
    // origin so custom domains and workers.dev do not advertise mixed audiences.
    const origin = publicOrigin(env.PUBLIC_ORIGIN);
    return provider.fetch(
      canonicalRequest(request, origin),
      { ...env, PUBLIC_ORIGIN: origin },
      ctx,
    );
  },
};
