import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { closeTestDatabase, resetTestDatabase } from '@/testing/db';
import {
  addVenueMember,
  createTestBooking,
  createTestFacility,
  createTestSport,
  createTestUser,
  createTestVenue,
} from '@/testing/factories';
import { createManualBooking } from './manual';

async function setUpVenueAndFacility() {
  const owner = await createTestUser('Owner');
  const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
  const sport = await createTestSport(`sport-${venue.id}`);
  const facility = await createTestFacility(venue.id, sport.id, { slotDurationMinutes: 60 });
  return { owner, venue, facility };
}

describe('createManualBooking (DB-backed)', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  it('lets a receptionist create a CONFIRMED walk-in booking with no customer account', async () => {
    const { venue, facility } = await setUpVenueAndFacility();
    const receptionist = await createTestUser('Receptionist');
    await addVenueMember(venue.id, receptionist.id, 'RECEPTIONIST');

    const booking = await createManualBooking(
      venue.id,
      { userId: receptionist.id, isPlatformAdmin: false },
      {
        facilityId: facility.id,
        startAt: new Date('2026-09-01T09:00:00.000Z'),
        durationMinutes: 60,
        customerName: 'Walk-in Customer',
        customerPhone: '+201000000000',
      },
    );

    expect(booking.status).toBe('CONFIRMED');
    expect(booking.source).toBe('MANUAL');
    expect(booking.customerId).toBeNull();
    expect(booking.customerName).toBe('Walk-in Customer');
    expect(booking.respondedAt).not.toBeNull();
  });

  it('refuses a stranger with no venue role', async () => {
    const { venue, facility } = await setUpVenueAndFacility();
    const stranger = await createTestUser('Stranger');

    await expect(
      createManualBooking(
        venue.id,
        { userId: stranger.id, isPlatformAdmin: false },
        {
          facilityId: facility.id,
          startAt: new Date('2026-09-01T09:00:00.000Z'),
          durationMinutes: 60,
          customerName: 'Nope',
        },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects a slot already CONFIRMED for another booking, same exclusion rule as marketplace bookings', async () => {
    const { owner, venue, facility } = await setUpVenueAndFacility();
    await createTestBooking(venue.id, facility.id, {
      status: 'CONFIRMED',
      startAt: new Date('2026-09-01T09:00:00.000Z'),
      endAt: new Date('2026-09-01T10:00:00.000Z'),
    });

    await expect(
      createManualBooking(
        venue.id,
        { userId: owner.id, isPlatformAdmin: false },
        {
          facilityId: facility.id,
          startAt: new Date('2026-09-01T09:00:00.000Z'),
          durationMinutes: 60,
          customerName: 'Second Try',
        },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('two simultaneous manual bookings for the same slot — exactly one is created', async () => {
    const { owner, venue, facility } = await setUpVenueAndFacility();

    const results = await Promise.allSettled([
      createManualBooking(
        venue.id,
        { userId: owner.id, isPlatformAdmin: false },
        {
          facilityId: facility.id,
          startAt: new Date('2026-09-02T09:00:00.000Z'),
          durationMinutes: 60,
          customerName: 'Racer A',
        },
      ),
      createManualBooking(
        venue.id,
        { userId: owner.id, isPlatformAdmin: false },
        {
          facilityId: facility.id,
          startAt: new Date('2026-09-02T09:00:00.000Z'),
          durationMinutes: 60,
          customerName: 'Racer B',
        },
      ),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects a facility that is not active', async () => {
    const { owner, venue } = await setUpVenueAndFacility();
    const sport = await createTestSport(`sport-inactive-${venue.id}`);
    const inactiveFacility = await createTestFacility(venue.id, sport.id, { isActive: false });

    await expect(
      createManualBooking(
        venue.id,
        { userId: owner.id, isPlatformAdmin: false },
        {
          facilityId: inactiveFacility.id,
          startAt: new Date('2026-09-01T09:00:00.000Z'),
          durationMinutes: 60,
          customerName: 'Nope',
        },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
