/**
 * Domain-wide enums and business constants.
 *
 * These are the single source of truth for status/role/type strings used
 * across the app and the database. Nothing should hardcode these literals
 * elsewhere — import from here so the enum list and the DB schema
 * (supabase/migrations) never silently drift apart.
 *
 * Values mirror the enums defined in docs/architecture/database.md and the
 * Phase 0 architecture doc. Business *logic* (transition rules, validation)
 * lives in src/domain — this file only holds the vocabulary.
 */

export const VENUE_STATUS = ['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const;
export type VenueStatus = (typeof VENUE_STATUS)[number];

export const VENUE_ROLE = ['OWNER', 'MANAGER', 'RECEPTIONIST'] as const;
export type VenueRole = (typeof VENUE_ROLE)[number];

export const BOOKING_MODE = ['REQUEST_TO_BOOK', 'INSTANT_BOOK'] as const;
export type BookingMode = (typeof BOOKING_MODE)[number];

export const BOOKING_STATUS = [
  'REQUESTED',
  'CONFIRMED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_VENUE',
  'COMPLETED',
  'NO_SHOW',
] as const;
export type BookingStatus = (typeof BOOKING_STATUS)[number];

export const BOOKING_SOURCE = ['MARKETPLACE', 'MANUAL', 'ADMIN', 'IMPORT'] as const;
export type BookingSource = (typeof BOOKING_SOURCE)[number];

export const ACTOR_TYPE = ['CUSTOMER', 'VENUE_USER', 'ADMIN', 'SYSTEM', 'AI_AGENT'] as const;
export type ActorType = (typeof ACTOR_TYPE)[number];

export const AVAILABILITY_EXCEPTION_KIND = [
  'HOLIDAY',
  'MAINTENANCE',
  'TOURNAMENT',
  'PRIVATE_EVENT',
  'WEATHER',
  'SPECIAL_HOURS',
  'OTHER',
] as const;
export type AvailabilityExceptionKind = (typeof AVAILABILITY_EXCEPTION_KIND)[number];

/** Fixed, non-free-text reasons a venue can give when rejecting/cancelling a booking. */
export const VENUE_CANCELLATION_REASON = [
  'MAINTENANCE',
  'WEATHER',
  'SCHEDULING_ERROR',
  'DOUBLE_BOOKED',
  'VENUE_CLOSED',
  'OTHER',
] as const;
export type VenueCancellationReason = (typeof VENUE_CANCELLATION_REASON)[number];

/** Customer cancellation is blocked once we're inside this many hours of start_at. */
export const CANCELLATION_CUTOFF_HOURS = 2;

/** Refund fraction (of amount captured) when a customer cancels a CONFIRMED booking
 *  outside the cutoff window. The remainder is forfeited (split between venue + platform
 *  per the venue payout logic built in the payments phase). */
export const CANCELLATION_REFUND_RATE = 0.5;

/** Minutes a REQUESTED booking is held before it auto-expires if the venue doesn't respond. */
export const BOOKING_REQUEST_EXPIRY_MINUTES = 30;

/** Platform commission per completed booking, in minor currency units (EGP piastres... i.e. 5000 = 50.00 EGP). */
export const DEFAULT_COMMISSION_MINOR = 5000;

export const SUPPORTED_LOCALES = ['en', 'ar'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const RTL_LOCALES: readonly SupportedLocale[] = ['ar'];
