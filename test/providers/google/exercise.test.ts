import { describe, expect, it, vi } from 'vitest';
import type { GoogleClient } from '../../../src/providers/google/client';
import { getExerciseList } from '../../../src/providers/google/exercise';

// NOTE: the live account currently has no exercise data, so the dataPoint
// field mapping is unverified. These tests only assert behaviors confirmed
// against the real API: the empty response and the request construction.
describe('getExerciseList', () => {
  it('returns [] when reconcile responds empty (real: {} for no data)', async () => {
    const client = { requestJson: vi.fn(async () => ({})) } as unknown as Pick<
      GoogleClient,
      'requestJson'
    >;
    expect(await getExerciseList(client, {})).toEqual([]);
  });

  it('builds a reconcile GET with pageSize and an optional before-date filter', async () => {
    const spy = vi.fn(async (_schema: unknown, _req: unknown) => ({}));
    const client = { requestJson: spy } as unknown as Pick<GoogleClient, 'requestJson'>;
    await getExerciseList(client, { beforeDate: '2026-07-17', limit: 5 });

    const call = spy.mock.calls[0];
    if (!call) throw new Error('requestJson not called');
    const req = call[1] as { path: string; query?: Record<string, unknown> };
    expect(req.path).toBe('/v4/users/me/dataTypes/exercise/dataPoints:reconcile');
    expect(req.query?.pageSize).toBe(5);
    expect(String(req.query?.filter)).toContain(
      'exercise.interval.civil_start_time < "2026-07-17"',
    );
  });

  it('omits the filter when no beforeDate is given', async () => {
    const spy = vi.fn(async (_schema: unknown, _req: unknown) => ({}));
    const client = { requestJson: spy } as unknown as Pick<GoogleClient, 'requestJson'>;
    await getExerciseList(client, {});
    const req = spy.mock.calls[0]?.[1] as { query?: Record<string, unknown> };
    expect(req.query?.filter).toBeUndefined();
  });
});
