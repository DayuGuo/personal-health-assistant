import { describe, expect, it, vi } from 'vitest';
import {
  allowedClient,
  allowedTokenClient,
  parseClientPolicy,
  registrationPolicy,
} from '../../src/auth/clients';
import { defaultHandler } from '../../src/auth/handler';
import { isChatGPTClient } from '../../src/auth/security';
import worker, { providerFor } from '../../src/index';
import { createMockEnv, createMockKv } from '../helpers/mock-env';

const grok = {
  mode: 'cimd' as const,
  name: 'Grok',
  clientId: 'https://grok.com/oauth/mcp-client.json',
  redirectUris: ['https://grok.com/connectors-oauth-exchange-code/'],
};
// Synthetic endpoints deliberately do not claim to be Meta's production callbacks.
const muse = {
  mode: 'registration' as const,
  name: 'Muse test',
  redirectUris: ['https://agent.example.org/oauth/callback'],
};
const origin = 'https://health.example.org';
const context = () =>
  ({ waitUntil: vi.fn(), passThroughOnException: vi.fn() }) as unknown as ExecutionContext;

describe('explicit agent client boundaries', () => {
  it('preserves ChatGPT-only defaults without granting other agents access', async () => {
    const env = createMockEnv();
    expect(parseClientPolicy()).toEqual([]);
    expect(
      await allowedClient(
        'https://chatgpt.com/oauth/client.json',
        'https://chatgpt.com/connector_platform_oauth_redirect',
        env,
      ),
    ).toBe('ChatGPT');
    expect(await allowedClient(grok.clientId, grok.redirectUris[0]!, env)).toBeNull();
    expect(await allowedTokenClient('https://chatgpt.com/oauth/client.json', env)).toBe(true);
    expect(await allowedTokenClient(undefined, env)).toBe(false);
  });
  it('requires an exact approved CIMD/callback pair and blocks removed clients', async () => {
    const lookupClient = vi.fn();
    const env = createMockEnv(
      {},
      { MCP_CLIENT_POLICY: JSON.stringify([grok]), OAUTH_PROVIDER: { lookupClient } as any },
    );
    expect(await allowedClient(grok.clientId, grok.redirectUris[0]!, env)).toBe('Grok');
    for (const redirect of [
      'https://grok.com.evil.test/connectors-oauth-exchange-code/',
      grok.redirectUris[0] + '?next=evil',
      'https://other.example.org/callback',
    ])
      expect(await allowedClient(grok.clientId, redirect, env)).toBeNull();
    expect(
      await allowedClient(grok.clientId + '?fake=true', grok.redirectUris[0]!, env),
    ).toBeNull();
    expect(await allowedTokenClient(grok.clientId, env)).toBe(true);
    expect(await allowedTokenClient(grok.clientId, { ...env, MCP_CLIENT_POLICY: '[]' })).toBe(
      false,
    );
    expect(lookupClient).not.toHaveBeenCalled();
  });
  it.each([
    'http://agent.example.org/callback',
    'https://user@agent.example.org/callback',
    'https://127.0.0.1/callback',
    'https://localhost/callback',
    'https://*.example.org/callback',
    'https://agent.example.org/callback#fragment',
    'https://agent.example.org:1234/callback',
    'https://agent.example.org/a/../callback',
  ])('rejects unsafe configuration: %s', (redirect) => {
    expect(() =>
      parseClientPolicy(JSON.stringify([{ ...muse, redirectUris: [redirect] }])),
    ).toThrow();
  });
  it('rejects malformed and ambiguous policies instead of silently enabling access', () => {
    expect(() => parseClientPolicy('{invalid')).toThrow();
    expect(() => parseClientPolicy(JSON.stringify([{ ...grok, wildcard: true }]))).toThrow();
    expect(() => parseClientPolicy(JSON.stringify([grok, grok]))).toThrow();
    expect(() => parseClientPolicy(JSON.stringify([{ ...muse, redirectUris: [] }]))).toThrow();
  });
  it('rejects extra ports, fragments and query parameters in built-in ChatGPT trust rules', () => {
    for (const id of [
      'https://chatgpt.com:8443/oauth/client.json',
      'https://chatgpt.com/oauth/client.json?x=y',
      'https://chatgpt.com/oauth/client.json#x',
    ])
      expect(isChatGPTClient(id, 'https://chatgpt.com/connector_platform_oauth_redirect')).toBe(
        false,
      );
  });
  it('permits DCR only for one configured set of exact callbacks, regardless of claimed name', async () => {
    const policy = parseClientPolicy(JSON.stringify([muse]));
    for (const redirects of [
      [],
      undefined,
      [123],
      [...muse.redirectUris, 'https://evil.example.org/callback'],
    ])
      expect(registrationPolicy(policy, redirects)).toBeNull();
    const lookupClient = vi.fn(async () => ({
      clientId: 'opaque-client',
      clientName: 'Spoofed brand',
      redirectUris: muse.redirectUris,
    }));
    const env = createMockEnv(
      {},
      { MCP_CLIENT_POLICY: JSON.stringify([muse]), OAUTH_PROVIDER: { lookupClient } as any },
    );
    expect(await allowedClient('opaque-client', muse.redirectUris[0]!, env)).toBe('Muse test');
    expect(await allowedTokenClient('opaque-client', env)).toBe(true);
    expect(await allowedTokenClient('opaque-client', { ...env, MCP_CLIENT_POLICY: '[]' })).toBe(
      false,
    );
    lookupClient.mockResolvedValueOnce({
      clientId: 'opaque-client',
      clientName: 'Muse',
      redirectUris: ['https://evil.example.org/callback'],
    });
    expect(await allowedClient('opaque-client', muse.redirectUris[0]!, env)).toBeNull();
  });
});

