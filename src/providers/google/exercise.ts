import { z } from 'zod';
import type { ExerciseLog } from '../types';
import type { GoogleClient } from './client';

const DEFAULT_LIMIT = 20;

const ExerciseReconcileSchema = z.object({
  dataPoints: z.array(z.record(z.string(), z.unknown())).optional(),
});

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function firstString(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) if (typeof o[k] === 'string') return o[k] as string;
  return undefined;
}
function firstNumber(o: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

// ⚠️ The v4 exercise dataPoint shape has NOT been observed yet (no exercise
// data on the test account). This mapping is defensive best-effort over
// likely field names; calibrate it against a real response before relying on
// specific fields. It never throws on unknown shapes.
function mapExercise(dp: Record<string, unknown>): ExerciseLog {
  const inner = isRecord(dp.exercise) ? dp.exercise : dp;
  return {
    activityName: firstString(inner, ['activityName', 'name', 'activityType', 'exerciseType']),
    startTime: firstString(inner, ['startTime', 'startTimeMillis']),
    duration: firstNumber(inner, ['durationMillis', 'duration']),
    calories: firstNumber(inner, ['calories', 'kcal', 'activeKilocalories']),
    distance: firstNumber(inner, ['distanceMeters', 'meters', 'distance']),
    averageHeartRate: firstNumber(inner, ['averageHeartRate', 'avgHeartRate', 'avgBpm']),
  };
}

/**
 * Exercise sessions via reconcile (GET + civil-time filter). `beforeDate`
 * (YYYY-MM-DD) caps the window; `limit` maps to pageSize.
 */
export async function getExerciseList(
  client: Pick<GoogleClient, 'requestJson'>,
  opts: { beforeDate?: string; limit?: number },
): Promise<ExerciseLog[]> {
  const filter = opts.beforeDate
    ? `exercise.interval.civil_start_time < "${opts.beforeDate}"`
    : undefined;
  const raw = await client.requestJson(ExerciseReconcileSchema, {
    path: '/v4/users/me/dataTypes/exercise/dataPoints:reconcile',
    query: { pageSize: opts.limit ?? DEFAULT_LIMIT, filter },
  });
  return (raw.dataPoints ?? []).map(mapExercise);
}
