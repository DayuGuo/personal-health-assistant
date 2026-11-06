import { z } from 'zod';
import { normalizeRange } from '../../lib/date';
import type { ActivityResourceT, TimeSeries } from '../types';
import { addDaysIso, civilDateToIso, dailyRollUpBody } from './civil';
import type { GoogleClient } from './client';

const CivilTimeSchema = z.object({
  date: z.object({ year: z.number(), month: z.number(), day: z.number() }),
  time: z.record(z.string(), z.unknown()).optional(),
});
const RollupPointSchema = z.object({ civilStartTime: CivilTimeSchema }).passthrough();
export const RollupResponseSchema = z.object({
  rollupDataPoints: z.array(RollupPointSchema).optional(),
});
type RollupPoint = z.infer<typeof RollupPointSchema>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

type ResourceSpec = {
  slug: string; // v4 data-type slug
  key: string; // key inside a rollupDataPoint holding the value object
  extract: (o: Record<string, unknown>) => number | undefined;
};

// Only resources whose rollup shape has been verified against the live API.
// Others throw until probed + added (avoids mapping imagined field names).
const RESOURCE_MAP: Partial<Record<ActivityResourceT, ResourceSpec>> = {
  steps: { slug: 'steps', key: 'steps', extract: (o) => num(o.countSum) },
  distance: {
    slug: 'distance',
    key: 'distance',
    // v4 surfaces millimetersSum; convert to meters.
    extract: (o) => {
      const mm = num(o.millimetersSum);
      return mm !== undefined ? mm / 1000 : num(o.metersSum);
    },
  },
  calories: { slug: 'total-calories', key: 'totalCalories', extract: (o) => num(o.kcalSum) },
  floors: { slug: 'floors', key: 'floors', extract: (o) => num(o.countSum) },
};

function pointValue(point: RollupPoint, spec: ResourceSpec): number | undefined {
  const obj = (point as Record<string, unknown>)[spec.key];
  return isRecord(obj) ? spec.extract(obj) : undefined;
}

/**
 * Activity time series via dailyRollUp (one point per day). `start`/`end` are
 * inclusive YYYY-MM-DD; the request end is bumped +1 day (v4 range is
 * half-open). Points are returned oldest-first.
 */
export async function getActivityTimeSeries(
  client: Pick<GoogleClient, 'requestJson'>,
  resource: ActivityResourceT,
  start: string,
  end: string,
): Promise<TimeSeries> {
  const spec = RESOURCE_MAP[resource];
  if (!spec) {
    throw new Error(
      `getActivityTimeSeries: resource "${resource}" not supported (supported: steps, distance, calories, floors).`,
    );
  }
  const range = normalizeRange(start, end);
  const raw = await client.requestJson(RollupResponseSchema, {
    path: `/v4/users/me/dataTypes/${spec.slug}/dataPoints:dailyRollUp`,
    method: 'POST',
    json: dailyRollUpBody(range.start, addDaysIso(range.end, 1)),
  });

  const points = (raw.rollupDataPoints ?? [])
    .map((p) => {
      const value = pointValue(p, spec);
      return value === undefined
        ? undefined
        : { dateTime: civilDateToIso(p.civilStartTime.date), value };
    })
    .filter((p): p is { dateTime: string; value: number } => p !== undefined)
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime));

  return { resource, points };
}
