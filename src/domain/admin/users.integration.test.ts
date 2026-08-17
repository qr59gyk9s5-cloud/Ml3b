import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestDatabase, getTestDb, resetTestDatabase } from '@/testing/db';
import { createTestUser, grantPlatformAdmin } from '@/testing/factories';
import { auditLogs } from '@/lib/db/schema';
import { findUserByEmail, suspendUser, unsuspendUser } from './users';

const adminActor = (userId: string) => ({ userId, isPlatformAdmin: true });
const nonAdminActor = (userId: string) => ({ userId, isPlatformAdmin: false });

describe('admin user moderation (DB-backed)', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe('suspendUser', () => {
    it('suspends a user with a reason and records an audit log', async () => {
      const admin = await createTestUser('Admin');
      const target = await createTestUser('Target');

      const updated = await suspendUser({
        targetUserId: target.id,
        reason: 'Repeated no-shows',
        actor: adminActor(admin.id),
      });

      expect(updated.suspendedAt).not.toBeNull();
      expect(updated.suspendedReason).toBe('Repeated no-shows');
      expect(updated.suspendedBy).toBe(admin.id);

      const db = getTestDb();
      const [log] = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, target.id));
      expect(log.action).toBe('USER_SUSPENDED');
      expect(log.actorId).toBe(admin.id);
    });

    it('refuses a non-admin actor', async () => {
      const notAdmin = await createTestUser('Not Admin');
      const target = await createTestUser('Target');

      await expect(
        suspendUser({ targetUserId: target.id, reason: 'x', actor: nonAdminActor(notAdmin.id) }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('refuses an empty reason', async () => {
      const admin = await createTestUser('Admin');
      const target = await createTestUser('Target');

      await expect(
        suspendUser({ targetUserId: target.id, reason: '   ', actor: adminActor(admin.id) }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('refuses an admin suspending themselves', async () => {
      const admin = await createTestUser('Admin');

      await expect(
        suspendUser({ targetUserId: admin.id, reason: 'x', actor: adminActor(admin.id) }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('refuses to suspend another platform admin', async () => {
      const admin = await createTestUser('Admin');
      const otherAdmin = await createTestUser('Other Admin');
      await grantPlatformAdmin(otherAdmin.id);

      await expect(
        suspendUser({ targetUserId: otherAdmin.id, reason: 'x', actor: adminActor(admin.id) }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });

  describe('unsuspendUser', () => {
    it('clears the suspension and records an audit log', async () => {
      const admin = await createTestUser('Admin');
      const target = await createTestUser('Target');
      await suspendUser({ targetUserId: target.id, reason: 'x', actor: adminActor(admin.id) });

      const updated = await unsuspendUser({ targetUserId: target.id, actor: adminActor(admin.id) });

      expect(updated.suspendedAt).toBeNull();
      expect(updated.suspendedReason).toBeNull();
      expect(updated.suspendedBy).toBeNull();

      const db = getTestDb();
      const logs = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, target.id));
      expect(logs.some((l) => l.action === 'USER_UNSUSPENDED')).toBe(true);
    });
  });

  describe('findUserByEmail', () => {
    it('finds a user by exact, case-insensitive email match', async () => {
      const admin = await createTestUser('Admin');
      const target = await createTestUser('Target', 'Someone@Example.test');

      const found = await findUserByEmail('someone@example.test', adminActor(admin.id));
      expect(found?.id).toBe(target.id);
    });

    it('returns null for no match', async () => {
      const admin = await createTestUser('Admin');
      const found = await findUserByEmail('nobody@example.test', adminActor(admin.id));
      expect(found).toBeNull();
    });

    it('refuses a non-admin actor', async () => {
      const notAdmin = await createTestUser('Not Admin');
      await expect(
        findUserByEmail('x@example.test', nonAdminActor(notAdmin.id)),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});
