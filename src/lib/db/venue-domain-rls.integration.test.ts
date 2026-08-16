import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { asUser, closeTestDatabase, resetTestDatabase } from '@/testing/db';
import {
  addVenueMember,
  createTestFacility,
  createTestSport,
  createTestUser,
  createTestVenue,
} from '@/testing/factories';

describe('authorization matrix (RLS) — sports & facilities', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe('sports', () => {
    it('is readable by anyone, including anonymous', async () => {
      await createTestSport('football-rls');
      const rows = await asUser(null, (tx) => tx`select code from sports`, 'anon');
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  describe('facilities', () => {
    it('is visible publicly when active at an ACTIVE venue', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
      const sport = await createTestSport('padel-rls');
      const facility = await createTestFacility(venue.id, sport.id, { isActive: true });

      const rows = await asUser(
        null,
        (tx) => tx`select id from facilities where id = ${facility.id}`,
        'anon',
      );
      expect(rows).toHaveLength(1);
    });

    it('is hidden publicly when the facility itself is inactive', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
      const sport = await createTestSport('tennis-rls');
      const facility = await createTestFacility(venue.id, sport.id, { isActive: false });

      const rows = await asUser(
        null,
        (tx) => tx`select id from facilities where id = ${facility.id}`,
        'anon',
      );
      expect(rows).toHaveLength(0);
    });

    it('is hidden publicly when the parent venue is not ACTIVE, even if the facility is active', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'DRAFT' });
      const sport = await createTestSport('squash-rls');
      const facility = await createTestFacility(venue.id, sport.id, { isActive: true });

      const rows = await asUser(
        null,
        (tx) => tx`select id from facilities where id = ${facility.id}`,
        'anon',
      );
      expect(rows).toHaveLength(0);
    });

    it('is still visible to venue staff even when inactive or the venue is DRAFT', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'DRAFT' });
      const sport = await createTestSport('cricket-rls');
      const facility = await createTestFacility(venue.id, sport.id, { isActive: false });

      const rows = await asUser(
        owner.id,
        (tx) => tx`select id from facilities where id = ${facility.id}`,
      );
      expect(rows).toHaveLength(1);
    });

    it('lets a MANAGER insert a facility directly (RLS), but not a RECEPTIONIST', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id);
      const sport = await createTestSport('basketball-rls');
      const manager = await createTestUser('Manager');
      const receptionist = await createTestUser('Receptionist');
      await addVenueMember(venue.id, manager.id, 'MANAGER');
      await addVenueMember(venue.id, receptionist.id, 'RECEPTIONIST');

      const rows = await asUser(
        manager.id,
        (tx) =>
          tx`insert into facilities (venue_id, sport_id, name, slug, base_price_minor)
             values (${venue.id}, ${sport.id}, 'Manager Court', 'manager-court', 10000) returning id`,
      );
      expect(rows).toHaveLength(1);

      await expect(
        asUser(
          receptionist.id,
          (tx) =>
            tx`insert into facilities (venue_id, sport_id, name, slug, base_price_minor)
               values (${venue.id}, ${sport.id}, 'Receptionist Court', 'receptionist-court', 10000)`,
        ),
      ).rejects.toThrow();
    });
  });
});
