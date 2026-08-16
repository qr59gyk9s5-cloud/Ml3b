import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { asUser, closeTestDatabase, resetTestDatabase } from '@/testing/db';
import {
  addVenueMember,
  createTestAvailabilityException,
  createTestAvailabilityRule,
  createTestFacility,
  createTestSport,
  createTestUser,
  createTestVenue,
} from '@/testing/factories';

describe('authorization matrix (RLS) — availability_rules & availability_exceptions', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  describe('availability_rules', () => {
    it('is publicly readable for a facility at an ACTIVE venue', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
      const sport = await createTestSport('football-rule-rls');
      const facility = await createTestFacility(venue.id, sport.id);
      const rule = await createTestAvailabilityRule(facility.id);

      const rows = await asUser(
        null,
        (tx) => tx`select id from availability_rules where id = ${rule.id}`,
        'anon',
      );
      expect(rows).toHaveLength(1);
    });

    it('is hidden publicly when the venue is not ACTIVE', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'DRAFT' });
      const sport = await createTestSport('padel-rule-rls');
      const facility = await createTestFacility(venue.id, sport.id);
      const rule = await createTestAvailabilityRule(facility.id);

      const rows = await asUser(
        null,
        (tx) => tx`select id from availability_rules where id = ${rule.id}`,
        'anon',
      );
      expect(rows).toHaveLength(0);
    });

    it('is still visible to venue staff when the venue is DRAFT', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'DRAFT' });
      const sport = await createTestSport('tennis-rule-rls');
      const facility = await createTestFacility(venue.id, sport.id);
      const rule = await createTestAvailabilityRule(facility.id);

      const rows = await asUser(
        owner.id,
        (tx) => tx`select id from availability_rules where id = ${rule.id}`,
      );
      expect(rows).toHaveLength(1);
    });

    it('lets a MANAGER insert a rule directly, but not a RECEPTIONIST', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id);
      const sport = await createTestSport('basketball-rule-rls');
      const facility = await createTestFacility(venue.id, sport.id);
      const manager = await createTestUser('Manager');
      const receptionist = await createTestUser('Receptionist');

      await addVenueMember(venue.id, manager.id, 'MANAGER');
      await addVenueMember(venue.id, receptionist.id, 'RECEPTIONIST');

      const rows = await asUser(
        manager.id,
        (tx) =>
          tx`insert into availability_rules (facility_id, day_of_week, start_time, end_time) values (${facility.id}, 1, '09:00', '17:00') returning id`,
      );
      expect(rows).toHaveLength(1);

      await expect(
        asUser(
          receptionist.id,
          (tx) =>
            tx`insert into availability_rules (facility_id, day_of_week, start_time, end_time) values (${facility.id}, 2, '09:00', '17:00')`,
        ),
      ).rejects.toThrow();
    });
  });

  describe('availability_exceptions', () => {
    it('is publicly readable for a facility at an ACTIVE venue', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
      const sport = await createTestSport('football-exc-rls');
      const facility = await createTestFacility(venue.id, sport.id);
      const exception = await createTestAvailabilityException(facility.id, owner.id);

      const rows = await asUser(
        null,
        (tx) => tx`select id from availability_exceptions where id = ${exception.id}`,
        'anon',
      );
      expect(rows).toHaveLength(1);
    });

    it('is hidden publicly when the venue is not ACTIVE', async () => {
      const owner = await createTestUser('Owner');
      const venue = await createTestVenue(owner.id, { status: 'PENDING_REVIEW' });
      const sport = await createTestSport('padel-exc-rls');
      const facility = await createTestFacility(venue.id, sport.id);
      const exception = await createTestAvailabilityException(facility.id, owner.id);

      const rows = await asUser(
        null,
        (tx) => tx`select id from availability_exceptions where id = ${exception.id}`,
        'anon',
      );
      expect(rows).toHaveLength(0);
    });

    it('an unrelated venue owner cannot delete another venue’s exception', async () => {
      const ownerA = await createTestUser('Owner A');
      const ownerB = await createTestUser('Owner B');
      const venueA = await createTestVenue(ownerA.id);
      const sport = await createTestSport('cricket-exc-rls');
      const facilityA = await createTestFacility(venueA.id, sport.id);
      const exception = await createTestAvailabilityException(facilityA.id, ownerA.id);

      const rows = await asUser(
        ownerB.id,
        (tx) => tx`delete from availability_exceptions where id = ${exception.id} returning id`,
      );
      expect(rows).toHaveLength(0);
    });
  });
});
