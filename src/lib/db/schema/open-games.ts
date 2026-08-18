/**
 * ADR-011 / docs/architecture/open-games.md. A coordination layer on top
 * of one real `bookings` row — the booking is the actual slot
 * reservation (exclusion constraint, state machine, RLS all apply
 * unmodified); these two tables track who's committed to fill it.
 */
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import {
  cancellationReasonEnum,
  openGamePlayerStatusEnum,
  openGameStatusEnum,
  skillLevelEnum,
} from './enums';
import { bookings } from './bookings';
import { profiles } from './profiles';

export const openGames = pgTable(
  'open_games',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id),
    organizerId: uuid('organizer_id')
      .notNull()
      .references(() => profiles.id),
    targetPlayers: integer('target_players').notNull(),
    minPlayers: integer('min_players').notNull(),
    pricePerPlayerMinor: integer('price_per_player_minor').notNull(),
    currency: text('currency').notNull().default('EGP'),
    joinCutoffAt: timestamp('join_cutoff_at', { withTimezone: true }).notNull(),
    autoConfirmIfMinMet: boolean('auto_confirm_if_min_met').notNull().default(false),
    status: openGameStatusEnum('status').notNull().default('AWAITING_VENUE'),
    /** Only meaningful for ORGANIZER_CANCELLED/VENUE_CANCELLED — reuses
     * cancellation_reason (VENUE_CANCELLATION_REASON), fixed vocabulary,
     * never free text. FAILED_TO_FILL and VENUE_REJECTED are
     * self-explanatory from the status alone (the latter's actual reason
     * lives on the underlying booking, set by the normal reject flow). */
    cancelledReason: cancellationReasonEnum('cancelled_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('open_games_booking_id_idx').on(table.bookingId),
    index('open_games_organizer_id_idx').on(table.organizerId),
    index('open_games_status_join_cutoff_idx').on(table.status, table.joinCutoffAt),
    check('open_games_min_le_target_check', sql`${table.minPlayers} <= ${table.targetPlayers}`),
    check('open_games_min_players_positive_check', sql`${table.minPlayers} > 0`),
  ],
);

export type OpenGame = typeof openGames.$inferSelect;
export type NewOpenGame = typeof openGames.$inferInsert;

export const openGamePlayers = pgTable(
  'open_game_players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    openGameId: uuid('open_game_id')
      .notNull()
      .references(() => openGames.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    /** Free text, not a fixed enum — see ADR-011: a real per-sport
     * position taxonomy is deferred, not assumed. */
    position: text('position'),
    skillLevel: skillLevelEnum('skill_level'),
    status: openGamePlayerStatusEnum('status').notNull().default('JOINED'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('open_game_players_open_game_id_idx').on(table.openGameId),
    index('open_game_players_user_id_idx').on(table.userId),
    // A user may have historical LEFT/REMOVED rows for the same game
    // (rejoining after leaving inserts a new row rather than flipping
    // the old one back — keeps the leave/rejoin history intact) but
    // only ever one active JOINED row at a time.
    uniqueIndex('open_game_players_one_active_join_per_user')
      .on(table.openGameId, table.userId)
      .where(sql`${table.status} = 'JOINED'`),
  ],
);

export type OpenGamePlayer = typeof openGamePlayers.$inferSelect;
export type NewOpenGamePlayer = typeof openGamePlayers.$inferInsert;
