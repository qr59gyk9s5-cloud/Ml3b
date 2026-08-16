/**
 * Timezone-safe date arithmetic. This is the highest-risk correctness
 * area flagged in Phase 0 — every function here is pure and deterministic
 * regardless of the server's own timezone, and is exercised directly by
 * time.test.ts rather than only indirectly through slot computation.
 *
 * A "local date" throughout this module is a plain 'YYYY-MM-DD' calendar
 * date — it names a day, not an instant, so calendar arithmetic on it
 * (addLocalDays, dayOfWeekOfLocalDate) never needs a timezone. Turning a
 * local date + wall-clock time into an absolute instant *does* need one
 * (localWallClockToUtc) — that's where fromZonedTime earns its keep.
 */
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export type LocalDate = string; // 'YYYY-MM-DD'
export type WallClockTime = string; // 'HH:mm' or 'HH:mm:ss'

function parseLocalDate(dateISO: LocalDate): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO);
  if (!match) {
    throw new Error(`Invalid local date "${dateISO}" — expected YYYY-MM-DD.`);
  }
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** Adds (or subtracts, for negative n) whole calendar days to a local
 * date. Pure calendar math via Date.UTC — deliberately never touches the
 * server's own timezone. */
export function addLocalDays(dateISO: LocalDate, days: number): LocalDate {
  const { y, m, d } = parseLocalDate(dateISO);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

/** 0 = Sunday .. 6 = Saturday, matching the day_of_week CHECK constraint
 * on availability_rules. A calendar date has exactly one day-of-week
 * regardless of timezone, so this needs no timezone argument. */
export function dayOfWeekOfLocalDate(dateISO: LocalDate): number {
  const { y, m, d } = parseLocalDate(dateISO);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The one place a local date + wall-clock time becomes an absolute
 * instant. DST-safe (delegates to date-fns-tz / Intl, not manual offset
 * math) — correct even for timezones that do observe DST, though
 * Africa/Cairo currently doesn't. */
export function localWallClockToUtc(
  dateISO: LocalDate,
  time: WallClockTime,
  timeZone: string,
): Date {
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  return fromZonedTime(`${dateISO} ${normalizedTime}`, timeZone);
}

export function startOfLocalDay(dateISO: LocalDate, timeZone: string): Date {
  return localWallClockToUtc(dateISO, '00:00:00', timeZone);
}

/** "What calendar date is it right now, in this venue's timezone?" — not
 * necessarily the same date as the server's own clock. toZonedTime
 * encodes the zoned wall-clock into a Date's *UTC* fields (a common
 * trick), so this reads via getUTC*, never local getters (those would
 * silently re-apply the server's own timezone on top). */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): LocalDate {
  const zoned = toZonedTime(now, timeZone);
  const y = zoned.getUTCFullYear();
  const m = zoned.getUTCMonth() + 1;
  const d = zoned.getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
