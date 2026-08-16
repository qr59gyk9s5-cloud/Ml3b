/**
 * Read-only venue queries for public-facing pages.
 *
 * IMPORTANT: `getDb()` connects with the app's own Postgres credentials,
 * not a per-request Supabase session — it does not go through Postgres
 * Row Level Security. RLS (supabase/migrations/0001_identity_auth_and_rls.sql)
 * protects direct/client-side access; server code like this must apply
 * its own explicit authorization filter, which is why every query here
 * filters status itself rather than assuming the database will. See
 * docs/architecture/authorization.md.
 *
 * Venue/facility *mutations* and the lifecycle transition rules live in
 * lifecycle.ts and facilities.ts, not here — this file is reads only.
 */
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { facilities, venues, type Facility, type Venue } from '@/lib/db/schema';

/** Venues visible to an anonymous visitor: only ever ACTIVE ones. */
export async function listActiveVenues(): Promise<Venue[]> {
  const db = getDb();
  return db.select().from(venues).where(eq(venues.status, 'ACTIVE')).orderBy(venues.name);
}

/** A single venue's public page — null if it doesn't exist or isn't
 * public yet (DRAFT/PENDING_REVIEW/SUSPENDED/ARCHIVED), never leaking
 * which case it was. */
export async function getPublicVenueBySlug(slug: string): Promise<Venue | null> {
  const db = getDb();
  const [venue] = await db
    .select()
    .from(venues)
    .where(and(eq(venues.slug, slug), eq(venues.status, 'ACTIVE')));
  return venue ?? null;
}

/** Active facilities at a venue, for the public facility list. Does not
 * check the venue's own status — callers already have a venue in hand
 * (typically from getPublicVenueBySlug, which already filtered to
 * ACTIVE) and shouldn't need a second round trip to re-check it. */
export async function listActiveFacilities(venueId: string): Promise<Facility[]> {
  const db = getDb();
  return db
    .select()
    .from(facilities)
    .where(and(eq(facilities.venueId, venueId), eq(facilities.isActive, true)))
    .orderBy(asc(facilities.name));
}
