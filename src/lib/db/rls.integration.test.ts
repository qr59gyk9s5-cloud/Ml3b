import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { asUser, closeTestDatabase, getTestDb, resetTestDatabase } from '@/testing/db';
import { addVenueMember, createTestUser, createTestVenue } from '@/testing/factories';
import { platformAdmins } from '@/lib/db/schema';

describe('authorization matrix (RLS) — identity & venue tables', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe('profiles', () => {
    it('lets a customer read their own profile', async () => {
      const me = await createTestUser('Ahmed M.');
      const rows = await asUser(
        me.id,
        (tx) => tx`select full_name from profiles where id = ${me.id}`,
      );
      expect(rows).toHaveLength(1);
    });

    it('does not let a customer read another customer’s profile', async () => {
      const me = await createTestUser('Ahmed M.');
      const other = await createTestUser('Mostafa K.');
      const rows = await asUser(
        me.id,
        (tx) => tx`select full_name from profiles where id = ${other.id}`,
      );
      expect(rows).toHaveLength(0);
    });

    it('does not let an anonymous request read any profile', async () => {
      const other = await createTestUser('Mostafa K.');
      const rows = await asUser(
        null,
        (tx) => tx`select full_name from profiles where id = ${other.id}`,
        'anon',
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe('venues', () => {
    it('lets anonymous browsing see an ACTIVE venue', async () => {
      const owner = await createTestUser('Venue Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
      const rows = await asUser(
        null,
        (tx) => tx`select id from venues where id = ${venue.id}`,
        'anon',
      );
      expect(rows).toHaveLength(1);
    });

    it('hides a DRAFT venue from the public', async () => {
      const owner = await createTestUser('Venue Owner');
      const venue = await createTestVenue(owner.id, { status: 'DRAFT' });
      const rows = await asUser(
        null,
        (tx) => tx`select id from venues where id = ${venue.id}`,
        'anon',
      );
      expect(rows).toHaveLength(0);
    });

    it('still lets the owner see their own DRAFT venue', async () => {
      const owner = await createTestUser('Venue Owner');
      const venue = await createTestVenue(owner.id, { status: 'DRAFT' });
      const rows = await asUser(owner.id, (tx) => tx`select id from venues where id = ${venue.id}`);
      expect(rows).toHaveLength(1);
    });

    it('does not let an unrelated venue owner see a competitor’s DRAFT venue', async () => {
      const ownerA = await createTestUser('Owner A');
      const ownerB = await createTestUser('Owner B');
      const venueA = await createTestVenue(ownerA.id, { status: 'DRAFT' });
      const rows = await asUser(
        ownerB.id,
        (tx) => tx`select id from venues where id = ${venueA.id}`,
      );
      expect(rows).toHaveLength(0);
    });

    it('rejects inserting a venue attributed to someone else', async () => {
      const me = await createTestUser('Ahmed M.');
      const someoneElse = await createTestUser('Mostafa K.');
      await expect(
        asUser(
          me.id,
          (tx) =>
            tx`insert into venues (slug, name, city, created_by) values ('spoofed', 'Spoofed Venue', 'Cairo', ${someoneElse.id})`,
        ),
      ).rejects.toThrow();
    });
  });

  describe('venue_members', () => {
    it('lets a receptionist see their teammates at the same venue', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id);
      const receptionist = await createTestUser('Receptionist');
      await addVenueMember(venue.id, receptionist.id, 'RECEPTIONIST');

      const rows = await asUser(
        receptionist.id,
        (tx) => tx`select user_id, role from venue_members where venue_id = ${venue.id}`,
      );
      expect(rows).toHaveLength(2);
    });

    it('does not let staff at venue A see membership rows for venue B', async () => {
      const ownerA = await createTestUser('Owner A');
      const ownerB = await createTestUser('Owner B');
      await createTestVenue(ownerA.id);
      const venueB = await createTestVenue(ownerB.id);

      const rows = await asUser(
        ownerA.id,
        (tx) => tx`select user_id from venue_members where venue_id = ${venueB.id}`,
      );
      expect(rows).toHaveLength(0);
    });

    it('lets an OWNER add a new staff member', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id);
      const newHire = await createTestUser('New Hire');

      const rows = await asUser(
        owner.id,
        (tx) =>
          tx`insert into venue_members (venue_id, user_id, role) values (${venue.id}, ${newHire.id}, 'RECEPTIONIST') returning id`,
      );
      expect(rows).toHaveLength(1);
    });

    it('does not let a RECEPTIONIST add a new staff member', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id);
      const receptionist = await createTestUser('Receptionist');
      await addVenueMember(venue.id, receptionist.id, 'RECEPTIONIST');
      const newHire = await createTestUser('New Hire');

      await expect(
        asUser(
          receptionist.id,
          (tx) =>
            tx`insert into venue_members (venue_id, user_id, role) values (${venue.id}, ${newHire.id}, 'RECEPTIONIST')`,
        ),
      ).rejects.toThrow();
    });
  });

  describe('platform_admins', () => {
    it('lets an admin read venues regardless of status', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'DRAFT' });
      const admin = await createTestUser('Founder Admin');
      await getTestDb().insert(platformAdmins).values({ userId: admin.id });

      const rows = await asUser(admin.id, (tx) => tx`select id from venues where id = ${venue.id}`);
      expect(rows).toHaveLength(1);
    });
  });
});
