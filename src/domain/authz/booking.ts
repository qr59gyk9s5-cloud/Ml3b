/**
 * Server-side booking authorization — the actual source of truth (RLS in
 * 0007_booking_domain_constraints_and_rls.sql is defense-in-depth). Pure
 * functions over an already-resolved context, same shape as
 * src/domain/authz/venue.ts.
 */
import type { VenueRole } from '@/lib/config/constants';

export interface BookingAuthzContext {
  /** Is this actor the customer this specific booking belongs to? */
  isOwningCustomer: boolean;
  /** This actor's role at the booking's venue, or null if not a member. */
  venueRole: VenueRole | null;
  isPlatformAdmin: boolean;
  /** True only for background-job/system-initiated calls (e.g. expiry). */
  isSystem: boolean;
}

export function isBookingOwner(ctx: BookingAuthzContext): boolean {
  return ctx.isOwningCustomer || ctx.isPlatformAdmin;
}

export function isVenueStaffForBooking(ctx: BookingAuthzContext): boolean {
  return ctx.venueRole !== null || ctx.isPlatformAdmin;
}

export function isPlatformAdminCtx(ctx: BookingAuthzContext): boolean {
  return ctx.isPlatformAdmin;
}

export function isSystemActor(ctx: BookingAuthzContext): boolean {
  return ctx.isSystem || ctx.isPlatformAdmin;
}
