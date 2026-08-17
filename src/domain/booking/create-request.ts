/**
 * The customer-facing entry point: "I'd like to book this facility at this
 * time." Creates a REQUESTED/MARKETPLACE booking — it does not guarantee
 * the slot (only a CONFIRMED booking, enforced by the DB exclusion
 * constraint, does that). See docs/product/booking-flow.md.
 *
 * Payment authorization (the "hold placed, not yet charged" step in the
 * flow diagram) is not implemented here — payments are their own
 * dedicated phase (ADR-007). This service creates the booking row only.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { bookingEvents, bookings, facilities, venues, type Booking } from '@/lib/db/schema';
import { isUniqueViolation } from '@/lib/db/errors';
import { DomainError } from '@/domain/errors';
import { BOOKING_REQUEST_EXPIRY_MINUTES } from '@/lib/config/constants';
import { todayInTimeZone, addLocalDays } from '@/domain/availability/time';
import { getAvailableSlots } from '@/domain/availability/queries';
import { computeBookingPricing } from './pricing';
import { generateBookingReference } from './reference';
import {
  createBookingRequestSchema,
  type CreateBookingRequestInput,
} from '@/lib/validation/booking';
import type { BookingActor } from './authz-context';

const MAX_REFERENCE_ATTEMPTS = 5;

/** Verifies every slot the requested span covers is actually available,
 * by asking the availability engine (the same one the booking UI reads)
 * for both the local day the span starts on and the next one, since a
 * multi-slot booking can cross local midnight on a wrapping schedule. */
async function assertSpanIsAvailable(
  facilityId: string,
  timeZone: string,
  startAt: Date,
  endAt: Date,
  slotDurationMinutes: number,
): Promise<void> {
  const startDate = todayInTimeZone(timeZone, startAt);
  const [todaySlots, nextDaySlots] = await Promise.all([
    getAvailableSlots(facilityId, startDate),
    getAvailableSlots(facilityId, addLocalDays(startDate, 1)),
  ]);
  const availableStarts = new Set(
    [...todaySlots, ...nextDaySlots].filter((s) => s.available).map((s) => s.startAt.getTime()),
  );

  const slotMs = slotDurationMinutes * 60_000;
  for (let cursor = startAt.getTime(); cursor < endAt.getTime(); cursor += slotMs) {
    if (!availableStarts.has(cursor)) {
      throw new DomainError(
        'CONFLICT',
        'This time is no longer available. Please choose another slot.',
      );
    }
  }
}

export async function createBookingRequest(
  actor: BookingActor,
  rawInput: CreateBookingRequestInput,
): Promise<Booking> {
  if (!actor.userId) {
    throw new DomainError('FORBIDDEN', 'Sign in to request a booking.');
  }

  const parsed = createBookingRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new DomainError(
      'VALIDATION_FAILED',
      parsed.error.issues[0]?.message ?? 'Invalid booking input.',
    );
  }
  const input = parsed.data;

  const db = getDb();

  // Idempotent replay: a client retrying a submit (network blip, double
  // click) gets the booking it already created back, never a duplicate.
  if (input.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.customerId, actor.userId),
          eq(bookings.idempotencyKey, input.idempotencyKey),
        ),
      );
    if (existing) return existing;
  }

  const [facility] = await db.select().from(facilities).where(eq(facilities.id, input.facilityId));
  if (!facility || !facility.isActive) {
    throw new DomainError('NOT_FOUND', 'Facility not found.');
  }

  const [venue] = await db.select().from(venues).where(eq(venues.id, facility.venueId));
  if (!venue || venue.status !== 'ACTIVE') {
    throw new DomainError('NOT_FOUND', 'Venue not found.');
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

  await assertSpanIsAvailable(
    facility.id,
    venue.timezone,
    input.startAt,
    endAt,
    facility.slotDurationMinutes,
  );

  const pricing = computeBookingPricing(facility.basePriceMinor, input.durationMinutes);
  const requestedAt = new Date();
  const expiresAt = new Date(requestedAt.getTime() + BOOKING_REQUEST_EXPIRY_MINUTES * 60_000);

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS; attempt++) {
    try {
      const [booking] = await db
        .insert(bookings)
        .values({
          reference: generateBookingReference(),
          venueId: venue.id,
          facilityId: facility.id,
          customerId: actor.userId,
          status: 'REQUESTED',
          source: 'MARKETPLACE',
          startAt: input.startAt,
          endAt,
          requestedAt,
          expiresAt,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerNote: input.customerNote,
          subtotalMinor: pricing.subtotalMinor,
          platformFeeMinor: pricing.platformFeeMinor,
          totalMinor: pricing.totalMinor,
          currency: facility.currency,
          idempotencyKey: input.idempotencyKey,
          createdBy: actor.userId,
        })
        .returning();

      await db.insert(bookingEvents).values({
        bookingId: booking.id,
        eventType: 'BOOKING_REQUESTED',
        actorType: 'CUSTOMER',
        actorId: actor.userId,
      });

      return booking;
    } catch (err) {
      lastError = err;
      if (isUniqueViolation(err, 'bookings_reference_unique')) continue; // astronomically rare — retry with a new reference
      if (isUniqueViolation(err, 'bookings_customer_id_idempotency_key_key')) {
        // Lost a race against our own replay check above — fetch and return it.
        if (input.idempotencyKey) {
          const [existing] = await db
            .select()
            .from(bookings)
            .where(
              and(
                eq(bookings.customerId, actor.userId),
                eq(bookings.idempotencyKey, input.idempotencyKey),
              ),
            );
          if (existing) return existing;
        }
      }
      throw err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Could not generate a unique booking reference.');
}
