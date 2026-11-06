import { z } from 'zod';
import { assertIsoDate, todayLondon } from '../lib/date';
import { addDaysIso } from '../providers/google/civil';
import type { SleepLog } from '../providers/types';

export const RecordSchema = z.object({
  date: z.string(),
  value: z.number().finite(),
  evidence_id: z.string(),
});
export type DailyRecord = z.infer<typeof RecordSchema>;
export type Exclusion = { date: string; reason: string };
export function overviewWindow(endDate?: string) {
  const today = todayLondon(),
    end = endDate ?? addDaysIso(today, -1);
  assertIsoDate(end, 'end_date');
  if (end >= today) throw new RangeError('Overview requires a completed calendar day');
  const start = addDaysIso(end, -34);
  assertIsoDate(start, 'start');
  return {
    end,
    start,
    recent_start: addDaysIso(end, -6),
    baseline_end: addDaysIso(end, -7),
    today,
  };
}
export function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let day = start; day <= end; day = addDaysIso(day, 1)) dates.push(day);
  return dates;
}
export function normalizeRecords(
  metric: string,
  raw: { date: string; value: unknown }[],
  start: string,
  end: string,
  valid: (n: number) => boolean,
): { records: DailyRecord[]; excluded: Exclusion[] } {
  const values = new Map<string, number>(),
    bad = new Map<string, string>();
  for (const row of raw) {
    try {
      assertIsoDate(row.date);
    } catch {
      bad.set('unknown', 'invalid_record_date');
      continue;
    }
    if (row.date < start || row.date > end) continue;
    if (typeof row.value !== 'number' || !Number.isFinite(row.value) || !valid(row.value)) {
      bad.set(row.date, 'invalid_or_missing_value');
      continue;
    }
    if (values.has(row.date) && values.get(row.date) !== row.value)
      bad.set(row.date, 'conflicting_daily_records');
    else values.set(row.date, row.value);
  }
  // A partly invalid/conflicting day is excluded rather than silently picking a value.
  const records = [...values]
    .filter(([d]) => !bad.has(d))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value, evidence_id: `${metric}:${date}` }));
  return {
    records,
    excluded: [...bad]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, reason]) => ({ date, reason })),
  };
}
export function sleepRecords(
  logs: SleepLog[],
  start: string,
  end: string,
): { records: DailyRecord[]; excluded: Exclusion[] } {
  const grouped = new Map<string, { start: number; end: number; seconds: number }[]>(),
    bad = new Map<string, string>();
  for (const log of logs) {
    const date = log.dateOfSleep;
    try {
      assertIsoDate(date);
    } catch {
      bad.set('unknown', 'invalid_record_date');
      continue;
    }
    if (date < start || date > end) continue;
    const a = Date.parse(log.startTime),
      b = Date.parse(log.endTime),
      stages = log.levels?.data;
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || !stages?.length) {
      bad.set(date, 'incomplete_sleep_stages');
      continue;
    }
    let asleep = 0,
      coverage = 0,
      previous = a,
      invalid = false;
    for (const stage of [...stages].sort(
      (x, y) => Date.parse(x.dateTime) - Date.parse(y.dateTime),
    )) {
      const s = Date.parse(stage.dateTime),
        length = stage.seconds * 1000,
        e = s + length;
      if (
        !['light', 'deep', 'rem', 'wake'].includes(stage.level) ||
        !Number.isFinite(s) ||
        !Number.isFinite(length) ||
        length < 0 ||
        s < a ||
        e > b + 1000 ||
        s < previous
      ) {
        invalid = true;
        break;
      }
      previous = e;
      coverage += length;
      if (stage.level !== 'wake') asleep += stage.seconds;
    }
    if (invalid || Math.abs(b - a - coverage) > 60000) {
      bad.set(date, 'incomplete_or_overlapping_sleep_stages');
      continue;
    }
    const list = grouped.get(date) ?? [];
    if (!list.some((x) => x.start === a && x.end === b && x.seconds === asleep))
      list.push({ start: a, end: b, seconds: asleep });
    grouped.set(date, list);
  }
  const raw: { date: string; value: number }[] = [];
  for (const [date, episodes] of grouped) {
    episodes.sort((a, b) => a.start - b.start);
    if (episodes.some((x, i) => i > 0 && x.start < episodes[i - 1]!.end)) {
      bad.set(date, 'overlapping_sleep_episodes');
      continue;
    }
    if (!bad.has(date))
      raw.push({ date, value: episodes.reduce((sum, x) => sum + x.seconds, 0) / 60 });
  }
  const result = normalizeRecords('sleep_minutes', raw, start, end, (n) => n >= 0);
  return {
    records: result.records,
    excluded: [...bad]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, reason]) => ({ date, reason })),
  };
}
const round = (n: number) => Number(n.toFixed(2));
const mean = (rows: DailyRecord[]) => rows.reduce((sum, r) => sum + r.value / rows.length, 0);
export const WindowStatsSchema = z.object({
  start: z.string(),
  end: z.string(),
  expected_days: z.number(),
  valid_days: z.number().nullable(),
  mean: z.number().nullable(),
  minimum: z.number().nullable(),
  maximum: z.number().nullable(),
  observed_total: z.number().nullable(),
  evidence_ids: z.array(z.string()),
});
function stats(
  records: DailyRecord[],
  start: string,
  end: string,
  unavailable = false,
  totals = false,
) {
  const rows = records.filter((r) => r.date >= start && r.date <= end),
    values = rows.map((r) => r.value);
  return {
    start,
    end,
    expected_days: datesBetween(start, end).length,
    valid_days: unavailable ? null : values.length,
    mean: values.length ? round(mean(rows)) : null,
    minimum: values.length ? Math.min(...values) : null,
    maximum: values.length ? Math.max(...values) : null,
    observed_total:
      totals && values.length && Number.isFinite(values.reduce((sum, n) => sum + n, 0))
        ? round(values.reduce((sum, n) => sum + n, 0))
        : null,
    evidence_ids: rows.map((r) => r.evidence_id),
  };
}
export const ComparisonSchema = z.object({
  eligible: z.boolean(),
  reason: z.enum([
    'ready',
    'insufficient_recent',
    'insufficient_baseline',
    'baseline_zero',
    'unavailable',
  ]),
  minimum_recent_days: z.literal(4),
  minimum_baseline_days: z.literal(14),
  difference: z.number().nullable(),
  percent_change: z.number().nullable(),
});
export function summarize(
  records: DailyRecord[],
  window: ReturnType<typeof overviewWindow>,
  unavailable = false,
  totals = false,
) {
  const recent = stats(records, window.recent_start, window.end, unavailable, totals),
    baseline = stats(records, window.start, window.baseline_end, unavailable, totals);
  let reason: z.infer<typeof ComparisonSchema>['reason'] = 'ready';
  if (unavailable) reason = 'unavailable';
  else if (recent.valid_days! < 4) reason = 'insufficient_recent';
  else if (baseline.valid_days! < 14) reason = 'insufficient_baseline';
  else if (baseline.mean === 0) reason = 'baseline_zero';
  const eligible = reason === 'ready' || reason === 'baseline_zero';
  const a = mean(records.filter((r) => r.date >= window.recent_start && r.date <= window.end)),
    b = mean(records.filter((r) => r.date >= window.start && r.date <= window.baseline_end));
  const percent = ((a - b) / b) * 100;
  return {
    recent,
    baseline,
    comparison: {
      eligible,
      reason,
      minimum_recent_days: 4 as const,
      minimum_baseline_days: 14 as const,
      difference: eligible ? round(a - b) : null,
      percent_change: eligible && b !== 0 && Number.isFinite(percent) ? round(percent) : null,
    },
  };
}
