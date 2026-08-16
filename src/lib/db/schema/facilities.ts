/**
 * A bookable resource inside a venue (a pitch, a court). This — not the
 * venue — is what a customer actually books. Booking uses fixed pre-set
 * slots (slotDurationMinutes), not freeform start/end times — see
 * ADR-002 / docs/product/booking-flow.md.
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
import { bookingModeEnum } from './enums';
import { venues } from './venues';
import { sports } from './sports';

export const facilities = pgTable(
  'facilities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    sportId: uuid('sport_id')
      .notNull()
      .references(() => sports.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    capacity: integer('capacity'),
    bookingMode: bookingModeEnum('booking_mode').notNull().default('REQUEST_TO_BOOK'),
    slotDurationMinutes: integer('slot_duration_minutes').notNull().default(60),
    minimumDurationMinutes: integer('minimum_duration_minutes').notNull().default(60),
    maximumDurationMinutes: integer('maximum_duration_minutes').notNull().default(120),
    basePriceMinor: integer('base_price_minor').notNull(),
    currency: text('currency').notNull().default('EGP'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('facilities_venue_id_slug_key').on(table.venueId, table.slug),
    index('facilities_venue_id_idx').on(table.venueId),
    index('facilities_sport_id_idx').on(table.sportId),
    check(
      'facilities_duration_check',
      sql`${table.minimumDurationMinutes} <= ${table.maximumDurationMinutes}`,
    ),
    check('facilities_price_check', sql`${table.basePriceMinor} >= 0`),
  ],
);

export type Facility = typeof facilities.$inferSelect;
export type NewFacility = typeof facilities.$inferInsert;
