import { describe, expect, it } from 'vitest';
import {
  addDaysIso,
  civilDateToIso,
  dailyRollUpBody,
  isoToCivilDate,
} from '../../../src/providers/google/civil';

describe('isoToCivilDate', () => {
  it('parses YYYY-MM-DD into a civil date', () => {
    expect(isoToCivilDate('2026-07-11')).toEqual({ year: 2026, month: 7, day: 11 });
  });
  it('rejects malformed input', () => {
    expect(() => isoToCivilDate('2026/07/11')).toThrow();
    expect(() => isoToCivilDate('2026-7-11')).toThrow();
  });
});

describe('civilDateToIso', () => {
  it('zero-pads month and day', () => {
    expect(civilDateToIso({ year: 2026, month: 7, day: 1 })).toBe('2026-07-01');
  });
});

describe('addDaysIso', () => {
  it('adds a day', () => {
    expect(addDaysIso('2026-07-17', 1)).toBe('2026-07-18');
  });
  it('rolls over month boundaries', () => {
    expect(addDaysIso('2026-07-31', 1)).toBe('2026-08-01');
  });
});

describe('dailyRollUpBody', () => {
  it('builds a civil-time range body with 1-day windows', () => {
    expect(dailyRollUpBody('2026-07-11', '2026-07-18')).toEqual({
      range: {
        start: {
          date: { year: 2026, month: 7, day: 11 },
          time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
        },
        end: {
          date: { year: 2026, month: 7, day: 18 },
          time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
        },
      },
      windowSizeDays: 1,
      dataSourceFamily:'users/me/dataSourceFamilies/google-wearables',
    });
  });
});
