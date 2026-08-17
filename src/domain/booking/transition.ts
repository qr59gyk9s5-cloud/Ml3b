/**
 * The single function allowed to write bookings.status (CLAUDE.md: "all
 * booking state transitions go through one domain service"). Combines
 * four layers, each doing a different job:
 *
 *   1. canTransitionBooking()  — is this role graph edge even legal?
 *   2. the 2-hour cancellation cutoff — a time-based rule, not a role one
 *   3. an explicit pre-check for a CONFIRMED overlap — a clear CONFLICT
 *      before ever touching the database
 *   4. an optimistic-concurrency UPDATE ... WHERE status = <expected>,
 *      with the database's own GiST exclusion constraint (bookings_no_overlap)
 *      as the actual guarantee underneath it all
 *
 * Layer 3 is a courtesy — it narrows the race window but cannot be
 * trusted alone. Layer 4's WHERE clause catches "someone already moved
 * this booking" races; the exclusion constraint (caught as Postgres
 * 23P01 below) catches "two different bookings just got confirmed onto
 * the same slot" races. See docs/architecture/database.md#concurrency.
 */
import { and, eq, gt, lt, ne } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { bookingEvents, bookings, type Booking } from '@/lib/db/schema';
import { isExclusionViolation } from '@/lib/db/errors';
import { DomainError } from '@/domain/errors';
import {
  BOOKING_REQUEST_EXPIRY_MINUTES,
  CANCELLATION_CUTOFF_HOURS,
  CANCELLATION_REFUND_RATE,
  NOTIFICATION_EVENT_TYPE,
} from '@/lib/config/constants';
import type {
  BookingStatus,
  NotificationEventType,
  VenueCancellationReason,
} from '@/lib/config/constants';
import { findBookingTransitionRule, isTerminalBookingStatus } from './state-machine';
import { resolveBookingAuthzContext, type BookingActor } from './authz-context';
import { enqueueBookingEvent } from '@/domain/notifications/outbox';
import {
  captureBookingPayment,
  refundBookingCancellationPayment,
  releaseBookingPayment,
} from '@/domain/payments/service';
import { recordAuditLog } from '@/domain/audit/log';

const EVENT_TYPE_BY_TARGET: Record<BookingStatus, string> = {
  REQUESTED: 'BOOKING_REQUESTED',
  CONFIRMED: 'BOOKING_CONFIRMED',
  REJECTED: 'BOOKING_REJECTED',
  EXPIRED: 'BOOKING_EXPIRED',
  CANCELLED_BY_CUSTOMER: 'BOOKING_CANCELLED_BY_CUSTOMER',
  CANCELLED_BY_VENUE: 'BOOKING_CANCELLED_BY_VENUE',
  COMPLETED: 'BOOKING_COMPLETED',
  NO_SHOW: 'BOOKING_NO_SHOW',
};

const REASON_REQUIRED_TARGETS: ReadonlySet<BookingStatus> = new Set([
  'REJECTED',
  'CANCELLED_BY_VENUE',
]);

function actorTypeFor(
  actor: BookingActor,
  venueRole: string | null,
): 'CUSTOMER' | 'VENUE_USER' | 'ADMIN' | 'SYSTEM' {
  if (actor.isSystem) return 'SYSTEM';
  if (actor.isPlatformAdmin) return 'ADMIN';
  if (venueRole !== null) return 'VENUE_USER';
  return 'CUSTOMER';
}

export interface TransitionBookingParams {
  bookingId: string;
  targetStatus: BookingStatus;
  actor: BookingActor;
  /** Required for REJECTED and CANCELLED_BY_VENUE — a fixed reason, never free text. */
  reason?: VenueCancellationReason;
  /** Required for an admin override (see state-machine.ts's override
   * edges) — reopening a terminal booking or correcting a mis-marked
   * completion/no-show doesn't fit the fixed VENUE_CANCELLATION_REASON
   * vocabulary, so this is deliberately free text. Never written to
   * bookings.cancellation_reason (that column keeps its fixed
   * vocabulary) — recorded on booking_events.metadata and audit_logs
   * instead, per "no silent or reason-less admin edits"
   * (docs/architecture/authorization.md). */
  overrideReason?: string;
}

