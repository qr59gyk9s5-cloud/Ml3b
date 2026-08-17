/**
 * The public, DB-backed entry point: "what can I book at this facility on
 * this date?" Thin by design — fetches rules/exceptions/CONFIRMED bookings
 * and hands them to the pure computeAvailableSlots (see compute-slots.ts
 * for the actual algorithm).
 *
 * Only CONFIRMED bookings block a slot — a REQUESTED one does not (§13.3,
 * overlapping pending requests are allowed; only confirmation is
 * exclusive, enforced by the DB exclusion constraint in
 * bookings_no_overlap — see docs/architecture/database.md#concurrency).
 */
import { and, eq, gt, lt } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import {
  availabilityExceptions,
  availabilityRules,
  bookings,
  facilities,
  venues,
} from '@/lib/db/schema';
import { computeAvailableSlots, type AvailabilitySlot } from './compute-slots';
import { addLocalDays, startOfLocalDay, type LocalDate } from './time';

export async function getAvailableSlots(
  facilityId: string,
  date: LocalDate,
): Promise<AvailabilitySlot[]> {
  const db = getDb();

  const [facility] = await db.select().from(facilities).where(eq(facilities.id, facilityId));
  if (!facility || !facility.isActive) return [];

  const [venue] = await db.select().from(venues).where(eq(venues.id, facility.venueId));
  if (!venue || venue.status !== 'ACTIVE') return [];

  const rules = await db
    .select()
    .from(availabilityRules)
    .where(eq(availabilityRules.facilityId, facilityId));

  // A day-wide buffer on each side safely covers exceptions that overlap
  // a midnight-crossing rule from the day before or after.
  const windowStart = startOfLocalDay(addLocalDays(date, -1), venue.timezone);
  const windowEnd = startOfLocalDay(addLocalDays(date, 1), venue.timezone);
  const exceptions = await db
    .select()
    .from(availabilityExceptions)
    .where(
      and(
        eq(availabilityExceptions.facilityId, facilityId),
        lt(availabilityExceptions.startsAt, windowEnd),
        gt(availabilityExceptions.endsAt, windowStart),
      ),
    );

  const confirmedBookings = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.facilityId, facilityId),
        eq(bookings.status, 'CONFIRMED'),
        lt(bookings.startAt, windowEnd),
        gt(bookings.endAt, windowStart),
      ),
    );

  return computeAvailableSlots({
    date,
    timeZone: venue.timezone,
    slotDurationMinutes: facility.slotDurationMinutes,
    rules: rules.map((r) => ({
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      isClosed: r.isClosed,
    })),
    exceptions: exceptions.map((e) => ({
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      isClosed: e.isClosed,
    })),
    blockedRanges: confirmedBookings.map((b) => ({ startAt: b.startAt, endAt: b.endAt })),
  });
}
