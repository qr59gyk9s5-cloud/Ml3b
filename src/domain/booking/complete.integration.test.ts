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
import { bookings } from '@/lib/db/schema';
import { completePastBookings } from './complete';

async function setUpVenueAndFacility() {
  const owner = await createTestUser('Owner');
  const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
  const sport = await createTestSport(`sport-${venue.id}`);
  const facility = await createTestFacility(venue.id, sport.id, { slotDurationMinutes: 60 });
  return { owner, venue, facility };
}

describe('completePastBookings (DB-backed)', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  it('completes a CONFIRMED booking whose end_at has passed', async () => {
    const { venue, facility } = await setUpVenueAndFacility();
    const booking = await createTestBooking(venue.id, facility.id, {
      status: 'CONFIRMED',
      startAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      endAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    const result = await completePastBookings();

    expect(result.completedBookingIds).toContain(booking.id);
    const [updated] = await getTestDb().select().from(bookings).where(eq(bookings.id, booking.id));
    expect(updated.status).toBe('COMPLETED');
  });

  it('does not touch a CONFIRMED booking that has not ended yet', async () => {
    const { venue, facility } = await setUpVenueAndFacility();
    const booking = await createTestBooking(venue.id, facility.id, {
      status: 'CONFIRMED',
      startAt: new Date(Date.now() + 60 * 60 * 1000),
      endAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });

    const result = await completePastBookings();

    expect(result.completedBookingIds).not.toContain(booking.id);
    const [unchanged] = await getTestDb()
      .select()
      .from(bookings)
      .where(eq(bookings.id, booking.id));
    expect(unchanged.status).toBe('CONFIRMED');
  });

  it('does not touch a REQUESTED booking even if its would-be end_at has passed', async () => {
    const { venue, facility } = await setUpVenueAndFacility();
    const booking = await createTestBooking(venue.id, facility.id, {
      status: 'REQUESTED',
      startAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      endAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    const result = await completePastBookings();

    expect(result.completedBookingIds).not.toContain(booking.id);
    const [unchanged] = await getTestDb()
      .select()
      .from(bookings)
      .where(eq(bookings.id, booking.id));
    expect(unchanged.status).toBe('REQUESTED');
  });

  it('is idempotent — running it again after a clean sweep completes nothing new', async () => {
    const { venue, facility } = await setUpVenueAndFacility();
    await createTestBooking(venue.id, facility.id, {
      status: 'CONFIRMED',
      startAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      endAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    const first = await completePastBookings();
    expect(first.completedCount).toBeGreaterThan(0);

    const second = await completePastBookings();
    expect(second.completedCount).toBe(0);
  });
});
