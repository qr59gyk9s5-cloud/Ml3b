/**
 * Shared by every booking-creating entry point (customer requests,
 * manual/walk-in bookings, and now open games — ADR-011) so "is this
 * span actually available" has exactly one implementation, not one
 * per call site.
 */
import { todayInTimeZone, addLocalDays } from '@/domain/availability/time';
import { getAvailableSlots } from '@/domain/availability/queries';
import { DomainError } from '@/domain/errors';

/** Verifies every slot the requested span covers is actually available,
 * by asking the availability engine (the same one the booking UI reads)
 * for both the local day the span starts on and the next one, since a
 * multi-slot booking can cross local midnight on a wrapping schedule. */
export async function assertSpanIsAvailable(
  facilityId: string,
  timeZone: string,
  startAt: Date,
  endAt: Date,
  slotDurationMinutes: number,
): Promise<void> {
  const startDate = todayInTimeZone(timeZone, startAt);
  const [todaySlots, nextDaySlots] = await Promise.all([
    getAvailableSlots(facilityId, startDate),
    getAvailableSlots(facilityId, addLocalDays(startDate, 1)),
  ]);
  const availableStarts = new Set(
    [...todaySlots, ...nextDaySlots].filter((s) => s.available).map((s) => s.startAt.getTime()),
  );

  const slotMs = slotDurationMinutes * 60_000;
  for (let cursor = startAt.getTime(); cursor < endAt.getTime(); cursor += slotMs) {
    if (!availableStarts.has(cursor)) {
      throw new DomainError(
        'CONFLICT',
        'This time is no longer available. Please choose another slot.',
      );
    }
  }
}
