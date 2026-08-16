/**
 * Facility management — the only place facilities are created, edited, or
 * deactivated. See docs/architecture/authorization.md: OWNER/MANAGER only,
 * never RECEPTIONIST, enforced here regardless of what a client sends.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { facilities, venues, type Facility } from '@/lib/db/schema';
import { DomainError } from '@/domain/errors';
import { isVenueOwnerOrManager } from '@/domain/authz/venue';
import { resolveVenueAuthzContext, type VenueActor } from './authz-context';
import {
  createFacilitySchema,
  updateFacilitySchema,
  type CreateFacilityInput,
  type UpdateFacilityInput,
} from '@/lib/validation/facility';

async function requireVenue(venueId: string) {
  const db = getDb();
  const [venue] = await db.select().from(venues).where(eq(venues.id, venueId));
  if (!venue) throw new DomainError('NOT_FOUND', 'Venue not found.');
  return venue;
}

async function requireFacility(facilityId: string) {
  const db = getDb();
  const [facility] = await db.select().from(facilities).where(eq(facilities.id, facilityId));
  if (!facility) throw new DomainError('NOT_FOUND', 'Facility not found.');
  return facility;
}

async function requireOwnerOrManager(venueId: string, actor: VenueActor) {
  const ctx = await resolveVenueAuthzContext(venueId, actor);
  if (!isVenueOwnerOrManager(ctx)) {
    throw new DomainError('FORBIDDEN', 'Only the venue owner or a manager can do this.');
  }
}

export async function createFacility(
  venueId: string,
  actor: VenueActor,
  rawInput: CreateFacilityInput,
): Promise<Facility> {
  await requireVenue(venueId);
  await requireOwnerOrManager(venueId, actor);

  const parsed = createFacilitySchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new DomainError(
      'VALIDATION_FAILED',
      parsed.error.issues[0]?.message ?? 'Invalid facility input.',
    );
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(facilities)
    .where(and(eq(facilities.venueId, venueId), eq(facilities.slug, parsed.data.slug)));
  if (existing) {
    throw new DomainError('CONFLICT', 'A facility with this slug already exists at this venue.');
  }

  const [facility] = await db
    .insert(facilities)
    .values({ ...parsed.data, venueId })
    .returning();
  return facility;
}

export async function updateFacility(
  facilityId: string,
  actor: VenueActor,
  rawPatch: UpdateFacilityInput,
): Promise<Facility> {
  const facility = await requireFacility(facilityId);
  await requireOwnerOrManager(facility.venueId, actor);

  const parsed = updateFacilitySchema.safeParse(rawPatch);
  if (!parsed.success) {
    throw new DomainError(
      'VALIDATION_FAILED',
      parsed.error.issues[0]?.message ?? 'Invalid facility input.',
    );
  }

  const effectiveMin = parsed.data.minimumDurationMinutes ?? facility.minimumDurationMinutes;
  const effectiveMax = parsed.data.maximumDurationMinutes ?? facility.maximumDurationMinutes;
  if (effectiveMin > effectiveMax) {
    throw new DomainError(
      'VALIDATION_FAILED',
      'minimumDurationMinutes cannot exceed maximumDurationMinutes.',
    );
  }

  const db = getDb();
  const [updated] = await db
    .update(facilities)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(facilities.id, facilityId))
    .returning();
  return updated;
}

/** Facilities are deactivated, never hard-deleted — consistent with venues.
 * A deactivated facility stops accepting new bookings but existing/past
 * bookings keep their history intact. */
export async function deactivateFacility(facilityId: string, actor: VenueActor): Promise<Facility> {
  const facility = await requireFacility(facilityId);
  await requireOwnerOrManager(facility.venueId, actor);

  const db = getDb();
  const [updated] = await db
    .update(facilities)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(facilities.id, facilityId))
    .returning();
  return updated;
}
