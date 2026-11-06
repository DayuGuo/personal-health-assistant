import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMockEnv } from '../helpers/mock-env';
import { dataStatus, statusForError } from '../../src/lib/data-status';
import {
  FitbitApiError,
  FitbitAuthError,
  FitbitRateLimitError,
  IncompleteDataError,
  toolErrorResult,
} from '../../src/lib/errors';
import { getCachedDetailed } from '../../src/lib/cache';
import {
  datesBetween,
  normalizeRecords,
  overviewWindow,
  sleepRecords,
  summarize,
} from '../../src/health/summary';
import { getOverview, dataStatusView, OverviewSchema } from '../../src/health/overview';
import { onboardingGuide } from '../../src/health/onboarding';
import { buildServer } from '../../src/server';
import type { HealthProvider, SleepLog } from '../../src/providers/types';
import { getAccessToken } from '../../src/providers/google/oauth';
import { GoogleClient } from '../../src/providers/google/client';

const end = '2026-11-05';
const days = () => datesBetween('2026-10-02', end);
function sleep(date: string, hours = 7, startHour = 0): SleepLog {
  const start = new Date(`${date}T00:00:00Z`);
  start.setUTCHours(startHour);
  const endTime = new Date(start.getTime() + hours * 3600000).toISOString();
  return {
    logId: 0,
    dateOfSleep: date,
    startTime: start.toISOString(),
    endTime,
    duration: hours * 3600000,
    minutesAsleep: hours * 60,
    levels: { data: [{ dateTime: start.toISOString(), level: 'light', seconds: hours * 3600 }] },
  };
}
function fakeProvider(overrides: Partial<HealthProvider> = {}) {
  const recent = (date: string) => date >= '2026-10-30';
  return {
    getActivityTimeSeries: vi.fn(async () => ({
      resource: 'steps',
      points: days().map((date) => ({ dateTime: date, value: recent(date) ? 200 : 100 })),
    })),
    getSleepRange: vi.fn(async () => days().map((date) => sleep(date, recent(date) ? 8 : 7))),
    getHeartRateRange: vi.fn(async () =>
      days().map((date) => ({ dateTime: date, value: { restingHeartRate: 60 } })),
    ),
    getHRV: vi.fn(async () =>
      days().map((date) => ({ dateTime: date, value: { dailyRmssd: recent(date) ? 50 : 40 } })),
    ),
    getSpO2: vi.fn(async () => days().map((date) => ({ dateTime: date, value: { avg: 98 } }))),
    ...overrides,
  } as unknown as HealthProvider;
}
const ready = async () => dataStatus('available');
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-06T12:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('deterministic complete-day summaries', () => {
  it('uses a non-overlapping 7/28-day window and exact per-metric evidence', async () => {
    const result = await getOverview(fakeProvider(), createMockEnv(), undefined, ready);
    expect(OverviewSchema.safeParse(result).success).toBe(true);
    expect(result.window).toEqual({
      start: '2026-10-02',
      end,
      recent_start: '2026-10-30',
      baseline_end: '2026-10-29',
    });
    const steps = result.metrics.find((m) => m.metric === 'steps')!;
    expect(steps.recent).toMatchObject({ valid_days: 7, mean: 200, observed_total: 1400 });
    expect(steps.baseline).toMatchObject({ valid_days: 28, mean: 100 });
    expect(steps.comparison).toMatchObject({
      eligible: true,
      difference: 100,
      percent_change: 100,
    });
    expect(steps.recent.evidence_ids).toHaveLength(7);
    expect(steps.records.find((r) => r.evidence_id === steps.recent.evidence_ids[0])?.date).toBe(
      '2026-10-30',
    );
    expect(result.metrics.find((m) => m.metric === 'sleep_minutes')?.recent.mean).toBe(480);
    expect(steps.source.family).toBe('google-wearables');
    expect(result.metrics.find((m) => m.metric === 'hrv_rmssd')?.source.family).toBe(
      'google-sources',
    );
    expect(result.device_last_sync_at_utc).toBeNull();
  });
  it('retains measured zero, never fills missing days, and gates thin comparisons', () => {
    const w = overviewWindow(end),
      rows = normalizeRecords(
        'steps',
        [
          { date: end, value: 0 },
          { date: '2026-11-03', value: 30 },
        ],
        w.start,
        w.end,
        (n) => n >= 0,
      );
    const summary = summarize(rows.records, w);
    expect(summary.recent.mean).toBe(15);
    expect(summary.recent.valid_days).toBe(2);
    expect(summary.comparison).toMatchObject({
      eligible: false,
      reason: 'insufficient_recent',
      difference: null,
      percent_change: null,
    });
    expect(rows.records.find((r) => r.date === end)?.value).toBe(0);
    expect(rows.records).toHaveLength(2);
  });
  it('refuses conflicting duplicate days, excludes invalid dates/values and deduplicates identical values', () => {
    const rows = normalizeRecords(
      'steps',
      [
        { date: end, value: 10 },
        { date: end, value: 20 },
        { date: '2026-11-04', value: 30 },
        { date: '2026-11-04', value: 30 },
        { date: '2026-11-03', value: NaN },
        { date: 'not-a-date', value: 1 },
      ],
      '2026-10-02',
      end,
      (n) => n >= 0,
    );
    expect(rows.records).toEqual([
      { date: '2026-11-04', value: 30, evidence_id: 'steps:2026-11-04' },
    ]);
    expect(rows.excluded).toContainEqual({ date: end, reason: 'conflicting_daily_records' });
    expect(rows.excluded).toContainEqual({ date: 'unknown', reason: 'invalid_record_date' });
  });
  it('does not divide by a zero baseline and uses observed coverage gates', () => {
    const w = overviewWindow(end),
      records = normalizeRecords(
        'steps',
        days().map((date) => ({ date, value: date >= '2026-10-30' ? 10 : 0 })),
        w.start,
        w.end,
        (n) => n >= 0,
      ).records;
    expect(summarize(records, w).comparison).toMatchObject({
      eligible: true,
      reason: 'baseline_zero',
      difference: 10,
      percent_change: null,
    });
    expect(
      summarize(
        records.filter((r) => r.date >= '2026-10-20'),
        w,
      ).comparison,
    ).toMatchObject({ eligible: false, reason: 'insufficient_baseline' });
  });
  it('rejects today, future dates, invalid dates and underflow before any provider query', async () => {
    const provider = fakeProvider(),
      probe = vi.fn(ready);
    for (const date of ['2026-11-06', '2026-11-07', '2026-02-30', '0000-01-01'])
      await expect(getOverview(provider, createMockEnv(), date, probe)).rejects.toBeInstanceOf(
        RangeError,
      );
    expect(probe).not.toHaveBeenCalled();
    expect(provider.getActivityTimeSeries).not.toHaveBeenCalled();
  });
  it('uses London complete-day boundaries across daylight saving', () => {
    vi.setSystemTime(new Date('2026-07-17T23:30:00Z'));
    expect(overviewWindow().end).toBe('2026-07-17');
    vi.setSystemTime(new Date('2026-10-25T23:30:00Z'));
    expect(overviewWindow().end).toBe('2026-10-24');
  });
  it('deduplicates sleep episodes, sums disjoint episodes and refuses overlaps or absent stages', () => {
    const a = sleep(end, 7),
      nap = sleep(end, 1, 14);
    expect(sleepRecords([a, a, nap], '2026-10-02', end).records[0]?.value).toBe(480);
    expect(sleepRecords([a, sleep(end, 2, 6)], '2026-10-02', end)).toMatchObject({
      records: [],
      excluded: [{ date: end, reason: 'overlapping_sleep_episodes' }],
    });
    expect(sleepRecords([{ ...a, levels: undefined }], '2026-10-02', end).records).toEqual([]);
    const incomplete = {
      ...a,
      levels: { data: [{ dateTime: a.startTime, level: 'light', seconds: 60 }] },
    };
    expect(sleepRecords([incomplete], '2026-10-02', end).excluded[0]?.reason).toBe(
      'incomplete_or_overlapping_sleep_stages',
    );
  });
});

