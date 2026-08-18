/**
 * One authorize→capture record per *payable thing* — either a whole
 * booking (ADR-007) or a single player's share of an open game
 * (ADR-011). Exactly one of `bookingId` / `openGamePlayerId` is ever
 * set, enforced by a CHECK constraint, not just application discipline.
 * `provider` is a plain text column (not an enum) — matches the design
 * doc; keeps room for a second provider later without a migration
 * touching the column type.
 */
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { paymentStatusEnum } from './enums';
import { bookings } from './bookings';
import { openGamePlayers } from './open-games';

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id').references(() => bookings.id),
    openGamePlayerId: uuid('open_game_player_id').references(() => openGamePlayers.id),
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
  (table) => [
    index('payments_booking_id_idx').on(table.bookingId),
    index('payments_open_game_player_id_idx').on(table.openGamePlayerId),
    check(
      'payments_exactly_one_target_check',
      sql`(${table.bookingId} is not null) <> (${table.openGamePlayerId} is not null)`,
    ),
  ],
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
