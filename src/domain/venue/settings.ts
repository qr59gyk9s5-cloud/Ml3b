/**
 * Venue-level operational settings a staff member can tune themselves —
 * currently just the open-games hold-duration/lead-time override
 * (previously a flagged MVP gap: fixed platform-wide constants in
 * src/lib/config/constants.ts, the founder explicitly floated per-venue
 * configurability — see docs/architecture/open-games.md). Grows here as
 * more become real per-venue settings rather than global constants.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { venues, type Venue } from '@/lib/db/schema';
import { DomainError } from '@/domain/errors';
import { isVenueOwnerOrManager, type VenueAuthzContext } from '@/domain/authz/venue';

// Sanity bounds, not arbitrary — a venue picking 0 or negative hours
// would break create-open-game.ts's math (it just subtracts these from
// now()); a venue picking an absurdly large number defeats the entire
// point of the constant ("a venue can't hold a slot indefinitely" per
// the customer-facing copy on the open-game form).
const MIN_LEAD_TIME_BOUNDS = { min: 1, max: 72 } as const;
const MAX_HOLD_BOUNDS = { min: 1, max: 168 } as const;

export interface UpdateOpenGameSettingsInput {
  /** null resets to the platform default (src/lib/config/constants.ts). */
  minLeadTimeHours: number | null;
  maxHoldHours: number | null;
}

export async function updateOpenGameSettings(
  venueId: string,
  ctx: VenueAuthzContext,
  input: UpdateOpenGameSettingsInput,
): Promise<Venue> {
  if (!isVenueOwnerOrManager(ctx)) {
    throw new DomainError('FORBIDDEN', 'Only a venue owner or manager can change this setting.');
  }
  if (ctx.isSuspended) {
    throw new DomainError('FORBIDDEN', 'Your account has been suspended.');
  }

  if (
    input.minLeadTimeHours !== null &&
    (!Number.isInteger(input.minLeadTimeHours) ||
      input.minLeadTimeHours < MIN_LEAD_TIME_BOUNDS.min ||
      input.minLeadTimeHours > MIN_LEAD_TIME_BOUNDS.max)
  ) {
    throw new DomainError(
      'VALIDATION_FAILED',
      `Minimum lead time must be between ${MIN_LEAD_TIME_BOUNDS.min} and ${MIN_LEAD_TIME_BOUNDS.max} hours.`,
    );
  }
  if (
    input.maxHoldHours !== null &&
    (!Number.isInteger(input.maxHoldHours) ||
      input.maxHoldHours < MAX_HOLD_BOUNDS.min ||
      input.maxHoldHours > MAX_HOLD_BOUNDS.max)
  ) {
    throw new DomainError(
      'VALIDATION_FAILED',
      `Maximum hold duration must be between ${MAX_HOLD_BOUNDS.min} and ${MAX_HOLD_BOUNDS.max} hours.`,
    );
  }

  const db = getDb();
  const [updated] = await db
    .update(venues)
    .set({
      openGameMinLeadTimeHours: input.minLeadTimeHours,
      openGameMaxHoldHours: input.maxHoldHours,
      updatedAt: new Date(),
    })
    .where(eq(venues.id, venueId))
    .returning();
  if (!updated) {
    throw new DomainError('NOT_FOUND', 'Venue not found.');
  }
  return updated;
}
