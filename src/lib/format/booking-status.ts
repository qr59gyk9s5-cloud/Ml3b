/**
 * Internal enum names are never shown to customers verbatim — this is
 * the one place that wording lives, matching the table in
 * docs/product/booking-flow.md#customer-facing-status-wording exactly.
 * A "REQUEST SENT" state must never be presented as "BOOKING CONFIRMED".
 */
import type { BookingStatus, VenueCancellationReason } from '@/lib/config/constants';

export const CUSTOMER_STATUS_LABEL: Record<BookingStatus, string> = {
  REQUESTED: 'Waiting for venue confirmation',
  CONFIRMED: 'Booking confirmed',
  REJECTED: 'Venue could not accept this request',
  EXPIRED: 'Request expired',
  CANCELLED_BY_CUSTOMER: 'Cancelled',
  CANCELLED_BY_VENUE: 'Cancelled by venue',
  COMPLETED: 'Completed',
  NO_SHOW: 'Marked as no-show',
};

export type StatusTone = 'pending' | 'positive' | 'negative' | 'neutral';

export const CUSTOMER_STATUS_TONE: Record<BookingStatus, StatusTone> = {
  REQUESTED: 'pending',
  CONFIRMED: 'positive',
  REJECTED: 'negative',
  EXPIRED: 'neutral',
  CANCELLED_BY_CUSTOMER: 'neutral',
  CANCELLED_BY_VENUE: 'negative',
  COMPLETED: 'positive',
  NO_SHOW: 'negative',
};

/** The fixed list a venue picks a reason from (VENUE_CANCELLATION_REASON)
 * — displayed alongside "Cancelled by venue", never free text. */
export const VENUE_REASON_LABEL: Record<VenueCancellationReason, string> = {
  MAINTENANCE: 'Maintenance',
  WEATHER: 'Weather',
  SCHEDULING_ERROR: 'Scheduling error',
  DOUBLE_BOOKED: 'Double-booked',
  VENUE_CLOSED: 'Venue closed',
  INSUFFICIENT_PLAYERS: 'Not enough players joined in time',
  OTHER: 'Other',
};
