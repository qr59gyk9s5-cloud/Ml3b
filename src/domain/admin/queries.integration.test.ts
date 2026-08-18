import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { closeTestDatabase, getTestDb, resetTestDatabase } from '@/testing/db';
import { createTestUser, createTestVenue } from '@/testing/factories';
import { outboxEvents } from '@/lib/db/schema';
import { getSystemHealthSummary } from './queries';

const adminActor = (userId: string) => ({ userId, isPlatformAdmin: true });
const nonAdminActor = (userId: string) => ({ userId, isPlatformAdmin: false });

describe('admin queries (DB-backed)', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe('getSystemHealthSummary', () => {
    it('counts PENDING_REVIEW venues and FAILED outbox events', async () => {
      const admin = await createTestUser('Admin');
      const owner = await createTestUser('Owner');
      await createTestVenue(owner.id, { status: 'PENDING_REVIEW' });

      const db = getTestDb();
      await db.insert(outboxEvents).values({
        eventType: 'BOOKING_CONFIRMED',
        payload: {},
        status: 'FAILED',
      });

      const summary = await getSystemHealthSummary(adminActor(admin.id));
      expect(summary.pendingVenueApprovals).toBeGreaterThanOrEqual(1);
      expect(summary.failedOutboxEvents).toBeGreaterThanOrEqual(1);
    });

    it('refuses a non-admin actor', async () => {
      const notAdmin = await createTestUser('Not Admin');
      await expect(getSystemHealthSummary(nonAdminActor(notAdmin.id))).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });
});
