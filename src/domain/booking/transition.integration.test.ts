import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, closeTestDatabase, resetTestDatabase } from '@/testing/db';
import {
  createTestBooking,
  createTestFacility,
  createTestSport,
  createTestUser,
  createTestVenue,
} from '@/testing/factories';
import { bookingEvents, bookings } from '@/lib/db/schema';
import { transitionBooking } from './transition';

const actorFor = (userId: string) => ({ userId, isPlatformAdmin: false });

async function setUpVenueAndFacility() {
  const owner = await createTestUser('Owner');
  const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
  const sport = await createTestSport(`sport-${venue.id}`);
  const facility = await createTestFacility(venue.id, sport.id, { slotDurationMinutes: 60 });
  return { owner, venue, facility };
}

/** A start time comfortably outside the 2-hour cancellation cutoff. */
const FAR_FUTURE_START = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const FAR_FUTURE_END = new Date(FAR_FUTURE_START.getTime() + 60 * 60 * 1000);
/** Inside the cutoff. */
const SOON_START = new Date(Date.now() + 60 * 60 * 1000);
const SOON_END = new Date(SOON_START.getTime() + 60 * 60 * 1000);

describe('transitionBooking (DB-backed)', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  it('lets venue staff confirm a REQUESTED booking', async () => {
    const { owner, venue, facility } = await setUpVenueAndFacility();
    const customer = await createTestUser('Customer');
    const booking = await createTestBooking(venue.id, facility.id, {
      customerId: customer.id,
      status: 'REQUESTED',
      startAt: FAR_FUTURE_START,
      endAt: FAR_FUTURE_END,
    });

    const updated = await transitionBooking({
      bookingId: booking.id,
      targetStatus: 'CONFIRMED',
      actor: actorFor(owner.id),
    });

    expect(updated.status).toBe('CONFIRMED');
    expect(updated.respondedAt).not.toBeNull();

    const events = await getTestDb()
      .select()
      .from(bookingEvents)
      .where(eq(bookingEvents.bookingId, booking.id));
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('BOOKING_CONFIRMED');
    expect(events[0].actorType).toBe('VENUE_USER');
  });

  it('refuses a stranger confirming someone else’s venue booking', async () => {
    const { venue, facility } = await setUpVenueAndFacility();
    const stranger = await createTestUser('Stranger');
    const booking = await createTestBooking(venue.id, facility.id, {
      status: 'REQUESTED',
      startAt: FAR_FUTURE_START,
      endAt: FAR_FUTURE_END,
    });

    await expect(
      transitionBooking({
        bookingId: booking.id,
        targetStatus: 'CONFIRMED',
        actor: actorFor(stranger.id),
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects a transition with no rule at all (CONFIRMED straight to REQUESTED)', async () => {
    const { owner, venue, facility } = await setUpVenueAndFacility();
    const booking = await createTestBooking(venue.id, facility.id, {
      status: 'CONFIRMED',
      startAt: FAR_FUTURE_START,
      endAt: FAR_FUTURE_END,
    });

    await expect(
      transitionBooking({
        bookingId: booking.id,
        targetStatus: 'REQUESTED',
        actor: actorFor(owner.id),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('requires a fixed reason to reject a request', async () => {
    const { owner, venue, facility } = await setUpVenueAndFacility();
    const booking = await createTestBooking(venue.id, facility.id, {
      status: 'REQUESTED',
      startAt: FAR_FUTURE_START,
      endAt: FAR_FUTURE_END,
    });

    await expect(
      transitionBooking({
        bookingId: booking.id,
        targetStatus: 'REJECTED',
        actor: actorFor(owner.id),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const rejected = await transitionBooking({
      bookingId: booking.id,
      targetStatus: 'REJECTED',
      actor: actorFor(owner.id),
      reason: 'DOUBLE_BOOKED',
    });
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.cancellationReason).toBe('DOUBLE_BOOKED');
  });

  it('blocks a customer cancelling within the 2-hour cutoff', async () => {
    const { venue, facility } = await setUpVenueAndFacility();
    const customer = await createTestUser('Customer');
    const booking = await createTestBooking(venue.id, facility.id, {
      customerId: customer.id,
      status: 'CONFIRMED',
      startAt: SOON_START,
      endAt: SOON_END,
    });

    await expect(
      transitionBooking({
        bookingId: booking.id,
        targetStatus: 'CANCELLED_BY_CUSTOMER',
        actor: actorFor(customer.id),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('lets a customer cancel a CONFIRMED booking outside the cutoff, recording the refund policy applied', async () => {
    const { venue, facility } = await setUpVenueAndFacility();
    const customer = await createTestUser('Customer');
    const booking = await createTestBooking(venue.id, facility.id, {
      customerId: customer.id,
      status: 'CONFIRMED',
      startAt: FAR_FUTURE_START,
      endAt: FAR_FUTURE_END,
    });

    const cancelled = await transitionBooking({
      bookingId: booking.id,
      targetStatus: 'CANCELLED_BY_CUSTOMER',
      actor: actorFor(customer.id),
    });
    expect(cancelled.status).toBe('CANCELLED_BY_CUSTOMER');

    const [event] = await getTestDb()
      .select()
      .from(bookingEvents)
      .where(eq(bookingEvents.bookingId, booking.id));
    expect(event.metadata).toMatchObject({ refundRateApplied: 0.5 });
  });

  it('rejects confirming a REQUESTED booking whose slot is already CONFIRMED for another booking', async () => {
    const { owner, venue, facility } = await setUpVenueAndFacility();
    await createTestBooking(venue.id, facility.id, {
      status: 'CONFIRMED',
      startAt: FAR_FUTURE_START,
      endAt: FAR_FUTURE_END,
    });
    const requested = await createTestBooking(venue.id, facility.id, {
      status: 'REQUESTED',
      startAt: FAR_FUTURE_START,
      endAt: FAR_FUTURE_END,
    });

    await expect(
      transitionBooking({
        bookingId: requested.id,
        targetStatus: 'CONFIRMED',
        actor: actorFor(owner.id),
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('the optimistic-concurrency guard: two simultaneous transitions off the same REQUESTED booking — exactly one wins', async () => {
    const { owner, venue, facility } = await setUpVenueAndFacility();
    const booking = await createTestBooking(venue.id, facility.id, {
      status: 'REQUESTED',
      startAt: FAR_FUTURE_START,
      endAt: FAR_FUTURE_END,
    });

    const results = await Promise.allSettled([
      transitionBooking({
        bookingId: booking.id,
        targetStatus: 'CONFIRMED',
        actor: actorFor(owner.id),
      }),
      transitionBooking({
        bookingId: booking.id,
        targetStatus: 'REJECTED',
        actor: actorFor(owner.id),
        reason: 'OTHER',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // The loser's *exact* error depends on exactly when its SELECT lands
    // relative to the winner's UPDATE: CONFLICT if it read the row before
    // the winner committed and then lost the WHERE-guarded UPDATE;
    // INVALID_TRANSITION if it read the row after (the winner's new
    // status has no REJECTED/CONFIRMED rule from it). Either is proof the
    // guard did its job — the one invariant that actually matters is
    // "not both requests won," asserted above.
    const loserCode = (rejected[0] as PromiseRejectedResult).reason.code;
    expect(['CONFLICT', 'INVALID_TRANSITION']).toContain(loserCode);
  });

  it('THE critical test: simultaneous confirmation of two overlapping REQUESTED bookings — exactly one becomes CONFIRMED, never both', async () => {
    const { owner, venue, facility } = await setUpVenueAndFacility();
    const customerA = await createTestUser('Racer A');
    const customerB = await createTestUser('Racer B');
    const bookingA = await createTestBooking(venue.id, facility.id, {
      customerId: customerA.id,
      status: 'REQUESTED',
      startAt: FAR_FUTURE_START,
      endAt: FAR_FUTURE_END,
    });
    const bookingB = await createTestBooking(venue.id, facility.id, {
      customerId: customerB.id,
      status: 'REQUESTED',
      // Overlapping, not identical — proves the exclusion constraint catches
      // real range overlap, not just same-row races.
      startAt: new Date(FAR_FUTURE_START.getTime() + 30 * 60_000),
      endAt: new Date(FAR_FUTURE_END.getTime() + 30 * 60_000),
    });

    const results = await Promise.allSettled([
      transitionBooking({
        bookingId: bookingA.id,
        targetStatus: 'CONFIRMED',
        actor: actorFor(owner.id),
      }),
      transitionBooking({
        bookingId: bookingB.id,
        targetStatus: 'CONFIRMED',
        actor: actorFor(owner.id),
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
      Awaited<ReturnType<typeof transitionBooking>>
    >[];
    const rejected = results.filter((r) => r.status === 'rejected');

    // The single non-negotiable invariant of the whole product: never two
    // CONFIRMED overlapping bookings for the same facility.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'CONFLICT' });

    const db = getTestDb();
    const confirmedRows = await db.select().from(bookings).where(eq(bookings.venueId, venue.id));
    const confirmedCount = confirmedRows.filter((b) => b.status === 'CONFIRMED').length;
    expect(confirmedCount).toBe(1);
    expect(confirmedRows.find((b) => b.status === 'CONFIRMED')?.id).toBe(fulfilled[0].value.id);
  });
});
