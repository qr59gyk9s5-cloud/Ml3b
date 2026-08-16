import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { closeTestDatabase, resetTestDatabase } from '@/testing/db';
import {
  addVenueMember,
  createTestAvailabilityException,
  createTestFacility,
  createTestSport,
  createTestUser,
  createTestVenue,
} from '@/testing/factories';
import { createAvailabilityException, deleteAvailabilityException } from './exceptions';

describe('availability exceptions domain service (DB-backed)', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  it('lets the owner create a closure exception, attributing it to them', async () => {
    const owner = await createTestUser('Owner');
    const venue = await createTestVenue(owner.id);
    const sport = await createTestSport('football-exc');
    const facility = await createTestFacility(venue.id, sport.id);

    const exception = await createAvailabilityException(
      facility.id,
      { userId: owner.id, isPlatformAdmin: false },
      {
        kind: 'MAINTENANCE',
        startsAt: new Date('2026-08-16T06:00:00.000Z'),
        endsAt: new Date('2026-08-16T08:00:00.000Z'),
        isClosed: true,
      },
    );

    expect(exception.kind).toBe('MAINTENANCE');
    expect(exception.createdBy).toBe(owner.id);
  });

  it('rejects an exception where endsAt is not after startsAt', async () => {
    const owner = await createTestUser('Owner');
    const venue = await createTestVenue(owner.id);
    const sport = await createTestSport('padel-exc');
    const facility = await createTestFacility(venue.id, sport.id);

    await expect(
      createAvailabilityException(
        facility.id,
        { userId: owner.id, isPlatformAdmin: false },
        {
          kind: 'WEATHER',
          startsAt: new Date('2026-08-16T08:00:00.000Z'),
          endsAt: new Date('2026-08-16T06:00:00.000Z'),
          isClosed: true,
        },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('a MANAGER can create an exception, a RECEPTIONIST cannot', async () => {
    const owner = await createTestUser('Owner');
    const venue = await createTestVenue(owner.id);
    const sport = await createTestSport('tennis-exc');
    const facility = await createTestFacility(venue.id, sport.id);
    const manager = await createTestUser('Manager');
    const receptionist = await createTestUser('Receptionist');
    await addVenueMember(venue.id, manager.id, 'MANAGER');
    await addVenueMember(venue.id, receptionist.id, 'RECEPTIONIST');

    await expect(
      createAvailabilityException(
        facility.id,
        { userId: manager.id, isPlatformAdmin: false },
        {
          kind: 'TOURNAMENT',
          startsAt: new Date('2026-08-16T06:00:00.000Z'),
          endsAt: new Date('2026-08-16T08:00:00.000Z'),
          isClosed: true,
        },
      ),
    ).resolves.toBeDefined();

    await expect(
      createAvailabilityException(
        facility.id,
        { userId: receptionist.id, isPlatformAdmin: false },
        {
          kind: 'TOURNAMENT',
          startsAt: new Date('2026-08-16T09:00:00.000Z'),
          endsAt: new Date('2026-08-16T10:00:00.000Z'),
          isClosed: true,
        },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets the owner delete their exception, but not an unrelated user', async () => {
    const owner = await createTestUser('Owner');
    const stranger = await createTestUser('Stranger');
    const venue = await createTestVenue(owner.id);
    const sport = await createTestSport('basketball-exc');
    const facility = await createTestFacility(venue.id, sport.id);
    const exception = await createTestAvailabilityException(facility.id, owner.id);

    await expect(
      deleteAvailabilityException(exception.id, { userId: stranger.id, isPlatformAdmin: false }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      deleteAvailabilityException(exception.id, { userId: owner.id, isPlatformAdmin: false }),
    ).resolves.toBeUndefined();
  });
});
