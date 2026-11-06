// Civil-time helpers for Google Health v4. v4 expresses calendar times as
// `{date:{year,month,day}, time:{hours,minutes,...}}` (timezone-less), used
// by dailyRollUp request bodies and returned on every rollupDataPoint.

export type CivilDate = { year: number; month: number; day: number };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isoToCivilDate(s: string): CivilDate {
  const m = ISO_DATE.exec(s);
  if (!m) throw new RangeError(`expected YYYY-MM-DD, got: ${s}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function civilDateToIso(d: CivilDate): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

/** Add `n` calendar days to a YYYY-MM-DD string (UTC arithmetic, tz-agnostic). */
export function addDaysIso(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new RangeError(`invalid date: ${s}`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const MIDNIGHT = { hours: 0, minutes: 0, seconds: 0, nanos: 0 } as const;

/** dailyRollUp request body over the civil range [start, end) with 1-day windows. */
export function dailyRollUpBody(start: string, end: string) {
  return {
    range: {
      start: { date: isoToCivilDate(start), time: { ...MIDNIGHT } },
      end: { date: isoToCivilDate(end), time: { ...MIDNIGHT } },
    },
    windowSizeDays: 1,
    dataSourceFamily:'users/me/dataSourceFamilies/google-wearables',
  };
}
