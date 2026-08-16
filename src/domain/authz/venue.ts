/**
 * Server-side venue authorization — the actual source of truth. RLS
 * (supabase/migrations/0001_identity_auth_and_rls.sql) is defense-in-depth
 * for direct/client access; every domain service still checks here before
 * writing anything, regardless of what RLS would have allowed. See
 * docs/architecture/authorization.md.
 *
 * These are pure functions over an already-resolved context — domain
 * services do the DB lookup (who is this user, what's their role at this
 * venue) and pass the result in, which keeps authorization logic testable
 * without a database.
 */
import type { VenueRole } from '@/lib/config/constants';

export interface VenueAuthzContext {
  userId: string | null;
  isPlatformAdmin: boolean;
  /** This actor's role at the specific venue in question, or null if
   * they're not a member of it. Never infer this from a role at a
   * *different* venue. */
  venueRole: VenueRole | null;
}

export function isPlatformAdmin(ctx: VenueAuthzContext): boolean {
  return ctx.isPlatformAdmin;
}

export function isVenueOwner(ctx: VenueAuthzContext): boolean {
  return ctx.isPlatformAdmin || ctx.venueRole === 'OWNER';
}

export function isVenueOwnerOrManager(ctx: VenueAuthzContext): boolean {
  return ctx.isPlatformAdmin || ctx.venueRole === 'OWNER' || ctx.venueRole === 'MANAGER';
}

export function isVenueStaff(ctx: VenueAuthzContext): boolean {
  return ctx.isPlatformAdmin || ctx.venueRole !== null;
}

/** Can this actor manage venue staff (invite/remove)? Mirrors
 * venue_members RLS: OWNER or admin. A MANAGER may only remove a
 * RECEPTIONIST, checked separately by canRemoveVenueMember since it
 * depends on the *target's* role too. */
export function canManageVenueStaff(ctx: VenueAuthzContext): boolean {
  return isPlatformAdmin(ctx) || ctx.venueRole === 'OWNER';
}

export function canRemoveVenueMember(ctx: VenueAuthzContext, targetRole: VenueRole): boolean {
  if (isPlatformAdmin(ctx)) return true;
  if (ctx.venueRole === 'OWNER') return true;
  if (ctx.venueRole === 'MANAGER') return targetRole === 'RECEPTIONIST';
  return false;
}
