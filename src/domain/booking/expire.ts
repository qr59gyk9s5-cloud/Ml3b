/**
 * The background job that auto-expires REQUESTED bookings the venue never
 * responded to within BOOKING_REQUEST_EXPIRY_MINUTES
 * (docs/product/booking-flow.md#request-expiry). Meant to be invoked
 * periodically (see docs/architecture/background-jobs.md) — not wired to a
 * scheduler yet (Phase 8+), but the function itself is real and tested now.
 *
 * Goes through transitionBooking() like every other status change — no
 * separate write path for "the system did it."
 */
import { and, eq, lt } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { bookings } from '@/lib/db/schema';
import { transitionBooking } from './transition';

export interface ExpireBookingsResult {
  expiredCount: number;
  expiredBookingIds: string[];
}

export async function expireOverdueBookingRequests(
  now: Date = new Date(),
): Promise<ExpireBookingsResult> {
  const db = getDb();
  const overdue = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.status, 'REQUESTED'), lt(bookings.expiresAt, now)));

  const expiredBookingIds: string[] = [];
  for (const { id } of overdue) {
    try {
      await transitionBooking({
        bookingId: id,
        targetStatus: 'EXPIRED',
        actor: { userId: null, isPlatformAdmin: false, isSystem: true },
      });
      expiredBookingIds.push(id);
    } catch {
      // Another actor (venue confirm/reject, customer cancel) may have
      // already moved this exact booking between the select above and
      // this transition — not this job's failure. Skip it, keep going.
    }
  }
  return { expiredCount: expiredBookingIds.length, expiredBookingIds };
}
