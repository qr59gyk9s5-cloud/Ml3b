/**
 * Read-only admin console queries — venue moderation queue, booking
 * search for override, and the audit log viewer. Every function
 * requires an admin actor; unlike the public/customer query modules,
 * there's no "narrower, non-admin" result to fall back to — this data
 * (every venue regardless of status, any booking, the audit trail
 * itself) is admin-only by nature, so these throw FORBIDDEN rather than
 * quietly filtering.
 */
import { and, desc, eq, getTableColumns, gte, ilike, lte } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import {
  auditLogs,
  bookings,
  facilities,
  profiles,
  venues,
  type AuditLog,
  type Booking,
  type Venue,
} from '@/lib/db/schema';
import { DomainError } from '@/domain/errors';
import type { AdminActor } from './users';

function requireAdmin(actor: AdminActor): void {
  if (!actor.isPlatformAdmin) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to view this.');
  }
}

/** The approval queue plus every other venue, newest-submitted first —
 * PENDING_REVIEW is what the admin console leads with, but suspend/
 * archive need every status visible too. */
export async function listVenuesForAdmin(actor: AdminActor): Promise<Venue[]> {
  requireAdmin(actor);
  const db = getDb();
  return db.select().from(venues).orderBy(desc(venues.updatedAt));
}

export interface BookingWithVenueAndFacility extends Booking {
  venueName: string;
  facilityName: string;
}

/** Exact reference match (bookings.reference, e.g. "BK-A1B2C3") — the
 * only identifier a support conversation realistically has in hand. */
export async function findBookingByReference(
  reference: string,
  actor: AdminActor,
): Promise<BookingWithVenueAndFacility | null> {
  requireAdmin(actor);
  const db = getDb();
  const [row] = await db
    .select({
      ...getTableColumns(bookings),
      venueName: venues.name,
      facilityName: facilities.name,
    })
    .from(bookings)
    .innerJoin(venues, eq(bookings.venueId, venues.id))
    .innerJoin(facilities, eq(bookings.facilityId, facilities.id))
    .where(eq(bookings.reference, reference.trim().toUpperCase()));
  return row ?? null;
}

export interface AuditLogWithActorName extends AuditLog {
  actorName: string | null;
}

export interface ListAuditLogsParams {
  resourceType?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

/** Newest first, optionally filtered by resource type and/or a date
 * range — the only two filters the audit log viewer exposes. */
export async function listAuditLogs(
  params: ListAuditLogsParams,
  actor: AdminActor,
): Promise<AuditLogWithActorName[]> {
  requireAdmin(actor);
  const db = getDb();
  const conditions = [
    params.resourceType ? eq(auditLogs.resourceType, params.resourceType) : undefined,
    params.from ? gte(auditLogs.createdAt, params.from) : undefined,
    params.to ? lte(auditLogs.createdAt, params.to) : undefined,
  ].filter((c) => c !== undefined);

  const rows = await db
    .select({ ...getTableColumns(auditLogs), actorName: profiles.fullName })
    .from(auditLogs)
    .leftJoin(profiles, eq(auditLogs.actorId, profiles.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(params.limit ?? 100);
  return rows;
}

/** Case-insensitive partial match on full_name — email search is exact
 * (findUserByEmail in users.ts, since email lives in auth.users, not
 * profiles) but a support agent often only has a name to go on. */
export async function searchUsersByName(query: string, actor: AdminActor) {
  requireAdmin(actor);
  const db = getDb();
  return db
    .select()
    .from(profiles)
    .where(ilike(profiles.fullName, `%${query.trim()}%`))
    .orderBy(profiles.fullName)
    .limit(25);
}
