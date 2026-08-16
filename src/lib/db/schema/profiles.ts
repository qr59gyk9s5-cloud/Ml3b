/**
 * 1:1 extension of Supabase's `auth.users`.
 *
 * Drizzle doesn't manage `auth.users` (Supabase owns that schema), so the
 * foreign key from `profiles.id` to `auth.users.id` — plus the trigger that
 * creates a profile row on signup — is added by hand in
 * supabase/migrations/0002_identity_auth_and_rls.sql, not expressed here.
 * This file only declares the shape Drizzle needs for typed queries.
 */
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
