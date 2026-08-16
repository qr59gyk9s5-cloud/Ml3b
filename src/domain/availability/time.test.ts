import { describe, expect, it } from 'vitest';
import {
  addLocalDays,
  dayOfWeekOfLocalDate,
  localWallClockToUtc,
  startOfLocalDay,
  todayInTimeZone,
} from './time';

describe('addLocalDays', () => {
  it('adds days within a month', () => {
    expect(addLocalDays('2026-08-16', 1)).toBe('2026-08-17');
  });

  it('subtracts days (negative n)', () => {
    expect(addLocalDays('2026-08-16', -1)).toBe('2026-08-15');
  });

  it('rolls over a month boundary', () => {
    expect(addLocalDays('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('rolls over a year boundary', () => {
    expect(addLocalDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('rejects a malformed date', () => {
    expect(() => addLocalDays('16-08-2026', 1)).toThrow();
  });
});

describe('dayOfWeekOfLocalDate', () => {
  it('matches a known Monday (2024-01-01)', () => {
    expect(dayOfWeekOfLocalDate('2024-01-01')).toBe(1);
  });

  it('matches a known Sunday (2024-01-07)', () => {
    expect(dayOfWeekOfLocalDate('2024-01-07')).toBe(0);
  });

  it('is a pure function of the calendar date — same input, same output', () => {
    expect(dayOfWeekOfLocalDate('2026-08-16')).toBe(dayOfWeekOfLocalDate('2026-08-16'));
  });
});

describe('localWallClockToUtc', () => {
  it('converts Africa/Cairo (UTC+3, no DST) correctly', () => {
    const utc = localWallClockToUtc('2026-08-16', '22:00', 'Africa/Cairo');
    expect(utc.toISOString()).toBe('2026-08-16T19:00:00.000Z');
  });

  it('accepts HH:mm:ss as well as HH:mm', () => {
    const a = localWallClockToUtc('2026-08-16', '22:00', 'Africa/Cairo');
    const b = localWallClockToUtc('2026-08-16', '22:00:00', 'Africa/Cairo');
    expect(a.toISOString()).toBe(b.toISOString());
  });

  it('handles a real DST-observing zone correctly in both standard and daylight time', () => {
    // America/New_York: mid-January is EST (UTC-5), mid-July is EDT
    // (UTC-4) — both safely inside their season, nowhere near a spring-
    // forward/fall-back transition edge.
    const winter = localWallClockToUtc('2026-01-15', '12:00', 'America/New_York');
    expect(winter.toISOString()).toBe('2026-01-15T17:00:00.000Z');

    const summer = localWallClockToUtc('2026-07-15', '12:00', 'America/New_York');
    expect(summer.toISOString()).toBe('2026-07-15T16:00:00.000Z');
  });
});

describe('todayInTimeZone', () => {
  it('is the server date when the instant falls mid-day in that zone', () => {
    const now = new Date('2026-08-16T12:00:00.000Z'); // 15:00 Cairo, same calendar date
    expect(todayInTimeZone('Africa/Cairo', now)).toBe('2026-08-16');
  });

  it('can be a different calendar date than a naive UTC read, near midnight', () => {
    // 22:30 UTC on the 16th is already 01:30 on the 17th in Cairo (UTC+3).
    const now = new Date('2026-08-16T22:30:00.000Z');
    expect(todayInTimeZone('Africa/Cairo', now)).toBe('2026-08-17');
    // A timezone behind UTC stays on the 16th at the same instant.
    expect(todayInTimeZone('America/New_York', now)).toBe('2026-08-16');
  });
});

describe('startOfLocalDay', () => {
  it('is local midnight, converted to UTC', () => {
    const start = startOfLocalDay('2026-08-16', 'Africa/Cairo');
    // Cairo is UTC+3, so 2026-08-16 00:00 Cairo is 2026-08-15 21:00 UTC.
    expect(start.toISOString()).toBe('2026-08-15T21:00:00.000Z');
  });
});
