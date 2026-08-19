/**
 * Venue identity and lifecycle status. Full venue *behavior* (lifecycle
 * transition service, settings routes, facilities) is Phase 3 — this table
 * exists in Phase 2 because venue_members needs a real FK target, and its
 * columns are just data, not business logic. See docs/architecture/database.md.
 */
import {
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
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
    // Per-venue override of OPEN_GAME_MIN_LEAD_TIME_HOURS /
    // OPEN_GAME_MAX_HOLD_HOURS (src/lib/config/constants.ts) — null means
    // "use the platform default," never a magic sentinel number.
    // Previously flagged as an MVP simplification in
    // docs/architecture/open-games.md; the founder explicitly floated
    // per-venue configurability, this makes it real. See
    // src/domain/open-games/create-open-game.ts's effectiveOpenGameLimits.
    openGameMinLeadTimeHours: integer('open_game_min_lead_time_hours'),
    openGameMaxHoldHours: integer('open_game_max_hold_hours'),
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
