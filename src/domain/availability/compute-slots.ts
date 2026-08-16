/**
 * The availability algorithm (ADR-003: derived, not materialized):
 *
 *   weekly rules (local time, possibly midnight-crossing)
 *   + special-hours exceptions (extra availability)
 *   − closure exceptions (maintenance, weather, holiday, ...)
 *   − already-blocked ranges (confirmed bookings — supplied by the
 *     caller; this module has no idea what a "booking" is, keeping the
 *     booking engine's later dependency one-directional)
 *   = fixed-duration slots for one local calendar day, each flagged
 *     available or not (with why)
 *
 * Pure and synchronous — no DB, no I/O. src/domain/availability/queries.ts
 * is the thin DB-backed wrapper that fetches rules/exceptions and calls
 * this.
 */
import {
  addLocalDays,
  dayOfWeekOfLocalDate,
  localWallClockToUtc,
  startOfLocalDay,
  type LocalDate,
} from './time';

export interface WeeklyRuleInput {
  dayOfWeek: number;
  startTime: string; // 'HH:mm' or 'HH:mm:ss'
  endTime: string;
  isClosed: boolean;
}

export interface ExceptionInput {
  startsAt: Date;
  endsAt: Date;
  isClosed: boolean;
}

export interface BlockedRangeInput {
  startAt: Date;
  endAt: Date;
}

export interface ComputeSlotsParams {
  date: LocalDate;
  timeZone: string;
  slotDurationMinutes: number;
  rules: WeeklyRuleInput[];
  exceptions?: ExceptionInput[];
  blockedRanges?: BlockedRangeInput[];
}

export type SlotUnavailableReason = 'CLOSED_PERIOD' | 'BOOKED';

export interface AvailabilitySlot {
  startAt: Date;
  endAt: Date;
  available: boolean;
  reason: SlotUnavailableReason | null;
}

interface OpenInterval {
  start: Date;
  end: Date;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

/** A weekly rule names a day-of-week + wall-clock start/end. Resolved
 * against one specific calendar-date occurrence of that day, it becomes
 * an absolute [start, end) interval — crossing into the next calendar
 * date when endTime <= startTime. */
function resolveRuleOccurrence(
  rule: WeeklyRuleInput,
  occurrenceDate: LocalDate,
  timeZone: string,
): OpenInterval | null {
  if (rule.isClosed) return null;
  const start = localWallClockToUtc(occurrenceDate, rule.startTime, timeZone);
  const wrapsPastMidnight = rule.endTime <= rule.startTime;
  const endDate = wrapsPastMidnight ? addLocalDays(occurrenceDate, 1) : occurrenceDate;
  const end = localWallClockToUtc(endDate, rule.endTime, timeZone);
  return { start, end };
}

function classifySlot(
  startAt: Date,
  endAt: Date,
  exceptions: ExceptionInput[],
  blockedRanges: BlockedRangeInput[],
): AvailabilitySlot {
  const closedByException = exceptions.some(
    (e) => e.isClosed && overlaps(startAt, endAt, e.startsAt, e.endsAt),
  );
  if (closedByException) {
    return { startAt, endAt, available: false, reason: 'CLOSED_PERIOD' };
  }
  const alreadyBooked = blockedRanges.some((b) => overlaps(startAt, endAt, b.startAt, b.endAt));
  if (alreadyBooked) {
    return { startAt, endAt, available: false, reason: 'BOOKED' };
  }
  return { startAt, endAt, available: true, reason: null };
}

export function computeAvailableSlots(params: ComputeSlotsParams): AvailabilitySlot[] {
  const {
    date,
    timeZone,
    slotDurationMinutes,
    rules,
    exceptions = [],
    blockedRanges = [],
  } = params;

  if (!Number.isInteger(slotDurationMinutes) || slotDurationMinutes <= 0) {
    throw new Error('slotDurationMinutes must be a positive integer.');
  }

  const dayOfWeek = dayOfWeekOfLocalDate(date);
  const previousDate = addLocalDays(date, -1);
  const previousDayOfWeek = dayOfWeekOfLocalDate(previousDate);

  const openIntervals: OpenInterval[] = [];

  for (const rule of rules) {
    if (rule.dayOfWeek === dayOfWeek) {
      const interval = resolveRuleOccurrence(rule, date, timeZone);
      if (interval) openIntervals.push(interval);
    }
    // Yesterday's rule can still be "open" after local midnight if it
    // crosses into today — e.g. Friday 22:00-02:00 contributes Saturday
    // 00:00-02:00. A non-wrapping rule never reaches past its own day, so
    // only wrapping rules are considered here.
    if (rule.dayOfWeek === previousDayOfWeek && !rule.isClosed && rule.endTime <= rule.startTime) {
      const interval = resolveRuleOccurrence(rule, previousDate, timeZone);
      if (interval) openIntervals.push(interval);
    }
  }

  // Special-hours exceptions (is_closed = false) add availability on top
  // of — not instead of — the weekly schedule.
  for (const exception of exceptions) {
    if (!exception.isClosed) {
      openIntervals.push({ start: exception.startsAt, end: exception.endsAt });
    }
  }

  const localDayStart = startOfLocalDay(date, timeZone);
  const localDayEnd = startOfLocalDay(addLocalDays(date, 1), timeZone);
  const slotMs = slotDurationMinutes * 60_000;

  const seenSlotStarts = new Set<number>();
  const slots: AvailabilitySlot[] = [];

  for (const interval of openIntervals) {
    const intervalEndMs = interval.end.getTime();
    for (
      let cursor = interval.start.getTime();
      cursor + slotMs <= intervalEndMs;
      cursor += slotMs
    ) {
      // A slot belongs to `date` iff it *starts* within date's local
      // calendar day — this is what makes a Friday-night rule that ends
      // at 2am Saturday show up under "Friday", matching how a customer
      // who picks "Friday" expects to see Friday-evening slots.
      if (cursor < localDayStart.getTime() || cursor >= localDayEnd.getTime()) continue;
      if (seenSlotStarts.has(cursor)) continue;
      seenSlotStarts.add(cursor);
      const startAt = new Date(cursor);
      const endAt = new Date(cursor + slotMs);
      slots.push(classifySlot(startAt, endAt, exceptions, blockedRanges));
    }
  }

  slots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return slots;
}
