import { z } from 'zod';
import type { Env } from '../../env';
import { FitbitAuthError, FitbitRateLimitError } from '../../lib/errors';
const KEY = 'health:token-bundle';
export const TokenBundleSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number().finite(),
  clientId: z.string().min(1),
  scope: z.string(),
});
export type TokenBundle = z.infer<typeof TokenBundleSchema>;
const allowed = new Set(
  ['activity_and_fitness', 'health_metrics_and_measurements', 'sleep'].map(
    (x) => 'https://www.googleapis.com/auth/googlehealth.' + x + '.readonly',
  ),
);
export function validateScopes(scope: string): void {
  const all = scope.split(/\s+/).filter(Boolean);
  if (!all.length || all.some((x) => !allowed.has(x)))
    throw new FitbitAuthError(
      'Unexpected Health scopes. Reconnect using the dedicated three-scope client.',
      'permission_denied',
    );
}
async function read(env: Env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
    throw new FitbitAuthError('Google client configuration missing.', 'configuration_error');
  const t = TokenBundleSchema.safeParse(await env.TOKENS.get(KEY, 'json'));
  if (!t.success) throw new FitbitAuthError('Google Health authorization required.');
  if (t.data.clientId !== env.GOOGLE_CLIENT_ID)
    throw new FitbitAuthError(
      'Client configuration does not match the saved grant.',
      'configuration_error',
    );
  validateScopes(t.data.scope);
  return t.data;
}
export async function refreshTokens(env: Env, refreshToken: string): Promise<TokenBundle> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
    throw new FitbitAuthError('Google client configuration missing.', 'configuration_error');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
    }),
    signal: env.REQUEST_ABORT_SIGNAL,
  });
  if (r.status === 429) throw new FitbitRateLimitError(Number(r.headers.get('Retry-After')) || 60);
  if (!r.ok) {
    let reason = '';
    try {
      reason = String(((await r.json()) as { error?: unknown }).error || '');
    } catch {}
    throw new FitbitAuthError(
      `Google token refresh HTTP ${r.status}.`,
      r.status >= 500
        ? 'temporary_error'
        : reason === 'invalid_client'
          ? 'configuration_error'
          : reason === 'invalid_grant'
            ? 'authorization_required'
            : 'temporary_error',
    );
  }
  const b = z
    .object({
      access_token: z.string().min(1),
      expires_in: z.number().positive(),
      refresh_token: z.string().optional(),
      scope: z.string().optional(),
    })
    .safeParse(await r.json());
  if (!b.success) throw new FitbitAuthError('Invalid token response.', 'invalid_response');
  const old = await read(env);
  const scope = b.data.scope || old.scope;
  validateScopes(scope);
  const t = {
    accessToken: b.data.access_token,
    refreshToken: b.data.refresh_token || refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + b.data.expires_in,
    clientId: env.GOOGLE_CLIENT_ID,
    scope,
  };
  await env.TOKENS.put(KEY, JSON.stringify(t));
  return t;
}
const inFlight = new WeakMap<object, Promise<TokenBundle>>();
export async function getAccessToken(env: Env): Promise<string> {
  const t = await read(env);
  if (t.expiresAt - 60 > Date.now() / 1000) return t.accessToken;
  let p = inFlight.get(env.TOKENS);
  if (!p) {
    p = refreshTokens(env, t.refreshToken);
    inFlight.set(env.TOKENS, p);
  }
  try {
    return (await p).accessToken;
  } finally {
    inFlight.delete(env.TOKENS);
  }
}
export async function invalidateAccessToken(env: Env): Promise<void> {
  const t = await read(env);
  await env.TOKENS.put(KEY, JSON.stringify({ ...t, expiresAt: 0 }));
}
