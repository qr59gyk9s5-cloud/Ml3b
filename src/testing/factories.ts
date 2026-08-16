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
import {
  availabilityExceptions,
  availabilityRules,
  facilities,
  profiles,
  sports,
  venueMembers,
  venues,
  type AvailabilityException,
  type AvailabilityRule,
  type Facility,
  type Profile,
  type Sport,
  type Venue,
} from '@/lib/db/schema';
import type { AvailabilityExceptionKind, VenueRole, VenueStatus } from '@/lib/config/constants';

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

export async function createTestSport(code = `sport-${randomUUID()}`): Promise<Sport> {
  const db = getTestDb();
  const [sport] = await db.insert(sports).values({ code, displayName: code }).returning();
  return sport;
}

export async function createTestFacility(
  venueId: string,
  sportId: string,
  overrides: {
    name?: string;
    isActive?: boolean;
    basePriceMinor?: number;
    slotDurationMinutes?: number;
  } = {},
): Promise<Facility> {
  const db = getTestDb();
  const [facility] = await db
    .insert(facilities)
    .values({
      venueId,
      sportId,
      name: overrides.name ?? 'Test Facility',
      slug: `facility-${randomUUID()}`,
      basePriceMinor: overrides.basePriceMinor ?? 50000,
      isActive: overrides.isActive ?? true,
      slotDurationMinutes: overrides.slotDurationMinutes ?? 60,
    })
    .returning();
  return facility;
}

export async function createTestAvailabilityRule(
  facilityId: string,
  overrides: { dayOfWeek?: number; startTime?: string; endTime?: string; isClosed?: boolean } = {},
): Promise<AvailabilityRule> {
  const db = getTestDb();
  const [rule] = await db
    .insert(availabilityRules)
    .values({
      facilityId,
      dayOfWeek: overrides.dayOfWeek ?? 0,
      startTime: overrides.startTime ?? '09:00',
      endTime: overrides.endTime ?? '17:00',
      isClosed: overrides.isClosed ?? false,
    })
    .returning();
  return rule;
}

export async function createTestAvailabilityException(
  facilityId: string,
  createdBy: string,
  overrides: {
    kind?: AvailabilityExceptionKind;
    startsAt?: Date;
    endsAt?: Date;
    isClosed?: boolean;
  } = {},
): Promise<AvailabilityException> {
  const db = getTestDb();
  const [exception] = await db
    .insert(availabilityExceptions)
    .values({
      facilityId,
      createdBy,
      kind: overrides.kind ?? 'MAINTENANCE',
      startsAt: overrides.startsAt ?? new Date('2026-08-16T07:00:00.000Z'),
      endsAt: overrides.endsAt ?? new Date('2026-08-16T08:00:00.000Z'),
      isClosed: overrides.isClosed ?? true,
    })
    .returning();
  return exception;
}
