import { z } from 'zod';
import type { Env } from '../env';
import { isChatGPTClient } from './security';

const endpoint = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => {
    try {
      const u = new URL(value);
      return (
        u.protocol === 'https:' &&
        !u.username &&
        !u.password &&
        !u.port &&
        !u.hash &&
        u.href === value &&
        !/[\s*\\]/.test(value) &&
        /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(u.hostname)
      );
    } catch {
      return false;
    }
  }, 'Use an exact public HTTPS URL without wildcards, credentials, fragments or custom ports');
const common = {
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[^\u0000-\u001f\u007f]+$/),
  redirectUris: z.array(endpoint).min(1).max(16),
};
const schema = z
  .array(
    z.discriminatedUnion('mode', [
      z
        .object({
          ...common,
          mode: z.literal('cimd'),
          clientId: endpoint.refine((v) => !new URL(v).search),
        })
        .strict(),
      z.object({ ...common, mode: z.literal('registration') }).strict(),
    ]),
  )
  .max(16);
export type AgentClientPolicy = z.infer<typeof schema>;
export type AgentClient = AgentClientPolicy[number];

/** Operator-approved pairs only. Empty configuration preserves ChatGPT-only access. */
export function parseClientPolicy(raw?: string): AgentClientPolicy {
  if (raw === undefined || raw === '') return [];
  if (raw.length > 32768) throw Error('MCP_CLIENT_POLICY is too large');
  const result = schema.safeParse(JSON.parse(raw));
  if (!result.success) throw Error('Invalid MCP_CLIENT_POLICY');
  const pairs = new Set<string>();
  for (const p of result.data) {
    for (const r of p.redirectUris) {
      const key = p.mode === 'cimd' ? p.clientId + '\n' + r : 'registration\n' + r;
      if (pairs.has(key)) throw Error('Duplicate MCP client/redirect pair');
      pairs.add(key);
    }
  }
  return result.data;
}

/** Never trust a name supplied by a registration request as proof of identity. */
export function registrationPolicy(
  policy: AgentClientPolicy,
  redirects: unknown,
): AgentClient | null {
  if (
    !Array.isArray(redirects) ||
    !redirects.length ||
    !redirects.every((r) => typeof r === 'string')
  )
    return null;
  return (
    policy.find(
      (p) => p.mode === 'registration' && redirects.every((r) => p.redirectUris.includes(r)),
    ) ?? null
  );
}

async function registeredClient(clientId: string, policy: AgentClientPolicy, env: Env) {
  // Do not fetch arbitrary CIMD documents while checking an unapproved URL client.
  if (!clientId || clientId.includes(':') || !policy.some((p) => p.mode === 'registration'))
    return null;
  const client = await env.OAUTH_PROVIDER.lookupClient(clientId);
  if (!client) return null;
  const approved = registrationPolicy(policy, client.redirectUris);
  return approved ? { ...approved, redirectUris: client.redirectUris } : null;
}

export async function allowedClient(
  clientId: string,
  redirectUri: string,
  env: Env,
): Promise<string | null> {
  const policy = parseClientPolicy(env.MCP_CLIENT_POLICY);
  if (isChatGPTClient(clientId, redirectUri)) return 'ChatGPT';
  const cimd = policy.find(
    (p) => p.mode === 'cimd' && p.clientId === clientId && p.redirectUris.includes(redirectUri),
  );
  if (cimd) return cimd.name;
  const registered = await registeredClient(clientId, policy, env);
  return registered?.redirectUris.includes(redirectUri) ? registered.name : null;
}

/** Removing an extra client also blocks its already-issued MCP access tokens. */
export async function allowedTokenClient(clientId: string | undefined, env: Env): Promise<boolean> {
  if (!clientId) return false;
  const policy = parseClientPolicy(env.MCP_CLIENT_POLICY);
  if (isChatGPTClient(clientId, 'https://chatgpt.com/connector_platform_oauth_redirect'))
    return true;
  if (policy.some((p) => p.mode === 'cimd' && p.clientId === clientId)) return true;
  return !!(await registeredClient(clientId, policy, env));
}