describe('availability, freshness and recovery states', () => {
  it('uses an existing token bundle and preserves it on a temporary refresh failure', async () => {
    const saved = JSON.stringify({
      accessToken: 'synthetic-expired',
      refreshToken: 'synthetic-original-refresh',
      expiresAt: 0,
      clientId: 'test-google-client-id',
      scope: 'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
    });
    const env = createMockEnv({ 'health:token-bundle': saved });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: 'server_error' }, { status: 503 })),
    );
    let error: unknown;
    try {
      await getAccessToken(env);
    } catch (e) {
      error = e;
    }
    expect(statusForError(error).code).toBe('temporary_error');
    expect(await env.TOKENS.get('health:token-bundle')).toBe(saved);
    expect(env.TOKENS.delete).not.toHaveBeenCalled();
  });
  it('distinguishes revoked consent from a wrong client without deleting either grant', async () => {
    const saved = JSON.stringify({
      accessToken: 'synthetic-expired',
      refreshToken: 'synthetic-original-refresh',
      expiresAt: 0,
      clientId: 'test-google-client-id',
      scope: 'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
    });
    const env = createMockEnv({ 'health:token-bundle': saved });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: 'invalid_grant', error_description: 'synthetic-private-description' },
          { status: 400 },
        ),
      ),
    );
    let error: unknown;
    try {
      await getAccessToken(env);
    } catch (e) {
      error = e;
    }
    expect(statusForError(error).code).toBe('authorization_required');
    expect(await env.TOKENS.get('health:token-bundle')).toBe(saved);
    const changed = createMockEnv(
      { 'health:token-bundle': saved },
      { GOOGLE_CLIENT_ID: 'different-client' },
    );
    try {
      await getAccessToken(changed);
    } catch (e) {
      error = e;
    }
    expect(statusForError(error).code).toBe('configuration_error');
    expect(changed.TOKENS.delete).not.toHaveBeenCalled();
  });
  it('reports the real rate-limit interval immediately for the new experience tools', async () => {
    const env = createMockEnv(
      {
        access_token: 'synthetic-access',
        refresh_token: 'synthetic-refresh',
        expires_at: String(Date.now() / 1000 + 3600),
      },
      { REQUEST_FAIL_FAST: true },
    );
    const mock = vi.fn(
      async () => new Response('', { status: 429, headers: { 'Retry-After': '120' } }),
    );
    vi.stubGlobal('fetch', mock);
    let error: unknown;
    try {
      await new GoogleClient(env).requestText({ path: '/v4/users/me/identity' });
    } catch (e) {
      error = e;
    }
    expect(statusForError(error)).toMatchObject({ code: 'rate_limited', retry_after_seconds: 120 });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('isolates a failed metric without hiding readable records or calling it empty', async () => {
    const provider = fakeProvider({
      getHRV: async () => {
        throw new FitbitApiError(403, '{"reasons":["ACCESS_TOKEN_SCOPE_INSUFFICIENT"]}');
      },
    });
    const result = await getOverview(provider, createMockEnv(), end, ready),
      hrv = result.metrics.find((m) => m.metric === 'hrv_rmssd')!;
    expect(result.data_status.code).toBe('partial');
    expect(hrv.data_status.code).toBe('permission_denied');
    expect(hrv.recent.valid_days).toBeNull();
    expect(hrv.missing_dates).toBeNull();
    expect(result.metrics[0]!.recent.valid_days).toBe(7);
  });
  it('distinguishes an empty successful response from unavailable data and supports stale record dates', async () => {
    const empty = fakeProvider({
      getActivityTimeSeries: async () => ({ resource: 'steps', points: [] }),
    });
    const result = await getOverview(empty, createMockEnv(), end, ready);
    expect(result.metrics[0]!.data_status.code).toBe('no_records');
    expect(result.metrics[0]!.recent.valid_days).toBe(0);
    expect(result.metrics[0]!.recent.mean).toBeNull();
    const stale = await getOverview(
      fakeProvider({
        getActivityTimeSeries: async () => ({
          resource: 'steps',
          points: [{ dateTime: '2026-11-01', value: 100 }],
        }),
      }),
      createMockEnv(),
      end,
      ready,
    );
    expect(stale.metrics[0]).toMatchObject({
      record_lag_days: 4,
      on_requested_end_day: null,
      latest_record: { date: '2026-11-01' },
    });
  });
  it('performs a live authorization probe even for cache hits and stops on revoked access', async () => {
    const env = createMockEnv(),
      provider = fakeProvider(),
      probe = vi.fn(ready);
    await getOverview(provider, env, end, probe);
    const cached = await getOverview(provider, env, end, probe);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(provider.getActivityTimeSeries).toHaveBeenCalledTimes(1);
    expect(cached.metrics.every((m) => m.freshness?.cache_state === 'hit')).toBe(true);
    const failed = await getOverview(provider, env, end, async () =>
      dataStatus('authorization_required'),
    );
    expect(failed.data_status.code).toBe('authorization_required');
    expect(failed.metrics[0]!.recent.mean).toBeNull();
    expect(provider.getActivityTimeSeries).toHaveBeenCalledTimes(1);
  });
  it('does not turn cache failure into lost Health data', async () => {
    const env = createMockEnv();
    vi.mocked(env.CACHE.get).mockRejectedValue(Error('synthetic cache failure'));
    vi.mocked(env.CACHE.put).mockRejectedValue(Error('synthetic cache failure'));
    const result = await getOverview(fakeProvider(), env, end, ready);
    expect(result.metrics[0]!.recent.mean).toBe(200);
    expect(result.metrics[0]!.freshness?.cache_state).toBe('unavailable');
  });
  it('refreshes expired cache envelopes without changing the original key namespace', async () => {
    const env = createMockEnv();
    await env.CACHE.put(
      'health-cache:v2:fixture',
      JSON.stringify({
        data: 1,
        fetchedAt: '2026-11-06T10:00:00Z',
        expiresAt: '2026-11-06T10:05:00Z',
      }),
    );
    const fetcher = vi.fn(async () => 2);
    const result = await getCachedDetailed(env, 'fixture', fetcher);
    expect(result.data).toBe(2);
    expect(result.freshness.cache_state).toBe('miss');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('returns useful errors without leaking raw error bodies or tokens', () => {
    const cases: [unknown, string][] = [
      [new FitbitAuthError('synthetic-secret'), 'authorization_required'],
      [new FitbitAuthError('bad config', 'configuration_error'), 'configuration_error'],
      [new FitbitRateLimitError(120), 'rate_limited'],
      [new FitbitApiError(503, 'synthetic-private-body'), 'temporary_error'],
      [new FitbitApiError(403, '{"reasons":["SERVICE_DISABLED"]}'), 'api_disabled'],
      [new FitbitApiError(200, 'synthetic-schema-value'), 'invalid_response'],
      [new IncompleteDataError('pagination'), 'incomplete_response'],
      [new RangeError('synthetic-private-input'), 'invalid_request'],
    ];
    for (const [error, code] of cases) {
      expect(statusForError(error).code).toBe(code);
      expect(JSON.stringify(toolErrorResult(error))).not.toMatch(
        /synthetic-(secret|private|schema)/,
      );
    }
    expect(statusForError(new FitbitRateLimitError(120)).retry_after_seconds).toBe(120);
  });
  it('returns no health measurements from the data-status view', async () => {
    const view = dataStatusView(await getOverview(fakeProvider(), createMockEnv(), end, ready));
    expect(view.metrics[0]!.recent_valid_days).toBe(7);
    expect(view.metrics[0]).not.toHaveProperty('records');
    expect(view.metrics[0]).not.toHaveProperty('recent');
    expect(view.metrics[0]).not.toHaveProperty('latest_record');
    expect(view.device_last_sync_at_utc).toBeNull();
  });
});

describe('first-use guide and MCP backwards compatibility', () => {
  it('asks one missing question per turn and never claims to save preferences or schedules', async () => {
    const overview = await getOverview(fakeProvider(), createMockEnv(), end, ready);
    const one = onboardingGuide(overview, { language: 'en' });
    expect(one.stage).toBe('focus');
    expect(one.next_question?.id).toBe('focus');
    const two = onboardingGuide(overview, { focus: 'sleep' });
    expect(two.next_question?.id).toBe('available_minutes');
    const three = onboardingGuide(overview, { focus: 'sleep', available_minutes: 5 });
    expect(three.next_question?.id).toBe('review_preference');
    const done = onboardingGuide(overview, {
      focus: 'sleep',
      available_minutes: 5,
      review_preference: 'daily',
    });
    expect(done.stage).toBe('ready');
    expect(done.next_question).toBeNull();
    expect(done.bridge_persists_answers).toBe(false);
    expect(done.schedules_created).toBe(false);
    expect(done.data.metrics[0]).not.toHaveProperty('records');
  });
  it('explains connection failures before collecting preferences', async () => {
    const overview = await getOverview(fakeProvider(), createMockEnv(), end, async () =>
      dataStatus('authorization_required'),
    );
    const guide = onboardingGuide(overview, { language: 'en' });
    expect(guide.stage).toBe('connection_required');
    expect(guide.next_question).toBeNull();
    expect(guide.data.authorization.code).toBe('authorization_required');
  });
  it('advertises new read-only tools while old tools/arguments and error envelopes still work', async () => {
    const env = createMockEnv(),
      server = buildServer(env, { provider: fakeProvider(), probe: ready }),
      client = new Client({ name: 'compatibility-test', version: '1' }),
      [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(a);
      await client.connect(b);
      const tools = (await client.listTools()).tools;
      for (const name of [
        'get_daily_summary',
        'get_activity_timeseries',
        'get_sleep',
        'get_connection_status',
        'get_health_overview',
        'get_data_status',
        'get_onboarding_guide',
      ])
        expect(tools.some((t) => t.name === name)).toBe(true);
      expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
      const overview = await client.callTool({
        name: 'get_health_overview',
        arguments: { end_date: end },
      });
      expect(overview.isError).not.toBe(true);
      expect(overview.structuredContent).toMatchObject({
        version: '1',
        latest_complete_calendar_day: end,
      });
      const old = await client.callTool({
        name: 'get_activity_timeseries',
        arguments: { resource: 'steps', start: '2026-10-02', end },
      });
      expect(old.isError).not.toBe(true);
      expect(old.structuredContent).toHaveProperty('points');
      const bad = await client.callTool({
        name: 'get_health_overview',
        arguments: { end_date: '2026-11-06' },
      });
      expect(bad.isError).toBe(true);
      expect(JSON.parse((bad.content as any)[0].text)).toMatchObject({
        data_status: { code: 'invalid_request' },
      });
      const guide = await client.callTool({
        name: 'get_onboarding_guide',
        arguments: { focus: 'sleep', available_minutes: 5, review_preference: 'weekly' },
      });
      expect(guide.isError).not.toBe(true);
      expect(guide.structuredContent).toMatchObject({ stage: 'ready', schedules_created: false });
      const cached = [...(env.CACHE as any).__store.values()].join(' ');
      expect(cached).not.toContain('"review_preference"');
      expect(cached).not.toContain('"available_minutes"');
    } finally {
      await client.close();
      await server.close();
    }
  });
});
