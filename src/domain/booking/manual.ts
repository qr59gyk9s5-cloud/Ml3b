/**
 * Venue-staff-entered bookings — a walk-in or phone booking with no
 * marketplace customer account (customer_id null, name/phone plain
 * fields). Created straight to CONFIRMED, source=MANUAL. Same table, same
 * exclusion constraint as marketplace bookings — see
 * docs/product/booking-flow.md#manual-bookings.
 */
import { and, eq, gt, lt } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { bookingEvents, bookings, facilities, venues, type Booking } from '@/lib/db/schema';
import { isExclusionViolation, isUniqueViolation } from '@/lib/db/errors';
import { DomainError } from '@/domain/errors';
import { isVenueStaff } from '@/domain/authz/venue';
import { resolveVenueAuthzContext, type VenueActor } from '@/domain/venue/authz-context';
import { computeBookingPricing } from './pricing';
import { generateBookingReference } from './reference';
import { createManualBookingSchema, type CreateManualBookingInput } from '@/lib/validation/booking';

const MAX_REFERENCE_ATTEMPTS = 5;

export async function createManualBooking(
  venueId: string,
  actor: VenueActor,
  rawInput: CreateManualBookingInput,
): Promise<Booking> {
  const db = getDb();

  const [venue] = await db.select().from(venues).where(eq(venues.id, venueId));
  if (!venue) {
    throw new DomainError('NOT_FOUND', 'Venue not found.');
  }

  const ctx = await resolveVenueAuthzContext(venueId, actor);
  if (!isVenueStaff(ctx)) {
    throw new DomainError('FORBIDDEN', 'Only venue staff can create a manual booking.');
  }

  const parsed = createManualBookingSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new DomainError(
      'VALIDATION_FAILED',
      parsed.error.issues[0]?.message ?? 'Invalid booking input.',
    );
  }
  const input = parsed.data;

  const [facility] = await db.select().from(facilities).where(eq(facilities.id, input.facilityId));
  if (!facility || facility.venueId !== venueId) {
    throw new DomainError('NOT_FOUND', 'Facility not found.');
  }
  if (!facility.isActive) {
    throw new DomainError('VALIDATION_FAILED', 'This facility is not accepting bookings.');
  }

  if (input.durationMinutes % facility.slotDurationMinutes !== 0) {
    throw new DomainError(
      'VALIDATION_FAILED',
      `Duration must be a whole number of ${facility.slotDurationMinutes}-minute slots.`,
    );
  }
  if (
    input.durationMinutes < facility.minimumDurationMinutes ||
    input.durationMinutes > facility.maximumDurationMinutes
  ) {
    throw new DomainError(
      'VALIDATION_FAILED',
      `Duration must be between ${facility.minimumDurationMinutes} and ${facility.maximumDurationMinutes} minutes.`,
    );
  }

  const endAt = new Date(input.startAt.getTime() + input.durationMinutes * 60_000);
  if (endAt <= input.startAt) {
    throw new DomainError('VALIDATION_FAILED', 'Invalid booking time.');
  }

  // Explicit pre-check — courtesy only; the exclusion constraint on the
  // insert below is the actual guarantee (docs/architecture/database.md#concurrency).
  const [conflict] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.facilityId, facility.id),
        eq(bookings.status, 'CONFIRMED'),
        lt(bookings.startAt, endAt),
        gt(bookings.endAt, input.startAt),
      ),
    );
  if (conflict) {
    throw new DomainError('CONFLICT', 'This time is already booked.');
  }

  const pricing = computeBookingPricing(facility.basePriceMinor, input.durationMinutes);
  const now = new Date();

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
    try {
      const [booking] = await db
        .insert(bookings)
        .values({
          reference: generateBookingReference(),
          venueId,
          facilityId: facility.id,
          customerId: null,
          status: 'CONFIRMED',
          source: 'MANUAL',
          startAt: input.startAt,
          endAt,
          requestedAt: now,
          respondedAt: now,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerNote: input.customerNote,
          venuePrivateNote: input.venuePrivateNote,
          subtotalMinor: pricing.subtotalMinor,
          platformFeeMinor: pricing.platformFeeMinor,
          totalMinor: pricing.totalMinor,
          currency: facility.currency,
          createdBy: actor.userId,
        })
        .returning();

      await db.insert(bookingEvents).values({
        bookingId: booking.id,
        eventType: 'BOOKING_CONFIRMED',
        actorType: actor.isPlatformAdmin ? 'ADMIN' : 'VENUE_USER',
        actorId: actor.userId,
        metadata: { source: 'MANUAL' },
      });

      return booking;
    } catch (err) {
      if (isExclusionViolation(err)) {
        // Lost a race against a marketplace confirmation (or another
        // manual entry) for the same slot between the pre-check above and
        // this insert — the constraint is what actually caught it.
        throw new DomainError('CONFLICT', 'This time was just booked by someone else.');
      }
      if (isUniqueViolation(err, 'bookings_reference_unique')) {
        lastError = err;
        continue; // astronomically rare — retry with a new reference
      }
      throw err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Could not generate a unique booking reference.');
}
