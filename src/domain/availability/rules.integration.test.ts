import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { closeTestDatabase, resetTestDatabase } from '@/testing/db';
import {
  addVenueMember,
  createTestAvailabilityRule,
  createTestFacility,
  createTestSport,
  createTestUser,
  createTestVenue,
} from '@/testing/factories';
import { createAvailabilityRule, deleteAvailabilityRule, listAvailabilityRules } from './rules';

describe('availability rules domain service (DB-backed)', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  it('lets the owner create a valid rule', async () => {
    const owner = await createTestUser('Owner');
    const venue = await createTestVenue(owner.id);
    const sport = await createTestSport('football-rule');
    const facility = await createTestFacility(venue.id, sport.id);

    const rule = await createAvailabilityRule(
      facility.id,
      { userId: owner.id, isPlatformAdmin: false },
      { dayOfWeek: 0, startTime: '09:00', endTime: '17:00', isClosed: false },
    );

    expect(rule.dayOfWeek).toBe(0);
    expect(rule.facilityId).toBe(facility.id);
  });

  it('rejects an equal start/end time for an open rule', async () => {
    const owner = await createTestUser('Owner');
    const venue = await createTestVenue(owner.id);
    const sport = await createTestSport('padel-rule');
    const facility = await createTestFacility(venue.id, sport.id);

    await expect(
      createAvailabilityRule(
        facility.id,
        { userId: owner.id, isPlatformAdmin: false },
        { dayOfWeek: 0, startTime: '09:00', endTime: '09:00', isClosed: false },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('a RECEPTIONIST cannot create a rule', async () => {
    const owner = await createTestUser('Owner');
    const venue = await createTestVenue(owner.id);
    const sport = await createTestSport('tennis-rule');
    const facility = await createTestFacility(venue.id, sport.id);
    const receptionist = await createTestUser('Receptionist');
    await addVenueMember(venue.id, receptionist.id, 'RECEPTIONIST');

    await expect(
      createAvailabilityRule(
        facility.id,
        { userId: receptionist.id, isPlatformAdmin: false },
        { dayOfWeek: 0, startTime: '09:00', endTime: '17:00', isClosed: false },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lists rules for a facility', async () => {
    const owner = await createTestUser('Owner');
    const venue = await createTestVenue(owner.id);
    const sport = await createTestSport('basketball-rule');
    const facility = await createTestFacility(venue.id, sport.id);
    await createTestAvailabilityRule(facility.id, { dayOfWeek: 1 });
    await createTestAvailabilityRule(facility.id, { dayOfWeek: 2 });

    const rules = await listAvailabilityRules(facility.id);
    expect(rules).toHaveLength(2);
  });

  it('lets the owner delete a rule, but not an unrelated user', async () => {
    const owner = await createTestUser('Owner');
    const stranger = await createTestUser('Stranger');
    const venue = await createTestVenue(owner.id);
    const sport = await createTestSport('squash-rule');
    const facility = await createTestFacility(venue.id, sport.id);
    const rule = await createTestAvailabilityRule(facility.id);

    await expect(
      deleteAvailabilityRule(rule.id, { userId: stranger.id, isPlatformAdmin: false }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await deleteAvailabilityRule(rule.id, { userId: owner.id, isPlatformAdmin: false });
    expect(await listAvailabilityRules(facility.id)).toHaveLength(0);
  });
});
