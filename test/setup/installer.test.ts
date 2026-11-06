import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, cp, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  assertManaged,
  assertUnusedHostname,
  install,
  loadState,
  saveState,
  verifyPublic,
} from '../../scripts/setup/install';
import {
  parseGoogleClient,
  renderConfig,
  validateState,
  type SetupState,
} from '../../scripts/setup/config';
import {
  authorizeHealth,
  exchangeAndRefresh,
  HEALTH_SCOPES,
  persistBundle,
} from '../../scripts/setup-health';
import type { Runner } from '../../scripts/setup/process';
import type { TokenBundle } from '../../src/providers/google/oauth';
import { canonicalRequest } from '../../src/lib/deployment';
import { checkDeploy } from '../../scripts/check-deploy';
const dirs: string[] = [];
async function temp() {
  const dir = await mkdtemp(join(tmpdir(), 'health-install-test-'));
  dirs.push(dir);
  return dir;
}
const state = (): SetupState => ({
  version: 1,
  language: 'en',
  installId: 'abc123def456',
  workerName: 'someone-health',
  ownerEmail: 'owner@sample.org',
  ownerName: 'Owner <test>',
  origin: 'https://health.sample.org',
  accountId: 'a'.repeat(32),
  daily: 'off',
  domainBinding: true,
});
const clients = {
  LOGIN_CLIENT_ID: 'login.apps.googleusercontent.com',
  LOGIN_CLIENT_SECRET: 'synthetic-login-secret',
  GOOGLE_CLIENT_ID: 'health.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'synthetic-health-secret',
};
const bundle: TokenBundle = {
  accessToken: 'synthetic-access',
  refreshToken: 'synthetic-refresh',
  expiresAt: Date.now() / 1000 + 3600,
  clientId: clients.GOOGLE_CLIENT_ID,
  scope: HEALTH_SCOPES.join(' '),
};
const publicFetch = vi.fn(async (input: RequestInfo | URL) => {
  const u = new URL(String(input)),
    origin = u.origin;
  if (u.pathname === '/health') return Response.json({ mode: 'read-only' });
  if (u.pathname === '/mcp')
    return new Response(null, {
      status: 401,
      headers: {
        'www-authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
      },
    });
  if (u.pathname.startsWith('/.well-known/oauth-protected-resource'))
    return Response.json({ resource: origin + '/mcp', authorization_servers: [origin] });
  if (u.pathname === '/.well-known/oauth-authorization-server')
    return Response.json({
      authorization_endpoint: origin + '/authorize',
      token_endpoint: origin + '/oauth/token',
      client_id_metadata_document_supported: true,
    });
  return new Response('ok');
}) as unknown as typeof fetch;
function fakeCloud() {
  const namespaces: { id: string; title: string }[] = [],
    calls: string[][] = [];
  const run: Runner = async (args, input) => {
    calls.push(args);
    if (args[0] === 'deployments')
      return { code: 1, stdout: '', stderr: 'Worker does not exist [code: 10007]' };
    if (args.join(' ') === 'kv namespace list')
      return { code: 0, stdout: JSON.stringify(namespaces), stderr: '' };
    if (args.slice(0, 3).join(' ') === 'kv namespace create') {
      const id = (namespaces.length ? 'c' : 'b').repeat(32);
      namespaces.push({ id, title: args[3]! });
      return { code: 0, stdout: `id = "${id}"`, stderr: '' };
    }
    if (args[0] === 'secret') expect(JSON.parse(input!)).toEqual(clients);
    return { code: 0, stdout: '', stderr: '' };
  };
  return { run, calls, namespaces };
}
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
describe('portable and non-destructive installation', () => {
  it('keeps discovery audiences configured while preserving a request body and query', async () => {
    const req = new Request('https://untrusted.example//path?client_id=test', {
      method: 'POST',
      body: 'payload',
    });
    const result = canonicalRequest(req, 'https://health.sample.org');
    expect(result.url).toBe('https://health.sample.org//path?client_id=test');
    expect(await result.text()).toBe('payload');
  });
  it('blocks deployment of raw templates and permits personalized generated assets', async () => {
    const root = await temp();
    await cp(resolve('public'), join(root, 'public'), { recursive: true });
    await writeFile(join(root, 'wrangler.toml'), '[assets]\ndirectory = "public"\n');
    await expect(checkDeploy(root)).rejects.toThrow(/Unrendered/);
    const { renderSite } = await import('../../scripts/setup/site');
    await renderSite(root, state());
    await writeFile(join(root, 'wrangler.toml'), '[assets]\ndirectory = ".setup/site"\n');
    await expect(checkDeploy(root)).resolves.toBeUndefined();
  });
  it('refuses an unrecognized existing config before any cloud call or overwrite', async () => {
    const root = await temp(),
      original = 'name = "existing-owner-worker"\n';
    await writeFile(join(root, 'wrangler.toml'), original);
    const cloud = fakeCloud();
    await expect(
      install({
        hostnameCheck: async () => {},
        root,
        state: state(),
        run: cloud.run,
        loadClients: async () => clients,
        confirmDeploy: async () => {},
        progress: () => {},
      }),
    ).rejects.toThrow(/preserved/i);
    expect(cloud.calls).toEqual([]);
    expect(await readFile(join(root, 'wrangler.toml'), 'utf8')).toBe(original);
  });
  it('stops for a remote name collision rather than changing another Worker', async () => {
    const root = await temp(),
      run = vi.fn(async () => ({ code: 0, stdout: 'existing deployment', stderr: '' }));
    await expect(
      install({
        hostnameCheck: async () => {},
        root,
        state: state(),
        run,
        loadClients: async () => clients,
        confirmDeploy: async () => {},
        progress: () => {},
      }),
    ).rejects.toThrow(/already exists/);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('completes an isolated fresh install and resumes without duplicate KV, deploy or consent', async () => {
    const root = await temp();
    await cp(resolve('public'), join(root, 'public'), { recursive: true });
    const cloud = fakeCloud(),
      progress = vi.fn();
    const authorize = vi.fn(async () =>
      ['health.identity', 'health.steps', 'health.sleep', 'health.hrv', 'health.spo2'].map(
        (check) => ({ check, http: 200, ok: true }),
      ),
    );
    const initial = state();
    await install({
      hostnameCheck: async () => {},
      root,
      state: initial,
      run: cloud.run,
      loadClients: async () => clients,
      confirmDeploy: async () => {},
      progress,
      authorize,
      fetcher: publicFetch,
    });
    expect(cloud.namespaces).toHaveLength(2);
    expect(authorize).toHaveBeenCalledTimes(1);
    const config = await readFile(join(root, 'wrangler.toml'), 'utf8');
    expect(config).toContain('someone-health');
    expect(config).not.toMatch(/anotherdayu|guozydayu/);
    const html = await readFile(join(root, '.setup/site/privacy/index.html'), 'utf8');
    expect(html).toContain('Owner &#60;test&#62;');
    expect(html).toContain('owner@sample.org');
    expect(html).not.toContain('{{');
    const current = await loadState(root);
    expect(current?.healthVerifiedAt).toBeTruthy();
    expect((await stat(join(root, '.setup/state.json'))).mode & 0o777).toBe(0o600);
    const before = cloud.calls.length;
    await install({
      hostnameCheck: async () => {},
      root,
      state: current!,
      run: cloud.run,
      loadClients: async () => {
        throw Error('should not ask again');
      },
      confirmDeploy: async () => {
        throw Error('should not deploy again');
      },
      progress,
      authorize,
      fetcher: publicFetch,
    });
    expect(cloud.calls).toHaveLength(before);
    expect(authorize).toHaveBeenCalledTimes(1);
    const files = await readFile(join(root, '.setup/CONNECT.md'), 'utf8');
    expect(files).toContain('offline_access');
    expect(files).toContain('browser steps');
    expect(progress.mock.calls.flat().join(' ')).not.toMatch(/synthetic-(login|health)-secret/);
  });
  it('resumes a failed second KV create using the existing first namespace', async () => {
    const root = await temp(),
      s = state(),
      cloud = fakeCloud();
    let failed = false;
    const run: Runner = async (args, input) => {
      if (args[0] === 'kv' && args[2] === 'create' && args[3]?.includes('-cache-') && !failed) {
        failed = true;
        return { code: 1, stdout: '', stderr: 'failure' };
      }
      return cloud.run(args, input);
    };
    await expect(
      install({
        hostnameCheck: async () => {},
        root,
        state: s,
        run,
        loadClients: async () => clients,
        confirmDeploy: async () => {},
        progress: () => {},
      }),
    ).rejects.toThrow(/Operation failed/);
    const checkpoint = await loadState(root);
    expect(checkpoint?.authId).toBe('b'.repeat(32));
    expect(checkpoint?.cacheId).toBeUndefined();
    await cp(resolve('public'), join(root, 'public'), { recursive: true });
    await install({
      hostnameCheck: async () => {},
      root,
      state: checkpoint!,
      run,
      loadClients: async () => clients,
      confirmDeploy: async () => {},
      progress: () => {},
      authorize: async () => [{ check: 'health.identity', ok: true, http: 200 }],
      fetcher: publicFetch,
    });
    expect(cloud.namespaces).toHaveLength(2);
  });
  it('rejects edited managed config and insecure or injected origins', async () => {
    const root = await temp(),
      s = state();
    await saveState(root, s);
    await writeFile(join(root, 'wrangler.toml'), 'changed');
    await expect(assertManaged(root, s)).rejects.toThrow(/edited/);
    for (const origin of [
      'http://health.sample.org',
      'https://health.sample.org/path',
      'https://user:pass@health.sample.org',
      'https://127.0.0.1',
      'https://health.sample.org?x=y',
    ])
      expect(() => validateState({ ...state(), origin })).toThrow();
    expect(() => renderConfig({ ...state(), workerName: 'bad"\nname="other' })).toThrow();
  });
  it('recovers an interrupted atomic checkpoint only for matching generated config', async () => {
    const root = await temp(),
      s = state();
    await saveState(root, s);
    const next = { ...s, authId: 'd'.repeat(32) };
    const text = renderConfig(next);
    const { createHash } = await import('node:crypto');
    next.configHash = createHash('sha256').update(text).digest('hex');
    await writeFile(join(root, '.setup/state.next.json'), JSON.stringify(next));
    await writeFile(join(root, 'wrangler.toml'), text);
    const restored = await loadState(root);
    expect(restored?.authId).toBe('d'.repeat(32));
    await expect(assertManaged(root, restored!)).resolves.toBeUndefined();
  });
  it('refuses a resolving custom hostname and fails closed for DNS errors', async () => {
    await expect(
      assertUnusedHostname(state(), async () => [{ address: '192.0.2.1' }]),
    ).rejects.toThrow(/preserved/);
    await expect(
      assertUnusedHostname(state(), async () => {
        throw Object.assign(Error('missing'), { code: 'ENOTFOUND' });
      }),
    ).resolves.toBeUndefined();
    await expect(
      assertUnusedHostname(state(), async () => {
        throw Object.assign(Error('temporary'), { code: 'EAI_AGAIN' });
      }),
    ).rejects.toThrow(/safely check/);
  });
  it('requires Web clients with exact callbacks and does not accept desktop clients', () => {
    const text = JSON.stringify({
      web: {
        client_id: clients.LOGIN_CLIENT_ID,
        client_secret: clients.LOGIN_CLIENT_SECRET,
        redirect_uris: ['https://health.sample.org/login/callback'],
      },
    });
    expect(parseGoogleClient(text, 'https://health.sample.org/login/callback').id).toBe(
      clients.LOGIN_CLIENT_ID,
    );
    expect(() => parseGoogleClient(text, 'https://other.sample.org/login/callback')).toThrow();
    expect(() => parseGoogleClient(JSON.stringify({ installed: {} }), 'x')).toThrow();
  });
  it('refuses discovery for a different resource audience', async () => {
    const fetcher = (async (input: RequestInfo | URL) =>
      String(input).includes('oauth-protected-resource')
        ? Response.json({
            resource: 'https://other.sample.org/mcp',
            authorization_servers: ['https://other.sample.org'],
          })
        : publicFetch(input)) as typeof fetch;
    await expect(verifyPublic(state().origin, fetcher)).rejects.toThrow(/another deployment/);
  });
});
describe('offline grant validation and temporary credential handling', () => {
  it('performs an actual refresh and retains a rotated refresh token', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ refresh_token: 'synthetic-first', scope: HEALTH_SCOPES.join(' ') }),
      )
      .mockResolvedValueOnce(
        Response.json({
          access_token: 'synthetic-access',
          refresh_token: 'synthetic-rotated',
          expires_in: 3600,
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    const value = await exchangeAndRefresh(
      clients,
      'synthetic-code',
      'synthetic-verifier',
      'http://127.0.0.1:8787/oauth/callback',
    );
    expect(value.refreshToken).toBe('synthetic-rotated');
    const body = fetcher.mock.calls[1]![1].body as URLSearchParams;
    expect(body.get('grant_type')).toBe('refresh_token');
  });
  it('does not accept a partially granted Health consent', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ refresh_token: 'synthetic-first', scope: HEALTH_SCOPES[0] }),
      );
    vi.stubGlobal('fetch', fetcher);
    await expect(exchangeAndRefresh(clients, 'code', 'verifier', 'callback')).rejects.toThrow(
      /all three/,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('uses a mode-0600 token file and removes it even when upload fails', async () => {
    let path = '';
    const run: Runner = async (args) => {
      path = args[args.indexOf('--path') + 1]!;
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await readFile(path, 'utf8')).refreshToken).toBe(bundle.refreshToken);
      return { code: 1, stdout: '', stderr: 'synthetic failure' };
    };
    await expect(persistBundle(run, bundle)).rejects.toThrow(/Operation failed/);
    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('rejects cross-state/method callbacks without token exchange, then handles user cancellation', async () => {
    const nativeFetch = globalThis.fetch,
      google = vi.fn();
    vi.stubGlobal('fetch', google);
    let opened!: () => void;
    const ready = new Promise<void>((ok) => {
      opened = ok;
    });
    const run = vi.fn(async () => ({ code: 0, stdout: '', stderr: '' }));
    const pending = authorizeHealth({
      clients,
      ownerEmail: state().ownerEmail,
      run,
      open: async () => opened(),
      announce: () => {},
      timeoutMs: 10000,
    }).catch((e) => e as Error);
    await ready;
    const auth = await nativeFetch('http://127.0.0.1:8787/auth', { redirect: 'manual' });
    expect(auth.status).toBe(302);
    const target = new URL(auth.headers.get('location')!);
    expect(target.searchParams.get('code_challenge_method')).toBe('S256');
    expect(target.searchParams.get('login_hint')).toBe(state().ownerEmail);
    const bad = await nativeFetch(
      'http://127.0.0.1:8787/oauth/callback?state=wrong&code=synthetic',
    );
    expect(bad.status).toBe(400);
    const post = await nativeFetch('http://127.0.0.1:8787/auth', { method: 'POST' });
    expect(post.status).toBe(400);
    expect(google).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    const callback = new URL('http://127.0.0.1:8787/oauth/callback');
    callback.search = new URLSearchParams({
      state: target.searchParams.get('state')!,
      error: 'access_denied',
    }).toString();
    const denied = await nativeFetch(callback);
    expect(denied.status).toBe(400);
    expect(await pending).toBeInstanceOf(Error);
    expect(google).not.toHaveBeenCalled();
  });
  it('completes a real local callback with synthetic Google responses and stores only after verification', async () => {
    const nativeFetch = globalThis.fetch;
    let exchanges = 0;
    const google = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.hostname === 'oauth2.googleapis.com') {
        exchanges++;
        return Response.json(
          exchanges === 1
            ? { refresh_token: 'synthetic-grant', scope: HEALTH_SCOPES.join(' ') }
            : { access_token: 'synthetic-access', expires_in: 3600 },
        );
      }
      return Response.json(
        url.pathname.endsWith('/identity') ? { healthUserId: 'synthetic-identity' } : {},
      );
    });
    vi.stubGlobal('fetch', google);
    let opened!: () => void;
    const ready = new Promise<void>((ok) => {
      opened = ok;
    });
    const run: Runner = vi.fn(async (args) => {
      expect(args).toContain('health:token-bundle');
      return { code: 0, stdout: '', stderr: '' };
    });
    const pending = authorizeHealth({
      clients,
      ownerEmail: state().ownerEmail,
      run,
      open: async () => opened(),
      announce: () => {},
      timeoutMs: 10000,
    }).catch((e) => e as Error);
    await ready;
    const auth = await nativeFetch('http://127.0.0.1:8787/auth', { redirect: 'manual' });
    const target = new URL(auth.headers.get('location')!);
    const callback = new URL('http://127.0.0.1:8787/oauth/callback');
    callback.search = new URLSearchParams({
      state: target.searchParams.get('state')!,
      code: 'synthetic-code',
    }).toString();
    const response = await nativeFetch(callback);
    const outcome = await pending;
    if (outcome instanceof Error) throw outcome;
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain('synthetic-access');
    expect(outcome).toHaveLength(5);
    expect(outcome.every((p) => p.ok)).toBe(true);
    expect(exchanges).toBe(2);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
