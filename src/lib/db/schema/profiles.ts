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
  /** Admin moderation (Phase 11) — reversible, distinct from a permanent
   * ban (CLAUDE.md's forbidden-without-approval list; see
   * src/domain/admin/users.ts). null = not suspended. A single current
   * state, not an append-only grant list like platform_admins — the
   * "who did this and why" history lives in audit_logs. */
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  suspendedReason: text('suspended_reason'),
  /** No Drizzle .references() here — a same-table FK needs the circular
   * AnyPgColumn typing dance for no real benefit; the FK constraint
   * itself is added by hand in the RLS migration, same pattern as
   * profiles.id -> auth.users.id. */
  suspendedBy: uuid('suspended_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
