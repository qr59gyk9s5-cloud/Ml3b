/**
 * Enqueuing side of docs/architecture/notifications.md's flow — called
 * from the booking domain services right after a write succeeds.
 *
 * Deliberately best-effort, not inside the same DB transaction as the
 * booking write it follows (a real gap from the documented design,
 * noted honestly rather than silently claimed — see
 * docs/architecture/notifications.md's "Implementation status"). Never
 * throws: a booking transition must never fail because notification
 * plumbing did (top of CLAUDE.md's priority order — booking correctness
 * over notification delivery). A failure here is logged and swallowed.
 */
import { getDb } from '@/lib/db/client';
import { outboxEvents } from '@/lib/db/schema';
import type { NotificationEventType } from '@/lib/config/constants';

export async function enqueueBookingEvent(
  eventType: NotificationEventType,
  bookingId: string,
): Promise<void> {
  try {
    const db = getDb();
    await db.insert(outboxEvents).values({
      eventType,
      payload: { bookingId },
    });
  } catch (err) {
    console.error(`[notifications] failed to enqueue ${eventType} for booking ${bookingId}:`, err);
  }
}
