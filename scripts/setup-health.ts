/** Local PKCE authorization. No token, code, identity or measurements are logged. */
import { createServer } from 'node:http';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { validateScopes, type TokenBundle } from '../src/providers/google/oauth';
import { GoogleClient } from '../src/providers/google/client';
import { GoogleHealthProvider } from '../src/providers/google';
import { z } from 'zod';
import type { Env } from '../src/env';
import type { Clients } from './setup/config';
import { requireCommand, wranglerRunner, openBrowser, type Runner } from './setup/process';

export const HEALTH_SCOPES = [
  'activity_and_fitness',
  'health_metrics_and_measurements',
  'sleep',
].map((x) => 'https://www.googleapis.com/auth/googlehealth.' + x + '.readonly');
export interface Probe {
  check: string;
  http: number | null;
  ok: boolean;
}
export async function verifyHealth(
  clients: Pick<Clients, 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET'>,
  bundle: TokenBundle,
): Promise<Probe[]> {
  const env = {
    ...clients,
    REQUEST_ABORT_SIGNAL: AbortSignal.timeout(120000),
    TOKENS: {
      get: async (key: string, type?: string) =>
        key === 'health:token-bundle' ? (type === 'json' ? bundle : JSON.stringify(bundle)) : null,
      put: async () => {
        throw Error('Diagnostic cannot persist credentials');
      },
    },
  } as unknown as Env;
  const client = new GoogleClient(env),
    provider = new GoogleHealthProvider(env);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const end = new Date(Date.parse(today + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
  const start = new Date(Date.parse(end + 'T12:00:00Z') - 6 * 86400000).toISOString().slice(0, 10);
  const probes: [string, () => Promise<unknown>][] = [
    [
      'health.identity',
      () =>
        client.requestJson(z.object({ healthUserId: z.string() }), {
          path: '/v4/users/me/identity',
        }),
    ],
    ['health.steps', () => provider.getActivityTimeSeries('steps', start, end)],
    ['health.sleep', () => provider.getSleepRange(start, end)],
    ['health.hrv', () => provider.getHRV(start, end)],
    ['health.spo2', () => provider.getSpO2(start, end)],
  ];
  const results: Probe[] = [];
  for (const [check, probe] of probes) {
    try {
      await probe();
      results.push({ check, http: 200, ok: true });
    } catch (e) {
      results.push({
        check,
        http:
          typeof (e as { status?: unknown }).status === 'number'
            ? (e as { status: number }).status
            : null,
        ok: false,
      });
    }
  }
  return results;
}
export async function persistBundle(run: Runner, bundle: TokenBundle): Promise<void> {
  const dir = await mkdtemp(resolve(tmpdir(), 'health-bootstrap-'));
  try {
    const path = resolve(dir, 'bundle.json');
    await writeFile(path, JSON.stringify(bundle), { mode: 0o600 });
    await requireCommand(run, [
      'kv',
      'key',
      'put',
      'health:token-bundle',
      '--binding',
      'TOKENS',
      '--remote',
      '--path',
      path,
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
export async function exchangeAndRefresh(
  clients: Clients,
  code: string,
  verifier: string,
  redirect: string,
): Promise<TokenBundle> {
  async function token(body: Record<string, string>): Promise<Record<string, unknown>> {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clients.GOOGLE_CLIENT_ID,
        client_secret: clients.GOOGLE_CLIENT_SECRET,
        ...body,
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw Error('Google token request failed');
    return (await r.json()) as Record<string, unknown>;
  }
  const granted = await token({
    grant_type: 'authorization_code',
    redirect_uri: redirect,
    code,
    code_verifier: verifier,
  });
  if (typeof granted.refresh_token !== 'string' || typeof granted.scope !== 'string')
    throw Error('Offline permission missing');
  validateScopes(granted.scope);
  if (HEALTH_SCOPES.some((s) => !String(granted.scope).split(/\s+/).includes(s)))
    throw Error('Approve all three read-only scopes');
  const fresh = await token({ grant_type: 'refresh_token', refresh_token: granted.refresh_token });
  const scope = typeof fresh.scope === 'string' ? fresh.scope : granted.scope;
  validateScopes(scope);
  if (HEALTH_SCOPES.some((s) => !scope.split(/\s+/).includes(s)))
    throw Error('Refreshed token is missing a required read scope');
  if (
    typeof fresh.access_token !== 'string' ||
    typeof fresh.expires_in !== 'number' ||
    fresh.expires_in <= 0
  )
    throw Error('Invalid refreshed token');
  return {
    accessToken: fresh.access_token,
    refreshToken:
      typeof fresh.refresh_token === 'string' ? fresh.refresh_token : granted.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + fresh.expires_in,
    clientId: clients.GOOGLE_CLIENT_ID,
    scope,
  };
}
export function authorizeHealth(options: {
  clients: Clients;
  ownerEmail: string;
  run?: Runner;
  open?: typeof openBrowser;
  announce?: (text: string) => void;
  timeoutMs?: number;
}): Promise<Probe[]> {
  const { clients, ownerEmail } = options,
    run = options.run ?? wranglerRunner(),
    open = options.open ?? openBrowser,
    announce = options.announce ?? console.log;
  const redirect = 'http://127.0.0.1:8787/oauth/callback';
  const state = randomBytes(32).toString('base64url'),
    verifier = randomBytes(32).toString('base64url');
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.search = new URLSearchParams({
    client_id: clients.GOOGLE_CLIENT_ID,
    redirect_uri: redirect,
    response_type: 'code',
    scope: HEALTH_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    login_hint: ownerEmail,
  }).toString();
  return new Promise((ok, fail) => {
    let handling = false,
      finished = false;
    const finish = (error: Error | null, result: Probe[] = []) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      server.close(() => {
        error ? fail(error) : ok(result);
      });
      server.closeIdleConnections();
    };
    const server = createServer(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (req.headers.host !== '127.0.0.1:8787' || req.method !== 'GET') {
        res.writeHead(400);
        res.end('Invalid local request');
        return;
      }
      const url = new URL(req.url || '/', 'http://127.0.0.1:8787');
      if (url.pathname === '/auth') {
        res.writeHead(302, { Location: auth.toString() });
        res.end();
        return;
      }
      if (url.pathname !== '/oauth/callback') {
        res.writeHead(404);
        res.end();
        return;
      }
      if (handling || url.searchParams.get('state') !== state) {
        res.writeHead(400);
        res.end('Invalid or already-used request');
        return;
      }
      handling = true;
      clearTimeout(timer);
      let stage = 'consent';
      try {
        const code = url.searchParams.get('code');
        if (!code || url.searchParams.has('error')) throw Error('Consent not completed');
        stage = 'token_exchange';
        const bundle = await exchangeAndRefresh(clients, code, verifier, redirect);
        stage = 'health_reads';
        const probes = await verifyHealth(clients, bundle);
        if (!probes.find((p) => p.check === 'health.identity')?.ok)
          throw Error('Health account is not accessible');
        stage = 'credential_storage';
        await persistBundle(run, bundle);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(
          '<!doctype html><meta charset="utf-8"><title>Health connected</title><p>Google Health 已授权，凭据已安全写入 Cloudflare。返回终端查看验证结果。</p><p>Google Health is authorized and credentials are stored in Cloudflare. Return to the terminal for verification results.</p>',
        );
        finish(null, probes);
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(
          '授权未完成，请返回终端重试。 / Authorization incomplete. Return to the terminal and retry.',
        );
        finish(
          Error(
            'Health authorization or storage failed at ' +
              stage +
              '. No credential values were logged. Check consent, API access and all three scopes, then resume.',
          ),
        );
      }
    });
    const timer = setTimeout(
      () => finish(Error('Authorization window expired; resume the installer.')),
      options.timeoutMs ?? 10 * 60 * 1000,
    );
    server.on('error', () =>
      finish(
        Error('Local port 8787 is unavailable. Close the other authorization process and retry.'),
      ),
    );
    server.listen(8787, '127.0.0.1', () => {
      announce(
        'Open http://127.0.0.1:8787/auth on this computer; choose the configured owner account.',
      );
      void open('http://127.0.0.1:8787/auth').catch(() => {});
    });
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const clients = JSON.parse(await readFile('.bootstrap-secrets.json', 'utf8')) as Clients;
    const config = await readFile('wrangler.toml', 'utf8');
    const ownerEmail = config.match(/^OWNER_EMAIL\s*=\s*"([^"\n]+)"/m)?.[1];
    if (!ownerEmail) throw Error('OWNER_EMAIL is missing from local configuration');
    const run = wranglerRunner();
    await requireCommand(run, ['secret', 'bulk'], JSON.stringify(clients));
    const result = await authorizeHealth({ clients, ownerEmail, run });
    result.forEach((x) => console.log(JSON.stringify(x)));
    process.exitCode = result.every((p) => p.ok) ? 0 : 1;
  } catch {
    console.error(
      'Setup incomplete; check local configuration, the dedicated clients and consent. No credentials were logged.',
    );
    process.exitCode = 1;
  }
}
