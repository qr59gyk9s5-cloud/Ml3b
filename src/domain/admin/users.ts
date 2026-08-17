/**
 * Admin-only user moderation: suspend/unsuspend, and the search that
 * finds a user to act on. "Suspend" is a real, reversible admin action
 * (docs/architecture/authorization.md's "Suspend user" matrix row) —
 * deliberately distinct from a permanent ban, which CLAUDE.md's
 * forbidden-without-approval list still gates behind explicit human
 * sign-off. Every mutation here is fully audited, never silent.
 */
import { eq } from 'drizzle-orm';
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

  // Never let the admin console lock out another admin — a genuine
  // "revoke admin access" flow is a separate, deliberately-not-built
  // capability (platform_admins grants/revokes are their own event per
  // ADR-005; nothing in Phase 11 asked for a revoke UI). Suspending an
  // admin account first requires revoking their admin grant directly.
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
