import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { closeTestDatabase, getTestDb, resetTestDatabase } from '@/testing/db';
import { createTestUser, createTestVenue } from '@/testing/factories';
import { venueMembers } from '@/lib/db/schema';

describe('venue_members constraints', () => {
  beforeAll(async () => {
    await resetTestDatabase();
  }, 30000);

  afterAll(async () => {
    await closeTestDatabase();
  });

  it('rejects a second membership row for the same (venue_id, user_id) pair', async () => {
    const owner = await createTestUser('Venue Owner');
    const venue = await createTestVenue(owner.id);
    const db = getTestDb();

    // createTestVenue already inserted the OWNER membership row — inserting
    // the same (venue, user) pair again must violate the unique index.
    // Drizzle wraps the driver error in a DrizzleQueryError; the real
    // Postgres error (code 23505 = unique_violation) is on `.cause`.
    await expect(
      db.insert(venueMembers).values({ venueId: venue.id, userId: owner.id, role: 'MANAGER' }),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
  });

  it('allows the same user to be a member of two different venues', async () => {
    const staff = await createTestUser('Multi-Venue Staff');
    const venueA = await createTestVenue(await createTestUser('Owner A').then((p) => p.id));
    const venueB = await createTestVenue(await createTestUser('Owner B').then((p) => p.id));
    const db = getTestDb();

    await db
      .insert(venueMembers)
      .values({ venueId: venueA.id, userId: staff.id, role: 'RECEPTIONIST' });
    await db
      .insert(venueMembers)
      .values({ venueId: venueB.id, userId: staff.id, role: 'RECEPTIONIST' });

    const rows = await db.query.venueMembers.findMany({
      where: (m, { eq }) => eq(m.userId, staff.id),
    });
    expect(rows).toHaveLength(2);
  });
});
