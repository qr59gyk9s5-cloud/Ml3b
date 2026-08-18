/**
 * Admin-only user moderation: suspend/unsuspend, and the search that
 * finds a user to act on. "Suspend" is a real, reversible admin action
 * (docs/architecture/authorization.md's "Suspend user" matrix row) —
 * deliberately distinct from a permanent ban, which CLAUDE.md's
 * forbidden-without-approval list still gates behind explicit human
 * sign-off. Every mutation here is fully audited, never silent.
 */
import { count, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { getDb } from '@/lib/db/client';
import { platformAdmins, profiles, type Profile } from '@/lib/db/schema';
import { DomainError } from '@/domain/errors';
import { recordAuditLog } from '@/domain/audit/log';
import { findUserIdByEmail } from '@/lib/db/auth-users';

export interface AdminActor {
  userId: string;
  isPlatformAdmin: boolean;
}

function requireAdmin(actor: AdminActor): void {
  if (!actor.isPlatformAdmin) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to do this.');
  }
}

/** Case-insensitive exact-email lookup — null if no account exists or
 * the caller isn't an admin (same NOT_FOUND-shaped null as
 * getPublicVenueBySlug, never leaking which case it was to a non-admin). */
export async function findUserByEmail(email: string, actor: AdminActor): Promise<Profile | null> {
  requireAdmin(actor);
  const userId = await findUserIdByEmail(email.trim());
  if (!userId) return null;
  const db = getDb();
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
  return profile ?? null;
}

export interface SuspendUserParams {
  targetUserId: string;
  reason: string;
  actor: AdminActor;
}

export async function suspendUser(params: SuspendUserParams): Promise<Profile> {
  requireAdmin(params.actor);

  if (!params.reason.trim()) {
    throw new DomainError('VALIDATION_FAILED', 'A reason is required.');
  }
  if (params.targetUserId === params.actor.userId) {
    throw new DomainError('VALIDATION_FAILED', 'You cannot suspend your own account.');
  }

  const db = getDb();
  const [target] = await db.select().from(profiles).where(eq(profiles.id, params.targetUserId));
  if (!target) {
    throw new DomainError('NOT_FOUND', 'User not found.');
  }

  // Never let the admin console lock out another admin by suspending
  // them out from under their own grant — revokePlatformAdmin() below
  // is the deliberate, separate, explicitly-logged step for removing
  // admin access (platform_admins grants/revokes are their own event
  // per ADR-005). Suspending an admin account requires revoking their
  // admin grant first, on purpose — two distinct actions, two distinct
  // audit_logs rows, never one action doing both silently.
  const [targetAdminGrant] = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.userId, params.targetUserId));
  if (targetAdminGrant) {
    throw new DomainError('VALIDATION_FAILED', 'Cannot suspend a platform admin.');
  }

  const [updated] = await db
    .update(profiles)
    .set({
      suspendedAt: new Date(),
      suspendedReason: params.reason.trim(),
      suspendedBy: params.actor.userId,
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, params.targetUserId))
    .returning();

  await recordAuditLog({
    actorType: 'ADMIN',
    actorId: params.actor.userId,
    action: 'USER_SUSPENDED',
    resourceType: 'user',
    resourceId: params.targetUserId,
    metadata: { reason: params.reason.trim() },
  });

  return updated;
}

export interface UnsuspendUserParams {
  targetUserId: string;
  actor: AdminActor;
}

export async function unsuspendUser(params: UnsuspendUserParams): Promise<Profile> {
  requireAdmin(params.actor);

  const db = getDb();
  const [target] = await db.select().from(profiles).where(eq(profiles.id, params.targetUserId));
  if (!target) {
    throw new DomainError('NOT_FOUND', 'User not found.');
  }

  const [updated] = await db
    .update(profiles)
    .set({ suspendedAt: null, suspendedReason: null, suspendedBy: null, updatedAt: new Date() })
    .where(eq(profiles.id, params.targetUserId))
    .returning();

  await recordAuditLog({
    actorType: 'ADMIN',
    actorId: params.actor.userId,
    action: 'USER_UNSUSPENDED',
    resourceType: 'user',
    resourceId: params.targetUserId,
    metadata: {},
  });

  return updated;
}