export async function transitionBooking(params: TransitionBookingParams): Promise<Booking> {
  const db = getDb();

  const [booking] = await db.select().from(bookings).where(eq(bookings.id, params.bookingId));
  if (!booking) {
    throw new DomainError('NOT_FOUND', 'Booking not found.');
  }

  const ctx = await resolveBookingAuthzContext(booking, params.actor);

  // A suspended account can't write anything, admin override included —
  // an admin who is themself suspended is a contradiction suspendUser()
  // already prevents (src/domain/admin/users.ts), but this stays a
  // blanket check, not folded into individual `allow` functions.
  if (ctx.isSuspended && !ctx.isPlatformAdmin) {
    throw new DomainError('FORBIDDEN', 'Your account has been suspended.');
  }

  const rule = findBookingTransitionRule(booking.status, params.targetStatus);
  if (!rule) {
    throw new DomainError(
      'INVALID_TRANSITION',
      `A booking cannot move from ${booking.status} to ${params.targetStatus}.`,
    );
  }
  if (!rule.allow(ctx)) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to make this change.');
  }

  if (params.targetStatus === 'CANCELLED_BY_CUSTOMER') {
    const cutoffMs = CANCELLATION_CUTOFF_HOURS * 60 * 60 * 1000;
    if (booking.startAt.getTime() - Date.now() < cutoffMs) {
      throw new DomainError(
        'INVALID_TRANSITION',
        `Cancellation is not allowed within ${CANCELLATION_CUTOFF_HOURS} hours of the booking start time.`,
      );
    }
  }

  if (REASON_REQUIRED_TARGETS.has(params.targetStatus) && !params.reason) {
    throw new DomainError('VALIDATION_FAILED', 'A reason is required.');
  }

  // An admin override is specifically "transitioning out of what was a
  // terminal status" — a normal admin action (e.g. admin confirming a
  // REQUESTED booking as venue staff would) never hits this, since
  // REQUESTED/CONFIRMED aren't terminal. See state-machine.ts's override
  // edges, all gated to isPlatformAdminCtx.
  const isAdminOverride = params.actor.isPlatformAdmin && isTerminalBookingStatus(booking.status);
  if (isAdminOverride && !params.overrideReason?.trim()) {
    throw new DomainError(
      'VALIDATION_FAILED',
      'A reason is required to override a booking out of this state.',
    );
  }

  // Layer 3: an explicit pre-check, so an obviously-taken slot fails with a
  // clear message before we even attempt the write. Not the guarantee —
  // see the module doc comment.
  if (params.targetStatus === 'CONFIRMED') {
    const [conflict] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(
        and(
          eq(bookings.facilityId, booking.facilityId),
          eq(bookings.status, 'CONFIRMED'),
          ne(bookings.id, booking.id),
          lt(bookings.startAt, booking.endAt),
          gt(bookings.endAt, booking.startAt),
        ),
      );
    if (conflict) {
      throw new DomainError('CONFLICT', 'This slot was already confirmed for another booking.');
    }
  }

  const now = new Date();
  // Reopening to REQUESTED (admin override only — see state-machine.ts)
  // needs a fresh response window and a cleared respondedAt, or the
  // expiry cron (src/domain/booking/expire.ts) would immediately
  // re-expire it: it just filters status='REQUESTED' and expires_at in
  // the past, which the old expiry timestamp still would be.
  const isReopeningToRequested = params.targetStatus === 'REQUESTED';
  const respondedAt = isReopeningToRequested
    ? null
    : (booking.respondedAt ??
      (params.targetStatus === 'CONFIRMED' || params.targetStatus === 'REJECTED' ? now : null));
  const expiresAt = isReopeningToRequested
    ? new Date(now.getTime() + BOOKING_REQUEST_EXPIRY_MINUTES * 60_000)
    : booking.expiresAt;

  let updated: Booking | undefined;
  try {
    [updated] = await db
      .update(bookings)
      .set({
        status: params.targetStatus,
        cancellationReason: params.reason ?? booking.cancellationReason,
        respondedAt,
        expiresAt,
        updatedAt: now,
      })
      // Optimistic concurrency: only apply if the row is still in the state we read it in.
      .where(and(eq(bookings.id, booking.id), eq(bookings.status, booking.status)))
      .returning();
  } catch (err) {
    if (isExclusionViolation(err)) {
      // Layer 4's real guarantee: two simultaneous CONFIRMED writes for
      // overlapping bookings on the same facility — whichever commits
      // first wins, this is the loser.
      throw new DomainError('CONFLICT', 'This slot was just confirmed for another booking.');
    }
    throw err;
  }

  if (!updated) {
    throw new DomainError(
      'CONFLICT',
      'This booking was already updated. Please refresh and try again.',
    );
  }

  const isCustomerCancellingConfirmed =
    params.targetStatus === 'CANCELLED_BY_CUSTOMER' && booking.status === 'CONFIRMED';

  await db.insert(bookingEvents).values({
    bookingId: booking.id,
    eventType: EVENT_TYPE_BY_TARGET[params.targetStatus],
    actorType: actorTypeFor(params.actor, ctx.venueRole),
    actorId: params.actor.userId,
    reason: params.reason ?? null,
    // Informational only — no money actually moves here directly; the
    // payment side effect below records what actually happened (or, when
    // no provider is configured yet, that nothing did).
    metadata: isCustomerCancellingConfirmed
      ? { refundRateApplied: CANCELLATION_REFUND_RATE }
      : isAdminOverride
        ? {
            adminOverride: true,
            previousStatus: booking.status,
            overrideReason: params.overrideReason,
          }
        : {},
  });

  // No silent or reason-less admin edits (docs/architecture/authorization.md).
  // Not best-effort — see recordAuditLog's doc comment.
  if (isAdminOverride) {
    await recordAuditLog({
      actorType: 'ADMIN',
      actorId: params.actor.userId,
      action: 'BOOKING_OVERRIDE',
      resourceType: 'booking',
      resourceId: booking.id,
      metadata: {
        from: booking.status,
        to: params.targetStatus,
        reason: params.overrideReason,
      },
    });
  }

  // Best-effort — never throws, never blocks the transition. See
  // src/domain/notifications/outbox.ts's doc comment. REQUESTED/NO_SHOW
  // aren't in NOTIFICATION_EVENT_TYPE (REQUESTED is enqueued from
  // create-request.ts instead, since it never reaches this function).
  const eventType = EVENT_TYPE_BY_TARGET[params.targetStatus];
  if ((NOTIFICATION_EVENT_TYPE as readonly string[]).includes(eventType)) {
    await enqueueBookingEvent(eventType as NotificationEventType, booking.id);
  }

  // Best-effort — never throws, never blocks the transition. See
  // src/domain/payments/service.ts's doc comment (ADR-007: capture on
  // confirm, release on reject/expire, partial refund on a customer
  // cancelling a confirmed booking).
  if (params.targetStatus === 'CONFIRMED') {
    await captureBookingPayment(updated);
  } else if (params.targetStatus === 'REJECTED' || params.targetStatus === 'EXPIRED') {
    await releaseBookingPayment(updated);
  } else if (isCustomerCancellingConfirmed) {
    await refundBookingCancellationPayment(updated);
  }

  return updated;
}
