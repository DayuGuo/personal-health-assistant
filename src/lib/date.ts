/** Format an instant in Europe/London, including daylight saving time. */
export function toLondonDateString(input: Date | string | number = new Date()): string {
 const d = input instanceof Date ? input : new Date(input);
 if(Number.isNaN(d.getTime())) throw new RangeError('Invalid date input');
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}

export function todayLondon(): string {
  return toLondonDateString();
}

const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function assertIsoDate(value: string, field = 'date'): asserts value is string {
  if (!ISO_DATE_RE.test(value) || Number.isNaN(Date.parse(value+'T12:00:00Z')) || new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value) {
    throw new RangeError(`${field} must be YYYY-MM-DD (got: ${value})`);
  }
}

/**
 * Return `start,end` as YYYY-MM-DD after validating both are present and
 * `start <= end`. Used by Fitbit range endpoints.
 */
export function normalizeRange(start: string, end: string): { start: string; end: string } {
  assertIsoDate(start, 'start');
  assertIsoDate(end, 'end');
  if (start > end) {
    throw new RangeError(`Range is inverted: start=${start} > end=${end}`);
  }
  if(Date.parse(end)-Date.parse(start)>90*86400000) throw new RangeError('Maximum range is 90 days');
  return { start, end };
}
