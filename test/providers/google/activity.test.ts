import { describe, expect, it, vi } from 'vitest';
import { getActivityTimeSeries } from '../../../src/providers/google/activity';
import type { GoogleClient } from '../../../src/providers/google/client';

// Fixtures use the shape of the v4 dailyRollUp endpoint (multi-day range,
// windowSizeDays:1, returned newest-first). Values are synthetic.
function fakeClient(fixture: unknown): Pick<GoogleClient, 'requestJson'> {
  return { requestJson: vi.fn(async () => fixture) } as unknown as Pick<
    GoogleClient,
    'requestJson'
  >;
}

const stepsFixture = {
  rollupDataPoints: [
    {
      civilStartTime: { date: { year: 2026, month: 7, day: 17 }, time: {} },
      steps: { countSum: '1200' },
    },
    {
      civilStartTime: { date: { year: 2026, month: 7, day: 16 }, time: {} },
      steps: { countSum: '5000' },
    },
  ],
};

describe('getActivityTimeSeries', () => {
  it('maps steps dailyRollUp to an ascending time series of numbers', async () => {
    const ts = await getActivityTimeSeries(
      fakeClient(stepsFixture),
      'steps',
      '2026-07-16',
      '2026-07-17',
    );
    expect(ts.resource).toBe('steps');
    expect(ts.points).toEqual([
      { dateTime: '2026-07-16', value: 5000 },
      { dateTime: '2026-07-17', value: 1200 },
    ]);
  });

  it('converts distance millimetersSum to meters', async () => {
    const fixture = {
      rollupDataPoints: [
        {
          civilStartTime: { date: { year: 2026, month: 7, day: 16 }, time: {} },
          distance: { millimetersSum: '4000000' },
        },
      ],
    };
    const ts = await getActivityTimeSeries(
      fakeClient(fixture),
      'distance',
      '2026-07-16',
      '2026-07-16',
    );
    expect(ts.points).toEqual([{ dateTime: '2026-07-16', value: 4000 }]);
  });

  it('reads total-calories kcalSum (a float, not a string)', async () => {
    const fixture = {
      rollupDataPoints: [
        {
          civilStartTime: { date: { year: 2026, month: 7, day: 16 }, time: {} },
          totalCalories: { kcalSum: 2000.5000000000002 },
        },
      ],
    };
    const ts = await getActivityTimeSeries(
      fakeClient(fixture),
      'calories',
      '2026-07-16',
      '2026-07-16',
    );
    expect(ts.points[0]?.value).toBeCloseTo(2000.5, 4);
  });

  it('reads floors countSum', async () => {
    const fixture = {
      rollupDataPoints: [
        {
          civilStartTime: { date: { year: 2026, month: 7, day: 16 }, time: {} },
          floors: { countSum: '3' },
        },
      ],
    };
    const ts = await getActivityTimeSeries(
      fakeClient(fixture),
      'floors',
      '2026-07-16',
      '2026-07-16',
    );
    expect(ts.points).toEqual([{ dateTime: '2026-07-16', value: 3 }]);
  });

  it('returns an empty series when there are no rollup points', async () => {
    const ts = await getActivityTimeSeries(fakeClient({}), 'steps', '2026-07-16', '2026-07-17');
    expect(ts.points).toEqual([]);
  });

  it('throws for a resource not yet mapped to v4', async () => {
    await expect(
      getActivityTimeSeries(fakeClient({}), 'caloriesBMR', '2026-07-16', '2026-07-16'),
    ).rejects.toThrow(/not supported/);
  });
});
