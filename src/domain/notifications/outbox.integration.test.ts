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
import { outboxEvents } from '@/lib/db/schema';
import { enqueueBookingEvent } from './outbox';

describe('enqueueBookingEvent (DB-backed)', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  it('inserts a PENDING outbox row carrying the booking id', async () => {
    const owner = await createTestUser('Owner');
    const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
    const sport = await createTestSport(`sport-${venue.id}`);
    const facility = await createTestFacility(venue.id, sport.id);
    const booking = await createTestBooking(venue.id, facility.id, { status: 'CONFIRMED' });

    await enqueueBookingEvent('BOOKING_CONFIRMED', booking.id);

    const rows = await getTestDb()
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.eventType, 'BOOKING_CONFIRMED'));
    const row = rows.find((r) => (r.payload as { bookingId?: string }).bookingId === booking.id);
    expect(row).toBeDefined();
    expect(row?.status).toBe('PENDING');
    expect(row?.attempts).toBe(0);
  });
});
