import { describe, expect, it, vi } from 'vitest';
import type { GoogleClient } from '../../../src/providers/google/client';
import { getDailySummary } from '../../../src/providers/google/summary';
import { DailySummarySchema } from '../../../src/providers/types';

// Dispatches each dailyRollUp call to a per-slug fixture. Fixtures use the
// single-day shapes returned by the API, with synthetic values.
function fakeClient(bySlug: Record<string, unknown>): Pick<GoogleClient, 'requestJson'> {
  return {
    requestJson: vi.fn(async (_schema: unknown, req: { path: string }) => {
      const slug = req.path.match(/dataTypes\/([^/]+)\//)?.[1] ?? '';
      return bySlug[slug] ?? {};
    }),
  } as unknown as Pick<GoogleClient, 'requestJson'>;
}

function oneDay(resourceKey: string, value: unknown) {
  return {
    rollupDataPoints: [
      {
        civilStartTime: { date: { year: 2026, month: 7, day: 16 }, time: {} },
        [resourceKey]: value,
      },
    ],
  };
}

const FIXTURES = {
  steps: oneDay('steps', { countSum: '5000' }),
  distance: oneDay('distance', { millimetersSum: '4000000' }),
  'total-calories': oneDay('totalCalories', { kcalSum: 2000.5000000000002 }),
  floors: oneDay('floors', { countSum: '3' }),
  'active-minutes': oneDay('activeMinutes', {
    activeMinutesRollupByActivityLevel: [{ activityLevel: 'LIGHT', activeMinutesSum: '45' }],
  }),
};

describe('getDailySummary', () => {
  it('assembles steps, calories, floors, distance(km) and light active minutes', async () => {
    const s = await getDailySummary(fakeClient(FIXTURES), '2026-07-16');
    expect(s.summary.steps).toBe(5000);
    expect(s.summary.caloriesOut).toBe(2001); // kcalSum rounded
    expect(s.summary.floors).toBe(3);
    expect(s.summary.distances).toEqual([{ activity: 'total', distance: 4 }]); // mm -> km
    expect(s.summary.lightlyActiveMinutes).toBe(45);
  });

  it('satisfies DailySummarySchema', async () => {
    const s = await getDailySummary(fakeClient(FIXTURES), '2026-07-16');
    expect(() => DailySummarySchema.parse(s)).not.toThrow();
  });

  it('omits fields for streams with no data (leaves them undefined)', async () => {
    const s = await getDailySummary(fakeClient({ steps: FIXTURES.steps }), '2026-07-16');
    expect(s.summary.steps).toBe(5000);
    expect(s.summary.caloriesOut).toBeUndefined();
    expect(s.summary.floors).toBeUndefined();
    expect(s.summary.distances).toBeUndefined();
  });
});
