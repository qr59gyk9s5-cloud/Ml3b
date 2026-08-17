import { eq } from 'drizzle-orm';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { asUser, closeTestDatabase, getTestDb, resetTestDatabase } from '@/testing/db';
import { createTestUser, grantPlatformAdmin } from '@/testing/factories';
import { auditLogs, profiles } from '@/lib/db/schema';

describe('authorization matrix (RLS) — Phase 11 admin domain', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe('audit_logs', () => {
    it('is invisible to a regular user, even one the row is about', async () => {
      const admin = await createTestUser('Admin');
      const target = await createTestUser('Target User');
      await grantPlatformAdmin(admin.id);
      const [log] = await getTestDb()
        .insert(auditLogs)
        .values({
          actorType: 'ADMIN',
          actorId: admin.id,
          action: 'USER_SUSPENDED',
          resourceType: 'user',
          resourceId: target.id,
        })
        .returning();

      const rows = await asUser(
        target.id,
        (tx) => tx`select id from audit_logs where id = ${log.id}`,
      );
      expect(rows).toHaveLength(0);
    });

    it('is visible to a platform admin', async () => {
      const admin = await createTestUser('Admin');
      await grantPlatformAdmin(admin.id);
      const [log] = await getTestDb()
        .insert(auditLogs)
        .values({
          actorType: 'ADMIN',
          actorId: admin.id,
          action: 'VENUE_ACTIVE',
          resourceType: 'venue',
        })
        .returning();

      const rows = await asUser(
        admin.id,
        (tx) => tx`select id from audit_logs where id = ${log.id}`,
      );
      expect(rows).toHaveLength(1);
    });

    it('is invisible to an anonymous request', async () => {
      const admin = await createTestUser('Admin');
      await grantPlatformAdmin(admin.id);
      const [log] = await getTestDb()
        .insert(auditLogs)
        .values({
          actorType: 'ADMIN',
          actorId: admin.id,
          action: 'VENUE_ACTIVE',
          resourceType: 'venue',
        })
        .returning();

      const rows = await asUser(
        null,
        (tx) => tx`select id from audit_logs where id = ${log.id}`,
        'anon',
      );
      expect(rows).toHaveLength(0);
    });

    it('cannot be inserted into directly by a client, even an admin', async () => {
      const admin = await createTestUser('Admin');
      await grantPlatformAdmin(admin.id);

      await expect(
        asUser(
          admin.id,
          (tx) =>
            tx`insert into audit_logs (actor_type, action, resource_type) values ('ADMIN', 'FAKE', 'venue')`,
        ),
      ).rejects.toThrow();
    });
  });

  describe('profiles suspension columns', () => {
    it('does not let a suspended user un-suspend themselves via a direct client update', async () => {
      const me = await createTestUser('Suspended User');
      await getTestDb()
        .update(profiles)
        .set({ suspendedAt: new Date(), suspendedReason: 'test' })
        .where(eq(profiles.id, me.id));

      // Direct client update attempt, even to their own row, should fail —
      // REVOKE UPDATE on these columns from 'authenticated'
      // (0013_admin_domain_rls.sql), independent of the RLS row policy.
      await expect(
        asUser(me.id, (tx) => tx`update profiles set suspended_at = null where id = ${me.id}`),
      ).rejects.toThrow();
    });

    it('still lets a user update their own full_name (an ungated column)', async () => {
      const me = await createTestUser('Renaming User');
      const rows = await asUser(
        me.id,
        (tx) =>
          tx`update profiles set full_name = 'New Name' where id = ${me.id} returning full_name`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].full_name).toBe('New Name');
    });
  });
});