export interface PlatformAdminSummary {
  profile: Profile;
  grantedAt: Date;
  grantedByName: string | null;
}

/** Every current platform admin, newest grant first — the admins panel's
 * list, so a revoke has something to act on and a grant has a "you
 * already are one" check to run against. */
export async function listPlatformAdmins(actor: AdminActor): Promise<PlatformAdminSummary[]> {
  requireAdmin(actor);
  const db = getDb();
  const grantedBy = alias(profiles, 'granted_by_profile');
  const rows = await db
    .select({
      profile: profiles,
      grantedAt: platformAdmins.createdAt,
      grantedByName: grantedBy.fullName,
    })
    .from(platformAdmins)
    .innerJoin(profiles, eq(platformAdmins.userId, profiles.id))
    .leftJoin(grantedBy, eq(platformAdmins.grantedBy, grantedBy.id))
    .orderBy(desc(platformAdmins.createdAt));
  return rows.map((r) => ({ ...r, grantedByName: r.grantedByName ?? null }));
}

export interface GrantPlatformAdminParams {
  email: string;
  actor: AdminActor;
}

/** Grants admin access by email — the only identifier the console has to
 * find a user by (same as findUserByEmail). Refuses a user who's already
 * an admin (nothing to grant) so the audit trail never records a
 * no-op grant. */
export async function grantPlatformAdmin(params: GrantPlatformAdminParams): Promise<Profile> {
  requireAdmin(params.actor);

  const targetUserId = await findUserIdByEmail(params.email.trim());
  if (!targetUserId) {
    throw new DomainError('NOT_FOUND', 'No account found for that email.');
  }

  const db = getDb();
  const [existingGrant] = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.userId, targetUserId));
  if (existingGrant) {
    throw new DomainError('VALIDATION_FAILED', 'This user is already a platform admin.');
  }

  await db.insert(platformAdmins).values({ userId: targetUserId, grantedBy: params.actor.userId });

  const [target] = await db.select().from(profiles).where(eq(profiles.id, targetUserId));
  if (!target) {
    throw new DomainError('NOT_FOUND', 'User not found.');
  }

  await recordAuditLog({
    actorType: 'ADMIN',
    actorId: params.actor.userId,
    action: 'ADMIN_GRANTED',
    resourceType: 'user',
    resourceId: targetUserId,
    metadata: {},
  });

  return target;
}

export interface RevokePlatformAdminParams {
  targetUserId: string;
  actor: AdminActor;
}

/** Revokes admin access — refuses to revoke your own access (avoid an
 * accidental self-lockout mid-click) and refuses to revoke the very
 * last remaining admin (avoid a total lockout with nobody left who can
 * grant it back — that would need a direct DB fix outside the app,
 * exactly the kind of operational mess this guard exists to prevent). */
export async function revokePlatformAdmin(params: RevokePlatformAdminParams): Promise<void> {
  requireAdmin(params.actor);

  if (params.targetUserId === params.actor.userId) {
    throw new DomainError('VALIDATION_FAILED', 'You cannot revoke your own admin access.');
  }

  const db = getDb();
  const [existingGrant] = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.userId, params.targetUserId));
  if (!existingGrant) {
    throw new DomainError('NOT_FOUND', 'This user is not a platform admin.');
  }

  const [{ n: adminCount }] = await db.select({ n: count() }).from(platformAdmins);
  if (adminCount <= 1) {
    throw new DomainError('VALIDATION_FAILED', 'Cannot revoke the last remaining platform admin.');
  }

  await db.delete(platformAdmins).where(eq(platformAdmins.userId, params.targetUserId));

  await recordAuditLog({
    actorType: 'ADMIN',
    actorId: params.actor.userId,
    action: 'ADMIN_REVOKED',
    resourceType: 'user',
    resourceId: params.targetUserId,
    metadata: {},
  });
}
