import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { closeTestDatabase, resetTestDatabase } from '@/testing/db';
import {
  createTestAvailabilityRule,
  createTestBooking,
  createTestFacility,
  createTestSport,
  createTestUser,
  createTestVenue,
  suspendTestUser,
} from '@/testing/factories';
import { createBookingRequest } from './create-request';

async function setUpBookableFacility() {
  const owner = await createTestUser('Owner');
  const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
  const sport = await createTestSport(`sport-${venue.id}`);
  const facility = await createTestFacility(venue.id, sport.id, {
    slotDurationMinutes: 60,
    basePriceMinor: 50000,
  });
  // Sunday 08:00-20:00 Cairo — 2026-08-16 is a Sunday.
  await createTestAvailabilityRule(facility.id, {
    dayOfWeek: 0,
    startTime: '08:00',
    endTime: '20:00',
  });
  return { owner, venue, facility };
}

describe('createBookingRequest (DB-backed)', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  it('creates a REQUESTED booking priced from the facility rate, with an expiry', async () => {
    const { facility } = await setUpBookableFacility();
    const customer = await createTestUser('Customer');

    const booking = await createBookingRequest(
      { userId: customer.id, isPlatformAdmin: false },
      {
        facilityId: facility.id,
        startAt: new Date('2026-08-16T09:00:00.000Z'), // 11:00 Cairo, inside the rule
        durationMinutes: 60,
      },
    );

    expect(booking.status).toBe('REQUESTED');
    expect(booking.source).toBe('MARKETPLACE');
    expect(booking.customerId).toBe(customer.id);
    expect(booking.subtotalMinor).toBe(50000);
    expect(booking.totalMinor).toBe(50000);
    expect(booking.reference).toMatch(/^BK-/);
    expect(booking.expiresAt).not.toBeNull();
    expect(booking.expiresAt!.getTime() - booking.requestedAt.getTime()).toBe(30 * 60_000);
  });

  it('prices a 2-slot booking at double the hourly rate', async () => {
    const { facility } = await setUpBookableFacility();
    const customer = await createTestUser('Customer');

    const booking = await createBookingRequest(
      { userId: customer.id, isPlatformAdmin: false },
      {
        facilityId: facility.id,
        startAt: new Date('2026-08-16T09:00:00.000Z'),
        durationMinutes: 120,
      },
    );

    expect(booking.subtotalMinor).toBe(100000);
    expect(booking.endAt.toISOString()).toBe('2026-08-16T11:00:00.000Z');
  });

  it('refuses an unauthenticated actor', async () => {
    const { facility } = await setUpBookableFacility();
    await expect(
      createBookingRequest(
        { userId: null, isPlatformAdmin: false },
        {
          facilityId: facility.id,
          startAt: new Date('2026-08-16T09:00:00.000Z'),
          durationMinutes: 60,
        },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects a facility that does not exist', async () => {
    const customer = await createTestUser('Customer');
    await expect(
      createBookingRequest(
        { userId: customer.id, isPlatformAdmin: false },
        {
          facilityId: '00000000-0000-0000-0000-000000000000',
          startAt: new Date('2026-08-16T09:00:00.000Z'),
          durationMinutes: 60,
        },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a duration that is not a whole number of slots', async () => {
    const { facility } = await setUpBookableFacility();
    const customer = await createTestUser('Customer');
    await expect(
      createBookingRequest(
        { userId: customer.id, isPlatformAdmin: false },
        {
          facilityId: facility.id,
          startAt: new Date('2026-08-16T09:00:00.000Z'),
          durationMinutes: 45,
        },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects a duration outside the facility min/max', async () => {
    const { facility } = await setUpBookableFacility();
    const customer = await createTestUser('Customer');
    await expect(
      createBookingRequest(
        { userId: customer.id, isPlatformAdmin: false },
        {
          facilityId: facility.id,
          startAt: new Date('2026-08-16T09:00:00.000Z'),
          durationMinutes: 180,
        },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects a slot already covered by a CONFIRMED booking', async () => {
    const { venue, facility } = await setUpBookableFacility();
    const customer = await createTestUser('Customer');
    await createTestBooking(venue.id, facility.id, {
      status: 'CONFIRMED',
      startAt: new Date('2026-08-16T09:00:00.000Z'),
      endAt: new Date('2026-08-16T10:00:00.000Z'),
    });

    await expect(
      createBookingRequest(
        { userId: customer.id, isPlatformAdmin: false },
        {
          facilityId: facility.id,
          startAt: new Date('2026-08-16T09:00:00.000Z'),
          durationMinutes: 60,
        },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('allows overlapping REQUESTED bookings from different customers on the same slot', async () => {
    const { facility } = await setUpBookableFacility();
    const customerA = await createTestUser('Customer A');
    const customerB = await createTestUser('Customer B');
    const input = {
      facilityId: facility.id,
      startAt: new Date('2026-08-16T10:00:00.000Z'),
      durationMinutes: 60,
    };

    const bookingA = await createBookingRequest(
      { userId: customerA.id, isPlatformAdmin: false },
      input,
    );
    const bookingB = await createBookingRequest(
      { userId: customerB.id, isPlatformAdmin: false },
      input,
    );

    expect(bookingA.status).toBe('REQUESTED');
    expect(bookingB.status).toBe('REQUESTED');
    expect(bookingA.id).not.toBe(bookingB.id);
  });

  it('replays an existing booking instead of creating a duplicate on idempotency-key retry', async () => {
    const { facility } = await setUpBookableFacility();
    const customer = await createTestUser('Customer');
    const input = {
      facilityId: facility.id,
      startAt: new Date('2026-08-16T09:00:00.000Z'),
      durationMinutes: 60,
      idempotencyKey: 'retry-key-1',
    };

    const first = await createBookingRequest(
      { userId: customer.id, isPlatformAdmin: false },
      input,
    );
    const second = await createBookingRequest(
      { userId: customer.id, isPlatformAdmin: false },
      input,
    );

    expect(second.id).toBe(first.id);
  });

  it('refuses a suspended customer', async () => {
    const { facility } = await setUpBookableFacility();
    const customer = await createTestUser('Customer');
    await suspendTestUser(customer.id);

    await expect(
      createBookingRequest(
        { userId: customer.id, isPlatformAdmin: false },
        {
          facilityId: facility.id,
          startAt: new Date('2026-08-16T09:00:00.000Z'),
          durationMinutes: 60,
        },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
