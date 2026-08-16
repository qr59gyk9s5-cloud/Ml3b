import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { closeTestDatabase, resetTestDatabase } from '@/testing/db';
import {
  createTestAvailabilityException,
  createTestAvailabilityRule,
  createTestFacility,
  createTestSport,
  createTestUser,
  createTestVenue,
} from '@/testing/factories';
import { getAvailableSlots } from './queries';

describe('getAvailableSlots (DB-backed)', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  it('computes real slots using the venue timezone, end to end', async () => {
    const owner = await createTestUser('Owner');
    // createTestVenue leaves timezone at its schema default, Africa/Cairo.
    const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
    const sport = await createTestSport('football-avail');
    const facility = await createTestFacility(venue.id, sport.id, { slotDurationMinutes: 60 });
    // Sunday 09:00-11:00 Cairo
    await createTestAvailabilityRule(facility.id, {
      dayOfWeek: 0,
      startTime: '09:00',
      endTime: '11:00',
    });

    const slots = await getAvailableSlots(facility.id, '2026-08-16'); // a Sunday

    expect(slots).toHaveLength(2);
    expect(slots[0].startAt.toISOString()).toBe('2026-08-16T06:00:00.000Z'); // 09:00 Cairo
    expect(slots.every((s) => s.available)).toBe(true);
  });

  it('returns no slots for an inactive facility', async () => {
    const owner = await createTestUser('Owner');
    const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
    const sport = await createTestSport('padel-avail');
    const facility = await createTestFacility(venue.id, sport.id, { isActive: false });
    await createTestAvailabilityRule(facility.id, { dayOfWeek: 0 });

    const slots = await getAvailableSlots(facility.id, '2026-08-16');
    expect(slots).toEqual([]);
  });

  it('returns no slots when the venue is not ACTIVE (e.g. PENDING_REVIEW)', async () => {
    const owner = await createTestUser('Owner');
    const venue = await createTestVenue(owner.id, { status: 'PENDING_REVIEW' });
    const sport = await createTestSport('tennis-avail');
    const facility = await createTestFacility(venue.id, sport.id);
    await createTestAvailabilityRule(facility.id, { dayOfWeek: 0 });

    const slots = await getAvailableSlots(facility.id, '2026-08-16');
    expect(slots).toEqual([]);
  });

  it('returns no slots for a facility that does not exist', async () => {
    const slots = await getAvailableSlots('00000000-0000-0000-0000-000000000000', '2026-08-16');
    expect(slots).toEqual([]);
  });

  it('fetches and applies a closure exception for the requested day', async () => {
    const owner = await createTestUser('Owner');
    const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
    const sport = await createTestSport('squash-avail');
    const facility = await createTestFacility(venue.id, sport.id, { slotDurationMinutes: 60 });
    await createTestAvailabilityRule(facility.id, {
      dayOfWeek: 0,
      startTime: '09:00',
      endTime: '12:00',
    });
    await createTestAvailabilityException(facility.id, owner.id, {
      startsAt: new Date('2026-08-16T06:00:00.000Z'),
      endsAt: new Date('2026-08-16T07:00:00.000Z'),
      isClosed: true,
    });

    const slots = await getAvailableSlots(facility.id, '2026-08-16');
    const closed = slots.find((s) => s.startAt.toISOString() === '2026-08-16T06:00:00.000Z');
    expect(closed?.available).toBe(false);
    expect(closed?.reason).toBe('CLOSED_PERIOD');
  });

  it('does not apply an exception scoped to a different facility', async () => {
    const owner = await createTestUser('Owner');
    const venue = await createTestVenue(owner.id, { status: 'ACTIVE' });
    const sport = await createTestSport('basketball-avail');
    const facilityA = await createTestFacility(venue.id, sport.id, { slotDurationMinutes: 60 });
    const facilityB = await createTestFacility(venue.id, sport.id, { slotDurationMinutes: 60 });
    await createTestAvailabilityRule(facilityA.id, {
      dayOfWeek: 0,
      startTime: '09:00',
      endTime: '11:00',
    });
    await createTestAvailabilityRule(facilityB.id, {
      dayOfWeek: 0,
      startTime: '09:00',
      endTime: '11:00',
    });
    await createTestAvailabilityException(facilityB.id, owner.id, {
      startsAt: new Date('2026-08-16T06:00:00.000Z'),
      endsAt: new Date('2026-08-16T07:00:00.000Z'),
    });

    const slotsA = await getAvailableSlots(facilityA.id, '2026-08-16');
    expect(slotsA.every((s) => s.available)).toBe(true);
  });
});
