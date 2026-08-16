/**
 * Postgres enum definitions, mirroring the values in
 * src/lib/config/constants.ts and documented in docs/architecture/database.md.
 *
 * Only the enums this phase's tables actually use live here. Booking-,
 * availability-, and payment-related enums are added in the migrations that
 * introduce the tables that use them (Phases 4/5), not speculatively now.
 */
import { pgEnum } from 'drizzle-orm/pg-core';
import {
  AVAILABILITY_EXCEPTION_KIND,
  BOOKING_MODE,
  VENUE_ROLE,
  VENUE_STATUS,
} from '@/lib/config/constants';

export const venueRoleEnum = pgEnum('venue_role', [...VENUE_ROLE]);
export const venueStatusEnum = pgEnum('venue_status', [...VENUE_STATUS]);
export const bookingModeEnum = pgEnum('booking_mode', [...BOOKING_MODE]);
export const exceptionKindEnum = pgEnum('exception_kind', [...AVAILABILITY_EXCEPTION_KIND]);
