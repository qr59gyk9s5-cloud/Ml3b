import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeTestDatabase, getTestDb, resetTestDatabase } from '@/testing/db';
import { addVenueMember, createTestUser, createTestVenue } from '@/testing/factories';
import { auditLogs } from '@/lib/db/schema';
import { addVenueStaffMember, listVenueStaff, removeVenueStaffMember } from './staff';

describe('venue staff management (DB-backed)', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe('listVenueStaff', () => {
    it('lists every teammate, including the caller', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
      const receptionist = await createTestUser('Reem Receptionist');
      await addVenueMember(venue.id, receptionist.id, 'RECEPTIONIST');

      const staff = await listVenueStaff(venue.id, { userId: owner.id, isPlatformAdmin: false });

      expect(staff.map((s) => s.userId).sort()).toEqual([owner.id, receptionist.id].sort());
      const self = staff.find((s) => s.userId === owner.id);
      expect(self?.isSelf).toBe(true);
      expect(self?.email).toMatch(/@/);
    });

    it('a receptionist can see their teammates too', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
      const receptionist = await createTestUser('Reem Receptionist');
      await addVenueMember(venue.id, receptionist.id, 'RECEPTIONIST');

      const staff = await listVenueStaff(venue.id, {
        userId: receptionist.id,
        isPlatformAdmin: false,
      });
      expect(staff.map((s) => s.userId)).toContain(owner.id);
    });

    it('refuses a stranger', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
      const stranger = await createTestUser('Stranger');

      await expect(
        listVenueStaff(venue.id, { userId: stranger.id, isPlatformAdmin: false }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('addVenueStaffMember', () => {
    it('lets the owner add an existing account by email', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
      const newHire = await createTestUser('New Hire', 'newhire@example.test');

      const member = await addVenueStaffMember(
        venue.id,
        { userId: owner.id, isPlatformAdmin: false },
        { email: 'newhire@example.test', role: 'RECEPTIONIST' },
      );

      expect(member.userId).toBe(newHire.id);
      expect(member.role).toBe('RECEPTIONIST');
      const staff = await listVenueStaff(venue.id, { userId: owner.id, isPlatformAdmin: false });
      expect(staff.map((s) => s.userId)).toContain(newHire.id);
    });

    it('is case-insensitive on email', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
      await createTestUser('New Hire', 'MixedCase@Example.test');

      const member = await addVenueStaffMember(
        venue.id,
        { userId: owner.id, isPlatformAdmin: false },
        { email: 'mixedcase@example.test', role: 'MANAGER' },
      );
      expect(member.role).toBe('MANAGER');
    });

    it('refuses a MANAGER trying to add staff', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
      const manager = await createTestUser('Manager');
      await addVenueMember(venue.id, manager.id, 'MANAGER');
      await createTestUser('New Hire', 'newhire2@example.test');

      await expect(
        addVenueStaffMember(
          venue.id,
          { userId: manager.id, isPlatformAdmin: false },
          { email: 'newhire2@example.test', role: 'RECEPTIONIST' },
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('refuses a RECEPTIONIST trying to add staff', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
      const receptionist = await createTestUser('Receptionist');
      await addVenueMember(venue.id, receptionist.id, 'RECEPTIONIST');
      await createTestUser('New Hire', 'newhire3@example.test');

      await expect(
        addVenueStaffMember(
          venue.id,
          { userId: receptionist.id, isPlatformAdmin: false },
          { email: 'newhire3@example.test', role: 'RECEPTIONIST' },
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('rejects an email with no matching account', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });

      await expect(
        addVenueStaffMember(
          venue.id,
          { userId: owner.id, isPlatformAdmin: false },
          { email: 'nobody@example.test', role: 'RECEPTIONIST' },
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('refuses to add someone already on staff', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
      const receptionist = await createTestUser('Receptionist', 'already@example.test');
      await addVenueMember(venue.id, receptionist.id, 'RECEPTIONIST');

      await expect(
        addVenueStaffMember(
          venue.id,
          { userId: owner.id, isPlatformAdmin: false },
          { email: 'already@example.test', role: 'MANAGER' },
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('lets a platform admin add staff at a venue they are not a member of, and audits it', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
      const admin = await createTestUser('Admin');
      await createTestUser('New Hire', 'newhire4@example.test');

      await addVenueStaffMember(
        venue.id,
        { userId: admin.id, isPlatformAdmin: true },
        { email: 'newhire4@example.test', role: 'MANAGER' },
      );

      const db = getTestDb();
      const [log] = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, venue.id));
      expect(log.action).toBe('VENUE_STAFF_ADDED_BY_ADMIN');
      expect(log.actorId).toBe(admin.id);
    });
  });

  describe('removeVenueStaffMember', () => {
    it('lets the owner remove a manager', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
      const manager = await createTestUser('Manager');
      const membership = await addVenueMember(venue.id, manager.id, 'MANAGER');

      await removeVenueStaffMember(
        venue.id,
        { userId: owner.id, isPlatformAdmin: false },
        membership.id,
      );

      const staff = await listVenueStaff(venue.id, { userId: owner.id, isPlatformAdmin: false });
      expect(staff.map((s) => s.userId)).not.toContain(manager.id);
    });

    it('lets a manager remove a receptionist', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
      const manager = await createTestUser('Manager');
      await addVenueMember(venue.id, manager.id, 'MANAGER');
      const receptionist = await createTestUser('Receptionist');
      const membership = await addVenueMember(venue.id, receptionist.id, 'RECEPTIONIST');

      await removeVenueStaffMember(
        venue.id,
        { userId: manager.id, isPlatformAdmin: false },
        membership.id,
      );

      const staff = await listVenueStaff(venue.id, { userId: owner.id, isPlatformAdmin: false });
      expect(staff.map((s) => s.userId)).not.toContain(receptionist.id);
    });

    it('refuses a manager trying to remove another manager', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
      const manager = await createTestUser('Manager');
      await addVenueMember(venue.id, manager.id, 'MANAGER');
      const otherManager = await createTestUser('Other Manager');
      const membership = await addVenueMember(venue.id, otherManager.id, 'MANAGER');

      await expect(
        removeVenueStaffMember(
          venue.id,
          { userId: manager.id, isPlatformAdmin: false },
          membership.id,
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('refuses a receptionist trying to remove anyone', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
      const receptionist = await createTestUser('Receptionist');
      const receptionistMembership = await addVenueMember(
        venue.id,
        receptionist.id,
        'RECEPTIONIST',
      );
      const otherReceptionist = await createTestUser('Other Receptionist');
      const otherMembership = await addVenueMember(venue.id, otherReceptionist.id, 'RECEPTIONIST');
      void receptionistMembership;

      await expect(
        removeVenueStaffMember(
          venue.id,
          { userId: receptionist.id, isPlatformAdmin: false },
          otherMembership.id,
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('refuses to remove yourself', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
      const manager = await createTestUser('Manager');
      const membership = await addVenueMember(venue.id, manager.id, 'MANAGER');

      await expect(
        removeVenueStaffMember(
          venue.id,
          { userId: manager.id, isPlatformAdmin: false },
          membership.id,
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('lets a platform admin remove staff at a venue they are not a member of, and audits it', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
      const admin = await createTestUser('Admin');
      const manager = await createTestUser('Manager');
      const membership = await addVenueMember(venue.id, manager.id, 'MANAGER');

      await removeVenueStaffMember(
        venue.id,
        { userId: admin.id, isPlatformAdmin: true },
        membership.id,
      );

      const db = getTestDb();
      const [log] = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, venue.id));
      expect(log.action).toBe('VENUE_STAFF_REMOVED_BY_ADMIN');
      expect(log.actorId).toBe(admin.id);
    });
  });
});
