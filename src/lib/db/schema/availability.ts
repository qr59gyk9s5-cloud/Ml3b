/**
 * Availability is derived, not materialized (ADR-003): these two tables
 * are the *rules*, not a row per bookable slot. Requestable times are
 * computed on read by src/domain/availability/compute-slots.ts.
 */
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  time,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { exceptionKindEnum } from './enums';
import { facilities } from './facilities';
import { profiles } from './profiles';

/** Recurring weekly schedule, per facility. A facility can have more than
 * one row for the same day_of_week (split hours, e.g. 09:00-12:00 and
 * 17:00-23:00) — rows aren't required to be exclusive. `end_time <=
 * start_time` means the interval crosses midnight into the next calendar
 * day (e.g. Friday 22:00 -> Saturday 02:00); see
 * src/domain/availability/compute-slots.ts for how that's resolved into
 * absolute instants. */
export const availabilityRules = pgTable(
  'availability_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    facilityId: uuid('facility_id')
      .notNull()
      .references(() => facilities.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    isClosed: boolean('is_closed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('availability_rules_facility_id_day_idx').on(table.facilityId, table.dayOfWeek),
    check('availability_rules_day_of_week_check', sql`${table.dayOfWeek} between 0 and 6`),
  ],
);

/** One-off overrides: closures (maintenance, weather, holiday, tournament,
 * private event) and special opening hours. Absolute timestamps, not
 * wall-clock — the caller already knows exactly which instant they mean
 * (unlike the recurring weekly rule, which is inherently local time). */
export const availabilityExceptions = pgTable(
  'availability_exceptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    facilityId: uuid('facility_id')
      .notNull()
      .references(() => facilities.id, { onDelete: 'cascade' }),
    kind: exceptionKindEnum('kind').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    isClosed: boolean('is_closed').notNull().default(true),
    reason: text('reason'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('availability_exceptions_facility_id_range_idx').on(
      table.facilityId,
      table.startsAt,
      table.endsAt,
    ),
    check('availability_exceptions_range_check', sql`${table.startsAt} < ${table.endsAt}`),
  ],
);

export type AvailabilityRule = typeof availabilityRules.$inferSelect;
export type NewAvailabilityRule = typeof availabilityRules.$inferInsert;
export type AvailabilityException = typeof availabilityExceptions.$inferSelect;
export type NewAvailabilityException = typeof availabilityExceptions.$inferInsert;
