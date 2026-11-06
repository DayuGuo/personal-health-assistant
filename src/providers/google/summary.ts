import type { DailySummary } from '../types';
import { RollupResponseSchema } from './activity';
import { addDaysIso, dailyRollUpBody } from './civil';
import type { GoogleClient } from './client';

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

function round(v: number | undefined, digits: number): number | undefined {
  if (v === undefined) return undefined;
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

// v4 activityLevel enum -> Fitbit-style bucket. Only LIGHT is confirmed
// against the live API; MODERATE/VIGOROUS are inferred and get corrected
// once probed on a day with harder activity.
const ACTIVITY_LEVEL_FIELD: Record<
  string,
  'lightlyActiveMinutes' | 'fairlyActiveMinutes' | 'veryActiveMinutes'
> = {
  LIGHT: 'lightlyActiveMinutes',
  MODERATE: 'fairlyActiveMinutes',
  VIGOROUS: 'veryActiveMinutes',
};

/** First rollupDataPoint's `key` object for a probed dailyRollUp response. */
function firstRollup(raw: unknown, key: string): Record<string, unknown> | undefined {
  const parsed = RollupResponseSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  for (const p of parsed.data.rollupDataPoints ?? []) {
    const obj = (p as Record<string, unknown>)[key];
    if (isRecord(obj)) return obj;
  }
  return undefined;
}

async function rollup(
  client: Pick<GoogleClient, 'requestJson'>,
  slug: string,
  body: unknown,
): Promise<unknown> {
  return client.requestJson(RollupResponseSchema, {
    path: `/v4/users/me/dataTypes/${slug}/dataPoints:dailyRollUp`,
    method: 'POST',
    json: body,
  });
}

function activeMinutes(obj: Record<string, unknown> | undefined) {
  const out: Partial<
    Record<'lightlyActiveMinutes' | 'fairlyActiveMinutes' | 'veryActiveMinutes', number>
  > = {};
  const arr = obj?.activeMinutesRollupByActivityLevel;
  if (!Array.isArray(arr)) return out;
  for (const entry of arr) {
    if (!isRecord(entry)) continue;
    const field = ACTIVITY_LEVEL_FIELD[String(entry.activityLevel)];
    const minutes = num(entry.activeMinutesSum);
    if (field && minutes !== undefined) out[field] = (out[field] ?? 0) + minutes;
  }
  return out;
}

/**
 * Daily activity summary via a dailyRollUp fan-out (one call per stream).
 * Covers the activity streams (steps/distance/calories/floors/active-minutes).
 */
export async function getDailySummary(
  client: Pick<GoogleClient, 'requestJson'>,
  date: string,
): Promise<DailySummary> {
  const body = dailyRollUpBody(date, addDaysIso(date, 1));
  const [steps, distance, calories, floors, active] = await Promise.all([
    rollup(client, 'steps', body),
    rollup(client, 'distance', body),
    rollup(client, 'total-calories', body),
    rollup(client, 'floors', body),
    rollup(client, 'active-minutes', body),
  ]);

  const stepsVal = num(firstRollup(steps, 'steps')?.countSum);
  const kcal = num(firstRollup(calories, 'totalCalories')?.kcalSum);
  const floorsVal = num(firstRollup(floors, 'floors')?.countSum);
  const distMm = num(firstRollup(distance, 'distance')?.millimetersSum);
  const distanceKm = distMm !== undefined ? round(distMm / 1_000_000, 2) : undefined;
  const active_ = activeMinutes(firstRollup(active, 'activeMinutes'));

  return {
    summary: {
      steps: stepsVal,
      caloriesOut: round(kcal, 0),
      floors: floorsVal,
      distances:
        distanceKm !== undefined ? [{ activity: 'total', distance: distanceKm }] : undefined,
      ...active_,
    },
  };
}
