/**
 * The core table — unified for marketplace, manual, and admin-entered
 * bookings (ADR-002). The double-booking guarantee itself (the GiST
 * exclusion constraint) isn't expressible in Drizzle's schema DSL and is
 * added by hand in 0007_booking_domain_constraints_and_rls.sql — see
 * docs/architecture/database.md#concurrency and ADR-004.
 *
 * No payments table/columns beyond the pricing *snapshot* (subtotal/fee/
 * total) — actual payment capture is its own dedicated phase (ADR-007),
 * not implemented here.
 */
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  actorTypeEnum,
  bookingSourceEnum,
  bookingStatusEnum,
  cancellationReasonEnum,
} from './enums';
import { venues } from './venues';
import { facilities } from './facilities';
import { profiles } from './profiles';

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reference: text('reference').notNull().unique(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id),
    facilityId: uuid('facility_id')
      .notNull()
      .references(() => facilities.id),
    customerId: uuid('customer_id').references(() => profiles.id),
    status: bookingStatusEnum('status').notNull().default('REQUESTED'),
    source: bookingSourceEnum('source').notNull().default('MARKETPLACE'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }).notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    customerName: text('customer_name'),
    customerPhone: text('customer_phone'),
    customerNote: text('customer_note'),
    venuePrivateNote: text('venue_private_note'),
    cancellationReason: cancellationReasonEnum('cancellation_reason'),
    subtotalMinor: integer('subtotal_minor').notNull(),
    platformFeeMinor: integer('platform_fee_minor').notNull().default(0),
    totalMinor: integer('total_minor').notNull(),
    currency: text('currency').notNull().default('EGP'),
    idempotencyKey: text('idempotency_key'),
    createdBy: uuid('created_by').references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('bookings_facility_id_start_end_idx').on(table.facilityId, table.startAt, table.endAt),
    index('bookings_venue_id_status_idx').on(table.venueId, table.status),
    index('bookings_customer_id_status_idx').on(table.customerId, table.status),
    uniqueIndex('bookings_customer_id_idempotency_key_key')
      .on(table.customerId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    check('bookings_time_range_check', sql`${table.startAt} < ${table.endAt}`),
  ],
);

/** Append-only history — see docs/architecture/database.md. actor_type
 * reuses the same enum as future AI-agent auditing (ADR-006). */
export const bookingEvents = pgTable(
  'booking_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    actorType: actorTypeEnum('actor_type').notNull(),
    actorId: uuid('actor_id'),
    reason: text('reason'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('booking_events_booking_id_created_at_idx').on(table.bookingId, table.createdAt),
  ],
);

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type BookingEvent = typeof bookingEvents.$inferSelect;
export type NewBookingEvent = typeof bookingEvents.$inferInsert;
