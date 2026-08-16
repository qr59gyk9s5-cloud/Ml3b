/**
 * Sports taxonomy — never store repeated sport strings on venues/facilities
 * directly. See docs/product/product-overview.md; not hardcoded to football.
 */
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const sports = pgTable('sports', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  displayName: text('display_name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Sport = typeof sports.$inferSelect;
export type NewSport = typeof sports.$inferInsert;
