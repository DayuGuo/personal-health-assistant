import type { Env } from '../env';
export const DEFAULT_CACHE_TTL_SEC = 300;
export type CacheDetail = {
  cache_hit: boolean;
  fetched_at_utc: string;
  expires_at_utc: string;
  cache_state: 'hit' | 'miss' | 'unavailable';
};
export async function getCachedDetailed<T>(
  env: Env,
  key: string,
  fetcher: () => Promise<T>,
  opts: { ttlSec?: number } = {},
): Promise<{ data: T; freshness: CacheDetail }> {
  const ttl = Math.min(300, Math.max(60, opts.ttlSec ?? DEFAULT_CACHE_TTL_SEC));
  const k = 'health-cache:v2:' + key;
  let cacheAvailable = true;
  try {
    const hit = await env.CACHE.get<{ data: T; fetchedAt: string; expiresAt: string }>(k, 'json');
    const now = Date.now(),
      fetchedAt = hit ? Date.parse(hit.fetchedAt) : NaN,
      expiresAt = hit ? Date.parse(hit.expiresAt) : NaN;
    if (
      hit &&
      hit.data !== undefined &&
      fetchedAt <= now &&
      now - fetchedAt < ttl * 1000 &&
      expiresAt > now
    )
      return {
        data: hit.data,
        freshness: {
          cache_hit: true,
          cache_state: 'hit',
          fetched_at_utc: hit.fetchedAt,
          expires_at_utc: hit.expiresAt,
        },
      };
  } catch {
    cacheAvailable = false;
  }
  const data = await fetcher(),
    fetchedAt = new Date().toISOString();
  let expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  try {
    await env.CACHE.put(k, JSON.stringify({ data, fetchedAt, expiresAt }), { expirationTtl: ttl });
  } catch {
    cacheAvailable = false;
    expiresAt = fetchedAt;
  }
  return {
    data,
    freshness: {
      cache_hit: false,
      cache_state: cacheAvailable ? 'miss' : 'unavailable',
      fetched_at_utc: fetchedAt,
      expires_at_utc: expiresAt,
    },
  };
}
export async function getCached<T>(
  env: Env,
  key: string,
  fetcher: () => Promise<T>,
  opts: { ttlSec?: number } = {},
): Promise<T> {
  const result = await getCachedDetailed(env, key, fetcher, opts);
  env.REQUEST_CACHE_META?.push(result.freshness);
  return result.data;
}
export async function invalidate(env: Env, ...keys: string[]): Promise<void> {
  await Promise.all(keys.map((k) => env.CACHE.delete('health-cache:v2:' + k)));
}
export function cacheKey(endpoint: string, args: Record<string, unknown> = {}): string {
  const parts = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${String(v)}`)
    .join('&');
  return parts ? `${endpoint}?${parts}` : endpoint;
}
