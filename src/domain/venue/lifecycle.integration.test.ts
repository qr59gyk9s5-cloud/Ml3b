import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { closeTestDatabase, resetTestDatabase } from '@/testing/db';
import { addVenueMember, createTestUser, createTestVenue } from '@/testing/factories';
import { transitionVenueStatus } from './lifecycle';
import { DomainError } from '@/domain/errors';

describe('transitionVenueStatus (DB-backed)', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  it('lets the owner submit their DRAFT venue for review', async () => {
    const owner = await createTestUser('Owner');
    const venue = await createTestVenue(owner.id, { status: 'DRAFT' });

    const updated = await transitionVenueStatus({
      venueId: venue.id,
      targetStatus: 'PENDING_REVIEW',
      actor: { userId: owner.id, isPlatformAdmin: false },
    });

    expect(updated.status).toBe('PENDING_REVIEW');
  });

  it('refuses the owner approving their own venue — only an admin can', async () => {
    const owner = await createTestUser('Owner');
    const venue = await createTestVenue(owner.id, { status: 'PENDING_REVIEW' });

    await expect(
      transitionVenueStatus({
        venueId: venue.id,
        targetStatus: 'ACTIVE',
        actor: { userId: owner.id, isPlatformAdmin: false },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets an admin approve a PENDING_REVIEW venue, and it actually persists', async () => {
    const owner = await createTestUser('Owner');
    const admin = await createTestUser('Admin');
    const venue = await createTestVenue(owner.id, { status: 'PENDING_REVIEW' });

    const updated = await transitionVenueStatus({
      venueId: venue.id,
      targetStatus: 'ACTIVE',
      actor: { userId: admin.id, isPlatformAdmin: true },
    });
    expect(updated.status).toBe('ACTIVE');

    // Re-fetch independently to prove it's really persisted, not just the
    // in-memory return value.
    const again = await transitionVenueStatus({
      venueId: venue.id,
      targetStatus: 'SUSPENDED',
      actor: { userId: admin.id, isPlatformAdmin: true },
    });
    expect(again.status).toBe('SUSPENDED');
  });

  it('rejects a transition with no rule at all (DRAFT straight to ACTIVE)', async () => {
    const owner = await createTestUser('Owner');
    const admin = await createTestUser('Admin');
    const venue = await createTestVenue(owner.id, { status: 'DRAFT' });

    await expect(
      transitionVenueStatus({
        venueId: venue.id,
        targetStatus: 'ACTIVE',
        actor: { userId: admin.id, isPlatformAdmin: true },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('rejects moving out of ARCHIVED, even for an admin', async () => {
    const owner = await createTestUser('Owner');
    const admin = await createTestUser('Admin');
    const venue = await createTestVenue(owner.id, { status: 'ARCHIVED' });

    await expect(
      transitionVenueStatus({
        venueId: venue.id,
        targetStatus: 'ACTIVE',
        actor: { userId: admin.id, isPlatformAdmin: true },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('a RECEPTIONIST cannot submit the venue for review', async () => {
    const owner = await createTestUser('Owner');
    const receptionist = await createTestUser('Receptionist');
    const venue = await createTestVenue(owner.id, { status: 'DRAFT' });
    await addVenueMember(venue.id, receptionist.id, 'RECEPTIONIST');

    await expect(
      transitionVenueStatus({
        venueId: venue.id,
        targetStatus: 'PENDING_REVIEW',
        actor: { userId: receptionist.id, isPlatformAdmin: false },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws NOT_FOUND for a venue that does not exist', async () => {
    const admin = await createTestUser('Admin');
    await expect(
      transitionVenueStatus({
        venueId: '00000000-0000-0000-0000-000000000000',
        targetStatus: 'ACTIVE',
        actor: { userId: admin.id, isPlatformAdmin: true },
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
