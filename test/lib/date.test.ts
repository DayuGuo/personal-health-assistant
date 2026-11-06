import { describe, expect, it } from 'vitest';
import { assertIsoDate, normalizeRange, todayLondon, toLondonDateString } from '../../src/lib/date';

describe('toLondonDateString', () => {
  it('formats epoch as JST date', () => {
    // 1970-01-01T00:00:00Z → JST: 1970-01-01T09:00:00+09 → "1970-01-01"
    expect(toLondonDateString(0)).toBe('1970-01-01');
  });

  it('handles London summer midnight and winter without a fixed UTC offset',()=>{
    expect(toLondonDateString('2026-04-22T23:00:00Z')).toBe('2026-04-23');
    expect(toLondonDateString('2026-11-06T23:00:00Z')).toBe('2026-11-06');
  });
  it('throws on invalid input', () => {
    expect(() => toLondonDateString('not-a-date')).toThrow(RangeError);
  });

  it('todayLondon returns a 10-char YYYY-MM-DD', () => {
    const today = todayLondon();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('assertIsoDate', () => {
  it.each(['2026-01-01', '2026-12-31', '2024-02-29'])('accepts %s', (v) => {
    expect(() => assertIsoDate(v)).not.toThrow();
  });

  it.each([
    '2026-02-30',
    '2026-13-01',
    '2026-00-01',
    '2026-01-32',
    '2026-1-1',
    '2026/01/01',
    '',
    '2026-04-22T00:00:00Z',
  ])('rejects %s', (v) => {
    expect(() => assertIsoDate(v)).toThrow(RangeError);
  });
});

describe('normalizeRange', () => {
  it('returns both dates when start <= end', () => {
    expect(normalizeRange('2026-04-01', '2026-04-22')).toEqual({
      start: '2026-04-01',
      end: '2026-04-22',
    });
    expect(normalizeRange('2026-04-22', '2026-04-22')).toEqual({
      start: '2026-04-22',
      end: '2026-04-22',
    });
  });

  it('throws when start > end', () => {
    expect(() => normalizeRange('2026-04-23', '2026-04-22')).toThrow(/inverted/);
  });

  it('throws when either date is malformed', () => {
    expect(() => normalizeRange('2026-4-1', '2026-04-22')).toThrow(RangeError);
    expect(() => normalizeRange('2026-04-01', 'tomorrow')).toThrow(RangeError);
  });
});
