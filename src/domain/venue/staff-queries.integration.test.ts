import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestDatabase, getTestDb, resetTestDatabase } from '@/testing/db';
import { createTestUser, createTestVenue } from '@/testing/factories';
import { auditLogs } from '@/lib/db/schema';
import { getVenueByIdForStaff, listStaffVenuesForUser } from './staff-queries';

describe('venue staff queries (DB-backed)', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe('getVenueByIdForStaff', () => {
    it('lets the owner see their own venue', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'DRAFT' });

      const found = await getVenueByIdForStaff(venue.id, {
        userId: owner.id,
        isPlatformAdmin: false,
      });
      expect(found.id).toBe(venue.id);
    });

    it('refuses an unrelated user', async () => {
      const owner = await createTestUser('Owner');
      const stranger = await createTestUser('Stranger');
      const venue = await createTestVenue(owner.id, { status: 'DRAFT' });

      await expect(
        getVenueByIdForStaff(venue.id, { userId: stranger.id, isPlatformAdmin: false }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('audits an admin viewing a venue they are not staff at', async () => {
      const owner = await createTestUser('Owner');
      const admin = await createTestUser('Admin');
      const venue = await createTestVenue(owner.id, { status: 'DRAFT' });

      await getVenueByIdForStaff(venue.id, { userId: admin.id, isPlatformAdmin: true });

      const db = getTestDb();
      const [log] = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, venue.id));
      expect(log.action).toBe('VENUE_DATA_ACCESSED_BY_ADMIN');
      expect(log.actorId).toBe(admin.id);
    });

    it('does not audit the actual owner viewing their own venue', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'DRAFT' });

      await getVenueByIdForStaff(venue.id, { userId: owner.id, isPlatformAdmin: false });

      const db = getTestDb();
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, venue.id));
      expect(logs).toHaveLength(0);
    });
  });

  describe('listStaffVenuesForUser', () => {
    it('lists only venues the user is actually staff at', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'DRAFT' });
      const stranger = await createTestUser('Stranger');

      const ownerVenues = await listStaffVenuesForUser(owner.id);
      expect(ownerVenues.map((v) => v.venue.id)).toContain(venue.id);

      const strangerVenues = await listStaffVenuesForUser(stranger.id);
      expect(strangerVenues.map((v) => v.venue.id)).not.toContain(venue.id);
    });
  });
});
