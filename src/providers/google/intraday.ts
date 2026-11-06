import { z } from 'zod';
import type { HeartRateIntraday, IntradayDetailLevelT } from '../types';
import { type CivilDate, civilDateToIso } from './civil';
import type { GoogleClient } from './client';
import { isRecord, num } from './reconcile';

const BUCKET_SEC: Record<Exclude<IntradayDetailLevelT, '1sec'>, number> = {
  '1min': 60,
  '5min': 300,
  '15min': 900,
};

const HeartRateListSchema = z.object({
  dataPoints: z.array(z.record(z.string(), z.unknown())).optional(),
});

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
function secToHms(sec: number): string {
  return `${pad2(Math.floor(sec / 3600))}:${pad2(Math.floor((sec % 3600) / 60))}:${pad2(sec % 60)}`;
}

export type RawHrPoint = { sec: number; bpm: number };

/** Downsample raw HR samples into per-bucket averages (1sec = passthrough). */
export function downsampleHeartRate(
  points: RawHrPoint[],
  detailLevel: IntradayDetailLevelT,
): Array<{ time: string; value: number }> {
  const sorted = [...points].sort((a, b) => a.sec - b.sec);
  if (detailLevel === '1sec') {
    return sorted.map((p) => ({ time: secToHms(p.sec), value: p.bpm }));
  }
  const bucket = BUCKET_SEC[detailLevel];
  const acc = new Map<number, { sum: number; n: number }>();
  for (const p of sorted) {
    const key = Math.floor(p.sec / bucket) * bucket;
    const cur = acc.get(key) ?? { sum: 0, n: 0 };
    cur.sum += p.bpm;
    cur.n += 1;
    acc.set(key, cur);
  }
  return [...acc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, { sum, n }]) => ({ time: secToHms(key), value: Math.round(sum / n) }));
}

/**
 * Intraday heart rate for a single day, downsampled client-side. NOTE: fetches
 * one page (pageSize 10000); a very high-frequency day can exceed that and be
 * truncated to the most recent samples — paginate if full-day fidelity matters.
 */
export async function getHeartRateIntraday(
  client: Pick<GoogleClient, 'requestJson'>,
  date: string,
  detailLevel: IntradayDetailLevelT,
): Promise<HeartRateIntraday> {
  const raw = await client.requestJson(HeartRateListSchema, {
    path: '/v4/users/me/dataTypes/heart-rate/dataPoints',
    query: { pageSize: 10000 },
  });
  const points: RawHrPoint[] = [];
  for (const dp of raw.dataPoints ?? []) {
    const hr = dp.heartRate;
    if (!isRecord(hr) || !isRecord(hr.sampleTime) || !isRecord(hr.sampleTime.civilTime)) continue;
    const civil = hr.sampleTime.civilTime;
    if (!isRecord(civil.date) || !isRecord(civil.time)) continue;
    if (civilDateToIso(civil.date as unknown as CivilDate) !== date) continue;
    const t = civil.time as Record<string, unknown>;
    const sec = (num(t.hours) ?? 0) * 3600 + (num(t.minutes) ?? 0) * 60 + (num(t.seconds) ?? 0);
    const bpm = num(hr.beatsPerMinute);
    if (bpm !== undefined) points.push({ sec, bpm });
  }
  return { date, detailLevel, points: downsampleHeartRate(points, detailLevel) };
}
