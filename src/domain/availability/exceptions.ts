/**
 * Blocking/special-hours exception management — OWNER/MANAGER only.
 * Exceptions are created and deleted, never edited in place (see
 * 0005_availability_domain_rls.sql) — changing a closure is a delete +
 * re-create, keeping "who declared this closure and when" honest.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { availabilityExceptions, facilities, type AvailabilityException } from '@/lib/db/schema';
import { DomainError } from '@/domain/errors';
import { isVenueOwnerOrManager } from '@/domain/authz/venue';
import { resolveVenueAuthzContext, type VenueActor } from '@/domain/venue/authz-context';
import {
  createAvailabilityExceptionSchema,
  type CreateAvailabilityExceptionInput,
} from '@/lib/validation/availability';

async function requireFacilityAndAuthz(facilityId: string, actor: VenueActor) {
  const db = getDb();
  const [facility] = await db.select().from(facilities).where(eq(facilities.id, facilityId));
  if (!facility) throw new DomainError('NOT_FOUND', 'Facility not found.');
  const ctx = await resolveVenueAuthzContext(facility.venueId, actor);
  if (!isVenueOwnerOrManager(ctx)) {
    throw new DomainError('FORBIDDEN', 'Only the venue owner or a manager can do this.');
  }
  return facility;
}

export async function createAvailabilityException(
  facilityId: string,
  actor: VenueActor,
  rawInput: CreateAvailabilityExceptionInput,
): Promise<AvailabilityException> {
  await requireFacilityAndAuthz(facilityId, actor);

  const parsed = createAvailabilityExceptionSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new DomainError(
      'VALIDATION_FAILED',
      parsed.error.issues[0]?.message ?? 'Invalid exception input.',
    );
  }

  const db = getDb();
  const [exception] = await db
    .insert(availabilityExceptions)
    .values({ ...parsed.data, facilityId, createdBy: actor.userId })
    .returning();
  return exception;
}

export async function deleteAvailabilityException(
  exceptionId: string,
  actor: VenueActor,
): Promise<void> {
  const db = getDb();
  const [exception] = await db
    .select()
    .from(availabilityExceptions)
    .where(eq(availabilityExceptions.id, exceptionId));
  if (!exception) {
    throw new DomainError('NOT_FOUND', 'Availability exception not found.');
  }
  await requireFacilityAndAuthz(exception.facilityId, actor);
  await db.delete(availabilityExceptions).where(eq(availabilityExceptions.id, exceptionId));
}
