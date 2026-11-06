import { describe, expect, it, vi } from 'vitest';
import type { GoogleClient } from '../../../src/providers/google/client';
import { getSleep, getSleepRange } from '../../../src/providers/google/sleep';
import { SleepLogSchema } from '../../../src/providers/types';

// Sleep shape: sleep.interval + stages[]{startTime,endTime,type}.
// Stage times chosen with clean durations to verify the mapping arithmetic.
const SLEEP_FIXTURE = {
  dataPoints: [
    {
      dataPointName: 'users/1000000000000000001/dataTypes/sleep/dataPoints/8080069723826967416',
      sleep: {
        interval: {
          startTime: '2026-07-16T13:36:00Z',
          startUtcOffset: '43200s',
          endTime: '2026-07-16T15:46:00Z',
          endUtcOffset: '43200s',
        },
        type: 'STAGES',
        stages: [
          { startTime: '2026-07-16T13:36:00Z', endTime: '2026-07-16T13:46:00Z', type: 'AWAKE' }, // 10m
          { startTime: '2026-07-16T13:46:00Z', endTime: '2026-07-16T14:46:00Z', type: 'LIGHT' }, // 60m
          { startTime: '2026-07-16T14:46:00Z', endTime: '2026-07-16T15:16:00Z', type: 'DEEP' }, //  30m
          { startTime: '2026-07-16T15:16:00Z', endTime: '2026-07-16T15:46:00Z', type: 'REM' }, //  30m
        ],
      },
    },
  ],
};

function client(fixture: unknown): Pick<GoogleClient, 'requestJson'> {
  return { requestJson: vi.fn(async () => fixture) } as unknown as Pick<
    GoogleClient,
    'requestJson'
  >;
}

describe('getSleep', () => {
  it('assigns dateOfSleep by local wake time (+12h offset -> next day)', async () => {
    // endTime 15:46Z + 43200s = 03:46 local on 2026-07-17
    const out = await getSleep(client(SLEEP_FIXTURE), '2026-07-17');
    expect(out).toHaveLength(1);
    expect(out[0]?.dateOfSleep).toBe('2026-07-17');
  });

  it('sums asleep/awake minutes and time in bed from stages', async () => {
    const [s] = await getSleep(client(SLEEP_FIXTURE), '2026-07-17');
    expect(s?.minutesAsleep).toBe(120); // light 60 + deep 30 + rem 30
    expect(s?.minutesAwake).toBe(10);
    expect(s?.timeInBed).toBe(130); // 13:36 -> 15:46 = 130m
    expect(s?.levels?.data).toHaveLength(4);
    expect(s?.levels?.summary?.deep).toEqual({ minutes: 30 });
  });

  it('produces a SleepLog that satisfies the schema', async () => {
    const [s] = await getSleep(client(SLEEP_FIXTURE), '2026-07-17');
    expect(() => SleepLogSchema.parse(s)).not.toThrow();
  });

  it('returns [] for a date with no matching sleep', async () => {
    expect(await getSleep(client(SLEEP_FIXTURE), '2026-07-10')).toEqual([]);
  });
});

describe('getSleepRange', () => {
  it('includes sleep whose wake date falls in range', async () => {
    const out = await getSleepRange(client(SLEEP_FIXTURE), '2026-07-15', '2026-07-18');
    expect(out.map((s) => s.dateOfSleep)).toEqual(['2026-07-17']);
  });
});
