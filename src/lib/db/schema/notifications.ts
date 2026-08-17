/**
 * docs/architecture/notifications.md's two tables. Plain `text` status/
 * channel columns rather than Postgres enums — matches the design doc's
 * own schema and keeps the vocabulary changeable (adding PUSH/WHATSAPP
 * later) without a migration touching the column type.
 */
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

/** One row per (recipient, channel) a lifecycle event fanned out to —
 * written by dispatchOutboxEvents(), read by the recipient's own
 * notification list/bell. */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    channel: text('channel').notNull().default('IN_APP'),
    payload: jsonb('payload').notNull().default({}),
    status: text('status').notNull().default('PENDING'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => [index('notifications_user_id_status_idx').on(table.userId, table.status)],
);

/** The reliable-delivery backbone (docs/architecture/notifications.md's
 * "Flow" diagram) — a booking transition enqueues a row here; the cron
 * dispatcher claims PENDING rows, fans each out into `notifications`
 * rows, and marks the outbox row PROCESSED/FAILED. Never referenced by
 * FK to bookings — payload carries whatever id the dispatcher needs, so
 * this table stays generic for non-booking events later. */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [index('outbox_events_status_created_at_idx').on(table.status, table.createdAt)],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;
