/**
 * Explicit, auditable admin grants — see ADR-005 and
 * docs/architecture/database.md. Deliberately not a boolean flag on
 * `profiles`; granting/revoking admin access is its own event.
 */
import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

export const platformAdmins = pgTable('platform_admins', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  grantedBy: uuid('granted_by').references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type PlatformAdmin = typeof platformAdmins.$inferSelect;
export type NewPlatformAdmin = typeof platformAdmins.$inferInsert;
