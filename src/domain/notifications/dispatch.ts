/**
 * The cron-invoked dispatcher — the second half of
 * docs/architecture/notifications.md's flow. Claims PENDING
 * outbox_events, resolves who to notify for the event, writes an
 * IN_APP `notifications` row for each recipient (writing the row *is*
 * the delivery — status SENT immediately) and best-effort attempts an
 * EMAIL one via the configured NotificationProvider.
 *
 * Simplification versus the documented design, noted honestly: an
 * individual recipient's EMAIL failure is tracked on that
 * `notifications` row (status FAILED) but does not fail/retry the
 * outbox event itself — retrying the whole event would re-insert
 * duplicate IN_APP rows for recipients who already got theirs. Outbox
 * retry (attempts/last_error, capped at OUTBOX_MAX_ATTEMPTS) is
 * reserved for structural failures (e.g. the booking a queued event
 * refers to can't be found), where nothing was written yet and a retry
 * is safe.
 */
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { getUserEmails } from '@/lib/db/auth-users';
import {
  bookings,
  facilities,
  notifications,
  outboxEvents,
  venueMembers,
  venues,
  type Booking,
  type OutboxEvent,
} from '@/lib/db/schema';
import { OUTBOX_MAX_ATTEMPTS, type NotificationEventType } from '@/lib/config/constants';
import { VENUE_REASON_LABEL } from '@/lib/format/booking-status';
import { getNotificationProvider } from '@/lib/notifications';

const BATCH_SIZE = 20;

interface EventContent {
  subject: string;
  text: string;
  html: string;
}

function formatWhen(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(date);
}

function buildContent(
  eventType: NotificationEventType,
  booking: Booking,
  venueName: string,
  venueTimezone: string,
  facilityName: string,
): EventContent {
  const when = formatWhen(booking.startAt, venueTimezone);
  const reasonSuffix = booking.cancellationReason
    ? ` Reason: ${VENUE_REASON_LABEL[booking.cancellationReason]}.`
    : '';

  const templates: Record<NotificationEventType, { subject: string; text: string }> = {
    BOOKING_REQUESTED: {
      subject: `New booking request — ${facilityName}`,
      text: `New request for ${facilityName} at ${venueName}, ${when}. Reference ${booking.reference}. Respond within 30 minutes or it auto-expires.`,
    },
    BOOKING_CONFIRMED: {
      subject: `Booking confirmed — ${facilityName}`,
      text: `Your booking at ${venueName} (${facilityName}) for ${when} is confirmed. Reference ${booking.reference}.`,
    },
    BOOKING_REJECTED: {
      subject: 'Booking request declined',
      text: `${venueName} couldn't accept your request for ${facilityName} at ${when}.${reasonSuffix}`,
    },
    BOOKING_EXPIRED: {
      subject: 'Booking request expired',
      text: `Your request for ${facilityName} at ${venueName} (${when}) expired — the venue didn't respond in time.`,
    },
    BOOKING_CANCELLED_BY_CUSTOMER: {
      subject: `Booking cancelled — ${facilityName}`,
      text: `A customer cancelled their booking for ${facilityName} at ${when}. Reference ${booking.reference}.`,
    },
    BOOKING_CANCELLED_BY_VENUE: {
      subject: 'Your booking was cancelled',
      text: `${venueName} cancelled your booking for ${facilityName} at ${when}.${reasonSuffix}`,
    },
    BOOKING_COMPLETED: {
      subject: 'How was your game?',
      text: `Thanks for playing at ${venueName}! Your booking for ${facilityName} on ${when} is complete.`,
    },
  };

  const { subject, text } = templates[eventType];
  return { subject, text, html: `<p>${text}</p>` };
}

