import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestDatabase, getTestDb, resetTestDatabase } from '@/testing/db';
import {
  addVenueMember,
  createTestBooking,
  createTestFacility,
  createTestSport,
  createTestUser,
  createTestVenue,
} from '@/testing/factories';
import { auditLogs } from '@/lib/db/schema';
import { getBookingById, listBookingsForCustomer, listBookingsForVenue } from './queries';

async function setUpVenueAndFacility() {
  const owner = await createTestUser('Owner');
  const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
  const sport = await createTestSport(`sport-${venue.id}`);
  const facility = await createTestFacility(venue.id, sport.id, { slotDurationMinutes: 60 });
  return { owner, venue, facility };
}

describe('booking queries (DB-backed)', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe('getBookingById', () => {
    it('lets the owning customer see their own booking', async () => {
      const { venue, facility } = await setUpVenueAndFacility();
      const customer = await createTestUser('Customer');
      const booking = await createTestBooking(venue.id, facility.id, { customerId: customer.id });

      const found = await getBookingById(booking.id, {
        userId: customer.id,
        isPlatformAdmin: false,
      });
      expect(found.id).toBe(booking.id);
    });

    it('lets venue staff see a booking at their venue', async () => {
      const { owner, venue, facility } = await setUpVenueAndFacility();
      const booking = await createTestBooking(venue.id, facility.id);

      const found = await getBookingById(booking.id, { userId: owner.id, isPlatformAdmin: false });
      expect(found.id).toBe(booking.id);
    });

    it('refuses an unrelated user', async () => {
      const { venue, facility } = await setUpVenueAndFacility();
      const stranger = await createTestUser('Stranger');
      const booking = await createTestBooking(venue.id, facility.id);

      await expect(
        getBookingById(booking.id, { userId: stranger.id, isPlatformAdmin: false }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('throws NOT_FOUND for a booking that does not exist', async () => {
      const admin = await createTestUser('Admin');
      await expect(
        getBookingById('00000000-0000-0000-0000-000000000000', {
          userId: admin.id,
          isPlatformAdmin: true,
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('audits an admin viewing a booking that is not theirs', async () => {
      const { venue, facility } = await setUpVenueAndFacility();
      const admin = await createTestUser('Admin');
      const customer = await createTestUser('Customer');
      const booking = await createTestBooking(venue.id, facility.id, { customerId: customer.id });

      await getBookingById(booking.id, { userId: admin.id, isPlatformAdmin: true });

      const db = getTestDb();
      const [log] = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, booking.id));
      expect(log.action).toBe('BOOKING_VIEWED_BY_ADMIN');
      expect(log.actorId).toBe(admin.id);
    });

    it('does not audit the owning customer viewing their own booking', async () => {
      const { venue, facility } = await setUpVenueAndFacility();
      const customer = await createTestUser('Customer');
      const booking = await createTestBooking(venue.id, facility.id, { customerId: customer.id });

      await getBookingById(booking.id, { userId: customer.id, isPlatformAdmin: false });

      const db = getTestDb();
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, booking.id));
      expect(logs).toHaveLength(0);
    });

    it('does not audit actual venue staff viewing a booking at their own venue', async () => {
      const { owner, venue, facility } = await setUpVenueAndFacility();
      const booking = await createTestBooking(venue.id, facility.id);

      await getBookingById(booking.id, { userId: owner.id, isPlatformAdmin: false });

      const db = getTestDb();
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, booking.id));
      expect(logs).toHaveLength(0);
    });
  });

  describe('listBookingsForCustomer', () => {
    it("lists a customer's own bookings, most recent start first", async () => {
      const { venue, facility } = await setUpVenueAndFacility();
      const customer = await createTestUser('Customer');
      await createTestBooking(venue.id, facility.id, {
        customerId: customer.id,
        startAt: new Date('2026-09-01T09:00:00.000Z'),
        endAt: new Date('2026-09-01T10:00:00.000Z'),
      });
      await createTestBooking(venue.id, facility.id, {
        customerId: customer.id,
        startAt: new Date('2026-09-05T09:00:00.000Z'),
        endAt: new Date('2026-09-05T10:00:00.000Z'),
      });

      const list = await listBookingsForCustomer(customer.id, {
        userId: customer.id,
        isPlatformAdmin: false,
      });
      expect(list).toHaveLength(2);
      expect(list[0].startAt.getTime()).toBeGreaterThan(list[1].startAt.getTime());
    });

    it('refuses one customer viewing another’s bookings', async () => {
      const customerA = await createTestUser('Customer A');
      const customerB = await createTestUser('Customer B');
      await expect(
        listBookingsForCustomer(customerA.id, { userId: customerB.id, isPlatformAdmin: false }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('lets a platform admin view any customer’s bookings', async () => {
      const customer = await createTestUser('Customer');
      const admin = await createTestUser('Admin');
      const list = await listBookingsForCustomer(customer.id, {
        userId: admin.id,
        isPlatformAdmin: true,
      });
      expect(list).toEqual([]);
    });
  });

  describe('listBookingsForVenue', () => {
    it('lists a venue’s bookings for its staff, optionally filtered by status', async () => {
      const { owner, venue, facility } = await setUpVenueAndFacility();
      await createTestBooking(venue.id, facility.id, { status: 'REQUESTED' });
      await createTestBooking(venue.id, facility.id, {
        status: 'CONFIRMED',
        startAt: new Date('2026-09-10T09:00:00.000Z'),
        endAt: new Date('2026-09-10T10:00:00.000Z'),
      });

      const all = await listBookingsForVenue(venue.id, {
        userId: owner.id,
        isPlatformAdmin: false,
      });
      expect(all).toHaveLength(2);

      const confirmedOnly = await listBookingsForVenue(
        venue.id,
        { userId: owner.id, isPlatformAdmin: false },
        { status: 'CONFIRMED' },
      );
      expect(confirmedOnly).toHaveLength(1);
      expect(confirmedOnly[0].status).toBe('CONFIRMED');
    });

    it('refuses a receptionist from a different venue', async () => {
      const { venue, facility } = await setUpVenueAndFacility();
      await createTestBooking(venue.id, facility.id);
      const otherVenueOwner = await createTestUser('Other Owner');
      const otherVenue = await createTestVenue(otherVenueOwner.id, { status: 'ACTIVE' });
      const outsider = await createTestUser('Outsider');
      await addVenueMember(otherVenue.id, outsider.id, 'RECEPTIONIST');

      await expect(
        listBookingsForVenue(venue.id, { userId: outsider.id, isPlatformAdmin: false }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});
