/**
 * Resolves what src/domain/authz/venue.ts needs to know: is this actor a
 * platform admin, and what's their role (if any) at this specific venue —
 * fetched fresh from the database on every call, never trusted from the
 * caller. Shared by every venue-domain service so this lookup only exists
 * once.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { venueMembers } from '@/lib/db/schema';
import type { VenueAuthzContext } from '@/domain/authz/venue';

export interface VenueActor {
  userId: string;
  isPlatformAdmin: boolean;
}

export async function resolveVenueAuthzContext(
  venueId: string,
  actor: VenueActor,
): Promise<VenueAuthzContext> {
  const db = getDb();
  const [membership] = await db
    .select()
    .from(venueMembers)
    .where(and(eq(venueMembers.venueId, venueId), eq(venueMembers.userId, actor.userId)));

  return {
    userId: actor.userId,
    isPlatformAdmin: actor.isPlatformAdmin,
    venueRole: membership?.role ?? null,
  };
}
