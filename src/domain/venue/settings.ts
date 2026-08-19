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
import { isVenueOwner, isVenueOwnerOrManager, type VenueAuthzContext } from '@/domain/authz/venue';

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

/**
 * coverPhotoUrl has existed on the venues table since Phase 2 but was
 * never actually settable or displayed anywhere — every venue card and
 * hero banner just showed the gradient-and-emoji placeholder regardless
 * of whether a real photo URL was sitting right there in the row. This
 * is the missing write side; src/components/venue-grid.tsx and the venue
 * detail page are the read side, both updated in the same change that
 * added this function.
 *
 * OWNER only (not MANAGER) — branding/photography is an ownership-level
 * decision, not day-to-day operations, unlike the open-game hold-
 * duration setting above.
 */
export async function updateVenueCoverPhoto(
  venueId: string,
  ctx: VenueAuthzContext,
  coverPhotoUrl: string | null,
): Promise<Venue> {
  if (!isVenueOwner(ctx)) {
    throw new DomainError('FORBIDDEN', 'Only a venue owner can change the cover photo.');
  }
  if (ctx.isSuspended) {
    throw new DomainError('FORBIDDEN', 'Your account has been suspended.');
  }

  if (coverPhotoUrl !== null) {
    // https only, not also http — never trust the client with
    // unvalidated content going into an <img src> shown to every
    // visitor (a non-https scheme like javascript: is never a
    // legitimate photo URL), and it must match src/proxy.ts's CSP
    // img-src directive, which only allows https: for exactly this
    // reason. http: would validate here but then silently fail to
    // render (CSP-blocked, and likely mixed-content-blocked by the
    // browser too, on this https site) — the same class of bug as the
    // two real CSP issues already found and fixed this project.
    let parsed: URL;
    try {
      parsed = new URL(coverPhotoUrl);
    } catch {
      throw new DomainError('VALIDATION_FAILED', 'Enter a valid photo URL.');
    }
    if (parsed.protocol !== 'https:') {
      throw new DomainError('VALIDATION_FAILED', 'The photo URL must start with https://.');
    }
  }

  const db = getDb();
  const [updated] = await db
    .update(venues)
    .set({ coverPhotoUrl, updatedAt: new Date() })
    .where(eq(venues.id, venueId))
    .returning();
  if (!updated) {
    throw new DomainError('NOT_FOUND', 'Venue not found.');
  }
  return updated;
}
