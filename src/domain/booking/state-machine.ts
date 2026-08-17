/**
 * The booking state machine — exactly one place this graph is defined.
 * Every transition (customer request, venue confirm/reject, system
 * expiry, cancellation, completion, no-show) goes through
 * transitionBooking() in transition.ts, which consults this table. See
 * docs/product/booking-flow.md for the customer-facing version of this
 * same graph.
 *
 *   REQUESTED --confirm--> CONFIRMED --complete--> COMPLETED
 *      |  |                   |  |
 *      |  |--reject--> REJECTED  |--no_show--> NO_SHOW
 *      |  |--expire--> EXPIRED   |--cancel(customer)--> CANCELLED_BY_CUSTOMER
 *      |--cancel(customer)--> CANCELLED_BY_CUSTOMER
 *                              |--cancel(venue)--> CANCELLED_BY_VENUE
 *
 * REJECTED, EXPIRED, CANCELLED_BY_CUSTOMER, CANCELLED_BY_VENUE, COMPLETED,
 * NO_SHOW are all terminal for every normal actor — nothing transitions
 * out of them except the ADMIN OVERRIDE edges below (Phase 11,
 * docs/architecture/authorization.md's "Admin override, specifically").
 * Those exist for exceptional correction only (a wrongly-expired
 * request, a mis-marked no-show) — transition.ts requires a reason and
 * writes to audit_logs whenever one of these fires, on top of the usual
 * booking_events row. ARCHIVED for venues has no equivalent override —
 * still deliberately deferred, see CLAUDE.md on scope discipline.
 */
import type { BookingStatus } from '@/lib/config/constants';
import {
  isBookingOwner,
  isPlatformAdminCtx,
  isSystemActor,
  isVenueStaffForBooking,
  type BookingAuthzContext,
} from '@/domain/authz/booking';

interface BookingTransitionRule {
  from: BookingStatus;
  to: BookingStatus;
  allow: (ctx: BookingAuthzContext) => boolean;
}

const TRANSITIONS: BookingTransitionRule[] = [
  { from: 'REQUESTED', to: 'CONFIRMED', allow: isVenueStaffForBooking },
  { from: 'REQUESTED', to: 'REJECTED', allow: isVenueStaffForBooking },
  { from: 'REQUESTED', to: 'EXPIRED', allow: isSystemActor },
  { from: 'REQUESTED', to: 'CANCELLED_BY_CUSTOMER', allow: isBookingOwner },
  { from: 'CONFIRMED', to: 'CANCELLED_BY_CUSTOMER', allow: isBookingOwner },
  { from: 'CONFIRMED', to: 'CANCELLED_BY_VENUE', allow: isVenueStaffForBooking },
  {
    from: 'CONFIRMED',
    to: 'COMPLETED',
    allow: (ctx) => isVenueStaffForBooking(ctx) || isSystemActor(ctx),
  },
  { from: 'CONFIRMED', to: 'NO_SHOW', allow: isVenueStaffForBooking },

  // --- Admin override edges (Phase 11) — reopening a wrongly-terminaled
  // booking, or correcting a mis-marked completion/no-show. Reason
  // required and audit-logged, enforced by transition.ts, not here.
  { from: 'EXPIRED', to: 'REQUESTED', allow: isPlatformAdminCtx },
  { from: 'REJECTED', to: 'REQUESTED', allow: isPlatformAdminCtx },
  { from: 'CANCELLED_BY_CUSTOMER', to: 'REQUESTED', allow: isPlatformAdminCtx },
  { from: 'CANCELLED_BY_VENUE', to: 'REQUESTED', allow: isPlatformAdminCtx },
  { from: 'NO_SHOW', to: 'COMPLETED', allow: isPlatformAdminCtx },
  { from: 'COMPLETED', to: 'NO_SHOW', allow: isPlatformAdminCtx },
];

export function findBookingTransitionRule(
  from: BookingStatus,
  to: BookingStatus,
): BookingTransitionRule | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to);
}

/** Pure role/relationship check — no DB, no time-based rules. The 2-hour
 * cancellation cutoff is a separate, time-dependent check made by
 * transition.ts, not part of this graph. */
export function canTransitionBooking(
  ctx: BookingAuthzContext,
  from: BookingStatus,
  to: BookingStatus,
): boolean {
  const rule = findBookingTransitionRule(from, to);
  return rule !== undefined && rule.allow(ctx);
}

const TERMINAL_STATUSES: ReadonlySet<BookingStatus> = new Set([
  'REJECTED',
  'EXPIRED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_VENUE',
  'COMPLETED',
  'NO_SHOW',
]);

export function isTerminalBookingStatus(status: BookingStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
