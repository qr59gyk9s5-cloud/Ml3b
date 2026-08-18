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

/** OPEN_GAME (ADR-011): a booking created by an open game's organizer —
 * still just a normal booking, this is the only marker. */
export const BOOKING_SOURCE = ['MARKETPLACE', 'MANUAL', 'ADMIN', 'IMPORT', 'OPEN_GAME'] as const;
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

/** Fixed, non-free-text reasons a venue can give when rejecting/cancelling a booking.
 * INSUFFICIENT_PLAYERS (ADR-011) is the one reason the SYSTEM actor uses, not a
 * human — an open game that never reached its minimum roster by the join cutoff. */
export const VENUE_CANCELLATION_REASON = [
  'MAINTENANCE',
  'WEATHER',
  'SCHEDULING_ERROR',
  'DOUBLE_BOOKED',
  'VENUE_CLOSED',
  'INSUFFICIENT_PLAYERS',
  'OTHER',
] as const;
export type VenueCancellationReason = (typeof VENUE_CANCELLATION_REASON)[number];

/** Display names for the ISO country codes venues.country actually holds.
 * Grows as we launch new markets — never hardcode "Egypt" in UI copy. */
export const COUNTRY_NAMES: Record<string, string> = {
  EG: 'Egypt',
};

export function countryDisplayName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

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

/** docs/architecture/notifications.md. Plain text columns in the DB (not
 * Postgres enums, unlike bookings.status) — see notifications.ts schema. */
export const NOTIFICATION_CHANNEL = ['IN_APP', 'EMAIL'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNEL)[number];

export const NOTIFICATION_STATUS = ['PENDING', 'SENT', 'FAILED'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUS)[number];

export const OUTBOX_STATUS = ['PENDING', 'PROCESSING', 'PROCESSED', 'FAILED'] as const;
export type OutboxStatus = (typeof OUTBOX_STATUS)[number];

/** The booking lifecycle events that fan out into notifications — a
 * subset of docs/architecture/notifications.md's event list; the rest
 * (VENUE_RESPONSE_REMINDER, BOOKING_REMINDER) need a separate reminder
 * job, not yet built. */
export const NOTIFICATION_EVENT_TYPE = [
  'BOOKING_REQUESTED',
  'BOOKING_CONFIRMED',
  'BOOKING_REJECTED',
  'BOOKING_EXPIRED',
  'BOOKING_CANCELLED_BY_CUSTOMER',
  'BOOKING_CANCELLED_BY_VENUE',
  'BOOKING_COMPLETED',
] as const;
export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPE)[number];

/** An outbox row that's failed this many times is left FAILED for good,
 * not retried forever — see docs/architecture/notifications.md. */
export const OUTBOX_MAX_ATTEMPTS = 5;

/** ADR-007 / docs/architecture/database.md's payments table. */
export const PAYMENT_STATUS = [
  'AUTHORIZED',
  'CAPTURED',
  'RELEASED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'FAILED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];

/** Provider selected per ADR-007's founder decision — Fawry. Kept as a
 * union (not hardcoded 'fawry' everywhere) so a second provider can be
 * added without touching every call site. */
export const PAYMENT_PROVIDER = ['fawry'] as const;
export type PaymentProviderName = (typeof PAYMENT_PROVIDER)[number];

export const SUPPORTED_LOCALES = ['en', 'ar'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const RTL_LOCALES: readonly SupportedLocale[] = ['ar'];

/** ADR-011 / docs/architecture/open-games.md.
 *
 *   AWAITING_VENUE   --venue confirms--> FILLING
 *   AWAITING_VENUE   --venue rejects/expires--> VENUE_REJECTED
 *   FILLING          --roster >= minPlayers (auto_confirm_if_min_met=false)--> MINIMUM_REACHED
 *   FILLING/MINIMUM_REACHED --roster >= minPlayers (auto_confirm_if_min_met=true)--> CONFIRMED
 *   FILLING/MINIMUM_REACHED --roster == targetPlayers (either flag value)--> CONFIRMED
 *   FILLING/MINIMUM_REACHED --cutoff arrives, still short--> FAILED_TO_FILL
 *   FILLING/MINIMUM_REACHED --organizer cancels--> ORGANIZER_CANCELLED
 *   FILLING/MINIMUM_REACHED --venue cancels the hold--> VENUE_CANCELLED
 *
 * No manual "organizer must decide" state — auto_confirm_if_min_met
 * fully determines the outcome at cutoff, deterministically.
 */
export const OPEN_GAME_STATUS = [
  'AWAITING_VENUE',
  'FILLING',
  'MINIMUM_REACHED',
  'CONFIRMED',
  'VENUE_REJECTED',
  'FAILED_TO_FILL',
  'ORGANIZER_CANCELLED',
  'VENUE_CANCELLED',
] as const;
export type OpenGameStatus = (typeof OPEN_GAME_STATUS)[number];

/** Terminal — an open game past one of these never transitions again. */
export const OPEN_GAME_TERMINAL_STATUS: ReadonlySet<OpenGameStatus> = new Set([
  'CONFIRMED',
  'VENUE_REJECTED',
  'FAILED_TO_FILL',
  'ORGANIZER_CANCELLED',
  'VENUE_CANCELLED',
]);

/** How long a venue's provisional accept holds the slot before it must
 * either fill or fail, and how close to kickoff a game may still be
 * created — global MVP constants, not yet a per-venue setting (flagged
 * in docs/architecture/open-games.md, not silently assumed permanent). */
export const OPEN_GAME_MAX_HOLD_HOURS = 48;
export const OPEN_GAME_MIN_LEAD_TIME_HOURS = 4;

export const OPEN_GAME_PLAYER_STATUS = ['JOINED', 'LEFT', 'REMOVED'] as const;
export type OpenGamePlayerStatus = (typeof OPEN_GAME_PLAYER_STATUS)[number];

/** Shared across every sport, unlike position (free text — see ADR-011). */
export const SKILL_LEVEL = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'COMPETITIVE'] as const;
export type SkillLevel = (typeof SKILL_LEVEL)[number];
