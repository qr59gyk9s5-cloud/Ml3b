/**
 * One authorize→capture record per booking (ADR-007,
 * docs/architecture/database.md). `provider` is a plain text column
 * (not the payment_status enum) — matches the design doc; keeps room for
 * a second provider later without a migration touching the column type.
 */
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { paymentStatusEnum } from './enums';
import { bookings } from './bookings';

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id),
    provider: text('provider').notNull(),
    providerRef: text('provider_ref'),
    status: paymentStatusEnum('status').notNull().default('AUTHORIZED'),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull().default('EGP'),
    authorizedAt: timestamp('authorized_at', { withTimezone: true }),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    refundAmountMinor: integer('refund_amount_minor'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('payments_booking_id_idx').on(table.bookingId)],
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
