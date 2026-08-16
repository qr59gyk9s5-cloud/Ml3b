/**
 * Venue identity and lifecycle status. Full venue *behavior* (lifecycle
 * transition service, settings routes, facilities) is Phase 3 — this table
 * exists in Phase 2 because venue_members needs a real FK target, and its
 * columns are just data, not business logic. See docs/architecture/database.md.
 */
import { doublePrecision, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { venueStatusEnum } from './enums';
import { profiles } from './profiles';

export const venues = pgTable(
  'venues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    status: venueStatusEnum('status').notNull().default('DRAFT'),
    country: text('country').notNull().default('EG'),
    city: text('city').notNull(),
    district: text('district'),
    address: text('address'),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    timezone: text('timezone').notNull().default('Africa/Cairo'),
    coverPhotoUrl: text('cover_photo_url'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('venues_status_idx').on(table.status), index('venues_city_idx').on(table.city)],
);

export type Venue = typeof venues.$inferSelect;
export type NewVenue = typeof venues.$inferInsert;
