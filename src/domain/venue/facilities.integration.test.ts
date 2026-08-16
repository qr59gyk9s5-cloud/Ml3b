import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { closeTestDatabase, resetTestDatabase } from '@/testing/db';
import {
  addVenueMember,
  createTestFacility,
  createTestSport,
  createTestUser,
  createTestVenue,
} from '@/testing/factories';
import { createFacility, deactivateFacility, updateFacility } from './facilities';

describe('facility domain service (DB-backed)', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  it('lets the owner create a facility with valid input', async () => {
    const owner = await createTestUser('Owner');
    const venue = await createTestVenue(owner.id);
    const sport = await createTestSport('football');

    const facility = await createFacility(
      venue.id,
      { userId: owner.id, isPlatformAdmin: false },
      {
        sportId: sport.id,
        name: 'Pitch 1',
        slug: 'pitch-1',
        bookingMode: 'REQUEST_TO_BOOK',
        slotDurationMinutes: 60,
        minimumDurationMinutes: 60,
        maximumDurationMinutes: 120,
        basePriceMinor: 50000,
        currency: 'EGP',
      },
    );

    expect(facility.name).toBe('Pitch 1');
    expect(facility.venueId).toBe(venue.id);
  });

  it('lets a MANAGER create a facility, but not a RECEPTIONIST', async () => {
    const owner = await createTestUser('Owner');
    const venue = await createTestVenue(owner.id);
    const sport = await createTestSport('padel');
    const manager = await createTestUser('Manager');
    const receptionist = await createTestUser('Receptionist');
    await addVenueMember(venue.id, manager.id, 'MANAGER');
    await addVenueMember(venue.id, receptionist.id, 'RECEPTIONIST');

    const input = {
      sportId: sport.id,
      name: 'Court 1',
      slug: 'court-1',
      bookingMode: 'REQUEST_TO_BOOK' as const,
      slotDurationMinutes: 90,
      minimumDurationMinutes: 90,
      maximumDurationMinutes: 90,
      basePriceMinor: 35000,
      currency: 'EGP',
    };

    const created = await createFacility(
      venue.id,
      { userId: manager.id, isPlatformAdmin: false },
      input,
    );
    expect(created.name).toBe('Court 1');

    await expect(
      createFacility(
        venue.id,
        { userId: receptionist.id, isPlatformAdmin: false },
        { ...input, slug: 'court-2' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects a facility whose minimum duration exceeds its maximum', async () => {
    const owner = await createTestUser('Owner');
    const venue = await createTestVenue(owner.id);
    const sport = await createTestSport('tennis');

    await expect(
      createFacility(
        venue.id,
        { userId: owner.id, isPlatformAdmin: false },
        {
          sportId: sport.id,
          name: 'Bad Court',
          slug: 'bad-court',
          bookingMode: 'REQUEST_TO_BOOK',
          slotDurationMinutes: 60,
          minimumDurationMinutes: 120,
          maximumDurationMinutes: 60,
          basePriceMinor: 10000,
          currency: 'EGP',
        },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rejects a duplicate slug at the same venue', async () => {
    const owner = await createTestUser('Owner');
    const venue = await createTestVenue(owner.id);
    const sport = await createTestSport('basketball');
    const input = {
      sportId: sport.id,
      name: 'Court A',
      slug: 'court-a',
      bookingMode: 'REQUEST_TO_BOOK' as const,
      slotDurationMinutes: 60,
      minimumDurationMinutes: 60,
      maximumDurationMinutes: 60,
      basePriceMinor: 20000,
      currency: 'EGP',
    };
    await createFacility(venue.id, { userId: owner.id, isPlatformAdmin: false }, input);

    await expect(
      createFacility(
        venue.id,
        { userId: owner.id, isPlatformAdmin: false },
        { ...input, name: 'Court A Again' },
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('lets the owner update a facility, validating the merged duration range', async () => {
    const owner = await createTestUser('Owner');
    const venue = await createTestVenue(owner.id);
    const sport = await createTestSport('football-2');
    const facility = await createTestFacility(venue.id, sport.id, { name: 'Pitch X' });

    const updated = await updateFacility(
      facility.id,
      { userId: owner.id, isPlatformAdmin: false },
      { name: 'Pitch Y' },
    );
    expect(updated.name).toBe('Pitch Y');

    await expect(
      updateFacility(
        facility.id,
        { userId: owner.id, isPlatformAdmin: false },
        { minimumDurationMinutes: 999 },
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('deactivates a facility instead of deleting it', async () => {
    const owner = await createTestUser('Owner');
    const venue = await createTestVenue(owner.id);
    const sport = await createTestSport('squash');
    const facility = await createTestFacility(venue.id, sport.id);

    const deactivated = await deactivateFacility(facility.id, {
      userId: owner.id,
      isPlatformAdmin: false,
    });
    expect(deactivated.isActive).toBe(false);
    expect(deactivated.id).toBe(facility.id);
  });

  it('an unrelated user cannot edit someone else’s facility', async () => {
    const owner = await createTestUser('Owner');
    const stranger = await createTestUser('Stranger');
    const venue = await createTestVenue(owner.id);
    const sport = await createTestSport('cricket');
    const facility = await createTestFacility(venue.id, sport.id);

    await expect(
      updateFacility(
        facility.id,
        { userId: stranger.id, isPlatformAdmin: false },
        { name: 'Hijacked' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
