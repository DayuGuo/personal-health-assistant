import { addDaysIso } from '../providers/google/civil';
import { z } from 'zod';
import type { Env } from '../env';
import { cacheKey, getCachedDetailed, type CacheDetail } from '../lib/cache';
import { dataStatus, DataStatusSchema, statusForError, type DataStatus } from '../lib/data-status';
import { FitbitApiError } from '../lib/errors';
import { GoogleClient } from '../providers/google/client';
import type { HealthProvider } from '../providers/types';
import {
  overviewWindow,
  datesBetween,
  normalizeRecords,
  sleepRecords,
  summarize,
  RecordSchema,
  WindowStatsSchema,
  ComparisonSchema,
  type DailyRecord,
  type Exclusion,
} from './summary';

export const FreshnessSchema = z.object({
  cache_hit: z.boolean(),
  cache_state: z.enum(['hit', 'miss', 'unavailable']),
  fetched_at_utc: z.string(),
  expires_at_utc: z.string(),
});
const SourceSchema = z.object({
  family: z.string(),
  method: z.string(),
  date_basis: z.string(),
  device_identity: z.null(),
});
export const MetricSchema = z.object({
  metric: z.string(),
  unit: z.string(),
  source: SourceSchema,
  data_status: DataStatusSchema,
  freshness: FreshnessSchema.nullable(),
  latest_record: RecordSchema.nullable(),
  on_requested_end_day: RecordSchema.nullable(),
  record_lag_days: z.number().nullable(),
  missing_dates: z.array(z.string()).nullable(),
  excluded_dates: z.array(z.object({ date: z.string(), reason: z.string() })),
  recent: WindowStatsSchema,
  baseline: WindowStatsSchema,
  comparison: ComparisonSchema,
  records: z.array(RecordSchema),
});
export const OverviewSchema = z.object({
  version: z.literal('1'),
  timezone: z.literal('Europe/London'),
  generated_at_utc: z.string(),
  authorization_checked_at_utc: z.string(),
  authorization: DataStatusSchema,
  data_status: DataStatusSchema,
  latest_complete_calendar_day: z.string(),
  requested_end_date: z.string(),
  latest_record_date: z.string().nullable(),
  device_last_sync_at_utc: z.null(),
  window: z.object({
    start: z.string(),
    end: z.string(),
    recent_start: z.string(),
    baseline_end: z.string(),
  }),
  metrics: z.array(MetricSchema),
  limitations: z.array(z.string()),
});
export type Overview = z.infer<typeof OverviewSchema>;
type Rows = { records: DailyRecord[]; excluded: Exclusion[] };
type Def = {
  metric: string;
  unit: string;
  family: string;
  method: string;
  date_basis: string;
  key: string;
  args: Record<string, string>;
  load: () => Promise<unknown>;
  rows: (data: any) => Rows;
};
function ensureArray<T>(value: T[]): T[] {
  if (!Array.isArray(value)) throw new FitbitApiError(200, 'Invalid response array');
  return value;
}
export async function probeAuthorization(env: Env): Promise<DataStatus> {
  try {
    await new GoogleClient(env).requestJson(z.object({ healthUserId: z.string() }), {
      path: '/v4/users/me/identity',
    });
    return dataStatus('available');
  } catch (e) {
    return statusForError(e);
  }
}
export async function getOverview(
  provider: HealthProvider,
  env: Env,
  endDate?: string,
  probe: () => Promise<DataStatus> = () => probeAuthorization(env),
): Promise<Overview> {
  const w = overviewWindow(endDate),
    range = { start: w.start, end: w.end };
  const authorization = await probe(),
    authorizationChecked = new Date().toISOString();
  const normalize = (
    metric: string,
    raw: { date: string; value: unknown }[],
    valid: (n: number) => boolean,
  ) => normalizeRecords(metric, raw, w.start, w.end, valid);
  const definitions: Def[] = [
    {
      metric: 'steps',
      unit: 'steps',
      family: 'google-wearables',
      method: 'steps:dailyRollUp',
      date_basis: 'provider civil date',
      key: 'get_activity_timeseries',
      args: { resource: 'steps', ...range },
      load: () => provider.getActivityTimeSeries('steps', w.start, w.end),
      rows: (d) => ({
        ...normalize(
          'steps',
          ensureArray(d.points).map((x: any) => ({ date: x.dateTime, value: x.value })),
          (n) => n >= 0 && Number.isSafeInteger(n),
        ),
      }),
    },
    {
      metric: 'sleep_minutes',
      unit: 'minutes',
      family: 'google-wearables',
      method: 'sleep:reconcile',
      date_basis: 'provider local wake date; all non-overlapping staged episodes',
      key: 'get_sleep_range',
      args: range,
      load: () => provider.getSleepRange(w.start, w.end),
      rows: (d) => sleepRecords(ensureArray(d), w.start, w.end),
    },
    {
      metric: 'resting_heart_rate',
      unit: 'beats/minute',
      family: 'google-sources',
      method: 'daily-resting-heart-rate:reconcile',
      date_basis: 'provider civil date',
      key: 'get_heart_rate_range',
      args: range,
      load: () => provider.getHeartRateRange(w.start, w.end),
      rows: (d) =>
        normalize(
          'resting_heart_rate',
          ensureArray(d).map((x: any) => ({ date: x.dateTime, value: x.value?.restingHeartRate })),
          (n) => n > 0,
        ),
    },
    {
      metric: 'hrv_rmssd',
      unit: 'milliseconds',
      family: 'google-sources',
      method: 'daily-heart-rate-variability:reconcile',
      date_basis: 'provider civil date',
      key: 'get_hrv',
      args: range,
      load: () => provider.getHRV(w.start, w.end),
      rows: (d) =>
        normalize(
          'hrv_rmssd',
          ensureArray(d).map((x: any) => ({ date: x.dateTime, value: x.value?.dailyRmssd })),
          (n) => n > 0,
        ),
    },
    {
      metric: 'spo2',
      unit: 'percent',
      family: 'google-sources',
      method: 'daily-oxygen-saturation:reconcile',
      date_basis: 'provider civil date',
      key: 'get_spo2',
      args: range,
      load: () => provider.getSpO2(w.start, w.end),
      rows: (d) =>
        normalize(
          'spo2',
          ensureArray(d).map((x: any) => ({ date: x.dateTime, value: x.value?.avg })),
          (n) => n > 0 && n <= 100,
        ),
    },
  ];
  const metrics = await Promise.all(
    definitions.map(async (def) => {
      let rows: Rows = { records: [], excluded: [] },
        freshness: CacheDetail | null = null,
        status = authorization,
        unavailable = authorization.code !== 'available';
      if (!unavailable) {
        try {
          const cached = await getCachedDetailed(env, cacheKey(def.key, def.args), def.load);
          freshness = cached.freshness;
          env.REQUEST_CACHE_META?.push(freshness);
          try {
            rows = def.rows(cached.data);
          } catch {
            throw new FitbitApiError(200, 'Metric response could not be normalized');
          }
          status = dataStatus(
            !rows.records.length
              ? rows.excluded.length
                ? 'invalid_records'
                : 'no_records'
              : rows.records.filter((r) => r.date >= w.recent_start).length < 7 ||
                  rows.excluded.length
                ? 'partial'
                : 'available',
          );
        } catch (e) {
          status = statusForError(e);
          unavailable = true;
        }
      }
      const records = rows.records,
        latest = records.at(-1) ?? null,
        summary = summarize(
          records,
          w,
          unavailable,
          def.metric === 'steps' || def.metric === 'sleep_minutes',
        );
      return {
        metric: def.metric,
        unit: def.unit,
        source: {
          family: def.family,
          method: def.method,
          date_basis: def.date_basis,
          device_identity: null,
        },
        data_status: status,
        freshness,
        latest_record: latest,
        on_requested_end_day: records.find((r) => r.date === w.end) ?? null,
        record_lag_days: latest
          ? Math.round((Date.parse(w.end) - Date.parse(latest.date)) / 86400000)
          : null,
        missing_dates: unavailable
          ? null
          : datesBetween(w.start, w.end).filter(
              (d) => !records.some((r) => r.date === d) && !rows.excluded.some((r) => r.date === d),
            ),
        excluded_dates: rows.excluded,
        ...summary,
        records,
      };
    }),
  );
  const someRecords = metrics.some((m) => m.records.length > 0),
    allAvailable = metrics.every((m) => m.data_status.code === 'available');
  const allEmpty = metrics.every((m) => m.data_status.code === 'no_records');
  const overall =
    authorization.code !== 'available'
      ? authorization
      : allAvailable
        ? dataStatus('available')
        : someRecords
          ? dataStatus('partial')
          : allEmpty
            ? dataStatus('no_records')
            : metrics.every((m) => m.data_status.code === metrics[0]!.data_status.code)
              ? metrics[0]!.data_status
              : dataStatus('partial');
  const latest =
    metrics
      .flatMap((m) => m.records.map((r) => r.date))
      .sort()
      .at(-1) ?? null;
  return OverviewSchema.parse({
    version: '1',
    timezone: 'Europe/London',
    generated_at_utc: new Date().toISOString(),
    authorization_checked_at_utc: authorizationChecked,
    authorization,
    data_status: overall,
    latest_complete_calendar_day: addDaysIso(w.today, -1),
    requested_end_date: w.end,
    latest_record_date: latest,
    device_last_sync_at_utc: null,
    window: {
      start: w.start,
      end: w.end,
      recent_start: w.recent_start,
      baseline_end: w.baseline_end,
    },
    metrics,
    limitations: [
      'Today is excluded; record dates are within the requested window. A complete calendar day does not guarantee complete device records.',
      'Device sync time and individual device identity are not provided by this adapter.',
      'Compare each metric only with its own source family and method.',
      'Sleep uses the provider local wake date, which may differ from London dates while traveling.',
      'Means use observed valid days only; no gap filling. Comparisons require at least 4/7 recent and 14/28 baseline days. These are data-coverage gates, not clinical thresholds.',
      'No readiness/recovery score, diagnosis, persistent user profile or scheduled monitoring is created.',
    ],
  });
}
export function dataStatusView(overview: Overview) {
  return {
    timezone: overview.timezone,
    checked_at_utc: overview.generated_at_utc,
    authorization: overview.authorization,
    data_status: overview.data_status,
    latest_complete_calendar_day: overview.latest_complete_calendar_day,
    requested_end_date: overview.requested_end_date,
    window: overview.window,
    latest_record_date: overview.latest_record_date,
    device_last_sync_at_utc: null,
    metrics: overview.metrics.map((m) => ({
      metric: m.metric,
      data_status: m.data_status,
      source: m.source,
      freshness: m.freshness,
      latest_record_date: m.latest_record?.date ?? null,
      record_lag_days: m.record_lag_days,
      recent_valid_days: m.recent.valid_days,
      baseline_valid_days: m.baseline.valid_days,
      excluded_dates: m.excluded_dates,
    })),
    limitations: overview.limitations,
  };
}
export const DataStatusViewSchema = z.object({
  timezone: z.string(),
  checked_at_utc: z.string(),
  authorization: DataStatusSchema,
  data_status: DataStatusSchema,
  latest_complete_calendar_day: z.string(),
  requested_end_date: z.string(),
  window: OverviewSchema.shape.window,
  latest_record_date: z.string().nullable(),
  device_last_sync_at_utc: z.null(),
  metrics: z.array(
    MetricSchema.pick({
      metric: true,
      data_status: true,
      source: true,
      freshness: true,
      record_lag_days: true,
      excluded_dates: true,
    }).extend({
      latest_record_date: z.string().nullable(),
      recent_valid_days: z.number().nullable(),
      baseline_valid_days: z.number().nullable(),
    }),
  ),
  limitations: z.array(z.string()),
});
