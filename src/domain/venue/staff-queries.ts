/**
 * Venue reads for signed-in staff — unlike queries.ts (public, no actor,
 * ACTIVE-only), every function here takes an actor and checks
 * src/domain/authz/venue's predicates before returning anything, since a
 * DRAFT/PENDING_REVIEW/SUSPENDED venue's existence and details are not
 * public. RLS is defense-in-depth only — see
 * docs/architecture/authorization.md.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { venueMembers, venues, type Venue } from '@/lib/db/schema';
import type { VenueRole } from '@/lib/config/constants';
import { DomainError } from '@/domain/errors';
import { isVenueStaff } from '@/domain/authz/venue';
import { resolveVenueAuthzContext, type VenueActor } from './authz-context';
import { recordAuditLog } from '@/domain/audit/log';

export interface StaffVenue {
  venue: Venue;
  role: VenueRole | null;
}

/** Every venue this user is staff at — a platform admin sees none extra
 * here (their access to any venue is a separate, always-audited path,
 * not this everyday staff list). */
export async function listStaffVenuesForUser(userId: string): Promise<StaffVenue[]> {
  const db = getDb();
  const rows = await db
    .select({ venue: venues, role: venueMembers.role })
    .from(venueMembers)
    .innerJoin(venues, eq(venueMembers.venueId, venues.id))
    .where(eq(venueMembers.userId, userId))
    .orderBy(venues.name);
  return rows;
}

/** A venue for its own staff dashboard — any status (DRAFT through
 * ARCHIVED), unlike the public getPublicVenueBySlug. Throws rather than
 * returning null on a venue that exists but the actor can't see, so a
 * route handler's catch translates it into the same "not found" a
 * stranger probing IDs would get — never confirms the ID is real. */
export async function getVenueByIdForStaff(venueId: string, actor: VenueActor): Promise<Venue> {
  const db = getDb();
  const [venue] = await db.select().from(venues).where(eq(venues.id, venueId));
  if (!venue) throw new DomainError('NOT_FOUND', 'Venue not found.');

  const ctx = await resolveVenueAuthzContext(venueId, actor);
  if (!isVenueStaff(ctx)) {
    throw new DomainError('NOT_FOUND', 'Venue not found.');
  }

  // "Access another venue's data ✅ audited" (docs/architecture/authorization.md).
  // Only when access came purely from being an admin — an actual staff
  // member viewing their own venue is not "another venue's data" and
  // isn't logged here.
  if (ctx.isPlatformAdmin && ctx.venueRole === null) {
    await recordAuditLog({
      actorType: 'ADMIN',
      actorId: actor.userId,
      action: 'VENUE_DATA_ACCESSED_BY_ADMIN',
      resourceType: 'venue',
      resourceId: venueId,
    });
  }

  return venue;
}
