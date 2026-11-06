import type { ZodType } from 'zod';
import type { Env } from '../../env';
// Reused across providers under Fitbit-era names.
import { FitbitApiError, FitbitRateLimitError } from '../../lib/errors';
import { parseRetryAfter, sleep } from '../../lib/rate-limit';
import { getAccessToken, invalidateAccessToken } from './oauth';

function safeApiReason(text: string): string {
  try {
    const e = JSON.parse(text).error;
    const reasons = (e?.details || [])
      .map((d: { reason?: string }) => d.reason)
      .filter((x: unknown) => typeof x === 'string' && /^[A-Z_]{1,80}$/.test(x as string));
    return JSON.stringify({
      status: /^[A-Z_]+$/.test(e?.status) ? e.status : 'API_ERROR',
      reasons,
    });
  } catch {
    return 'API_ERROR';
  }
}
const GOOGLE_API_BASE = 'https://health.googleapis.com';

export type GoogleRequest = {
  /** Absolute path starting with `/`, e.g. `/v4/users/me/profile`. */
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Query parameters appended to the URL. */
  query?: Record<string, string | number | undefined>;
  /** JSON request body for POST/PATCH; sent as `application/json`. */
  json?: unknown;
};

export class GoogleClient {
  constructor(private readonly env: Env) {}

  async requestJson<T>(schema: ZodType<T>, req: GoogleRequest): Promise<T> {
    const body = await this.requestText(req);
    const parsed = schema.safeParse(JSON.parse(body));
    if (!parsed.success) {
      throw new FitbitApiError(
        200,
        `Google Health response schema mismatch at ${req.path}`,
        req.path,
      );
    }
    return parsed.data;
  }

  async requestText(req: GoogleRequest): Promise<string> {
    const url = new URL(req.path, GOOGLE_API_BASE);
    if (url.origin !== GOOGLE_API_BASE || !url.pathname.startsWith('/v4/users/me/'))
      throw new Error('Unsupported API path');
    if (req.query) {
      for (const [k, v] of Object.entries(req.query)) {
        if (v !== undefined && v !== null && v !== '') {
          url.searchParams.set(k, String(v));
        }
      }
    }

    let attempt = 0;
    const MAX_ATTEMPTS = 3; // original + one refresh retry + one rate-limit retry
    while (true) {
      attempt++;
      const token = await getAccessToken(this.env);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      };

      let body: BodyInit | undefined;
      if (req.json !== undefined) {
        body = JSON.stringify(req.json);
        headers['Content-Type'] = 'application/json';
      }

      const t0 = Date.now();
      const res = await fetch(url, {
        method: req.method ?? 'GET',
        headers,
        body,
        signal: this.env.REQUEST_ABORT_SIGNAL,
      });
      const ms = Date.now() - t0;
      const method = req.method ?? 'GET';

      if (res.status === 401 && attempt === 1) {
        console.log(`[google] ${method} ${req.path} → 401 after ${ms}ms, refreshing token`);
        await invalidateAccessToken(this.env);
        continue;
      }

      if (res.status === 429) {
        if (this.env.REQUEST_FAIL_FAST)
          throw new FitbitRateLimitError(
            parseRetryAfter(res.headers.get('Retry-After'), { fallbackSec: 60, maxSec: 3600 }),
            req.path,
          );
        const waitSec = parseRetryAfter(res.headers.get('Retry-After'));
        if (attempt < MAX_ATTEMPTS) {
          console.log(`[google] ${method} ${req.path} → 429, sleeping ${waitSec}s before retry`);
          await sleep(waitSec * 1000);
          continue;
        }
        throw new FitbitRateLimitError(waitSec, req.path);
      }

      const text = await res.text();
      if (!res.ok) {
        console.log(`[google] ${method} ${req.path} → ${res.status}`);
        throw new FitbitApiError(res.status, safeApiReason(text), req.path);
      }
      return text;
    }
  }
}
