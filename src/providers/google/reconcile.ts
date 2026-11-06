import { z } from 'zod';
import type { GoogleClient } from './client';
import { IncompleteDataError } from '../../lib/errors';

// v4 reconcile: GET .../dataPoints:reconcile. We omit `filter` — its member
// names are type-specific and brittle (probed: sleep/daily-* filters 400),
// while omitting it returns recent dataPoints. pageSize caps the count; range
// narrowing is done client-side on the civil date.
const ReconcileResponseSchema = z.object({
  dataPoints: z.array(z.record(z.string(), z.unknown())).optional(),
  nextPageToken: z.string().optional(),
});

export async function reconcile(
  client: Pick<GoogleClient, 'requestJson'>,
  slug: string,
  pageSize: number,
): Promise<Array<Record<string, unknown>>> {
  const points: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  let token: string | undefined;
  for (let page = 0; page < 100; page++) {
    const raw = await client.requestJson(ReconcileResponseSchema, {
      path: `/v4/users/me/dataTypes/${slug}/dataPoints:reconcile`,
      query: {
        pageSize: slug === 'sleep' ? 25 : pageSize,
        pageToken: token,
        dataSourceFamily:
          'users/me/dataSourceFamilies/' +
          (slug.startsWith('daily-') ? 'google-sources' : 'google-wearables'),
      },
    });
    points.push(...(raw.dataPoints ?? []));
    if (!raw.nextPageToken) return points;
    if (seen.has(raw.nextPageToken))
      throw new IncompleteDataError('Repeated pagination token; partial results refused.');
    seen.add(raw.nextPageToken);
    token = raw.nextPageToken;
  }
  throw new IncompleteDataError('Pagination limit reached; partial results refused.');
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function inRange(dateIso: string, start: string, end: string): boolean {
  return dateIso >= start && dateIso <= end;
}
