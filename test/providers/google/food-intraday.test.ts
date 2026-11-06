import { describe, expect, it, vi } from 'vitest';
import type { GoogleClient } from '../../../src/providers/google/client';
import { getFoodLog } from '../../../src/providers/google/food';
import { downsampleHeartRate, getHeartRateIntraday } from '../../../src/providers/google/intraday';
import { FoodLogSchema, HeartRateIntradaySchema } from '../../../src/providers/types';

function client(fixture: unknown): Pick<GoogleClient, 'requestJson'> {
  return { requestJson: vi.fn(async () => fixture) } as unknown as Pick<
    GoogleClient,
    'requestJson'
  >;
}

// nutrition-log shape (synthetic values).
const FOOD_FIXTURE = {
  dataPoints: [
    {
      dataPointName:
        'users/1000000000000000001/dataTypes/nutrition-log/dataPoints/249837358466911597',
      nutritionLog: {
        interval: {
          civilStartTime: { date: { year: 2026, month: 7, day: 13 }, time: { hours: 8 } },
        },
        nutrients: [
          { quantity: { grams: 8 }, nutrient: 'PROTEIN' },
          { quantity: { grams: 0.05 }, nutrient: 'SODIUM' },
        ],
        energy: { kcal: 290, userProvidedUnit: 'CALORIE' },
        totalCarbohydrate: { grams: 35 },
        totalFat: { grams: 10 },
        mealType: 'BREAKFAST',
        serving: { amount: 1, foodMeasurementUnitDisplayName: 'cup' },
      },
    },
  ],
};

describe('getFoodLog', () => {
  it('maps nutrients, energy and mealType for the requested day', async () => {
    const log = await getFoodLog(client(FOOD_FIXTURE), '2026-07-13');
    expect(log.foods).toHaveLength(1);
    const f = log.foods?.[0];
    expect(f?.nutritionalValues).toEqual({
      calories: 290,
      carbs: 35,
      fat: 10,
      protein: 8,
      sodium: 50, // 0.05 g -> mg
    });
    expect(f?.loggedFood?.mealTypeId).toBe(1); // BREAKFAST
    expect(log.summary?.calories).toBe(290);
    expect(() => FoodLogSchema.parse(log)).not.toThrow();
  });

  it('excludes entries from other days', async () => {
    const log = await getFoodLog(client(FOOD_FIXTURE), '2026-07-01');
    expect(log.foods).toEqual([]);
  });
});

describe('downsampleHeartRate', () => {
  it('averages samples into 1-minute buckets', () => {
    const pts = [
      { sec: 0, bpm: 60 },
      { sec: 30, bpm: 80 },
      { sec: 61, bpm: 100 },
    ];
    expect(downsampleHeartRate(pts, '1min')).toEqual([
      { time: '00:00:00', value: 70 },
      { time: '00:01:00', value: 100 },
    ]);
  });
  it('passes samples through at 1sec detail', () => {
    expect(downsampleHeartRate([{ sec: 5, bpm: 77 }], '1sec')).toEqual([
      { time: '00:00:05', value: 77 },
    ]);
  });
});

describe('getHeartRateIntraday', () => {
  it('filters to the day and downsamples (heart-rate list shape)', async () => {
    const fixture = {
      dataPoints: [
        {
          heartRate: {
            sampleTime: {
              civilTime: {
                date: { year: 2026, month: 7, day: 17 },
                time: { hours: 14, minutes: 59, seconds: 11 },
              },
            },
            beatsPerMinute: '77',
          },
        },
        {
          heartRate: {
            sampleTime: {
              civilTime: { date: { year: 2026, month: 7, day: 16 }, time: { hours: 3 } },
            },
            beatsPerMinute: '60',
          },
        },
      ],
    };
    const out = await getHeartRateIntraday(client(fixture), '2026-07-17', '5min');
    expect(out.date).toBe('2026-07-17');
    expect(out.points).toEqual([{ time: '14:55:00', value: 77 }]);
    expect(() => HeartRateIntradaySchema.parse(out)).not.toThrow();
  });
});
