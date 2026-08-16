/**
 * Weekly availability rule management — OWNER/MANAGER only, same
 * authorization shape as facilities.ts.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { availabilityRules, facilities, type AvailabilityRule } from '@/lib/db/schema';
import { DomainError } from '@/domain/errors';
import { isVenueOwnerOrManager } from '@/domain/authz/venue';
import { resolveVenueAuthzContext, type VenueActor } from '@/domain/venue/authz-context';
import {
  createAvailabilityRuleSchema,
  type CreateAvailabilityRuleInput,
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

export async function createAvailabilityRule(
  facilityId: string,
  actor: VenueActor,
  rawInput: CreateAvailabilityRuleInput,
): Promise<AvailabilityRule> {
  await requireFacilityAndAuthz(facilityId, actor);

  const parsed = createAvailabilityRuleSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new DomainError(
      'VALIDATION_FAILED',
      parsed.error.issues[0]?.message ?? 'Invalid rule input.',
    );
  }

  const db = getDb();
  const [rule] = await db
    .insert(availabilityRules)
    .values({ ...parsed.data, facilityId })
    .returning();
  return rule;
}

export async function listAvailabilityRules(facilityId: string): Promise<AvailabilityRule[]> {
  const db = getDb();
  return db.select().from(availabilityRules).where(eq(availabilityRules.facilityId, facilityId));
}

export async function deleteAvailabilityRule(ruleId: string, actor: VenueActor): Promise<void> {
  const db = getDb();
  const [rule] = await db.select().from(availabilityRules).where(eq(availabilityRules.id, ruleId));
  if (!rule) {
    throw new DomainError('NOT_FOUND', 'Availability rule not found.');
  }
  await requireFacilityAndAuthz(rule.facilityId, actor);
  await db.delete(availabilityRules).where(eq(availabilityRules.id, ruleId));
}
