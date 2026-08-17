/**
 * Cross-cutting admin accountability trail (Phase 11,
 * docs/architecture/authorization.md's "Admin override, specifically").
 * Separate from booking_events (which is booking-lifecycle-specific and
 * customer/venue-visible via RLS) — audit_logs exists for admin-only
 * actions across any resource type (bookings, venues, users) and is only
 * ever visible to a platform admin. Written only by
 * src/domain/audit/log.ts, via the privileged app connection.
 */
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { actorTypeEnum } from './enums';

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorType: actorTypeEnum('actor_type').notNull(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id'),
    correlationId: uuid('correlation_id'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_resource_idx').on(table.resourceType, table.resourceId),
    index('audit_logs_actor_idx').on(table.actorType, table.actorId),
    index('audit_logs_created_at_idx').on(table.createdAt),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
