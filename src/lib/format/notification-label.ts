import type { NotificationEventType } from '@/lib/config/constants';

/** Short, generic label for the in-app notification list — the full
 * context (which facility, what time) lives in the linked booking, this
 * is just enough to know what kind of update it is at a glance. */
export const NOTIFICATION_EVENT_LABEL: Record<NotificationEventType, string> = {
  BOOKING_REQUESTED: 'New booking request',
  BOOKING_CONFIRMED: 'Booking confirmed',
  BOOKING_REJECTED: 'Booking request declined',
  BOOKING_EXPIRED: 'Booking request expired',
  BOOKING_CANCELLED_BY_CUSTOMER: 'Customer cancelled a booking',
  BOOKING_CANCELLED_BY_VENUE: 'Your booking was cancelled',
  BOOKING_COMPLETED: 'Booking completed',
};
