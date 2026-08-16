/**
 * Integration test fixtures. Inserts into the local auth shim's
 * `auth.users` (via the raw client — it's intentionally outside the
 * Drizzle schema, see src/lib/db/schema/profiles.ts) and lets the real
 * `handle_new_user` trigger create the matching profile, exactly like a
 * real signup would.
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getRawTestClient, getTestDb } from './db';
import { profiles, venueMembers, venues, type Profile, type Venue } from '@/lib/db/schema';
import type { VenueRole, VenueStatus } from '@/lib/config/constants';

export async function createTestUser(fullName: string, email?: string): Promise<Profile> {
  const sql = getRawTestClient();
  const id = randomUUID();
  await sql`
    insert into auth.users (id, email, raw_user_meta_data)
    values (${id}, ${email ?? `${id}@example.test`}, ${JSON.stringify({ full_name: fullName })}::jsonb)
  `;
  const db = getTestDb();
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, id));
  if (!profile) {
    throw new Error('handle_new_user trigger did not create a profile row for the test user');
  }
  return profile;
}

export async function createTestVenue(
  ownerId: string,
  overrides: { name?: string; status?: VenueStatus } = {},
): Promise<Venue> {
  const db = getTestDb();
  const [venue] = await db
    .insert(venues)
    .values({
      slug: `venue-${randomUUID()}`,
      name: overrides.name ?? 'Test Venue',
      city: 'Cairo',
      createdBy: ownerId,
      status: overrides.status ?? 'DRAFT',
    })
    .returning();
  await db.insert(venueMembers).values({ venueId: venue.id, userId: ownerId, role: 'OWNER' });
  return venue;
}

export async function addVenueMember(venueId: string, userId: string, role: VenueRole) {
  const db = getTestDb();
  const [member] = await db.insert(venueMembers).values({ venueId, userId, role }).returning();
  return member;
}
