/**
 * Venue staff membership — the authorization backbone for every
 * venue-scoped action. Never replace this with a single owner_user_id
 * column. See docs/architecture/authorization.md.
 */
import { pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { venueRoleEnum } from './enums';
import { venues } from './venues';
import { profiles } from './profiles';

export const venueMembers = pgTable(
  'venue_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    role: venueRoleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('venue_members_venue_id_user_id_key').on(table.venueId, table.userId)],
);

export type VenueMember = typeof venueMembers.$inferSelect;
export type NewVenueMember = typeof venueMembers.$inferInsert;
