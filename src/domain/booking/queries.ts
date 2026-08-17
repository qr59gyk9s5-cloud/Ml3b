/**
 * Read-only booking queries. Unlike the public venue queries, bookings are
 * never public — every function here takes an actor and enforces the same
 * authorization rules transition.ts does (RLS in
 * 0007_booking_domain_constraints_and_rls.sql is defense-in-depth for
 * direct access; getDb() itself does not go through it — see
 * docs/architecture/authorization.md).
 */
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { bookings, type Booking } from '@/lib/db/schema';
import type { BookingStatus } from '@/lib/config/constants';
import { DomainError } from '@/domain/errors';
import { isBookingOwner, isVenueStaffForBooking } from '@/domain/authz/booking';
import { resolveBookingAuthzContext, type BookingActor } from './authz-context';

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