async function resolveRecipientUserIds(
  eventType: NotificationEventType,
  booking: Booking,
): Promise<string[]> {
  if (eventType === 'BOOKING_REQUESTED' || eventType === 'BOOKING_CANCELLED_BY_CUSTOMER') {
    const db = getDb();
    const staff = await db
      .select({ userId: venueMembers.userId })
      .from(venueMembers)
      .where(eq(venueMembers.venueId, booking.venueId));
    return staff.map((s) => s.userId);
  }
  return booking.customerId ? [booking.customerId] : [];
}

async function processEvent(event: OutboxEvent): Promise<void> {
  const eventType = event.eventType as NotificationEventType;
  const payload = event.payload as { bookingId?: string };
  if (!payload.bookingId) {
    throw new Error(`outbox event ${event.id} is missing bookingId in its payload`);
  }

  const db = getDb();
  const [row] = await db
    .select({
      booking: bookings,
      venueName: venues.name,
      venueTimezone: venues.timezone,
      facilityName: facilities.name,
    })
    .from(bookings)
    .innerJoin(venues, eq(bookings.venueId, venues.id))
    .innerJoin(facilities, eq(bookings.facilityId, facilities.id))
    .where(eq(bookings.id, payload.bookingId));

  if (!row) {
    throw new Error(`booking ${payload.bookingId} not found for outbox event ${event.id}`);
  }

  const recipientUserIds = await resolveRecipientUserIds(eventType, row.booking);
  if (recipientUserIds.length === 0) return;

  const content = buildContent(
    eventType,
    row.booking,
    row.venueName,
    row.venueTimezone,
    row.facilityName,
  );
  const emails = await getUserEmails(recipientUserIds);
  const provider = getNotificationProvider();

  for (const userId of recipientUserIds) {
    await db.insert(notifications).values({
      userId,
      type: eventType,
      channel: 'IN_APP',
      payload: { bookingId: payload.bookingId },
      status: 'SENT',
      sentAt: new Date(),
    });

    const email = emails.get(userId);
    if (!email) continue;

    const [emailNotification] = await db
      .insert(notifications)
      .values({
        userId,
        type: eventType,
        channel: 'EMAIL',
        payload: { bookingId: payload.bookingId },
        status: 'PENDING',
      })
      .returning();

    try {
      await provider.sendEmail({
        to: email,
        subject: content.subject,
        html: content.html,
        text: content.text,
      });
      await db
        .update(notifications)
        .set({ status: 'SENT', sentAt: new Date() })
        .where(eq(notifications.id, emailNotification.id));
    } catch (err) {
      await db
        .update(notifications)
        .set({ status: 'FAILED' })
        .where(eq(notifications.id, emailNotification.id));
      console.error(`[notifications] email send failed for ${email}:`, err);
    }
  }
}

export interface DispatchOutboxResult {
  processed: number;
  failed: number;
}

export async function dispatchOutboxEvents(): Promise<DispatchOutboxResult> {
  const db = getDb();
  const pending = await db
    .select()
    .from(outboxEvents)
    .where(eq(outboxEvents.status, 'PENDING'))
    .orderBy(asc(outboxEvents.createdAt))
    .limit(BATCH_SIZE);

  let processed = 0;
  let failed = 0;

  for (const event of pending) {
    const [claimed] = await db
      .update(outboxEvents)
      .set({ status: 'PROCESSING' })
      .where(and(eq(outboxEvents.id, event.id), eq(outboxEvents.status, 'PENDING')))
      .returning();
    if (!claimed) continue; // another worker claimed it first

    try {
      await processEvent(claimed);
      await db
        .update(outboxEvents)
        .set({ status: 'PROCESSED', processedAt: new Date() })
        .where(eq(outboxEvents.id, claimed.id));
      processed++;
    } catch (err) {
      const attempts = claimed.attempts + 1;
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(outboxEvents)
        .set({
          status: attempts >= OUTBOX_MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
          attempts,
          lastError: message.slice(0, 2000),
        })
        .where(eq(outboxEvents.id, claimed.id));
      failed++;
    }
  }

  return { processed, failed };
}
