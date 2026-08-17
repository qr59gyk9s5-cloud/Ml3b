import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, closeTestDatabase, resetTestDatabase } from '@/testing/db';
import {
  createTestBooking,
  createTestFacility,
  createTestSport,
  createTestUser,
  createTestVenue,
  suspendTestUser,
} from '@/testing/factories';
import { auditLogs, bookingEvents, bookings } from '@/lib/db/schema';
import { transitionBooking } from './transition';

const adminActorFor = (userId: string) => ({ userId, isPlatformAdmin: true });

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

  describe('admin override (Phase 11)', () => {
    it('an admin may reopen an EXPIRED booking to REQUESTED with a reason, resetting expiresAt', async () => {
      const { venue, facility } = await setUpVenueAndFacility();
      const admin = await createTestUser('Admin');
      const customer = await createTestUser('Customer');
      const booking = await createTestBooking(venue.id, facility.id, {
        customerId: customer.id,
        status: 'EXPIRED',
        startAt: FAR_FUTURE_START,
        endAt: FAR_FUTURE_END,
        expiresAt: new Date(Date.now() - 60_000), // already in the past
      });

      const updated = await transitionBooking({
        bookingId: booking.id,
        targetStatus: 'REQUESTED',
        actor: adminActorFor(admin.id),
        overrideReason: 'Expired due to a bug — reopening for the venue to respond.',
      });

      expect(updated.status).toBe('REQUESTED');
      expect(updated.expiresAt).not.toBeNull();
      expect(updated.expiresAt!.getTime()).toBeGreaterThan(Date.now());
      expect(updated.respondedAt).toBeNull();
    });

    it('refuses an admin override with no reason', async () => {
      const { venue, facility } = await setUpVenueAndFacility();
      const admin = await createTestUser('Admin');
      const booking = await createTestBooking(venue.id, facility.id, { status: 'REJECTED' });

      await expect(
        transitionBooking({
          bookingId: booking.id,
          targetStatus: 'REQUESTED',
          actor: adminActorFor(admin.id),
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('refuses a non-admin actor the same override edge', async () => {
      const { owner, venue, facility } = await setUpVenueAndFacility();
      const booking = await createTestBooking(venue.id, facility.id, { status: 'REJECTED' });

      await expect(
        transitionBooking({
          bookingId: booking.id,
          targetStatus: 'REQUESTED',
          actor: actorFor(owner.id),
          overrideReason: 'Trying anyway',
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('writes an audit_logs row for the override, distinct from booking_events', async () => {
      const { venue, facility } = await setUpVenueAndFacility();
      const admin = await createTestUser('Admin');
      const booking = await createTestBooking(venue.id, facility.id, { status: 'NO_SHOW' });

      await transitionBooking({
        bookingId: booking.id,
        targetStatus: 'COMPLETED',
        actor: adminActorFor(admin.id),
        overrideReason: 'Customer confirmed they did attend.',
      });

      const db = getTestDb();
      const [log] = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, booking.id));
      expect(log).toBeDefined();
      expect(log.action).toBe('BOOKING_OVERRIDE');
      expect(log.actorType).toBe('ADMIN');
      expect(log.actorId).toBe(admin.id);
      expect((log.metadata as { from: string; to: string }).from).toBe('NO_SHOW');
      expect((log.metadata as { from: string; to: string }).to).toBe('COMPLETED');

      const events = await db
        .select()
        .from(bookingEvents)
        .where(eq(bookingEvents.bookingId, booking.id));
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('BOOKING_COMPLETED');
    });

    it('a normal admin-as-venue-staff action (not an override) does not write to audit_logs', async () => {
      const { venue, facility } = await setUpVenueAndFacility();
      const admin = await createTestUser('Admin');
      const customer = await createTestUser('Customer');
      const booking = await createTestBooking(venue.id, facility.id, {
        customerId: customer.id,
        status: 'REQUESTED',
        startAt: FAR_FUTURE_START,
        endAt: FAR_FUTURE_END,
      });

      await transitionBooking({
        bookingId: booking.id,
        targetStatus: 'CONFIRMED',
        actor: adminActorFor(admin.id),
      });

      const db = getTestDb();
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, booking.id));
      expect(logs).toHaveLength(0);
    });
  });

  describe('suspended accounts', () => {
    it('blocks a suspended customer from cancelling their own booking', async () => {
      const { venue, facility } = await setUpVenueAndFacility();
      const customer = await createTestUser('Customer');
      await suspendTestUser(customer.id);
      const booking = await createTestBooking(venue.id, facility.id, {
        customerId: customer.id,
        status: 'REQUESTED',
        startAt: FAR_FUTURE_START,
        endAt: FAR_FUTURE_END,
      });

      await expect(
        transitionBooking({
          bookingId: booking.id,
          targetStatus: 'CANCELLED_BY_CUSTOMER',
          actor: actorFor(customer.id),
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('blocks a suspended venue owner from confirming a request', async () => {
      const { owner, venue, facility } = await setUpVenueAndFacility();
      await suspendTestUser(owner.id);
      const booking = await createTestBooking(venue.id, facility.id, { status: 'REQUESTED' });

      await expect(
        transitionBooking({
          bookingId: booking.id,
          targetStatus: 'CONFIRMED',
          actor: actorFor(owner.id),
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});
