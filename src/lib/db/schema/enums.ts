/**
 * Postgres enum definitions, mirroring the values in
 * src/lib/config/constants.ts and documented in docs/architecture/database.md.
 */
import { pgEnum } from 'drizzle-orm/pg-core';
import {
  ACTOR_TYPE,
  AVAILABILITY_EXCEPTION_KIND,
  BOOKING_MODE,
  BOOKING_SOURCE,
  BOOKING_STATUS,
  PAYMENT_STATUS,
  VENUE_CANCELLATION_REASON,
  VENUE_ROLE,
  VENUE_STATUS,
} from '@/lib/config/constants';

export const venueRoleEnum = pgEnum('venue_role', [...VENUE_ROLE]);
export const venueStatusEnum = pgEnum('venue_status', [...VENUE_STATUS]);
export const bookingModeEnum = pgEnum('booking_mode', [...BOOKING_MODE]);
export const exceptionKindEnum = pgEnum('exception_kind', [...AVAILABILITY_EXCEPTION_KIND]);
export const bookingStatusEnum = pgEnum('booking_status', [...BOOKING_STATUS]);
export const bookingSourceEnum = pgEnum('booking_source', [...BOOKING_SOURCE]);
export const actorTypeEnum = pgEnum('actor_type', [...ACTOR_TYPE]);
export const cancellationReasonEnum = pgEnum('cancellation_reason', [...VENUE_CANCELLATION_REASON]);
export const paymentStatusEnum = pgEnum('payment_status', [...PAYMENT_STATUS]);
