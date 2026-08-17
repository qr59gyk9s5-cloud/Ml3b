/**
 * The venue lifecycle state machine. Exactly one place venue.status is
 * ever written — see CLAUDE.md's "all state transitions go through one
 * domain service" rule, applied here the same way it applies to bookings.
 *
 * DRAFT -> PENDING_REVIEW -> ACTIVE <-> SUSPENDED
 *   \             \            \____________\___> ARCHIVED (terminal)
 *    \_____________\________________________/
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { venues, type Venue } from '@/lib/db/schema';
import type { VenueStatus } from '@/lib/config/constants';
import { DomainError } from '@/domain/errors';
import {
  isPlatformAdmin,
  isVenueOwner,
  isVenueOwnerOrManager,
  type VenueAuthzContext,
} from '@/domain/authz/venue';
import { resolveVenueAuthzContext, type VenueActor } from './authz-context';
import { recordAuditLog } from '@/domain/audit/log';

/** Admin moderation actions worth a mandatory reason — mirrors
 * src/domain/booking/transition.ts's REASON_REQUIRED_TARGETS. Approving
 * or reactivating isn't a "why" moment worth mandating; suspending one
 * is. */
const REASON_REQUIRED_TARGETS: ReadonlySet<VenueStatus> = new Set(['SUSPENDED']);

interface TransitionRule {
  from: VenueStatus;
  to: VenueStatus;
  allow: (ctx: VenueAuthzContext) => boolean;
}

/** The complete, explicit transition table — see docs/architecture/database.md.
 * Anything not listed here is illegal, including moving out of ARCHIVED. */
const TRANSITIONS: TransitionRule[] = [
  { from: 'DRAFT', to: 'PENDING_REVIEW', allow: isVenueOwnerOrManager },
  {
    from: 'PENDING_REVIEW',
    to: 'DRAFT',
    allow: (ctx) => isVenueOwnerOrManager(ctx) || isPlatformAdmin(ctx),
  },
  { from: 'PENDING_REVIEW', to: 'ACTIVE', allow: isPlatformAdmin },
  { from: 'ACTIVE', to: 'SUSPENDED', allow: isPlatformAdmin },
  { from: 'SUSPENDED', to: 'ACTIVE', allow: isPlatformAdmin },
  { from: 'DRAFT', to: 'ARCHIVED', allow: (ctx) => isVenueOwner(ctx) || isPlatformAdmin(ctx) },
  {
    from: 'PENDING_REVIEW',
    to: 'ARCHIVED',
    allow: (ctx) => isVenueOwner(ctx) || isPlatformAdmin(ctx),
  },
  { from: 'ACTIVE', to: 'ARCHIVED', allow: (ctx) => isVenueOwner(ctx) || isPlatformAdmin(ctx) },
  { from: 'SUSPENDED', to: 'ARCHIVED', allow: isPlatformAdmin },
];

export function findVenueTransitionRule(
  from: VenueStatus,
  to: VenueStatus,
): TransitionRule | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to);
}

/** Pure check — no DB access. Used by the service below and directly by
 * unit tests. */
export function canTransitionVenue(
  ctx: VenueAuthzContext,
  from: VenueStatus,
  to: VenueStatus,
): boolean {
  const rule = findVenueTransitionRule(from, to);
  return rule !== undefined && rule.allow(ctx);
}

export interface TransitionVenueParams {
  venueId: string;
  targetStatus: VenueStatus;
  actor: VenueActor;
  /** Required when suspending (moderation, not a fixed vocabulary —
   * unlike booking cancellation reasons, there's no small closed set of
   * "why we suspended a venue"). Recorded on audit_logs for every
   * admin-performed transition, mandatory or not. */
  reason?: string;
}

/**
 * The only function allowed to write venues.status. Re-fetches the
 * venue and the actor's membership fresh on every call — never trust a
 * status or role the caller merely claims.
 */
export async function transitionVenueStatus(params: TransitionVenueParams): Promise<Venue> {
  const db = getDb();

  const [venue] = await db.select().from(venues).where(eq(venues.id, params.venueId));
  if (!venue) {
    throw new DomainError('NOT_FOUND', 'Venue not found.');
  }

  const ctx = await resolveVenueAuthzContext(params.venueId, params.actor);

  if (ctx.isSuspended && !ctx.isPlatformAdmin) {
    throw new DomainError('FORBIDDEN', 'Your account has been suspended.');
  }

  const rule = findVenueTransitionRule(venue.status, params.targetStatus);
  if (!rule) {
    throw new DomainError(
      'INVALID_TRANSITION',
      `A venue cannot move from ${venue.status} to ${params.targetStatus}.`,
    );
  }
  if (!rule.allow(ctx)) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to make this change.');
  }

  if (REASON_REQUIRED_TARGETS.has(params.targetStatus) && !params.reason?.trim()) {
    throw new DomainError('VALIDATION_FAILED', 'A reason is required.');
  }

  const [updated] = await db
    .update(venues)
    .set({ status: params.targetStatus, updatedAt: new Date() })
    .where(eq(venues.id, params.venueId))
    .returning();

  // Every admin-performed moderation action is audited — "Approve/
  // moderate/suspend venue" (docs/architecture/authorization.md). Not
  // logged for an owner/manager's own routine DRAFT->PENDING_REVIEW etc.
  if (params.actor.isPlatformAdmin) {
    await recordAuditLog({
      actorType: 'ADMIN',
      actorId: params.actor.userId,
      action: `VENUE_${params.targetStatus}`,
      resourceType: 'venue',
      resourceId: venue.id,
      metadata: { from: venue.status, to: params.targetStatus, reason: params.reason ?? null },
    });
  }

  return updated;
}
