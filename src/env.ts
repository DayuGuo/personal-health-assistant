import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
export type CacheObservation = {
  cache_hit: boolean;
  fetched_at_utc: string;
  expires_at_utc: string;
};
export type Env = {
  TOKENS: KVNamespace;
  CACHE: KVNamespace;
  OAUTH_KV: KVNamespace;
  ASSETS: Fetcher;
  OAUTH_PROVIDER: OAuthHelpers;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  LOGIN_CLIENT_ID: string;
  LOGIN_CLIENT_SECRET: string;
  OWNER_EMAIL: string;
  PUBLIC_ORIGIN: string;
  FITBIT_CLIENT_ID: string;
  FITBIT_CLIENT_SECRET: string;
  REQUEST_CACHE_META?: CacheObservation[];
  REQUEST_ABORT_SIGNAL?: AbortSignal;
  REQUEST_FAIL_FAST?: boolean;
};
