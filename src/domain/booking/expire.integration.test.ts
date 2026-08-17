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
import { expireOverdueBookingRequests } from './expire';

async function setUpVenueAndFacility() {
  const owner = await createTestUser('Owner');
  const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
  const sport = await createTestSport(`sport-${venue.id}`);
  const facility = await createTestFacility(venue.id, sport.id, { slotDurationMinutes: 60 });
  return { owner, venue, facility };
}

describe('expireOverdueBookingRequests (DB-backed)', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  it('expires a REQUESTED booking whose expiry has passed', async () => {
    const { venue, facility } = await setUpVenueAndFacility();
    const past = new Date(Date.now() - 60_000);
    const booking = await createTestBooking(venue.id, facility.id, {
      status: 'REQUESTED',
      expiresAt: past,
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
    });

    const result = await expireOverdueBookingRequests();

    expect(result.expiredBookingIds).toContain(booking.id);
    const [updated] = await getTestDb().select().from(bookings).where(eq(bookings.id, booking.id));
    expect(updated.status).toBe('EXPIRED');
  });

  it('does not touch a REQUESTED booking whose expiry has not passed yet', async () => {
    const { venue, facility } = await setUpVenueAndFacility();
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const booking = await createTestBooking(venue.id, facility.id, {
      status: 'REQUESTED',
      expiresAt: future,
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
    });

    const result = await expireOverdueBookingRequests();

    expect(result.expiredBookingIds).not.toContain(booking.id);
    const [unchanged] = await getTestDb()
      .select()
      .from(bookings)
      .where(eq(bookings.id, booking.id));
    expect(unchanged.status).toBe('REQUESTED');
  });

  it('does not touch a CONFIRMED booking even if its expiresAt (leftover from request) has passed', async () => {
    const { venue, facility } = await setUpVenueAndFacility();
    const past = new Date(Date.now() - 60_000);
    const booking = await createTestBooking(venue.id, facility.id, {
      status: 'CONFIRMED',
      expiresAt: past,
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
    });

    const result = await expireOverdueBookingRequests();

    expect(result.expiredBookingIds).not.toContain(booking.id);
    const [unchanged] = await getTestDb()
      .select()
      .from(bookings)
      .where(eq(bookings.id, booking.id));
    expect(unchanged.status).toBe('CONFIRMED');
  });

  it('is idempotent — running it again after a clean sweep expires nothing new', async () => {
    const { venue, facility } = await setUpVenueAndFacility();
    const past = new Date(Date.now() - 60_000);
    await createTestBooking(venue.id, facility.id, {
      status: 'REQUESTED',
      expiresAt: past,
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endAt: new Date(Date.now() + 25 * 60 * 60 * 1000),
    });

    const first = await expireOverdueBookingRequests();
    expect(first.expiredCount).toBeGreaterThan(0);

    const second = await expireOverdueBookingRequests();
    expect(second.expiredCount).toBe(0);
  });
});
