/**
 * Read-only booking queries. Unlike the public venue queries, bookings are
 * never public — every function here takes an actor and enforces the same
 * authorization rules transition.ts does (RLS in
 * 0007_booking_domain_constraints_and_rls.sql is defense-in-depth for
 * direct access; getDb() itself does not go through it — see
 * docs/architecture/authorization.md).
 */
import { and, desc, eq, getTableColumns } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { bookings, facilities, venues, type Booking } from '@/lib/db/schema';
import type { BookingStatus } from '@/lib/config/constants';
import { DomainError } from '@/domain/errors';
import { isBookingOwner, isVenueStaffForBooking } from '@/domain/authz/booking';
import { resolveBookingAuthzContext, type BookingActor } from './authz-context';
import { recordAuditLog } from '@/domain/audit/log';

export async function getBookingById(bookingId: string, actor: BookingActor): Promise<Booking> {
  const db = getDb();
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!booking) {
    throw new DomainError('NOT_FOUND', 'Booking not found.');
  }

  const ctx = await resolveBookingAuthzContext(booking, actor);
  if (!isBookingOwner(ctx) && !isVenueStaffForBooking(ctx)) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to view this booking.');
  }

  // "View another customer's booking ✅ audited" (docs/architecture/authorization.md).
  // Only when access came purely from being an admin — the actual
  // customer or actual venue staff viewing it isn't logged here.
  if (ctx.isPlatformAdmin && !ctx.isOwningCustomer && ctx.venueRole === null) {
    await recordAuditLog({
      actorType: 'ADMIN',
      actorId: actor.userId,
      action: 'BOOKING_VIEWED_BY_ADMIN',
      resourceType: 'booking',
      resourceId: booking.id,
    });
  }

  return booking;
}

/** A customer's own booking history. `customerId` must match the caller
 * unless they're a platform admin. */
export async function listBookingsForCustomer(
  customerId: string,
  actor: BookingActor,
): Promise<Booking[]> {
  if (actor.userId !== customerId && !actor.isPlatformAdmin) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to view these bookings.');
  }
  const db = getDb();
  return db
    .select()
    .from(bookings)
    .where(eq(bookings.customerId, customerId))
    .orderBy(desc(bookings.startAt));
}

export interface BookingWithVenueDetails extends Booking {
  venueName: string;
  venueSlug: string;
  venueTimezone: string;
  facilityName: string;
}

/** Same as listBookingsForCustomer, joined with venue/facility names —
 * for a customer-facing list where "REQUESTED at 09:00" alone isn't
 * useful without knowing which facility. */
export async function listBookingsForCustomerWithDetails(
  customerId: string,
  actor: BookingActor,
): Promise<BookingWithVenueDetails[]> {
  if (actor.userId !== customerId && !actor.isPlatformAdmin) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to view these bookings.');
  }
  const db = getDb();
  return db
    .select({
      ...getTableColumns(bookings),
      venueName: venues.name,
      venueSlug: venues.slug,
      venueTimezone: venues.timezone,
      facilityName: facilities.name,
    })
    .from(bookings)
    .innerJoin(venues, eq(bookings.venueId, venues.id))
    .innerJoin(facilities, eq(bookings.facilityId, facilities.id))
    .where(eq(bookings.customerId, customerId))
    .orderBy(desc(bookings.startAt));
}

/** A venue's booking list (staff dashboard) — actor must be staff at this
 * venue or a platform admin. Optionally scoped to one status. */
export async function listBookingsForVenue(
  venueId: string,
  actor: BookingActor,
  filters: { status?: BookingStatus } = {},
): Promise<Booking[]> {
  const ctx = await resolveBookingAuthzContext({ venueId, customerId: null }, actor);
  if (!isVenueStaffForBooking(ctx)) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to view these bookings.');
  }
  const db = getDb();
  const conditions = [eq(bookings.venueId, venueId)];
  if (filters.status) conditions.push(eq(bookings.status, filters.status));
  return db
    .select()
    .from(bookings)
    .where(and(...conditions))
    .orderBy(desc(bookings.startAt));
}

export interface BookingWithFacilityName extends Booking {
  facilityName: string;
}

/** Same as listBookingsForVenue, joined with the facility name — the
 * staff dashboard needs "Football Pitch 1" on screen, not a bare UUID. */
export async function listBookingsForVenueWithDetails(
  venueId: string,
  actor: BookingActor,
  filters: { status?: BookingStatus } = {},
): Promise<BookingWithFacilityName[]> {
  const ctx = await resolveBookingAuthzContext({ venueId, customerId: null }, actor);
  if (!isVenueStaffForBooking(ctx)) {
    throw new DomainError('FORBIDDEN', 'You do not have permission to view these bookings.');
  }
  const db = getDb();
  const conditions = [eq(bookings.venueId, venueId)];
  if (filters.status) conditions.push(eq(bookings.status, filters.status));
  return db
    .select({ ...getTableColumns(bookings), facilityName: facilities.name })
    .from(bookings)
    .innerJoin(facilities, eq(bookings.facilityId, facilities.id))
    .where(and(...conditions))
    .orderBy(desc(bookings.startAt));
}