describe('agent-aware consent and registration integration', () => {
  it('shows the configured agent, exact callback and escaped client metadata on consent', async () => {
    const request = {
      clientId: grok.clientId,
      redirectUri: grok.redirectUris[0]!,
      scope: ['health:read'],
    };
    const env = createMockEnv(
      {},
      {
        MCP_CLIENT_POLICY: JSON.stringify([grok]),
        OAUTH_PROVIDER: {
          parseAuthRequest: async () => request,
          describeConsent: async () => ({
            clientName: '<script>bad()</script>',
            clientDomain: 'grok.com',
            redirectHost: 'grok.com',
          }),
          beginConsent: async () => ({ handle: 'synthetic', headers: new Headers() }),
        } as any,
      },
    );
    const response = await defaultHandler.fetch(new Request(origin + '/authorize'), env);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('Allow Grok to read');
    expect(html).toContain(grok.redirectUris[0]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('its service provider');
    expect(
      (
        await defaultHandler.fetch(new Request(origin + '/authorize'), {
          ...env,
          MCP_CLIENT_POLICY: '[]',
        })
      ).status,
    ).toBe(400);
  });
  it('does not advertise open DCR and fails closed for invalid configuration', async () => {
    const env = createMockEnv({}, { PUBLIC_ORIGIN: origin, OAUTH_KV: createMockKv() as any });
    const response = await worker.fetch(
      new Request(origin + '/.well-known/oauth-authorization-server'),
      env,
      context(),
    );
    expect(response.status).toBe(200);
    expect(((await response.json()) as any).registration_endpoint).toBeUndefined();
    const bad = await worker.fetch(
      new Request(origin + '/health'),
      { ...env, MCP_CLIENT_POLICY: '{invalid' },
      context(),
    );
    expect(bad.status).toBe(503);
  });
  it('registers an approved callback and rejects a mixed callback list before storing', async () => {
    const policy = JSON.stringify([muse]);
    const env = createMockEnv(
      {},
      { PUBLIC_ORIGIN: origin, MCP_CLIENT_POLICY: policy, OAUTH_KV: createMockKv() as any },
    );
    const provider = providerFor(origin, policy);
    const discover = await provider.fetch(
      new Request(origin + '/.well-known/oauth-authorization-server'),
      env,
      context(),
    );
    expect(((await discover.json()) as any).registration_endpoint).toBe(origin + '/oauth/register');
    const register = (redirects: string[], scope = 'health:read offline_access') =>
      provider.fetch(
        new Request(origin + '/oauth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_name: 'Untrusted claim',
            redirect_uris: redirects,
            token_endpoint_auth_method: 'none',
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            scope,
          }),
        }),
        env,
        context(),
      );
    const denied = await register([...muse.redirectUris, 'https://evil.example.org/callback']);
    expect(denied.status).toBe(400);
    expect(env.OAUTH_KV.put as any).not.toHaveBeenCalled();
    expect((await register(muse.redirectUris, 'health:write')).status).toBe(400);
    const approved = await register(muse.redirectUris);
    expect(approved.status).toBe(201);
    const registered = (await approved.json()) as any;
    expect(registered.client_id).toBeTruthy();
    expect(registered.redirect_uris).toEqual(muse.redirectUris);
  });
  it('exchanges a real synthetic PKCE grant, accepts owner MCP calls, then blocks a removed agent', async () => {
    const policy = JSON.stringify([muse]),
      kv = createMockKv();
    kv.get = vi.fn(async (key: string, options?: any) => {
      const value = kv.__store.get(key);
      return value === undefined
        ? null
        : options === 'json' || options?.type === 'json'
          ? JSON.parse(value)
          : value;
    });
    const env = createMockEnv(
      {},
      {
        PUBLIC_ORIGIN: origin,
        OWNER_EMAIL: 'owner@example.org',
        MCP_CLIENT_POLICY: policy,
        OAUTH_KV: kv as any,
      },
    );
    const provider = providerFor(origin, policy);
    await provider.fetch(new Request(origin + '/health'), env, context());
    const client = await env.OAUTH_PROVIDER.createClient({
      clientName: 'Synthetic agent',
      redirectUris: muse.redirectUris,
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      tokenEndpointAuthMethod: 'none',
    });
    const verifier = 'synthetic-verifier-abcdefghijklmnopqrstuvwxyz-1234567890';
    const challenge = Buffer.from(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
    ).toString('base64url');
    const url = new URL(origin + '/authorize');
    url.search = new URLSearchParams({
      client_id: client.clientId,
      redirect_uri: muse.redirectUris[0]!,
      response_type: 'code',
      scope: 'health:read offline_access',
      resource: origin + '/mcp',
      state: 'synthetic-state',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();
    const request = await env.OAUTH_PROVIDER.parseAuthRequest(new Request(url));
    const grant = await env.OAUTH_PROVIDER.completeAuthorization({
      request,
      userId: 'synthetic-user',
      scope: ['health:read', 'offline_access'],
      metadata: {},
      props: { email: env.OWNER_EMAIL },
    });
    const response = await provider.fetch(
      new Request(origin + '/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: client.clientId,
          code: new URL(grant.redirectTo).searchParams.get('code')!,
          redirect_uri: muse.redirectUris[0]!,
          code_verifier: verifier,
          resource: origin + '/mcp',
        }),
      }),
      env,
      context(),
    );
    expect(response.status).toBe(200);
    const token = (await response.json()) as any;
    expect(token.refresh_token).toBeTruthy();
    const call = () =>
      new Request(origin + '/mcp', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'synthetic-agent', version: '1' },
          },
        }),
      });
    const ok = await worker.fetch(call(), env, context());
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain('personal-health-assistant');
    const blocked = await worker.fetch(call(), { ...env, MCP_CLIENT_POLICY: '[]' }, context());
    expect(blocked.status).toBe(403);
    const wrongOwner = await worker.fetch(
      call(),
      { ...env, OWNER_EMAIL: 'someone-else@example.org' },
      context(),
    );
    expect(wrongOwner.status).toBe(403);
    expect(env.TOKENS.put).not.toHaveBeenCalled();
  });
});
