/**
 * Venue staff management (invite by email, remove) — the dashboard's
 * "Staff" section. canManageVenueStaff/canRemoveVenueMember
 * (src/domain/authz/venue.ts) are the real gate here; the venue_members
 * RLS policies (0001_identity_auth_and_rls.sql) are defense-in-depth
 * only, per CLAUDE.md's "authorization is server-side, in
 * src/domain/authz, always." Never trust the client with a role or a
 * venueId — every function re-resolves the actor's own membership from
 * the database.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { profiles, venueMembers } from '@/lib/db/schema';
import type { VenueRole } from '@/lib/config/constants';
import { DomainError } from '@/domain/errors';
import { canManageVenueStaff, canRemoveVenueMember, isVenueStaff } from '@/domain/authz/venue';
import { findUserIdByEmail, getUserEmails } from '@/lib/db/auth-users';
import { recordAuditLog } from '@/domain/audit/log';
import { resolveVenueAuthzContext, type VenueActor } from './authz-context';

export interface VenueStaffMember {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: VenueRole;
  isSelf: boolean;
}

async function withEmails(
  rows: { id: string; userId: string; role: VenueRole; fullName: string }[],
  actorId: string,
): Promise<VenueStaffMember[]> {
  const emails = await getUserEmails(rows.map((r) => r.userId));
  return rows.map((r) => ({
    ...r,
    email: emails.get(r.userId) ?? '',
    isSelf: r.userId === actorId,
  }));
}

/** Every current teammate at this venue — any staff member (not just
 * OWNER/MANAGER) can see who else has access, mirroring the RLS policy's
 * "teammates see teammates." */
export async function listVenueStaff(
  venueId: string,
  actor: VenueActor,
): Promise<VenueStaffMember[]> {
  const ctx = await resolveVenueAuthzContext(venueId, actor);
  if (!isVenueStaff(ctx)) {
    throw new DomainError('FORBIDDEN', 'You are not staff at this venue.');
  }

  const db = getDb();
  const rows = await db
    .select({
      id: venueMembers.id,
      userId: venueMembers.userId,
      role: venueMembers.role,
      fullName: profiles.fullName,
    })
    .from(venueMembers)
    .innerJoin(profiles, eq(profiles.id, venueMembers.userId))
    .where(eq(venueMembers.venueId, venueId))
    .orderBy(venueMembers.createdAt);

  return withEmails(rows, actor.userId);
}

/** Adds an existing account as staff by email — there is no invite-a-
 * stranger flow; they need a PlayCairo account already (see the "no
 * account found" error below). OWNER/admin only — see
 * canManageVenueStaff's doc comment for why this doesn't also allow
 * MANAGER despite the venue_members_insert RLS policy being broader;
 * this function is the actual gate. */
export async function addVenueStaffMember(
  venueId: string,
  actor: VenueActor,
  input: { email: string; role: VenueRole },
): Promise<VenueStaffMember> {
  const ctx = await resolveVenueAuthzContext(venueId, actor);
  if (ctx.isSuspended && !ctx.isPlatformAdmin) {
    throw new DomainError('FORBIDDEN', 'Your account has been suspended.');
  }
  if (!canManageVenueStaff(ctx)) {
    throw new DomainError('FORBIDDEN', 'Only the venue owner can add staff.');
  }

  const userId = await findUserIdByEmail(input.email);
  if (!userId) {
    throw new DomainError(
      'NOT_FOUND',
      'No PlayCairo account with that email — they need to sign up first.',
    );
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: venueMembers.id })
    .from(venueMembers)
    .where(and(eq(venueMembers.venueId, venueId), eq(venueMembers.userId, userId)));
  if (existing) {
    throw new DomainError('VALIDATION_FAILED', 'That person is already staff at this venue.');
  }

  const [member] = await db
    .insert(venueMembers)
    .values({ venueId, userId, role: input.role })
    .returning();

  // "Access another venue's data ✅ audited" (docs/architecture/authorization.md)
  // — only when the actor got here purely as an admin, not as the
  // venue's own OWNER managing their own team.
  if (ctx.isPlatformAdmin && ctx.venueRole === null) {
    await recordAuditLog({
      actorType: 'ADMIN',
      actorId: actor.userId,
      action: 'VENUE_STAFF_ADDED_BY_ADMIN',
      resourceType: 'venue',
      resourceId: venueId,
      metadata: { addedUserId: userId, role: input.role },
    });
  }

  const [profile] = await db
    .select({ fullName: profiles.fullName })
    .from(profiles)
    .where(eq(profiles.id, userId));
  const [result] = await withEmails(
    [{ id: member.id, userId, role: member.role, fullName: profile?.fullName ?? '' }],
    actor.userId,
  );
  return result;
}

/** Removes a teammate. OWNER/admin can remove anyone; a MANAGER can only
 * remove a RECEPTIONIST (canRemoveVenueMember's finer per-target check).
 * Nobody can remove themselves through this path — leaving a venue
 * unstaffed isn't a "staff management" action, and isn't built. */
export async function removeVenueStaffMember(
  venueId: string,
  actor: VenueActor,
  memberId: string,
): Promise<void> {
  const ctx = await resolveVenueAuthzContext(venueId, actor);
  if (ctx.isSuspended && !ctx.isPlatformAdmin) {
    throw new DomainError('FORBIDDEN', 'Your account has been suspended.');
  }

  const db = getDb();
  const [target] = await db
    .select()
    .from(venueMembers)
    .where(and(eq(venueMembers.id, memberId), eq(venueMembers.venueId, venueId)));
  if (!target) {
    throw new DomainError('NOT_FOUND', 'Staff member not found.');
  }
  if (target.userId === actor.userId) {
    throw new DomainError('VALIDATION_FAILED', "You can't remove yourself.");
  }
  if (!canRemoveVenueMember(ctx, target.role)) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to remove this person.');
  }

  await db.delete(venueMembers).where(eq(venueMembers.id, memberId));

  if (ctx.isPlatformAdmin && ctx.venueRole === null) {
    await recordAuditLog({
      actorType: 'ADMIN',
      actorId: actor.userId,
      action: 'VENUE_STAFF_REMOVED_BY_ADMIN',
      resourceType: 'venue',
      resourceId: venueId,
      metadata: { removedUserId: target.userId, role: target.role },
    });
  }
}
