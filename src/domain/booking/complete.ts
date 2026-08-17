/**
 * The background job that marks CONFIRMED bookings COMPLETED once their
 * end_at has passed (docs/architecture/background-jobs.md). This is what
 * unlocks review eligibility (ADR-009 — a review needs a COMPLETED
 * booking to exist).
 *
 * Goes through transitionBooking() like every other status change — no
 * separate write path for "the system did it." Mirrors expire.ts.
 */
import { and, eq, lt } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { bookings } from '@/lib/db/schema';
import { transitionBooking } from './transition';

export interface CompleteBookingsResult {
  completedCount: number;
  completedBookingIds: string[];
}

export async function completePastBookings(
  now: Date = new Date(),
): Promise<CompleteBookingsResult> {
  const db = getDb();
  const overdue = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.status, 'CONFIRMED'), lt(bookings.endAt, now)));

  const completedBookingIds: string[] = [];
  for (const { id } of overdue) {
    try {
      await transitionBooking({
        bookingId: id,
        targetStatus: 'COMPLETED',
        actor: { userId: null, isPlatformAdmin: false, isSystem: true },
      });
      completedBookingIds.push(id);
    } catch {
      // Another actor (venue marking it a no-show, a rare admin edit) may
      // have already moved this exact booking between the select above
      // and this transition — not this job's failure. Skip it, keep going.
    }
  }
  return { completedCount: completedBookingIds.length, completedBookingIds };
}
